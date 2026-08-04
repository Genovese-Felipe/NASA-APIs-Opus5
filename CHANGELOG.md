# Changelog

Notable changes to this project. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [1.0.0] — 2026-08-04

The first release.

### Rendering

- WebGL2 ray tracer: analytic ray–spheroid intersection, ring-plane annuli,
  spherical atmosphere shells, all in one fragment shader.
- Closed-form soft shadows from disc–disc overlap, giving physically sized umbra
  and penumbra without stochastic sampling.
- Single-scattering Rayleigh and Mie atmospheres using each body's real scale
  height, with a jittered march so accumulation removes the stepping artefacts.
- Ring shadows on planets, planet shadows on rings, forward and back scattering,
  and analytic antialiasing of the fine radial structure.
- Oren–Nayar diffuse, GGX specular for water, planetshine and ringshine.
- Temporal accumulation with a Halton (2,3) jitter; bloom pyramid; AgX, ACES,
  Reinhard and linear tone mapping.
- The star catalogue drawn as point sprites in a pass of its own, so a star is
  a point at any zoom rather than a texel of a magnified sky map. Occlusion
  comes from the coverage mask the ray tracer writes to alpha, blended with
  ONE_MINUS_DST_ALPHA — no depth buffer, and thin rings correctly let starlight
  through.
- Photometry normalised so solar irradiance at 1 au is exactly 1.0, with an
  exposure control that follows the inverse-square law.
- Five quality tiers and an adaptive resolution controller.

### Astronomy

- Planet positions from the JPL Standish elements, both fits, validated against
  JPL Horizons in the test suite.
- Earth split from the Earth–Moon barycentre.
- 21 satellites with orbits in their parent's equatorial frame.
- IAU 2015 rotational elements for axial tilt and rotation phase.
- 8,751 stars from the Bright Star Catalogue, coloured from B–V.
- 89 constellation figures.
- Ring geometry for all four ringed planets, with named bands and gaps.

### Data

- Eleven NASA services called live from the browser.
- Five CORS-blocked services fetched nightly by CI and committed.
- Two retired services documented with the reason.
- Caching, in-flight de-duplication, rate-limit awareness and a four-step
  degradation ladder, with provenance surfaced in a Data Health panel.
- Earth, Mars, Moon and Mercury textured from GIBS and Trek tile pyramids.

### Interface

- Ten languages, including Arabic with full right-to-left layout.
- Five guided tours.
- 8K still export via a canvas-free PNG encoder, tiled with margin so there is
  no seam.
- Video recording with genuine MP4 where the browser supports it, plus an
  offline path for frame-rate-independent output.
- Synthesised soundscape and data sonification; no audio files.
- Reduced motion, high contrast, larger text, full keyboard operation, live
  region announcements.

### Engineering

- No build step, no runtime dependencies, no framework.
- 195 unit tests and 38 browser tests, the latter with all external network
  access blocked.
- A scientific data validator that checks numbers against physics.
- A focused linter for the mistakes that break a deployed static site.
