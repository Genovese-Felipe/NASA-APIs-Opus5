import './styles.css';
import { API_CATALOG } from './catalog';
import { NasaDataHub } from './api';
import { CosmicSonifier } from './audio';
import { CanvasRecorder, downloadBlob, StillExporter } from './export';
import { ComputationalRenderer } from './renderer';
import { detectLanguage, getLanguage, languageNames, setLanguage, t, translations, type Language, type TranslationKey } from './i18n';
import { storageGet, storageSet } from './storage';
import type { ApodData, ArchiveItem, DataEnvelope, EarthEvent, EpicFrame, NeoObject, QualityId, SceneId, SolarEvent } from './types';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('Application root was not found');

setLanguage(detectLanguage());

const languageOptions = Object.entries(languageNames)
  .map(([value, label]) => `<option value="${value}">${label}</option>`).join('');

app.innerHTML = `
  <main class="observatory" id="main-controls">
    <div class="visual-stage" id="visual-stage">
      <div class="webgl-fallback" id="webgl-fallback" hidden>
        <span class="fallback-orbit"></span><span class="fallback-world"></span>
        <p>WebGL 2 unavailable — live NASA data remains accessible.</p>
      </div>
      <div class="scene-transition" aria-hidden="true"></div>
      <div class="reticle" aria-hidden="true"><span></span></div>
      <div class="grain" aria-hidden="true"></div>
    </div>

    <header class="topbar">
      <button class="brand" type="button" data-dialog="about-dialog" aria-label="About NASA COSMOS OPUS 5">
        <span class="brand-mark">O5</span>
        <span class="brand-copy"><strong>NASA COSMOS</strong><small>// OPUS 5</small></span>
      </button>
      <div class="mission-state" aria-live="polite">
        <span class="signal-dot"></span>
        <span id="global-status" data-i18n="loading">Acquiring signal</span>
        <span class="divider"></span>
        <span id="stream-count">06</span> <span data-i18n="dataStreams">data streams</span>
      </div>
      <div class="top-actions">
        <button class="icon-button" type="button" id="journey-button" aria-pressed="false" title="Cinematic journey"><span aria-hidden="true">▶</span><span class="desktop-label">Journey</span></button>
        <button class="icon-button" type="button" id="data-panel-toggle" aria-controls="data-panel" aria-expanded="true"><span aria-hidden="true">◫</span><span class="desktop-label" data-i18n="telemetry">Telemetry</span></button>
        <button class="icon-button" type="button" data-dialog="source-dialog"><span aria-hidden="true">⌁</span><span class="desktop-label" data-i18n="apiHealth">API health & provenance</span></button>
        <button class="icon-button" type="button" data-dialog="settings-dialog" aria-label="Settings"><span aria-hidden="true">⚙</span></button>
      </div>
    </header>

    <nav class="scene-rail" aria-label="Observatory modes">
      <span class="rail-label" data-i18n="modes">Observatory modes</span>
      <button class="scene-button active" type="button" data-scene="orbit" aria-pressed="true"><span class="scene-glyph">◉</span><span data-i18n="orbit">Deep orbit</span></button>
      <button class="scene-button" type="button" data-scene="earth" aria-pressed="false"><span class="scene-glyph">◎</span><span data-i18n="earth">Living Earth</span></button>
      <button class="scene-button" type="button" data-scene="neo" aria-pressed="false"><span class="scene-glyph">⟲</span><span data-i18n="neo">Near-Earth watch</span></button>
      <button class="scene-button" type="button" data-scene="helio" aria-pressed="false"><span class="scene-glyph">✦</span><span data-i18n="helio">Heliophysics</span></button>
      <button class="scene-button" type="button" data-scene="archive" aria-pressed="false"><span class="scene-glyph">▦</span><span data-i18n="archive">NASA archive</span></button>
    </nav>

    <aside class="data-panel" id="data-panel" aria-live="polite">
      <div class="panel-kicker"><span class="signal-dot small"></span><span id="panel-mode">LIVE SCIENCE FEED</span></div>
      <h1 id="scene-title" data-i18n="orbit">Deep orbit</h1>
      <p id="scene-description" data-i18n="orbitDesc">Ray-traced worlds, APOD context, and free-flight navigation.</p>
      <div class="data-content" id="data-content"><div class="skeleton tall"></div><div class="skeleton"></div></div>
      <footer class="data-footer"><span id="data-source">NASA OPEN DATA</span><time id="data-time">—</time></footer>
    </aside>

    <section class="control-deck" aria-label="Rendering and capture controls">
      <div class="deck-group quality-group">
        <label for="quality-select" data-i18n="quality">Image quality</label>
        <select id="quality-select">
          <option value="auto" data-i18n="auto">Auto</option><option value="low" data-i18n="low">Low</option>
          <option value="balanced" data-i18n="balanced">Balanced</option><option value="high" data-i18n="high">High</option>
          <option value="ultra" data-i18n="ultra">Ultra</option>
        </select>
      </div>
      <div class="deck-group orbit-group">
        <button class="toggle-button active" type="button" id="orbit-toggle" aria-pressed="true"><span class="toggle-led"></span><span data-i18n="orbitMode">Orbit mode</span></button>
        <label class="range-control"><span data-i18n="speed">Speed</span><input id="orbit-speed" type="range" min="0" max="1.2" step="0.02" value="0.22" /></label>
        <label class="range-control"><span data-i18n="tilt">Inclination</span><input id="orbit-tilt" type="range" min="-0.8" max="0.8" step="0.02" value="0.18" /></label>
      </div>
      <div class="deck-group capture-group">
        <button class="deck-button" type="button" id="sound-toggle" aria-pressed="false"><span aria-hidden="true">◖</span><span data-i18n="sound">Sonification</span></button>
        <button class="deck-button record-button" type="button" id="record-button"><span class="record-dot" aria-hidden="true"></span><span data-i18n="record">Record</span><time id="record-time" hidden>00:00</time></button>
        <button class="deck-button primary" type="button" data-dialog="export-dialog"><span aria-hidden="true">⇩</span><span data-i18n="export">Export</span></button>
      </div>
      <div class="deck-telemetry" aria-label="Renderer performance">
        <strong id="fps-value">—</strong><small>FPS</small><span></span><strong id="resolution-value">—</strong><small>PX</small>
      </div>
    </section>

    <div class="toast-region" id="toast-region" aria-live="assertive" aria-atomic="true"></div>
  </main>

  <dialog class="mission-dialog export-dialog" id="export-dialog">
    <form method="dialog" class="dialog-shell" id="export-form">
      <header><div><span class="eyebrow">COMPUTATIONAL CAPTURE</span><h2 data-i18n="exportStudio">Export studio</h2></div><button class="dialog-close" value="cancel" aria-label="Close">×</button></header>
      <div class="export-preview"><div class="preview-frame"><span>OPUS 5</span></div><p>Every still is re-rendered from the shader at the selected native resolution. It is not an upscaled screenshot.</p></div>
      <fieldset><legend data-i18n="resolution">Resolution</legend>
        <label class="choice-card"><input type="radio" name="resolution" value="viewport" checked /><strong data-i18n="viewport">Viewport</strong><small id="viewport-size">—</small></label>
        <label class="choice-card"><input type="radio" name="resolution" value="4k" /><strong data-i18n="fourK">4K UHD</strong><small>3840 × 2160</small></label>
        <label class="choice-card"><input type="radio" name="resolution" value="8k" /><strong data-i18n="eightK">8K UHD</strong><small>7680 × 4320 · tiled</small></label>
      </fieldset>
      <fieldset><legend data-i18n="format">Format</legend><div class="segmented">
        <label><input type="radio" name="format" value="png" checked /><span>PNG</span></label>
        <label><input type="radio" name="format" value="jpeg" /><span>JPEG</span></label>
        <label><input type="radio" name="format" value="webp" /><span>WEBP</span></label>
      </div></fieldset>
      <div class="progress-track" id="export-progress" hidden><span></span></div>
      <p class="dialog-message" id="export-message"></p>
      <footer><button type="button" class="secondary" data-close="export-dialog" data-i18n="close">Close</button><button type="submit" class="primary-action"><span>⇩</span><span data-i18n="download">Render & download</span></button></footer>
    </form>
  </dialog>

  <dialog class="mission-dialog settings-dialog" id="settings-dialog">
    <form method="dialog" class="dialog-shell" id="settings-form">
      <header><div><span class="eyebrow">LOCAL PREFERENCES</span><h2 data-i18n="missionControl">Mission control</h2></div><button class="dialog-close" value="cancel" aria-label="Close">×</button></header>
      <label class="field"><span data-i18n="language">Language</span><select id="language-select">${languageOptions}</select></label>
      <label class="field"><span data-i18n="apiKey">NASA API key</span><input id="api-key-input" type="password" inputmode="text" autocomplete="off" placeholder="DEMO_KEY" /><small data-i18n="apiKeyHint">Optional. DEMO_KEY works with strict limits; a personal key remains in this browser session only.</small></label>
      <label class="switch-row"><span><strong data-i18n="reducedMotion">Reduce motion</strong><small>Preserves data interaction while limiting automated camera movement.</small></span><input id="reduced-motion" type="checkbox" /></label>
      <footer><button type="button" class="secondary" id="refresh-data" data-i18n="refreshData">Refresh live data</button><button type="submit" class="primary-action" data-i18n="apply">Apply</button></footer>
    </form>
  </dialog>

  <dialog class="mission-dialog source-dialog" id="source-dialog">
    <div class="dialog-shell wide">
      <header><div><span class="eyebrow">PROVENANCE LEDGER</span><h2 data-i18n="apiHealth">API health & provenance</h2></div><button class="dialog-close" data-close="source-dialog" aria-label="Close">×</button></header>
      <p class="source-intro">Live browser-safe endpoints are called through a rate-limited cache. Archived services remain discoverable; policy-restricted JPL SSD services are official deep links only.</p>
      <div class="source-grid" id="source-grid"></div>
      <footer class="legal-footer"><span data-i18n="privacy">No analytics. No account. API keys are never committed or transmitted anywhere except NASA.</span><span data-i18n="credits">Independent educational project. Not an official NASA product.</span></footer>
    </div>
  </dialog>

  <dialog class="mission-dialog archive-dialog" id="archive-dialog">
    <div class="dialog-shell gallery-shell">
      <header><div><span class="eyebrow">NASA MEDIA LIBRARY</span><h2 data-i18n="archive">NASA archive</h2></div><button class="dialog-close" data-close="archive-dialog" aria-label="Close">×</button></header>
      <form class="archive-search" id="archive-search"><label><span class="sr-only" data-i18n="search">Search</span><input id="archive-query" type="search" data-i18n-placeholder="searchPlaceholder" placeholder="Moon, Webb, black hole, Artemis…" maxlength="120" /></label><button type="submit" data-i18n="search">Search</button></form>
      <div class="archive-grid" id="archive-grid"><p data-i18n="noResults">No archive results yet.</p></div>
    </div>
  </dialog>

  <dialog class="mission-dialog about-dialog" id="about-dialog">
    <div class="dialog-shell about-shell">
      <header><div><span class="eyebrow">NASA COSMOS // OPUS 5</span><h2 data-i18n="about">About this mission</h2></div><button class="dialog-close" data-close="about-dialog" aria-label="Close">×</button></header>
      <div class="about-hero"><span class="brand-mark large">O5</span><p data-i18n="aboutText">OPUS 5 turns verified NASA data into an explorable instrument. Visuals are computational; source status is always visible.</p></div>
      <section><h3 data-i18n="help">Controls</h3><p data-i18n="helpText">Drag or use arrow keys to look around. Wheel or pinch to zoom. O toggles orbit, Space pauses, E exports, and R records.</p></section>
      <section class="principles"><article><strong>01</strong><span>Compute the visual</span></article><article><strong>02</strong><span>Show the source</span></article><article><strong>03</strong><span>Degrade honestly</span></article></section>
      <footer class="legal-footer"><span data-i18n="credits">Independent educational project. Not an official NASA product.</span></footer>
    </div>
  </dialog>
`;

const byId = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing interface element: ${id}`);
  return element as T;
};

const visualStage = byId<HTMLDivElement>('visual-stage');
const dataHub = new NasaDataHub();
const sonifier = new CosmicSonifier();
const recorder = new CanvasRecorder();
let renderer: ComputationalRenderer | null = null;
let stillExporter: StillExporter | null = null;
let currentScene: SceneId = 'orbit';
let currentMode: DataEnvelope<unknown>['mode'] = 'demo';
let journeyTimer = 0;
let recordingClock = 0;

try {
  renderer = new ComputationalRenderer(visualStage);
  stillExporter = new StillExporter(renderer);
} catch (error) {
  byId('webgl-fallback').hidden = false;
  toast(error instanceof Error ? error.message : 'WebGL initialization failed', 'error');
}

function applyTranslations(): void {
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((element) => {
    const key = element.dataset.i18n as TranslationKey;
    if (key && key in translations.en) element.textContent = t(key);
  });
  document.querySelectorAll<HTMLInputElement>('[data-i18n-placeholder]').forEach((element) => {
    const key = element.dataset.i18nPlaceholder as TranslationKey;
    if (key && key in translations.en) element.placeholder = t(key);
  });
  const languageSelect = byId<HTMLSelectElement>('language-select');
  languageSelect.value = getLanguage();
  updateSceneHeading(currentScene);
  renderSources();
}

function updateSceneHeading(scene: SceneId): void {
  const title = byId('scene-title');
  const description = byId('scene-description');
  const keys: Record<SceneId, [TranslationKey, TranslationKey]> = {
    orbit: ['orbit', 'orbitDesc'], earth: ['earth', 'earthDesc'], neo: ['neo', 'neoDesc'],
    helio: ['helio', 'helioDesc'], archive: ['archive', 'archiveDesc'],
  };
  title.textContent = t(keys[scene][0]);
  description.textContent = t(keys[scene][1]);
}

function safeUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.href : null;
  } catch { return null; }
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, value?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (value !== undefined) node.textContent = value;
  return node;
}

function metric(label: string, value: string): HTMLElement {
  const card = element('div', 'metric-card');
  card.append(element('span', '', label), element('strong', '', value));
  return card;
}

function setPanelMeta(envelope: DataEnvelope<unknown>): void {
  currentMode = envelope.mode;
  byId('panel-mode').textContent = envelope.mode === 'live' ? t('liveNotice') : envelope.mode === 'cache' ? t('cache') : t('demo');
  byId('data-source').textContent = envelope.source.toUpperCase();
  byId('data-time').textContent = new Date(envelope.fetchedAt).toLocaleTimeString(getLanguage(), { hour: '2-digit', minute: '2-digit' });
  const status = byId('global-status');
  status.textContent = envelope.mode === 'live' ? t('live') : envelope.mode === 'cache' ? t('cache') : t('demo');
  document.body.dataset.dataMode = envelope.mode;
}

function renderApod(envelope: DataEnvelope<ApodData>): void {
  setPanelMeta(envelope);
  const content = byId('data-content');
  content.replaceChildren();
  const data = envelope.data;
  const card = element('article', 'feature-card apod-card');
  const mediaUrl = safeUrl(data.thumbnailUrl || (data.mediaType === 'image' ? data.url : ''));
  if (mediaUrl) {
    const image = element('img'); image.src = mediaUrl; image.alt = data.title; image.loading = 'eager'; image.referrerPolicy = 'no-referrer';
    card.append(image);
  }
  const meta = element('div', 'feature-copy');
  meta.append(element('span', 'eyebrow', `APOD · ${data.date}`), element('h2', '', data.title), element('p', '', data.explanation));
  card.append(meta);
  content.append(card);
  if (envelope.mode === 'demo') content.append(element('p', 'notice demo-notice', t('fallbackNotice')));
  renderer?.setData(0.38, 0.08, 1);
  sonifier.setEnergy(0.38);
}

function renderEarth(eventsEnvelope: DataEnvelope<EarthEvent[]>, epicEnvelope: DataEnvelope<EpicFrame[]>): void {
  setPanelMeta(eventsEnvelope.mode === 'live' ? eventsEnvelope : epicEnvelope);
  const content = byId('data-content'); content.replaceChildren();
  const metrics = element('div', 'metric-grid');
  metrics.append(metric(t('activeEvents'), String(eventsEnvelope.data.length)), metric('EPIC', String(epicEnvelope.data.length)));
  content.append(metrics);
  const epic = epicEnvelope.data[0];
  if (epic && safeUrl(epic.imageUrl)) {
    const figure = element('figure', 'epic-frame');
    const image = element('img'); image.src = epic.imageUrl; image.alt = epic.caption; image.loading = 'lazy'; image.referrerPolicy = 'no-referrer';
    figure.append(image, element('figcaption', '', `DSCOVR EPIC · ${epic.date.slice(0, 16)} UTC`)); content.append(figure);
  }
  const list = element('ol', 'signal-list');
  eventsEnvelope.data.slice(0, 6).forEach((event) => {
    const item = element('li'); item.append(element('span', 'event-marker'), element('div'));
    const copy = item.lastElementChild as HTMLDivElement;
    copy.append(element('strong', '', event.title), element('small', '', `${event.category} · ${event.latitude.toFixed(1)}°, ${event.longitude.toFixed(1)}°`));
    list.append(item);
  });
  content.append(list);
  renderer?.setEarthEvents(eventsEnvelope.data);
  renderer?.setData(Math.min(1, eventsEnvelope.data.length / 20), 0.18, eventsEnvelope.data.length);
  sonifier.setEnergy(Math.min(1, eventsEnvelope.data.length / 20));
}

function renderNeo(envelope: DataEnvelope<NeoObject[]>): void {
  setPanelMeta(envelope);
  const content = byId('data-content'); content.replaceChildren();
  const hazardous = envelope.data.filter((object) => object.hazardous).length;
  const maxVelocity = Math.max(0, ...envelope.data.map((object) => object.velocityKps));
  const metrics = element('div', 'metric-grid');
  metrics.append(metric('Objects', String(envelope.data.length)), metric(t('hazardous'), String(hazardous)), metric('MAX ΔV', `${maxVelocity.toFixed(1)} km/s`));
  content.append(metrics);
  const list = element('ol', 'neo-list');
  envelope.data.slice(0, 8).forEach((object) => {
    const item = element('li', object.hazardous ? 'risk' : '');
    const title = element('div'); title.append(element('strong', '', object.name), element('small', '', object.hazardous ? t('hazardous') : 'TRACKED'));
    const details = element('div', 'neo-metrics'); details.append(element('span', '', `${object.diameterKm.toFixed(2)} km`), element('span', '', `${object.velocityKps.toFixed(1)} km/s`), element('span', '', `${(object.missDistanceKm / 1_000_000).toFixed(2)}M km`));
    item.append(title, details); list.append(item);
  });
  content.append(list);
  const risk = envelope.data.length ? hazardous / envelope.data.length : 0;
  renderer?.setData(Math.min(1, maxVelocity / 60), risk, envelope.data.length);
  sonifier.setEnergy(Math.min(1, maxVelocity / 60));
}

function renderSolar(envelope: DataEnvelope<SolarEvent[]>): void {
  setPanelMeta(envelope);
  const content = byId('data-content'); content.replaceChildren();
  const cmes = envelope.data.filter((event) => event.type === 'CME');
  const flares = envelope.data.filter((event) => event.type === 'FLR');
  const metrics = element('div', 'metric-grid');
  metrics.append(metric('CME · 30D', String(cmes.length)), metric('FLARE · 30D', String(flares.length)));
  content.append(metrics);
  const list = element('ol', 'signal-list solar-list');
  envelope.data.slice(0, 9).forEach((event) => {
    const item = element('li');
    const marker = element('span', `solar-marker ${event.type.toLowerCase()}`);
    const copy = element('div');
    copy.append(element('strong', '', `${event.type} ${event.classType || (event.speedKps ? `${event.speedKps.toFixed(0)} km/s` : '')}`.trim()), element('small', '', new Date(event.startTime).toLocaleString(getLanguage())));
    item.append(marker, copy); list.append(item);
  });
  content.append(list);
  const energy = Math.min(1, (flares.length + cmes.length * 1.4) / 18);
  renderer?.setData(energy, 0.1, envelope.data.length); sonifier.setEnergy(energy);
}

function renderArchiveSummary(envelope: DataEnvelope<ArchiveItem[]>): void {
  setPanelMeta(envelope);
  const content = byId('data-content'); content.replaceChildren();
  const card = element('button', 'archive-launch'); card.type = 'button'; card.dataset.dialog = 'archive-dialog';
  card.append(element('span', 'archive-symbol', '▦'), element('strong', '', t('archive')), element('small', '', `${envelope.data.length} ${t('noResults').replace('No ', '').replace('.', '')}`));
  card.addEventListener('click', () => openDialog('archive-dialog'));
  content.append(card);
  const mosaics = element('div', 'mini-mosaic');
  envelope.data.slice(0, 4).forEach((item) => {
    const image = element('img'); image.src = item.previewUrl; image.alt = item.title; image.loading = 'lazy'; image.referrerPolicy = 'no-referrer'; mosaics.append(image);
  });
  content.append(mosaics, element('p', 'notice', 'NASA media remains separate from the computational canvas, preserving attribution and export integrity.'));
  renderArchiveGrid(envelope.data);
  renderer?.setData(0.58, 0.05, envelope.data.length); sonifier.setEnergy(0.58);
}

function renderArchiveGrid(items: ArchiveItem[]): void {
  const grid = byId('archive-grid'); grid.replaceChildren();
  if (!items.length) { grid.append(element('p', '', t('noResults'))); return; }
  items.forEach((item) => {
    const article = element('article', 'archive-item');
    const image = element('img'); image.src = item.previewUrl; image.alt = item.title; image.loading = 'lazy'; image.referrerPolicy = 'no-referrer';
    const copy = element('div'); copy.append(element('span', 'eyebrow', `${item.center} · ${item.date.slice(0, 4)}`), element('h3', '', item.title), element('p', '', item.description));
    const link = element('a', 'archive-link', 'NASA ID ↗'); link.href = `https://images.nasa.gov/details/${encodeURIComponent(item.nasaId)}`; link.target = '_blank'; link.rel = 'noopener noreferrer';
    copy.append(link); article.append(image, copy); grid.append(article);
  });
}

async function loadScene(scene: SceneId, force = false): Promise<void> {
  currentScene = scene;
  updateSceneHeading(scene);
  byId('data-content').replaceChildren(element('div', 'skeleton tall'), element('div', 'skeleton'));
  try {
    if (scene === 'orbit') renderApod(await dataHub.loadApod(force));
    else if (scene === 'earth') { const data = await dataHub.loadEarth(force); renderEarth(data.events, data.epic); }
    else if (scene === 'neo') renderNeo(await dataHub.loadNeo(force));
    else if (scene === 'helio') renderSolar(await dataHub.loadSolar(force));
    else renderArchiveSummary(await dataHub.searchArchive(byId<HTMLInputElement>('archive-query').value || 'James Webb Space Telescope', force));
  } catch (error) {
    toast(error instanceof Error ? error.message : t('unavailable'), 'error');
  }
}

function setScene(scene: SceneId): void {
  document.querySelectorAll<HTMLButtonElement>('[data-scene]').forEach((button) => {
    const active = button.dataset.scene === scene;
    button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active));
  });
  const transition = document.querySelector<HTMLElement>('.scene-transition');
  transition?.classList.remove('flash'); requestAnimationFrame(() => transition?.classList.add('flash'));
  renderer?.setScene(scene); sonifier.setScene(scene); sonifier.pulse(0.35);
  const url = new URL(location.href); url.searchParams.set('scene', scene); history.replaceState(null, '', url);
  void loadScene(scene);
}

function renderSources(): void {
  const grid = byId('source-grid'); grid.replaceChildren();
  const statuses = new Map(dataHub.getStatuses().map((status) => [status.id, status]));
  API_CATALOG.forEach((source) => {
    const status = statuses.get(source.id)?.status;
    const article = element('article', 'source-card');
    const header = element('header');
    const policyLabel = source.status === 'archived' ? t('archived') : source.status === 'reference-only' ? t('referenceOnly') : source.browserPolicy === 'deep-link-only' ? t('referenceOnly') : t('browserReady');
    header.append(element('span', `status-light ${status || source.status}`), element('strong', '', source.name), element('small', '', policyLabel));
    const copy = element('p', '', source.description);
    const footer = element('footer'); footer.append(element('span', '', source.agency));
    const link = element('a', '', `${t('openDocs')} ↗`); link.href = source.docs; link.target = '_blank'; link.rel = 'noopener noreferrer'; footer.append(link);
    article.append(header, copy, footer); grid.append(article);
  });
}

function openDialog(id: string): void {
  const dialog = byId<HTMLDialogElement>(id);
  if (!dialog.open) dialog.showModal();
}

function toast(message: string, kind: 'info' | 'success' | 'error' = 'info'): void {
  const region = byId('toast-region');
  const notice = element('div', `toast ${kind}`, message); region.append(notice);
  window.setTimeout(() => notice.remove(), 5200);
}

function toggleJourney(): void {
  const button = byId<HTMLButtonElement>('journey-button');
  const active = !button.classList.contains('active');
  button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active));
  window.clearInterval(journeyTimer);
  if (active) {
    const scenes: SceneId[] = ['orbit', 'earth', 'neo', 'helio', 'archive'];
    journeyTimer = window.setInterval(() => setScene(scenes[(scenes.indexOf(currentScene) + 1) % scenes.length]!), 18_000);
  }
}

async function toggleRecording(): Promise<void> {
  const button = byId<HTMLButtonElement>('record-button');
  const label = button.querySelector<HTMLElement>('[data-i18n]');
  const time = byId<HTMLTimeElement>('record-time');
  if (!recorder.isRecording) {
    if (!renderer) return toast('WebGL canvas is unavailable.', 'error');
    try {
      const mime = recorder.start(renderer.canvas, sonifier.getRecordingTrack(), 60, 120);
      button.classList.add('recording'); time.hidden = false; if (label) label.textContent = t('stop');
      if (!mime.startsWith('video/mp4')) toast(t('recorderFallback'));
      recordingClock = window.setInterval(() => {
        const elapsed = Math.floor(recorder.elapsedSeconds); time.textContent = `${String(Math.floor(elapsed/60)).padStart(2,'0')}:${String(elapsed%60).padStart(2,'0')}`;
      }, 500);
    } catch (error) { toast(error instanceof Error ? error.message : t('unavailable'), 'error'); }
  } else {
    try {
      const result = await recorder.stop();
      downloadBlob(result.blob, `NASA-OPUS5-${currentScene}-${new Date().toISOString().replaceAll(':','-').slice(0,19)}.${result.extension}`);
      toast(`${result.extension.toUpperCase()} · ${(result.blob.size/1_048_576).toFixed(1)} MB`, 'success');
    } catch (error) { toast(error instanceof Error ? error.message : t('unavailable'), 'error'); }
    window.clearInterval(recordingClock); button.classList.remove('recording'); time.hidden = true; time.textContent = '00:00'; if (label) label.textContent = t('record');
  }
}

document.querySelectorAll<HTMLButtonElement>('[data-scene]').forEach((button) => button.addEventListener('click', () => setScene(button.dataset.scene as SceneId)));
document.querySelectorAll<HTMLElement>('[data-dialog]').forEach((button) => button.addEventListener('click', () => openDialog(button.dataset.dialog!)));
document.querySelectorAll<HTMLElement>('[data-close]').forEach((button) => button.addEventListener('click', () => byId<HTMLDialogElement>(button.dataset.close!).close()));
document.querySelectorAll<HTMLDialogElement>('dialog').forEach((dialog) => dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); }));

byId<HTMLButtonElement>('journey-button').addEventListener('click', toggleJourney);
byId<HTMLButtonElement>('data-panel-toggle').addEventListener('click', (event) => {
  const button = event.currentTarget as HTMLButtonElement; const panel = byId('data-panel');
  if (matchMedia('(max-width: 760px)').matches) {
    panel.classList.toggle('mobile-open');
    button.setAttribute('aria-expanded', String(panel.classList.contains('mobile-open')));
  } else {
    panel.classList.toggle('collapsed');
    button.setAttribute('aria-expanded', String(!panel.classList.contains('collapsed')));
  }
});
byId<HTMLSelectElement>('quality-select').addEventListener('change', (event) => {
  const quality = (event.target as HTMLSelectElement).value as QualityId; renderer?.setQuality(quality); storageSet('local', 'opus5-quality', quality);
  const url = new URL(location.href); url.searchParams.set('quality', quality); history.replaceState(null, '', url);
});
byId<HTMLButtonElement>('orbit-toggle').addEventListener('click', (event) => {
  const button = event.currentTarget as HTMLButtonElement; const active = !button.classList.contains('active'); button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active)); renderer?.setOrbit(active);
});
byId<HTMLInputElement>('orbit-speed').addEventListener('input', (event) => renderer?.setOrbitSpeed(Number((event.target as HTMLInputElement).value)));
byId<HTMLInputElement>('orbit-tilt').addEventListener('input', (event) => renderer?.setOrbitTilt(Number((event.target as HTMLInputElement).value)));
byId<HTMLButtonElement>('sound-toggle').addEventListener('click', async (event) => {
  const button = event.currentTarget as HTMLButtonElement; await sonifier.setEnabled(!sonifier.isEnabled); button.classList.toggle('active', sonifier.isEnabled); button.setAttribute('aria-pressed', String(sonifier.isEnabled)); sonifier.pulse(0.2);
});
byId<HTMLButtonElement>('record-button').addEventListener('click', () => void toggleRecording());
recorder.addEventListener('limit', () => { toast('Recording reached the 120-second memory-safe limit.'); void toggleRecording(); });

byId<HTMLFormElement>('settings-form').addEventListener('submit', () => {
  const language = byId<HTMLSelectElement>('language-select').value as Language; setLanguage(language); applyTranslations();
  const key = byId<HTMLInputElement>('api-key-input').value; if (key.trim()) dataHub.setApiKey(key);
  const reduced = byId<HTMLInputElement>('reduced-motion').checked; renderer?.setReducedMotion(reduced); storageSet('local', 'opus5-reduced-motion', String(reduced));
  void loadScene(currentScene, true);
});
byId<HTMLButtonElement>('refresh-data').addEventListener('click', () => void loadScene(currentScene, true));
byId<HTMLFormElement>('archive-search').addEventListener('submit', async (event) => {
  event.preventDefault(); const query = byId<HTMLInputElement>('archive-query').value; const grid = byId('archive-grid'); grid.replaceChildren(element('div', 'skeleton tall'));
  const results = await dataHub.searchArchive(query, true); renderArchiveGrid(results.data); if (currentScene === 'archive') renderArchiveSummary(results);
});

byId<HTMLFormElement>('export-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!stillExporter || !renderer) return toast('Renderer unavailable', 'error');
  const form = new FormData(event.currentTarget as HTMLFormElement);
  const resolution = String(form.get('resolution'));
  const format = String(form.get('format')) as 'png' | 'jpeg' | 'webp';
  const stats = renderer.getStats();
  const dimensions = resolution === '8k' ? [7680,4320] : resolution === '4k' ? [3840,2160] : [stats.width,stats.height];
  const progress = byId('export-progress'); const bar = progress.querySelector<HTMLElement>('span')!; const message = byId('export-message');
  progress.hidden = false; bar.style.width = '0%'; message.textContent = t('exporting');
  try {
    const blob = await stillExporter.export({ width: dimensions[0]!, height: dimensions[1]!, format, quality: format === 'jpeg' ? 0.94 : 1, filename: `NASA-OPUS5-${currentScene}-${dimensions[0]}x${dimensions[1]}` }, (value) => { bar.style.width = `${Math.round(value*100)}%`; });
    message.textContent = `${format.toUpperCase()} · ${dimensions[0]} × ${dimensions[1]} · ${(blob.size/1_048_576).toFixed(1)} MB`; toast(message.textContent, 'success');
  } catch (error) {
    message.textContent = error instanceof Error && error.message === 'EXPORT_CAPABILITY' ? t('capabilityWarning') : error instanceof Error ? error.message : t('unavailable'); toast(message.textContent, 'error');
  }
});

renderer?.addEventListener('stats', (event) => {
  const stats = (event as CustomEvent).detail;
  byId('fps-value').textContent = stats.fps.toFixed(0); byId('resolution-value').textContent = `${stats.width}×${stats.height}`;
  byId('viewport-size').textContent = `${stats.width} × ${stats.height}`;
});
dataHub.addEventListener('status', () => renderSources());

window.addEventListener('keydown', (event) => {
  if ((event.target as HTMLElement)?.matches('input, select, textarea')) return;
  if (event.key.toLowerCase() === 'o') byId<HTMLButtonElement>('orbit-toggle').click();
  else if (event.key.toLowerCase() === 'e') openDialog('export-dialog');
  else if (event.key.toLowerCase() === 'r') void toggleRecording();
  else if (event.key === ' ') { event.preventDefault(); if (renderer) renderer.setPaused(!renderer.state.paused); }
  else if (renderer && event.key.startsWith('Arrow')) {
    event.preventDefault();
    if (event.key === 'ArrowLeft') renderer.state.yaw -= 0.08;
    if (event.key === 'ArrowRight') renderer.state.yaw += 0.08;
    if (event.key === 'ArrowUp') renderer.state.pitch = Math.min(1.2, renderer.state.pitch + 0.06);
    if (event.key === 'ArrowDown') renderer.state.pitch = Math.max(-1.2, renderer.state.pitch - 0.06);
  }
});

const params = new URLSearchParams(location.search);
const requestedScene = params.get('scene');
const requestedQuality = (params.get('quality') || storageGet('local', 'opus5-quality')) as QualityId | null;
if (requestedQuality && ['auto','low','balanced','high','ultra'].includes(requestedQuality)) { byId<HTMLSelectElement>('quality-select').value = requestedQuality; renderer?.setQuality(requestedQuality); }
const reduced = storageGet('local', 'opus5-reduced-motion') === 'true' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
byId<HTMLInputElement>('reduced-motion').checked = reduced; renderer?.setReducedMotion(reduced);
applyTranslations(); renderSources();
if (requestedScene && ['orbit','earth','neo','helio','archive'].includes(requestedScene)) setScene(requestedScene as SceneId); else void loadScene('orbit');

const artifactWindow = window as Window & { __OPUS5_ARTIFACT__?: boolean };
if (!artifactWindow.__OPUS5_ARTIFACT__ && 'serviceWorker' in navigator && location.protocol === 'https:') window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => undefined));
