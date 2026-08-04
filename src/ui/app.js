/**
 * The application: wiring, the frame loop, input, and state.
 *
 * Responsibilities are deliberately narrow. This module owns the loop and the
 * mutable state; `panels.js` renders the right-hand panel; `labels.js` owns the
 * DOM overlay; `tours.js` owns scripted camera moves. Nothing here knows how a
 * ray is traced or how an API responds.
 *
 * @module ui/app
 */

import { Renderer } from '../render/raytracer.js';
import { Camera } from '../render/camera.js';
import { QUALITY_PRESETS, QUALITY_BY_ID } from '../render/quality.js';
import { buildScene, addSmallBodies } from '../astro/ephemeris.js';
import { RING_SYSTEMS, BODIES } from '../astro/planets.js';
import { MOONS } from '../astro/moons.js';
import { loadStarCatalogue, buildSkyMap, buildStarPoints } from '../astro/stars.js';
import { SimClock, TIME_RATES, dateToJD, jdToISO } from '../astro/time.js';
import { AU_KM } from '../astro/constants.js';
import { loadSurfaceTextures, loadBaseMaps } from '../data/imagery.js';
import { getNEOFeed, browseNEOs, neosToSmallBodies } from '../data/nasa.js';
import { summarise, onHealthChange } from '../data/health.js';
import { SoundEngine } from '../audio/engine.js';
import { t, setLocale, detectLocale, getLocale, onLocaleChange, applyTranslations, LOCALES, formatDistance, formatUTC, formatNumber } from './i18n.js';
import { renderPanel } from './panels.js';
import { LabelLayer } from './labels.js';
import { TOURS, TourPlayer } from './tours.js';

/** Persisted preferences. */
const PREFS_KEY = 'orrery.prefs';

export class App {
  /**
   * @param {object} refs Pre-queried DOM elements.
   */
  constructor(refs) {
    this.dom = refs;
    this.clock = new SimClock();
    this.camera = new Camera();
    this.audio = new SoundEngine();
    /** @type {import('../astro/ephemeris.js').SceneState|null} */
    this.scene = null;
    /** @type {Array<object>} Live small bodies merged into the scene. */
    this.smallBodies = [];
    this.rateIndex = TIME_RATES.findIndex((r) => r.id === 'realtime');
    this.activePanel = 'body';
    this.uiHidden = false;
    this.running = false;
    this._fpsSamples = [];
    this._lastTime = 0;
    this._input = { forward: 0, strafe: 0, lift: 0, boost: false };
    this._keys = new Set();
    this._pointer = { down: false, id: null, x: 0, y: 0, pinch: 0 };

    this.prefs = this._loadPrefs();
  }

  /**
   * Boot the application.
   * @param {(fraction:number, statusKey:string)=>void} onProgress
   */
  async start(onProgress) {
    onProgress(0.05, 'app.loading');

    await setLocale(this.prefs.locale || detectLocale());
    applyTranslations(document);
    onLocaleChange(() => {
      applyTranslations(document);
      this._buildBodyList();
      this._refreshPanel();
      this._updateClockDisplay();
    });

    // --- renderer -----------------------------------------------------------
    this.renderer = new Renderer(this.dom.canvas, { quality: this.prefs.quality });
    Object.assign(this.renderer.settings, this.prefs.render || {});
    this.renderer.scaler.enabled = this.prefs.adaptive !== false;
    this.renderer.onSurfacesInvalidated = () => this._loadTextures();

    const ringSystems = Object.entries(RING_SYSTEMS).map(([bodyId, bands]) => ({ bodyId, bands }));
    this.renderer.setRingBodies(ringSystems.map((s) => s.bodyId));
    this.renderer.setRings(ringSystems, new Map());

    onProgress(0.2, 'app.loadingStars');

    // --- star field ---------------------------------------------------------
    // Built on the main thread because it is a one-off cost of well under a
    // second and moving it to a worker would mean transferring 64 MB back.
    //
    // Two products from one catalogue: the sky texture carries the Milky Way,
    // which is diffuse and low-frequency and so loses nothing to a texture's
    // fixed angular resolution, and the point buffers carry the stars, which
    // lose everything to it.
    //
    // The stars are scenery. Losing them should cost you the sky, not the
    // application — and because this is the first thing boot fetches, an
    // unguarded await here turns any problem with it into a dead black screen
    // before a single planet has been drawn. That is precisely what happened
    // when a strict Content-Security-Policy blocked the single-file build's
    // data loader: one refused request, and nothing worked at all.
    let catalogue = null;
    try {
      catalogue = await loadStarCatalogue();
    } catch (err) {
      console.warn('Star catalogue unavailable; continuing without it.', err);
    }
    this.starCatalogue = catalogue;
    if (catalogue) {
      const skySize = this.renderer.quality.surfaceTextureSize >= 4096 ? 4096 : 2048;
      this.renderer.setSkyMap(buildSkyMap(catalogue, { width: skySize, height: skySize / 2 }));
      this.renderer.setStars(buildStarPoints(catalogue));
    }

    onProgress(0.55, 'app.loadingData');

    // --- scene --------------------------------------------------------------
    this._rebuildScene();
    this.camera.fromJSON(this._cameraFromUrl() || this.prefs.camera);
    this.camera.update(0, this.scene, null, 0);

    this.labels = new LabelLayer(this.dom.labels, this);
    this.tourPlayer = new TourPlayer(this);

    this._bindUI();
    this._buildBodyList();
    this._refreshPanel();

    onProgress(0.75, 'app.loadingTextures');
    // Textures and live data load in the background; the app is usable without
    // either, which is the entire point of the fallback design.
    this._loadTextures();
    this._loadLiveData();

    onHealthChange(() => this._updateHealthChip());

    onProgress(1, 'app.ready');
    this.running = true;
    this._lastTime = performance.now();
    requestAnimationFrame((ts) => this._frame(ts));
  }

  // -------------------------------------------------------------------------
  // Frame loop
  // -------------------------------------------------------------------------

  /** @private */
  _frame(timestamp) {
    if (!this.running) return;
    const dt = Math.min((timestamp - this._lastTime) / 1000, 0.25);
    this._lastTime = timestamp;
    const frameStart = performance.now();

    this.clock.advance(dt, dateToJD(new Date()));
    if (this.clock.rate !== 0 || !this.scene || Math.abs(this.scene.jd - this.clock.jd) > 1e-9) {
      this._rebuildScene();
    }

    this.tourPlayer.update(dt);
    const smoothing = this.prefs.reducedMotion ? 0 : 1;
    this.camera.update(dt, this.scene, this.camera.mode === 'free' ? this._input : null, smoothing);

    this.renderer.render(this.scene, this.camera, { dt });

    this.labels.update(this.scene, this.camera);
    this._updateClockDisplay();
    this._updateAudio();

    const frameMs = performance.now() - frameStart;
    if (this.renderer.scaler.update(frameMs, dt)) this.renderer.resize();
    this._trackFps(dt, frameMs);

    requestAnimationFrame((ts) => this._frame(ts));
  }

  /** @private */
  _rebuildScene() {
    this.scene = buildScene(this.clock.jd, { moons: true });
    if (this.smallBodies.length) addSmallBodies(this.scene, this.smallBodies, this.clock.jd);
  }

  /** @private */
  _trackFps(dt, frameMs) {
    this._fpsSamples.push(dt);
    if (this._fpsSamples.length > 60) this._fpsSamples.shift();
    if (this._fpsSamples.length < 20) return;
    const now = performance.now();
    if (now - (this._fpsShownAt || 0) < 400) return;
    this._fpsShownAt = now;
    const mean = this._fpsSamples.reduce((a, b) => a + b, 0) / this._fpsSamples.length;
    const fps = Math.round(1 / mean);
    this.dom.fps.textContent = `${fps} fps · ${frameMs.toFixed(1)} ms`;

    const acc = this.renderer.accumulatedFrames;
    const target = this.renderer.quality.accumTarget;
    this.dom.convergence.textContent = acc >= target
      ? t('quality.converged')
      : t('quality.converging', { n: acc });
  }

  /** @private */
  _updateAudio() {
    if (!this.audio.enabled) return;
    const camDist = Math.hypot(
      this.camera.position[0], this.camera.position[1], this.camera.position[2]
    ) / AU_KM;
    this.audio.updateAmbience({
      distanceAu: camDist,
      irradiance: 1 / Math.max(camDist * camDist, 1e-4),
      inAtmosphere: 0,
    });
  }

  // -------------------------------------------------------------------------
  // Data
  // -------------------------------------------------------------------------

  /** @private */
  async _loadTextures() {
    // The committed basemaps first, and awaited: they are local, they are
    // small, and until they are up the planet is procedural noise. Only then
    // does the streamed pyramid start, which may take seconds or never finish.
    try {
      await loadBaseMaps(this.renderer);
      this.renderer.resetAccumulation();
    } catch {
      /* procedural surfaces remain */
    }
    try {
      await loadSurfaceTextures(this.renderer, {
        onState: (key, state) => {
          if (state === 'done') this.renderer.resetAccumulation();
        },
      });
    } catch {
      // Procedural surfaces remain; nothing else to do.
    }
  }

  /** @private */
  async _loadLiveData() {
    // Two requests at boot, both cached hard. Enough to populate the panels and
    // to put real asteroid orbits in the 3D view without threatening the
    // DEMO_KEY quota.
    try {
      const feed = await getNEOFeed({ days: 7 });
      this.neoFeed = feed;
      this._refreshPanel();
    } catch {
      /* the panel will show its snapshot fallback */
    }
    try {
      const browse = await browseNEOs(0, 20);
      this.smallBodies = neosToSmallBodies(browse.data || []);
      this._rebuildScene();
      this.renderer.resetAccumulation();
    } catch {
      /* no orbits added */
    }
  }

  // -------------------------------------------------------------------------
  // UI wiring
  // -------------------------------------------------------------------------

  /** @private */
  _bindUI() {
    const d = this.dom;

    // --- pointer navigation ------------------------------------------------
    const canvas = d.canvas;
    canvas.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      canvas.setPointerCapture(e.pointerId);
      this._pointer.down = true;
      this._pointer.id = e.pointerId;
      this._pointer.x = e.clientX;
      this._pointer.y = e.clientY;
      this._pointer.moved = 0;
      this.tourPlayer.interrupt();
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!this._pointer.down || e.pointerId !== this._pointer.id) return;
      const dx = e.clientX - this._pointer.x;
      const dy = e.clientY - this._pointer.y;
      this._pointer.x = e.clientX;
      this._pointer.y = e.clientY;
      this._pointer.moved += Math.abs(dx) + Math.abs(dy);
      this.camera.drag(dx, dy, canvas.clientHeight);
    });
    const endPointer = (e) => {
      if (e.pointerId !== this._pointer.id) return;
      // A tap that barely moved is a selection, not a drag.
      if (this._pointer.moved < 6) this._pickAt(e.clientX, e.clientY);
      this._pointer.down = false;
      this._pointer.id = null;
    };
    canvas.addEventListener('pointerup', endPointer);
    canvas.addEventListener('pointercancel', endPointer);

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      // Trackpads report tiny deltas in pixels, mice report ~100 per notch.
      const unit = e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1;
      this.camera.zoom(e.deltaY * unit);
      this.tourPlayer.interrupt();
    }, { passive: false });

    // Pinch to zoom.
    let pinchStart = 0;
    canvas.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) pinchStart = touchDistance(e.touches);
    }, { passive: true });
    canvas.addEventListener('touchmove', (e) => {
      if (e.touches.length !== 2 || !pinchStart) return;
      const d2 = touchDistance(e.touches);
      this.camera.zoom((pinchStart - d2) * 3);
      pinchStart = d2;
    }, { passive: true });
    canvas.addEventListener('touchend', () => { pinchStart = 0; }, { passive: true });

    // --- keyboard ----------------------------------------------------------
    window.addEventListener('keydown', (e) => this._onKeyDown(e));
    window.addEventListener('keyup', (e) => {
      this._keys.delete(e.code);
      this._syncFlightInput();
    });
    window.addEventListener('blur', () => {
      this._keys.clear();
      this._syncFlightInput();
    });

    // --- resize ------------------------------------------------------------
    const onResize = () => this.renderer.resize();
    window.addEventListener('resize', onResize);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize);

    // --- transport ---------------------------------------------------------
    d.btnPlay.addEventListener('click', () => this._togglePlay());
    d.btnFaster.addEventListener('click', () => this._nudgeRate(1));
    d.btnSlower.addEventListener('click', () => this._nudgeRate(-1));
    d.btnNow.addEventListener('click', () => {
      this.clock.goNow();
      this.rateIndex = TIME_RATES.findIndex((r) => r.id === 'realtime');
      d.rateSlider.value = String(this.rateIndex);
      this._updateRateLabel();
      this.announce(t('time.now'));
    });
    d.rateSlider.addEventListener('input', () => {
      this.rateIndex = parseInt(d.rateSlider.value, 10);
      this.clock.setRate(TIME_RATES[this.rateIndex].rate);
      this._updateRateLabel();
    });

    // --- panel tabs --------------------------------------------------------
    for (const tab of d.panelTabs.querySelectorAll('.panel__tab')) {
      tab.addEventListener('click', () => this.setPanel(tab.dataset.panel));
    }

    // --- top bar -----------------------------------------------------------
    d.btnHealth.addEventListener('click', () => this._openHealth());
    d.btnHelp.addEventListener('click', () => this._openHelp());
    d.btnLanguage.addEventListener('click', () => this._openLanguage());
    d.btnSearch.addEventListener('click', () => this._openSearch());
    d.btnHideUI.addEventListener('click', () => this.toggleUI());
    d.btnShowUI?.addEventListener('click', () => this.toggleUI(false));
    d.focusChip.addEventListener('click', () => this.setPanel('body'));

    // --- intro -------------------------------------------------------------
    if (!this.prefs.introSeen) {
      d.dlgIntro.showModal();
      d.dlgIntro.querySelector('#intro-begin').addEventListener('click', () => {
        if (d.dlgIntro.querySelector('#intro-hide').checked) this._savePrefs({ introSeen: true });
        d.dlgIntro.close();
      });
      d.dlgIntro.querySelector('#intro-tour').addEventListener('click', () => {
        this._savePrefs({ introSeen: true });
        d.dlgIntro.close();
        this.tourPlayer.play(TOURS[0].id);
      });
    }

    // Any first gesture unlocks audio if the user has opted in.
    const unlockOnce = () => {
      if (this.prefs.audio) this.audio.setEnabled(true);
      window.removeEventListener('pointerdown', unlockOnce);
      window.removeEventListener('keydown', unlockOnce);
    };
    window.addEventListener('pointerdown', unlockOnce);
    window.addEventListener('keydown', unlockOnce);

    // Persist the view so a reload lands where you left off.
    window.addEventListener('beforeunload', () => {
      this._savePrefs({ camera: this.camera.toJSON() });
    });
  }

  /** @private */
  _onKeyDown(e) {
    // Never steal keys from a text field or an open dialog's controls.
    const tag = e.target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    const movementKeys = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'ShiftLeft', 'ShiftRight'];
    if (movementKeys.includes(e.code)) {
      this._keys.add(e.code);
      this._syncFlightInput();
      if (this.camera.mode === 'free') e.preventDefault();
      return;
    }

    switch (e.key) {
      case ' ':
        e.preventDefault();
        this._togglePlay();
        break;
      case 'ArrowRight': this._nudgeRate(1); break;
      case 'ArrowLeft': this._nudgeRate(-1); break;
      case 'ArrowUp': e.preventDefault(); this.cycleBody(-1); break;
      case 'ArrowDown': e.preventDefault(); this.cycleBody(1); break;
      case 'n': case 'N': this.dom.btnNow.click(); break;
      case 'f': case 'F': this.toggleFreeFlight(); break;
      case 'h': case 'H': this.toggleUI(); break;
      // Escape only ever brings the interface back; it must not be a second way
      // to lose it, or a stray press while reading a panel hides everything.
      case 'Escape': if (this.uiHidden) this.toggleUI(false); break;
      case 'o': case 'O':
        this.renderer.settings.showOrbits = !this.renderer.settings.showOrbits;
        this.renderer.resetAccumulation();
        break;
      case 'l': case 'L':
        this.renderer.settings.showLabels = !this.renderer.settings.showLabels;
        break;
      case '?': this._openHelp(); break;
      case '/': e.preventDefault(); this._openSearch(); break;
      case 'p': case 'P': this.setPanel('capture'); break;
      default:
        if (e.key === 'Enter' && e.altKey) this._toggleFullscreen();
        break;
    }
  }

  /** @private */
  _syncFlightInput() {
    const k = this._keys;
    this._input.forward = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0);
    this._input.strafe = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
    this._input.lift = (k.has('KeyE') ? 1 : 0) - (k.has('KeyQ') ? 1 : 0);
    this._input.boost = k.has('ShiftLeft') || k.has('ShiftRight');
  }

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  /**
   * Focus a body and announce it.
   * @param {string} id
   * @param {object} [opts]
   */
  focus(id, opts) {
    this.camera.focusOn(id, this.prefs.reducedMotion ? { ...opts, duration: 0 } : opts);
    this.audio.blip({ frequency: 660 });
    this._buildBodyList();
    this._refreshPanel();
    this._updateFocusChip();

    const body = this.scene?.byId.get(id);
    const earth = this.scene?.byId.get('earth');
    const dist = body && earth
      ? formatDistance(Math.hypot(
          body.pos[0] - earth.pos[0], body.pos[1] - earth.pos[1], body.pos[2] - earth.pos[2]))
      : '—';
    this.announce(t('a11y.focusedBody', {
      name: t(`body.${id}`), kind: t(`kind.${body?.kind || 'planet'}`), distance: dist,
    }));
  }

  /**
   * Move focus through the ordered body list.
   * @param {number} delta
   */
  cycleBody(delta) {
    const order = this._bodyOrder();
    const at = order.indexOf(this.camera.focus);
    const next = order[(at + delta + order.length) % order.length];
    this.focus(next);
  }

  /** Switch the right-hand panel. @param {string} name */
  setPanel(name) {
    this.activePanel = name;
    for (const tab of this.dom.panelTabs.querySelectorAll('.panel__tab')) {
      const active = tab.dataset.panel === name;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', String(active));
    }
    this.dom.panel.classList.add('is-open');
    this._refreshPanel();
  }

  /**
   * Toggle interface visibility.
   * @param {boolean} [force] Set explicitly rather than toggling.
   */
  toggleUI(force) {
    this.uiHidden = force === undefined ? !this.uiHidden : force;
    document.body.classList.toggle('ui-hidden', this.uiHidden);

    if (this.uiHidden) {
      // Say how to get back before the thing that says it disappears. Hiding
      // the interface used to be a one-way door on any device without a
      // keyboard, and even with one you had to already know which key.
      this.toast(t('keys.hiddenHint'), 5000);
      this.announce(t('keys.hiddenHint'));
      // Move focus somewhere that still exists, or it is left on a control
      // with pointer-events: none and the tab order starts from nowhere.
      if (this.dom.btnShowUI && this.dom.topbar?.contains(document.activeElement)) {
        this.dom.btnShowUI.focus();
      }
    } else if (this.dom.btnHideUI && document.activeElement === this.dom.btnShowUI) {
      this.dom.btnHideUI.focus();
    }
  }

  /** Toggle six-degree-of-freedom flight. */
  toggleFreeFlight() {
    this.camera.mode = this.camera.mode === 'free' ? 'orbit' : 'free';
    if (this.camera.mode === 'free') {
      // Start looking where the orbit camera was looking.
      this.camera.freeYaw = Math.atan2(this.camera.forward[1], this.camera.forward[0]);
      this.camera.freePitch = Math.asin(Math.max(-1, Math.min(1, this.camera.forward[2])));
    }
    this.toast(t(this.camera.mode === 'free' ? 'camera.freeHint' : 'camera.orbitHint'));
    this._refreshPanel();
  }

  /** @private */
  _togglePlay() {
    if (this.clock.rate === 0) {
      this.rateIndex = this._lastNonZeroRate ?? TIME_RATES.findIndex((r) => r.id === 'realtime');
    } else {
      this._lastNonZeroRate = this.rateIndex;
      this.rateIndex = TIME_RATES.findIndex((r) => r.id === 'pause');
    }
    this.clock.setRate(TIME_RATES[this.rateIndex].rate);
    this.dom.rateSlider.value = String(this.rateIndex);
    this._updateRateLabel();
  }

  /** @private */
  _nudgeRate(delta) {
    this.rateIndex = Math.max(0, Math.min(TIME_RATES.length - 1, this.rateIndex + delta));
    this.clock.setRate(TIME_RATES[this.rateIndex].rate);
    this.dom.rateSlider.value = String(this.rateIndex);
    this._updateRateLabel();
  }

  /** @private */
  _updateRateLabel() {
    const rate = TIME_RATES[this.rateIndex];
    this.dom.rateLabel.textContent = t(rate.key);
    this.dom.btnPlay.textContent = rate.rate === 0 ? '▶' : '⏸';
  }

  /** @private */
  _updateClockDisplay() {
    const now = performance.now();
    if (now - (this._clockShownAt || 0) < 120) return;
    this._clockShownAt = now;
    this.dom.clockDate.textContent = formatUTC(this.clock.date);
    this.dom.clockJd.textContent = `JD ${this.clock.jd.toFixed(5)}`;
  }

  /** @private */
  _updateFocusChip() {
    const id = this.camera.focus;
    this.dom.focusName.textContent = t(`body.${id}`);
    const body = this.scene?.byId.get(id);
    if (body) {
      const r = Math.hypot(body.pos[0], body.pos[1], body.pos[2]) / AU_KM;
      this.dom.focusMeta.textContent = id === 'sun' ? '' : `${formatNumber(r, { maximumFractionDigits: 3 })} AU`;
    }
  }

  /** @private */
  _updateHealthChip() {
    const s = summarise();
    this.dom.statusDot.dataset.state = s.level;
    this.dom.btnHealth.title = t(
      s.level === 'ok' ? 'health.summaryOk'
        : s.level === 'degraded' ? 'health.summaryDegraded'
        : 'health.summaryOffline'
    );
  }

  // -------------------------------------------------------------------------
  // Body list, picking, panels
  // -------------------------------------------------------------------------

  /** @returns {string[]} @private */
  _bodyOrder() {
    const order = [];
    for (const b of BODIES) {
      order.push(b.id);
      for (const m of MOONS) if (m.parent === b.id) order.push(m.id);
    }
    return order;
  }

  /** @private */
  _buildBodyList() {
    const list = this.dom.bodyList;
    list.textContent = '';
    for (const b of BODIES) {
      list.appendChild(this._bodyItem(b.id, b.kind, b.color, false));
      const moons = MOONS.filter((m) => m.parent === b.id);
      // Only expand a planet's moons when it is the focus, or one of them is.
      const expanded = this.camera.focus === b.id || moons.some((m) => m.id === this.camera.focus);
      if (expanded) {
        for (const m of moons) list.appendChild(this._bodyItem(m.id, 'moon', m.color, true));
      }
    }
  }

  /** @private */
  _bodyItem(id, kind, color, isMoon) {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `body-item${isMoon ? ' body-item--moon' : ''}`;
    if (this.camera.focus === id) btn.setAttribute('aria-current', 'true');

    const swatch = document.createElement('span');
    swatch.className = 'body-item__swatch';
    swatch.style.background = `rgb(${color.map((c) => Math.round(Math.min(1, c) * 255)).join(',')})`;

    const name = document.createElement('span');
    name.className = 'body-item__name';
    name.textContent = t(`body.${id}`);

    const kindEl = document.createElement('span');
    kindEl.className = 'body-item__kind';
    kindEl.textContent = t(`kind.${kind}`);

    btn.append(swatch, name, kindEl);
    btn.addEventListener('click', () => this.focus(id));
    li.appendChild(btn);
    return li;
  }

  /** @private */
  _refreshPanel() {
    renderPanel(this, this.activePanel, this.dom.panelBody);
    this._updateFocusChip();
  }

  /**
   * Select whatever body is under a screen point.
   *
   * Picking is analytic rather than a colour-buffer readback: for each body we
   * already know the camera-relative position and radius, so the test is
   * "does the ray through this pixel hit the sphere", plus a small angular
   * tolerance so a two-pixel Neptune is still clickable.
   * @private
   */
  _pickAt(clientX, clientY) {
    if (!this.scene) return;
    const rect = this.dom.canvas.getBoundingClientRect();
    const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = 1 - ((clientY - rect.top) / rect.height) * 2;
    const tanHalf = Math.tan(this.camera.effectiveFov / 2);
    const aspect = rect.width / rect.height;

    const c = this.camera;
    const dir = [
      c.forward[0] + c.right[0] * ndcX * aspect * tanHalf + c.up[0] * ndcY * tanHalf,
      c.forward[1] + c.right[1] * ndcX * aspect * tanHalf + c.up[1] * ndcY * tanHalf,
      c.forward[2] + c.right[2] * ndcX * aspect * tanHalf + c.up[2] * ndcY * tanHalf,
    ];
    const len = Math.hypot(dir[0], dir[1], dir[2]);
    dir[0] /= len; dir[1] /= len; dir[2] /= len;

    // Clicks within about eight pixels count, so small bodies are reachable.
    const tolerance = (8 * 2 * tanHalf) / rect.height;

    let best = null;
    let bestScore = Infinity;
    for (const body of this.scene.bodies) {
      const rel = [
        body.pos[0] - c.position[0], body.pos[1] - c.position[1], body.pos[2] - c.position[2],
      ];
      const dist = Math.hypot(rel[0], rel[1], rel[2]);
      if (dist < 1e-6) continue;
      const along = rel[0] * dir[0] + rel[1] * dir[1] + rel[2] * dir[2];
      if (along <= 0) continue;
      const perp = Math.sqrt(Math.max(0, dist * dist - along * along));
      const angular = perp / along;
      const bodyAngular = body.radiusKm / dist;
      if (angular > bodyAngular + tolerance) continue;
      // Prefer the nearest, then the one whose centre we are closest to.
      const score = along * (1 + angular / (bodyAngular + tolerance));
      if (score < bestScore) {
        bestScore = score;
        best = body;
      }
    }
    if (best) this.focus(best.id);
  }

  // -------------------------------------------------------------------------
  // Dialogs
  // -------------------------------------------------------------------------

  /** @private */
  _openLanguage() {
    const list = this.dom.langList;
    list.textContent = '';
    for (const locale of LOCALES) {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      if (locale.tag === getLocale()) btn.setAttribute('aria-current', 'true');
      const native = document.createElement('span');
      native.textContent = locale.native;
      const name = document.createElement('small');
      name.textContent = locale.name;
      btn.append(native, name);
      btn.addEventListener('click', async () => {
        await setLocale(locale.tag);
        this._savePrefs({ locale: locale.tag });
        this.dom.dlgLanguage.close();
      });
      li.appendChild(btn);
      list.appendChild(li);
    }
    this.dom.dlgLanguage.showModal();
  }

  /** @private */
  async _openHealth() {
    const { renderHealth } = await import('./panels.js');
    renderHealth(this, this.dom.healthBody);
    this.dom.dlgHealth.showModal();
  }

  /** @private */
  async _openHelp() {
    const { renderHelp } = await import('./panels.js');
    renderHelp(this, this.dom.helpBody);
    this.dom.dlgHelp.showModal();
  }

  /** @private */
  _openSearch() {
    const dlg = this.dom.dlgSearch;
    const input = this.dom.searchInput;
    const results = this.dom.searchResults;
    const entries = this._bodyOrder().map((id) => ({ id, label: t(`body.${id}`) }));

    const render = () => {
      const q = input.value.trim().toLowerCase();
      const matches = q
        ? entries.filter((e) => e.label.toLowerCase().includes(q) || e.id.includes(q))
        : entries;
      results.textContent = '';
      for (const m of matches.slice(0, 24)) {
        const li = document.createElement('li');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = m.label;
        btn.addEventListener('click', () => {
          this.focus(m.id);
          dlg.close();
        });
        li.appendChild(btn);
        results.appendChild(li);
      }
    };
    input.value = '';
    render();
    input.oninput = render;
    input.onkeydown = (e) => {
      if (e.key === 'Enter') {
        results.querySelector('button')?.click();
      }
    };
    dlg.showModal();
    input.focus();
  }

  /** @private */
  _toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.();
  }

  // -------------------------------------------------------------------------
  // Feedback
  // -------------------------------------------------------------------------

  /**
   * Show a transient message.
   * @param {string} message
   * @param {number} [ms=3200]
   */
  toast(message, ms = 3200) {
    const el = this.dom.toast;
    el.textContent = message;
    el.hidden = false;
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => { el.hidden = true; }, ms);
  }

  /**
   * Announce to assistive technology without showing anything.
   * @param {string} message
   */
  announce(message) {
    this.dom.announcer.textContent = message;
  }

  // -------------------------------------------------------------------------
  // Preferences
  // -------------------------------------------------------------------------

  /** @private */
  _loadPrefs() {
    const defaults = {
      locale: null,
      quality: null,
      adaptive: true,
      audio: false,
      reducedMotion: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false,
      introSeen: false,
      camera: null,
      render: {},
    };
    try {
      return { ...defaults, ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') };
    } catch {
      return defaults;
    }
  }

  /**
   * Merge and persist preferences.
   * @param {object} patch
   */
  _savePrefs(patch) {
    Object.assign(this.prefs, patch);
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(this.prefs));
    } catch {
      /* storage disabled */
    }
  }

  /** Public alias used by the panels. @param {object} patch */
  savePrefs(patch) {
    this._savePrefs(patch);
  }

  /** @private */
  _cameraFromUrl() {
    try {
      const raw = new URLSearchParams(location.search).get('view');
      return raw ? JSON.parse(atob(raw)) : null;
    } catch {
      return null;
    }
  }

  /**
   * A shareable URL encoding the current view, time and language.
   * @returns {string}
   */
  shareUrl() {
    const url = new URL(location.href);
    url.searchParams.set('view', btoa(JSON.stringify(this.camera.toJSON())));
    url.searchParams.set('t', jdToISO(this.clock.jd));
    url.searchParams.set('lang', getLocale());
    return url.toString();
  }

  /** Available quality presets, for the settings panel. */
  get qualityPresets() {
    return QUALITY_PRESETS;
  }

  /**
   * Change the quality tier.
   * @param {string} id
   */
  setQuality(id) {
    if (!QUALITY_BY_ID.has(id)) return;
    this.renderer.setQuality(id);
    this._savePrefs({ quality: id });
    this._refreshPanel();
  }
}

/** @private */
function touchDistance(touches) {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.hypot(dx, dy);
}
