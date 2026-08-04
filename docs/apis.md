# Working with the NASA APIs

A practical field guide, written from having integrated every one of them.
If you are building something similar, this is the document I wanted and could
not find.

- [The short version](#the-short-version)
- [Rate limits, and why they matter more than you think](#rate-limits-and-why-they-matter-more-than-you-think)
- [CORS: the dividing line](#cors-the-dividing-line)
- [Service by service](#service-by-service)
- [The snapshot pattern](#the-snapshot-pattern)
- [Designing for degradation](#designing-for-degradation)
- [Testing against services you do not control](#testing-against-services-you-do-not-control)

---

## The short version

Of the eighteen services relevant to a project like this:

- **eleven** can be called directly from a browser;
- **five** are healthy but block cross-origin access, so a static site must
  fetch them ahead of time;
- **two** have been retired without announcement and still appear in tutorials.

Every claim in this document was verified by making the request and reading the
response headers. Where behaviour differs from the official documentation, that
is noted — and it differs more often than you would expect.

## Rate limits, and why they matter more than you think

```
DEMO_KEY        30 requests / hour     50 / day      per IP address
personal key  1000 requests / hour     no daily cap  per key
```

The phrase "per IP address" is doing a lot of work. On a corporate network, a
university, or behind CGNAT, `DEMO_KEY` is shared with everyone else — and it is
gone in seconds.

This is the single biggest constraint on a public NASA-powered site, and it
shapes the whole architecture. What we do about it:

1. **Cache everything persistently.** APOD changes once a day; there is no
   reason to fetch it twice.
2. **De-duplicate in flight.** Two components asking for the same URL at the
   same moment produce one request.
3. **Read the remaining quota.** `api.nasa.gov` returns `X-RateLimit-Limit` and
   `X-RateLimit-Remaining`, and — critically — lists them in
   `Access-Control-Expose-Headers`, so JavaScript can actually read them. Show
   the user their remaining quota *before* they hit the wall.
4. **Fall back to snapshots.** When the quota is gone, serve committed data and
   say so.

```js
// The remaining quota is readable, and it is worth reading.
const res = await fetch(url);
const remaining = res.headers.get('X-RateLimit-Remaining');
```

A note on measuring this: quota counters appear to be eventually consistent.
During testing, `X-RateLimit-Remaining` was observed moving non-monotonically
(9 → 6 → 9). Treat it as a strong hint rather than an exact count.

## CORS: the dividing line

Whether a browser can call a NASA service is not documented anywhere central.
The only reliable method is to ask:

```bash
curl -sS -o /dev/null -D - \
  -H "Origin: https://example.github.io" \
  "https://ssd-api.jpl.nasa.gov/fireball.api?limit=1"
```

If the response has no `Access-Control-Allow-Origin`, no browser will let you
read it, regardless of what the API returns to `curl`.

The results, which are not what the documentation implies:

| Header | Services |
|---|---|
| `Access-Control-Allow-Origin: *` | NeoWs, EPIC, EONET, GIBS, Trek, images-api, POWER, SSC, TLE, DONKI (at CCMC) |
| Echoes the request `Origin` | APOD |
| **Absent entirely** | JPL SSD/CNEOS, Exoplanet Archive TAP, TechPort |
| **Pinned to one origin** | TechTransfer (`https://technology.nasa.gov`) |
| **Malformed** | OSDR (`osdr.nasa.gov` — no scheme, so it matches nothing) |

That last one is worth a moment. `Access-Control-Allow-Origin: osdr.nasa.gov` is
not a valid origin — an origin needs a scheme — so every browser rejects it. It
looks like a configuration mistake rather than a policy, but the effect is a
hard block.

## Service by service

### APOD

```
https://api.nasa.gov/planetary/apod?api_key=KEY&date=2026-08-04
```

The highest-value visual endpoint in the catalogue: a curated astronomical image
every day since 1995, with a paragraph by a working astronomer.

- `count=N` returns N random entries — instant gallery content.
- `start_date` / `end_date` for a range, mutually exclusive with `date`.
- `thumbs=true` gives a still for video entries.

**Branch on `media_type`.** Roughly one entry a week is a YouTube or Vimeo embed,
not an image, and code that assumes `url` is a picture will break on those days.

**Respect the `copyright` field.** APOD frequently features work by independent
astrophotographers who retain rights. If it is present, display it.

### Asteroids NeoWs

```
https://api.nasa.gov/neo/rest/v1/feed?start_date=…&end_date=…&api_key=KEY
https://api.nasa.gov/neo/rest/v1/neo/browse?api_key=KEY
https://api.nasa.gov/neo/rest/v1/neo/{id}?api_key=KEY
```

- **The feed accepts at most a seven-day span.** Longer ranges are rejected.
- **`orbital_data` is only on lookup and browse**, not on the feed unless you
  pass `detailed=true`. That matters, because `orbital_data` contains full
  Keplerian elements — `a`, `e`, `i`, `om`, `w`, `ma`, `epoch`, `n` — which is
  everything needed to propagate the orbit and draw it properly rather than
  plotting a bar chart of miss distances.

```js
// NeoWs elements are in degrees with `a` in au, which is the JPL small-body
// convention; propagate the mean anomaly from its epoch and you have an orbit.
const n = od.mean_motion ?? 0.9856076686 / Math.pow(od.semi_major_axis, 1.5);
const M = od.mean_anomaly + n * (jd - od.epoch_osculation);
```

### EPIC

```
https://api.nasa.gov/EPIC/api/natural/all?api_key=KEY
https://api.nasa.gov/EPIC/api/natural/date/2026-08-01?api_key=KEY
https://api.nasa.gov/EPIC/archive/natural/2026/08/01/png/epic_1b_….png?api_key=KEY
```

The full sunlit disc of Earth from the Sun–Earth L1 point, about thirteen times
a day.

- **`/natural/images` answers 302** to `epic.gsfc.nasa.gov`. Use `/all` (the
  list of available dates) or `/date/{date}`.
- Archive PNGs are around 2.8 MB each; there are JPEG variants at the same path
  with `jpg` instead of `png`.
- The metadata includes `dscovr_j2000_position`, `sun_j2000_position`,
  `lunar_j2000_position` and attitude quaternions — enough to place the
  spacecraft correctly in a 3D scene, which is a much better use of it than a
  flat image gallery.

### EONET

```
https://eonet.gsfc.nasa.gov/api/v3/events?status=open&days=30
```

No key. Live wildfires, volcanoes, storms and icebergs, with date-stamped
tracks.

**Do not branch on the content type.** EONET sometimes returns
`Content-Type: application/rss+xml` with a JSON body. Always `JSON.parse` the
text.

### DONKI — use the origin, not the mirror

```
✗ https://api.nasa.gov/DONKI/FLR            502 / 503, persistently
✓ https://kauai.ccmc.gsfc.nasa.gov/DONKI/WS/get/FLR
```

The `api.nasa.gov` mirror was returning 502 and 503 on every sub-endpoint,
repeatedly, over a long period. The CCMC origin it proxies is healthy, serves
the identical dataset, sends `Access-Control-Allow-Origin: *`, and needs no key
at all.

Sub-endpoints: `CME`, `CMEAnalysis`, `GST`, `IPS`, `FLR`, `SEP`, `MPC`, `RBE`,
`HSS`, `WSAEnlilSimulations`, `notifications`. All take `startDate` and
`endDate`.

Flare classes are logarithmic — an X1 is ten times a M1, which is ten times a
C1 — so if you are mapping them to anything visual, take the log:

```js
const decade = { A: 0, B: 1, C: 2, M: 3, X: 4 }[cls[0]];
const flux = Math.pow(10, decade) * (parseFloat(cls.slice(1)) || 1);
```

### GIBS

```
https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/{layer}/default/{time}/{tms}/{z}/{row}/{col}.{ext}
```

A thousand daily-updated global layers, keyed by date **in the URL** — so a date
slider is a string substitution.

The pyramid convention is worth internalising: **level 0 is two tiles wide and
one tall**, covering the globe, and each level doubles. So an equirectangular
texture of width W is exactly the level where `2^(z+1) × tileSize = W`. No
reprojection, no resampling, no seams — which is how this project textures Earth
at runtime.

Do not fetch `WMTSCapabilities.xml` in a browser: it is about 5 MB.

Near-real-time layers lag by a few hours, so "today" often 404s. Two days back
is reliably populated.

### Trek WMTS

```
https://trek.nasa.gov/tiles/{Body}/EQ/{layer}/1.0.0/default/default028mm/{z}/{row}/{col}.jpg
```

Photographic basemaps of other worlds. Verified working layers:

| Body | Layer |
|---|---|
| Moon | `LRO_WAC_Mosaic_Global_303ppd_v02` |
| Mars | `Mars_Viking_MDIM21_ClrMosaic_global_232m` |
| Mars | `Mars_MGS_MOLA_ClrShade_merge_global_463m` |
| Mercury | `Mercury_MESSENGER_MDIS_Basemap_BDR_Mosaic_Global_166m` |

**The URLs in the official documentation are dead.** The documented
`moontrek.jpl.nasa.gov` host answers 502, and the `api.nasa.gov` tile paths 404
(they serve only capabilities XML, via a redirect to a presigned S3 URL that has
no CORS header on the final hop). Only `trek.nasa.gov/tiles/...` serves tiles.

Layer names also drift from the documented list — several Vesta layers 404.
Probe before relying on one.

### Satellite Situation Center

```
https://sscweb.gsfc.nasa.gov/WS/sscr/2/locations/iss/20260804T000000Z,20260804T010000Z/gse/
```

Real geocentric ephemeris for hundreds of spacecraft, plus magnetospheric region
tagging.

**It defaults to XML**, and the documentation implies that is all it does. Send
`Accept: application/json` and it returns JSON.

### TLE API

```
https://tle.ivanstanojevic.me/api/tle/25544
```

**The trailing slash is mandatory.** `/api/tle/` works; `/api/tle` answers
508 "Resource Limit Is Reached". This is a third-party service on shared hosting
that NASA merely links to — bundle a fallback element set.

### POWER

```
https://power.larc.nasa.gov/api/temporal/climatology/point?parameters=T2M&community=RE&latitude=…&longitude=…&format=JSON
```

Forty years of global solar and meteorological reanalysis. The climatology
endpoint returns twelve monthly values in a tiny response, which is ideal for a
sparkline anywhere on Earth.

### The CORS-blocked five

**JPL SSD/CNEOS** (`ssd-api.jpl.nasa.gov`) — the authoritative source for close
approaches (`cad.api`), impact risk (`sentry.api`) and fireball airbursts
(`fireball.api`). Also `horizons.api`, which is the real ephemeris. No CORS
header at all; preflight answers 405.

**NASA Exoplanet Archive** — `TAP/sync` takes ADQL and returns JSON. No CORS. The
legacy `nph-nstedAPI` endpoint *does* send `*`, but its table list has changed
and the documented example tables no longer exist.

**TechPort** — the full funded technology portfolio with TRL levels. No CORS,
and the project list endpoint returns about 1.6 MB of bare IDs.

**OSDR / GeneLab** — spaceflight biology. Malformed CORS header, as above.

**TechTransfer** — `api.nasa.gov/techtransfer` answers 302 and **drops your path
and query**. The real endpoint is
`technology.nasa.gov/api/query/{patent|software|spinoff}/{term}`, which pins CORS
to its own origin.

### The two that are gone

**Mars Rover Photos.** Every path answers 404 with a dead-backend page, and the
API has been removed from the `api.nasa.gov` manifest. This is not an outage.
Use the Image and Video Library (`images-api.nasa.gov/search?q=curiosity`) or the
Mars Trek mosaics instead.

**Earth / Landsat imagery.** Connections open and never respond — no status line
after 90 seconds — and it too has been removed from the manifest. GIBS is the
healthier, higher-resolution replacement.

Both are still all over tutorials and blog posts. If you are following a guide
that uses them, that guide is out of date.

## The snapshot pattern

For a static site, the CORS-blocked services leave two options: proxy them
through a third party, or fetch them ahead of time.

Fetching ahead of time wins on every axis. It is faster, works offline, adds no
third-party dependency to the request path, needs no secret, and — because the
same files double as the fallback for the *live* APIs — means a first-time
visitor sees a fully populated interface before a single network request
completes.

```yaml
# .github/workflows/data-refresh.yml
on:
  schedule:
    - cron: '17 4 * * *'   # off the hour: everything asking for :00 queues
jobs:
  refresh:
    steps:
      - run: node tools/fetch-snapshots.mjs
      - run: node --test "tests/unit/data.test.js"   # never commit a bad snapshot
      - run: git commit -am "data: refresh NASA snapshots" && git push
```

Validate before committing. A snapshot that is empty, malformed or full of HTML
must never reach the site, and the same tests that guard the app guard the data.

## Designing for degradation

Assume every service will be down at some point, because over a long enough
window every one of them is.

The pattern used here is a fixed ladder:

```
live  ──▶  cache (fresh)  ──▶  cache (stale)  ──▶  snapshot  ──▶  honest error
```

with the *provenance recorded* at each step and surfaced in the interface. That
last part is the one people skip, and it is the one that matters: a panel
showing "current" solar flares that are quietly a fortnight old is worse than a
panel showing nothing, because it is confidently wrong.

Retry policy is worth getting right too. A 5xx or a network error deserves a
retry with backoff; a 4xx and a 429 do not — a rate limit will not improve by
being asked again, and retrying into one makes it worse.

## Testing against services you do not control

Do not. Stub them.

The end-to-end suite here blocks **all** external network access:

```js
await page.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, (route) => route.abort());
```

Two things fall out of that. The test run is repeatable, because it does not
depend on a dozen third parties being up. And it continuously proves the
fallback path works — which is the path most visitors will hit at some point,
and the one that is otherwise never exercised.

For the unit tests, stub `fetch` and assert on the *behaviour around* the
network: that a second identical request is served from cache, that concurrent
callers are de-duplicated into one request, that a 503 falls back to a stale
cache, that a 429 is not retried, and that the API key never appears in an error
message.

---

Next: [architecture](architecture.md) · [the science](science.md) ·
[using the app](user-guide.md) · [every source](../DATA-AND-CREDITS.md)
