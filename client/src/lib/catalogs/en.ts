// The English string catalog: the SOURCE OF TRUTH for UI strings, organised by namespace. This is the
// i18n "translatable" layer (the architecture). Per-locale TRANSLATED catalogs land later, native-reviewed,
// and fall back to this per key (translate() handles that), so a partial translation never shows a blank.
//
// Conventions:
// - Leaf values are strings. A `{name}` placeholder interpolates via t('key', { name }).
// - Plurals are NOT baked here: the call site uses pluralize(count, forms) so count agreement is per-locale
//   (Intl.PluralRules), not a hand-built English "1 task / N tasks".
// - Idioms and puns ("Bite the elephant", "Lighten today", "Chart a course") stay English here and are
//   TRANSCREATED per locale (a culturally-equivalent line), never literally translated. They are the soul.
//
// Extraction is incremental and behaviour-preserving: a screen is migrated by moving its literals here under
// its namespace and swapping them for t('namespace.key'), with NO change to the rendered English. Only a
// starter set is populated below; the per-screen sweep fills the rest, namespace by namespace.

export const en = {
  common: {
    today: 'Today',
    close: 'Close',
    remove: 'Remove',
    backToToday: 'Back to Today',
    tryAgain: 'Try again?',
    skip: 'Skip',
    begin: 'Begin',
    continue: 'Continue',
    gotIt: 'Got it',
  },
  today: {
    subtitle: 'Just today. The rest can wait.',
    addToToday: '+  Add to Today',
    closeTheDay: 'Close the day',
    alsoDidThat: '+ I also did that',
    lowDay: 'Low on energy? Make it a low day',
    focusOne: 'Focus on one thing',
  },
  actions: {
    lightenToday: 'Lighten today',
    planMyDay: 'Plan my day',
    breakItDown: 'Break it down',
    sortForMe: 'Sort for me',
    makeItTiny: 'Make it tiny',
    chartACourse: 'Chart a course',
  },
  capture: {
    placeholder: 'Empty your head. One line per thing.',
    speakHint: 'Prefer to talk? On web, tap Speak and say them out loud.',
    speak: 'Speak',
    scan: 'Scan',
  },
} as const;

// The catalog SHAPE, with string leaves (widened from en's literal types) so a TRANSLATED catalog (it / es / fr)
// satisfies it, while en itself (literal types) still does. Typing a locale catalog `: Catalog` makes the
// compiler enforce that it supplies EVERY key en has, so a translation can never silently drop one.
type Stringify<T> = { [K in keyof T]: T[K] extends string ? string : Stringify<T[K]> };
export type Catalog = Stringify<typeof en>;
