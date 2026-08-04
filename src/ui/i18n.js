/**
 * Internationalisation.
 *
 * A dependency-free layer built on the `Intl` primitives the platform already
 * provides. Design decisions worth knowing:
 *
 *  - **Catalogues are flat.** `"panel.body.mass"` rather than nested objects.
 *    Flat keys make a missing-key diff between locales a one-line set
 *    comparison, which is what `tools/validate-locales.mjs` runs in CI.
 *  - **Plurals go through `Intl.PluralRules`.** Hard-coding `n === 1` is wrong
 *    in six of our ten languages: Russian has three plural categories, Arabic
 *    has six, and Chinese, Japanese and Korean have one.
 *  - **Numbers, dates and units go through `Intl`.** A German reader expects
 *    `1.234,5 km`, an Indian reader expects `12,34,567`, and neither should
 *    require a translator to think about it.
 *  - **Direction is data.** Arabic sets `dir="rtl"` on the document and the
 *    stylesheet uses logical properties throughout, so no rule needs mirroring.
 *  - **Locales load on demand.** English is bundled so the first paint never
 *    waits on a network request; the other nine are fetched when selected.
 *
 * @module ui/i18n
 */

import en from './locales/en.js';

/**
 * @typedef {object} LocaleMeta
 * @property {string} tag BCP-47 tag.
 * @property {string} name English name.
 * @property {string} native Endonym, shown in the picker.
 * @property {'ltr'|'rtl'} dir
 * @property {string} [font} Extra font stack for scripts that need it.
 */

/**
 * The shipped languages.
 *
 * Six were requested (English, Simplified Chinese, Brazilian Portuguese,
 * Spanish, Korean, French); the remaining four are Japanese, German, Russian
 * and Arabic. Arabic is deliberate rather than convenient: it forces the whole
 * interface through a right-to-left pass, which catches layout assumptions that
 * no amount of LTR testing would.
 *
 * @type {ReadonlyArray<LocaleMeta>}
 */
export const LOCALES = Object.freeze([
  { tag: 'en', name: 'English', native: 'English', dir: 'ltr' },
  { tag: 'zh-Hans', name: 'Chinese (Simplified)', native: '简体中文', dir: 'ltr' },
  { tag: 'pt-BR', name: 'Portuguese (Brazil)', native: 'Português (Brasil)', dir: 'ltr' },
  { tag: 'es', name: 'Spanish', native: 'Español', dir: 'ltr' },
  { tag: 'ko', name: 'Korean', native: '한국어', dir: 'ltr' },
  { tag: 'fr', name: 'French', native: 'Français', dir: 'ltr' },
  { tag: 'ja', name: 'Japanese', native: '日本語', dir: 'ltr' },
  { tag: 'de', name: 'German', native: 'Deutsch', dir: 'ltr' },
  { tag: 'ru', name: 'Russian', native: 'Русский', dir: 'ltr' },
  { tag: 'ar', name: 'Arabic', native: 'العربية', dir: 'rtl' },
]);

/** @type {Map<string, LocaleMeta>} */
export const LOCALE_BY_TAG = new Map(LOCALES.map((l) => [l.tag, l]));

const STORAGE_KEY = 'orrery.locale';

/** @type {Map<string, Record<string,string>>} */
const catalogues = new Map([['en', en]]);

let current = 'en';
/** @type {Set<(tag:string)=>void>} */
const listeners = new Set();

/**
 * Pick the best supported locale for this visitor.
 *
 * Order: an explicit `?lang=` in the URL (so a link can be shared in a given
 * language), then a previous choice, then the browser's preference list.
 * @returns {string}
 */
export function detectLocale() {
  try {
    const fromUrl = new URLSearchParams(location.search).get('lang');
    if (fromUrl && LOCALE_BY_TAG.has(fromUrl)) return fromUrl;
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && LOCALE_BY_TAG.has(stored)) return stored;
  } catch {
    /* URL or storage unavailable */
  }
  const preferred = typeof navigator !== 'undefined' ? navigator.languages || [navigator.language] : [];
  for (const raw of preferred) {
    if (!raw) continue;
    if (LOCALE_BY_TAG.has(raw)) return raw;
    // "zh-CN", "zh-SG" and "zh" all map to Simplified; "pt" maps to pt-BR.
    const base = raw.split('-')[0];
    if (base === 'zh') return 'zh-Hans';
    if (base === 'pt') return 'pt-BR';
    const match = LOCALES.find((l) => l.tag.split('-')[0] === base);
    if (match) return match.tag;
  }
  return 'en';
}

/**
 * Load a catalogue, falling back to English if it cannot be fetched.
 * @param {string} tag
 * @returns {Promise<Record<string,string>>}
 */
export async function loadCatalogue(tag) {
  if (catalogues.has(tag)) return catalogues.get(tag);
  try {
    const mod = await import(`./locales/${tag}.js`);
    catalogues.set(tag, mod.default);
    return mod.default;
  } catch {
    return en;
  }
}

/**
 * Switch language. Updates `lang`/`dir` on the document and notifies listeners.
 * @param {string} tag
 * @returns {Promise<void>}
 */
export async function setLocale(tag) {
  const meta = LOCALE_BY_TAG.get(tag) || LOCALE_BY_TAG.get('en');
  await loadCatalogue(meta.tag);
  current = meta.tag;
  try {
    localStorage.setItem(STORAGE_KEY, meta.tag);
  } catch {
    /* storage disabled */
  }
  if (typeof document !== 'undefined') {
    document.documentElement.lang = meta.tag;
    document.documentElement.dir = meta.dir;
    document.documentElement.dataset.locale = meta.tag;
  }
  for (const fn of listeners) {
    try {
      fn(meta.tag);
    } catch {
      /* a broken listener must not block a language change */
    }
  }
}

/** @returns {string} The active BCP-47 tag. */
export function getLocale() {
  return current;
}

/** @returns {LocaleMeta} */
export function getLocaleMeta() {
  return LOCALE_BY_TAG.get(current) || LOCALE_BY_TAG.get('en');
}

/**
 * Subscribe to language changes.
 * @param {(tag:string)=>void} fn
 * @returns {()=>void}
 */
export function onLocaleChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Translate a key.
 *
 * Interpolation uses `{name}` placeholders. Pluralisation is opt-in: give a key
 * variants suffixed with a CLDR plural category (`.one`, `.other`, `.few`, …)
 * and pass a `count`, and the right variant is chosen through
 * `Intl.PluralRules` for the active locale.
 *
 * A missing key falls back to English, then to the key itself — never to an
 * empty string, because a blank label is a much harder bug to notice than a
 * visibly untranslated one.
 *
 * @param {string} key
 * @param {Record<string, string|number>} [params]
 * @returns {string}
 */
export function t(key, params) {
  const cat = catalogues.get(current) || en;
  let template;

  if (params && typeof params.count === 'number') {
    const category = new Intl.PluralRules(current).select(params.count);
    template = cat[`${key}.${category}`] ?? cat[`${key}.other`] ??
      en[`${key}.${category}`] ?? en[`${key}.other`];
  }
  if (template == null) template = cat[key] ?? en[key];
  if (template == null) return key;

  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name) => {
    const v = params[name];
    if (v == null) return whole;
    return typeof v === 'number' ? formatNumber(v) : String(v);
  });
}

/** @returns {boolean} Whether a key exists in the active catalogue. */
export function has(key) {
  const cat = catalogues.get(current) || en;
  return key in cat || key in en;
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/** @type {Map<string, Intl.NumberFormat>} */
const numberFormats = new Map();

/** @private */
function nf(options) {
  const key = current + JSON.stringify(options);
  let f = numberFormats.get(key);
  if (!f) {
    f = new Intl.NumberFormat(current, options);
    numberFormats.set(key, f);
  }
  return f;
}

/**
 * Locale-aware number formatting.
 * @param {number} value
 * @param {Intl.NumberFormatOptions} [options]
 * @returns {string}
 */
export function formatNumber(value, options) {
  if (!Number.isFinite(value)) return '—';
  return nf(options || { maximumFractionDigits: 2 }).format(value);
}

/**
 * A distance, chosen sensibly for its magnitude.
 *
 * Below a thousand kilometres people think in kilometres; across the solar
 * system they think in astronomical units; between the two, thousands of
 * kilometres. Beyond the heliosphere, light-years.
 * @param {number} km
 * @returns {string}
 */
export function formatDistance(km) {
  if (!Number.isFinite(km)) return '—';
  const abs = Math.abs(km);
  if (abs < 1) return `${formatNumber(km * 1000, { maximumFractionDigits: 0 })} ${t('unit.m')}`;
  if (abs < 1e6) return `${formatNumber(km, { maximumFractionDigits: 0 })} ${t('unit.km')}`;
  if (abs < 1.4e8) return `${formatNumber(km / 1e6, { maximumFractionDigits: 2 })} ${t('unit.millionKm')}`;
  if (abs < 9.46e12) return `${formatNumber(km / 149597870.7, { maximumFractionDigits: 3 })} ${t('unit.au')}`;
  return `${formatNumber(km / 9460730472580.8, { maximumFractionDigits: 2 })} ${t('unit.ly')}`;
}

/**
 * A duration in seconds, as the largest sensible unit.
 * @param {number} seconds
 * @returns {string}
 */
export function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return '—';
  const abs = Math.abs(seconds);
  if (abs < 60) return t('unit.seconds', { count: Math.round(seconds), n: Math.round(seconds) });
  if (abs < 3600) return t('unit.minutes', { count: Math.round(seconds / 60), n: Math.round(seconds / 60) });
  if (abs < 86400) return t('unit.hours', { count: Math.round(seconds / 3600), n: Math.round(seconds / 3600) });
  if (abs < 86400 * 700) return t('unit.days', { count: Math.round(seconds / 86400), n: Math.round(seconds / 86400) });
  return t('unit.years', {
    count: Math.round(seconds / 31557600),
    n: formatNumber(seconds / 31557600, { maximumFractionDigits: 1 }),
  });
}

/**
 * A mass, relative to Earth where that is more meaningful than kilograms.
 * @param {number} kg
 * @returns {string}
 */
export function formatMass(kg) {
  if (!Number.isFinite(kg)) return '—';
  const earths = kg / 5.97217e24;
  if (earths >= 0.001) {
    return `${formatNumber(earths, { maximumFractionDigits: earths < 10 ? 3 : 1 })} ${t('unit.earthMass')}`;
  }
  return `${formatNumber(kg, { notation: 'scientific', maximumFractionDigits: 3 })} ${t('unit.kg')}`;
}

/**
 * A temperature in the reader's expected scale, always with kelvin alongside
 * because that is what the source data is in.
 * @param {number} kelvin
 * @returns {string}
 */
export function formatTemperature(kelvin) {
  if (!Number.isFinite(kelvin)) return '—';
  const c = kelvin - 273.15;
  return `${formatNumber(c, { maximumFractionDigits: 0 })} °C · ${formatNumber(kelvin, { maximumFractionDigits: 0 })} K`;
}

/**
 * A date and time in the reader's locale and their own time zone.
 * @param {Date|number} date
 * @param {Intl.DateTimeFormatOptions} [options]
 * @returns {string}
 */
export function formatDateTime(date, options) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(current, options || {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(d);
}

/**
 * A UTC timestamp, labelled as such. Astronomical times are quoted in UTC and
 * silently converting them to local time would be actively misleading.
 * @param {Date|number} date
 * @returns {string}
 */
export function formatUTC(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '—';
  return `${new Intl.DateTimeFormat(current, {
    dateStyle: 'medium',
    timeStyle: 'medium',
    timeZone: 'UTC',
  }).format(d)} UTC`;
}

/**
 * A relative time such as "3 days ago".
 * @param {number} timestamp
 * @returns {string}
 */
export function formatRelative(timestamp) {
  const diff = timestamp - Date.now();
  const rtf = new Intl.RelativeTimeFormat(current, { numeric: 'auto' });
  const abs = Math.abs(diff);
  if (abs < 60_000) return rtf.format(Math.round(diff / 1000), 'second');
  if (abs < 3600_000) return rtf.format(Math.round(diff / 60_000), 'minute');
  if (abs < 86400_000) return rtf.format(Math.round(diff / 3600_000), 'hour');
  if (abs < 2592000_000) return rtf.format(Math.round(diff / 86400_000), 'day');
  if (abs < 31536000_000) return rtf.format(Math.round(diff / 2592000_000), 'month');
  return rtf.format(Math.round(diff / 31536000_000), 'year');
}

/**
 * Apply translations to a DOM subtree.
 *
 * Elements opt in with `data-i18n` (text content) or `data-i18n-attr` (an
 * `attr:key` list, for `aria-label`, `title`, `placeholder`).
 *
 * There is deliberately no markup-bearing variant. Every translated string is
 * inserted as text, so a catalogue can never introduce an element — which keeps
 * the Content Security Policy honest and means a mistranslation is at worst
 * wrong words, never a broken page.
 *
 * @param {ParentNode} [root=document]
 */
export function applyTranslations(root = document) {
  for (const el of root.querySelectorAll('[data-i18n]')) {
    el.textContent = t(el.dataset.i18n);
  }
  for (const el of root.querySelectorAll('[data-i18n-attr]')) {
    for (const pair of el.dataset.i18nAttr.split(',')) {
      const [attr, key] = pair.split(':').map((s) => s.trim());
      if (attr && key) el.setAttribute(attr, t(key));
    }
  }
}
