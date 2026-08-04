/**
 * The catalogue of NASA data services this application talks to.
 *
 * Every entry was probed live (status code **and** `Access-Control-Allow-Origin`
 * header) before being written down. The `access` field is the single most
 * important thing here, because it decides whether a panel can fetch its own
 * data at runtime or must read a snapshot committed by CI:
 *
 *   'browser'  — sends a usable CORS header; fetch it directly from the page.
 *   'snapshot' — healthy service, but no (or a wrong) CORS header. A browser
 *                cannot read it. `tools/fetch-snapshots.mjs` pulls it in GitHub
 *                Actions and commits the result to `src/data/snapshots/`.
 *   'retired'  — the endpoint is gone. Kept in the registry, with the reason,
 *                so nobody re-adds it and so the UI can explain the absence.
 *
 * Findings that cost real debugging time are recorded in `notes`.
 *
 * @module data/registry
 */

/**
 * @typedef {object} ApiEntry
 * @property {string} id Stable identifier.
 * @property {string} name Human-readable name.
 * @property {'browser'|'snapshot'|'retired'} access
 * @property {string} base Base URL.
 * @property {boolean} needsKey Requires an api.nasa.gov key.
 * @property {string} docs Documentation URL.
 * @property {string} blurb One line on what makes it interesting.
 * @property {string} [notes] Hard-won operational detail.
 * @property {string} [snapshot] Snapshot filename when `access === 'snapshot'`.
 * @property {string} [replacedBy] Suggested substitute for retired services.
 */

/** @type {ReadonlyArray<ApiEntry>} */
export const APIS = Object.freeze([
  {
    id: 'apod',
    name: 'APOD — Astronomy Picture of the Day',
    access: 'browser',
    base: 'https://api.nasa.gov/planetary/apod',
    needsKey: true,
    docs: 'https://api.nasa.gov/#apod',
    blurb: 'A curated astronomical image every day since 1995, with an expert explanation.',
    notes: 'Returns `media_type: "video"` for roughly one entry a week; those are YouTube/Vimeo embeds, not images, and must be branched on.',
  },
  {
    id: 'neows',
    name: 'Asteroids NeoWs',
    access: 'browser',
    base: 'https://api.nasa.gov/neo/rest/v1',
    needsKey: true,
    docs: 'https://api.nasa.gov/#NeoWS',
    blurb: 'Every near-Earth object approach, with full Keplerian elements — enough to draw the real orbit.',
    notes: 'The feed endpoint accepts a maximum span of seven days. `orbital_data` is only present on lookup/browse responses, not on the feed unless `detailed=true`.',
  },
  {
    id: 'epic',
    name: 'EPIC — Earth Polychromatic Imaging Camera',
    access: 'browser',
    base: 'https://api.nasa.gov/EPIC/api',
    needsKey: true,
    docs: 'https://api.nasa.gov/#epic',
    blurb: 'The full sunlit disc of Earth from a million miles away, about thirteen times a day.',
    notes: '`/natural/images` answers 302 to epic.gsfc.nasa.gov; use `/natural/all` or `/natural/date/{date}` instead. Archive PNGs are ~2.8 MB each — prefer the JPEG variant for thumbnails.',
  },
  {
    id: 'eonet',
    name: 'EONET — Earth Observatory Natural Event Tracker',
    access: 'browser',
    base: 'https://eonet.gsfc.nasa.gov/api/v3',
    needsKey: false,
    docs: 'https://eonet.gsfc.nasa.gov/docs/v3',
    blurb: 'Wildfires, volcanoes, storms and icebergs, as they are happening, with tracks.',
    notes: 'Sometimes answers with `Content-Type: application/rss+xml` while the body is JSON. Never branch on the content type here — always parse as JSON.',
  },
  {
    id: 'donki',
    name: 'DONKI — Space Weather Database',
    access: 'browser',
    base: 'https://kauai.ccmc.gsfc.nasa.gov/DONKI/WS/get',
    needsKey: false,
    docs: 'https://ccmc.gsfc.nasa.gov/tools/DONKI/',
    blurb: 'Solar flares, coronal mass ejections and geomagnetic storms, with modelled arrival times.',
    notes: 'The api.nasa.gov mirror (`/DONKI/*`) has been answering 502/503 for an extended period. This entry points at the CCMC origin the mirror proxies, which is healthy, sends `Access-Control-Allow-Origin: *`, and needs no key.',
  },
  {
    id: 'images',
    name: 'NASA Image and Video Library',
    access: 'browser',
    base: 'https://images-api.nasa.gov',
    needsKey: false,
    docs: 'https://api.nasa.gov/#NASAIVL',
    blurb: 'Every public NASA image, video and audio asset, searchable — Apollo scans through Webb releases.',
    notes: '`/captions/{id}` legitimately 404s for most assets; treat that as "no captions", not an error.',
  },
  {
    id: 'gibs',
    name: 'GIBS — Global Imagery Browse Services',
    access: 'browser',
    base: 'https://gibs.earthdata.nasa.gov/wmts/epsg4326/best',
    needsKey: false,
    docs: 'https://nasa-gibs.github.io/gibs-api-docs/',
    blurb: 'A thousand daily-updated global satellite layers, addressed by date — the Earth texture, for any day.',
    notes: 'The WMTS capabilities document is about 5 MB. Never fetch it at runtime; the layer identifiers are hard-coded in `data/imagery.js`.',
  },
  {
    id: 'trek',
    name: 'Trek WMTS — Moon, Mars, Mercury, Vesta',
    access: 'browser',
    base: 'https://trek.nasa.gov/tiles',
    needsKey: false,
    docs: 'https://api.nasa.gov/#trek',
    blurb: 'Photographic basemaps of other worlds: LRO for the Moon, Viking colour for Mars, MESSENGER for Mercury.',
    notes: 'The URLs printed in the official documentation are dead (moontrek.jpl.nasa.gov answers 502, and the api.nasa.gov tile paths 404). Only `trek.nasa.gov/tiles/...` serves tiles.',
  },
  {
    id: 'power',
    name: 'POWER — Prediction of Worldwide Energy Resources',
    access: 'browser',
    base: 'https://power.larc.nasa.gov/api',
    needsKey: false,
    docs: 'https://power.larc.nasa.gov/docs/services/api/',
    blurb: 'Forty years of global solar and meteorological reanalysis, for any point on Earth.',
  },
  {
    id: 'ssc',
    name: 'Satellite Situation Center',
    access: 'browser',
    base: 'https://sscweb.gsfc.nasa.gov/WS/sscr/2',
    needsKey: false,
    docs: 'https://sscweb.gsfc.nasa.gov/WebServices/REST/',
    blurb: 'Real geocentric ephemeris for hundreds of spacecraft, including the ISS.',
    notes: 'Defaults to XML. Send `Accept: application/json` to get JSON — which does work, despite the documentation implying otherwise.',
  },
  {
    id: 'tle',
    name: 'TLE API — two-line elements',
    access: 'browser',
    base: 'https://tle.ivanstanojevic.me/api',
    needsKey: false,
    docs: 'https://tle.ivanstanojevic.me/',
    blurb: 'Current orbital elements for tracked satellites, refreshed daily from CelesTrak.',
    notes: 'Third-party service that NASA merely links to. The trailing slash is mandatory: `/api/tle/` works, `/api/tle` answers 508 "Resource Limit Is Reached".',
  },

  // ---- CORS-blocked: healthy, but only reachable from CI -------------------
  {
    id: 'sbdb',
    name: 'JPL SSD / CNEOS — Small-Body Database',
    access: 'snapshot',
    snapshot: 'sbdb.json',
    base: 'https://ssd-api.jpl.nasa.gov',
    needsKey: false,
    docs: 'https://ssd-api.jpl.nasa.gov/doc/',
    blurb: 'The authoritative source for close approaches, impact risk and fireball airbursts.',
    notes: 'Sends no Access-Control-Allow-Origin at all, and answers 405 to a preflight. Unreachable from a browser; fetched in CI.',
  },
  {
    id: 'exoplanets',
    name: 'NASA Exoplanet Archive',
    access: 'snapshot',
    snapshot: 'exoplanets.json',
    base: 'https://exoplanetarchive.ipac.caltech.edu/TAP/sync',
    needsKey: false,
    docs: 'https://exoplanetarchive.ipac.caltech.edu/docs/TAP/usingTAP.html',
    blurb: 'Every confirmed planet beyond the solar system, with orbit, radius, mass and host star.',
    notes: 'The TAP endpoint sends no CORS header. The legacy `nph-nstedAPI` endpoint does, but its table list has changed and the documented example tables no longer exist.',
  },
  {
    id: 'techport',
    name: 'TechPort',
    access: 'snapshot',
    snapshot: 'techport.json',
    base: 'https://techport.nasa.gov/api',
    needsKey: false,
    docs: 'https://techport.nasa.gov/help/articles/api',
    blurb: "NASA's funded technology portfolio, with technology-readiness levels and budgets.",
    notes: 'No CORS header. The project list endpoint returns about 1.6 MB of bare ids, so the snapshot resolves a curated subset to full records.',
  },
  {
    id: 'osdr',
    name: 'Open Science Data Repository (GeneLab)',
    access: 'snapshot',
    snapshot: 'osdr.json',
    base: 'https://osdr.nasa.gov/osdr/data',
    needsKey: false,
    docs: 'https://visualization.osdr.nasa.gov/biodata/api/',
    blurb: 'Spaceflight biology: what actually happens to genes in orbit.',
    notes: 'Sends `Access-Control-Allow-Origin: osdr.nasa.gov` — not a valid origin (no scheme), so every browser rejects it. Looks like a misconfiguration rather than policy, but the effect is a hard block.',
  },
  {
    id: 'techtransfer',
    name: 'TechTransfer — NASA patent portfolio',
    access: 'snapshot',
    snapshot: 'techtransfer.json',
    base: 'https://technology.nasa.gov/api/query',
    needsKey: false,
    docs: 'https://api.nasa.gov/#techtransfer',
    blurb: 'Patented NASA technology available for licensing — the origin of a lot of everyday hardware.',
    notes: 'api.nasa.gov answers 302 and drops the path. The real endpoint is `technology.nasa.gov/api/query/{patent|software|spinoff}/{term}`, which pins Access-Control-Allow-Origin to its own origin.',
  },

  // ---- retired -------------------------------------------------------------
  {
    id: 'mars-photos',
    name: 'Mars Rover Photos',
    access: 'retired',
    base: 'https://api.nasa.gov/mars-photos/api/v1',
    needsKey: true,
    docs: 'https://api.nasa.gov/',
    blurb: 'Raw camera frames from Curiosity, Opportunity, Spirit and Perseverance.',
    notes: 'Every path answers 404 with a dead-backend page, and the API has been removed from the api.nasa.gov manifest. Not an outage.',
    replacedBy: 'images',
  },
  {
    id: 'earth-imagery',
    name: 'Earth / Landsat imagery',
    access: 'retired',
    base: 'https://api.nasa.gov/planetary/earth',
    needsKey: true,
    docs: 'https://api.nasa.gov/',
    blurb: 'Landsat scenes for a given latitude and longitude.',
    notes: 'Connections open and never respond — no status line even after 90 seconds — and the API has been removed from the manifest.',
    replacedBy: 'gibs',
  },
]);

/** @type {Map<string, ApiEntry>} */
export const API_BY_ID = new Map(APIS.map((a) => [a.id, a]));

/** APIs a browser can call directly. */
export const LIVE_APIS = APIS.filter((a) => a.access === 'browser');

/** APIs served from CI-committed snapshots. */
export const SNAPSHOT_APIS = APIS.filter((a) => a.access === 'snapshot');

/** APIs that no longer exist. */
export const RETIRED_APIS = APIS.filter((a) => a.access === 'retired');

/**
 * Documented api.nasa.gov rate limits.
 * Source: https://api.nasa.gov/ ("Authentication" section).
 */
export const RATE_LIMITS = Object.freeze({
  demo: { perHour: 30, perDay: 50, label: 'DEMO_KEY' },
  personal: { perHour: 1000, perDay: null, label: 'personal key' },
});
