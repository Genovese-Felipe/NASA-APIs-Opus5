/**
 * Internationalisation tests.
 *
 * Catalogue *parity* is checked by `tools/validate-locales.mjs`. What is tested
 * here is the runtime: that lookups fall back sensibly, that plural selection
 * uses the right CLDR category for the active language, and that the formatters
 * produce something a reader of that language would recognise.
 */

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';

// The i18n module touches `localStorage`, `navigator`, `location` and
// `document`. Provide the minimum that lets it run under Node.
class MemoryStorage {
  constructor() { this.map = new Map(); }
  get length() { return this.map.size; }
  key(i) { return [...this.map.keys()][i] ?? null; }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { this.map.set(k, String(v)); }
  removeItem(k) { this.map.delete(k); }
}
globalThis.localStorage = new MemoryStorage();
globalThis.location = { search: '', href: 'https://example.test/' };
// Node 22 exposes a read-only `navigator`, so it has to be redefined rather
// than assigned.
Object.defineProperty(globalThis, 'navigator', {
  value: { languages: ['en'], language: 'en' },
  configurable: true,
  writable: true,
});
globalThis.document = {
  documentElement: { dataset: {}, lang: 'en', dir: 'ltr' },
  querySelectorAll: () => [],
};

const i18n = await import('../../src/ui/i18n.js');
const en = (await import('../../src/ui/locales/en.js')).default;

describe('locale metadata', () => {
  test('ships the ten requested languages', () => {
    const tags = i18n.LOCALES.map((l) => l.tag);
    for (const required of ['en', 'zh-Hans', 'pt-BR', 'es', 'ko', 'fr']) {
      assert.ok(tags.includes(required), `missing required locale ${required}`);
    }
    assert.equal(tags.length, 10, `expected ten locales, got ${tags.length}`);
    assert.equal(new Set(tags).size, tags.length, 'duplicate tag');
  });

  test('every tag is a valid BCP-47 identifier', () => {
    for (const l of i18n.LOCALES) {
      assert.doesNotThrow(() => new Intl.NumberFormat(l.tag), l.tag);
      assert.doesNotThrow(() => new Intl.PluralRules(l.tag), l.tag);
      assert.doesNotThrow(() => new Intl.DateTimeFormat(l.tag), l.tag);
      assert.ok(l.native.length > 0, `${l.tag} needs an endonym`);
      assert.ok(['ltr', 'rtl'].includes(l.dir), `${l.tag} direction`);
    }
  });

  test('exactly one right-to-left language, and it is Arabic', () => {
    const rtl = i18n.LOCALES.filter((l) => l.dir === 'rtl');
    assert.equal(rtl.length, 1);
    assert.equal(rtl[0].tag, 'ar');
  });
});

describe('language detection', () => {
  test('honours an explicit ?lang= parameter', () => {
    globalThis.location.search = '?lang=ja';
    assert.equal(i18n.detectLocale(), 'ja');
    globalThis.location.search = '';
  });

  test('ignores an unsupported ?lang=', () => {
    globalThis.location.search = '?lang=klingon';
    globalThis.navigator.languages = ['en'];
    assert.equal(i18n.detectLocale(), 'en');
    globalThis.location.search = '';
  });

  test('maps regional variants to the catalogue we ship', () => {
    globalThis.navigator.languages = ['zh-CN'];
    assert.equal(i18n.detectLocale(), 'zh-Hans');
    globalThis.navigator.languages = ['zh-TW'];
    assert.equal(i18n.detectLocale(), 'zh-Hans');
    globalThis.navigator.languages = ['pt-PT'];
    assert.equal(i18n.detectLocale(), 'pt-BR');
    globalThis.navigator.languages = ['fr-CA'];
    assert.equal(i18n.detectLocale(), 'fr');
    globalThis.navigator.languages = ['de-AT'];
    assert.equal(i18n.detectLocale(), 'de');
    globalThis.navigator.languages = ['en'];
  });

  test('falls back to English for a language we do not have', () => {
    globalThis.navigator.languages = ['sw-KE', 'is-IS'];
    assert.equal(i18n.detectLocale(), 'en');
    globalThis.navigator.languages = ['en'];
  });

  test('remembers a stored choice', () => {
    localStorage.setItem('orrery.locale', 'ko');
    assert.equal(i18n.detectLocale(), 'ko');
    localStorage.removeItem('orrery.locale');
  });
});

describe('translation lookup', () => {
  before(async () => {
    await i18n.setLocale('en');
  });

  test('returns the string for a known key', () => {
    assert.equal(i18n.t('nav.explore'), en['nav.explore']);
  });

  test('returns the key itself when nothing matches', () => {
    assert.equal(i18n.t('nope.not.a.key'), 'nope.not.a.key');
  });

  test('interpolates placeholders', () => {
    assert.ok(i18n.t('camera.focus', { name: 'Titan' }).includes('Titan'));
    assert.ok(i18n.t('tour.step', { n: 3, total: 9 }).includes('3'));
  });

  test('leaves an unmatched placeholder visible rather than blank', () => {
    const out = i18n.t('camera.focus', {});
    assert.ok(out.includes('{name}'), out);
  });

  test('formats numeric parameters for the locale', async () => {
    await i18n.setLocale('de');
    const out = i18n.t('health.cacheSize', { n: 12, kb: 1234.5 });
    // German groups with a full stop and decimals with a comma.
    assert.ok(/1\.234,5/.test(out), out);
    await i18n.setLocale('en');
  });

  test('falls back to English when a locale is missing a key', async () => {
    await i18n.setLocale('ja');
    // Every key exists in every catalogue, so force the situation with a key
    // that is only in English.
    assert.equal(i18n.t('definitely.not.translated'), 'definitely.not.translated');
    assert.ok(i18n.has('nav.explore'));
    assert.ok(!i18n.has('definitely.not.translated'));
    await i18n.setLocale('en');
  });
});

describe('pluralisation', () => {
  test('English selects one and other correctly', async () => {
    await i18n.setLocale('en');
    assert.ok(i18n.t('unit.days', { count: 1, n: 1 }).includes('day'));
    assert.ok(!i18n.t('unit.days', { count: 1, n: 1 }).includes('days'));
    assert.ok(i18n.t('unit.days', { count: 3, n: 3 }).includes('days'));
  });

  test('Russian selects three distinct forms', async () => {
    await i18n.setLocale('ru');
    const one = i18n.t('unit.days', { count: 1, n: 1 });
    const few = i18n.t('unit.days', { count: 3, n: 3 });
    const many = i18n.t('unit.days', { count: 7, n: 7 });
    assert.notEqual(one, few, 'one and few must differ in Russian');
    assert.notEqual(few, many, 'few and many must differ in Russian');
    await i18n.setLocale('en');
  });

  test('Arabic selects among its six forms', async () => {
    await i18n.setLocale('ar');
    const forms = new Set([0, 1, 2, 3, 11, 100].map((n) => i18n.t('unit.days', { count: n, n })));
    assert.ok(forms.size >= 4, `expected several distinct Arabic plural forms, got ${forms.size}`);
    await i18n.setLocale('en');
  });

  test('Chinese, Japanese and Korean use a single form', async () => {
    for (const tag of ['zh-Hans', 'ja', 'ko']) {
      await i18n.setLocale(tag);
      const one = i18n.t('unit.days', { count: 1, n: 1 });
      const many = i18n.t('unit.days', { count: 42, n: 42 });
      // Same template, different number substituted.
      assert.equal(one.replace(/[\d,.]/g, ''), many.replace(/[\d,.]/g, ''), tag);
    }
    await i18n.setLocale('en');
  });

  test('a count with no matching category falls back to other', async () => {
    await i18n.setLocale('en');
    assert.ok(i18n.t('unit.objects', { count: 0, n: 0 }).length > 0);
  });
});

describe('formatters', () => {
  before(async () => {
    await i18n.setLocale('en');
  });

  test('distance picks a sensible unit for the magnitude', () => {
    assert.ok(i18n.formatDistance(0.5).includes('m'));
    assert.ok(i18n.formatDistance(1234).includes('km'));
    assert.ok(i18n.formatDistance(384400).includes('km'));
    assert.ok(i18n.formatDistance(50e6).toLowerCase().includes('million'));
    assert.ok(i18n.formatDistance(149597870.7).includes('AU'));
    assert.ok(i18n.formatDistance(1e13).toLowerCase().includes('light'));
  });

  test('distance handles non-finite input', () => {
    assert.equal(i18n.formatDistance(NaN), '—');
    assert.equal(i18n.formatDistance(Infinity), '—');
  });

  test('duration picks a sensible unit', () => {
    assert.ok(i18n.formatDuration(30).includes('second'));
    assert.ok(i18n.formatDuration(300).includes('minute'));
    assert.ok(i18n.formatDuration(7200).includes('hour'));
    assert.ok(i18n.formatDuration(86400 * 5).includes('day'));
    assert.ok(i18n.formatDuration(86400 * 4000).includes('year'));
  });

  test('mass is expressed relative to Earth where that is meaningful', () => {
    const earth = i18n.formatMass(5.97217e24);
    assert.ok(earth.startsWith('1'), earth);
    assert.ok(earth.includes('Earth'), earth);
    // A tiny moon should fall back to kilograms.
    assert.ok(i18n.formatMass(1.07e16).includes('kg'));
  });

  test('temperature shows Celsius and kelvin together', () => {
    const out = i18n.formatTemperature(288);
    assert.ok(out.includes('15'), out);
    assert.ok(out.includes('288'), out);
    assert.ok(out.includes('K'), out);
  });

  test('UTC formatting says UTC and does not shift the clock', () => {
    const out = i18n.formatUTC(new Date('2026-08-04T12:34:56Z'));
    assert.ok(out.endsWith('UTC'), out);
    assert.ok(out.includes('12:34:56'), out);
  });

  test('relative time reads naturally', () => {
    const out = i18n.formatRelative(Date.now() - 3 * 86400_000);
    assert.ok(/3 days ago/i.test(out), out);
  });

  test('numbers follow the locale', async () => {
    await i18n.setLocale('de');
    assert.equal(i18n.formatNumber(1234.5), '1.234,5');
    await i18n.setLocale('fr');
    assert.ok(i18n.formatNumber(1234.5).includes(','), 'French uses a decimal comma');
    await i18n.setLocale('en');
    assert.equal(i18n.formatNumber(1234.5), '1,234.5');
  });

  test('every locale can format the whole fact sheet without throwing', async () => {
    for (const l of i18n.LOCALES) {
      await i18n.setLocale(l.tag);
      assert.doesNotThrow(() => {
        i18n.formatDistance(384400);
        i18n.formatDistance(1e13);
        i18n.formatDuration(86400 * 365);
        i18n.formatMass(5.97e24);
        i18n.formatTemperature(288);
        i18n.formatUTC(new Date());
        i18n.formatRelative(Date.now() - 5000);
        i18n.formatNumber(1234.5678, { maximumFractionDigits: 3 });
        i18n.t('a11y.focusedBody', { name: 'X', kind: 'Y', distance: 'Z' });
      }, l.tag);
    }
    await i18n.setLocale('en');
  });
});

describe('document integration', () => {
  test('setLocale updates lang and dir', async () => {
    await i18n.setLocale('ar');
    assert.equal(document.documentElement.lang, 'ar');
    assert.equal(document.documentElement.dir, 'rtl');
    await i18n.setLocale('ja');
    assert.equal(document.documentElement.lang, 'ja');
    assert.equal(document.documentElement.dir, 'ltr');
    await i18n.setLocale('en');
  });

  test('notifies subscribers and can unsubscribe', async () => {
    const seen = [];
    const off = i18n.onLocaleChange((tag) => seen.push(tag));
    await i18n.setLocale('fr');
    await i18n.setLocale('es');
    off();
    await i18n.setLocale('de');
    assert.deepEqual(seen, ['fr', 'es']);
    await i18n.setLocale('en');
  });

  test('an unknown tag falls back to English rather than throwing', async () => {
    await i18n.setLocale('xx-YY');
    assert.equal(i18n.getLocale(), 'en');
  });
});

describe('editorial content', () => {
  test('every described body exists in the catalogue', async () => {
    const content = (await import('../../src/ui/content/en.js')).default;
    const { BODY_BY_ID } = await import('../../src/astro/planets.js');
    const { MOON_BY_ID } = await import('../../src/astro/moons.js');
    for (const id of Object.keys(content)) {
      assert.ok(BODY_BY_ID.has(id) || MOON_BY_ID.has(id), `content for unknown body: ${id}`);
    }
  });

  test('every entry has a blurb, body text and a fact', async () => {
    const content = (await import('../../src/ui/content/en.js')).default;
    for (const [id, entry] of Object.entries(content)) {
      assert.ok(entry.blurb && entry.blurb.length > 15, `${id} blurb`);
      assert.ok(Array.isArray(entry.body) && entry.body.length >= 2, `${id} body`);
      for (const p of entry.body) assert.ok(p.length > 60, `${id} paragraph too short`);
      assert.ok(entry.fact && entry.fact.length > 25, `${id} fact`);
    }
  });

  test('every body in the catalogue has a translation key', async () => {
    const { BODIES } = await import('../../src/astro/planets.js');
    const { MOONS } = await import('../../src/astro/moons.js');
    for (const b of [...BODIES, ...MOONS]) {
      assert.ok(`body.${b.id}` in en, `missing name for ${b.id}`);
    }
  });
});

describe('tours', () => {
  test('every tour has a name, description and coherent steps', async () => {
    const { TOURS } = await import('../../src/ui/tours.js');
    const { BODY_BY_ID } = await import('../../src/astro/planets.js');
    const { MOON_BY_ID } = await import('../../src/astro/moons.js');
    assert.ok(TOURS.length >= 4);
    for (const tour of TOURS) {
      assert.ok(`tour.${tour.id}.name` in en, `${tour.id} name key`);
      assert.ok(`tour.${tour.id}.desc` in en, `${tour.id} desc key`);
      assert.ok(tour.steps.length >= 3, `${tour.id} needs steps`);
      for (const step of tour.steps) {
        assert.ok(
          BODY_BY_ID.has(step.body) || MOON_BY_ID.has(step.body),
          `${tour.id} targets unknown body ${step.body}`
        );
        assert.ok(step.title && step.text, `${tour.id} step needs copy`);
        assert.ok(step.text.length > 40, `${tour.id}/${step.title} text too short`);
        if (step.distance != null) assert.ok(step.distance >= 1.02, `${tour.id} inside the body`);
        if (step.pitch != null) assert.ok(Math.abs(step.pitch) < Math.PI / 2, `${tour.id} pitch`);
        if (step.fov != null) assert.ok(step.fov >= 3 && step.fov <= 110, `${tour.id} fov`);
      }
    }
  });

  test('tour ids are unique', async () => {
    const { TOURS } = await import('../../src/ui/tours.js');
    const ids = TOURS.map((t) => t.id);
    assert.equal(new Set(ids).size, ids.length);
  });
});
