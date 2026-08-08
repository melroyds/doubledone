import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  aiLanguageFor,
  formatMonthDay,
  formatNumber,
  formatRelativeDay,
  formatTime,
  formatWeekday,
  languageName,
  pluralize,
  resolveLocale,
  translate,
} from './i18n';

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

  it('resolves German (the fifth locale, 2026-08-08)', () => {
    expect(resolveLocale('de')).toBe('de');
    expect(resolveLocale('de-AT')).toBe('de');
  });

  it('falls back to English for anything unsupported or missing', () => {
    expect(resolveLocale('zh-Hans')).toBe('en');
    expect(resolveLocale('pt-BR')).toBe('en');
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

describe('translate', () => {
  it('resolves a dotted key from the catalog', () => {
    expect(translate('en', 'common.close')).toBe('Close');
    expect(translate('en', 'capture.placeholder')).toBe('Empty your head. One line per thing.');
  });
  it('returns the locale translation, and an unknown key falls through to itself', () => {
    expect(translate('it', 'common.close')).toBe('Chiudi');
    expect(translate('fr', 'today.subtitle')).toBe("Juste aujourd'hui. Le reste peut attendre.");
    expect(translate('es', 'actions.lightenToday')).toBe('Aligera el día');
    expect(translate('en', 'nope.notakey')).toBe('nope.notakey'); // absent everywhere -> the key itself
  });
});

describe('pluralize (Intl.PluralRules)', () => {
  it('picks one vs other in English and interpolates the count', () => {
    const forms = { one: '{count} day', other: '{count} days' };
    expect(pluralize('en', 1, forms)).toBe('1 day');
    expect(pluralize('en', 0, forms)).toBe('0 days');
    expect(pluralize('en', 5, forms)).toBe('5 days');
  });
  it('uses the locale CLDR categories, not English ones', () => {
    const forms = { one: '{count} jour', other: '{count} jours' };
    expect(pluralize('fr', 1, forms)).toBe('1 jour'); // fr: 1 is 'one'
    expect(pluralize('fr', 2, forms)).toBe('2 jours'); // fr: 2 is 'other'
  });
});

describe('Intl date / number helpers', () => {
  const today = new Date(2026, 5, 27); // 27 June 2026, local
  it('formatRelativeDay gives today / tomorrow / yesterday, else a date', () => {
    expect(formatRelativeDay('en', new Date(2026, 5, 27), today)).toBe('today');
    expect(formatRelativeDay('en', new Date(2026, 5, 28), today)).toBe('tomorrow');
    expect(formatRelativeDay('en', new Date(2026, 5, 26), today)).toBe('yesterday');
    expect(formatRelativeDay('en', new Date(2026, 5, 30), today)).toMatch(/30/);
  });
  it('formats month-day, weekday, time and number per locale', () => {
    expect(formatMonthDay('en', new Date(2026, 5, 27))).toMatch(/27/);
    expect(formatMonthDay('en', new Date(2026, 5, 27))).toMatch(/June/);
    expect(formatWeekday('en', new Date(2026, 5, 27))).toMatch(/[A-Za-z]/);
    expect(formatTime('en', new Date(2026, 5, 27, 18, 0))).toMatch(/6/);
    expect(formatNumber('en', 1234)).toBe('1,234');
  });
});

// The Hermes guard: Android's Hermes engine lacks Intl.PluralRules (and, per version,
// Intl.RelativeTimeFormat). Browsers have both, so the ONLY way to exercise the fallback
// paths that crashed v6/v7 at launch on real devices is to delete the constructors here.
describe('Hermes fallbacks (Intl.PluralRules / Intl.RelativeTimeFormat missing)', () => {
  const forms = { one: '{count} day', other: '{count} days' };
  const today = new Date(2026, 5, 27);
  let savedPlural: typeof Intl.PluralRules;
  let savedRel: typeof Intl.RelativeTimeFormat;

  beforeEach(() => {
    savedPlural = Intl.PluralRules;
    savedRel = Intl.RelativeTimeFormat;
    // simulate Hermes: the constructors do not exist
    delete (Intl as Record<string, unknown>).PluralRules;
    delete (Intl as Record<string, unknown>).RelativeTimeFormat;
  });
  afterEach(() => {
    (Intl as Record<string, unknown>).PluralRules = savedPlural;
    (Intl as Record<string, unknown>).RelativeTimeFormat = savedRel;
  });

  it('pluralize falls back correctly for the four shipped locales', () => {
    expect(pluralize('en', 1, forms)).toBe('1 day');
    expect(pluralize('en', 0, forms)).toBe('0 days');
    expect(pluralize('en', 5, forms)).toBe('5 days');
    expect(pluralize('it', 1, forms)).toBe('1 day');
    expect(pluralize('es', 2, forms)).toBe('2 days');
    expect(pluralize('fr', 0, forms)).toBe('0 day'); // fr: 0 is 'one'
    expect(pluralize('fr', 1, forms)).toBe('1 day');
    expect(pluralize('fr', 2, forms)).toBe('2 days');
  });

  it('formatRelativeDay falls back to the catalog relative words, per locale', () => {
    expect(formatRelativeDay('en-AU', new Date(2026, 5, 27), today)).toBe('today');
    expect(formatRelativeDay('en-AU', new Date(2026, 5, 28), today)).toBe('tomorrow');
    expect(formatRelativeDay('en-AU', new Date(2026, 5, 26), today)).toBe('yesterday');
    expect(formatRelativeDay('it-IT', new Date(2026, 5, 28), today)).toBe('domani');
    expect(formatRelativeDay('es-ES', new Date(2026, 5, 28), today)).toBe('mañana');
    expect(formatRelativeDay('fr-FR', new Date(2026, 5, 26), today)).toBe('hier');
    // beyond the relative window still uses DateTimeFormat (supported on Hermes)
    expect(formatRelativeDay('en-AU', new Date(2026, 5, 30), today)).toMatch(/30/);
  });
});
