#!/usr/bin/env node
/**
 * Locale validation.
 *
 * Ten languages drift. Someone adds a string in English, ships it, and nine
 * catalogues silently fall back — which is not a crash, so nothing catches it.
 * This does, in CI, on every push.
 *
 * Checks, in order of how much damage they prevent:
 *  1. Every English key exists in every locale. A missing key means a visible
 *     English string in a Japanese interface.
 *  2. No stray keys. Usually a typo that will never be read.
 *  3. Placeholders match exactly. `{n}` becoming `{N}` renders the literal text
 *     `{N}` to a user.
 *  4. Extra keys are only legitimate CLDR plural categories. Russian and Arabic
 *     genuinely need more forms than English; anything else is a mistake.
 *  5. Plural completeness: if English has `.one`/`.other`, the locale must
 *     supply every category `Intl.PluralRules` reports for its language.
 *  6. No value is empty, and none is byte-identical to English for a
 *     non-Latin-script locale (a sign of a copy-paste that never got done).
 *
 * Usage:  node tools/validate-locales.mjs [--verbose]
 * Exit code 1 on any error.
 */

import { readdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LOCALE_DIR = resolve(ROOT, 'src/ui/locales');
const VERBOSE = process.argv.includes('--verbose');

/** Strings that legitimately stay identical across every language. */
const SHARED_LITERALS = new Set([
  'unit.km', 'unit.kg', 'unit.m', 'unit.au', 'unit.kms', 'unit.degrees', 'unit.kelvin',
  'app.title',
  // "fps" is the same three letters in every language we ship.
  'settings.fps',
]);

/** Locales whose script differs from English, where an identical value is suspicious. */
const NON_LATIN = new Set(['zh-Hans', 'ja', 'ko', 'ru', 'ar']);

const PLURAL_SUFFIX = /\.(zero|one|two|few|many|other)$/;

/** @param {string} s @returns {string[]} */
function placeholders(s) {
  return [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
}

async function main() {
  const files = (await readdir(LOCALE_DIR)).filter((f) => f.endsWith('.js')).sort();
  const enUrl = pathToFileURL(resolve(LOCALE_DIR, 'en.js')).href;
  const en = (await import(enUrl)).default;
  const enKeys = Object.keys(en);
  const enSet = new Set(enKeys);

  // Base keys that carry plural variants in English.
  const pluralBases = new Set(
    enKeys.filter((k) => PLURAL_SUFFIX.test(k)).map((k) => k.replace(PLURAL_SUFFIX, ''))
  );

  const errors = [];
  const warnings = [];
  let checked = 0;

  for (const file of files) {
    if (file === 'en.js') continue;
    const tag = file.replace(/\.js$/, '');
    checked++;

    let cat;
    try {
      cat = (await import(pathToFileURL(resolve(LOCALE_DIR, file)).href)).default;
    } catch (err) {
      errors.push(`${tag}: failed to load — ${err.message}`);
      continue;
    }
    if (!cat || typeof cat !== 'object') {
      errors.push(`${tag}: default export is not an object`);
      continue;
    }
    const keys = Object.keys(cat);
    const keySet = new Set(keys);

    // 1. completeness
    const missing = enKeys.filter((k) => !keySet.has(k));
    if (missing.length) {
      errors.push(`${tag}: ${missing.length} missing key(s): ${missing.slice(0, 8).join(', ')}${missing.length > 8 ? ' …' : ''}`);
    }

    // 2 + 4. stray keys, allowing extra plural categories of a known base
    const stray = keys.filter((k) => {
      if (enSet.has(k)) return false;
      const base = k.replace(PLURAL_SUFFIX, '');
      return !(PLURAL_SUFFIX.test(k) && pluralBases.has(base));
    });
    if (stray.length) {
      errors.push(`${tag}: ${stray.length} unexpected key(s): ${stray.slice(0, 8).join(', ')}`);
    }

    // 3. placeholders
    for (const key of enKeys) {
      if (!keySet.has(key)) continue;
      const a = placeholders(en[key]).join(',');
      const b = placeholders(cat[key]).join(',');
      if (a !== b) {
        errors.push(`${tag}: placeholder mismatch in "${key}" — expected {${a}} got {${b}}`);
      }
    }

    // 5. plural completeness
    let rules;
    try {
      rules = new Intl.PluralRules(tag);
    } catch {
      errors.push(`${tag}: not a valid BCP-47 tag for Intl.PluralRules`);
      rules = null;
    }
    if (rules) {
      const categories = rules.resolvedOptions().pluralCategories;
      for (const base of pluralBases) {
        const missingCats = categories.filter((c) => !keySet.has(`${base}.${c}`));
        if (missingCats.length) {
          errors.push(`${tag}: "${base}" is missing plural form(s): ${missingCats.join(', ')}`);
        }
      }
    }

    // 6. empties and untranslated copies
    for (const key of keys) {
      const value = cat[key];
      if (typeof value !== 'string') {
        errors.push(`${tag}: "${key}" is not a string`);
        continue;
      }
      if (!value.trim()) errors.push(`${tag}: "${key}" is empty`);
    }
    if (NON_LATIN.has(tag)) {
      const identical = enKeys.filter(
        (k) => keySet.has(k) && cat[k] === en[k] && !SHARED_LITERALS.has(k) && en[k].length > 3
      );
      if (identical.length) {
        warnings.push(
          `${tag}: ${identical.length} value(s) identical to English — likely untranslated: ` +
            identical.slice(0, 6).join(', ')
        );
      }
    }

    if (VERBOSE) {
      process.stdout.write(`  ${tag.padEnd(9)} ${String(keys.length).padStart(4)} keys\n`);
    }
  }

  for (const w of warnings) process.stdout.write(`warning: ${w}\n`);
  for (const e of errors) process.stderr.write(`error: ${e}\n`);

  if (errors.length) {
    process.stderr.write(`\n${errors.length} error(s) across ${checked} locales.\n`);
    process.exit(1);
  }
  process.stdout.write(
    `Locales OK: ${checked} translations against ${enKeys.length} English keys` +
      (warnings.length ? ` (${warnings.length} warning(s))` : '') + '\n'
  );
}

main().catch((err) => {
  process.stderr.write(`validate-locales failed: ${err.stack || err.message}\n`);
  process.exit(1);
});
