/**
 * Entry point.
 *
 * Keeps two things separate from everything else: collecting the DOM handles in
 * one place, and being the last line of defence when something fails during
 * boot. A WebGL2 failure is the most likely reason a visitor sees nothing at
 * all, so it gets an explanation rather than a blank screen.
 *
 * @module main
 */

import { App } from './ui/app.js';
import { t } from './ui/i18n.js';

/** @returns {Record<string, HTMLElement>} */
function collectDom() {
  const $ = (id) => document.getElementById(id);
  return {
    canvas: $('view'),
    labels: $('labels'),
    boot: $('boot'),
    bootFill: $('boot-fill'),
    bootStatus: $('boot-status'),
    bootError: $('boot-error'),
    topbar: $('topbar'),
    focusChip: $('focus-chip'),
    focusName: $('focus-name'),
    focusMeta: $('focus-meta'),
    statusDot: $('status-dot'),
    btnHealth: $('btn-health'),
    btnSearch: $('btn-search'),
    btnLanguage: $('btn-language'),
    btnHelp: $('btn-help'),
    btnHideUI: $('btn-hide-ui'),
    rail: $('rail'),
    bodyList: $('body-list'),
    panel: $('panel'),
    panelTabs: $('panel-tabs'),
    panelBody: $('panel-body'),
    clockDate: $('clock-date'),
    clockJd: $('clock-jd'),
    btnSlower: $('btn-slower'),
    btnPlay: $('btn-play'),
    btnFaster: $('btn-faster'),
    btnNow: $('btn-now'),
    rateSlider: $('rate-slider'),
    rateLabel: $('rate-label'),
    convergence: $('convergence'),
    fps: $('fps-readout'),
    dlgLanguage: $('dlg-language'),
    langList: $('lang-list'),
    dlgHealth: $('dlg-health'),
    healthBody: $('health-body'),
    dlgHelp: $('dlg-help'),
    helpBody: $('help-body'),
    dlgSearch: $('dlg-search'),
    searchInput: $('search-input'),
    searchResults: $('search-results'),
    dlgIntro: $('dlg-intro'),
    announcer: $('announcer'),
    toast: $('toast'),
    tour: $('tour'),
    tourStep: $('tour-step'),
    tourTitle: $('tour-title'),
    tourText: $('tour-text'),
    tourNext: $('tour-next'),
    tourPrev: $('tour-prev'),
    tourStop: $('tour-stop'),
  };
}

/**
 * Show a boot failure with enough detail to be actionable.
 * @param {Record<string, HTMLElement>} dom
 * @param {Error} error
 */
function showBootError(dom, error) {
  const message = /WebGL2/i.test(error.message)
    ? t('error.webgl')
    : /floating-point|EXT_color_buffer_float/i.test(error.message)
      ? t('error.webglFloat')
      : t('error.generic', { message: error.message });

  dom.bootStatus.textContent = '';
  dom.bootError.hidden = false;
  dom.bootError.textContent = '';

  const p = document.createElement('p');
  p.textContent = message;
  const details = document.createElement('details');
  const summary = document.createElement('summary');
  summary.textContent = t('error.details');
  const pre = document.createElement('pre');
  pre.style.whiteSpace = 'pre-wrap';
  pre.style.fontSize = '11px';
  pre.textContent = String(error.stack || error);
  details.append(summary, pre);

  const reload = document.createElement('button');
  reload.className = 'btn';
  reload.textContent = t('error.reload');
  reload.addEventListener('click', () => location.reload());

  dom.bootError.append(p, details, reload);
}

async function main() {
  const dom = collectDom();

  // Apply saved accessibility preferences before first paint so the interface
  // never flashes at the wrong contrast or size.
  try {
    const prefs = JSON.parse(localStorage.getItem('orrery.prefs') || '{}');
    if (prefs.highContrast) document.documentElement.dataset.contrast = 'high';
    if (prefs.largeText) document.documentElement.dataset.textsize = 'large';
    if (prefs.reducedMotion) document.documentElement.dataset.motion = 'reduced';
  } catch {
    /* storage disabled */
  }

  const app = new App(dom);
  // Exposed for the end-to-end tests and for anyone who wants to poke at it
  // from the console. This is an educational project; being inspectable is a
  // feature.
  window.orrery = app;

  try {
    await app.start((fraction, statusKey) => {
      dom.bootFill.style.width = `${Math.round(fraction * 100)}%`;
      dom.bootStatus.textContent = t(statusKey);
    });
    dom.boot.classList.add('is-done');
    setTimeout(() => { dom.boot.hidden = true; }, 700);
  } catch (error) {
    showBootError(dom, error);
    // Re-throw so the failure is visible in the console and to any test
    // harness watching for page errors.
    throw error;
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main, { once: true });
} else {
  main();
}
