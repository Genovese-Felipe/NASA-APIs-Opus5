/**
 * The label overlay.
 *
 * Labels are DOM elements positioned over the canvas, never text drawn into
 * WebGL. That one decision buys a great deal: correct shaping for Arabic and
 * Devanagari, per-language font fallback, selectable text, real hit targets,
 * and screen-reader access — none of which a texture atlas of glyphs would
 * give.
 *
 * Elements are pooled and reused between frames, so a scene with thirty bodies
 * does not churn the DOM sixty times a second.
 *
 * @module ui/labels
 */

import { project } from '../render/camera.js';
import { t } from './i18n.js';

/** Megametres per kilometre. */
const MM = 1000;

export class LabelLayer {
  /**
   * @param {HTMLElement} host
   * @param {import('./app.js').App} app
   */
  constructor(host, app) {
    this.host = host;
    this.app = app;
    /** @type {Map<string, HTMLElement>} */
    this.pool = new Map();
    this._lastUpdate = 0;
  }

  /**
   * Reposition every visible label.
   * @param {import('../astro/ephemeris.js').SceneState} scene
   * @param {import('../render/camera.js').Camera} camera
   */
  update(scene, camera) {
    if (!this.app.renderer.settings.showLabels) {
      if (this.host.childElementCount) this.host.textContent = '';
      this.pool.clear();
      return;
    }

    // Labels do not need to move at the render frame rate; a 20 Hz update is
    // indistinguishable and costs a third as much layout.
    const now = performance.now();
    if (now - this._lastUpdate < 45) return;
    this._lastUpdate = now;

    const rect = this.host.getBoundingClientRect();
    const aspect = rect.width / rect.height;
    const vp = camera.viewProjection(aspect);
    const seen = new Set();

    /** @type {Array<{id:string, x:number, y:number, dist:number, dim:boolean}>} */
    const candidates = [];

    for (const body of scene.bodies) {
      if (body.kind === 'smallbody') continue;
      const rel = camera.relative(body.pos);
      const p = project(rel, vp);
      if (!p || p.x < -1.05 || p.x > 1.05 || p.y < -1.05 || p.y > 1.05) continue;

      const distMm = Math.hypot(rel[0], rel[1], rel[2]);
      const angular = body.radiusKm / MM / Math.max(distMm, 1e-6);
      const pixelAngle = (2 * Math.tan(camera.effectiveFov / 2)) / rect.height;
      const pixels = angular / pixelAngle;

      // A body that is a speck is still worth labelling; one that fills the
      // screen does not need a label pinned to its centre.
      if (pixels > rect.height * 0.55) continue;
      const isFocus = body.id === camera.focus;
      const dim = !isFocus && body.kind === 'moon' && pixels < 3;
      if (body.kind === 'moon' && pixels < 1.2 && !isFocus) continue;

      candidates.push({
        id: body.id,
        x: (p.x * 0.5 + 0.5) * rect.width,
        // Offset above the body so the label does not sit on top of it.
        y: (0.5 - p.y * 0.5) * rect.height - Math.min(28, Math.max(12, pixels * 0.6 + 12)),
        dist: distMm,
        dim,
        focus: isFocus,
      });
    }

    // Nearest first, so overlap resolution keeps the label you care about.
    candidates.sort((a, b) => a.dist - b.dist);

    /** @type {Array<{x:number,y:number}>} */
    const placed = [];
    for (const c of candidates) {
      // Drop a label that would collide with one already placed.
      if (placed.some((p) => Math.abs(p.x - c.x) < 74 && Math.abs(p.y - c.y) < 15)) continue;
      placed.push(c);
      seen.add(c.id);

      let node = this.pool.get(c.id);
      if (!node) {
        node = document.createElement('button');
        node.type = 'button';
        node.className = 'label';
        node.addEventListener('click', () => this.app.focus(c.id));
        const dot = document.createElement('span');
        dot.className = 'label__dot';
        const text = document.createElement('span');
        text.className = 'label__text';
        node.append(dot, text);
        this.pool.set(c.id, node);
        this.host.appendChild(node);
      }
      node.querySelector('.label__text').textContent = t(`body.${c.id}`);
      node.className = `label${c.dim ? ' label--dim' : ''}${c.focus ? ' label--focus' : ''}`;
      node.style.transform = `translate(-50%, -50%) translate(${c.x.toFixed(1)}px, ${c.y.toFixed(1)}px)`;
      node.style.display = '';
    }

    for (const [id, node] of this.pool) {
      if (!seen.has(id)) node.style.display = 'none';
    }
  }

  /** Remove every label. */
  clear() {
    this.host.textContent = '';
    this.pool.clear();
  }
}
