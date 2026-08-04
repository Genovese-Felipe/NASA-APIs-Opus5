# Data sources and credits

Every number, every image and every position in this application comes from a
public source. This document lists all of them, states what each is used for,
and records the terms.

If you find an error here, that is a bug — please
[open an issue](https://github.com/Genovese-Felipe/NASA-APIs-Opus5/issues).

---

## Contents

- [Orbital and physical data](#orbital-and-physical-data)
- [Star catalogue and constellations](#star-catalogue-and-constellations)
- [NASA services used at run time](#nasa-services-used-at-run-time)
- [NASA services fetched by CI](#nasa-services-fetched-by-ci)
- [Services that no longer work](#services-that-no-longer-work)
- [Imagery](#imagery)
- [Terms of use](#terms-of-use)
- [What is *not* from NASA](#what-is-not-from-nasa)

---

## Orbital and physical data

### Planetary positions

**Source:** E. M. Standish and J. G. Williams (1992), *Approximate Positions of
the Planets*, published by the Jet Propulsion Laboratory Solar System Dynamics
group.
<https://ssd.jpl.nasa.gov/planets/approx_pos.html>

Two element sets are transcribed verbatim into
[`src/astro/planets.js`](src/astro/planets.js): the higher-accuracy fit valid
1800–2050, and the wide fit valid 3000 BC – AD 3000 with the additional
mean-anomaly correction terms for Jupiter through Neptune. The application
switches between them by date.

Pluto is not in the modern table — it was removed when Pluto was reclassified —
so the classical 1992 row is retained, and its position is markedly less
accurate than the eight planets'.

**Verification:** the unit test suite checks all nine bodies against state
vectors retrieved from the JPL Horizons system for 2026-08-04, and fails if any
drifts outside the accuracy JPL publishes for the method.

### Planetary physical parameters

**Source:** JPL Solar System Dynamics, *Planetary Physical Parameters*.
<https://ssd.jpl.nasa.gov/planets/phys_par.html>

Equatorial radius, mean radius, mass, bulk density, sidereal rotation period,
sidereal orbital period and geometric albedo. Transcribed rather than rounded.

The NSSDC planetary fact sheets, which many projects cite, now redirect to
`nasa.gov` and no longer serve the tables; the JPL source above is the live one.

### Rotational elements

**Source:** B. A. Archinal *et al.*, *Report of the IAU Working Group on
Cartographic Coordinates and Rotational Elements: 2015*, Celestial Mechanics and
Dynamical Astronomy (2018).

Pole right ascension and declination, their per-century drift, and the prime
meridian angle and rate. These are what give each world its correct axial tilt
and rotation phase — and therefore why Saturn's rings open and close over its
29-year year, and why Uranus rolls rather than spins.

### Satellite orbits

**Source:** JPL Solar System Dynamics, *Planetary Satellite Mean Elements*.
<https://ssd.jpl.nasa.gov/sats/elem/>

JPL is explicit that these are least-squares fits of a precessing ellipse,
intended to describe orbit *shape and orientation* rather than to generate
precision ephemerides — which is exactly the use here. Positional error grows
over decades, and the interface marks satellite positions as approximate.

Regular satellites are tabulated with respect to their planet's equator, not the
ecliptic, and are modelled that way. That is why the Uranian system correctly
appears to orbit sideways and why Triton is visibly retrograde.

### Satellite physical parameters

**Source:** JPL Solar System Dynamics, *Planetary Satellite Physical
Parameters*. <https://ssd.jpl.nasa.gov/sats/phys_par/>

### Ring systems

**Source:** NASA Planetary Data System Ring-Moon Systems Node, and the ring
nomenclature established by the Cassini mission.

Inner and outer radii in kilometres for every named band of Jupiter, Saturn,
Uranus and Neptune, including the Cassini Division at its true 117,580–122,170 km.

### Constants

Astronomical unit (IAU 2012, exact), speed of light (exact by definition of the
metre), heliocentric gravitational constant and nominal solar radius,
luminosity and effective temperature (IAU 2015 nominal values).

---

## Star catalogue and constellations

### Stars

**Source:** D. Hoffleit and W. H. Warren Jr. (1991), *Bright Star Catalogue,
5th Revised Edition*, retrieved as VizieR catalogue V/50 from the Centre de
Données astronomiques de Strasbourg.
<https://cdsarc.cds.unistra.fr/viz-bin/cat/V/50>

8,751 stars brighter than magnitude 6.6, with J2000 right ascension and
declination, visual magnitude and B–V colour index. Colour is derived from B–V
via the Ballesteros (2012) temperature relation and a Planckian-locus fit, so
the colours on screen are the stars' real colours.

Proper motion is not applied: positions are as of epoch J2000.

Regenerate with `node tools/build-star-catalogue.mjs`.

VizieR is operated by CDS; please see their
[acknowledgement policy](https://cds.unistra.fr/vizier-org/licences_vizier.html).

### Constellation figures

**Source:** [d3-celestial](https://github.com/ofrohn/d3-celestial) by Olaf
Frohn, BSD-3-Clause. The `constellations.lines.json` dataset, converted to plain
right ascension and declination.

---

## NASA services used at run time

These send a usable `Access-Control-Allow-Origin` header, so the page fetches
them directly. Each was probed live before being relied on.

| Service | Key | What it provides |
|---|---|---|
| [APOD](https://api.nasa.gov/#apod) | yes | Astronomy Picture of the Day, with its explanation |
| [Asteroids NeoWs](https://api.nasa.gov/#NeoWS) | yes | Near-Earth object approaches, with full Keplerian elements — enough to draw the real orbit |
| [EPIC](https://api.nasa.gov/#epic) | yes | DSCOVR's full-disc view of Earth from the Sun–Earth L1 point |
| [EONET v3](https://eonet.gsfc.nasa.gov/docs/v3) | no | Wildfires, volcanoes, storms and icebergs, as they happen |
| [DONKI](https://ccmc.gsfc.nasa.gov/tools/DONKI/) | no | Solar flares, coronal mass ejections, geomagnetic storms |
| [Image and Video Library](https://api.nasa.gov/#NASAIVL) | no | The full public NASA media archive |
| [GIBS](https://nasa-gibs.github.io/gibs-api-docs/) | no | A thousand daily-updated global satellite layers |
| [Trek WMTS](https://trek.nasa.gov/) | no | Photographic basemaps of the Moon, Mars and Mercury |
| [POWER](https://power.larc.nasa.gov/docs/services/api/) | no | Forty years of surface meteorology and solar reanalysis |
| [Satellite Situation Center](https://sscweb.gsfc.nasa.gov/WebServices/REST/) | no | Geocentric ephemeris for hundreds of spacecraft |
| [TLE API](https://tle.ivanstanojevic.me/) | no | Current two-line elements, refreshed daily from CelesTrak |

**Operational notes recorded during development, because each cost real time:**

- **DONKI is fetched from `kauai.ccmc.gsfc.nasa.gov`, not from `api.nasa.gov`.**
  The `api.nasa.gov/DONKI/*` mirror returned 502 and 503 continuously over an
  extended period, on every sub-endpoint. The CCMC origin it proxies is healthy,
  serves the identical dataset, needs no key, and sends
  `Access-Control-Allow-Origin: *`.
- **EONET sometimes labels JSON as `application/rss+xml`.** Never branch on the
  content type; always parse as JSON.
- **The TLE API requires a trailing slash.** `/api/tle/` works; `/api/tle`
  answers 508 "Resource Limit Is Reached".
- **The Trek URLs in the official documentation are dead.** The documented
  `moontrek.jpl.nasa.gov` host answers 502, and the `api.nasa.gov` tile paths
  404. Only `trek.nasa.gov/tiles/...` serves tiles.
- **EPIC's `/natural/images` answers 302** to `epic.gsfc.nasa.gov`; use
  `/natural/all` or `/natural/date/{date}`.
- **The Satellite Situation Center defaults to XML.** JSON works, but only if
  the request asks for it with an `Accept` header.

**Rate limits** (from api.nasa.gov's authentication page):

| Key | Per hour | Per day |
|---|---|---|
| `DEMO_KEY` | 30 | 50 |
| Personal key | 1,000 | — |

Both are per IP address, which for `DEMO_KEY` means shared with everyone on your
network. The application caches aggressively, de-duplicates concurrent requests,
reads `X-RateLimit-Remaining` from the response headers, and falls back to
committed snapshots when the quota runs out.

---

## NASA services fetched by CI

These are healthy but send no usable CORS header, so a browser cannot read them
at all. `tools/fetch-snapshots.mjs` fetches them in GitHub Actions and commits
the result to `src/data/snapshots/`, refreshed nightly.

| Service | Why a browser cannot reach it |
|---|---|
| [JPL SSD/CNEOS](https://ssd-api.jpl.nasa.gov/doc/) | No `Access-Control-Allow-Origin` at all; answers 405 to a preflight |
| [NASA Exoplanet Archive](https://exoplanetarchive.ipac.caltech.edu/docs/TAP/usingTAP.html) | No CORS header on the TAP endpoint |
| [TechPort](https://techport.nasa.gov/help/articles/api) | No CORS header |
| [OSDR / GeneLab](https://visualization.osdr.nasa.gov/biodata/api/) | Sends `Access-Control-Allow-Origin: osdr.nasa.gov`, which has no scheme and is therefore not a valid origin — it matches nothing |
| [TechTransfer](https://api.nasa.gov/#techtransfer) | Pins the header to `https://technology.nasa.gov` |

This arrangement has a second benefit: the same snapshots are what the live APIs
fall back to, so a visitor whose `DEMO_KEY` quota is exhausted still sees a fully
populated interface.

---

## Services that no longer work

Documented so nobody re-adds them, and so the interface can explain the absence
rather than showing an empty panel.

| Service | Status |
|---|---|
| **Mars Rover Photos** | Every path answers 404 with a dead-backend page, and the API has been removed from the `api.nasa.gov` manifest. Not an outage. Rover imagery is available instead through the Image and Video Library and the Mars Trek mosaics. |
| **Earth / Landsat imagery** | Connections open and never respond — no status line even after 90 seconds — and it too has been removed from the manifest. GIBS is the healthier, higher-resolution replacement. |

---

## Imagery

Surface imagery is streamed and stitched at run time from tile pyramids. Nothing
is redistributed in this repository.

| World | Layer | Credit |
|---|---|---|
| Earth | `BlueMarble_ShadedRelief_Bathymetry` | NASA GIBS / Blue Marble Next Generation |
| Earth (dated) | `VIIRS_SNPP_CorrectedReflectance_TrueColor` | NASA GIBS / VIIRS SNPP |
| Earth (night) | `VIIRS_Black_Marble` | NASA GIBS / VIIRS Black Marble |
| The Moon | `LRO_WAC_Mosaic_Global_303ppd_v02` | NASA / GSFC / Arizona State University |
| Mars | `Mars_Viking_MDIM21_ClrMosaic_global_232m` | NASA / JPL / USGS |
| Mars (topography) | `Mars_MGS_MOLA_ClrShade_merge_global_463m` | NASA / JPL / GSFC |
| Mercury | `Mercury_MESSENGER_MDIS_Basemap_BDR_Mosaic_Global_166m` | NASA / JHUAPL / Carnegie Institution |

Every other surface — the gas giants, the icy moons, the Sun's photosphere — is
generated procedurally in the shader. Those are *not* attempts to reproduce
specific terrain; they are statistically plausible surfaces built from the right
kind of noise for each class of world, and the documentation says so wherever
they appear.

---

## Terms of use

### NASA material

NASA content — imagery, data, audio and video — is generally **not protected by
copyright** and may be used for educational or informational purposes without
requesting permission. NASA's full guidance is at
<https://www.nasa.gov/nasa-brand-center/images-and-media/>.

Two constraints that apply here and are respected:

1. **The NASA insignia, logotype and seal are protected marks** and may not be
   used without permission. They are not used in this project, anywhere.
2. **NASA does not endorse anything.** This project is not endorsed by,
   affiliated with, or sponsored by NASA or JPL, and does not suggest otherwise.

Some third-party material appears in the NASA archives under separate terms —
the Astronomy Picture of the Day in particular frequently features images by
independent astrophotographers. The application displays the `copyright` field
whenever APOD supplies one, which is the credit those photographers are owed.

### CDS / VizieR

The Bright Star Catalogue is served by the Centre de Données astronomiques de
Strasbourg. See their
[licence and acknowledgement policy](https://cds.unistra.fr/vizier-org/licences_vizier.html).

### d3-celestial

Constellation figures are BSD-3-Clause, © Olaf Frohn.

### This project

The source code is MIT licensed. See [LICENSE](LICENSE).

---

## What is *not* from NASA

For clarity, because a project like this can easily blur the line:

- **The interface, the renderer and all the code** are original work.
- **The procedural surfaces** of the gas giants, the icy moons and the Sun are
  generated by noise functions, not derived from imagery.
- **The soundscape** is synthesised in the browser with the Web Audio API. No
  audio files are shipped and none are downloaded.
- **The editorial text** describing each world is original, written against the
  sources above.
- **The star colours** are computed from published B–V indices, not sampled from
  photographs.

---

*Last verified: every endpoint in this document was probed live during
development, and the CI data-refresh job re-verifies the snapshot sources nightly.*
