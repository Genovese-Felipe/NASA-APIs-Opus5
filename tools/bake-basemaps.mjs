#!/usr/bin/env node
/**
 * Bake the NASA basemaps into the repository.
 *
 * WHY THIS EXISTS
 *
 * The app streams surface imagery from GIBS and NASA Trek at run time, which is
 * the right thing to do: it is high resolution, it is current, and it is the
 * actual published product rather than a copy of one. But it means Earth looks
 * like Earth only when three things all hold — the visitor is online, the
 * service is up, and nothing between them forbids the request. When any of
 * those fails the shader falls back to procedural noise, and a procedural Earth
 * is unmistakably not Earth. That is the single most damaging thing this app
 * can get wrong, because the whole claim is that it shows you the real one.
 *
 * So a low-resolution version of each basemap is fetched once, here, and
 * committed. It is what you see at the first frame, before any tile has
 * arrived; it is what you see offline; and it is what you see inside an
 * embedding host whose Content-Security-Policy forbids reaching NASA at all —
 * which is the case for the single-file build. The streamed pyramid then
 * upgrades it in place when it is available.
 *
 * 2048 x 1024 is chosen deliberately. It is 8 arcminutes per pixel: enough that
 * every continent, the Sahara, the Amazon, the Antarctic ice and the ocean
 * basins read correctly at any framing that shows the whole disc, and small
 * enough that four bodies cost under a megabyte in total. Zoom in far enough
 * and the streamed tiles have long since replaced it.
 *
 * Stitching is done in Chromium rather than with an image library, because the
 * project already depends on Chromium for its tests and does not otherwise
 * depend on native image tooling.
 *
 * Usage:  node tools/bake-basemaps.mjs [--width 2048] [--quality 0.86]
 *                                      [--only earth,mars] [--out assets/basemaps]
 */

import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i > -1 && argv[i + 1] ? argv[i + 1] : fallback;
};

const WIDTH = parseInt(arg('width', '2048'), 10);
const HEIGHT = WIDTH / 2;
const QUALITY = parseFloat(arg('quality', '0.86'));
const OUT = resolve(ROOT, arg('out', 'assets/basemaps'));
const ONLY = arg('only', null)?.split(',');

const { LAYERS, levelForWidth, pyramidAt } = await import('../src/data/imagery.js');

/** The layers worth carrying offline: one per textured body. */
const BAKE = ['earth', 'moon', 'mars', 'mercury'];

/**
 * Fetch every tile of one pyramid level.
 * @param {object} layer
 * @param {number} z
 * @returns {Promise<Array<{row:number, col:number, dataUrl:string}>>}
 */
async function fetchLevel(layer, z) {
  const { cols, rows } = pyramidAt(layer, z);
  const out = [];
  let attempted = 0;
  // Serial, deliberately: this runs once, by hand or in a scheduled job, and
  // being polite to a public NASA endpoint matters more than the thirty seconds
  // a concurrency pool would save.
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const url = layer.url(z, row, col);
      attempted++;

      // Retry with backoff. NASA Trek rate-limits, and it does it by returning
      // an error rather than by making you wait, so a burst of tile requests
      // comes back as a wall of failures that look exactly like missing
      // coverage. Baking straight through that produced a completely black
      // Mars and a Moon with one tile out of thirty-two.
      let res = null;
      for (let attempt = 0; attempt < 4; attempt++) {
        if (attempt > 0) await sleep(800 * 2 ** attempt);
        try {
          res = await fetch(url);
          if (res.ok) break;
        } catch {
          res = null;
        }
      }

      if (!res?.ok) { process.stdout.write('x'); continue; }
      const buf = Buffer.from(await res.arrayBuffer());
      const mime = layer.ext === 'png' ? 'image/png' : 'image/jpeg';
      out.push({ row, col, dataUrl: `data:${mime};base64,${buf.toString('base64')}` });
      process.stdout.write('.');
      // Space the requests out. This runs once; being throttled costs minutes,
      // being blocked costs the whole basemap.
      await sleep(120);
    }
  }
  out.attempted = attempted;
  return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const { chromium } = await import('@playwright/test');
  await mkdir(OUT, { recursive: true });

  const browser = await chromium.launch({
    executablePath: process.env.ORRERY_CHROMIUM || undefined,
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage();
  await page.setContent('<canvas id="c"></canvas>');

  const manifest = [];
  const skipped = [];
  try {
    for (const key of BAKE) {
      if (ONLY && !ONLY.includes(key)) continue;
      const layer = LAYERS[key];
      if (!layer) throw new Error(`unknown layer: ${key}`);

      const z = levelForWidth(WIDTH, layer);
      const { cols, rows, worldWidth, worldHeight } = pyramidAt(layer, z);
      process.stdout.write(`${key}: level ${z}, ${cols}x${rows} tiles, world ${worldWidth}x${worldHeight} `);

      const tiles = await fetchLevel(layer, z);

      // A basemap with holes in it is worse than no basemap at all: it is
      // installed over the procedural surface, so a body that would have looked
      // plausible instead looks broken. Refuse rather than ship one.
      const coverage = tiles.length / (tiles.attempted || 1);
      if (coverage < 0.98) {
        process.stdout.write(
          ` SKIPPED: only ${tiles.length}/${tiles.attempted} tiles ` +
          `(${(coverage * 100).toFixed(0)}%). The service is probably rate-limiting; ` +
          `re-run for this layer alone.\n`
        );
        skipped.push(key);
        continue;
      }

      // Stitch. The pyramid is equirectangular with the same layout the runtime
      // stitcher assumes, so the result is a drop-in for what it would build.
      const dataUrl = await page.evaluate(
        async ([list, w, h, tileSize, q]) => {
          const c = document.getElementById('c');
          c.width = w;
          c.height = h;
          const ctx = c.getContext('2d');
          ctx.fillStyle = '#0a0a0c';
          ctx.fillRect(0, 0, w, h);
          for (const t of list) {
            const img = new Image();
            img.src = t.dataUrl;
            await img.decode();
            // The canvas IS the world, so a tile that overhangs the edge is
            // clipped by the canvas rather than squeezed to fit.
            ctx.drawImage(img, t.col * tileSize, t.row * tileSize, tileSize, tileSize);
          }
          return c.toDataURL('image/jpeg', q);
        },
        [tiles, worldWidth, worldHeight, layer.tileSize, QUALITY]
      );

      const bytes = Buffer.from(dataUrl.split(',')[1], 'base64');
      const file = `${key}.jpg`;
      await writeFile(resolve(OUT, file), bytes);
      manifest.push({
        id: key,
        file,
        width: worldWidth,
        height: worldHeight,
        level: z,
        label: layer.label,
        attribution: layer.attribution,
        bytes: bytes.length,
      });
      process.stdout.write(` -> ${file} ${(bytes.length / 1024).toFixed(0)} KB\n`);
    }

    // Merge rather than replace. Running with --only for one layer must not
    // erase the record of the others, which is exactly what it did the first
    // time a rate-limited service forced a per-layer re-run.
    let previous = [];
    try {
      previous = JSON.parse(await readFile(resolve(OUT, 'manifest.json'), 'utf8')).layers || [];
    } catch { /* first run */ }
    const merged = [...previous.filter((p) => !manifest.some((m) => m.id === p.id)), ...manifest]
      .filter((l) => existsSync(resolve(OUT, l.file)))
      .sort((a, b) => a.id.localeCompare(b.id));

    await writeFile(
      resolve(OUT, 'manifest.json'),
      JSON.stringify(
        {
          generatedBy: 'tools/bake-basemaps.mjs',
          note:
            'Low-resolution copies of NASA basemaps, committed so the app shows real ' +
            'surfaces offline and before the streamed tiles arrive. NASA imagery is not ' +
            'copyrighted; see DATA-AND-CREDITS.md for the per-layer attribution.',
          quality: QUALITY,
          layers: merged,
        },
        null,
        2
      ) + '\n'
    );
    process.stdout.write(`Wrote ${manifest.length} basemaps (${merged.length} total) to ${OUT}\n`);
    if (skipped.length) {
      process.stdout.write(`Skipped (incomplete): ${skipped.join(', ')}\n`);
      process.exitCode = 1;
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  process.stderr.write(`bake-basemaps failed: ${err.stack || err.message}\n`);
  process.exit(1);
});
