import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  aiLanguageFor,
  formatMonth,
  formatMonthDay,
  formatNumber,
  formatRelativeDay,
  formatTime,
  formatWeekday,
  languageName,
  ordinalDay,
  pluralize,
  resolveLocale,
  translate,
} from './i18n';
import { setActiveLocale } from './i18n-active';
import { describeRecurrence } from './recurrence';

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
    expect(translate('fr', 'today.subtitle')).toBe('Juste aujourd’hui. Le reste peut attendre.');
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

// The day of the month as said after "on" (bug sweep #39). Italian carries its article, and elides it before a vowel
// sound (otto, undici), so its templates never write "il" or "l'" themselves: "Ripeti ogni 15" and "il l'8" were the
// two ways it read wrong. French writes the first as "1er".
describe('ordinalDay', () => {
  it('leaves English, German and Spanish as they were', () => {
    expect(ordinalDay('en', 1)).toBe('1st');
    expect(ordinalDay('en', 11)).toBe('11th');
    expect(ordinalDay('en', 22)).toBe('22nd');
    expect(ordinalDay('de', 1)).toBe('1.');
    expect(ordinalDay('de', 15)).toBe('15.');
    expect(ordinalDay('es', 1)).toBe('1');
    expect(ordinalDay('es', 15)).toBe('15');
  });

  it('writes the French first as "1er", and every other day bare', () => {
    expect(ordinalDay('fr', 1)).toBe('1er');
    expect(ordinalDay('fr', 8)).toBe('8');
    expect(ordinalDay('fr', 31)).toBe('31');
  });

  it('gives the Italian day its article, eliding it before 8 and 11', () => {
    expect(ordinalDay('it', 1)).toBe('il 1º');
    expect(ordinalDay('it', 8)).toBe("l'8");
    expect(ordinalDay('it', 11)).toBe("l'11");
    expect(ordinalDay('it', 15)).toBe('il 15');
    expect(ordinalDay('it', 18)).toBe('il 18');
    expect(ordinalDay('it', 28)).toBe('il 28');
  });

  it('elides the Italian article for exactly the days said with a vowel (otto, undici), across the month', () => {
    for (let d = 1; d <= 31; d++) {
      expect(ordinalDay('it', d).startsWith("l'"), `day ${d}`).toBe(d === 8 || d === 11);
    }
  });

  it('marks the Italian first with the ordinal indicator, never the degree sign', () => {
    expect(ordinalDay('it', 1)).toContain('º');
    expect(ordinalDay('it', 1)).not.toContain('°');
  });
});

describe('the monthly lines, as they render', () => {
  afterEach(() => setActiveLocale('en', 'en-AU'));
  const monthly = (day: number) => describeRecurrence({ kind: 'monthly', day });

  it('Italian never doubles or drops the article, and starts each line with a capital', () => {
    setActiveLocale('it', 'it-IT');
    for (let d = 1; d <= 31; d++) {
      const lines = [
        translate('it', 'capture.monthlyOn', { day: ordinalDay('it', d) }),
        monthly(d),
        translate('it', 'capture.repeatOnMonthDayA11y', { n: d, day: ordinalDay('it', d) }),
      ];
      for (const line of lines) {
        expect(line, `day ${d}: ${line}`).not.toMatch(/il l'|il il|l'il/i);
        expect(line, `day ${d}: ${line}`).not.toMatch(/Ripeti ogni/);
        expect(line.charAt(0), `day ${d}: ${line}`).toBe(line.charAt(0).toUpperCase());
      }
    }
    expect(translate('it', 'capture.monthlyOn', { day: ordinalDay('it', 8) })).toBe("Ogni mese: l'8");
    expect(translate('it', 'capture.monthlyOn', { day: ordinalDay('it', 1) })).toBe('Ogni mese: il 1º');
    expect(monthly(8)).toBe("L'8 di ogni mese");
    expect(monthly(11)).toBe("L'11 di ogni mese");
    expect(monthly(1)).toBe('Il 1º di ogni mese');
    expect(monthly(15)).toBe('Il 15 di ogni mese');
    expect(translate('it', 'capture.repeatOnMonthDayA11y', { n: 15, day: ordinalDay('it', 15) })).toBe('15, ripeti il 15 di ogni mese');
    expect(translate('it', 'capture.repeatOnMonthDayA11y', { n: 8, day: ordinalDay('it', 8) })).toBe("8, ripeti l'8 di ogni mese");
  });

  it('French says the first as "1er"', () => {
    setActiveLocale('fr', 'fr-FR');
    expect(monthly(1)).toBe('Le 1er de chaque mois');
    expect(monthly(15)).toBe('Le 15 de chaque mois');
    expect(translate('fr', 'capture.monthlyOn', { day: ordinalDay('fr', 1) })).toBe('Mensuel : le 1er');
    expect(translate('fr', 'capture.repeatOnMonthDayA11y', { n: 1, day: ordinalDay('fr', 1) })).toBe('1, répéter le 1er de chaque mois');
  });

  it('the month-day chips say their own number, then a whole sentence, in every language, not "Repeat on 15th"', () => {
    expect(translate('en', 'capture.repeatOnMonthDayA11y', { n: 15, day: ordinalDay('en', 15) })).toBe('15, repeat on the 15th of each month');
    expect(translate('de', 'capture.repeatOnMonthDayA11y', { n: 15, day: ordinalDay('de', 15) })).toBe('15, am 15. jedes Monats wiederholen');
    expect(translate('es', 'capture.repeatOnMonthDayA11y', { n: 15, day: ordinalDay('es', 15) })).toBe('15, repetir el día 15 de cada mes');
  });

  it('English keeps its lines, capital and all', () => {
    expect(monthly(1)).toBe('Every month on the 1st');
    expect(monthly(21)).toBe('Every month on the 21st');
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
  it('names a month per locale, in that locale case (the Later folds capitalise it themselves)', () => {
    expect(formatMonth('en', new Date(2026, 10, 1))).toBe('November');
    expect(formatMonth('de', new Date(2026, 10, 1))).toBe('November');
    expect(formatMonth('fr', new Date(2026, 10, 1))).toBe('novembre');
    expect(formatMonth('es', new Date(2026, 10, 1))).toBe('noviembre');
    expect(formatMonth('it', new Date(2026, 10, 1))).toBe('novembre');
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

describe('French typography', () => {
  it('puts a no-break space, never a plain one, before : ? ! ; in every French string', async () => {
    const { fr } = await import('./catalogs/fr');
    const bad: string[] = [];
    const walk = (node: unknown, path: string) => {
      if (typeof node === 'string') {
        if (/ [:?!;]/.test(node)) bad.push(path);
      } else if (node && typeof node === 'object') {
        for (const [k, v] of Object.entries(node as Record<string, unknown>)) walk(v, path ? `${path}.${k}` : k);
      }
    };
    walk(fr, '');
    expect(bad).toEqual([]);
  });

  // The typographic apostrophe (2026-11-01), the mark the French store captions use: Newsreader, the heading
  // face, draws the straight one as a tick, and the catalogue held only straight ones.
  it('uses the typographic apostrophe, never the straight one, in every French string', async () => {
    const { fr } = await import('./catalogs/fr');
    const bad: string[] = [];
    const walk = (node: unknown, path: string) => {
      if (typeof node === 'string') {
        if (node.includes("'")) bad.push(path);
      } else if (node && typeof node === 'object') {
        for (const [k, v] of Object.entries(node as Record<string, unknown>)) walk(v, path ? `${path}.${k}` : k);
      }
    };
    walk(fr, '');
    expect(bad).toEqual([]);
  });
});
