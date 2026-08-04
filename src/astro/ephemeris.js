/**
 * Scene assembly: turns a Julian Date into the complete geometric state of the
 * solar system that the renderer and UI consume.
 *
 * Everything is computed in **double precision** here, in kilometres, in the
 * J2000 ecliptic frame with the Sun at the origin. The renderer later converts
 * to camera-relative single precision, which is what keeps a 4.5-billion-km
 * scene free of floating-point cracks.
 *
 * @module astro/ephemeris
 */

import { AU_KM, OBLIQUITY_J2000, DEG, GM_SUN } from './constants.js';
import { BODIES, RING_SYSTEMS, bodyOrientation, planetPosition, planetElements } from './planets.js';
import { MOONS, moonPositionLocal, equatorialBasis, localToEcliptic } from './moons.js';
import { sampleOrbit, smallBodyElementsAt, elementsToPosition } from './kepler.js';

/**
 * @typedef {object} BodyState
 * @property {string} id
 * @property {'star'|'planet'|'dwarf'|'moon'|'smallbody'|'spacecraft'} kind
 * @property {string|null} parent
 * @property {Float64Array} pos Heliocentric ecliptic position, km.
 * @property {number} radiusKm
 * @property {number} flattening
 * @property {Float64Array} axis Unit spin axis, ecliptic frame.
 * @property {number} spin Prime-meridian angle, radians.
 * @property {number[]} color
 * @property {number} albedo
 * @property {number} atmosphere
 * @property {number[]|null} rayleigh
 * @property {string|null} texture
 * @property {number} emissive
 * @property {Array|null} rings
 * @property {object} record Original catalogue record.
 */

/**
 * @typedef {object} SceneState
 * @property {number} jd
 * @property {BodyState[]} bodies
 * @property {Map<string, BodyState>} byId
 * @property {Array<{id:string, points:Float32Array, color:number[], parent:string}>} orbits
 */

const ZERO3 = () => new Float64Array(3);

/**
 * Build the full solar-system state for a given instant.
 *
 * @param {number} jd Julian Date.
 * @param {object} [opts]
 * @param {boolean} [opts.moons=true] Include natural satellites.
 * @param {Array} [opts.smallBodies] Extra small bodies (see {@link addSmallBodies}).
 * @returns {SceneState}
 */
export function buildScene(jd, opts = {}) {
  const includeMoons = opts.moons !== false;
  /** @type {BodyState[]} */
  const bodies = [];
  /** @type {Map<string, BodyState>} */
  const byId = new Map();

  for (const rec of BODIES) {
    const pos = ZERO3();
    if (rec.parent === 'sun') {
      const p = planetPosition(rec.id, jd);
      pos[0] = p[0] * AU_KM;
      pos[1] = p[1] * AU_KM;
      pos[2] = p[2] * AU_KM;
    }
    const o = bodyOrientation(rec.id, jd, OBLIQUITY_J2000);
    const state = {
      id: rec.id,
      kind: rec.kind,
      parent: rec.parent,
      pos,
      radiusKm: rec.radiusKm,
      flattening: rec.flattening || 0,
      axis: Float64Array.from(o.axis),
      spin: o.spin,
      color: rec.color,
      albedo: rec.albedo,
      atmosphere: rec.atmosphere || 0,
      rayleigh: rec.rayleigh || null,
      texture: rec.texture || null,
      emissive: rec.emissive || 0,
      rings: RING_SYSTEMS[rec.id] || null,
      record: rec,
    };
    bodies.push(state);
    byId.set(rec.id, state);
  }

  // The JPL table gives the Earth/Moon BARYCENTRE, not the Earth. Split it:
  // Earth sits at  EMB - mu*r  and the Moon at  EMB + (1-mu)*r,  where r is the
  // geocentric Moon vector and mu = m_moon / (m_earth + m_moon). Ignoring this
  // leaves Earth up to ~4700 km (about 6 arcsec as seen from the Sun) off.
  const earth = byId.get('earth');
  const moonRec = MOONS.find((m) => m.id === 'moon');
  let moonGeocentric = null;
  if (earth && moonRec) {
    moonGeocentric = moonPositionLocal(moonRec, jd);
    const mu = moonRec.massKg / (BODIES.find((b) => b.id === 'earth').massKg + moonRec.massKg);
    earth.pos[0] -= mu * moonGeocentric[0];
    earth.pos[1] -= mu * moonGeocentric[1];
    earth.pos[2] -= mu * moonGeocentric[2];
  }

  if (includeMoons) {
    for (const m of MOONS) {
      const parent = byId.get(m.parent);
      if (!parent) continue;
      const local = m.id === 'moon' && moonGeocentric ? moonGeocentric : moonPositionLocal(m, jd);
      let ecl;
      if (m.frame === 'equator') {
        ecl = localToEcliptic(local, equatorialBasis(Array.from(parent.axis)));
      } else {
        ecl = local;
      }
      const pos = ZERO3();
      pos[0] = parent.pos[0] + ecl[0];
      pos[1] = parent.pos[1] + ecl[1];
      pos[2] = parent.pos[2] + ecl[2];

      // Tidally locked satellites keep one face towards the primary; we spin
      // them so that their prime meridian tracks the parent direction.
      let axis = parent.axis;
      let spin = 0;
      if (m.id === 'moon') {
        const o = bodyOrientation('moon', jd, OBLIQUITY_J2000);
        axis = Float64Array.from(o.axis);
        spin = o.spin;
      } else if (m.tidallyLocked) {
        spin = Math.atan2(-ecl[1], -ecl[0]);
      }

      const state = {
        id: m.id,
        kind: 'moon',
        parent: m.parent,
        pos,
        radiusKm: m.radiusKm,
        flattening: 0,
        axis: Float64Array.from(axis),
        spin,
        color: m.color,
        albedo: m.albedo,
        atmosphere: m.atmosphere || 0,
        rayleigh: m.rayleigh || null,
        texture: m.texture || null,
        emissive: 0,
        rings: null,
        record: m,
      };
      bodies.push(state);
      byId.set(m.id, state);
    }
  }

  const scene = { jd, bodies, byId, orbits: buildOrbits(jd, byId, includeMoons) };

  if (opts.smallBodies && opts.smallBodies.length) {
    addSmallBodies(scene, opts.smallBodies, jd);
  }
  return scene;
}

/**
 * Sample every orbit path for drawing.
 * @private
 */
function buildOrbits(jd, byId, includeMoons) {
  const orbits = [];
  for (const rec of BODIES) {
    if (rec.parent !== 'sun') continue;
    const el = planetElements(rec.id, jd);
    const pts = sampleOrbit(el, 512);
    for (let i = 0; i < pts.length; i++) pts[i] *= AU_KM;
    orbits.push({ id: rec.id, points: pts, color: rec.color, parent: 'sun' });
  }
  if (!includeMoons) return orbits;

  for (const m of MOONS) {
    const parent = byId.get(m.parent);
    if (!parent) continue;
    const pts = sampleOrbit(
      { a: m.a, e: m.e, i: m.iDeg * DEG, om: m.nodeDeg * DEG, w: m.periDeg * DEG },
      192
    );
    if (m.frame === 'equator') {
      const basis = equatorialBasis(Array.from(parent.axis));
      const tmp = [0, 0, 0];
      for (let i = 0; i < pts.length; i += 3) {
        tmp[0] = pts[i]; tmp[1] = pts[i + 1]; tmp[2] = pts[i + 2];
        const r = localToEcliptic(tmp, basis);
        pts[i] = r[0]; pts[i + 1] = r[1]; pts[i + 2] = r[2];
      }
    }
    orbits.push({ id: m.id, points: pts, color: m.color, parent: m.parent });
  }
  return orbits;
}

/**
 * Merge live small bodies (near-Earth objects, comets) into an existing scene.
 *
 * Records use JPL/NeoWs conventions: `a` in au, angles in degrees, `epoch` as a
 * Julian Date.
 *
 * @param {SceneState} scene
 * @param {Array<object>} records
 * @param {number} jd
 * @returns {SceneState} the same scene, mutated.
 */
export function addSmallBodies(scene, records, jd) {
  for (const rec of records) {
    if (!Number.isFinite(Number(rec.a)) || !Number.isFinite(Number(rec.e))) continue;
    if (Number(rec.e) >= 1) continue; // hyperbolic: not drawn as a closed orbit
    const el = smallBodyElementsAt(rec, jd);
    const p = elementsToPosition(el);
    const pos = ZERO3();
    pos[0] = p[0] * AU_KM;
    pos[1] = p[1] * AU_KM;
    pos[2] = p[2] * AU_KM;

    const state = {
      id: rec.id || rec.name,
      kind: 'smallbody',
      parent: 'sun',
      pos,
      // Diameter estimates from NeoWs are in metres; fall back to a nominal
      // 500 m body so something is visible.
      radiusKm: rec.radiusKm || 0.25,
      flattening: 0,
      axis: Float64Array.from([0, 0, 1]),
      spin: 0,
      color: rec.hazardous ? [0.95, 0.35, 0.3] : [0.75, 0.72, 0.68],
      albedo: 0.15,
      atmosphere: 0,
      rayleigh: null,
      texture: null,
      emissive: 0,
      rings: null,
      record: rec,
    };
    scene.bodies.push(state);
    scene.byId.set(state.id, state);

    const pts = sampleOrbit(el, 256);
    for (let i = 0; i < pts.length; i++) pts[i] *= AU_KM;
    scene.orbits.push({
      id: state.id,
      points: pts,
      color: state.color,
      parent: 'sun',
      smallBody: true,
    });
  }
  return scene;
}

/**
 * Distance between two bodies in the scene, in km.
 * @param {BodyState} a
 * @param {BodyState} b
 * @returns {number}
 */
export function distanceKm(a, b) {
  return Math.hypot(a.pos[0] - b.pos[0], a.pos[1] - b.pos[1], a.pos[2] - b.pos[2]);
}

/**
 * Instantaneous heliocentric orbital speed of a body, km/s, from the vis-viva
 * equation  v = sqrt(mu * (2/r - 1/a)).
 * @param {string} id
 * @param {number} jd
 * @returns {number|null} null for bodies without a heliocentric orbit.
 */
export function heliocentricSpeed(id, jd) {
  let el;
  try {
    el = planetElements(id, jd);
  } catch {
    return null;
  }
  const p = planetPosition(id, jd);
  const r = Math.hypot(p[0], p[1], p[2]) * AU_KM;
  const a = el.a * AU_KM;
  return Math.sqrt(GM_SUN * (2 / r - 1 / a));
}

/**
 * Light travel time between two bodies.
 * @param {BodyState} a
 * @param {BodyState} b
 * @returns {number} seconds
 */
export function lightTimeSeconds(a, b) {
  return distanceKm(a, b) / 299792.458;
}
