#!/usr/bin/env node
/**
 * Render the documentation imagery.
 *
 * These are not mock-ups or artists' impressions: every picture in the
 * documentation is produced by this script, from the same code that runs in the
 * browser, at a stated date and camera position. Re-run it after a change to
 * the renderer and the docs stay honest.
 *
 * Each shot aims the camera at a chosen *phase angle* relative to the Sun
 * rather than at an absolute bearing, so a terminator appears where it is meant
 * to whatever today's date happens to be.
 *
 * Usage:
 *   node tools/capture-screenshots.mjs [--out docs/images] [--width 1600]
 *                                      [--samples 90] [--only saturn,earth]
 *                                      [--format jpeg|png] [--quality 0.92]
 *
 * Requires Playwright and a Chromium build. In an environment without a GPU,
 * ANGLE over SwiftShader is used automatically; it is slow but produces the
 * same image.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i > -1 && argv[i + 1] ? argv[i + 1] : fallback;
};

const OUT = resolve(ROOT, arg('out', 'docs/images'));
const WIDTH = parseInt(arg('width', '1600'), 10);
const HEIGHT = Math.round((WIDTH * 9) / 16);
const SAMPLES_REQUESTED = parseInt(arg('samples', '48'), 10);
const ONLY = arg('only', null)?.split(',');
const PORT = parseInt(arg('port', '8231'), 10);

// JPEG by default. A converged frame is a photographic image — smooth gradients,
// no flat colour, no text — so PNG buys nothing visible and costs roughly eight
// times the bytes, in a file that is regenerated on every renderer change and
// therefore lives in the history forever. Use `--format png` for a shot that
// will be cropped or re-processed.
const FORMAT = arg('format', 'jpeg') === 'png' ? 'png' : 'jpeg';
const EXT = FORMAT === 'png' ? 'png' : 'jpg';
const QUALITY = parseFloat(arg('quality', '0.92'));

/**
 * The shot list.
 *
 * `phase` is the camera bearing measured from the Sun's direction, in degrees:
 * 0 looks from the Sun (full phase, no terminator), 90 gives a half-lit disc,
 * 180 looks back at the night side.
 */
const SHOTS = [
  {
    id: 'saturn', body: 'saturn', distance: 6, pitch: 0.30, phase: 62, fov: 40,
    caption: 'Saturn, with the ring shadow across the cloud tops and the planet\'s shadow across the rings.',
  },
  {
    id: 'earth', body: 'earth', distance: 3.6, pitch: 0.12, phase: 78, fov: 42,
    caption: 'Earth at its real position, with an atmospheric limb integrated from Rayleigh and Mie scattering.',
  },
  {
    id: 'jupiter', body: 'jupiter', distance: 7, pitch: 0.18, phase: 55, fov: 40,
    caption: 'Jupiter. The oblateness is not stylised — the equatorial radius really is 6.5 per cent larger than the polar one.',
  },
  {
    id: 'mars', body: 'mars', distance: 4.2, pitch: 0.20, phase: 50, fov: 42,
    caption: 'Mars, with Phobos and Deimos on their true orbits.',
  },
  {
    id: 'system', body: 'sun', distance: 9000, pitch: 0.62, phase: 30, fov: 50,
    caption: 'The inner system from about 40 astronomical units. Planets this far away are points of light of the correct apparent magnitude.',
  },
  {
    id: 'sun', body: 'sun', distance: 5, pitch: 0.10, phase: 20, fov: 45,
    caption: 'The Sun, with limb darkening and a corona that falls off as r^-2.5.',
  },
];

/** @param {string} cmd @param {string[]} args */
function run(cmd, args, opts = {}) {
  return spawn(cmd, args, { cwd: ROOT, stdio: 'ignore', ...opts });
}

async function waitForServer(url, timeoutMs = 20000) {
  const started = Date.now();
  for (;;) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    if (Date.now() - started > timeoutMs) throw new Error(`server did not start: ${url}`);
    await new Promise((r) => setTimeout(r, 250));
  }
}

async function main() {
  await mkdir(OUT, { recursive: true });

  const { chromium } = await import('@playwright/test');
  const server = run(process.execPath, ['tools/serve.mjs', '--port', String(PORT)]);
  await waitForServer(`http://127.0.0.1:${PORT}/index.html`);

  const browser = await chromium.launch({
    ...(process.env.ORRERY_CHROMIUM ? { executablePath: process.env.ORRERY_CHROMIUM } : {}),
    args: [
      '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
      '--no-sandbox', '--disable-dev-shm-usage',
    ],
  });

  try {
    const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
    page.on('pageerror', (e) => process.stderr.write(`page error: ${e.message}\n`));

    await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.orrery?.running === true, null, { timeout: 180_000 });
    await page.evaluate(() => document.getElementById('dlg-intro')?.close());

    // Freeze time and hide the interface so the picture is of the render, not
    // of the chrome.
    await page.evaluate(() => {
      window.orrery.clock.setRate(0);
      window.orrery.setQuality('medium');
    });

    // The renderer stops accumulating once it reaches the tier's target, so
    // asking for more samples than the tier accumulates waits forever.
    const cap = await page.evaluate(() => window.orrery.renderer.quality.accumTarget);
    const samples = Math.min(SAMPLES_REQUESTED, cap);
    if (samples < SAMPLES_REQUESTED) {
      process.stdout.write(
        `  (capped at ${samples} samples: the current quality tier stops accumulating there)\n`
      );
    }

    const manifest = [];
    for (const shot of SHOTS) {
      if (ONLY && !ONLY.includes(shot.id)) continue;
      process.stdout.write(`  ${shot.id} …`);

      await page.evaluate(async (s) => {
        const a = window.orrery;
        const body = a.scene.byId.get(s.body) || a.scene.byId.get('sun');
        const sunYaw = Math.atan2(-body.pos[1], -body.pos[0]);
        a.camera.focus = s.body;
        a.camera.yaw = a.camera._yaw = sunYaw + (s.phase * Math.PI) / 180;
        a.camera.pitch = a.camera._pitch = s.pitch;
        a.camera.distanceRadii = a.camera._distance = s.distance;
        a.camera.setFov(s.fov);
        a.camera._fov = a.camera.fov;
        a.camera._transition = null;
        a.camera.update(0, a.scene, null, 0);
        a.renderer.snapExposure(a.renderer.targetExposure(a.scene, a.camera));
        a.renderer.resetAccumulation();
      }, shot);

      // Wait for the image to converge to the requested sample count.
      await page.waitForFunction(
        (n) => window.orrery.renderer.accumulatedFrames >= n,
        samples,
        { timeout: 900_000 }
      );

      const dataUrl = await page.evaluate(
        ([type, q]) => document.getElementById('view').toDataURL(type, q),
        [`image/${FORMAT}`, QUALITY]
      );
      const file = resolve(OUT, `${shot.id}.${EXT}`);
      await writeFile(file, Buffer.from(dataUrl.split(',')[1], 'base64'));
      const info = await page.evaluate(() => ({
        jd: window.orrery.clock.jd,
        date: window.orrery.clock.date.toISOString(),
        bodies: window.orrery.renderer.bodyCount,
        samples: window.orrery.renderer.accumulatedFrames,
      }));
      manifest.push({ ...shot, file: `${shot.id}.${EXT}`, ...info });
      process.stdout.write(` ${info.samples} samples, ${info.bodies} bodies\n`);
    }

    // A manifest so the documentation can state exactly what each picture shows.
    await writeFile(resolve(OUT, 'manifest.json'), JSON.stringify({
      generatedBy: 'tools/capture-screenshots.mjs',
      width: WIDTH,
      height: HEIGHT,
      format: FORMAT,
      quality: FORMAT === 'jpeg' ? QUALITY : undefined,
      shots: manifest,
    }, null, 2));
    process.stdout.write(`Wrote ${manifest.length} images to ${OUT}\n`);
  } finally {
    await browser.close();
    server.kill();
  }
}

main().catch((err) => {
  process.stderr.write(`capture-screenshots failed: ${err.stack || err.message}\n`);
  process.exit(1);
});
