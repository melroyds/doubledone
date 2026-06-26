import * as Localization from 'expo-localization';

import {
  aiLanguageFor,
  formatMonthDay,
  formatNumber,
  formatRelativeDay,
  formatTime,
  formatWeekday,
  type Locale,
  type PluralForms,
  pluralize,
  resolveLocale,
  translate,
} from './i18n';

// The device-locale seam (kept out of lib/i18n so that stays test-pure, like the
// storage / reminders / supabase seams). Detected once at startup; a manual
// override will come with the Settings page. Guarded so a failure degrades to
// English rather than throwing.

function detect(): Locale {
  try {
    const code = Localization.getLocales?.()?.[0]?.languageCode ?? 'en';
    return resolveLocale(code);
  } catch {
    return 'en';
  }
}

/** The active locale for this session. */
export const locale: Locale = detect();

/** The language to ask the AI to answer in, or undefined for English. */
export const aiLanguage: string | undefined = aiLanguageFor(locale);

/** Translate a key in the active session locale. `{name}` placeholders interpolate from params. The
 *  screen-facing entry point: import { t } from '@/lib/locale'. */
export function t(key: string, params?: Record<string, string | number>): string {
  return translate(locale, key, params);
}

/** The active-locale-bound formatters, so screens stop hand-rolling dates, plurals and numbers. */
export const fmt = {
  relativeDay: (date: Date, today: Date): string => formatRelativeDay(locale, date, today),
  monthDay: (date: Date): string => formatMonthDay(locale, date),
  weekday: (date: Date, width?: 'short' | 'narrow'): string => formatWeekday(locale, date, width),
  time: (date: Date): string => formatTime(locale, date),
  number: (n: number): string => formatNumber(locale, n),
  plural: (count: number, forms: PluralForms, params?: Record<string, string | number>): string =>
    pluralize(locale, count, forms, params),
};
