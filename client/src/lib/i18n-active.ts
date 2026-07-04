// The ACTIVE-locale binding, kept pure (no expo import) so the tested lib modules can
// translate without dragging the device seam into the node test environment. lib/locale
// (the expo-localization seam) calls setActiveLocale() once at startup; everything else
// imports { t, fmt } from here (lib modules) or from lib/locale (screens, which re-exports
// these). Tests get the 'en' default, so English assertions hold without any mock.

import {
  formatMonthDay,
  formatNumber,
  formatRelativeDay,
  formatTime,
  formatWeekday,
  type Locale,
  type PluralForms,
  pluralize,
  translate,
} from './i18n';

let active: Locale = 'en';
// Formatting follows the device's FULL region tag (en-AU keeps "27 June", it-IT gets Italian
// order), independent of which string catalog is active. Defaults to en-AU, the app's shipped
// formatting locale, so tests and fallbacks render exactly what production always rendered.
let activeFormat = 'en-AU';

/** Bind the session locale + the device's full BCP-47 tag for date/number formatting
 *  (called once by lib/locale at startup; tests may call it directly). */
export function setActiveLocale(loc: Locale, formatTag?: string): void {
  active = loc;
  if (formatTag) activeFormat = formatTag;
}

/** The currently bound locale. */
export function activeLocale(): Locale {
  return active;
}

/** The currently bound formatting tag (the device's full BCP-47, e.g. "en-AU", "it-IT"),
 *  for the rare date shape fmt doesn't cover. */
export function activeFormatTag(): string {
  return activeFormat;
}

/** Translate a key in the active locale. `{name}` placeholders interpolate from params. */
export function t(key: string, params?: Record<string, string | number>): string {
  return translate(active, key, params);
}

/** Active-locale-bound formatters, so call sites stop hand-rolling dates, plurals and numbers.
 *  Dates/times/numbers use the device's full region tag; plural rules use the string locale. */
export const fmt = {
  relativeDay: (date: Date, today: Date): string => formatRelativeDay(activeFormat, date, today),
  monthDay: (date: Date): string => formatMonthDay(activeFormat, date),
  weekday: (date: Date, width?: 'short' | 'narrow'): string => formatWeekday(activeFormat, date, width),
  time: (date: Date): string => formatTime(activeFormat, date),
  number: (n: number): string => formatNumber(activeFormat, n),
  plural: (count: number, forms: PluralForms, params?: Record<string, string | number>): string =>
    pluralize(active, count, forms, { count, ...params }),
};
