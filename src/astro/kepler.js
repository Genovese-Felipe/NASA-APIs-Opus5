/**
 * Two-body (Keplerian) orbital mechanics.
 *
 * Implements the procedure documented by JPL Solar System Dynamics in
 * "Approximate Positions of the Planets"
 * (https://ssd.jpl.nasa.gov/planets/approx_pos.html), which is itself derived
 * from E. M. Standish & J. G. Williams (1992).
 *
 * All angles in this module are in RADIANS unless a name ends in `Deg`.
 *
 * @module astro/kepler
 */

import { TAU, DEG } from './constants.js';

/**
 * Solve Kepler's equation  M = E - e*sin(E)  for the eccentric anomaly E.
 *
 * Uses the Newton–Raphson iteration recommended by JPL, seeded with
 * `E0 = M + e*sin(M)`. For the eccentricities found in the solar system
 * (e < 0.25 for planets, up to ~0.97 for comets) this converges in a handful
 * of iterations. A damped step guards the near-parabolic case.
 *
 * @param {number} M Mean anomaly, radians.
 * @param {number} e Eccentricity (0 <= e < 1).
 * @param {number} [tol=1e-10] Convergence tolerance on |dE|, radians.
 * @param {number} [maxIter=60] Iteration cap.
 * @returns {number} Eccentric anomaly E, radians.
 */
export function solveKepler(M, e, tol = 1e-10, maxIter = 60) {
  // Bring M into [-pi, pi] so the seed is close to the root.
  let m = M % TAU;
  if (m > Math.PI) m -= TAU;
  else if (m < -Math.PI) m += TAU;

  let E = e < 0.8 ? m + e * Math.sin(m) : Math.PI * Math.sign(m || 1);

  for (let i = 0; i < maxIter; i++) {
    const dM = m - (E - e * Math.sin(E));
    const denom = 1 - e * Math.cos(E);
    // Guard against a vanishing derivative at high eccentricity near perihelion.
    let dE = dM / (Math.abs(denom) < 1e-12 ? 1e-12 : denom);
    if (dE > 0.5) dE = 0.5;
    else if (dE < -0.5) dE = -0.5;
    E += dE;
    if (Math.abs(dE) < tol) break;
  }
  return E;
}

/**
 * Solve the hyperbolic Kepler equation  M = e*sinh(H) - H.
 * Used for interstellar / hyperbolic small bodies (e > 1).
 *
 * @param {number} M Hyperbolic mean anomaly.
 * @param {number} e Eccentricity (> 1).
 * @param {number} [tol=1e-10]
 * @param {number} [maxIter=100]
 * @returns {number} Hyperbolic anomaly H.
 */
export function solveKeplerHyperbolic(M, e, tol = 1e-10, maxIter = 100) {
  let H = Math.abs(M) > 6 ? Math.sign(M) * Math.log((2 * Math.abs(M)) / e + 1.8) : M / (e - 1);
  for (let i = 0; i < maxIter; i++) {
    const f = e * Math.sinh(H) - H - M;
    const fp = e * Math.cosh(H) - 1;
    const dH = -f / (Math.abs(fp) < 1e-12 ? 1e-12 : fp);
    H += dH;
    if (Math.abs(dH) < tol) break;
  }
  return H;
}

/**
 * True anomaly from eccentric anomaly.
 * @param {number} E Eccentric anomaly, radians.
 * @param {number} e Eccentricity.
 * @returns {number} True anomaly, radians.
 */
export function trueAnomaly(E, e) {
  return 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2));
}

/**
 * Rotate a position from the orbital plane into the reference (ecliptic) frame.
 *
 * Implements  r_ecl = Rz(-Omega) Rx(-I) Rz(-omega) r'  exactly as written in
 * the JPL document.
 *
 * @param {number} xp In-plane x (towards perihelion).
 * @param {number} yp In-plane y.
 * @param {number} omega Argument of perihelion, radians.
 * @param {number} Omega Longitude of ascending node, radians.
 * @param {number} I Inclination, radians.
 * @param {number[]} [out] Optional 3-element output array.
 * @returns {number[]} `[x, y, z]` in the reference frame.
 */
export function orbitalToEcliptic(xp, yp, omega, Omega, I, out = [0, 0, 0]) {
  const cw = Math.cos(omega);
  const sw = Math.sin(omega);
  const cO = Math.cos(Omega);
  const sO = Math.sin(Omega);
  const cI = Math.cos(I);
  const sI = Math.sin(I);

  out[0] = (cw * cO - sw * sO * cI) * xp + (-sw * cO - cw * sO * cI) * yp;
  out[1] = (cw * sO + sw * cO * cI) * xp + (-sw * sO + cw * cO * cI) * yp;
  out[2] = sw * sI * xp + cw * sI * yp;
  return out;
}

/**
 * @typedef {object} OrbitalElements
 * @property {number} a   Semi-major axis (any length unit; output uses the same).
 * @property {number} e   Eccentricity.
 * @property {number} i   Inclination, radians.
 * @property {number} om  Longitude of the ascending node, radians.
 * @property {number} w   Argument of perihelion, radians.
 * @property {number} M   Mean anomaly at the requested epoch, radians.
 */

/**
 * Convert classical orbital elements to a position vector in the reference
 * frame (elliptical orbits only).
 *
 * @param {OrbitalElements} el
 * @param {number[]} [out]
 * @returns {number[]} `[x, y, z]` in the same length unit as `el.a`.
 */
export function elementsToPosition(el, out = [0, 0, 0]) {
  const E = solveKepler(el.M, el.e);
  const xp = el.a * (Math.cos(E) - el.e);
  const yp = el.a * Math.sqrt(1 - el.e * el.e) * Math.sin(E);
  return orbitalToEcliptic(xp, yp, el.w, el.om, el.i, out);
}

/**
 * Position **and** velocity from classical elements.
 *
 * @param {OrbitalElements} el
 * @param {number} mu Gravitational parameter GM of the central body, in
 *   `(length unit of a)^3 / s^2`.
 * @returns {{position:number[], velocity:number[]}} velocity is per second.
 */
export function elementsToState(el, mu) {
  const E = solveKepler(el.M, el.e);
  const cosE = Math.cos(E);
  const sinE = Math.sin(E);
  const sqrt1me2 = Math.sqrt(1 - el.e * el.e);

  const xp = el.a * (cosE - el.e);
  const yp = el.a * sqrt1me2 * sinE;

  const n = Math.sqrt(mu / (el.a * el.a * el.a)); // mean motion, rad/s
  const Edot = n / (1 - el.e * cosE);
  const vxp = -el.a * sinE * Edot;
  const vyp = el.a * sqrt1me2 * cosE * Edot;

  return {
    position: orbitalToEcliptic(xp, yp, el.w, el.om, el.i),
    velocity: orbitalToEcliptic(vxp, vyp, el.w, el.om, el.i),
  };
}

/**
 * Sample an orbit as a closed polyline, for drawing orbit paths.
 *
 * Samples are distributed in eccentric anomaly rather than true anomaly, which
 * naturally concentrates points near perihelion where curvature is highest.
 *
 * @param {Omit<OrbitalElements,'M'>} el
 * @param {number} [segments=256] Number of sample points.
 * @returns {Float32Array} Flat `[x,y,z, x,y,z, ...]`, `segments` points.
 */
export function sampleOrbit(el, segments = 256) {
  const pts = new Float32Array(segments * 3);
  const b = el.a * Math.sqrt(1 - el.e * el.e);
  const tmp = [0, 0, 0];
  for (let k = 0; k < segments; k++) {
    const E = (k / segments) * TAU;
    const xp = el.a * (Math.cos(E) - el.e);
    const yp = b * Math.sin(E);
    orbitalToEcliptic(xp, yp, el.w, el.om, el.i, tmp);
    pts[k * 3] = tmp[0];
    pts[k * 3 + 1] = tmp[1];
    pts[k * 3 + 2] = tmp[2];
  }
  return pts;
}

/**
 * Orbital period from the semi-major axis and central GM (Kepler's third law).
 * @param {number} a Semi-major axis, km.
 * @param {number} mu GM of the primary, km^3/s^2.
 * @returns {number} Period in seconds.
 */
export function orbitalPeriod(a, mu) {
  return TAU * Math.sqrt((a * a * a) / mu);
}

/**
 * Build an {@link OrbitalElements} object from a JPL-style small-body record,
 * propagating the mean anomaly from its epoch to the requested date.
 *
 * Angles in the input are in DEGREES, matching NeoWs / SBDB conventions.
 *
 * @param {object} rec
 * @param {number} rec.a Semi-major axis, au.
 * @param {number} rec.e Eccentricity.
 * @param {number} rec.i Inclination, degrees.
 * @param {number} rec.om Longitude of ascending node, degrees.
 * @param {number} rec.w Argument of perihelion, degrees.
 * @param {number} rec.ma Mean anomaly at epoch, degrees.
 * @param {number} rec.epoch Julian Date of the elements.
 * @param {number} [rec.n] Mean motion, degrees/day. Derived from `a` if absent.
 * @param {number} jd Julian Date to propagate to.
 * @returns {OrbitalElements} Elements with `a` in au and angles in radians.
 */
export function smallBodyElementsAt(rec, jd) {
  const a = Number(rec.a);
  const e = Number(rec.e);
  // Mean motion in degrees/day. GM_sun expressed in au^3/day^2 gives
  // n = 0.9856076686 / (a^1.5) deg/day (Gaussian gravitational constant).
  const n = rec.n != null && Number.isFinite(Number(rec.n))
    ? Number(rec.n)
    : 0.9856076686 / Math.pow(Math.abs(a), 1.5);
  const dt = jd - Number(rec.epoch);
  const Mdeg = Number(rec.ma) + n * dt;
  return {
    a,
    e,
    i: Number(rec.i) * DEG,
    om: Number(rec.om) * DEG,
    w: Number(rec.w) * DEG,
    M: (((Mdeg % 360) + 360) % 360) * DEG,
  };
}
