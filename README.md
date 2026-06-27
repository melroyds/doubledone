# DoubleDone

[![CI](https://github.com/melroyds/doubledone/actions/workflows/ci.yml/badge.svg)](https://github.com/melroyds/doubledone/actions/workflows/ci.yml)

> A calm, ADHD-friendly daily to-do app. It takes the things you have been avoiding, breaks them into pieces small enough to actually start, shows you only what today needs, and at the end shows you everything you finished, so your brain cannot tell you that you did nothing.

**Status: v1.0.0, live and commercial.** DoubleDone runs at [doubledone.app](https://doubledone.app) with real paying **Stripe** subscribers since June 2026, an Android v1.0.0 build heading to the Play Store, and a launch **control centre** watching cost and health hourly. The free core loop: friction-free capture (type **or speak**), AI triage and phased **Break it down**, recurring tasks, slices, **Strategise**, the **Lookback**, close-the-day, reminders, opt-in cloud sync, plus a task **MCP server** and a public **REST API + OpenAPI** for agents and developers. The deep ADHD seam on top: **Break it down keeps the real task** as a silent background parent so a dreaded thing gets finished without ever looming, **Make it tiny** shrinks a stuck task to a 2-minute start, a one-tap **low-capacity day**, calm **Routines** with no streak to break, an evening **wind-down**, and **Done is done** for the OCD side. **Premium** (A$5/mo or A$50/yr, a 30-day card-free trial) unlocks the AI **scrapbook** keepsake, photo-to-tasks scan, richer AI, and custom themes. The whole UI has had a calm **design pass**, the privacy policy and **Terms** are in, and new users get a guided, replayable **first-run**.
**Live:** [doubledone.app](https://doubledone.app) (web). Android installs via a sideloaded EAS build, the Play Store listing in progress.

<p align="center">
  <img src="docs/screenshots/today-light.png" alt="DoubleDone Today screen in the warm light theme" width="270" />
  &nbsp;
  <img src="docs/screenshots/today-dark.png" alt="DoubleDone Today screen in the warm-charcoal dark theme" width="270" />
</p>
<p align="center"><em>Today, the home screen: one doable day. Light, and a dark that follows your device or your choice.</em></p>

<p align="center">
  <img src="docs/screenshots/lookback-light.png" alt="The Lookback: a calendar of everything finished, with completion dots" width="270" />
  &nbsp;
  <img src="docs/screenshots/scrapbook-light.png" alt="An AI scrapbook: a still-life keepsake of a finished week, with the tasks listed" width="232" />
</p>
<p align="center"><em>The Lookback, the payoff: a calendar of everything you actually finished. And the AI scrapbook, a still-life keepsake of the week whose objects evoke what you did, the finished tasks listed beneath.</em></p>

<p align="center">
  <img src="docs/screenshots/settings-light.png" alt="DoubleDone Settings in light" width="270" />
  &nbsp;
  <img src="docs/screenshots/settings-dark.png" alt="DoubleDone Settings in dark" width="270" />
</p>
<p align="center"><em>Settings, in two calm bands, Comfort (theme, text size, motion) and Access &amp; data. Never an everything-dashboard.</em></p>

<p align="center">
  <img src="docs/screenshots/welcome.png" alt="The DoubleDone first-run welcome: a calm pitch, with Begin and Skip for now" width="270" />
</p>
<p align="center"><em>First run: a calm welcome that onboards by doing. Your first brain-dump becomes a doable Today. Replayable any time from Settings.</em></p>

---

## The idea in one line

Today is finite and achievable. The home screen is Today, sized to be doable, and the app's whole job is to keep it that way when life pushes back.

## Why it exists

Most productivity apps are built for neurotypical optimisation: more capture, more structure, streaks, points. For an ADHD, autistic, or chronically-overwhelmed brain those patterns backfire. The real failure modes are different:

- **Task-initiation paralysis**, the dreaded task is too big to start.
- **Time blindness**, "today" quietly fills with more than a day holds.
- **The discounting reflex**, the brain throws away everything you already did and says you did nothing.
- **Rejection-sensitive dysphoria**, a guilt-based, overdue-red, nagging app is not motivating, it is repelling.

DoubleDone is built around those, not around a feature checklist. The founder built it for the people he works with, has managed, and is close to who live this, out of proximity rather than a personal diagnosis. That close-up empathy is the main asset.

## The core loop

1. **Brain-dump** everything on your mind into one friction-free box, one line per thing.
2. **AI triage** ("Sort for me") sorts the dump into today / later / break-it-down, so today stays small.
3. **Break it down** hands a dreaded task to the AI and gets back a startable plan (see below).
4. **Work the day**, a short, doable list. Tap to finish, with a soft sage check, never a shaming strike.
5. **Strategise** when the day is over-full: the AI proposes a calmer spread across coming days, and you accept or decline.
6. **Close the day** gently: what you finished, what rolls forward, zero guilt.
7. **The Lookback** is the payoff: an interactive calendar of everything you actually finished, the old dreaded things included.

## What it does

**Capture & triage**
- Friction-free brain-dump with calm scheduling chips (Today / Tomorrow / Daily / Weekly / Custom).
- **Talk to capture** (web): speak your brain-dump and each natural pause becomes a task line. A run-on capture, spoken or typed, can be handed to a Haiku **"Tidy this into tasks"** that splits it into clean separate lines. Native uses the keyboard's own mic.
- AI triage ("Sort for me", Haiku) sorts a multi-line dump into today / later / break-it-down and applies it directly, because capture must be the lowest-pressure surface in the app.
- **First run**: a guided welcome runs your very first brain-dump through that same triage, so the first thing you see is a doable Today, not an empty void or a tutorial wall. Replayable any time from Settings.

**Break it down (the phased planner)**
- Two calm steps: first the AI asks **three qualifying questions** (a due date, gradual-vs-same-day pacing, and one task-specific clarifier), then it returns a plan you **review and accept** (untick any step before adding).
- A real **date picker** that the AI **pre-fills** from a date it spots in your task ("by July 15 2026" → 15 July selected).
- **Phased** for big, long-horizon tasks: the AI returns a roadmap of phases, only **phase one** is broken into steps now, and each later phase becomes a dated milestone in Later, broken down when you reach it. Today stays small while the deadline is honoured.
- Steps are spread across the runway with the dates computed on-device (deterministic, no date maths in the model).
- **The real task is never lost.** Breaking a task down no longer flattens it: the original becomes a silent background parent, hidden from Today, and the steps chain to it. Finish the steps in any order and the whole task completes on its own, into the Lookback, with "you finished the whole thing". You carry one pebble at a time, the app holds the boulder.
- **Make it tiny** when even step one is too much: one tap asks a Haiku for the 2-minute version of a task ("Do my taxes" becomes "find last year's tax file and open it"). The real task waits quietly and resurfaces after the tiny start, so a pebble is progress, never a replacement.

**Working the day**
- **Slices**: track a task in parts (10 TV episodes, a 3-step chore) with a calm progress bar, no gamification.
- **Recurring tasks** (daily / weekly / every-N) with a dedicated Repeating drawer, no streaks.
- **Routines**: a calm morning or evening checklist of small steps you run as a ritual, on its own screen, with no streak to break and no habit-tracker guilt. Tick a step and it is done for today, and tomorrow it is simply fresh.
- **Low-capacity day**: one tap tells the app today is a low day, and it recalibrates the weight gauge to a gentler target with permission to do little. Per-day, never a setting, and it never touches the backlog.
- **Strategise** (Sonnet): re-spread an over-full day, always propose-then-accept.
- **Long-title marquee**: a title too long to fit scrolls gently instead of truncating, and respects reduced-motion.
- **Tap-and-hold to select**: hold a task to enter selection, then act on one or many at once via an adaptive bar, Done / Tomorrow / Move to… / Break down / Remove, with Select all. One calm gesture replaced both the old per-task long-press menu and a separate multi-select button.

**Built for the failure modes** (the product is organised around these, and the latest work deepened the answer to each)
- **Task-initiation paralysis** is now answered three ways: **Break it down** turns a dreaded task into startable steps, **Make it tiny** returns a 2-minute version of the thing you cannot begin, and **Focus mode** ("Just this one") hides everything else. Break-it-down also keeps the original as a silent background parent, so you only ever hold one small pebble, never the whole boulder.
- **Time blindness** is answered by the **weight-of-today** gauge, which keeps the day from silently overfilling, and the one-tap **low-capacity day**, which recalibrates Today to a gentler target when you have less to give.
- **The discounting reflex** is answered by **"I also did that"** (log a win that was never on the list), the **Lookback** (a calendar of everything you actually finished), and the chain's payoff: finishing the small steps completes the whole dreaded task and says so, "you finished the whole thing".
- **Rejection-sensitive dysphoria** is answered by the never-shame spine everywhere, **shame-free re-entry** after a gap, **Routines** that keep no streak to break, and an evening **wind-down** that invites you to close the day instead of nagging.
- **OCD and the perfectionism overlap** get **"Done is done"**, a calm, consistent reassurance that a finished task is filed and you can stop checking.

**The payoff & retention**
- **The Lookback**: a true Gregorian month calendar of what you finished each day, with a warmer mark for a "big win" (a long-dreaded or chunky task finally closed). The emotional core, not a stats page.
- **Close the day**: a gentle wrap that rolls undone work forward with no guilt. In the evening a quiet **wind-down** line invites the ritual, never a notification and never a nag.
- **Daily reminder** (opt-in, native): offers the day, never nags.
- **The AI scrapbook**: turn a finished week into a calm still-life keepsake (Cloudflare Workers AI), the objects evoking what you actually did, with the week's finished tasks listed beneath. The first premium delight, on free-tier neurons (no Anthropic spend). Images persist on **Cloudflare R2** and are served by URL, so the keepsake survives a cache clear and stays off the device's storage quota.

**Cloud (opt-in)**
- Passwordless **email-OTP** sign-in, last-write-wins sync, soft-delete tombstones, and automatic anonymous→account migration on first sign-in. Local-first throughout: nothing requires an account.
- **Data export**: download your tasks and everything you finished as a JSON file (no account needed). Your stuff is yours.

**Support**
- **In-app feedback**: a calm box in Settings sends your note straight to the maker (no mail client, no account), so what's broken or what you love gets heard.

**For AI agents and developers (AX + DX)**
- A stateless **MCP server** (`/mcp` on the Worker) lets Claude Desktop and other agents add, list and complete your tasks, authorised by your own token so it only ever touches your own rows under RLS. Guide in [`docs/mcp.md`](docs/mcp.md).
- A public **REST API with an OpenAPI spec** exposes the same task operations to any developer or script, under the same token and the same RLS, with no elevated key. Reference in [`docs/api.md`](docs/api.md).

**The moat (instrumented from day one)**
- Every AI call is logged **pseudonymously** (no `user_id`) to a Worker-bound **Cloudflare D1** database with no public write path, so the decompositions and plans we offer can be tuned on what actually gets used. Built before there was data to use, on purpose.
- **Both halves of the flywheel are now live.** We log the decomposition we offered *and* whether its steps actually got completed, and the silent-parent chain upgrades that signal from "the steps were ticked" to "the dreaded thing actually got done". Completion data, from people who struggle to complete, is the part a funded competitor cannot buy.

## Architecture

```mermaid
flowchart TB
    App["<b>Expo app</b> · React Native to Android + Web (one codebase, expo-router)<br/>Today · capture (type or speak) · Break it down · Make it tiny · Routines · Lookback · scrapbook<br/>AsyncStorage is the canonical local store, the whole app works with no account"]
    App -->|"opt-in sync · passwordless email OTP"| SB["<b>Supabase</b><br/>Postgres + RLS (tasks)<br/>Auth (passwordless OTP)"]
    App -->|"AI features"| W["<b>Cloudflare Worker</b> · doubledone-ai<br/>holds ANTHROPIC_API_KEY (secret)<br/>/clarify /plan /decompose /triage /strategise<br/>/split /tiny (Haiku) · /scrapbook (Workers AI)<br/>/mcp (agents, AX) · public REST + OpenAPI (DX)<br/>web-push daily nudge (Cron)"]
    W -->|"tasks via MCP and REST, under your own RLS"| SB
    W -->|"telemetry + completion outcomes"| D1["<b>Cloudflare D1</b><br/>pseudonymous AI-call + completion log<br/>no public write path"]
    W -->|"scrapbook images"| R2["<b>Cloudflare R2</b> · doubledone-scrapbooks<br/>keepsake images, served by URL"]
    W -->|"AI"| AN["<b>Anthropic Claude</b> (tiered)<br/>Haiku · Sonnet"]
```

*Web: Cloudflare Pages → [doubledone.app](https://doubledone.app) (auto-deploy on push). Android: Expo EAS. The client never holds the Anthropic key; the Worker does.*

The client never talks to Anthropic directly: the Worker is the only thing that holds the key. The Supabase publishable key is safe in the client; the `service_role` key is never used. The AI telemetry lives in a Worker-bound Cloudflare D1 database with no public write path and no user identity, so it cannot be written (or read) through any public API. The MCP server holds no elevated key either: it acts only with the user's own token, under the same RLS.

## Stack

| Layer | Choice | Why |
|---|---|---|
| Client | React Native + Expo (SDK 56), expo-router | One codebase to native Android **and** web; native notifications for the retention loop |
| Local store | AsyncStorage | Local-first, anonymous-first; the app is fully usable with no account |
| Sync DB | Supabase Postgres + row-level security | Privacy by architecture (every row scoped to its owner); Postgres fits the Lookback and flywheel queries |
| Auth | Supabase passwordless email OTP | No passwords stored; the lowest-friction account |
| AI backend | Cloudflare Worker | Holds the Anthropic key server-side; cheap, global, fast cold starts |
| AI models | Claude, tiered: Haiku (triage, clarify, split, tiny, ocr) · Sonnet (plan, decompose, strategise, chart, sequence, lookback-summary) | Match model cost to task; stay under a hard $25/mo cap, watched hourly by the control centre |
| AI contract | Forced tool-use + enum-constrained JSON schemas, defensive parsing | Reliable structured output; a malformed response never crashes a screen |
| Moat telemetry | Cloudflare D1 (`ai_calls`), Worker-bound, no `user_id` | Pseudonymous capture of every AI call for the flywheel; no public write path |
| Premium delight | Cloudflare Workers AI (scene → image) | The AI scrapbook, on free-tier neurons, no Anthropic spend |
| Image storage | Cloudflare R2 (`doubledone-scrapbooks`) | Durable scrapbook keepsakes served by URL; the heavy image lives off the localStorage quota |
| Agent + developer surface (AX + DX) | MCP server (`/mcp`) + a public REST API with OpenAPI, bearer-token | Agents and scripts drive tasks under the user's own RLS, no elevated key |
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
- **Break-it-down keeps the real task, it never flattens it.** The original becomes a silent background parent and the steps chain to it, so finishing the steps finishes the whole task. The alternative, replacing the task with its steps, loses the dreaded thing the user actually has to finish, which is the exact trap this audience falls into.
- **Routines keep no streak, by data shape.** A routine stores only each step's last-ticked date, never a count or a history, so there is nothing to break and nothing to feel guilty about. The never-shame rule is in the model, not just the copy.
- **Date maths on-device, not in the model.** The AI orders the steps; the client computes the dates. Deterministic and cheap.
- **Privacy by architecture.** Local-first, anonymous-first; the only PII is an email, and only if you sync; RLS isolates every row; the AI key lives only in the Worker.
- **Remove friction, never add a setting.** Light-first, no theme toggle to forget, defaults that just work. The retention bar is "is an ADHD person still opening this in week six".

## v2 roadmap (consciously parked)

v1 is complete and live. These are deliberately deferred, each with a **trigger** for when it earns a place (the full list, with reasoning, is in [`BUILD-PLAN.md`](BUILD-PLAN.md)):

- **In-app language picker + full UI translation.** The typed-translation foundation is in (English live; Italian, Spanish, French draft catalogs await native sign-off), and the AI already answers in the user's language. The picker and the per-screen migration are the remaining half. *Trigger: the translations are blessed.*
- **"Other users took about X days" estimate**, the moat's user-facing payoff. Both halves of the flywheel are instrumented (the decomposition offered, and an anonymised completion ping); the surface stays an honest *derived* estimate until there's enough real cross-user volume. *Trigger: enough volume.*
- **Scrapbook cross-device sync**, the images are durable on R2; syncing their URLs to your account so they follow you to a new device is the remaining half. *Trigger: demand from synced users.*
- **Higher-tier planners beyond the current premium set**, scoped against the spine so they never turn Today into an everything-bucket. *Trigger: a real need the spine can absorb.*
- **The Play Store listing** (copy, the data-safety form, screenshots) and a dedicated transactional email sender. *Trigger: the public Android launch, in progress.*

*Graduated out as they shipped: the full UI design pass and the marketing landing, the guided first-run, the completion-telemetry flywheel, **Stripe Premium (live)** with the 30-day trial and the annual plan, the **launch control centre**, the **ADHD product seam** (Make-it-tiny, the silent-parent chain, the low-capacity day, the wind-down, Routines), **talk-to-capture**, the **public REST API**, the **i18n foundation**, data export, in-app feedback, the privacy policy and **Terms**, and AI-endpoint lockdown. Items leave here as they land.*

## Run it

```bash
npm install      # from the repo root; npm workspaces installs client/ too
npm run dev      # Expo on web, opens at the printed localhost URL
npm test         # vitest (logic + AI request-contract), non-interactive
npm run typecheck && npm run lint
```

> Native Android: `npm run android` (needs Android Studio or a connected device). Config is via env; see [`.env.example`](.env.example). The app runs fully local with no keys set; Supabase keys enable sync, and the AI features call the deployed Worker.

> Screenshots: `npm run shots` regenerates [`docs/screenshots/`](docs/screenshots) by driving the running dev server in headless Chrome and seeding each state via `localStorage` (deterministic, no clicking through flows). See [`scripts/screenshots.mjs`](scripts/screenshots.mjs); it uses the system Chrome (no browser download) and makes one free Workers-AI call for the scrapbook image (`AI_OFF=1` to skip it). Add a screen by adding a `SHOTS` entry.

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
    welcome.tsx             the guided first-run (redirected to once; replayable from Settings)
    lookback.tsx            the calendar payoff
    routines.tsx            morning / evening checklists (never a streak)
    sign-in.tsx             passwordless email-OTP sign-in
  src/components/           BrainDump · TaskRow · BreakdownQuestions · BreakdownReview
                            DatePicker · MarqueeText · RepeatingDrawer
  src/lib/                  pure, unit-tested logic (+ co-located *.test.ts)
    tasks · today · recurrence · slices · spread · calendar · reward · estimate
    day · sync · sync-merge · storage · ai · telemetry · reminders · nudge · routines · supabase · auth
  src/constants/theme.ts    the calm design tokens
server/                     Cloudflare Worker (the only thing that holds the AI key)
  src/index.ts              routes: /clarify /plan /decompose /triage /strategise /split /tiny /scrapbook /mcp · public REST API (/api/v1) /health
  src/{clarify,plan,decompose,triage,strategise,split,tiny}.ts   per-route prompt + request/response shaping
  src/scrapbook.ts          the Workers-AI still-life pipeline (the scrapbook)
  src/mcp.ts                the task MCP server (bearer-token, proxies to Supabase under RLS)
  src/{api,openapi}.ts      the public REST API + its OpenAPI spec (same token, same RLS)
  src/telemetry.ts          pseudonymous AI-call logging → Cloudflare D1
  d1/schema.sql             the D1 telemetry schema
supabase/schema.sql         tasks + RLS (the ai_calls table is superseded by D1)
docs/                       product-spec · case-study · testing · mcp · qa/ · lessons-for-next-project
decision-log.md             the contemporaneous why-trail
BUILD-PLAN.md               where we are, what is next, the triggered backlog
PLAYBOOK.md                 the reusable build discipline (golden-path)
```

## Further reading

| Doc | What it is |
|---|---|
| [`docs/case-study.md`](docs/case-study.md) | The PM narrative: the pivot, the spine, the moat, the never-shame calls, the discipline of stopping |
| [`docs/build-journal.md`](docs/build-journal.md) | The engineering complement: stack rationale, architecture, the sync/AI/privacy mechanics, the testing and golden-path discipline, and the gotchas |
| [Privacy policy](https://doubledone.app/privacy) · [Terms](https://doubledone.app/terms) | Plain-English: local-first, email is the only PII, AI egress and the control-centre alerts disclosed, nothing sold; plus the Terms of Service and refund policy. Both in-app via Settings |
| [`docs/product-spec.md`](docs/product-spec.md) | The full v1 spec: spine, core loop, tiered features, the moat, monetisation |
| [`docs/cost-analysis.md`](docs/cost-analysis.md) | What it costs to run, modelled at 100 / 1k / 10k / 100k users; where the money goes |
| [`docs/commercialisation.md`](docs/commercialisation.md) | The commercial story: value prop, monetisation, unit economics, growth loops, success metrics |
| [`docs/mcp.md`](docs/mcp.md) | The MCP server: endpoint, auth, the three tools, and connecting Claude Desktop |
| [`docs/api.md`](docs/api.md) | The public REST API: endpoints, the OpenAPI spec, token auth, and example calls |
| [`docs/qa/`](docs/qa) | The end-to-end manual test suite (fillable `.xlsx` + readable `.md`) |
| [`decision-log.md`](decision-log.md) | The why-trail, written as the work happened, including what was decided **against** |
| [`BUILD-PLAN.md`](BUILD-PLAN.md) | Where we are, the staged sequence, and the triggered backlog |
| [`docs/lessons-for-next-project.md`](docs/lessons-for-next-project.md) | Portable takeaways |
| [`docs/testing.md`](docs/testing.md) | The risk-targeted testing strategy |
| [`PLAYBOOK.md`](PLAYBOOK.md) · [`CLAUDE.md`](CLAUDE.md) | The build discipline, and working notes for any session touching this |

## Provenance

Built on the [golden-path](https://github.com/melroyds/golden-path) harness. Second portfolio piece, after [ParkProof](https://github.com/melroyds/parkproof). Chronoloria, its richer unpublished sibling, was the first cut of the same instinct; DoubleDone is the leaner, shipped version. Solo, by Melroy D'Souza, Melbourne, 2026. MIT licensed.
