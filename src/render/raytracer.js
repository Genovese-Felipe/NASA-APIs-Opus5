/**
 * The renderer: owns every GPU resource and drives the pass chain.
 *
 * PASS CHAIN
 *   1. ray trace  -> HDR (RGBA16F) at `resolutionScale` of the canvas, with
 *      scene coverage written to alpha
 *   2. stars: the catalogue as point sprites, blended against that coverage so
 *      geometry occludes them without a depth buffer
 *   3. orbit/grid overlay drawn into the same HDR buffer (so it blooms)
 *   4. temporal accumulation (only while the view is still)
 *   5. bloom: downsample pyramid -> upsample with additive tent
 *   6. composite: exposure, tone map, grade, dither -> the canvas or an
 *      export target
 *
 * @module render/raytracer
 */

import {
  createContext, getCapabilities, createProgram, FULLSCREEN_VS, RenderTarget,
  PingPong, createDataTexture, uploadDataTexture, createHDRTexture,
  createSurfaceArray, bindTexture, drawFullscreen, u1f, u1i, u2f, u3f, u4fv, uMat4,
} from './gl.js';
import { buildRaytraceShader } from './shaders/raytrace.glsl.js';
import {
  ACCUMULATE_FS, BLOOM_DOWN_FS, BLOOM_UP_FS, COMPOSITE_FS, LINE_VS, LINE_FS, STAR_VS, STAR_FS,
} from './shaders/post.glsl.js';
import { QUALITY_BY_ID, detectQuality, AdaptiveScaler } from './quality.js';
import { SUN_RADIUS_KM, AU_KM } from '../astro/constants.js';
import { INTERIORS } from '../astro/interior.js';

/** Megametres per kilometre. */
const MM = 1000;
/** Compile-time body cap; also the width of the body data texture. */
export const MAX_BODIES = 40;
/** Compile-time ring-system cap. */
export const MAX_RINGS = 4;
/** Rows per body record in the data texture. */
const BODY_ROWS = 6;
/** Radial samples in the ring look-up table. */
const RING_LUT_SIZE = 1024;

/** Surface-type enum mirroring the shader. */
const SURF = { ROCK: 0, GAS: 1, ICE: 2, STAR: 3, TEX: 4 };

/** Bodies whose class is not rocky. */
const GAS_GIANTS = new Set(['jupiter', 'saturn', 'uranus', 'neptune']);
const ICY = new Set(['europa', 'enceladus', 'mimas', 'tethys', 'dione', 'rhea', 'triton', 'pluto', 'charon', 'titan', 'ganymede']);

export class Renderer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} [opts]
   */
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.gl = createContext(canvas, opts);
    this.caps = getCapabilities(this.gl);

    if (!this.caps.floatRender) {
      throw new Error(
        'This GPU cannot render to floating-point textures (EXT_color_buffer_float). ' +
          'The HDR pipeline requires it.'
      );
    }

    /** @type {import('./quality.js').QualityPreset} */
    this.quality = QUALITY_BY_ID.get(opts.quality || detectQuality(this.caps));
    this.scaler = new AdaptiveScaler({ targetFps: opts.targetFps ?? 60 });

    /** Grading and exposure settings, all live-tweakable from the UI. */
    this.settings = {
      exposure: 1.0,
      autoExposure: true,
      tonemap: 0, // 0 AgX, 1 ACES, 2 Reinhard, 3 linear
      whitePoint: 4,
      bloomStrength: 0.55,
      bloomThreshold: 1.4,
      vignette: 0.28,
      chromatic: 0.12,
      grain: 0.2,
      saturation: 1.05,
      contrast: 1.04,
      lift: 0,
      starburst: 1,
      scanlines: 0,
      ambient: 0.35,
      sunRadiance: 2600,
      pointGain: 1,
      showRings: true,
      showAtmosphere: true,
      showStars: true,
      showOrbits: true,
      showLabels: true,
      realisticBrightness: 1,
      starBrightness: 1,
      physicalStars: false,
      // Cutaway: which body is sectioned, and how far open.
      //
      // EXPERIMENTAL AND OFF. The geometry works — the near hemisphere is
      // removed and the exposed face is found and shaded from the interior
      // look-up table — but the plane-crossing test only selects that face for
      // rays near the limb, so most of the section renders as the inside of the
      // far wall instead of as layers. It is left in place, disabled, because
      // it is close and because `astro/interior.js` (which supplies its
      // colours, and whose numbers are validated against published PREM
      // values) is finished and useful on its own.
      cutBody: null,
      cutOpen: 0,
    };

    this._frame = 0;
    this._accumFrames = 0;
    this._lastViewKey = '';
    this._time = 0;
    this._exposureSmoothed = 1;

    this._initPrograms();
    this._initBuffers();
    this._initTextures();
    this.resize();
  }

  /** @private */
  _initPrograms() {
    const gl = this.gl;
    this.progRT = createProgram(gl, FULLSCREEN_VS, buildRaytraceShader({
      maxBodies: MAX_BODIES, maxRings: MAX_RINGS,
    }), 'raytrace');
    this.progAccum = createProgram(gl, FULLSCREEN_VS, ACCUMULATE_FS, 'accumulate');
    this.progDown = createProgram(gl, FULLSCREEN_VS, BLOOM_DOWN_FS, 'bloom-down');
    this.progUp = createProgram(gl, FULLSCREEN_VS, BLOOM_UP_FS, 'bloom-up');
    this.progComposite = createProgram(gl, FULLSCREEN_VS, COMPOSITE_FS, 'composite');
    this.progLine = createProgram(gl, LINE_VS, LINE_FS, 'lines');
    this.progStar = createProgram(gl, STAR_VS, STAR_FS, 'stars');
  }

  /** @private */
  _initBuffers() {
    const gl = this.gl;
    // WebGL2 core requires a bound VAO for attribute-less draws in some
    // implementations; bind one empty VAO for the fullscreen passes.
    this.emptyVAO = gl.createVertexArray();

    this.lineVAO = gl.createVertexArray();
    this.lineVBO = gl.createBuffer();
    gl.bindVertexArray(this.lineVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lineVBO);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 16, 12);
    gl.bindVertexArray(null);
    this._lineCapacity = 0;

    // Stars: two static buffers, uploaded once when the catalogue arrives.
    this.starVAO = gl.createVertexArray();
    this.starDirVBO = gl.createBuffer();
    this.starTintVBO = gl.createBuffer();
    gl.bindVertexArray(this.starVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.starDirVBO);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.starTintVBO);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    this.starCount = 0;
  }

  /** @private */
  _initTextures() {
    const gl = this.gl;
    this.bodyTex = createDataTexture(gl, MAX_BODIES, BODY_ROWS);
    this.bodyData = new Float32Array(MAX_BODIES * BODY_ROWS * 4);

    // Ring look-up table: one row per ring system.
    this.ringLUT = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.ringLUT);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA16F, RING_LUT_SIZE, MAX_RINGS);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);
    this.ringRadii = new Float32Array(MAX_RINGS * 4);
    this.ringCount = 0;

    // Surface imagery array. Layers are assigned on demand by `setSurface`.
    this.surfaceSize = this.quality.surfaceTextureSize;
    this.surfaces = createSurfaceArray(gl, this.surfaceSize, 8);
    /** @type {Map<string, number>} texture key -> array layer */
    this.surfaceLayers = new Map();
    this._nextLayer = 0;

    // A 1x1 black sky until the real catalogue arrives.
    this.skyTex = createHDRTexture(gl, new Float32Array([0, 0, 0]), 1, 1);

    this.interiorLUT = this._buildInteriorLUT();
  }

  /**
   * Install the HDR star map produced by `astro/stars.buildSkyMap`.
   * @param {{data:Float32Array,width:number,height:number}} map
   */
  setSkyMap(map) {
    this.gl.deleteTexture(this.skyTex);
    this.skyTex = createHDRTexture(this.gl, map.data, map.width, map.height);
    this.resetAccumulation();
  }

  /**
   * Bake the interior layer colours into a look-up table.
   *
   * One row per modelled body, 256 columns of normalised radius. Built from
   * `astro/interior.js`, so the shader and the read-outs in the panel cannot
   * disagree about where the core-mantle boundary is.
   *
   * @private
   */
  _buildInteriorLUT() {
    const gl = this.gl;
    const W = 256;
    const H = 8;
    const data = new Uint8Array(W * H * 4);
    this.interiorRows = new Map();

    let row = 0;
    for (const [id, model] of Object.entries(INTERIORS)) {
      if (row >= H) break;
      this.interiorRows.set(id, row);
      for (let i = 0; i < W; i++) {
        const r = ((i + 0.5) / W) * model.radiusKm;
        const layer = model.layers.find((l) => r >= l.inner && r <= l.outer)
          || model.layers[model.layers.length - 1];
        const o = (row * W + i) * 4;
        data[o] = Math.round(layer.color[0] * 255);
        data[o + 1] = Math.round(layer.color[1] * 255);
        data[o + 2] = Math.round(layer.color[2] * 255);
        data[o + 3] = 255;
      }
      row++;
    }

    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    // Nearest in the row direction so bodies never bleed into each other;
    // linear across radius so a boundary is a clean edge rather than a stair.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return tex;
  }

  /**
   * Install the point-sprite star buffers from `astro/stars.buildStarPoints`.
   * @param {{dir:Float32Array,tint:Float32Array,count:number}} stars
   */
  setStars(stars) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.starDirVBO);
    gl.bufferData(gl.ARRAY_BUFFER, stars.dir, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.starTintVBO);
    gl.bufferData(gl.ARRAY_BUFFER, stars.tint, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    this.starCount = stars.count;
    this.resetAccumulation();
  }

  /**
   * Upload equirectangular imagery for a body.
   * @param {string} key Body id, matching `BodyRecord.texture`.
   * @param {ImageBitmap|HTMLCanvasElement|HTMLImageElement} image
   */
  setSurface(key, image) {
    const gl = this.gl;
    let layer = this.surfaceLayers.get(key);
    if (layer == null) {
      if (this._nextLayer >= 8) return; // array is full; keep the earlier ones
      layer = this._nextLayer++;
      this.surfaceLayers.set(key, layer);
    }
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.surfaces);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texSubImage3D(
      gl.TEXTURE_2D_ARRAY, 0, 0, 0, layer,
      this.surfaceSize, this.surfaceSize / 2, 1,
      gl.RGBA, gl.UNSIGNED_BYTE, image
    );
    gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, null);
    this.resetAccumulation();
  }

  /**
   * Bake the radial ring profile for every ring system in the scene.
   * @param {Array<{bodyId:string, bands:Array}>} systems
   * @param {Map<string, number>} bodyIndex Body id -> index in the data texture.
   */
  setRings(systems, bodyIndex) {
    const gl = this.gl;
    const rows = Math.min(systems.length, MAX_RINGS);
    this.ringCount = rows;
    const lut = new Float32Array(RING_LUT_SIZE * MAX_RINGS * 4);

    for (let s = 0; s < rows; s++) {
      const sys = systems[s];
      const inner = Math.min(...sys.bands.map((b) => b.inner));
      const outer = Math.max(...sys.bands.map((b) => b.outer));
      this.ringRadii[s * 4] = inner / MM;
      this.ringRadii[s * 4 + 1] = outer / MM;
      this.ringRadii[s * 4 + 2] = bodyIndex.get(sys.bodyId) ?? -1;

      // Area-weighted mean opacity, accumulated as the profile is built. The
      // shader uses it for ringshine: how much light the system as a whole
      // throws back onto its planet. Weighting by radius rather than by band
      // count is what makes it an average over the ring's *area*, which is
      // what a surface point below actually sees.
      let sumA = 0;
      let sumR = 0;

      for (let i = 0; i < RING_LUT_SIZE; i++) {
        const r = inner + ((i + 0.5) / RING_LUT_SIZE) * (outer - inner);
        let cr = 0, cg = 0, cb = 0, ca = 0;
        for (const band of sys.bands) {
          if (r < band.inner || r > band.outer) continue;
          // Soften the 2-3 texel wide transition at each band edge so the LUT
          // does not alias when the rings are seen nearly edge-on.
          const span = band.outer - band.inner;
          const edge = Math.min(1, ((r - band.inner) / span) * RING_LUT_SIZE * 0.5) *
                       Math.min(1, ((band.outer - r) / span) * RING_LUT_SIZE * 0.5);
          const a = band.opacity * Math.min(1, edge);
          if (a <= ca) continue;
          ca = a; cr = band.color[0]; cg = band.color[1]; cb = band.color[2];
        }
        const o = (s * RING_LUT_SIZE + i) * 4;
        lut[o] = cr; lut[o + 1] = cg; lut[o + 2] = cb; lut[o + 3] = ca;
        sumA += ca * r;
        sumR += r;
      }

      this.ringRadii[s * 4 + 3] = sumR > 0 ? sumA / sumR : 0;
    }

    gl.bindTexture(gl.TEXTURE_2D, this.ringLUT);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, RING_LUT_SIZE, MAX_RINGS, gl.RGBA, gl.FLOAT, lut);
    gl.bindTexture(gl.TEXTURE_2D, null);
    this.resetAccumulation();
  }

  /**
   * Resize all render targets to match the canvas and the current quality.
   * @param {number} [widthOverride] Explicit pixel width (used by export).
   * @param {number} [heightOverride]
   */
  resize(widthOverride, heightOverride) {
    const gl = this.gl;
    const dpr = Math.min(window.devicePixelRatio || 1, this.quality.maxPixelRatio);
    const cssW = widthOverride ?? this.canvas.clientWidth ?? 1280;
    const cssH = heightOverride ?? this.canvas.clientHeight ?? 720;

    const targetW = Math.max(2, Math.round(cssW * (widthOverride ? 1 : dpr)));
    const targetH = Math.max(2, Math.round(cssH * (heightOverride ? 1 : dpr)));

    if (!widthOverride) {
      this.canvas.width = targetW;
      this.canvas.height = targetH;
    }
    this.outputWidth = targetW;
    this.outputHeight = targetH;

    const scale = this.quality.resolutionScale * (this.scaler.enabled ? this.scaler.scale : 1);
    const w = Math.max(2, Math.round(targetW * scale));
    const h = Math.max(2, Math.round(targetH * scale));
    if (this.sceneRT && this.sceneRT.width === w && this.sceneRT.height === h) return;

    this.renderWidth = w;
    this.renderHeight = h;

    this.sceneRT?.dispose();
    this.accum?.dispose();
    this.bloomChain?.forEach((rt) => rt.dispose());

    this.sceneRT = new RenderTarget(gl, w, h);
    this.accum = new PingPong(gl, w, h);

    this.bloomChain = [];
    let bw = w >> 1;
    let bh = h >> 1;
    for (let i = 0; i < this.quality.bloomMips && bw >= 8 && bh >= 8; i++) {
      this.bloomChain.push(new RenderTarget(gl, bw, bh));
      bw >>= 1;
      bh >>= 1;
    }
    this.resetAccumulation();
  }

  /**
   * Reallocate the internal targets to an exact pixel size, bypassing the
   * device-pixel-ratio and quality-scale arithmetic that `resize()` applies.
   * Used by the tiled exporter, which must control the size precisely.
   * @param {number} w
   * @param {number} h
   * @internal
   */
  _resizeForExport(w, h) {
    if (this.sceneRT && this.sceneRT.width === w && this.sceneRT.height === h) {
      this.renderWidth = w;
      this.renderHeight = h;
      return;
    }
    const gl = this.gl;
    this.sceneRT?.dispose();
    this.accum?.dispose();
    this.bloomChain?.forEach((rt) => rt.dispose());

    this.renderWidth = w;
    this.renderHeight = h;
    this.sceneRT = new RenderTarget(gl, w, h);
    this.accum = new PingPong(gl, w, h);
    this.bloomChain = [];
    let bw = w >> 1;
    let bh = h >> 1;
    for (let i = 0; i < this.quality.bloomMips && bw >= 8 && bh >= 8; i++) {
      this.bloomChain.push(new RenderTarget(gl, bw, bh));
      bw >>= 1;
      bh >>= 1;
    }
    this.resetAccumulation();
  }

  /**
   * Put the render targets back the way the interactive view expects.
   * @param {{renderWidth:number, renderHeight:number, outputWidth:number, outputHeight:number}} saved
   * @internal
   */
  _restoreAfterExport(saved) {
    this.outputWidth = saved.outputWidth;
    this.outputHeight = saved.outputHeight;
    this._resizeForExport(saved.renderWidth, saved.renderHeight);
    this._lastViewKey = '';
  }

  /**
   * Discard accumulated samples (call whenever the image should change).
   *
   * The history buffers are actively cleared rather than merely marked stale.
   * The first frame after a reset blends with weight 1 and so *should* replace
   * the history entirely, but that relies on every pixel being written — and
   * any pass that early-outs, plus the fact that exposure keeps drifting while
   * the first samples land, can leave a ghost of the previous view. Clearing is
   * two cheap draws and removes the whole class of problem.
   */
  resetAccumulation() {
    this._accumFrames = 0;
    if (!this.accum) return;
    const gl = this.gl;
    for (const rt of [this.accum.a, this.accum.b]) {
      rt.bind();
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /** @returns {number} Samples accumulated into the current image. */
  get accumulatedFrames() {
    return this._accumFrames;
  }

  /** @returns {boolean} true when the image has reached its quality target. */
  get converged() {
    return this._accumFrames >= this.quality.accumTarget;
  }

  /**
   * Change the quality preset.
   * @param {string} id
   */
  setQuality(id) {
    const q = QUALITY_BY_ID.get(id);
    if (!q || q === this.quality) return;
    const sizeChanged = q.surfaceTextureSize !== this.quality.surfaceTextureSize;
    this.quality = q;
    if (sizeChanged) {
      // Surface imagery must be re-fetched at the new resolution; the caller
      // listens for this and re-runs the texture loader.
      this.surfaceSize = q.surfaceTextureSize;
      this.gl.deleteTexture(this.surfaces);
      this.surfaces = createSurfaceArray(this.gl, this.surfaceSize, 8);
      this.surfaceLayers.clear();
      this._nextLayer = 0;
      this.onSurfacesInvalidated?.();
    }
    this.scaler.reset();
    this.sceneRT = null; // force reallocation
    this.resize();
  }

  /**
   * Pack the visible subset of the scene into the body data texture.
   *
   * Culling matters: the shader loops over every uploaded body for the primary
   * ray *and* for each shadow test, so uploading 31 bodies when 9 are visible
   * costs roughly three times the frame time for no benefit.
   *
   * @param {import('../astro/ephemeris.js').SceneState} scene
   * @param {import('./camera.js').Camera} camera
   * @returns {Map<string, number>} body id -> index in the texture.
   */
  packBodies(scene, camera) {
    const data = this.bodyData;
    data.fill(0);
    /** @type {Map<string, number>} */
    const index = new Map();

    const camPos = camera.position;
    const tanHalf = Math.tan(camera.effectiveFov / 2);
    const pixelAngle = (2 * tanHalf) / this.renderHeight;

    // Score every body, then keep the most significant ones. The Sun is always
    // included: it is the light source.
    const scored = [];
    for (const b of scene.bodies) {
      const dx = b.pos[0] - camPos[0];
      const dy = b.pos[1] - camPos[1];
      const dz = b.pos[2] - camPos[2];
      const dist = Math.hypot(dx, dy, dz);
      const angular = b.radiusKm / Math.max(dist, 1);
      const isSun = b.id === 'sun';
      const isFocus = b.id === camera.focus;
      // The Sun and the major bodies are always uploaded, however small they
      // are on screen: from 40 au a planet is a millionth of a radian across,
      // but it is still a visible point of light, and dropping it would make
      // the wide system view empty. Everything else earns its place by
      // subtending at least a fifth of a pixel, or by being related to the
      // focused body.
      const major = b.kind === 'planet' || b.kind === 'dwarf';
      const relevant = isSun || major || isFocus || b.parent === camera.focus ||
        scene.byId.get(camera.focus)?.parent === b.id ||
        angular > pixelAngle * 0.2;
      if (!relevant) continue;
      scored.push({ b, score: isSun ? Infinity : isFocus ? 1e30 : angular, dist });
    }
    scored.sort((a, b) => b.score - a.score);

    const n = Math.min(scored.length, MAX_BODIES);
    for (let i = 0; i < n; i++) {
      const b = scored[i].b;
      index.set(b.id, i);
      const o = i * 4;
      const row = (r) => o + r * MAX_BODIES * 4;

      // ROW_POS
      data[row(0)] = (b.pos[0] - camPos[0]) / MM;
      data[row(0) + 1] = (b.pos[1] - camPos[1]) / MM;
      data[row(0) + 2] = (b.pos[2] - camPos[2]) / MM;
      data[row(0) + 3] = b.radiusKm / MM;

      // ROW_ALBEDO
      data[row(1)] = b.color[0];
      data[row(1) + 1] = b.color[1];
      data[row(1) + 2] = b.color[2];
      data[row(1) + 3] = Math.min(b.albedo || 0.2, 1);

      // ROW_AXIS
      data[row(2)] = b.axis[0];
      data[row(2) + 1] = b.axis[1];
      data[row(2) + 2] = b.axis[2];
      data[row(2) + 3] = b.spin;

      // ROW_MISC
      data[row(3)] = this.settings.showAtmosphere ? b.atmosphere || 0 : 0;
      data[row(3) + 1] = -1; // ring index, filled below
      data[row(3) + 2] = b.flattening || 0;
      data[row(3) + 3] = b.emissive || 0;

      // ROW_SCATT — the tabulated Rayleigh coefficients are in units of
      // 1e-6 m^-1, which converts to "per megametre" with a factor of exactly
      // 1: 1e-6 m^-1 x 1e6 m/Mm = 1 Mm^-1. So they are uploaded verbatim, and
      // the optical depths the shader computes are physically correct.
      const ray = b.rayleigh || [0, 0, 0];
      data[row(4)] = ray[0];
      data[row(4) + 1] = ray[1];
      data[row(4) + 2] = ray[2];
      data[row(4) + 3] = b.record?.mie ?? 0;

      // ROW_SURF
      const layer = b.texture != null ? this.surfaceLayers.get(b.texture) : undefined;
      data[row(5)] = layer == null ? -1 : layer;
      data[row(5) + 1] = b.emissive > 0 ? SURF.STAR
        : layer != null ? SURF.TEX
        : GAS_GIANTS.has(b.id) ? SURF.GAS
        : ICY.has(b.id) ? SURF.ICE
        : SURF.ROCK;
      // Scale height in megametres; the shader needs the real value to get the
      // thickness of the limb right.
      data[row(5) + 2] = (b.record?.scaleHeightKm ?? 8.5) / MM;
      data[row(5) + 3] = 0.9;
    }

    // Ring systems reference their planet's index.
    for (let s = 0; s < this.ringCount; s++) {
      const bodyIdx = this._ringBodyIds ? index.get(this._ringBodyIds[s]) : undefined;
      this.ringRadii[s * 4 + 2] = bodyIdx == null ? -1 : bodyIdx;
      if (bodyIdx != null) {
        data[bodyIdx * 4 + 3 * MAX_BODIES * 4 + 1] = s;
      }
    }

    uploadDataTexture(this.gl, this.bodyTex, MAX_BODIES, BODY_ROWS, data);
    this.bodyCount = n;
    return index;
  }

  /**
   * Register which body each ring system belongs to (called once at setup).
   * @param {string[]} ids
   */
  setRingBodies(ids) {
    this._ringBodyIds = ids;
  }

  /**
   * Render one frame.
   *
   * @param {import('../astro/ephemeris.js').SceneState} scene
   * @param {import('./camera.js').Camera} camera
   * @param {object} [opts]
   * @param {number} [opts.dt] Real seconds since the last frame.
   * @param {WebGLFramebuffer|null} [opts.target] Output framebuffer.
   * @param {number} [opts.viewportWidth]
   * @param {number} [opts.viewportHeight]
   * @param {boolean} [opts.forceAccumulate] Keep accumulating regardless of motion.
   * @returns {{accumulated:number, bodies:number}}
   */
  render(scene, camera, opts = {}) {
    const gl = this.gl;
    const frameStart = performance.now();
    const dt = opts.dt ?? 0.016;
    this._time += dt;
    this._frame++;

    // A change in any of these invalidates the accumulated image.
    const viewKey = [
      camera.position[0].toFixed(3), camera.position[1].toFixed(3), camera.position[2].toFixed(3),
      camera.forward[0].toFixed(6), camera.forward[1].toFixed(6), camera.forward[2].toFixed(6),
      camera.up[0].toFixed(6), camera.effectiveFov.toFixed(6),
      scene.jd.toFixed(9), this.bodyCount,
      this.settings.cutBody ?? '-', this.settings.cutOpen.toFixed(3),
    ].join(',');
    if (viewKey !== this._lastViewKey && !opts.forceAccumulate) {
      this._accumFrames = 0;
      this._lastViewKey = viewKey;
    }

    if (this.settings.autoExposure) this.adaptExposure(this.targetExposure(scene, camera), dt);

    const bodyIndex = this.packBodies(scene, camera);

    // ---- pass 1: ray trace -------------------------------------------------
    const sun = scene.byId.get('sun');
    const sunRel = camera.relative(sun ? sun.pos : [0, 0, 0]);

    this.sceneRT.bind();
    gl.bindVertexArray(this.emptyVAO);
    gl.disable(gl.BLEND);
    this.progRT.use();
    const u = this.progRT.uniforms;

    // Halton(2,3) jitter: a low-discrepancy sequence covers the pixel far more
    // evenly than white noise, so 16 accumulated samples look like 64.
    const jx = this._accumFrames === 0 && !opts.forceAccumulate ? 0 : halton(this._accumFrames + 1, 2) - 0.5;
    const jy = this._accumFrames === 0 && !opts.forceAccumulate ? 0 : halton(this._accumFrames + 1, 3) - 0.5;

    const tile = opts.tile;
    u2f(gl, u.uResolution, tile ? tile.fullWidth : this.renderWidth, tile ? tile.fullHeight : this.renderHeight);
    u2f(gl, u.uTileOrigin, tile ? tile.x : 0, tile ? tile.y : 0);
    u2f(gl, u.uTileSize, tile ? tile.w : this.renderWidth, tile ? tile.h : this.renderHeight);
    u3f(gl, u.uCamRight, camera.right[0], camera.right[1], camera.right[2]);
    u3f(gl, u.uCamUp, camera.up[0], camera.up[1], camera.up[2]);
    u3f(gl, u.uCamFwd, camera.forward[0], camera.forward[1], camera.forward[2]);
    u1f(gl, u.uTanHalfFov, Math.tan(camera.effectiveFov / 2));
    u2f(gl, u.uJitter, jx, jy);
    u1f(gl, u.uFrame, this._accumFrames);
    u1f(gl, u.uTime, this._time);
    u1i(gl, u.uBodyCount, this.bodyCount);
    u3f(gl, u.uSunPos, sunRel[0], sunRel[1], sunRel[2]);
    u1f(gl, u.uSunRadius, SUN_RADIUS_KM / MM);
    // Solar spectral tint only: the 5772 K photosphere is very slightly warm.
    // All the magnitude lives in the physical irradiance term, so that
    // "exposure 1" means "correctly exposed at Earth's distance".
    u3f(gl, u.uSunColor, 1.0, 0.965, 0.92);
    u1f(gl, u.uAuMm, AU_KM / MM);
    u1f(gl, u.uSunRadiance, this.settings.sunRadiance);
    u1f(gl, u.uPointGain, this.settings.pointGain);
    // 4.82e11 = 10^(0.4 * 26.74) x the star-map flux scale; see the shader.
    u1f(gl, u.uBeaconGain, this.settings.physicalStars
      ? 0
      : (4.82e11 * this.settings.starBrightness) / Math.max(this._exposure(), 1e-4));
    u1f(gl, u.uPixelAngle,
      (2 * Math.tan(camera.effectiveFov / 2)) / (tile ? tile.fullHeight : this.renderHeight));
    u1i(gl, u.uScatterSteps, this.quality.scatterSteps);
    u1i(gl, u.uLightSteps, this.quality.lightSteps);
    u1i(gl, u.uShadowBodies, Math.min(this.quality.shadowBodies, this.bodyCount));
    u1f(gl, u.uSurfaceDetail, this.quality.surfaceDetail);
    u1f(gl, u.uAmbient, this.settings.ambient);
    u1f(gl, u.uShowRings, this.settings.showRings ? 1 : 0);
    u1f(gl, u.uShowAtmosphere, this.settings.showAtmosphere ? 1 : 0);
    u1f(gl, u.uShowStars, this.settings.showStars ? 1 : 0);
    u1f(gl, u.uSkyGain, this._skyGain());
    u1f(gl, u.uRealisticBrightness, this.settings.realisticBrightness);
    u1i(gl, u.uRingCount, this.ringCount);
    u4fv(gl, u.uRingRadii, this.ringRadii);

    bindTexture(gl, u.uBodies, this.bodyTex, 0);
    // Cutaway. The plane is tilted between "straight at the camera" and "edge
    // on": mostly facing the viewer, so the section is legible rather than
    // foreshortened to a sliver, but angled enough that a crescent of the real
    // surface stays in frame. Without the surface beside it, a cutaway is just
    // a pie chart. Derived from the camera each frame, so orbiting the planet
    // turns the section with you instead of hiding it.
    const cutIdx = this.settings.cutBody != null && this.settings.cutOpen > 0
      ? (bodyIndex.get(this.settings.cutBody) ?? -1)
      : -1;
    u1i(gl, u.uCutBody, cutIdx);
    u1i(gl, u.uCutRow, this.interiorRows?.get(this.settings.cutBody) ?? 0);
    u1f(gl, u.uCutOpen, cutIdx >= 0 ? this.settings.cutOpen : 0);
    const cn = [
      -camera.forward[0] + 0.85 * camera.right[0],
      -camera.forward[1] + 0.85 * camera.right[1],
      -camera.forward[2] + 0.85 * camera.right[2],
    ];
    const cnLen = Math.hypot(cn[0], cn[1], cn[2]) || 1;
    u3f(gl, u.uCutNormal, cn[0] / cnLen, cn[1] / cnLen, cn[2] / cnLen);

    bindTexture(gl, u.uSky, this.skyTex, 1);
    bindTexture(gl, u.uRingLUT, this.ringLUT, 2);
    bindTexture(gl, u.uSurfaces, this.surfaces, 3, gl.TEXTURE_2D_ARRAY);
    bindTexture(gl, u.uInteriorLUT, this.interiorLUT, 4);
    drawFullscreen(gl);

    // ---- pass 2: stars -----------------------------------------------------
    // Before the overlay so an orbit path drawn over the sky reads as an
    // annotation on top of the stars, which is what it is.
    this._drawStars(camera, opts.tile, jx, jy);

    // ---- pass 3: vector overlay -------------------------------------------
    if (this.settings.showOrbits && scene.orbits.length) {
      this._drawOrbits(scene, camera, opts.tile);
    }

    // ---- pass 4: temporal accumulation ------------------------------------
    const blend = this._accumFrames === 0 ? 1 : 1 / (this._accumFrames + 1);
    this.accum.write.bind();
    this.progAccum.use();
    gl.bindVertexArray(this.emptyVAO);
    gl.disable(gl.BLEND);
    bindTexture(gl, this.progAccum.uniforms.uCurrent, this.sceneRT.texture, 0);
    bindTexture(gl, this.progAccum.uniforms.uHistory, this.accum.read.texture, 1);
    u1f(gl, this.progAccum.uniforms.uBlend, blend);
    drawFullscreen(gl);
    this.accum.swap();
    if (this._accumFrames < this.quality.accumTarget) this._accumFrames++;

    const lit = this.accum.read;

    // ---- pass 5: bloom -----------------------------------------------------
    this._bloom(lit);

    // ---- pass 6: composite -------------------------------------------------
    const target = opts.target ?? null;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target);
    gl.viewport(0, 0, opts.viewportWidth ?? this.outputWidth, opts.viewportHeight ?? this.outputHeight);
    this.progComposite.use();
    gl.bindVertexArray(this.emptyVAO);
    gl.disable(gl.BLEND);
    const c = this.progComposite.uniforms;
    bindTexture(gl, c.uScene, lit.texture, 0);
    bindTexture(gl, c.uBloom, this.bloomChain.length ? this.bloomChain[0].texture : lit.texture, 1);
    const vpW = opts.viewportWidth ?? this.outputWidth;
    const vpH = opts.viewportHeight ?? this.outputHeight;
    u2f(gl, c.uResolution, vpW, vpH);
    u2f(gl, c.uFullResolution, tile ? tile.fullWidth : vpW, tile ? tile.fullHeight : vpH);
    u2f(gl, c.uTileOrigin, tile ? tile.x : 0, tile ? tile.y : 0);
    u1f(gl, c.uExposure, this._exposure());
    u1f(gl, c.uBloomStrength, this.settings.bloomStrength);
    u1i(gl, c.uTonemap, this.settings.tonemap);
    u1f(gl, c.uWhitePoint, this.settings.whitePoint);
    u1f(gl, c.uVignette, this.settings.vignette);
    u1f(gl, c.uChromatic, this.settings.chromatic);
    u1f(gl, c.uGrain, this.settings.grain);
    u1f(gl, c.uSaturation, this.settings.saturation);
    u1f(gl, c.uContrast, this.settings.contrast);
    u1f(gl, c.uLift, this.settings.lift);
    u1f(gl, c.uTime, this._time);
    u1f(gl, c.uStarburst, this.quality.starburst ? this.settings.starburst : 0);
    u1f(gl, c.uScanlines, this.settings.scanlines);
    drawFullscreen(gl);

    gl.bindVertexArray(null);

    // A cheap rolling estimate of cost, used to predict export times. Measured
    // on the CPU side, so it under-reports when the GPU is the bottleneck; good
    // enough to tell a user "about a minute" rather than nothing at all.
    const megapixels = (this.renderWidth * this.renderHeight) / 1e6;
    if (megapixels > 0.01) {
      const ms = performance.now() - frameStart;
      const perMp = ms / megapixels;
      this._msPerMegapixelSample = this._msPerMegapixelSample == null
        ? perMp
        : this._msPerMegapixelSample * 0.9 + perMp * 0.1;
    }

    return { accumulated: this._accumFrames, bodies: this.bodyCount, index: bodyIndex };
  }

  /** @private */
  _exposure() {
    if (!this.settings.autoExposure) return this.settings.exposure;
    return this.settings.exposure * this._exposureSmoothed;
  }

  /**
   * Brightness multiplier for everything at stellar distance.
   *
   * Shared by the sky texture and the star pass so the two never disagree about
   * how bright the sky is. Carries a 1/exposure factor by default: sunlight
   * varies by a factor of 1600 between Mercury and Neptune and the exposure
   * control follows it, so a star field left in absolute units would be
   * invisible at Mercury and blinding at Neptune. Spacecraft cameras have this
   * problem too and answer it with two exposures. Keeping the stars at a
   * constant apparent brightness is the documented alternative, and
   * `physicalStars` turns it off for anyone who wants the uncompromising
   * version.
   *
   * @private
   */
  _skyGain() {
    return this.settings.physicalStars
      ? this.settings.starBrightness
      : this.settings.starBrightness / Math.max(this._exposure(), 1e-4);
  }

  /**
   * The exposure multiplier that correctly exposes the focused body.
   *
   * Sunlight falls off as 1/r^2, so Neptune receives 1/900 of Earth's
   * irradiance. Rather than cheat by flattening the physics, the renderer keeps
   * the light physically correct and opens the "shutter" instead — exactly what
   * a spacecraft camera does. The multiplier is simply d^2 in astronomical
   * units, so exposure 1 is correct at Earth.
   *
   * @param {import('../astro/ephemeris.js').SceneState} scene
   * @param {import('./camera.js').Camera} camera
   * @returns {number}
   */
  targetExposure(scene, camera) {
    if (this.settings.realisticBrightness < 0.5) return 1;
    const f = scene.byId.get(camera.focus);
    if (!f) return 1;
    const dAU = Math.hypot(f.pos[0], f.pos[1], f.pos[2]) / AU_KM;

    // The Sun has no meaningful "distance from the Sun", so it is metered on
    // how much of the frame its disc fills — which is what a real camera's
    // meter responds to as well.
    //
    // The two ends are far apart. Filling the frame, the photosphere has to
    // land near the top of the tone curve rather than past it, or limb
    // darkening and granulation are clipped to flat white and the bloom pass
    // floods the whole image with grey. Seen from outside Neptune's orbit it is
    // effectively a point, and the exposure that suits the disc would leave the
    // rest of the system invisible.
    if (f.id === 'sun') {
      const d = Math.max(Math.hypot(
        camera.position[0] - f.pos[0],
        camera.position[1] - f.pos[1],
        camera.position[2] - f.pos[2]
      ), SUN_RADIUS_KM * 1.02);
      // Disc radius as a fraction of the half-frame.
      const fill = (SUN_RADIUS_KM / d) / Math.tan(camera.effectiveFov / 2);
      const t = smoothstep(0.03, 0.45, fill);
      // 0.85 / radiance puts the centre of the disc below the shoulder of the
      // tone curve, leaving room for the bloom pass to add on top without
      // clipping — which is what was flattening the granulation. 0.02 is the
      // wide-system value that keeps the planets lit.
      return 0.02 * (1 - t) + (0.85 / this.settings.sunRadiance) * t;
    }

    return Math.min(Math.max(dAU * dAU, 0.05), 1600);
  }

  /**
   * Ease the exposure towards a target. Uses an analytic target rather than a
   * GPU luminance readback, which would stall the pipeline every frame.
   * @param {number} targetMultiplier
   * @param {number} dt
   */
  adaptExposure(targetMultiplier, dt) {
    const k = 1 - Math.pow(2, -dt / 0.6);
    this._exposureSmoothed += (targetMultiplier - this._exposureSmoothed) * k;
  }

  /**
   * Jump the exposure straight to its target. Used before an export so a still
   * or a recording never captures the camera mid-adaptation.
   * @param {number} targetMultiplier
   */
  snapExposure(targetMultiplier) {
    this._exposureSmoothed = targetMultiplier;
  }

  /** @private */
  _bloom(source) {
    const gl = this.gl;
    if (!this.bloomChain.length) return;
    gl.bindVertexArray(this.emptyVAO);
    gl.disable(gl.BLEND);

    this.progDown.use();
    let src = source;
    for (let i = 0; i < this.bloomChain.length; i++) {
      const dst = this.bloomChain[i];
      dst.bind();
      bindTexture(gl, this.progDown.uniforms.uSource, src.texture, 0);
      u2f(gl, this.progDown.uniforms.uTexel, 1 / src.width, 1 / src.height);
      // The threshold lives in display space, so it must track exposure.
      // Otherwise a scene exposed 90x brighter (Saturn) pushes every faint star
      // over a fixed threshold and the whole frame turns to glare.
      u1f(gl, this.progDown.uniforms.uThreshold,
        this.settings.bloomThreshold / Math.max(this._exposure(), 1e-4));
      u1f(gl, this.progDown.uniforms.uSoftKnee, 0.6);
      u1i(gl, this.progDown.uniforms.uFirst, i === 0 ? 1 : 0);
      drawFullscreen(gl);
      src = dst;
    }

    // Upsample back up the chain, adding each level into the one above it with
    // the fixed-function blender. No scratch targets, no per-frame allocation.
    this.progUp.use();
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    for (let i = this.bloomChain.length - 1; i > 0; i--) {
      const small = this.bloomChain[i];
      const big = this.bloomChain[i - 1];
      big.bind();
      bindTexture(gl, this.progUp.uniforms.uSource, small.texture, 0);
      u2f(gl, this.progUp.uniforms.uTexel, 1 / big.width, 1 / big.height);
      u1f(gl, this.progUp.uniforms.uRadius, 1.0);
      drawFullscreen(gl);
    }
    gl.disable(gl.BLEND);
  }

  /**
   * The star pass.
   *
   * Blending does the occlusion: source is scaled by one minus the destination
   * alpha the ray tracer wrote, destination is kept as-is, and the alpha
   * channel is left alone so the mask survives for however many stars land on
   * the same pixel.
   *
   * @param {import('./camera.js').Camera} camera
   * @param {{x:number,y:number,w:number,h:number,fullWidth:number,fullHeight:number}} [tile]
   * @param {number} jx Sub-pixel jitter, matching the ray tracer's, in pixels.
   * @param {number} jy
   * @private
   */
  _drawStars(camera, tile, jx, jy) {
    if (!this.starCount || !this.settings.showStars) return;
    const gl = this.gl;
    const fullW = tile ? tile.fullWidth : this.renderWidth;
    const fullH = tile ? tile.fullHeight : this.renderHeight;

    this.sceneRT.bind();
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.ONE_MINUS_DST_ALPHA, gl.ONE, gl.ZERO, gl.ONE);
    this.progStar.use();
    gl.bindVertexArray(this.starVAO);
    const u = this.progStar.uniforms;

    u3f(gl, u.uCamRight, camera.right[0], camera.right[1], camera.right[2]);
    u3f(gl, u.uCamUp, camera.up[0], camera.up[1], camera.up[2]);
    u3f(gl, u.uCamFwd, camera.forward[0], camera.forward[1], camera.forward[2]);
    u1f(gl, u.uTanHalfFov, Math.tan(camera.effectiveFov / 2));
    u1f(gl, u.uAspect, fullW / fullH);
    u2f(gl, u.uJitter, jx, jy);
    u2f(gl, u.uResolution, fullW, fullH);
    u2f(gl, u.uTileOrigin, tile ? tile.x : 0, tile ? tile.y : 0);
    u2f(gl, u.uTileSize, tile ? tile.w : this.renderWidth, tile ? tile.h : this.renderHeight);
    u1f(gl, u.uGain, this._skyGain());
    // Sprites are sized in device pixels, so an export at four times the
    // resolution has to draw them four times as wide or the sky thins out.
    const sizeScale = Math.max(1, fullH / 900);
    u1f(gl, u.uSizeScale, sizeScale);
    // The ceiling scales with it, or an 8K export would clamp its brightest
    // stars back down to screen size and lose the magnitude spread entirely.
    // gl_PointSize has an implementation-defined maximum — 64 is the floor the
    // specification guarantees, so stay under it.
    u1f(gl, u.uSizeMax, Math.min(16 * sizeScale, 60));
    // Tight enough that the visible core is well inside the sprite. A slack
    // falloff makes every star a soft disc the full width of its quad, which
    // is the look this pass replaced.
    u1f(gl, u.uFalloff, 6.5);

    gl.drawArrays(gl.POINTS, 0, this.starCount);

    gl.bindVertexArray(null);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.BLEND);
  }

  /**
   * @param {import('../astro/ephemeris.js').SceneState} scene
   * @param {import('./camera.js').Camera} camera
   * @param {{x:number,y:number,w:number,h:number,fullWidth:number,fullHeight:number}} [tile]
   * @private
   */
  _drawOrbits(scene, camera, tile) {
    const gl = this.gl;
    const fullW = tile ? tile.fullWidth : this.renderWidth;
    const fullH = tile ? tile.fullHeight : this.renderHeight;
    const aspect = fullW / fullH;
    let vp = camera.viewProjection(aspect);
    if (tile) {
      // Scale and offset clip space so the tile covers the same region of the
      // full frame that the ray tracer just rendered.
      const sx = fullW / tile.w;
      const sy = fullH / tile.h;
      const tx = -((2 * tile.x + tile.w) / fullW - 1) * sx;
      const ty = -((2 * tile.y + tile.h) / fullH - 1) * sy;
      const m = new Float32Array(vp);
      for (let i = 0; i < 4; i++) {
        m[i * 4 + 0] = vp[i * 4 + 0] * sx + vp[i * 4 + 3] * tx;
        m[i * 4 + 1] = vp[i * 4 + 1] * sy + vp[i * 4 + 3] * ty;
      }
      vp = m;
    }

    this.sceneRT.bind();
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    this.progLine.use();
    gl.bindVertexArray(this.lineVAO);
    uMat4(gl, this.progLine.uniforms.uViewProj, vp);

    const camPos = camera.position;
    const focusBody = scene.byId.get(camera.focus);

    for (const orbit of scene.orbits) {
      // An orbit is worth drawing when its parent is nearby: Jupiter's moon
      // orbits are noise from 5 au away and essential from 5 million km.
      const parent = scene.byId.get(orbit.parent);
      if (!parent) continue;
      const parentDist = Math.hypot(
        parent.pos[0] - camPos[0], parent.pos[1] - camPos[1], parent.pos[2] - camPos[2]
      );
      const child = scene.byId.get(orbit.id);
      const orbitRadius = child
        ? Math.hypot(child.pos[0] - parent.pos[0], child.pos[1] - parent.pos[1], child.pos[2] - parent.pos[2])
        : 0;
      // An orbit is only informative in a window of apparent sizes. Below ~14
      // pixels across it is visual noise; beyond about three screen-heights it
      // is an unreadable arc sweeping through the frame — which is exactly what
      // Mercury's orbit looks like when you are standing next to Saturn.
      const angular = orbitRadius / Math.max(parentDist, 1);
      const halfFov = Math.tan(camera.effectiveFov / 2);
      const pixelAngle = (2 * halfFov) / fullH;
      if (angular < 14 * pixelAngle) continue;
      if (angular > halfFov * 6) continue;

      const n = orbit.points.length / 3;
      const buf = this._lineBuffer(n);
      for (let i = 0; i < n; i++) {
        buf[i * 4] = (orbit.points[i * 3] + (orbit.parent === 'sun' ? 0 : parent.pos[0]) - camPos[0]) / MM;
        buf[i * 4 + 1] = (orbit.points[i * 3 + 1] + (orbit.parent === 'sun' ? 0 : parent.pos[1]) - camPos[1]) / MM;
        buf[i * 4 + 2] = (orbit.points[i * 3 + 2] + (orbit.parent === 'sun' ? 0 : parent.pos[2]) - camPos[2]) / MM;
        buf[i * 4 + 3] = i / n;
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, this.lineVBO);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, buf, 0, n * 4);

      const isFocus = orbit.id === camera.focus ||
        (focusBody && focusBody.parent === orbit.id);
      const isMoonOrbit = orbit.parent !== 'sun';
      const op = orbit.smallBody ? 0.09 : isFocus ? 0.26 : isMoonOrbit ? 0.07 : 0.11;
      // Orbit lines are drawn into the HDR buffer, so their brightness must be
      // scaled by the same exposure the rest of the frame will receive —
      // otherwise they vanish at Neptune and blow out at Mercury.
      const gain = op / Math.max(this._exposure(), 1e-4);
      u3f(gl, this.progLine.uniforms.uColor, orbit.color[0], orbit.color[1], orbit.color[2]);
      u1f(gl, this.progLine.uniforms.uOpacity, gain);
      u1f(gl, this.progLine.uniforms.uHead, 0);
      u1f(gl, this.progLine.uniforms.uComet, isFocus ? 0 : 1);
      u1f(gl, this.progLine.uniforms.uFadeNear, 0);
      u1f(gl, this.progLine.uniforms.uFadeFar, 1e12);
      gl.drawArrays(gl.LINE_LOOP, 0, n);
    }

    gl.disable(gl.BLEND);
    gl.bindVertexArray(null);
  }

  /** @private */
  _lineBuffer(points) {
    if (!this._lineArray || this._lineArray.length < points * 4) {
      this._lineArray = new Float32Array(Math.max(points * 4, 4096));
      const gl = this.gl;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.lineVBO);
      gl.bufferData(gl.ARRAY_BUFFER, this._lineArray.byteLength, gl.DYNAMIC_DRAW);
      this._lineCapacity = this._lineArray.length;
    }
    return this._lineArray;
  }

  /** Release every GPU resource. */
  dispose() {
    const gl = this.gl;
    this.sceneRT?.dispose();
    this.accum?.dispose();
    this.bloomChain?.forEach((rt) => rt.dispose());
    gl.deleteTexture(this.bodyTex);
    gl.deleteTexture(this.ringLUT);
    gl.deleteTexture(this.interiorLUT);
    gl.deleteTexture(this.surfaces);
    gl.deleteTexture(this.skyTex);
    gl.deleteBuffer(this.lineVBO);
    gl.deleteVertexArray(this.lineVAO);
    gl.deleteBuffer(this.starDirVBO);
    gl.deleteBuffer(this.starTintVBO);
    gl.deleteVertexArray(this.starVAO);
    gl.deleteVertexArray(this.emptyVAO);
    this.progRT.dispose();
    this.progAccum.dispose();
    this.progDown.dispose();
    this.progUp.dispose();
    this.progComposite.dispose();
    this.progLine.dispose();
    this.progStar.dispose();
  }
}

/**
 * GLSL's smoothstep, for the handful of places the CPU side needs the same
 * curve the shaders use.
 * @param {number} a @param {number} b @param {number} x
 * @returns {number} value in [0, 1]
 */
function smoothstep(a, b, x) {
  const t = Math.min(Math.max((x - a) / (b - a || 1e-9), 0), 1);
  return t * t * (3 - 2 * t);
}

/**
 * The radical-inverse (van der Corput) sequence in an arbitrary base — the
 * building block of the Halton sequence used for sub-pixel jitter.
 * @param {number} index 1-based.
 * @param {number} base Prime.
 * @returns {number} value in [0, 1)
 */
export function halton(index, base) {
  let f = 1;
  let r = 0;
  let i = index;
  while (i > 0) {
    f /= base;
    r += f * (i % base);
    i = Math.floor(i / base);
  }
  return r;
}
