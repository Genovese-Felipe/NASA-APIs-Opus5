/**
 * Data-layer tests.
 *
 * The network is stubbed. What is being tested is the behaviour around the
 * network — caching, de-duplication, retry, degradation to a snapshot, key
 * redaction — because that is where a static app that depends on a dozen
 * third-party services actually lives or dies.
 *
 * Run: node --test "tests/unit/**\/*.test.js"
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

// ---------------------------------------------------------------------------
// A minimal browser environment, installed before importing the client.
// ---------------------------------------------------------------------------
class MemoryStorage {
  constructor() { this.map = new Map(); }
  get length() { return this.map.size; }
  key(i) { return [...this.map.keys()][i] ?? null; }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { this.map.set(k, String(v)); }
  removeItem(k) { this.map.delete(k); }
  clear() { this.map.clear(); }
}

globalThis.localStorage = new MemoryStorage();

const realFetch = globalThis.fetch;
/** @type {Array<{url:string}>} */
let requests = [];
/** @type {Map<string, ()=>Promise<Response>>} */
let handlers = new Map();

globalThis.fetch = async (input, init) => {
  const url = String(input instanceof URL ? input.href : input?.url || input);
  requests.push({ url, init });
  for (const [pattern, handler] of handlers) {
    if (url.includes(pattern)) return handler(url, init);
  }
  // Snapshot files are read from disk so the fallback path can be tested for
  // real rather than against another stub.
  if (url.includes('/snapshots/')) {
    const name = url.split('/snapshots/')[1];
    try {
      const body = await readFile(resolve(ROOT, 'src/data/snapshots', name), 'utf8');
      return new Response(body, { status: 200, headers: { 'content-type': 'application/json' } });
    } catch {
      return new Response('not found', { status: 404 });
    }
  }
  return new Response('unhandled', { status: 500 });
};

const client = await import('../../src/data/client.js');
const registry = await import('../../src/data/registry.js');
const nasa = await import('../../src/data/nasa.js');
const imagery = await import('../../src/data/imagery.js');

beforeEach(() => {
  requests = [];
  handlers = new Map();
  client.clearCache();
  client.setApiKey('');
});

afterEach(() => {
  handlers = new Map();
});

/** @param {string} pattern @param {object} body @param {number} [status] */
function stub(pattern, body, status = 200, headers = {}) {
  handlers.set(pattern, async () =>
    new Response(typeof body === 'string' ? body : JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json', ...headers },
    })
  );
}

describe('registry', () => {
  test('every entry is well formed', () => {
    for (const api of registry.APIS) {
      assert.ok(api.id && typeof api.id === 'string', 'id');
      assert.ok(['browser', 'snapshot', 'retired'].includes(api.access), `${api.id} access`);
      assert.ok(api.base.startsWith('https://'), `${api.id} must use https`);
      assert.ok(api.docs.startsWith('https://'), `${api.id} docs`);
      assert.ok(api.blurb.length > 20, `${api.id} blurb`);
      if (api.access === 'snapshot') assert.ok(api.snapshot, `${api.id} needs a snapshot filename`);
      if (api.access === 'retired') assert.ok(api.notes, `${api.id} must explain why it is retired`);
    }
  });

  test('ids are unique', () => {
    const ids = registry.APIS.map((a) => a.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  test('retired entries point at a live replacement', () => {
    for (const api of registry.RETIRED_APIS) {
      if (!api.replacedBy) continue;
      const target = registry.API_BY_ID.get(api.replacedBy);
      assert.ok(target, `${api.id} replacement missing`);
      assert.notEqual(target.access, 'retired', `${api.id} replaced by another retired API`);
    }
  });

  test('every snapshot-backed API has a committed snapshot file', async () => {
    const files = new Set(await readdir(resolve(ROOT, 'src/data/snapshots')));
    for (const api of registry.SNAPSHOT_APIS) {
      assert.ok(files.has(api.snapshot), `missing snapshot: ${api.snapshot}`);
    }
  });

  test('documented rate limits match NASA published figures', () => {
    assert.equal(registry.RATE_LIMITS.demo.perHour, 30);
    assert.equal(registry.RATE_LIMITS.demo.perDay, 50);
    assert.equal(registry.RATE_LIMITS.personal.perHour, 1000);
  });
});

describe('api key handling', () => {
  test('defaults to DEMO_KEY', () => {
    assert.equal(client.getApiKey(), 'DEMO_KEY');
    assert.equal(client.isDemoKey(), true);
    assert.equal(client.currentLimits().perHour, 30);
  });

  test('stores and clears a personal key', () => {
    client.setApiKey('abc123');
    assert.equal(client.getApiKey(), 'abc123');
    assert.equal(client.isDemoKey(), false);
    assert.equal(client.currentLimits().perHour, 1000);
    client.setApiKey('');
    assert.equal(client.getApiKey(), 'DEMO_KEY');
  });

  test('redacts the key from any text', () => {
    client.setApiKey('SECRET_KEY_VALUE');
    const message = 'failed: https://api.nasa.gov/x?api_key=SECRET_KEY_VALUE&y=1';
    const safe = client.redact(message);
    assert.ok(!safe.includes('SECRET_KEY_VALUE'), safe);
    assert.ok(safe.includes('<redacted>') || safe.includes('<your-api-key>'), safe);
  });

  test('redacts an api_key parameter even when it is not ours', () => {
    const safe = client.redact('?api_key=somebodyelseskey&z=2');
    assert.ok(!safe.includes('somebodyelseskey'), safe);
  });

  test('appends the key only to APIs that need one', async () => {
    stub('api.nasa.gov', { ok: true });
    await client.fetchJSON('apod', 'https://api.nasa.gov/planetary/apod');
    assert.ok(requests[0].url.includes('api_key=DEMO_KEY'), requests[0].url);

    requests = [];
    stub('eonet', { events: [] });
    await client.fetchJSON('eonet', 'https://eonet.gsfc.nasa.gov/api/v3/events');
    assert.ok(!requests[0].url.includes('api_key'), requests[0].url);
  });
});

describe('fetchJSON', () => {
  test('returns live data and caches it', async () => {
    stub('example.test', { value: 42 });
    const first = await client.fetchJSON('eonet', 'https://example.test/a');
    assert.equal(first.source, 'live');
    assert.equal(first.data.value, 42);
    assert.equal(requests.length, 1);

    const second = await client.fetchJSON('eonet', 'https://example.test/a');
    assert.equal(second.source, 'cache');
    assert.equal(requests.length, 1, 'must not hit the network again');
  });

  test('de-duplicates concurrent requests for the same URL', async () => {
    let resolveIt;
    handlers.set('slow.test', () => new Promise((r) => {
      resolveIt = () => r(new Response('{"n":1}', { status: 200 }));
    }));
    const a = client.fetchJSON('eonet', 'https://slow.test/x');
    const b = client.fetchJSON('eonet', 'https://slow.test/x');
    resolveIt();
    const [ra, rb] = await Promise.all([a, b]);
    assert.equal(ra.data.n, 1);
    assert.equal(rb.data.n, 1);
    assert.equal(requests.length, 1, 'one network call for two callers');
  });

  test('applies the transform before caching', async () => {
    stub('t.test', { items: [1, 2, 3] });
    const r = await client.fetchJSON('eonet', 'https://t.test/x', {
      transform: (raw) => raw.items.length,
    });
    assert.equal(r.data, 3);
    const cached = await client.fetchJSON('eonet', 'https://t.test/x', {
      transform: () => { throw new Error('transform must not run on a cache hit'); },
    });
    assert.equal(cached.data, 3);
  });

  test('parses JSON regardless of the declared content type', async () => {
    // EONET sometimes answers application/rss+xml with a JSON body.
    handlers.set('rss.test', async () => new Response('{"events":[]}', {
      status: 200, headers: { 'content-type': 'application/rss+xml' },
    }));
    const r = await client.fetchJSON('eonet', 'https://rss.test/events');
    assert.deepEqual(r.data, { events: [] });
  });

  test('retries a 5xx and succeeds', async () => {
    let calls = 0;
    handlers.set('flaky.test', async () => {
      calls++;
      return calls === 1
        ? new Response('upstream error', { status: 503 })
        : new Response('{"ok":true}', { status: 200 });
    });
    const r = await client.fetchJSON('eonet', 'https://flaky.test/x', { retries: 2 });
    assert.equal(r.source, 'live');
    assert.equal(calls, 2);
  });

  test('does not retry a 4xx', async () => {
    let calls = 0;
    handlers.set('gone.test', async () => {
      calls++;
      return new Response('nope', { status: 404 });
    });
    await assert.rejects(client.fetchJSON('eonet', 'https://gone.test/x', { retries: 3 }));
    assert.equal(calls, 1, 'a 404 will not improve on retry');
  });

  test('falls back to a stale cache when the service fails', async () => {
    stub('stale.test', { generation: 1 });
    const fresh = await client.fetchJSON('eonet', 'https://stale.test/x', { ttl: 0 });
    assert.equal(fresh.source, 'live');

    handlers.set('stale.test', async () => new Response('down', { status: 503 }));
    const degraded = await client.fetchJSON('eonet', 'https://stale.test/x', { ttl: 0, retries: 0 });
    assert.equal(degraded.source, 'stale');
    assert.equal(degraded.data.generation, 1);
    assert.ok(degraded.error, 'must explain why it degraded');
  });

  test('falls back to the committed snapshot when there is no cache', async () => {
    handlers.set('ssd-api', async () => new Response('blocked', { status: 503 }));
    const r = await client.fetchJSON('sbdb', 'https://ssd-api.jpl.nasa.gov/cad.api', { retries: 0 });
    assert.equal(r.source, 'snapshot');
    assert.ok(r.data.sentry, 'snapshot payload should be unwrapped from its envelope');
    assert.ok(r.at > 0, 'snapshot should carry its fetch time');
  });

  test('surfaces a rate limit rather than retrying into it', async () => {
    let calls = 0;
    handlers.set('limited.test', async () => {
      calls++;
      return new Response('slow down', { status: 429 });
    });
    await assert.rejects(client.fetchJSON('eonet', 'https://limited.test/x', { retries: 3 }));
    assert.equal(calls, 1);
  });

  test('reads the rate-limit headers NASA exposes', async () => {
    handlers.set('hdr.test', async () => new Response('{"ok":1}', {
      status: 200,
      headers: { 'X-RateLimit-Limit': '1000', 'X-RateLimit-Remaining': '987' },
    }));
    await client.fetchJSON('apod', 'https://hdr.test/x');
    assert.equal(client.rateLimit.limit, 1000);
    assert.equal(client.rateLimit.remaining, 987);
  });

  test('reports cache statistics and clears them', async () => {
    stub('count.test', { a: 1 });
    await client.fetchJSON('eonet', 'https://count.test/1');
    assert.ok(client.cacheStats().entries >= 1);
    client.clearCache();
    assert.equal(client.cacheStats().entries, 0);
  });

  test('survives storage being unavailable', async () => {
    const saved = globalThis.localStorage;
    globalThis.localStorage = {
      get length() { return 0; },
      key() { return null; },
      getItem() { throw new Error('denied'); },
      setItem() { throw new Error('denied'); },
      removeItem() { throw new Error('denied'); },
    };
    try {
      stub('nostore.test', { ok: 1 });
      const r = await client.fetchJSON('eonet', 'https://nostore.test/x');
      assert.equal(r.data.ok, 1);
      assert.equal(client.getApiKey(), 'DEMO_KEY');
    } finally {
      globalThis.localStorage = saved;
    }
  });
});

describe('adapters', () => {
  test('APOD normalises a single entry and a list identically', async () => {
    stub('planetary/apod', {
      date: '2026-08-04', title: 'A nebula', explanation: 'Words.',
      url: 'https://apod/x.jpg', hdurl: 'https://apod/x_hd.jpg', media_type: 'image',
      copyright: '  Someone  ',
    });
    const r = await client.fetchJSON('apod', 'https://api.nasa.gov/planetary/apod', {
      transform: (raw) => (Array.isArray(raw) ? raw : [raw]),
    });
    assert.ok(Array.isArray(r.data));
  });

  test('NEO normalisation extracts what the UI needs', async () => {
    stub('neo/rest', {
      near_earth_objects: {
        '2026-08-04': [{
          neo_reference_id: '1234', name: '(2026 AB)', absolute_magnitude_h: 22.1,
          is_potentially_hazardous_asteroid: true,
          estimated_diameter: { kilometers: { estimated_diameter_min: 0.1, estimated_diameter_max: 0.3 } },
          close_approach_data: [{
            close_approach_date: '2026-08-04',
            miss_distance: { kilometers: '4500000', lunar: '11.7' },
            relative_velocity: { kilometers_per_second: '12.5' },
            orbiting_body: 'Earth',
          }],
        }],
      },
    });
    const { data } = await nasa.getNEOFeed({ days: 1 });
    assert.equal(data.length, 1);
    const neo = data[0];
    assert.equal(neo.id, '1234');
    assert.equal(neo.name, '2026 AB', 'surrounding parentheses should be stripped');
    assert.equal(neo.hazardous, true);
    assert.equal(neo.missDistanceKm, 4500000);
    assert.ok(Math.abs(neo.radiusKm - 0.1) < 1e-9);
  });

  test('NEO feed clamps the range to the seven days the API allows', async () => {
    stub('neo/rest', { near_earth_objects: {} });
    await nasa.getNEOFeed({ start: new Date('2026-01-01T00:00:00Z'), days: 30 });
    const url = requests[0].url;
    assert.ok(url.includes('start_date=2026-01-01'), url);
    assert.ok(url.includes('end_date=2026-01-07'), url);
  });

  test('converts NEOs to drawable small bodies, skipping hyperbolic ones', () => {
    const bodies = nasa.neosToSmallBodies([
      { id: 'a', name: 'A', radiusKm: 0.2, elements: { a: 1.2, e: 0.3, i: 5, om: 1, w: 2, ma: 3, n: 0.7, epoch: 2451545 } },
      { id: 'b', name: 'B', radiusKm: 0.2, elements: { a: 1.2, e: 1.4, i: 5, om: 1, w: 2, ma: 3, n: 0.7, epoch: 2451545 } },
      { id: 'c', name: 'C', radiusKm: 0.2, elements: null },
    ]);
    assert.equal(bodies.length, 1);
    assert.equal(bodies[0].id, 'neo:a');
  });

  test('flare severity ranks the GOES classes correctly', () => {
    const a = nasa.flareSeverity('A1');
    const c = nasa.flareSeverity('C3');
    const m = nasa.flareSeverity('M5');
    const x = nasa.flareSeverity('X9');
    assert.ok(a < c && c < m && m < x, `${a} ${c} ${m} ${x}`);
    assert.ok(x <= 1 && a >= 0);
    assert.equal(nasa.flareSeverity(''), 0);
    assert.equal(nasa.flareSeverity('Z9'), 0);
  });

  test('close-approach rows are decoded by field name, not position', () => {
    const rows = nasa.parseCloseApproaches({
      fields: ['des', 'orbit_id', 'jd', 'cd', 'dist', 'dist_min', 'dist_max', 'v_rel', 'v_inf', 't_sigma_f', 'h'],
      data: [['2025 UK9', '1', '2461344.6', '2026-Oct-31 02:35', '0.0021', '0.0005', '0.0037', '7.83', '7.67', '01:00', '29.8']],
    });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].designation, '2025 UK9');
    assert.ok(Math.abs(rows[0].distanceAu - 0.0021) < 1e-9);
    assert.ok(rows[0].distanceKm > 300000 && rows[0].distanceKm < 320000);
  });

  test('diameter from absolute magnitude matches the standard relation', () => {
    // H = 17.75 with albedo 0.14 gives about 1 km, the usual worked example.
    const d = nasa.diameterFromMagnitude(17.75, 0.14);
    assert.ok(d > 0.9 && d < 1.1, `${d}`);
    // Fainter means smaller.
    assert.ok(nasa.diameterFromMagnitude(22, 0.14) < d);
  });

  test('isoDate formats in UTC', () => {
    assert.equal(nasa.isoDate(new Date('2026-08-04T23:59:59Z')), '2026-08-04');
  });
});

describe('committed snapshots', () => {
  const names = ['sbdb', 'exoplanets', 'techport', 'osdr', 'techtransfer'];

  for (const name of names) {
    test(`${name}.json is valid and non-trivial`, async () => {
      const raw = await readFile(resolve(ROOT, 'src/data/snapshots', `${name}.json`), 'utf8');
      const parsed = JSON.parse(raw);
      assert.ok(parsed.fetchedAt, 'must record when it was fetched');
      assert.ok(!Number.isNaN(Date.parse(parsed.fetchedAt)), 'fetchedAt must be a date');
      assert.ok(parsed.data, 'must carry a data payload');
      assert.ok(raw.length > 2000, `${name} is suspiciously small (${raw.length} bytes)`);
    });
  }

  test('sbdb has close approaches, risk objects and fireballs', async () => {
    const { data } = JSON.parse(await readFile(resolve(ROOT, 'src/data/snapshots/sbdb.json'), 'utf8'));
    assert.ok(data.closeApproaches.fields.includes('des'));
    assert.ok(data.closeApproaches.data.length > 0);
    assert.ok(data.sentry.objects.length > 0);
    for (const o of data.sentry.objects.slice(0, 10)) {
      assert.ok(o.designation, 'designation');
      assert.ok(o.impactProbability >= 0 && o.impactProbability < 1, 'probability in range');
      assert.ok(Number.isFinite(o.palermoScale));
    }
    assert.ok(data.fireballs.data.length > 0);
  });

  test('exoplanets snapshot is internally consistent', async () => {
    const { data } = JSON.parse(await readFile(resolve(ROOT, 'src/data/snapshots/exoplanets.json'), 'utf8'));
    assert.ok(data.total > 1000, `only ${data.total} planets`);
    assert.ok(data.nearest.length > 100);
    // Sorted by distance, nearest first.
    for (let i = 1; i < data.nearest.length; i++) {
      assert.ok(
        data.nearest[i].distancePc >= data.nearest[i - 1].distancePc,
        `not sorted at index ${i}`
      );
    }
    assert.equal(data.radiusHistogram.length, 24);
    assert.ok(data.radiusHistogram.reduce((a, b) => a + b, 0) > 0);
  });

  test('no snapshot contains raw HTML', async () => {
    for (const name of names) {
      const raw = await readFile(resolve(ROOT, 'src/data/snapshots', `${name}.json`), 'utf8');
      assert.ok(!/<(script|iframe|img|span class=)/i.test(raw), `${name} contains markup`);
    }
  });
});

describe('imagery', () => {
  // The matrix dimensions published by the services themselves, transcribed
  // from their WMTSCapabilities. These are the numbers that matter: assuming a
  // 2^(z+1) x 2^z grid instead is what made Earth render as procedural noise,
  // because the wrong column count does not merely miss tiles, it puts the
  // tiles that do load at the wrong longitudes.
  const PUBLISHED = {
    // GIBS, every matrix set (250m, 500m, 1km), 512 px tiles.
    gibs: { world0: 640, tileSize: 512, matrices: [[2, 1], [3, 2], [5, 3], [10, 5], [20, 10], [40, 20], [80, 40], [160, 80]] },
    // NASA Trek, default028mm, 256 px tiles.
    trek: { world0: 512, tileSize: 256, matrices: [[2, 1], [4, 2], [8, 4], [16, 8], [32, 16]] },
  };

  test('reproduces the tile matrices the services actually publish', () => {
    for (const [service, spec] of Object.entries(PUBLISHED)) {
      const layer = { world0: spec.world0, tileSize: spec.tileSize };
      spec.matrices.forEach(([cols, rows], z) => {
        const got = imagery.pyramidAt(layer, z);
        assert.equal(got.cols, cols, `${service} level ${z} columns`);
        assert.equal(got.rows, rows, `${service} level ${z} rows`);
      });
    }
  });

  test('the globe stays 2:1 at every level even when the matrix is not', () => {
    // A 3x2 matrix of 512 px tiles is 1.5:1, but the world inside it is not:
    // the last column and row hang off the edge. Confusing the two is what
    // stretched the mosaic.
    for (const spec of Object.values(PUBLISHED)) {
      const layer = { world0: spec.world0, tileSize: spec.tileSize };
      for (let z = 0; z < spec.matrices.length; z++) {
        const { worldWidth, worldHeight } = imagery.pyramidAt(layer, z);
        assert.equal(worldWidth, worldHeight * 2, `level ${z} is not 2:1`);
      }
    }
  });

  test('every real layer declares the geometry of its own service', () => {
    for (const [id, layer] of Object.entries(imagery.LAYERS)) {
      const expected = layer.tileSize === 512 ? 640 : 512;
      assert.equal(layer.world0, expected, `${id} world0`);
    }
  });

  test('picks a level at least as wide as asked for, never narrower', () => {
    for (const spec of Object.values(PUBLISHED)) {
      const layer = { world0: spec.world0, tileSize: spec.tileSize };
      for (const want of [512, 1024, 2048, 4096, 8192]) {
        const z = imagery.levelForWidth(want, layer);
        assert.ok(
          imagery.pyramidAt(layer, z).worldWidth >= want,
          `asked for ${want}, got ${imagery.pyramidAt(layer, z).worldWidth}`
        );
        if (z > 0) {
          assert.ok(
            imagery.pyramidAt(layer, z - 1).worldWidth < want,
            `level ${z} is one deeper than necessary for ${want}`
          );
        }
      }
    }
  });

  test('every layer builds a plausible tile URL', () => {
    for (const [id, layer] of Object.entries(imagery.LAYERS)) {
      const url = layer.url(2, 1, 3, '2026-08-01');
      assert.ok(url.startsWith('https://'), id);
      assert.ok(url.includes('/2/1/3.'), `${id}: ${url}`);
      assert.ok(layer.attribution.length > 5, `${id} attribution`);
      assert.ok([256, 512].includes(layer.tileSize), `${id} tile size`);
      if (layer.dated) assert.ok(url.includes('2026-08-01'), `${id} should embed the date`);
    }
  });

  test('body-to-layer mapping only references layers that exist', () => {
    for (const [body, layerId] of Object.entries(imagery.BODY_LAYERS)) {
      assert.ok(imagery.LAYERS[layerId], `${body} -> ${layerId}`);
    }
  });
});

describe('single-file build', () => {
  // Reading the bundler's source rather than its output: the output is 1.5 MB
  // and the property being checked is a property of the generator.
  const bundler = readFileSync(new URL('../../tools/build-artifact.mjs', import.meta.url), 'utf8');

  test('serves inlined data without a network request of any kind', () => {
    // A blob: URL fetched back is the obvious implementation and it is refused
    // by connect-src 'none', which is exactly the environment the single-file
    // build is for. Constructing the Response directly performs no request, so
    // there is nothing for a policy to refuse.
    assert.ok(
      /new Response\(JSON\.stringify\(body\)/.test(bundler),
      'the fetch shim must construct its Response in memory'
    );
    assert.ok(
      !bundler.includes('createObjectURL'),
      'the single-file runtime must not round-trip data through a blob: URL'
    );
  });

  test('the fragment build emits no document wrapper', () => {
    // The embedding host owns <head>; a nested <html> is discarded along with
    // everything inside it.
    const fragmentBranch = bundler.slice(bundler.indexOf('FRAGMENT'));
    assert.ok(fragmentBranch.includes('FRAGMENT'), 'the fragment mode is missing');
    assert.ok(
      /FRAGMENT\s*\n?\s*\?/.test(bundler) || bundler.includes('const out = FRAGMENT'),
      'the fragment branch must bypass the document wrapper'
    );
  });
});

// Restore the real fetch so the process does not exit with a patched global.
process.on('exit', () => {
  globalThis.fetch = realFetch;
});
