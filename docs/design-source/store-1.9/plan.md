# Tier 2 store batch: the build plan (version 1.9.0)

Repo root: `C:\Users\molte\Dropbox\Claude Output\Product Manager Portfolio\DoubleDone`. All paths below are relative to it. I changed nothing. I spot-checked the load-bearing claims in the four scout reports against the repo: `accessibilityActions` appears nowhere in `client/src`, the pill's `hidden={selectMode || isClosed}` is at `today.tsx:3558`, `handoffFineNoAi` at `en.ts:1288` says "nothing leaves your device", `featureThemes` says "Seven", app.json is 1.8.0 with `supportsTablet: false`, and `check-listings.mjs` reads Play docs only and is not in CI.

## Verdict
- **One version, 1.9.0.** It means one iOS build and one Android AAB, and the web updates on push. It also carries the R11 sync fix from `mcp-steps`, which has not reached the phones yet.
- **Build order:**
  1. Code that needs no taste call.
  2. The colour change, after Melroy has looked at a before/after.
  3. Screenshots. They must be rendered after the last colour commit, or the new shots show the old app.
  4. Copy and the gates that check it.
  5. Deploys.
  6. Builds.
  7. Store consoles.
- **The biggest win is truth, not keywords.** The live App Store page has said these things for two months:
  - an A$ price on the US page
  - the "nothing leaves your device" overclaim
  - "heavier"
  - "colleagues"
  - the free month offered without saying you must sign in first

  The 2026-08-16 rewrite never reached either store. This batch fixes the copy and adds a gate so it cannot drift again.
- **No kill switch for the review prompt, on purpose.** Both stores cap the card themselves, so the worst bug is a wasted ask, not a nagging app. Also, no ask can fire until 14 days after someone updates, which works as a staged rollout on its own.

## What ships where

| Change | Web (on push to main) | Phones (the 1.9.0 build) | Consoles (Melroy pastes) |
|---|---|---|---|
| #2 keyboard: Options button, right-click, Shift+F10, Escape, focus handling | yes | Escape and back-button parts | |
| #2 screen-reader action (VoiceOver/TalkBack "Options") | ignored by RN-web | yes | |
| #2 pill steps aside while a card is held, contrast tokens, sweep | yes | yes | |
| #3 in-app truth strings | yes | yes | |
| #3 name, subtitle, keywords, descriptions, localisations, tags | | | ASC + Play |
| #4 captioned screenshots, Play capture slide | | | ASC + Play |
| #5 review prompt | stub only, never asks | yes | |
| #5 `review.asked` counter | | client half | Worker deploy |
| #6 medical line | | | both store descriptions |
| #6 Terms "Not medical care" section | `terms.html` | `terms.tsx` | |

## Build order (code first, consoles last)

### Slice 0: branch
- Work on a branch `store-1.9`, cut from `main`@`3ad3b4d`. A branch does not deploy. Merging to main, on Melroy's word, is the web deploy.
- Run the gates bare: `npm run typecheck`, `npm test`, `npm run lint`.

### Slice 1: review prompt (#5), first because it changes the lockfile
- **Install:** `npx expo install expo-store-review` from `client/` (version `~56.0.3`).
  - No config plugin and no app.json change.
  - **Never add `ios.appStoreUrl` or `android.playStoreUrl`**, and never call `hasAction()`. With those keys present, `requestReview()` falls back to opening the store page.
- **New `client/src/lib/review.ts` (pure, testable in vitest):**
  - Constants: 5 closed days, 14-day span, 180-day gap, 1200 ms delay.
  - `ReviewMemory`, `countClose` (counts each date once), `markAsked`, `parseReviewMemory` (corrupt data gives fresh defaults), `shouldAskForReview`.
  - Tests in `review.test.ts`.
- **New `client/src/lib/store-review.ts`:** `REVIEW_SUPPORTED = true`.
  - Imports the package lazily (`await import('expo-store-review')`) inside try/catch. A top-level import throws at launch on any binary without the native module, which would crash Today.
  - Gates only on `isAvailableAsync()`.
- **New `client/src/lib/store-review.web.ts`:** `false`, and never imports the package.
- **`client/src/lib/platform-split.contract.ts`:** add the pair the same day you create it (CLAUDE.md gotcha).
- **`client/src/lib/storage.ts`:** add `doubledone.review.v1` and `doubledone.reviewquiet.v1`, with load/save functions. Keep both out of `wipeLocalData`.
- **`client/src/app/today.tsx`:**
  - Hoist a single `tonightOffer` and use it in place of the four inline `restedOffer` calls.
  - Call `maybeAskForReview` after `dayClosed`.
  - A timer ref, cleared on blur, on reopen and on unmount.
  - When the timer fires, re-check: the app is active, the day is still closed, Today still has focus.
  - Write the "keep quiet today" date on a Low day, on Lighten (`runStrategise`) and on re-entry after time away.
- **`client/src/app/settle.tsx`:** write the same date beside `track('settle.opened')`.
- **The gates:** all of the scout's Tier 1 gates, plus its Tier 2 gates 9 (not a heavy day) and 12 (the hoisted offer). One change from me: gate 10's evening window becomes **17:00 to 01:59**, not 17:00 to 23:59. A good day closed at 00:30 is a normal close for a night owl, and the other gates already filter out a bad night.
- **The counter:**
  - Client: `client/src/lib/telemetry.ts` (`BEACON_EVENTS`, plus `BEACON_PROPS['review.asked'] = ['store']`), and the exact-list test in `telemetry.test.ts`.
  - Server: `server/src/events.ts` (`review.asked.ios`, `review.asked.android`, and the fold), plus `events.test.ts`.
- **Privacy, same commit as the client code (rule):** add the review line to `client/src/app/privacy.tsx` and `client/public/privacy.html`, and change "Last updated" on both.
- **Docs:** correct `docs/growth-plan.md:34-39`. That plan's pre-prompt line breaks Apple 5.6.1 and Google's rules, and "dismiss is forever" cannot be built, because neither store reports a dismiss.
- **Decision log (feat).** Decided against:
  - our own line before the card
  - a Rate button that calls the API
  - Bloom, Calendar or keepsake as the trigger
  - holding the ask back from people who sent feedback (that is sentiment filtering)
  - counting from install time
- **Verify:** after an export, `grep -l StoreReview client/dist/_expo/static/js/web/*.js` must find nothing.

### Slice 2: accessibility with no taste calls (#2)
- **`client/src/components/TaskRow.tsx`, on all five long-press branches:**
  - **K1:** on the web, `onContextMenu` opens the card unless `defaultPrevented`. Also an `onKeyDown` for Shift+F10 and the ContextMenu key, and `aria-keyshortcuts`.
  - **K2:** a web-only "Options for {title}" button that stays hidden until it gets keyboard focus. Default and slice rows get a View wrapper on the web only.
  - **S1:** `accessibilityActions` with `longpress` labelled "Options", plus `onAccessibilityAction`.
  - **K3:** on open, focus moves to the title. On close, focus returns to the row only if it was inside the card. Mind the React Compiler notes at lines 364-367.
  - **K4:** Escape closes the card on the web, `onAccessibilityEscape` on iOS, the back button on Android.
  - **K6:** `outlineOffset: -2` on `railCell` on the web, so the focus ring is not clipped. Verify from an export.
  - **C3:** drop the 0.82 opacity on `heroSub`.
  - **C4:** the dimmed free Pin uses inkSoft colour instead of 0.6 opacity, and keeps the ✦.
- **`client/src/app/today.tsx`:**
  - **P1:** `hidden={selectMode || isClosed || confirmingId != null}`.
  - **P2:** on the web, `scrollPaddingBottom` from a new `pillClearance()`, so a focused row never parks under the pill.
  - **K7:** the hold-hint's screen-reader label includes the tip itself. The web copy reads "Hold a task, or right-click it, for more…".
  - **K8:** a focus-revealed "Add a task" as the first Tab stop in the list.
- **`client/src/components/ours-list.tsx`:** P1 and P2.
- **`client/src/components/CaptureSheet.tsx`:** export `pillClearance()` beside `pillBottom`, so the number lives in one place.
- **Catalogues, all 5:** `today.rowOptions`, `today.rowOptionsA11y`, and the web hold-hint variant. Spanish neutral.
- **C10, written first:**
  - Move the palettes and how they are derived out of `client/src/constants/theme.ts` into a pure module (the `motion.ts` precedent).
  - Add a node test: every text pair must reach 4.5:1 and every check ring 3:1, on the real composited surfaces including the sky, for all 14 palettes.
  - Run it against today's tokens first. It must fail exactly where the scout's table says, which proves the test before the tokens fix it.
- **CLAUDE.md gotcha:** RN-web never fires `onLongPress` from a keyboard and ignores `accessibilityActions`, so every long-press door needs a web keyboard twin.

### Slice 3: contrast tokens (#2), after Melroy's look
- **First:** a before/after of Today in light mode at the night phase, in Dusk and in Honey, sent to Melroy. The screenshot tool cannot judge this, so it needs his eyes.
- **Tokens, light mode** (in `theme.ts`, or the new module): the inkSoft floor nudge, new `skyInk`, `accentText` and `skyAccent`, `repeat` retuned, and darker check rings on the Premium themes. Dark mode keeps its values: `skyInk` becomes inkSoft, `accentText` and `skyAccent` become accent.
- **Where they apply:**
  - C2, C2b, C5 and C6 across Today, TaskRow, `DayHeading.tsx` and `MenuPill.tsx`.
  - C7: all 23 inkFaint placeholders become inkSoft.
  - C9: align `THEME_PRESETS.dusk` with what Dusk actually renders.
- **Result:** the C10 test now passes.
- **Decision log (a design-system change).** Decided against: lightening the sky, one darker inkSoft everywhere, a high-contrast mode.

### Slice 4: the app-wide sweep (#2), behind a cut line
- **What:** the same token roles on Settings, Calendar, Ours, Premium, Privacy, Terms and the sheets. That is 65 inkFaint-as-text sites and 112 accent-as-text sites.
- **Premium screens:** colour only, no copy, so Android's price rule is untouched.
- **Guard:** a vitest file-scan with an allowlist of inkFaint uses that are not text (rings, borders, disabled, decoration). It fails on any new use. `placeholderTextColor={theme.colors.inkFaint}` is banned outright.
- **Cut line:** if slices 1 to 3 are not green when the rest is ready, this slides to the next build. Nothing in the batch claims accessibility, so cutting it breaks no promise.

### Slice 5: in-app truth strings (#3, the same claims inside the app)
- **`handoffFineNoAi`:** becomes "Private by default: your tasks stay on this device. Want them on your phone and your laptop too? Sign in to sync, always optional." The usage counter and the feedback note mean "nothing leaves" is false.
- **`premium.featureThemes`:** becomes "Six more calm colour themes". Dusk is free.
- **One native read for everything in this batch,** in one pass through `scripts/gen-i18n-review.py`:
  - the new and changed in-app keys
  - the App Store localisations
  - the Play line fixes
  - the release notes

### Slice 6: Terms (#6)
- **What:** a "Not medical care" section after "Using DoubleDone", in both `client/public/terms.html` and `client/src/app/terms.tsx`. In the app file it goes outside the shop-specific branch, so every platform shows the same words.
- Change "Last updated" on both. English only. Needs Melroy's OK.
- It stays a draft pending the lawyer's review, like the rest of the Terms.

### Slice 7: captioned iOS screenshots (#4), after the last colour commit
- **`scripts/play-assets.mjs` gets a `STORE=ios` mode.** Play output is unchanged when it is unset.
  - Raw captures at 440x956, scale 3.
  - Outputs at 1320x2868, 1284x2778 and 1206x2622.
  - JPEG at quality 92, with a check of the size header that fails unless each file is exactly the right size.
  - A frameless card and a caption at about 7.5% of the slide width.
  - The wrap guard fails instead of warning.
  - A caption gate: no dashes, "!", digits or currency. No Android, Google, Play or Stripe. French no-break spaces.
- **Hardening copied from `landing-shots.mjs`:**
  - a pinned clock, except on Settle (a fake clock freezes the breathing)
  - `pinRandom` and the reminder-offer seed
  - the AI host blocked with `route.abort`
  - SpeechRecognition deleted before boot (the Speak fix)
  - the two-member Ours fixture
  - `LOCALE_TAG`, and waits by testID
- **Six slides, in this order:**
  1. Today
  2. Held card
  3. Calendar
  4. Capture
  5. Settle, in dark
  6. Ours
- **Captions:** English only this version, in `docs/appstore/captions.json` read by the script and its gate. They move into catalogue `storeShots.*` keys when the localised sets happen. Strings phones never show should not ship to phones.
- **Output:** `docs/appstore/captioned/{6.9,6.5,6.3}/en/01-today.jpeg` through `06-ours.jpeg`. Never write to `docs/appstore/*.jpeg`, because `social-slides.mjs` reads them.
- **Play:**
  - Regenerate the capture slide in every Play locale (the Speak fix), with the caption "Empty your head in one go."
  - Check Play's Ours slide for "Waiting for your person".
  - Check the new raw captures for the bottom-left smudge.
- **Docs:**
  - The Screenshots section of `docs/appstore/listing-copy.md`.
  - A decision-log `feat(shots)` entry. Decided against: a bezel, iPad shots, the welcome screen first, Ours third.
  - Backlog lines: the iPhone Duo layout, the localised shots, the Product Page Optimization test.
- **Melroy looks at all six at real phone size before upload.**

### Slice 8: listing copy and the gate (#3, #6)
- **`docs/appstore/listing-copy.md`:**
  - the name, subtitle, keywords and promo text
  - the 3,970-character description, medical line included
  - its character count corrected
  - a second English keyword set, drafted twice (en-GB and en-AU) and picked at paste time
- **New `docs/appstore/listing-localised.md`:** de, fr, it, and one neutral Spanish text for both es-MX and es-ES.
  - Each gets a name, subtitle, keywords, promo text and description.
  - They are adapted from the natively reviewed Play listings, minus the Android lines (widget, Google Play), plus the Apple billing paragraph, the Terms URL and the medical line.
- **Play English, `docs/play-store-submission-pack.md`:**
  - Title: `DoubleDone: ADHD To-Do List`
  - Short description: 79 characters
  - Full description: 3,832 characters
  - Delete the second, never-shipped English short-description source.
- **Play translations, `docs/play-store-listings-localised.md`:**
  - All four: `privTitle`, `priv2`, `priv3` and `priv4` replace the old lines, and the medical sentence is added.
  - es: "vuestros" and "iniciáis" go, and the "carga la mañana" line goes. This one text becomes the es-419 source too, which today has none.
  - it: "La nostra lista" everywhere.
  - de: "je nach zu viel".
  - The replacement wording comes from the landing strings, which have already had a native review.
- **Retire** `docs/play-resubmission-walkthrough.md` and section 4 of `docs/play-store-release.md` as paste sources: a "do not paste" banner on each, and the gate stops reading them.
- **`scripts/check-listings.mjs`, a new App Store mode:**
  - Caps: 30 / 30 / 100 / 170 / 4,000.
  - Keywords: no space after a comma, and no word repeated from the name or subtitle.
  - No currency figure, and no Android, Google Play, widget, Speak or web mention.
  - The medical line, the privacy URL and the Terms URL must be present.
  - Banned phrases: "heavier", "colleagues", "nothing you type leaves", "nothing leaves your device", "Private by default", "unlike every shared list", "Seven calm colour themes", "accessible", "WCAG", "screen-reader friendly".
  - Play also bans "free trial", "try Premium free" and "free for a month".
  - Wire the script into `.github/workflows/ci.yml`.
- **Truth pass before Melroy reads the drafts:** one adversarial read of each draft, feature by feature, against the code per platform (the landing precedent). Three things the scouts did not confirm:
  - Scan a list from a photo, on each platform
  - the Premium wording for What fits right now
  - whether the monthly scrapbook works with AI off
- **Decision log** for the name and keyword strategy. Decided against: competitor names, habit and streak words, clinical words, the bare word "calm" as a keyword.

### Slice 9: release prep
- `client/app.json` version 1.9.0. Build numbers are remote, with autoIncrement.
- **`docs/release-notes/1.9.0.md`:**
  - Apple What's New per localisation. Each localisation has its own field, so fix the "inherit" line in these files.
  - Play: one paste with six tags, and one neutral Spanish text under both `es-419` and `es-ES` (the 2026-10-18 neutral rule replaces 1.8.0's two variants).
  - No mention of the review prompt.
- Regenerate the suite: `python scripts/gen-test-suite.py`.
- **Docs:**
  - The BUILD-PLAN next action, at the top.
  - CLAUDE.md gotchas: the two expo-store-review traps, and "App Store localisations do not inherit What's New".

### Then deploys, builds and consoles (each on Melroy's word)
10. **Merge `store-1.9` into main** = the web deploy, in his weekend window. Then merge main into premium, and confirm `git diff --stat main premium -- server` is empty.
11. **Worker deploy from main** (the two review names).
    - Note the rollback target first with `npx wrangler deployments list` (live is `9b10290e`).
    - No smoke-test POSTs to production `/event`.
    - Not urgent: an older Worker drops unknown names, and nothing can send this one for 14 days after the release.
12. **Builds, one each, only on his explicit ask:**
    - Run `npx --yes eas-cli whoami` first.
    - Android: `npx --yes eas-cli build -p android --profile production --non-interactive` from `client/`.
    - iOS: `npx --yes eas-cli build -p ios --profile production` from `client/`.
    - Check whether App Store Connect API key `2J9KWDVNJ7` was replaced. If not, the iOS build needs his interactive Apple sign-in.
13. **Device QA:**
    - Android: the AAB goes to **Internal testing** first. It is the only track that lifts the review quota. Install from Play, never sideload.
    - iOS: TestFlight. Apple never shows the review card there.
    - Then promote at 100% on both. The 14-day earn window is the stage.
14. **Consoles.** Print every paste from the gated file and diff what was sent (the paste rule).
    - **ASC, on the 1.9.0 version:**
      1. Read Primary Language and the live keyword field. That picks the en-GB or en-AU second keyword set.
      2. Name and subtitle.
      3. Description, keywords and promo text.
      4. Add the localisations (German, French, Italian, Spanish (Mexico), Spanish (Spain), and the second English one), each with its own name, subtitle, keywords, description, promo text, What's New and privacy URL.
      5. Delete the ten old shots, then upload 01 to 06 in every size slot ASC marks.
      6. Confirm App Privacy already declares product interaction.
      7. Review notes: say the rating card uses StoreKit's API only.
    - **Play:**
      1. The en-AU title, short and full descriptions.
      2. The four translations' title and full-description fixes.
      3. The capture slide in each locale.
      4. Store settings, then Manage tags: up to five from Google's own list. To-do list, task management and planner types, never habit tracker.
      5. App content, Health apps: confirm the answer still fits, since the title names an audience, not a condition being treated.
      6. Release notes, one paste.
15. **After live:**
    - Bump `client/public/version.json` ios/android to 1.9.0 by hand, per store, then push.
    - Baseline Apple Search Ads keyword popularity and Play's search-term report.
    - REV spot check on the App Store build.
    - TEL-03 after about 3 weeks.

## Manual QA cases to add (`scripts/gen-test-suite.py`)

| ID | Pri | Platform | Case |
|---|---|---|---|
| A11Y-04 | P1 | Web | Tab to a row, then Shift+F10, the Menu key or right-click opens the card, and focus lands on the title |
| A11Y-05 | P1 | Web | Tab shows "Options for {title}" (the Mac path), and Enter opens the card |
| A11Y-06 | P1 | Web | Escape closes the card and focus returns to the row |
| A11Y-07 | P1 | iOS | VoiceOver rotor "Options" opens the card, and the two-finger escape gesture closes it |
| A11Y-08 | P1 | Android | TalkBack double-tap-and-hold and the Actions menu open the card, and system back closes it |
| A11Y-09 | P1 | Both | Holding a low row hides the pill, "Select more" is fully visible and tappable, and the pill returns on close |
| A11Y-10 | P1 | Web | "Add a task" is the first Tab stop, and no focused row parks under the pill |
| A11Y-11 | P2 | Both | Contrast spot check: light and dark, Dusk, Honey, one other Premium theme, Quiet, Today at night |
| A11Y-12 | P2 | Both | A screen reader reads the hold-hint tip, not only "Got it" |
| REV-01 | P1 | Android | On the internal track, after 5 closes over 16+ days (clock trick), the card appears about 1.2s after the rested screen |
| REV-02 | P1 | Both | Never asks on a Low, Settle, Lighten or re-entry day |
| REV-03 | P2 | Both | Once per version, with a 180-day gap; a reopened and re-closed day counts once |
| REV-04 | P1 | Web | Never asks, writes no review key, and no console warning |
| REV-05 | P2 | iOS | TestFlight shows no card and the rested screen stays intact |
| REV-06 | P2 | Both | Never stacks with a goodnight offer |
| LEG-06 | P2 | Both + Web | "Not medical care" shows the same words on /terms and in the app on all three |
| PRV-02 | P2 | Both + Web | Both privacy copies name the review counter |
| TEL-03 | P3 | Server | `review.asked.ios` and `.android` counters appear, with no other properties |

## Decisions that are Melroy's (with my pick)

| # | Decision | My pick | Blocks |
|---|---|---|---|
| 1 | Today's bare text goes darker in light mode, and Honey's accent text goes bronze | Yes to both, after the before/after look. Lightening the sky instead deletes the sky | Slices 3, 4, 7 |
| 2 | The pill steps aside while a card is held | Yes. It mirrors select mode and is one prop | Slice 2 |
| 3 | Keyboard-only Options button on web rows, and the web hold-hint copy | Yes. Pointer and touch users never see the button | Slice 2 |
| 4 | Review trigger and its gates | Rested screen after Goodnight. 5 closes over 14+ days, 180-day gap, once per version, zero words of ours, window 17:00 to 01:59 | Slice 1 |
| 5 | Send the `review.asked` counter (needs a Worker deploy and a privacy line) | Yes. Without it, "never asked" and "asked and ignored" look the same | Slice 1, step 11 |
| 6 | Name and subtitle | `DoubleDone: ADHD To-Do List` / `Calm planner, nothing overdue`. Same title on Play | Slice 8, step 14 |
| 7 | App Store localisations in this version | Yes, if the native read is back by submit day. Otherwise English only, and the rest at the next version (decided now) | Slice 8 |
| 8 | Terms "Not medical care", including the crisis sentence | Approve it with the crisis sentence. One humane line that adds no feature | Slice 6 |
| 9 | Add "For medical advice, talk to a health professional." | Yes, on both stores, in all languages | Slice 8 |
| 10 | Six slides: Settle in dark, Ours at 6, English only now | Yes. Settle the Ours placement with a Product Page Optimization test, not a guess | Slice 7 |
| 11 | Rollout | 100% on both stores | Step 13 |

## Where the scouts disagreed, resolved
- **Localisation:** the listing text is localised now, and the localised screenshots wait for the next version. ASC falls back to the English shots.
- **The a11y scout's Tier 2 sweep:** pulled into this build, behind a cut line, because native colour fixes only reach phones with a store build.
- **Release-notes Spanish:** one neutral text, replacing 1.8.0's two variants.
- **"Colleagues" and "in one go":** owned by slice 8, not the screenshot work.
- **Screenshots render after colour work,** which the screenshot scout did not sequence.

## Risks, pre-decided
- **Apple objects to "ADHD" in the name:** switch to `DoubleDone: Calm To-Do List` with the subtitle `For ADHD. Nothing overdue.` It is a metadata-only resubmit of the same build.
- **Play flags the title:** the same fallback title, and ADHD stays in the short description.
- **ASC refuses a screenshot size:** all three sizes are already rendered.
- **TEL-03 stays at 0 thirty days after the earliest possible ask:** read the gates before loosening anything.
- **The VoiceOver or TalkBack pass fails:** no copy anywhere says accessible, WCAG or screen-reader friendly (the gate bans those words), and the fix rides the next build.

## Parked, with triggers (Backlog)
- A Settings "Rate DoubleDone" store link. Trigger: ratings flat 60 days after the asks begin.
- The localised shot sets. Trigger: the next iOS version.
- The Product Page Optimization test on Ours placement. Trigger: 1.9.0 live for 30 days.
- The iPhone Duo layout. Trigger: the iOS 27.1 SDK.
- From the a11y Tier 3: K5 (Space toggles a row), Energy arrow keys, the floatNote overlay, C8 (the gold ✦).
- "executive function" as a hidden keyword.
- Renaming the in-app purchase products.
- Regenerating the full Play screenshot set.

**Skip forever:**
- a high-contrast mode
- a line of ours before the review card, or a Rate button that calls the API
- competitor names, habit or streak words, clinical words
- any trial wording on Play
- ratings or social proof
- iPad shots, and a preview video

## Effort
About 5 to 6 build days: slice 1 half a day, slice 2 a day, slice 3 half a day plus his look, slice 4 a day, slices 5 and 6 two hours, slice 7 half a day, slice 8 a day, slice 9 two hours. The native read and the device QA come on top.

## Next move
1. Start slices 1 and 2 now. Neither needs a taste call.
2. Get Melroy's yes on decisions 4, 6 and 8, and render the Dusk/Honey before/after for decision 1.


## Melroy's calls (2026-10-19)
- Decision 4, the review ask: **after Close the day**, with the gates as planned (5 closes over 14+ days, 180-day gap, once per version, never on a Low, Settle, Lighten or re-entry day, window 17:00 to 01:59, no words of ours before the card).
- Decision 5, the `review.asked` counter: **yes** (privacy line in both copies, Worker deploy later).
- Decision 6, the name: **`DoubleDone: ADHD To-Do List`**, subtitle **`Calm planner, nothing overdue`**, the same title on Play; the pre-decided fallback stands.
- Decision 8, the Terms "Not medical care" section: **approved as drafted, crisis line included**. Decision 9, "For medical advice, talk to a health professional." on both stores: **yes**.
- Decision 7, App Store localisations: **yes if the native read is back by submit day**, else English only this version.
- Decisions 2, 3, 10, 11: my picks stand (pill steps aside, keyboard-only Options button, six slides with Settle in dark, English shots, 100% rollout).
- Decision 1, the colour change: **pending Melroy's look at a before/after render.**
