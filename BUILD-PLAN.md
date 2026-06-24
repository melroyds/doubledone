# DoubleDone, Build Plan

*The operational doc. Where we are, what is next, in what order. If you are a fresh session, read this after CLAUDE.md and you know exactly where to start.*

---

## Current state (as of 2026-06-23)

Full core loop working: capture, AI decomposition (Bite the Elephant), in-app scheduling, and opt-in cloud sync. Web live at doubledone.app, Android installable via EAS.

- ✅ golden-path harness cloned, remote detached, Inspector activated (`core.hooksPath .githooks`)
- ✅ Trimmed to solo Tier 0 (removed CONTRIBUTING, PR template, issue templates)
- ✅ `docs/product-spec.md`, `CLAUDE.md`, `decision-log.md` written
- ✅ Domain `doubledone.app` registered (Cloudflare, WHOIS redacted, auto-renew on)
- ✅ **`client/` scaffolded**, Expo SDK 56 (React Native 0.85, expo-router, `src/app`), stripped to a calm Today shell, builds clean for web (`expo export`, 780 modules)
- ✅ Repo is an **npm-workspaces monorepo**: a thin root `package.json` delegates the gates into `client/`; Inspector + CI run from root
- ✅ Gates green locally: `typecheck` (tsc) · `lint` (expo lint) · `test` (vitest, 15 cases over `lib/day` + `lib/telemetry`) · secret-scan
- ✅ Telemetry contract live: `[doubledone.*]` via `client/src/lib/telemetry.ts`, wired at the Today toggle (telemetry before traffic)
- ✅ **Today persists** on-device (AsyncStorage) and **brain-dump capture** is live: type many lines, each becomes a task (steps 2-3 done; store parse/recovery tested in `lib/tasks`)
- ✅ **Shipped to both surfaces:** web live at [doubledone.app](https://doubledone.app) (Cloudflare Pages), Android APK installable via EAS (sideload). One codebase, two targets.
- ✅ **AI backend live** (step 4): Cloudflare Worker `doubledone-ai`, holds the Anthropic key as a Worker secret, `/decompose` contract-tested, validated with one live call. $25/mo cap set.
- ✅ **Bite the Elephant live** (step 5): "Break it down" on the capture box calls the Worker, drops atomic steps into Today. Moat telemetry (`decomposition.offered`) instrumented.
- ✅ **Cloud sync LIVE, verified end-to-end** (step 12): Supabase client, last-write-wins merge engine, soft-delete tombstones, passwordless email-OTP sign-in (Resend SMTP, doubledone.app verified for any recipient), sync on sign-in/open, anonymous-to-account migration. Confirmed live: sign-in works and tasks land in the `tasks` table. Setup + the two live-table fixes (created_at type, id PK) recorded in `supabase/auth-setup.md` and `supabase/schema.sql`.
- ✅ GitHub remote live and **public**: github.com/melroyds/doubledone, `main` pushed, CI + web deploy green
- ✅ **Full UI redesign + a net-new first-run shipped 2026-06-21** ("the system pass"): all seven surfaces brought to spec (Today rebuilt; Lookback / Break-it-down / Premium / Settings / Sign-in / Repeating refined or confirmed), plus a guided first-run that onboards by doing (replayable, non-destructively, from Settings). Screenshots regenerated; README, case-study, build-journal and lessons updated; provenance corrected (2nd piece, not 3rd); CI bumped off the deprecated Node 20.
- ✅ **Native platform + the notification engine shipped 2026-06-21** (a full native push, all code-complete + gate-verified + on `main`): haptics, keep-awake in Focus, themed Android system bars, launcher shortcuts + a shared inbound bridge, share-to-DoubleDone, a home-screen **widget**, and a two-phase **notification engine** (Phase 1 per-task local nudges; Phase 2 web push). Each needs a verification / go-live step (an APK build, or the web-push deploy), not new code. Detail in the next section.
- ✅ **Talk-to-capture shipped 2026-06-21** (a voice brain-dump on web plus an AI run-on splitter): tap Speak and each spoken phrase becomes a line, or tap Split to have the AI separate a no-pause or typed ramble into tasks. The web mic (`13fe636`) and the new `/split` Worker route (`fdc3b26`, deployed and live-confirmed). Voice is web-only (Android has the Gboard mic), Split is cross-platform.
- ✅ **The ADHD seam (Clusters A-D) shipped 2026-06-22:** Done-is-done + Good-enough (OCD reassurance), the silent-parent decompose chain + Make-it-tiny pebbles, the low-capacity day + the evening wind-down nudge, and Routines. Founder-market-fit features for the audience the spec names. Detail in the decision-log.
- ✅ **The "Dusk, evolved" redesign shipped 2026-06-22** (six gate-green slices, all live on doubledone.app): (1) a `phase.ts` foundation, (2) a living time-of-day background (gradient + two slowly drifting light pools), (3) a held whole-task-finish bloom that scales with the task (the fix for the "too feeble" B1 feedback), (4) Today reborn (a "Rooms" pill collapses the crowded four-link header that wrapped on narrow phones, a phase-aware greeting, soft-elevation cards), (5) Make-it-tiny polish (the pebble's "a tiny step toward X" eyebrow + a warmer resurface nudge), (6) the inheriting surfaces (every screen transparent so the living background shows app-wide). Detail in the decision-log; manual cases AI-09, TOD-16, VIS-01 added and AI-08 updated.

- ✅ **Launched, a polish sweep, and in-app feedback (2026-06-23, later session).** Live and real-user-ready. Account deletion run + tested live; remote-wipe-on-deleted-account shipped. A full pre-launch **polish pass** (text-size scaling, contrast, touch targets, modal a11y roles, the Routines screen onto the shared pattern, copy, dead-code removal). And **in-app feedback** replaced the `mailto:`: a Settings send-box POSTs to the Worker's new `/feedback`, which emails the support inbox via Cloudflare `send_email` (deployed + verified end to end).

### Redesign follow-ons (not yet done)

- **Regenerate the README screenshots** (`scripts/screenshots.mjs`): the portfolio screenshots still show the pre-"Dusk-evolved" UI, so they undersell the living background, the bloom, and the Rooms header. The highest-value follow-on, since the redesign's whole point is to be seen.
- **On-device redesign checks** (with the next APK): the whole-task-finish bloom (finish a broken-down task), the Rooms sheet (tap the pill), the tiny pebble eyebrow + the "You started" nudge, and the background drift actually moving (the headless preview throttles it). Tap- and time-driven, so they are device checks.
- **Minor polish (trivial, parked):** the remaining lower-traffic card surfaces to `surfaceCard` (a 0.92-vs-1.0 whisper); remove the unused `expo-glass-effect` dep (the Rooms pill uses a translucent fill instead); the beat-4 "a big one" sage tag on a finished row (lands with a Lookback pass); re-resolve the background phase on app-foreground (currently resolved once on mount).

## Widgets + the notification engine (2026-06-21)

All code-complete, gate-verified, and on `main`. What remains for each is a verification or go-live step that needs Melroy's hands (an APK build, or a web-push deploy), never new code. (Also shipped the same session, in the decision-log: haptics, keep-awake in Focus, themed system bars, launcher shortcuts + the inbound bridge, share-to-DoubleDone.)

### Home-screen widget (Android) — built, pending the EAS build

A native Today widget (`react-native-android-widget`): the top unfinished titles, or a calm rested line, Dusk light/dark, tap-to-open. The headless render task reads the same AsyncStorage the app writes and reuses the pure today-filter + a new `buildWidgetModel` (one source of truth); the app pushes `requestWidgetUpdate` from `commit`, with a 30-minute periodic fallback. Web-safe via platform splits; a custom `index.js` entry registers the task on native. Commit `50a85b2`. Verified by typecheck / lint / tests + the generated AppWidgetProvider via `expo config --type introspect`.
- ✅ **Compile risk retired (2026-06-21).** The EAS build finished clean on RN 0.85 (build `defc4d3f`, commit `20b5628`, which contains the widget's `50a85b2`), so the library's native module does compile on 0.85. The `git revert 50a85b2` fallback is not needed. What remains is the ordinary on-device check that the widget renders today's tasks on the home screen (item 3 below), which is behaviour, not a build risk.
- **Deferred (Tier 2/3):** check a task off from the widget (interactive actions writing back to storage), a "+" tap to capture, bundling Newsreader for the widget, a custom picker preview image. Trigger: the widget works on-device and you want more.

### Notification engine — Phase 1 shipped, Phase 2 code-complete

- **Phase 1 — per-task "remind me in X hours" (Android, local).** On a today task: "Remind me" → In 1 hour / In 3 hours / This evening → a local notification, a 9pm cutoff (no small-hours pokes), and cancel-on-handled (done / removed / deferred clears the pending nudge). Fully local; nothing leaves the phone. The row shows a bell + time. Commit `70f9fee`. **Pending:** the APK rebuild to test on-device.
- **Phase 2 — web push (PC + phone), code-complete.** A D1 subscription store + origin-gated routes (`3adc234`); a service worker + the web opt-in (`3a3d640`); a VAPID sender + an hourly Cloudflare Cron Trigger (`cb38745`). The daily push is **payloadless** (the message lives in the service worker), so no task content crosses the wire; the server holds only a subscription + a preferred hour + a tz offset. The "Daily reminder" toggle appears on web once a VAPID key is configured. A VAPID sign-then-verify test proves the crypto. **Pending:** the deploy runbook (Go-live checklist, item 4).
- The pre-existing daily Android reminder was refactored to cancel only itself, so it and the per-task nudges coexist on their own channels.
- **Deferred:** per-task nudges on web (needs the push pipeline per nudge), a periodic tz-offset refresh (a stored offset can drift an hour across DST), native FCM push for server events ("scrapbook ready" to Android). Trigger: web push is live and the gap is felt.

## What's left, and it is all pre-launch

**The build is done.** The whole product is shipped and live: the daily loop (capture, AI triage, AI decompose with the pace estimate and the moat, scheduling, push-to-tomorrow, slices, the repeating drawer), cloud sync, the calendar Lookback with weighted celebration, close-the-day, Strategise, the daily reminder, the full ADHD seam (low-capacity day, wind-down, Routines, the silent-parent decompose, Make-it-tiny), the scrapbook, the MCP server, the public REST API, native push + a home-screen widget, talk-to-capture, two design passes (Dusk, then Dusk-evolved), a guided first-run, and the 2026-06-23 live-pass UX fixes. Screenshots, README, case-study and build-journal are current.

Nothing below means "the product isn't finished." It is. What remains splits two ways:

- **[Pre-launch](#pre-launch-not-part-of-the-build)** (config, ops, launch) — the real remaining work, none of it new code. This is the path to a public launch.
- **[Backlog](#backlog-deferred-work-with-triggers)** — deferred features, each behind a trigger. Optional, dip in anytime, not blocking. (The items once listed as "next" — multi-language, talk-to-capture, routines, the ADHD seam — have all shipped; what is left there is genuinely later-or-never.)

## Pre-launch (not part of the build)

The "built, needs your hands" cluster: the steps that turn shipped code into a public launch. None of it is new code, it is configuration, one migration, device checks, and store / email setup. In rough order:

**1. Stripe Premium — ✅ done (test mode, tested 2026-06-21).** Melroy set the keys + product and verified the `4242` flow end to end. The steps below stay for reference, and for the one remaining bit: flipping to live-mode (real charges), which is a launch step. The `/checkout` + `/stripe-webhook` flow, the `/premium` paywall, and the D1 entitlement are built.
   1. In the **Stripe dashboard** (test mode), create a Product "DoubleDone Premium" with a recurring **A$5 / month** price; copy the price id (`price_…`).
   2. In `server/wrangler.jsonc`, set the non-secret vars `STRIPE_PRICE_ID` (that price id) and `APP_URL` (`https://doubledone.app`).
   3. Set the secret `STRIPE_SECRET_KEY` (your `sk_test_…`): `npx wrangler secret put STRIPE_SECRET_KEY` from `server/`.
   4. Confirm the D1 `entitlements` table exists (`server/d1/schema.sql`), then **deploy the Worker** (`npx wrangler deploy` from `server/`, which needs your explicit OK per CLAUDE.md).
   5. In Stripe, add a **webhook endpoint** → `https://api.doubledone.app/stripe-webhook`, events `checkout.session.completed` + `customer.subscription.updated` + `customer.subscription.deleted`; copy its signing secret (`whsec_…`) and set it: `npx wrangler secret put STRIPE_WEBHOOK_SECRET` (secrets apply with no redeploy).
   6. **Test:** signed in on doubledone.app → Settings → DoubleDone Premium → Go Premium → pay with `4242 4242 4242 4242` (any future expiry, any CVC) → land back on `/premium` as "You're Premium ✓". Going live = repeat 1 / 3 / 5 with the live product and `sk_live_…` keys.

**2. Account deletion — ✅ done (2026-06-23).** Ran the `delete_account()` migration and tested it live on a real account (account + its rows gone). Steps kept for reference:
   1. Open the **Supabase SQL editor** and run the `delete_account()` block from `supabase/schema.sql` (the `create or replace function public.delete_account() … security definer …` plus its `revoke` / `grant` lines).
   2. **Test on your own account:** sign in → Settings → Access & data → Account → Delete account and data → confirm → verify the account and its rows are gone. (Migrations can't be rolled back; test on an account you're happy to lose.)

**3. On-device checks (need a fresh Android build).** The APK predates the redesign AND the whole 2026-06-21 native batch, so build a new one first (`eas build -p android --profile preview`), sideload, then check: the redesign + fonts + dark mode, the **daily reminder**, and the native batch — **haptics**, **keep-awake in Focus**, **themed system bars**, **launcher shortcuts**, **share-to-DoubleDone**, the **home-screen widget**, and the **per-task "remind me" nudges** (test cases `HAP-01/02`, `AND-01`–`AND-06`). One build covers all of it. **Widget:** its native module compiled clean on RN 0.85 (build `defc4d3f`), so the old `git revert 50a85b2` fallback is moot, just confirm it renders today's tasks once added to the home screen.

**4. Web push (Phase 2 reminders) — ✅ live (2026-06-23).** The VAPID keys are set, the `push_subs` table is applied, the Worker is deployed (the hourly cron + the `/push` routes), and the public key is in Pages, so the "Daily reminder" toggle works on web and the daily nudge sends. The one unconfirmed bit is watching an actual notification land on a real device (a real opt-in, then the send hour). The runbook, for reference:
   1. `node scripts/gen-vapid.mjs` → copy the two values it prints.
   2. Worker secrets: `npx wrangler secret put VAPID_PRIVATE_KEY --name doubledone-ai` (paste the private JWK) and `npx wrangler secret put VAPID_SUBJECT --name doubledone-ai` (e.g. `mailto:you@doubledone.app`).
   3. Add the `push_subs` table: `npm exec -w server -- wrangler d1 execute doubledone-telemetry --remote --file d1/schema.sql`.
   4. Deploy the Worker (registers the hourly cron + the `/push` routes): `npx wrangler deploy` from `server/` (needs your explicit OK per CLAUDE.md).
   5. Set `EXPO_PUBLIC_VAPID_KEY` (the public value) in the Cloudflare **Pages** project env, then trigger a web rebuild. The "Daily reminder" toggle then appears on web; toggling it on subscribes the browser and the hourly cron sends the daily nudge.

**5. Launch (reach, not product).** A Play Store listing (the sideloaded APK becomes a real install with auto-updates and a store-listing portfolio signal; ~$25 one-off plus review) and a real transactional email sender for the sign-in code (instead of Supabase's shared sender, which can land in spam). Detail in [Backlog → Platform and distribution](#backlog-deferred-work-with-triggers).

**6. Privacy before public launch.** Remote-clear a device whose account was deleted elsewhere; enforce aggregation / anonymisation when telemetry graduates from the console to a real sink; and document Anthropic's data handling (API inputs are not used for training by default). The egress + retention disclosure and the AI-endpoint lockdown are already done. Detail in [Privacy and Security → To do](#privacy-and-security).

**7. The honest crowd estimate needs volume, not code.** The "others took about X days" surface is built but shows the app's own transparent estimate until real anonymised cross-user timings exist. A launch dependency, not a task.

---

## Day-0 checklist (from PLAYBOOK.md)

```
[x] Repo created from harness · MIT LICENSE · README present
[x] Inspector activated (git config core.hooksPath .githooks)
[x] .env.example committed; real .env gitignored
[~] CI live on GitHub (lint · typecheck · test · secret-scan); secret-scan hardened for the initial-push edge case
[x] gitleaks installed locally (v8.30), secret-scan backstop active
[x] Telemetry log prefix decided: [doubledone.*] via client/src/lib/telemetry.ts; first events task.added / task.toggled / day.cleared
[~] Risk list growing: date math (lib/day), telemetry contract (lib/telemetry), store parse/recovery (lib/tasks) tested; AI request contract + decomposition parser still to add
[x] Cost alarm before any traffic: Anthropic spend cap set ($25/mo)
[x] Decision-log started the same day
```

---

## Tier 1 build sequence (the core loop)

Build in this order. Each step is shippable and demoable on its own.

1. ✅ **Expo client scaffold** + Today view shell (web target first, the demoable surface). *Done 2026-06-17.*
2. ✅ **Brain-dump capture**, the friction-free "get it out of your head" input. *Done 2026-06-17.*
3. ✅ **Local store** (anonymous-first, on-device) for tasks + the Today view reading from it. *Done 2026-06-17.*
4. ✅ **AI backend** (Cloudflare Worker, not Render) holding the Anthropic key, with the request-contract test (mock SDK, assert shape). *Done 2026-06-18.*
5. ✅ **Bite the Elephant → Break it down**, Sonnet decomposition of a stuck task into atomic time-boxed steps. **Refactored 2026-06-18 into a two-call qualify→review flow:** call 1 (`/clarify`, Haiku) asks three qualifying questions (due date, gradual/same-day spread, one task-specific clarifier); call 2 (`/decompose`, with the answers) returns steps, the client spreads their dates (`lib/spread`), and an accept pop-up lets the user select/deselect before adding. Completion + offered-vs-kept outcomes instrumented (the moat). *Done 2026-06-18.* **Phased breakdown added 2026-06-18:** a new `/plan` call returns a roadmap of phases (1 for a small task, 2-5 for a big one) plus phase-one's steps; phase one lands now, later phases become dated milestone tasks in Later, each broken down via **long-press → "Break it down" on an existing task** (which also makes Break it down work on any existing task, not just at capture). Needs a Worker redeploy for the live AI calls (degrades to the questions step until then).
6. ✅ **AI triage / hydration** ("G"), "Sort for me" sorts a brain-dump into today / later / decompose (Haiku, cheap). *Done 2026-06-18.*
7. **Recurring daily tracker**, the repeating-tasks subsection

## Tier 2 (what makes it sticky)

8. ✅ **The Lookback, backed by an interactive calendar** ("D1"). A true Gregorian calendar you open any time and browse by day, showing what you completed and when. *Done 2026-06-18.*
9. ✅ **Complexity-weighted celebration** ("D2"). Closing a long-dreaded or chunky task gets a bigger calendar dot and a warm "a big one", weighting the *warmth* of the acknowledgment, never points / streaks. Score derived cheaply from a Bite-the-Elephant decomposition. *Done 2026-06-18.*
10. ✅ **Close-the-day wrap** ("E"), gentle, rolls forward, zero guilt, lives on Today as a calm wrap card. *Done 2026-06-18.*
11. ✅ **Strategise** ("F"), Sonnet re-spreads an over-full day, propose-then-accept. *Done 2026-06-18.*
12. ✅ **Supabase auth + sync**, opt-in cloud durability, RLS for privacy (verified live end-to-end 2026-06-18)
13. ✅ **Gentle nudges / notifications / reminders** ("H"), native, the retention lever. An opt-in daily reminder that offers the day, never demands it. Built; the notification firing is Melroy's to verify on the Android build. *Done 2026-06-18.*
14. ✅ **Repeating-tasks panel** (a right-side slide-open drawer). Daily/recurring and one-off project tasks are different mental modes, each with its own home. A "Repeating" link in the Today header opens a drawer listing all recurring tasks with their cadence; today's due ones still also appear on Today (the recommended option, so habits stay visible). Calm list, no streaks. *Done 2026-06-18.*
15. ✅ **Task slices (progress across parts)** (Melroy, 2026-06-18). A task can carry a user-defined slice count (10 TV episodes, a 3-step chore) and be advanced one part at a time on Today: slim sage progress bar, quiet "n / N", tap-to-advance. The default row is calm (no controls on it); **tap-and-hold reveals step-back / remove** (Melroy's refinement, same day). Finishing the last slice completes it through the normal path (celebration unchanged); reconciled onto `done`/`completedAt` so nothing downstream special-cases it. Defined at capture (single one-off lines only), synced via a `slices` jsonb column, moat-instrumented (`slices.defined` / `slices.progressed`). *Done 2026-06-18.*
16. ✅ **Marquee for long titles** (Melroy, 2026-06-18). A title too long for its row scrolls as a calm marquee (`MarqueeText`) instead of truncating: slow, with a read-pause each loop, only when it overflows, and respecting reduced-motion (gentle wrap fallback). Used on every task title. *Done 2026-06-18.*

## Backlog (deferred work, with triggers)

The single home for everything we have consciously parked. Nothing here is dropped. Each item has a trigger for when it earns a place in the sequence above. When we defer something in a session, it lands here.

**Sync, beyond v1** (v1 is tasks-only, step 12)
- Live / realtime updates (changes appear on the other device without a refresh). Trigger: v1 sync is stable and the refresh delay actually annoys you.
- Google one-tap sign-in alongside the email code. Trigger: sign-in friction shows up, or real users ask.
- Clickable email magic-link on web, in addition to the typed code. Trigger: you want one-tap web sign-in and the deep-linking is set up.
- Sharing a list with another person. Trigger: a real second-user case (caution: this edges toward the team-tool trap the spec warns against, weigh hard).
- Syncing the cross-user completion data (the moat flywheel) to its own anonymised store. Trigger: enough users that the aggregate is worth mining, pairs with the AI features.
- **Sync the decompose chain (`silentParent` + `parentId`), and have the MCP / API exclude silent parents.** These Cluster B fields are client-only (no schema columns, not in the sync mapping), so a broken-down task's structure is lost on a second signed-in device (the parent and its loose steps all show, un-linked), and the MCP's `list_today` can surface a silent-parent umbrella the app itself hides. Both are cosmetic edge cases, not data loss. The fix is two columns (`silent_parent`, `parent_id`), the sync mapping extended to carry them, then a `silent_parent=is.false` filter on the MCP / API today query. Trigger: a multi-device user who decomposes hits it, or before promoting the MCP / API past v1.

**AI, beyond the core**
- Energy-level matching (suggest tasks that fit your current energy). Trigger: Bite the Elephant and triage are solid and you want smarter sequencing.
- Calendar read (see the day's meetings to size Today). Trigger: core loop sticky and time-blindness needs calendar context.
- **External calendar two-way sync** (tasks <-> Google / phone calendar). Trigger: Melroy wants it (confirmed 2026-06-18, after in-app scheduling lands). Needs OAuth and a calendar API; the in-app scheduling model is the foundation it builds on.
- **AI complexity scoring / weightage.** Have the AI score how hard a task is, so the completion celebration is proportionate (the dreaded, complex thing earns the warmer acknowledgment). Cheapest source is deriving the score from a Bite-the-Elephant decomposition (steps x minutes), effectively free; a dedicated per-task AI score on every capture is token-heavy and adds latency. Trigger: the calendar / completion record exists (D) and you want the reward weighted.
- **"Plan my day" (AI)** (Melroy, 2026-06-18). On request, arrange today's tasks into a calm suggested order and rough timing (what to do, in what sequence), distinct from Strategise (which re-spreads an over-full day across days) and Bite the Elephant (which breaks one task into steps). Propose-then-accept like Strategise; token-cost like the other AI features. Trigger: after the core AI loop; pairs with energy-matching.
- **Honour an explicit step count in Break-it-down** (Melroy, 2026-06-24, found alongside the today+gradual date bug). When the user states a number ("just 3 parts"), the breakdown ignores it: the count goes into the free-text custom answer, which the plan / decompose prompt appends but never instructs the model to obey, and there is no count parameter at all. The spine-friendly fix is NOT a new "how many parts?" control (that adds the friction the calm flow avoids). It is a one-line prompt instruction along the lines of "If the person names a number of steps, use exactly that many." Wording is Melroy's to tune, so it is teed up here rather than guessed. Trigger: the next prompt-tuning pass.
- **"Combine" tasks (the inverse of Break-it-down)** (Melroy, 2026-06-24). A new multi-select bulk action: select several tasks, tap Combine, and a cheap Haiku call (`/combine`, sibling to `/decompose`) returns one umbrella title for them ("buy milk / bread / eggs" -> "do the grocery shop"). The combined task takes the EARLIEST due date among its children (Melroy's call). Design settled: keep the originals as the umbrella's record (a visible umbrella parent, originals tucked as its children), NOT a hard-delete, so it is reversible, loses nothing if the Haiku title is off, and fires the whole-task bloom on completion. It is the inverse-visibility cousin of the silent-parent chain (Break-it-down hides the parent and shows the steps, Combine shows the parent and hides the children), so it reuses the parent/child + bloom machinery with a new visible-parent mode. Spine fit: it declutters Today (fewer lines, less overwhelm) and is user-driven. The one watch-out is combining startable small things into one bigger-feeling thing (the wall-of-awful), mitigated because the user chooses what to group and Break-it-down reverses it (zoom out when cluttered, zoom in when stuck). Moat: log the combine like the decompose telemetry. Trigger: build-ready with this spec, slot after the widget fix settles.

**Internationalisation (accessibility / reach)**
- ◑ **Multi-language support, starting Italian / Spanish / French** (Melroy, 2026-06-18). Make DoubleDone accessible beyond English (ParkProof shipped 9 locales; same instinct).
  - ✅ **Pass 1 (shipped 2026-06-19):** locale detection (`expo-localization` + the pure `lib/i18n` + the `lib/locale` seam), and **the AI answers in the user's language** — clarify / plan / decompose / strategise take a `language` and respond in it (triage excluded, it echoes user text). Allowlisted to prevent prompt injection. Contract-tested; needs the Worker redeploy to go live.
  - **Remaining (Pass 1 cont. + Pass 2):** externalise every **UI string** behind a small typed `t()` layer (best done after the design overhaul finalises copy), then the **IT / ES / FR translations** themselves (AI-assisted draft, ideally native-speaker reviewed so the calm tone survives), plus localising date/number formatting (`'en-AU'` is hardcoded in `lib/day` and the date picker). A manual language override lives in the Settings page. Trigger: after the design overhaul.

**Moat and AI data**
- ✅ **AI-call telemetry** (Melroy, 2026-06-18; **shipped and live**). The Worker logs every AI call (clarify / plan / decompose / strategise / triage) with its input, returned JSON, model, latency, token usage and ok/error to a Supabase `ai_calls` table, **insert-only RLS, NO user_id** (pseudonymous). Fire-and-forget via `ctx.waitUntil`. Live as of 2026-06-18: migration run, `SUPABASE_URL` + `SUPABASE_ANON_KEY` set as Worker secrets, Worker deployed. Hardening trigger (before public launch): the anon key can insert from anywhere, so add a Worker-side shared secret or rate limit, or move to Cloudflare D1 (the Worker-bound, no-public-write alternative).
- ◑ **"Other users took about X days" estimates** (Melroy, 2026-06-18). The moat's user-facing payoff: when someone Breaks Down a task, surface a calm crowd estimate. ✅ **v1 surface shipped 2026-06-19:** the breakdown review now closes with a calm pace note ("Usually about N days, at a gentle pace. No rush.", `lib/estimate.ts`, unit-tested, `estimate.shown` instrumented). v1 derives the estimate transparently from the decomposition and is framed as the app's own guidance, deliberately NOT a fabricated "other users" statistic (no real volume yet = a trust risk; see decision-log 2026-06-19). **Remaining (the real differentiator):** swap to real anonymised cross-user timings once the AI-call telemetry has completion outcomes linked anonymously, task-similarity matching, and enough volume to be honest. The surface is built, so this becomes a copy/data swap with no UI change. Trigger: cross-user volume exists.

**Lists and collections**
- **Add slices to an existing task** (deferred 2026-06-18, when slices shipped). Slices are set at capture today; there is no affordance to add/edit a slice count on a task that already exists. The discovered-later case is partly served by Break-it-down. Trigger: if Melroy or a tester reaches for it, add a calm edit path (likely via long-press) without cluttering the row face.
- **Custom lists** (Melroy, 2026-06-18), e.g. a long-running "TV shows to watch". Named collections that live OUTSIDE Today, so the daily list stays finite and achievable (the spine). You browse a list on its own surface (like the Repeating drawer) and pull an item into Today only when you actually want to act on it. Reference / someday lists, not daily pressure. Trigger: after the core loop; design it so it never turns Today into an everything-bucket.
- **Colour-coded custom categories (premium)** (Melroy, 2026-06-24). User-defined categories, each with a colour, shown as a calm cue on a task (a dot or a thin edge, never a loud label). A natural premium personalisation: visual grouping that helps the visual / ADHD organiser, monetisable, a clear "more" without touching the free tier's calm. The tension to respect: the spine is calm and never-add-a-setting, so categories stay optional, few, and quiet, a subtle colour rather than a tagging system that turns Today into a labelled everything-bucket. Trigger: the next premium-feature push (planned for the week of 2026-06-30).

**Scheduling and deferral** (when a task lands on, or leaves, Today)
- ◑ **One-off future date** (Melroy, 2026-06-19). Schedule a single task for a specific future day, distinct from the recurring "Starting from". ✅ **At-capture shipped 2026-06-20:** a "Date…" chip opens the month-grid picker; the task gets a one-off `due` on the chosen day and waits in Later until then (`CaptureSchedule` `date` mode + a shared picker modal; decision-log 2026-06-20). **Remaining:** setting / clearing a date on an *existing* task (likely via long-press). Trigger: you reach for re-dating something already captured.
- ✅ **Pushing a task to tomorrow** (Melroy, shipped 2026-06-20). A calm per-task "not today" in the long-press confirm menu (one-offs only): moves the task to tomorrow, off Today and into Later, returning tomorrow. Never-shame, plain "Tomorrow", no push counter; `deferToTomorrow` unit-tested, `task.deferred` instrumented, the confirm menu reflowed to title-over-actions to fit. Decision-log 2026-06-20.
- Both of the above feed the open design question **"an outstanding section of Today"** (decision-log, 2026-06-19): how persistent multi-day tasks should relate to must-happen-today ones. Decision deferred there, on purpose.

**Platform and distribution**
- Play Store release, versus the current sideloaded APK. Trigger: polished enough to show publicly and you want auto-updates plus the store-listing portfolio signal (~$25 one-off plus review).
- Over-the-air updates (refresh the installed app with no reinstall). Trigger: reinstalling for each change gets old.
- A real transactional email provider for sign-in mail, versus Supabase's shared sender. Trigger: real users, or test mail landing in spam.

**Developer surface (AX / DX)**
- ✅ **Public REST API + OpenAPI shipped 2026-06-21.** A versioned CRUD surface over the user's tasks at `/api/v1/tasks[/{id}]` (GET / POST / PATCH / DELETE), bearer-authed by the user's own token proxied to Supabase under RLS (the MCP pattern, no elevated key). An OpenAPI 3.1 spec at `/api/v1/openapi.json` + a browsable Swagger UI at `/api/v1/docs`. `server/src/api.ts` + `openapi.ts`, 19 contract tests; guide in [`docs/api.md`](docs/api.md). **Live** (Worker version `bebb1564`); the public surfaces (spec, Swagger UI, 401 gate) verified. Decision-log 2026-06-21.
- ✅ **MCP server shipped 2026-06-20** (let AI agents drive DoubleDone). A stateless bearer-token MCP server at the Worker's `/mcp` (tools `add_task` / `list_today` / `complete_task`, proxied to Supabase under the user's own token + RLS); "Copy my token" in Settings; guide in [`docs/mcp.md`](docs/mcp.md). Verified live (initialize / tools-list / auth gate). Decision-log 2026-06-20.

**Monetisation** (Melroy, 2026-06-20; design direction + open calls in decision-log 2026-06-20)
- ◑ **Flagship: the AI "scrapbook" (premium).** An AI-generated image decorating a completed week in the Lookback, the on-brand delight (the Lookback is the emotional payoff). ✅ **v1 + v2 shipped 2026-06-20:** the scrapbook feature, a Workers AI pipeline (`llama-3.2-3b` scene → `flux-1-schnell` image) on the deployed Worker, device-local, no paywall yet. **v2** (per Melroy + his Claude Design mockup): the image now surfaces the week as a calm **still-life** (objects evoking the finished tasks, not an abstract mood); the **finished tasks are listed** under the keepsake with the "a big one" marker; and the card is the mockup's **polaroid holder**. The still-life prompt needs a Worker redeploy to go live (decision-log 2026-06-20). **Remaining (the monetisation):** **free** keeps the occasional taste (~1/month), **premium ($5/month subscription)** unlocks more, scaling 1 → 2 → 4 per week by **tenure / cumulative use, never a streak**; **no ads**; subscription not one-time (ongoing per-image cost). ✅ **Stripe Premium built (test mode) 2026-06-20:** `/checkout` + `/stripe-webhook` (Web-Crypto-verified) → entitlement in D1, the authed `/entitlement` read, a calm paywall (`/premium`), and the scrapbook cadence gating (free monthly → paywall, premium weekly by tenure). The open calls are resolved: $5/mo subscription, no ads, no currency, demonstrated test-mode Stripe (decision-log 2026-06-20). **Pending Melroy:** set `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` as Worker secrets, register the webhook URL, test with the `4242` card. Still deferred: cross-device scrapbook-image persistence (Supabase Storage / R2; base64 is device-local) and server-side scrapbook-quota enforcement.
- **Premium: AI "chart a course of action".** Give the AI your goal and requirements and it returns a weighted plan of action (scored, ordered steps toward the goal), beyond decomposing a single task. Genuinely token-heavy, so it is a paid feature by design (Melroy, 2026-06-18). Trigger: core AI features proven and the Stripe paid tier exists.
- **Premium: Prioritise a task** (Melroy, 2026-06-18). A loud, in-your-face treatment to flag a task as a priority, using the bold blue->violet gradient saved in `theme.priorityGradient` (the one that proved too bold for everyday recurring rows). Uses `expo-linear-gradient` (already installed). A premium add-on. Trigger: paid tier exists.
- **Premium: OCR capture from a photo** (Melroy, 2026-06-24). Photograph a post-it, a whiteboard, or an existing written or printed list, and Claude vision transcribes it into tasks (then through the normal triage). A natural premium surface: vision calls cost more than text, so it justifies the paid tier, and it is adjacent to the brain-dump capture that already exists (a camera/photo path feeding the same flow). Privacy: the image goes to the AI like the other AI features, so disclose at the point of use as the breakdown does. Trigger: the premium tier is active and a camera/photo capture path is worth adding.

**Settings and personalisation**
- ✅ **A full Settings page** (Melroy, 2026-06-18; **v1 shipped 2026-06-19**). A reactive theme (`ThemeProvider` + `useTheme` / `useThemedStyles`) now backs a `/settings` screen reached by a gear in the Today header, with three calm controls: **Theme** (System / Light / Dark), **Text size** (Small / Default / Large), **Motion** (Follow system / Reduce). All apply live across the whole app, persisted on-device. Scoped to access/comfort, the deliberate exception to "never add a setting" (decision-log 2026-06-19, Stages 1 + 2). **Tier 2 (deferred):** high-contrast mode, reminder-time, and a serif-vs-plain font choice, each adds surface so it waits. Trigger: a real ask, or when the design overhaul finalises.

**Polish and tech debt**
- **Introduction redesign (the next active piece, 2026-06-23).** Redo the welcome / first-run to walk through the features calmly: paced, skippable, curated, never a feature-dump. The Claude Design prompt is written (with Melroy); when the design returns, build it into `client/src/app/welcome.tsx` (the first-run gate + replay-from-Settings already exist). Trigger: the design comes back.
- **Three deliberately-left polish calls (2026-06-23, in the decision-log).** (a) uniform-400 serif titles vs the page-400 / modal-600 hierarchy; (b) an `onAccent` token for the ~15 `#FFFFFF` accent-fill literals; (c) the shared periwinkle for the one-off border + recurring mark (judged coherent). All defensible as-is. Trigger: Melroy wants the lighter title look, or the accent text ever needs theming.
- **Feedback follow-ups (2026-06-23).** Optionally log notes to D1 as a durable backup (email can be missed / spam-filed); swap the sender to Resend if we ever want support@ itself as the literal To (vs the verified-Gmail destination the `send_email` binding requires). Trigger: feedback volume matters, or deliverability needs hardening.
- ✅ **App icon, splash, and favicon** (shipped 2026-06-19): the sage-and-mauve double-check from the Dusk illustration suite, cropped full-bleed cream so no launcher mask clips a corner; the in-app "moment" illustrations (empty Today, close-the-day) and the README hero landed the same day (decision-log 2026-06-19).
- A full-bleed / animated **native splash** (the B2 scene). Parked: disproportionate for a sideload-only surface and device-ratio-fragile. Trigger: a real reason to polish the native first-run, e.g. a Play Store listing.
- The **paper-texture** background (B6). Parked: risks visual noise against the never-overwhelm spine. Trigger: a surface that genuinely reads flat and needs warming.
- ✅ **Recurring "Starting from" at capture** (Melroy, shipped 2026-06-19): Daily / Weekly / Custom now take a start date (the `DatePicker`, past days disabled), so a habit can begin in the future; the Repeating drawer shows "· from {date}" until it starts. Decision-log 2026-06-19. (One-off future dates and push-to-tomorrow now live under **Scheduling and deferral** above.)
- Investigate the expo-router "multiple renderers" dev warning. Trigger: before launch, or if it ever surfaces in production.
- ✅ **Tier-1 CI hardening (done).** The `ci` workflow enforces a coverage floor (90% lines / statements / functions, 85% branches on the client logic, `client/vitest.config.ts`) and runs a dedicated **build** job (`expo export -p web`), alongside lint / typecheck / test and a full-history `gitleaks` secret scan. (PLAYBOOK Tier 1.)
- ✅ **Lock down the AI endpoints** (shipped + live 2026-06-19). The five AI routes have a **CORS allowlist** (app origins only), an **Origin gate** (a disallowed browser origin → 403 before any Claude call), and a **per-IP Cloudflare rate limit** (`AI_LIMITER`, 30 req/60s). Deployed (version `3f6e03c8`) and live-verified with zero AI spend; server-only, nothing changed for existing web/native users. Contract-tested (9 cases). See decision-log 2026-06-19.
- ◑ **Design overhaul, the "Dusk" system** (Melroy, 2026-06-18; in progress 2026-06-19). Melroy's design tooling produced the Dusk system (mockups in `docs/design/`). ✅ **Palette + system-following dark shipped.** ✅ **Serif headings** (Newsreader) wired. ✅ **Illustration suite wired** (2026-06-19): app icon / splash / favicon, the empty-Today and close-the-day "moment" banners (the close card with a reduced-motion-safe fade-and-rise), and the README hero. ✅ **Native dark-mode enabled** (`userInterfaceStyle: automatic`, needs on-device verification). ✅ **Settings page** (theme / text size / motion, live across the app). ✅ **Atkinson Hyperlegible body font** swept onto every component, so body text now renders the Braille Institute legibility face on web while headings stay Newsreader (RN-web gives every Text its own default font, so it had to be applied per style; decision-log 2026-06-19). **The Dusk design pass is essentially complete.** ✅ **The full system-pass redesign then shipped 2026-06-21** (all seven surfaces rebuilt or refined + the net-new first-run; see the redesign entries in the decision-log). ✅ **Native fonts shipped 2026-06-19** (`expo-google-fonts` + `useFonts`: Newsreader / Atkinson now load on Android, web unchanged; one weight per face for v1, see below). Remaining and smaller: optional component polish (capture send button, per-task accent dots). ✅ **README screenshots refreshed 2026-06-19** to the Dusk look, incl. the new rotating-phrase footer.
  - ◑ **Full native font weights / italics** (follow-on to the v1 native-font load). ✅ **Bold body shipped 2026-06-20:** a `bodyBold` token (real Atkinson 700 on native, same CSS var on web) now backs the 44 bold body styles, because Android does not synthesise bold for custom fonts. Decision-log 2026-06-20. **Remaining (optional):** a real italic variant for the foot phrase (synthesised today; risks a double-slant), a bold-heading variant (headings sit at Newsreader 600, fine), and a handful of inherited-family selected states. Trigger: a device check shows they read poorly.

**Portfolio and public documentation**
- ◑ **Portfolio-grade GitHub, modelled on ParkProof** (Melroy, 2026-06-18). *README rewritten to ParkProof's shape (hero, what-it-does, architecture diagram, stack table, notable decisions, what's-not-built-with-triggers, files tree, further reading) and `docs/case-study.md` written (the PM narrative: pivot, spine, moat, never-shame, discipline of stopping) — 2026-06-19.* ✅ **Screenshots done 2026-06-19:** Today + Settings, light + dark, captured at a true 390px viewport and current to the Dusk look (incl. the rotating-phrase footer). ✅ **build-journal shipped** ([`docs/build-journal.md`](docs/build-journal.md)), updated 2026-06-21 with the redesign chapter.

**Audience-driven product backlog** (brainstorm 2026-06-20, imagining the ADHD / AuDHD / OCD user; ⭐ = strongest, ⭐⭐ = top pick). Each waits behind a trigger; a sequencing exercise follows.

> ✅ **Tier 1+2 polish sprint shipped 2026-06-20** (autonomous build, all preview-verified, see decision-log): **shame-free re-entry** (⭐⭐), **"just this one" focus mode** (⭐), **"I also did that"** off-plan logging (⭐), **"weight of today"** load gauge (⭐), and **data export** ("your stuff is yours"). The sixth, **scrapbook → R2 persistence**, ✅ **R2 image persistence shipped** (the Worker uploads keepsake images to R2 and serves them by URL, off the device's localStorage quota); plan was in [`docs/scrapbook-r2.md`](docs/scrapbook-r2.md). The cross-device sync of those URLs to a Supabase `scrapbooks` table is the remaining half, still parked.

**ADHD seam, sequenced (planned 2026-06-22; Melroy picked A, B, D).** The still-open ⭐s, clustered by shared design and sequenced by value vs spine-risk:
- ✅ **A. OCD reassurance** (small, shipped 2026-06-22): "Done is done" + "Good enough" permission as a calm completion micro-interaction (a quiet affirmation on completion, and a single-select "Good enough" that closes a task without doing every part). Decision-log + manual cases OCD-01 / OCD-02.
- ✅ **B. Crossing the start line** (shipped 2026-06-22): the silent-parent chain (slice 1) + the "Make it tiny" tiny-version (slice 2) + start-anywhere (already true). The REAL task is kept as a *silent / open background parent* and the pebbles chain to it (`parentId` + denormalised `parentTitle`), never a flat replacement and never a visible project tree. Decompose pebbles are exhaustive, so finishing them completes + celebrates the real task ("You finished X. The whole thing.", `completeAncestors` cascades up). Tiny-version pebbles are partial, so the real task is an `openParent` that never auto-completes: finishing a pebble RESURFACES it ("Started. X is here when you're ready."), and you can make it tiny again. New Haiku `/tiny` endpoint. Decision-log + cases AI-07 / AI-08.
- ✅ **C. Honoring the day** (shipped 2026-06-22): the low-capacity day (C1, a one-tap "low day" that recalibrates the weight gauge to a gentler target, per-day and never a setting) plus the wind-down nudge (C2, an in-app evening line above Close the day, reusing the nudge engine's evening hour, not a second notification). Decision-log + cases TOD-14 / TOD-15.
- ✅ **D. Routines** (shipped 2026-06-22): a morning / evening gentle checklist on its own calm screen (D1 the never-streak model + storage, D2 the screen reached from the Today header). A routine is a few small steps grouped by time-of-day; ticking marks a step done TODAY only, so tomorrow it is fresh, no streak, no habit-tracker, no "you missed it". Local-first. Decision-log + cases RTN-01 / RTN-02 / RTN-03. Follow-on (flagged): relocate the header link or surface routines contextually (a morning card on Today).
- Deferred: custom lists + a someday inbox (highest spine-risk), cumulative never-streak counts, deeper low-stim mode (a setting). Invitational reminders is ~already done (the reminder copy is already invitational).

Sequence: **A → B → C → D** (Melroy's pick; ascending effort, quick wins first). ✅ **A, B, C, and D all shipped 2026-06-22.** The ADHD seam (A through D) is complete. The rest (custom lists, cumulative counts, deeper low-stim) later.

**A-D device-test feedback (Melroy, 2026-06-22).** The seam works; polish and two flow fixes are queued.
- **B1, celebrate the whole-task completion properly.** Finishing a decomposed dreaded task shows the same brief fade as ticking any task. It is the single biggest "you did the thing" moment and reads too feeble. Give it a distinct, held celebration proportionate to the achievement (ideally complexity-weighted), not a 3.5s line. Trigger: the Claude Design pass, but the principle is locked now.
- ✅ **B2, guarded the tiny-version against infinite children + a calm progress nudge (fixed 2026-06-22).** Re-running Make-it-tiny used to spawn another child each time. Now `hasActiveTinyChild` blocks a second open pebble, `resurfaceOpenParent` retires the spent pebble on completion (no pile-up), and the line is a calm progress nudge ("A step done. You're chipping away at X."). Both helpers unit-tested.
- ✅ **D3, routine-remove is now recoverable (fixed 2026-06-22).** Remove offers a brief Undo banner (6s) instead of an instant delete, not a confirmation dialog (a confirm gauntlet is the friction the spine forbids).
- **A and B want the visual redesign** (functional-first surfaces). C is good as-is, D1 works. Trigger: the Claude Design pass.

*Capture, get it out before it's gone*
- ✅ **Talk-to-capture (shipped 2026-06-21).** Speak a brain-dump on web: each phrase, split on a natural pause, becomes a line, then the existing Sort/Add takes over (T1, the Web Speech API mic, `13fe636`). A no-pause or typed run-on is separated by a new AI `/split` route (Haiku), offered as a calm "Split into tasks" affordance (T2, `fdc3b26`, Worker deployed and live-confirmed). Voice is web-only (Android has the Gboard mic), Split is cross-platform. Moat: `capture.dictation.used` + `capture.split.used`. Native in-app voice (the EAS-rebuild path) stays deferred (T3).
- **Quick-capture from outside the app** (share target / home-screen widget / a notification you can type into). The thought arrives mid-task; opening the app loses it. Trigger: native distribution matures (Play Store / OTA).
- **A "someday" inbox that demands no decision.** Demand avoidance: don't force scheduling at capture. Pairs with Custom lists. Trigger: with Custom lists.

*Starting, the wall of awful*
- ⭐ **"Just this one" focus mode.** Full-screen a single task + its first step, everything else hidden, optional calm timer. Body-doubling, in-app. Trigger: after the capture/start sequence.
- **"Tiny version" reframe.** One tap shrinks a task to its 2-minute version. Lower the stakes to cross the start line. Trigger: cheap, bundle with focus mode.
- **Start-anywhere on a broken-down task.** Do steps in any order; kill the "must do it right" freeze. Trigger: small, with the decomposition polish.

*Time blindness*
- ⭐ **A visible "weight of today".** The day's load shown honestly so Today can't silently overfill. Extends `lib/estimate`. Trigger: alongside the estimate work, or sooner as a calm gauge.
- **Gentle wind-down nudge.** Hyperfocus + autistic transitions miss the day ending. A soft "winding down?", never an alarm. Trigger: with smarter reminders.

*Evidence you did things (the discounting reflex)*
- ⭐ **"I also did that".** Log things done that were never on the list; this brain does loads off-plan, and counting only ticked tasks feeds "I did nothing". Cheap, high payoff, feeds the Lookback + the moat. Trigger: near-term.
- **Cumulative never-streak counts.** "You've closed 142 things here." Tenure that only grows. Trigger: with the Lookback's next pass.

*Re-entry & retention (the week-six bar)*
- ⭐⭐ **Shame-free re-entry.** Open after a gap → "welcome back, here's today, the past is fine", never "47 overdue". The single biggest retention lever for this audience, and differentiated. Trigger: before any real-user push.
- **Invitational reminders.** "Today's here when you are", never a nag or badge. Trigger: with the reminder rework.

*AuDHD, routine & sensory*
- ⭐ **Routines.** A morning / evening sequence surfaced at the right time as a gentle checklist. Autism anchors on routine; ADHD needs the externalised sequence. Trigger: after the start/capture sequence.
- **Deeper low-stimulation mode** for sensory-overload days (extends reduce-motion). Trigger: a real ask, or the design pass.

*OCD, reassurance without feeding the compulsion*
- ⭐ **"Done is done".** Ticking gives a clear, permanent "recorded, you don't need to check again", countering the checking loop. Trigger: small, near-term.
- **"Good enough" permission.** A gentle, explicit "this is done enough" to release the not-just-right feeling. Trigger: with the OCD pass.
- *Restraint as the feature:* the no-folders / no-tags / no-settings spine is what stops the app becoming a compulsion. Not a build, a guardrail to defend (see "do NOT build" below).

*Energy / capacity*
- ⭐ **"Low-capacity day" mode.** One tap shrinks Today to the bare minimum, guilt-free. Honours bad days instead of pretending every day is equal. Trigger: after the core start/capture work.

*Polish & trust*
- ⭐ **Scrapbook image persistence** (Melroy, 2026-06-20). Images are base64 in `localStorage` today: device-local, lost on cache-clear / reinstall, no sync, ~500 KB each risks the quota. Move the bytes to **Cloudflare R2** (the Worker uploads on generation, returns a URL) + sync metadata via a Supabase `scrapbooks` table. Higher priority now the scrapbook is paid. Trigger: before real users touch the paid tier.
- **Calm completion feedback** (optional soft haptic / chime, off by default, never gamified). Trigger: polish pass.
- ✅ **Warm empty states + a gentle first-run** (no tutorial wall) — **shipped 2026-06-21:** a guided welcome that runs your first brain-dump through the real triage, redirected-to once and replayable non-destructively from Settings. Decision-log 2026-06-21.
- **Data export** ("your stuff is yours"). Trigger: before real users, with the privacy story.

*The discipline of stopping (tempting, but do NOT build)*
- No streaks / points / leaderboards (RSD + the streak-break shame).
- No folders / tags / projects / deep customization (feeds OCD perfecting and ADHD organising-as-avoidance; the no-settings spine is the feature).
- No social or sharing by default (sensory + RSD).
- No variable / surprise rewards (autism needs predictability).
- No AI that silently reorganises (demand avoidance; always propose-then-accept).

---

## Privacy and Security

Privacy by architecture, not by policy promises. DoubleDone runs fully without an account, and the only piece of personally identifying information it ever holds is an email address, and only if you choose to sync.

**The posture (true today)**
- **Local-first, anonymous-first.** Every feature works on-device with no account. Nothing leaves the device unless you opt into sync or use an AI feature.
- **The only PII is an email**, captured solely to sync your tasks across devices (passwordless one-time code, no password stored). No name, phone, location, device fingerprint, contacts, or analytics identity. No ads, no third-party trackers, no selling data, ever.
- **Your data is yours, and isolated.** Supabase row-level security scopes every row to its owner (`auth.uid() = user_id`), so no user can read another's tasks. Task content is user-authored, stored on-device, and in your own RLS-protected rows only if you sync.
- **Secrets stay server-side.** The Anthropic key lives only in the Cloudflare Worker; the client ships only the public Supabase publishable key; the Supabase `service_role` key is never used or exposed.
- **Client telemetry is non-identifying.** The `[doubledone.*]` events record shapes and outcomes (counts, schedule type, step counts, done/cleared), never task content or identity. It is local-only console output today; before it ever reaches a network sink it must be aggregated and anonymised (the moat rule: aggregate, anonymise, never sell).
- **AI egress + retention, to be disclosed.** The AI features (Break it down, Strategise, Sort for me) send the text you typed to the Worker and on to Anthropic. As of the AI-call telemetry, the Worker now **retains** that input and the returned JSON in the `ai_calls` table for product improvement (tuning the decompositions, the cost loop, the future crowd estimates). This is **pseudonymous**, no `user_id`, no IP, never tied to your account, and the table is insert-only so it cannot be read back through the API. But it IS task content leaving the device and being kept, a change from the earlier "not stored" posture, so it must be stated plainly in the privacy copy and surfaced in-product before any public launch.

**To do (triggers)**
- ◑ **Account and data deletion** (built 2026-06-19; migration + live test pending Melroy). A `delete_account` `SECURITY DEFINER` RPC (in `supabase/schema.sql`, scoped to `auth.uid()`, tasks cascade via the FK, no service_role) + a confirm-gated "Delete account and data" flow in Settings (`lib/account.ts`, contract-tested; the signed-in UI verified in a real browser). **Remaining (Melroy's, like the email sign-in):** run the `delete_account` function once in the Supabase SQL editor, then test it live on his own account (migrations can't be rolled back). A same-device bug where the Lookback / Today still showed deleted data until app restart on native is now fixed (focus-reload, both screens re-read the local store on focus). See decision-log 2026-06-19.
- **Remote-clear local data on a device whose account was deleted elsewhere.** Deletion wipes the server (cascade) and the originating device, but a second signed-in device keeps its local tasks / completions, local-first cannot remote-wipe a device it can't reach, and once the account is gone that device's next sync just fails auth. When a device detects its account no longer exists (an auth failure of the right shape), have it clear local data and sign out. Trigger: multi-device use is common, or before public launch.
- ✅ **A written privacy policy** (shipped 2026-06-19): in-app `/privacy` screen (public URL `doubledone.app/privacy`), linked from Settings and the README, plain-English, matching the posture. See decision-log 2026-06-19.
- ✅ **Lock down the AI endpoints** (shipped + live 2026-06-19): CORS allowlist + Origin gate + per-IP rate limit, deployed (version `3f6e03c8`) and live-verified. See the Backlog item and decision-log 2026-06-19.
- ✅ **Disclose AI egress AND retention in-product** (done 2026-06-20): the `/privacy` policy states it plainly (two taps from Settings), and the Break-it-down questions modal now carries a calm point-of-use one-liner ("sent to an AI to suggest the steps, kept anonymously to improve them"). Placed there, not on the capture surface, to keep capture uncluttered; Sort-for-me / Strategise are lighter egress, covered by the policy. Decision-log 2026-06-20.
- ✅ **Hardened `ai_calls` writes 2026-06-20.** Moved the telemetry store from the Supabase `ai_calls` table (written with the public anon key, so anyone could insert) to a **Cloudflare D1** database bound to the Worker, so there is no public write path. Verified live (a call landed one row in D1). Decision-log 2026-06-20.
- **Telemetry anonymisation at the sink.** When `[doubledone.*]` graduates from console to a real store, enforce aggregation, no task content, no identity. Trigger: when the moat store is built.
- **Document Anthropic data handling** (API inputs are not used for training by default). Trigger: before public launch.

---

## The non-negotiables (carry into every session)

- **Today is finite and achievable** is the spine. The home is Today, sized to be doable.
- **Never shame the backlog.** Celebrate closing old tasks, never punish their existence.
- **Near-zero maintenance.** Remove friction, never add a setting. The retention bar is week six.
- **Instrument completion outcomes from the first AI feature.** Telemetry before traffic. The moat depends on it.
- **Solo, direct to main, Claude handles git. Never `--no-verify`.**

Full what/why in `docs/product-spec.md`. Full why-trail in `decision-log.md`. The discipline in `PLAYBOOK.md`.
