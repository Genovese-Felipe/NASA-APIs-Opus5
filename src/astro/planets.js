/**
 * Planetary Keplerian elements, physical parameters, and rotational models.
 *
 * DATA PROVENANCE — every number below is transcribed from a primary source.
 * Nothing here is estimated.
 *
 *  1. Keplerian elements and rates
 *     E. M. Standish & J. G. Williams (1992), published by JPL Solar System
 *     Dynamics as "Approximate Positions of the Planets".
 *     https://ssd.jpl.nasa.gov/planets/approx_pos.html
 *     Two fits are provided: `ELEMENTS_1800_2050` (higher accuracy, narrow
 *     window) and `ELEMENTS_3000BC_3000AD` (wide window, with the additional
 *     b/c/s/f terms of Table 2b for Jupiter..Neptune).
 *
 *  2. Physical parameters (radius, mass, density, rotation, albedo)
 *     JPL Solar System Dynamics, "Planetary Physical Parameters".
 *     https://ssd.jpl.nasa.gov/planets/phys_par.html
 *
 *  3. Rotational elements (pole right ascension/declination, prime meridian)
 *     "Report of the IAU Working Group on Cartographic Coordinates and
 *     Rotational Elements: 2015", Archinal et al., Celest Mech Dyn Astr (2018).
 *
 *  4. Ring geometry
 *     NASA Planetary Data System Ring-Moon Systems Node and the Cassini
 *     mission ring nomenclature.
 *
 * @module astro/planets
 */

import { DEG, DAYS_PER_CENTURY, JD_J2000 } from './constants.js';
import { solveKepler, orbitalToEcliptic } from './kepler.js';

/**
 * Table 1 of the JPL document — valid 1800 AD to 2050 AD.
 *
 * Row layout: `[a, e, I, L, longPeri, longNode]` followed by the same six
 * quantities as per-century rates. Units: au, radians (e), degrees.
 * @type {Readonly<Record<string, {el:number[], rate:number[]}>>}
 */
export const ELEMENTS_1800_2050 = Object.freeze({
  mercury: {
    el: [0.38709927, 0.20563593, 7.00497902, 252.2503235, 77.45779628, 48.33076593],
    rate: [0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081],
  },
  venus: {
    el: [0.72333566, 0.00677672, 3.39467605, 181.9790995, 131.60246718, 76.67984255],
    rate: [0.0000039, -0.00004107, -0.0007889, 58517.81538729, 0.00268329, -0.27769418],
  },
  earth: {
    el: [1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0.0],
    rate: [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0.0],
  },
  mars: {
    el: [1.52371034, 0.0933941, 1.84969142, -4.55343205, -23.94362959, 49.55953891],
    rate: [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343],
  },
  jupiter: {
    el: [5.202887, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909],
    rate: [-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106],
  },
  saturn: {
    el: [9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448],
    rate: [-0.0012506, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794],
  },
  uranus: {
    el: [19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.9542763, 74.01692503],
    rate: [-0.00196176, -0.00004397, -0.00242939, 428.48202785, 0.40805281, 0.04240589],
  },
  neptune: {
    el: [30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574],
    rate: [0.00026291, 0.00005105, 0.00035372, 218.45945325, -0.32241464, -0.00508664],
  },
});

/**
 * Table 2a of the JPL document — valid 3000 BC to 3000 AD.
 * Jupiter..Neptune additionally require {@link EXTRA_TERMS}.
 * @type {Readonly<Record<string, {el:number[], rate:number[]}>>}
 */
export const ELEMENTS_3000BC_3000AD = Object.freeze({
  mercury: {
    el: [0.38709843, 0.20563661, 7.00559432, 252.25166724, 77.45771895, 48.33961819],
    rate: [0.0, 0.00002123, -0.00590158, 149472.67486623, 0.15940013, -0.12214182],
  },
  venus: {
    el: [0.72332102, 0.00676399, 3.39777545, 181.9797085, 131.76755713, 76.67261496],
    rate: [-0.00000026, -0.00005107, 0.00043494, 58517.8156026, 0.05679648, -0.27274174],
  },
  earth: {
    el: [1.00000018, 0.01673163, -0.00054346, 100.46691572, 102.93005885, -5.11260389],
    rate: [-0.00000003, -0.00003661, -0.01337178, 35999.37306329, 0.3179526, -0.24123856],
  },
  mars: {
    el: [1.52371243, 0.09336511, 1.85181869, -4.56813164, -23.91744784, 49.71320984],
    rate: [0.00000097, 0.00009149, -0.00724757, 19140.29934243, 0.45223625, -0.26852431],
  },
  jupiter: {
    el: [5.20248019, 0.0485359, 1.29861416, 34.33479152, 14.27495244, 100.29282654],
    rate: [-0.00002864, 0.00018026, -0.00322699, 3034.90371757, 0.18199196, 0.13024619],
  },
  saturn: {
    el: [9.54149883, 0.05550825, 2.49424102, 50.07571329, 92.86136063, 113.63998702],
    rate: [-0.00003065, -0.00032044, 0.00451969, 1222.11494724, 0.54179478, -0.25015002],
  },
  uranus: {
    el: [19.18797948, 0.0468574, 0.77298127, 314.20276625, 172.43404441, 73.96250215],
    rate: [-0.00020455, -0.0000155, -0.00180155, 428.49512595, 0.09266985, 0.05739699],
  },
  neptune: {
    el: [30.06952752, 0.00895439, 1.7700552, 304.22289287, 46.68158724, 131.78635853],
    rate: [0.00006447, 0.00000818, 0.000224, 218.46515314, 0.01009938, -0.00606302],
  },
});

/**
 * Table 2b — extra terms `[b, c, s, f]` added to the mean anomaly of the outer
 * planets when using the 3000 BC – 3000 AD fit.
 * @type {Readonly<Record<string, number[]>>}
 */
export const EXTRA_TERMS = Object.freeze({
  jupiter: [-0.00012452, 0.0606406, -0.35635438, 38.35125],
  saturn: [0.00025899, -0.13434469, 0.87320147, 38.35125],
  uranus: [0.00058331, -0.97731848, 0.17689245, 7.67025],
  neptune: [-0.00041348, 0.68346318, -0.10162547, 7.67025],
});

/**
 * Pluto is absent from the modern JPL table (it was removed when Pluto was
 * reclassified). These elements are the classical Standish 1992 Pluto row,
 * retained because the app still shows Pluto. Accuracy is markedly lower than
 * for the eight planets — the UI labels Pluto's position as approximate.
 * @type {Readonly<{el:number[], rate:number[]}>}
 */
export const PLUTO_ELEMENTS = Object.freeze({
  el: [39.48211675, 0.2488273, 17.14001206, 238.92903833, 224.06891629, 110.30393684],
  rate: [-0.00031596, 0.0000517, 0.00004818, 145.20780515, -0.04062942, -0.01183482],
});

/**
 * Heliocentric ecliptic position of a planet, in astronomical units.
 *
 * Follows the JPL recipe exactly:
 *   1. linear propagation of the six elements
 *   2. omega = longPeri - longNode ; M = L - longPeri (+ b T^2 + c cos fT + s sin fT)
 *   3. wrap M to [-180, 180], solve Kepler
 *   4. rotate the in-plane vector to the J2000 ecliptic
 *
 * @param {string} id Planet id (`mercury` … `neptune`, or `pluto`).
 * @param {number} jd Julian Date.
 * @param {number[]} [out] Optional 3-element output.
 * @returns {number[]} `[x, y, z]` in au, J2000 ecliptic frame.
 */
export function planetPosition(id, jd, out = [0, 0, 0]) {
  const T = (jd - JD_J2000) / DAYS_PER_CENTURY;
  const wide = T < -2 || T > 0.5;

  let src;
  let extra = null;
  if (id === 'pluto') {
    src = PLUTO_ELEMENTS;
  } else if (wide) {
    src = ELEMENTS_3000BC_3000AD[id];
    extra = EXTRA_TERMS[id] || null;
  } else {
    src = ELEMENTS_1800_2050[id];
  }
  if (!src) throw new Error(`planetPosition: unknown body "${id}"`);

  const a = src.el[0] + src.rate[0] * T;
  const e = src.el[1] + src.rate[1] * T;
  const I = (src.el[2] + src.rate[2] * T) * DEG;
  const L = src.el[3] + src.rate[3] * T;
  const wbar = src.el[4] + src.rate[4] * T;
  const Omega = (src.el[5] + src.rate[5] * T) * DEG;

  const omega = wbar * DEG - Omega;

  let Mdeg = L - wbar;
  if (extra) {
    const [b, c, s, f] = extra;
    const fT = f * T * DEG;
    Mdeg += b * T * T + c * Math.cos(fT) + s * Math.sin(fT);
  }
  // Wrap to [-180, 180] as the document requires.
  Mdeg = ((((Mdeg + 180) % 360) + 360) % 360) - 180;

  const E = solveKepler(Mdeg * DEG, e);
  const xp = a * (Math.cos(E) - e);
  const yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  return orbitalToEcliptic(xp, yp, omega, Omega, I, out);
}

/**
 * The six osculating elements of a planet at a given date, in the form
 * consumed by {@link module:astro/kepler.sampleOrbit}.
 * @param {string} id
 * @param {number} jd
 * @returns {{a:number,e:number,i:number,om:number,w:number,M:number}}
 */
export function planetElements(id, jd) {
  const T = (jd - JD_J2000) / DAYS_PER_CENTURY;
  const wide = T < -2 || T > 0.5;
  const src = id === 'pluto' ? PLUTO_ELEMENTS : wide ? ELEMENTS_3000BC_3000AD[id] : ELEMENTS_1800_2050[id];
  if (!src) throw new Error(`planetElements: unknown body "${id}"`);
  const a = src.el[0] + src.rate[0] * T;
  const e = src.el[1] + src.rate[1] * T;
  const i = (src.el[2] + src.rate[2] * T) * DEG;
  const L = src.el[3] + src.rate[3] * T;
  const wbar = src.el[4] + src.rate[4] * T;
  const om = (src.el[5] + src.rate[5] * T) * DEG;
  return { a, e, i, om, w: wbar * DEG - om, M: (L - wbar) * DEG };
}

/**
 * IAU 2015 rotational elements.
 *
 * `ra0`/`dec0` are the J2000 pole direction in degrees, `raT`/`decT` their
 * per-century drift, `w0` the prime-meridian angle at J2000 and `wDot` its
 * rate in degrees per day. A negative `wDot` denotes retrograde rotation.
 * @type {Readonly<Record<string,{ra0:number,raT:number,dec0:number,decT:number,w0:number,wDot:number}>>}
 */
export const IAU_POLES = Object.freeze({
  sun: { ra0: 286.13, raT: 0, dec0: 63.87, decT: 0, w0: 84.176, wDot: 14.1844 },
  mercury: { ra0: 281.0103, raT: -0.0328, dec0: 61.4155, decT: -0.0049, w0: 329.5988, wDot: 6.1385108 },
  venus: { ra0: 272.76, raT: 0, dec0: 67.16, decT: 0, w0: 160.2, wDot: -1.4813688 },
  earth: { ra0: 0.0, raT: -0.641, dec0: 90.0, decT: -0.557, w0: 190.147, wDot: 360.9856235 },
  moon: { ra0: 269.9949, raT: 0.0031, dec0: 66.5392, decT: 0.013, w0: 38.3213, wDot: 13.17635815 },
  mars: { ra0: 317.269202, raT: -0.10927547, dec0: 54.432516, decT: -0.05827105, w0: 176.049863, wDot: 350.891982443297 },
  jupiter: { ra0: 268.056595, raT: -0.006499, dec0: 64.495303, decT: 0.002413, w0: 284.95, wDot: 870.536 },
  saturn: { ra0: 40.589, raT: -0.036, dec0: 83.537, decT: -0.004, w0: 38.9, wDot: 810.7939024 },
  uranus: { ra0: 257.311, raT: 0, dec0: -15.175, decT: 0, w0: 203.81, wDot: -501.1600928 },
  neptune: { ra0: 299.36, raT: 0, dec0: 43.46, decT: 0, w0: 253.18, wDot: 536.3128492 },
  pluto: { ra0: 132.993, raT: 0, dec0: -6.163, decT: 0, w0: 302.695, wDot: 56.3625225 },
});

/**
 * Spin-axis direction (unit vector, J2000 **ecliptic** frame) and prime
 * meridian angle for a body at a given date.
 *
 * @param {string} id
 * @param {number} jd
 * @param {number} obliquity Obliquity of the ecliptic, radians.
 * @returns {{axis:number[], spin:number}} `axis` is a unit vector; `spin` is
 *   the prime-meridian angle W in radians.
 */
export function bodyOrientation(id, jd, obliquity) {
  const p = IAU_POLES[id];
  if (!p) return { axis: [0, 0, 1], spin: 0 };
  const T = (jd - JD_J2000) / DAYS_PER_CENTURY;
  const d = jd - JD_J2000;
  const ra = (p.ra0 + p.raT * T) * DEG;
  const dec = (p.dec0 + p.decT * T) * DEG;

  // Pole vector in the J2000 equatorial frame.
  const cx = Math.cos(dec) * Math.cos(ra);
  const cy = Math.cos(dec) * Math.sin(ra);
  const cz = Math.sin(dec);

  // Equatorial -> ecliptic (rotate by -obliquity about x).
  const ce = Math.cos(obliquity);
  const se = Math.sin(obliquity);
  const axis = [cx, cy * ce + cz * se, -cy * se + cz * ce];

  const W = (((p.w0 + p.wDot * d) % 360) + 360) % 360;
  return { axis, spin: W * DEG };
}

/**
 * @typedef {object} RingBand
 * @property {string} name Ring nomenclature (e.g. "B Ring", "Cassini Division").
 * @property {number} inner Inner radius, km.
 * @property {number} outer Outer radius, km.
 * @property {number} opacity Representative normal optical depth, 0..1 scaled
 *   for rendering (not a photometric optical depth).
 * @property {number[]} color Linear RGB tint.
 */

/**
 * Ring systems. Radii are measured from the planet's centre, in kilometres.
 *
 * ON `opacity`, AND WHERE IT DEPARTS FROM PHYSICS
 *
 * Radii are published values. Opacity is not: it is a rendering quantity, and
 * for three of the four systems it has to be, because the true normal optical
 * depths span eight orders of magnitude and four of them are invisible.
 *
 * Saturn is honest — its B ring really is close to opaque and its C ring really
 * is a fifth as thick, so those numbers are near the measured ones. Jupiter is
 * not: the main ring's true normal optical depth is about 5e-6 and the gossamer
 * rings are nearer 1e-7. Rendered faithfully, Jupiter has no rings, which is
 * also what you see through a telescope — they were not discovered until
 * Voyager 1 flew through their plane in 1979 and looked back at them in
 * forward-scattered light.
 *
 * So Jupiter's rings are exaggerated by roughly three orders of magnitude, to
 * the point where they read as a faint dusty haze in a dark frame and nothing
 * more. They must stay faint enough not to cast a visible shadow on the cloud
 * tops: a shadow is a claim about optical depth that these rings cannot support.
 * Uranus and Neptune are exaggerated far less — their main rings genuinely are
 * optically thick — and only their dust bands are lifted.
 *
 * @type {Readonly<Record<string, RingBand[]>>}
 */
export const RING_SYSTEMS = Object.freeze({
  jupiter: [
    { name: 'Halo Ring', inner: 92000, outer: 122500, opacity: 0.003, color: [0.55, 0.45, 0.4] },
    { name: 'Main Ring', inner: 122500, outer: 129000, opacity: 0.012, color: [0.7, 0.55, 0.45] },
    { name: 'Amalthea Gossamer Ring', inner: 129000, outer: 182000, opacity: 0.0016, color: [0.6, 0.5, 0.45] },
    { name: 'Thebe Gossamer Ring', inner: 182000, outer: 226000, opacity: 0.0008, color: [0.55, 0.48, 0.45] },
  ],
  saturn: [
    { name: 'D Ring', inner: 66900, outer: 74510, opacity: 0.05, color: [0.62, 0.58, 0.5] },
    { name: 'C Ring', inner: 74658, outer: 92000, opacity: 0.28, color: [0.66, 0.6, 0.52] },
    { name: 'B Ring', inner: 92000, outer: 117580, opacity: 0.95, color: [0.93, 0.87, 0.75] },
    { name: 'Cassini Division', inner: 117580, outer: 122170, opacity: 0.12, color: [0.6, 0.56, 0.5] },
    { name: 'A Ring', inner: 122170, outer: 136775, opacity: 0.62, color: [0.86, 0.81, 0.71] },
    { name: 'F Ring', inner: 140180, outer: 140680, opacity: 0.35, color: [0.9, 0.88, 0.82] },
  ],
  uranus: [
    { name: 'Zeta Ring', inner: 37850, outer: 41350, opacity: 0.02, color: [0.4, 0.45, 0.5] },
    { name: 'Rings 6-4', inner: 41837, outer: 42571, opacity: 0.2, color: [0.42, 0.47, 0.52] },
    { name: 'Alpha & Beta Rings', inner: 44718, outer: 45661, opacity: 0.28, color: [0.42, 0.47, 0.52] },
    { name: 'Eta, Gamma, Delta Rings', inner: 47176, outer: 48300, opacity: 0.25, color: [0.42, 0.47, 0.52] },
    { name: 'Epsilon Ring', inner: 51149, outer: 51249, opacity: 0.6, color: [0.45, 0.5, 0.55] },
  ],
  neptune: [
    { name: 'Galle Ring', inner: 41900, outer: 43900, opacity: 0.02, color: [0.35, 0.45, 0.6] },
    { name: 'Le Verrier Ring', inner: 53100, outer: 53300, opacity: 0.12, color: [0.35, 0.45, 0.6] },
    { name: 'Lassell / Arago', inner: 53300, outer: 57600, opacity: 0.02, color: [0.34, 0.44, 0.58] },
    { name: 'Adams Ring', inner: 62832, outer: 63032, opacity: 0.2, color: [0.36, 0.46, 0.62] },
  ],
});

/**
 * @typedef {object} BodyRecord
 * @property {string} id Stable identifier used everywhere in the app.
 * @property {'star'|'planet'|'dwarf'|'moon'} kind
 * @property {string|null} parent Parent body id, or null for the Sun.
 * @property {number} radiusKm Equatorial radius.
 * @property {number} flattening Geometric flattening (a-b)/a.
 * @property {number} massKg
 * @property {number} densityGcm3
 * @property {number} rotationDays Sidereal rotation period; negative = retrograde.
 * @property {number} obliquityDeg Axial tilt relative to the orbital plane.
 * @property {number} albedo Geometric albedo.
 * @property {number} [orbitDays] Sidereal orbital period, days.
 * @property {number} [meanTempK]
 * @property {number} [moons] Number of confirmed natural satellites.
 * @property {number[]} color Representative linear-RGB surface colour.
 * @property {number} [atmosphere] Atmospheric shell thickness as a fraction of
 *   the radius. Sized at roughly twelve scale heights, beyond which the
 *   remaining density contributes nothing visible. 0 means airless.
 * @property {number} [scaleHeightKm] Pressure scale height of the atmosphere.
 * @property {number} [mie] Mie (aerosol) scattering coefficient, per megametre.
 * @property {number[]} [rayleigh] Rayleigh scattering coefficients in units of
 *   1/megametre, i.e. the standard 1e-6 m^-1 figures used verbatim. For Earth
 *   these are the textbook 5.8 / 13.5 / 33.1 at 680 / 550 / 440 nm, which with
 *   an 8.5 km scale height gives the correct vertical optical depth of ~0.11.
 * @property {number} [emissive] Self-luminosity multiplier (Sun only).
 * @property {string} [texture] Key into the imagery registry.
 */

/**
 * The solar system catalogue.
 *
 * Masses, radii, densities, rotation periods and albedos come from JPL's
 * Planetary Physical Parameters table. Obliquities are the widely published
 * IAU values (tilt of the equator to the orbit plane). Moon counts are the
 * IAU-confirmed totals as of the 2026 catalogue.
 * @type {ReadonlyArray<BodyRecord>}
 */
export const BODIES = Object.freeze([
  {
    id: 'sun', kind: 'star', parent: null,
    radiusKm: 695700, flattening: 0.00005, massKg: 1.98847e30, densityGcm3: 1.408,
    rotationDays: 25.38, obliquityDeg: 7.25, albedo: 0, meanTempK: 5772,
    color: [1.0, 0.92, 0.78], emissive: 1, atmosphere: 0.0,
  },
  {
    id: 'mercury', kind: 'planet', parent: 'sun',
    radiusKm: 2440.53, flattening: 0.0009, massKg: 3.30103e23, densityGcm3: 5.4289,
    rotationDays: 58.6462, orbitDays: 87.9691, obliquityDeg: 0.034, albedo: 0.106,
    meanTempK: 440, moons: 0, color: [0.55, 0.5, 0.47], atmosphere: 0,
    texture: 'mercury',
  },
  {
    id: 'venus', kind: 'planet', parent: 'sun',
    radiusKm: 6051.8, flattening: 0, massKg: 4.86731e24, densityGcm3: 5.243,
    rotationDays: -243.018, orbitDays: 224.701, obliquityDeg: 177.36, albedo: 0.65,
    meanTempK: 737, moons: 0, color: [0.93, 0.85, 0.66], atmosphere: 0.030, scaleHeightKm: 15.9, mie: 90,
    rayleigh: [25.0, 30.0, 37.0],
  },
  {
    id: 'earth', kind: 'planet', parent: 'sun',
    radiusKm: 6378.1366, flattening: 0.0033528, massKg: 5.97217e24, densityGcm3: 5.5134,
    rotationDays: 0.99726968, orbitDays: 365.256, obliquityDeg: 23.4393, albedo: 0.367,
    meanTempK: 288, moons: 1, color: [0.16, 0.28, 0.45], atmosphere: 0.0157, scaleHeightKm: 8.5, mie: 21,
    rayleigh: [5.8, 13.5, 33.1], texture: 'earth',
  },
  {
    id: 'mars', kind: 'planet', parent: 'sun',
    radiusKm: 3396.19, flattening: 0.00589, massKg: 6.41691e23, densityGcm3: 3.934,
    rotationDays: 1.02595676, orbitDays: 686.98, obliquityDeg: 25.19, albedo: 0.15,
    meanTempK: 210, moons: 2, color: [0.62, 0.36, 0.22], atmosphere: 0.0350, scaleHeightKm: 11.1, mie: 9,
    rayleigh: [3.0, 2.2, 1.6], texture: 'mars',
  },
  {
    id: 'jupiter', kind: 'planet', parent: 'sun',
    radiusKm: 71492, flattening: 0.06487, massKg: 1.898125e27, densityGcm3: 1.3262,
    rotationDays: 0.41354, orbitDays: 4332.589, obliquityDeg: 3.13, albedo: 0.52,
    meanTempK: 165, moons: 97, color: [0.78, 0.68, 0.56], atmosphere: 0.0100, scaleHeightKm: 27.0, mie: 5,
    rayleigh: [6.5, 8.2, 12.0],
  },
  {
    id: 'saturn', kind: 'planet', parent: 'sun',
    radiusKm: 60268, flattening: 0.09796, massKg: 5.68317e26, densityGcm3: 0.6871,
    rotationDays: 0.44401, orbitDays: 10759.22, obliquityDeg: 26.73, albedo: 0.47,
    meanTempK: 134, moons: 274, color: [0.85, 0.76, 0.58], atmosphere: 0.0130, scaleHeightKm: 59.5, mie: 4,
    rayleigh: [5.4, 7.0, 10.0],
  },
  {
    id: 'uranus', kind: 'planet', parent: 'sun',
    radiusKm: 25559, flattening: 0.02293, massKg: 8.68099e25, densityGcm3: 1.27,
    rotationDays: -0.71833, orbitDays: 30685.4, obliquityDeg: 97.77, albedo: 0.51,
    meanTempK: 76, moons: 28, color: [0.55, 0.78, 0.8], atmosphere: 0.0140, scaleHeightKm: 27.7, mie: 3,
    rayleigh: [4.0, 12.0, 22.0],
  },
  {
    id: 'neptune', kind: 'planet', parent: 'sun',
    radiusKm: 24764, flattening: 0.01708, massKg: 1.024092e26, densityGcm3: 1.638,
    rotationDays: 0.67125, orbitDays: 60189, obliquityDeg: 28.32, albedo: 0.41,
    meanTempK: 72, moons: 16, color: [0.24, 0.4, 0.78], atmosphere: 0.0110, scaleHeightKm: 19.7, mie: 3,
    rayleigh: [4.0, 14.0, 30.0],
  },
  {
    id: 'pluto', kind: 'dwarf', parent: 'sun',
    radiusKm: 1188.3, flattening: 0, massKg: 1.30246e22, densityGcm3: 1.853,
    rotationDays: -6.3872, orbitDays: 90560, obliquityDeg: 122.53, albedo: 0.3,
    meanTempK: 44, moons: 5, color: [0.72, 0.63, 0.53], atmosphere: 0.2500, scaleHeightKm: 50.0, mie: 6,
    rayleigh: [1.2, 1.4, 1.8],
  },
]);

/** Fast lookup by id. @type {Map<string, BodyRecord>} */
export const BODY_BY_ID = new Map(BODIES.map((b) => [b.id, b]));

/**
 * Look up a body record.
 * @param {string} id
 * @returns {BodyRecord|undefined}
 */
export function getBody(id) {
  return BODY_BY_ID.get(id);
}

/** Ordered list of the ids that orbit the Sun directly. */
export const PLANET_IDS = Object.freeze(
  BODIES.filter((b) => b.parent === 'sun').map((b) => b.id)
);
