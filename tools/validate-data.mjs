#!/usr/bin/env node
/**
 * Scientific data validation.
 *
 * A wrong number in this repository is invisible: a planet at the wrong
 * distance still looks like a planet, and a mass that is out by a factor of a
 * thousand still renders. So the numbers are checked against each other and
 * against physics, on every push.
 *
 * The checks are deliberately independent of the code that uses them:
 *
 *  - Every physical parameter is cross-checked for internal consistency
 *    (density against mass and radius, escape velocity against both).
 *  - Every orbital period is checked against Kepler's third law.
 *  - Every satellite is checked to be inside its planet's Hill sphere and
 *    outside its Roche limit — a satellite that fails either could not exist.
 *  - Ring geometry is checked against the planet radius and the Roche limit.
 *  - The star catalogue is checked for range, ordering and duplication.
 *
 * Usage:  node tools/validate-data.mjs [--verbose]
 * Exit code 1 on any error.
 */

import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VERBOSE = process.argv.includes('--verbose');

const { BODIES, BODY_BY_ID, RING_SYSTEMS, IAU_POLES } = await import('../src/astro/planets.js');
const { MOONS } = await import('../src/astro/moons.js');
const { AU_KM, GM_SUN } = await import('../src/astro/constants.js');

const errors = [];
const notes = [];
const check = (ok, message) => { if (!ok) errors.push(message); };
const note = (message) => { if (VERBOSE) notes.push(message); };

/** Gravitational constant, m^3 kg^-1 s^-2. */
const G = 6.6743e-11;

// ---------------------------------------------------------------------------
// Physical self-consistency
// ---------------------------------------------------------------------------
for (const b of BODIES) {
  // Density from mass and mean radius. The catalogue stores the *equatorial*
  // radius, so for an oblate body the derived value is systematically low;
  // correct for it using the flattening before comparing.
  const meanRadiusKm = b.radiusKm * Math.cbrt(1 - (b.flattening || 0));
  const volumeM3 = (4 / 3) * Math.PI * Math.pow(meanRadiusKm * 1000, 3);
  const derivedDensity = b.massKg / volumeM3 / 1000; // g/cm^3
  if (b.densityGcm3) {
    const ratio = derivedDensity / b.densityGcm3;
    check(
      ratio > 0.93 && ratio < 1.07,
      `${b.id}: density from mass/radius is ${derivedDensity.toFixed(3)} g/cm3 but the catalogue says ${b.densityGcm3}`
    );
    note(`${b.id.padEnd(9)} density ${derivedDensity.toFixed(3)} vs ${b.densityGcm3}`);
  }

  // Surface gravity and escape velocity, for a sanity check on mass.
  const g = (G * b.massKg) / Math.pow(b.radiusKm * 1000, 2);
  const vEsc = Math.sqrt((2 * G * b.massKg) / (b.radiusKm * 1000)) / 1000;
  check(g > 0.01 && g < 300, `${b.id}: implausible surface gravity ${g.toFixed(2)} m/s2`);
  check(vEsc > 0.1 && vEsc < 700, `${b.id}: implausible escape velocity ${vEsc.toFixed(2)} km/s`);
  note(`${b.id.padEnd(9)} g=${g.toFixed(2)} m/s2  vesc=${vEsc.toFixed(2)} km/s`);

  // Kepler's third law against the stated orbital period.
  if (b.orbitDays && b.parent === 'sun') {
    const { planetElements } = await import('../src/astro/planets.js');
    const el = planetElements(b.id, 2451545.0);
    const aKm = el.a * AU_KM;
    const periodDays = (2 * Math.PI * Math.sqrt(Math.pow(aKm, 3) / GM_SUN)) / 86400;
    const ratio = periodDays / b.orbitDays;
    check(
      ratio > 0.99 && ratio < 1.01,
      `${b.id}: Kepler gives ${periodDays.toFixed(1)} d for a=${el.a.toFixed(4)} au but the catalogue says ${b.orbitDays}`
    );
    note(`${b.id.padEnd(9)} period ${periodDays.toFixed(2)} d vs ${b.orbitDays}`);
  }

  // Rotational elements must exist for anything we orient.
  check(!!IAU_POLES[b.id], `${b.id}: no IAU rotational elements`);

  // Obliquity is measured from the orbit normal, so it is in [0, 180].
  check(
    b.obliquityDeg >= 0 && b.obliquityDeg <= 180,
    `${b.id}: obliquity ${b.obliquityDeg} out of range`
  );

  // A retrograde rotation period should agree with an obliquity over 90.
  if (b.rotationDays != null && b.id !== 'sun') {
    const retrogradeBySign = b.rotationDays < 0;
    const retrogradeByTilt = b.obliquityDeg > 90;
    check(
      retrogradeBySign === retrogradeByTilt,
      `${b.id}: rotation sign (${b.rotationDays}) disagrees with obliquity (${b.obliquityDeg} deg)`
    );
  }
}

// ---------------------------------------------------------------------------
// Satellites: Hill sphere and Roche limit
// ---------------------------------------------------------------------------
for (const m of MOONS) {
  const parent = BODY_BY_ID.get(m.parent);
  check(!!parent, `${m.id}: unknown parent ${m.parent}`);
  if (!parent) continue;

  // A satellite must sit inside its planet's Hill sphere, or the Sun would
  // take it. r_H = a_planet * (m_planet / 3 M_sun)^(1/3)
  const { planetElements } = await import('../src/astro/planets.js');
  const planetA = planetElements(parent.id, 2451545.0).a * AU_KM;
  const sunMass = GM_SUN / G * 1e9; // GM in km^3/s^2 -> kg
  const hillKm = planetA * Math.cbrt(parent.massKg / (3 * sunMass));
  check(
    m.a < hillKm,
    `${m.id}: semi-major axis ${m.a} km exceeds ${parent.id}'s Hill radius of ${hillKm.toFixed(0)} km`
  );

  // And outside the Roche limit, or tides would pull it apart.
  //
  // Two limits matter, and using the wrong one gives a wrong answer for a real
  // moon. The FLUID limit, d = 2.44 R (rho_p/rho_m)^(1/3), applies to a body
  // held together only by its own gravity. The RIGID limit, 1.26 R
  // (rho_p/rho_m)^(1/3), applies to one with material strength. Phobos orbits
  // *inside* Mars's fluid limit and survives because it is a solid object — it
  // is visibly stressed (the grooves) and is expected to break up in a few tens
  // of millions of years. So the hard check uses the rigid limit, and crossing
  // the fluid limit is reported as the notable fact it is.
  const moonVolume = (4 / 3) * Math.PI * Math.pow(m.radiusKm * 1e5, 3);
  const moonDensity = m.massKg ? (m.massKg * 1000) / moonVolume : 1.5;
  const densityRatio = Math.cbrt(parent.densityGcm3 / moonDensity);
  const rocheFluidKm = 2.44 * parent.radiusKm * densityRatio;
  const rocheRigidKm = 1.26 * parent.radiusKm * densityRatio;
  check(
    m.a > rocheRigidKm,
    `${m.id}: semi-major axis ${m.a} km is inside ${parent.id}'s rigid Roche limit of ${rocheRigidKm.toFixed(0)} km`
  );
  if (m.a < rocheFluidKm) {
    note(`${m.id.padEnd(10)} orbits inside the FLUID Roche limit (${rocheFluidKm.toFixed(0)} km) — held together by material strength`);
  }
  note(`${m.id.padEnd(10)} a=${m.a} Roche(rigid)=${rocheRigidKm.toFixed(0)} Hill=${(hillKm / 1000).toFixed(0)}e3 rho=${moonDensity.toFixed(2)}`);

  // Kepler's third law about the barycentre.
  //
  // The two-body period depends on the SUM of the masses. For every satellite
  // here except one that is a rounding error — but Charon is 12 per cent of
  // Pluto's mass, so ignoring it puts the period out by six per cent and makes
  // a correct catalogue look wrong.
  const muParent = (G * (parent.massKg + (m.massKg || 0))) / 1e9; // km^3/s^2
  const periodDays = (2 * Math.PI * Math.sqrt(Math.pow(m.a, 3) / muParent)) / 86400;
  const ratio = periodDays / Math.abs(m.periodDays);
  check(
    ratio > 0.97 && ratio < 1.03,
    `${m.id}: Kepler gives ${periodDays.toFixed(4)} d but the catalogue says ${Math.abs(m.periodDays)}`
  );

  check(m.e >= 0 && m.e < 1, `${m.id}: eccentricity ${m.e} out of range`);
  check(m.iDeg >= 0 && m.iDeg <= 180, `${m.id}: inclination ${m.iDeg} out of range`);
  check(m.radiusKm > 0 && m.radiusKm < 3000, `${m.id}: implausible radius ${m.radiusKm}`);
  check(['equator', 'ecliptic'].includes(m.frame), `${m.id}: bad reference frame ${m.frame}`);
  // A retrograde orbit must be flagged both ways.
  check(
    (m.periodDays < 0) === (m.iDeg > 90),
    `${m.id}: period sign disagrees with inclination`
  );
}

// ---------------------------------------------------------------------------
// Rings
// ---------------------------------------------------------------------------
for (const [planetId, bands] of Object.entries(RING_SYSTEMS)) {
  const planet = BODY_BY_ID.get(planetId);
  check(!!planet, `rings: unknown planet ${planetId}`);
  if (!planet) continue;
  // A ring exists because it is inside the Roche limit for a ~0.9 g/cm3 icy
  // body; anything outside would have accreted into a moon.
  const rocheKm = 2.44 * planet.radiusKm * Math.cbrt(planet.densityGcm3 / 0.9);
  for (const band of bands) {
    check(band.inner > planet.radiusKm, `${planetId}/${band.name}: inner edge is inside the planet`);
    check(band.outer > band.inner, `${planetId}/${band.name}: outer edge is not outside the inner`);
    check(band.opacity >= 0 && band.opacity <= 1, `${planetId}/${band.name}: opacity out of range`);
    check(band.color.length === 3, `${planetId}/${band.name}: colour must be RGB`);
    if (band.inner > rocheKm * 1.6) {
      note(`${planetId}/${band.name} sits well beyond the Roche limit (${rocheKm.toFixed(0)} km) — expected for a gossamer ring`);
    }
  }
}

// ---------------------------------------------------------------------------
// Star catalogue
// ---------------------------------------------------------------------------
{
  const stars = JSON.parse(await readFile(resolve(ROOT, 'src/astro/data/stars.json'), 'utf8'));
  const n = stars.mag.length;
  check(n > 5000, `star catalogue has only ${n} entries`);
  check(stars.ra.length === n && stars.dec.length === n && stars.bv.length === n, 'star arrays are ragged');

  let sorted = true;
  const seen = new Set();
  let duplicates = 0;
  for (let i = 0; i < n; i++) {
    check(stars.ra[i] >= 0 && stars.ra[i] < 360.001, `star ${i}: RA ${stars.ra[i]} out of range`);
    check(stars.dec[i] >= -90.001 && stars.dec[i] <= 90.001, `star ${i}: Dec ${stars.dec[i]} out of range`);
    check(stars.mag[i] > -2 && stars.mag[i] < 7, `star ${i}: magnitude ${stars.mag[i]} out of range`);
    check(stars.bv[i] > -1 && stars.bv[i] < 4, `star ${i}: B-V ${stars.bv[i]} out of range`);
    if (i > 0 && stars.mag[i] < stars.mag[i - 1] - 1e-9) sorted = false;
    const key = `${stars.ra[i].toFixed(3)},${stars.dec[i].toFixed(3)}`;
    if (seen.has(key)) duplicates++;
    seen.add(key);
  }
  check(sorted, 'star catalogue is not sorted by magnitude');
  check(duplicates < n * 0.01, `${duplicates} duplicate star positions`);

  // The brightest entry must be Sirius, at its real coordinates.
  check(Math.abs(stars.mag[0] + 1.46) < 0.01, `brightest star has magnitude ${stars.mag[0]}, expected -1.46`);
  check(Math.abs(stars.ra[0] - 101.287) < 0.05, `brightest star RA ${stars.ra[0]}, expected 101.287`);
  check(Math.abs(stars.dec[0] + 16.716) < 0.05, `brightest star Dec ${stars.dec[0]}, expected -16.716`);
  check(stars.named.some((s) => s.n === 'Sirius'), 'Sirius is not named');
  note(`stars: ${n} entries, ${stars.named.length} named, ${duplicates} duplicate positions`);

  const constellations = JSON.parse(
    await readFile(resolve(ROOT, 'src/astro/data/constellations.json'), 'utf8')
  );
  check(constellations.figures.length >= 80, `only ${constellations.figures.length} constellations`);
  for (const f of constellations.figures) {
    check(!!f.id && f.lines.length > 0, `constellation ${f.id} has no lines`);
    for (const line of f.lines) {
      for (const [ra, dec] of line) {
        check(ra >= 0 && ra < 360.001, `${f.id}: RA ${ra} out of range`);
        check(dec >= -90.001 && dec <= 90.001, `${f.id}: Dec ${dec} out of range`);
      }
    }
  }
  note(`constellations: ${constellations.figures.length} figures`);
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
for (const n of notes) process.stdout.write(`  ${n}\n`);
for (const e of errors) process.stderr.write(`error: ${e}\n`);

if (errors.length) {
  process.stderr.write(`\n${errors.length} data error(s).\n`);
  process.exit(1);
}
process.stdout.write(
  `Data OK: ${BODIES.length} bodies, ${MOONS.length} satellites, ` +
    `${Object.keys(RING_SYSTEMS).length} ring systems, star catalogue verified\n`
);
