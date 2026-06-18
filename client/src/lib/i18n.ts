// Pure i18n logic: which locales we support and how to resolve a device code to
// one. No React Native or expo import here, so it stays unit-testable (the device
// detection lives in the lib/locale seam). Pass 1 of internationalisation:
// English plus Italian, Spanish, French, starting with the AI answering in the
// user's language; the UI-string sweep follows.

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
