# Research and decisions

Research was checked against first-party documentation on 2026-08-04.

## Primary sources

- [NASA Open APIs](https://api.nasa.gov/): portal for APOD, NeoWs, DONKI, EPIC, and related key-backed APIs. The portal currently marks Mars Rover Photos as archived.
- [NASA Image and Video Library API](https://images.nasa.gov/docs/images.nasa.gov_api_docs.pdf): REST search, asset, metadata, captions, and album endpoints. The documentation explicitly supports CORS for client-side web applications.
- [EONET v3 documentation](https://eonet.gsfc.nasa.gov/docs/v3): current event, category, source, layer, and GeoJSON interfaces. v3 is the current version; v2.1 is deprecated.
- [JPL SSD/CNEOS API service](https://ssd-api.jpl.nasa.gov/): official catalog for Horizons, SBDB, Sentry, Scout, fireballs, and other small-body services. Its fair-use policy prohibits website embedding and asks clients to check response versions.
- [DSCOVR EPIC API](https://epic.gsfc.nasa.gov/about/api): full-disc Earth metadata and archive image construction.

## Inspiration review

Useful patterns from scientific explorers were generalized rather than copied:

- treat the main view as an instrument rather than a content carousel;
- keep camera action available while presenting source evidence nearby;
- let device capability determine fidelity;
- separate visual drama from scientific claims;
- make degraded/offline mode obvious.

## Decisions that changed the build

1. **No direct JPL SSD calls.** Official policy beats feature count.
2. **No bundled NASA hero image.** The shader establishes a distinct identity and avoids stale, unattributed media.
3. **No fake MP4.** A WebM file is labeled WebM unless the browser genuinely provides an MP4 recorder.
4. **Native export, not CSS scaling.** 4K and 8K use the same projection at output resolution, tiled where needed.
5. **Procedural audio.** This removes licensing risk and lets data drive the sound.
6. **Private artifact excluded from Git.** Public source and private Claude delivery have different privacy requirements.
