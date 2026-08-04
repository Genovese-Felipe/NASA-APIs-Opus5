/**
 * Guided tours.
 *
 * A tour is a list of steps, each of which sets the camera, optionally sets the
 * date, and shows a short piece of text. The player eases between steps and
 * bails out the moment the user touches the camera — a tour that fights you for
 * control is worse than no tour.
 *
 * The tours are not a slideshow of pretty views. Each one makes a specific
 * point that is easier to see than to explain: what casts the shadow on
 * Saturn's clouds, why an eclipse needs a coincidence, how wrong every diagram
 * of the solar system is.
 *
 * @module ui/tours
 */

import { t } from './i18n.js';
import { dateToJD } from '../astro/time.js';

/**
 * @typedef {object} TourStep
 * @property {string} body Focus target.
 * @property {number} [distance] Distance in body radii.
 * @property {number} [pitch] Elevation, radians.
 * @property {number} [phase] Camera azimuth relative to the Sun, degrees.
 * @property {number} [fov]
 * @property {string} [date] ISO date to jump to.
 * @property {number} [rate] Time rate to set, simulated seconds per real second.
 * @property {number} [hold] Seconds to stay on this step before auto-advancing.
 * @property {string} title
 * @property {string} text
 * @property {object} [settings] Renderer settings to apply for this step.
 */

/**
 * @typedef {object} Tour
 * @property {string} id
 * @property {TourStep[]} steps
 */

/** @type {ReadonlyArray<Tour>} */
export const TOURS = Object.freeze([
  {
    id: 'grandTour',
    steps: [
      {
        body: 'sun', distance: 3.2, pitch: 0.1, phase: 25, hold: 9,
        title: 'The Sun',
        text: 'Ninety-nine point eight six per cent of the mass of the solar system is here. Everything else is what was left over.',
      },
      {
        body: 'mercury', distance: 4, pitch: 0.2, phase: 55, hold: 8,
        title: 'Mercury',
        text: 'Three rotations for every two orbits. A day here lasts two of its years.',
      },
      {
        body: 'venus', distance: 4, pitch: 0.15, phase: 65, hold: 8,
        title: 'Venus',
        text: 'The same size as Earth, 464 °C at the surface, and turning backwards.',
      },
      {
        body: 'earth', distance: 3.4, pitch: 0.18, phase: 72, hold: 9,
        title: 'Earth',
        text: 'The terminator you can see is the line between day and night. This is where it really is, right now.',
      },
      {
        body: 'mars', distance: 4, pitch: 0.22, phase: 60, hold: 8,
        title: 'Mars',
        text: 'River valleys, deltas and lake beds — on a world with no liquid water left.',
      },
      {
        body: 'jupiter', distance: 6, pitch: 0.16, phase: 55, hold: 9,
        title: 'Jupiter',
        text: 'Look at the shape. It spins once every ten hours, and the equator bulges by six and a half per cent.',
      },
      {
        body: 'io', distance: 6, pitch: 0.2, phase: 60, hold: 7,
        title: 'Io',
        text: 'Squeezed between Jupiter and its sibling moons until it melted. Four hundred active volcanoes.',
      },
      {
        body: 'saturn', distance: 5.5, pitch: 0.34, phase: 58, hold: 10,
        title: 'Saturn',
        text: 'Two hundred and eighty thousand kilometres of rings, about ten metres thick.',
      },
      {
        body: 'titan', distance: 5, pitch: 0.2, phase: 62, hold: 8,
        title: 'Titan',
        text: 'It rains here. Rivers, lakes and seas — of methane, at 94 K.',
      },
      {
        body: 'uranus', distance: 7, pitch: 0.05, phase: 60, hold: 9,
        title: 'Uranus',
        text: 'Tipped 98 degrees. Its moons orbit vertically, because whatever knocked it over did so before they formed.',
      },
      {
        body: 'neptune', distance: 7, pitch: 0.2, phase: 60, hold: 9,
        title: 'Neptune',
        text: 'Predicted by arithmetic in 1846 and found the same night, one degree from where the mathematics said it would be.',
      },
      {
        body: 'sun', distance: 12000, pitch: 0.62, phase: 30, fov: 55, hold: 12,
        title: 'All of it',
        text: 'Every world you just visited is inside this frame. Most of them are smaller than a pixel from here.',
      },
    ],
  },

  {
    id: 'rings',
    steps: [
      {
        body: 'saturn', distance: 4.2, pitch: 0.3, phase: 58, hold: 10,
        title: 'The shadow',
        text: 'The dark band across the clouds is not a stripe. It is the shadow of the rings, and it moves through the seasons.',
      },
      {
        body: 'saturn', distance: 2.6, pitch: 0.08, phase: 40, fov: 30, hold: 10,
        title: 'Edge on',
        text: 'From here the rings almost vanish. They are 280,000 km across and roughly ten metres thick — a sheet of paper several kilometres wide.',
      },
      {
        body: 'saturn', distance: 3.4, pitch: 0.55, phase: 120, hold: 12,
        title: 'The Cassini Division',
        text: 'The wide gap is not empty by accident. Particles there orbit exactly twice for every orbit of the moon Mimas, get pulled the same way every time, and are swept out.',
      },
      {
        body: 'mimas', distance: 9, pitch: 0.2, phase: 60, hold: 9,
        title: 'The culprit',
        text: 'Mimas is 400 km across and carved a 4,600 km gap in the rings, purely by being punctual.',
      },
    ],
  },

  {
    id: 'shadows',
    steps: [
      {
        body: 'earth', distance: 3.2, pitch: 0.12, phase: 90, hold: 9,
        title: 'The terminator',
        text: 'Every shadow here is ray-traced against the real geometry. The Sun is not a point: it is half a degree wide, and that is why the edge is soft.',
      },
      {
        body: 'moon', distance: 5, pitch: 0.1, phase: 100, hold: 10,
        title: 'The coincidence',
        text: 'The Sun is 400 times wider than the Moon and 400 times further away. That is why they appear the same size, and why a total eclipse is possible at all.',
      },
      {
        body: 'jupiter', distance: 8, pitch: 0.1, phase: 30, hold: 12,
        title: 'Eclipses elsewhere',
        text: "Jupiter's moons eclipse each other constantly. Watching those events is how Ole Rømer first measured the speed of light, in 1676.",
      },
    ],
  },

  {
    id: 'scale',
    steps: [
      {
        body: 'earth', distance: 3.2, pitch: 0.15, phase: 70, hold: 8,
        title: 'Start here',
        text: 'Earth, at about 25,000 km away. Remember how big it looks.',
      },
      {
        body: 'earth', distance: 62, pitch: 0.15, phase: 70, hold: 8,
        title: 'The Moon',
        text: 'The Moon is 384,400 km away — thirty Earths, end to end. Every diagram you have seen puts it far closer.',
      },
      {
        body: 'sun', distance: 240, pitch: 0.3, phase: 40, hold: 9,
        title: 'One astronomical unit',
        text: 'The Sun is 150 million kilometres away, four hundred times further than the Moon.',
      },
      {
        body: 'sun', distance: 14000, pitch: 0.6, phase: 40, fov: 60, hold: 12,
        title: 'The empty part',
        text: 'This is the whole solar system to scale. The planets are invisible not because they are badly drawn, but because space is almost entirely nothing.',
      },
    ],
  },

  {
    id: 'light',
    steps: [
      {
        body: 'sun', distance: 4, pitch: 0.1, phase: 30, hold: 9,
        title: '8 minutes 19 seconds',
        text: 'That is how old the sunlight reaching Earth is. If the Sun went out, we would not know for eight minutes.',
      },
      {
        body: 'jupiter', distance: 6, pitch: 0.15, phase: 55, hold: 9,
        title: '35 to 52 minutes',
        text: 'Jupiter is far enough that the light delay swings by seventeen minutes over a year, as the distance between us changes.',
      },
      {
        body: 'neptune', distance: 7, pitch: 0.2, phase: 55, hold: 10,
        title: 'Four hours',
        text: 'A command sent to a spacecraft here takes four hours to arrive. Nothing out here can be flown in real time; it can only be instructed and trusted.',
      },
    ],
  },
]);

/** @type {Map<string, Tour>} */
export const TOUR_BY_ID = new Map(TOURS.map((tr) => [tr.id, tr]));

/**
 * Plays a tour.
 */
export class TourPlayer {
  /** @param {import('./app.js').App} app */
  constructor(app) {
    this.app = app;
    /** @type {Tour|null} */
    this.tour = null;
    this.index = 0;
    this.elapsed = 0;
    this.playing = false;
    this._savedSettings = null;
  }

  /**
   * Start a tour.
   * @param {string} id
   */
  play(id) {
    const tour = TOUR_BY_ID.get(id);
    if (!tour) return;
    this.tour = tour;
    this.index = 0;
    this.elapsed = 0;
    this.playing = true;
    this._savedSettings = { ...this.app.renderer.settings };
    this.app.dom.tour.hidden = false;
    this._bindControls();
    this._applyStep();
  }

  /** Stop and restore. */
  stop() {
    this.playing = false;
    this.tour = null;
    this.app.dom.tour.hidden = true;
    this.app.camera.autoOrbit = 0;
    if (this._savedSettings) {
      Object.assign(this.app.renderer.settings, this._savedSettings);
      this._savedSettings = null;
      this.app.renderer.resetAccumulation();
    }
  }

  /** Called when the user grabs the camera. */
  interrupt() {
    if (!this.playing) return;
    // Stop advancing but leave the card up, so a user who wanted a closer look
    // can read the text and press Next when ready.
    this.elapsed = -Infinity;
  }

  /** Advance to the next step. */
  next() {
    if (!this.tour) return;
    if (this.index >= this.tour.steps.length - 1) {
      this.stop();
      return;
    }
    this.index++;
    this.elapsed = 0;
    this._applyStep();
  }

  /** Go back one step. */
  previous() {
    if (!this.tour || this.index === 0) return;
    this.index--;
    this.elapsed = 0;
    this._applyStep();
  }

  /**
   * Advance the timer.
   * @param {number} dt Seconds.
   */
  update(dt) {
    if (!this.playing || !this.tour) return;
    if (this.elapsed === -Infinity) return; // interrupted; wait for the user
    this.elapsed += dt;
    const step = this.tour.steps[this.index];
    if (this.elapsed >= (step.hold ?? 9)) this.next();
  }

  /** @private */
  _applyStep() {
    const step = this.tour.steps[this.index];
    const app = this.app;

    if (step.date) app.clock.setDate(new Date(step.date));
    if (step.rate != null) app.clock.setRate(step.rate);
    if (step.settings) {
      Object.assign(app.renderer.settings, step.settings);
      app.renderer.resetAccumulation();
    }

    // Aim at a chosen phase angle relative to the Sun so the terminator is
    // where the text says it is, whatever today's date happens to be.
    const body = app.scene?.byId.get(step.body);
    if (body && step.phase != null) {
      const sunYaw = Math.atan2(-body.pos[1], -body.pos[0]);
      app.camera.yaw = sunYaw + (step.phase * Math.PI) / 180;
    }
    if (step.pitch != null) app.camera.pitch = step.pitch;
    if (step.fov) app.camera.setFov(step.fov);

    app.camera.focusOn(step.body, {
      distanceRadii: step.distance ?? 6,
      duration: app.prefs.reducedMotion ? 0 : 2.2,
    });
    app.camera.autoOrbit = app.prefs.reducedMotion ? 0 : 0.035;

    app.dom.tourStep.textContent = t('tour.step', {
      n: this.index + 1, total: this.tour.steps.length,
    });
    app.dom.tourTitle.textContent = step.title;
    app.dom.tourText.textContent = step.text;
    app.announce(`${step.title}. ${step.text}`);
  }

  /** @private */
  _bindControls() {
    if (this._bound) return;
    this._bound = true;
    this.app.dom.tourNext.addEventListener('click', () => this.next());
    this.app.dom.tourPrev.addEventListener('click', () => this.previous());
    this.app.dom.tourStop.addEventListener('click', () => this.stop());
  }
}
