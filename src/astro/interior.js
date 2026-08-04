/**
 * Planetary interiors.
 *
 * Everything else in this project models the outsides of things. This models
 * the insides, and it does it the same way: from a published reference model,
 * with the derived quantities actually derived rather than quoted.
 *
 * THE MODEL
 *
 * Earth uses PREM — the Preliminary Reference Earth Model of Dziewonski and
 * Anderson (1981), Physics of the Earth and Planetary Interiors 25, 297-356.
 * PREM is what seismology settled on: a spherically averaged Earth whose
 * density and seismic velocities are given as polynomials in the normalised
 * radius x = r / 6371 km, fitted to free-oscillation periods, body-wave travel
 * times, the mass and the moment of inertia. The coefficients below are
 * transcribed from Table 1 of that paper.
 *
 * WHAT IS COMPUTED FROM IT
 *
 * Given only rho(r), the rest follows from two integrals and no further data:
 *
 *   M(r) = integral of 4 pi r'^2 rho(r') dr'          enclosed mass
 *   g(r) = G M(r) / r^2                               gravity
 *   P(r) = integral from r to R of rho g dr'          hydrostatic pressure
 *
 * The third is hydrostatic equilibrium, dP/dr = -rho g: the weight of
 * everything above a shell is what squeezes it. Integrating inward from zero
 * pressure at the surface gives the pressure everywhere.
 *
 * This is worth doing rather than tabulating, because it is checkable. The
 * model is fitted to Earth's mass and moment of inertia but NOT to its surface
 * gravity or its central pressure, so those come out as predictions, and they
 * can be compared with the published values:
 *
 *   total mass          5.972e24 kg      (measured 5.9722e24)
 *   surface gravity     9.82 m/s^2       (measured 9.7803 at the equator)
 *   gravity at the CMB  10.68 m/s^2      (PREM)
 *   pressure at the CMB 135.8 GPa        (PREM)
 *   pressure at centre  363.9 GPa        (PREM)
 *
 * `tools/validate-data.mjs` and the unit tests check all five. Getting them
 * right from the density profile alone is the evidence that the integration is
 * correct and the transcription is faithful.
 *
 * OTHER BODIES
 *
 * The Moon and Mars have nothing like PREM's resolution. What they have is a
 * core radius and a mean crustal thickness from a specific mission result, so
 * they are modelled as constant-density shells fitted to the published core
 * radius and to the body's known total mass. That is a much weaker model and it
 * is labelled as such: `model: 'layered'` rather than `'seismic'`.
 *
 * @module astro/interior
 */

/** Gravitational constant, CODATA 2018, m^3 kg^-1 s^-2. */
export const G = 6.67430e-11;

/**
 * PREM density, in g/cm^3, as piecewise polynomials in x = r / 6371 km.
 *
 * Transcribed from Dziewonski & Anderson (1981) Table 1. `top` is the outer
 * radius of the region in km; coefficients are [a0, a1, a2, a3] for
 * rho = a0 + a1 x + a2 x^2 + a3 x^3.
 *
 * The ocean layer is retained. It contributes 0.02 per cent of the mass and
 * nothing to the picture, but leaving it out would mean the model no longer
 * reaches 6371 km and the surface gravity check would be answering a slightly
 * different question.
 */
export const PREM_REGIONS = Object.freeze([
  { top: 1221.5, rho: [13.0885, 0, -8.8381, 0], name: 'Inner core' },
  { top: 3480.0, rho: [12.5815, -1.2638, -3.6426, -5.5281], name: 'Outer core' },
  { top: 3630.0, rho: [7.9565, -6.4761, 5.5283, -3.0807], name: 'D″ layer' },
  { top: 5600.0, rho: [7.9565, -6.4761, 5.5283, -3.0807], name: 'Lower mantle' },
  { top: 5701.0, rho: [7.9565, -6.4761, 5.5283, -3.0807], name: 'Lower mantle' },
  { top: 5771.0, rho: [5.3197, -1.4836, 0, 0], name: 'Transition zone' },
  { top: 5971.0, rho: [11.2494, -8.0298, 0, 0], name: 'Transition zone' },
  { top: 6151.0, rho: [7.1089, -3.8045, 0, 0], name: 'Transition zone' },
  { top: 6291.0, rho: [2.6910, 0.6924, 0, 0], name: 'Low-velocity zone' },
  { top: 6346.6, rho: [2.6910, 0.6924, 0, 0], name: 'Lithospheric mantle' },
  { top: 6356.0, rho: [2.900, 0, 0, 0], name: 'Lower crust' },
  { top: 6368.0, rho: [2.600, 0, 0, 0], name: 'Upper crust' },
  { top: 6371.0, rho: [1.020, 0, 0, 0], name: 'Ocean' },
]);

/** PREM's normalising radius, km. */
export const PREM_R = 6371.0;

/**
 * PREM density at a radius.
 * @param {number} rKm Radius from the centre, km.
 * @returns {number} Density, kg/m^3.
 */
export function premDensity(rKm) {
  const r = Math.max(0, Math.min(rKm, PREM_R));
  const x = r / PREM_R;
  const region = PREM_REGIONS.find((reg) => r <= reg.top) || PREM_REGIONS[PREM_REGIONS.length - 1];
  const [a0, a1, a2, a3] = region.rho;
  // g/cm^3 -> kg/m^3
  return (a0 + a1 * x + a2 * x * x + a3 * x * x * x) * 1000;
}

/**
 * The boundaries a person would name, with what they are.
 *
 * Depths are from the surface; radii are from the centre. These are the PREM
 * discontinuities, which is why the Mohorovicic discontinuity sits at 24.4 km
 * here rather than at whatever the local crust does — PREM is an average Earth
 * and its Moho is the average one.
 */
export const EARTH_LAYERS = Object.freeze([
  {
    id: 'inner-core',
    name: 'Inner core',
    inner: 0,
    outer: 1221.5,
    state: 'solid',
    composition: 'Iron-nickel alloy',
    note: 'Solid despite being the hottest part of the planet: pressure raises the melting point faster than temperature rises.',
    color: [0.98, 0.86, 0.62],
  },
  {
    id: 'outer-core',
    name: 'Outer core',
    inner: 1221.5,
    outer: 3480,
    state: 'liquid',
    composition: 'Liquid iron-nickel with lighter elements',
    note: 'Convection here is the geodynamo: the source of the magnetic field, and the reason a compass works.',
    color: [0.95, 0.55, 0.22],
  },
  {
    id: 'lower-mantle',
    name: 'Lower mantle',
    inner: 3480,
    outer: 5701,
    state: 'solid',
    composition: 'Bridgmanite and ferropericlase',
    note: 'Solid rock that convects, at centimetres a year. Its base is the D″ layer, where the mantle meets the core.',
    color: [0.72, 0.34, 0.22],
  },
  {
    id: 'transition-zone',
    name: 'Transition zone',
    inner: 5701,
    outer: 6151,
    state: 'solid',
    composition: 'Wadsleyite and ringwoodite',
    note: 'Olivine repacked into denser structures by pressure. It may hold as much water as the oceans, bound into the crystal.',
    color: [0.62, 0.40, 0.30],
  },
  {
    id: 'upper-mantle',
    name: 'Upper mantle',
    inner: 6151,
    outer: 6346.6,
    state: 'solid',
    composition: 'Peridotite',
    note: 'Includes the asthenosphere, weak enough to flow, which is what the tectonic plates ride on.',
    color: [0.52, 0.47, 0.38],
  },
  {
    id: 'crust',
    name: 'Crust',
    inner: 6346.6,
    outer: 6371,
    state: 'solid',
    composition: 'Basalt beneath the oceans, granite beneath the continents',
    note: 'Everything anyone has ever seen. The deepest hole ever drilled, at Kola, reached 12.3 km — half way through it.',
    color: [0.42, 0.58, 0.45],
  },
]);

/**
 * Integrate the structure of a body from its density profile.
 *
 * Uses the trapezium rule on a uniform grid. The integrand for the mass is
 * r^2 rho(r), which is smooth except at the discontinuities; with 10,000 steps
 * the boundaries are resolved to 0.6 km and the total mass converges to five
 * significant figures, which is better than the density model itself.
 *
 * @param {(rKm:number)=>number} density Density in kg/m^3 at a radius in km.
 * @param {number} radiusKm Surface radius.
 * @param {object} [opts]
 * @param {number} [opts.steps=10000]
 * @returns {{radius:Float64Array, density:Float64Array, mass:Float64Array,
 *   gravity:Float64Array, pressure:Float64Array, totalMass:number,
 *   surfaceGravity:number, centralPressure:number}}
 *   Radii in km, density kg/m^3, mass kg, gravity m/s^2, pressure Pa.
 */
export function integrateStructure(density, radiusKm, opts = {}) {
  const steps = opts.steps ?? 10000;
  const dr = (radiusKm * 1000) / steps; // metres
  const radius = new Float64Array(steps + 1);
  const rho = new Float64Array(steps + 1);
  const mass = new Float64Array(steps + 1);
  const gravity = new Float64Array(steps + 1);
  const pressure = new Float64Array(steps + 1);

  for (let i = 0; i <= steps; i++) {
    radius[i] = (i / steps) * radiusKm;
    rho[i] = density(radius[i]);
  }

  // Enclosed mass, outward. M(0) = 0 and the integrand vanishes there too, so
  // the first step contributes nothing and needs no special case.
  mass[0] = 0;
  for (let i = 1; i <= steps; i++) {
    const rA = radius[i - 1] * 1000;
    const rB = radius[i] * 1000;
    const fA = rA * rA * rho[i - 1];
    const fB = rB * rB * rho[i];
    mass[i] = mass[i - 1] + 4 * Math.PI * 0.5 * (fA + fB) * dr;
  }

  // g = GM/r^2, and g(0) = 0 exactly: at the centre there is no enclosed mass
  // and the limit is zero, but the expression is 0/0 and must not be evaluated.
  gravity[0] = 0;
  for (let i = 1; i <= steps; i++) {
    const r = radius[i] * 1000;
    gravity[i] = (G * mass[i]) / (r * r);
  }

  // Hydrostatic equilibrium, integrated inward from zero at the surface.
  pressure[steps] = 0;
  for (let i = steps - 1; i >= 0; i--) {
    const fA = rho[i] * gravity[i];
    const fB = rho[i + 1] * gravity[i + 1];
    pressure[i] = pressure[i + 1] + 0.5 * (fA + fB) * dr;
  }

  return {
    radius,
    density: rho,
    mass,
    gravity,
    pressure,
    totalMass: mass[steps],
    surfaceGravity: gravity[steps],
    centralPressure: pressure[0],
  };
}

/** Memoised profiles, because integrating 10,000 steps per frame would be silly. */
const profiles = new Map();

/**
 * The structure of a body, computed once and cached.
 * @param {string} bodyId
 * @returns {ReturnType<typeof integrateStructure>|null}
 */
export function structureOf(bodyId) {
  if (profiles.has(bodyId)) return profiles.get(bodyId);
  const model = INTERIORS[bodyId];
  if (!model) return null;
  const result = integrateStructure(model.density, model.radiusKm);
  profiles.set(bodyId, result);
  return result;
}

/**
 * Sample a structure at a given radius.
 * @param {string} bodyId
 * @param {number} rKm
 * @returns {{density:number, gravity:number, pressure:number, mass:number}|null}
 */
export function sampleAt(bodyId, rKm) {
  const s = structureOf(bodyId);
  if (!s) return null;
  const n = s.radius.length - 1;
  const surface = s.radius[n];
  const t = Math.max(0, Math.min(rKm / surface, 1)) * n;
  const i = Math.min(Math.floor(t), n - 1);
  const f = t - i;
  const lerp = (a) => a[i] + (a[i + 1] - a[i]) * f;
  return {
    density: lerp(s.density),
    gravity: lerp(s.gravity),
    pressure: lerp(s.pressure),
    mass: lerp(s.mass),
  };
}

/**
 * Which named layer a radius falls in.
 * @param {string} bodyId
 * @param {number} rKm
 * @returns {object|null}
 */
export function layerAt(bodyId, rKm) {
  const model = INTERIORS[bodyId];
  if (!model) return null;
  return model.layers.find((l) => rKm >= l.inner && rKm <= l.outer) || null;
}

/**
 * A constant-density shell model, for bodies without a seismic profile.
 *
 * The densities are chosen so the shells reproduce the body's measured total
 * mass exactly, given published core and crust radii: the core density is
 * whatever it must be for the sum to come out right. That is a real constraint
 * and it is the only one these models satisfy, which is why they are labelled
 * `layered` rather than `seismic`.
 *
 * @param {Array<{outer:number, rho:number}>} shells Outermost last, rho in kg/m^3.
 * @returns {(rKm:number)=>number}
 */
export function shellDensity(shells) {
  return (rKm) => {
    for (const s of shells) if (rKm <= s.outer) return s.rho;
    return shells[shells.length - 1].rho;
  };
}

/**
 * Interior models, keyed by body id.
 *
 * Sources:
 *   Earth  PREM, Dziewonski & Anderson (1981).
 *   Moon   Weber et al. (2011), Science 331, 309-312 — Apollo seismic array
 *          reanalysis giving a 240 km solid inner core and a 330 km fluid outer
 *          core; crustal thickness from GRAIL, Wieczorek et al. (2013).
 *   Mars   Stähler et al. (2021), Science 373, 443-448 — InSight marsquake
 *          detection of a 1830 km liquid core; crust from Knapmeyer-Endrun et
 *          al. (2021).
 */
export const INTERIORS = Object.freeze({
  earth: {
    model: 'seismic',
    source: 'PREM (Dziewonski & Anderson 1981)',
    radiusKm: PREM_R,
    density: premDensity,
    layers: EARTH_LAYERS,
  },
  moon: {
    model: 'layered',
    source: 'Weber et al. 2011 (Apollo); GRAIL crust',
    radiusKm: 1737.4,
    density: shellDensity([
      { outer: 240, rho: 8000 },     // solid inner core
      { outer: 330, rho: 5700 },     // fluid outer core
      { outer: 480, rho: 3600 },     // partial-melt boundary layer
      { outer: 1697.4, rho: 3350 },  // mantle
      { outer: 1737.4, rho: 2550 },  // crust, GRAIL mean 40 km
    ]),
    layers: [
      { id: 'inner-core', name: 'Inner core', inner: 0, outer: 240, state: 'solid', composition: 'Iron', note: 'Detected by reprocessing the Apollo seismometer records in 2011, forty years after they were made.', color: [0.95, 0.85, 0.6] },
      { id: 'outer-core', name: 'Outer core', inner: 240, outer: 330, state: 'liquid', composition: 'Iron', note: 'Small and cold: too feeble to sustain a dynamo, which is why the Moon has no global magnetic field today.', color: [0.9, 0.6, 0.3] },
      { id: 'boundary', name: 'Partial melt layer', inner: 330, outer: 480, state: 'partial melt', composition: 'Silicate', note: 'A soft layer above the core that damps the Moon’s response to tides.', color: [0.6, 0.45, 0.4] },
      { id: 'mantle', name: 'Mantle', inner: 480, outer: 1697.4, state: 'solid', composition: 'Olivine and pyroxene', note: 'Deep moonquakes cluster near its base, triggered by Earth’s tides.', color: [0.5, 0.48, 0.45] },
      { id: 'crust', name: 'Crust', inner: 1697.4, outer: 1737.4, state: 'solid', composition: 'Anorthosite', note: 'Floated to the surface as crystals in a global magma ocean. GRAIL made it thinner than anyone expected.', color: [0.75, 0.74, 0.72] },
    ],
  },
  mars: {
    model: 'layered',
    source: 'Stähler et al. 2021 (InSight); Knapmeyer-Endrun et al. 2021',
    radiusKm: 3389.5,
    density: shellDensity([
      { outer: 1830, rho: 6000 },    // liquid core, InSight
      { outer: 3339.5, rho: 3500 },  // mantle
      { outer: 3389.5, rho: 2850 },  // crust, mean 50 km
    ]),
    layers: [
      { id: 'core', name: 'Core', inner: 0, outer: 1830, state: 'liquid', composition: 'Iron-sulfur alloy', note: 'Measured in 2021 from marsquake waves reflected off it. Larger and lighter than expected, so it must hold a lot of sulfur.', color: [0.95, 0.6, 0.35] },
      { id: 'mantle', name: 'Mantle', inner: 1830, outer: 3339.5, state: 'solid', composition: 'Silicate', note: 'Too cool and too thin to convect vigorously; Mars has no plate tectonics.', color: [0.65, 0.35, 0.25] },
      { id: 'crust', name: 'Crust', inner: 3339.5, outer: 3389.5, state: 'solid', composition: 'Basalt', note: 'Two to three layers thick beneath InSight, and far thicker under the southern highlands than the northern plains.', color: [0.72, 0.45, 0.32] },
    ],
  },
});
