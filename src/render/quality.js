/**
 * Quality tiers.
 *
 * Every knob that trades image quality for frame time lives here, so "what does
 * Medium actually change?" has a single, readable answer — and so the adaptive
 * scaler has one place to reach into.
 *
 * @module render/quality
 */

/**
 * @typedef {object} QualityPreset
 * @property {string} id
 * @property {string} labelKey i18n key.
 * @property {number} resolutionScale Fraction of the device pixel grid.
 * @property {number} maxPixelRatio Upper bound on devicePixelRatio.
 * @property {number} scatterSteps View-ray samples inside an atmosphere.
 * @property {number} lightSteps Sun-ray samples for atmospheric optical depth.
 * @property {number} shadowBodies How many bodies participate in shadow tests.
 * @property {number} surfaceDetail Procedural detail strength, 0..1.
 * @property {number} bloomMips Levels in the bloom pyramid.
 * @property {number} accumTarget Frames to accumulate while the view is still.
 * @property {number} surfaceTextureSize Equirectangular imagery resolution.
 * @property {boolean} starburst Diffraction spikes in the composite.
 */

/** @type {ReadonlyArray<QualityPreset>} */
export const QUALITY_PRESETS = Object.freeze([
  {
    id: 'potato',
    labelKey: 'quality.potato',
    resolutionScale: 0.5,
    maxPixelRatio: 1,
    scatterSteps: 6,
    lightSteps: 3,
    shadowBodies: 6,
    surfaceDetail: 0.35,
    bloomMips: 4,
    accumTarget: 24,
    surfaceTextureSize: 1024,
    starburst: false,
  },
  {
    id: 'low',
    labelKey: 'quality.low',
    resolutionScale: 0.7,
    maxPixelRatio: 1,
    scatterSteps: 10,
    lightSteps: 4,
    shadowBodies: 10,
    surfaceDetail: 0.6,
    bloomMips: 5,
    accumTarget: 32,
    surfaceTextureSize: 2048,
    starburst: false,
  },
  {
    id: 'medium',
    labelKey: 'quality.medium',
    resolutionScale: 1,
    maxPixelRatio: 1.5,
    scatterSteps: 16,
    lightSteps: 6,
    shadowBodies: 16,
    surfaceDetail: 0.85,
    bloomMips: 6,
    accumTarget: 48,
    surfaceTextureSize: 2048,
    starburst: true,
  },
  {
    id: 'high',
    labelKey: 'quality.high',
    resolutionScale: 1,
    maxPixelRatio: 2,
    scatterSteps: 24,
    lightSteps: 8,
    shadowBodies: 24,
    surfaceDetail: 1,
    bloomMips: 7,
    accumTarget: 96,
    surfaceTextureSize: 4096,
    starburst: true,
  },
  {
    id: 'ultra',
    labelKey: 'quality.ultra',
    resolutionScale: 1,
    maxPixelRatio: 3,
    scatterSteps: 40,
    lightSteps: 12,
    shadowBodies: 40,
    surfaceDetail: 1,
    bloomMips: 8,
    accumTarget: 256,
    surfaceTextureSize: 4096,
    starburst: true,
  },
]);

/** @type {Map<string, QualityPreset>} */
export const QUALITY_BY_ID = new Map(QUALITY_PRESETS.map((q) => [q.id, q]));

/**
 * Pick a sensible starting tier from what we can see of the device.
 *
 * Deliberately conservative: it is far better to start at Medium and let the
 * adaptive scaler climb than to open at Ultra and stutter for three seconds.
 *
 * @param {{renderer:string, maxTexture:number}} caps
 * @returns {string} preset id
 */
export function detectQuality(caps) {
  const r = (caps.renderer || '').toLowerCase();
  const mem = navigator.deviceMemory || 4;
  const cores = navigator.hardwareConcurrency || 4;
  const mobile = /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent || '');

  // Software rasterisers (headless CI, some VMs) must not attempt real work.
  if (/swiftshader|llvmpipe|software|mesa offscreen/.test(r)) return 'potato';
  if (mobile) return mem >= 6 && cores >= 6 ? 'low' : 'potato';
  if (/apple m[1-9]|radeon pro|rtx|rx 7|rx 6|arc a/.test(r)) return 'high';
  if (mem >= 8 && cores >= 8) return 'medium';
  return 'low';
}

/**
 * Adaptive resolution controller.
 *
 * Watches a rolling median of frame times and nudges a resolution multiplier so
 * the app holds its target frame rate. A median (not a mean) is used because a
 * single 200 ms hitch from a texture upload should not collapse the resolution.
 */
export class AdaptiveScaler {
  /**
   * @param {object} [opts]
   * @param {number} [opts.targetFps=60]
   * @param {number} [opts.min=0.4]
   * @param {number} [opts.max=1]
   */
  constructor(opts = {}) {
    this.targetFps = opts.targetFps ?? 60;
    this.min = opts.min ?? 0.4;
    this.max = opts.max ?? 1;
    this.scale = 1;
    this.enabled = true;
    this._samples = [];
    this._cooldown = 0;
  }

  /**
   * @param {number} frameMs Time for the last frame.
   * @param {number} dt Real seconds since the last call.
   * @returns {boolean} true when the scale changed.
   */
  update(frameMs, dt) {
    if (!this.enabled) return false;
    this._samples.push(frameMs);
    if (this._samples.length > 30) this._samples.shift();
    this._cooldown -= dt;
    if (this._samples.length < 20 || this._cooldown > 0) return false;

    const sorted = [...this._samples].sort((a, b) => a - b);
    const median = sorted[sorted.length >> 1];
    const budget = 1000 / this.targetFps;

    const before = this.scale;
    if (median > budget * 1.35) {
      this.scale = Math.max(this.min, this.scale - 0.1);
      this._cooldown = 0.5;
    } else if (median < budget * 0.65) {
      this.scale = Math.min(this.max, this.scale + 0.05);
      this._cooldown = 1.2;
    }
    if (this.scale !== before) {
      this._samples.length = 0;
      return true;
    }
    return false;
  }

  reset() {
    this.scale = 1;
    this._samples.length = 0;
    this._cooldown = 0;
  }
}
