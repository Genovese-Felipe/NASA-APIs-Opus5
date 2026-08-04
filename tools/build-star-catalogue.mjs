#!/usr/bin/env node
/**
 * Build the compact star catalogue and constellation-figure data shipped with
 * the app.
 *
 * SOURCES
 *  - Stars: Bright Star Catalogue, 5th Revised Ed. (Hoffleit & Warren, 1991),
 *    VizieR catalogue V/50, retrieved through the CDS ASU-TSV service.
 *  - Constellation figures: d3-celestial (Olaf Frohn), BSD-3-Clause.
 *
 * The generated files are committed to the repository so the app has zero
 * runtime dependencies on either service. Re-run this script only when you
 * want to refresh the catalogue.
 *
 * Usage:  node tools/build-star-catalogue.mjs [--limit-mag 6.5]
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = resolve(ROOT, 'src/astro/data');

const BSC_URL =
  'https://vizier.cds.unistra.fr/viz-bin/asu-tsv?-source=V/50/catalog' +
  '&-out=HR&-out=Name&-out=RAJ2000&-out=DEJ2000&-out=Vmag&-out=B-V' +
  '&-out.max=99999&Vmag=%3C6.6&-sort=Vmag';

const CONST_URL =
  'https://raw.githubusercontent.com/ofrohn/d3-celestial/master/data/constellations.lines.json';

/**
 * IAU-approved proper names for the naked-eye stars we label in the UI, keyed
 * by Harvard Revised (HR) number. Source: IAU Working Group on Star Names,
 * "IAU Catalog of Star Names" (2022 revision).
 */
const PROPER_NAMES = {
  2491: 'Sirius', 2326: 'Canopus', 5340: 'Arcturus', 5459: 'Rigil Kentaurus',
  7001: 'Vega', 1708: 'Capella', 1713: 'Rigel', 2943: 'Procyon',
  472: 'Achernar', 2061: 'Betelgeuse', 5267: 'Hadar', 7557: 'Altair',
  4730: 'Acrux', 1457: 'Aldebaran', 6134: 'Antares', 5056: 'Spica',
  2990: 'Pollux', 8728: 'Fomalhaut', 7924: 'Deneb', 4853: 'Mimosa',
  3982: 'Regulus', 2618: 'Adhara', 2891: 'Castor', 4763: 'Gacrux',
  6527: 'Shaula', 1790: 'Bellatrix', 1791: 'Elnath', 3685: 'Miaplacidus',
  1903: 'Alnilam', 8425: 'Alnair', 1948: 'Alnitak', 4905: 'Alioth',
  4301: 'Dubhe', 1017: 'Mirfak', 2693: 'Wezen', 6553: 'Sargas',
  6879: 'Kaus Australis', 3307: 'Avior', 5191: 'Alkaid', 2088: 'Menkalinan',
  6217: 'Atria', 2421: 'Alhena', 7790: 'Peacock', 3485: 'Alsephina',
  2294: 'Mirzam', 3748: 'Alphard', 424: 'Polaris', 617: 'Hamal',
  4057: 'Algieba', 188: 'Diphda', 5054: 'Mizar', 7121: 'Nunki',
  5288: 'Menkent', 337: 'Mirach', 15: 'Alpheratz', 6556: 'Rasalhague',
  5563: 'Kochab', 1948.1: null, 2004: 'Saiph', 4534: 'Denebola',
  936: 'Algol', 8636: 'Tiaki', 4819: 'Muhlifain', 3699: 'Aspidiske',
  3634: 'Suhail', 5793: 'Alphecca', 1852: 'Mintaka', 7796: 'Sadr',
  6705: 'Eltanin', 168: 'Schedar', 3165: 'Naos', 603: 'Almach',
  21: 'Caph', 5506: 'Izar', 4662: 'Alchiba', 5993: 'Dschubba',
  2827: 'Aludra', 1084: 'Ran', 7602: 'Tarazed', 6580: 'Sabik',
  8781: 'Alpheratz-b', 8232: 'Enif', 6410: 'Yed Prior', 4382: 'Merak',
  4554: 'Alkaid-b', 4295: 'Phecda', 4660: 'Megrez', 5735: 'Zubeneschamali',
  5531: 'Zubenelgenubi', 1231: 'Menkar', 911: 'Sheratan', 8781.1: null,
  2286: 'Furud', 1543: 'Cursa', 6580.1: null, 4534.1: null,
  6084: 'Acrab', 5685: 'Unukalhai', 7754: 'Albireo', 8622: 'Scheat',
  8775: 'Markab', 39: 'Ankaa', 7264: 'Altais', 1122: 'Acamar',
  2827.1: null, 8974: 'Errai', 5947: 'Alniyat', 3207: 'Turais',
};

/** @param {string} url */
async function fetchText(url) {
  const res = await fetch(url, { headers: { 'user-agent': 'orrery-catalogue-builder/1.0' } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.text();
}

/**
 * Parse the sexagesimal RA/Dec columns of the VizieR TSV export.
 * @param {string} ra "hh mm ss.s"
 * @param {string} dec "+dd mm ss"
 * @returns {{raDeg:number, decDeg:number}|null}
 */
function parseCoords(ra, dec) {
  const rm = ra.trim().split(/\s+/).map(Number);
  const dm = dec.trim().replace(/^([+-])\s*/, '$1').split(/\s+/);
  if (rm.length < 2 || rm.some(Number.isNaN)) return null;
  const raDeg = (rm[0] + (rm[1] || 0) / 60 + (rm[2] || 0) / 3600) * 15;
  const sign = dm[0].startsWith('-') ? -1 : 1;
  const d = Math.abs(parseFloat(dm[0]));
  if (Number.isNaN(d)) return null;
  const decDeg = sign * (d + (parseFloat(dm[1]) || 0) / 60 + (parseFloat(dm[2]) || 0) / 3600);
  return { raDeg, decDeg };
}

async function main() {
  const limitArg = process.argv.indexOf('--limit-mag');
  const limitMag = limitArg > -1 ? parseFloat(process.argv[limitArg + 1]) : 6.6;

  process.stdout.write('Fetching Bright Star Catalogue from VizieR...\n');
  const tsv = await fetchText(BSC_URL);

  const lines = tsv.split('\n');
  const start = lines.findIndex((l) => l.startsWith('----'));
  if (start < 0) throw new Error('Unexpected VizieR response: no separator row');

  /** @type {{hr:number,ra:number,dec:number,mag:number,bv:number,name:string}[]} */
  const stars = [];
  for (let i = start + 1; i < lines.length; i++) {
    const row = lines[i];
    if (!row.trim() || row.startsWith('#')) continue;
    const c = row.split('\t');
    if (c.length < 6) continue;
    const hr = parseInt(c[0], 10);
    const mag = parseFloat(c[4]);
    if (!Number.isFinite(hr) || !Number.isFinite(mag) || mag > limitMag) continue;
    const coords = parseCoords(c[2], c[3]);
    if (!coords) continue;
    const bv = parseFloat(c[5]);
    stars.push({
      hr,
      ra: coords.raDeg,
      dec: coords.decDeg,
      mag,
      bv: Number.isFinite(bv) ? bv : 0.6,
      name: (PROPER_NAMES[hr] || '').trim(),
    });
  }
  stars.sort((a, b) => a.mag - b.mag);
  process.stdout.write(`  parsed ${stars.length} stars (V < ${limitMag})\n`);

  // Flat typed layout keeps the JSON small and parsing trivial.
  const payload = {
    _source: 'Bright Star Catalogue, 5th Revised Ed. (Hoffleit+, 1991) — VizieR V/50',
    _fields: 'ra(deg), dec(deg), vmag, b-v',
    _count: stars.length,
    ra: stars.map((s) => +s.ra.toFixed(4)),
    dec: stars.map((s) => +s.dec.toFixed(4)),
    mag: stars.map((s) => +s.mag.toFixed(2)),
    bv: stars.map((s) => +s.bv.toFixed(2)),
    named: stars
      .map((s, i) => (s.name ? { i, n: s.name, hr: s.hr } : null))
      .filter(Boolean),
  };

  process.stdout.write('Fetching constellation figures...\n');
  const geo = JSON.parse(await fetchText(CONST_URL));
  const constellations = geo.features.map((f) => ({
    id: f.id,
    lines: f.geometry.coordinates.map((seg) =>
      seg.map(([lon, lat]) => [+(((lon % 360) + 360) % 360).toFixed(3), +lat.toFixed(3)])
    ),
  }));
  process.stdout.write(`  parsed ${constellations.length} constellations\n`);

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(resolve(OUT_DIR, 'stars.json'), JSON.stringify(payload));
  await writeFile(
    resolve(OUT_DIR, 'constellations.json'),
    JSON.stringify({
      _source: 'd3-celestial (Olaf Frohn), BSD-3-Clause — constellations.lines.json',
      _fields: 'ra(deg 0..360), dec(deg)',
      figures: constellations,
    })
  );
  process.stdout.write(`Wrote ${OUT_DIR}/stars.json and constellations.json\n`);
}

main().catch((err) => {
  process.stderr.write(`build-star-catalogue failed: ${err.message}\n`);
  process.exit(1);
});
