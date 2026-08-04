/**
 * Playwright configuration.
 *
 * The end-to-end suite runs against a real browser with real WebGL2, provided
 * by ANGLE over SwiftShader. That is a software rasteriser, so it is slow — but
 * it is deterministic, needs no GPU, and runs identically on a laptop and on a
 * GitHub Actions runner, which is worth far more here than speed.
 *
 * Two flags do the work:
 *   --use-gl=angle --use-angle=swiftshader   select the software backend
 *   --enable-unsafe-swiftshader              permits WebGL on it (Chrome 120+
 *                                            blocks WebGL under SwiftShader
 *                                            without this, and fails silently)
 *
 * External network access is blocked in the tests themselves. The application
 * is designed to work entirely from committed data, so an offline run is both
 * a valid configuration and the only way to get a repeatable result.
 */

import { defineConfig, devices } from '@playwright/test';

const PORT = process.env.ORRERY_PORT || 8123;

export default defineConfig({
  testDir: './tests/e2e',
  // Rendering thirty frames on a software rasteriser is not fast.
  timeout: 180_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',

  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    // The renderer needs a viewport large enough that bodies are more than a
    // few pixels across, or the assertions about visible pixels are meaningless.
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
  },

  projects: [
    {
      name: 'chromium-swiftshader',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          ...(process.env.ORRERY_CHROMIUM ? { executablePath: process.env.ORRERY_CHROMIUM } : {}),
          args: [
            '--use-gl=angle',
            '--use-angle=swiftshader',
            '--enable-unsafe-swiftshader',
            '--ignore-gpu-blocklist',
            '--no-sandbox',
            '--disable-dev-shm-usage',
            // Deterministic frames: no throttling when the tab is backgrounded.
            '--disable-background-timer-throttling',
            '--disable-renderer-backgrounding',
            '--disable-backgrounding-occluded-windows',
            '--autoplay-policy=no-user-gesture-required',
          ],
        },
      },
    },
  ],

  webServer: {
    command: `node tools/serve.mjs --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}/index.html`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
