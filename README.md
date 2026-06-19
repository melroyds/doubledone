# DoubleDone

[![CI](https://github.com/melroyds/doubledone/actions/workflows/ci.yml/badge.svg)](https://github.com/melroyds/doubledone/actions/workflows/ci.yml)

> A calm, ADHD-friendly daily to-do app. It takes the things you have been avoiding, breaks them into pieces small enough to actually start, shows you only what today needs, and at the end shows you everything you finished, so your brain cannot tell you that you did nothing.

**Status:** core loop live, solo build. Capture, AI triage, phased Break-it-down, recurring tasks, slices, Strategise, the Lookback, close-the-day, daily reminders, and opt-in cloud sync are all shipped on web and Android.
**Live:** [doubledone.app](https://doubledone.app) (web). Android installs via a sideloaded EAS build.

<p align="center">
  <img src="docs/screenshots/today-light.png" alt="DoubleDone Today screen in the warm light theme" width="300" />
  &nbsp;
  <img src="docs/screenshots/today-dark.png" alt="DoubleDone Today screen in the warm-charcoal dark theme" width="300" />
  <br /><br />
  <img src="docs/screenshots/settings-light.png" alt="DoubleDone Settings in light" width="300" />
  &nbsp;
  <img src="docs/screenshots/settings-dark.png" alt="DoubleDone Settings in dark" width="300" />
</p>
<p align="center"><em>Today and Settings, light and dark. The home screen is one doable day; dark follows your device, or your choice.</em></p>

---

## The idea in one line

Today is finite and achievable. The home screen is Today, sized to be doable, and the app's whole job is to keep it that way when life pushes back.

## Why it exists

Most productivity apps are built for neurotypical optimisation: more capture, more structure, streaks, points. For an ADHD, autistic, or chronically-overwhelmed brain those patterns backfire. The real failure modes are different:

- **Task-initiation paralysis** — the dreaded task is too big to start.
- **Time blindness** — "today" quietly fills with more than a day holds.
- **The discounting reflex** — the brain throws away everything you already did and says you did nothing.
- **Rejection-sensitive dysphoria** — a guilt-based, overdue-red, nagging app is not motivating, it is repelling.

DoubleDone is built around those, not around a feature checklist. The founder is in the audience and uses it daily; founder-market fit is the main asset.

## The core loop

1. **Brain-dump** everything on your mind into one friction-free box, one line per thing.
2. **AI triage** ("Sort for me") sorts the dump into today / later / break-it-down, so today stays small.
3. **Break it down** hands a dreaded task to the AI and gets back a startable plan (see below).
4. **Work the day** — a short, doable list. Tap to finish, with a soft sage check, never a shaming strike.
5. **Strategise** when the day is over-full: the AI proposes a calmer spread across coming days, and you accept or decline.
6. **Close the day** gently: what you finished, what rolls forward, zero guilt.
7. **The Lookback** is the payoff: an interactive calendar of everything you actually finished, the old dreaded things included.

## What it does

**Capture & triage**
- Friction-free brain-dump with calm scheduling chips (Today / Tomorrow / Daily / Weekly / Custom).
- AI triage ("Sort for me", Haiku) sorts a multi-line dump into today / later / break-it-down and applies it directly, because capture must be the lowest-pressure surface in the app.

**Break it down (the phased planner)**
- Two calm steps: first the AI asks **three qualifying questions** (a due date, gradual-vs-same-day pacing, and one task-specific clarifier), then it returns a plan you **review and accept** (untick any step before adding).
- A real **date picker** that the AI **pre-fills** from a date it spots in your task ("by July 15 2026" → 15 July selected).
- **Phased** for big, long-horizon tasks: the AI returns a roadmap of phases, only **phase one** is broken into steps now, and each later phase becomes a dated milestone in Later, broken down when you reach it. Today stays small while the deadline is honoured.
- Steps are spread across the runway with the dates computed on-device (deterministic, no date maths in the model).

**Working the day**
- **Slices**: track a task in parts (10 TV episodes, a 3-step chore) with a calm progress bar, no gamification.
- **Recurring tasks** (daily / weekly / every-N) with a dedicated Repeating drawer, no streaks.
- **Strategise** (Sonnet): re-spread an over-full day, always propose-then-accept.
- **Long-title marquee**: a title too long to fit scrolls gently instead of truncating, and respects reduced-motion.

**The payoff & retention**
- **The Lookback**: a true Gregorian month calendar of what you finished each day, with a warmer mark for a "big win" (a long-dreaded or chunky task finally closed). The emotional core, not a stats page.
- **Close the day**: a gentle wrap that rolls undone work forward with no guilt.
- **Daily reminder** (opt-in, native): offers the day, never nags.

**Cloud (opt-in)**
- Passwordless **email-OTP** sign-in, last-write-wins sync, soft-delete tombstones, and automatic anonymous→account migration on first sign-in. Local-first throughout: nothing requires an account.

**The moat (instrumented from day one)**
- Every AI call is logged **pseudonymously** (no `user_id`, insert-only) so the decompositions and plans we offer can be tuned on what actually gets used. Built before there was data to use, on purpose.

## Architecture

```
┌──────────────────────────── Device (local-first) ────────────────────────────┐
│  Expo app  (React Native → Android + Web, one codebase, expo-router)          │
│  • Today · capture · Break it down · Lookback · Close the day · Repeating      │
│  • AsyncStorage  (canonical local store; the whole app works with no account)  │
└───────────────┬─────────────────────────────────────────┬─────────────────────┘
                │ opt-in sync (passwordless email OTP)      │ AI features
                ▼                                           ▼
┌────────────────────────────────┐        ┌────────────────────────────────────┐
│ Supabase                       │        │ Cloudflare Worker  "doubledone-ai"  │
│ • Postgres + RLS  (tasks)      │        │ • holds ANTHROPIC_API_KEY (secret)  │
│ • Auth  (passwordless OTP)     │◀───────│ • /clarify /plan /decompose         │
│ • ai_calls  (pseudonymous)     │  log   │   /triage /strategise  (+telemetry) │
└────────────────────────────────┘        └─────────────────┬──────────────────┘
                                                             ▼
                                            ┌────────────────────────────────┐
                                            │ Anthropic Claude (tiered)      │
                                            │ Haiku  → triage, clarify       │
                                            │ Sonnet → plan, decompose,      │
                                            │          strategise            │
                                            └────────────────────────────────┘

Web: Cloudflare Pages → doubledone.app (auto-deploy on push)   Android: Expo EAS
```

The client never talks to Anthropic directly: the Worker is the only thing that holds the key. The Supabase publishable key is safe in the client; the `service_role` key is never used. The AI-telemetry table is insert-only with no user identity, so it can be written but never read back through the public API.

## Stack

| Layer | Choice | Why |
|---|---|---|
| Client | React Native + Expo (SDK 56), expo-router | One codebase to native Android **and** web; native notifications for the retention loop |
| Local store | AsyncStorage | Local-first, anonymous-first; the app is fully usable with no account |
| Sync DB | Supabase Postgres + row-level security | Privacy by architecture (every row scoped to its owner); Postgres fits the Lookback and flywheel queries |
| Auth | Supabase passwordless email OTP | No passwords stored; the lowest-friction account |
| AI backend | Cloudflare Worker | Holds the Anthropic key server-side; cheap, global, fast cold starts |
| AI models | Claude, tiered: Haiku (triage, clarify) · Sonnet (plan, decompose, strategise) | Match model cost to task; stay under a $25/mo cap |
| AI contract | Forced tool-use + enum-constrained JSON schemas, defensive parsing | Reliable structured output; a malformed response never crashes a screen |
| Moat telemetry | Supabase `ai_calls`, insert-only RLS, no `user_id` | Pseudonymous capture of every AI call for the completion-data flywheel |
| Tests | Vitest, co-located, risk-targeted | Logic + the AI request **contract** are tested (mock the SDK, assert the shape); no live AI calls in CI |
| Quality gate | golden-path harness (pre-commit Inspector, gitleaks, CI) | The whole safety net for a solo build |
| Hosting | Cloudflare Pages (web, auto-deploy) · Expo EAS (Android) | SPA web output; sideloaded APK |

## Notable decisions

The full why-trail is in [`decision-log.md`](decision-log.md); the headline calls:

- **Never shame the backlog.** Celebrate closing a task, never punish one for existing. With rejection-sensitive dysphoria, guilt mechanics are fatal. This is the one rule that cannot break, and it shapes every screen (no overdue-red, no nagging, undone work rolls forward quietly).
- **Propose-then-accept for any AI that rearranges your day.** Strategise and the Break-it-down review never silently change your list; you always confirm.
- **Capture is the exception:** triage applies directly with no review step, because the capture surface must be friction-free above all.
- **The moat, instrumented from day one.** Log every AI call pseudonymously before there is any data to use, so the flywheel is real, not retrofitted.
- **Phased breakdown over a flat dump.** A big task returns a roadmap; only phase one is broken into steps now; later phases are re-decomposed when reached rather than pre-generated and stored (no stale steps, no schema migration).
- **Date maths on-device, not in the model.** The AI orders the steps; the client computes the dates. Deterministic and cheap.
- **Privacy by architecture.** Local-first, anonymous-first; the only PII is an email, and only if you sync; RLS isolates every row; the AI key lives only in the Worker.
- **Remove friction, never add a setting.** Light-first, no theme toggle to forget, defaults that just work. The retention bar is "is an ADHD person still opening this in week six".

## What's not built yet

The backlog is kept live with a **trigger** on every item (the full list, with reasoning, is in [`BUILD-PLAN.md`](BUILD-PLAN.md)). The honest near-term picture:

- **Multi-language (Italian, Spanish, French)** — in progress; the AI will answer in the user's language. *Trigger: now.*
- **Design overhaul** — a deliberate visual pass; the calm system is intentional but due a refresh. *Trigger: feature-complete core (reached).*
- **"Other users took about X days" estimate** — the moat's user-facing payoff. *Trigger: enough anonymised cross-user volume to be honest.*
- **Plan my day · Custom lists · a Settings page** — scoped, parked against the spine so they never turn Today into an everything-bucket.
- **Public launch path** — account/data deletion, a written privacy policy, AI-endpoint lockdown, Play Store. *Trigger: before pointing real people at it.*

## Run it

```bash
npm install      # from the repo root; npm workspaces installs client/ too
npm run dev      # Expo on web, opens at the printed localhost URL
npm test         # vitest (logic + AI request-contract), non-interactive
npm run typecheck && npm run lint
```

> Native Android: `npm run android` (needs Android Studio or a connected device). Config is via env; see [`.env.example`](.env.example). The app runs fully local with no keys set; Supabase keys enable sync, and the AI features call the deployed Worker.

## Deploy it

| Target | How |
|---|---|
| Web | `git push` → GitHub Actions builds and deploys to Cloudflare Pages ([doubledone.app](https://doubledone.app)) |
| AI Worker | `npx wrangler deploy` from `server/` (holds the Anthropic key + Supabase telemetry config as Worker secrets) |
| Android | `eas build -p android --profile preview`, then sideload the APK |
| Supabase | schema-as-code in [`supabase/schema.sql`](supabase/schema.sql); migrations run in the SQL editor |

## Files

```
client/                     Expo app (Android + web, one codebase)
  src/app/                  expo-router screens
    index.tsx               Today: the home screen + every flow's orchestration
    lookback.tsx            the calendar payoff
    sign-in.tsx             passwordless email-OTP sign-in
  src/components/           BrainDump · TaskRow · BreakdownQuestions · BreakdownReview
                            DatePicker · MarqueeText · RepeatingDrawer
  src/lib/                  pure, unit-tested logic (+ co-located *.test.ts)
    tasks · today · recurrence · slices · spread · calendar · reward
    day · sync · sync-merge · storage · ai · telemetry · reminders · supabase · auth
  src/constants/theme.ts    the calm design tokens
server/                     Cloudflare Worker (the only thing that holds the AI key)
  src/index.ts              routes: /clarify /plan /decompose /triage /strategise /health
  src/{clarify,plan,decompose,triage,strategise}.ts   per-route prompt + request/response shaping
  src/telemetry.ts          pseudonymous ai_calls logging
supabase/schema.sql         tasks + ai_calls tables, RLS, migration notes
docs/                       product-spec · case-study · testing · lessons-for-next-project
decision-log.md             the contemporaneous why-trail
BUILD-PLAN.md               where we are, what is next, the triggered backlog
PLAYBOOK.md                 the reusable build discipline (golden-path)
```

## Further reading

| Doc | What it is |
|---|---|
| [`docs/case-study.md`](docs/case-study.md) | The PM narrative: the pivot, the spine, the moat, the never-shame calls, the discipline of stopping |
| [`docs/build-journal.md`](docs/build-journal.md) | The engineering complement: stack rationale, architecture, the sync/AI/privacy mechanics, the testing and golden-path discipline, and the gotchas |
| [Privacy policy](https://doubledone.app/privacy) | Plain-English: local-first, email is the only PII, AI egress disclosed, nothing sold. Also in-app via Settings → Privacy & data |
| [`docs/product-spec.md`](docs/product-spec.md) | The full v1 spec: spine, core loop, tiered features, the moat, monetisation |
| [`decision-log.md`](decision-log.md) | The why-trail, written as the work happened, including what was decided **against** |
| [`BUILD-PLAN.md`](BUILD-PLAN.md) | Where we are, the staged sequence, and the triggered backlog |
| [`docs/lessons-for-next-project.md`](docs/lessons-for-next-project.md) | Portable takeaways |
| [`docs/testing.md`](docs/testing.md) | The risk-targeted testing strategy |
| [`PLAYBOOK.md`](PLAYBOOK.md) · [`CLAUDE.md`](CLAUDE.md) | The build discipline, and working notes for any session touching this |

## Provenance

Built on the [golden-path](https://github.com/melroyds/golden-path) harness. Third portfolio piece, after [ParkProof](https://github.com/melroyds/parkproof) and the Chronoloria sibling. Solo, by Melroy D'Souza, Melbourne, 2026. MIT licensed.
