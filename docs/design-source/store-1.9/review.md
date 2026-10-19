## Item #5: in-app review prompt, design (read-only, nothing changed)

**Verdict.** Ask once, at the end of a good day. The trigger is the Goodnight press that lands the rested screen. It only fires when the day was earned and calm, it uses the system card and nothing else (zero words of ours), and it never runs on the web. The research also turned up two traps and one correction to an earlier plan, set out below.

---

### 1. What the platforms allow (checked against the package source, not only the docs)

**expo-store-review for SDK 56 is `~56.0.3`** (`node_modules/expo/bundledNativeModules.json:87`). It is not installed yet. Install with `npx expo install expo-store-review` from `client/`.

| | iOS | Android | Web |
|---|---|---|---|
| `isAvailableAsync()` | `!isRunningFromTestFlight()` (sandbox receipt and no embedded provision). **False in TestFlight** | **"Play Store package installed"** (the docs say "Android 5+", but the Kotlin checks `getPackageInfo(GOOGLE_PLAY_STORE_PACKAGE)`) | false (the native module is `{}`) |
| `requestReview()` | `AppStore.requestReview(in: scene)`. Throws `MissingCurrentWindowSceneException` when no scene is in the foreground | `requestReviewFlow` then `launchReviewFlow`. Resolves whether or not a card showed | falls back to `storeUrl()`, which is null on web, so it does a `console.warn` |
| Shown or rated? | never reported | never reported | n/a |

- **Trap 1, the store-URL fallback.** `hasAction()` is true whenever app.json has `ios.appStoreUrl` or `android.playStoreUrl`, and `requestReview()` will `Linking.openURL` the store if the native function is missing. app.json has neither key today (checked). **Do not add them, and never use `hasAction()`.** Gate only on `isAvailableAsync()`.
- **Trap 2, an import-time crash.** `build/ExpoStoreReview.native.js` calls `requireNativeModule('ExpoStoreReview')`, which **throws at import** on a binary that lacks the module (an old dev client, or any future slip). Today imports it, so that would crash Today on launch, the same shape as the Hermes `Intl` gotcha. Fix: import it lazily inside try/catch (`await import('expo-store-review')`).
- **Apple's rules:**
  - 3 prompts per user per 365 days. Apple decides whether to show one and never says if it did.
  - 5.6.1: "Use the provided API… we will disallow custom review prompts."
  - 3.2.2(x): never force a review.
  - Section 3 and 5.6.3: no "paid, incentivized, filtered, or fake feedback".
- **Google's rules:**
  - The quota is undisclosed. A second call within about a month may show nothing.
  - Ask nothing before or during the card, including "Do you like the app?".
  - **No "Rate us" button that calls the API.** When the quota is hit it does nothing, so the button looks broken.
  - Show the card unaltered, on the top layer, with no overlays.
- **Google testing rules:**
  - Only the **internal test track** turns the quota off.
  - The tester account must have installed the app from Play and must not already have reviewed it.
  - Internal app sharing cannot submit a review.
  - Sideloaded builds do not work. That matters here because our sideload and Play signing gotcha rules sideloading out anyway.

### 2. A correction to an earlier plan

`docs/growth-plan.md:34-39` (2026-08-03) planned a house-voice line before the sheet: "If DoubleDone is helping, a review helps others like you find it", with "dismiss is forever" and "all four locales".

- That line is a custom pre-prompt. Apple 5.6.1 disallows them and Google bans anything said before the card.
- "If it's helping" is soft sentiment filtering, which is the "filtered" wording in Apple's Section 3.
- "Dismiss is forever" can't be built, because neither store tells us about a dismiss.

**Recommendation: no copy at all.** The OS localises the card. That means no catalogue keys in five locales, no neutral-Spanish risk, no founder line, and no Android price-figure risk. Correct the growth-plan line in the same commit.

### 3. Where to ask: candidates ranked

| Rank | Moment | Verdict |
|---|---|---|
| **1 (pick)** | **Rested screen, about 1.2s after Goodnight** (`app/today.tsx:4223-4238`) | A terminal, natural pause: the core loop is done, nothing is in progress, and both stores recommend asking after a meaningful finish. It is reached by the most engaged, calm-loop users. The "one ask per goodnight" rule in `lib/offers.ts:9-13` is kept by requiring `restedOffer()` to be null |
| 2 | Keepsake made (Calendar scrapbook) | A real earned moment, but AI-only (AI-off users never reach it) and rare. Right after it the user wants to look at it or share it, so the review card would collide with the share sheet. Runner-up, rejected |
| 3 | Calendar (Lookback) visit | It is "the emotional payoff, never a stats page" (`app/lookback.tsx:30-31`), and since the rename it is also a planner (adding to future days), so a visit is often mid-task. Asking on arrival interrupts browsing, and asking on Back is just a navigation event |
| 4 | Dreaded-task Bloom | The emotional peak, but it lands mid-day and mid-flow, and a system card over the held Bloom breaks Google's "no overlays, topmost" rule. It also turns recognition into a toll ("you did the thing, now rate us"), which is exactly where rejection sensitivity bites. **Reject hard** |
| 5 | Morning open or What's New | `lib/whats-new.ts:1-5` already forbids launch popups because they steal the capture moment. Skip |

### 4. The trigger and its gates

**Tier 1 (must), every one has to hold:**
1. **Native only.** `REVIEW_SUPPORTED` is `true` in `lib/store-review.ts` and `false` in `lib/store-review.web.ts`. The web writes nothing and imports nothing.
2. **Earned.** At least **5 distinct days closed**, and the **first counted close at least 14 days ago**. The count is never shown, never needs to be consecutive and never resets, so it is not a streak. It starts at 0 on this build for everyone, which is conservative: loyal users wait about two weeks after they update.
3. **Something was finished tonight.** `todayDone.length + (Goodnight note ? 1 : 0) >= 1`.
4. **Not a tender day.**
   - Today's energy is not Low.
   - The tender-day key does not hold today's date. Four writers set it: Settle opened, Lighten/Strategise run, the Low pill chosen, and a re-entry after 4+ days away.
5. **Nothing else is asked tonight.** The same `restedOffer(...)` answer the screen renders is `null`.
6. **Caps.**
   - Never twice on the same app version.
   - At least **180 days** since the last ask, so at most two a year, under Apple's three.
   - An `askedAt` in the future (the clock went backwards) means no.
7. **Still the moment.** Re-checked when the 1.2s timer fires:
   - `AppState` is `active`.
   - The stored closed date is still tonight (the day was not reopened).
   - Today is still focused (the timer is cleared on blur and on reopen).
   - `isAvailableAsync()` is true.
8. **Stamp before the call**, so a throw can never become a retry loop. "Unavailable" (TestFlight, no Play Store) is **not** stamped, so a TestFlight device keeps its ask for the App Store build.

**Tier 2 (should):**
9. **Not a heavy day at close:** `dayIsHeavy` (`today.tsx:1143`) is false.
10. **Evening window:** Goodnight pressed between 17:00 and 23:59, which keeps the 3am bad-night close out.
11. **A beacon count**, described in section 6.
12. **Hoist one `tonightOffer` const.** The review then reads exactly what the screen renders, with no drift between four inline calls.

**Tier 3 (defer to Backlog):** a Settings "Rate DoubleDone" link that opens the store listing (`STORE_URLS` in `lib/updates.ts:105-108`, plus `?action=write-review` on iOS), **never the API**. Pick it up if ratings stay flat 60 days after the asks begin.

**Tier 4 (skip, forever):**
- any line of our own before the card
- a Rate-us button that calls the API
- asking after a Bloom, a keepsake or a purchase
- suppressing the ask for people who sent feedback (that *is* sentiment gating)
- any visible count
- anything on the web

**Why the calm-moment gating is not "review gating":** we never ask the user's opinion. Timing the ask by behaviour, at a natural pause and never during a hard task, is exactly what both stores recommend. Not interrupting a Low day is decency, not filtering.

Pure gate, the load-bearing shape:
```ts
// client/src/lib/review.ts (no RN imports, vitest-able)
export const REVIEW_MIN_CLOSED_DAYS = 5, REVIEW_MIN_SPAN_DAYS = 14, REVIEW_GAP_DAYS = 180, REVIEW_DELAY_MS = 1200;
export type ReviewMemory = { closedDays: number; firstCloseISO: string | null; lastCountedISO: string | null; askedAt: number | null; askedVersion: string | null };
export function countClose(m: ReviewMemory, iso: string): ReviewMemory  // idempotent per ISO (reopen + re-close counts once)
export function markAsked(m: ReviewMemory, now: number, version: string): ReviewMemory
export function parseReviewMemory(raw: string | null): ReviewMemory     // corrupt -> fresh defaults
export function shouldAskForReview(x: { supported: boolean; memory: ReviewMemory; todayISO: string; hour: number;
  finishedTonight: number; energy: DayEnergy; heavy: boolean; tenderISO: string | null; otherOffer: RestedOffer;
  version: string; now: number }): boolean
```

### 5. State

- **`doubledone.review.v1`** holds the `ReviewMemory` JSON.
- **`doubledone.reviewquiet.v1`** holds an ISO date: "the review prompt keeps quiet today". It is a single-string write, so Settle and Today cannot race, and it self-expires by comparison, the same pattern as `LOWDAY_KEY`.
- **Both stay out of `wipeLocalData`** (`lib/storage.ts:794-803`). Same reasoning as `UPDATE_MENTIONED_KEY` (`:660-666`): they are device state, not personal data, and clearing them would re-arm an ask.

### 6. Telemetry

- **Local only:** `review.unavailable` and `review.failed`.
- **Beacon (Tier 2, recommended):** `review.asked` with `{store}`, folded server-side into **`review.asked.ios` / `review.asked.android`**, the same fold pattern as `settle.guide.on/off`. It counts our asks, not shown cards and not ratings, because neither is knowable.
- **Why it is worth it:** a gate this strict can silently never fire, and App Store Connect or Play Console can't tell "never asked" apart from "asked and ignored". This count is the only way to know the gate ever opens.
- **Deploy order is safe.** An older Worker drops unknown names with a 200, so the client can ship first.
- **What else must change:**
  - The Worker deploy needs Melroy's per-instance OK.
  - Both privacy copies must name it in the same commit as the client. Suggested line: "whether the app asked your app store to show its own rating card (the store decides whether it appears, and we never learn whether you rated or what you wrote)".
  - Play Data safety: no new category (it is already App interactions → Analytics, `docs/play-store-submission-pack.md:127`).
  - `__DEV__` already keeps dev sessions out of the count, but asks from the internal test track will be counted.

### 7. Code touch points

**New files:**
- `client/src/lib/review.ts`, the pure gate above.
- `client/src/lib/review.test.ts`.
- `client/src/lib/store-review.ts`: `REVIEW_SUPPORTED = true`, `storeReviewAvailable()`, `requestStoreReview()`. Both functions lazy-import `expo-store-review` inside try/catch and return false on any throw.
- `client/src/lib/store-review.web.ts`: `REVIEW_SUPPORTED = false` and the same two functions resolving false. No import of the package.

**Edits:**
- **`client/package.json`:** add `"expo-store-review": "~56.0.3"` via `expo install`. Root lockfile changes too.
- **`client/src/lib/platform-split.contract.ts`:**
  - `:16-21` import the `store-review` / `store-review.web` pair inside the existing eslint-disable block.
  - `:30-37` add `StoreReviewWebKeys` and `StoreReviewWebTypes` `Holds<...>` lines.
- **`client/src/lib/storage.ts`:**
  - Add the two keys after `:46`.
  - Add `loadReviewMemory`/`saveReviewMemory` and `loadReviewQuietDate`/`saveReviewQuietDate` beside `:668-684`.
- **`client/src/app/today.tsx`:**
  - `:64` / `:78`: imports (review, store-review, the new storage functions). `Platform` and `AppState` are already imported at `:3`.
  - `:322`: add a `reviewTimer` ref next to `reentry`, plus an unmount-cleanup effect.
  - `:683-686`: in the re-entry branch, `void saveReviewQuietDate(toISODate(today))`.
  - `:689-691`: the focus cleanup clears `reviewTimer`.
  - About `:1059`: hoist `const tonightOffer = restedOffer({...})`, then replace the four inline calls at `:3159`, `:3172`, `:3196`, `:3209`.
  - `:1797-1801`: add `maybeAskForReview(finished)` beside `reopenDay`. `reopenDay` also clears the timer.
  - `:1818-1822`: in `setEnergy`'s low branch, write the tender date.
  - `:1952-1955`: at the top of `runStrategise` (Lighten), write the tender date.
  - `:4237`: after `dayClosed(reduced)`, `void maybeAskForReview(todayDone.length + (note ? 1 : 0))`.
- **`client/src/app/settle.tsx:39` and `:106`:** import, then `void saveReviewQuietDate(toISODate(new Date()))` beside `track('settle.opened')`.
- **Telemetry, client:** `client/src/lib/telemetry.ts:23-50` (`BEACON_EVENTS`) and `:55-60` (`BEACON_PROPS['review.asked'] = ['store']`). Update the exact-list test in `client/src/lib/telemetry.test.ts:78-101`.
- **Telemetry, server:** `server/src/events.ts:20-60` (`APP_EVENTS` gets the two names) and `:65-85` (the fold in `parseAppEvent`). Add cases to `server/src/events.test.ts`.
- **Privacy:**
  - `client/src/app/privacy.tsx:25` (date) and `:96-113`.
  - `client/public/privacy.html:59` (date) and `:129-140`.
- **Manual suite:** add the REV cases (section 9) to `scripts/gen-test-suite.py` `CASES`, then regenerate.
- **Docs:**
  - A `decision-log.md` entry (feat), with what was decided against: the pre-prompt line, the Rate button, the Bloom, Calendar and keepsake triggers, sentiment gating, and install-time as the clock.
  - The Tier 3 Settings link goes in the `BUILD-PLAN.md` Backlog.
  - The correction in `docs/growth-plan.md:34-39`.

### 8. Native dependency impact

- **No config plugin.** `expo-module.config.json` only lists modules, and the Android manifest is empty.
- **No `app.json` change.** No permissions, Info.plist keys or entitlements.
- **iOS:**
  - Adds the `ExpoStoreReview` pod (StoreKit, which `react-native-purchases` already links).
  - Its iOS 16.4 floor matches SDK 56.
  - No privacy-manifest reasons needed. The receipt URL is not a required-reason API.
- **Android:**
  - Adds `com.google.android.play:review:2.0.1`, `review-ktx:2.0.0` and `play-services-base:17.3.0` as `api`.
  - Gradle resolves that last one up to the newer version that `firebase-messaging:25.0.1` (from expo-notifications) already pulls in.
  - No new permissions. No new Data-safety category expected, but confirm against Google's SDK Index.
- **Needs a new native build: YES, both stores.** There is no `expo-updates`, so JS and binary always ship together on native. The web gets the JS on push to main, but only ever resolves the `.web.ts` stub.

### 9. Test plan

1. **CI (vitest), `review.test.ts`:**
   - every gate, one test each
   - `countClose` is idempotent for the same ISO
   - `firstCloseISO` is set once
   - corrupt JSON gives defaults
   - same version means no
   - a new version under 180 days means no
   - a new version and 180+ days means yes
   - an `askedAt` in the future means no
   - unsupported means no
   - an `otherOffer` present means no
   - tender date equal to today means no

   Also the telemetry beacon strips everything except `store`, and the server folds and rejects a bad `store`.
2. **Typecheck:** the new contract pair fails if `store-review.web.ts` drifts from the base file.
3. **Web:**
   - After an export, `grep -l "StoreReview" client/dist/_expo/static/js/web/*.js` returns nothing.
   - After Goodnight, localStorage has no `doubledone.review.v1` and the console has no expo-store-review warning.
4. **Android, the real proof:**
   - Use the batch's one production AAB on the **internal** testing track (closed testing still enforces the quota).
   - Install from Play, on a tester account with **no existing review**, **signed out** of sync (the clock moves).
   - Clock trick: finish a task, Goodnight, move the device date forward 4 days, and repeat until there are 5 closes spanning 16 days or more.
   - On the 5th close, Play's card should appear about 1.2s after the rested screen.
   - Then check: reopen and re-close gives no card, a Low-day close gives no card, and a Settle-day close gives no card.
   - Afterwards reset the clock and clear app storage (the stamp now sits in the future).
5. **iOS:**
   - On TestFlight, Apple never shows the card, by design. Run the clock trick only to prove nothing crashes and the rested screen stays intact.
   - The real card can only be seen on the App Store build (there is no Mac for a dev build). Do a post-release spot check, accepting that Apple may still decline: the 3-per-year cap, its own discretion, and the user's Settings toggle for In-App Ratings & Reviews.
   - **No extra EAS build is needed for any of this.**
6. **Manual suite, new `REV-` cases:**

   | Case | Priority | Platform | What it checks |
   |---|---|---|---|
   | REV-01 | P1 | Android | the earned card appears on the rested screen |
   | REV-02 | P1 | Both | it never fires on a Low, Settle, Lighten or re-entry day |
   | REV-03 | P2 | Both | it fires once per version |
   | REV-04 | P1 | Web | the web never asks |
   | REV-05 | P2 | iOS | TestFlight shows nothing and nothing breaks |
   | REV-06 | P2 | Both | it never stacks with a goodnight offer |

Sources: [Expo StoreReview SDK 56](https://docs.expo.dev/versions/v56.0.0/sdk/storereview/), package source at [unpkg expo-store-review@56.0.3](https://unpkg.com/expo-store-review@56.0.3/src/StoreReview.ts), [Play In-App Review](https://developer.android.com/guide/playcore/in-app-review), [Play testing](https://developer.android.com/guide/playcore/in-app-review/test), [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/). The 3-per-365 limit is from the HIG as quoted in [Apple forums 81703](https://developer.apple.com/forums/thread/81703) and [avanderlee](https://www.avanderlee.com/swift/skstorereviewcontroller-app-ratings/), because Apple's own page would not load.