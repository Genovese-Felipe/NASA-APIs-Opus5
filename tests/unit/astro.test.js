/**
 * Astronomy tests.
 *
 * These are the tests that matter most, because an error here is invisible: a
 * planet in the wrong place still looks like a planet. Every expected value is
 * either from an independent source (JPL Horizons, published fact sheets) or is
 * a physical invariant that must hold regardless of implementation.
 *
 * Run: node --test tests/unit
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  solveKepler, solveKeplerHyperbolic, trueAnomaly, elementsToPosition,
  elementsToState, sampleOrbit, orbitalPeriod, smallBodyElementsAt,
} from '../../src/astro/kepler.js';
import {
  planetPosition, planetElements, bodyOrientation, BODIES, BODY_BY_ID, RING_SYSTEMS, IAU_POLES,
} from '../../src/astro/planets.js';
import { MOONS, moonPositionLocal, equatorialBasis, localToEcliptic } from '../../src/astro/moons.js';
import { buildScene, distanceKm, lightTimeSeconds, heliocentricSpeed } from '../../src/astro/ephemeris.js';
import {
  dateToJD, jdToDate, centuriesSinceJ2000, gmst, norm2pi, normDeg180, SimClock, TIME_RATES,
} from '../../src/astro/time.js';
import { AU_KM, JD_J2000, OBLIQUITY_J2000, GM_SUN, C_KM_S } from '../../src/astro/constants.js';
import { bvToTemperature, blackbodyRGB, magnitudeToFlux, raDecToEclipticVec, buildStarPoints, buildSkyMap } from '../../src/astro/stars.js';

const DEG = Math.PI / 180;

describe('Kepler solver', () => {
  test('satisfies M = E - e sin E across the eccentricity range', () => {
    for (const e of [0, 0.01, 0.1, 0.25, 0.5, 0.7, 0.9, 0.95, 0.99]) {
      for (let k = 0; k < 24; k++) {
        const M = (k / 24) * 2 * Math.PI - Math.PI;
        const E = solveKepler(M, e);
        const residual = E - e * Math.sin(E) - M;
        assert.ok(
          Math.abs(residual) < 1e-8,
          `e=${e} M=${M.toFixed(3)} residual=${residual.toExponential(2)}`
        );
      }
    }
  });

  test('is exact for a circular orbit', () => {
    for (let k = 0; k < 10; k++) {
      const M = (k / 10) * 2 * Math.PI;
      assert.ok(Math.abs(solveKepler(M, 0) - M) < 1e-12 ||
        Math.abs(Math.abs(solveKepler(M, 0) - M) - 2 * Math.PI) < 1e-12);
    }
  });

  test('solves the hyperbolic form', () => {
    for (const e of [1.1, 1.5, 3, 10]) {
      for (const M of [-5, -0.5, 0.5, 5, 50]) {
        const H = solveKeplerHyperbolic(M, e);
        assert.ok(Math.abs(e * Math.sinh(H) - H - M) < 1e-6, `e=${e} M=${M}`);
      }
    }
  });

  test('true anomaly equals eccentric anomaly for a circle', () => {
    assert.ok(Math.abs(trueAnomaly(1.0, 0) - 1.0) < 1e-12);
  });

  test('true anomaly leads eccentric anomaly before apoapsis', () => {
    // For an eccentric orbit, nu > E on the way out from periapsis.
    const E = 1.0;
    assert.ok(trueAnomaly(E, 0.5) > E);
  });
});

describe('orbital geometry', () => {
  const el = { a: 2, e: 0.3, i: 0.4, om: 1.1, w: 0.7, M: 0 };

  test('places the body at periapsis when M = 0', () => {
    const p = elementsToPosition({ ...el, M: 0 });
    const r = Math.hypot(p[0], p[1], p[2]);
    assert.ok(Math.abs(r - el.a * (1 - el.e)) < 1e-9, `r=${r}`);
  });

  test('places the body at apoapsis when M = pi', () => {
    const p = elementsToPosition({ ...el, M: Math.PI });
    const r = Math.hypot(p[0], p[1], p[2]);
    assert.ok(Math.abs(r - el.a * (1 + el.e)) < 1e-9, `r=${r}`);
  });

  test('conserves specific orbital energy around the orbit', () => {
    const mu = GM_SUN;
    const aKm = 1.5e8;
    let energy = null;
    for (let k = 0; k < 12; k++) {
      const M = (k / 12) * 2 * Math.PI;
      const { position, velocity } = elementsToState({ ...el, a: aKm, M }, mu);
      const r = Math.hypot(...position);
      const v = Math.hypot(...velocity);
      const eps = (v * v) / 2 - mu / r;
      if (energy === null) energy = eps;
      else assert.ok(Math.abs(eps - energy) / Math.abs(energy) < 1e-9, `energy drift at k=${k}`);
    }
    // And it must equal -mu/2a.
    assert.ok(Math.abs(energy - -mu / (2 * aKm)) / Math.abs(energy) < 1e-9);
  });

  test('conserves angular momentum around the orbit', () => {
    const mu = GM_SUN;
    let h = null;
    for (let k = 0; k < 12; k++) {
      const M = (k / 12) * 2 * Math.PI;
      const { position: p, velocity: v } = elementsToState({ ...el, a: 1.5e8, M }, mu);
      const hv = Math.hypot(
        p[1] * v[2] - p[2] * v[1],
        p[2] * v[0] - p[0] * v[2],
        p[0] * v[1] - p[1] * v[0]
      );
      if (h === null) h = hv;
      else assert.ok(Math.abs(hv - h) / h < 1e-9, `angular momentum drift at k=${k}`);
    }
  });

  test('sampled orbit lies within [a(1-e), a(1+e)]', () => {
    const pts = sampleOrbit(el, 128);
    for (let i = 0; i < pts.length; i += 3) {
      const r = Math.hypot(pts[i], pts[i + 1], pts[i + 2]);
      assert.ok(r >= el.a * (1 - el.e) - 1e-6 && r <= el.a * (1 + el.e) + 1e-6, `r=${r}`);
    }
  });

  test('Kepler third law matches Earth', () => {
    const seconds = orbitalPeriod(AU_KM, GM_SUN);
    const days = seconds / 86400;
    assert.ok(Math.abs(days - 365.25) < 0.5, `got ${days.toFixed(2)} days`);
  });

  test('propagates small-body elements from their epoch', () => {
    const rec = { a: 1.5, e: 0.2, i: 5, om: 10, w: 20, ma: 0, epoch: JD_J2000 };
    const atEpoch = smallBodyElementsAt(rec, JD_J2000);
    assert.ok(Math.abs(atEpoch.M) < 1e-9);
    // A full period later the mean anomaly must return to zero.
    const periodDays = 365.256898 * Math.pow(rec.a, 1.5);
    const later = smallBodyElementsAt(rec, JD_J2000 + periodDays);
    const wrapped = Math.min(later.M, 2 * Math.PI - later.M);
    assert.ok(wrapped < 0.01, `M after one period = ${later.M}`);
  });
});

describe('planetary ephemeris versus JPL Horizons', () => {
  // Heliocentric ecliptic J2000 state vectors for 2026-08-04 00:00 TDB,
  // retrieved from https://ssd.jpl.nasa.gov/api/horizons.api (CENTER='500@10',
  // REF_PLANE='ECLIPTIC', OUT_UNITS='AU-D'). These are the reference values the
  // approximation must stay close to.
  const JD = 2461256.5;
  const HORIZONS = {
    mercury: [3.240822230643142e-1, 9.274870634963869e-2, -2.214393355424352e-2],
    venus: [-1.054004901778215e-1, -7.18776332950637e-1, -3.793665686708925e-3],
    earth: [6.694983722722317e-1, -7.623420891712572e-1, 3.976982667425312e-5],
    mars: [8.520652626765858e-1, 1.214403694905726, 4.556483504471522e-3],
    jupiter: [-3.144116155157003, 4.251125176458306, 5.268601479106008e-2],
    saturn: [9.332261241857212, 1.448687508620909, -3.967095607745459e-1],
    uranus: [9.134781517822644, 1.717333024671977e1, -5.46639518871126e-2],
    neptune: [2.98469485721615e1, 1.197305434193534, -7.124660811462395e-1],
    pluto: [1.980857250502191e1, -2.943115561866795e1, -2.579590839100233],
  };

  // Nominal accuracy published by JPL for this approximation, in arcseconds of
  // heliocentric longitude. Pluto is not in the modern table and is looser.
  const TOLERANCE_ARCSEC = {
    mercury: 30, venus: 40, earth: 40, mars: 80,
    jupiter: 450, saturn: 700, uranus: 120, neptune: 60, pluto: 200,
  };

  for (const [id, expected] of Object.entries(HORIZONS)) {
    test(`${id} is within ${TOLERANCE_ARCSEC[id]}"`, () => {
      const p = planetPosition(id, JD);
      const dr = Math.hypot(p[0] - expected[0], p[1] - expected[1], p[2] - expected[2]);
      const r = Math.hypot(...expected);
      const arcsec = (dr / r) * 206264.806;
      assert.ok(
        arcsec < TOLERANCE_ARCSEC[id],
        `${id}: ${arcsec.toFixed(1)}" off (limit ${TOLERANCE_ARCSEC[id]}")`
      );
    });
  }

  test('rejects an unknown body', () => {
    assert.throws(() => planetPosition('vulcan', JD), /unknown body/i);
  });

  test('switches to the wide-epoch fit outside 1800-2050', () => {
    // Both fits must agree to better than a degree near the boundary, or the
    // scene would visibly jump as the date crosses it.
    const boundary = JD_J2000 + 0.5 * 36525; // year 2050
    const before = planetPosition('mars', boundary - 1);
    const after = planetPosition('mars', boundary + 1);
    const sep = Math.hypot(after[0] - before[0], after[1] - before[1], after[2] - before[2]);
    // One day of Mars motion is about 0.015 au; a discontinuity would be larger.
    assert.ok(sep < 0.03, `jump of ${sep.toFixed(4)} au at the fit boundary`);
  });
});

describe('rotational elements', () => {
  test('Earth axis is tilted by the obliquity', () => {
    const { axis } = bodyOrientation('earth', JD_J2000, OBLIQUITY_J2000);
    // Earth's pole is the ecliptic pole rotated by the obliquity, so its
    // z-component is cos(obliquity).
    assert.ok(Math.abs(axis[2] - Math.cos(OBLIQUITY_J2000)) < 0.01, `z=${axis[2]}`);
  });

  test('Uranus axis lies close to the ecliptic plane', () => {
    const { axis } = bodyOrientation('uranus', JD_J2000, OBLIQUITY_J2000);
    // 97.8 degrees of tilt means the pole is nearly in the plane.
    assert.ok(Math.abs(axis[2]) < 0.3, `z=${axis[2]}`);
  });

  test('every axis is a unit vector', () => {
    for (const id of Object.keys(IAU_POLES)) {
      const { axis } = bodyOrientation(id, JD_J2000 + 3652, OBLIQUITY_J2000);
      assert.ok(Math.abs(Math.hypot(...axis) - 1) < 1e-9, id);
    }
  });

  test('prime meridian advances at the published rotation rate', () => {
    const a = bodyOrientation('earth', JD_J2000, OBLIQUITY_J2000);
    const b = bodyOrientation('earth', JD_J2000 + 1, OBLIQUITY_J2000);
    let delta = (b.spin - a.spin) / DEG;
    if (delta < 0) delta += 360;
    assert.ok(Math.abs(delta - 0.9856235) < 1e-4, `delta=${delta}`);
  });

  test('Venus rotates retrograde', () => {
    const a = bodyOrientation('venus', JD_J2000, OBLIQUITY_J2000);
    const b = bodyOrientation('venus', JD_J2000 + 0.1, OBLIQUITY_J2000);
    let delta = (b.spin - a.spin) / DEG;
    if (delta > 180) delta -= 360;
    assert.ok(delta < 0, `Venus spin delta should be negative, got ${delta}`);
  });
});

describe('satellites', () => {
  test('every moon stays within its published radial range', () => {
    for (const m of MOONS) {
      for (let k = 0; k < 8; k++) {
        const jd = JD_J2000 + (k / 8) * Math.abs(m.periodDays);
        const p = moonPositionLocal(m, jd);
        const r = Math.hypot(...p);
        assert.ok(
          r >= m.a * (1 - m.e) - 1 && r <= m.a * (1 + m.e) + 1,
          `${m.id}: r=${r.toFixed(0)} outside [${(m.a * (1 - m.e)).toFixed(0)}, ${(m.a * (1 + m.e)).toFixed(0)}]`
        );
      }
    }
  });

  test('returns to its starting point after one period', () => {
    for (const m of MOONS) {
      const a = moonPositionLocal(m, JD_J2000);
      const b = moonPositionLocal(m, JD_J2000 + m.periodDays);
      const sep = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
      assert.ok(sep / m.a < 1e-6, `${m.id}: ${sep.toFixed(3)} km apart after one period`);
    }
  });

  test('equatorial basis is orthonormal', () => {
    for (const axis of [[0, 0, 1], [0.5, 0.5, 0.707], [1, 0, 0], [-0.212, -0.968, 0.134]]) {
      const n = Math.hypot(...axis);
      const unit = axis.map((v) => v / n);
      const b = equatorialBasis(unit);
      const e0 = b.slice(0, 3);
      const e1 = b.slice(3, 6);
      const e2 = b.slice(6, 9);
      for (const e of [e0, e1, e2]) {
        assert.ok(Math.abs(Math.hypot(...e) - 1) < 1e-9, 'not unit length');
      }
      assert.ok(Math.abs(dot(e0, e1)) < 1e-9, 'e0 . e1');
      assert.ok(Math.abs(dot(e1, e2)) < 1e-9, 'e1 . e2');
      assert.ok(Math.abs(dot(e0, e2)) < 1e-9, 'e0 . e2');
    }
  });

  test('rotating into the ecliptic preserves length', () => {
    const basis = equatorialBasis([0.0855, 0.4624, 0.8825]);
    const v = [1234, -567, 890];
    const out = localToEcliptic(v, basis);
    assert.ok(Math.abs(Math.hypot(...out) - Math.hypot(...v)) < 1e-9);
  });

  test('Triton orbits retrograde', () => {
    const triton = MOONS.find((m) => m.id === 'triton');
    assert.ok(triton.periodDays < 0, 'Triton period should carry a negative sign');
    assert.ok(triton.iDeg > 90, 'Triton inclination should exceed 90 degrees');
  });
});

describe('scene assembly', () => {
  const scene = buildScene(2461256.5);

  test('contains every catalogued body', () => {
    assert.equal(scene.bodies.length, BODIES.length + MOONS.length);
    for (const b of BODIES) assert.ok(scene.byId.has(b.id), b.id);
    for (const m of MOONS) assert.ok(scene.byId.has(m.id), m.id);
  });

  test('places the Sun at the origin', () => {
    const sun = scene.byId.get('sun');
    assert.equal(Math.hypot(...sun.pos), 0);
  });

  test('Earth-Moon distance is within the real range', () => {
    const d = distanceKm(scene.byId.get('earth'), scene.byId.get('moon'));
    assert.ok(d > 356000 && d < 407000, `${d.toFixed(0)} km`);
  });

  test('each moon sits near its semi-major axis from its parent', () => {
    for (const m of MOONS) {
      const d = distanceKm(scene.byId.get(m.id), scene.byId.get(m.parent));
      const lo = m.a * (1 - m.e) * 0.98;
      const hi = m.a * (1 + m.e) * 1.02;
      assert.ok(d > lo && d < hi, `${m.id}: ${d.toFixed(0)} not in [${lo.toFixed(0)}, ${hi.toFixed(0)}]`);
    }
  });

  test('light travel time to the Sun is about 8.3 minutes', () => {
    const seconds = lightTimeSeconds(scene.byId.get('earth'), scene.byId.get('sun'));
    assert.ok(seconds > 480 && seconds < 510, `${seconds.toFixed(1)} s`);
  });

  test("Earth's orbital speed is about 29.8 km/s", () => {
    const v = heliocentricSpeed('earth', 2461256.5);
    assert.ok(v > 29 && v < 30.5, `${v.toFixed(2)} km/s`);
  });

  test('produces one orbit path per orbiting body', () => {
    const planets = BODIES.filter((b) => b.parent === 'sun').length;
    assert.equal(scene.orbits.length, planets + MOONS.length);
    for (const o of scene.orbits) {
      assert.ok(o.points.length > 0 && o.points.length % 3 === 0);
      assert.ok(o.points.every(Number.isFinite), `${o.id} has non-finite points`);
    }
  });

  test('every position is finite', () => {
    for (const b of scene.bodies) {
      assert.ok([...b.pos].every(Number.isFinite), `${b.id} position`);
      assert.ok([...b.axis].every(Number.isFinite), `${b.id} axis`);
      assert.ok(Number.isFinite(b.spin), `${b.id} spin`);
    }
  });

  test('can be built at the extremes of the valid range', () => {
    for (const jd of [625673.5, 2816787.5]) {
      const s = buildScene(jd);
      for (const b of s.bodies) {
        assert.ok([...b.pos].every(Number.isFinite), `${b.id} at JD ${jd}`);
      }
    }
  });
});

describe('body catalogue', () => {
  test('physical parameters are plausible', () => {
    for (const b of BODIES) {
      assert.ok(b.radiusKm > 0, `${b.id} radius`);
      assert.ok(b.massKg > 0, `${b.id} mass`);
      assert.ok(b.flattening >= 0 && b.flattening < 0.2, `${b.id} flattening`);
      assert.ok(b.albedo >= 0 && b.albedo <= 1, `${b.id} albedo`);
      assert.equal(b.color.length, 3);
      assert.ok(b.color.every((c) => c >= 0 && c <= 1), `${b.id} colour`);
    }
  });

  test('bulk density is consistent with mass and radius', () => {
    for (const b of BODIES) {
      if (!b.densityGcm3) continue;
      // Using the mean radius would be exact; the equatorial radius over-states
      // volume, so allow generous slack for the oblate giants.
      const volumeCm3 = (4 / 3) * Math.PI * Math.pow(b.radiusKm * 1e5, 3);
      const derived = (b.massKg * 1000) / volumeCm3;
      const ratio = derived / b.densityGcm3;
      assert.ok(ratio > 0.65 && ratio < 1.05, `${b.id}: derived ${derived.toFixed(3)} vs stated ${b.densityGcm3}`);
    }
  });

  test('atmospheric shells are about ten scale heights', () => {
    for (const b of BODIES) {
      if (!b.atmosphere) continue;
      assert.ok(b.scaleHeightKm > 0, `${b.id} needs a scale height`);
      const shells = (b.radiusKm * b.atmosphere) / b.scaleHeightKm;
      assert.ok(shells > 3 && shells < 30, `${b.id}: ${shells.toFixed(1)} scale heights`);
      assert.equal(b.rayleigh.length, 3, `${b.id} rayleigh`);
      assert.ok(b.rayleigh.every((v) => v > 0), `${b.id} rayleigh positive`);
    }
  });

  test('ring bands are ordered and non-overlapping within a system', () => {
    for (const [planet, bands] of Object.entries(RING_SYSTEMS)) {
      assert.ok(BODY_BY_ID.has(planet), `${planet} must exist`);
      let previousOuter = 0;
      for (const band of bands) {
        assert.ok(band.inner < band.outer, `${planet}/${band.name} inverted`);
        assert.ok(band.inner >= previousOuter, `${planet}/${band.name} overlaps the previous band`);
        assert.ok(band.inner > BODY_BY_ID.get(planet).radiusKm, `${planet}/${band.name} is inside the planet`);
        assert.ok(band.opacity >= 0 && band.opacity <= 1, `${planet}/${band.name} opacity`);
        previousOuter = band.outer;
      }
    }
  });

  test("Saturn's Cassini Division is where Cassini found it", () => {
    const division = RING_SYSTEMS.saturn.find((b) => b.name === 'Cassini Division');
    assert.ok(Math.abs(division.inner - 117580) < 200);
    assert.ok(Math.abs(division.outer - 122170) < 200);
  });
});

describe('time', () => {
  test('round-trips a date through Julian Date', () => {
    for (const iso of ['2000-01-01T12:00:00Z', '1969-07-20T20:17:00Z', '2026-08-04T00:00:00Z']) {
      const d = new Date(iso);
      assert.equal(jdToDate(dateToJD(d)).toISOString(), d.toISOString());
    }
  });

  test('J2000 is 2000-01-01T12:00:00Z', () => {
    assert.equal(jdToDate(JD_J2000).toISOString(), '2000-01-01T12:00:00.000Z');
  });

  test('centuries since J2000 is zero at the epoch', () => {
    assert.equal(centuriesSinceJ2000(JD_J2000), 0);
    assert.ok(Math.abs(centuriesSinceJ2000(JD_J2000 + 36525) - 1) < 1e-12);
  });

  test('GMST stays in range and advances slightly faster than a solar day', () => {
    for (let k = 0; k < 20; k++) {
      const g = gmst(JD_J2000 + k * 13.7);
      assert.ok(g >= 0 && g < 2 * Math.PI, `gmst=${g}`);
    }
    const a = gmst(JD_J2000);
    const b = gmst(JD_J2000 + 1);
    let delta = b - a;
    if (delta < 0) delta += 2 * Math.PI;
    // A sidereal day is about 3m56s shorter than a solar day.
    const extraSeconds = (delta / (2 * Math.PI)) * 86400;
    assert.ok(extraSeconds > 230 && extraSeconds < 250, `${extraSeconds.toFixed(1)} s`);
  });

  test('angle normalisation', () => {
    assert.ok(Math.abs(norm2pi(-0.5) - (2 * Math.PI - 0.5)) < 1e-12);
    assert.ok(norm2pi(7) >= 0 && norm2pi(7) < 2 * Math.PI);
    assert.equal(normDeg180(370), 10);
    assert.equal(normDeg180(-190), 170);
    // +180 and -180 are the same angle; the wrap lands on -180.
    assert.equal(Math.abs(normDeg180(180)), 180);
  });

  test('SimClock advances at the requested rate', () => {
    const clock = new SimClock(JD_J2000);
    clock.setRate(86400); // one simulated day per real second
    clock.advance(1);
    assert.ok(Math.abs(clock.jd - (JD_J2000 + 1)) < 1e-9, `jd=${clock.jd}`);
  });

  test('SimClock clamps to the ephemeris validity window', () => {
    const clock = new SimClock(JD_J2000);
    clock.setRate(-1e12);
    clock.advance(1);
    assert.equal(clock.jd, clock.minJD);
    clock.setRate(1e12);
    clock.advance(1);
    assert.equal(clock.jd, clock.maxJD);
  });

  test('every time rate preset has a translation key', () => {
    for (const r of TIME_RATES) {
      assert.ok(r.key.startsWith('time.rate.'), r.id);
      assert.equal(typeof r.rate, 'number');
    }
  });
});

describe('star colour science', () => {
  test('B-V maps to sensible temperatures', () => {
    // Vega (A0V, B-V = 0.00) is about 9600 K; the Sun (G2V, B-V = 0.65) 5772 K;
    // Betelgeuse (M1, B-V = 1.85) about 3600 K.
    assert.ok(Math.abs(bvToTemperature(0.0) - 9600) < 900, bvToTemperature(0.0));
    assert.ok(Math.abs(bvToTemperature(0.65) - 5772) < 500, bvToTemperature(0.65));
    assert.ok(Math.abs(bvToTemperature(1.85) - 3600) < 500, bvToTemperature(1.85));
  });

  test('temperature is monotonically decreasing in B-V', () => {
    let previous = Infinity;
    for (let bv = -0.3; bv <= 2.0; bv += 0.1) {
      const t = bvToTemperature(bv);
      assert.ok(t < previous, `not decreasing at bv=${bv.toFixed(1)}`);
      previous = t;
    }
  });

  test('hot stars are blue and cool stars are red', () => {
    const hot = blackbodyRGB(20000);
    const cool = blackbodyRGB(3000);
    assert.ok(hot[2] >= hot[0], 'a 20000 K star should not be red-dominant');
    assert.ok(cool[0] > cool[2], 'a 3000 K star should be red-dominant');
    for (const c of [hot, cool]) {
      assert.ok(Math.max(...c) <= 1.0000001 && Math.min(...c) >= 0, 'out of range');
    }
  });

  test('Pogson ratio', () => {
    assert.ok(Math.abs(magnitudeToFlux(0) - 1) < 1e-12);
    assert.ok(Math.abs(magnitudeToFlux(5) - 0.01) < 1e-12);
    assert.ok(magnitudeToFlux(-1.46) > magnitudeToFlux(0));
  });

  test('RA/Dec conversion produces unit vectors and respects the obliquity', () => {
    for (const [ra, dec] of [[0, 0], [90, 0], [180, 45], [270, -60], [12.3, 89.9]]) {
      const v = raDecToEclipticVec(ra, dec);
      assert.ok(Math.abs(Math.hypot(...v) - 1) < 1e-12, `${ra},${dec}`);
    }
    // The vernal equinox (0h, 0deg) is the shared x-axis of both frames.
    const equinox = raDecToEclipticVec(0, 0);
    assert.ok(Math.abs(equinox[0] - 1) < 1e-12);
    assert.ok(Math.abs(equinox[1]) < 1e-12);
    assert.ok(Math.abs(equinox[2]) < 1e-12);
    // The north celestial pole sits at the obliquity from the ecliptic pole.
    const ncp = raDecToEclipticVec(0, 90);
    assert.ok(Math.abs(ncp[2] - Math.cos(OBLIQUITY_J2000)) < 1e-9, `z=${ncp[2]}`);
  });

  test('point buffers are unit directions with the same flux as the sky map', () => {
    const cat = {
      ra: [0, 101.287, 279.234],
      dec: [0, -16.716, 38.784],
      mag: [4.0, -1.46, 0.03],   // an ordinary star, Sirius, Vega
      bv: [0.5, 0.0, 0.0],
    };
    const pts = buildStarPoints(cat);
    assert.equal(pts.count, 3);
    assert.equal(pts.dir.length, 9);
    assert.equal(pts.tint.length, 12);

    for (let i = 0; i < pts.count; i++) {
      const len = Math.hypot(pts.dir[i * 3], pts.dir[i * 3 + 1], pts.dir[i * 3 + 2]);
      assert.ok(Math.abs(len - 1) < 1e-6, `star ${i} direction is not a unit vector`);
      assert.ok(pts.tint[i * 4 + 3] > 0, `star ${i} has no flux`);
    }

    // Faintest first, so the brightest star is the last additive contribution
    // when several land on one pixel.
    const flux = [0, 1, 2].map((i) => pts.tint[i * 4 + 3]);
    assert.ok(flux[0] < flux[1] && flux[1] < flux[2], 'not sorted faintest-first');

    // Same scale as the texture path, so switching between them does not change
    // how bright the sky is. The tolerance is float32: these end up in a vertex
    // buffer, not a double.
    assert.ok(Math.abs(flux[2] / (magnitudeToFlux(-1.46) * 15) - 1) < 1e-6);
  });

  test('the sky map holds the Milky Way but not the stars by default', () => {
    const cat = { ra: [0], dec: [0], mag: [-10], bv: [0] };  // absurdly bright
    const bare = buildSkyMap(cat, { width: 64, height: 32, milkyWay: 0 });
    assert.ok(bare.data.every((v) => v === 0), 'stars leaked into the texture');

    const withStars = buildSkyMap(cat, { width: 64, height: 32, milkyWay: 0, stars: true });
    assert.ok(withStars.data.some((v) => v > 0), 'opt-in star splatting is broken');

    const galaxy = buildSkyMap(cat, { width: 64, height: 32, milkyWay: 1 });
    assert.ok(galaxy.data.some((v) => v > 0), 'the Milky Way should still be painted');
  });
});

describe('constants', () => {
  test('are the published values', () => {
    assert.equal(AU_KM, 149597870.7);
    assert.equal(C_KM_S, 299792.458);
    assert.equal(JD_J2000, 2451545.0);
  });

  test('light takes 499 seconds to cross one astronomical unit', () => {
    assert.ok(Math.abs(AU_KM / C_KM_S - 499.005) < 0.01);
  });
});

/** @param {number[]} a @param {number[]} b */
function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
