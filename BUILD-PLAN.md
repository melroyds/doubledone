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

**The core loop is complete.** A through H are all shipped and live (capture, AI decompose, in-app scheduling, recurring + the repeating drawer, cloud sync, the calendar Lookback with weighted celebration, close-the-day, Strategise, AI triage, and the daily reminder). What is left is **post-core**:

1. **Things to verify on device / in your own time** (built, need Melroy): the daily reminder firing on the Android build, and tuning any of the AI prompt placeholders (`decompose.ts` is tuned; `strategise.ts` and `triage.ts` are working placeholders).
2. **The deliberate design overhaul** (backlogged): the dramatic look-and-flow pass, now with the full feature set to design against.
3. **The ParkProof-grade GitHub** (backlogged): public-facing PM/architecture docs and a case study, mirroring ParkProof (needs ParkProof's repo as the reference).
4. The rest of the backlog (custom lists, Plan my day, Prioritise, distribution, monetisation, the /decompose lockdown before any public launch).

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

**AI, beyond the core**
- Energy-level matching (suggest tasks that fit your current energy). Trigger: Bite the Elephant and triage are solid and you want smarter sequencing.
- Calendar read (see the day's meetings to size Today). Trigger: core loop sticky and time-blindness needs calendar context.
- **External calendar two-way sync** (tasks <-> Google / phone calendar). Trigger: Melroy wants it (confirmed 2026-06-18, after in-app scheduling lands). Needs OAuth and a calendar API; the in-app scheduling model is the foundation it builds on.
- **AI complexity scoring / weightage.** Have the AI score how hard a task is, so the completion celebration is proportionate (the dreaded, complex thing earns the warmer acknowledgment). Cheapest source is deriving the score from a Bite-the-Elephant decomposition (steps x minutes), effectively free; a dedicated per-task AI score on every capture is token-heavy and adds latency. Trigger: the calendar / completion record exists (D) and you want the reward weighted.
- **"Plan my day" (AI)** (Melroy, 2026-06-18). On request, arrange today's tasks into a calm suggested order and rough timing (what to do, in what sequence), distinct from Strategise (which re-spreads an over-full day across days) and Bite the Elephant (which breaks one task into steps). Propose-then-accept like Strategise; token-cost like the other AI features. Trigger: after the core AI loop; pairs with energy-matching.

**Internationalisation (accessibility / reach)**
- ◑ **Multi-language support, starting Italian / Spanish / French** (Melroy, 2026-06-18). Make DoubleDone accessible beyond English (ParkProof shipped 9 locales; same instinct).
  - ✅ **Pass 1 (shipped 2026-06-19):** locale detection (`expo-localization` + the pure `lib/i18n` + the `lib/locale` seam), and **the AI answers in the user's language** — clarify / plan / decompose / strategise take a `language` and respond in it (triage excluded, it echoes user text). Allowlisted to prevent prompt injection. Contract-tested; needs the Worker redeploy to go live.
  - **Remaining (Pass 1 cont. + Pass 2):** externalise every **UI string** behind a small typed `t()` layer (best done after the design overhaul finalises copy), then the **IT / ES / FR translations** themselves (AI-assisted draft, ideally native-speaker reviewed so the calm tone survives), plus localising date/number formatting (`'en-AU'` is hardcoded in `lib/day` and the date picker). A manual language override lives in the Settings page. Trigger: after the design overhaul.

**Moat and AI data**
- ✅ **AI-call telemetry** (Melroy, 2026-06-18; **shipped and live**). The Worker logs every AI call (clarify / plan / decompose / strategise / triage) with its input, returned JSON, model, latency, token usage and ok/error to a Supabase `ai_calls` table, **insert-only RLS, NO user_id** (pseudonymous). Fire-and-forget via `ctx.waitUntil`. Live as of 2026-06-18: migration run, `SUPABASE_URL` + `SUPABASE_ANON_KEY` set as Worker secrets, Worker deployed. Hardening trigger (before public launch): the anon key can insert from anywhere, so add a Worker-side shared secret or rate limit, or move to Cloudflare D1 (the Worker-bound, no-public-write alternative).
- **"Other users took about X days" estimates** (Melroy, 2026-06-18). The moat's user-facing payoff: when someone Breaks Down a task, surface a calm crowd estimate from anonymised cross-user completion data ("people usually finish this in about 3 days"). Depends on the AI-call telemetry above, completion outcomes linked anonymously, task-similarity matching, and enough cross-user volume to be honest. A later build, and the genuine differentiator.

**Lists and collections**
- **Add slices to an existing task** (deferred 2026-06-18, when slices shipped). Slices are set at capture today; there is no affordance to add/edit a slice count on a task that already exists. The discovered-later case is partly served by Break-it-down. Trigger: if Melroy or a tester reaches for it, add a calm edit path (likely via long-press) without cluttering the row face.
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
- **Premium: Prioritise a task** (Melroy, 2026-06-18). A loud, in-your-face treatment to flag a task as a priority, using the bold blue->violet gradient saved in `theme.priorityGradient` (the one that proved too bold for everyday recurring rows). Uses `expo-linear-gradient` (already installed). A premium add-on. Trigger: paid tier exists.

**Settings and personalisation**
- **A full Settings page** (Melroy, 2026-06-18). A proper settings surface with UX options, starting with theme / colour choice (Melroy may borrow Chronoloria's palette). The foundation is already half-built: `theme.ts` carries a `light` and `dark` palette plus `Colors`, and the active theme is a single swappable const (the scheme switch was deliberately deferred under "remove friction, never add a setting"). A settings page reverses that deferral on purpose, so weigh it against the spine: keep it to choices that genuinely serve this audience (theme, contrast, reduced-motion, reminder time, text size) rather than open-ended config that recreates the overwhelm DoubleDone exists to remove. Colour choice is defensible as an accessibility / comfort affordance (high-contrast and specific palettes matter for parts of this audience), not feature bloat. Pairs with the design overhaul. Trigger: after the design overhaul sets the visual language; build the theming tokens first so a picker just swaps token sets.

**Polish and tech debt**
- Custom DoubleDone app icon and splash (currently the generic Expo art). Trigger: visual identity decided.
- Arbitrary-date one-off picker at **capture** (the capture chips are Today / Tomorrow / Daily / Weekly / Custom). The cross-platform `DatePicker` component now exists (built for Break it down), so this is mostly wiring it into the capture box. Trigger: you want to schedule a one-off for a specific far-off date at capture.
- Investigate the expo-router "multiple renderers" dev warning. Trigger: before launch, or if it ever surfaces in production.
- Tier-1 CI hardening: a coverage floor and a build job (PLAYBOOK). Trigger: real users, when silent regressions start costing people.
- **Lock down the AI endpoints** (`/clarify`, `/plan`, `/decompose`, `/strategise`, `/triage` are unauthenticated and CORS-open, so spammable up to the $25 cap). Trigger: before any public launch. Add an app-origin check and/or a shared token plus rate limiting.
- **Design overhaul** (Melroy, 2026-06-18). A deliberate visual and UX pass once the core loop is feature-complete: the calm look-and-flow Melroy has flagged as wanting to change, designed against the full feature set rather than piecemeal. Trigger: after the core build (F, G, H).

**Portfolio and public documentation**
- ◑ **Portfolio-grade GitHub, modelled on ParkProof** (Melroy, 2026-06-18). *README rewritten to ParkProof's shape (hero, what-it-does, architecture diagram, stack table, notable decisions, what's-not-built-with-triggers, files tree, further reading) and `docs/case-study.md` written (the PM narrative: pivot, spine, moat, never-shame, discipline of stopping) — 2026-06-19.* **Remaining:** auto-generated screenshots (deliberately deferred until after the design overhaul, since the UI is about to change), and optionally a build-journal / how-it-was-built doc like ParkProof's. Trigger for screenshots: design overhaul lands.

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
- **Account and data deletion.** A signed-in user must be able to delete their account and all cloud rows (a hard delete, not just a tombstone). Trigger: before any public launch (Australian Privacy Principles, GDPR-style right to erasure).
- **A written privacy policy** matching the posture above. Trigger: before public launch or a Play Store listing.
- **Lock down `/decompose`** (cross-ref Backlog): unauthenticated and CORS-open today. Trigger: before public launch; app-origin check and/or shared token plus rate limiting.
- **Disclose AI egress AND retention in-product**, a calm one-liner near the AI features: the text is sent to Anthropic and kept pseudonymously to improve the product. Trigger: before public launch (now a harder requirement since the Worker retains AI inputs in `ai_calls`).
- **Harden `ai_calls` writes.** The Worker writes with the public anon key, so anyone could insert rows. Add a Worker-side shared secret or rate limit, or move the store to Cloudflare D1 (Worker-bound, no public write path). Trigger: before public launch.
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
