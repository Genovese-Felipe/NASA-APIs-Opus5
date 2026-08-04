# Architecture

How ORRERY is put together, and why.

- [The shape of the thing](#the-shape-of-the-thing)
- [Why no build step](#why-no-build-step)
- [Why a ray tracer](#why-a-ray-tracer)
- [The precision problem](#the-precision-problem)
- [The pass chain](#the-pass-chain)
- [How light is measured](#how-light-is-measured)
- [The data layer](#the-data-layer)
- [High-resolution export](#high-resolution-export)
- [Video capture](#video-capture)
- [Internationalisation](#internationalisation)
- [Module map](#module-map)

---

## The shape of the thing

```
index.html
  └── src/main.js                 boot, error boundary, DOM handles
       └── ui/app.js              the frame loop and all mutable state
            ├── ui/panels.js      right-hand panel content
            ├── ui/labels.js      DOM label overlay
            ├── ui/tours.js       scripted camera sequences
            ├── ui/i18n.js        translation and Intl formatting
            ├── render/           the ray tracer and everything it needs
            ├── astro/            positions, catalogues, time
            ├── data/             NASA clients, snapshots, health
            └── audio/            synthesised soundscape
```

The dependency direction is strict and one-way. `astro/` knows nothing about
rendering. `render/` knows nothing about NASA APIs. `data/` knows nothing about
the interface. `ui/` is the only layer that knows about all of them, and it is
the only layer that touches the DOM.

That is worth stating because it is what makes the module boundaries useful
rather than decorative: `astro/` is fully testable in Node with no browser at
all, which is why the ephemeris can be checked against JPL Horizons in a unit
test rather than by looking at a picture.

## Why no build step

`src/` is served verbatim as native ES modules. There is no bundler, no
transpiler, no minifier and no source map.

The reasons, in order of how much they mattered:

1. **Shader iteration is the tightest inner loop of this project.** Edit
   `raytrace.glsl.js`, reload, see the frame. Inserting a rebuild step into that
   loop would have cost more than everything a bundler gives back.
2. **It removes a whole class of deployment bug.** There is no base-path
   rewriting to get wrong, so "works locally, 404s at `/NASA-APIs-Opus5/`"
   cannot happen. The linter enforces the one rule that makes this true: no
   root-absolute paths anywhere.
3. **An educational project whose source you cannot read has failed at its own
   premise.** Open the developer tools on the deployed site and every module is
   there, commented, in the order it was written.

The cost is about fifty HTTP requests on first load, which HTTP/2 multiplexes
and the browser then caches individually. That is a good trade.

There *is* a Node pipeline, but it runs in CI and commits its output:
`fetch-snapshots.mjs` for the CORS-blocked APIs, `build-star-catalogue.mjs` for
the star data, `build-site.mjs` to assemble the deployable tree, and
`build-artifact.mjs` for the single-file version.

## Why a ray tracer

The scene is made of spheres, oblate spheroids, annuli and spherical shells.
Every one of those has a closed-form ray intersection. Given that, a rasteriser
is doing strictly more work for a strictly worse result:

- **Tessellation is infinite.** Saturn's limb is analytically smooth at any
  zoom. There is no mesh to run out of triangles.
- **Oblateness is exact.** Jupiter's equatorial radius really is 6.5 per cent
  larger than its polar one, and the intersection test uses that directly rather
  than approximating it with geometry.
- **Shadows are the same code as visibility.** Eclipses, ring shadows on the
  planet, planet shadows on the rings and mutual moon shadows are all occlusion
  queries against the same quadrics. No shadow maps, no cascades, no seams, and
  correct at every scale.
- **There is no depth buffer to run out of precision.** In a scene spanning ten
  orders of magnitude, that is not a small thing.

Soft shadows deserve a note. Rather than sampling the solar disc stochastically —
which needs many samples to stop being noisy — the shader computes the **overlap
area of two discs on the sky** in closed form: the Sun's disc and the occluder's.
That is exact for spheres lit by a sphere, gives a perfectly smooth penumbra from
a single evaluation, and handles the annular case where a small occluder sits
inside a larger light. It is why eclipse shadows here have physically correct
umbra and penumbra widths.

## The precision problem

The scene is 4.5 billion kilometres across and you can fly to within a hundred
metres of a moon. A 32-bit float has about seven significant digits. Those two
facts are irreconcilable — unless you never ask the GPU to hold a large number.

So the renderer works in **camera-relative coordinates measured in megametres**.
The CPU computes every position in double precision, in kilometres, with the Sun
at the origin; the renderer subtracts the camera position and divides by a
thousand before anything reaches the GPU. The shader's origin is the eye, and
every quantity it handles is comfortably inside float range.

There is a second precision trap, in the ray–sphere intersection itself. The
textbook form,

```
t = (-b - sqrt(b² - 4ac)) / 2a
```

catastrophically cancels when the ray origin is far from the sphere — which is
our situation constantly: a camera a billion kilometres from a 25,000 km planet.
The shader uses the numerically stable form instead, computing the far root and
recovering the near one from the product of the roots (`t₀t₁ = c/a`).

## The pass chain

```
1. ray trace     ──▶ HDR RGBA16F, jittered by a Halton sequence;
                     alpha carries scene coverage
2. stars         ──▶ the catalogue as point sprites, blended against that
                     coverage so geometry occludes them
3. vector overlay ──▶ orbit paths, drawn into the same HDR buffer so they bloom
4. accumulate    ──▶ running mean with the previous frame, while the view is still
5. bloom         ──▶ 13-tap downsample pyramid, tent upsample with additive blending
6. composite     ──▶ exposure, tone map, grade, dither ──▶ canvas or export target
```

**The star pass earns its place by arithmetic.** Stars were originally painted
into the equirectangular sky texture, which is the tidier design: the ray tracer
samples it in the miss branch, so occlusion and bloom come free. It cannot be
made to look right. At a 40° field across 1280 pixels the screen resolves 32
pixels per degree and a 2048-wide sky map resolves 5.7, so every texel is
magnified 5.6× and a star splatted at the smallest kernel that survives
resampling arrives as a soft disc a dozen pixels wide. The sky looks like
confetti. Raising the resolution does not rescue it — 8192 × 4096 in RGB16F is
200 MB of texture for a factor of two.

A point sprite is the same two pixels across at any field of view, which is what
a star should be. The only thing the texture was providing for free was
occlusion, and the fixed-function blender gives that back: the ray tracer writes
coverage into alpha, and the star pass is drawn with a source factor of
`ONE_MINUS_DST_ALPHA`. A star behind Jupiter contributes exactly zero; a star
behind Saturn's C ring contributes what the ring transmits. No depth buffer, no
sorting. The sky texture keeps the Milky Way, which is diffuse and
low-frequency and loses nothing to a fixed angular resolution.

**Temporal accumulation** is what makes the image good on ordinary hardware. When
the camera and the clock are both still, successive frames differ only by their
sub-pixel jitter, so a running mean converges to a supersampled image. Hold still
for a second and the noise and aliasing melt away. Any change to the camera, the
field of view or the simulated time resets the history.

The jitter uses a **Halton (2,3) sequence** rather than white noise: a
low-discrepancy sequence covers the pixel far more evenly, so sixteen accumulated
samples look like sixty-four.

The atmosphere ray march is jittered per-pixel and per-frame for the same reason.
A fixed step pattern turns the exponential density profile into concentric rings
on the planet's disc — the chord length depends only on the impact parameter, so
the quantisation error is radially symmetric and very visible. Jittering turns
that structured error into noise, which accumulation then integrates away
completely.

**Bloom** uses the 13-tap filter from Jimenez's SIGGRAPH 2014 presentation, which
is stable under motion where a naive box filter shimmers badly on small bright
points — and a star field is made entirely of small bright points.

The upsample adds each level into the one above using the fixed-function
blender rather than reading the destination in the shader. Sampling and writing
the same texture in one draw is undefined behaviour, and the obvious workaround —
a scratch target per level — would allocate on every frame.

## How light is measured

Every radiometric quantity in the shader is expressed in units where **the solar
irradiance at one astronomical unit is exactly 1.0**.

That single normalisation makes the exposure control meaningful. "Exposure 1" is
correctly exposed for a sunlit surface at Earth's distance. Neptune, at 30 au,
receives 1/900 of that — and the exposure control opens up by exactly that
factor, which is precisely what a spacecraft camera does. Nothing is faked, and
the physics is visible in the interface rather than hidden behind a magic
constant.

Two deliberate departures, both documented in the app and both switchable:

1. **Star brightness is held constant** relative to the exposure, rather than
   scaling with it. Otherwise the star field would be invisible at Mercury and
   blinding at Neptune. Real spacecraft have exactly this problem and solve it
   with two exposures; we cannot, so we choose. *Physical star brightness* turns
   the compromise off.
2. **Sub-pixel bodies are drawn twice.** Once physically — the reflected flux
   spread over a point-spread function, continuous with the resolved shading so
   nothing jumps as a body crosses the one-pixel threshold — and once as a
   "beacon" scaled to the same artistic units as the star field, so a planet 40
   au away reads at the apparent magnitude it really has instead of vanishing.
   The conversion constant is 10^(0.4 × 26.74) times the star-map gain, because
   26.74 is the Sun's apparent magnitude at 1 au, which is the zero point of our
   irradiance unit.

## The data layer

A visualisation built on a dozen third-party services will, on any given day, be
showing a mixture of live data, cached data, and data baked in weeks ago. The
architecture takes that as a premise rather than an edge case.

Every request degrades in a fixed order:

```
live  ──▶  cache (fresh)  ──▶  cache (stale)  ──▶  snapshot committed by CI
```

and records which one it landed on. The **Data Health** panel shows, per API,
where the number on screen came from and how old it is. A chart of "current"
solar flares that is actually a fortnight old is worse than no chart.

Three specific pressures shaped this:

- **`DEMO_KEY` allows 30 requests an hour, shared per IP address.** A public page
  burns that in seconds. So: aggressive persistent caching, in-flight
  de-duplication, and the remaining quota read from `X-RateLimit-Remaining`
  (which api.nasa.gov helpfully exposes via `Access-Control-Expose-Headers`) and
  surfaced before the user hits a wall.
- **Five healthy services block browser access entirely.** They are fetched
  nightly by GitHub Actions and committed as JSON. That is the only way to show
  them at all — and it doubles as the fallback for everything else.
- **Services go down and get retired.** During development the api.nasa.gov
  DONKI mirror answered 502/503 for hours, and two APIs were found to have been
  removed outright. The registry records the status and the reason for every
  one, and the interface explains an absence rather than showing an empty panel.

## High-resolution export

Two problems stand between a browser and an 8K still, and they need different
solutions.

**The GPU cannot render 7680 × 4320 in one pass** on most hardware. So the image
is rendered in tiles, with each tile's rays generated in the coordinate space of
the *full* image — the shader takes a tile origin and size, and the projection is
otherwise untouched, so the pieces join exactly.

Three things had to be got right for that to be seamless:

1. **Exposure is frozen** for the duration. Half an export at one exposure and
   half at another is a seam down the middle.
2. **Lens effects are computed from the full-image centre.** Vignette and
   chromatic aberration are functions of position within the *picture*, not
   within the tile. Getting this wrong is invisible on screen, where there is
   only ever one tile, and puts a cross of hard seams through every export.
3. **Tiles are rendered with a margin and cropped.** Bloom gathers light from a
   wide neighbourhood; with no overlap, each tile's pyramid sees a hard black
   edge where its neighbour should be. Ninety-six pixels of margin costs a few
   per cent and removes the artefact.

**The browser cannot allocate a 7680 × 4320 canvas.** Every browser caps total
canvas area — Safari most aggressively — and one over the limit silently
produces a blank bitmap rather than throwing. So the PNG is encoded directly
from the pixel bytes: filtered scanlines, `CompressionStream('deflate')` for the
zlib stream PNG's IDAT chunk requires, and a hand-written CRC-32. The pixels
never live in a canvas.

JPEG and WebP do need a canvas, so the interface measures the real limit
(allocate, draw one pixel, read it back) and says plainly when a size is out of
reach, rather than failing mysteriously.

## Video capture

`MediaRecorder` cannot produce MP4 everywhere. Safari does MP4 and nothing else;
Chrome and Edge do both; Firefox does WebM only. So the recorder probes
`MediaRecorder.isTypeSupported` at run time, prefers MP4 where it is genuinely
available, and otherwise records WebM — which every modern browser plays, every
editor imports, and `ffmpeg -c copy` remuxes to MP4 without re-encoding. The
interface says which one it is using and why.

There are two capture paths. **Live recording** takes what is on screen in real
time via `canvas.captureStream()`, and can mix in the generative soundscape.
**Offline rendering** drives the simulation frame by frame at a fixed timestep,
waits for each frame to reach its sample target, and pushes it with
`requestFrame()` — so a five-second orbit at 60 fps looks identical on a laptop
and a workstation, the laptop just takes longer to produce it.

## Internationalisation

The rule that matters: **no translatable text is ever drawn into WebGL or with
`canvas.fillText`.** Every label is an HTML element positioned over the canvas.

That one decision solves Arabic cursive shaping, Devanagari conjuncts,
per-language font fallback, right-to-left mirroring, text selection and screen
reader access simultaneously — and the same DOM overlay is what keyboard
navigation needs anyway.

Beyond that: catalogues are flat so a missing-key diff is a set comparison;
plurals go through `Intl.PluralRules` because hard-coding `n === 1` is wrong in
six of the ten languages; numbers, dates and units go through `Intl`; and
direction is data, with the stylesheet using logical properties throughout so no
rule needs mirroring by hand.

`tools/validate-locales.mjs` runs in CI and fails on a missing key, a stray key,
a placeholder mismatch, or an incomplete set of CLDR plural categories. It has
already caught a real one: modern ICU adds a `many` category to Spanish, French
and Portuguese that older tables do not have.

## Module map

| Module | Purpose |
|---|---|
| `astro/constants.js` | Physical and astronomical constants, exact as published |
| `astro/time.js` | Julian dates, sidereal time, the simulation clock |
| `astro/kepler.js` | Kepler solver, elements to state vectors, orbit sampling |
| `astro/planets.js` | Standish element tables, physical parameters, IAU poles, rings |
| `astro/moons.js` | Satellite elements and the equatorial-frame transform |
| `astro/ephemeris.js` | Assembles a complete scene for an instant |
| `astro/stars.js` | Colour science, the star point buffers, and the Milky Way map |
| `render/gl.js` | A small explicit WebGL2 layer — programs, targets, textures |
| `render/camera.js` | Camera model, three navigation modes, projection |
| `render/quality.js` | Quality tiers and the adaptive resolution controller |
| `render/raytracer.js` | Owns every GPU resource and drives the pass chain |
| `render/shaders/*` | GLSL, as JavaScript template strings |
| `render/png.js` | A PNG encoder that never touches a canvas |
| `render/export.js` | Tiled high-resolution stills |
| `render/recorder.js` | Video capture, live and offline |
| `data/registry.js` | The catalogue of services, with access status and notes |
| `data/client.js` | Fetching, caching, de-duplication, degradation, key handling |
| `data/nasa.js` | One adapter per service, returning normalised shapes |
| `data/imagery.js` | GIBS and Trek tile pyramids stitched into textures |
| `data/health.js` | Where every number on screen came from |
| `ui/app.js` | The frame loop, input, and all mutable state |
| `ui/panels.js` | Panel content, as pure functions of state |
| `ui/labels.js` | The DOM label overlay |
| `ui/tours.js` | Scripted camera sequences |
| `ui/i18n.js` | Translation, pluralisation, Intl formatting |
| `ui/dom.js` | Element construction without `innerHTML` |
| `audio/engine.js` | The synthesised soundscape and data sonification |

---

Next: [the science and its limits](science.md) · [the NASA APIs](apis.md) ·
[using the app](user-guide.md)
