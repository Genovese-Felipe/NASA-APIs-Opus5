#!/usr/bin/env node
/**
 * Fetch the datasets a browser cannot reach and commit them as static JSON.
 *
 * Five healthy NASA services block cross-origin browser access:
 *
 *   ssd-api.jpl.nasa.gov      no Access-Control-Allow-Origin at all
 *   exoplanetarchive TAP      no Access-Control-Allow-Origin at all
 *   techport.nasa.gov         no Access-Control-Allow-Origin at all
 *   technology.nasa.gov       pins the header to its own origin
 *   osdr.nasa.gov             sends "osdr.nasa.gov", which is not a valid
 *                             origin (no scheme) and matches nothing
 *
 * A static site has exactly two options: proxy them through a third party, or
 * fetch them ahead of time. We fetch ahead of time. The result is faster, works
 * offline, adds no third-party dependency to the request path, and — because
 * the same snapshots are the fallback for the live APIs — means a visitor whose
 * DEMO_KEY quota is exhausted still sees a fully populated interface.
 *
 * Run by `.github/workflows/data-refresh.yml` on a schedule.
 *
 * Usage:  node tools/fetch-snapshots.mjs [--only sbdb,exoplanets] [--quiet]
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'src/data/snapshots');

const argv = process.argv.slice(2);
const QUIET = argv.includes('--quiet');
const onlyIdx = argv.indexOf('--only');
const ONLY = onlyIdx > -1 && argv[onlyIdx + 1] ? argv[onlyIdx + 1].split(',') : null;

const log = (...a) => {
  if (!QUIET) process.stdout.write(a.join(' ') + '\n');
};

/**
 * Fetch JSON with a timeout and a couple of retries.
 * @param {string} url
 * @param {object} [opts]
 * @returns {Promise<any>}
 */
async function getJSON(url, opts = {}) {
  const attempts = opts.retries ?? 2;
  let lastErr;
  for (let i = 0; i <= attempts; i++) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), opts.timeout ?? 60_000);
    try {
      const res = await fetch(url, {
        signal: ac.signal,
        headers: { accept: 'application/json', 'user-agent': 'orrery-snapshot/1.0 (+github-actions)' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      const text = await res.text();
      return JSON.parse(text);
    } catch (err) {
      lastErr = err;
      if (i < attempts) await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

const iso = (d) => d.toISOString().slice(0, 10);

/**
 * Each source declares what it produces and how. Keeping them declarative makes
 * it obvious what the snapshot contains and lets one failure not stop the rest.
 */
const SOURCES = {
  /** JPL close approaches, impact risk, and fireball airbursts. */
  async sbdb() {
    const now = new Date();
    const in180 = new Date(now.getTime() + 180 * 86400_000);
    const [cad, sentry, fireballs] = await Promise.all([
      getJSON(
        'https://ssd-api.jpl.nasa.gov/cad.api?' +
          new URLSearchParams({
            'date-min': iso(now),
            'date-max': iso(in180),
            'dist-max': '0.05',
            sort: 'dist',
            'diameter': 'true',
          })
      ),
      getJSON('https://ssd-api.jpl.nasa.gov/sentry.api?ps-min=-6'),
      getJSON('https://ssd-api.jpl.nasa.gov/fireball.api?limit=60&req-loc=true'),
    ]);

    return {
      closeApproaches: { fields: cad.fields, data: (cad.data || []).slice(0, 300), count: cad.count },
      sentry: {
        count: sentry.count,
        // Keep only the fields the UI shows; the full record is large.
        objects: (sentry.data || []).slice(0, 120).map((o) => ({
          designation: o.des,
          fullname: o.fullname,
          impactProbability: Number(o.ip),
          palermoScale: Number(o.ps_cum),
          torinoScale: o.ts_max != null ? Number(o.ts_max) : null,
          diameterKm: o.diameter != null ? Number(o.diameter) : null,
          velocityKmS: Number(o.v_inf),
          impacts: Number(o.n_imp),
          yearRange: o.range,
          lastObserved: o.last_obs,
          absoluteMagnitude: Number(o.h),
        })),
      },
      fireballs: {
        fields: fireballs.fields,
        data: fireballs.data || [],
        count: fireballs.count,
      },
    };
  },

  /** Confirmed exoplanets, from the composite-parameters table. */
  async exoplanets() {
    const query = [
      'select pl_name,hostname,sy_snum,sy_pnum,discoverymethod,disc_year,disc_facility,',
      'pl_orbper,pl_orbsmax,pl_rade,pl_bmasse,pl_eqt,pl_orbeccen,',
      'st_teff,st_rad,st_mass,sy_dist,ra,dec',
      ' from pscomppars where pl_rade is not null and sy_dist is not null',
      ' order by sy_dist asc',
    ].join('');
    const rows = await getJSON(
      'https://exoplanetarchive.ipac.caltech.edu/TAP/sync?' +
        new URLSearchParams({ query, format: 'json' }),
      { timeout: 120_000 }
    );

    const total = rows.length;
    // The full table is several megabytes. Keep the thousand nearest systems —
    // which is what the "nearby worlds" view can actually draw — plus a
    // histogram computed over everything so the statistics stay honest.
    const nearest = rows.slice(0, 1000).map((r) => ({
      name: r.pl_name,
      host: r.hostname,
      method: r.discoverymethod,
      year: r.disc_year,
      facility: r.disc_facility,
      periodDays: r.pl_orbper,
      smaAu: r.pl_orbsmax,
      radiusEarth: r.pl_rade,
      massEarth: r.pl_bmasse,
      eqTempK: r.pl_eqt,
      eccentricity: r.pl_orbeccen,
      starTeffK: r.st_teff,
      starRadiusSun: r.st_rad,
      starMassSun: r.st_mass,
      distancePc: r.sy_dist,
      ra: r.ra,
      dec: r.dec,
      planetsInSystem: r.sy_pnum,
    }));

    const byYear = {};
    const byMethod = {};
    const radiusHistogram = new Array(24).fill(0);
    for (const r of rows) {
      if (r.disc_year) byYear[r.disc_year] = (byYear[r.disc_year] || 0) + 1;
      if (r.discoverymethod) byMethod[r.discoverymethod] = (byMethod[r.discoverymethod] || 0) + 1;
      if (r.pl_rade > 0) {
        // Log-spaced bins from 0.3 to 30 Earth radii.
        const b = Math.floor(((Math.log10(r.pl_rade) + 0.52) / 2.0) * 24);
        if (b >= 0 && b < 24) radiusHistogram[b]++;
      }
    }
    return { total, nearest, byYear, byMethod, radiusHistogram };
  },

  /** A curated slice of NASA's technology portfolio. */
  async techport() {
    const since = iso(new Date(Date.now() - 365 * 86400_000));
    const list = await getJSON(`https://techport.nasa.gov/api/projects?updatedSince=${since}`, {
      timeout: 120_000,
    });
    const ids = (list.projects || []).slice(0, 60).map((p) => p.projectId);
    const projects = [];
    for (const id of ids) {
      try {
        const p = await getJSON(`https://techport.nasa.gov/api/projects/${id}`, { retries: 0, timeout: 30_000 });
        const proj = p.project || p;
        projects.push({
          id: proj.projectId ?? id,
          title: proj.title,
          description: stripTags(proj.description).slice(0, 800),
          status: proj.statusDescription || proj.status,
          startDate: proj.startDate,
          endDate: proj.endDate,
          trlBegin: proj.startTrl ?? null,
          trlEnd: proj.currentTrl ?? proj.endTrl ?? null,
          leadOrg: proj.leadOrganization?.name || null,
          benefits: stripTags(proj.benefits).slice(0, 500),
          website: proj.website || null,
        });
      } catch {
        /* one project failing must not lose the rest */
      }
    }
    return { count: projects.length, projects };
  },

  /** Spaceflight biology studies. */
  async osdr() {
    const search = await getJSON(
      'https://osdr.nasa.gov/osdr/data/search?' +
        new URLSearchParams({ term: 'space flight', size: '40', type: 'cgene' }),
      { timeout: 90_000 }
    );
    const hits = search.hits?.hits || search.hits || [];
    const studies = (Array.isArray(hits) ? hits : []).map((h) => {
      const s = h._source || h;
      return {
        accession: s['Accession'] || s.accession || null,
        title: s['Study Title'] || s.title || null,
        description: (s['Study Description'] || s.description || '').slice(0, 600),
        organism: s['organism'] || s['Study Factor Type'] || null,
        assay: s['Study Assay Technology Type'] || null,
        factor: s['Study Factor Name'] || null,
        mission: s['Mission'] || null,
        releaseDate: s['Study Public Release Date'] || null,
      };
    });
    return { count: studies.length, studies };
  },

  /** NASA patents available for licensing. */
  async techtransfer() {
    const terms = ['sensor', 'propulsion', 'robotics', 'materials'];
    const patents = [];
    for (const term of terms) {
      try {
        const raw = await getJSON(`https://technology.nasa.gov/api/query/patent/${term}`, {
          timeout: 45_000,
          retries: 1,
        });
        for (const row of (raw.results || []).slice(0, 15)) {
          // The API returns positional arrays; index 2 is the title and 3 the
          // abstract, with HTML <span class="highlight"> already embedded.
          patents.push({
            id: row[0],
            reference: row[1],
            title: stripTags(row[2]),
            abstract: stripTags(row[3]).slice(0, 700),
            category: row[5] || null,
            center: row[9] || row[10] || null,
            searchTerm: term,
          });
        }
      } catch {
        /* one search term failing must not lose the rest */
      }
    }
    return { count: patents.length, patents };
  },
};

/** @param {string} s */
function stripTags(s) {
  return String(s || '')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const names = Object.keys(SOURCES).filter((n) => !ONLY || ONLY.includes(n));
  let failures = 0;

  for (const name of names) {
    const started = Date.now();
    try {
      log(`> ${name} ...`);
      const data = await SOURCES[name]();
      const payload = {
        _source: name,
        _note: 'Generated by tools/fetch-snapshots.mjs. Do not edit by hand.',
        fetchedAt: new Date().toISOString(),
        data,
      };
      const file = resolve(OUT, `${name}.json`);
      await writeFile(file, JSON.stringify(payload));
      const kb = Math.round(JSON.stringify(payload).length / 1024);
      log(`  ok  ${name}.json (${kb} KB, ${Date.now() - started} ms)`);
    } catch (err) {
      failures++;
      process.stderr.write(`  FAIL ${name}: ${err.message}\n`);
    }
  }

  if (failures === names.length) {
    process.stderr.write('All snapshot sources failed.\n');
    process.exit(1);
  }
  if (failures) {
    process.stderr.write(`${failures} of ${names.length} sources failed; existing snapshots kept.\n`);
  }
}

main().catch((err) => {
  process.stderr.write(`fetch-snapshots failed: ${err.stack || err.message}\n`);
  process.exit(1);
});
