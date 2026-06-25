# DoubleDone, Build Plan

*The operational doc: what DoubleDone is, what has shipped, what is deliberately deferred, and what is next. A fresh working session reads [`CLAUDE.md`](CLAUDE.md), then this. A reader from outside gets the arc of the build and the product thinking behind it. The full chronological why-trail lives in [`decision-log.md`](decision-log.md); the what-and-why of the product in [`docs/product-spec.md`](docs/product-spec.md).*

**Status (2026-06-25): v1.0.0.** Live at [doubledone.app](https://doubledone.app), Android sideloadable via EAS. The core product is complete and verified. Active threads: the Google Play Store listing (Melroy's), and Premium development on the `premium` branch (built in isolation, nothing deploys until merged).

---

## What DoubleDone is

A calm, ADHD / AuDHD / OCD-friendly daily to-do app. The spine: **today is finite and achievable.** The home screen is Today, sized to be doable; everything else serves protecting the user from the overwhelm of the full list, and the one rule that cannot break is **never shame the backlog**. The moat is a cross-user completion-data flywheel, instrumented from day one, aggregated and anonymised, never sold.

Stack: React Native + Expo (one codebase to Android and web), a Cloudflare Worker holding the Anthropic key (tiered Haiku / Sonnet), Supabase (Postgres + RLS) for optional sync, local-first and anonymous-first throughout.

---

## Shipped

The product is complete. Grouped by theme; every commit and its reasoning is in the decision-log.

**The daily loop.** Friction-free capture (brain-dump, plus talk-to-capture on web and an AI run-on splitter), AI triage ("Sort for me"), Break-it-down (a two-call qualify-then-decompose flow with phased plans for big tasks), Combine (the inverse: fold several tasks into one umbrella), Strategise (re-spread an over-full day), scheduling (one-off dates, recurring with a future start, task slices, push-to-tomorrow), the Repeating drawer, and the gentle close-the-day wrap.

**The Lookback and reward.** A calendar-backed Lookback of everything actually finished, complexity-weighted celebration (warmth, never points or streaks), and a held whole-task-finish "bloom" that scales with the achievement.

**The ADHD seam (Clusters A to D).** Done-is-done and Good-enough (OCD reassurance), the silent-parent decompose chain and Make-it-tiny (crossing the wall of awful), the low-capacity day and the evening wind-down (honouring the day), and Routines. Plus shame-free re-entry, "I also did that" off-plan logging, "just this one" focus mode, and the weight-of-today gauge. This is the founder-market-fit core.

**AI and the moat.** The Worker is the only thing that calls Claude; every call is logged pseudonymously to Cloudflare D1 (no user id, no IP), completion outcomes are reported anonymously, and a transparent crowd-pace estimate is surfaced at breakdown time. Telemetry shipped before the features it measures.

**Cloud and platform.** Opt-in Supabase sync (passwordless email OTP, row-level security, last-write-wins, soft-delete tombstones), full offline use, data export, and account deletion (a SECURITY DEFINER RPC, live-tested). Native Android polish (haptics, keep-awake in Focus, themed system bars, launcher shortcuts, share target) and a notification engine (per-task nudges plus daily web push).

**Design.** The "Dusk" system, then "Dusk-evolved" (a living time-of-day background, the bloom, the Rooms header), Newsreader and Atkinson Hyperlegible type, a guided first-run that onboards by doing, and a full accessibility pass.

**Developer surface.** A versioned public REST API with an OpenAPI spec and Swagger UI, and an MCP server that lets AI agents drive a user's tasks (both bearer-authed under RLS, no elevated key).

**Monetisation.** Stripe Premium (test mode, end-to-end verified), with the AI Scrapbook keepsake as the flagship paid delight. The prioritised premium backlog and the free-versus-premium wall live in **[`docs/premium.md`](docs/premium.md)**.

---

## Now and next

**v1.0.0 (2026-06-25).** Combine shipped; the Android home-screen widget disabled (react-native-android-widget 0.20.3 does not support RN 0.85's new architecture, so it never rendered, source kept for a re-enable); the daily reminder verified firing on a real device; the test-reminder debug scaffold removed; the version cut from 0.1.0.

**The active work: the Google Play Store listing.** The full step-by-step (researched and adversarially reviewed) is in **[`docs/play-store-release.md`](docs/play-store-release.md)**. Everything code-side is done: the `production` EAS profile builds an AAB, the privacy policy is served as a crawlable static page at `/privacy`, and the exact-alarm justification and Data Safety form guidance are written. What remains is Melroy's: the $25 developer account, the feature graphic (done, in `docs/store-assets/`) plus screenshots, the policy forms, then build and submit.

**Pre-launch, already done:** Stripe Premium (test mode), account deletion (live-tested), web push (live), the AI-endpoint lockdown (CORS + origin gate + rate limit), and the privacy policy (in-app and crawlable).

**Pre-launch, remaining (config and ops, not code):** flip Stripe to live mode for real charges, swap to a dedicated transactional email sender for the sign-in code (vs Supabase's shared sender), and let the crowd-pace estimate graduate to real cross-user data once there is volume.

**Premium, in active development (the `premium` branch, not deployed).** Building the paid surface in isolation, and merging to main is the deploy. The premium **feature flag** is built (the gate every paid feature reads, with a dev override for local testing), and all three premium surfaces (Settings, Lookback's scrapbook gate, the Premium screen) now read it. Pin-a-task, the server-side requirePremium guard, and OCR photo capture are all built. OCR is the `/ocr` Claude-vision route behind the guard plus an in-app camera on the brain-dump box (verified on web, awaiting an EAS Android build for the native capture). With that device test passed, premium (flag, pin, guard, OCR) is ready to merge to main. The full stack-ranked roadmap, the engineering triggers, and the free-versus-premium wall are in [`docs/premium.md`](docs/premium.md).

---

## Backlog (deferred, with triggers)

The single home for consciously parked work. Nothing here is dropped; each item has a trigger for when it earns a place in the sequence. Premium-gated ideas live in [`docs/premium.md`](docs/premium.md).

**Growth and monetisation**
- **Comp a month of premium for feedback.** Grant a feedback-giver 30 days of premium on the house: a comp entitlement (premium with a 30-day current_period_end, no Stripe charge, marked so it does not auto-renew and reverts to free cleanly). Needs a grant path (a one-time redeemable code, or an owner action keyed to a user_id) plus the entitlement write, and a calm place to ask for the feedback. Doubles as the owner's own no-charge test path (comp yourself to exercise the live app without paying). Trigger: after the live-Stripe go-live, when the feedback loop is wanted.

**AI, beyond the core**
- **Honour an explicit step count in Break-it-down.** When the user says "just 3 parts", the breakdown ignores it. The spine-friendly fix is a one-line prompt instruction ("if the person names a number of steps, use exactly that many"), not a new control. Trigger: the next prompt-tuning pass.
- **"Plan my day."** On request, arrange today's tasks into a calm suggested order and rough timing, propose-then-accept. Distinct from Strategise and Break-it-down. Trigger: pairs with energy-matching.
- **Energy-level matching.** Suggest tasks that fit current energy. Trigger: the core AI loop is solid and you want smarter sequencing.
- **Calendar read, then two-way calendar sync.** See the day's meetings to size Today, later sync tasks to Google / phone calendar (needs OAuth). Trigger: time-blindness needs calendar context (Melroy confirmed the two-way as wanted).

**Lists and collections**
- **Custom lists** (reference / someday collections that live outside Today, pulled in only when you act). Trigger: after the core loop, designed so it never turns Today into an everything-bucket.
- **A "someday" inbox** that demands no decision at capture. Trigger: with Custom lists.
- **Edit slices on an existing task** (slices are set only at capture today). Trigger: someone reaches for it.

**Scheduling and deferral**
- **Set / clear a date on an existing task** (one-off dating works at capture only). Trigger: you reach to re-date something already captured.
- **Open question: an "outstanding" section of Today** (how persistent multi-day tasks relate to must-happen-today ones). Deferred on purpose in the decision-log.

**Sync, beyond v1** (v1 is tasks-only)
- Realtime updates, Google one-tap sign-in, a web magic-link, and syncing the moat completion-data to its own anonymised store. Triggers: the respective friction shows up, or volume makes the aggregate worth mining.
- Sharing a list with another person. Trigger: a real second-user case, weighed hard against the team-tool trap the spec warns against.

**Internationalisation**
- Pass 1 shipped (locale detection, and the AI answers in the user's language). Remaining: externalise UI strings behind a typed `t()` layer, then IT / ES / FR translations (native-speaker reviewed so the calm tone survives), and localised date formatting. Trigger: after the design copy is final.

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
