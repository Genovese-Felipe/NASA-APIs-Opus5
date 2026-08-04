# NASA COSMOS // OPUS 5

> A live computational observatory: NASA open data becomes ray-traced worlds, orbital swarms, Earth-event signals, solar sonification, a searchable media archive, and native-resolution captures.

[Launch the observatory](https://genovese-felipe.github.io/NASA-APIs-Opus5/) · [Architecture](docs/ARCHITECTURE.md) · [API governance](docs/API-GOVERNANCE.md) · [Quality evidence](docs/QUALITY.md)

## What this is

OPUS 5 is not a slideshow with space imagery behind a dashboard. Its main canvas is a WebGL 2 analytic ray tracer. It computes camera rays, sphere intersections, lighting, atmospheric rims, orbital paths, asteroid intersections, solar plasma, a procedural stellar field, and a compact gravitational-lensing approximation every frame. Live NASA data changes the visual energy, event positions, orbital population, hazard signal, and generative sound.

The application is a static, privacy-preserving GitHub Pages site. It needs no backend, account, analytics, or bundled API secret.

## Standout capabilities

| System | What ships |
| --- | --- |
| Computational graphics | WebGL 2 full-screen analytic ray tracing, procedural materials, Earth atmosphere, event beacons, asteroid swarm, solar corona, lensing scene, ACES-style tone mapping, bloom, grain, deep AMOLED blacks |
| NASA data | APOD, NeoWs, DONKI, DSCOVR EPIC, EONET v3, NASA Image and Video Library; a governed catalog also covers GIBS, Exoplanet Archive, Technology Transfer, TLE, archived Mars/InSight endpoints, and policy-restricted JPL SSD services |
| Navigation | Mouse drag, wheel zoom, touch drag, pinch zoom, arrow keys, orbit mode, adjustable speed and inclination, pause, and an automatic cinematic journey |
| Quality | Auto dynamic resolution plus Low, Balanced, High, and Ultra profiles; uncapped `requestAnimationFrame` scheduling respects high-refresh displays |
| Still export | PNG, JPEG, and WebP; viewport, native 4K, and tiled native 8K. The renderer recomputes every export pixel instead of enlarging the visible canvas |
| Recording | Canvas recording up to 120 seconds; MP4/H.264 is preferred when the browser exposes it, with VP9/VP8 WebM fallbacks |
| Audio | Copyright-safe procedural Web Audio sonification. Space-weather and scene energy alter pitch, filter, and pulse behavior; the track is included in recordings when enabled |
| Languages | English, Portuguese, Spanish, Simplified Chinese, Korean, French, Japanese, German, and Arabic with RTL layout |
| Reliability | Typed schema normalization, request timeouts, bounded concurrency, TTL caching, stale-on-error recovery, honest deterministic demo mode, context-loss recovery, and a shell service worker |
| Accessibility | Semantic controls, visible focus, skip link, keyboard operation, reduced-motion support, touch targets, status announcements, high-contrast text, and meaningful archive image alt text |

## NASA API coverage: what “all” can responsibly mean

NASA does not expose one immutable, universally browser-embeddable API surface. Some products are archived; others use different NASA centers and policies. The JPL SSD/CNEOS service explicitly says its APIs may not be embedded in a website. OPUS 5 therefore treats coverage as a governed constellation:

1. **Live adapters** call current, browser-appropriate sources and validate their payloads.
2. **Catalog adapters** explain and link to official specialist sources that are not suitable for direct client embedding.
3. **Archived adapters** remain discoverable but never masquerade as live.
4. **Demo signals** are deterministic and visibly marked; they are never presented as current NASA observations.

This is broader—and more honest—than firing every endpoint from a browser until CORS, policy, or rate limits fail.

## Quick start

Requirements: Node.js 20 or newer.

```bash
npm install
npm run dev
```

Verification:

```bash
npm test
npm run build
```

The build emits a static `dist/` directory with relative asset paths, ready for GitHub Pages.

## Controls

| Input | Action |
| --- | --- |
| Drag / touch drag | Rotate the observer |
| Wheel / pinch | Change orbital distance |
| Arrow keys | Precision camera movement |
| `O` | Toggle orbit mode |
| `Space` | Pause or resume motion |
| `E` | Open the export studio |
| `R` | Start or stop recording |

## API key model

The built-in `DEMO_KEY` is an official NASA convenience key with strict limits. A personal key can be entered in Mission Control and is stored only in `sessionStorage`. Because GitHub Pages is client-side, no browser key can be treated as a server secret. The repository and generated bundles contain no personal key.

Get a key from the [NASA Open APIs portal](https://api.nasa.gov/).

## Capture behavior

### Still images

- **Viewport:** exports the active internal render resolution.
- **4K:** re-renders at 3840 × 2160.
- **8K:** re-renders 7680 × 4320 in GPU-safe tiles and assembles them in a browser canvas.
- The application checks output dimensions and applies a conservative memory guard. A device that cannot safely encode the output receives a clear lower-resolution recommendation.

### Video

`MediaRecorder.isTypeSupported()` determines the container at runtime. MP4/H.264 is chosen first where the browser supports it; otherwise WebM VP9, WebM VP8, or baseline WebM is used. This is a browser capability decision—not a misleading “convert to MP4” label over WebM bytes.

## Private Claude artifact

The private artifact is deliberately excluded from the public repository. Generate it with:

```bash
npm run artifact
```

The result is one self-contained HTML file in `artifact/`, with the production CSS and JavaScript inlined. See [Claude artifact notes](docs/CLAUDE-ARTIFACT.md).

## Project map

```text
src/
  api.ts         request broker, cache, adapters, validation, demo data
  renderer.ts    WebGL lifecycle, camera, touch, quality, tiled export
  shaders.ts     computational visual model
  audio.ts       generative Web Audio sonification
  export.ts      still encoding and MP4/WebM capability negotiation
  i18n.ts        nine complete interface dictionaries
  main.ts        accessible application shell and orchestration
tests/           normalization, cache, localization, capture tests
docs/            architecture, research, governance, accessibility, QA
```

## Governance and limitations

- NASA data services are best-effort and may change. Each adapter fails independently.
- NASA Library media retains its source metadata and is kept outside the export canvas to avoid attribution loss and cross-origin canvas tainting.
- The ray tracer is an educational real-time renderer, not a mission-grade orbital dynamics or general-relativity solver.
- “Potentially hazardous” is NASA/JPL classification metadata, not an impact prediction.
- This independent project is not sponsored, endorsed, or operated by NASA.

## License

Source code is released under the [MIT License](LICENSE). NASA media and data remain subject to their original policies and attribution requirements.
