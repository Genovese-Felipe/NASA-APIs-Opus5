/**
 * Real NASA surface imagery, streamed into the ray tracer.
 *
 * Both GIBS (Earth) and Trek (Moon, Mars, Mercury) serve WMTS tile pyramids in
 * EPSG:4326, so a complete equirectangular texture is just the level whose
 * width matches the size we want — no reprojection, no resampling, no seams.
 *
 * They do NOT share a grid convention, and assuming they did is what made Earth
 * render as procedural noise. See {@link pyramidAt}, which is where the real
 * geometry of each service is written down and why.
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
    world0: 640,
    ext: 'jpeg',
    dated: false,
    url: (z, row, col) =>
      `https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/BlueMarble_ShadedRelief_Bathymetry/default/500m/${z}/${row}/${col}.jpeg`,
  },
  'earth-today': {
    label: 'Earth today (VIIRS true colour)',
    attribution: 'NASA GIBS / VIIRS SNPP Corrected Reflectance',
    tileSize: 512,
    world0: 640,
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
    world0: 640,
    ext: 'png',
    dated: true,
    url: (z, row, col, date) =>
      `https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/VIIRS_Black_Marble/default/${date}/500m/${z}/${row}/${col}.png`,
  },
  moon: {
    label: 'Lunar Reconnaissance Orbiter WAC global mosaic',
    attribution: 'NASA / GSFC / Arizona State University — LRO WAC',
    tileSize: 256,
    world0: 512,
    ext: 'jpg',
    dated: false,
    url: (z, row, col) =>
      `https://trek.nasa.gov/tiles/Moon/EQ/LRO_WAC_Mosaic_Global_303ppd_v02/1.0.0/default/default028mm/${z}/${row}/${col}.jpg`,
  },
  mars: {
    label: 'Viking MDIM 2.1 colour mosaic',
    attribution: 'NASA / JPL / USGS — Viking MDIM21',
    tileSize: 256,
    world0: 512,
    ext: 'jpg',
    dated: false,
    url: (z, row, col) =>
      `https://trek.nasa.gov/tiles/Mars/EQ/Mars_Viking_MDIM21_ClrMosaic_global_232m/1.0.0/default/default028mm/${z}/${row}/${col}.jpg`,
  },
  'mars-topo': {
    label: 'MOLA colour-shaded relief',
    attribution: 'NASA / JPL / GSFC — Mars Global Surveyor MOLA',
    tileSize: 256,
    world0: 512,
    ext: 'jpg',
    dated: false,
    url: (z, row, col) =>
      `https://trek.nasa.gov/tiles/Mars/EQ/Mars_MGS_MOLA_ClrShade_merge_global_463m/1.0.0/default/default028mm/${z}/${row}/${col}.jpg`,
  },
  mercury: {
    label: 'MESSENGER MDIS global basemap',
    attribution: 'NASA / JHUAPL / Carnegie — MESSENGER MDIS',
    tileSize: 256,
    world0: 512,
    ext: 'jpg',
    dated: false,
    url: (z, row, col) =>
      `https://trek.nasa.gov/tiles/Mercury/EQ/Mercury_MESSENGER_MDIS_Basemap_BDR_Mosaic_Global_166m/1.0.0/default/default028mm/${z}/${row}/${col}.jpg`,
  },
});

/**
 * The pyramid geometry of a layer at a given zoom level.
 *
 * THIS IS NOT A POWER-OF-TWO TILE GRID, AND ASSUMING IT WAS IS WHY EARTH USED
 * TO RENDER AS PROCEDURAL NOISE.
 *
 * The obvious model — level z is 2^(z+1) tiles across by 2^z down, the whole
 * grid being exactly the globe — is true of NASA Trek and false of NASA GIBS.
 * GIBS publishes, for every one of its matrix sets:
 *
 *     level    0     1     2     3      4       5       6       7
 *     matrix  2x1   3x2   5x3   10x5   20x10   40x20   80x40   160x80
 *
 * Asking it for the 4x2 grid the obvious model predicts at level 1 gets two
 * HTTP 400s, and — far worse than the missing tiles — spreads the six tiles
 * that do exist across four columns of longitude instead of three. The mosaic
 * came out both incomplete and geometrically wrong, the caller's
 * mostly-holes check rejected it, and the shader fell back to procedural noise.
 * Earth stopped looking like Earth, and nothing in the test suite noticed
 * because every test blocks the network by design.
 *
 * Both services do fit one model. The globe occupies `world0 * 2^z` pixels
 * across at level z, and the matrix is however many tiles it takes to *cover*
 * that — `ceil(world / tileSize)` — so the last column and row hang off the
 * edge and are partly empty. GIBS starts from a 640-pixel-wide world in
 * 512-pixel tiles, which is where 3x2 and 5x3 come from; Trek starts from a
 * 512-pixel world in 256-pixel tiles, which is why it looks like a clean
 * power-of-two pyramid without being modelled as one.
 *
 * Verified against the published WMTSCapabilities of every GIBS matrix set
 * (250m, 500m, 1km) and of the Trek Moon, Mars, Mars-MOLA and Mercury layers:
 * a single `world0` per service reproduces every MatrixWidth and MatrixHeight
 * at every level. `tools/verify-imagery.mjs` re-checks this against the live
 * services.
 *
 * @param {object} layer Entry from {@link LAYERS}.
 * @param {number} z Zoom level.
 * @returns {{cols:number, rows:number, worldWidth:number, worldHeight:number}}
 */
export function pyramidAt(layer, z) {
  const worldWidth = layer.world0 * 2 ** z;
  const worldHeight = worldWidth / 2;
  return {
    worldWidth,
    worldHeight,
    cols: Math.ceil(worldWidth / layer.tileSize),
    rows: Math.ceil(worldHeight / layer.tileSize),
  };
}

/**
 * The shallowest pyramid level whose globe is at least `width` pixels across.
 *
 * Rounds up rather than to nearest: coming back with less resolution than was
 * asked for is a worse failure than fetching four times as many tiles, because
 * the result is a visibly soft planet.
 *
 * @param {number} width Desired texture width.
 * @param {object} layer Entry from {@link LAYERS}.
 * @returns {number} Zoom level (never negative).
 */
export function levelForWidth(width, layer) {
  return Math.max(0, Math.ceil(Math.log2(width / layer.world0)));
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
  const z = levelForWidth(width, layer);
  const { cols, rows, worldWidth } = pyramidAt(layer, z);
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
  // Tiles are laid out on the globe, not on the destination canvas: the last
  // column and row of the matrix hang off the edge of the world and must be
  // clipped there rather than squeezed in. Scaling by width/worldWidth maps
  // the pyramid's own pixel grid onto whatever size was asked for.
  const scale = width / worldWidth;
  const drawSize = layer.tileSize * scale;

  await pool(jobs, opts.concurrency ?? 6, async ({ r, c }) => {
    if (opts.signal?.aborted) return;
    try {
      const bitmap = await fetchImageBitmap(layer.url(z, r, c, date), { timeout: 20_000 });
      ctx.drawImage(bitmap, c * drawSize, r * drawSize, drawSize, drawSize);
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
 * Where a baked basemap lives.
 *
 * The single-file build has no file system to read, so it publishes its inlined
 * copies on `globalThis.__ORRERY_ASSETS` keyed by repository path and this
 * prefers them. Everywhere else it is an ordinary relative URL.
 *
 * @param {string} layerId
 * @returns {string}
 */
export function basemapUrl(layerId) {
  const key = `assets/basemaps/${layerId}.jpg`;
  const inlined = globalThis.__ORRERY_ASSETS?.[key];
  if (inlined) return inlined;
  return new URL(`../../${key}`, import.meta.url).href;
}

/**
 * Install the committed basemaps.
 *
 * This runs before, and independently of, the streamed pyramid. It is the
 * difference between "Earth looks like Earth" being conditional on the network,
 * the service and the embedding page's security policy all cooperating, and it
 * simply being true. The streamed tiles are an upgrade applied on top; they are
 * not what makes the planet recognisable.
 *
 * Two seconds of a procedural Earth at boot is also worth removing on its own
 * merits. The baked map is decoded from a file already in the bundle, so it is
 * on screen in the first frame or two.
 *
 * @param {import('../render/raytracer.js').Renderer} renderer
 * @param {object} [opts]
 * @param {(bodyKey:string, state:string, info?:object)=>void} [opts.onState]
 * @returns {Promise<string[]>} Body keys that got a basemap.
 */
export async function loadBaseMaps(renderer, opts = {}) {
  const loaded = [];
  await Promise.all(
    Object.entries(BODY_LAYERS).map(async ([bodyKey, layerId]) => {
      try {
        const bitmap = await fetchImageBitmap(basemapUrl(layerId), { timeout: 15_000 });
        renderer.setSurface(bodyKey, bitmap);
        bitmap.close?.();
        loaded.push(bodyKey);
        opts.onState?.(bodyKey, 'base', { attribution: LAYERS[layerId]?.attribution });
      } catch {
        // Non-fatal by construction: the procedural surface is still there.
      }
    })
  );
  return loaded;
}

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
      const layer = LAYERS[layerId];
      const grid = pyramidAt(layer, levelForWidth(width, layer));
      const tileCount = grid.cols * grid.rows;
      if (tex.missing > tileCount * 0.4) throw new Error(`${tex.missing} of ${tileCount} tiles missing`);
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
