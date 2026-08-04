/**
 * Data health tracking.
 *
 * A visualisation built on a dozen third-party services will, on any given day,
 * be showing a mixture of live data, cached data, and data baked in weeks ago.
 * Hiding that would be dishonest — a chart of "current" solar flares that is
 * actually a fortnight old is worse than no chart. This module records what
 * happened to every request so the Data Health panel can show, per API, whether
 * the number on screen came from the network just now or from a snapshot, and
 * how old it is.
 *
 * @module data/health
 */

import { APIS, API_BY_ID } from './registry.js';
import { onNetworkEvent, rateLimit, isDemoKey, currentLimits, cacheStats } from './client.js';

/**
 * @typedef {object} ApiHealth
 * @property {string} id
 * @property {'unknown'|'live'|'cache'|'stale'|'snapshot'|'error'|'blocked'|'retired'} state
 * @property {number} lastAt Timestamp of the data being shown.
 * @property {number} lastCheck Timestamp of the most recent attempt.
 * @property {string|null} error
 * @property {number} requests
 * @property {number} failures
 */

/** @type {Map<string, ApiHealth>} */
const health = new Map();

for (const api of APIS) {
  health.set(api.id, {
    id: api.id,
    state: api.access === 'retired' ? 'retired' : api.access === 'snapshot' ? 'blocked' : 'unknown',
    lastAt: 0,
    lastCheck: 0,
    error: null,
    requests: 0,
    failures: 0,
  });
}

/** @type {Set<(all:ApiHealth[])=>void>} */
const subscribers = new Set();

onNetworkEvent((event) => {
  if (!event.apiId) {
    if (event.type === 'rate-limit' || event.type === 'key-changed') publish();
    return;
  }
  const h = health.get(event.apiId);
  if (!h) return;
  h.lastCheck = Date.now();
  switch (event.type) {
    case 'ok':
      h.state = 'live';
      h.lastAt = Date.now();
      h.error = null;
      h.requests++;
      break;
    case 'hit':
      if (h.state === 'unknown') h.state = 'cache';
      h.requests++;
      break;
    case 'degraded':
      h.state = event.source;
      h.error = event.error || null;
      h.requests++;
      h.failures++;
      break;
    case 'error':
      h.state = 'error';
      h.error = event.error || null;
      h.requests++;
      h.failures++;
      break;
    default:
      break;
  }
  publish();
});

/** @private */
function publish() {
  const all = getHealth();
  for (const fn of subscribers) {
    try {
      fn(all);
    } catch {
      /* a broken subscriber must not break reporting */
    }
  }
}

/**
 * Subscribe to health changes.
 * @param {(all:ApiHealth[])=>void} fn
 * @returns {()=>void} Unsubscribe.
 */
export function onHealthChange(fn) {
  subscribers.add(fn);
  fn(getHealth());
  return () => subscribers.delete(fn);
}

/** @returns {ApiHealth[]} A snapshot of every API's state. */
export function getHealth() {
  return APIS.map((api) => ({ ...health.get(api.id), entry: api }));
}

/**
 * Mark a snapshot-backed API as loaded, with the age of its data.
 * @param {string} apiId
 * @param {number} at Timestamp the snapshot was fetched by CI.
 */
export function recordSnapshot(apiId, at) {
  const h = health.get(apiId);
  if (!h) return;
  h.state = 'snapshot';
  h.lastAt = at;
  h.lastCheck = Date.now();
  publish();
}

/**
 * An overall verdict, for the status chip in the header.
 * @returns {{level:'ok'|'degraded'|'offline', live:number, degraded:number,
 *   failed:number, total:number}}
 */
export function summarise() {
  let live = 0;
  let degraded = 0;
  let failed = 0;
  let total = 0;
  for (const api of APIS) {
    if (api.access === 'retired') continue;
    total++;
    const h = health.get(api.id);
    if (h.state === 'live' || h.state === 'cache') live++;
    else if (h.state === 'stale' || h.state === 'snapshot' || h.state === 'blocked') degraded++;
    else if (h.state === 'error') failed++;
  }
  const level = failed > 0 && live === 0 ? 'offline' : failed > 0 || degraded > live ? 'degraded' : 'ok';
  return { level, live, degraded, failed, total };
}

/**
 * Everything the Data Health panel needs, in one call.
 * @returns {object}
 */
export function report() {
  const limits = currentLimits();
  return {
    apis: getHealth(),
    summary: summarise(),
    key: {
      demo: isDemoKey(),
      label: limits.label,
      perHour: limits.perHour,
      perDay: limits.perDay,
      limit: rateLimit.limit,
      remaining: rateLimit.remaining,
      observedAt: rateLimit.at,
    },
    cache: cacheStats(),
    generatedAt: Date.now(),
  };
}

/**
 * A short human-readable age.
 * @param {number} timestamp
 * @param {(key:string, params?:object)=>string} t Translator.
 * @returns {string}
 */
export function formatAge(timestamp, t) {
  if (!timestamp) return t('health.never');
  const secs = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (secs < 60) return t('health.ageSeconds', { n: secs });
  const mins = Math.round(secs / 60);
  if (mins < 60) return t('health.ageMinutes', { n: mins });
  const hours = Math.round(mins / 60);
  if (hours < 48) return t('health.ageHours', { n: hours });
  return t('health.ageDays', { n: Math.round(hours / 24) });
}

/** @param {string} id @returns {import('./registry.js').ApiEntry|undefined} */
export function describe(id) {
  return API_BY_ID.get(id);
}
