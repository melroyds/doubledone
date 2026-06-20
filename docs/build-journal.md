# DoubleDone — build journal

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

The merge is **last-write-wins by `updatedAt`**, with **soft-delete tombstones** (`deletedAt`) so a deletion propagates instead of resurrecting on the next pull. The merge/tombstone logic is a **pure module with unit tests** — the part most likely to silently corrupt data is the part that never touches the network or React. RLS scopes every row to `auth.uid() = user_id`, so the database enforces isolation regardless of what any client sends.

## The AI architecture

- **Tiered models for cost.** Haiku on the friction-free paths (triage, the clarifying questions); Sonnet where reasoning matters (planning, decomposition, re-spreading a day). A $25/month cap is the backstop.
- **Forced tool-use with constrained schemas.** Every call uses `tool_choice` to force a single tool whose `input_schema` constrains the shape (enums for buckets, integers for minutes). The response is then parsed **defensively** — a malformed or partial model response yields an empty result, never a thrown error that reaches a screen.
- **The request contract is the test surface.** The Worker code is unit-tested by asserting the *shape* of the request it builds (right endpoint, model, tool, the user content present) and by parsing known-good and known-bad responses. The model's reasoning is never asserted in CI; that would be flaky and is not the code's job.
- **Date maths on-device, not in the model.** The AI orders steps; the client computes the dates (`lib/spread`). Deterministic, free, and testable.
- **The endpoints are locked down.** A CORS allowlist (app origins only), an Origin gate (a disallowed browser origin is refused before any Claude call), and a per-IP Cloudflare rate limit. The rate limit is the real cost guard for native (which sends no Origin); the spend cap is the final backstop.

## The scrapbook (a second AI surface, off the Anthropic budget)

The first premium delight turns a finished week into a calm still-life keepsake in the Lookback. It is a two-step **Workers AI** pipeline on the same Worker, deliberately *not* an Anthropic call: a small Llama model distils the week's finished task titles into a one-sentence still-life scene (objects that evoke the tasks, never text), then FLUX renders it. Workers AI runs on free-tier neurons, so the feature costs nothing against the $25 Anthropic cap. The image is device-local for now (base64), with the week's finished tasks listed beneath the keepsake so you *see* the week even before the picture loads. Lesson banked: Workers AI model ids deprecate on a date (an 8B Llama retired mid-build, surfacing as error 5028), so `wrangler ai models` is the source of truth, not memory.

## The MCP server (the agent surface)

A small, stateless **Model Context Protocol** server at `/mcp` lets an AI agent (Claude Desktop, the Inspector) add, list and complete tasks. It speaks MCP Streamable HTTP (JSON-RPC over a single POST). The design call that matters: **auth is the user's own Supabase access token**, pasted into their client, and every tool proxies to Supabase REST *with that token*, so row-level security scopes it to exactly their rows and the server holds no elevated key. A plain stateless Worker route beat the heavier `McpAgent` (its OAuth model and durable-object state buy nothing here). The pure parts (tool schemas, the JWT-sub decode, the request builders, the JSON-RPC envelopes) are unit-tested; only the I/O glue is not.

## Privacy by architecture

The only PII the app can ever hold is an email, and only if you choose to sync. Beyond that:

- **Secrets stay server-side.** The Anthropic key is a Worker secret; the client ships only the public Supabase publishable key; the service-role key is never used.
- **Telemetry is pseudonymous and has no public write path.** AI calls are logged with no `user_id` and no IP to a **Cloudflare D1** database bound to the Worker, so nothing public can write it (or read it). It exists to tune decompositions and, eventually, to power the cross-user estimate — aggregate, anonymise, never sell. (It began as a Supabase `ai_calls` table written with the public anon key; moving it to Worker-bound D1 closed that write path.)
- **Right to erasure is real.** A `SECURITY DEFINER` RPC scoped to `auth.uid()` lets a signed-in user delete their account and cascade their data, with no elevated client privileges.

## The design system in code (Dusk)

The "Dusk" palette is warm and calm by intent — paper light, charcoal-brown dark (never terminal black), a single dusky-mauve accent, sage for done (never an alarming green). Two implementation notes worth recording:

- **Reactive theming.** A `ThemeProvider` exposes `useTheme` / `useThemedStyles`; every component's styles are built from a `(theme) => StyleSheet.create(...)` factory, so theme, text-size, and reduced-motion changes re-paint the whole app live with no reload. Colours come from `theme.colors`; every font size is multiplied by a `scale` factor (the text-size setting).
- **Fonts the hard, correct way.** React-Native-Web gives every `<Text>` its own default font, so a page-level CSS font never reaches body text. The fix is explicit per-style font tokens (Newsreader for headings, the Braille Institute's Atkinson Hyperlegible for body), backed by CSS variables on web and by `expo-google-fonts` families loaded in the root layout on native. Verbose, but version-independent and native-ready.

## The redesign, and the front door

Feature-complete is not finished. After the core loop landed, the founder's own verdict was that Today had grown cluttered — features had each arrived as one more link in a day-actions row. The fix was a system-pass redesign run as a string of small **verified increments**: one surface at a time, `typecheck`/`lint`/`tests` green and the behaviour preview-verified before each commit, with a decision-log entry per slice. A dozen commits, never more than one screen in flight.

The engineering scope call mirrored the product one: of seven surfaces only Today needed a rebuild; the rest were already at spec and took refinements or nothing. Today's interaction overhaul collapsed two separate mechanisms (a per-task long-press menu and a separate multi-select button) into **one tap-and-hold gesture** with an adaptive action bar that offers Break-it-down only when a single task is selected. A small shared helper (`presetDate`) now backs both the new "Move to…" picker and the Break-it-down due chips, so "This week" resolves to the same date in both.

The one net-new surface was a **first-run**. It is a normal expo-router screen (`/welcome`) plus a one-key `onboarded` flag in storage; Today redirects to it once on mount when the flag is unset. The detection is keyed off the flag, **not** task count — a fresh install seeds example tasks, so "no tasks" would be the wrong signal. The reveal runs the user's first brain-dump through the *real* `/triage` path (with an all-to-today fallback if the AI is unreachable), so there is no separate demo code to rot. Replaying it from Settings is non-destructive: in replay mode the confirm **merges** into the existing list instead of overwriting, so a returning user can never lose their tasks to a re-run.

That flag had a subtle blast radius. The screenshot harness seeds `localStorage` to capture each screen deterministically, and once Today redirected on a missing `onboarded` flag, every Today/Lookback/Settings shot would silently capture onboarding instead. The fix, and the portable rule, is that **a seeded state must satisfy every render gate, not just provide data**: the harness now sets the flag and has a welcome shot of its own.

## Testing strategy

Risk-targeted, not coverage-theatre. Tests are **co-located** with the pure logic in `lib/` and the Worker `src/`, and they cluster where a bug would silently hurt:

- Date maths, recurrence, and "what lands on Today" (off-by-one errors are invisible and corrosive).
- The sync merge / tombstone logic (silent data loss).
- Store parse/recovery (a corrupt blob must never crash or drop the list).
- The AI request contracts (shape in, defensive parse out).

What is deliberately **not** tested: the model's actual output, and the thin SDK seams (AsyncStorage, the Supabase client) that are all I/O and no logic. As of this writing: 202 client cases plus the server's request-contract cases, run non-interactively on every commit, alongside an 83-case manual [end-to-end suite](qa/) for what only a human on real devices can verify.

## The golden-path discipline

Solo, direct to `main`, but not cowboy. A pre-commit **Inspector** runs lint + typecheck + tests + a `gitleaks` secret scan, and it is never bypassed (`--no-verify` is banned). Commits are **Conventional Commits** with the *why* in the body, and any feature or architecture/data/security change updates the **decision-log in the same commit** — a `commit-msg` hook backstops the rule. Config is via env, with `.env.example` listing every key and the real `.env` never committed. CI mirrors the local gate; web auto-deploys to Cloudflare Pages on push.

The point of all this for a solo build: the safety net is cheap to run and the reasoning trail is automatic, so future-me (or a reviewer) can reconstruct every decision, including the ones reversed.

## Gotchas worth remembering

The hard-won ones, kept because the first time you hit them is the worst time to rediscover them:

- **`tsc` fails on `import '@/global.css'`** without a committed CSS type declaration, because the Expo template type-checks CSS imports against a generated, gitignored file a fresh CI checkout lacks. A one-line `declare module '*.css'` fixes it permanently.
- **Metro needs explicit monorepo config.** Deps hoist to the root, so `watchFolders` + `nodeModulesPaths` are required, and `unstable_enablePackageExports` is needed for `supabase-js` (its legacy entry fields point at files that do not exist).
- **Web is an SPA (`output: "single"`), not static.** Static export prerenders each route in Node, where `window` is undefined, and the module-scope Supabase client touches `window` at build time. A `_redirects` SPA fallback makes deep links resolve on Cloudflare Pages.
- **Account deletion left stale data on screen on native.** The screens loaded tasks once on mount; on web a delete triggers a full reload, but native's `router.replace` keeps a mounted screen alive, so the cleared store was never re-read. The fix was to load on **focus**, not just mount — and the honest limit, recorded plainly, is that deletion can clear the server and the originating device but can never reach a *second* device's local store. That is inherent to local-first, not a bug to paper over.

## Known limits and what is next

Local-first means no remote-wipe of other devices on account deletion. The cross-user estimate is, today, a transparent on-device heuristic framed as the app's own guidance — it becomes real anonymised crowd data only when there is enough volume to be honest, and the instrumentation to feed it is already live. (The telemetry insert path, once a public anon-key write and a pre-launch risk, is now closed: it writes only to Worker-bound D1.) The next build is **monetisation**: the scrapbook ships free, and the paid tier (Stripe + entitlement gating) is the trigger. Each parked item has a trigger in [`BUILD-PLAN.md`](../BUILD-PLAN.md), which is the live sequence; nothing deferred is lost.
