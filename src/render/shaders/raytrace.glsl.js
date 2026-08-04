/**
 * The ray tracer.
 *
 * A single fragment shader that traces primary rays against analytic geometry —
 * spheroids for bodies, annuli for ring systems, spherical shells for
 * atmospheres — and shades every hit with physically motivated lighting.
 *
 * WHY A RAY TRACER AND NOT A RASTERISER
 *  - Bodies are perfect quadrics. Ray tracing renders them at *infinite*
 *    tessellation: Saturn's limb is analytically smooth at any zoom, and the
 *    oblateness of Jupiter (f = 0.065) is exact rather than approximated by a
 *    mesh.
 *  - Shadows are ray-traced occlusion queries against those same quadrics, so
 *    eclipses, ring shadows and mutual moon shadows are all the same code path
 *    and are correct at every scale — no shadow maps, no cascade seams.
 *  - The scene spans 10 orders of magnitude in distance. A ray tracer working
 *    in camera-relative coordinates has no depth buffer to run out of
 *    precision.
 *
 * PASS STRUCTURE (see render/raytracer.js)
 *   1. this shader  -> HDR radiance, jittered, accumulated over frames
 *   2. bloom chain  -> physically weighted glare
 *   3. composite    -> exposure, tone map, grade, dither
 *
 * UNITS
 *  Everything inside the shader is in megametres (1 Mm = 1000 km) and
 *  camera-relative: the camera sits at the origin. This keeps every quantity a
 *  ray tracer cares about inside the comfortable range of a 32-bit float even
 *  though the scene is 4.5 billion kilometres across.
 *
 * @module render/shaders/raytrace
 */

import { MATH, NOISE, COLOR, INTERSECT, SOFT_SHADOW } from './common.glsl.js';

/**
 * Build the ray tracing fragment shader.
 * @param {object} opts
 * @param {number} opts.maxBodies Compile-time body cap (loop bound).
 * @param {number} opts.maxRings Compile-time ring-system cap.
 * @returns {string} GLSL ES 3.00 source.
 */
export function buildRaytraceShader({ maxBodies = 40, maxRings = 4 } = {}) {
  return /* glsl */ `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2DArray;

#define MAX_BODIES ${maxBodies}
#define MAX_RINGS  ${maxRings}

// Body record rows in uBodies (see render/raytracer.js for the writer).
#define ROW_POS    0   // xyz = position (Mm, camera-relative), w = equatorial radius
#define ROW_ALBEDO 1   // rgb = base colour,  w = geometric albedo
#define ROW_AXIS   2   // xyz = spin axis (unit), w = prime-meridian angle
#define ROW_MISC   3   // x = atmosphere thickness/R, y = ring index, z = flattening, w = emissive
#define ROW_SCATT  4   // rgb = Rayleigh coefficients, w = Mie strength
#define ROW_SURF   5   // x = texture layer, y = surface type, z = scale height (Mm), w = roughness

// Surface types.
#define SURF_ROCK  0
#define SURF_GAS   1
#define SURF_ICE   2
#define SURF_STAR  3
#define SURF_TEX   4

in vec2 vUV;
out vec4 fragColor;

${MATH}
${NOISE}
${COLOR}
${INTERSECT}
${SOFT_SHADOW}

// ---------------------------------------------------------------------------
// Uniforms
// ---------------------------------------------------------------------------
uniform sampler2D  uBodies;       // MAX_BODIES x 6 RGBA32F record table
uniform sampler2D  uSky;          // equirectangular HDR star map
uniform sampler2D  uRingLUT;      // MAX_RINGS rows x N: rgb colour, a opacity
uniform sampler2DArray uSurfaces; // equirectangular body imagery

uniform int   uBodyCount;
uniform vec2  uResolution;       // full image size, even when rendering a tile
uniform vec2  uTileOrigin;       // pixel offset of this tile within the image
uniform vec2  uTileSize;         // pixel size of this tile
uniform vec3  uCamRight;
uniform vec3  uCamUp;
uniform vec3  uCamFwd;
uniform float uTanHalfFov;
uniform vec2  uJitter;            // sub-pixel offset, in pixels
uniform float uFrame;             // accumulation frame index
uniform float uTime;              // seconds, for animated detail only

uniform vec3  uSunPos;            // Mm, camera-relative
uniform float uSunRadius;         // Mm
uniform vec3  uSunColor;          // linear RGB * intensity

uniform vec4  uRingRadii[MAX_RINGS];  // xy = inner/outer radius (Mm), z = body index, w = unused
uniform int   uRingCount;

uniform int   uScatterSteps;      // view-ray samples inside an atmosphere
uniform int   uLightSteps;        // sun-ray samples for optical depth
uniform int   uShadowBodies;      // how many bodies participate in shadow tests
uniform float uSurfaceDetail;     // procedural detail strength, 0..1
uniform float uAmbient;           // night-side fill, as a fraction of local sunlight

uniform float uAuMm;              // one astronomical unit, in megametres
uniform float uSunRadiance;       // radiance of the photosphere, in units where
                                  // the solar irradiance at 1 au equals 1
uniform float uPointGain;         // physical scale for sub-pixel bodies
uniform float uBeaconGain;        // artistic scale that matches the star field
uniform float uPixelAngle;        // angular size of one pixel, radians

uniform float uShowRings;
uniform float uShowAtmosphere;
uniform float uShowStars;
uniform float uSkyGain;           // star-field brightness, pre-divided by exposure
uniform float uRealisticBrightness; // 1 = inverse-square falloff, 0 = flattened

// ---------------------------------------------------------------------------
// Body record access
// ---------------------------------------------------------------------------
vec4 bodyRow(int i, int row) {
  return texelFetch(uBodies, ivec2(i, row), 0);
}

struct Body {
  vec3  pos;
  float radius;
  vec3  albedoColor;
  float albedo;
  vec3  axis;
  float spin;
  float atmo;
  int   ringIdx;
  float flattening;
  float emissive;
  vec3  rayleigh;
  float mie;
  int   texLayer;
  int   surfType;
  float scaleHeight;   // Mm, Rayleigh scale height of the atmosphere
  float roughness;
};

Body getBody(int i) {
  vec4 a = bodyRow(i, ROW_POS);
  vec4 b = bodyRow(i, ROW_ALBEDO);
  vec4 c = bodyRow(i, ROW_AXIS);
  vec4 d = bodyRow(i, ROW_MISC);
  vec4 e = bodyRow(i, ROW_SCATT);
  vec4 f = bodyRow(i, ROW_SURF);
  Body o;
  o.pos = a.xyz;      o.radius = a.w;
  o.albedoColor = b.rgb; o.albedo = b.w;
  o.axis = c.xyz;     o.spin = c.w;
  o.atmo = d.x;       o.ringIdx = int(d.y);
  o.flattening = d.z; o.emissive = d.w;
  o.rayleigh = e.rgb; o.mie = e.w;
  o.texLayer = int(f.x); o.surfType = int(f.y);
  o.scaleHeight = f.z; o.roughness = f.w;
  return o;
}

// ---------------------------------------------------------------------------
// Body-local frame
// ---------------------------------------------------------------------------
// Orthonormal basis with +Z along the spin axis and +X on the prime meridian.
mat3 bodyFrame(vec3 axis, float spin) {
  vec3 up = abs(axis.z) < 0.999 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
  vec3 x0 = normalize(cross(up, axis));
  vec3 y0 = cross(axis, x0);
  float cs = cos(spin), sn = sin(spin);
  vec3 x = x0 * cs + y0 * sn;
  vec3 y = -x0 * sn + y0 * cs;
  return mat3(x, y, axis);
}

// Solar irradiance at a given distance, normalised so that the value at one
// astronomical unit is exactly 1.0. Every radiometric quantity in this shader
// is expressed in that unit system, which is what makes the exposure control
// meaningful: "exposure 1" is correctly exposed for a sunlit surface at Earth's
// distance, and Neptune really is 900 times darker.
float irradianceAt(float sunDist) {
  float physical = sq(uAuMm / max(sunDist, 1e-3));
  return mix(1.0, physical, uRealisticBrightness);
}

// Equirectangular coordinates from a unit vector in the body frame.
// v = 0 at the north pole so that imagery uploaded row-0-is-north lines up.
vec2 equirect(vec3 d) {
  return vec2(atan(d.y, d.x) * (0.5 / PI) + 0.5, 0.5 - asin(clamp(d.z, -1.0, 1.0)) / PI);
}

// ---------------------------------------------------------------------------
// Procedural surfaces
//
// Used for every body we do not have NASA imagery for, and as a detail layer on
// top of the ones we do. These are not attempts to reproduce specific terrain —
// they are statistically plausible surfaces built from the right kind of noise
// for each world class.
// ---------------------------------------------------------------------------

// Cratered regolith: overlapping Worley cells give rims and floors, ridged fbm
// adds the ejecta and megaregolith texture.
vec3 rockSurface(vec3 p, vec3 base, float detail, out float bump) {
  float craters = 0.0;
  float amp = 1.0;
  float freq = 6.0;
  for (int i = 0; i < 4; i++) {
    float w = worley(p * freq + float(i) * 17.3);
    // Bowl profile with a raised rim.
    float c = smoothstep(0.0, 0.42, w) * (1.0 - smoothstep(0.42, 0.58, w) * 0.55);
    craters += (1.0 - c) * amp;
    amp *= 0.55;
    freq *= 2.3;
  }
  craters = saturate(craters * 0.5);
  float rough = fbm(p * 22.0, 5, 2.1, 0.55);
  float maria = smoothstep(0.45, 0.62, fbm(p * 1.7, 4, 2.0, 0.5));

  bump = (craters - 0.5) * 1.6 + (rough - 0.5) * 0.5;
  vec3 c = base;
  c *= mix(1.0, 0.62, maria * detail);
  c *= 1.0 + (craters - 0.35) * 0.45 * detail;
  c *= 0.86 + 0.28 * rough * detail;
  return max(c, vec3(0.0));
}

// Gas giant: zonal bands warped by turbulence, plus long-lived vortices.
vec3 gasSurface(vec3 p, vec3 base, float detail, float t) {
  // Domain warp in longitude only — this is what makes bands shear rather than
  // smear, and is the cheapest convincing model of zonal wind.
  float lat = p.z;
  vec3 wp = p * 2.4;
  float warp = fbm(wp + vec3(t * 0.008, 0.0, 0.0), 5, 2.2, 0.55) - 0.5;
  float bands = sin((lat + warp * 0.22) * 26.0) * 0.5 + 0.5;
  bands = mix(bands, smoothstep(0.25, 0.75, bands), 0.7);

  float turb = ridged(p * 9.0 + vec3(warp * 2.0, 0.0, t * 0.01), 5, 2.3, 0.5);
  float storms = smoothstep(0.72, 0.95, fbm(p * 4.5 + vec3(0.0, t * 0.004, 0.0), 4, 2.1, 0.5));

  vec3 light = base * 1.28;
  vec3 dark  = base * vec3(0.72, 0.63, 0.55);
  vec3 c = mix(dark, light, bands);
  c = mix(c, c * vec3(1.15, 0.92, 0.78), turb * 0.35 * detail);
  c = mix(c, vec3(0.86, 0.55, 0.42), storms * 0.5 * detail);
  // Polar hoods: high-latitude haze desaturates the bands.
  c = mix(c, base * 0.9, smoothstep(0.72, 0.98, abs(lat)) * 0.6);
  return c;
}

// Icy body: fracture networks (ridged noise ridges) over a bright substrate.
vec3 iceSurface(vec3 p, vec3 base, float detail, out float bump) {
  float cracks = ridged(p * 14.0, 5, 2.1, 0.55);
  float deep = smoothstep(0.55, 0.95, cracks);
  float mottle = fbm(p * 6.0, 4, 2.0, 0.5);
  bump = (cracks - 0.5) * 0.8;
  vec3 c = base * (0.92 + 0.16 * mottle);
  c = mix(c, base * vec3(0.72, 0.78, 0.86), deep * 0.75 * detail);
  return c;
}

// Solar photosphere: granulation plus supergranular network, with limb
// darkening applied by the caller.
vec3 starSurface(vec3 p, float t) {
  float gran = fbm(p * 90.0 + vec3(0.0, 0.0, t * 0.35), 4, 2.3, 0.5);
  float super = fbm(p * 14.0 + vec3(t * 0.05), 3, 2.1, 0.55);
  float spots = smoothstep(0.80, 0.93, fbm(p * 3.4 + 31.7, 4, 2.0, 0.5));
  vec3 hot  = vec3(1.00, 0.93, 0.80);
  vec3 cool = vec3(1.00, 0.62, 0.28);
  vec3 c = mix(cool, hot, saturate(gran * 0.75 + super * 0.45));
  c = mix(c, vec3(0.35, 0.14, 0.05), spots * 0.85);
  return c;
}

// ---------------------------------------------------------------------------
// Rings
// ---------------------------------------------------------------------------
// Sample the pre-baked radial profile. The LUT already encodes every named gap
// (Cassini Division, Encke, Keeler) at its true radius.
vec4 sampleRing(int idx, float r) {
  vec4 rr = uRingRadii[idx];
  float u = (r - rr.x) / max(rr.y - rr.x, 1e-6);
  if (u < 0.0 || u > 1.0) return vec4(0.0);
  float v = (float(idx) + 0.5) / float(MAX_RINGS);
  vec4 s = texture(uRingLUT, vec2(u, v));
  // Fine-scale density waves. Real rings are structured at every scale, but a
  // 1900-cycle modulation aliases into vicious moire the moment a screen pixel
  // spans more than half a cycle. fwidth() gives the screen-space footprint of
  // u, so we can fade each detail band out exactly as it crosses its Nyquist
  // limit — analytic antialiasing rather than brute-force supersampling.
  float fw = fwidth(u);
  float fadeHi = 1.0 / (1.0 + sq(fw * 1900.0 * 2.0));
  float fadeLo = 1.0 / (1.0 + sq(fw * 240.0 * 2.0));
  float fine = 1.0
    - 0.10 * (0.5 - 0.5 * cos(u * 1900.0)) * fadeHi
    - 0.16 * (1.0 - fbm(vec3(u * 240.0, 0.0, 0.0), 3, 2.0, 0.5)) * fadeLo;
  s.a *= saturate(fine);
  return s;
}

// ---------------------------------------------------------------------------
// Shadowing
// ---------------------------------------------------------------------------
// Fraction of the solar disc visible from 'p', accounting for every body that
// can occlude it. Uses the analytic disc-overlap term, so the penumbra is
// smooth and physically sized without any stochastic sampling.
float sunVisibility(vec3 p, int selfIdx) {
  vec3 toSun = uSunPos - p;
  float sunDist = length(toSun);
  vec3 L = toSun / sunDist;
  float sunAng = asin(clamp(uSunRadius / sunDist, 0.0, 1.0));

  float vis = 1.0;
  int n = min(uBodyCount, uShadowBodies);
  for (int i = 0; i < MAX_BODIES; i++) {
    if (i >= n) break;
    if (i == selfIdx) continue;
    // The Sun is in the body table because it is geometry we render. It must
    // never be treated as an occluder of its own light: the test below would
    // find a disc of exactly its own angular size at exactly zero separation
    // and report total occlusion, plunging the entire solar system into
    // shadow. (The residual "dist > sunDist" comparison is a floating-point
    // coin flip at that point, which is what makes the failure show up as
    // concentric contours on every planet rather than as uniform darkness.)
    if (bodyRow(i, ROW_MISC).w > 0.0) continue;
    vec4 rowPos = bodyRow(i, ROW_POS);
    float R = rowPos.w;
    if (R <= 0.0) continue;
    vec3 d = rowPos.xyz - p;
    float dist = length(d);
    if (dist > sunDist) continue;            // behind the Sun: cannot occlude
    if (dist < 1e-6) continue;
    vec3 dir = d / dist;
    float cosSep = dot(dir, L);
    if (cosSep <= 0.0) continue;             // occluder is on the far side
    float occAng = asin(clamp(R / dist, 0.0, 1.0));
    float sep = acos(clamp(cosSep, -1.0, 1.0));
    if (sep >= sunAng + occAng) continue;
    vis *= 1.0 - discOcclusion(sunAng, occAng, sep);
    if (vis < 0.002) return 0.0;
  }
  return vis;
}

// Additional attenuation from a ring system lying between 'p' and the Sun.
// This is what paints the ring shadow across Saturn's cloud tops — and, at the
// equinox, makes it vanish.
float ringShadow(vec3 p, int bodyIdx, Body b) {
  if (b.ringIdx < 0 || uShowRings < 0.5) return 1.0;
  vec3 toSun = normalize(uSunPos - p);
  vec3 n = b.axis;
  vec3 rel = p - b.pos;
  float denom = dot(toSun, n);
  if (abs(denom) < 1e-6) return 1.0;
  float t = -dot(rel, n) / denom;
  if (t <= 0.0) return 1.0;                  // ring plane is behind us
  vec3 hit = rel + toSun * t;
  float r = length(hit);
  vec4 rr = uRingRadii[b.ringIdx];
  float u = (r - rr.x) / max(rr.y - rr.x, 1e-6);
  if (u < 0.0 || u > 1.0) return 1.0;
  float v = (float(b.ringIdx) + 0.5) / float(MAX_RINGS);
  float a = texture(uRingLUT, vec2(u, v)).a;
  return 1.0 - a * 0.92;
}

// ---------------------------------------------------------------------------
// Atmospheric scattering
//
// Single-scattering Rayleigh + Mie, integrated along the view ray inside the
// atmospheric shell, with the optical depth towards the Sun evaluated by a
// short secondary march (Nishita et al. 1993, in the form popularised by
// O'Neil). Two things make it look right rather than merely blue:
//   * the shell is intersected analytically, so the limb is razor sharp;
//   * the sun-ward march is terminated when the sample is in the planet's own
//     shadow, which is what produces the red sunset ring during an eclipse.
// ---------------------------------------------------------------------------
vec3 atmosphere(vec3 ro, vec3 rd, float tNear, float tFar, Body b, int bodyIdx,
                out float transmittance) {
  transmittance = 1.0;
  if (b.atmo <= 0.0 || uShowAtmosphere < 0.5) return vec3(0.0);

  float Rp = b.radius;
  float Ra = Rp * (1.0 + b.atmo);
  // Real scale height for this body (Mm), uploaded alongside the scattering
  // coefficients. Earth's 8.5 km is what makes its limb a thin bright line
  // rather than the soft halo a guessed value produces.
  float H  = max(b.scaleHeight, 1e-5);
  float Hm = H * 0.18;                       // aerosols hug the surface

  int steps = uScatterSteps;
  float segLen = (tFar - tNear) / float(steps);
  if (segLen <= 0.0) return vec3(0.0);

  // Offset the whole march by a per-pixel, per-frame random fraction of a step.
  // A fixed step pattern turns the exponential density profile into concentric
  // rings on the planet's disc (the chord length depends only on the impact
  // parameter, so the quantisation error is radially symmetric and very
  // visible). Jittering turns that structured error into noise, which the
  // temporal accumulation pass then integrates away completely.
  float jitter = hash13(vec3(gl_FragCoord.xy, uFrame * 7.13 + 0.5));

  vec3 sunDirGlobal = normalize(uSunPos - b.pos);
  float mu = dot(rd, sunDirGlobal);
  // Rayleigh phase.
  float phaseR = 3.0 / (16.0 * PI) * (1.0 + mu * mu);
  // Henyey-Greenstein for aerosols, g = 0.76 is the classic haze value.
  const float g = 0.76;
  float phaseM = (1.0 - g * g) / (4.0 * PI * pow(1.0 + g * g - 2.0 * g * mu, 1.5));

  vec3 betaR = b.rayleigh;
  float betaM = b.mie;

  vec3 sumR = vec3(0.0);
  float sumM = 0.0;
  float odR = 0.0, odM = 0.0;

  for (int i = 0; i < 64; i++) {
    if (i >= steps) break;
    float t = tNear + segLen * (float(i) + jitter);
    vec3 p = ro + rd * t;
    vec3 rel = p - b.pos;
    float h = length(rel) - Rp;
    if (h < 0.0) h = 0.0;
    float dR = exp(-h / H) * segLen;
    float dM = exp(-h / Hm) * segLen;
    odR += dR;
    odM += dM;

    // Optical depth towards the Sun.
    vec3 L = normalize(uSunPos - p);
    vec2 tl;
    float lodR = 0.0, lodM = 0.0;
    bool lit = true;
    // Terminate early if the planet body itself blocks the light.
    vec2 tb;
    if (intersectSphere(p, L, b.pos, Rp, tb) && tb.y > 0.0 && tb.x > 0.0) lit = false;

    if (lit && intersectSphere(p, L, b.pos, Ra, tl)) {
      float lSeg = max(tl.y, 0.0) / float(uLightSteps);
      for (int j = 0; j < 16; j++) {
        if (j >= uLightSteps) break;
        vec3 q = p + L * lSeg * (float(j) + jitter);
        float hq = length(q - b.pos) - Rp;
        if (hq < 0.0) { lit = false; break; }
        lodR += exp(-hq / H) * lSeg;
        lodM += exp(-hq / Hm) * lSeg;
      }
    }
    if (!lit) continue;

    float shadow = sunVisibility(p, bodyIdx);
    vec3 tau = betaR * (odR + lodR) + vec3(betaM * 1.1 * (odM + lodM));
    vec3 att = exp(-tau) * shadow;
    sumR += att * dR;
    sumM += att.g * dM;
  }

  float irr = irradianceAt(length(uSunPos - b.pos));
  vec3 tauView = betaR * odR + vec3(betaM * 1.1 * odM);
  transmittance = exp(-(tauView.r + tauView.g + tauView.b) / 3.0);
  return (sumR * betaR * phaseR + sumM * betaM * phaseM) * uSunColor * irr;
}

// ---------------------------------------------------------------------------
// Sky
// ---------------------------------------------------------------------------
vec3 sampleSky(vec3 rd) {
  if (uShowStars < 0.5) return vec3(0.0);
  float lon = atan(rd.y, rd.x);
  float lat = asin(clamp(rd.z, -1.0, 1.0));
  vec2 uv = vec2(lon * (0.5 / PI) + 0.5, (lat + PI * 0.5) / PI);
  // uSkyGain carries a 1/exposure factor. Sunlight varies by a factor of 1600
  // between Mercury and Neptune, and the exposure control follows it; if the
  // star field were left in absolute units it would be invisible at Mercury and
  // blinding at Neptune. Real spacecraft cameras have exactly this problem and
  // solve it by taking two exposures. We keep the stars at a constant apparent
  // brightness instead — an honest, documented, artistic choice, and the
  // "physical star brightness" setting turns it off for anyone who wants the
  // uncompromising version.
  return texture(uSky, uv).rgb * uSkyGain;
}

// ---------------------------------------------------------------------------
// Surface shading
// ---------------------------------------------------------------------------
// Oren-Nayar diffuse. Regolith is rough enough that Lambert visibly fails: the
// full Moon looks like a flat disc, not a shaded ball, and only a rough-surface
// BRDF reproduces that.
//
// Written without acos() or tan(). The textbook formulation
//     alpha = max(acos(NL), acos(NV)) ; beta = min(...) ; ... sin(alpha)tan(beta)
// is numerically hostile in exactly the place it matters most. acos(x) has an
// infinite derivative at x = 1, so near the centre of a lit disc — where N.V is
// within a float32 ulp of 1 — the quantisation of NV is amplified into visible
// steps, and they appear as concentric rings because NV depends only on the
// impact parameter. The same region also makes (V - N*(N.V)) vanish, so
// normalising it to get cos(phi) divides by ~0.
//
// Both problems disappear by rewriting the trigonometry in terms of the
// cosines we already have:
//     alpha is the LARGER angle  ->  cos(alpha) = min(NL, NV)
//     beta  is the SMALLER angle ->  cos(beta)  = max(NL, NV)
//     sin(alpha) = sqrt(1 - min^2) ;  tan(beta) = sqrt(1 - max^2) / max
// and by taking cos(phi) from a dot product that is normalised only when the
// projections are long enough to mean anything.
float orenNayar(vec3 N, vec3 V, vec3 L, float roughness) {
  float NL = dot(N, L);
  if (NL <= 0.0) return 0.0;
  float NV = dot(N, V);
  if (NV <= 0.0) return 0.0;

  float s2 = roughness * roughness;
  float A = 1.0 - 0.5 * s2 / (s2 + 0.33);
  float B = 0.45 * s2 / (s2 + 0.09);

  float mn = min(NL, NV);
  float mx = max(NL, NV);
  float sinAlpha = sqrt(max(0.0, 1.0 - mn * mn));
  float tanBeta  = sqrt(max(0.0, 1.0 - mx * mx)) / max(mx, 1e-3);

  vec3 lProj = L - N * NL;
  vec3 vProj = V - N * NV;
  float lLen = length(lProj);
  float vLen = length(vProj);
  // When either projection is degenerate the azimuth is undefined and the
  // B term is multiplied by sin(alpha) ~ 0 anyway, so 0 is the correct answer.
  float cosPhi = (lLen > 1e-5 && vLen > 1e-5) ? max(0.0, dot(lProj, vProj) / (lLen * vLen)) : 0.0;

  return NL * (A + B * cosPhi * sinAlpha * tanBeta);
}

// GGX specular, used for oceans, lakes and ice.
float ggx(vec3 N, vec3 V, vec3 L, float rough) {
  vec3 H = normalize(V + L);
  float a = max(rough * rough, 1e-3);
  float a2 = a * a;
  float NH = max(dot(N, H), 0.0);
  float NL = max(dot(N, L), 0.0);
  float NV = max(dot(N, V), 0.0);
  float d = (NH * NH * (a2 - 1.0) + 1.0);
  float D = a2 / (PI * d * d);
  float k = a * 0.5;
  float gv = NV / (NV * (1.0 - k) + k);
  float gl = NL / (NL * (1.0 - k) + k);
  return D * gv * gl;
}

struct Hit {
  int   idx;
  float t;
  vec3  p;
  vec3  n;
};

// Nearest body along the ray.
Hit traceBodies(vec3 ro, vec3 rd) {
  Hit h;
  h.idx = -1;
  h.t = INF;
  for (int i = 0; i < MAX_BODIES; i++) {
    if (i >= uBodyCount) break;
    vec4 rowPos = bodyRow(i, ROW_POS);
    float R = rowPos.w;
    if (R <= 0.0) continue;
    float oblate = bodyRow(i, ROW_MISC).z;
    vec2 t;
    if (oblate > 1e-4) {
      vec3 axis = bodyRow(i, ROW_AXIS).xyz;
      mat3 F = bodyFrame(axis, 0.0);
      vec3 lo = (ro - rowPos.xyz) * F;       // world -> body (F is orthonormal)
      vec3 ld = rd * F;
      vec3 invR = vec3(1.0 / R, 1.0 / R, 1.0 / (R * (1.0 - oblate)));
      if (!intersectSpheroid(lo, ld, invR, t)) continue;
      if (t.y < EPS) continue;
      float tt = t.x > EPS ? t.x : t.y;
      if (tt >= h.t) continue;
      h.idx = i; h.t = tt;
      vec3 lp = lo + ld * tt;
      vec3 ln = normalize(lp * invR * invR);
      h.n = F * ln;
      h.p = ro + rd * tt;
    } else {
      if (!intersectSphere(ro, rd, rowPos.xyz, R, t)) continue;
      if (t.y < EPS) continue;
      float tt = t.x > EPS ? t.x : t.y;
      if (tt >= h.t) continue;
      h.idx = i; h.t = tt;
      h.p = ro + rd * tt;
      h.n = normalize(h.p - rowPos.xyz);
    }
  }
  return h;
}

// Radiance leaving a point on a body towards the camera.
vec3 shadeSurface(Hit hit, vec3 rd) {
  Body b = getBody(hit.idx);
  vec3 N = hit.n;
  vec3 V = -rd;

  mat3 F = bodyFrame(b.axis, b.spin);
  vec3 local = normalize(transpose(F) * (hit.p - b.pos));
  vec2 uv = equirect(local);

  vec3 albedo = b.albedoColor;
  float bump = 0.0;
  float rough = b.roughness;
  float specMask = 0.0;

  if (b.surfType == SURF_STAR) {
    // Emissive: limb darkening (Eddington approximation with the standard
    // visible-light coefficients) plus granulation.
    float mu = max(dot(N, V), 0.0);
    float limb = 1.0 - 0.47 * (1.0 - mu) - 0.23 * (1.0 - mu) * (1.0 - mu);
    vec3 photo = starSurface(local, uTime);
    return photo * uSunColor * uSunRadiance * b.emissive * max(limb, 0.0);
  }

  if (b.texLayer >= 0) {
    vec3 tex = texture(uSurfaces, vec3(uv, float(b.texLayer))).rgb;
    tex = srgbToLinear(tex);
    albedo = tex;
    // Ocean detection: water is the only strongly blue-dominant, dark surface
    // on any body we have imagery for. Gives Earth a real specular sun glint.
    float blueDom = tex.b - max(tex.r, tex.g);
    specMask = saturate(blueDom * 6.0) * saturate(1.0 - luma(tex) * 2.6);
    rough = mix(rough, 0.12, specMask);
    // Add fine procedural relief so close-ups do not go soft.
    float d;
    rockSurface(local * 8.0, vec3(1.0), uSurfaceDetail * 0.35, d);
    bump = d * 0.25 * uSurfaceDetail;
  } else if (b.surfType == SURF_GAS) {
    albedo = gasSurface(local, b.albedoColor, uSurfaceDetail, uTime);
    rough = 0.85;
  } else if (b.surfType == SURF_ICE) {
    albedo = iceSurface(local, b.albedoColor, uSurfaceDetail, bump);
    rough = 0.55;
  } else {
    albedo = rockSurface(local, b.albedoColor, uSurfaceDetail, bump);
    rough = 0.92;
  }

  // Perturb the normal from the height field. Gradient is taken in the body
  // frame with a finite difference sized to the body, so the effect is scale
  // invariant.
  if (abs(bump) > 1e-5 && uSurfaceDetail > 0.0) {
    // The finite differences are taken in the BODY frame, because that is the
    // space 'local' lives in. Using world-space tangents here would sample the
    // height field along the wrong directions and skew every slope.
    float eps = 0.004;
    vec3 t1 = normalize(cross(local, abs(local.z) < 0.9 ? vec3(0,0,1) : vec3(1,0,0)));
    vec3 t2 = cross(local, t1);
    float h0 = bump;
    float d1, d2;
    if (b.surfType == SURF_ICE) {
      iceSurface(normalize(local + t1 * eps), b.albedoColor, 1.0, d1);
      iceSurface(normalize(local + t2 * eps), b.albedoColor, 1.0, d2);
    } else {
      rockSurface(normalize(local + t1 * eps) * (b.texLayer >= 0 ? 8.0 : 1.0), vec3(1.0), 1.0, d1);
      rockSurface(normalize(local + t2 * eps) * (b.texLayer >= 0 ? 8.0 : 1.0), vec3(1.0), 1.0, d2);
    }
    // Convert the body-space gradient back to world space before perturbing N.
    vec3 grad = F * (t1 * (d1 - h0) + t2 * (d2 - h0));
    N = normalize(N - grad * 0.55 * uSurfaceDetail);
  }

  // Direct sunlight.
  vec3 toSun = uSunPos - hit.p;
  float sunDist = length(toSun);
  vec3 L = toSun / sunDist;

  float vis = sunVisibility(hit.p, hit.idx) * ringShadow(hit.p, hit.idx, b);

  // Irradiance here, normalised so 1.0 == full sunlight at Earth's distance.
  float irr = irradianceAt(sunDist);

  float diff = orenNayar(N, V, L, rough);
  vec3 direct = albedo * diff * vis * uSunColor * irr;

  if (specMask > 0.0) {
    float spec = ggx(N, V, L, rough) * specMask * 0.6;
    direct += vec3(spec) * vis * uSunColor * irr;
  }

  // Planetshine: a moon's night side is lit by its primary. Treated as a
  // spherical area light — cheap, and the reason Earthshine on the Moon reads
  // correctly instead of looking like flat ambient.
  vec3 bounce = vec3(0.0);
  for (int i = 0; i < MAX_BODIES; i++) {
    if (i >= uBodyCount) break;
    if (i == hit.idx) continue;
    vec4 rp = bodyRow(i, ROW_POS);
    if (rp.w <= b.radius) continue;                 // only larger neighbours
    vec3 d = rp.xyz - hit.p;
    float dist = length(d);
    if (dist > rp.w * 60.0) continue;               // far enough to ignore
    vec3 pl = d / dist;
    float nl = max(dot(N, pl), 0.0);
    if (nl <= 0.0) continue;
    vec4 pa = bodyRow(i, ROW_ALBEDO);
    // Solid angle of the neighbour, times its lit fraction as seen from here.
    float solid = sq(rp.w / dist);
    vec3 nSun = normalize(uSunPos - rp.xyz);
    float phase = saturate(dot(nSun, -pl) * 0.5 + 0.5);
    bounce += pa.rgb * pa.w * solid * nl * phase * uSunColor * irr * 0.28;
  }

  // Night-side fill, expressed as a fraction of the local sunlight so it stays
  // proportionate whether you are at Mercury or at Pluto.
  // Ringshine. Saturn's night side is not black: the sunlit rings hang overhead
  // and light it. Modelled as a broad disc source in the equatorial plane whose
  // strength falls with latitude, which is the shape the real effect has.
  if (b.ringIdx >= 0 && uShowRings > 0.5) {
    vec4 rr = uRingRadii[b.ringIdx];
    float ringMid = (rr.x + rr.y) * 0.5;
    float solid = saturate(sq(ringMid / max(length(hit.p - b.pos), 1e-6)) * 0.30);
    float lat = abs(dot(N, b.axis));
    direct += albedo * uSunColor * irr * solid * (1.0 - lat) * 0.10 * (1.0 - vis * 0.5);
  }

  // Night-side fill, expressed as a fraction of the local sunlight so it stays
  // proportionate whether you are at Mercury or at Pluto.
  vec3 ambient = albedo * uAmbient * 0.012 * irr * uSunColor;
  return direct + bounce + ambient;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
void main() {
  // Rays are generated in the coordinate space of the FULL image, then offset
  // to the tile being rendered. That is what lets an 8K still be assembled from
  // manageable pieces without any seam: every tile's rays are exactly the rays
  // the full-resolution frame would have cast.
  vec2 pix = uTileOrigin + vUV * uTileSize + uJitter;
  vec2 ndc = (pix / uResolution) * 2.0 - 1.0;
  float aspect = uResolution.x / uResolution.y;

  vec3 rd = normalize(
      uCamFwd
    + uCamRight * (ndc.x * aspect * uTanHalfFov)
    + uCamUp    * (ndc.y * uTanHalfFov));
  vec3 ro = vec3(0.0);

  Hit hit = traceBodies(ro, rd);

  // --- background --------------------------------------------------------
  vec3 color;
  float bgT = hit.idx >= 0 ? hit.t : INF;
  if (hit.idx >= 0) {
    color = shadeSurface(hit, rd);
  } else {
    color = sampleSky(rd);
  }

  // --- rings -------------------------------------------------------------
  // Composited after the surface so a ring in front correctly veils the planet,
  // and a ring behind is correctly hidden by it.
  if (uShowRings > 0.5) {
    for (int r = 0; r < MAX_RINGS; r++) {
      if (r >= uRingCount) break;
      int bi = int(uRingRadii[r].z);
      if (bi < 0 || bi >= uBodyCount) continue;
      Body pb = getBody(bi);
      float t = intersectPlane(ro - pb.pos, rd, pb.axis, 0.0);
      if (t <= EPS || t >= bgT) continue;
      vec3 p = ro + rd * t;
      float rad = length(p - pb.pos);
      vec4 s = sampleRing(r, rad);
      if (s.a <= 0.001) continue;

      // Ring particles scatter strongly forward; looking towards the Sun
      // through the rings they glow, looking away they are dull.
      vec3 L = normalize(uSunPos - p);
      float mu = dot(rd, L);
      float fwd = 0.55 + 1.85 * pow(saturate(mu), 6.0);
      float back = 0.30 + 0.55 * pow(saturate(-mu), 3.0);
      float phase = fwd + back;

      float shadow = sunVisibility(p, -1);
      float irr = irradianceAt(length(uSunPos - p));

      // Grazing incidence makes the rings optically thicker.
      float cosInc = abs(dot(rd, pb.axis));
      float alpha = 1.0 - pow(1.0 - s.a, 1.0 / max(cosInc, 0.06));

      vec3 ringCol = s.rgb * uSunColor * irr * shadow * phase * 0.32;
      // Translucency: unlit side of an optically thin ring still transmits.
      ringCol += s.rgb * uSunColor * irr * (1.0 - shadow) * 0.02;
      color = mix(color, ringCol, saturate(alpha));
      bgT = t;
    }
  }

  // --- atmospheres -------------------------------------------------------
  if (uShowAtmosphere > 0.5) {
    for (int i = 0; i < MAX_BODIES; i++) {
      if (i >= uBodyCount) break;
      vec4 misc = bodyRow(i, ROW_MISC);
      if (misc.x <= 0.0) continue;
      Body b = getBody(i);
      if (b.surfType == SURF_STAR) continue;
      float Ra = b.radius * (1.0 + b.atmo);
      vec2 ts;
      if (!intersectSphere(ro, rd, b.pos, Ra, ts)) continue;
      float tNear = max(ts.x, 0.0);
      float tFar = min(ts.y, bgT);
      if (tFar <= tNear) continue;
      float tr;
      vec3 scat = atmosphere(ro, rd, tNear, tFar, b, i, tr);
      color = color * tr + scat;
    }
  }

  // --- sub-pixel bodies --------------------------------------------------
  //
  // A body smaller than a pixel cannot be resolved, but it still delivers real
  // flux to that pixel — which is precisely why Jupiter is a bright "star" in
  // the evening sky. Rasterising it would give a single aliased dot that
  // flickers as the camera moves; instead we add its total reflected flux,
  // spread over a small point-spread function.
  //
  //   flux  = albedo * E * (R/d)^2 * phase        [reflected, at the camera]
  //   radiance = flux / pixelSolidAngle
  //
  // The result is that zooming out from Earth to a system-wide view turns the
  // planets into stars of the correct relative brightness, continuously.
  for (int i = 0; i < MAX_BODIES; i++) {
    if (i >= uBodyCount) break;
    vec4 rp = bodyRow(i, ROW_POS);
    float R = rp.w;
    if (R <= 0.0) continue;
    float dist = length(rp.xyz);
    if (dist < 1e-6) continue;
    float angRad = R / dist;
    // Fade the point in only as the disc shrinks below a couple of pixels, so
    // it never double-counts a resolved body.
    float small = 1.0 - smoothstep(0.6 * uPixelAngle, 2.4 * uPixelAngle, angRad);
    if (small <= 0.001) continue;

    vec3 dir = rp.xyz / dist;
    float sep = acos(clamp(dot(rd, dir), -1.0, 1.0));
    // Airy-like point spread, roughly one pixel wide.
    float psf = exp(-sq(sep / max(uPixelAngle * 0.85, 1e-9)));
    if (psf < 1e-4) continue;

    vec4 alb = bodyRow(i, ROW_ALBEDO);
    vec4 misc = bodyRow(i, ROW_MISC);
    float flux;
    vec3 tint;
    if (misc.w > 0.0) {
      // Emissive: the Sun. Flux = surface radiance * solid angle.
      flux = uSunRadiance * PI * sq(angRad) * misc.w;
      tint = uSunColor;
    } else {
      vec3 toSun = uSunPos - rp.xyz;
      float sd = length(toSun);
      float E = irradianceAt(sd);
      // Phase angle: a body seen "full" is far brighter than a crescent.
      float ph = saturate(dot(normalize(toSun), -dir) * 0.5 + 0.5);
      flux = alb.w * E * sq(angRad) * ph * sunVisibility(rp.xyz + dir * R * 1.001, i);
      tint = alb.rgb * uSunColor;
    }
    // Two contributions, deliberately:
    //   * the physical one, continuous with the resolved shading, so nothing
    //     jumps in brightness as a body crosses the one-pixel threshold;
    //   * the "beacon", scaled to the same artistic units as the star field and
    //     divided by exposure, so a planet 40 au away reads at the apparent
    //     magnitude it really has instead of vanishing. The conversion constant
    //     is 10^(0.4 * 26.74) x the star-map gain: 26.74 is the Sun's apparent
    //     magnitude at 1 au, which is exactly the zero point of our irradiance
    //     unit. Setting "physical star brightness" zeroes the beacon.
    // The beacon is capped. The Sun seen from 40 au is magnitude -18: honest,
    // and large enough to overflow a half-float render target, at which point
    // the whole pixel becomes Inf and is discarded. Capping keeps it "so bright
    // it blows out and blooms", which is what the eye reads anyway, without
    // destroying the buffer.
    float physical = flux / max(sq(uPixelAngle), 1e-18);
    float beacon = min(flux * uBeaconGain, 2500.0);
    color += tint * (physical * uPointGain + beacon) * psf * small;
  }

  // --- solar corona ------------------------------------------------------
  // A physically-inspired r^-2.5 falloff around the disc. Without it the Sun
  // reads as a flat sticker; with it, it reads as a star.
  {
    vec3 d = uSunPos;
    float dist = length(d);
    vec3 sd = d / dist;
    float cosA = dot(rd, sd);
    float ang = acos(clamp(cosA, -1.0, 1.0));
    float sunAng = asin(clamp(uSunRadius / dist, 0.0, 1.0));
    if (ang > sunAng && cosA > 0.0) {
      float x = ang / max(sunAng, 1e-6);
      float corona = pow(x, -2.5) * 0.055 + pow(x, -1.2) * 0.006;
      // Faint radial streamers.
      float streak = 0.85 + 0.3 * fbm(rd * 30.0, 3, 2.2, 0.55);
      // Occluded by anything in front of the Sun (this is what makes a total
      // eclipse show the corona ring).
      float occ = 1.0;
      if (hit.idx >= 0) {
        vec4 rp = bodyRow(hit.idx, ROW_POS);
        if (length(rp.xyz) < dist) occ = 0.0;
      }
      color += uSunColor * uSunRadiance * corona * streak * occ * 0.02;
    }
  }

  // Keep the value inside the range of a half-float render target. Clamping is
  // strictly better than the NaN-guard-to-black it replaces: an overflowing
  // pixel is a very bright pixel, not a black one, and zeroing it punched holes
  // in exactly the brightest parts of the image. NaNs are still zeroed, since
  // there is no sensible value for them and one would persist for the whole
  // accumulated exposure.
  color = clamp(color, vec3(0.0), vec3(30000.0));
  if (any(isnan(color))) color = vec3(0.0);
  fragColor = vec4(color, 1.0);
}
`;
}
