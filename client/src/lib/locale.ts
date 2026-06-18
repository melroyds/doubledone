import * as Localization from 'expo-localization';

import { aiLanguageFor, type Locale, resolveLocale } from './i18n';

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
