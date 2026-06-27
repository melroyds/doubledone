# DoubleDone internationalisation plan

*Written 2026-06-26, after the design and copy reviews. The copy review's terminology glossary is the backbone of this plan; read it first ([`copy-review.md`](copy-review.md)). This is the plan, not the build: the actual string extraction waits until the copy decisions settle.*

---

## Where we are

**Pass 1 is shipped** ([`client/src/lib/i18n.ts`](../client/src/lib/i18n.ts)): the device locale resolves to one of `en / it / es / fr`, and the AI is told to answer in the user's language (`aiLanguageFor` feeds the server's `withLanguage`). So an Italian user already gets Break-it-down, Lighten today, and the weekly reflection **in Italian**, today.

**What is missing:** the UI *chrome*, every button label, heading, affirmation, empty state, and error, is a hardcoded English string literal across `client/src/app/*.tsx` and `client/src/components/*.tsx`. That is the work.

## The core distinction (do not conflate these)

- **Translatable** is architecture: a one-time job to move every UI string behind a typed `t('key')`. This is the enabler.
- **Translated** is content: per-locale catalogs, and for *this* app they must be **native-speaker reviewed**, never raw machine translation. The calm, never-shame tone *is* the product. "Marked as a lot. The day knows it's heavier." does not survive Google Translate with its warmth intact.

Make it translatable now (architecture). Translate on real demand (content).

## The architecture: a typed `t()` on top of `lib/i18n.ts`

No heavy dependency (no i18next / Lingui). For a string-catalog app this size, extend `lib/i18n.ts`:

1. **Typed catalogs.** One TS object per locale, English as the source of truth, keys typed so a missing or misspelled key is a **compile error**:
   ```ts
   // catalogs/en.ts
   export const en = {
     today: { title: 'Today', weightFull: 'A full day, but doable.' },
     actions: { lightenToday: 'Lighten today', planMyDay: 'Plan my day' },
   } as const;
   export type Catalog = typeof en; // it/es/fr must satisfy Catalog
   ```
2. **`t()`** resolves the active locale's catalog, falling back to `en` per key (a partial translation never shows a blank, it shows English).
3. **`Intl` for everything format-shaped**, built in, no dep:
   - dates / relative time -> `Intl.DateTimeFormat` / `Intl.RelativeTimeFormat` (replaces the hand-rolled date strings in `lib/day`).
   - **plurals -> `Intl.PluralRules`** with a per-locale form table. This kills the hand-built `"1 task" / "N tasks"` concatenation the copy review flagged.
   - numbers -> `Intl.NumberFormat`.
4. **Interpolation by templated function, never concatenation.** A string with a variable becomes `t.reminderAt(time)` returning a full sentence per locale, so word order is the translator's to set. This is the single most important rule for translatability.

## What has to change *before* extraction (the i18n-hard patterns)

From the copy review's i18n notes. The English never changes, the assembly underneath does:

- **String concatenation** that assembles a sentence from parts -> one templated sentence per case.
- **Hand-built plurals** -> `Intl.PluralRules`.
- **Baked-in date/number formatting** -> `Intl`.
- **Idioms and puns** ("Bite the elephant", "what you finish, you keep", "Lighten today") -> keep them in English, but flag each so the translator writes a *culturally equivalent* line, not a literal one. These are the soul of the app, do not flatten them.

## Terminology glossary = consistent source strings

The copy review's glossary (one canonical word per concept: **task**, **remove** vs **delete**, **repeating**, **scrapbook**, **big**, ...) is not just copy hygiene, it is i18n hygiene. A source string that says "task" everywhere (never "thing", "item") gives the translator one word to translate, not three. **Applying the glossary fixes is step zero of i18n.**

## Sequencing (the order matters)

1. **Settle the copy** (Melroy's voice calls from the copy review, plus the glossary). Extracting a moving target means re-translating it.
2. **Fix the i18n-hard patterns** (concatenation -> templates, plurals -> ICU, dates -> Intl). Mechanical, no visible change.
3. **Extract** every UI string behind `t()`, English catalog as source. The big one-time job.
4. **Instrument locale** in the pseudonymous D1 telemetry (locale is a safe non-identifying field) to see where users actually are.
5. **Translate to demand**, top one or two locales first, native-reviewed, glossary-anchored. Ship one proof locale well before four half-good ones.

## Language choice: by signal, not vanity

Pass 1 named it/es/fr, but **the data should confirm them**. ParkProof shipped 9 locales because it could; a *live commercial* product pays a maintenance tax on every locale (each copy change times N). So: instrument locale, translate the top one or two, and lean on the fact that the **AI already answers in-language** so non-English users get a half-localised, genuinely useful app even before the UI catalog lands. My placeholder pick pending data is Spanish (reach), but the telemetry decides.

## The text-expansion tie-in

Translated copy runs ~30% longer (German and French especially). The design review's responsive work (the type scale, the shared components, the maxWidth caps) already makes the layouts flex, so the i18n and design tracks reinforce each other. Worth a pass at the longest-string screens (Settings rows, the paywall) once a real translation exists.

## The concrete next code step (when greenlit)

Scaffold the `t()` layer and the `en` catalog *structure* (empty-ish, the real extraction fills it), wire `t` through the theme provider or a small `useT()` hook, and migrate ONE screen end to end as the proof. That validates the typing, the plural helper, and the Intl date wiring before the full sweep.

## Effort, honestly

- Architecture (the `t()` layer + Intl wiring + one proof screen): a focused day or two.
- Full extraction: the large mechanical job, batchable per screen.
- Per-locale translation: bounded by native review, not engineering.

The architecture is the investment; the translation is the variable cost you pay per real locale.
