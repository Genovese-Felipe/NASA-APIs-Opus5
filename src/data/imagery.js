/**
 * Real NASA surface imagery, streamed into the ray tracer.
 *
 * Both GIBS (Earth) and Trek (Moon, Mars, Mercury, Vesta) serve WMTS tile
 * pyramids in EPSG:4326 with the same grid convention: level 0 is two columns
 * by one row covering the whole globe, and each level doubles. That means a
 * complete equirectangular texture is exactly the level whose width matches the
 * size we want — no reprojection, no resampling, no seams.
 *
 * This module fetches those tiles, stitches them on an OffscreenCanvas, and
 * hands the result to `Renderer.setSurface()`. Earth's layer is keyed by date,
 * so the globe in the 3D view shows the actual cloud cover of the day you have
 * scrubbed to.
 *
 * @module data/imagery
 */

import { fetchImageBitmap } from './client.js';

/** Tile pyramid definitions, verified against live endpoints. */
export const LAYERS = Object.freeze({
  earth: {
    label: 'Blue Marble (shaded relief and bathymetry)',
    attribution: 'NASA GIBS / Blue Marble Next Generation',
    tileSize: 512,
    ext: 'jpeg',
    dated: false,
    url: (z, row, col) =>
      `https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/BlueMarble_ShadedRelief_Bathymetry/default/500m/${z}/${row}/${col}.jpeg`,
  },
  'earth-today': {
    label: 'Earth today (VIIRS true colour)',
    attribution: 'NASA GIBS / VIIRS SNPP Corrected Reflectance',
    tileSize: 512,
    ext: 'jpg',
    dated: true,
    // 250m is the highest-resolution matrix set VIIRS true colour publishes.
    url: (z, row, col, date) =>
      `https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/VIIRS_SNPP_CorrectedReflectance_TrueColor/default/${date}/250m/${z}/${row}/${col}.jpg`,
  },
  'earth-night': {
    label: 'Black Marble (night lights)',
    attribution: 'NASA GIBS / VIIRS Black Marble',
    tileSize: 512,
    ext: 'png',
    dated: true,
    url: (z, row, col, date) =>
      `https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/VIIRS_Black_Marble/default/${date}/500m/${z}/${row}/${col}.png`,
  },
  moon: {
    label: 'Lunar Reconnaissance Orbiter WAC global mosaic',
    attribution: 'NASA / GSFC / Arizona State University — LRO WAC',
    tileSize: 256,
    ext: 'jpg',
    dated: false,
    url: (z, row, col) =>
      `https://trek.nasa.gov/tiles/Moon/EQ/LRO_WAC_Mosaic_Global_303ppd_v02/1.0.0/default/default028mm/${z}/${row}/${col}.jpg`,
  },
  mars: {
    label: 'Viking MDIM 2.1 colour mosaic',
    attribution: 'NASA / JPL / USGS — Viking MDIM21',
    tileSize: 256,
    ext: 'jpg',
    dated: false,
    url: (z, row, col) =>
      `https://trek.nasa.gov/tiles/Mars/EQ/Mars_Viking_MDIM21_ClrMosaic_global_232m/1.0.0/default/default028mm/${z}/${row}/${col}.jpg`,
  },
  'mars-topo': {
    label: 'MOLA colour-shaded relief',
    attribution: 'NASA / JPL / GSFC — Mars Global Surveyor MOLA',
    tileSize: 256,
    ext: 'jpg',
    dated: false,
    url: (z, row, col) =>
      `https://trek.nasa.gov/tiles/Mars/EQ/Mars_MGS_MOLA_ClrShade_merge_global_463m/1.0.0/default/default028mm/${z}/${row}/${col}.jpg`,
  },
  mercury: {
    label: 'MESSENGER MDIS global basemap',
    attribution: 'NASA / JHUAPL / Carnegie — MESSENGER MDIS',
    tileSize: 256,
    ext: 'jpg',
    dated: false,
    url: (z, row, col) =>
      `https://trek.nasa.gov/tiles/Mercury/EQ/Mercury_MESSENGER_MDIS_Basemap_BDR_Mosaic_Global_166m/1.0.0/default/default028mm/${z}/${row}/${col}.jpg`,
  },
});

/**
 * The pyramid level whose full width is `width` pixels.
 *
 * Level 0 spans the globe in two tiles, so width(z) = 2^(z+1) * tileSize.
 * @param {number} width Desired texture width.
 * @param {number} tileSize
 * @returns {number} Zoom level (never negative).
 */
export function levelForWidth(width, tileSize) {
  return Math.max(0, Math.round(Math.log2(width / tileSize) - 1));
}

/**
 * Fetch and stitch an equirectangular texture.
 *
 * Tiles are fetched with bounded concurrency: a browser will happily open a
 * hundred connections and then serialise them anyway, while a bounded pool
 * keeps the main thread responsive and lets a slow tile fail without stalling
 * the rest. Missing tiles (Trek returns 404 where a mosaic has no coverage)
 * simply leave that patch at the fallback colour.
 *
 * @param {string} layerId Key into {@link LAYERS}.
 * @param {object} [opts]
 * @param {number} [opts.width=2048] Target width; height is half.
 * @param {string} [opts.date] YYYY-MM-DD for dated layers.
 * @param {number} [opts.concurrency=6]
 * @param {(done:number,total:number)=>void} [opts.onProgress]
 * @param {AbortSignal} [opts.signal]
 * @returns {Promise<{canvas:OffscreenCanvas|HTMLCanvasElement, width:number,
 *   height:number, missing:number, attribution:string}>}
 */
export async function buildEquirectTexture(layerId, opts = {}) {
  const layer = LAYERS[layerId];
  if (!layer) throw new Error(`Unknown imagery layer: ${layerId}`);

  const width = opts.width ?? 2048;
  const height = width / 2;
  const z = levelForWidth(width, layer.tileSize);
  const cols = Math.pow(2, z + 1);
  const rows = Math.pow(2, z);
  const date = opts.date || defaultDate(layerId);

  const canvas = makeCanvas(width, height);
  const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: false });
  // A neutral fill so any gap in coverage reads as "no data", not as a hole.
  ctx.fillStyle = '#0a0a0c';
  ctx.fillRect(0, 0, width, height);

  const jobs = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) jobs.push({ r, c });
  }

  let done = 0;
  let missing = 0;
  const drawW = width / cols;
  const drawH = height / rows;

  await pool(jobs, opts.concurrency ?? 6, async ({ r, c }) => {
    if (opts.signal?.aborted) return;
    try {
      const bitmap = await fetchImageBitmap(layer.url(z, r, c, date), { timeout: 20_000 });
      ctx.drawImage(bitmap, c * drawW, r * drawH, drawW, drawH);
      bitmap.close?.();
    } catch {
      missing++;
    } finally {
      done++;
      opts.onProgress?.(done, jobs.length);
    }
  });

  return { canvas, width, height, missing, attribution: layer.attribution };
}

/**
 * The most recent date a dated layer is likely to have.
 *
 * GIBS publishes near-real-time products with a lag of a few hours, so asking
 * for "today" often returns 404 tiles. Two days back is reliably populated.
 * @param {string} layerId
 * @returns {string} YYYY-MM-DD
 * @private
 */
function defaultDate(layerId) {
  if (!LAYERS[layerId]?.dated) return '';
  const d = new Date(Date.now() - 2 * 86400_000);
  return d.toISOString().slice(0, 10);
}

/** @private */
function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/**
 * Run an async worker over items with bounded concurrency.
 * @template T
 * @param {T[]} items
 * @param {number} limit
 * @param {(item:T)=>Promise<void>} worker
 * @private
 */
async function pool(items, limit, worker) {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor++];
      await worker(item);
    }
  });
  await Promise.all(runners);
}

/**
 * Which imagery layer to use for each body in the 3D scene.
 * Keys match `BodyRecord.texture` / `MoonRecord.texture`.
 * @type {Readonly<Record<string, string>>}
 */
export const BODY_LAYERS = Object.freeze({
  earth: 'earth',
  moon: 'moon',
  mars: 'mars',
  mercury: 'mercury',
});

/**
 * Load every surface texture the renderer can use, at the resolution the
 * current quality tier asks for.
 *
 * Failures are non-fatal by design: a body with no imagery falls back to its
 * procedural surface, which is why the app still looks finished when offline or
 * when a mosaic server is having a bad day.
 *
 * @param {import('../render/raytracer.js').Renderer} renderer
 * @param {object} [opts]
 * @param {number} [opts.width] Overrides the quality tier's texture size.
 * @param {(key:string, state:'start'|'done'|'failed', info?:object)=>void} [opts.onState]
 * @param {AbortSignal} [opts.signal]
 * @returns {Promise<{loaded:string[], failed:string[]}>}
 */
export async function loadSurfaceTextures(renderer, opts = {}) {
  const width = opts.width ?? Math.min(renderer.quality.surfaceTextureSize, renderer.caps.maxTexture);
  const loaded = [];
  const failed = [];

  for (const [bodyKey, layerId] of Object.entries(BODY_LAYERS)) {
    if (opts.signal?.aborted) break;
    opts.onState?.(bodyKey, 'start');
    try {
      const tex = await buildEquirectTexture(layerId, {
        width,
        signal: opts.signal,
        onProgress: (done, total) => opts.onState?.(bodyKey, 'start', { done, total }),
      });
      // A mosaic that is mostly holes is worse than the procedural fallback.
      const tileCount = Math.pow(2, levelForWidth(width, LAYERS[layerId].tileSize) + 1) *
        Math.pow(2, levelForWidth(width, LAYERS[layerId].tileSize));
      if (tex.missing > tileCount * 0.4) throw new Error(`${tex.missing} tiles missing`);
      renderer.setSurface(bodyKey, tex.canvas);
      loaded.push(bodyKey);
      opts.onState?.(bodyKey, 'done', { attribution: tex.attribution, missing: tex.missing });
    } catch (err) {
      failed.push(bodyKey);
      opts.onState?.(bodyKey, 'failed', { error: String(err?.message || err) });
    }
  }

  return { loaded, failed };
}
