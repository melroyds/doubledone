# DoubleDone copy review

*Generated 2026-06-26 by a 7-lens adversarial copy/microcopy audit (clarity, consistency, tone, register, microcopy, i18n-readiness, punctuation). Every finding was re-checked by a skeptic so intentional on-brand choices survived. The mechanical fixes are safe to batch; the Tier 1-3 items are voice/naming calls for Melroy (like Strategise to Plan my day was). Doubles as the i18n terminology backbone.*

---

## Read

DoubleDone's copy is in strong shape. The voice is consistent enough that the violations stand out as anomalies rather than the rule, which is the sign of a product whose tone was authored, not assembled. The clipped two-beat affirmations ("Done is done. Recorded."), the never-shame spine, and the deliberate lowercase aphorisms all hold. The verifiers filtered hard: most of the raw "thing vs task" noise resolved into a coherent register rule that the code already follows, and the loved idioms survived. What remains splits cleanly into three buckets. First, the highest-value moves: rename the **Rooms** pill (it is the only door to everything past Today and a first-timer cannot read it, plus its accessibility label is stale and lists the wrong contents), unify the **scrapbook/keepsake** name across the paywall and Settings so a user who pays for a "keepsake" does not land on a card titled "Scrapbook," and stop the two **raw Supabase error strings** from leaking onto the sign-in screen, the most anxiety-prone surface in the app. Second, a batch of safe mechanical fixes (one casing concept, one stray exclamation mark, two semicolons). Third, the i18n-prep work, where the English never changes but the assembly underneath it has to, before any t() layer can land.

## The voice, in one line

Calm, concrete, and never-shame: short declarative sentences that name what just happened and reassure without cheerleading, lowercase by deliberate choice, warm but never salesy, and never implying the user is behind or has failed. When in doubt, say the plain true thing gently and stop.

## Terminology glossary

One canonical term per concept. The "fix" column lists the deviating sites to bring into line.

| Concept | Canonical term | Sites to fix |
|---|---|---|
| The AI weekly memento of finished tasks | **scrapbook** | premium.tsx:119,127,145,157,170,199,200 and settings.tsx:350 say "keepsake"; lookback.tsx:309 hint says "keepsake" twice. "keepsake" allowed only as flavour, never as the feature name |
| The capture-and-triage action | **Sort for me** | welcome.tsx:35 teaches "Sort it for me"; live button is "Sort for me" (BrainDump.tsx:429) |
| The brain-dump feature name | **Brain dump** (unhyphenated) | BrainDump.tsx:247 a11y label says "Brain-dump"; launcher (_layout.tsx:81) says "Brain dump" |
| Soft, reversible removal | **Remove** | Correct and deliberate everywhere (TaskRow, select-bar, routines). Keep distinct from Delete |
| Permanent account destruction | **Delete** | Correct and deliberate (settings.tsx). Never swap with Remove |
| Mark a task as a lot of effort | **big** (lowercase) | TaskRow.tsx:215,273 and index.tsx:1326 render Title-Case "Big"; lowercase everywhere else |
| Sync relationship to an email | **synced to** | sign-in.tsx:158 says "synced as"; index.tsx and settings.tsx:272 say "synced to" |
| Finish a panel / dismiss it | **Close** | RepeatingDrawer.tsx:59 and index.tsx:1417 ("Done adding") overload "Done"; reserve "Done" for completing a task |
| The reflective register for finished items | **thing(s)** | Correct on reflective surfaces. Only lookback.tsx:319 deviates with "tasks" |
| The actionable register for capture/edit | **task(s)** | Correct on capture/move/add affordances. Keep the split |
| Return destination naming the screen | **Today** (capitalised) | sign-in.tsx:158,159 and index.tsx:1443 lowercase it; premium.tsx and chart.tsx capitalise. Rule: capital when it names the screen, lowercase when it means the day in prose |

## Mechanical fixes (safe to apply)

Grouped by kind. Each is current -> suggested with file:line. No voice judgment needed.

**Stray exclamation (the only one in the app)**
- premium.tsx:143 — `Thanks! Setting up your Premium, this updates in a moment.` -> `Thanks. Setting up your Premium, this updates in a moment.`

**Semicolons in prose (mirror each other, fix together)**
- privacy.tsx:56 — `...Just don't use those features; the rest of the app works fully without them.` -> `...Just don't use those features. The rest of the app works fully without them.`
- privacy.html:93 — same string, same fix (the SYNC NOTE requires both move together)

**Casing: "Big" -> "big"** (one concept, lowercase everywhere else)
- TaskRow.tsx:215 — inline row mark `Big` -> `big`
- TaskRow.tsx:273 — second row variant `Big` -> `big` (must move with :215 or the two rows render differently)
- index.tsx:1326 — select-bar toggle `'Not big' : 'Big'` -> `'not big' : 'big'` (also fixes the within-pair mismatch; the a11y label is already lowercase)

**Hyphenation: feature name consistency**
- BrainDump.tsx:247 — a11y label `Brain-dump...` -> `Brain dump...` to match the launcher. Leave the placeholder "Empty your head" as-is

**Stale accessibility list (screen-reader correctness)**
- index.tsx:1065 — accessibilityLabel reads `Rooms: Repeating, Routines, Lookback, Settings` but the sheet now has five rooms -> include "Chart a course": `...Repeating, Routines, Lookback, Chart a course, Settings`. Do this regardless of the pill-naming call below

## Tier 1 (must)

Breaks clarity or the never-shame / never-alarm spine. Recommendations, the naming calls are yours.

- **"Rooms" pill -> "Menu" (or "More")**, index.tsx:1074 (trigger), :1065 (a11y). Why: this pill is the only route to everything past Today, and a first-timer cannot decode the house metaphor against a three-dots glyph that already says "menu." Keep "Rooms" as the sheet's own title once it is open, where the metaphor lands.
- **Raw Supabase error leak -> calm fallback only**, sign-in.tsx:59. Why: `detail` is `err.message` interpolated straight onto the most anxiety-prone screen, so an RSD-sensitive user can be shown a raw rate-limit or stack string. Always render `'Could not send the code. Check the address and try again.'` and send `detail` to telemetry if wanted.
- **Raw Supabase error leak -> calm fallback only**, sign-in.tsx:81. Why: same leak on the verify step. Always render `'That code did not work. Check it, or send a new one.'`
- **"Start fresh" -> "See today"**, index.tsx:1084 (label), :1086 (a11y). Why: on the "Welcome back" card the button only reveals today, but "Start fresh" reads as wipe/reset and directly contradicts the card's own line two rows up ("Nothing's overdue, nothing's lost"). For a returning user whose exact fear is that something was lost, this is the worst possible word.
- **Scrapbook/keepsake name unification (Tier 1 half: the within-card collision)**, lookback.tsx:309. Why: one card heads itself "Scrapbook" and CTAs "Make a scrapbook," then calls the object "keepsake" twice in its own hint. Fix the hint to "scrapbook" so a single card does not use two names for one thing. (The cross-surface half is Tier 2 below, larger and lower-urgency.)

## Tier 2 (should)

Real inconsistency or off-voice microcopy worth fixing.

- **Scrapbook/keepsake unification across surfaces**, premium.tsx:119,127,145,157,170,199,200 and settings.tsx:350 (plus the a11y label lookback.tsx:295 and the over-quota line lookback.tsx:111). Why: a user reads "keepsake" on the paywall, pays, then lands on a card titled "Scrapbook." One deliberate rename pass to "scrapbook"; verify the longer sentences still read warmly before shipping.
- **"Plan my day" -> "Plan my order"** (or "Put today in order"), index.tsx:1266 (label), :1269 (a11y), and premium.tsx:119,160 in the same pass. Why: the button re-orders today, but sits beside "Lighten today," and the two AI buttons' distinct jobs (re-order vs move-out) are not legible from the labels. The internal name is already "Plan my order" everywhere in code, and the a11y label already says the true action. This is the same shape as the Strategise -> Plan my day call.
- **"Sort it for me" -> "Sort for me"**, welcome.tsx:35. Why: onboarding teaches the feature by a name that differs from the live button by one word, on the very first encounter.
- **"Something went wrong reading that." -> name what happened**, CameraCapture.tsx:62. Why: the only truly generic filler error in the app, and it disagrees on narrator with its sibling line 56. Suggest `"Couldn't read that photo just now. Try again?"` so the whole component lands on one narrator.
- **"Sync is not set up on this build." -> plainer reassurance**, sign-in.tsx:44. Why: "on this build" is builder's language with no user mental model. Suggest `"Syncing isn't available here. Your tasks are safe on this device."`
- **"finished tasks" -> "finished things"**, lookback.tsx:319. Why: the one genuine register slip on the Lookback screen, which is otherwise reflective "things." The scrapbook note describes finished items, so it should read "things."
- **"Done" overload -> "Close" for the dismiss sense**, RepeatingDrawer.tsx:59 and index.tsx:1417 ("Done adding"). Why: "Done" means both complete-a-task and dismiss-a-panel; the dismiss sense already has a clean sibling in "Close" (TaskRow). Lower confidence, your call on whether the overload is worth touching.
- **"Custom" cadence chip -> "Every few days"** (or "Repeat every..."), BrainDump.tsx:40. Why: among the when-chips, "Custom" gives no hint it means an every-N-days repeat. The control it reveals already says "Every {n} days," so the chip can name itself.
- **"Step back" -> "Undo a step"** (or "Back one step"), TaskRow.tsx:115. Why: on a sliced task's hold menu it un-advances one slice, but it sits beside "Close," so two back-flavoured words collide and the user cannot tell which undoes a slice.
- **"Big" / "Not big" toggle -> "Mark as a lot" / "Not a lot"**, index.tsx:1326. Why: the one-word toggle does not say what marking does (it lifts the day's weight gauge), and ties to the app's own line "Marked as a lot. The day knows it's heavier." (This is the voice-judgment beyond the safe lowercase mechanical fix above.)
- **"No worries" -> "That's alright"**, premium.tsx:145. Why: the calm reassurance after a cancelled checkout must stay, but "No worries" is the lone casual idiom in an editorial-calm voice and translates poorly. Swap the idiom, keep the warmth, do not make it colder.

## Tier 3 (nice-to-have)

- **"Almost there" -> "Continue"** (or "Keep going"), welcome.tsx:38. Why: a primary onboarding button that names a feeling, not the action; the odd one out among primaries that all name the action. Batch with a welcome-screen pass.
- **"This looks right" -> "Looks good, next"**, welcome.tsx:36. Why: agreeable but asks a first-timer to validate a non-binding sort they cannot yet judge. Keep the warm tone, make the effect unambiguous.
- **"Downloaded." -> "Downloaded. It is yours to keep."**, settings.tsx:110. Why: a reassuring "your stuff is yours" moment where the voice goes flat to a bare system receipt.
- **"Could not export just now." -> add the retry**, settings.tsx:116. Why: drops the gentle retry the rest of the app offers ("...Try again?").
- **Casing: "Back to today" -> "Back to Today"** and the matching prose line, sign-in.tsx:159 and :158. Why: the same destination is "Back to Today" in premium.tsx and index.tsx:1534. Standardise up to the screen-name capital so the sentence agrees with its own button.
- **Casing: "Add to today" -> "Add to Today"**, index.tsx:1443 (label and a11y :1440). Why: the chart-screen parallel already capitalises ("Add {n} tasks to Today", chart.tsx:183). Same proper-noun rule.

## i18n notes

The English never changes here. These are the assembly patterns the eventual t() layer must own. Do not strip the charm, but route each through a proper message so it survives translation.

**The keystone fix (do this first, many findings dissolve after it):**
- `friendlyDate` in day.ts:59-66 hardcodes `locale = 'en-AU'` and returns a literal `'Tomorrow'`. It feeds Later headers, recurrence labels, the BrainDump add label, BreakdownReview, and several a11y strings, so one helper leaks English into many sentences. Thread the real locale through (keep en-AU only as fallback) and return a translated relative word via a shared relative-day helper.

**Hardcoded English date/time machinery (use Intl, not literals):**
- day.ts:33-35, calendar.ts:10-14,35-37, scrapbook.ts:72-75 — `MONTH_NAMES`, two-letter `WEEKDAY_LABELS`, `monthLabel`, and `week of {date}` all pin English. Derive from `Intl.DateTimeFormat`. The two-letter weekday convention is script-specific, source it from Intl.
- recurrence.ts:20 — a SECOND hardcoded weekday array, distinct from calendar.ts, that will drift. De-duplicate against the shared Intl source regardless of i18n.
- nudge.ts:47-53 — 12-hour time with literal am/pm, which also feeds the TaskRow a11y label. Use `Intl.DateTimeFormat` with `formatToParts` to keep the "6pm" brevity.
- index.tsx:1775 — inline `'Today' / 'Tomorrow' / 'In N days'` relative-day label. Route through the same shared relative-day helper as the day.ts fix.

**Hand-built plurals (every one is two-form English only, breaks for languages with more plural categories):**
- celebrate.ts:38-69 (spelt-out numeral word list plus step/steps, three clauses space-joined), nudge-adjacent counts, triage.ts:48-55 ("Sorted: ..." list-join with "N for today"), estimate.ts:34-46 ("about N days" embedded mid-sentence), recurrence.ts:46-73 ("Every N days"), index.tsx:1128/1717-1719 (thing/things plus a spliced "one a big one"), index.tsx:1573 ("N tasks become one", no plural branch at all, "1 tasks" reachable), index.tsx:1621 ("N tasks move"), lookback.tsx:111 ("N day{s}"), lookback.tsx:353-362 (week/activeDays/reclaimed plus an appended ", like {title}"), premium.tsx:118-120 (keepsake/keepsakes plus clause-and-punctuation swap on the count), and the lower-stakes button counters at chart.tsx:180, BreakdownReview.tsx:105,109, index.tsx:1298, BrainDump.tsx:378,320. Convert each to one ICU-plural message holding the whole sentence, so count agreement and clause placement are per-language.

**Concatenated a11y / meta sentences (translator receives fragments, not a sentence):**
- TaskRow.tsx:76-80 — the primary task-row screen-reader label, built by gluing optional clauses with ", ". Compose from full templated strings keyed by which flags are set, or use `Intl.ListFormat`. Matters for both i18n and accessibility.
- BreakdownReview.tsx:71,77 — step meta and its a11y label stitch title + minutes + relative date in fixed English order.

**Date/number spliced mid-sentence (named placeholder, let the translator place it):**
- premium.tsx:123-126,172-176 — `periodLabel` spliced into "Premium until {date}, then..." / "Renews {date}.", and tier chips mixing a digit with an English phrase ("2 after two months").
- index.tsx:775 — "{task} is back when you're ready" makes a user task the grammatical subject; template around a named {task}.

**Baked-into-data formatting (this one is not render-time, raise it even outside i18n):**
- index.tsx:944 and chart.tsx:104 — `${s.title} (${s.minutes} min)` writes the English "N min" into the persisted task title, so it appears in Lookback, the scrapbook, and exports, and survives a language switch. Keep minutes as the structured field and render the duration via a message at display time.

**Transcreate, do not translate (key them, brief translators to re-author per locale):**
- RotatingPhrase.tsx:12-21 — the lowercase aphorisms rely on English cadence, and the lowercase convention is wrong in languages that capitalise nouns. The casing decision must be per-language, not forced by code.
- estimate.ts:69-91 weight-gauge labels, the index.tsx affirm calls, the welcome EXAMPLE list ("Mum", local tasks), "Goodnight", and the chatty sort hints. All flawless English; the only action is key-and-transcreate.

## Verified-and-dropped

The verifiers kept these on purpose, so the punch-list above reads as filtered, not raw:

- **The deliberate lowercase calm** stays. "One-off" in the cadence set, the feature-name proper nouns inside sentence-case lines ("Scan a list, Chart a course"), and the aphorisms are intentional and consistent.
- **The register rule holds.** Most of the "thing vs task" noise resolved into a coherent split the code already follows: reflective "thing(s)" on Lookback and close-the-day, actionable "task(s)" on capture/edit. Only lookback.tsx:319 actually broke it. "Remove" vs "Delete" is a meaningful deliberate split, not a slip.
- **The loved idioms survive.** "Chart a course," "Tidy this into tasks," "Reflect on this week," "Bite the Elephant," and the affirmations are charm the lens is told to protect. They get i18n transcreation notes, not copy edits.
- **The honest-but-firm strings stay.** "Your brain can't tell you that you did nothing," the permanent-delete warning, and "Please try again." on transactional surfaces are intentional and on-brand. Not alarm, not shame, honesty.
