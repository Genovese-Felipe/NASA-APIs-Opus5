/**
 * GLSL fragments shared by several passes.
 *
 * Kept as JavaScript template strings so the whole project runs from source on
 * GitHub Pages with no build step. Each export is a self-contained chunk with
 * no `#version` directive — the consuming shader supplies that.
 *
 * @module render/shaders/common
 */

/** Mathematical constants and small helpers. */
export const MATH = /* glsl */ `
const float PI      = 3.141592653589793;
const float TWO_PI  = 6.283185307179586;
const float INV_PI  = 0.3183098861837907;
const float EPS     = 1e-4;
const float INF     = 1e30;

float saturate(float x) { return clamp(x, 0.0, 1.0); }
vec3  saturate(vec3 x)  { return clamp(x, 0.0, 1.0); }
float pow5(float x)     { float y = x * x; return y * y * x; }
float sq(float x)       { return x * x; }

// Smooth minimum, used to blend procedural terrain features without creases.
float smin(float a, float b, float k) {
  float h = saturate(0.5 + 0.5 * (b - a) / k);
  return mix(b, a, h) - k * h * (1.0 - h);
}

// Luminance under the Rec.709 primaries.
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
`;

/**
 * Hashing and noise.
 *
 * Uses the integer-hash family from Jarzynski & Olano, "Hash Functions for GPU
 * Rendering" (JCGT 2020) — pcg3d is fast and passes the statistical tests that
 * the classic `fract(sin(dot(...)))` hash fails badly, which matters because we
 * use these hashes for stochastic sampling, not just for texture noise.
 */
export const NOISE = /* glsl */ `
uvec3 pcg3d(uvec3 v) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  v ^= v >> 16u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  return v;
}
vec3 hash33(vec3 p) {
  return vec3(pcg3d(uvec3(ivec3(floor(p * 1024.0)) + 8388608))) * (1.0 / 4294967296.0);
}
float hash13(vec3 p) { return hash33(p).x; }

// Value noise with quintic interpolation (C2 continuous -> no derivative
// artefacts when we take gradients for bump mapping).
float vnoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float n000 = hash13(i + vec3(0,0,0));
  float n100 = hash13(i + vec3(1,0,0));
  float n010 = hash13(i + vec3(0,1,0));
  float n110 = hash13(i + vec3(1,1,0));
  float n001 = hash13(i + vec3(0,0,1));
  float n101 = hash13(i + vec3(1,0,1));
  float n011 = hash13(i + vec3(0,1,1));
  float n111 = hash13(i + vec3(1,1,1));
  return mix(mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y),
             mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y), u.z);
}

float fbm(vec3 p, int octaves, float lacunarity, float gain) {
  float sum = 0.0, amp = 0.5, norm = 0.0;
  for (int i = 0; i < 12; i++) {
    if (i >= octaves) break;
    sum += amp * vnoise(p);
    norm += amp;
    p *= lacunarity;
    amp *= gain;
  }
  return sum / max(norm, 1e-5);
}

// Ridged multifractal — the classic generator for mountain ranges and the
// filament structure in gas-giant bands.
float ridged(vec3 p, int octaves, float lacunarity, float gain) {
  float sum = 0.0, amp = 0.5, norm = 0.0, prev = 1.0;
  for (int i = 0; i < 12; i++) {
    if (i >= octaves) break;
    float n = 1.0 - abs(vnoise(p) * 2.0 - 1.0);
    n *= n * prev;
    prev = n;
    sum += amp * n;
    norm += amp;
    p *= lacunarity;
    amp *= gain;
  }
  return sum / max(norm, 1e-5);
}

// Worley / cellular noise — craters, ice floes, convection cells.
float worley(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  float d = 1.0;
  for (int z = -1; z <= 1; z++)
  for (int y = -1; y <= 1; y++)
  for (int x = -1; x <= 1; x++) {
    vec3 g = vec3(float(x), float(y), float(z));
    vec3 o = hash33(i + g);
    d = min(d, length(g + o - f));
  }
  return d;
}

// Low-discrepancy sequence for stratified sampling.
float radicalInverse(uint bits) {
  bits = (bits << 16u) | (bits >> 16u);
  bits = ((bits & 0x55555555u) << 1u) | ((bits & 0xAAAAAAAAu) >> 1u);
  bits = ((bits & 0x33333333u) << 2u) | ((bits & 0xCCCCCCCCu) >> 2u);
  bits = ((bits & 0x0F0F0F0Fu) << 4u) | ((bits & 0xF0F0F0F0u) >> 4u);
  bits = ((bits & 0x00FF00FFu) << 8u) | ((bits & 0xFF00FF00u) >> 8u);
  return float(bits) * 2.3283064365386963e-10;
}
vec2 hammersley(uint i, uint n) {
  return vec2(float(i) / float(n), radicalInverse(i));
}
`;

/** Colour space conversions and tone mapping operators. */
export const COLOR = /* glsl */ `
vec3 linearToSRGB(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(max(c, 1e-5), vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
vec3 srgbToLinear(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
}

// ACES filmic tone mapping, Narkowicz's fitted curve. Punchy, saturated
// highlights — the look most space imagery is graded towards.
vec3 tonemapACES(vec3 x) {
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return saturate((x * (a * x + b)) / (x * (c * x + d) + e));
}

// AgX-style tone mapping: desaturates towards white far more gracefully than
// ACES, which keeps the solar disc from turning into a magenta blob.
vec3 tonemapAgX(vec3 x) {
  const mat3 agxIn = mat3(
    0.8425640, 0.0784336, 0.0792237,
    0.0423241, 0.8784686, 0.0791661,
    0.0423704, 0.0784336, 0.8791430);
  const mat3 agxOut = mat3(
     1.1968790, -0.0980210, -0.0990297,
    -0.0528968,  1.1519110, -0.0989631,
    -0.0529716, -0.0980432,  1.1509930);
  vec3 v = agxIn * max(x, vec3(0.0));
  // Log2 encode over a 16.5-stop range centred to taste.
  const float minEv = -12.47393, maxEv = 4.026069;
  v = clamp(log2(max(v, vec3(1e-10))), minEv, maxEv);
  v = (v - minEv) / (maxEv - minEv);
  // Sigmoid approximation of the AgX contrast curve.
  vec3 v2 = v * v, v4 = v2 * v2;
  v = 15.5 * v4 * v2 - 40.14 * v4 * v + 31.96 * v4 - 6.868 * v2 * v
      + 0.4298 * v2 + 0.1191 * v - 0.00232;
  return saturate(agxOut * v);
}

// Reinhard extended — the gentlest option, useful when the user wants to read
// faint detail rather than see a cinematic image.
vec3 tonemapReinhard(vec3 x, float whitePoint) {
  float w2 = whitePoint * whitePoint;
  return saturate((x * (1.0 + x / w2)) / (1.0 + x));
}

vec3 applyTonemap(vec3 c, int mode, float whitePoint) {
  if (mode == 0) return tonemapAgX(c);
  if (mode == 1) return tonemapACES(c);
  if (mode == 2) return tonemapReinhard(c, whitePoint);
  return saturate(c); // 3 = clip, for scientific/linear inspection
}

// Dithering before 8-bit quantisation. Removes the banding that is otherwise
// very visible in the smooth gradients of an atmosphere limb.
//
// Interleaved Gradient Noise (Jimenez, "Next Generation Post Processing in
// Call of Duty: Advanced Warfare", SIGGRAPH 2014). Preferred over a Bayer
// matrix here because it has no visible periodic structure at 4K and above,
// and over white noise because its spectrum is closer to blue.
float ignDither(vec2 p) {
  return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))) - 0.5;
}
`;

/** Ray/primitive intersection routines. */
export const INTERSECT = /* glsl */ `
// Ray-sphere intersection with the numerically stable quadratic form.
// Naively computing (-b - sqrt(disc)) / 2a catastrophically cancels when the
// ray origin is far from the sphere, which is exactly our situation: a camera
// a billion kilometres from a 25000 km planet. Using the product of the roots
// (t0 * t1 = c / a) to recover the near root keeps full precision.
// Returns the two roots in 't', or false when there is no hit.
bool intersectSphere(vec3 ro, vec3 rd, vec3 centre, float radius, out vec2 t) {
  vec3 oc = ro - centre;
  float b = dot(oc, rd);
  float c = dot(oc, oc) - radius * radius;
  float h = b * b - c;
  if (h < 0.0) return false;
  h = sqrt(h);
  float q = (b >= 0.0) ? (-b - h) : (-b + h);
  float t0 = q;
  float t1 = c / q;
  t = vec2(min(t0, t1), max(t0, t1));
  return true;
}

// Oblate spheroid: scale the ray into a space where the body is a unit sphere,
// intersect, then scale back. 'invRadii' is 1/(a, a, c) in the body frame.
bool intersectSpheroid(vec3 ro, vec3 rd, vec3 invRadii, out vec2 t) {
  vec3 o = ro * invRadii;
  vec3 d = rd * invRadii;
  float a = dot(d, d);
  float b = dot(o, d);
  float c = dot(o, o) - 1.0;
  float h = b * b - a * c;
  if (h < 0.0) return false;
  h = sqrt(h);
  float q = (b >= 0.0) ? (-b - h) : (-b + h);
  float t0 = q / a;
  float t1 = c / q;
  t = vec2(min(t0, t1), max(t0, t1));
  return true;
}

// Ray-plane intersection for ring systems. 'n' must be unit length.
float intersectPlane(vec3 ro, vec3 rd, vec3 n, float d) {
  float denom = dot(rd, n);
  if (abs(denom) < 1e-9) return -1.0;
  return -(dot(ro, n) + d) / denom;
}

// Analytic solid angle subtended by a sphere of radius r at distance dist,
// expressed as the cosine of its angular radius. Used for penumbra sizing.
float angularRadius(float r, float dist) {
  return asin(clamp(r / max(dist, r + 1e-6), 0.0, 1.0));
}
`;

/**
 * Analytic soft-shadow term for a spherical occluder lit by a spherical light.
 *
 * Rather than stochastically sampling the solar disc (which needs many samples
 * to be quiet), we compute the *overlap area of two discs on the sky* — the
 * light disc and the occluder disc — in closed form. This is exact for the
 * geometry we have (spheres lit by a sphere) and gives a perfectly smooth
 * penumbra from a single evaluation, including the annular-eclipse case where
 * a small occluder sits inside a larger light disc.
 *
 * This is why eclipse shadows in the app have physically correct umbra and
 * penumbra widths: at Earth the Sun subtends 0.53 deg, and the Moon's shadow
 * cone narrows to a point almost exactly at Earth's surface.
 */
export const SOFT_SHADOW = /* glsl */ `
// Fraction of a light disc of angular radius R that remains visible when an
// occluder disc of angular radius r has its centre 'd' radians away.
float discOcclusion(float R, float r, float d) {
  if (d >= R + r) return 0.0;               // no overlap
  if (d <= abs(R - r)) {                    // one disc fully inside the other
    return min(1.0, (r * r) / max(R * R, 1e-12));
  }
  float R2 = R * R, r2 = r * r, d2 = d * d;
  float a1 = acos(clamp((d2 + R2 - r2) / (2.0 * d * R), -1.0, 1.0));
  float a2 = acos(clamp((d2 + r2 - R2) / (2.0 * d * r), -1.0, 1.0));
  float tri = 0.5 * sqrt(max(0.0,
      (-d + R + r) * (d + R - r) * (d - R + r) * (d + R + r)));
  float area = R2 * a1 + r2 * a2 - tri;
  return clamp(area / (PI * R2), 0.0, 1.0);
}
`;
