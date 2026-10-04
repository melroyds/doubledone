# Changelog

All notable changes to this project are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) ·
versioning: [SemVer](https://semver.org/).

> Add an entry under `[Unreleased]` with every feature/fix. On release, move them
> into a dated, versioned section.
>
> Each numbered heading's date is the day that version went to the stores (for 1.2.0, the day its
> number was set, because nothing records more). The 1.0.0 entries are dated by the day each wave
> shipped. The line under each heading says when it reached the web, the App Store and Google Play,
> where that is recorded. Paste-ready store notes for 1.5.1 onwards live in
> [`docs/release-notes/`](docs/release-notes/), and the reasoning behind every change is in
> [`decision-log.md`](decision-log.md). The web at doubledone.app runs `main`, so it usually carries a
> change days before the stores do.

## [Unreleased]

_Nothing yet. 1.8.0 is with the stores._

## [1.8.0] - 2026-10-05

_With the stores: iOS build 41 at App Review, and Android versionCode 35 in closed testing on its way to
Production. The web has carried it since 2026-10-04 (`17cc806`), with the two TestFlight fixes added on
2026-10-05 (`2e31722`, `13348bb`). Store notes: [`docs/release-notes/1.8.0.md`](docs/release-notes/1.8.0.md)._

### Added
- **Where you left off**: one free line per task, for the version of you who comes back to it ("Called them,
  ring back Thursday"). It is shown with the calendar day it was written, never "3 days ago". One line of up
  to 280 characters, overwritten rather than added to (a pasted line break becomes a space). Write it on the
  held card, where the empty line now waits under the title so it can be found, or in Focus. A small
  folded-corner mark on the Today row says a task has one. A broken-down task's line shows, read only, on
  each of its steps in Focus. One-off tasks only, including steps, tiny steps and your "· Ours" copy of a
  shared row. A repeating task keeps any line it had, hidden. Combine keeps the most recently written line,
  and a tiny step's line moves onto its real task when that task comes back.
  ([`client/src/lib/leftoff.ts`](client/src/lib/leftoff.ts), `setLeftOff` in
  [`client/src/lib/today.ts`](client/src/lib/today.ts))
- The line syncs with your own account (the new `left_off` column in
  [`supabase/tasks-left-off.sql`](supabase/tasks-left-off.sql)) and is in the data export. It is never sent to
  an AI feature, the REST API, the MCP server or a shared list.

### Changed
- **The telemetry review.** Every `track()` call was checked against the privacy policy. Feature-usage
  counts are now one counter per feature per day (`app_event_counts`) instead of a row per event, so nothing
  about the order of events survives. Only the details the policy names leave the device. New bare counts:
  "+ I also did that" (only until its keep-or-remove verdict), held cards opened (the denominator for More),
  which of the Menu's two Settings doors was used, and the three Where you left off actions, never a word of
  the line itself. Both privacy pages name every count.
  ([`client/src/lib/telemetry.ts`](client/src/lib/telemetry.ts), [`server/src/events.ts`](server/src/events.ts),
  [`server/d1/schema.sql`](server/d1/schema.sql))

### Fixed
- **Every way of finishing walks up.** Only the row tick used to finish a broken-down task, so a last step
  finished in Focus, in bulk, or as the last part of a stepped task could leave the big task hidden for good,
  never done and never in the Calendar. Every finish now goes the same way: it walks up to the big task
  (finishing it, with its bloom, when two or more steps are all done, or bringing it back to Today when it
  had only one), closes the shared row behind a "· Ours" copy, and reports the step's outcome. Bulk Done
  cancels reminders like every other finish.
- **Stuck big tasks are repaired** on open, on resume and after a sync. Two or more steps, all done, finish
  it, dated to the last step. A single finished step, or no steps left, brings it back to Today. A repair
  never overrides a newer edit made on another device.
- **A tiny step brings its real task back on every device.** Make it tiny's link to the real task used to be
  wiped on the second sync, so ticking the tiny step could complete the real task instead of bringing it
  back. The link now syncs (the `open_parent`, `parent_title` and `combined_from` columns), and sync keeps
  every field the server has no column for.
- **Combine never loses a task**: combining a tiny step brings its real task back beside the new one, never
  deletes it.
- **Sync reads the whole list.** One unpaged read was clipped at the server's row limit, so a long list could
  arrive partly on a new device. The pull is now paged. A rounding slip in the clock correction, which
  re-sent some rows on every sync, is fixed too.
- **Keyboard and alignment**, from the first TestFlight pass: in the phone apps, opening a task low on Today
  now scrolls its line field above the keyboard, and the folded-corner mark sits beside the first line of
  words instead of a few pixels high.
- Nothing typed on the held card is lost when you tap away, and an edit saved as you tap an action is no
  longer overwritten by that action.
- **Server, live since 2026-10-04: three RevenueCat guards.** An older event can no longer switch off a
  renewal that already landed, a late refund on an old subscription can no longer switch off a new one, and
  RevenueCat's HMAC signature is checked on top of the shared secret once `RC_WEBHOOK_HMAC` is set.
  ([`server/src/revenuecat.ts`](server/src/revenuecat.ts), [`server/src/entitlements.ts`](server/src/entitlements.ts))

## [1.7.0] - 2026-10-03

_Live on Google Play on 2026-10-03 (versionCode 33, at 100%) and on the App Store on 2026-10-04. The Menu
doors reached `main` on 2026-09-30, the web carried them with the server and web half of Path A from
2026-10-01 (`eb40ff1`), and the Android paywall code joined `main` on 2026-10-03 (`0d288f9`). Store notes:
[`docs/release-notes/1.7.0.md`](docs/release-notes/1.7.0.md)._

### Added
- **Premium on Android, through Google Play** (Path A). Google Play Billing via RevenueCat, with the monthly
  and annual plans priced by the store in the buyer's own currency and managed or cancelled in the Play
  Store. Buying on Android needs a signed-in account, so a purchase always belongs to someone. The Android
  app still never shows Stripe, a price of ours, or a way to buy anywhere else, and the daily loop stays free.
  ([`client/src/lib/storefront.android.ts`](client/src/lib/storefront.android.ts),
  [`client/src/lib/purchases.android.ts`](client/src/lib/purchases.android.ts))
- **The Menu's missing doors**, because a real user could not find Settings: a Settings sign (a gear and the
  word) at the top of the Menu, and a shelf after the last room with Settings and Premium, each with a line
  saying what is inside.

### Changed
- The web knows a Google Play subscriber: Manage opens the store that sold the subscription where it can, and
  names it plainly everywhere else (`manageRoute` in [`client/src/lib/premium-ui.ts`](client/src/lib/premium-ui.ts)).
  Before this, a Play subscriber on the web would have been sent to Stripe's portal, which knew nothing of them.
- The shared list's tab now sits exactly where Today does, under the same living sky.
- The Menu pill's spoken label names every destination in page order, a double tap on it no longer lands on
  Settings, and long German words break at their soft hyphens on Android without a screen reader speaking them.

### Fixed
- **Clearer, more honest purchase messages on iPhone.** A purchase that cannot finish says plainly what
  happened, never claims nothing was charged when the app cannot know, and no purchase starts while the app
  cannot check your account. VoiceOver reads the App Store's own price for each plan.
- **Server, Path A's money rules.** One store can never switch off another store's live Premium. A failed card
  is past due, with Premium still on, rather than expired. Deleting an account also turns off a Google Play
  renewal through RevenueCat (a cancel, never a refund or revoke). Checkout refuses someone already subscribed
  through Apple or Google. `/entitlement` answers 503 instead of a false "free" when it cannot read. The
  sign-in reconcile only fills in a missing purchase and never restates a live one, which had been hiding the
  "fix your payment" note from a subscriber in a grace period.

## [1.6.0] - 2026-09-27

_Today v3 on all three surfaces: the web from `e8180bd` and `f720171` (2026-09-27), and both stores confirmed
live on 2026-09-29 (Android versionCode 31). Store notes: [`docs/release-notes/1.6.0.md`](docs/release-notes/1.6.0.md)._

### Added
- **Today v3**: the Today and Ours tab heading, Right now under Energy, the Menu as "The rest of the house", every room walked into the same way, Chart a course refreshed, and Settings in five cards.
- **Capture is a floating +**: a pill at the foot of Today and Ours that raises a panel from the bottom; the keyboard waits until you tap the box, and words left in it show as "+ ···".
- **Repeating is a room**, grouped Every day, Each week, Every few days and Each month; Routines start empty, with one suggestion inside each form.
- **Tuck** (a Settings choice and a welcome step): a finished task can fold into a "Done today" line.

### Changed
- **The Quiet interface is free for everyone**, on every platform (2026-09-27). The Settings row loses its Premium tag and gate, and Quiet leaves the paywall's feature list, the "You're Premium" panel and the welcome's Premium screen, in all five languages. For this audience a calmer, less cluttered screen is an access need, the same reason theme, text size and motion are free. The colour themes beyond Dusk stay Premium.
- **The Android app sells nothing** (Path C, Google Play's Payments and Subscriptions policies): no price, purchase control or Stripe link on Android. Premium bought on the web or an iPhone works there after sign-in, and the card-free month stays. Replaced by Path A in 1.7.0.

### Fixed
- An account whose Premium or trial ended while it was on Quiet can switch back to Standard. The old gate bounced every tap to the paywall, Standard included, so the only ways out were to subscribe again or wipe the app's data, and on Android, whose Premium page sells nothing, there was no way out at all.
- **Deleting an account stops Stripe billing first** (`POST /account/close-billing`): nothing is deleted unless billing is confirmed stopped, and Apple subscribers are told to cancel in their iPhone's settings first.
- Android Chrome no longer slides its address bar off a strip of bare page under the app; iPhone Safari's floating address label no longer covers When and Add.
- One done sign (an accent tick, no strike-through), Quiet's Energy as words, and no flash of the default Ours name in other languages.

## [1.5.1] - 2026-09-25

_Live on the App Store on 2026-09-27. Google Play rejected the Android 1.5.1 build (a fixed A$ price shown to a
reviewer abroad), so Android went from 1.5.0 to 1.6.0. The web carried these changes between 2026-09-20 and
2026-09-25. Store notes: [`docs/release-notes/1.5.1.md`](docs/release-notes/1.5.1.md)._

### Added
- **Sharing text into DoubleDone on iPhone.** The share extension only ever accepted links, so a text
  selection from Notes or Safari never listed the app. It now accepts text as well
  (`iosActivationRules` in [`client/app.json`](client/app.json)).

### Changed
- **Ours, made clearer**, from a couple's field report: the sign-in field says it wants your own email, the
  two code fields point at each other, the waiting screen says it is waiting and offers "Get a new code", the
  signed-out Menu row goes straight to Ours, and the shared list shows when your person has not joined yet.
- **Reopening a closed shared list**: its own screen can now take the other person's reopen code as well as
  make one, and the pairing screen refreshes itself while a code is out.
- The AI agent access hint in Settings says what a connection can do.

### Fixed
- **The flow audit's 22 fixes.** Remove on the held card has an Undo, for one task or several. A repeat follows
  its picked start date. Premium says which feature sent you there, and Plan my day wears the Premium mark.
  Focus opens straight on a single task. The big mark stays visible while you select several. Toggles, ticks
  and chips read properly to screen readers on the web. Plus small wording, spacing and plural fixes, in all
  five languages.
- Select mode lays each row out on one line again.

### Security
- **Server, 2026-09-25: the bearer is verified before money, AI spend and both public surfaces.** A token is
  now checked against Supabase's signing keys before checkout, the billing portal, `/entitlement`, the REST
  API and the MCP tools answer, so a forged token gets a 401 instead of reaching a billing portal or the AI
  ([`server/src/verify.ts`](server/src/verify.ts)). In the same pass, a repeating task completed through the
  REST API or MCP is ticked for one day and never closed. OpenAPI 1.2.3.

## [1.5.0] - 2026-08-30

_Live on Google Play on 2026-08-30 and on the App Store on 2026-08-31. The web and the Worker went out on
2026-08-30._

### Added
- **Hold me to it** (iPhone and Android): ask the app to keep at one task, kindly. It knocks 30, 90, 180 and
  360 minutes after you hold it, then once a day at 09:30, until you tick it or tap "Let it go". Nothing fires
  between 21:30 and 08:30. One task at a time, a fixed ladder that is never randomised, and the same calm
  words every time. The held row carries the contract inside its own border: "I'm holding this one", with
  Let it go at the edge. ([`client/src/lib/hold.ts`](client/src/lib/hold.ts))
- Focus opens on the held task when nothing is pinned.
- The feature-usage beacon gains Hold me to it (started, finished or let go, with how far along the ladder
  kept only as one of three rough stages) and the held card's actions, plus how often its More fold opens.
  Names only, never a task's words.

### Changed
- **The held card's More fold is four rows** in a fixed order: Share to Ours, Remind me, Hold me to it, and
  Pin last (now a pin, no longer a star). Steps moved to Break it down's own door, "Count it in parts
  instead", which also sits on the questions page, so nobody has to spend an AI call to reach it. A task's
  "2 / 5" count opens the steps editor directly.
- The held task's row floats to the top, just under a pinned task, with its own fine border. The door into
  bulk actions is renamed "Select several" (it was "Select more", which read like the card's More).

## [1.4.0] - 2026-08-22

_The billing-integrity and monthly-repeat release. Its changes reached `main` between 2026-08-17 and
2026-08-22. Apple approved it on 2026-08-23, and it was live on both stores by 2026-08-30._

### Added
- **Monthly repeats**: a day of the month, 1 to 31, where a month too short uses its last day and is never
  skipped. The same engine serves the app, the REST API and MCP (OpenAPI 1.2.0).
  ([`client/src/lib/recurrence.ts`](client/src/lib/recurrence.ts), [`server/src/cadence.ts`](server/src/cadence.ts))
- **The annual renewal notice**: one task, once, a week before an annual subscription renews ("Your DoubleDone
  year renews on {date}. Nothing to do."). It is the only task the app ever writes that nobody typed.
- **Ours can be found before you have an account.** The account door reads "Sync and sharing" instead of
  "Sync across devices", the signed-out Menu shows the Ours row and its one requirement, and the invite field
  formats the code as you type. All three came from the first real user report.

### Fixed
- **A purchase made on an iPhone while signed out is attached to your account when you sign in**
  (`POST /apple/reconcile`), so it shows on every device. Until now that subscriber existed nowhere in our
  data.
- Such a subscriber also gets the weekly keepsake allowance their time as a subscriber has earned. They were
  getting one a week whatever their tenure.
- On iPhone, the free month no longer sits under the buy button.
- Server: test (sandbox) purchases no longer write the production entitlements, and every RevenueCat delivery
  is logged, including the ones that change nothing.

## [1.3.1] - 2026-08-16

_Live on both stores by 2026-08-17. A patch on purpose: it completes the shared list rather than adding to it,
and a patch keeps the update nudge quiet._

### Added
- **A shared row's When can be changed and cleared**: its day or its rhythm, with Anytime one tap away.

### Fixed
- Ending a shared rhythm no longer marks the row done for both people.
- A finished shared row with a day now leaves both Todays, as a personal one does.
- A finished repeat on the shared list keeps its card, and one date shows one chip.

## [1.3.0] - 2026-08-13

_The release that carries Ours. Android rolled out to production in stages (20% by 2026-08-16). Ours reached
the web when its branch merged into `main` on 2026-08-16, the same day 1.3.1 was cut._

### Added
- **Ours, one list shared by exactly two people**, open to every signed-in user. One person makes a
  six-character code tied to the other's email and reads it to them, and it lasts a day. A tick records a
  time, never a person, and nothing on the list says who did what. A row with no day stays on the list. A row
  with a day or a rhythm comes onto both Todays by itself, and "Take this on today" brings any row onto
  yours. Rows can repeat, several can be ticked together, and Scan works in the shared capture (Premium). A
  closed list stays readable, a removed row waits seven days, reopening takes both people, and "Report this
  list" reaches us without the other person being told. A welcome step and a What's New card introduce it.
  ([`client/src/app/ours.tsx`](client/src/app/ours.tsx), [`client/src/app/ours-list.tsx`](client/src/app/ours-list.tsx),
  [`supabase/ours.sql`](supabase/ours.sql))
- **Check for updates** on all three platforms, offered as a fact and never a demand. The web reloads, and
  the phone apps open their store page. Outside Settings it is mentioned only for a large enough gap, and at
  most once a fortnight. ([`client/src/lib/updates.ts`](client/src/lib/updates.ts),
  [`client/public/version.json`](client/public/version.json))

### Fixed
- Two devices on one account could mint the same task id in the same millisecond, so one task silently
  overwrote the other on sync. Ids now carry a random tail.
- Only the one database error that really means "this account was deleted" wipes a device. Any other error
  keeps the data.
- Timestamps are corrected against the server's clock, so an edit made on a device whose clock runs slow no
  longer loses to the copy it replaced and seems to undo itself.

## [1.2.0] - 2026-08-08

_Five languages and two redesigns. On the web first. The store dates for this version are not recorded here._

### Added
- **German, the fifth language**, as a draft pending native review, beside English, Italian, Spanish and French.
- **Move up and Move down on the held card**, free for everyone. Until now only Premium's Pin gave any control
  over the order.

### Changed
- **The held card, version 2**: four kinds of control instead of eleven equal rows, with Move up and Move down
  as one rail.
- **The select shelf**: select mode's bar becomes a card in the same family, and it never changes height while
  you select.
- Italian, Spanish and French reworded wherever they read as non-native (110, 94 and 107 strings).
- **The keepsake draws your week.** The scrapbook's scene is now written by Claude Haiku, one recognisable
  object per finished task, with Workers AI kept as the fallback. The picture is still made on Workers AI.

## [1.1.0] - 2026-08-01

_The Settle release. Live on the web on 2026-08-01, with Android (versionCode 22) rolling to Google Play
production and iOS (build 16) going to App Review the same day._

### Added
- **Settle, the breathing room**: a slow breath (four seconds in, a short hold, six and a half out) with an
  optional guide and, on phones, a breath you can feel. No title, no timer, no stats. Never gated and never
  opened for you. ([`client/src/app/settle.tsx`](client/src/app/settle.tsx))
- **What's New**, one dismissible card at the top of Today, never a pop-up, and never shown to a fresh install.
- **The feature-usage beacon**, on strict terms: only allowlisted feature names, never task text, and only the
  day is stored, never a time. Settle's opens and its guide were the first counts.
- The official App Store and Google Play badges on the doubledone.app landing page.
- The Analytics Centre, a token-gated page for the owner over aggregates the Worker already holds
  ([`server/src/analytics.ts`](server/src/analytics.ts)).

### Fixed
- A trial member can choose Monthly or Annual when going Premium. The trial panel only offered monthly.
- doubledone.app sends an HSTS header.

> The app's version stayed 1.0.0 from the web launch in June until 2026-08-01, so the three waves that shipped
> in that time are listed below as dated 1.0.0 updates. Earlier copies of this file numbered two of them 1.1.0
> and 1.2.0. Those numbers belong to the August releases above.

## 1.0.0, the store launch - 2026-07-31

_DoubleDone went live worldwide on the App Store (build 13) and on Google Play production (versionCode 20) on
2026-07-31, still as version 1.0.0. The web carried the changes below as they reached `main`, between
2026-07-15 and 2026-07-29._

### Added
- **The iPhone app, with Premium through Apple in-app purchase**: RevenueCat handles StoreKit, and the
  Worker records the purchase beside Stripe's. Buying needs no account, and Restore is always on the screen.
- **The held card is the one place for a single task's actions** (one gesture, one meaning), rebuilt as a
  curated few with the rest behind More. Tap a task's title on the held card to edit it.
- **The constant frame**: Today's day tools sit in one fixed layer at the thumb, in the same order every time,
  with the one that suits the hour under Right now. A tool that cannot help yet stays in place at low
  contrast and says what it needs.
- **Capture rebuilt as "reflex first, one door"**: type, then one door for When, Repeating and Steps, and the
  Add button says what will happen ("Add · Tomorrow").
- **The Calendar** (the Lookback's new name): repeats show on it, and a future day can be added to.
- **The Android home-screen widget is back**, with a second, always-light version for dark wallpapers and a
  taller size that shows more of today.
- **The app says it can come to you**: the rested screen offers at most one lifeline (the daily reminder, then
  the widget), and the welcome offers them up front.
- **Plan my day asks about the day** (energy, work or day off, indoors or out) before it suggests an order,
  and the order can be changed before you accept it.
- On Android a missed reminder leaves the tray by itself, even with the app closed, and the phone apps clear
  any pile of missed reminders when you open them.
- The closed day shows a calm count of what is ahead and a door to the Calendar.
- Settings shows the installed version.
- The free monthly scrapbook is easier to find.

### Fixed
- The capture panel stays above the keyboard (a tester's report, proven on their Pixel 7).
- The iPhone app shows DoubleDone's icon, not Expo's.
- Tap and hold no longer selects a task's text on iPhone.
- Focus can be left by mouse on the web, and its picker scrolls on a long Today.
- 40 copy fixes from an adversarial copy audit.
- A subscriber whose payment is failing can never buy a second subscription, and every price reads A$5 or A$50.

## 1.0.0, Android versionCode 11 - 2026-07-12

_Cut for Android as versionCode 11 (git tag `android-v11`, code-frozen from `d983bbf`), with the web deployed from the same code. It went to Google Play's closed testing and never reached public production. The first public Android release was versionCode 20 on 2026-07-31. Rhythms grow up (minutes-granular cadence, fixed times, and exact-alarm delivery that actually arrives on time), the Quiet interface and energy matching land, keepsakes share as a proper page and follow the account, and text shared from any app becomes one calm capture line._

### Added
- **Rhythms** (free): gentle recurring self-care nudges ("some water" every 2 hours, meds at 8 and 8) built as an extension of Routines. Interval cadence on a curated ladder from every 30 minutes to every 12 hours inside an active-hours window, or fixed clock times (up to 8, the meds shape), one-tap Water / Stand / Meds presets plus a fully editable custom form, and pause / resume. Never-shame is structural: the model stores no count, no streak and no history, so there is nothing to break.
- **Exact alarms on Android**: `SCHEDULE_EXACT_ALARM` declared, the real fix for nudges that only fired on app-open (expo-notifications silently falls back to inexact alarms that Doze defers when the permission is absent). Android 12+ gets a calm "Allow alarms & reminders" door (the toggle ships off on Android 14+) that re-arms every schedule the moment the user returns from the toggle; Rhythms get their own HIGH-importance channel (a heads-up peek, tunable alone in system settings); a once-per-app-open resilience sweep quietly re-schedules everything from stored config; and the nudge-health line is one calm sentence, "Next nudge around {time}.", updating in place after any change (deliberately no count).
- **The Quiet interface** (premium): a borderless appearance where nothing looks like a button and the app reads as calm text on paper. Same layout, same features; covers the whole Today surface (rows, capture line, header, the day's load, held-state, coachmark, close-the-day) plus the Settings toggle; derives from the active palette so it is correct on all seven colour themes; the held-state reaches every Standard capability, including a "Select more" door into the bulk actions.
- **Energy matching** (freemium): "What fits right now?" inside Focus mode's picker. One calm question (running low / somewhere in between / feeling good), Haiku picks one task from today's open list with a short warm line, and "Start with this" opens Focus on it. Propose-only, never a reorder. Free gets 15 picks a calendar month, metered locally with gentle reminders at 10 and 5 left; a use is spent only on a successful pick; premium is unlimited.
- **Share-to-capture**: share text into DoubleDone from any app, via the Android share sheet (expo-share-intent) or the installed web app (a PWA `share_target`). Both paths land on the same inbound rule, and the shared text is cleaned to one calm line (the words kept, links and highlight fragments dropped) before seeding the capture box. Nothing is ever auto-added; the user confirms.
- **The keepsake shares as a page**: the scrapbook share is exactly one jpeg with its caption and a small "DoubleDone · Week of {date}" line baked into the pixels (a cream band under the picture), so a receiving app can never strip the context. Native snapshots a hidden page card (react-native-view-shot); web composites the identical page on a canvas. Raw task titles still never leave the device, and it is still never a link.
- **Scrapbooks follow the account**: a `scrapbooks` Supabase table (RLS, per-week last-write-wins by creation time) syncs R2-backed keepsakes across devices, riding behind the task sync and internally caught so it can never fail it. Legacy device-local keepsakes from before R2 persistence stay where they were made.
- **The "big" mark follows the account**: a new nullable Supabase column with plain last-write-wins, plus a one-time tie-seed on first sync so no existing mark is lost.

### Changed
- The energy-matching entry moved from a standalone Today button into Focus mode's "Which one?" picker: choosing what to focus on is the moment the question makes sense, and Today loses a competing button.
- The paywall, onboarding, and the "You're Premium" panel caught up with the release: Quiet, the seven colour themes, and unlimited energy matching are now pitched everywhere Premium is explained, in all four languages.
- The R2 keepsake-image route now sends CORS (`access-control-allow-origin: *`), which the web page-composite fetch requires.

### Fixed
- Sharing into the app on a cold start no longer loses the text: the parked share now seeds the capture box at the exact moment it mounts (a callback ref), however late that is.
- "Share this keepsake" works on Android for R2-persisted images: the native path assumed data:-URL keepsakes only, so an https keepsake reported "Sharing isn't available here"; https images now download to cache and share the same jpeg.
- Toggling Quiet on Android no longer clips task-row bottoms after a Standard → Quiet → Standard round trip (Today remounts on an appearance change, forcing a fresh native layout).
- MCP `list_today` now includes recurring tasks due today, so an agent sees the same Today the app shows.
- Sync: `updatedAt` is monotonic, so an app-side delete or edit can never lose last-write-wins to the MCP Worker's clock; and the cloud sync waits for the local store to load, so a premature sync can never wipe un-pushed deletions.

## 1.0.0, the agent and developer surface - 2026-07-07

_The agent + developer surface reaches parity: the public REST API is now a Swagger-documented CRUD-plus-query surface, and the MCP server grows to nine OAuth-capable tools. Both share one cadence engine, so a repeating task made by an agent, a script, or the app is indistinguishable in shape._

### Added
- **REST API brought to parity** (`/api/v1`, **OpenAPI 3.1**, API version 1.1.0) with a browsable **Swagger UI** at `/api/v1/docs`. Token-authenticated CRUD-plus-query over a user's own tasks, scoped entirely by Supabase RLS through the user's own access token (no elevated key). A task now carries a normalised `recurrence` object (or null) and a plain-English `repeats` summary (or null); a task is never both dated and recurring. `POST /tasks` defaults to today and optionally takes a future due day **or** a repeat rule (daily, weekly with weekdays, or every-N-days), never both; `PATCH /tasks/{id}` updates title / done / due / repeat, where setting a due day clears any repeat and vice versa, and either clears with `null`. `GET /tasks` supports three read modes in precedence order: `q` substring search over open tasks, an `upcoming` look-ahead window (1 to 30 days, default 7), and the app's `today` view.
- **MCP server expanded to nine tools**: `add_task` (with optional due date and repeat cadence), `list_today`, `list_upcoming`, `complete_task`, `update_task`, `delete_task`, `break_down` (the propose-only Break-it-down engine, per-user hourly rate cap before any spend), plus `search` and `fetch` (the OpenAI Deep Research connector contract).
- **OAuth 2.1 for the MCP server**, chosen by bearer shape alongside the existing pasted-JWT path: sign-in-with-a-URL for claude.ai / Cowork / ChatGPT, S256 PKCE required, the user's rotating refresh token AES-GCM-encrypted in D1, and an immediate Disconnect kill switch.

### Changed
- The REST API, the MCP server and the app now share the **same cadence engine** (`buildRecurrence`) and repeat vocabulary on a UTC-calendar-day basis, so a repeating task is identical in shape whichever surface created it.

### Fixed
- Malformed REST input is always answered with a calm `400`, never a `500` or a leaked upstream status.

## [1.0.0] - 2026-06-26

_Live and commercial: DoubleDone shipped on the web with real paying Stripe subscribers, an Android build for testers, a launch control centre, and the full ADHD product seam._

### Added
- **The core loop**: friction-free brain-dump, a Today sized to be doable, tap-to-finish with a soft sage check, gentle close-the-day, and push-a-task-to-tomorrow.
- **AI: Break it down** (the phased planner): three qualifying questions, then a review-and-accept plan; long-horizon tasks return a roadmap and only phase one is broken into steps now. Haiku clarify, Sonnet decompose; dates computed on-device.
- **AI: Sort for me** (triage, Haiku) and **Strategise** (Sonnet, shown in the app as "Lighten today") to re-spread an over-full day, always propose-then-accept.
- **Slices** (track a task in parts) and **recurring tasks** (daily / weekly / every-N) with a Repeating drawer. No streaks.
- **The Lookback**: an interactive month calendar of what you finished each day, with a warmer mark for a long-dreaded "big win".
- **The AI scrapbook**: turn a finished week into a calm still-life keepsake (Cloudflare Workers AI), the objects evoking the tasks, with the week's finished tasks listed beneath.
- **Cloud sync (opt-in)**: passwordless email-OTP sign-in, last-write-wins sync, soft-delete tombstones, anonymous→account migration. Local-first throughout.
- **MCP server** (`/mcp`): a stateless bearer-token Model Context Protocol server so AI agents can add, list and complete tasks under the user's own RLS.
- **Comfort & access**: light / dark / system theme (Dusk palette), text size, reduce-motion, native fonts (Newsreader + Atkinson Hyperlegible), an accessibility pass, and an opt-in daily reminder.
- **Multi-language** AI replies (English, Italian, Spanish, French).
- **Privacy policy** (in-app + public URL) and **account + data deletion**.
- **The moat**: pseudonymous AI-call telemetry, instrumented from day one.
- **Premium** (Stripe, live): A$5/mo or A$50/yr with a 30-day card-free trial, gating the AI scrapbook, photo-to-tasks OCR, Plan my day, Chart a course, Lookback insights, pinning, and the six non-default themes; a signature-verified webhook writes the entitlement to Cloudflare D1.
- **The launch control centre**: an hourly health sweep emailing the owner on spend / error / abuse breaches, a daily pulse, a dead-man's-switch heartbeat, and Stripe dispute / refund / failed-payment alerts.
- **The ADHD product seam**: Make-it-tiny, the silent-parent breakdown chain, the low-capacity day, the evening wind-down, and Routines (no streak, by data shape).
- **Talk-to-capture** (web Speech), the **public REST API + OpenAPI**, a full **UI design pass** and a marketing landing, the guided **first-run**, **data export**, and **in-app feedback**.
- **i18n foundation**: a typed `t()` layer with English live and Italian / French / Spanish draft catalogs.
- **Terms of Service + refund policy** (in-app + public URL), alongside the privacy policy.
- **End-to-end manual test suite** (`docs/qa/`): 104 cases, fillable `.xlsx` + readable `.md`.
- Initial golden-path scaffold (Inspector, tiered CI, playbook, doc tiers).

### Changed
- Moat telemetry moved from a Supabase table to **Cloudflare D1** (Worker-bound).

### Security
- **AI endpoints locked down**: CORS allowlist + Origin gate + per-IP rate limit.
- **No public telemetry write path**: telemetry is a Worker-bound Cloudflare D1 database (previously a Supabase table written with the public anon key).
- The Anthropic key is isolated to the Worker; the MCP server holds no elevated key (it acts only with the user's own token, under RLS).
