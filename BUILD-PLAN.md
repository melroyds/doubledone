# DoubleDone, Build Plan

*The operational doc. Where we are, what is next, in what order. If you are a fresh session, read this after CLAUDE.md and you know exactly where to start.*

---

## Current state (as of 2026-06-18)

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

## The immediate next action

**F: Strategise (step 11).** D (calendar-backed Lookback + weighted celebration) and E (close-the-day wrap) are shipped and live. Next in the agreed order D -> E -> F -> G -> H is Strategise: when Today is over-full, Sonnet re-spreads it calmly across the coming days, never all-at-once pressure. It is the "drowning" relief valve and the second live AI feature after Bite the Elephant, so it carries the same $25-cap cost discipline (one Worker route, contract-tested, minimal live calls). CX/UX is changing look-and-flow only, so this logic is safe to build now.

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
5. ✅ **Bite the Elephant**, Sonnet decomposition of a stuck task into atomic time-boxed steps, dropped into Today. Completion outcomes instrumented (the moat starts here). *Done 2026-06-18.*
6. **AI triage / hydration**, sort the brain-dump into today / later / decompose (Haiku, cheap)
7. **Recurring daily tracker**, the repeating-tasks subsection

## Tier 2 (what makes it sticky)

8. ✅ **The Lookback, backed by an interactive calendar** ("D1"). A true Gregorian calendar you open any time and browse by day, showing what you completed and when. *Done 2026-06-18.*
9. ✅ **Complexity-weighted celebration** ("D2"). Closing a long-dreaded or chunky task gets a bigger calendar dot and a warm "a big one", weighting the *warmth* of the acknowledgment, never points / streaks. Score derived cheaply from a Bite-the-Elephant decomposition. *Done 2026-06-18.*
10. ✅ **Close-the-day wrap** ("E"), gentle, rolls forward, zero guilt, lives on Today as a calm wrap card. *Done 2026-06-18.*
11. **Strategise** ("F", next), Sonnet re-spreads an over-full day
12. ✅ **Supabase auth + sync**, opt-in cloud durability, RLS for privacy (verified live end-to-end 2026-06-18)
13. **Gentle nudges / notifications / reminders**, native, the retention lever. A reminder is a gentle offer to do a specific thing at the right moment ("time for X"), never a demand or a nag, demand-avoidance safe for the AuDHD audience. Melroy flagged reminders as a key design consideration (2026-06-18).
14. ✅ **Repeating-tasks panel** (a right-side slide-open drawer). Daily/recurring and one-off project tasks are different mental modes, each with its own home. A "Repeating" link in the Today header opens a drawer listing all recurring tasks with their cadence; today's due ones still also appear on Today (the recommended option, so habits stay visible). Calm list, no streaks. *Done 2026-06-18.*

## Backlog (deferred work, with triggers)

The single home for everything we have consciously parked. Nothing here is dropped. Each item has a trigger for when it earns a place in the sequence above. When we defer something in a session, it lands here.

**Sync, beyond v1** (v1 is tasks-only, step 12)
- Live / realtime updates (changes appear on the other device without a refresh). Trigger: v1 sync is stable and the refresh delay actually annoys you.
- Google one-tap sign-in alongside the email code. Trigger: sign-in friction shows up, or real users ask.
- Clickable email magic-link on web, in addition to the typed code. Trigger: you want one-tap web sign-in and the deep-linking is set up.
- Sharing a list with another person. Trigger: a real second-user case (caution: this edges toward the team-tool trap the spec warns against, weigh hard).
- Syncing the cross-user completion data (the moat flywheel) to its own anonymised store. Trigger: enough users that the aggregate is worth mining, pairs with the AI features.

**AI, beyond the core**
- Energy-level matching (suggest tasks that fit your current energy). Trigger: Bite the Elephant and triage are solid and you want smarter sequencing.
- Calendar read (see the day's meetings to size Today). Trigger: core loop sticky and time-blindness needs calendar context.
- **External calendar two-way sync** (tasks <-> Google / phone calendar). Trigger: Melroy wants it (confirmed 2026-06-18, after in-app scheduling lands). Needs OAuth and a calendar API; the in-app scheduling model is the foundation it builds on.
- **AI complexity scoring / weightage.** Have the AI score how hard a task is, so the completion celebration is proportionate (the dreaded, complex thing earns the warmer acknowledgment). Cheapest source is deriving the score from a Bite-the-Elephant decomposition (steps x minutes), effectively free; a dedicated per-task AI score on every capture is token-heavy and adds latency. Trigger: the calendar / completion record exists (D) and you want the reward weighted.
- **"Plan my day" (AI)** (Melroy, 2026-06-18). On request, arrange today's tasks into a calm suggested order and rough timing (what to do, in what sequence), distinct from Strategise (which re-spreads an over-full day across days) and Bite the Elephant (which breaks one task into steps). Propose-then-accept like Strategise; token-cost like the other AI features. Trigger: after the core AI loop; pairs with energy-matching.

**Lists and collections**
- **Custom lists** (Melroy, 2026-06-18), e.g. a long-running "TV shows to watch". Named collections that live OUTSIDE Today, so the daily list stays finite and achievable (the spine). You browse a list on its own surface (like the Repeating drawer) and pull an item into Today only when you actually want to act on it. Reference / someday lists, not daily pressure. Trigger: after the core loop; design it so it never turns Today into an everything-bucket.

**Platform and distribution**
- Play Store release, versus the current sideloaded APK. Trigger: polished enough to show publicly and you want auto-updates plus the store-listing portfolio signal (~$25 one-off plus review).
- Over-the-air updates (refresh the installed app with no reinstall). Trigger: reinstalling for each change gets old.
- A real transactional email provider for sign-in mail, versus Supabase's shared sender. Trigger: real users, or test mail landing in spam.

**Developer surface (AX / DX)**
- Public REST API plus OpenAPI spec. Trigger: a reason for outside integrations, or the portfolio wants the DX story.
- MCP server (let AI agents drive DoubleDone). Trigger: same.

**Monetisation**
- Paid tier via Stripe, gating the genuinely expensive AI features. Trigger: the AI features prove their value and you are ready to charge.
- **Premium: AI "chart a course of action".** Give the AI your goal and requirements and it returns a weighted plan of action (scored, ordered steps toward the goal), beyond decomposing a single task. Genuinely token-heavy, so it is a paid feature by design (Melroy, 2026-06-18). Trigger: core AI features proven and the Stripe paid tier exists.

**Polish and tech debt**
- Custom DoubleDone app icon and splash (currently the generic Expo art). Trigger: visual identity decided.
- Arbitrary-date one-off picker (capture offers Today / Tomorrow / Daily / Weekly for now). Trigger: you want to schedule for a specific far-off date; needs a cross-platform date-picker choice.
- Delete-a-task gesture (today you can complete but not remove). Trigger: soon, it is a basic gap, promote to the sequence when sync or close-the-day lands.
- Investigate the expo-router "multiple renderers" dev warning. Trigger: before launch, or if it ever surfaces in production.
- Tier-1 CI hardening: a coverage floor and a build job (PLAYBOOK). Trigger: real users, when silent regressions start costing people.
- **Lock down the /decompose AI endpoint** (currently unauthenticated and CORS-open, so spammable up to the $25 cap). Trigger: before any public launch. Add an app-origin check and/or a shared token plus rate limiting.
- **Design overhaul** (Melroy, 2026-06-18). A deliberate visual and UX pass once the core loop is feature-complete: the calm look-and-flow Melroy has flagged as wanting to change, designed against the full feature set rather than piecemeal. Trigger: after the core build (F, G, H).

**Portfolio and public documentation**
- **Portfolio-grade GitHub, modelled on ParkProof** (Melroy, 2026-06-18). Make the public repo read like ParkProof's: public-facing docs of the PM thinking, key decisions, and architecture, a strong README, an architecture overview, the decision-log surfaced as a narrative, and a case-study writeup of the spine, the moat, and the never-shame calls. Needs ParkProof's repo as the exact reference to mirror. Trigger: after the core build.

---

## Privacy and Security

Privacy by architecture, not by policy promises. DoubleDone runs fully without an account, and the only piece of personally identifying information it ever holds is an email address, and only if you choose to sync.

**The posture (true today)**
- **Local-first, anonymous-first.** Every feature works on-device with no account. Nothing leaves the device unless you opt into sync or use an AI feature.
- **The only PII is an email**, captured solely to sync your tasks across devices (passwordless one-time code, no password stored). No name, phone, location, device fingerprint, contacts, or analytics identity. No ads, no third-party trackers, no selling data, ever.
- **Your data is yours, and isolated.** Supabase row-level security scopes every row to its owner (`auth.uid() = user_id`), so no user can read another's tasks. Task content is user-authored, stored on-device, and in your own RLS-protected rows only if you sync.
- **Secrets stay server-side.** The Anthropic key lives only in the Cloudflare Worker; the client ships only the public Supabase publishable key; the Supabase `service_role` key is never used or exposed.
- **Telemetry is non-identifying.** The `[doubledone.*]` events record shapes and outcomes (counts, schedule type, step counts, done/cleared), never task content or identity. It is local-only console output today; before it ever reaches a network sink it must be aggregated and anonymised (the moat rule: aggregate, anonymise, never sell).
- **AI egress, disclosed.** Bite the Elephant sends the task text you typed to the Worker and on to Anthropic to decompose it; the Worker does not store it. This is the one case where task content leaves the device, and it is to be stated plainly in the privacy copy.

**To do (triggers)**
- **Account and data deletion.** A signed-in user must be able to delete their account and all cloud rows (a hard delete, not just a tombstone). Trigger: before any public launch (Australian Privacy Principles, GDPR-style right to erasure).
- **A written privacy policy** matching the posture above. Trigger: before public launch or a Play Store listing.
- **Lock down `/decompose`** (cross-ref Backlog): unauthenticated and CORS-open today. Trigger: before public launch; app-origin check and/or shared token plus rate limiting.
- **Disclose AI egress in-product**, a calm one-liner near Bite the Elephant. Trigger: before public launch.
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
