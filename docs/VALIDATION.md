# Validation and inspection record

## Automated checks

`npm test` performs deterministic checks that do not require a browser or a NASA key:

- parses the inline application script with Node’s VM parser;
- verifies required canvas, controls, modal, drawer, and data-region anchors;
- verifies the eight-source API catalog;
- verifies that the fallback dataset and live/fallback status vocabulary remain present;
- verifies the GitHub Pages workflow and private-artifact builder exist.

## Manual acceptance matrix

| Check | Expected result |
| --- | --- |
| Open with WebGL2 | Procedural field renders; renderer readout says WebGL2 / procedural ray trace |
| Disable WebGL2 or use an older browser | Canvas 2D field renders; a fallback toast appears; controls still work |
| Load with no network | Demo field remains visible; no empty black screen; source badges identify fallback |
| Load with `DEMO_KEY` | Public-source responses may be limited; failed calls stay isolated and labeled |
| Drag / touch / wheel | Viewpoint rotates and zoom changes without scrolling the canvas |
| Orbit toggle | Yaw advances while enabled; it pauses while disabled or reduced motion is preferred |
| Language select | Ten listed languages update the principal interface labels; Arabic switches direction |
| Capture viewport | Actual canvas dimensions appear in the confirmation toast and a file downloads |
| Capture 4K / 8K | Browser-safe dimensions are used; a large allocation does not crash the page |
| Record | MP4 is used only when advertised; otherwise WebM is downloaded after stopping |
| API drawer | Each endpoint has an official source link and LIVE / DEMO / FALLBACK state |
| JSON export | Snapshot includes timestamp, scene, API status, and redacted key mode |
| Keyboard | Space, R, M, 1–4, arrows/WASD, and +/- behave as documented |

## Known limits

1. A GitHub Pages static client cannot safely hide a public NASA API key. ORBITAL therefore supports `DEMO_KEY` and browser-local entry, but never commits credentials.
2. Browser codecs differ. WebM is the most portable fallback; MP4 is conditional.
3. 8K capture is subject to device memory, maximum canvas dimensions, and GPU limits. The UI reports the actual result.
4. NASA endpoints may change, rate-limit, return intermittent 5xx responses, or have missing media. The resilient fallback is intentional.
5. The procedural ray tracer is an educational renderer, not a relativistic ephemeris, orbital propagator, or mission-planning tool.

## Review checklist for future changes

- Add or update the source row in `API_CATALOG`.
- Add the request and fallback behavior to `docs/API-MAP.md`.
- Add a smoke assertion if a required contract changes.
- Confirm keys are not in source, screenshots, JSON fixtures, or workflow logs.
- Test a live response, a timeout, an invalid JSON response, a denied image, and a WebGL2 fallback.
- Re-check mobile layout and reduced-motion behavior.
