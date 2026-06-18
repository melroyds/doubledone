import { describe, expect, it } from 'vitest';

import { aiLanguageFor, languageName, resolveLocale } from './i18n';

describe('resolveLocale', () => {
  it('keeps a supported base language', () => {
    expect(resolveLocale('it')).toBe('it');
    expect(resolveLocale('es')).toBe('es');
    expect(resolveLocale('fr')).toBe('fr');
    expect(resolveLocale('en')).toBe('en');
  });

  it('strips region and case', () => {
    expect(resolveLocale('it-IT')).toBe('it');
    expect(resolveLocale('FR-ca')).toBe('fr');
  });

  it('falls back to English for anything unsupported or missing', () => {
    expect(resolveLocale('de')).toBe('en');
    expect(resolveLocale('zh-Hans')).toBe('en');
    expect(resolveLocale('')).toBe('en');
    expect(resolveLocale(null)).toBe('en');
    expect(resolveLocale(undefined)).toBe('en');
  });
});

describe('languageName', () => {
  it('gives the English name of each locale', () => {
    expect(languageName('it')).toBe('Italian');
    expect(languageName('es')).toBe('Spanish');
    expect(languageName('fr')).toBe('French');
    expect(languageName('en')).toBe('English');
  });
});

describe('aiLanguageFor', () => {
  it('returns the language name for non-English, undefined for English', () => {
    expect(aiLanguageFor('it')).toBe('Italian');
    expect(aiLanguageFor('fr')).toBe('French');
    expect(aiLanguageFor('en')).toBeUndefined();
  });
});
