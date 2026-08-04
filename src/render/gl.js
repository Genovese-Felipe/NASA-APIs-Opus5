/**
 * A small, explicit WebGL2 layer.
 *
 * Deliberately not a framework: it exposes exactly the primitives the ray
 * tracer needs (programs, float render targets, data textures, a fullscreen
 * triangle) with real error messages, and nothing else. Everything else in
 * `src/render` is written directly against the WebGL2 API.
 *
 * @module render/gl
 */

/**
 * Create a WebGL2 context configured for HDR offscreen rendering.
 *
 * `preserveDrawingBuffer` is on because `canvas.toBlob()` and screenshot export
 * must be able to read the buffer after the frame has been composited. The cost
 * is small for our workload and the alternative (re-rendering inside the
 * toBlob callback) is fragile across browsers.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {object} [opts]
 * @returns {WebGL2RenderingContext}
 * @throws {Error} when WebGL2 is unavailable.
 */
export function createContext(canvas, opts = {}) {
  const attrs = {
    alpha: false,
    antialias: false, // we do our own temporal AA
    depth: false,
    stencil: false,
    desynchronized: false,
    powerPreference: opts.powerPreference || 'high-performance',
    preserveDrawingBuffer: true,
    premultipliedAlpha: false,
    failIfMajorPerformanceCaveat: false,
  };
  const gl = canvas.getContext('webgl2', attrs);
  if (!gl) {
    throw new Error(
      'WebGL2 is not available in this browser. ' +
        'The renderer requires WebGL2 (available in all major browsers since 2021).'
    );
  }
  return gl;
}

/**
 * Query the capabilities that change what the renderer is allowed to do.
 * @param {WebGL2RenderingContext} gl
 * @returns {{floatRender:boolean, floatLinear:boolean, halfFloatLinear:boolean,
 *   maxTexture:number, maxRenderbuffer:number, maxTextureUnits:number,
 *   maxArrayLayers:number, renderer:string, vendor:string, anisotropy:number}}
 */
export function getCapabilities(gl) {
  const floatRender = !!gl.getExtension('EXT_color_buffer_float');
  const floatLinear = !!gl.getExtension('OES_texture_float_linear');
  const halfFloatLinear = floatLinear || !!gl.getExtension('OES_texture_half_float_linear');
  const aniso = gl.getExtension('EXT_texture_filter_anisotropic');
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  return {
    floatRender,
    floatLinear,
    halfFloatLinear,
    maxTexture: gl.getParameter(gl.MAX_TEXTURE_SIZE),
    maxRenderbuffer: gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),
    maxTextureUnits: gl.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS),
    maxArrayLayers: gl.getParameter(gl.MAX_ARRAY_TEXTURE_LAYERS),
    renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
    vendor: dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
    anisotropy: aniso ? gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT) : 1,
  };
}

/**
 * Compile a shader, throwing an error annotated with the offending source line.
 * @param {WebGL2RenderingContext} gl
 * @param {number} type gl.VERTEX_SHADER or gl.FRAGMENT_SHADER
 * @param {string} source
 * @param {string} label Used in error messages.
 * @returns {WebGLShader}
 */
export function compileShader(gl, type, source, label = 'shader') {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) || '';
    gl.deleteShader(shader);
    throw new Error(`${label} failed to compile:\n${log}\n${annotate(source, log)}`);
  }
  return shader;
}

/**
 * Extract the reported line numbers from a driver log and quote them.
 * @private
 */
function annotate(source, log) {
  const lines = source.split('\n');
  const nums = new Set();
  for (const m of log.matchAll(/:(\d+):/g)) nums.add(parseInt(m[1], 10));
  if (!nums.size) return '';
  const out = [];
  for (const n of nums) {
    for (let i = Math.max(1, n - 2); i <= Math.min(lines.length, n + 2); i++) {
      out.push(`${String(i).padStart(5)} ${i === n ? '>' : ' '} ${lines[i - 1]}`);
    }
    out.push('  ---');
  }
  return out.join('\n');
}

/**
 * Link a program from vertex and fragment sources and cache its uniform
 * locations.
 * @param {WebGL2RenderingContext} gl
 * @param {string} vs
 * @param {string} fs
 * @param {string} [label]
 * @returns {{program:WebGLProgram, uniforms:Record<string,WebGLUniformLocation>,
 *   use:()=>void, dispose:()=>void}}
 */
export function createProgram(gl, vs, fs, label = 'program') {
  const v = compileShader(gl, gl.VERTEX_SHADER, vs, `${label} (vertex)`);
  const f = compileShader(gl, gl.FRAGMENT_SHADER, fs, `${label} (fragment)`);
  const program = gl.createProgram();
  gl.attachShader(program, v);
  gl.attachShader(program, f);
  gl.linkProgram(program);
  gl.deleteShader(v);
  gl.deleteShader(f);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`${label} failed to link:\n${log}`);
  }

  /** @type {Record<string, WebGLUniformLocation>} */
  const uniforms = Object.create(null);
  const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < count; i++) {
    const info = gl.getActiveUniform(program, i);
    if (!info) continue;
    const name = info.name.replace(/\[0\]$/, '');
    const loc = gl.getUniformLocation(program, info.name);
    if (loc) uniforms[name] = loc;
  }

  return {
    program,
    uniforms,
    use: () => gl.useProgram(program),
    dispose: () => gl.deleteProgram(program),
  };
}

/**
 * Vertex shader for every fullscreen pass. Draws one oversized triangle, which
 * avoids the diagonal seam a two-triangle quad produces in derivative-heavy
 * shaders and is marginally faster.
 */
export const FULLSCREEN_VS = `#version 300 es
precision highp float;
out vec2 vUV;
void main() {
  // gl_VertexID 0,1,2 -> (-1,-1), (3,-1), (-1,3)
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUV = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

/**
 * A colour render target with optional float precision.
 */
export class RenderTarget {
  /**
   * @param {WebGL2RenderingContext} gl
   * @param {number} width
   * @param {number} height
   * @param {object} [opts]
   * @param {number} [opts.internalFormat] Defaults to RGBA16F.
   * @param {number} [opts.type] Defaults to HALF_FLOAT.
   * @param {boolean} [opts.linear=true]
   */
  constructor(gl, width, height, opts = {}) {
    this.gl = gl;
    this.width = Math.max(1, Math.floor(width));
    this.height = Math.max(1, Math.floor(height));
    this.internalFormat = opts.internalFormat ?? gl.RGBA16F;
    this.type = opts.type ?? gl.HALF_FLOAT;
    this.linear = opts.linear !== false;

    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texStorage2D(gl.TEXTURE_2D, 1, this.internalFormat, this.width, this.height);
    const filter = this.linear ? gl.LINEAR : gl.NEAREST;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    this.framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.texture, 0);
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error(`RenderTarget incomplete (0x${status.toString(16)}) at ${width}x${height}`);
    }
  }

  /** Bind as the draw target and set the viewport. */
  bind() {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    gl.viewport(0, 0, this.width, this.height);
  }

  /**
   * Resize, reallocating storage only when the dimensions actually change.
   * @param {number} width
   * @param {number} height
   * @returns {boolean} true when a reallocation happened.
   */
  resize(width, height) {
    const w = Math.max(1, Math.floor(width));
    const h = Math.max(1, Math.floor(height));
    if (w === this.width && h === this.height) return false;
    this.dispose();
    const next = new RenderTarget(this.gl, w, h, {
      internalFormat: this.internalFormat,
      type: this.type,
      linear: this.linear,
    });
    this.width = next.width;
    this.height = next.height;
    this.texture = next.texture;
    this.framebuffer = next.framebuffer;
    return true;
  }

  dispose() {
    this.gl.deleteTexture(this.texture);
    this.gl.deleteFramebuffer(this.framebuffer);
  }
}

/**
 * A pair of render targets for accumulation / ping-pong passes.
 */
export class PingPong {
  /**
   * @param {WebGL2RenderingContext} gl
   * @param {number} width
   * @param {number} height
   * @param {object} [opts]
   */
  constructor(gl, width, height, opts = {}) {
    this.a = new RenderTarget(gl, width, height, opts);
    this.b = new RenderTarget(gl, width, height, opts);
  }

  /** @returns {RenderTarget} The target being written this frame. */
  get write() {
    return this.a;
  }

  /** @returns {RenderTarget} The target holding the previous frame. */
  get read() {
    return this.b;
  }

  /** Swap read and write. */
  swap() {
    const t = this.a;
    this.a = this.b;
    this.b = t;
  }

  /**
   * @param {number} width
   * @param {number} height
   * @returns {boolean}
   */
  resize(width, height) {
    const ra = this.a.resize(width, height);
    const rb = this.b.resize(width, height);
    return ra || rb;
  }

  dispose() {
    this.a.dispose();
    this.b.dispose();
  }
}

/**
 * Create a floating-point data texture used to feed per-body parameters into
 * the ray tracer. Nearest filtering: these are records, not images.
 *
 * @param {WebGL2RenderingContext} gl
 * @param {number} width Number of records.
 * @param {number} height Number of RGBA rows per record.
 * @returns {WebGLTexture}
 */
export function createDataTexture(gl, width, height) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA32F, width, height);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return tex;
}

/**
 * Upload a Float32Array into a data texture created by
 * {@link createDataTexture}.
 * @param {WebGL2RenderingContext} gl
 * @param {WebGLTexture} tex
 * @param {number} width
 * @param {number} height
 * @param {Float32Array} data Length must be width*height*4.
 */
export function uploadDataTexture(gl, tex, width, height, data) {
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, height, gl.RGBA, gl.FLOAT, data);
  gl.bindTexture(gl.TEXTURE_2D, null);
}

/**
 * Create an RGB(A) texture from float data (used for the HDR sky map).
 * @param {WebGL2RenderingContext} gl
 * @param {Float32Array} rgb Tightly packed RGB triples.
 * @param {number} width
 * @param {number} height
 * @returns {WebGLTexture}
 */
export function createHDRTexture(gl, rgb, width, height) {
  // Repack RGB -> RGBA half float. RGB32F is not colour-renderable everywhere
  // and RGBA16F is both smaller and universally filterable with the extension.
  const rgba = new Float32Array(width * height * 4);
  for (let i = 0, j = 0; i < width * height; i++, j += 4) {
    rgba[j] = rgb[i * 3];
    rgba[j + 1] = rgb[i * 3 + 1];
    rgba[j + 2] = rgb[i * 3 + 2];
    rgba[j + 3] = 1;
  }
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA16F, width, height);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, height, gl.RGBA, gl.FLOAT, rgba);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return tex;
}

/**
 * Allocate a 2D array texture for planetary surface imagery.
 * @param {WebGL2RenderingContext} gl
 * @param {number} size Width; height is size/2 (equirectangular).
 * @param {number} layers
 * @returns {WebGLTexture}
 */
export function createSurfaceArray(gl, size, layers) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex);
  const levels = Math.floor(Math.log2(size)) + 1;
  gl.texStorage3D(gl.TEXTURE_2D_ARRAY, levels, gl.RGBA8, size, size / 2, layers);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindTexture(gl.TEXTURE_2D_ARRAY, null);
  return tex;
}

/**
 * Bind a texture to a unit and point a sampler uniform at it.
 * @param {WebGL2RenderingContext} gl
 * @param {WebGLUniformLocation|undefined} location
 * @param {WebGLTexture} texture
 * @param {number} unit
 * @param {number} [target]
 */
export function bindTexture(gl, location, texture, unit, target) {
  if (!location) return;
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(target ?? gl.TEXTURE_2D, texture);
  gl.uniform1i(location, unit);
}

/** Draw the fullscreen triangle. @param {WebGL2RenderingContext} gl */
export function drawFullscreen(gl) {
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

// ---------------------------------------------------------------------------
// Guarded uniform setters.
//
// A GLSL compiler is free to eliminate any uniform that does not affect the
// output, in which case `getUniformLocation` returns null and the location is
// missing from our cache. That legitimately happens when a feature is toggled
// off at compile time, so it must not be an error — these helpers make the
// no-op explicit instead of relying on every driver being lenient about a
// null location.
// ---------------------------------------------------------------------------

/** @param {WebGL2RenderingContext} gl @param {WebGLUniformLocation|undefined} l @param {number} v */
export function u1f(gl, l, v) { if (l) gl.uniform1f(l, v); }
/** @param {WebGL2RenderingContext} gl @param {WebGLUniformLocation|undefined} l @param {number} v */
export function u1i(gl, l, v) { if (l) gl.uniform1i(l, v); }
/** @param {WebGL2RenderingContext} gl @param {WebGLUniformLocation|undefined} l */
export function u2f(gl, l, a, b) { if (l) gl.uniform2f(l, a, b); }
/** @param {WebGL2RenderingContext} gl @param {WebGLUniformLocation|undefined} l */
export function u3f(gl, l, a, b, c) { if (l) gl.uniform3f(l, a, b, c); }
/** @param {WebGL2RenderingContext} gl @param {WebGLUniformLocation|undefined} l @param {Float32Array} v */
export function u4fv(gl, l, v) { if (l) gl.uniform4fv(l, v); }
/** @param {WebGL2RenderingContext} gl @param {WebGLUniformLocation|undefined} l @param {Float32Array} v */
export function uMat4(gl, l, v) { if (l) gl.uniformMatrix4fv(l, false, v); }
