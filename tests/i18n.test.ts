import { describe, expect, it } from 'vitest';
import { languageNames, translations } from '../src/i18n';

describe('localization governance', () => {
  it('ships all nine requested languages', () => expect(Object.keys(languageNames)).toHaveLength(9));

  it('keeps every locale structurally complete', () => {
    const canonical = Object.keys(translations.en).sort();
    for (const [language, dictionary] of Object.entries(translations)) {
      expect(Object.keys(dictionary).sort(), language).toEqual(canonical);
      expect(Object.values(dictionary).every((value) => value.trim().length > 0), language).toBe(true);
    }
  });
});
