/**
 * Editorial content: what each world actually is, and why it is interesting.
 *
 * Separate from the interface catalogue because it is prose rather than labels,
 * it changes for different reasons, and it is much longer. Every factual claim
 * here is checkable against the sources listed in DATA-AND-CREDITS.md.
 *
 * Voice: confident, specific, never breathless. Prefer a real number to an
 * adjective. Assume the reader is intelligent and knows nothing.
 *
 * @module ui/content/en
 */
export default {
  sun: {
    blurb: 'A middling star, and the reason for everything else here.',
    body: [
      'The Sun holds 99.86 per cent of the mass of the solar system. Everything else — every planet, moon, asteroid and comet — is a rounding error orbiting the remainder.',
      'Its surface is not a surface. The photosphere is simply the depth at which the plasma becomes transparent enough for light to escape, about 5,772 K and boiling with convection cells the size of Texas. Above it the temperature does something no one fully expected: it rises, reaching two million kelvin in the corona, hundreds of times hotter than the surface beneath it.',
      'Light leaving it takes 8 minutes and 19 seconds to reach Earth. The energy carried in that light was made in the core around a hundred thousand years earlier, and spent all that time scattering its way out.',
    ],
    fact: 'The Sun loses about 4.3 million tonnes of mass every second, converted into the light you are looking at.',
    missions: ['Parker Solar Probe', 'Solar Orbiter', 'SOHO', 'Solar Dynamics Observatory'],
  },

  mercury: {
    blurb: 'Small, scorched, and locked in a 3:2 dance with its own year.',
    body: [
      'Mercury turns exactly three times for every two orbits it makes. That resonance means a solar day there — noon to noon — lasts 176 Earth days, two full Mercurian years.',
      'It has almost no atmosphere to move heat around, so the difference between the day and night sides is around 600 °C, the largest of any planet. And yet radar has found water ice sitting in craters at its poles, in shadows that have not seen sunlight for billions of years.',
      'Its core is enormous: roughly 85 per cent of the planet\'s radius, against Earth\'s 55 per cent. Something stripped away most of its rocky mantle, and we still argue about what.',
    ],
    fact: 'Mercury is the planet closest to Earth on average — and to every other planet — because it never strays far from the Sun.',
    missions: ['Mariner 10', 'MESSENGER', 'BepiColombo'],
  },

  venus: {
    blurb: "Earth's twin, if Earth had gone catastrophically wrong.",
    body: [
      'Venus is the same size and made of much the same stuff as Earth. It is also 464 °C at the surface, hot enough to melt lead, under 92 atmospheres of carbon dioxide — the pressure a kilometre down in our oceans.',
      'A runaway greenhouse did this. Whatever water Venus had evaporated, the vapour trapped more heat, and the cycle ran to completion. The surface is young, geologically speaking, and appears to have been resurfaced wholesale a few hundred million years ago.',
      'It turns backwards, and slowly: one rotation takes 243 Earth days, longer than its 225-day year. The clouds above, though, race around the planet every four days — a phenomenon called superrotation that we still do not fully explain.',
    ],
    fact: 'Standing on Venus you would be simultaneously crushed, roasted, suffocated, and dissolved by sulphuric acid rain that evaporates before it lands.',
    missions: ['Venera 7', 'Magellan', 'Akatsuki', 'VERITAS', 'DAVINCI'],
  },

  earth: {
    blurb: 'The only place we have confirmed anything is happening.',
    body: [
      'Earth is the densest planet in the solar system, the only one with liquid water on its surface, and — so far as forty years of looking has established — the only one with life.',
      'Its atmosphere is a chemical anomaly: 21 per cent free oxygen, a wildly reactive gas that should have vanished into rust and rock long ago. It persists only because something keeps making it. That signature, visible from light-years away, is one of the main things we look for around other stars.',
      'The Moon is unusually large relative to its planet, probably the debris of an early collision. It stabilises Earth\'s axial tilt, and with it the climate, and it is slowly moving away at about 3.8 centimetres a year.',
    ],
    fact: 'The imagery on this globe is real. It is streamed from NASA GIBS, the same service that publishes a new picture of the whole planet every day.',
    missions: ['Landsat', 'Terra and Aqua', 'DSCOVR', 'The International Space Station'],
  },

  mars: {
    blurb: 'Cold, dry, rusted — and it was not always.',
    body: [
      'Mars has river valleys, deltas, lake beds and minerals that only form in water. Something like three and a half billion years ago it had a thicker atmosphere and standing water. Then it lost its magnetic field, the solar wind stripped the air away, and what was left froze.',
      'It carries the largest volcano in the solar system, Olympus Mons, 21.9 km high and 600 km across; and the largest canyon, Valles Marineris, which would stretch across the whole of the United States.',
      'A Martian day is 24 hours 37 minutes, which is close enough to ours to be uncanny. Its year is 687 days, and its axial tilt of 25.2° gives it seasons much like Earth\'s, only twice as long and far more severe.',
    ],
    fact: 'The surface imagery here is the Viking MDIM 2.1 colour mosaic, assembled from orbital photographs taken in the late 1970s.',
    missions: ['Viking', 'Spirit and Opportunity', 'Curiosity', 'Perseverance', 'Ingenuity'],
  },

  jupiter: {
    blurb: 'Two and a half times the mass of every other planet combined.',
    body: [
      'Jupiter is a failed star in the sense that matters least — it would need about eighty times more mass to fuse hydrogen — and a spectacular planet in every sense that matters more.',
      'It spins once every 9 hours 56 minutes, faster than anything else this size, and the centrifugal force flattens it visibly: its equatorial radius is 6.5 per cent larger than its polar one. You can see the oblateness in this view.',
      'The Great Red Spot is a storm wider than Earth that has been observed continuously since at least 1830, and possibly since 1665. It is shrinking, and nobody is quite sure why.',
    ],
    fact: 'Jupiter has 97 confirmed moons. Four of them were the first objects ever seen orbiting something other than Earth, and that observation ended the geocentric universe.',
    missions: ['Pioneer 10', 'Voyager', 'Galileo', 'Juno', 'Europa Clipper', 'JUICE'],
  },

  saturn: {
    blurb: 'The rings are ninety-nine per cent water ice and almost entirely empty space.',
    body: [
      'Saturn\'s rings span 280,000 kilometres and are, in most places, about ten metres thick. Scaled to a sheet of paper, they would be several kilometres wide. They are made of ice and rock from centimetres to metres across, each particle on its own orbit.',
      'The gaps are not empty by accident. The Cassini Division is carved by an orbital resonance with the moon Mimas: particles there orbit exactly twice for every one of Mimas\'s orbits, get tugged in the same direction every time, and are gradually cleared out.',
      'The planet itself is less dense than water and flattened by nearly ten per cent. Its rotation is fast, its interior is stranger than Jupiter\'s, and its rings may be no more than a hundred million years old — which would mean the dinosaurs looked up at a Saturn without them.',
    ],
    fact: 'The dark band across the clouds in this view is the shadow of the rings. At Saturn\'s equinox, every fifteen years, it collapses to a line.',
    missions: ['Pioneer 11', 'Voyager', 'Cassini–Huygens'],
  },

  uranus: {
    blurb: 'Tipped over on its side, and nobody knows what hit it.',
    body: [
      'Uranus rotates on an axis tilted 97.8° from its orbit. It does not spin like a top; it rolls like a barrel. Its poles take turns facing the Sun through a 84-year orbit, so each gets 42 years of continuous daylight followed by 42 years of night.',
      'That tilt almost certainly came from a collision, or several, early in the solar system\'s history. Its moons and rings orbit in the same tilted plane, which means whatever happened, happened before they formed — or reformed them afterwards.',
      'It is the coldest planet in the solar system, colder than Neptune despite being nearer the Sun, reaching 49 K. Something is trapping its internal heat, and we do not know what.',
    ],
    fact: 'One spacecraft has ever visited: Voyager 2, for a few hours in January 1986. Everything else we know comes from telescopes.',
    missions: ['Voyager 2'],
  },

  neptune: {
    blurb: 'Found with mathematics before anyone pointed a telescope at it.',
    body: [
      'Uranus was not following the orbit Newtonian gravity predicted. In 1846 Urbain Le Verrier calculated where an unseen planet would have to be to explain the discrepancy, sent the coordinates to Berlin, and Johann Galle found Neptune that same night, within one degree of the prediction.',
      'It has the fastest winds measured anywhere in the solar system — over 2,000 km/h — despite receiving less than a thousandth of Earth\'s sunlight. The energy is coming from inside.',
      'Its largest moon, Triton, orbits backwards. That is only possible if it was captured rather than formed there, and it makes Triton a Kuiper Belt object we can visit without leaving the planets.',
    ],
    fact: 'Neptune has completed exactly one orbit since its discovery — it returned to its 1846 position in July 2011.',
    missions: ['Voyager 2'],
  },

  pluto: {
    blurb: 'Small, complicated, and far more interesting than the argument about it.',
    body: [
      'For seventy-six years Pluto was a planet, and then in 2006 the IAU defined the term in a way it does not satisfy: it has not cleared its orbital neighbourhood. This changed nothing about Pluto.',
      'New Horizons arrived in 2015 and found a world nobody had predicted: nitrogen glaciers flowing across a basin the size of Texas, mountains of water ice four kilometres high, a haze layer in twenty distinct strata, and a surface so young in places that something must still be resurfacing it.',
      'It orbits in a 3:2 resonance with Neptune, going round the Sun twice for every three Neptune orbits, which is why the two can cross paths and never meet.',
    ],
    fact: "Pluto and its moon Charon are tidally locked to each other — each keeps the same face towards the other, permanently.",
    missions: ['New Horizons'],
  },

  moon: {
    blurb: 'The only other world anyone has stood on.',
    body: [
      'The Moon is a quarter of Earth\'s diameter, which makes it exceptionally large for a satellite. The leading explanation is that a Mars-sized body struck the early Earth and the debris coalesced.',
      'It is tidally locked, so we always see the same face. The far side, first photographed in 1959, is markedly different: almost no dark maria, and a much thicker crust.',
      'Its surface has no atmosphere and no weather, so footprints from 1969 are still there, and will be for millions of years.',
    ],
    fact: 'The imagery here is the LRO Wide Angle Camera global mosaic, at 100 metres per pixel.',
    missions: ['Luna 2', 'Apollo 11–17', 'Lunar Reconnaissance Orbiter', 'Artemis'],
  },

  io: {
    blurb: 'The most volcanically active object in the solar system.',
    body: [
      'Io is squeezed. Jupiter pulls on it from one side while Europa and Ganymede tug it into an eccentric orbit, and the resulting tidal flexing heats its interior enough to keep it molten.',
      'It erupts continuously — over 400 active volcanoes, plumes reaching 500 kilometres up, and lava flows hot enough to be measured from Earth. Its entire surface is repaved every million years or so, which is why it has essentially no impact craters.',
      'The yellows and whites are sulphur and sulphur dioxide frost. The black patches are silicate lava, hotter than anything on Earth today.',
    ],
    fact: 'Io loses about a tonne of material per second to space, which forms a doughnut of plasma around Jupiter.',
    missions: ['Voyager', 'Galileo', 'Juno'],
  },

  europa: {
    blurb: 'More liquid water than every ocean on Earth, under 15 km of ice.',
    body: [
      'Europa\'s surface is water ice, cracked into a network of ridges and almost entirely free of craters, meaning it is young — perhaps 40 to 90 million years old. Something is resurfacing it.',
      'Beneath is an ocean, kept liquid by the same tidal heating that melts Io, in contact with a rocky sea floor. On Earth, that combination — liquid water, rock chemistry, and energy — is where life is found, including at hydrothermal vents that never see the Sun.',
      'Europa Clipper launched in 2024 and will make dozens of close passes through the 2030s to find out how thick the ice is and what the ocean is made of.',
    ],
    fact: 'Hubble has repeatedly seen plumes of water vapour erupting from the south polar region, which would let a spacecraft sample the ocean without landing.',
    missions: ['Galileo', 'Europa Clipper', 'JUICE'],
  },

  ganymede: {
    blurb: 'The largest moon in the solar system, and the only one with a magnetic field.',
    body: [
      'Ganymede is bigger than Mercury. It generates its own magnetic field from a liquid iron core, which is unique among moons, and that field carves a small magnetosphere out of Jupiter\'s enormous one.',
      'Its surface is two terrains at once: dark, ancient, heavily cratered regions, and lighter grooved terrain crossed by ridges hundreds of kilometres long. It also has a salty ocean beneath the ice, detected by watching how its auroras rock back and forth.',
    ],
    fact: 'JUICE will enter orbit around Ganymede in 2034 — the first spacecraft to orbit a moon other than our own.',
    missions: ['Voyager', 'Galileo', 'JUICE'],
  },

  callisto: {
    blurb: 'The most heavily cratered object we know of.',
    body: [
      'Callisto has been geologically dead for around four billion years. Nothing has erased anything, so its surface is a complete record of impacts — saturated, meaning new craters can only form by destroying old ones.',
      'It orbits far enough out to escape both the worst of Jupiter\'s radiation and the tidal heating that torments Io and Europa, which has made it a recurring candidate for a crewed outpost in mission studies.',
    ],
    fact: 'The Valhalla impact basin has concentric rings extending 1,900 kilometres from its centre.',
    missions: ['Voyager', 'Galileo', 'JUICE'],
  },

  titan: {
    blurb: 'Rain, rivers, lakes and seas — of methane.',
    body: [
      'Titan is the only moon with a substantial atmosphere: mostly nitrogen, denser at the surface than Earth\'s, and thick with an orange organic haze that hid the surface until radar and infrared saw through it.',
      'It has a full hydrological cycle, except the liquid is methane and ethane. It rains, carves river channels, pools into lakes and seas at the poles, and evaporates again. Kraken Mare is larger than the Caspian Sea.',
      'Surface gravity is 14 per cent of Earth\'s and the air is four times denser, which means a person with wings strapped to their arms could fly.',
    ],
    fact: 'Huygens landed on Titan in 2005 and returned the only pictures ever taken from the surface of a body in the outer solar system.',
    missions: ['Cassini–Huygens', 'Dragonfly'],
  },

  enceladus: {
    blurb: 'A 500-kilometre moon firing its ocean into space.',
    body: [
      'Cassini flew through plumes erupting from fractures near Enceladus\'s south pole and tasted the contents directly: water, salts, silica grains, methane, and complex organic molecules.',
      'The silica implies hydrothermal activity — water at over 90 °C reacting with rock on a sea floor. That is the same setting as Earth\'s deep-sea vents.',
      'It is also the most reflective body in the solar system, bouncing back almost all the light that reaches it, which is why its surface temperature is only 75 K.',
    ],
    fact: 'The material Enceladus sprays out forms Saturn\'s E ring — the moon is actively building a ring around its planet.',
    missions: ['Cassini–Huygens'],
  },

  triton: {
    blurb: 'A captured Kuiper Belt object, orbiting backwards, with active geysers.',
    body: [
      'Triton goes round Neptune the wrong way. Nothing forms in a retrograde orbit, so it must have been captured — probably a dwarf planet like Pluto, caught and circularised by tides.',
      'Voyager 2 found nitrogen geysers erupting eight kilometres up and a surface with almost no craters, at 38 K, the coldest measured surface in the solar system.',
      'The capture is not permanent. Tidal forces are drawing Triton inwards, and in a few billion years it will pass inside Neptune\'s Roche limit and be torn into a ring.',
    ],
    fact: 'Triton is the seventh-largest moon in the solar system and the only large one with a retrograde orbit.',
    missions: ['Voyager 2'],
  },
};
