# DoubleDone, build journal

*How it was actually built. The [case study](case-study.md) is the product thinking; this is the engineering: the stack and why, the architecture, the trade-offs in code, and the bugs worth remembering. The contemporaneous trail is in [`decision-log.md`](../decision-log.md); this is the synthesis.*

---

## Stack, and why

React Native + Expo (SDK 56, RN 0.85) for one codebase to native Android and web · Supabase (Postgres + Auth + row-level security) for opt-in sync · a small Cloudflare Worker holding the Anthropic key · tiered Claude (Haiku for cheap paths, Sonnet for reasoning) · local-first and anonymous-first.

This is deliberately **not** the stack of the previous portfolio piece (a Vite PWA on AWS Lambda + DynamoDB). The reasoning:

- A daily-habit app genuinely benefits from **native notifications and home-screen presence**; web push is weaker, especially on iOS.
- **Postgres fits the queries** the product needs (the Lookback, completion deltas, the cross-user flywheel) far better than a key-value store.
- **Supabase RLS gives privacy as architecture**, not as a promise.
- The sibling project already proved this exact stack, so the patterns were fresh rather than re-learned.

The one notable swap from the original plan: the AI backend is a **Cloudflare Worker, not a Render service**. A Worker is effectively free at this scale, cold-starts in single-digit milliseconds, and gives a first-class secret store and rate-limiting binding without standing up a server.

## Architecture at a glance

```
client/    Expo app (native Android + web from one codebase; expo-router)
server/    Cloudflare Worker: the only thing that holds the Anthropic key
supabase/  schema + RLS, as code
```

An **npm-workspaces monorepo**. The root holds no app code; its scripts delegate into `client` (and now `server`), and the Inspector + CI run from the root. The client is pure-logic-in-`lib`, screens-in-`app` (expo-router file routes), components co-located. The hard rule that shapes the whole codebase: **the client never calls Claude directly.** Every AI request goes client → Worker → Anthropic, so the key only ever lives as a Worker secret.

## Local-first, and the sync engine

Everything works with no account. Tasks live on-device (AsyncStorage), seeded once on first run so the first open is not an empty void. Sync is **opt-in**: sign in with a six-digit email code (passwordless), and the local list reconciles with your account.

The merge is **last-write-wins by `updatedAt`**, with **soft-delete tombstones** (`deletedAt`) so a deletion propagates instead of resurrecting on the next pull. The merge/tombstone logic is a **pure module with unit tests**, the part most likely to silently corrupt data is the part that never touches the network or React. RLS scopes every row to `auth.uid() = user_id`, so the database enforces isolation regardless of what any client sends.

## The AI architecture

- **Tiered models for cost.** Haiku on the friction-free paths (triage, the clarifying questions); Sonnet where reasoning matters (planning, decomposition, re-spreading a day). A $25/month cap is the backstop.
- **Forced tool-use with constrained schemas.** Every call uses `tool_choice` to force a single tool whose `input_schema` constrains the shape (enums for buckets, integers for minutes). The response is then parsed **defensively**, a malformed or partial model response yields an empty result, never a thrown error that reaches a screen.
- **The request contract is the test surface.** The Worker code is unit-tested by asserting the *shape* of the request it builds (right endpoint, model, tool, the user content present) and by parsing known-good and known-bad responses. The model's reasoning is never asserted in CI; that would be flaky and is not the code's job.
- **Date maths on-device, not in the model.** The AI orders steps; the client computes the dates (`lib/spread`). Deterministic, free, and testable.
- **The endpoints are locked down.** A CORS allowlist (app origins only), an Origin gate (a disallowed browser origin is refused before any Claude call), and a per-IP Cloudflare rate limit. The rate limit is the real cost guard for native (which sends no Origin); the spend cap is the final backstop.

## The scrapbook (a second AI surface, off the Anthropic budget)

The first premium delight turns a finished week into a calm still-life keepsake in the Lookback. It is a two-step **Workers AI** pipeline on the same Worker, deliberately *not* an Anthropic call: a small Llama model distils the week's finished task titles into a one-sentence still-life scene (objects that evoke the tasks, never text), then FLUX renders it. Workers AI runs on free-tier neurons, so the feature costs nothing against the $25 Anthropic cap. The image is device-local for now (base64), with the week's finished tasks listed beneath the keepsake so you *see* the week even before the picture loads. Lesson banked: Workers AI model ids deprecate on a date (an 8B Llama retired mid-build, surfacing as error 5028), so `wrangler ai models` is the source of truth, not memory.

## The MCP server (the agent surface)

A small, stateless **Model Context Protocol** server at `/mcp` lets an AI agent (Claude Desktop, the Inspector) add, list and complete tasks. It speaks MCP Streamable HTTP (JSON-RPC over a single POST). The design call that matters: **auth is the user's own Supabase access token**, pasted into their client, and every tool proxies to Supabase REST *with that token*, so row-level security scopes it to exactly their rows and the server holds no elevated key. A plain stateless Worker route beat the heavier `McpAgent` (its OAuth model and durable-object state buy nothing here). The pure parts (tool schemas, the JWT-sub decode, the request builders, the JSON-RPC envelopes) are unit-tested; only the I/O glue is not.

## The REST API (the developer surface)

Beside the agent surface sits the human-integrator one: a versioned REST API at `/api/v1/tasks` (list with `?today`, create) and `/api/v1/tasks/{id}` (get, patch, delete), returning a clean camelCase task shape, with a delete writing a `deleted_at` tombstone so it propagates through the same sync model the app uses. The contract is an **OpenAPI 3.1 spec** at `/api/v1/openapi.json`, and a self-contained **Swagger UI** at `/api/v1/docs` is the browsable console a hiring PM or integrator actually opens. Spec and docs are public; the task routes require a token.

The auth decision is the load-bearing one, and it is the same call MCP made: the bearer token is the user's own Supabase access token, proxied straight to Supabase REST so RLS scopes every call to that user's rows and the Worker holds no elevated key. A long-lived API-key system was rejected for v1 on principle, not just scope: a real key system would force the Worker to map a key to a user and act as them, which means holding the `service_role` key and bypassing RLS, breaking privacy-by-architecture. The honest cost is the roughly hourly token refresh. A future key system is noted, bound by the constraint that it must keep the no-elevated-key model (exchange a key for a scoped token, never hold service_role). The pure builders, body parsers, and route dispatch are unit-tested with `fetch` mocked.

## Privacy by architecture

The only PII the app can ever hold is an email, and only if you choose to sync. Beyond that:

- **Secrets stay server-side.** The Anthropic key is a Worker secret; the client ships only the public Supabase publishable key; the service-role key is never used.
- **Telemetry is pseudonymous and has no public write path.** AI calls are logged with no `user_id` and no IP to a **Cloudflare D1** database bound to the Worker, so nothing public can write it (or read it). It exists to tune decompositions and, eventually, to power the cross-user estimate, aggregate, anonymise, never sell. (It began as a Supabase `ai_calls` table written with the public anon key; moving it to Worker-bound D1 closed that write path.)
- **Right to erasure is real.** A `SECURITY DEFINER` RPC scoped to `auth.uid()` lets a signed-in user delete their account and cascade their data, with no elevated client privileges.

## The design system in code (Dusk)

The "Dusk" palette is warm and calm by intent, paper light, charcoal-brown dark (never terminal black), a single dusky-mauve accent, sage for done (never an alarming green). Two implementation notes worth recording:

- **Reactive theming.** A `ThemeProvider` exposes `useTheme` / `useThemedStyles`; every component's styles are built from a `(theme) => StyleSheet.create(...)` factory, so theme, text-size, and reduced-motion changes re-paint the whole app live with no reload. Colours come from `theme.colors`; every font size is multiplied by a `scale` factor (the text-size setting).
- **Fonts the hard, correct way.** React-Native-Web gives every `<Text>` its own default font, so a page-level CSS font never reaches body text. The fix is explicit per-style font tokens (Newsreader for headings, the Braille Institute's Atkinson Hyperlegible for body), backed by CSS variables on web and by `expo-google-fonts` families loaded in the root layout on native. Verbose, but version-independent and native-ready.

## The redesign, and the front door

Feature-complete is not finished. After the core loop landed, the founder's own verdict was that Today had grown cluttered. Features had each arrived as one more link in a day-actions row. The fix was a system-pass redesign run as a string of small **verified increments**: one surface at a time, `typecheck`/`lint`/`tests` green and the behaviour preview-verified before each commit, with a decision-log entry per slice. A dozen commits, never more than one screen in flight.

The engineering scope call mirrored the product one: of seven surfaces only Today needed a rebuild; the rest were already at spec and took refinements or nothing. Today's interaction overhaul collapsed two separate mechanisms (a per-task long-press menu and a separate multi-select button) into **one tap-and-hold gesture** with an adaptive action bar that offers Break-it-down only when a single task is selected. A small shared helper (`presetDate`) now backs both the new "Move to…" picker and the Break-it-down due chips, so "This week" resolves to the same date in both.

The one net-new surface was a **first-run**. It is a normal expo-router screen (`/welcome`) plus a one-key `onboarded` flag in storage; Today redirects to it once on mount when the flag is unset. The detection is keyed off the flag, **not** task count. A fresh install seeds example tasks, so "no tasks" would be the wrong signal. The reveal runs the user's first brain-dump through the *real* `/triage` path (with an all-to-today fallback if the AI is unreachable), so there is no separate demo code to rot. Replaying it from Settings is non-destructive: in replay mode the confirm **merges** into the existing list instead of overwriting, so a returning user can never lose their tasks to a re-run.

That flag had a subtle blast radius. The screenshot harness seeds `localStorage` to capture each screen deterministically, and once Today redirected on a missing `onboarded` flag, every Today/Lookback/Settings shot would silently capture onboarding instead. The fix, and the portable rule, is that **a seeded state must satisfy every render gate, not just provide data**: the harness now sets the flag and has a welcome shot of its own.

The product redesign had a public bookend: the marketing landing at `/` was art-directed afresh and rebuilt as a React-Native-web component, so it inherits the live Dusk tokens and follows light and dark for free. The direction settled on calm and editorial rather than loud SaaS: an empathy-first standfirst (name the feeling, then the relief), a half-finished mock "Today" card that shows the product rather than just claiming it, the never-shame promise pulled up near the hero, and a quiet close. One deliberate deviation from the mock, its white completion checks became the app's AA-correct dark ink on sage, so the front door clears the same contrast bar the product does.

## Testing strategy

Risk-targeted, not coverage-theatre. Tests are **co-located** with the pure logic in `lib/` and the Worker `src/`, and they cluster where a bug would silently hurt:

- Date maths, recurrence, and "what lands on Today" (off-by-one errors are invisible and corrosive).
- The sync merge / tombstone logic (silent data loss).
- Store parse/recovery (a corrupt blob must never crash or drop the list).
- The AI request contracts (shape in, defensive parse out).

What is deliberately **not** tested: the model's actual output, and the thin SDK seams (AsyncStorage, the Supabase client) that are all I/O and no logic. As of this writing: about 610 unit cases (374 client, 236 server request-contract, the control centre's pricing / threshold / dedup logic included), run non-interactively on every commit, alongside a 104-case manual [end-to-end suite](qa/) for what only a human on real devices can verify. The headless preview cannot drive React-Native-Web's pointer-responder taps, so in-the-moment touch flows (the new completion affirmations, the tiny-version, the Routines screen) are verified on device and captured as manual cases rather than asserted in CI.

## The golden-path discipline

Solo, direct to `main`, but not cowboy. A pre-commit **Inspector** runs lint + typecheck + tests + a `gitleaks` secret scan, and it is never bypassed (`--no-verify` is banned). Commits are **Conventional Commits** with the *why* in the body, and any feature or architecture/data/security change updates the **decision-log in the same commit**. A `commit-msg` hook backstops the rule. Config is via env, with `.env.example` listing every key and the real `.env` never committed. CI mirrors the local gate; web auto-deploys to Cloudflare Pages on push.

The point of all this for a solo build: the safety net is cheap to run and the reasoning trail is automatic, so future-me (or a reviewer) can reconstruct every decision, including the ones reversed.

## Talk-to-capture, and the /split route

Speaking a brain-dump instead of typing it is the kind of thing that reads as friction-removal for this audience and as a platform signal for a hiring PM. The insight that kept it small: the AI that sorts captured lines into Today already exists (`/triage`), and its contract is deliberately narrow, it sorts pre-separated lines and never splits, merges, or rewords. So voice was not a new pipeline. It was one new job, get spoken words into the capture box as clean lines, after which the existing Sort-then-Add flow runs unchanged.

v1 is **web-first** and uses the browser's Web Speech API: zero new dependencies, no Worker change, and it works on doubledone.app, the demoable surface. Native in-app voice was parked behind a trigger, because Android already offers dictation through the Gboard mic, so the real gap is web and desktop. The browser does the speech-to-text and hands back only text, which then behaves exactly like typing, so **no audio ever reaches our servers**. The honest caveat carried into the privacy copy is that Chrome routes recognition through Google's speech service while Safari runs it on-device. It is a feature the user invokes per use, never background-listening. Platform-split files (`speech.web.ts` real, `speech.ts` a no-op stub) keep the browser API out of the native bundle, the same pattern reminders and haptics use, and `isDictationSupported()` simply hides the mic where it is unavailable rather than adding a setting. Tap to start, tap to stop, not press-and-hold, which is kinder for motor accessibility and needs no sustained gesture; the listening state reads by colour and a static dot, not motion.

Dictation segments on natural pauses, so a no-pause run-on ("buy milk and then email Sarah and book the dentist") lands as one line. That gap is closed by a cheap AI split: a new Worker route `/split` (Haiku, the triage pattern) takes the run-on and returns the separate tasks, only splitting, never sorting or rewording. Folding split into triage was rejected, because triage must leave an already-clean brain-dump untouched; a separate route keeps each call's job single and its prompt honest. It is offered as a calm "Tidy this into tasks" affordance, relabeled from an earlier "more than one thing in there?" once on-device use showed voice usually yields one rambly sentence rather than several discrete things, so the tidy framing is true whether the route returns one cleaned task or several. Because it is an AI call and not the microphone, the Split affordance also helps a typed run-on, so it works on native too. Propose-then-accept throughout: the user taps Split, sees the lines, then Sorts, and nothing auto-runs. Moat telemetry logs the resulting count, never the text.

## The ADHD product seam (clusters A to D)

A run of four small clusters, each aimed at a specific failure mode, built in order of how cheap and how underserved they were. They share one constraint that shaped every implementation choice: the never-shame rule, and its quieter cousin for the autistic half of the audience, never a variable or surprise reward. Predictability over delight.

**Cluster A, OCD reassurance, is pure client (zero tokens).** The checking loop ("did I really do it?") is met with a brief, calm affirmation on completion, "Done is done. Recorded.", fired from every completion path and auto-clearing after a few seconds. It is consistent and **deliberately non-rotating**: the "do not build" list forbids variable rewards because autism needs predictability, so the same line every time is the on-brand call. Its sibling, "Good enough", gives permission to release a task you are stuck perfecting, completing it with a gentler line. The implementation is a small `affirmation` state and an `affirm()` helper, one timeout guarded by a ref so a fresh completion is never cut short by an older clear, and no effect, so the React Compiler stays clean.

**Cluster B is the engineering-heavy one: crossing the start line, on a silent-parent chain.** This reversed an earlier call. Breaking a task down used to flatten it into independent Today tasks tagged only for the moat, which meant the real goal was lost: you could do tiny things forever while the dreaded task quietly rotted. The model now keeps the real task as a **silent background parent** (`silentParent`, hidden from Today and Later) and chains its pieces to it via a `parentId` field (with a denormalised `parentTitle`). The rule that keeps it on-brand is the whole game: **the app holds the thread, the user only ever holds one pebble.** The parent is never shown as a looming "Do My Taxes (1/7)" header or a progress bar, which would re-summon the exact dread the breakdown dissolved, and it never nags. A user-facing project tree would be the forbidden overwhelm; the line between the two is who carries the structure, and here it is the app, invisibly.

Two completion behaviours hang off that chain, and the distinction between them is the load-bearing one. A **decomposition is exhaustive**, its steps *are* the task, so finishing the last step should finish the whole thing. That runs through `completeAncestors`, a pure walk in `lib/today.ts` (unit-tested through the multi-level cascade): when a step finishes, any ancestor whose children are now all done completes too, un-silences, and surfaces in the Lookback as the finished whole task, cascading on up a multi-phase chain. The in-the-moment line escalates for it, "You finished X. The whole thing." over the plain affirmation. A **tiny-version is partial**: a new Haiku route `/tiny` returns a single two-minute starter ("Do my taxes" becomes "Find last year's tax file and open it"). Here the real task becomes an **open parent** (`openParent`), and finishing the pebble must *not* auto-complete it, so `completeAncestors` skips open parents and the toggle instead **resurfaces** the real task back onto Today, "Started. X is here when you're ready." The dreaded thing is never lost, and you can make it tiny again for the next pebble. Resurfacing rather than a "is it done?" modal is the never-interrupt spine: after a pebble you often have momentum, so the task simply reappears, with no prompt and no decision tax.

**Cluster C honours the day.** A one-tap "low day" recalibrates the day's expectation rather than touching the backlog: `dayWeight(count, lowDay)` roughly halves the capacity the weight-of-today gauge fills against and swaps in permission copy ("A couple of things is plenty."). It is per-day and never a setting, stored as an ISO date like the closed-day flag, so it self-clears at midnight with no preference to manage and no self-label to accrue. Auto-deferring the heaviest tasks on a low day was rejected, because it would both shame the parked tasks and risk an avalanche the next day, and per-task defer already exists for anyone who wants it. Its bookend is a wind-down nudge: from 6pm an in-app line appears above Close the day, an invitation toward the existing close-the-day ritual, never a scold. It is **in-app and not a notification** on purpose, a second evening push would mean a second toggle this audience avoids, and the line lands exactly when the user opens the app in the evening, which is when closing the day is relevant.

**Cluster D is Routines, and the never-streak decision is baked into the data shape.** A routine is a named checklist with a time-of-day, living in a new pure `lib/routines.ts`, rendered on its own screen (`client/src/app/routines.tsx`) reached from the Today header. The model stores `done` as a map from step id to its **last-ticked ISO date only**, never a count and never a history array. A step is "done today" exactly when its date equals today, so yesterday's ticks fall away on their own (the same reset the recurring tasks use) and there is no streak, chain, or "you missed N days" anywhere in the model to surface later. That is the deliberate inverse of the habit-tracker shame mechanic this audience is built to avoid. The honest cost recorded: the Today header now carries four feature links, and on a narrow phone the date can wrap, judged an acceptable trade to keep Routines a first-class surface rather than a buried setting.

New code across the seam: `lib/routines.ts`; new `Task` fields `parentId` / `parentTitle` / `silentParent` / `openParent`; storage keys `doubledone.lowday.v1` and `doubledone.routines.v1`; `nudge.isWindDownTime`; a `lowDay` argument on `estimate.dayWeight`; and the Worker routes `/tiny`, `/split`, plus the REST API (`api.ts`, `openapi.ts`). Everything shipped gate-green, typecheck, lint, the full unit suite, and the coverage floor, with `/tiny` and `/split` deployed and live-confirmed by a single call each, and the manual suite extended with the OCD, AI, TOD, and RTN cases for the touch flows a headless preview cannot drive.

## Premium, and the money path

The scrapbook proved the delight; turning it into revenue was the launch's real second half. Premium is a Stripe subscription, A$5/month or A$50/year, with a 30-day card-free trial granted once per account (write-once in D1, so it cannot be farmed). The architecture keeps the server honest: the client never decides its own premium status. A Stripe Checkout session carries the user id; Stripe's webhook, signature-verified with Web Crypto and idempotent via a processed-events table, writes an entitlement row to D1; and a `requirePremium` guard on the paid Worker routes re-checks it on every costed call. The paid surface is stack-ranked by cost and delight: the scrapbook keepsake (the headline), photo-to-tasks OCR, Plan my day and Chart a course and Lookback insights (the token-heavy Sonnet routes, paid by design), pinning a task, and the six non-default colour themes. The free tier stays genuinely good, the whole core loop, because for an RSD-prone audience a crippled free tier reads as bait-and-switch and churns them before they convert.

Going live meant hardening the money path before it saw real volume: a per-IP rolling-24h backstop on the scrapbook so a script cannot drain the shared image budget, a double-subscription guard on checkout (an already-subscribed user cannot open a second Stripe session and double-charge, while a trial user can still convert), and the webhook taught to also alert on disputes, refunds, and failed payments (Stripe's dashboard no longer emails on those). All of it fails open or defensive: a money event never crashes a request, the dedup store failing never drops a real billing event, and a transient read error reports the calm free shape rather than wrongly revoking premium.

## The launch control centre

A solo founder cannot watch a dashboard, so the launch needed something that taps the shoulder on trouble and stays silent otherwise. The control centre rides the existing hourly cron: a sweep over the D1 telemetry that emails the owner only on a breach, AI dollar-spend against the $25 cap (real dollars from the logged token columns, alarming at 50% with a month-end projection), error spikes, the scrapbook neuron budget, volume spikes, and the Stripe money events. A once-a-day digest carries the pulse, and its mere arrival proves the cron and email path are alive. The design's sharpest call, surfaced by running the design across four expert lenses, was a **dead-man's-switch**: the cron pings an external watcher every tick, so silence provably means healthy rather than "the alarm itself died". Two principles shape it. Privacy by construction: every alert carries counts, endpoints, error strings and dollar amounts only, never task text, an IP, or a user id, because an alert email is a new way data leaves the pseudonymous store. And fail-open everywhere: the heartbeat fires even if D1 is down, and the sweep can never break the app or the daily nudge it shares the tick with. The thresholds and the cap are tunable in config, set deliberately low for tiny launch numbers with the explicit intent to retune after real traffic. The pure pieces (pricing, the threshold logic, the dedup, the email bodies) are unit-tested; the operational guide is [`operations.md`](operations.md).

## The i18n foundation

Shipping in nine-plus locales was ParkProof's pattern; DoubleDone laid the foundation without committing to the full migration. A typed `t()` over per-locale catalogs, with the catalog type derived from the English source so the compiler enforces full key coverage, and `translate()` falling back to English per missing key so a partial catalog is always safe (an untranslated key shows English, never a blank). English is live; Italian, French, and Spanish draft catalogs exist for native review, with idioms transcreated rather than translated literally and a side-by-side rationale doc. Deliberately deferred until the strings are blessed: the in-app language picker (it needs a reactive-locale provider) and the per-screen migration that makes the rest of the app translatable. The foundation is production-safe today; the visible surface is small because only a screen or two calls `t()` yet.

## v1.0.0, and the Android path

The version bump from 0.1.0 to 1.0.0 was a deliberate moment, made when the founder had verified the build on a real Samsung device, not a date on a calendar. Debug scaffolding (a force-a-reminder button, a test scheduler) came out first. Web auto-deploys to Cloudflare Pages on every push to `main`; Android ships as an EAS build, a preview APK for sideload testing and a production app-bundle for the Play Store, with `USE_EXACT_ALARM` declared and justified as a genuine reminder app. The remaining launch-config work, the Play Store listing copy, the data-safety form, and the screenshots, is captured in [`play-store-release.md`](play-store-release.md), and the operational readiness (Stripe live keys, the control-centre secrets, the heartbeat) in [`operations.md`](operations.md).

## Gotchas worth remembering

The hard-won ones, kept because the first time you hit them is the worst time to rediscover them:

- **`tsc` fails on `import '@/global.css'`** without a committed CSS type declaration, because the Expo template type-checks CSS imports against a generated, gitignored file a fresh CI checkout lacks. A one-line `declare module '*.css'` fixes it permanently.
- **Metro needs explicit monorepo config.** Deps hoist to the root, so `watchFolders` + `nodeModulesPaths` are required, and `unstable_enablePackageExports` is needed for `supabase-js` (its legacy entry fields point at files that do not exist).
- **Web is an SPA (`output: "single"`), not static.** Static export prerenders each route in Node, where `window` is undefined, and the module-scope Supabase client touches `window` at build time. A `_redirects` SPA fallback makes deep links resolve on Cloudflare Pages.
- **Account deletion left stale data on screen on native.** The screens loaded tasks once on mount; on web a delete triggers a full reload, but native's `router.replace` keeps a mounted screen alive, so the cleared store was never re-read. The fix was to load on **focus**, not just mount, and the honest limit, recorded plainly, is that deletion can clear the server and the originating device but can never reach a *second* device's local store. That is inherent to local-first, not a bug to paper over.

## Known limits and what is next

Local-first means no remote-wipe of other devices on account deletion. The cross-user estimate is, today, a transparent on-device heuristic framed as the app's own guidance. It becomes real anonymised crowd data only when there is enough volume to be honest, and the instrumentation to feed it is already live. With the silent-parent chain in place, that flywheel now logs the prize a step-tick alone could not: whether a decomposition actually got the dreaded task done, and over how many days. (The telemetry insert path, once a public anon-key write and a pre-launch risk, is now closed: it writes only to Worker-bound D1.) Monetisation has shipped (Stripe, the 30-day trial, D1-backed entitlement gating, with the scrapbook free), and so have the ADHD product seam, the public REST API, the i18n foundation, and the launch control centre. The known remaining edges are honest and small: in-app voice is web-first with native parked, a stored push timezone offset can drift an hour across a DST change until re-subscribe, and the per-screen i18n migration and the language picker are deferred behind the typed-translation foundation that is already in. The anonymous-first majority is, by design, invisible to per-user activation and retention metrics, a measurement gap more than a product limit. Each parked item has a trigger in [`BUILD-PLAN.md`](../BUILD-PLAN.md), which is the live sequence; nothing deferred is lost.
