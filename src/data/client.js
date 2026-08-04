/**
 * The network layer: one fetch path for every NASA service, with the failure
 * modes those services actually exhibit designed in rather than bolted on.
 *
 * WHY THIS IS MORE THAN `fetch()`
 *
 *  1. **DEMO_KEY is 30 requests per hour and 50 per day, per IP.** A public page
 *     on a shared IP burns that in seconds. Every response is therefore cached
 *     persistently, requests are de-duplicated in flight, and the remaining
 *     quota is read from the `X-RateLimit-Remaining` header (api.nasa.gov
 *     helpfully exposes it via `Access-Control-Expose-Headers`) and surfaced in
 *     the UI before the user hits a wall.
 *
 *  2. **These services go down.** During development the api.nasa.gov DONKI
 *     mirror answered 502/503 for hours, and two APIs were found to be retired
 *     outright. Each request therefore degrades in a fixed order — live, then
 *     cache (even stale), then the snapshot committed by CI — and records what
 *     happened so the Data Health panel can tell the truth.
 *
 *  3. **A static site has no secrets.** The user's own API key lives in
 *     localStorage, is never transmitted anywhere except api.nasa.gov, and is
 *     redacted from every log and error message.
 *
 * @module data/client
 */

import { API_BY_ID, RATE_LIMITS } from './registry.js';

/** localStorage key holding the user's personal api.nasa.gov key. */
const KEY_STORAGE = 'orrery.nasaApiKey';
/** localStorage prefix for cached responses. */
const CACHE_PREFIX = 'orrery.cache.';
/** Total cache budget in localStorage, bytes. Keeps us well clear of the 5 MB quota. */
const CACHE_BUDGET = 2_500_000;

/** @type {Map<string, Promise<any>>} In-flight requests, keyed by URL. */
const inflight = new Map();

/** @type {Map<string, {at:number, ttl:number, data:any}>} Memory cache. */
const memory = new Map();

/**
 * Observed rate-limit state, updated from response headers.
 * @type {{limit:number|null, remaining:number|null, at:number}}
 */
export const rateLimit = { limit: null, remaining: null, at: 0 };

/** Subscribers notified whenever a request completes. */
const listeners = new Set();

/**
 * @typedef {object} FetchResult
 * @property {any} data Parsed payload.
 * @property {'live'|'cache'|'stale'|'snapshot'} source Where it came from.
 * @property {number} at Timestamp of the underlying data.
 * @property {string} [error] Message explaining a fallback, if one happened.
 */

/**
 * Read the stored API key.
 * @returns {string} The user's key, or `DEMO_KEY`.
 */
export function getApiKey() {
  try {
    return localStorage.getItem(KEY_STORAGE) || 'DEMO_KEY';
  } catch {
    return 'DEMO_KEY';
  }
}

/**
 * Store (or clear) the user's API key.
 * @param {string} key Pass an empty string to revert to DEMO_KEY.
 */
export function setApiKey(key) {
  try {
    const trimmed = (key || '').trim();
    if (trimmed) localStorage.setItem(KEY_STORAGE, trimmed);
    else localStorage.removeItem(KEY_STORAGE);
  } catch {
    /* storage disabled; the key simply will not persist */
  }
  rateLimit.limit = null;
  rateLimit.remaining = null;
  notify({ type: 'key-changed' });
}

/** @returns {boolean} true when running on the shared demo key. */
export function isDemoKey() {
  return getApiKey() === 'DEMO_KEY';
}

/** @returns {{perHour:number, perDay:number|null, label:string}} */
export function currentLimits() {
  return isDemoKey() ? RATE_LIMITS.demo : RATE_LIMITS.personal;
}

/**
 * Subscribe to network events (used by the Data Health panel).
 * @param {(event:object)=>void} fn
 * @returns {()=>void} Unsubscribe.
 */
export function onNetworkEvent(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** @private */
function notify(event) {
  for (const fn of listeners) {
    try {
      fn(event);
    } catch {
      /* a broken listener must not break the network layer */
    }
  }
}

/**
 * Remove the API key from any string before it reaches a log or the UI.
 * @param {string} text
 * @returns {string}
 */
export function redact(text) {
  const key = getApiKey();
  let out = String(text);
  if (key && key !== 'DEMO_KEY') out = out.split(key).join('<your-api-key>');
  return out.replace(/api_key=[^&\s]+/g, 'api_key=<redacted>');
}

/** @private */
function cacheGet(url) {
  const mem = memory.get(url);
  if (mem) return mem;
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + hash(url));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    memory.set(url, parsed);
    return parsed;
  } catch {
    return null;
  }
}

/** @private */
function cacheSet(url, data, ttl) {
  const record = { at: Date.now(), ttl, data };
  memory.set(url, record);
  try {
    const serialised = JSON.stringify(record);
    // Never let one oversized response evict everything else.
    if (serialised.length > CACHE_BUDGET / 4) return;
    localStorage.setItem(CACHE_PREFIX + hash(url), serialised);
    pruneCache();
  } catch {
    // Quota exceeded, or storage disabled. Memory cache still applies.
    pruneCache(true);
  }
}

/** @private Evict the oldest entries until we are inside the budget. */
function pruneCache(aggressive = false) {
  try {
    /** @type {{k:string, at:number, size:number}[]} */
    const entries = [];
    let total = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(CACHE_PREFIX)) continue;
      const v = localStorage.getItem(k) || '';
      let at = 0;
      try {
        at = JSON.parse(v).at || 0;
      } catch {
        /* corrupt entry: treat as ancient so it is evicted first */
      }
      entries.push({ k, at, size: v.length });
      total += v.length;
    }
    const target = aggressive ? CACHE_BUDGET / 2 : CACHE_BUDGET;
    if (total <= target) return;
    entries.sort((a, b) => a.at - b.at);
    for (const e of entries) {
      localStorage.removeItem(e.k);
      total -= e.size;
      if (total <= target) break;
    }
  } catch {
    /* nothing we can do */
  }
}

/** @private A short, stable, collision-resistant-enough key for a URL. */
function hash(str) {
  let h1 = 0x9e3779b9;
  let h2 = 0x85ebca6b;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  return (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36);
}

/** Delete every cached response. */
export function clearCache() {
  memory.clear();
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(CACHE_PREFIX)) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
  notify({ type: 'cache-cleared' });
}

/** @returns {{entries:number, bytes:number}} */
export function cacheStats() {
  let entries = 0;
  let bytes = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(CACHE_PREFIX)) continue;
      entries++;
      bytes += (localStorage.getItem(k) || '').length;
    }
  } catch {
    /* ignore */
  }
  return { entries, bytes };
}

/**
 * Fetch JSON from a NASA service, with caching, de-duplication, retry and
 * snapshot fallback.
 *
 * @param {string} apiId Registry id, used for health reporting and fallback.
 * @param {string} url Absolute URL. `api_key` is appended when required.
 * @param {object} [opts]
 * @param {number} [opts.ttl=3600000] Cache lifetime in milliseconds.
 * @param {number} [opts.timeout=15000] Per-attempt timeout.
 * @param {number} [opts.retries=1] Retries on a network error or 5xx.
 * @param {(raw:any)=>any} [opts.transform] Applied to the parsed payload
 *   before caching.
 * @param {AbortSignal} [opts.signal]
 * @returns {Promise<FetchResult>}
 */
export async function fetchJSON(apiId, url, opts = {}) {
  const entry = API_BY_ID.get(apiId);
  const ttl = opts.ttl ?? 3_600_000;
  const timeout = opts.timeout ?? 15_000;
  const retries = opts.retries ?? 1;

  let target = url;
  if (entry?.needsKey && !/[?&]api_key=/.test(target)) {
    target += (target.includes('?') ? '&' : '?') + 'api_key=' + encodeURIComponent(getApiKey());
  }

  const cached = cacheGet(target);
  if (cached && Date.now() - cached.at < ttl) {
    notify({ type: 'hit', apiId, source: 'cache' });
    return { data: cached.data, source: 'cache', at: cached.at };
  }

  if (inflight.has(target)) return inflight.get(target);

  const task = (async () => {
    let lastError = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);
      // Honour an externally supplied signal as well as our own timeout.
      const onAbort = () => controller.abort();
      opts.signal?.addEventListener('abort', onAbort, { once: true });
      try {
        const res = await fetch(target, {
          signal: controller.signal,
          headers: { accept: 'application/json' },
          // NASA endpoints are public; sending credentials would break the
          // wildcard CORS header on several of them.
          credentials: 'omit',
          mode: 'cors',
        });
        readRateLimit(res);

        if (res.status === 429) {
          throw new RateLimitError('Rate limit reached for this API key.');
        }
        if (!res.ok) {
          throw new HttpError(res.status, `${res.status} ${res.statusText}`);
        }

        // EONET sometimes labels JSON as application/rss+xml. Parse the text
        // ourselves rather than trusting the declared content type.
        const text = await res.text();
        let data;
        try {
          data = JSON.parse(text);
        } catch {
          throw new Error('Response was not valid JSON');
        }
        if (opts.transform) data = opts.transform(data);

        cacheSet(target, data, ttl);
        notify({ type: 'ok', apiId, source: 'live' });
        return { data, source: 'live', at: Date.now() };
      } catch (err) {
        lastError = err;
        // A rate limit or a 4xx will not improve on retry.
        if (err instanceof RateLimitError) break;
        if (err instanceof HttpError && err.status < 500) break;
        if (attempt < retries) {
          await delay(400 * Math.pow(2, attempt));
        }
      } finally {
        clearTimeout(timer);
        opts.signal?.removeEventListener('abort', onAbort);
      }
    }

    // ---- degrade -----------------------------------------------------------
    const message = redact(lastError?.message || 'Request failed');

    if (cached) {
      notify({ type: 'degraded', apiId, source: 'stale', error: message });
      return { data: cached.data, source: 'stale', at: cached.at, error: message };
    }

    const snap = await loadSnapshot(apiId);
    if (snap) {
      notify({ type: 'degraded', apiId, source: 'snapshot', error: message });
      return { data: snap.data, source: 'snapshot', at: snap.at, error: message };
    }

    notify({ type: 'error', apiId, error: message });
    throw lastError instanceof Error ? lastError : new Error(message);
  })().finally(() => inflight.delete(target));

  inflight.set(target, task);
  return task;
}

/**
 * Load a snapshot committed by `tools/fetch-snapshots.mjs`.
 *
 * Snapshots serve two purposes: they are the only way to show data from the
 * CORS-blocked services at all, and they are what the app falls back to when a
 * live service is down or the key's quota is exhausted. That means a first-time
 * visitor sees a fully populated interface before a single network request
 * completes.
 *
 * @param {string} apiId
 * @returns {Promise<{data:any, at:number}|null>}
 */
export async function loadSnapshot(apiId) {
  const entry = API_BY_ID.get(apiId);
  // Only the services the registry says have one. Guessing at a conventional
  // filename instead meant that every *live* service which failed — the common
  // case, since DEMO_KEY runs out after thirty requests an hour — immediately
  // fired a second request for a file that has never existed, turning one
  // failure into two and filling the console with 404s that look like a broken
  // deployment.
  if (!entry?.snapshot) return null;
  const url = new URL(`./snapshots/${entry.snapshot}`, import.meta.url);
  const memKey = `snapshot:${apiId}`;
  const cachedSnap = memory.get(memKey);
  if (cachedSnap) return cachedSnap;
  try {
    const res = await fetch(url, { cache: 'default' });
    if (!res.ok) return null;
    const body = await res.json();
    const record = {
      data: body.data !== undefined ? body.data : body,
      at: Date.parse(body.fetchedAt || '') || 0,
    };
    memory.set(memKey, record);
    return record;
  } catch {
    return null;
  }
}

/** @private */
function readRateLimit(res) {
  const limit = res.headers.get('X-RateLimit-Limit');
  const remaining = res.headers.get('X-RateLimit-Remaining');
  if (limit != null) rateLimit.limit = parseInt(limit, 10);
  if (remaining != null) rateLimit.remaining = parseInt(remaining, 10);
  if (limit != null || remaining != null) {
    rateLimit.at = Date.now();
    notify({ type: 'rate-limit', ...rateLimit });
  }
}

/** @private */
function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Thrown when a service answers 429. */
export class RateLimitError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RateLimitError';
  }
}

/** Thrown for any non-2xx response. */
export class HttpError extends Error {
  /**
   * @param {number} status
   * @param {string} message
   */
  constructor(status, message) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

/**
 * Load an image with CORS enabled, resolving to an ImageBitmap.
 *
 * Used for the GIBS and Trek tile mosaics. `createImageBitmap` is preferred
 * over an `<img>` element because it decodes off the main thread, which matters
 * when stitching 32 tiles into a 4096-wide texture while the renderer is
 * running.
 *
 * @param {string} url
 * @param {object} [opts]
 * @param {number} [opts.timeout=20000]
 * @returns {Promise<ImageBitmap>}
 */
export async function fetchImageBitmap(url, opts = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeout ?? 20_000);
  try {
    const res = await fetch(url, { signal: controller.signal, mode: 'cors', credentials: 'omit' });
    if (!res.ok) throw new HttpError(res.status, `${res.status} for tile`);
    const blob = await res.blob();
    return await createImageBitmap(blob);
  } finally {
    clearTimeout(timer);
  }
}
