/**
 * Physical and astronomical constants.
 *
 * Sources
 *  - IAU 2012 Resolution B2 (astronomical unit)
 *  - IAU 2009/2015 System of Astronomical Constants
 *  - JPL Solar System Dynamics, "Planetary Physical Parameters"
 *    https://ssd.jpl.nasa.gov/planets/phys_par.html
 *
 * Every value here is exact-as-published; do not "round for convenience".
 * @module astro/constants
 */

/** Astronomical unit in kilometres (IAU 2012, exact by definition). */
export const AU_KM = 149597870.7;

/** Speed of light in vacuum, km/s (exact by definition of the metre). */
export const C_KM_S = 299792.458;

/** Julian date of the J2000.0 epoch (2000-01-01T12:00:00 TT). */
export const JD_J2000 = 2451545.0;

/** Days in a Julian century. */
export const DAYS_PER_CENTURY = 36525.0;

/** Unix epoch (1970-01-01T00:00:00Z) expressed as a Julian date. */
export const JD_UNIX_EPOCH = 2440587.5;

/** Milliseconds in one day. */
export const MS_PER_DAY = 86400000;

/** Obliquity of the ecliptic at J2000.0, in degrees (JPL approx_pos.html). */
export const OBLIQUITY_J2000_DEG = 23.43928;

/** Obliquity of the ecliptic at J2000.0, in radians. */
export const OBLIQUITY_J2000 = (OBLIQUITY_J2000_DEG * Math.PI) / 180;

/** Heliocentric gravitational constant GM_sun, km^3/s^2 (IAU 2015 nominal). */
export const GM_SUN = 1.32712440018e11;

/** Solar radius, km (IAU 2015 nominal solar radius R_sun^N). */
export const SUN_RADIUS_KM = 695700;

/** Solar luminosity, W (IAU 2015 nominal). */
export const SUN_LUMINOSITY_W = 3.828e26;

/** Solar effective temperature, K (IAU 2015 nominal). */
export const SUN_TEFF_K = 5772;

/** Solar irradiance at 1 au, W/m^2 (total solar irradiance, ~2020 mean). */
export const SOLAR_CONSTANT_W_M2 = 1361;

/** Degrees -> radians. */
export const DEG = Math.PI / 180;

/** Radians -> degrees. */
export const RAD = 180 / Math.PI;

/** Two pi. */
export const TAU = Math.PI * 2;

/** Earth equatorial radius, km (JPL phys_par). Used as a display reference. */
export const EARTH_RADIUS_KM = 6378.1366;

/** Kilometres in one light-year. */
export const LIGHT_YEAR_KM = 9460730472580.8;

/** Kilometres in one parsec. */
export const PARSEC_KM = 30856775814913.673;
