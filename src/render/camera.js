/**
 * Camera model and navigation.
 *
 * The camera always works in **camera-relative** coordinates: the renderer is
 * handed body positions already offset by the camera position, so the shader's
 * origin is the eye. That single decision is what makes a scene 4.5 billion km
 * across render without floating-point cracks.
 *
 * Three navigation modes:
 *  - `orbit`   — spherical orbit about a focused body (the default; this is
 *                what "orbit mode" means in the UI).
 *  - `free`    — six-degree-of-freedom flight, speed scaled by proximity.
 *  - `chase`   — locked into the focused body's orbital frame, so you travel
 *                with it and watch the rest of the system wheel past.
 *
 * @module render/camera
 */

const MM = 1000; // 1 megametre = 1000 km

/** Clamp helper. @private */
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** Shortest signed angular difference. @private */
function angleDelta(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/**
 * Critically-damped spring interpolation. Frame-rate independent and free of
 * the overshoot that makes naive lerp-based cameras feel loose.
 * @param {number} current
 * @param {number} target
 * @param {number} dt Seconds.
 * @param {number} halfLife Seconds to close half the gap.
 * @returns {number}
 */
export function damp(current, target, dt, halfLife) {
  if (halfLife <= 0) return target;
  return target + (current - target) * Math.pow(2, -dt / halfLife);
}

export class Camera {
  constructor() {
    /** @type {'orbit'|'free'|'chase'} */
    this.mode = 'orbit';
    /** Focused body id. */
    this.focus = 'earth';
    /** Position in km, heliocentric ecliptic (double precision). */
    this.position = new Float64Array([0, 0, 0]);
    /** Point the camera looks at, km. */
    this.target = new Float64Array([0, 0, 0]);

    /** Orbit distance from the focus surface, in body radii. */
    this.distanceRadii = 6;
    /** Azimuth about the focus, radians. */
    this.yaw = 0.6;
    /** Elevation, radians, clamped away from the poles. */
    this.pitch = 0.35;
    /** Camera roll, radians. */
    this.roll = 0;
    /** Vertical field of view, radians. */
    this.fov = (45 * Math.PI) / 180;

    // Smoothed values actually used for rendering.
    this._distance = 6;
    this._yaw = 0.6;
    this._pitch = 0.35;
    this._roll = 0;
    this._fov = this.fov;
    this._focusPos = new Float64Array([0, 0, 0]);
    this._focusRadius = 6378;

    /** Free-flight velocity, km/s. */
    this.velocity = new Float64Array([0, 0, 0]);
    /** Free-flight orientation. */
    this.freeYaw = 0;
    this.freePitch = 0;

    /** Set when the view changed this frame; resets accumulation. */
    this.dirty = true;

    /** Cinematic auto-orbit rate, radians/second. */
    this.autoOrbit = 0;

    /** @type {null|{fromFocus:string,toFocus:string,t:number,dur:number,fromDist:number,toDist:number}} */
    this._transition = null;

    // Derived basis, recomputed every update.
    this.right = new Float64Array([1, 0, 0]);
    this.up = new Float64Array([0, 1, 0]);
    this.forward = new Float64Array([0, 0, -1]);
  }

  /**
   * Focus a body, animating the move.
   * @param {string} id
   * @param {object} [opts]
   * @param {number} [opts.distanceRadii] Where to settle, in body radii.
   * @param {number} [opts.duration=1.6] Seconds.
   */
  focusOn(id, opts = {}) {
    if (this.focus === id && opts.distanceRadii == null) return;
    this._transition = {
      fromFocus: this.focus,
      toFocus: id,
      t: 0,
      dur: opts.duration ?? 1.6,
      fromDist: this.distanceRadii,
      toDist: opts.distanceRadii ?? 6,
    };
    this.focus = id;
    this.distanceRadii = opts.distanceRadii ?? 6;
    this.dirty = true;
  }

  /**
   * Apply a drag gesture in orbit mode.
   * @param {number} dx Pixels.
   * @param {number} dy Pixels.
   * @param {number} viewportHeight
   */
  drag(dx, dy, viewportHeight) {
    const s = (Math.PI * 1.2) / Math.max(viewportHeight, 1);
    if (this.mode === 'free') {
      this.freeYaw -= dx * s;
      this.freePitch = clamp(this.freePitch - dy * s, -1.55, 1.55);
    } else {
      this.yaw -= dx * s;
      this.pitch = clamp(this.pitch + dy * s, -1.5533, 1.5533);
    }
    this.dirty = true;
  }

  /**
   * Apply a zoom gesture.
   * @param {number} delta Positive = zoom out.
   */
  zoom(delta) {
    this.distanceRadii = clamp(this.distanceRadii * Math.exp(delta * 0.0016), 1.02, 4.0e7);
    this.dirty = true;
  }

  /**
   * Adjust the field of view (separate from zoom — this changes perspective,
   * which is how you get a "compressed" telephoto look).
   * @param {number} deg
   */
  setFov(deg) {
    this.fov = clamp((deg * Math.PI) / 180, (3 * Math.PI) / 180, (110 * Math.PI) / 180);
    this.dirty = true;
  }

  /**
   * Advance the camera.
   * @param {number} dt Real seconds.
   * @param {import('../astro/ephemeris.js').SceneState} scene
   * @param {object} [input] Free-flight input axes in [-1,1].
   * @param {number} [smoothing=1] 0 disables smoothing (needed for exact export).
   */
  update(dt, scene, input = null, smoothing = 1) {
    const body = scene.byId.get(this.focus) || scene.byId.get('sun');
    const radius = body ? body.radiusKm : 6378;

    let fx = body ? body.pos[0] : 0;
    let fy = body ? body.pos[1] : 0;
    let fz = body ? body.pos[2] : 0;

    // Interpolate the focus point during a transition so the camera sweeps
    // between worlds instead of teleporting.
    if (this._transition) {
      const tr = this._transition;
      tr.t += dt;
      // A zero-duration transition is a snap, not a divide by zero. Without
      // this guard k becomes NaN, which propagates into the focus position and
      // then into every ray — a completely black frame from one bad divide.
      const k = tr.dur > 0 ? clamp(tr.t / tr.dur, 0, 1) : 1;
      // Smootherstep: zero first *and* second derivative at both ends.
      const s = k * k * k * (k * (k * 6 - 15) + 10);
      const from = scene.byId.get(tr.fromFocus);
      if (from) {
        fx = from.pos[0] + (fx - from.pos[0]) * s;
        fy = from.pos[1] + (fy - from.pos[1]) * s;
        fz = from.pos[2] + (fz - from.pos[2]) * s;
      }
      if (k >= 1) this._transition = null;
      this.dirty = true;
    }

    if (this.autoOrbit !== 0) {
      this.yaw += this.autoOrbit * dt;
      this.dirty = true;
    }

    const hl = smoothing > 0 ? 0.09 * smoothing : 0;
    this._focusPos[0] = damp(this._focusPos[0], fx, dt, hl);
    this._focusPos[1] = damp(this._focusPos[1], fy, dt, hl);
    this._focusPos[2] = damp(this._focusPos[2], fz, dt, hl);
    this._focusRadius = damp(this._focusRadius, radius, dt, hl);

    // With smoothing off (exports, recordings, reduced motion) every smoothed
    // value must land exactly on its target in one step, including at dt = 0.
    this._yaw = hl > 0
      ? this._yaw + angleDelta(this._yaw, this.yaw) * (1 - Math.pow(2, -dt / hl))
      : this.yaw;
    this._pitch = damp(this._pitch, this.pitch, dt, hl);
    this._roll = damp(this._roll, this.roll, dt, hl);
    this._fov = damp(this._fov, this.fov, dt, hl);
    // Distance is smoothed in log space so zooming feels uniform across 7
    // orders of magnitude.
    this._distance = Math.exp(damp(Math.log(this._distance), Math.log(this.distanceRadii), dt, hl));

    if (this.mode === 'free' && input) {
      this._updateFree(dt, input);
    } else {
      this._updateOrbit(radius);
    }

    this._buildBasis();
  }

  /** @private */
  _updateOrbit(radius) {
    const dist = this._distance * Math.max(this._focusRadius, 1);
    const cp = Math.cos(this._pitch);
    this.position[0] = this._focusPos[0] + dist * cp * Math.cos(this._yaw);
    this.position[1] = this._focusPos[1] + dist * cp * Math.sin(this._yaw);
    this.position[2] = this._focusPos[2] + dist * Math.sin(this._pitch);
    this.target[0] = this._focusPos[0];
    this.target[1] = this._focusPos[1];
    this.target[2] = this._focusPos[2];
    void radius;
  }

  /** @private */
  _updateFree(dt, input) {
    // Speed scales with how far the nearest interesting thing is, so the same
    // key feels right whether you are skimming Enceladus or crossing the
    // Kuiper belt.
    const scale = Math.max(this._distance * this._focusRadius, 100);
    const speed = scale * (input.boost ? 4 : 1) * 0.9;

    const cy = Math.cos(this.freeYaw);
    const sy = Math.sin(this.freeYaw);
    const cp = Math.cos(this.freePitch);
    const sp = Math.sin(this.freePitch);
    const fwd = [cp * cy, cp * sy, sp];
    const right = [-sy, cy, 0];
    const up = [
      right[1] * fwd[2] - right[2] * fwd[1],
      right[2] * fwd[0] - right[0] * fwd[2],
      right[0] * fwd[1] - right[1] * fwd[0],
    ];

    const ax = (input.forward || 0) * speed;
    const ay = (input.strafe || 0) * speed;
    const az = (input.lift || 0) * speed;

    for (let i = 0; i < 3; i++) {
      this.velocity[i] = damp(this.velocity[i], fwd[i] * ax + right[i] * ay + up[i] * az, dt, 0.18);
      this.position[i] += this.velocity[i] * dt;
      this.target[i] = this.position[i] + fwd[i] * scale;
    }
    if (ax || ay || az) this.dirty = true;
  }

  /** @private */
  _buildBasis() {
    let fx = this.target[0] - this.position[0];
    let fy = this.target[1] - this.position[1];
    let fz = this.target[2] - this.position[2];
    const fl = Math.hypot(fx, fy, fz) || 1;
    fx /= fl; fy /= fl; fz /= fl;

    // World up is the ecliptic north pole, except when looking nearly straight
    // up or down, where we fall back to the previous forward vector to avoid
    // gimbal flip.
    let ux = 0, uy = 0, uz = 1;
    if (Math.abs(fz) > 0.9995) { ux = 0; uy = 1; uz = 0; }

    let rx = fy * uz - fz * uy;
    let ry = fz * ux - fx * uz;
    let rz = fx * uy - fy * ux;
    const rl = Math.hypot(rx, ry, rz) || 1;
    rx /= rl; ry /= rl; rz /= rl;

    let vx = ry * fz - rz * fy;
    let vy = rz * fx - rx * fz;
    let vz = rx * fy - ry * fx;

    if (this._roll !== 0) {
      const c = Math.cos(this._roll);
      const s = Math.sin(this._roll);
      const nrx = rx * c + vx * s;
      const nry = ry * c + vy * s;
      const nrz = rz * c + vz * s;
      vx = -rx * s + vx * c;
      vy = -ry * s + vy * c;
      vz = -rz * s + vz * c;
      rx = nrx; ry = nry; rz = nrz;
    }

    this.forward[0] = fx; this.forward[1] = fy; this.forward[2] = fz;
    this.right[0] = rx; this.right[1] = ry; this.right[2] = rz;
    this.up[0] = vx; this.up[1] = vy; this.up[2] = vz;
  }

  /** @returns {number} Effective vertical FOV in radians. */
  get effectiveFov() {
    return this._fov;
  }

  /** @returns {number} Distance from the camera to the focus centre, km. */
  get focusDistance() {
    return Math.hypot(
      this.position[0] - this._focusPos[0],
      this.position[1] - this._focusPos[1],
      this.position[2] - this._focusPos[2]
    );
  }

  /**
   * Build a view-projection matrix for the vector overlay pass.
   *
   * Positions fed to this matrix must already be camera-relative and expressed
   * in megametres. A reversed-Z infinite projection is used: near-plane
   * precision is what matters when you are 100 m above a moon while Neptune is
   * still in frame.
   *
   * @param {number} aspect
   * @param {number} [near=1e-5] Near plane in Mm.
   * @returns {Float32Array} 4x4 column-major.
   */
  viewProjection(aspect, near = 1e-5) {
    const f = 1 / Math.tan(this._fov / 2);
    const r = this.right;
    const u = this.up;
    const d = this.forward;

    // View matrix for a camera at the origin looking down `forward`.
    const view = [
      r[0], u[0], -d[0], 0,
      r[1], u[1], -d[1], 0,
      r[2], u[2], -d[2], 0,
      0, 0, 0, 1,
    ];
    // Infinite far plane, standard OpenGL depth range.
    const proj = [
      f / aspect, 0, 0, 0,
      0, f, 0, 0,
      0, 0, -1, -1,
      0, 0, -2 * near, 0,
    ];
    return multiply4(proj, view);
  }

  /**
   * Camera-relative position of a world point, in megametres.
   * @param {ArrayLike<number>} worldKm
   * @param {Float32Array} [out]
   * @returns {Float32Array}
   */
  relative(worldKm, out = new Float32Array(3)) {
    out[0] = (worldKm[0] - this.position[0]) / MM;
    out[1] = (worldKm[1] - this.position[1]) / MM;
    out[2] = (worldKm[2] - this.position[2]) / MM;
    return out;
  }

  /** Serialise the view for permalinks and bookmarks. */
  toJSON() {
    return {
      mode: this.mode,
      focus: this.focus,
      d: +this.distanceRadii.toFixed(4),
      y: +this.yaw.toFixed(5),
      p: +this.pitch.toFixed(5),
      r: +this.roll.toFixed(5),
      f: +((this.fov * 180) / Math.PI).toFixed(2),
    };
  }

  /** @param {object} j */
  fromJSON(j) {
    if (!j) return;
    if (j.mode) this.mode = j.mode;
    if (j.focus) this.focus = j.focus;
    if (Number.isFinite(j.d)) this.distanceRadii = this._distance = j.d;
    if (Number.isFinite(j.y)) this.yaw = this._yaw = j.y;
    if (Number.isFinite(j.p)) this.pitch = this._pitch = j.p;
    if (Number.isFinite(j.r)) this.roll = this._roll = j.r;
    if (Number.isFinite(j.f)) this.setFov(j.f);
    this.dirty = true;
  }
}

/**
 * Multiply two column-major 4x4 matrices.
 * @param {ArrayLike<number>} a
 * @param {ArrayLike<number>} b
 * @returns {Float32Array}
 */
export function multiply4(a, b) {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      o[c * 4 + r] =
        a[0 * 4 + r] * b[c * 4 + 0] +
        a[1 * 4 + r] * b[c * 4 + 1] +
        a[2 * 4 + r] * b[c * 4 + 2] +
        a[3 * 4 + r] * b[c * 4 + 3];
    }
  }
  return o;
}

/**
 * Project a camera-relative point (Mm) to normalised device coordinates.
 * Returns null when the point is behind the camera.
 * @param {ArrayLike<number>} rel
 * @param {Float32Array} viewProj
 * @returns {{x:number,y:number,z:number}|null}
 */
export function project(rel, viewProj) {
  const x = viewProj[0] * rel[0] + viewProj[4] * rel[1] + viewProj[8] * rel[2] + viewProj[12];
  const y = viewProj[1] * rel[0] + viewProj[5] * rel[1] + viewProj[9] * rel[2] + viewProj[13];
  const z = viewProj[2] * rel[0] + viewProj[6] * rel[1] + viewProj[10] * rel[2] + viewProj[14];
  const w = viewProj[3] * rel[0] + viewProj[7] * rel[1] + viewProj[11] * rel[2] + viewProj[15];
  if (w <= 1e-9) return null;
  return { x: x / w, y: y / w, z: z / w };
}
