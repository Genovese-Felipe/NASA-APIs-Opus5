/**
 * Adapters: one function per NASA service, each returning a shape the UI can
 * render without knowing anything about the wire format.
 *
 * Every adapter returns `{ data, source, at, error? }` from
 * {@link module:data/client.fetchJSON}, so a caller can always tell whether it
 * is looking at live data, a cached copy, or the snapshot committed by CI.
 *
 * @module data/nasa
 */

import { fetchJSON, loadSnapshot } from './client.js';
import { API_BY_ID } from './registry.js';
import { AU_KM, JD_J2000 } from '../astro/constants.js';
import { dateToJD } from '../astro/time.js';

/** Format a Date as YYYY-MM-DD in UTC. @param {Date} d @returns {string} */
export function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// APOD
// ---------------------------------------------------------------------------

/**
 * Astronomy Picture of the Day.
 * @param {object} [opts]
 * @param {string} [opts.date] YYYY-MM-DD.
 * @param {number} [opts.count] Fetch N random entries instead of one date.
 * @returns {Promise<import('./client.js').FetchResult>} `data` is an array of
 *   `{date, title, explanation, url, hdurl, mediaType, copyright}`.
 */
export async function getAPOD(opts = {}) {
  const base = API_BY_ID.get('apod').base;
  const params = new URLSearchParams({ thumbs: 'true' });
  if (opts.count) params.set('count', String(opts.count));
  else if (opts.date) params.set('date', opts.date);

  return fetchJSON('apod', `${base}?${params}`, {
    // Today's picture changes once a day; six hours is a good compromise
    // between freshness and the 30-requests-per-hour demo quota.
    ttl: 6 * 3600_000,
    transform: (raw) => (Array.isArray(raw) ? raw : [raw]).map(normaliseAPOD),
  });
}

/** @private */
function normaliseAPOD(a) {
  return {
    date: a.date,
    title: a.title,
    explanation: a.explanation,
    url: a.media_type === 'video' ? a.thumbnail_url || a.url : a.url,
    hdurl: a.hdurl || a.url,
    embedUrl: a.media_type === 'video' ? a.url : null,
    mediaType: a.media_type,
    copyright: a.copyright ? a.copyright.trim() : null,
  };
}

// ---------------------------------------------------------------------------
// Near-Earth objects
// ---------------------------------------------------------------------------

/**
 * Near-Earth object close approaches for a date range.
 *
 * The feed endpoint accepts at most a seven-day span; longer ranges are
 * silently rejected by the service, so the caller's range is clamped here.
 *
 * @param {object} [opts]
 * @param {Date} [opts.start]
 * @param {number} [opts.days=7]
 * @returns {Promise<import('./client.js').FetchResult>} `data` is a sorted
 *   array of normalised objects, closest approach first.
 */
export async function getNEOFeed(opts = {}) {
  const base = API_BY_ID.get('neows').base;
  const start = opts.start || new Date();
  const days = Math.min(Math.max(opts.days ?? 7, 1), 7);
  const end = new Date(start.getTime() + (days - 1) * 86400_000);

  return fetchJSON(
    'neows',
    `${base}/feed?start_date=${isoDate(start)}&end_date=${isoDate(end)}`,
    {
      ttl: 3 * 3600_000,
      transform: (raw) => {
        const out = [];
        for (const list of Object.values(raw.near_earth_objects || {})) {
          for (const neo of list) out.push(normaliseNEO(neo));
        }
        out.sort((a, b) => a.missDistanceKm - b.missDistanceKm);
        return out;
      },
    }
  );
}

/**
 * Full record for a single NEO, including the orbital elements needed to draw
 * its orbit.
 * @param {string} id NeoWs reference id.
 * @returns {Promise<import('./client.js').FetchResult>}
 */
export async function getNEO(id) {
  const base = API_BY_ID.get('neows').base;
  return fetchJSON('neows', `${base}/neo/${encodeURIComponent(id)}`, {
    ttl: 30 * 86400_000, // orbital elements barely move
    transform: normaliseNEO,
  });
}

/**
 * A browse page of the NEO catalogue — used to seed the 3D view with real
 * asteroid orbits without needing a specific date range.
 * @param {number} [page=0]
 * @param {number} [size=20]
 * @returns {Promise<import('./client.js').FetchResult>}
 */
export async function browseNEOs(page = 0, size = 20) {
  const base = API_BY_ID.get('neows').base;
  return fetchJSON('neows', `${base}/neo/browse?page=${page}&size=${size}`, {
    ttl: 7 * 86400_000,
    transform: (raw) => (raw.near_earth_objects || []).map(normaliseNEO),
  });
}

/** @private */
function normaliseNEO(neo) {
  const ca = (neo.close_approach_data || [])[0] || {};
  const dia = neo.estimated_diameter?.kilometers || {};
  const od = neo.orbital_data || null;
  const dMin = dia.estimated_diameter_min ?? 0;
  const dMax = dia.estimated_diameter_max ?? 0;

  return {
    id: neo.neo_reference_id || neo.id,
    name: (neo.name || '').replace(/^\((.*)\)$/, '$1'),
    designation: neo.designation || null,
    absoluteMagnitude: neo.absolute_magnitude_h ?? null,
    diameterKmMin: dMin,
    diameterKmMax: dMax,
    radiusKm: ((dMin + dMax) / 2) * 0.5,
    hazardous: !!neo.is_potentially_hazardous_asteroid,
    sentryObject: !!neo.is_sentry_object,
    approachDate: ca.close_approach_date_full || ca.close_approach_date || null,
    approachEpoch: ca.epoch_date_close_approach ?? null,
    missDistanceKm: parseFloat(ca.miss_distance?.kilometers ?? 'Infinity'),
    missDistanceLunar: parseFloat(ca.miss_distance?.lunar ?? 'NaN'),
    velocityKmS: parseFloat(ca.relative_velocity?.kilometers_per_second ?? 'NaN'),
    orbitingBody: ca.orbiting_body || null,
    url: neo.nasa_jpl_url || null,
    // Elements are only present on lookup/browse responses.
    elements: od
      ? {
          a: parseFloat(od.semi_major_axis),
          e: parseFloat(od.eccentricity),
          i: parseFloat(od.inclination),
          om: parseFloat(od.ascending_node_longitude),
          w: parseFloat(od.perihelion_argument),
          ma: parseFloat(od.mean_anomaly),
          n: parseFloat(od.mean_motion),
          epoch: parseFloat(od.epoch_osculation),
          periodDays: parseFloat(od.orbital_period),
          orbitClass: od.orbit_class?.orbit_class_type || null,
          orbitClassDescription: od.orbit_class?.orbit_class_description || null,
        }
      : null,
  };
}

/**
 * Convert normalised NEOs into the record shape
 * {@link module:astro/ephemeris.addSmallBodies} expects.
 * @param {Array<object>} neos
 * @returns {Array<object>}
 */
export function neosToSmallBodies(neos) {
  return neos
    .filter((n) => n.elements && Number.isFinite(n.elements.a) && n.elements.e < 1)
    .map((n) => ({
      id: `neo:${n.id}`,
      name: n.name,
      a: n.elements.a,
      e: n.elements.e,
      i: n.elements.i,
      om: n.elements.om,
      w: n.elements.w,
      ma: n.elements.ma,
      n: n.elements.n,
      epoch: n.elements.epoch,
      radiusKm: Math.max(n.radiusKm, 0.05),
      hazardous: n.hazardous,
      meta: n,
    }));
}

// ---------------------------------------------------------------------------
// EPIC
// ---------------------------------------------------------------------------

/**
 * Full-disc Earth imagery from DSCOVR at the Sun–Earth L1 point.
 *
 * Each frame carries the J2000 positions of the spacecraft, the Sun and the
 * Moon, which is enough to place the camera correctly in the 3D scene — the
 * "fly to DSCOVR" view is driven straight from this.
 *
 * @param {object} [opts]
 * @param {string} [opts.date] YYYY-MM-DD. Omit for the most recent set.
 * @param {'natural'|'enhanced'} [opts.collection='natural']
 * @returns {Promise<import('./client.js').FetchResult>}
 */
export async function getEPIC(opts = {}) {
  const base = API_BY_ID.get('epic').base;
  const collection = opts.collection || 'natural';
  const path = opts.date ? `${collection}/date/${opts.date}` : `${collection}/all`;

  const result = await fetchJSON('epic', `${base}/${path}`, {
    ttl: 12 * 3600_000,
    transform: (raw) => raw,
  });

  // `/all` returns the list of available dates, not frames; follow up with the
  // newest one.
  if (!opts.date) {
    const dates = Array.isArray(result.data) ? result.data : [];
    const newest = dates[0]?.date || dates[0];
    if (!newest) return { ...result, data: [] };
    const day = String(newest).slice(0, 10);
    const frames = await fetchJSON('epic', `${base}/${collection}/date/${day}`, {
      ttl: 12 * 3600_000,
    });
    return { ...frames, data: (frames.data || []).map((f) => normaliseEPIC(f, collection)) };
  }
  return { ...result, data: (result.data || []).map((f) => normaliseEPIC(f, collection)) };
}

/** @private */
function normaliseEPIC(f, collection) {
  const [y, m, d] = (f.date || '').slice(0, 10).split('-');
  const archive = 'https://api.nasa.gov/EPIC/archive';
  return {
    identifier: f.identifier,
    caption: f.caption,
    date: f.date,
    lat: f.centroid_coordinates?.lat ?? null,
    lon: f.centroid_coordinates?.lon ?? null,
    // The archive needs the key appended by the caller via fetchJSON's rules;
    // for plain <img> use we append it here.
    thumbUrl: `${archive}/${collection}/${y}/${m}/${d}/jpg/${f.image}.jpg`,
    pngUrl: `${archive}/${collection}/${y}/${m}/${d}/png/${f.image}.png`,
    dscovrJ2000: f.dscovr_j2000_position || null,
    lunarJ2000: f.lunar_j2000_position || null,
    sunJ2000: f.sun_j2000_position || null,
    quaternions: f.attitude_quaternions || null,
  };
}

// ---------------------------------------------------------------------------
// EONET
// ---------------------------------------------------------------------------

/**
 * Natural events currently happening on Earth.
 * @param {object} [opts]
 * @param {number} [opts.days=30]
 * @param {number} [opts.limit=200]
 * @param {string} [opts.category]
 * @returns {Promise<import('./client.js').FetchResult>}
 */
export async function getEvents(opts = {}) {
  const base = API_BY_ID.get('eonet').base;
  const params = new URLSearchParams({
    status: 'open',
    days: String(opts.days ?? 30),
    limit: String(opts.limit ?? 200),
  });
  if (opts.category) params.set('category', opts.category);

  return fetchJSON('eonet', `${base}/events?${params}`, {
    ttl: 3600_000,
    transform: (raw) =>
      (raw.events || []).map((e) => {
        const geo = e.geometry || [];
        const last = geo[geo.length - 1] || {};
        const coords = Array.isArray(last.coordinates) ? last.coordinates : null;
        return {
          id: e.id,
          title: e.title,
          description: e.description || '',
          categories: (e.categories || []).map((c) => ({ id: c.id, title: c.title })),
          sources: (e.sources || []).map((s) => ({ id: s.id, url: s.url })),
          lon: coords && typeof coords[0] === 'number' ? coords[0] : null,
          lat: coords && typeof coords[1] === 'number' ? coords[1] : null,
          date: last.date || null,
          magnitude: last.magnitudeValue ?? null,
          magnitudeUnit: last.magnitudeUnit ?? null,
          track: geo
            .filter((g) => Array.isArray(g.coordinates) && typeof g.coordinates[0] === 'number')
            .map((g) => ({ lon: g.coordinates[0], lat: g.coordinates[1], date: g.date })),
        };
      }),
  });
}

/** Event categories, for the filter UI. @returns {Promise<import('./client.js').FetchResult>} */
export async function getEventCategories() {
  const base = API_BY_ID.get('eonet').base;
  return fetchJSON('eonet', `${base}/categories`, {
    ttl: 7 * 86400_000,
    transform: (raw) => (raw.categories || []).map((c) => ({ id: c.id, title: c.title })),
  });
}

// ---------------------------------------------------------------------------
// DONKI (space weather)
// ---------------------------------------------------------------------------

/** DONKI record types this app understands. */
export const DONKI_TYPES = Object.freeze(['FLR', 'CME', 'GST', 'SEP', 'IPS', 'HSS', 'MPC', 'RBE']);

/**
 * Space-weather events.
 *
 * Points at the CCMC origin rather than the api.nasa.gov mirror: the mirror has
 * been returning 502/503 for an extended period, while the origin it proxies is
 * healthy, needs no key, and sends `Access-Control-Allow-Origin: *`.
 *
 * @param {object} [opts]
 * @param {string} [opts.type='FLR']
 * @param {number} [opts.days=30]
 * @returns {Promise<import('./client.js').FetchResult>}
 */
export async function getSpaceWeather(opts = {}) {
  const base = API_BY_ID.get('donki').base;
  const type = DONKI_TYPES.includes(opts.type) ? opts.type : 'FLR';
  const days = opts.days ?? 30;
  const end = new Date();
  const start = new Date(end.getTime() - days * 86400_000);

  return fetchJSON(
    'donki',
    `${base}/${type}?startDate=${isoDate(start)}&endDate=${isoDate(end)}`,
    {
      ttl: 3600_000,
      transform: (raw) => (Array.isArray(raw) ? raw.map((r) => normaliseDonki(type, r)) : []),
    }
  );
}

/** @private */
function normaliseDonki(type, r) {
  const common = { type, link: r.link || null, raw: r };
  switch (type) {
    case 'FLR':
      return {
        ...common,
        id: r.flrID,
        begin: r.beginTime,
        peak: r.peakTime,
        end: r.endTime,
        class: r.classType,
        region: r.activeRegionNum,
        location: r.sourceLocation,
        severity: flareSeverity(r.classType),
        title: `${r.classType || '?'} flare`,
      };
    case 'CME': {
      const analysis = (r.cmeAnalyses || []).find((a) => a.isMostAccurate) || (r.cmeAnalyses || [])[0];
      return {
        ...common,
        id: r.activityID,
        begin: r.startTime,
        speedKmS: analysis?.speed ?? null,
        halfAngle: analysis?.halfAngle ?? null,
        latitude: analysis?.latitude ?? null,
        longitude: analysis?.longitude ?? null,
        note: r.note || '',
        title: analysis?.speed ? `CME at ${Math.round(analysis.speed)} km/s` : 'Coronal mass ejection',
      };
    }
    case 'GST': {
      const kp = (r.allKpIndex || []).reduce((m, k) => Math.max(m, k.kpIndex ?? 0), 0);
      return {
        ...common,
        id: r.gstID,
        begin: r.startTime,
        kpMax: kp,
        title: `Geomagnetic storm, Kp ${kp}`,
      };
    }
    default:
      return {
        ...common,
        id: r.activityID || r.sepID || r.hssID || r.mpcID || r.rbeID || r.ipsID,
        begin: r.eventTime || r.startTime || r.beginTime,
        title: type,
      };
  }
}

/**
 * Map a GOES flare class (`A`, `B`, `C`, `M`, `X` with a multiplier) onto a
 * 0..1 severity, for colour and sonification.
 * @param {string} cls
 * @returns {number}
 */
export function flareSeverity(cls) {
  if (!cls) return 0;
  const letter = cls[0].toUpperCase();
  const mult = parseFloat(cls.slice(1)) || 1;
  const decade = { A: 0, B: 1, C: 2, M: 3, X: 4 }[letter];
  if (decade == null) return 0;
  // Peak flux spans A1 (1e-8 W/m^2) to about X20 (2e-3). Compress
  // logarithmically so the scale is perceptually even.
  const flux = Math.pow(10, decade) * mult;
  return Math.min(1, Math.log10(flux + 1) / Math.log10(20001));
}

// ---------------------------------------------------------------------------
// NASA Image and Video Library
// ---------------------------------------------------------------------------

/**
 * Search the media library.
 * @param {string} query
 * @param {object} [opts]
 * @param {'image'|'video'|'audio'} [opts.mediaType='image']
 * @param {number} [opts.pageSize=24]
 * @param {number} [opts.page=1]
 * @returns {Promise<import('./client.js').FetchResult>}
 */
export async function searchMedia(query, opts = {}) {
  const base = API_BY_ID.get('images').base;
  const params = new URLSearchParams({
    q: query,
    media_type: opts.mediaType || 'image',
    page_size: String(opts.pageSize ?? 24),
    page: String(opts.page ?? 1),
  });
  return fetchJSON('images', `${base}/search?${params}`, {
    ttl: 24 * 3600_000,
    transform: (raw) =>
      (raw.collection?.items || []).map((item) => {
        const d = (item.data || [])[0] || {};
        const links = item.links || [];
        return {
          nasaId: d.nasa_id,
          title: d.title,
          description: d.description || d.description_508 || '',
          center: d.center,
          dateCreated: d.date_created,
          keywords: d.keywords || [],
          thumb: links.find((l) => l.rel === 'preview')?.href || null,
          collection: item.href,
          mediaType: d.media_type,
        };
      }),
  });
}

// ---------------------------------------------------------------------------
// POWER (surface meteorology and solar)
// ---------------------------------------------------------------------------

/**
 * Long-term monthly climatology for a point on Earth.
 * @param {number} lat
 * @param {number} lon
 * @param {string[]} [parameters]
 * @returns {Promise<import('./client.js').FetchResult>}
 */
export async function getClimatology(lat, lon, parameters = ['T2M', 'ALLSKY_SFC_SW_DWN']) {
  const base = API_BY_ID.get('power').base;
  const params = new URLSearchParams({
    parameters: parameters.join(','),
    community: 'RE',
    latitude: String(lat),
    longitude: String(lon),
    format: 'JSON',
  });
  return fetchJSON('power', `${base}/temporal/climatology/point?${params}`, {
    ttl: 30 * 86400_000,
    transform: (raw) => raw.properties?.parameter || {},
  });
}

// ---------------------------------------------------------------------------
// Satellite Situation Center + TLE
// ---------------------------------------------------------------------------

/**
 * Geocentric position track for a spacecraft.
 *
 * The service defaults to XML; JSON is available but only if the request asks
 * for it, which `fetchJSON` does via its `accept` header.
 *
 * @param {string} satellite e.g. `iss`
 * @param {Date} [start]
 * @param {number} [hours=2]
 * @returns {Promise<import('./client.js').FetchResult>}
 */
export async function getSatelliteTrack(satellite = 'iss', start = new Date(), hours = 2) {
  const base = API_BY_ID.get('ssc').base;
  const fmt = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const end = new Date(start.getTime() + hours * 3600_000);
  const url = `${base}/locations/${satellite}/${fmt(start)},${fmt(end)}/gse/`;
  return fetchJSON('ssc', url, { ttl: 1800_000 });
}

/**
 * Current two-line elements for a satellite.
 * @param {number|string} [noradId=25544] Defaults to the ISS.
 * @returns {Promise<import('./client.js').FetchResult>}
 */
export async function getTLE(noradId = 25544) {
  const base = API_BY_ID.get('tle').base;
  // The trailing slash is mandatory: without it the host answers 508.
  return fetchJSON('tle', `${base}/tle/${noradId}`, { ttl: 6 * 3600_000 });
}

// ---------------------------------------------------------------------------
// Snapshot-only services
// ---------------------------------------------------------------------------

/**
 * Close approaches, impact risk and fireballs from JPL, plus exoplanets,
 * TechPort and OSDR — all of which block browser access and are therefore read
 * from the snapshot committed by CI.
 * @param {string} apiId
 * @returns {Promise<{data:any, at:number}|null>}
 */
export async function getSnapshot(apiId) {
  return loadSnapshot(apiId);
}

/**
 * Convert a JPL close-approach (CAD) row into something displayable.
 * The CAD API returns a `fields` array plus rows of positional values.
 * @param {{fields:string[], data:string[][]}} cad
 * @returns {Array<object>}
 */
export function parseCloseApproaches(cad) {
  if (!cad?.fields || !cad?.data) return [];
  const idx = Object.fromEntries(cad.fields.map((f, i) => [f, i]));
  return cad.data.map((row) => ({
    designation: row[idx.des],
    date: row[idx.cd],
    jd: parseFloat(row[idx.jd]),
    distanceAu: parseFloat(row[idx.dist]),
    distanceKm: parseFloat(row[idx.dist]) * AU_KM,
    distanceLunar: (parseFloat(row[idx.dist]) * AU_KM) / 384400,
    velocityKmS: parseFloat(row[idx.v_rel]),
    magnitude: parseFloat(row[idx.h]),
  }));
}

/**
 * Estimate a body's diameter from its absolute magnitude and assumed albedo.
 * The standard relation (Bowell et al. 1989):
 *   D [km] = 1329 / sqrt(p) * 10^(-0.2 H)
 * @param {number} H Absolute magnitude.
 * @param {number} [albedo=0.14] Typical for near-Earth asteroids.
 * @returns {number} Diameter in km.
 */
export function diameterFromMagnitude(H, albedo = 0.14) {
  return (1329 / Math.sqrt(albedo)) * Math.pow(10, -0.2 * H);
}

/**
 * Julian Date of a NEO close approach, from its epoch milliseconds.
 * @param {number} epochMs
 * @returns {number}
 */
export function approachJD(epochMs) {
  return Number.isFinite(epochMs) ? dateToJD(new Date(epochMs)) : JD_J2000;
}
