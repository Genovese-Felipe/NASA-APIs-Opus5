/**
 * Star catalogue handling: colour science, celestial-sphere projection, and
 * generation of the equirectangular sky texture consumed by the ray tracer.
 *
 * The catalogue is the Bright Star Catalogue (Hoffleit & Warren 1991) via
 * VizieR V/50, pre-processed by `tools/build-star-catalogue.mjs`. Constellation
 * figures come from d3-celestial (BSD-3-Clause).
 *
 * @module astro/stars
 */

import { DEG, OBLIQUITY_J2000 } from './constants.js';

/**
 * Effective temperature from B–V colour index.
 *
 * Ballesteros (2012), "New insights into black bodies", EPL 97, 34008:
 *   T = 4600 K * ( 1/(0.92*BV + 1.70) + 1/(0.92*BV + 0.62) )
 *
 * @param {number} bv B–V colour index.
 * @returns {number} Effective temperature, kelvin.
 */
export function bvToTemperature(bv) {
  const x = 0.92 * bv;
  return 4600 * (1 / (x + 1.7) + 1 / (x + 0.62));
}

/**
 * Approximate linear-sRGB colour of a blackbody at temperature `t`.
 *
 * Uses the Planckian-locus fit published by Tanner Helland, converted from the
 * sRGB-encoded output back to linear light. Accurate to a few percent over
 * 1000–40000 K, which is well inside what the eye can judge on a star field.
 *
 * @param {number} t Temperature in kelvin.
 * @param {number[]} [out]
 * @returns {number[]} Linear RGB, each channel normalised so max == 1.
 */
export function blackbodyRGB(t, out = [0, 0, 0]) {
  const k = Math.min(40000, Math.max(1000, t)) / 100;
  let r;
  let g;
  let b;

  if (k <= 66) {
    r = 255;
    g = 99.4708025861 * Math.log(k) - 161.1195681661;
  } else {
    r = 329.698727446 * Math.pow(k - 60, -0.1332047592);
    g = 288.1221695283 * Math.pow(k - 60, -0.0755148492);
  }
  if (k >= 66) b = 255;
  else if (k <= 19) b = 0;
  else b = 138.5177312231 * Math.log(k - 10) - 305.0447927307;

  const clamp = (v) => Math.min(255, Math.max(0, v)) / 255;
  // sRGB transfer -> linear light.
  const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  out[0] = toLinear(clamp(r));
  out[1] = toLinear(clamp(g));
  out[2] = toLinear(clamp(b));
  const m = Math.max(out[0], out[1], out[2]) || 1;
  out[0] /= m;
  out[1] /= m;
  out[2] /= m;
  return out;
}

/**
 * Relative flux from apparent visual magnitude (Pogson's ratio), normalised so
 * that a magnitude-0 star has flux 1.
 * @param {number} mag
 * @returns {number}
 */
export function magnitudeToFlux(mag) {
  return Math.pow(10, -0.4 * mag);
}

/**
 * Convert equatorial (RA/Dec) to a unit vector in the J2000 **ecliptic** frame,
 * which is the frame the renderer works in.
 * @param {number} raDeg Right ascension, degrees.
 * @param {number} decDeg Declination, degrees.
 * @param {number[]} [out]
 * @returns {number[]} Unit vector.
 */
export function raDecToEclipticVec(raDeg, decDeg, out = [0, 0, 0]) {
  const ra = raDeg * DEG;
  const dec = decDeg * DEG;
  const cd = Math.cos(dec);
  const xe = cd * Math.cos(ra);
  const ye = cd * Math.sin(ra);
  const ze = Math.sin(dec);
  const ce = Math.cos(OBLIQUITY_J2000);
  const se = Math.sin(OBLIQUITY_J2000);
  out[0] = xe;
  out[1] = ye * ce + ze * se;
  out[2] = -ye * se + ze * ce;
  return out;
}

/** Default location of the shipped data files, resolved relative to this module. */
const DEFAULT_DATA_BASE = new URL('./data/', import.meta.url).href;

/**
 * Resolve a possibly-relative data base against the document, so callers may
 * pass either a full URL or a site-root path like `/src/astro/data/`.
 * @param {string} base
 * @returns {URL}
 * @private
 */
function dataBase(base) {
  const origin = typeof location !== 'undefined' ? location.href : DEFAULT_DATA_BASE;
  return new URL(base, origin);
}

/**
 * Load the shipped catalogue.
 * @param {string} [base] Base URL (or path) for the data directory.
 * @returns {Promise<{ra:number[],dec:number[],mag:number[],bv:number[],named:{i:number,n:string,hr:number}[]}>}
 */
export async function loadStarCatalogue(base = DEFAULT_DATA_BASE) {
  const res = await fetch(new URL('stars.json', dataBase(base)));
  if (!res.ok) throw new Error(`Failed to load star catalogue: ${res.status}`);
  return res.json();
}

/**
 * Load constellation figures.
 * @param {string} [base]
 * @returns {Promise<{figures:{id:string,lines:number[][][]}[]}>}
 */
export async function loadConstellations(base = DEFAULT_DATA_BASE) {
  const res = await fetch(new URL('constellations.json', dataBase(base)));
  if (!res.ok) throw new Error(`Failed to load constellations: ${res.status}`);
  return res.json();
}

/**
 * Rasterise the catalogue into an equirectangular HDR sky map.
 *
 * The renderer samples this texture whenever a ray escapes the scene, so stars
 * are automatically occluded by planets and participate in bloom exactly like
 * any other light source — no separate pass, no depth sorting.
 *
 * Layout: `u` maps to ecliptic longitude 0..2*pi, `v` maps to ecliptic latitude
 * -pi/2..+pi/2 (v = 0 at the south ecliptic pole).
 *
 * Each star is splatted as a small Gaussian whose total energy is proportional
 * to its flux, so brightness survives resampling and mip generation.
 *
 * @param {object} cat Catalogue from {@link loadStarCatalogue}.
 * @param {object} [opts]
 * @param {number} [opts.width=4096]
 * @param {number} [opts.height=2048]
 * @param {number} [opts.exposure=1] Global brightness multiplier.
 * @param {number} [opts.milkyWay=1] Strength of the procedural galactic band.
 * @returns {{data:Float32Array, width:number, height:number}} RGB float data.
 */
export function buildSkyMap(cat, opts = {}) {
  const width = opts.width ?? 4096;
  const height = opts.height ?? 2048;
  const exposure = opts.exposure ?? 1;
  const milkyWay = opts.milkyWay ?? 1;
  const data = new Float32Array(width * height * 3);

  if (milkyWay > 0) paintMilkyWay(data, width, height, milkyWay);

  const rgb = [0, 0, 0];
  const n = cat.mag.length;
  for (let s = 0; s < n; s++) {
    const v = raDecToEclipticVec(cat.ra[s], cat.dec[s]);
    // Ecliptic longitude/latitude -> texel coordinates.
    const lon = Math.atan2(v[1], v[0]);
    const lat = Math.asin(Math.max(-1, Math.min(1, v[2])));
    const u = ((lon / (Math.PI * 2)) % 1 + 1) % 1;
    const t = (lat + Math.PI / 2) / Math.PI;

    const px = u * width;
    const py = t * height;

    blackbodyRGB(bvToTemperature(cat.bv[s]), rgb);
    // Pogson flux, scaled so that a magnitude-6.5 star is faint but present and
    // Sirius is genuinely dazzling. The absolute scale is artistic: a real
    // magnitude-0 star delivers ~2e-11 of the Sun's irradiance, which would be
    // invisible next to a sunlit planet in the same frame.
    const flux = magnitudeToFlux(cat.mag[s]) * 15 * exposure;

    // Kernels are deliberately close to one texel. Anything wider turns bright
    // stars into visible discs when the camera zooms in; the glare they should
    // have comes from the bloom pass instead, which is both cheaper and more
    // convincing.
    const radius = cat.mag[s] < 1.0 ? 1.0 : cat.mag[s] < 3.0 ? 0.8 : 0.6;
    splat(data, width, height, px, py, radius, rgb, flux);
  }

  return { data, width, height };
}

/**
 * Additive Gaussian splat with energy normalisation.
 * @private
 */
function splat(data, width, height, px, py, radius, rgb, flux) {
  const r = Math.ceil(radius * 2.5);
  const inv2s2 = 1 / (2 * radius * radius);
  // Normalising by the kernel sum keeps total energy equal to `flux`.
  let norm = 0;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) norm += Math.exp(-(dx * dx + dy * dy) * inv2s2);
  }
  if (norm <= 0) norm = 1;

  const cx = Math.floor(px);
  const cy = Math.floor(py);
  for (let dy = -r; dy <= r; dy++) {
    const y = cy + dy;
    if (y < 0 || y >= height) continue;
    for (let dx = -r; dx <= r; dx++) {
      let x = cx + dx;
      // Longitude wraps.
      x = ((x % width) + width) % width;
      const w = (Math.exp(-(dx * dx + dy * dy) * inv2s2) / norm) * flux;
      const o = (y * width + x) * 3;
      data[o] += rgb[0] * w;
      data[o + 1] += rgb[1] * w;
      data[o + 2] += rgb[2] * w;
    }
  }
}

/**
 * Paint a procedural Milky Way band.
 *
 * The band is placed on the true galactic equator: the north galactic pole is
 * at RA 12h51m26.28s, Dec +27deg07'42" (J2000), per the IAU 1958 definition
 * carried forward by Hipparcos. Density is modulated by fractal noise and by a
 * bulge term centred on the galactic centre so the Sagittarius region is
 * brightest, with dust lanes carved out by a second noise field.
 * @private
 */
function paintMilkyWay(data, width, height, strength) {
  const NGP = raDecToEclipticVec(192.85948, 27.12825); // north galactic pole
  const GC = raDecToEclipticVec(266.405, -28.936); // galactic centre (Sgr A*)

  const v = [0, 0, 0];
  for (let y = 0; y < height; y++) {
    const lat = ((y + 0.5) / height) * Math.PI - Math.PI / 2;
    const cl = Math.cos(lat);
    const sl = Math.sin(lat);
    for (let x = 0; x < width; x++) {
      const lon = ((x + 0.5) / width) * Math.PI * 2;
      v[0] = cl * Math.cos(lon);
      v[1] = cl * Math.sin(lon);
      v[2] = sl;

      // Galactic latitude: angle away from the galactic plane.
      const dotP = v[0] * NGP[0] + v[1] * NGP[1] + v[2] * NGP[2];
      const gLat = Math.asin(Math.max(-1, Math.min(1, dotP)));
      // Angular distance from the galactic centre, for the bulge.
      const dotC = v[0] * GC[0] + v[1] * GC[1] + v[2] * GC[2];

      // Band profile: a narrow core inside a broad halo.
      const b = Math.abs(gLat);
      const band = Math.exp(-(b * b) / 0.010) * 0.90 + Math.exp(-(b * b) / 0.07) * 0.22;
      if (band < 0.002) continue;

      const bulge = 0.55 * Math.exp(-Math.pow(Math.acos(Math.max(-1, Math.min(1, dotC))), 2) / 0.35);

      const nz = fbm(v[0] * 26.0, v[1] * 26.0, v[2] * 26.0, 7);
      const dust = Math.max(0, fbm(v[0] * 47.0 + 41.3, v[1] * 47.0, v[2] * 47.0 - 17.7, 6));

      let i = band * (1 + bulge) * (0.55 + 0.75 * nz);
      i *= 1 - 0.72 * Math.pow(Math.max(0, dust), 1.5) * Math.exp(-(b * b) / 0.02);
      i = Math.max(0, i) * 0.0028 * strength;
      if (i <= 0) continue;

      const o = (y * width + x) * 3;
      // Slightly warm core, cooler halo — matches integrated light of the disc.
      const warm = Math.min(1, bulge * 1.6);
      data[o] += i * (0.88 + 0.12 * warm);
      data[o + 1] += i * (0.86 + 0.06 * warm);
      data[o + 2] += i * (0.92 - 0.10 * warm);
    }
  }
}

/** Deterministic 3D value noise. @private */
function hash3(x, y, z) {
  let h = x * 374761393 + y * 668265263 + z * 2147483647;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

/** @private */
function vnoise(x, y, z) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const xf = x - xi;
  const yf = y - yi;
  const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const w = zf * zf * (3 - 2 * zf);
  const lerp = (a, b, t) => a + (b - a) * t;
  const c = (i, j, k) => hash3(xi + i, yi + j, zi + k);
  return lerp(
    lerp(lerp(c(0, 0, 0), c(1, 0, 0), u), lerp(c(0, 1, 0), c(1, 1, 0), u), v),
    lerp(lerp(c(0, 0, 1), c(1, 0, 1), u), lerp(c(0, 1, 1), c(1, 1, 1), u), v),
    w
  );
}

/** Fractal Brownian motion in [-1, 1]. @private */
function fbm(x, y, z, octaves) {
  let sum = 0;
  let amp = 0.5;
  let f = 1;
  for (let i = 0; i < octaves; i++) {
    sum += amp * (vnoise(x * f, y * f, z * f) * 2 - 1);
    amp *= 0.5;
    f *= 2.07;
  }
  return sum;
}
