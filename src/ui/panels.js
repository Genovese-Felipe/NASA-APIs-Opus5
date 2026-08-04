/**
 * Panel content.
 *
 * Every panel is a pure function of the app state: given the app and a
 * container, fill it. Re-rendering is cheap enough to do on every state change,
 * which removes a whole class of "the UI says one thing and the state says
 * another" bugs.
 *
 * @module ui/panels
 */

import { el, replace, section, facts, slider, toggle, select, button, barChart } from './dom.js';
import {
  t, formatDistance, formatDuration, formatMass, formatTemperature, formatNumber, formatDateTime,
} from './i18n.js';
import { BODY_BY_ID, RING_SYSTEMS } from '../astro/planets.js';
import { MOON_BY_ID, MOONS_BY_PARENT } from '../astro/moons.js';
import { distanceKm, lightTimeSeconds, heliocentricSpeed } from '../astro/ephemeris.js';
import { AU_KM } from '../astro/constants.js';
import { APIS, RATE_LIMITS } from '../data/registry.js';
import { getHealth, formatAge, summarise, report } from '../data/health.js';
import {
  getApiKey, setApiKey, isDemoKey, clearCache, cacheStats, loadSnapshot,
} from '../data/client.js';
import { getAPOD, getEvents, getSpaceWeather, flareSeverity, parseCloseApproaches } from '../data/nasa.js';
import { EXPORT_SIZES, EXPORT_FORMATS, exportStill, downloadBlob, formatBytes, maxCanvasArea } from '../render/export.js';
import { Recorder, describeSupport, FPS_OPTIONS, BITRATE_PRESETS, supportedFormats, renderClip } from '../render/recorder.js';
import { TOURS } from './tours.js';
import CONTENT_EN from './content/en.js';

/**
 * Render the active panel.
 * @param {import('./app.js').App} app
 * @param {string} name
 * @param {HTMLElement} host
 */
export function renderPanel(app, name, host) {
  switch (name) {
    case 'body': return renderBodyPanel(app, host);
    case 'data': return renderDataPanel(app, host);
    case 'tours': return renderToursPanel(app, host);
    case 'capture': return renderCapturePanel(app, host);
    case 'settings': return renderSettingsPanel(app, host);
    default: return renderBodyPanel(app, host);
  }
}

// ---------------------------------------------------------------------------
// Explore
// ---------------------------------------------------------------------------

/**
 * @param {import('./app.js').App} app
 * @param {HTMLElement} host
 */
function renderBodyPanel(app, host) {
  const id = app.camera.focus;
  const record = BODY_BY_ID.get(id) || MOON_BY_ID.get(id);
  const state = app.scene?.byId.get(id);
  const content = CONTENT_EN[id];

  if (!record || !state) {
    replace(host, el('p.muted', { text: t('data.noResults') }));
    return;
  }

  const earth = app.scene.byId.get('earth');
  const sun = app.scene.byId.get('sun');
  const isMoon = !!MOON_BY_ID.get(id);
  const parentId = record.parent;
  const parent = parentId ? app.scene.byId.get(parentId) : null;

  const rotationDays = record.rotationDays ?? (isMoon ? record.periodDays : null);
  const orbitDays = record.orbitDays ?? (isMoon ? Math.abs(record.periodDays) : null);
  const moons = MOONS_BY_PARENT.get(id) || [];
  const rings = RING_SYSTEMS[id];

  replace(host,
    el('div.hero', null, [
      el('h2.hero__name', { text: t(`body.${id}`) }),
      el('p.hero__kind', { text: t(`kind.${state.kind}`) + (parentId && parentId !== 'sun' ? ` · ${t('facts.parent')} ${t(`body.${parentId}`)}` : '') }),
      content && el('p.hero__blurb', { text: content.blurb }),
    ]),

    section(t('facts.title'), [
      facts([
        [t('facts.radius'), formatDistance(record.radiusKm)],
        record.massKg && [t('facts.mass'), formatMass(record.massKg)],
        record.densityGcm3 && [t('facts.density'), `${formatNumber(record.densityGcm3, { maximumFractionDigits: 3 })} g/cm³`],
        rotationDays && [t('facts.rotation'),
          `${formatDuration(Math.abs(rotationDays) * 86400)}${rotationDays < 0 ? ` (${t('facts.retrograde')})` : ''}`],
        orbitDays && [t('facts.orbit'), formatDuration(orbitDays * 86400)],
        record.obliquityDeg != null && [t('facts.obliquity'), `${formatNumber(record.obliquityDeg, { maximumFractionDigits: 2 })}°`],
        record.albedo != null && [t('facts.albedo'), formatNumber(record.albedo, { maximumFractionDigits: 3 })],
        record.meanTempK && [t('facts.temperature'), formatTemperature(record.meanTempK)],
        record.moons != null && [t('facts.moons'), formatNumber(record.moons)],
        record.flattening ? [t('facts.flattening'), formatNumber(record.flattening, { maximumFractionDigits: 5 })] : null,
        [t('facts.atmosphere'), record.atmosphere
          ? `${formatDistance(record.radiusKm * record.atmosphere)} · H = ${formatNumber(record.scaleHeightKm ?? 0, { maximumFractionDigits: 1 })} km`
          : t('facts.none')],
      ]),
    ]),

    section(null, [
      facts([
        id !== 'sun' && [t('facts.distanceFromSun'), formatDistance(distanceKm(state, sun))],
        id !== 'earth' && [t('facts.distanceFromEarth'), formatDistance(distanceKm(state, earth))],
        id !== 'earth' && [t('facts.lightTime'), formatDuration(lightTimeSeconds(state, earth))],
        !isMoon && id !== 'sun' && [t('facts.orbitalSpeed'),
          `${formatNumber(heliocentricSpeed(id, app.scene.jd) ?? 0, { maximumFractionDigits: 2 })} ${t('unit.kms')}`],
        parent && isMoon && [`${t('facts.parent')} ${t(`body.${parentId}`)}`, formatDistance(distanceKm(state, parent))],
      ]),
      el('p.section__note', { text: t('facts.approximate') + ' · ' + t('time.rangeNote') }),
    ]),

    content && section(null, content.body.map((p) => el('p.card__body', { text: p }))),

    content && el('div.card', null, [
      el('p.card__title', { text: '★' }),
      el('p.card__body', { text: content.fact }),
    ]),

    content?.missions?.length && section(null, [
      el('p.card__meta', null, content.missions.map((m) => el('span.pill', { text: m }))),
    ]),

    rings && section(t('facts.rings'), [
      el('table.table', null, [
        el('thead', null, [el('tr', null, [
          el('th', { text: 'Ring' }),
          el('th.num', { text: 'Inner' }),
          el('th.num', { text: 'Outer' }),
        ])]),
        el('tbody', null, rings.map((b) => el('tr', null, [
          el('td', { text: b.name }),
          el('td.num', { text: formatNumber(b.inner) }),
          el('td.num', { text: formatNumber(b.outer) }),
        ]))),
      ]),
      el('p.section__note', { text: 'Radii in kilometres from the planet centre.' }),
    ]),

    moons.length && section(t('facts.moons'), [
      el('div.btn-row', null, moons.map((m) =>
        button(t(`body.${m.id}`), () => app.focus(m.id), { title: t('camera.focus', { name: t(`body.${m.id}`) }) })
      )),
    ]),

    section(t('camera.title'), [
      el('div.btn-row', null, [
        button(t('camera.reset'), () => {
          app.camera.distanceRadii = 6;
          app.camera.pitch = 0.32;
          app.camera.setFov(45);
        }),
        button(t(app.camera.mode === 'free' ? 'camera.mode.orbit' : 'camera.mode.free'),
          () => app.toggleFreeFlight()),
        button(t('camera.copyLink'), async () => {
          try {
            await navigator.clipboard.writeText(app.shareUrl());
            app.toast(t('camera.linkCopied'));
          } catch {
            app.toast(app.shareUrl());
          }
        }),
      ]),
      slider({
        label: t('camera.fov'),
        value: (app.camera.fov * 180) / Math.PI,
        min: 5, max: 100, step: 1,
        format: (v) => `${v.toFixed(0)}°`,
        onInput: (v) => app.camera.setFov(v),
      }),
      toggle(t('camera.autoOrbit'), app.camera.autoOrbit !== 0, (on) => {
        app.camera.autoOrbit = on ? 0.06 : 0;
      }),
    ]),
  );
}

// ---------------------------------------------------------------------------
// Live data
// ---------------------------------------------------------------------------

/**
 * @param {import('./app.js').App} app
 * @param {HTMLElement} host
 */
function renderDataPanel(app, host) {
  const container = el('div');
  replace(host, container);

  const apodBox = el('div.section');
  const neoBox = el('div.section');
  const weatherBox = el('div.section');
  const eventsBox = el('div.section');
  const riskBox = el('div.section');
  const exoBox = el('div.section');
  container.append(apodBox, neoBox, weatherBox, eventsBox, riskBox, exoBox);

  // --- APOD ---------------------------------------------------------------
  replace(apodBox, el('h3.section__title', { text: t('data.apod') }), el('p.muted', { text: '…' }));
  getAPOD().then(({ data, source }) => {
    const a = data[0];
    if (!a) return;
    replace(apodBox,
      el('h3.section__title', { text: t('data.apod') }),
      el('figure.apod', null, [
        el('img', { src: a.url, alt: a.title, loading: 'lazy', decoding: 'async' }),
        el('figcaption', null, [
          el('p.card__title', { text: a.title }),
          el('p.card__meta', null, [
            el('span', { text: formatDateTime(new Date(a.date), { dateStyle: 'medium' }) }),
            sourcePill(source),
            a.copyright && el('span', { text: `${t('data.apod.credit')}: ${a.copyright}` }),
          ]),
          el('p.card__body', { text: a.explanation.slice(0, 420) + (a.explanation.length > 420 ? '…' : '') }),
        ]),
      ]),
      el('div.btn-row', null, [
        button(t('data.apod.explore'), async () => {
          const r = await getAPOD({ count: 1 });
          const pick = r.data[0];
          apodBox.querySelector('img').src = pick.url;
          apodBox.querySelector('.card__title').textContent = pick.title;
          apodBox.querySelector('.card__body').textContent = pick.explanation.slice(0, 420);
        }),
        el('a.btn', { href: a.hdurl, target: '_blank', rel: 'noopener noreferrer', text: t('data.apod.viewFull') }),
      ]),
    );
  }).catch((err) => {
    replace(apodBox, el('h3.section__title', { text: t('data.apod') }),
      el('p.muted', { text: t('error.generic', { message: err.message }) }));
  });

  // --- near-Earth objects --------------------------------------------------
  const feed = app.neoFeed;
  const renderNeos = (result) => {
    const list = (result?.data || []).slice(0, 8);
    replace(neoBox,
      el('h3.section__title', { text: t('data.neo') }),
      el('p.card__meta', null, [
        el('span', { text: t('data.neo.upcoming') }),
        sourcePill(result?.source),
      ]),
      ...list.map((n) => el('div.card.card--clickable', {
        on: { click: () => app.toast(`${n.name} · ${formatDistance(n.missDistanceKm)}`) },
      }, [
        el('p.card__title', null, [
          n.name,
          n.hazardous && el('span.pill.pill--hazard', { text: t('data.neo.hazardous') }),
        ]),
        el('p.card__meta', null, [
          el('span', { text: `${t('data.neo.diameter')}: ${formatNumber(n.diameterKmMin * 1000, { maximumFractionDigits: 0 })}–${formatNumber(n.diameterKmMax * 1000, { maximumFractionDigits: 0 })} m` }),
          el('span', { text: `${t('data.neo.missDistance')}: ${formatDistance(n.missDistanceKm)}` }),
          Number.isFinite(n.missDistanceLunar) && el('span', { text: t('data.neo.lunarDistances', { n: formatNumber(n.missDistanceLunar, { maximumFractionDigits: 1 }) }) }),
          el('span', { text: `${formatNumber(n.velocityKmS, { maximumFractionDigits: 1 })} ${t('unit.kms')}` }),
        ]),
      ])),
      app.smallBodies.length && el('p.section__note', { text: t('data.neo.plotted', { n: app.smallBodies.length }) }),
    );
  };
  if (feed) renderNeos(feed);
  else {
    replace(neoBox, el('h3.section__title', { text: t('data.neo') }), el('p.muted', { text: '…' }));
    import('../data/nasa.js').then(({ getNEOFeed }) => getNEOFeed({ days: 7 })
      .then((r) => { app.neoFeed = r; renderNeos(r); })
      .catch(() => replace(neoBox, el('h3.section__title', { text: t('data.neo') }),
        el('p.muted', { text: t('data.noResults') }))));
  }

  // --- space weather -------------------------------------------------------
  replace(weatherBox, el('h3.section__title', { text: t('data.donki') }), el('p.muted', { text: '…' }));
  getSpaceWeather({ type: 'FLR', days: 30 }).then(({ data, source }) => {
    const flares = data.slice(-40);
    const severities = flares.map((f) => flareSeverity(f.class));
    replace(weatherBox,
      el('h3.section__title', { text: t('data.donki.flares') }),
      el('p.card__meta', null, [
        el('span', { text: t('unit.objects', { count: flares.length, n: flares.length }) }),
        sourcePill(source),
      ]),
      flares.length ? barChart(severities, flares.map((f) => `${f.class} · ${f.peak || f.begin}`)) : el('p.muted', { text: t('data.noResults') }),
      flares.length && el('div.btn-row', null, [
        button(t('audio.sonify.flares'), async () => {
          if (!app.audio.enabled) await app.audio.setEnabled(true);
          app.audio.sonify(severities, { noteMs: 120 });
          app.toast(t('audio.sonify.flares'));
        }),
      ]),
      ...flares.slice(-3).reverse().map((f) => el('div.card', null, [
        el('p.card__title', { text: f.title }),
        el('p.card__meta', null, [
          f.peak && el('span', { text: `${t('data.donki.peak')}: ${f.peak}` }),
          f.region && el('span', { text: `AR ${f.region}` }),
          f.location && el('span', { text: f.location }),
        ]),
      ])),
    );
  }).catch(() => {
    replace(weatherBox, el('h3.section__title', { text: t('data.donki') }),
      el('p.muted', { text: t('health.explainError') }));
  });

  // --- Earth events --------------------------------------------------------
  replace(eventsBox, el('h3.section__title', { text: t('data.eonet') }), el('p.muted', { text: '…' }));
  getEvents({ days: 21, limit: 60 }).then(({ data, source }) => {
    const byCategory = new Map();
    for (const ev of data) {
      const key = ev.categories[0]?.title || 'Other';
      byCategory.set(key, (byCategory.get(key) || 0) + 1);
    }
    replace(eventsBox,
      el('h3.section__title', { text: t('data.eonet') }),
      el('p.card__meta', null, [
        el('span', { text: t('unit.objects', { count: data.length, n: data.length }) }),
        sourcePill(source),
      ]),
      el('p.card__meta', null, [...byCategory.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => el('span.pill', { text: `${k} ${v}` }))),
      ...data.slice(0, 5).map((ev) => el('div.card', null, [
        el('p.card__title', { text: ev.title }),
        el('p.card__meta', null, [
          ev.lat != null && el('span', { text: `${ev.lat.toFixed(2)}°, ${ev.lon.toFixed(2)}°` }),
          ev.date && el('span', { text: formatDateTime(new Date(ev.date), { dateStyle: 'medium' }) }),
        ]),
      ])),
    );
  }).catch(() => {
    replace(eventsBox, el('h3.section__title', { text: t('data.eonet') }),
      el('p.muted', { text: t('data.noResults') }));
  });

  // --- impact risk (snapshot) ---------------------------------------------
  loadSnapshot('sbdb').then((snap) => {
    if (!snap) return;
    const sentry = snap.data.sentry?.objects || [];
    const cad = parseCloseApproaches(snap.data.closeApproaches).slice(0, 5);
    replace(riskBox,
      el('h3.section__title', { text: t('data.sentry') }),
      el('p.card__meta', null, [
        el('span.pill.pill--snapshot', { text: t('health.state.snapshot') }),
        el('span', { text: formatAge(snap.at, t) }),
      ]),
      el('p.section__note', { text: t('data.sentry.reassurance') }),
      el('table.table', null, [
        el('thead', null, [el('tr', null, [
          el('th', { text: 'Object' }),
          el('th.num', { text: t('data.sentry.probability') }),
          el('th.num', { text: t('data.sentry.palermo') }),
        ])]),
        el('tbody', null, sentry.slice(0, 6).map((o) => el('tr', null, [
          el('td', { text: o.designation }),
          el('td.num', { text: formatNumber(o.impactProbability, { notation: 'scientific', maximumFractionDigits: 1 }) }),
          el('td.num', { text: formatNumber(o.palermoScale, { maximumFractionDigits: 2 }) }),
        ]))),
      ]),
      cad.length && el('h3.section__title', { text: 'Close approaches' }),
      ...cad.map((c) => el('div.card', null, [
        el('p.card__title', { text: c.designation }),
        el('p.card__meta', null, [
          el('span', { text: c.date }),
          el('span', { text: formatDistance(c.distanceKm) }),
          el('span', { text: t('data.neo.lunarDistances', { n: formatNumber(c.distanceLunar, { maximumFractionDigits: 1 }) }) }),
        ]),
      ])),
    );
  });

  // --- exoplanets (snapshot) ----------------------------------------------
  loadSnapshot('exoplanets').then((snap) => {
    if (!snap) return;
    const d = snap.data;
    replace(exoBox,
      el('h3.section__title', { text: t('data.exoplanets') }),
      el('p.card__meta', null, [
        el('span', { text: t('data.exoplanets.total', { n: d.total }) }),
        el('span.pill.pill--snapshot', { text: t('health.state.snapshot') }),
      ]),
      barChart(d.radiusHistogram, d.radiusHistogram.map((v, i) => `bin ${i}: ${v}`)),
      el('p.section__note', { text: 'Planet radii, log-spaced from 0.3 to 30 Earth radii.' }),
      el('h3.section__title', { text: t('data.exoplanets.nearest') }),
      ...d.nearest.slice(0, 6).map((p) => el('div.card', null, [
        el('p.card__title', { text: p.name }),
        el('p.card__meta', null, [
          el('span', { text: `${formatNumber(p.distancePc * 3.26156, { maximumFractionDigits: 2 })} ${t('unit.ly')}` }),
          p.radiusEarth && el('span', { text: `${formatNumber(p.radiusEarth, { maximumFractionDigits: 2 })} ${t('unit.earthRadius')}` }),
          p.periodDays && el('span', { text: `${formatNumber(p.periodDays, { maximumFractionDigits: 1 })} ${t('unit.days')}` }),
          el('span', { text: p.method }),
        ]),
      ])),
    );
  });
}

/** @private */
function sourcePill(source) {
  if (!source) return null;
  const cls = source === 'live' ? 'pill--live' : source === 'snapshot' || source === 'stale' ? 'pill--snapshot' : '';
  return el(`span.pill${cls ? '.' + cls : ''}`, { text: t(`health.state.${source === 'live' ? 'live' : source}`) });
}

// ---------------------------------------------------------------------------
// Tours
// ---------------------------------------------------------------------------

function renderToursPanel(app, host) {
  replace(host,
    section(t('tour.title'), TOURS.map((tour) => el('div.card.card--clickable', {
      on: { click: () => app.tourPlayer.play(tour.id) },
    }, [
      el('p.card__title', { text: t(`tour.${tour.id}.name`) }),
      el('p.card__body', { text: t(`tour.${tour.id}.desc`) }),
      el('p.card__meta', null, [el('span', { text: t('tour.step', { n: tour.steps.length, total: tour.steps.length }) })]),
    ]))),
  );
}

// ---------------------------------------------------------------------------
// Capture
// ---------------------------------------------------------------------------

function renderCapturePanel(app, host) {
  const st = app.captureState || (app.captureState = {
    sizeId: '4k', format: 'png', samples: 192, quality: 0.92,
    fps: 60, bitrate: 'good', container: 'auto', withAudio: false,
  });

  const progress = el('div.progress', null, [el('div.progress__fill')]);
  const status = el('p.section__note');
  const support = describeSupport(t);

  const sizeFor = (idOverride) => {
    const id = idOverride || st.sizeId;
    const preset = EXPORT_SIZES.find((s) => s.id === id);
    if (!preset || preset.width === 0) {
      return { width: app.renderer.outputWidth, height: app.renderer.outputHeight };
    }
    return { width: preset.width, height: preset.height };
  };

  const setProgress = (f) => {
    progress.firstChild.style.width = `${Math.round(f * 100)}%`;
  };

  let abort = null;

  const doCapture = async () => {
    const { width, height } = sizeFor();
    abort = new AbortController();
    status.textContent = t('capture.capturing', { percent: 0 });
    try {
      const result = await exportStill(app.renderer, app.scene, app.camera, {
        width, height,
        format: st.format,
        quality: st.quality,
        samples: st.samples,
        signal: abort.signal,
        metadata: {
          Comment: `Simulated instant ${new Date((app.scene.jd - 2440587.5) * 86400000).toISOString()} UTC; focus ${app.camera.focus}`,
        },
        onProgress: (p) => {
          const f = p.phase === 'render' ? p.fraction * 0.85 : 0.85 + p.fraction * 0.15;
          setProgress(f);
          status.textContent = p.phase === 'render'
            ? `${t('capture.capturing', { percent: Math.round(f * 100) })} · ${t('capture.tile', { n: p.tile, total: p.tiles })}`
            : t('capture.capturing', { percent: Math.round(f * 100) });
        },
      });
      downloadBlob(result.blob, result.filename);
      status.textContent = `${t('capture.saved', { name: result.filename })} · ${formatBytes(result.blob.size)} · ${(result.durationMs / 1000).toFixed(1)}s`;
      setProgress(1);
      app.audio.blip({ frequency: 1320 });
    } catch (err) {
      if (err.name === 'AbortError') status.textContent = '';
      else status.textContent = t('capture.failed', { error: err.message });
      setProgress(0);
    } finally {
      abort = null;
    }
  };

  // --- video ---------------------------------------------------------------
  const videoStatus = el('p.section__note');
  let recorder = null;
  const recordBtn = button(t('capture.startRecording'), async () => {
    if (recorder) {
      const result = await recorder.stop();
      recorder = null;
      downloadBlob(result.blob, result.filename);
      videoStatus.textContent = `${t('capture.videoSaved', { size: formatBytes(result.blob.size) })} · ${result.label}`;
      recordBtn.textContent = t('capture.startRecording');
      return;
    }
    if (st.withAudio && !app.audio.enabled) await app.audio.setEnabled(true);
    recorder = new Recorder({
      canvas: app.dom.canvas,
      fps: st.fps,
      prefer: st.container,
      bitrate: bitrateFor(),
      audio: st.withAudio ? app.audio.getRecordingSource() : null,
      audioContext: app.audio.ctx,
      onState: (s) => {
        if (s.state === 'recording') {
          videoStatus.textContent = `${t('capture.recording', { duration: s.elapsed.toFixed(1) + 's' })} · ${formatBytes(s.size)}`;
        }
      },
    });
    await recorder.start();
    recordBtn.textContent = t('capture.stopRecording');
  }, { primary: true, block: true, disabled: !support.label || support.label === '—' });

  const bitrateFor = () => {
    const preset = BITRATE_PRESETS.find((b) => b.id === st.bitrate) || BITRATE_PRESETS[1];
    return preset.bps;
  };

  replace(host,
    section(t('capture.still'), [
      select({
        label: t('capture.resolution'),
        value: st.sizeId,
        options: EXPORT_SIZES.map((s) => ({
          value: s.id,
          label: s.width ? s.label : `${t('capture.resolution')} — ${app.renderer.outputWidth} × ${app.renderer.outputHeight}`,
        })),
        onChange: (v) => { st.sizeId = v; app._refreshPanel(); },
      }),
      select({
        label: t('capture.format'),
        value: st.format,
        options: EXPORT_FORMATS.map((f) => ({ value: f.id, label: f.label })),
        onChange: (v) => { st.format = v; app._refreshPanel(); },
      }),
      slider({
        label: t('capture.samples'),
        value: st.samples, min: 8, max: 1024, step: 8,
        format: (v) => String(Math.round(v)),
        onInput: (v) => { st.samples = Math.round(v); },
      }),
      st.format !== 'png' && slider({
        label: t('capture.quality'),
        value: st.quality, min: 0.5, max: 1, step: 0.01,
        format: (v) => `${Math.round(v * 100)}%`,
        onInput: (v) => { st.quality = v; },
      }),
      el('p.section__note', { text: t('capture.samplesHint') }),
      el('p.section__note', { text: t('capture.tiledNote') }),
      canvasWarning(st, sizeFor()),
      progress,
      status,
      el('div.btn-row', null, [
        button(t('capture.takeShot'), doCapture, { primary: true }),
        button(t('capture.cancel'), () => abort?.abort(), { ghost: true }),
      ]),
    ]),

    section(t('capture.video'), [
      el('p.card__meta', null, [
        el('span.pill', { text: support.label }),
        el('span', { text: support.note }),
      ]),
      select({
        label: t('capture.videoFormat'),
        value: st.container,
        options: [
          { value: 'auto', label: `Auto (${support.label})` },
          ...supportedFormats().map((f) => ({ value: f.container, label: f.label })),
        ].filter((v, i, arr) => arr.findIndex((x) => x.value === v.value) === i),
        onChange: (v) => { st.container = v; },
      }),
      select({
        label: t('capture.fps'),
        value: String(st.fps),
        options: FPS_OPTIONS.map((f) => ({ value: String(f), label: `${f} fps` })),
        onChange: (v) => { st.fps = parseInt(v, 10); },
      }),
      select({
        label: t('capture.videoBitrate'),
        value: st.bitrate,
        options: BITRATE_PRESETS.map((b) => ({ value: b.id, label: `${b.label} — ${Math.round(b.bps / 1e6)} Mb/s` })),
        onChange: (v) => { st.bitrate = v; },
      }),
      toggle(t('capture.includeAudio'), st.withAudio, (v) => { st.withAudio = v; }),
      recordBtn,
      videoStatus,
      el('p.section__note', { text: t('capture.orbitCaptureHint') }),
      button(t('capture.orbitCapture'), async () => {
        videoStatus.textContent = t('capture.capturing', { percent: 0 });
        const startYaw = app.camera.yaw;
        try {
          const result = await renderClip({
            renderer: app.renderer,
            camera: app.camera,
            sceneAt: () => app.scene,
            animate: (frac, cam) => {
              cam.yaw = startYaw + frac * Math.PI * 2;
              cam._yaw = cam.yaw;
            },
            seconds: 8,
            fps: st.fps,
            samplesPerFrame: 20,
            prefer: st.container,
            bitrate: bitrateFor(),
            onProgress: (p) => {
              videoStatus.textContent = t('capture.capturing', { percent: Math.round(p.fraction * 100) });
            },
          });
          downloadBlob(result.blob, result.filename);
          videoStatus.textContent = t('capture.videoSaved', { size: formatBytes(result.blob.size) });
        } catch (err) {
          videoStatus.textContent = t('capture.failed', { error: err.message });
        } finally {
          app.camera.yaw = startYaw;
        }
      }, { block: true }),
    ]),
  );
}

/** @private */
function canvasWarning(st, size) {
  if (st.format === 'png') return null;
  const area = size.width * size.height;
  const max = maxCanvasArea();
  if (area <= max) return null;
  return el('p.section__note', {
    text: t('capture.tooLarge', { max: formatNumber(max) }),
    style: { color: 'var(--warn)' },
  });
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

function renderSettingsPanel(app, host) {
  const s = app.renderer.settings;
  const reset = () => app.renderer.resetAccumulation();

  replace(host,
    section(t('quality.title'), [
      select({
        label: t('quality.preset'),
        value: app.renderer.quality.id,
        options: app.qualityPresets.map((q) => ({ value: q.id, label: t(q.labelKey) })),
        onChange: (v) => app.setQuality(v),
      }),
      toggle(t('quality.adaptive'), app.renderer.scaler.enabled, (v) => {
        app.renderer.scaler.enabled = v;
        app.savePrefs({ adaptive: v });
        app.renderer.resize();
      }),
      el('p.section__note', { text: t('quality.hint') }),
      el('p.card__meta', null, [
        el('span', { text: `${app.renderer.renderWidth} × ${app.renderer.renderHeight}` }),
        el('span', { text: t('settings.gpu') + ': ' + app.renderer.caps.renderer.slice(0, 60) }),
      ]),
    ]),

    section(t('render.title'), [
      toggle(t('render.autoExposure'), s.autoExposure, (v) => { s.autoExposure = v; }),
      slider({
        label: t('render.exposure'), value: s.exposure, min: 0.05, max: 6, step: 0.05,
        onInput: (v) => { s.exposure = v; },
      }),
      select({
        label: t('render.tonemap'),
        value: String(s.tonemap),
        options: [
          { value: '0', label: t('render.tonemap.agx') },
          { value: '1', label: t('render.tonemap.aces') },
          { value: '2', label: t('render.tonemap.reinhard') },
          { value: '3', label: t('render.tonemap.linear') },
        ],
        onChange: (v) => { s.tonemap = parseInt(v, 10); },
      }),
      slider({ label: t('render.bloom'), value: s.bloomStrength, min: 0, max: 2, onInput: (v) => { s.bloomStrength = v; } }),
      slider({ label: t('render.starburst'), value: s.starburst, min: 0, max: 3, onInput: (v) => { s.starburst = v; } }),
      slider({ label: t('render.vignette'), value: s.vignette, min: 0, max: 1, onInput: (v) => { s.vignette = v; } }),
      slider({ label: t('render.chromatic'), value: s.chromatic, min: 0, max: 1, onInput: (v) => { s.chromatic = v; } }),
      slider({ label: t('render.grain'), value: s.grain, min: 0, max: 1, onInput: (v) => { s.grain = v; } }),
      slider({ label: t('render.saturation'), value: s.saturation, min: 0, max: 2, onInput: (v) => { s.saturation = v; } }),
      slider({ label: t('render.contrast'), value: s.contrast, min: 0.6, max: 1.6, onInput: (v) => { s.contrast = v; } }),
      slider({ label: t('render.ambient'), value: s.ambient, min: 0, max: 2, onInput: (v) => { s.ambient = v; reset(); } }),
      slider({ label: t('render.starBrightness'), value: s.starBrightness, min: 0, max: 3, onInput: (v) => { s.starBrightness = v; reset(); } }),
      toggle(t('render.realistic'), s.realisticBrightness > 0.5, (v) => { s.realisticBrightness = v ? 1 : 0; reset(); }),
      el('p.section__note', { text: t('render.realisticHint') }),
      toggle(t('render.physicalStars'), s.physicalStars, (v) => { s.physicalStars = v; reset(); }),
      el('p.section__note', { text: t('render.physicalStarsHint') }),
      el('div.btn-row', null, [
        button(t('settings.reset'), () => {
          app.savePrefs({ render: {} });
          location.reload();
        }, { ghost: true }),
      ]),
    ]),

    section(t('render.layers'), [
      toggle(t('render.showOrbits'), s.showOrbits, (v) => { s.showOrbits = v; reset(); }),
      toggle(t('render.showLabels'), s.showLabels, (v) => { s.showLabels = v; }),
      toggle(t('render.showRings'), s.showRings, (v) => { s.showRings = v; reset(); }),
      toggle(t('render.showAtmosphere'), s.showAtmosphere, (v) => { s.showAtmosphere = v; reset(); }),
      toggle(t('render.showStars'), s.showStars, (v) => { s.showStars = v; reset(); }),
    ]),

    section(t('audio.title'), [
      toggle(t('audio.enable'), app.audio.enabled, async (v) => {
        await app.audio.setEnabled(v);
        app.savePrefs({ audio: v });
        if (v && !app.audio.unlocked) app.toast(t('audio.autoplayBlocked'));
      }),
      slider({
        label: t('audio.master'), value: app.audio.levels.master, min: 0, max: 1,
        onInput: (v) => app.audio.setLevel('master', v),
      }),
      slider({
        label: t('audio.ambience'), value: app.audio.levels.ambience, min: 0, max: 1,
        onInput: (v) => app.audio.setLevel('ambience', v),
      }),
      slider({
        label: t('audio.sonification'), value: app.audio.levels.sonification, min: 0, max: 1,
        onInput: (v) => app.audio.setLevel('sonification', v),
      }),
      el('p.section__note', { text: t('audio.sonificationHint') }),
    ]),

    section(t('a11y.title'), [
      toggle(t('a11y.reducedMotion'), app.prefs.reducedMotion, (v) => {
        app.savePrefs({ reducedMotion: v });
        document.documentElement.dataset.motion = v ? 'reduced' : '';
        if (v) app.camera.autoOrbit = 0;
      }),
      el('p.section__note', { text: t('a11y.reducedMotionHint') }),
      toggle(t('a11y.highContrast'), document.documentElement.dataset.contrast === 'high', (v) => {
        document.documentElement.dataset.contrast = v ? 'high' : '';
        app.savePrefs({ highContrast: v });
      }),
      toggle(t('a11y.largeText'), document.documentElement.dataset.textsize === 'large', (v) => {
        document.documentElement.dataset.textsize = v ? 'large' : '';
        app.savePrefs({ largeText: v });
      }),
      el('p.section__note', { text: t('a11y.photosensitive') }),
    ]),

    section(t('about.title'), [
      el('p.card__body', { text: t('about.what') }),
      el('p.card__body', { text: t('about.accuracyBody') }),
      el('p.section__note', { text: t('about.notNasa') }),
      el('div.btn-row', null, [
        el('a.btn', { href: 'docs/', text: t('nav.help') }),
        el('a.btn', {
          href: 'https://github.com/Genovese-Felipe/NASA-APIs-Opus5',
          target: '_blank', rel: 'noopener noreferrer', text: t('about.sourceCode'),
        }),
      ]),
    ]),
  );
}

// ---------------------------------------------------------------------------
// Dialogs
// ---------------------------------------------------------------------------

/**
 * The data-health report.
 * @param {import('./app.js').App} app
 * @param {HTMLElement} host
 */
export function renderHealth(app, host) {
  const r = report();
  const keyInput = el('input', {
    type: 'password',
    value: isDemoKey() ? '' : getApiKey(),
    placeholder: t('health.keyPlaceholder'),
    autocomplete: 'off',
    spellcheck: false,
  });

  replace(host,
    el('p.card__body', { text: t('health.intro') }),

    section(t('health.apiKey'), [
      el('p.card__meta', null, [
        el(`span.pill${r.key.demo ? '.pill--snapshot' : '.pill--live'}`, {
          text: r.key.demo ? t('health.usingDemo') : t('health.usingPersonal'),
        }),
        r.key.remaining != null && el('span', {
          text: t('health.remaining', { n: r.key.remaining, limit: r.key.limit ?? r.key.perHour }),
        }),
      ]),
      r.key.demo && el('p.section__note', { text: t('health.demoWarning') }),
      keyInput,
      el('p.section__note', { text: t('health.keyPrivacy') }),
      el('div.btn-row', null, [
        button(t('health.saveKey'), () => {
          setApiKey(keyInput.value);
          app.toast(t('health.saveKey'));
          renderHealth(app, host);
        }, { primary: true }),
        button(t('health.clearKey'), () => {
          setApiKey('');
          renderHealth(app, host);
        }),
        el('a.btn', {
          href: 'https://api.nasa.gov/#signUp', target: '_blank', rel: 'noopener noreferrer',
          text: t('health.getKey'),
        }),
      ]),
    ]),

    section(null, [
      el('table.table', null, [
        el('thead', null, [el('tr', null, [
          el('th', { text: 'API' }),
          el('th', { text: 'State' }),
          el('th', { text: 'Age' }),
        ])]),
        el('tbody', null, r.apis.map((h) => el('tr', null, [
          el('td', null, [
            el('a', {
              href: h.entry.docs, target: '_blank', rel: 'noopener noreferrer',
              text: h.entry.name,
            }),
            el('p.card__meta', null, [el('span', { text: h.entry.blurb })]),
            h.entry.notes && el('p.card__meta', null, [el('span', { text: h.entry.notes })]),
          ]),
          el('td', null, [
            el(`span.pill${stateClass(h.state)}`, { text: t(`health.state.${h.state}`) }),
            el('p.card__meta', null, [el('span', { text: explain(h) })]),
          ]),
          el('td.num', { text: h.lastAt ? formatAge(h.lastAt, t) : '—' }),
        ]))),
      ]),
    ]),

    section(null, [
      el('p.card__meta', null, [
        el('span', { text: t('health.cacheSize', { n: r.cache.entries, kb: Math.round(r.cache.bytes / 1024) }) }),
      ]),
      el('div.btn-row', null, [
        button(t('health.clearCache'), () => {
          clearCache();
          app.toast(t('health.clearCache'));
          renderHealth(app, host);
        }),
      ]),
    ]),
  );
}

/** @private */
function stateClass(state) {
  if (state === 'live' || state === 'cache') return '.pill--live';
  if (state === 'error') return '.pill--error';
  if (state === 'snapshot' || state === 'stale' || state === 'blocked') return '.pill--snapshot';
  return '';
}

/** @private */
function explain(h) {
  switch (h.state) {
    case 'live': return t('health.explainLive');
    case 'cache': return t('health.explainCache');
    case 'stale': return t('health.explainStale');
    case 'snapshot': case 'blocked': return t('health.explainSnapshot');
    case 'error': return t('health.explainError');
    case 'retired': return t('health.explainRetired', {
      replacement: h.entry.replacedBy
        ? t('health.replacedBy', { name: APIS.find((a) => a.id === h.entry.replacedBy)?.name || h.entry.replacedBy })
        : '',
    });
    default: return '';
  }
}

/**
 * Keyboard help.
 * @param {import('./app.js').App} app
 * @param {HTMLElement} host
 */
export function renderHelp(app, host) {
  const rows = [
    ['drag', 'keys.navigate'],
    ['scroll', 'keys.zoom'],
    ['↑ ↓', 'keys.focusNext'],
    ['space', 'keys.playPause'],
    ['→', 'keys.faster'],
    ['←', 'keys.slower'],
    ['N', 'keys.now'],
    ['F', 'keys.freeFly'],
    ['W A S D / Q E', 'camera.freeHint'],
    ['O', 'render.showOrbits'],
    ['L', 'render.showLabels'],
    ['H', 'keys.hideUI'],
    ['P', 'nav.capture'],
    ['/', 'keys.search'],
    ['?', 'keys.help'],
    ['Alt + Enter', 'keys.fullscreen'],
  ];
  replace(host,
    el('table.table', null, [
      el('tbody', null, rows.map(([key, labelKey]) => el('tr', null, [
        el('td', null, [el('kbd', { text: key })]),
        el('td', { text: t(labelKey) }),
      ]))),
    ]),
    el('p.section__note', { text: t('a11y.photosensitive') }),
  );
}
