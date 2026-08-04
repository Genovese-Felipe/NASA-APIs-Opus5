# API governance and provenance

## Classification

| Class | Runtime behavior | Examples |
| --- | --- | --- |
| Browser-ready | May be queried from the client under the source’s documented CORS model | NASA Image and Video Library, EONET |
| Keyed browser-ready | Queried through `api.nasa.gov` with `DEMO_KEY` or a session-only user key | APOD, NeoWs, DONKI, EPIC |
| Deep-link only | Listed with official documentation; never embedded from the browser | JPL SSD/CNEOS, Exoplanet TAP in this release |
| Archived | Kept in the ledger for education and migration history; never labeled live | Mars Rover Photos, InSight Weather |

## Policy decision: JPL SSD/CNEOS

The official SSD service states both that clients must make only one request at a time and that its APIs may not be embedded in a website under its CORS policy. OPUS 5 therefore does not call Horizons, SBDB, Sentry, Scout, or related SSD endpoints from GitHub Pages. The API ledger links to the official service for specialist use.

This avoids three failures at once: a policy violation, browser CORS errors, and a misleading promise that a static site can reliably proxy specialist data.

## NASA Image Library decision

The official documentation explicitly supports cross-origin client-side interaction. Search results are rendered as attributed cards with NASA ID, publishing center, date, source title, and a deep link. Remote source images are not copied into the repository.

## Key handling

- `DEMO_KEY` is the only key in source.
- A personal key is kept in `sessionStorage`, not `localStorage`.
- No key is sent anywhere except `api.nasa.gov`.
- URLs are not logged.
- The UI explains that a client-side key is not a secret.

## Cache policy

| Source | TTL |
| --- | ---: |
| NeoWs, DONKI, EONET | 30 minutes |
| APOD, EPIC | 1 hour |
| NASA media search | 24 hours |

The cache reduces rate-limit pressure. A stale cached response may be displayed after a network failure, but it is marked `Cached` and retains its acquisition timestamp.

## Fallback policy

Built-in fallback values are named “Demonstration object/event/signal.” They exist only to preserve interaction and exercise the renderer. They do not reuse real object names, dates, or measurements that could be mistaken for a current observation.

## Change control

When an API changes:

1. update its normalizer and fixture;
2. add or revise a regression test;
3. confirm current official documentation and browser policy;
4. update the ledger classification;
5. run `npm test` and `npm run build`;
6. record the change in the pull request.
