/**
 * Natural satellites: mean orbital elements and physical parameters.
 *
 * DATA PROVENANCE
 *  - Mean orbital elements: JPL Solar System Dynamics, "Planetary Satellite
 *    Mean Elements" (https://ssd.jpl.nasa.gov/sats/elem/). JPL warns these are
 *    fitted precessing ellipses intended to describe orbit *shape and
 *    orientation*, not to generate precision ephemerides — which is exactly the
 *    use here. Positional error grows to a few tenths of a degree over decades;
 *    the UI marks satellite positions as approximate.
 *  - Physical parameters: JPL "Planetary Satellite Physical Parameters"
 *    (https://ssd.jpl.nasa.gov/sats/phys_par/).
 *
 * REFERENCE FRAME
 *  Regular satellites are tabulated with respect to their planet's **equator**
 *  (more precisely, the local Laplace plane), not the ecliptic. We therefore
 *  build each satellite's position in the parent's equatorial frame and then
 *  rotate it by the parent's IAU pole. This is why the Uranian system correctly
 *  appears to orbit "sideways" and why Triton is visibly retrograde.
 *
 *  Earth's Moon is the exception: its orbit is referenced to the ecliptic,
 *  which is how it is tabulated and how it physically behaves.
 *
 * @module astro/moons
 */

import { DEG, TAU } from './constants.js';
import { solveKepler, orbitalToEcliptic } from './kepler.js';

/**
 * @typedef {object} MoonRecord
 * @property {string} id
 * @property {string} parent
 * @property {number} a Semi-major axis, km.
 * @property {number} e Eccentricity.
 * @property {number} iDeg Inclination to the reference plane, degrees.
 * @property {number} nodeDeg Longitude of the ascending node at J2000, degrees.
 * @property {number} periDeg Argument of periapsis at J2000, degrees.
 * @property {number} maDeg Mean anomaly at J2000, degrees.
 * @property {number} periodDays Sidereal orbital period (negative = retrograde).
 * @property {'equator'|'ecliptic'} frame Reference plane for the elements.
 * @property {number} radiusKm Mean radius.
 * @property {number} massKg
 * @property {number} albedo Geometric albedo.
 * @property {number[]} color Representative linear-RGB colour.
 * @property {number} [atmosphere] Atmosphere shell thickness / radius.
 * @property {number[]} [rayleigh]
 * @property {string} [texture]
 * @property {boolean} [tidallyLocked]
 */

/** @type {ReadonlyArray<MoonRecord>} */
export const MOONS = Object.freeze([
  // ---- Earth -------------------------------------------------------------
  {
    id: 'moon', parent: 'earth', a: 384400, e: 0.0554, iDeg: 5.16,
    nodeDeg: 125.08, periDeg: 318.15, maDeg: 135.27, periodDays: 27.321582,
    frame: 'ecliptic', radiusKm: 1737.4, massKg: 7.3459e22, albedo: 0.12,
    color: [0.42, 0.4, 0.38], texture: 'moon', tidallyLocked: true,
  },

  // ---- Mars --------------------------------------------------------------
  {
    id: 'phobos', parent: 'mars', a: 9376, e: 0.0151, iDeg: 1.082,
    nodeDeg: 164.93, periDeg: 150.06, maDeg: 92.47, periodDays: 0.31891,
    frame: 'equator', radiusKm: 11.08, massKg: 1.0659e16, albedo: 0.071,
    color: [0.32, 0.28, 0.25], tidallyLocked: true,
  },
  {
    id: 'deimos', parent: 'mars', a: 23458, e: 0.0002, iDeg: 1.791,
    nodeDeg: 339.6, periDeg: 260.73, maDeg: 296.23, periodDays: 1.263,
    frame: 'equator', radiusKm: 6.2, massKg: 1.4762e15, albedo: 0.068,
    color: [0.34, 0.3, 0.27], tidallyLocked: true,
  },

  // ---- Jupiter (Galilean) ------------------------------------------------
  {
    id: 'io', parent: 'jupiter', a: 421800, e: 0.0041, iDeg: 0.036,
    nodeDeg: 43.98, periDeg: 84.13, maDeg: 342.02, periodDays: 1.769138,
    frame: 'equator', radiusKm: 1821.6, massKg: 8.9319e22, albedo: 0.63,
    color: [0.92, 0.82, 0.42], tidallyLocked: true,
  },
  {
    id: 'europa', parent: 'jupiter', a: 671100, e: 0.0094, iDeg: 0.466,
    nodeDeg: 219.11, periDeg: 88.97, maDeg: 171.02, periodDays: 3.551181,
    frame: 'equator', radiusKm: 1560.8, massKg: 4.7998e22, albedo: 0.67,
    color: [0.82, 0.77, 0.68], tidallyLocked: true,
  },
  {
    id: 'ganymede', parent: 'jupiter', a: 1070400, e: 0.0013, iDeg: 0.177,
    nodeDeg: 63.55, periDeg: 192.42, maDeg: 317.54, periodDays: 7.154553,
    frame: 'equator', radiusKm: 2631.2, massKg: 1.4819e23, albedo: 0.43,
    color: [0.55, 0.5, 0.45], tidallyLocked: true,
  },
  {
    id: 'callisto', parent: 'jupiter', a: 1882700, e: 0.0074, iDeg: 0.192,
    nodeDeg: 298.85, periDeg: 52.64, maDeg: 181.41, periodDays: 16.689017,
    frame: 'equator', radiusKm: 2410.3, massKg: 1.0759e23, albedo: 0.17,
    color: [0.35, 0.32, 0.29], tidallyLocked: true,
  },

  // ---- Saturn ------------------------------------------------------------
  {
    id: 'mimas', parent: 'saturn', a: 185539, e: 0.0196, iDeg: 1.574,
    nodeDeg: 173.03, periDeg: 332.5, maDeg: 14.85, periodDays: 0.942422,
    frame: 'equator', radiusKm: 198.2, massKg: 3.7493e19, albedo: 0.962,
    color: [0.82, 0.81, 0.79], tidallyLocked: true,
  },
  {
    id: 'enceladus', parent: 'saturn', a: 238042, e: 0.0047, iDeg: 0.003,
    nodeDeg: 342.51, periDeg: 0.05, maDeg: 199.75, periodDays: 1.370218,
    frame: 'equator', radiusKm: 252.1, massKg: 1.0802e20, albedo: 1.375,
    color: [0.95, 0.96, 0.97], tidallyLocked: true,
  },
  {
    id: 'tethys', parent: 'saturn', a: 294672, e: 0.0001, iDeg: 1.091,
    nodeDeg: 259.84, periDeg: 45.2, maDeg: 243.37, periodDays: 1.887802,
    frame: 'equator', radiusKm: 531.1, massKg: 6.1746e20, albedo: 1.229,
    color: [0.88, 0.88, 0.86], tidallyLocked: true,
  },
  {
    id: 'dione', parent: 'saturn', a: 377415, e: 0.0022, iDeg: 0.028,
    nodeDeg: 290.42, periDeg: 284.32, maDeg: 322.31, periodDays: 2.736915,
    frame: 'equator', radiusKm: 561.4, massKg: 1.0955e21, albedo: 0.998,
    color: [0.82, 0.82, 0.8], tidallyLocked: true,
  },
  {
    id: 'rhea', parent: 'saturn', a: 527068, e: 0.001, iDeg: 0.333,
    nodeDeg: 351.2, periDeg: 241.62, maDeg: 179.78, periodDays: 4.518212,
    frame: 'equator', radiusKm: 763.8, massKg: 2.3065e21, albedo: 0.949,
    color: [0.8, 0.79, 0.77], tidallyLocked: true,
  },
  {
    id: 'titan', parent: 'saturn', a: 1221865, e: 0.0288, iDeg: 0.306,
    nodeDeg: 28.06, periDeg: 180.53, maDeg: 163.12, periodDays: 15.945421,
    frame: 'equator', radiusKm: 2574.7, massKg: 1.3452e23, albedo: 0.2,
    color: [0.78, 0.6, 0.3], atmosphere: 0.100, scaleHeightKm: 21.0, mie: 45,
    rayleigh: [9.0, 11.0, 16.0],
    tidallyLocked: true,
  },
  {
    id: 'iapetus', parent: 'saturn', a: 3560854, e: 0.0293, iDeg: 8.298,
    nodeDeg: 81.46, periDeg: 271.61, maDeg: 201.79, periodDays: 79.32,
    frame: 'equator', radiusKm: 734.5, massKg: 1.8056e21, albedo: 0.6,
    color: [0.5, 0.45, 0.4], tidallyLocked: true,
  },

  // ---- Uranus ------------------------------------------------------------
  {
    id: 'miranda', parent: 'uranus', a: 129390, e: 0.0013, iDeg: 4.338,
    nodeDeg: 326.05, periDeg: 68.31, maDeg: 311.33, periodDays: 1.413479,
    frame: 'equator', radiusKm: 235.8, massKg: 6.4e19, albedo: 0.32,
    color: [0.6, 0.6, 0.6], tidallyLocked: true,
  },
  {
    id: 'ariel', parent: 'uranus', a: 191020, e: 0.0012, iDeg: 0.041,
    nodeDeg: 22.39, periDeg: 115.35, maDeg: 39.48, periodDays: 2.520379,
    frame: 'equator', radiusKm: 578.9, massKg: 1.251e21, albedo: 0.39,
    color: [0.66, 0.66, 0.65], tidallyLocked: true,
  },
  {
    id: 'umbriel', parent: 'uranus', a: 266300, e: 0.0039, iDeg: 0.128,
    nodeDeg: 33.49, periDeg: 84.71, maDeg: 12.47, periodDays: 4.144177,
    frame: 'equator', radiusKm: 584.7, massKg: 1.275e21, albedo: 0.21,
    color: [0.42, 0.42, 0.42], tidallyLocked: true,
  },
  {
    id: 'titania', parent: 'uranus', a: 435910, e: 0.0011, iDeg: 0.079,
    nodeDeg: 99.77, periDeg: 284.4, maDeg: 24.61, periodDays: 8.705872,
    frame: 'equator', radiusKm: 788.9, massKg: 3.4e21, albedo: 0.27,
    color: [0.55, 0.53, 0.5], tidallyLocked: true,
  },
  {
    id: 'oberon', parent: 'uranus', a: 583520, e: 0.0014, iDeg: 0.068,
    nodeDeg: 279.77, periDeg: 104.4, maDeg: 283.09, periodDays: 13.463239,
    frame: 'equator', radiusKm: 761.4, massKg: 3.076e21, albedo: 0.23,
    color: [0.5, 0.47, 0.44], tidallyLocked: true,
  },

  // ---- Neptune -----------------------------------------------------------
  {
    id: 'triton', parent: 'neptune', a: 354759, e: 0.000016, iDeg: 156.865,
    nodeDeg: 172.43, periDeg: 66.14, maDeg: 264.78, periodDays: -5.876854,
    frame: 'equator', radiusKm: 1353.4, massKg: 2.1389e22, albedo: 0.719,
    color: [0.85, 0.8, 0.76], atmosphere: 0.120, scaleHeightKm: 14.0, mie: 2,
    rayleigh: [1.4, 1.8, 2.4],
    tidallyLocked: true,
  },

  // ---- Pluto -------------------------------------------------------------
  {
    id: 'charon', parent: 'pluto', a: 19595, e: 0.0002, iDeg: 0.08,
    nodeDeg: 223.05, periDeg: 146.1, maDeg: 12.24, periodDays: 6.38723,
    frame: 'equator', radiusKm: 606, massKg: 1.586e21, albedo: 0.38,
    color: [0.6, 0.57, 0.54], tidallyLocked: true,
  },
]);

/** @type {Map<string, MoonRecord>} */
export const MOON_BY_ID = new Map(MOONS.map((m) => [m.id, m]));

/** @type {Map<string, MoonRecord[]>} */
export const MOONS_BY_PARENT = MOONS.reduce((map, m) => {
  const list = map.get(m.parent) || [];
  list.push(m);
  map.set(m.parent, list);
  return map;
}, new Map());

/**
 * Position of a satellite relative to its parent, expressed in the satellite's
 * own reference plane (parent equator, or ecliptic for the Moon).
 *
 * @param {MoonRecord} moon
 * @param {number} jd
 * @param {number[]} [out]
 * @returns {number[]} `[x, y, z]` in km.
 */
export function moonPositionLocal(moon, jd, out = [0, 0, 0]) {
  const d = jd - 2451545.0;
  const n = TAU / moon.periodDays; // rad/day; sign carries retrograde motion
  const M = moon.maDeg * DEG + n * d;
  const E = solveKepler(M, moon.e);
  const xp = moon.a * (Math.cos(E) - moon.e);
  const yp = moon.a * Math.sqrt(1 - moon.e * moon.e) * Math.sin(E);
  return orbitalToEcliptic(xp, yp, moon.periDeg * DEG, moon.nodeDeg * DEG, moon.iDeg * DEG, out);
}

/**
 * Build the 3x3 rotation that maps a body's equatorial frame into the J2000
 * ecliptic frame, given the body's spin axis (already in ecliptic coords).
 *
 * The x-axis is chosen as the ascending node of the body's equator on the
 * ecliptic, which is the convention the JPL satellite tables use.
 *
 * @param {number[]} axis Unit spin axis in ecliptic coordinates.
 * @returns {number[]} Column-major-agnostic flat 9-element basis
 *   `[ex, ey, ez]` where each e is a 3-vector: `[e0x,e0y,e0z, e1..., e2...]`.
 */
export function equatorialBasis(axis) {
  // Normalise defensively. Callers pass a spin axis that is unit length in
  // principle, but one that has survived a float32 round-trip is only unit to
  // about 1e-7 — enough to make the resulting basis measurably non-orthonormal
  // and to stretch every satellite orbit built from it.
  const alen = Math.hypot(axis[0], axis[1], axis[2]) || 1;
  const ax = axis[0] / alen;
  const ay = axis[1] / alen;
  const az = axis[2] / alen;
  // Ascending node direction: z_ecliptic x axis, normalised.
  let nx = -ay;
  let ny = ax;
  let nz = 0;
  const nlen = Math.hypot(nx, ny, nz);
  if (nlen < 1e-9) {
    // Axis is (anti)parallel to the ecliptic pole: any equatorial x works.
    nx = 1; ny = 0; nz = 0;
  } else {
    nx /= nlen; ny /= nlen; nz /= nlen;
  }
  // y = axis x x
  const yx = ay * nz - az * ny;
  const yy = az * nx - ax * nz;
  const yz = ax * ny - ay * nx;
  return [nx, ny, nz, yx, yy, yz, ax, ay, az];
}

/**
 * Rotate a vector expressed in a body's equatorial frame into the ecliptic.
 * @param {number[]} v Local vector.
 * @param {number[]} basis Result of {@link equatorialBasis}.
 * @param {number[]} [out]
 * @returns {number[]}
 */
export function localToEcliptic(v, basis, out = [0, 0, 0]) {
  out[0] = basis[0] * v[0] + basis[3] * v[1] + basis[6] * v[2];
  out[1] = basis[1] * v[0] + basis[4] * v[1] + basis[7] * v[2];
  out[2] = basis[2] * v[0] + basis[5] * v[1] + basis[8] * v[2];
  return out;
}
