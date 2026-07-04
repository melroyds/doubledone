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

/** Bind the session locale (called once by lib/locale at startup; tests may call it directly). */
export function setActiveLocale(loc: Locale): void {
  active = loc;
}

/** The currently bound locale. */
export function activeLocale(): Locale {
  return active;
}

/** Translate a key in the active locale. `{name}` placeholders interpolate from params. */
export function t(key: string, params?: Record<string, string | number>): string {
  return translate(active, key, params);
}

/** Active-locale-bound formatters, so call sites stop hand-rolling dates, plurals and numbers. */
export const fmt = {
  relativeDay: (date: Date, today: Date): string => formatRelativeDay(active, date, today),
  monthDay: (date: Date): string => formatMonthDay(active, date),
  weekday: (date: Date, width?: 'short' | 'narrow'): string => formatWeekday(active, date, width),
  time: (date: Date): string => formatTime(active, date),
  number: (n: number): string => formatNumber(active, n),
  plural: (count: number, forms: PluralForms, params?: Record<string, string | number>): string =>
    pluralize(active, count, forms, { count, ...params }),
};
