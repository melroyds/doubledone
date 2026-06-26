// Pure i18n logic: which locales we support and how to resolve a device code to
// one. No React Native or expo import here, so it stays unit-testable (the device
// detection lives in the lib/locale seam). Pass 1 of internationalisation:
// English plus Italian, Spanish, French, starting with the AI answering in the
// user's language; the UI-string sweep follows.

import { type Catalog, en } from './catalogs/en';

export const SUPPORTED = ['en', 'it', 'es', 'fr'] as const;
export type Locale = (typeof SUPPORTED)[number];

const LANGUAGE_NAME: Record<Locale, string> = {
  en: 'English',
  it: 'Italian',
  es: 'Spanish',
  fr: 'French',
};

/** Map any BCP-47 code (e.g. "it", "it-IT", "fr-CA") to a supported locale,
 *  falling back to English for anything we do not handle. */
export function resolveLocale(code: string | null | undefined): Locale {
  const base = (code ?? '').slice(0, 2).toLowerCase();
  return (SUPPORTED as readonly string[]).includes(base) ? (base as Locale) : 'en';
}

/** The English name of a locale's language, used to instruct the AI. */
export function languageName(loc: Locale): string {
  return LANGUAGE_NAME[loc];
}

/** The language to ask the AI to answer in, or undefined for English (the default). */
export function aiLanguageFor(loc: Locale): string | undefined {
  return loc === 'en' ? undefined : LANGUAGE_NAME[loc];
}

// --- Pass 2: the typed t() resolver + Intl formatting (still pure; lib/locale binds these to the active
// locale). Additive: nothing here is wired into a screen yet, so existing rendering is unchanged. ---

// Per-locale catalogs. Only `en` is populated (the source); it/es/fr alias it until native-reviewed
// translations land. translate() falls back to en per key regardless, so a partial catalog never blanks.
const CATALOGS: Record<Locale, Catalog> = { en, it: en, es: en, fr: en };

/** Resolve a dotted key ('today.subtitle') to a leaf string, or undefined if absent / not a string. */
function lookup(cat: Catalog, key: string): string | undefined {
  let node: unknown = cat;
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === 'string' ? node : undefined;
}

/** Replace `{name}` placeholders from params; an absent key is left as the literal `{name}`. */
function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m));
}

/** Translate a dotted key for a locale: the locale's catalog, else en, else the key itself. `{name}`
 *  placeholders interpolate from params (named, never positional, so word order is the translator's). */
export function translate(loc: Locale, key: string, params?: Record<string, string | number>): string {
  const str = lookup(CATALOGS[loc], key) ?? lookup(CATALOGS.en, key) ?? key;
  return interpolate(str, params);
}

export type PluralForms = { zero?: string; one?: string; two?: string; few?: string; many?: string; other: string };

/** Pick the plural form for `count` in `loc` (Intl.PluralRules CLDR categories) and interpolate `{count}`.
 *  Replaces the hand-built two-form English "1 task" / "N tasks" the copy review flagged. */
export function pluralize(loc: Locale, count: number, forms: PluralForms, params?: Record<string, string | number>): string {
  const category = new Intl.PluralRules(loc).select(count) as keyof PluralForms;
  const template = forms[category] ?? forms.other;
  return interpolate(template, { count, ...params });
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** "today" / "tomorrow" / "yesterday" (per locale, via Intl.RelativeTimeFormat) for a date within a day of
 *  `today`, otherwise a short formatted date. Replaces the hardcoded en-AU 'Tomorrow' literal in lib/day.
 *  Casing is the relative-time formatter's (lowercase in English); a call site that needs a capital applies it. */
export function formatRelativeDay(loc: Locale, date: Date, today: Date): string {
  const days = Math.round((startOfDay(date).getTime() - startOfDay(today).getTime()) / 86_400_000);
  if (days >= -1 && days <= 1) return new Intl.RelativeTimeFormat(loc, { numeric: 'auto' }).format(days, 'day');
  return new Intl.DateTimeFormat(loc, { weekday: 'short', month: 'short', day: 'numeric' }).format(date);
}

/** "27 June" style, per locale. Replaces the hardcoded MONTH_NAMES table. */
export function formatMonthDay(loc: Locale, date: Date): string {
  return new Intl.DateTimeFormat(loc, { day: 'numeric', month: 'long' }).format(date);
}

/** A short ("Mon") or narrow ("M") weekday, per locale. Replaces the two-letter WEEKDAY_LABELS arrays. */
export function formatWeekday(loc: Locale, date: Date, width: 'short' | 'narrow' = 'short'): string {
  return new Intl.DateTimeFormat(loc, { weekday: width }).format(date);
}

/** "6:00 pm" style, per locale. Replaces the hand-rolled 12-hour am/pm in lib/nudge. */
export function formatTime(loc: Locale, date: Date): string {
  return new Intl.DateTimeFormat(loc, { hour: 'numeric', minute: '2-digit' }).format(date);
}

/** A locale-formatted number ("1,234"). */
export function formatNumber(loc: Locale, n: number): string {
  return new Intl.NumberFormat(loc).format(n);
}
