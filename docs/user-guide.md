# Using ORRERY

Everything the interface can do, and the reasoning behind the parts that are not
obvious.

- [Getting around](#getting-around)
- [Controlling time](#controlling-time)
- [Reading the panels](#reading-the-panels)
- [The tours](#the-tours)
- [Image quality](#image-quality)
- [Exporting stills](#exporting-stills)
- [Recording video](#recording-video)
- [Sound](#sound)
- [Data health and your API key](#data-health-and-your-api-key)
- [Languages](#languages)
- [Accessibility](#accessibility)
- [Keyboard reference](#keyboard-reference)
- [Troubleshooting](#troubleshooting)

---

## Getting around

**Orbit mode** is the default and is what most people want. Drag to swing the
camera around whatever it is focused on; scroll or pinch to move closer and
further away. Click any world in the 3D view to go there, or pick one from the
list on the left.

Zoom is **logarithmic**, which is the only way a single control can span the
seven orders of magnitude between standing next to Enceladus and taking in the
whole solar system. Each notch multiplies rather than adds.

**Free flight** (press <kbd>F</kbd>) gives you six degrees of freedom:
<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> to move, <kbd>Q</kbd> and
<kbd>E</kbd> for up and down, <kbd>Shift</kbd> to go faster. Speed scales with
how far away the nearest interesting thing is, so the same key feels right
skimming a moon and crossing the Kuiper Belt.

**Field of view** is separate from zoom, and worth playing with. Zoom moves the
camera; field of view changes the perspective. A narrow field of view compresses
depth — the telephoto look — and is how you get Saturn and Titan in the same
frame looking like they belong together.

**Copy a link to this view** puts the camera, the date and the language into a
URL. It restores exactly.

## Controlling time

The transport at the bottom runs from ten years per second backwards to ten
years per second forwards. <kbd>Space</kbd> pauses, the arrow keys step through
the rates, and <kbd>N</kbd> snaps back to this exact instant.

Positions are valid from **3000 BC to AD 3000**, which is the range of the JPL
element fit. Outside it the app clamps rather than extrapolating into nonsense.

Things worth scrubbing time to see:

- **Saturn's rings opening and closing** over its 29-year year. Twice per orbit
  they go edge-on and nearly vanish.
- **The Galilean moons weaving** through their 1:2:4 resonance. Io laps Europa
  exactly twice for every Europa orbit, and Europa laps Ganymede exactly twice.
- **The inner planets lapping the outer ones**, which at a year per second turns
  the orrery into a clock.
- **Uranus's poles taking turns** facing the Sun, 42 years each.

The clock is shown in UTC, with the Julian date beneath it, because that is the
unit the underlying data is in.

## Reading the panels

**Explore** is the focused world: physical data first, then how far away it is
and how old the light from it is, then an essay about what it actually is.
Everything numeric is transcribed from JPL's tables; everything prose is written
against the sources in [DATA-AND-CREDITS](../DATA-AND-CREDITS.md).

**Live data** pulls from NASA services in real time: the Picture of the Day,
near-Earth objects approaching this week, solar flares over the past month,
natural events on Earth, the impact-risk watch list and the exoplanet catalogue.
Each block carries a small badge saying whether what you are looking at came
from the network just now, from your browser's cache, or from a snapshot.

**Tours** are described below.

**Capture** is stills and video.

**Settings** has image quality, the look controls, layer toggles, sound and
accessibility.

## The tours

Five guided sequences. Each one makes a specific point that is easier to see
than to explain.

| Tour | What it is for |
|---|---|
| **The Grand Tour** | Eleven stops from the Sun to the Kuiper Belt |
| **Reading the Rings** | Why Saturn's rings have gaps, and what casts the shadow across them |
| **The Geometry of Eclipses** | Umbra, penumbra, and why a total eclipse is a coincidence |
| **The Problem of Scale** | Why every picture of the solar system you have seen is a lie |
| **How Old Is This Light?** | Nothing you see out here is happening now |

A tour advances on a timer, but the moment you touch the camera it stops
advancing and waits. Nothing here will fight you for control. Use **Next** when
you are ready.

## Image quality

Five presets, from **Minimum** to **Ultra**. The app picks one at startup from
what it can see of your device and errs on the low side: it is better to start
at Balanced and climb than to open at Ultra and stutter.

**Adapt to keep the frame rate** watches a rolling median of frame times and
nudges the render resolution to hold 60 fps. A median rather than a mean,
because one 200 ms hitch from a texture upload should not collapse the
resolution.

The thing worth knowing: **hold the camera still and the image keeps getting
better.** Each frame adds another sub-pixel sample to a running average, so noise
and aliasing melt away over a second or two. The readout at the bottom right
tells you how many samples have accumulated and when it has converged. This is
why a screenshot taken after a moment's pause looks dramatically better than one
taken mid-drag.

### The look controls

These are photographic, not physical, and every one can go to zero.

| Control | What it does |
|---|---|
| **Exposure** | Overall brightness. Automatic by default, tracking the focused world's distance from the Sun. |
| **Tone mapping** | AgX desaturates highlights gracefully; ACES is punchier and more cinematic; Reinhard is gentlest; Linear is for reading values rather than looking at pictures. |
| **Bloom** | Glare around bright sources. |
| **Diffraction spikes** | The six-pointed star a telescope's secondary support produces. |
| **Vignette, chromatic aberration, film grain** | Lens character. |
| **Night-side fill** | A little light on the dark side, as a fraction of the local sunlight. Set to zero for the honest version. |

Two switches change the *physics* rather than the look, and both are explained
in place:

- **Physically correct brightness.** On by default. Turn it off to flatten the
  inverse-square falloff and light every world equally, which is useful for
  comparison and dishonest as a picture.
- **Physical star brightness.** Off by default. Turn it on and the star field
  scales with exposure as it really would — invisible at Mercury, blinding at
  Neptune.

## Exporting stills

Sizes from your window up to **8K (7680 × 4320)**, plus square and print
formats.

**Samples per pixel** is the quality control. The interactive view uses a few
dozen; an export can use hundreds. More samples means a cleaner image and a
longer wait, and the progress bar tells you which tile it is on.

**PNG works at every size.** JPEG and WebP are limited by your browser's canvas
size cap, which the app measures and reports rather than failing mysteriously —
so if 8K JPEG is not available, it says so and tells you PNG has no such limit.

Large images are rendered in tiles and stitched. You never see a seam: the
exposure is frozen for the duration, lens effects are computed from the centre
of the whole picture rather than of each tile, and every tile is rendered with a
margin that is then cropped away so bloom sees its neighbours.

Every PNG carries the simulated date in its metadata, so a picture is
reproducible.

## Recording video

**Live recording** captures what is on screen in real time, optionally with the
soundscape mixed in.

**Record a full orbit** is the better tool for anything you want to keep. It
renders one complete revolution around the focused world frame by frame, waiting
for each frame to reach its sample target before moving on. The result is
perfectly smooth at the chosen frame rate *regardless of how fast your machine
is* — a slow laptop just takes longer to produce the same file.

### About MP4

`MediaRecorder`, the browser API this uses, cannot produce MP4 everywhere:

| Browser | What it can record |
|---|---|
| Safari | MP4 (H.264) |
| Chrome, Edge | MP4 (H.264) and WebM |
| Firefox | WebM only |

The app checks at run time, uses MP4 where it genuinely works, and otherwise
records WebM — which every modern browser plays, every video editor imports, and
which converts to MP4 **without re-encoding**:

```bash
ffmpeg -i orrery-2026-08-04.webm -c copy orrery.mp4
```

The interface says which format it is about to use, and why, before you press
record.

## Sound

Everything you hear is synthesised in the browser. No audio files are shipped or
downloaded — which means no licensing ambiguity, no download, and a soundscape
that responds continuously rather than looping.

The ambience follows the camera: the drone's fundamental drops as you travel
outward, its brightness follows the local sunlight, and the noise bed thickens
inside an atmosphere.

**Data sonification** turns a series into pitch and rhythm. Solar flare
intensities become a melody whose peaks you can hear coming — mapped to a minor
pentatonic scale, which keeps a fast series listenable rather than atonal.

Browsers require a click before any audio can start; the app will prompt once.

## Data health and your API key

Open the **Live data** button in the header for a full report: every service,
whether the number on screen came from the network, your cache or a committed
snapshot, and how old it is.

The reason this exists: a chart of "current" solar flares that is quietly a
fortnight old is worse than no chart.

### The DEMO_KEY problem

Out of the box the app uses NASA's shared `DEMO_KEY`, which allows **30 requests
an hour and 50 a day, per IP address** — shared with everyone else on your
network. That is not much.

The app works hard to stay inside it: aggressive caching, de-duplicated
requests, and a fallback to snapshots when the quota is gone. But if you are
going to use this seriously, [get a free personal key](https://api.nasa.gov/#signUp)
— it takes about a minute and raises the limit to 1,000 an hour.

Paste it into the Data Health panel. It is stored **only in your browser**, is
sent **only to `api.nasa.gov`**, and is redacted from every error message the
app can produce.

## Languages

Ten: English, 简体中文, Português (Brasil), Español, 한국어, Français, 日本語,
Deutsch, Русский and العربية. The picker is the 文A button in the header.

Arabic switches the entire interface to right-to-left.

Your choice is remembered, and a shared link carries the language with it —
`?lang=ja` opens in Japanese.

Numbers, dates and units follow the locale: a German reader sees `1.234,5 km`,
an English reader `1,234.5 km`.

## Accessibility

- **Skip link** to the controls, first in the tab order.
- **The canvas is labelled and described**, and everything in it is also
  available as text in the panels.
- **A live region announces** every change of focus, with the world's name, kind
  and distance.
- **Full keyboard operation.** Nothing requires a mouse.
- **Reduce motion** removes camera easing, automatic orbiting and transitions.
  It also follows your system setting automatically.
- **High contrast** makes the panels opaque and lifts every text colour.
- **Larger text** scales the whole interface.
- **Photosensitivity**: the star field is bright and bloom is a glare effect. If
  that is a concern, set Bloom and Diffraction spikes to zero and enable Reduce
  motion. There is a note to this effect next to the controls.

## Keyboard reference

| Key | Action |
|---|---|
| drag | Orbit the camera |
| scroll / pinch | Zoom |
| <kbd>↑</kbd> <kbd>↓</kbd> | Previous / next world |
| <kbd>Space</kbd> | Play or pause time |
| <kbd>→</kbd> <kbd>←</kbd> | Speed time up / slow it down |
| <kbd>N</kbd> | Jump to now |
| <kbd>F</kbd> | Toggle free flight |
| <kbd>W A S D</kbd> <kbd>Q</kbd> <kbd>E</kbd> | Fly (in free flight) |
| <kbd>Shift</kbd> | Boost |
| <kbd>O</kbd> | Orbit paths on/off |
| <kbd>L</kbd> | Labels on/off |
| <kbd>H</kbd> | Hide the interface |
| <kbd>P</kbd> | Open the capture panel |
| <kbd>/</kbd> | Search |
| <kbd>?</kbd> | This list |
| <kbd>Alt</kbd>+<kbd>Enter</kbd> | Full screen |

## Troubleshooting

**"This browser cannot start WebGL2."**
The renderer needs WebGL2, which every major browser has had since 2021. Check
that hardware acceleration is enabled — in Chrome, `chrome://settings/system`.
Visit [get.webgl.org/webgl2](https://get.webgl.org/webgl2/) to confirm.

**It runs, but slowly.**
Drop the quality preset, or leave *Adapt to keep the frame rate* on and let it
find its own level. On integrated graphics, Low or Minimum is the right choice
and still looks good once the image has converged.

**Panels say "Snapshot" instead of "Live".**
Either a service is down, or the `DEMO_KEY` quota is exhausted. Both are
expected; the app is designed to keep working. A personal key fixes the second
case.

**Earth has craters.**
The surface imagery could not be fetched, so the procedural fallback is being
used — and the fallback is a generic rocky surface. Check your connection, or
your ad blocker, which sometimes blocks `gibs.earthdata.nasa.gov`.

**The image is noisy.**
It is still converging. Stop moving the camera for a second.

**Video recording produced nothing.**
Some browsers report a codec as supported but ship no encoder. Try a different
container in the capture panel, or use a different browser; the format the app
will actually use is shown before you press record.

---

Next: [architecture](architecture.md) · [the science](science.md) ·
[the NASA APIs](apis.md)
