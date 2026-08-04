/**
 * Time handling: Julian dates, calendar conversion, sidereal time, and the
 * simulation clock that drives the whole application.
 *
 * The application works internally in Julian Date (TDB is approximated by UTC —
 * the difference is under 70 s, which is far below the ~arc-minute accuracy of
 * the Standish approximation we use for positions, so it is not corrected).
 *
 * @module astro/time
 */

import { JD_J2000, JD_UNIX_EPOCH, MS_PER_DAY, DAYS_PER_CENTURY, TAU } from './constants.js';

/**
 * Convert a JavaScript Date (or epoch milliseconds) to a Julian Date.
 * @param {Date|number} date
 * @returns {number} Julian Date
 */
export function dateToJD(date) {
  const ms = date instanceof Date ? date.getTime() : Number(date);
  return JD_UNIX_EPOCH + ms / MS_PER_DAY;
}

/**
 * Convert a Julian Date to a JavaScript Date.
 * @param {number} jd
 * @returns {Date}
 */
export function jdToDate(jd) {
  return new Date(Math.round((jd - JD_UNIX_EPOCH) * MS_PER_DAY));
}

/**
 * Julian centuries elapsed since J2000.0.
 * @param {number} jd
 * @returns {number}
 */
export function centuriesSinceJ2000(jd) {
  return (jd - JD_J2000) / DAYS_PER_CENTURY;
}

/**
 * Days elapsed since J2000.0.
 * @param {number} jd
 * @returns {number}
 */
export function daysSinceJ2000(jd) {
  return jd - JD_J2000;
}

/**
 * Greenwich Mean Sidereal Time in radians (IAU 1982 series, sufficient here).
 * @param {number} jd Julian Date (UT1 approximated by UTC)
 * @returns {number} GMST in radians, normalised to [0, 2*pi)
 */
export function gmst(jd) {
  const d = jd - JD_J2000;
  const t = d / DAYS_PER_CENTURY;
  // Degrees; Meeus, Astronomical Algorithms, eq. 12.4
  let deg = 280.46061837 + 360.98564736629 * d + 0.000387933 * t * t - (t * t * t) / 38710000;
  deg = ((deg % 360) + 360) % 360;
  return (deg * Math.PI) / 180;
}

/**
 * Normalise an angle in radians to [0, 2*pi).
 * @param {number} a
 * @returns {number}
 */
export function norm2pi(a) {
  const r = a % TAU;
  return r < 0 ? r + TAU : r;
}

/**
 * Normalise an angle in degrees to [-180, 180].
 * @param {number} d
 * @returns {number}
 */
export function normDeg180(d) {
  let x = ((d + 180) % 360) - 180;
  if (x < -180) x += 360;
  return x;
}

/**
 * Format a Julian Date as an ISO-8601 UTC string (second precision).
 * @param {number} jd
 * @returns {string}
 */
export function jdToISO(jd) {
  return jdToDate(jd).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * Time-scale presets available in the UI, expressed as simulated seconds per
 * real second. `0` freezes the simulation.
 * @type {ReadonlyArray<{id:string, rate:number, key:string}>}
 */
export const TIME_RATES = Object.freeze([
  { id: 'rewind-year', rate: -31557600, key: 'time.rate.yearRev' },
  { id: 'rewind-month', rate: -2629800, key: 'time.rate.monthRev' },
  { id: 'rewind-day', rate: -86400, key: 'time.rate.dayRev' },
  { id: 'rewind-hour', rate: -3600, key: 'time.rate.hourRev' },
  { id: 'pause', rate: 0, key: 'time.rate.pause' },
  { id: 'realtime', rate: 1, key: 'time.rate.realtime' },
  { id: 'minute', rate: 60, key: 'time.rate.minute' },
  { id: 'hour', rate: 3600, key: 'time.rate.hour' },
  { id: 'day', rate: 86400, key: 'time.rate.day' },
  { id: 'week', rate: 604800, key: 'time.rate.week' },
  { id: 'month', rate: 2629800, key: 'time.rate.month' },
  { id: 'year', rate: 31557600, key: 'time.rate.year' },
  { id: 'decade', rate: 315576000, key: 'time.rate.decade' },
]);

/** Index of the "real time" preset within {@link TIME_RATES}. */
export const REALTIME_INDEX = TIME_RATES.findIndex((r) => r.id === 'realtime');

/**
 * The simulation clock.
 *
 * Holds a Julian Date and advances it by `rate` simulated seconds per real
 * second. Advancing is done from an explicit delta so it stays deterministic
 * and testable (no hidden reads of the wall clock inside `advance`).
 */
export class SimClock {
  /**
   * @param {number} [jd] Initial Julian Date; defaults to now.
   */
  constructor(jd = dateToJD(new Date())) {
    /** @type {number} Current Julian Date. */
    this.jd = jd;
    /** @type {number} Simulated seconds per real second. */
    this.rate = 1;
    /** @type {boolean} When true the clock is pinned to the real current time. */
    this.followNow = true;
    /** @type {number} Lower bound (JD) — 3000 BC, limit of the Standish fit. */
    this.minJD = 625673.5;
    /** @type {number} Upper bound (JD) — 3000 AD. */
    this.maxJD = 2816787.5;
  }

  /**
   * Advance the clock.
   * @param {number} realDeltaSeconds Elapsed real time in seconds.
   * @param {number} [nowJD] Current wall-clock JD, used when following "now".
   */
  advance(realDeltaSeconds, nowJD) {
    if (this.followNow && this.rate === 1) {
      this.jd = nowJD ?? dateToJD(new Date());
      return;
    }
    if (this.rate === 0) return;
    this.jd += (realDeltaSeconds * this.rate) / 86400;
    this.clamp();
  }

  /** Clamp the current date into the validity window of the ephemeris. */
  clamp() {
    if (this.jd < this.minJD) this.jd = this.minJD;
    else if (this.jd > this.maxJD) this.jd = this.maxJD;
  }

  /**
   * Jump to a specific date.
   * @param {Date|number} date A Date, or a Julian Date number.
   */
  setDate(date) {
    this.jd = typeof date === 'number' ? date : dateToJD(date);
    this.followNow = false;
    this.clamp();
  }

  /** Snap back to the current real-world instant and resume real-time flow. */
  goNow() {
    this.jd = dateToJD(new Date());
    this.rate = 1;
    this.followNow = true;
  }

  /**
   * Set the time multiplier.
   * @param {number} rate Simulated seconds per real second.
   */
  setRate(rate) {
    this.rate = rate;
    if (rate !== 1) this.followNow = false;
  }

  /** @returns {Date} The current simulated instant. */
  get date() {
    return jdToDate(this.jd);
  }
}
