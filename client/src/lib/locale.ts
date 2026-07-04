import * as Localization from 'expo-localization';

import { aiLanguageFor, type Locale, resolveLocale } from './i18n';
import { activeLocale, setActiveLocale } from './i18n-active';

// The device-locale seam (kept out of lib/i18n so that stays test-pure, like the
// storage / reminders / supabase seams). Detected once at startup and bound into
// lib/i18n-active, the pure holder every lib module reads. Screens import
// { t, fmt } from here (re-exported), lib modules from './i18n-active' directly.
// Guarded so a failure degrades to English rather than throwing.

function detect(): { loc: Locale; tag: string | undefined } {
  try {
    const first = Localization.getLocales?.()?.[0];
    return { loc: resolveLocale(first?.languageCode ?? 'en'), tag: first?.languageTag ?? undefined };
  } catch {
    return { loc: 'en', tag: undefined };
  }
}

const detected = detect();
setActiveLocale(detected.loc, detected.tag);

/** The active locale for this session. */
export const locale: Locale = activeLocale();

/** The language to ask the AI to answer in, or undefined for English. */
export const aiLanguage: string | undefined = aiLanguageFor(locale);

/** The screen-facing entry points: import { t, fmt } from '@/lib/locale'. */
export { fmt, t } from './i18n-active';
