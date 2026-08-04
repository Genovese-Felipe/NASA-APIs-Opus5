/**
 * Post-processing shaders: temporal accumulation, the bloom chain, and the
 * final composite.
 *
 * @module render/shaders/post
 */

import { MATH, NOISE, COLOR } from './common.glsl.js';

/**
 * Temporal accumulation.
 *
 * When the camera and the simulated time are both still, successive frames
 * differ only by their sub-pixel jitter, so a running average converges to a
 * supersampled image. This is what lets the app reach a genuinely clean,
 * "rendered" look on a laptop GPU: hold still for a second and the noise and
 * aliasing melt away. Any camera or time change resets the history.
 */
export const ACCUMULATE_FS = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 fragColor;
uniform sampler2D uCurrent;
uniform sampler2D uHistory;
uniform float uBlend;      // weight of the new sample, 1/(n+1) for a true mean
void main() {
  vec3 cur  = texture(uCurrent, vUV).rgb;
  vec3 hist = texture(uHistory, vUV).rgb;
  fragColor = vec4(mix(hist, cur, uBlend), 1.0);
}`;

/**
 * Bloom downsample — the 13-tap filter from Jimenez's "Next Generation Post
 * Processing in Call of Duty: Advanced Warfare". It is stable under motion
 * where a naive box filter shimmers badly on small bright points, which is
 * exactly what a star field is made of.
 */
export const BLOOM_DOWN_FS = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 fragColor;
uniform sampler2D uSource;
uniform vec2 uTexel;
uniform float uThreshold;
uniform float uSoftKnee;
uniform int uFirst;

${MATH}

vec3 prefilter(vec3 c) {
  if (uFirst == 0) return c;
  float br = max(c.r, max(c.g, c.b));
  float knee = uThreshold * uSoftKnee + 1e-5;
  float soft = clamp(br - uThreshold + knee, 0.0, 2.0 * knee);
  soft = soft * soft / (4.0 * knee);
  float w = max(soft, br - uThreshold) / max(br, 1e-5);
  return c * w;
}

void main() {
  vec2 t = uTexel;
  vec3 a = texture(uSource, vUV + t * vec2(-2.0,  2.0)).rgb;
  vec3 b = texture(uSource, vUV + t * vec2( 0.0,  2.0)).rgb;
  vec3 c = texture(uSource, vUV + t * vec2( 2.0,  2.0)).rgb;
  vec3 d = texture(uSource, vUV + t * vec2(-2.0,  0.0)).rgb;
  vec3 e = texture(uSource, vUV                       ).rgb;
  vec3 f = texture(uSource, vUV + t * vec2( 2.0,  0.0)).rgb;
  vec3 g = texture(uSource, vUV + t * vec2(-2.0, -2.0)).rgb;
  vec3 h = texture(uSource, vUV + t * vec2( 0.0, -2.0)).rgb;
  vec3 i = texture(uSource, vUV + t * vec2( 2.0, -2.0)).rgb;
  vec3 j = texture(uSource, vUV + t * vec2(-1.0,  1.0)).rgb;
  vec3 k = texture(uSource, vUV + t * vec2( 1.0,  1.0)).rgb;
  vec3 l = texture(uSource, vUV + t * vec2(-1.0, -1.0)).rgb;
  vec3 m = texture(uSource, vUV + t * vec2( 1.0, -1.0)).rgb;

  vec3 r = e * 0.125;
  r += (a + c + g + i) * 0.03125;
  r += (b + d + f + h) * 0.0625;
  r += (j + k + l + m) * 0.125;
  fragColor = vec4(prefilter(r), 1.0);
}`;

/**
 * Bloom upsample with a 9-tap tent filter.
 *
 * The result is *added* to the destination mip by the fixed-function blender
 * (`ONE, ONE`) rather than by reading the destination in the shader. Sampling
 * and writing the same texture in one draw is undefined behaviour, and the
 * obvious workaround — a scratch target per level — would allocate on every
 * frame. Additive blending avoids both problems.
 */
export const BLOOM_UP_FS = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 fragColor;
uniform sampler2D uSource;   // the smaller mip
uniform vec2 uTexel;         // texel size of the DESTINATION mip
uniform float uRadius;
void main() {
  vec2 t = uTexel * uRadius;
  vec3 s = texture(uSource, vUV + vec2(-t.x,  t.y)).rgb
         + texture(uSource, vUV + vec2( 0.0,  t.y)).rgb * 2.0
         + texture(uSource, vUV + vec2( t.x,  t.y)).rgb
         + texture(uSource, vUV + vec2(-t.x,  0.0)).rgb * 2.0
         + texture(uSource, vUV                    ).rgb * 4.0
         + texture(uSource, vUV + vec2( t.x,  0.0)).rgb * 2.0
         + texture(uSource, vUV + vec2(-t.x, -t.y)).rgb
         + texture(uSource, vUV + vec2( 0.0, -t.y)).rgb * 2.0
         + texture(uSource, vUV + vec2( t.x, -t.y)).rgb;
  fragColor = vec4(s * (1.0 / 16.0), 1.0);
}`;

/**
 * Final composite: exposure, bloom mix, optional anamorphic streaks, chromatic
 * aberration, vignette, grain, tone map, grade, dither.
 */
export const COMPOSITE_FS = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 fragColor;

${MATH}
${NOISE}
${COLOR}

uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform vec2  uResolution;       // size of this tile
uniform vec2  uFullResolution;   // size of the whole image
uniform vec2  uTileOrigin;       // where this tile starts within it
uniform float uExposure;
uniform float uBloomStrength;
uniform int   uTonemap;
uniform float uWhitePoint;
uniform float uVignette;
uniform float uChromatic;
uniform float uGrain;
uniform float uSaturation;
uniform float uContrast;
uniform float uLift;
uniform float uTime;
uniform float uStarburst;   // diffraction spike intensity
uniform float uScanlines;   // stylised "mission telemetry" look, 0 by default

// Lens effects must be measured from the centre of the FULL image, not of the
// tile being rendered. Getting this wrong is invisible on screen (where there
// is only ever one tile) and puts a cross of hard seams through the middle of
// every high-resolution export.
vec3 sampleSceneCA(vec2 uv, vec2 fullUV, float amount) {
  if (amount <= 0.0) return texture(uScene, uv).rgb;
  vec2 dir = fullUV - 0.5;
  float r2 = dot(dir, dir);
  // The offset is applied in tile UV space, scaled so that a given pixel
  // displacement is the same regardless of tile size.
  vec2 off = dir * r2 * amount * 0.02 * (uFullResolution / uResolution);
  return vec3(
    texture(uScene, uv + off).r,
    texture(uScene, uv).g,
    texture(uScene, uv - off).b);
}

void main() {
  // Position within the whole image, which is what every lens-like effect must
  // be a function of.
  vec2 fullUV = (uTileOrigin + vUV * uResolution) / uFullResolution;
  vec3 c = sampleSceneCA(vUV, fullUV, uChromatic);
  vec3 bloom = texture(uBloom, vUV).rgb;

  if (uStarburst > 0.0) {
    // Six-point diffraction spikes sampled from the bloom pyramid — the shape a
    // three-vane secondary support produces, i.e. what a space telescope image
    // actually looks like.
    // Sampled along each spike with a geometrically increasing step and a
    // matching 1/d weight, so a handful of taps covers a smooth streak without
    // the bead-string a linear step produces.
    //
    // The spike length is capped at a fraction of the frame and every sample is
    // rejected once it leaves the frame. Both matter: uBloom is CLAMP_TO_EDGE,
    // so a tap that walks off the edge silently returns the border texel, and a
    // long enough spike smears that border across a large rectangle of the
    // image — which the exposure control then multiplies by up to 1600.
    vec3 spikes = vec3(0.0);
    float norm = 1e-3;
    // Spike length is a property of the image, not of the tile.
    float maxLen = min(uFullResolution.x, uFullResolution.y) * 0.10;
    for (int s = 0; s < 3; s++) {
      float a = float(s) * (PI / 3.0) + 0.5236;
      vec2 dir = vec2(cos(a), sin(a)) / uResolution;
      float d = 2.0;
      for (int k = 0; k < 14; k++) {
        if (d > maxLen) break;
        float w = 1.0 / (1.0 + d * 0.16);
        vec2 pa = vUV + dir * d;
        vec2 pb = vUV - dir * d;
        if (all(greaterThanEqual(pa, vec2(0.0))) && all(lessThanEqual(pa, vec2(1.0)))) {
          spikes += texture(uBloom, pa).rgb * w;
        }
        if (all(greaterThanEqual(pb, vec2(0.0))) && all(lessThanEqual(pb, vec2(1.0)))) {
          spikes += texture(uBloom, pb).rgb * w;
        }
        norm += 2.0 * w;
        d *= 1.38;
      }
    }
    bloom += spikes * (0.75 * uStarburst / norm);
  }

  c += bloom * uBloomStrength;
  c *= uExposure;

  // Vignette (cos^4 falloff, the physical form for a simple lens).
  if (uVignette > 0.0) {
    vec2 d = (fullUV - 0.5) * vec2(uFullResolution.x / uFullResolution.y, 1.0);
    float v = 1.0 - uVignette * saturate(dot(d, d) * 1.1);
    c *= max(v, 0.0);
  }

  c = applyTonemap(c, uTonemap, uWhitePoint);

  // Grade in display space.
  float l = luma(c);
  c = mix(vec3(l), c, uSaturation);
  c = (c - 0.5) * uContrast + 0.5 + uLift;
  c = saturate(c);

  if (uGrain > 0.0) {
    float n = hash13(vec3(gl_FragCoord.xy, floor(uTime * 24.0))) - 0.5;
    c += n * uGrain * 0.06 * (1.0 - l * 0.7);
  }

  if (uScanlines > 0.0) {
    float s = 0.5 + 0.5 * sin(vUV.y * uResolution.y * PI);
    c *= mix(1.0, 0.88 + 0.12 * s, uScanlines);
  }

  c = linearToSRGB(saturate(c));
  c += ignDither(gl_FragCoord.xy) * (1.0 / 255.0);
  fragColor = vec4(saturate(c), 1.0);
}`;

/**
 * Star pass: the Bright Star Catalogue as point sprites.
 *
 * Stars are drawn rather than sampled from the sky texture because a texture
 * has a fixed angular resolution and the camera does not — see the note in
 * astro/stars.js. A point sprite is the same two pixels across whether the
 * field of view is 80 degrees or 0.8, which is what a star should be.
 *
 * The direction is projected by hand instead of going through a view-projection
 * matrix: the star is at infinity, so the translation column is meaningless and
 * multiplying a unit vector by a large radius only to divide it out again
 * throws away mantissa for nothing.
 *
 * Occlusion is the fixed-function blender's job. The ray tracer writes coverage
 * into destination alpha, and this pass is drawn with a source factor of
 * ONE_MINUS_DST_ALPHA, so a star behind Jupiter contributes exactly zero and a
 * star behind Saturn's C ring contributes what the ring lets through. No depth
 * buffer, no sorting.
 */
export const STAR_VS = /* glsl */ `#version 300 es
precision highp float;
layout(location = 0) in vec3 aDir;      // unit vector, ecliptic frame
layout(location = 1) in vec4 aTint;     // rgb = blackbody colour, a = flux

uniform vec3 uCamRight;
uniform vec3 uCamUp;
uniform vec3 uCamFwd;
uniform float uTanHalfFov;
uniform float uAspect;
uniform vec2 uJitter;                   // sub-pixel, matched to the ray tracer
uniform vec2 uResolution;               // full frame, pixels
uniform vec2 uTileOrigin;               // pixels
uniform vec2 uTileSize;                 // pixels
uniform float uGain;
uniform float uSizeScale;               // device pixels per rendered pixel
uniform float uSizeMax;

out vec3 vColor;

void main() {
  float z = dot(aDir, uCamFwd);
  // Behind the camera, or on the plane through it: park the vertex outside the
  // clip volume. Dividing by z there would produce a garbage position that can
  // still land on screen.
  if (z <= 1e-5) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    vColor = vec3(0.0);
    return;
  }

  float x = dot(aDir, uCamRight) / (z * uTanHalfFov * uAspect);
  float y = dot(aDir, uCamUp) / (z * uTanHalfFov);

  // Full-frame pixel coordinates, jittered exactly as the ray tracer jitters,
  // so accumulation antialiases the points instead of fighting them.
  vec2 pix = (vec2(x, y) * 0.5 + 0.5) * uResolution + uJitter;
  vec2 ndc = ((pix - uTileOrigin) / uTileSize) * 2.0 - 1.0;
  gl_Position = vec4(ndc, 0.0, 1.0);

  vColor = aTint.rgb * aTint.a * uGain;

  // Bright stars are drawn slightly larger, which is what a real optical system
  // does — the core saturates and the wings rise above the noise. The growth is
  // logarithmic, so Sirius is about three times Vega's diameter, not 100.
  //
  // Sized from the star's own flux, deliberately, and NOT from the gain. The
  // gain carries a 1/exposure factor that swings by four orders of magnitude
  // between a wide system view and a close approach to the Sun; folding that
  // into the size makes every star inflate into a disc the moment the exposure
  // closes. Apparent size is a property of the star and the optics, not of how
  // the shot is metered.
  //
  // The quad is deliberately wider than the star should look. The visible core
  // is set by uFalloff and comes out near 1.5 pixels for the faintest stars;
  // the extra width is what the Gaussian needs in order to antialias, and what
  // the sub-pixel jitter needs in order to average into a round point rather
  // than a hard square. Too narrow and a rich field turns into aliased blocks;
  // too wide and it turns into confetti, which is the failure mode this whole
  // pass exists to avoid.
  gl_PointSize = clamp((2.0 + 0.50 * log(1.0 + aTint.a * 40.0)) * uSizeScale, 2.0, uSizeMax);
}`;

export const STAR_FS = /* glsl */ `#version 300 es
precision highp float;
in vec3 vColor;
out vec4 fragColor;
uniform float uFalloff;

void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(p, p);
  if (r2 > 1.0) discard;
  // Gaussian core normalised so the total energy is independent of the sprite
  // size: a bigger sprite spreads the same flux further rather than adding any.
  float g = exp(-r2 * uFalloff) * uFalloff * 0.32;
  // Alpha stays zero. Coverage belongs to the ray tracer; a star must not make
  // the pixel behind it any more opaque than the geometry already did.
  fragColor = vec4(vColor * g, 0.0);
}`;

/**
 * Vector overlay pass: orbit paths, grids, and selection rings.
 *
 * Drawn as real geometry (line strips) into the HDR buffer before tone mapping
 * so the lines pick up bloom and grade with the rest of the image, which keeps
 * the UI from looking pasted on.
 */
export const LINE_VS = /* glsl */ `#version 300 es
precision highp float;
layout(location = 0) in vec3 aPos;      // Mm, camera-relative
layout(location = 1) in float aParam;   // 0..1 along the path
uniform mat4 uViewProj;
uniform float uFadeNear;
uniform float uFadeFar;
out float vParam;
out float vFade;
void main() {
  vec4 clip = uViewProj * vec4(aPos, 1.0);
  gl_Position = clip;
  vParam = aParam;
  float d = length(aPos);
  vFade = clamp((uFadeFar - d) / max(uFadeFar - uFadeNear, 1e-3), 0.0, 1.0);
  gl_PointSize = 2.0;
}`;

export const LINE_FS = /* glsl */ `#version 300 es
precision highp float;
in float vParam;
in float vFade;
out vec4 fragColor;
uniform vec3 uColor;
uniform float uOpacity;
uniform float uHead;      // position of the body along its own path, 0..1
uniform float uComet;     // 0 = uniform line, 1 = brighter approaching the body
void main() {
  float a = uOpacity * vFade;
  if (uComet > 0.5) {
    float d = vParam - uHead;
    d -= floor(d + 0.5);                 // shortest signed distance on a loop
    a *= 0.20 + 0.80 * exp(-abs(d) * 9.0);
  }
  if (a <= 0.002) discard;
  fragColor = vec4(uColor * a, a);
}`;
