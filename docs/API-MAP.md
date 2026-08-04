# ORBITAL API map and data governance

This document records exactly what the client requests, what it expects, and how it behaves when a source is unavailable.

## Request map

| ID | Official service | Client request | Primary use | Failure behavior |
| --- | --- | --- | --- | --- |
| `apod` | NASA APOD | `GET https://api.nasa.gov/planetary/apod?thumbs=true&api_key=…` | Daily archive card and source context | Keeps the procedural archive card |
| `epic` | DSCOVR EPIC | `GET https://api.nasa.gov/EPIC/api/natural?api_key=…` | Earth scene signal / availability | Keeps Earth scene with demo signal |
| `neos` | NeoWs | `GET https://api.nasa.gov/neo/rest/v1/feed?start_date=…&end_date=…&api_key=…` | Count, closest approach, hazard signal | Keeps three deterministic demo NEOs |
| `solar` | DONKI FLR | `GET https://api.nasa.gov/DONKI/FLR?startDate=…&endDate=…&api_key=…` | Solar-pulse scene and count | Keeps one labeled demo flare |
| `cmes` | DONKI CME | `GET https://api.nasa.gov/DONKI/CME?startDate=…&endDate=…&api_key=…` | Space-weather pulse context | Keeps demo solar-wind pulse |
| `events` | EONET v3 | `GET https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=40&days=30` | Natural-event list | Keeps three labeled demo events |
| `images` | NASA Image and Video Library | `GET https://images-api.nasa.gov/search?q=nebula%20space&media_type=image&page_size=8` | Archive scene availability | Keeps procedural archive moon |
| `earth` | Earth imagery | `GET https://api.nasa.gov/planetary/earth/imagery?lon=…&lat=…&date=…&dim=…&api_key=…` | Earth-data health check | Keeps EPIC-style Earth scene |

## Runtime contract

Each source is queried with an `AbortController` timeout. The client uses `Promise.all` so one failed request cannot cancel the rest. The response is accepted only after an HTTP success status and JSON parsing. Successful source status is `live`; a failed source is `error`; cached or seeded values are represented as `demo` in the UI.

The cache is a small JSON snapshot under `localStorage` key `orbital-nasa-cache-v1`, retained for up to eight hours. It is not a durable data archive and is never treated as fresher than a successful live response.

## Data shaping

- NeoWs feed objects are flattened from date keys into a single array.
- EONET category titles and geometry dates are normalized only for display.
- APOD media is rendered only as an image when `media_type === "image"`; videos become a media glyph and remain linked through the APOD record.
- External links are protocol-checked before insertion into the event detail modal.
- API keys are redacted from JSON observation exports.

## Rate-limit posture

The app defaults to `DEMO_KEY` and requests a short, bounded set of records. A personal key can be entered locally for higher data.gov limits. The client does not rotate keys, retry aggressively, poll in the background, or expose a key in source control. Refresh is user-triggered after the initial load.

## What “all NASA APIs” means here

NASA’s public API catalogue is broad and evolves over time. ORBITAL integrates a deliberately cross-domain constellation rather than claiming to implement every service or undocumented endpoint. The official source rail makes the boundary visible. Additional sources can be added by extending `API_CATALOG`, `NASA.refresh`, the source status, and the validation cases together.
