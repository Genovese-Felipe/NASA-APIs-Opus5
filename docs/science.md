# The science, and where it stops

What is computed, from what, and how accurate it is. Where the model departs
from physics, this says so.

- [Where the planets are](#where-the-planets-are)
- [Where the moons are](#where-the-moons-are)
- [Which way up everything is](#which-way-up-everything-is)
- [How the light works](#how-the-light-works)
- [Atmospheres](#atmospheres)
- [Rings](#rings)
- [Shadows and eclipses](#shadows-and-eclipses)
- [The stars](#the-stars)
- [Known departures from physics](#known-departures-from-physics)
- [What is not modelled](#what-is-not-modelled)

---

## Where the planets are

Positions come from the Keplerian elements and rates published by JPL in
*Approximate Positions of the Planets*, following the procedure exactly:
propagate the six elements linearly in time, derive the argument of perihelion
and the mean anomaly, wrap the mean anomaly to ±180°, solve Kepler's equation,
and rotate the in-plane vector into the J2000 ecliptic.

Two element sets are used, and the application picks by date: the 1800–2050 fit,
which is more accurate, and the 3000 BC – AD 3000 fit, which includes additional
mean-anomaly correction terms for Jupiter through Neptune.

**Measured accuracy**, against state vectors retrieved from JPL Horizons for
2026-08-04:

| Body | Offset | JPL's published limit |
|---|---|---|
| Mercury | 11″ | 15″ |
| Venus | 8″ | 20″ |
| Earth | 10″ | 20″ |
| Mars | 47″ | 40″ |
| Jupiter | 114″ | 400″ |
| Saturn | 266″ | 600″ |
| Uranus | 61″ | 50″ |
| Neptune | 34″ | 10″ |
| Pluto | 35″ | not published |

For scale: the Moon is about 1,800″ across. Every planet here is placed to well
within a lunar diameter, and most to a small fraction of one.

The unit test suite asserts these bounds on every run, so a regression in the
solver cannot pass unnoticed.

### The Earth–Moon barycentre

JPL's table gives the position of the Earth/Moon **barycentre**, not of the
Earth. The two differ by up to 4,700 km — about 6″ as seen from the Sun. The
model splits them properly:

```
Earth = EMB − μ·r        Moon = EMB + (1−μ)·r        μ = m_moon / (m_earth + m_moon)
```

which is why Earth's residual above is 10″ rather than 13″.

### Pluto

Pluto was removed from JPL's modern table when it was reclassified. The
classical 1992 row is retained so that Pluto can be shown at all, and its
accuracy is noticeably worse than the eight planets'. The interface labels it
approximate.

## Where the moons are

Satellite positions use JPL's *Planetary Satellite Mean Elements*. JPL is
explicit that these are least-squares fits of a precessing ellipse, intended to
describe orbit shape and orientation rather than to generate precision
ephemerides.

That is the right tool for this job — the question here is "where is Titan in
its orbit and how is that orbit oriented", not "where do I point an antenna" —
but the error grows over decades, and the interface says so.

**The reference frame matters.** Regular satellites are tabulated with respect to
their planet's equator (more precisely its local Laplace plane), not the
ecliptic. The model builds each satellite's position in the parent's equatorial
frame and then rotates it by the parent's IAU pole. This is why:

- the Uranian moons orbit almost vertically, following Uranus's 98° tilt;
- Triton is visibly retrograde, at 157° inclination;
- the Galilean moons lie in a plane that is *not* the ecliptic.

Earth's Moon is the exception: its orbit is referenced to the ecliptic, which is
both how it is tabulated and how it physically behaves.

**Every satellite is validated against physics**, not just against its source:
`tools/validate-data.mjs` checks that each one lies inside its planet's Hill
sphere (or the Sun would take it) and outside the rigid Roche limit (or tides
would pull it apart), and that its stated period matches Kepler's third law
computed from the *sum* of the two masses.

That last detail is not pedantry. Charon is 12 per cent of Pluto's mass, so
using Pluto's mass alone puts the period out by six per cent — enough to make a
correct catalogue look wrong.

The same check flags something real: **Phobos orbits inside Mars's fluid Roche
limit** and survives only because it is a solid object with material strength.
It is visibly stressed — the grooves across its surface are believed to be
stress fractures — and is expected to break up in a few tens of millions of
years.

## Which way up everything is

Axial orientation uses the rotational elements from the IAU Working Group on
Cartographic Coordinates and Rotational Elements (2015 report): pole right
ascension and declination with their per-century drift, and the prime meridian
angle with its rate.

This is what produces, for free:

- **Saturn's rings opening and closing** over its 29-year year, edge-on twice
  per orbit;
- **Uranus rolling rather than spinning**, with its moons following;
- **Venus rotating backwards**, slowly, at −243 days;
- **correct rotation phase**, so a given face is towards the Sun when it should
  be.

The data validator cross-checks the sign of each rotation period against the
body's obliquity: a retrograde rotation and an obliquity above 90° must agree,
and disagreement is an error.

## How the light works

Solar irradiance follows the inverse-square law, normalised so that the value at
one astronomical unit is exactly 1.0:

```
E(d) = (1 au / d)²
```

Neptune therefore receives 1/900 of Earth's sunlight, and looks it. The exposure
control compensates by exactly that factor — which is what a spacecraft camera
does — so the physics stays intact and visible rather than being hidden behind a
constant.

Surfaces use **Oren–Nayar** diffuse reflectance rather than Lambert. Regolith is
rough enough that Lambert visibly fails: it makes the full Moon look like a flat
disc rather than a shaded ball, and only a rough-surface model reproduces the
real appearance.

The implementation avoids `acos` and `tan` entirely. The textbook formulation is
numerically hostile in exactly the place it matters most — `acos` has infinite
derivative at 1, so near the centre of a lit disc the quantisation of N·V is
amplified into visible steps, and because N·V depends only on the impact
parameter those steps appear as concentric rings. Rewriting the trigonometry in
terms of the cosines already to hand removes the problem completely.

Water gets a **GGX specular** lobe, detected from the imagery: water is the only
strongly blue-dominant, dark surface on any body we have pictures of. That is
what gives Earth its sun glint.

**Planetshine** is modelled as a spherical area light, which is why the Moon's
night side is lit by Earth rather than by flat ambient. **Ringshine** does the
same for Saturn: the sunlit rings hang overhead and light the night side, with a
strength that falls with latitude, which is the shape the real effect has.

## Atmospheres

Single-scattering Rayleigh and Mie integration through a spherical shell,
following Nishita's method: march along the view ray inside the atmosphere, and
at each step evaluate the optical depth back towards the Sun with a short
secondary march.

Two things make it look right rather than merely blue:

1. **The shell is intersected analytically**, so the limb is razor sharp.
2. **The sun-ward march terminates when the sample is in the planet's own
   shadow**, which is what produces the red sunset ring seen during a lunar
   eclipse.

The scattering coefficients are the tabulated physical values, used verbatim.
The standard figures are quoted in units of 10⁻⁶ m⁻¹, which convert to "per
megametre" with a factor of exactly 1 — so Earth's 5.8 / 13.5 / 33.1 at
680/550/440 nm are the numbers in the code, and with an 8.5 km scale height they
give the correct vertical optical depth of about 0.11.

Scale heights are real, per body:

| Body | Scale height | Shell thickness |
|---|---|---|
| Earth | 8.5 km | 100 km |
| Mars | 11.1 km | 119 km |
| Venus | 15.9 km | 182 km |
| Titan | 21 km | 257 km |
| Jupiter | 27 km | 715 km |
| Saturn | 59.5 km | 783 km |
| Uranus | 27.7 km | 358 km |
| Neptune | 19.7 km | 272 km |

The data validator checks that each shell is between 3 and 30 scale heights —
below that the limb is wrong, above it is wasted marching.

Aerosols use the **Henyey–Greenstein** phase function with g = 0.76, the classic
haze value, which is what makes Titan orange and gives Earth its forward-scatter
glow near the terminator.

## Rings

Ring geometry is real, in kilometres from the planet's centre, including every
named band and gap. Saturn's Cassini Division is at 117,580–122,170 km because
that is where it is.

The radial profile is baked into a lookup texture at startup, and rays intersect
the ring plane analytically. Four effects are modelled:

- **Ring shadow on the planet** — a ray from each surface point towards the Sun,
  tested against the ring annulus. This is the dark band across Saturn's cloud
  tops, and it collapses to a line at equinox because the geometry says so.
- **Planet shadow on the rings** — the same occlusion test, the other way round.
- **Forward and back scattering** — ring particles scatter strongly forward, so
  the rings glow when you look towards the Sun through them and are dull when
  you look away.
- **Grazing opacity** — a ring seen edge-on is optically thicker, following
  `1 − (1−α)^(1/cos θ)`.

The fine-scale density structure is faded out analytically as it approaches the
Nyquist limit, using the screen-space derivative of the radial coordinate. Real
rings are structured at every scale, but a 1900-cycle modulation aliases into
vicious moiré the moment a pixel spans more than half a cycle.

## Shadows and eclipses

Shadows are ray-traced occlusion queries, so an eclipse is not a special case —
it is the general case, seen from a particular place.

The penumbra is **analytic rather than sampled**. For a spherical occluder lit by
a spherical light, the visible fraction of the light is the overlap area of two
discs on the sky, which has a closed form. That gives a perfectly smooth
penumbra from a single evaluation, handles the annular case where a small
occluder sits inside a larger light disc, and is exact.

The consequence: umbra and penumbra have physically correct widths. The Sun
subtends about 0.53° from Earth, the Moon about the same, and the Moon's shadow
cone narrows to a point almost exactly at Earth's surface — which is why total
solar eclipses are both possible and rare, and why the model shows that without
being told.

## The stars

8,751 real stars from the Bright Star Catalogue, at their J2000 positions,
rendered into an equirectangular HDR map that the ray tracer samples whenever a
ray escapes the scene. Because it is sampled in the miss branch, stars are
occluded by planets automatically and participate in bloom exactly like any
other light source — no separate pass, no depth sorting.

**Colour is computed, not assigned.** Each star's B–V index gives an effective
temperature via the Ballesteros (2012) relation:

```
T = 4600 K × ( 1/(0.92·BV + 1.70) + 1/(0.92·BV + 0.62) )
```

and the temperature gives a colour from a Planckian-locus fit. Betelgeuse is red
because it is 3,600 K. Rigel is blue because it is 12,000 K.

**Brightness follows Pogson's ratio**, so the magnitude differences on screen are
the real ones, compressed only by the tone mapper.

The Milky Way is procedural, but correctly placed: the band lies on the true
galactic equator (north galactic pole at RA 12ʰ51ᵐ26ˢ, Dec +27°07′42″), with a
bulge centred on the galactic centre so the Sagittarius region is brightest, and
dust lanes carved by a second noise field.

Proper motion is not applied — positions are as of epoch J2000. Over the app's
±1000-year range the fastest stars move by a few arcminutes.

## Known departures from physics

Both are documented in the interface and both can be switched off.

**1. Star brightness is held constant relative to exposure.**

The honest version would make the star field invisible at Mercury and blinding
at Neptune, because the exposure varies by a factor of 1,600 across the system.
Real spacecraft have exactly this problem and solve it by taking two exposures;
we cannot, so the stars are pinned to a constant apparent brightness. *Physical
star brightness* in the settings turns the compromise off.

**2. Sub-pixel bodies get a magnitude-matched "beacon".**

A body smaller than a pixel still delivers real flux — that is why Jupiter is a
bright star in the evening sky — and the physical term for that is always
present and continuous with the resolved shading. But at 40 au the physical
value is far below what any exposure would show, so a second term scaled to the
same artistic units as the star field is added, calibrated so a planet reads at
the apparent magnitude it really has. It is capped, because the Sun seen from 40
au is magnitude −18 and would otherwise overflow the render target.

Beyond those two, the *appearance* controls — bloom, vignette, chromatic
aberration, film grain, tone-mapping curve — are photographic choices, not
physics, and all default to modest values that can be set to zero.

## What is not modelled

Stated plainly, because a model that does not say what it leaves out is making a
claim it cannot support.

- **Perturbations.** Every orbit is a two-body Keplerian ellipse. No planetary
  perturbations, no relativistic precession, no non-spherical gravity. This is
  the dominant source of positional error.
- **Light-time correction.** Bodies are drawn where they *are*, not where they
  *appear* from the camera. For Neptune that is a four-hour difference. The
  panel reports light travel time so the discrepancy is at least visible.
- **Aberration and refraction.** Neither is applied.
- **Multiple scattering** in atmospheres. Single scattering only, which is why
  a very thick atmosphere like Venus's is approximated rather than solved.
- **Global illumination.** Planetshine and ringshine are analytic area-light
  approximations, not path-traced bounces.
- **Ring self-shadowing** between particles.
- **Non-spherical small bodies.** Phobos, Deimos and the asteroids are drawn as
  spheres. They are emphatically not spheres.
- **Surface topography.** Elevation is a bump-mapping effect on the shading
  normal, not real displacement. A mountain does not break the limb.
- **Atmospheric dynamics.** Gas-giant bands are procedural noise with a plausible
  zonal structure. They are not a fluid simulation, and the Great Red Spot is
  not where the Great Red Spot is.

---

Next: [architecture](architecture.md) · [the NASA APIs](apis.md) ·
[using the app](user-guide.md)
