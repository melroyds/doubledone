# DoubleDone, Build Plan

*The operational doc: what DoubleDone is, what has shipped, what is deliberately deferred, and what is next. A fresh working session reads [`CLAUDE.md`](CLAUDE.md), then this. A reader from outside gets the arc of the build and the product thinking behind it. The full chronological why-trail lives in [`decision-log.md`](decision-log.md); the what-and-why of the product in [`docs/product-spec.md`](docs/product-spec.md).*

**Status (2026-07-25): in review on both stores; web is live with real paying Stripe subscribers.**
- **Web:** live at [doubledone.app](https://doubledone.app), auto-deployed from `main`, carrying everything through the held-card and widget waves.
- **iOS:** v1.0 (build 10) + both subscriptions **submitted to App Review 2026-07-19**, still Waiting for Review, manual release selected. Apple IAP, the RevenueCat webhook, and the App-Review sign-in relay are all live and device-proven (a real sandbox purchase, cancellation, and the entitlement chain all verified).
- **Android:** in **closed testing** since 2026-07-12. **Production access applied for 2026-07-23** (the 12-testers-for-14-days gate for new personal accounts), awaiting Google. **versionCode 17 is the current AAB** (commit 9bdf309), carrying the design-1a held card, the working home-screen widget, and the S22 label-clip fix on top of the trial-conversion / dunning money-path fixes, the corrected in-app legal text, and the comp fix.
- *Correction: an earlier status line called v11 "LIVE on Google Play, released." It was in closed testing, never public production. Fixed here so the canonical doc stops repeating it.*

---

## What DoubleDone is

A calm, ADHD / AuDHD / OCD-friendly daily to-do app. The spine: **today is finite and achievable.** The home screen is Today, sized to be doable; everything else serves protecting the user from the overwhelm of the full list, and the one rule that cannot break is **never shame the backlog**. The moat is a cross-user completion-data flywheel, instrumented from day one, aggregated and anonymised, never sold.

Stack: React Native + Expo (one codebase to Android and web), a Cloudflare Worker holding the Anthropic key (tiered Haiku / Sonnet), Supabase (Postgres + RLS) for optional sync, local-first and anonymous-first throughout.

---

## Shipped

The product is complete. Grouped by theme; every commit and its reasoning is in the decision-log.

**The daily loop.** Friction-free capture (brain-dump, plus talk-to-capture on web and an AI run-on splitter), AI triage ("Sort for me"), Break-it-down (a two-call qualify-then-decompose flow with phased plans for big tasks), Combine (the inverse: fold several tasks into one umbrella), Strategise (re-spread an over-full day), scheduling (one-off dates, recurring with a future start, task slices, push-to-tomorrow), the Repeating drawer, and the gentle close-the-day wrap.

**The Lookback and reward.** A calendar-backed Lookback of everything actually finished, complexity-weighted celebration (warmth, never points or streaks), and a held whole-task-finish "bloom" that scales with the achievement.

**The ADHD seam (Clusters A to D).** Done-is-done (OCD reassurance), the silent-parent decompose chain and Make-it-tiny (crossing the wall of awful), the low-capacity day and the evening wind-down (honouring the day), and Routines. Plus shame-free re-entry, "I also did that" off-plan logging, "just this one" focus mode, and the weight-of-today gauge. This is the founder-market-fit core.

**AI and the moat.** The Worker is the only thing that calls Claude; every call is logged pseudonymously to Cloudflare D1 (no user id, no IP), completion outcomes are reported anonymously, and a transparent crowd-pace estimate is surfaced at breakdown time. Telemetry shipped before the features it measures.

**Cloud and platform.** Opt-in Supabase sync (passwordless email OTP, row-level security, last-write-wins, soft-delete tombstones), full offline use, data export, and account deletion (a SECURITY DEFINER RPC, live-tested). Native Android polish (haptics, keep-awake in Focus, themed system bars, launcher shortcuts, share target) and a notification engine (per-task nudges plus daily web push).

**Design.** The "Dusk" system, then "Dusk-evolved" (a living time-of-day background, the bloom, the Rooms header), Newsreader and Atkinson Hyperlegible type, a guided first-run that onboards by doing, and a full accessibility pass.

**Developer surface (REST and MCP at parity).** A versioned public REST API (OpenAPI 3.1, v1.1.0, at `/api/v1` with a browsable Swagger UI at `/api/v1/docs`), a token-authenticated CRUD-plus-query surface over a user's tasks: create-on-today with an optional future date *or* repeat cadence (never both), patch any field, and three read modes (a `q` substring search over open tasks, an `upcoming` 1-30 day look-ahead, and the app's `today` view). Alongside it, an MCP server (nine tools: add / list-today / list-upcoming / complete / update / delete, the propose-only `break_down`, and a `search` + `fetch` pair implementing the OpenAI Deep Research connector contract) that lets AI agents drive a user's tasks, with two auth paths (a pasted Supabase JWT, or OAuth 2.1 sign-in with S256 PKCE and a Disconnect kill switch). Both are bearer-authed under RLS with no elevated key, and both share the same recurrence engine (`buildRecurrence`) so a repeating task made by an agent, the REST API, or the app is identical in shape. AI actions (Break-it-down) are MCP-only by design; the REST API stays CRUD-plus-query.

**Monetisation and operations.** Stripe Premium **live** (A$5/mo or A$50/yr, a 30-day card-free trial), the AI Scrapbook keepsake the flagship paid delight, with the money path hardened (per-IP scrapbook backstop, double-subscription guard, dispute / refund / failed-payment alerts). The **launch control centre**: an hourly health sweep, a daily pulse, a dead-man's-switch heartbeat, and the $25 spend cap watched in real time (see **[`docs/operations.md`](docs/operations.md)**). The premium backlog and the free-versus-premium wall live in **[`docs/premium.md`](docs/premium.md)**.

---

## Now and next

**v1.0.0 (2026-06-25).** Combine shipped; the Android home-screen widget disabled (thought at the time to be a react-native-android-widget 0.20.3 / new-architecture incompatibility, an UNCONFIRMED diagnosis; **re-enabled 2026-07-25** with a self-diagnosing headless task after a code review found the library has supported new arch since 0.16.0, see decision-log); the daily reminder verified firing on a real device; the test-reminder debug scaffold removed; the version cut from 0.1.0.

**versionCode 11 (2026-07-12).** The production AAB, cut from commit d983bbf and code-frozen under the `android-v11` git tag, device-verified on the matching APK before the cut, web deployed from the same commit. It carries the 2026-07-07 to 07-12 wave: the Quiet interface and custom colour themes (premium), Rhythms grown to a fixed-time meds mode and minutes-granular intervals (the curated 30-minute-to-12-hour ladder), the exact-alarm reliability arc (`SCHEDULE_EXACT_ALARM` declared, the "Allow alarms & reminders" door on Android 12+, the app-open resilience sweep, the one-sentence nudge health line), energy matching inside Focus mode (freemium, 15 free picks a calendar month), share-to-capture on both platforms, cross-device sync for the big flag and for scrapbooks, and the keepsake sharing as a page with its caption baked into the pixels.

**The post-launch feedback wave (2026-07-24 to 07-25), all SHIPPED.** The first real-user feedback batch, built out in two days while the stores review. In order: **edit a task's title** inline on the held card; **missed nudges swept** on app open so they never stack into a guilt-heap (the spine fix); the **rested-screen forward count** plus **planned tasks on the Calendar** (Path C, the "did I even add that?" anxiety); the **S22 label-clip fix** (a fractional flex spacer starving a label's box, retired at the layout level); the **held card rebuilt to design 1a** (curated few + More, from a Claude Design pass Melroy picked); and the **Android home-screen widget finally working** after a month misdiagnosed, plus its shape, wordmark and an always-light variant. Details per feature in the decision-log.

**The active work: post-release monitoring.** Watch the field: the control centre's alerts and daily pulse, real-device reports on nudge delivery now that exact alarms are in, and the first cross-device scrapbook syncs. The release paperwork trail lives in **[`docs/play-store-release.md`](docs/play-store-release.md)**.

**iOS IAP: the CODE is BUILT (2026-07-18, on the `premium` branch), pending device test + Melroy's dashboard steps + the Worker deploy.** Apple IAP ships from iOS v1, parity-priced, absorbing Apple's 15% (see `decision-log.md`, 2026-07-15 for the decision and 2026-07-18 for the build; this REVERSED the old 3.1.3(b) hide-everything plan). Done in code: the `react-native-purchases` seam (iOS-only via the inverted `purchases.ios.ts` split; Android autolink excluded so no Play Billing in the AAB), the `/rc-webhook` into the shared D1 `entitlements` row (a `source` column added, migration applied live), the paywall with StoreKit prices + Apple disclosures + Restore + the double-charge guard, all four catalogs, and source-aware legal drafts. Tests green (client 512, server 404), web export + Android-exclusion are the PREM-29/30 regression guards. **Left for Melroy (see `docs/ios-iap-progress.md`):** RC_WEBHOOK_AUTH secret + matching dashboard webhook, Restore Behavior = keep-with-original, the IAP/ASC keys uploaded to RevenueCat, products to Ready-to-Submit attached to the same submission as the binary, a Sandbox Apple ID, the reviewer sign-in note, and the Worker deploy. `premium` merges to main only after his iPhone pass.

**Pre-launch, already done:** Stripe Premium **live** (real charges, the 30-day trial, the annual plan), the launch control centre, account deletion (live-tested), web push (live), the AI-endpoint lockdown (CORS + origin gate + rate limit), and the privacy policy + Terms (in-app and crawlable).

**Pre-launch, remaining (config and ops, not code):** let the crowd-pace estimate graduate to real cross-user data once there is volume. (The dedicated transactional sender was already done 2026-06-23: Resend SMTP with DKIM + DMARC and a branded OTP template; this line previously listed it stale.)

**Premium.** Tier 1 (the feature flag, pin-a-task, the server-side requirePremium guard, OCR photo capture, and the owner comp allowlist) is **merged to main and live (2026-06-26)**. The native OCR viewfinder is device-tested (Melroy confirmed the on-device round-trip, 2026-07-12). **Tier 2 is LIVE (2026-06-26):** Richer Lookback insights, Chart a course, and Plan my order / sequencing, each gate-green, verified in preview, and shipped (the Worker deployed with the `/lookback-summary`, `/chart`, `/sequence` routes, and `premium` merged to main), with the Premium page reframed to sell the whole suite. **Unlimited AI is deliberately HELD** for a product decision (building it would bake an irreversible D1 schema around an unanswered question, for no user-visible value, see the decision-log). The full stack-ranked roadmap, the triggers, and the free-versus-premium wall are in [`docs/premium.md`](docs/premium.md).

---

## Backlog (deferred, with triggers)

The single home for consciously parked work. Nothing here is dropped; each item has a trigger for when it earns a place in the sequence. Premium-gated ideas live in [`docs/premium.md`](docs/premium.md).

### The tiering (re-cut 2026-07-25)

*The old Tier 1 is finished: the whole first feedback wave shipped, and the widget works. This re-cut is made under a changed constraint, **Melroy is employed again**, so the scarce resource is now hours, not ideas. The test for Tier 1 is no longer "is this the best thing we could build" but "does this protect trust, money, or the week-six retention bar." Craft that can wait, waits.*

**Tier 1, must.**
1. **The "app comes to you" pass.** The honest answer to the retention bar, and it just became honest to build: a returning user asked for four things that already existed, one of which (the widget) was actually broken and now is not. Mostly defaults, onboarding and naming, not new surface. Highest retained-user-per-hour on the whole list.
2. **Execute the two store launches** when the queues clear (promote the AAB on Google production access; the manual-release ritual on Apple approval). Not a build, but it is the only genuinely time-sensitive thing here.

**Tier 2, should.**
3. **"Sit with me"** (stuck-task companion). The most differentiated thing left and the one only this founder would build, but a real increment needing its own copy pass, and nothing breaks while it waits.
4. **Nudge expiry while the app is CLOSED** (the native `timeoutAfter` config plugin). The open half of a spine fix; the app-open sweep already covers the common case, which is what demotes it from Tier 1.
5. **Meter the breakdown allowance.** A stated fair-use cap with no enforcement behind it is a cost promise resting on goodwill. The pattern is already solved in `lib/energy.ts`, so this is small.
6. **Scheduling gets hands:** set / clear a date on an existing task, and tap a future day on the Calendar to add to it. Promoted together because the "Calendar" rename now quietly promises scheduling the screen cannot do, and a promise the UI makes and the app breaks is a trust cost, not a feature gap.

**Tier 3, defer (each still has its trigger below).** Held-card refinements (tap-outside-to-dismiss, the wash fade); day-type inside Plan my day; Close-the-day placement; Plan my day itself; custom lists and the someday inbox; extending Quiet past Today; calendar read; honouring an explicit step count in Break-it-down (a one-line prompt fix, take it opportunistically during any prompt pass); the comp-a-month-for-feedback grant path; exact-alarm reach beyond Rhythms; R8/ProGuard; the adversarial copy audit; the analytics centre; the Spanish native review landing back into `es.ts`; the duplicate `VIS-01` case id.

**Tier 4, skip unless a trigger fires hard.** Weather-aware suggestions; web-push delivery for Rhythms (Phase W); realtime sync, Google one-tap and the web magic-link; sharing a list with another person; over-the-air updates; the Tier-2 comfort settings (high contrast, font choice); the two MCP OAuth hardening follow-ups (both rated low). These are not bad ideas, they are ideas whose cost lands before their value does.

**The one rule for the new constraint:** with limited hours, prefer the change that makes an EXISTING feature findable over the change that adds a new one. Everything in Tier 1 obeys that; most of Tier 4 breaks it.

**Quiet interface (Premium)**
- **Extend Quiet beyond the Today surface.** Quiet ships covering the whole Today experience (at-rest, capture, the held-state, the coachmark, the close-the-day wrap) plus the Settings toggle, which is where a user lives. Deliberately left on the Standard treatment for now: the transient focused overlays (Break-it-down, Strategise, the repeating / "Add to…" drawers, all built on the shared `ModalCard` card+scrim scaffold), the multi-select bar (now reached in BOTH appearances via the held card's "Select more" door, a brief non-quiet surface for an occasional bulk action, and a stronger judgment now that the bar is bulk-only), and the Lookback, Premium and Sign-in screens. Judgment call: a momentary "choose the steps" overlay arguably *should* stay a distinct focused card even in a borderless app, and the design handoff only covered Today + close-day + Settings. Trigger: Melroy tests Quiet and wants the modals / other screens quieted too, at which point give `ModalCard` a quiet variant (page-colour backdrop, borderless card) in one high-leverage change and do a dedicated quiet pass on Lookback.
- **Held-card refinements.** The held card appears instantly with the wash + inline actions. Deferred: the 120ms wash fade-in (an `Animated` value, needs a real foreground tab / device to verify, and instant is already the reduce-motion behaviour) and a tap-outside-to-dismiss overlay (dismiss is via Close, holding another row, or acting). RAISED 2026-07-17: tap-outside mattered less when the card was Quiet-only; it is now the ONLY single-task surface in both appearances, so it carries more weight. Trigger: the next on-device polish pass.

**Rhythms (recurring nudges)**
- **Exact-alarm reach beyond Rhythms.** The "Allow alarms & reminders" door lives in the Routines nudge-health block, which only renders when a Rhythm exists; a user whose only nudges are the daily reminder or per-task nudges never sees it. And per-task one-off nudges sit outside the resilience sweep (single-shot by design), so one armed inexactly before the grant stays inexact for its firing. Both accepted in the 2026-07-12 exact-alarm review. Trigger: a non-Rhythm user reports late nudges (add the door beside the Settings daily-reminder control), or task-nudge lateness reports (wire pending task nudges into the sweep from the tasks store).
- **Web-push delivery for Rhythms (Phase W).** Native local notifications ship at launch; cross-device web-push delivery is deferred. When built: a `rhythm_pushes` D1 table (endpoint + preset id + interval + window + tz, never task text), `sendRhythmNudges` on the existing hourly cron reusing the pure `rhythmDueAtHour`, and RFC 8291 payload encryption sending only the preset id (sw.js maps it to a canned string). Constraints to carry in: an hourly cron can only honour hour-level truth, and the native schedule (`rhythmFireTimes`, now minutes-granular) fires off the hour too, so a push either rides `rhythmSlotHours` (hour-level, accepting the coarser cadence) or the cron gets finer; the stored tz offset drifts across DST (store an IANA name or refresh on app-open); and the cron needs a per-hour idempotency key so a double-invoke never double-nudges. Trigger: native Rhythms have real usage AND web users ask for them.

**Growth and monetisation**
- **Comp a month of premium for feedback.** *Owner path DONE (2026-06-26):* an email allowlist in `server/src/comp.ts` makes listed emails always-premium with no Stripe charge, checked on the verified money gate, so the owner can sign in and exercise the live app for free. What remains is the per-feedback-giver grant: a 30-day comp entitlement (premium with a 30-day current_period_end, marked so it does not auto-renew and reverts to free cleanly) via a grant path (a one-time redeemable code, or an owner action keyed to a user_id) plus a calm place to ask for the feedback. Trigger: when the feedback loop is wanted.

**AI, beyond the core**
- **Meter the breakdown allowance (the energy pattern).** The ~10-a-month fair-use cap on Break-it-down is policy today with no meter behind it. Enforcement is now a solved pattern, not a schema decision: `lib/energy.ts` already does the calendar-month device-side count, the gentle warnings, and the paywall at the cap, with zero D1 involvement, so the held Unlimited AI question (server-side metering schema) stays unprejudged. Melroy called for this 2026-07-12 after the docs stated the unenforced gap plainly. Trigger: the next release cycle, or any abuse signal in the D1 spend telemetry, whichever comes first.
- **Honour an explicit step count in Break-it-down.** When the user says "just 3 parts", the breakdown ignores it. The spine-friendly fix is a one-line prompt instruction ("if the person names a number of steps, use exactly that many"), not a new control. Trigger: the next prompt-tuning pass.
- **"Plan my day."** On request, arrange today's tasks into a calm suggested order and rough timing, propose-then-accept. Distinct from Strategise and Break-it-down. Trigger: pairs with the shipped energy matching (What fits right now, 2026-07-11).
  - **Ask how the day FEELS before sorting it (Melroy, 2026-07-25).** "Plan my day is quite nice but should take the user's feelings into account." The inputs he named: is it a weekday or a day off, what is the weather, how much energy is there, and does the person want indoor or outdoor work; then sort. All cheap enough for Haiku, which is right: this is one extra call on an existing route, not a new system.
  - The shape that fits the spine: **ONE calm question with a few taps, never an interrogation.** Day-type and indoor/outdoor are free (no data, no permission, one tap each) and fold in as prompt inputs. Energy must be READ, not asked twice: energy matching already shipped and already knows, so asking again would be the app forgetting what it was told.
  - **The weather is the one to resist, and "let the AI figure it out" cannot work: a language model has no live weather data.** Real weather means a weather API plus a location permission, which is a new data source and a new permission on an app whose spine is remove-friction, and it is already parked at Tier 4 for exactly that. The move that keeps the whole intent at zero cost is to **ask instead of detect**: "staying in, or heading out?" is one tap, needs no API, no permission and no location, and the person knows their own sky better than a forecast for their postcode does. Indoor/outdoor is what the sort actually needs; the weather was only ever a proxy for it.
  - Tier 3, folded into Plan my day when it is built (do NOT ship as a separate feature). Trigger: with Plan my day.
- **Calendar read, then two-way calendar sync.** See the day's meetings to size Today, later sync tasks to Google / phone calendar (needs OAuth). Trigger: time-blindness needs calendar context (Melroy confirmed the two-way as wanted).

**Lists and collections**
- **Custom lists** (reference / someday collections that live outside Today, pulled in only when you act). Trigger: after the core loop, designed so it never turns Today into an everything-bucket.
- **A "someday" inbox** that demands no decision at capture. Trigger: with Custom lists.
- **Keep + expose Slices, with discretionary splitting** (decided 2026-06-27, see decision-log; built in the Tier 3 "actions 1-9" batch). Slices stays (a progress counter on ONE task; distinct from AI Break-it-down, which makes separate sub-tasks), but is taught and the capture hint sharpened, AND the slice count can be grown / edited on an EXISTING task. Governing rule: the split is entirely at the user's discretion (a 2-part task can become a 20-part task as they discover the parts), never auto-decomposed by the app, the manual counterpart to Break-it-down.

**Scheduling and deferral**
- **Set / clear a date on an existing task** (one-off dating works at capture only). Trigger: you reach to re-date something already captured.
- **Tap a future day on the Calendar to add a task to it.** RAISED 2026-07-25 by the "Lookback → Calendar" rename: the new name quietly promises you can schedule INTO a day, but the forward view is read-only (it shows what is already planned). The calm build is a future-day detail that offers an "Add for this day" affordance, dropping a one-off dated task onto that date (reusing the capture path + the existing `due` field), never a full drag-and-drop calendar. Trigger: the first "why can't I tap a day to add something" report, or the next Calendar-screen polish pass. Pairs naturally with "Set / clear a date on an existing task" above.
- **Open question: an "outstanding" section of Today** (how persistent multi-day tasks relate to must-happen-today ones). Deferred on purpose in the decision-log.

**Sync, beyond v1** (v1 is tasks-only)
- Realtime updates, Google one-tap sign-in, a web magic-link, and syncing the moat completion-data to its own anonymised store. Triggers: the respective friction shows up, or volume makes the aggregate worth mining.
- **Sync `manualOrder` across devices.** DONE for `big` (2026-07-12: column applied by Melroy, sync.ts mapping + the merge's tie-seed shipped; the trigger fired when his reinstall lost the marks). `manualOrder` ("Plan my order") is now the one remaining local-only field: on-device it survives sync (the merge carries it), but the order does not follow the account. Same recipe if wanted: a `manual_order integer` column first, then the sync.ts mapping. Trigger: a multi-device user reports their plan-my-order arrangement not carrying over, weighed against per-device order arguably being fine.
- Sharing a list with another person. Trigger: a real second-user case, weighed hard against the team-tool trap the spec warns against.

**Post-launch user feedback (real ADHD users, 2026-07)**
Signal from early users in the exact target audience, captured so it does not evaporate in chat. Ranked, with triggers. Nothing here builds while the stores review; it batches into the first feature build after launch clears.
- ~~**Lookback becomes the calm forward view (Path C).**~~ **SHIPPED 2026-07-24** (both halves: the rested-screen count, and planned tasks on the Calendar). Original entry kept for the reasoning: Closing the day used to hide ALL future tasks (verified on device: a day closed with tasks due tomorrow and in three days shows neither), so a user cannot confirm a capture is safe and hits the "did I even add that?" anxiety the app exists to remove. The fix must NOT dump the Later list onto the goodnight screen: that re-loads tomorrow's weight at the moment of setting it down, breaking the close (the discipline of stopping). Instead: (1) a quiet COUNT on the rested screen ("3 things are waiting for the days ahead", a number, never a list, reassurance without carrying), tappable, opening Lookback; (2) extend Lookback's calendar to show PLANNED (future-due) tasks alongside completed ones, so the door has a payoff. This is the THIRD request pointing the same way (the returning power user wanted recurring tasks visible in a calendar; the "Calendar read / two-way sync" item above is the same instinct), so treat it as one workstream, not three patches. `upcomingTasks` already computes the data, this is presentation. Tier 2. Trigger: first feature build post-launch.
- ~~**Missed nudges must expire, never stack into guilt (SPINE).**~~ **SHIPPED 2026-07-24**: delivered Rhythm / daily / routine notifications are swept from the tray the moment the app opens (per-task nudges deliberately kept, they stay actionable). STILL OPEN, the harder half: expiring them while the app stays CLOSED needs a native `timeoutAfter` config plugin (see Platform and build). Original entry: A returning power user reported a backlog of missed reminders that made her feel guilty rather than helped, a direct never-shame violation, in the wild. Missed Rhythm / reminder notifications should collapse or expire quietly, never pile up and scold. Tier 2 (spine). Trigger: the next reminders pass, and do not let it wait long, it breaks the one rule that cannot break.
- **The "app comes to you" pass (delivery and discovery).** The deepest finding: a churned-and-returned user asked for FOUR things that mostly already exist (a start-of-routine nudge [#49], the daily reminder, the Today home-screen widget [was disabled for a month on a misdiagnosis; **fixed and CONFIRMED rendering on device 2026-07-25**, so it is now a real lifeline to surface rather than a broken one], and morning task suggestions via Plan-my-day + energy matching) because the app is so calm its own lifelines are invisible, all opt-in, none surfaced. The increment is not features, it is defaults and an onboarding that explicitly OFFERS the daily reminder and the widget, plus clearer naming (a repeating TASK is not a NOTIFICATION; two things called "reminder" behaving differently is our problem). Spine-aligned (remove friction), and the honest answer to the week-six retention bar. Tier 2. Trigger: first feature build post-launch.
- **Day-type context in "Plan my day."** A user wanted a morning "is today a work day or a weekend?" prompt that shortlists tasks, close to the existing "Plan my day" backlog item; fold the day-type question in as an input when that ships. Tier 3. Trigger: with Plan my day.
- **Close-the-day placement.** On a long day the Close-the-day control sits far below the list and feels buried. A small layout consideration for the next Today polish. Tier 3.
- **"Sit with me" (stuck-task companion; body doubling). HIGH VALUE, the power user's third-round idea (2026-07-24).** The founding insight extended: Break-it-down and Make-it-tiny change a stuck task's SHAPE, but sometimes the shape is fine and the ALONENESS is the blocker. Body doubling (someone present while you do it, not doing it for you) is a real, named ADHD strategy the app has zero coverage of. The design: a rare, quiet, dismissible offer on a long-lingering task ("Want a hand starting this one?", linger already computed via createdAt for celebrations), opening a small never-shame menu of doors: Too big? -> Break it down / Make it tiny (existing, re-offered at the moment of stuckness); Hard to start alone? -> "Ask someone to sit with you" with a pre-drafted share message (the app NORMALISES asking for a buddy, it never provides one, dodging the two-sided-marketplace trap on the not-building list); Not needed any more? -> Let it go, guilt-free; Just not now? -> Move it / Someday. THE SPINE RISK, written down so it cannot be fumbled: "what's stopping you?" pointed at an old task is one wording away from shame. Never show the task's age pre-completion (linger is celebration-only today and stays that way), one task at most, rare cadence, never on a heavy day, "don't ask about this one again" always available. Invitation, never interrogation. Moat: which door was chosen and whether completion followed extends the completion flywheel to human strategies. Tier 2, its own increment with a dedicated copy pass. Trigger: the increment after the Tier 1+2 feedback wave.
- **Weather-aware suggestions.** Charming (sunny → laundry, rainy → indoor jobs) but a new data source and permission against the remove-friction rule. Tier 4, or one day a single context line inside the Plan-my-day prompt, never a standalone feature. Parked.

**Platform and build**
- **MCP OAuth hardening follow-ups (from the 2026-07-07 security pass, both rated low).** (a) `/register` (dynamic client registration) is unauthenticated by design so real connectors can self-register, but has no per-IP rate limit, throwaway-client registration spam is possible (KV cost only, no access gained); add an OTP_LIMITER-style cap if it is ever abused. (b) Orphaned `mcp_grants` custody rows can accumulate when a provider grant dies outside re-authorization (e.g. the KV grant TTL lapsing); the encrypted refresh ciphertext sits inert and unreferenced (decryptable only with MCP_GRANT_KEY). A periodic sweep joining `mcp_grants` against live provider grants would reap them. Trigger: real registration abuse, or a custody-table size worth pruning.
- **iOS via TestFlight (started 2026-07-05; first build UPLOADED 2026-07-12).** Apple Developer enrolment DONE; iPhone 16e set up (AppleCare+ transfer declined by seller, accepted); ios config DONE; EAS iOS credentials DONE (app + share-extension targets, no APNs key, local notifications only); first production build (v1.0.0 build 2) submitted to App Store Connect 2026-07-12 (ASC App ID 6790136615, the EAS Submit API key on EAS servers so later submits run headless); TestFlight internal invite received. The staged path: (1) device arrives -> the day-one checks (fresh Hello screen, Parts & Service history, iOS update, screen protector; ask the seller about the prepaid AppleCare+ transfer, if it transfers, an ~A$45 Apple screen swap makes it mint). (2) `eas build -p ios --profile preview` + `eas submit` -> TestFlight internal (no 12-tester gate). (3) The platform pass: safe areas, notification permission flow, the living background, share-intent (the expo-share-intent iOS extension is the likely first-build snag: it may need an appGroup), gestures. (4) THE PREMIUM DECISION: **MADE 2026-07-15, and it went the other way.** Apple IAP ships from iOS v1 via RevenueCat, parity-priced, absorbing the 15% ("15% of 0 is 0"). The old plan on this line (hide every purchase path under Apple 3.1.3(b), IAP only once iOS revenue justifies the cut) is SUPERSEDED, see `decision-log.md` 2026-07-15. The build work is outstanding and gates the listing. Trigger for the public App Store push: Android production access granted (the closed-test clock), never both launches in flight at once.
- **R8/ProGuard + the deobfuscation mapping.** Enable `enableProguardInReleaseBuilds` via expo-build-properties, add the React Native keep rules, smoke-test every flow on device (R8's failure mode is a feature silently dying at runtime), and upload the generated mapping file with each AAB. Prize: a few MB off the app plus readable crash traces if we ever obfuscate; also silences the Play Console's "no deobfuscation file" nag, which is cosmetic today because Expo doesn't obfuscate by default. Deliberately NOT done mid-closed-test (code-stripping risk for a cosmetic warning is the wrong trade). Trigger: app size starts to matter for listing conversion, or production-launch prep begins.

**Internationalisation**
- The full sweep SHIPPED 2026-07-04 (721 keys, en/it/es/fr catalogs, every screen wired, region-aware dates, the Android 13+ per-app language picker). Remaining: the Spanish native review lands back into `es.ts` (spreadsheet with the reviewer); an Italian and a French native pass someday (drafts ship behind per-key English fallback meanwhile); localised store listings if those markets are ever pursued deliberately. Trigger: each reviewer's availability; store listings only with a real market push.

**Platform and distribution**
- Over-the-air updates (refresh without a reinstall). Trigger: reinstalling per change gets old.
- (Play Store and the transactional email sender are tracked under "Now and next".)

**Settings and personalisation**
- Tier-2 settings: high-contrast mode, a reminder-time picker, a serif-vs-plain font choice, a deeper low-stimulation mode. Each adds surface, so each waits for a real ask. Trigger: a user asks.

**Polish and tech debt**
- B1 follow-on, a Lookback "a big one" tag on finished rows; an `onAccent` token for the white accent-fill literals; a real italic foot-phrase variant; relocating or contextualising the Routines entry (a morning card on Today); investigating the expo-router "multiple renderers" dev warning. Each is defensible as-is; trigger is a reason to touch the surface.
- Feedback follow-ups: optionally log notes to D1 as a durable backup, and swap the sender to Resend if support@ needs to be the literal To. Trigger: feedback volume or deliverability matters.

---

## The discipline of stopping (deliberately not built)

The restraint is the product. These are not gaps; they are guardrails to defend.

- **No streaks, points, or leaderboards.** Rejection-sensitive dysphoria makes a broken streak a reason to quit.
- **No folders, tags, projects, or deep customisation.** It feeds OCD perfecting and ADHD organising-as-avoidance; the no-settings spine is the feature.
- **No social or sharing by default** (sensory load and RSD).
- **No variable or surprise rewards** (autism needs predictability).
- **No AI that silently reorganises.** Always propose-then-accept; demand avoidance is real.

The one deliberate exception is the Settings page, scoped strictly to comfort and access (theme, text size, motion), never open-ended configuration.

---

## Principles (carry into every session)

- **Today is finite and achievable** is the spine. The home is Today, sized to be doable.
- **Never shame the backlog.** Celebrate closing old tasks, never punish their existence.
- **Near-zero maintenance.** Remove friction, never add a setting. The retention bar is week six.
- **Telemetry before traffic.** Instrument completion outcomes from the first AI feature; the moat depends on it.
- **Solo, direct to main, Claude handles git, never `--no-verify`.**

---

## Privacy

Privacy by architecture, not by policy promises. The app runs fully without an account; the only PII it ever holds is an email, and only if you choose to sync.

- **Local-first, anonymous-first.** Every feature works on-device; nothing leaves unless you sync or use an AI feature.
- **The only PII is an email**, for a passwordless one-time sign-in code. No name, phone, location, contacts, ads, third-party trackers, or data selling.
- **Isolated by RLS.** Supabase scopes every row to its owner.
- **Secrets stay server-side.** The Anthropic key lives only in the Worker; the client ships only the public Supabase key; the service_role key is never used.
- **AI egress is disclosed.** Break-it-down, Combine, Strategise, and Sort send the typed text to Anthropic and the Worker keeps a pseudonymous copy (no identity) to improve the features. Stated plainly in the policy and at the point of use.

Remaining triggers: remote-clear a device whose account was deleted elsewhere; enforce aggregation when telemetry graduates to a real sink; keep the policy in step with Anthropic's current data terms. Full posture in the in-app policy and the decision-log.
