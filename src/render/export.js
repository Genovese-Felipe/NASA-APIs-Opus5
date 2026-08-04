/**
 * High-resolution still export.
 *
 * The whole point is to produce an image far larger than the window, at a
 * quality far beyond what runs at 60 fps. Two things make that possible:
 *
 *  1. **Tiling.** The image is rendered in pieces no larger than the GPU is
 *     comfortable with, with each tile's rays generated in the coordinate space
 *     of the *full* image, so the pieces join with no seam. A 7680x4320 export
 *     never needs a 7680x4320 framebuffer.
 *
 *  2. **Deep accumulation.** Each tile is rendered many times with a Halton
 *     jitter and averaged, so the export can use hundreds of samples per pixel
 *     where the interactive view uses a few dozen. This is real supersampling,
 *     not upscaling.
 *
 * PNG is encoded directly from the pixel bytes (see `render/png.js`), which is
 * the only way to get 8K out of a browser at all. JPEG and WebP go through a
 * canvas and are therefore subject to the browser's canvas area limit; the UI
 * checks and says so rather than failing mysteriously.
 *
 * @module render/export
 */

import { RenderTarget } from './gl.js';
import { encodePNG } from './png.js';

/**
 * Standard export sizes.
 *
 * "8K" here means 7680x4320 (UHD-2), the size consumer displays and video
 * pipelines mean by it.
 * @type {ReadonlyArray<{id:string,label:string,width:number,height:number}>}
 */
export const EXPORT_SIZES = Object.freeze([
  { id: 'window', label: 'Window', width: 0, height: 0 },
  { id: 'fhd', label: '1080p — 1920 x 1080', width: 1920, height: 1080 },
  { id: 'qhd', label: '1440p — 2560 x 1440', width: 2560, height: 1440 },
  { id: '4k', label: '4K UHD — 3840 x 2160', width: 3840, height: 2160 },
  { id: '5k', label: '5K — 5120 x 2880', width: 5120, height: 2880 },
  { id: '8k', label: '8K UHD — 7680 x 4320', width: 7680, height: 4320 },
  { id: 'square4k', label: 'Square 4K — 4096 x 4096', width: 4096, height: 4096 },
  { id: 'print', label: 'Print A3 at 300 dpi — 4961 x 3508', width: 4961, height: 3508 },
  { id: 'phone', label: 'Phone wallpaper — 1290 x 2796', width: 1290, height: 2796 },
]);

/** Output formats, with an honest note about where each one works. */
export const EXPORT_FORMATS = Object.freeze([
  { id: 'png', label: 'PNG', mime: 'image/png', lossless: true, anySize: true },
  { id: 'jpeg', label: 'JPEG', mime: 'image/jpeg', lossless: false, anySize: false },
  { id: 'webp', label: 'WebP', mime: 'image/webp', lossless: false, anySize: false },
]);

/**
 * Largest canvas area the browser will actually back with pixels.
 *
 * There is no API for this, so it is measured: allocate, draw one pixel, read
 * it back. A canvas over the limit silently produces a blank bitmap rather than
 * throwing, which is precisely the failure mode this avoids shipping to users.
 *
 * @returns {number} Area in pixels.
 */
export function maxCanvasArea() {
  if (maxCanvasArea._cached) return maxCanvasArea._cached;
  const candidates = [
    16384 * 16384, 16384 * 8192, 8192 * 8192, 8192 * 4096, 4096 * 4096, 2048 * 2048,
  ];
  for (const area of candidates) {
    const side = Math.floor(Math.sqrt(area));
    try {
      const c = document.createElement('canvas');
      c.width = side;
      c.height = side;
      const ctx = c.getContext('2d');
      if (!ctx) continue;
      ctx.fillStyle = '#ff8000';
      ctx.fillRect(side - 1, side - 1, 1, 1);
      const d = ctx.getImageData(side - 1, side - 1, 1, 1).data;
      c.width = c.height = 1; // release immediately
      if (d[0] === 255 && d[1] === 128) {
        maxCanvasArea._cached = area;
        return area;
      }
    } catch {
      /* try the next size down */
    }
  }
  maxCanvasArea._cached = 2048 * 2048;
  return maxCanvasArea._cached;
}

/**
 * @typedef {object} ExportOptions
 * @property {number} width
 * @property {number} height
 * @property {string} [format='png']
 * @property {number} [quality=0.92] JPEG/WebP quality.
 * @property {number} [samples=192] Accumulated samples per pixel.
 * @property {number} [tileSize=1024] Maximum tile edge.
 * @property {number} [padding=96] Extra pixels rendered around each tile and
 *   then discarded, so that neighbourhood effects (bloom) see the surrounding
 *   image rather than a hard edge.
 * @property {boolean} [dropAlpha=true] Write RGB rather than RGBA for PNG.
 * @property {Record<string,string>} [metadata] PNG tEXt chunks.
 * @property {(progress:{phase:string, fraction:number, tile:number, tiles:number})=>void} [onProgress]
 * @property {AbortSignal} [signal]
 */

/**
 * Render and encode a high-resolution still.
 *
 * @param {import('./raytracer.js').Renderer} renderer
 * @param {import('../astro/ephemeris.js').SceneState} scene
 * @param {import('./camera.js').Camera} camera
 * @param {ExportOptions} options
 * @returns {Promise<{blob:Blob, width:number, height:number, filename:string,
 *   samples:number, tiles:number, durationMs:number}>}
 */
export async function exportStill(renderer, scene, camera, options) {
  const started = performance.now();
  const gl = renderer.gl;
  const width = Math.max(16, Math.round(options.width));
  const height = Math.max(16, Math.round(options.height));
  const format = options.format || 'png';
  const samples = Math.max(1, Math.round(options.samples ?? 192));
  const maxTile = Math.min(
    options.tileSize ?? 1024,
    renderer.caps.maxTexture,
    renderer.caps.maxRenderbuffer
  );

  const cols = Math.ceil(width / maxTile);
  const rows = Math.ceil(height / maxTile);
  const tiles = cols * rows;

  // Bloom gathers light from a wide neighbourhood. Rendered tile by tile with
  // no overlap, each tile's bloom pyramid sees a hard black edge where its
  // neighbour should be, and the result is a visible grid in the finished
  // image. Rendering a margin and throwing it away costs a few per cent and
  // removes the artefact. A single tile needs no margin at all.
  const padding = tiles > 1 ? Math.max(0, Math.round(options.padding ?? 96)) : 0;

  // 4 bytes per pixel. An 8K RGBA buffer is 132 MB — large, but a plain typed
  // array, and far cheaper than a canvas of the same size would be.
  let pixels;
  try {
    pixels = new Uint8Array(width * height * 4);
  } catch (err) {
    throw new Error(
      `Not enough memory for a ${width}x${height} image (${Math.round(
        (width * height * 4) / 1048576
      )} MB). Try a smaller size.`
    );
  }

  // Save everything we are about to disturb.
  const saved = {
    renderWidth: renderer.renderWidth,
    renderHeight: renderer.renderHeight,
    outputWidth: renderer.outputWidth,
    outputHeight: renderer.outputHeight,
    scalerEnabled: renderer.scaler.enabled,
    autoExposure: renderer.settings.autoExposure,
  };
  // Exposure must be frozen: half an export at one exposure and half at another
  // would show a seam down the middle.
  renderer.snapExposure(renderer.targetExposure(scene, camera));
  renderer.settings.autoExposure = false;
  renderer.scaler.enabled = false;

  /** @type {RenderTarget|null} */
  let ldr = null;

  try {
    for (let ty = 0; ty < rows; ty++) {
      for (let tx = 0; tx < cols; tx++) {
        if (options.signal?.aborted) throw new DOMException('Export cancelled', 'AbortError');
        const index = ty * cols + tx;
        const x = tx * maxTile;
        const y = ty * maxTile;
        const w = Math.min(maxTile, width - x);
        const h = Math.min(maxTile, height - y);

        // Grow the rendered region by the margin, clamped to the image, and
        // remember how much was added on each side so it can be cropped off.
        const padLeft = Math.min(padding, x);
        const padTop = Math.min(padding, y);
        const padRight = Math.min(padding, width - (x + w));
        const padBottom = Math.min(padding, height - (y + h));
        const rx = x - padLeft;
        const ry = y - padTop;
        const rw = w + padLeft + padRight;
        const rh = h + padTop + padBottom;

        renderer._resizeForExport(rw, rh);
        if (!ldr || ldr.width !== rw || ldr.height !== rh) {
          ldr?.dispose();
          ldr = new RenderTarget(gl, rw, rh, {
            internalFormat: gl.RGBA8,
            type: gl.UNSIGNED_BYTE,
            linear: false,
          });
        }

        const tile = { x: rx, y: ry, w: rw, h: rh, fullWidth: width, fullHeight: height };
        renderer.resetAccumulation();

        for (let s = 0; s < samples; s++) {
          if (options.signal?.aborted) throw new DOMException('Export cancelled', 'AbortError');
          renderer.render(scene, camera, {
            dt: 0,
            tile,
            target: ldr.framebuffer,
            viewportWidth: rw,
            viewportHeight: rh,
            forceAccumulate: true,
          });
          if ((s & 15) === 0) {
            options.onProgress?.({
              phase: 'render',
              fraction: (index + s / samples) / tiles,
              tile: index + 1,
              tiles,
            });
            // Yield so the page stays responsive and the cancel button works.
            await nextFrame();
          }
        }

        // Read the padded tile, then copy only its interior into the image.
        // WebGL reads bottom-up, so rows are flipped on the way in.
        const tileBuf = new Uint8Array(rw * rh * 4);
        gl.bindFramebuffer(gl.FRAMEBUFFER, ldr.framebuffer);
        gl.readPixels(0, 0, rw, rh, gl.RGBA, gl.UNSIGNED_BYTE, tileBuf);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);

        for (let row = 0; row < h; row++) {
          // Row `row` of the wanted region is `padTop + row` from the top of
          // the padded tile, which is `rh - 1 - (padTop + row)` from its bottom.
          const srcRow = rh - 1 - (padTop + row);
          const srcOff = (srcRow * rw + padLeft) * 4;
          const dstOff = ((y + row) * width + x) * 4;
          pixels.set(tileBuf.subarray(srcOff, srcOff + w * 4), dstOff);
        }

        options.onProgress?.({
          phase: 'render',
          fraction: (index + 1) / tiles,
          tile: index + 1,
          tiles,
        });
      }
    }
  } finally {
    ldr?.dispose();
    renderer.settings.autoExposure = saved.autoExposure;
    renderer.scaler.enabled = saved.scalerEnabled;
    renderer._restoreAfterExport(saved);
  }

  options.onProgress?.({ phase: 'encode', fraction: 0, tile: tiles, tiles });

  const blob = await encodeImage(pixels, width, height, format, {
    quality: options.quality ?? 0.92,
    dropAlpha: options.dropAlpha !== false,
    metadata: options.metadata,
    onProgress: (f) => options.onProgress?.({ phase: 'encode', fraction: f, tile: tiles, tiles }),
  });

  return {
    blob,
    width,
    height,
    samples,
    tiles,
    filename: makeFilename(camera, scene, width, height, format),
    durationMs: performance.now() - started,
  };
}

/**
 * Encode raw RGBA into the requested format.
 * @private
 */
async function encodeImage(pixels, width, height, format, opts) {
  if (format === 'png') {
    return encodePNG(pixels, width, height, {
      channels: 4,
      dropAlpha: opts.dropAlpha,
      text: {
        Software: 'ORRERY — NASA Solar System Explorer',
        Source: 'NASA / JPL open data',
        ...opts.metadata,
      },
      onProgress: opts.onProgress,
    });
  }

  // JPEG and WebP need a canvas, which caps the size.
  const area = width * height;
  if (area > maxCanvasArea()) {
    throw new Error(
      `${format.toUpperCase()} export needs a ${width}x${height} canvas, which exceeds ` +
        `this browser's limit of about ${Math.round(maxCanvasArea() / 1e6)} megapixels. ` +
        `PNG has no such limit.`
    );
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not create a 2D context for encoding.');
  const image = new ImageData(new Uint8ClampedArray(pixels.buffer, 0, width * height * 4), width, height);
  ctx.putImageData(image, 0, 0);
  opts.onProgress?.(0.5);

  const mime = format === 'webp' ? 'image/webp' : 'image/jpeg';
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Encoding failed'))), mime, opts.quality);
  });
  canvas.width = canvas.height = 1;
  opts.onProgress?.(1);
  return blob;
}

/** @private */
function makeFilename(camera, scene, width, height, format) {
  const date = new Date(
    (scene.jd - 2440587.5) * 86400000
  ).toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const ext = format === 'jpeg' ? 'jpg' : format;
  return `orrery-${camera.focus}-${date}-${width}x${height}.${ext}`;
}

/** @private */
function nextFrame() {
  return new Promise((r) => requestAnimationFrame(() => r()));
}

/**
 * Trigger a browser download.
 * @param {Blob} blob
 * @param {string} filename
 */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoking immediately can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * Format a byte count for display.
 * @param {number} bytes
 * @returns {string}
 */
export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1073741824).toFixed(2)} GB`;
}

/**
 * Estimate how long an export will take, from the renderer's measured speed.
 * @param {import('./raytracer.js').Renderer} renderer
 * @param {number} width
 * @param {number} height
 * @param {number} samples
 * @returns {number} Milliseconds.
 */
export function estimateExportTime(renderer, width, height, samples) {
  const perPixelPerSample = renderer._msPerMegapixelSample ?? 4.5;
  return (width * height * samples * perPixelPerSample) / 1e6;
}
