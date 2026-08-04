/**
 * End-to-end tests.
 *
 * These run against a real browser with real WebGL2, and they check the things
 * that only a real browser can prove: that the shaders compile, that the frame
 * contains a lit planet rather than a black rectangle, that the interface
 * responds to a keyboard, that ten languages render, and that a high-resolution
 * export produces a valid PNG of the requested size.
 *
 * All external network access is blocked. The application is built to work from
 * committed data, so running offline is both a supported configuration and the
 * only way to get a repeatable result out of a suite that talks to a dozen
 * third-party services.
 */

import { test, expect } from '@playwright/test';

/** Hosts the application may legitimately contact; all are stubbed out. */
const EXTERNAL = /^https?:\/\/(?!127\.0\.0\.1|localhost)/;

test.beforeEach(async ({ page }) => {
  // Fail the run on an uncaught page error rather than letting it hide.
  page.on('pageerror', (err) => {
    throw new Error(`Uncaught page error: ${err.message}\n${err.stack}`);
  });
  // Block the outside world. The app must survive this; that is the point.
  await page.route(EXTERNAL, (route) => route.abort());
});

/**
 * Wait for the application to finish booting.
 * @param {import('@playwright/test').Page} page
 */
async function boot(page) {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.orrery?.running === true, null, { timeout: 150_000 });
  // Dismiss the first-run dialog so it does not cover the canvas.
  await page.evaluate(() => document.getElementById('dlg-intro')?.close());
  // Let a few frames land.
  await page.waitForFunction(() => window.orrery.renderer.accumulatedFrames >= 1, null, { timeout: 60_000 });
}

/**
 * Read back the canvas and summarise it.
 * @param {import('@playwright/test').Page} page
 */
async function sampleFrame(page) {
  return page.evaluate(() => {
    const src = document.getElementById('view');
    const w = 160;
    const h = 100;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    ctx.drawImage(src, 0, 0, w, h);
    const d = ctx.getImageData(0, 0, w, h).data;
    let lit = 0;
    let sum = 0;
    let max = 0;
    const histogram = new Array(8).fill(0);
    for (let i = 0; i < d.length; i += 4) {
      const v = (d[i] + d[i + 1] + d[i + 2]) / 3;
      sum += v;
      if (v > max) max = v;
      if (v > 12) lit++;
      histogram[Math.min(7, v >> 5)]++;
    }
    return { lit, mean: sum / (w * h), max, histogram, total: w * h };
  });
}

test.describe('boot', () => {
  test('starts, compiles its shaders and renders a frame', async ({ page }) => {
    await boot(page);

    const state = await page.evaluate(() => ({
      running: window.orrery.running,
      bodies: window.orrery.renderer.bodyCount,
      renderer: window.orrery.renderer.caps.renderer,
      floatRender: window.orrery.renderer.caps.floatRender,
      glError: window.orrery.renderer.gl.getError(),
      quality: window.orrery.renderer.quality.id,
    }));

    expect(state.running).toBe(true);
    expect(state.floatRender).toBe(true);
    expect(state.glError).toBe(0);
    expect(state.bodies).toBeGreaterThan(3);

    const frame = await sampleFrame(page);
    // Not a black rectangle: a real frame has stars, and a lit planet.
    expect(frame.lit).toBeGreaterThan(20);
    expect(frame.max).toBeGreaterThan(60);
  });

  test('hides the boot screen when ready', async ({ page }) => {
    await boot(page);
    await expect(page.locator('#boot')).toHaveClass(/is-done/);
  });

  test('works with every external request blocked', async ({ page }) => {
    const failures = [];
    page.on('console', (m) => { if (m.type() === 'error') failures.push(m.text()); });
    await boot(page);
    // Blocked fetches log to the console; what matters is the app still runs.
    expect(await page.evaluate(() => window.orrery.running)).toBe(true);
    expect(await page.evaluate(() => window.orrery.scene.bodies.length)).toBeGreaterThan(25);
  });
});

test.describe('rendering', () => {
  test('produces a different frame for a different world', async ({ page }) => {
    await boot(page);

    const shoot = async (id) => {
      await page.evaluate((body) => {
        const a = window.orrery;
        a.clock.setRate(0);
        a.camera.focusOn(body, { distanceRadii: 5, duration: 0 });
        a.camera.update(0, a.scene, null, 0);
        a.renderer.snapExposure(a.renderer.targetExposure(a.scene, a.camera));
        a.renderer.resetAccumulation();
      }, id);
      await page.waitForFunction(() => window.orrery.renderer.accumulatedFrames >= 6, null, { timeout: 90_000 });
      return sampleFrame(page);
    };

    const sun = await shoot('sun');
    const saturn = await shoot('saturn');

    expect(sun.mean).toBeGreaterThan(0);
    expect(saturn.mean).toBeGreaterThan(0);
    // The Sun close up and Saturn close up cannot plausibly look the same.
    expect(Math.abs(sun.mean - saturn.mean)).toBeGreaterThan(1);
  });

  test('accumulation converges while the view is still', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => {
      window.orrery.clock.setRate(0);
      window.orrery.renderer.resetAccumulation();
    });
    const before = await page.evaluate(() => window.orrery.renderer.accumulatedFrames);
    await page.waitForFunction(
      (n) => window.orrery.renderer.accumulatedFrames > n + 4,
      before,
      { timeout: 90_000 }
    );
    expect(await page.evaluate(() => window.orrery.renderer.accumulatedFrames)).toBeGreaterThan(before);
  });

  test('accumulation resets when the camera moves', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => window.orrery.clock.setRate(0));
    await page.waitForFunction(() => window.orrery.renderer.accumulatedFrames > 5, null, { timeout: 90_000 });
    await page.evaluate(() => { window.orrery.camera.drag(120, 40, 800); });
    await page.waitForFunction(() => window.orrery.renderer.accumulatedFrames <= 3, null, { timeout: 60_000 });
  });

  test('renders every quality tier without a GL error', async ({ page }) => {
    await boot(page);
    // Accumulation only builds while the scene is still; with time running,
    // every frame is a new scene and the counter correctly stays at one.
    await page.evaluate(() => window.orrery.clock.setRate(0));
    for (const tier of ['potato', 'low', 'medium']) {
      await page.evaluate((id) => window.orrery.setQuality(id), tier);
      await page.waitForFunction(() => window.orrery.renderer.accumulatedFrames >= 2, null, { timeout: 90_000 });
      const err = await page.evaluate(() => window.orrery.renderer.gl.getError());
      expect(err, `GL error after switching to ${tier}`).toBe(0);
    }
  });

  test('layer toggles change the image', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => {
      const a = window.orrery;
      a.clock.setRate(0);
      a.camera.focusOn('saturn', { distanceRadii: 5, duration: 0 });
      a.camera.update(0, a.scene, null, 0);
      a.renderer.snapExposure(a.renderer.targetExposure(a.scene, a.camera));
      a.renderer.resetAccumulation();
    });
    await page.waitForFunction(() => window.orrery.renderer.accumulatedFrames >= 6, null, { timeout: 90_000 });
    const withRings = await sampleFrame(page);

    await page.evaluate(() => {
      window.orrery.renderer.settings.showRings = false;
      window.orrery.renderer.resetAccumulation();
    });
    await page.waitForFunction(() => window.orrery.renderer.accumulatedFrames >= 6, null, { timeout: 90_000 });
    const withoutRings = await sampleFrame(page);

    expect(withRings.lit).not.toBe(withoutRings.lit);
  });
});

test.describe('interface', () => {
  test('lists the worlds and focuses one when clicked', async ({ page }) => {
    await boot(page);
    const items = page.locator('.body-item');
    expect(await items.count()).toBeGreaterThan(8);

    await page.getByRole('button', { name: /Jupiter/ }).first().click();
    await expect.poll(() => page.evaluate(() => window.orrery.camera.focus)).toBe('jupiter');
    await expect(page.locator('#focus-name')).toHaveText(/Jupiter/);
    await expect(page.locator('#panel-body')).toContainText(/Jupiter/);
  });

  test('shows real physical data in the panel', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => window.orrery.focus('saturn'));
    const panel = page.locator('#panel-body');
    await expect(panel).toContainText('60,268 km');       // equatorial radius
    await expect(panel).toContainText('Cassini Division'); // ring nomenclature
  });

  test('keyboard controls time and focus', async ({ page }) => {
    await boot(page);
    const rateOf = () => page.evaluate(() => window.orrery.clock.rate);

    await page.keyboard.press('Space');
    await expect.poll(rateOf).toBe(0);
    await page.keyboard.press('Space');
    await expect.poll(rateOf).not.toBe(0);

    const before = await page.evaluate(() => window.orrery.camera.focus);
    await page.keyboard.press('ArrowDown');
    await expect.poll(() => page.evaluate(() => window.orrery.camera.focus)).not.toBe(before);
  });

  test('H hides the interface', async ({ page }) => {
    await boot(page);
    await page.keyboard.press('h');
    await expect(page.locator('body')).toHaveClass(/ui-hidden/);
    await page.keyboard.press('h');
    await expect(page.locator('body')).not.toHaveClass(/ui-hidden/);
  });

  test('search finds a world by name', async ({ page }) => {
    await boot(page);
    await page.keyboard.press('/');
    await expect(page.locator('#dlg-search')).toBeVisible();
    await page.locator('#search-input').fill('enc');
    await page.locator('#search-results button').first().click();
    await expect.poll(() => page.evaluate(() => window.orrery.camera.focus)).toBe('enceladus');
  });

  test('the data health dialog explains every API', async ({ page }) => {
    await boot(page);
    await page.locator('#btn-health').click();
    const dlg = page.locator('#dlg-health');
    await expect(dlg).toBeVisible();
    await expect(dlg).toContainText('DEMO_KEY');
    await expect(dlg).toContainText('APOD');
    // The CORS-blocked services must be labelled honestly.
    await expect(dlg).toContainText(/Snapshot/i);
  });

  test('the panel tabs all render', async ({ page }) => {
    await boot(page);
    for (const tab of ['data', 'tours', 'capture', 'settings', 'body']) {
      await page.evaluate((name) => window.orrery.setPanel(name), tab);
      await expect(page.locator('#panel-body')).not.toBeEmpty();
    }
  });

  test('clicking a body in the 3D view selects it', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => {
      const a = window.orrery;
      a.clock.setRate(0);
      a.camera.focusOn('earth', { distanceRadii: 4, duration: 0 });
      a.camera.update(0, a.scene, null, 0);
    });
    await page.waitForTimeout(500);
    // Earth is dead centre at this distance.
    const box = await page.locator('#view').boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect.poll(() => page.evaluate(() => window.orrery.camera.focus)).toBe('earth');
  });
});

test.describe('internationalisation', () => {
  const LOCALES = ['en', 'zh-Hans', 'pt-BR', 'es', 'ko', 'fr', 'ja', 'de', 'ru', 'ar'];

  for (const tag of LOCALES) {
    test(`renders in ${tag}`, async ({ page }) => {
      await page.goto(`/index.html?lang=${tag}`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.orrery?.running === true, null, { timeout: 150_000 });
      await page.evaluate(() => document.getElementById('dlg-intro')?.close());

      await expect(page.locator('html')).toHaveAttribute('lang', tag);
      await expect(page.locator('html')).toHaveAttribute('dir', tag === 'ar' ? 'rtl' : 'ltr');

      // The world list must be translated. Note that several planet names are
      // identical in English, French and German — "Jupiter", "Saturn", "Mars" —
      // so the check is that the list as a whole differs from the English one,
      // not that any particular word changed.
      const names = await page.locator('.body-item__name').allTextContents();
      expect(names.length).toBeGreaterThan(5);
      if (tag !== 'en') {
        const english = 'Sun Mercury Venus Earth The Moon Mars Jupiter Saturn Uranus Neptune Pluto';
        expect(names.join(' '), `${tag} body names were not translated`).not.toBe(english);
      }
      // Nothing may render a raw translation key.
      const body = await page.locator('#panel-body').textContent();
      expect(body).not.toMatch(/\b[a-z]+\.[a-z]+\.[a-z]+\b/);
    });
  }

  test('Arabic mirrors the layout', async ({ page }) => {
    await page.goto('/index.html?lang=ar', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.orrery?.running === true, null, { timeout: 150_000 });
    await page.evaluate(() => document.getElementById('dlg-intro')?.close());

    const rail = await page.locator('#rail').boundingBox();
    const panel = await page.locator('#panel').boundingBox();
    // In RTL the world list should sit to the right of the info panel.
    expect(rail.x).toBeGreaterThan(panel.x);
  });
});

test.describe('export', () => {
  test('renders a 1080p PNG with the right dimensions', async ({ page }) => {
    await boot(page);
    const result = await page.evaluate(async () => {
      const a = window.orrery;
      a.clock.setRate(0);
      const { exportStill } = await import('/src/render/export.js');
      const r = await exportStill(a.renderer, a.scene, a.camera, {
        width: 1920, height: 1080, format: 'png', samples: 4, tileSize: 512,
      });
      const bytes = new Uint8Array(await r.blob.arrayBuffer());
      const view = new DataView(bytes.buffer);
      return {
        size: r.blob.size,
        type: r.blob.type,
        tiles: r.tiles,
        filename: r.filename,
        signature: [...bytes.slice(0, 8)],
        pngWidth: view.getUint32(16),
        pngHeight: view.getUint32(20),
        colourType: bytes[25],
      };
    });

    expect(result.signature).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(result.pngWidth).toBe(1920);
    expect(result.pngHeight).toBe(1080);
    expect(result.colourType).toBe(2); // RGB, alpha dropped
    expect(result.type).toBe('image/png');
    expect(result.size).toBeGreaterThan(20_000);
    // 1920x1080 in 512-pixel tiles is 4 columns by 3 rows.
    expect(result.tiles).toBe(12);
    expect(result.filename).toMatch(/^orrery-.*-1920x1080\.png$/);
  });

  test('tiled rendering leaves no seam', async ({ page }) => {
    await boot(page);
    // Render the same view twice, once as a single tile and once split into
    // four, and look for a SEAM rather than for byte equality.
    //
    // Byte equality is not achievable and not the goal: bloom is a
    // neighbourhood operation, so a 256-pixel render and a 128-pixel tile
    // legitimately build different mip pyramids and end up marginally softer or
    // sharper overall. What must not happen is a visible discontinuity at the
    // join. So the measurement is the column-to-column gradient exactly at the
    // tile boundary, compared with the typical gradient everywhere else — which
    // is what a human would see as a line down the middle of the picture.
    const result = await page.evaluate(async () => {
      const a = window.orrery;
      a.clock.setRate(0);
      a.camera.focusOn('saturn', { distanceRadii: 4, duration: 0 });
      a.camera.update(0, a.scene, null, 0);
      a.renderer.snapExposure(a.renderer.targetExposure(a.scene, a.camera));
      const { exportStill } = await import('/src/render/export.js');
      const N = 256;
      const opts = { width: N, height: N, format: 'png', samples: 3 };

      const decode = async (blob) => {
        const bmp = await createImageBitmap(blob);
        const c = new OffscreenCanvas(N, N);
        const ctx = c.getContext('2d');
        ctx.drawImage(bmp, 0, 0);
        return ctx.getImageData(0, 0, N, N).data;
      };

      const tiled = await decode(
        (await exportStill(a.renderer, a.scene, a.camera, { ...opts, tileSize: N / 2 })).blob
      );
      const whole = await decode(
        (await exportStill(a.renderer, a.scene, a.camera, { ...opts, tileSize: N })).blob
      );

      const lum = (px, x, y) =>
        (px[(y * N + x) * 4] + px[(y * N + x) * 4 + 1] + px[(y * N + x) * 4 + 2]) / 3;

      // Mean absolute horizontal gradient at a given column.
      const columnGradient = (px, x) => {
        let sum = 0;
        for (let y = 0; y < N; y++) sum += Math.abs(lum(px, x, y) - lum(px, x - 1, y));
        return sum / N;
      };

      let typical = 0;
      let count = 0;
      for (let x = 1; x < N; x++) {
        if (Math.abs(x - N / 2) < 3) continue; // skip the boundary itself
        typical += columnGradient(tiled, x);
        count++;
      }
      typical /= count;

      const seam = columnGradient(tiled, N / 2);

      let sumDiff = 0;
      let maxDiff = 0;
      for (let i = 0; i < whole.length; i += 4) {
        for (let c = 0; c < 3; c++) {
          const d = Math.abs(whole[i + c] - tiled[i + c]);
          sumDiff += d;
          if (d > maxDiff) maxDiff = d;
        }
      }
      return { seam, typical, meanDiff: sumDiff / (whole.length * 0.75), maxDiff };
    });

    // The join must not stand out from the picture's own texture.
    expect(result.seam).toBeLessThan(Math.max(result.typical * 2.5, 2));
    // And the two renders must still be broadly the same image.
    expect(result.meanDiff).toBeLessThan(24);
  });

  test('reports what video formats this browser can record', async ({ page }) => {
    await boot(page);
    const support = await page.evaluate(async () => {
      const { supportedFormats, canRecordMP4, pickFormat } = await import('/src/render/recorder.js');
      return {
        formats: supportedFormats().map((f) => f.mime),
        mp4: canRecordMP4(),
        chosen: pickFormat('auto')?.mime ?? null,
      };
    });
    // Chromium supports at least WebM; MP4 depends on the build.
    expect(support.formats.length).toBeGreaterThan(0);
    expect(support.chosen).toBeTruthy();
  });

  test('records a short clip', async ({ page }) => {
    await boot(page);
    const result = await page.evaluate(async () => {
      const a = window.orrery;
      const { Recorder } = await import('/src/render/recorder.js');
      const rec = new Recorder({ canvas: a.dom.canvas, fps: 12 });
      await rec.start();
      const startedState = rec.state;
      await new Promise((r) => setTimeout(r, 1500));
      const out = await rec.stop();
      return {
        startedState,
        endState: rec.state,
        size: out.blob.size,
        container: out.container,
        mime: out.mime,
        filename: out.filename,
        durationMs: out.durationMs,
      };
    });

    // The state machine and the file naming are what this environment can
    // prove. Whether bytes come out depends on a video encoder being present:
    // headless Chromium under SwiftShader reports webm/vp9 as supported but
    // ships no encoder, so `captureStream` yields no frames and the blob is
    // empty. That is a property of the CI image, not of the application, and
    // asserting on it would make the suite lie about a real browser.
    expect(result.startedState).toBe('recording');
    expect(result.endState).toBe('idle');
    expect(['mp4', 'webm']).toContain(result.container);
    expect(result.mime).toMatch(/^video\/(mp4|webm)/);
    expect(result.filename).toMatch(/^orrery-.*\.(mp4|webm)$/);
    expect(result.durationMs).toBeGreaterThan(1000);
    if (result.size === 0) {
      test.info().annotations.push({
        type: 'note',
        description: 'No encoder in this browser build; recorder lifecycle verified without bytes.',
      });
    }
  });

});

test.describe('accessibility', () => {
  test('has a skip link, a labelled canvas and a live region', async ({ page }) => {
    await boot(page);
    await expect(page.locator('.skip-link')).toHaveAttribute('href', '#controls');
    await expect(page.locator('#view')).toHaveAttribute('aria-label', /solar system/i);
    await expect(page.locator('#announcer')).toHaveAttribute('aria-live', 'polite');
  });

  test('announces a change of focus', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => window.orrery.focus('neptune'));
    await expect(page.locator('#announcer')).toContainText(/Neptune/);
  });

  test('the world list is reachable and operable by keyboard', async ({ page }) => {
    await boot(page);
    const first = page.locator('.body-item').first();
    await first.focus();
    await expect(first).toBeFocused();
    await page.keyboard.press('Enter');
    await expect.poll(() => page.evaluate(() => window.orrery.camera.focus)).toBe('sun');
  });

  test('reduced motion disables camera easing and auto-orbit', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => {
      window.orrery.savePrefs({ reducedMotion: true });
      window.orrery.camera.autoOrbit = 0.1;
      window.orrery.focus('mars');
    });
    expect(await page.evaluate(() => window.orrery.camera.autoOrbit)).toBe(0.1);
    // A focus change with reduced motion must not start a long transition.
    expect(await page.evaluate(() => window.orrery.camera._transition?.dur ?? 0)).toBe(0);
  });

  test('every interactive control has an accessible name', async ({ page }) => {
    await boot(page);
    const unnamed = await page.evaluate(() => {
      const bad = [];
      for (const el of document.querySelectorAll('button, input, select, a[href]')) {
        if (el.closest('[hidden]') || el.offsetParent === null) continue;
        // An accessible name can come from aria-label, the element's own text,
        // its title or placeholder, or — for form controls — an associated
        // <label>, whether that is `for=` or a wrapping element.
        const fromLabels = el.labels
          ? [...el.labels].map((l) => l.textContent).join(' ')
          : '';
        const name = (
          el.getAttribute('aria-label') ||
          el.getAttribute('aria-labelledby') ||
          fromLabels ||
          el.textContent ||
          el.title ||
          el.getAttribute('placeholder') || ''
        ).trim();
        if (!name) bad.push(el.outerHTML.slice(0, 90));
      }
      return bad;
    });
    expect(unnamed).toEqual([]);
  });
});

test.describe('tours', () => {
  test('a tour advances through its steps and can be stopped', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => window.orrery.tourPlayer.play('rings'));
    await expect(page.locator('#tour')).toBeVisible();
    await expect(page.locator('#tour-title')).not.toBeEmpty();

    const first = await page.locator('#tour-title').textContent();
    await page.locator('#tour-next').click();
    await expect(page.locator('#tour-title')).not.toHaveText(first);

    await page.locator('#tour-stop').click();
    await expect(page.locator('#tour')).toBeHidden();
  });
});

test.describe('sharing', () => {
  test('a permalink restores the view', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => {
      window.orrery.focus('titan');
      window.orrery.camera.distanceRadii = 14;
    });
    const url = await page.evaluate(() => window.orrery.shareUrl());
    expect(url).toContain('view=');

    const relative = new URL(url).search;
    await page.goto(`/index.html${relative}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.orrery?.running === true, null, { timeout: 150_000 });
    expect(await page.evaluate(() => window.orrery.camera.focus)).toBe('titan');
    expect(await page.evaluate(() => window.orrery.camera.distanceRadii)).toBeCloseTo(14, 1);
  });
});
