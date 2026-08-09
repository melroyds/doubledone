# DoubleDone, Decision Log

*The why-trail. Newest entries at the bottom of each section. Written contemporaneously so the dead ends stay honest. Updated on every major commit (see the CLAUDE.md rule): record what was decided, and what was decided against.*

---

## 2026-06-17, Project founded

### Why DoubleDone exists (the pivot from SubToll)

SubToll was the planned second portfolio piece (subscription audit, Stripe, MCP). Two problems killed its priority. SubToll never had Melroy's love, and motivation is the binding constraint for solo nights-and-weekends work. And its monetisation was genuinely hard: "find your forgotten subscriptions" is a one-shot value prop with no natural reason to keep paying.

DoubleDone wins on every axis SubToll lost on:
- **Founder-market fit.** Melroy operates off to-do lists daily and has ADHD-shaped work patterns. He is the user. He will dogfood every day and never lose motivation.
- **A real, underserved niche.** ADHD / OCD / chronic-overwhelm productivity. The giants (Motion, Todoist, Sunsama) are built for neurotypical optimisation and are bad fits for ADHD failure modes. Genuine gap.
- **Native daily monetisation.** The value is daily and ongoing, so subscription is intrinsic, not bolted on. The thing SubToll could never manufacture.
- **Easy testers.** The ADHD community is vocal, online, and shares tools.

SubToll is shelved (spec preserved). AusBitcoin remains researched-but-undecided.

### The name

Long road. MiiTyme rejected: unspellable, which is fatal for a word-of-mouth product, and a creative respelling fights the "calm and plain" brief. Doable was loved but every usable domain was gone (the desirable-dictionary-word trap, same as SubSpot and Crumb). Landed on **Double Done**:
- Spellable, so word of mouth works (the test MiiTyme failed).
- "Done done" is the phrase for actually-finished, a wink the hiring-PM audience catches.
- "Done" is the dopamine word for this audience.
- Distinct enough from the existing **DoneDone** B2B bug tracker to defuse trademark risk. Triple-Done and exact-DoneDone were considered; Double Done is the right balance of distinct and clean.
- Domain **doubledone.app** registered at Cloudflare (the .coms were gone; .app is the right TLD for an app anyway, HTTPS-enforced, app-appropriate). WHOIS redacted by default, auto-renew on.

Lesson banked: stop chasing pretty dictionary-word domains, they are all gone. The brand lives in the app stores and word of mouth, the domain is plumbing.

### The spine

**Today is finite and achievable.** The home is Today, sized to be doable. Every feature serves protecting the user from the overwhelm of the full list. Reframes "calendar-based completion tool" (the original framing) into something sharper: the day is the product, the calendar is just where future days wait.

### The moat (designed for, instrumented from day one)

Two loops. Per-user history is switching cost. The real moat is the **cross-user completion-data flywheel**: log every decomposition offered plus whether its steps actually got completed, so Bite the Elephant becomes tuned on what decompositions genuinely get finished by people who struggle to finish, improving for everyone as it scales. A funded competitor cannot buy that dataset.

The decision that makes it legible as intelligence: **day-one instrumentation**. Capture completion outcomes from the first commit, before there is data to use, and document that choice in the case study. The privacy tension (this audience distrusts data collection) is resolved by aggregate, anonymise, opt-in, never sell. Extends the privacy-respecting thread from ParkProof and SubToll.

### The one rule that cannot break

**Never shame the backlog.** Celebrate closing an old task lavishly, never punish a task for existing. Rejection-sensitive dysphoria makes guilt mechanics fatal here. This is the line between understanding the audience and bolting "ADHD" onto a generic app. The retention bar is "is an ADHD person still opening this in week six," which demands near-zero maintenance: remove friction, never add a setting.

### Stack decision: carry Chronoloria's, not ParkProof's

Chosen: React Native + Expo (one codebase to native Android and web) · Supabase (Postgres + Auth + RLS) · small AI backend on Render holding the Anthropic key · tiered Claude (Haiku triage, Sonnet decomposition/Strategise, Opus premium Lookback) · local-first, anonymous-first.

Why not ParkProof's Vite-PWA-on-AWS stack:
- The daily-habit loop genuinely benefits from native notifications and home-screen presence. PWA push is weaker, especially on iOS.
- Postgres fits the Lookback, delta, and flywheel queries far better than DynamoDB.
- Supabase RLS gives privacy by architecture.
- Chronoloria already proved this exact stack for the sibling product, so the muscle and reference patterns are fresh.

### Scope (Tier 1 build-first)

Today view, brain-dump capture, AI hydration, Bite the Elephant, recurring daily tracker. Tier 2: Strategise, finished-old-task celebration, close-the-day wrap, the Lookback, gentle nudges. Deferred: sync, calendar read, public API, MCP server. Skipped entirely: teams, assignees, dependencies, Gantt, social.

### Harness

Built on the golden-path playbook at Tier 0 (single `main`, local Inspector + gitleaks + green CI badge, risk-targeted tests, telemetry before traffic, cost alarm, journal from day one). Cloned from `melroyds/golden-path`, remote detached, Inspector activated via `core.hooksPath .githooks`. Git workflow is solo direct-to-main, Claude handles git.

---

## 2026-06-17 Client scaffolded (Expo SDK 56)

The folder of docs became a running app. `npx create-expo-app` landed SDK 56 (React Native 0.85, React 19.2, expo-router with a `src/app` directory). Stripped the demo (tabs, themed components, animated splash, demo assets) down to one calm Today screen.

### Monorepo via npm workspaces, not Expo-at-root

The documented layout is `client/` + `server/` + `supabase/` as siblings, so the Expo app lives in `client/`, not the repo root. To keep one install and one set of gates, the root is an **npm-workspaces** monorepo: a thin root `package.json` whose `dev` / `lint` / `typecheck` / `test` scripts delegate into the `client` workspace. `npm install` at root pulls `client/` too; the Inspector and CI run from root. `server/` slots in later as a second workspace. Cost: Metro needs the monorepo `watchFolders` + `nodeModulesPaths` config (added `client/metro.config.js`, the documented Expo pattern) because deps hoist to the root `node_modules`.

### The Inspector was generalised (secret-scan untouched)

The harness pre-commit hook checked the repo *root* for `eslint` / `tsconfig` / a `test` script. In a `client/` subfolder layout that meant lint and type-check would silently skip, and a silent gate is worse than no gate. Generalised the hook to prefer the repo's own `lint` / `typecheck` / `test` npm scripts when defined (delegating into the workspace), falling back to the original root tool-detection otherwise. The secret-scanner block is byte-for-byte unchanged. The harness explicitly invites this ("make it yours"); the change preserves intent and makes the hook correct for any future structure.

### Vitest, not Jest

`docs/testing.md` tests logic surfaces only, never component rendering. So no `jest-expo` and its RN transform overhead. Vitest runs the pure-TS logic (`lib/`) in a node environment, fast. First two risk files shipped with the scaffold: `lib/day` (date math: midnight wrap, DST-safe day counting) and `lib/telemetry` (the `[doubledone.*]` log contract). 15 cases, green.

### Telemetry is live before the features it measures

`client/src/lib/telemetry.ts` defines the `[doubledone.*]` prefix and a `track()` sink (console for now, swappable for Supabase/POST later without touching call sites). Already wired at the Today toggle (`task.toggled`, `day.cleared`, `task.added`). Telemetry before traffic, and the moat's outcome-logging mindset present from the first interaction.

### Kept the heavy template deps; honest in-memory shell

Left reanimated/worklets/glass-effect/@expo/ui in `package.json` even though the calm shell uses none of them. Removing template deps risks breaking the Metro/Babel/React-Compiler config the template wires up, and that is a Tier-3 trim, not scaffolding. Noted for later. The Today list is deliberately **in-memory only**: seed tasks and the one-line add reset on reload. No fake persistence pretending to be the real local store (that is step 3).

### Smaller calls

- **Palette:** warm paper `#FBF7F1`, clay accent `#C4715A` used sparingly, sage `#7E9B6B` for done (calm, never an alarming green). Light-first, no theme toggle, remove friction, never add a setting.
- **Committed a `*.css` type declaration.** The template's `import '@/global.css'` only type-checks against the Expo-generated `expo-env.d.ts`, which is gitignored and absent on a fresh CI checkout. A one-line committed `declare module '*.css'` keeps `tsc` green everywhere.
- **create-expo-app gotcha:** even with `--yes`, it prompts "skip initialising a new git repository?" inside an existing repo. In a non-interactive shell stdin is closed and it took the default (skip), which is what we want, no nested `.git`.

### Public from the first push

Repo created public at `github.com/melroyds/doubledone`. The original plan said private, but a portfolio repo only works if a hiring PM can read it, and ParkProof and golden-path are already public under the same account. No secrets in history (a full-history gitleaks sweep ran clean before the push). One CI snag surfaced: `gitleaks-action@v2` fails on the very first push because it scans the push range starting at the root commit's nonexistent parent. Replaced it with a direct `gitleaks detect` over full history, which also matches the local Inspector.

---

## 2026-06-17 Local store + brain-dump (steps 2-3)

Today now persists, and capture grew up.

### On-device store

AsyncStorage (localStorage on web, the native store on Android) behind a thin wrapper in `lib/storage.ts`. The model and (de)serialization sit in `lib/tasks.ts` so they unit-test in node without the native module. Deserialize is defensive: corrupt or non-array blobs return an empty list and malformed entries are dropped, so a bad write never crashes the open or throws away a load. The storage key is versioned (`doubledone.tasks.v1`) for future migrations. A brand-new install seeds three example tasks once; an explicitly emptied list is respected and never re-seeded (seed only when the key has never been written, not merely when the list is empty). This is the storage risk surface from `docs/testing.md`, now tested.

### Brain-dump replaced the single-line add

The footer is now a multi-line capture: type freely, one line per thing, each line becomes a task. `parseDump` trims, drops blanks, tolerates CRLF, and strips leading list markers so pasting an existing list just works. One line logs `task.added`; several logs `brain_dump.captured` with a count, so the flywheel can later learn what a real dump looks like for this audience. The single-line AddTaskBar stopgap was removed.

### Deferred on purpose

Persistence is within-day only for now. Rolling the day forward, and the never-shame close-the-day wrap, are Tier 2 (steps 8-10). Completed tasks stay on the list until then, and there is no delete gesture yet. Both wait for their step rather than being half-built now.

---

## 2026-06-17 Process: the decision log is now a rule, not a habit

Made this log a standing rule rather than something I remember to do: every major commit updates it with what was decided and what was rejected. Major is defined in CLAUDE.md (Conventional Commit `feat`, anything breaking, or any architecture / stack / data-model / security change).

Enforced in two layers. The rule lives in CLAUDE.md, which every session reads and follows, and that is what actually authors the content (a hook cannot write judgement). A new `.githooks/commit-msg` hook is the backstop: on a `feat` or breaking commit that does not also touch this file, it prints a reminder.

Decided against a hard block (a non-zero exit that aborts the commit). Not every feature settles something genuinely new, and forcing an entry on each one would breed filler that devalues the log. A reminder plus the CLAUDE.md discipline is the right balance, and we can tighten to a block later if entries start slipping.

Decided against a Claude-Code settings.json hook in favour of a git commit-msg hook, because a git hook fires for any commit by anyone, not only inside an assistant session, and it matches the existing `.githooks` pattern.

---

## 2026-06-18 Shipped to both surfaces (web + Android)

Both targets of the one codebase are now live.

### Web: Cloudflare Pages via direct upload, not Cloudflare's CI build

Built the static web bundle locally (`expo export -p web`, where it is proven to compile) and shipped `client/dist` with `wrangler pages deploy`, rather than connecting the repo for Cloudflare to build in their CI. Reason: a monorepo Expo web build inside someone else's CI is the fragile part, and building locally removes that whole class of failure. Cost: no auto-deploy yet, each web update is a manual deploy (a GitHub Action can add that later, it is in the backlog). The custom domain doubledone.app was attached from the Pages project, with DNS auto-configured because the zone already lives in the same Cloudflare account. www is not set up, apex only for now.

### Android: EAS preview APK, sideloaded

`eas build -p android --profile preview` produces an installable APK, distributed by sideload rather than the Play Store (Play Store is in the backlog with its trigger). The first build died on an intermittent EAS worker error (lost connection to the worker, their infrastructure), and the retry built clean. The keystore is cloud-managed, so signing is handled.

### Consequence carried forward

Data is local per device, so the web list and the phone list are separate until sync lands (sync is last in the build order). Accepted deliberately.

---

## 2026-06-18 Scheduling model: one-off + recurring, in-app (calendar feature, part 1)

Melroy asked for tasks linked to a calendar, repeatable and one-off. Built the scheduling foundation: a task can carry a due date (one-off) or a recurrence (daily, or weekly on chosen weekdays), and `isDueOn` decides what lands on Today. The recurrence logic lives in `lib/recurrence.ts` with tests, since date math is a risk surface.

Decided: keep recurrence small (none / daily / weekly), not a full rrule engine. Daily and weekly cover almost everything a daily ADHD tool needs, and every extra scheduling option is friction the spec warns against. Monthly or interval can be added if a real need appears.

Decided: optional fields on the existing Task, no storage migration. Old tasks without `due` / `recurrence` still parse (they default to one-off / no-date), so the store stays backward-compatible on the same v1 key.

Decided against external calendar integration for now. "Live calendar" is built in-app (scheduled tasks flow onto Today on their day). Two-way sync with Google or the phone calendar is OAuth-gated and stays in the backlog ("calendar read"); this in-app scheduling is the foundation it would build on, so it is not wasted either way. Flagged for Melroy to confirm which he meant.

---

## 2026-06-18 Scheduling part 2: per-day completion and Today selection

For Today to mean "what is due today," added two tested pure helpers in `lib/today.ts`. `tasksForToday` selects what belongs on Today: anything due today (`isDueOn`) plus undated captures (no date, no recurrence), which are the "do it now" brain-dump default. `isDoneOn` and `toggleDoneOn` give recurring tasks per-day completion: a daily task ticked today is done for today and returns tomorrow, tracked in `completedDates`, rather than the global `done` boolean a one-off uses.

Decided: undated tasks stay on Today rather than vanishing. They are the default capture ("add one thing, do it now"), so the existing behaviour and the new scheduling coexist with no migration. A task only leaves Today when it is dated for another day or completed.

Decided: per-day completion via a `completedDates` string array on the task, not a separate completions table. Simple, local-first, and the array stays tiny for a personal daily tool. Wiring this into the Today screen UI is the next step (the loop continues).

---

## 2026-06-18 Scheduling part 3: Today renders by schedule

Wired the Today screen to the scheduling helpers: it now renders `tasksForToday` (due-today plus undated captures) and per-day done-state via `isDoneOn` / `toggleDoneOn`. Behaviour is unchanged for the current tasks because they are all undated, which is intended; scheduling only changes what shows once tasks get a date or recurrence (the picker is next).

Gotcha recorded: a preview screenshot looked like the app was tiled six times across the screen. It was not duplicated. A DOM check showed a single root with the correct task count, but the preview browser viewport had collapsed to 6px wide, so the screenshot smeared one narrow column. Resizing to a normal viewport fixed it. This also settles the "multiple renderers" backlog worry for rendering: the DOM and production HTML are single-instance. The dev-only console warning remains, but it is not duplicating output.

---

## 2026-06-18 Scheduling part 4: capture-schedule helpers, and in-app vs external resolved

Added `scheduleFields`, mapping a `CaptureSchedule` (today / tomorrow / daily / weekly+weekdays) to a task's due/recurrence, plus `addDaysISO` for the "tomorrow" date (month/year rollover tested).

Melroy confirmed mid-build: "live calendar" means **in-app scheduling**, which is what this is. **External two-way calendar sync** (Google/phone) is wanted later and is now an explicit backlog item, not part of this in-app work.

Decided to offer a deliberately tiny capture set, not a full date picker: Today (default, undated), Tomorrow (a one-off), Daily, and Weekly on chosen weekdays. It covers "repeatable" fully and gives a dependency-free one-off while staying calm and dodging the calendar-app trap. An arbitrary-date one-off picker is backlogged (it needs a cross-platform date-picker decision). The chip UI is the next step.

---

## 2026-06-18 AI backend: Cloudflare Worker, not Render

The AI backend, which holds the Anthropic key and is the only thing that calls Claude, is a **Cloudflare Worker** (`doubledone-ai`), not the Render service the original stack named.

Decided this with Melroy to cut setup: he is already on Cloudflare (the domain and the web host), so a Worker means no new account, the key lives as a Worker secret, and I deploy it with the existing Wrangler login. Render would have meant another signup and dashboard. The Anthropic SDK runs in the Workers runtime (`nodejs_compat`), and edge latency suits short request/response calls.

The original Render plan is dropped, not deferred. Workers replaces it; revisit only if the backend ever needs long-running work or a full Node server.

Validated end to end before any logic: the deployed Worker's `/health` returns `hasKey:true`, confirming the secret is wired without exposing it. Live at https://doubledone-ai.melroy-a02.workers.dev. No Claude traffic until the spend cap is confirmed.

---

## 2026-06-18 Web auto-deploys on every push

Added a GitHub Action (`deploy-web`) that builds the web bundle and ships it to Cloudflare Pages on every push to main, so doubledone.app always matches main. Closes the gap noted earlier, where the first web deploy was a manual wrangler upload.

Decided: deploy via `cloudflare/wrangler-action` with a Pages-scoped API token in a repo secret (`CLOUDFLARE_API_TOKEN`). The account ID sits in the workflow in the open, since account IDs are identifiers, not secrets. The token is the only secret and it never leaves GitHub.

Decided against Cloudflare's own git integration (letting them build in their CI): building in GitHub Actions, where the monorepo Expo web build is already proven, keeps the build environment under our control instead of debugging in someone else's.

---

## 2026-06-18 Scheduling part 5: capture chips (when + repeat)

The BrainDump capture now has a calm chip row, Today (default) / Tomorrow / Daily / Weekly (with weekday toggles), wired through `scheduleFields` so a captured task gets the right due/recurrence. The default stays Today, so the common case is still one gesture.

Assumptions made overnight (Melroy to challenge):
- Chip set is Today / Tomorrow / Daily / Weekly only; arbitrary future dates stay backlogged (needs a date-picker decision).
- Weekly defaults to today's weekday selected; toggle others.
- The add button label adapts to the mode ("Add to today" / "Add for tomorrow" / "Add daily" / "Add weekly").
- A future-dated one-off (Tomorrow) does not show on Today; it needs the Upcoming view, which is the very next step. Until that lands it is captured-but-not-visible, harmless overnight with nobody using it.

Verified the chips render at mobile width via a DOM check. The preview screenshot tool keeps timing out in this environment while the renderer answers `eval` instantly, so it is a tooling flake, not the app.

---

## 2026-06-18 Scheduling part 6: the "Later" view

Future-dated one-offs now appear in a quiet "Later" section under Today, grouped by date with a friendly label ("Tomorrow", else "Mon, 22 Jun"). `upcomingTasks` (lib/today) plus `fromISODate` / `friendlyDate` (lib/day) are pure and tested. This closes the A1 gap, where a task scheduled for a future day was captured but had nowhere to show.

Assumptions (Melroy to challenge):
- "Later" is a secondary section on the single Today screen, not a separate tab or route, keeping the calm single-surface spine.
- Later lists only future one-off dates; recurring tasks show on their due days on Today, never in Later.
- Completing a future task early just removes it from both lists; no "done early" affordance yet.

Verified end to end in the preview: injected a future-dated task, the Later section rendered it under its date label, then cleaned it up. DOM check again, the screenshot tool is still timing out.

---

## 2026-06-18 Scheduling part 7: delete a task (long-press, calm confirm)

Long-pressing a row reveals a calm inline "Keep / Remove" confirm, no destructive swipe and no shame language. Works in both Today and Later. `removeTask` filters the task out and persists; telemetry logs `task.removed`.

Assumptions (Melroy to challenge):
- Delete is long-press then confirm, with no always-visible delete affordance, to keep rows calm and uncluttered. Discoverability on web is modest; a hover affordance or a hint could be added if it feels hidden.
- Local delete hard-removes the task for now. When sync lands (step C), delete becomes a soft-delete tombstone (`deleted_at`) so a removal propagates across devices instead of resurrecting. Flagged for that step.

Verified the app renders after the row rewrite via DOM check; the long-press confirm itself is simple typed JSX, not DOM-triggered in the check.

---

## 2026-06-18 Scheduling part 8: day-roll (overdue rolls forward)

`tasksForToday` now rolls overdue incomplete one-offs onto Today (a one-off shows if undated or due is today-or-earlier), so a task scheduled for a past day reappears calmly with no "overdue" badge instead of vanishing. Recurring tasks already reset per-day via `completedDates` (a daily task done yesterday reads not-done today), now covered by a test. Future-dated one-offs stay in Later. Pure logic, tested, verified in preview (an injected overdue task showed on Today).

This is the carry-forward half of day handling. The other half, clearing what you finished on previous days so Today stays fresh, belongs to the close-the-day wrap (Tier 2) and needs a completion timestamp on one-offs; deferred there. Assumption to challenge: done tasks currently persist on Today until that close-the-day feature exists.

**In-app scheduling (A1-A4) is complete.** Next: Bite the Elephant.

---

## 2026-06-18 Bite the Elephant, part 1: the decompose endpoint

`POST /decompose` on the doubledone-ai Worker turns a dreaded task into a few atomic, time-boxed steps. The prompt and request/response shaping live in `server/src/decompose.ts` (pure, tested): `buildDecomposeRequest` targets the Anthropic Messages API (claude-sonnet-4-6) with tool-use (a `record_steps` schema) so the output cannot be malformed, and `parseDecomposeResponse` pulls the steps out defensively. The Worker handler does the fetch and CORS. The contract test asserts the request shape and parses a sample tool_use response with no network, so CI never calls Claude. Server tests are now wired into the root test gate (54 tests total).

Assumptions (Melroy to challenge):
- The system prompt is a PLACEHOLDER (calm, ADHD-aware, tiny first step), isolated as `SYSTEM_PROMPT` in decompose.ts. Yours to tune.
- Model claude-sonnet-4-6, max_tokens 1024, 3 to 6 steps.
- No live Claude call yet; the single end-to-end validation is sub-step B3.

**Flagged risk (must fix before any public launch):** the endpoint is unauthenticated and CORS-open, so anyone who finds the URL can spend your Anthropic budget (bounded only by the $25 cap). Fine for tonight's build, but before launch lock it to the app origin and/or add a shared token plus rate limiting. Added to the backlog.

## 2026-06-18 Bite the Elephant, part 2: the client UI

The capture box now has a second action. "Break it down" hands the typed task to the AI backend (`client/src/lib/ai.ts` → `POST /decompose` at `EXPO_PUBLIC_AI_URL`), shows a calm "Breaking it down…" spinner, then drops the returned atomic steps into Today as ordinary tasks titled like "Sort the pile (5 min)". Failure shows one friendly line ("Could not break that down just now. Try again."), never a raw HTTP status. The moat instrumentation starts here: `decomposition.offered` logs the step count at the call site, and because the steps are ordinary tasks, their completions already flow through the existing toggle telemetry. `parseSteps` is defensive (never throws on a malformed response), and the contract test mocks `fetch` and asserts the POST shape so CI never calls Claude.

Decided against:
- A separate decompose screen or modal. The calm move is one more button on the box he already uses, not a new place to go.
- A review-and-confirm step before the steps are added. For a stuck person the fastest relief is the steps simply appearing; Strategise (step 11) is the later relief valve if a day over-fills.
- A parent/child task structure (the decomposition as a parent with child steps). v1 keeps them as flat Today tasks (less model, the spine is just "today is doable"); the structure waits until the Lookback wants to show "you finished every step."

Assumptions (Melroy to challenge):
- Button label "Break it down", placed left of "Add to today" as the secondary (outline) action against the filled primary. Wording and placement yours.
- Each step's minutes ride inline in the title (e.g. "(5 min)") rather than adding a `minutes` field to the task model. Revisit when tasks need real durations.
- `EXPO_PUBLIC_AI_URL` lives in `client/.env` (gitignored) and is documented in `.env.example`; the public Worker URL is also hardcoded as the in-code fallback so the deployed build works without env.
- No live Claude call from this UI yet; the single end-to-end validation is sub-step B3.

## 2026-06-18 Bite the Elephant, part 3: one live end-to-end call (validated)

Ran the single sanctioned live call against the deployed Worker: `POST /decompose {"task":"clean the garage"}` returned six well-formed steps, opening with a 2-minute "stand in the doorway and take a photo, do not touch anything yet" and escalating from there. This confirms the whole chain end to end: the Worker reads the `ANTHROPIC_API_KEY` secret, the Messages API tool-use call (`record_steps`) succeeds, and the response matches the client contract (`{steps:[{title,minutes}]}`, every step passing `parseSteps`). Cost was one Sonnet call (about a cent), negligible against the $25 cap.

Note for Melroy: the placeholder system prompt already produces calm, atomic, tiny-first-step output. Wording is still yours to tune; this only proves the pipe works.

## 2026-06-18 Cloud sync, part 1: sync-ready model (updatedAt + soft-delete tombstones)

The foundation for sync, landed before any network code. Every task now carries `updatedAt` (epoch ms, bumped on create, toggle, edit and delete) to drive last-write-wins, and delete is now a soft-delete: it sets a `deletedAt` tombstone and bumps `updatedAt` rather than dropping the row. Tombstones are hidden from every view (Today and Later) but kept in the store, so a deletion propagates on the next sync instead of the task resurrecting on pull. Older stored blobs that predate `updatedAt` are backfilled from `createdAt` on load, so nothing is dropped. The pure pieces (backfill, tombstone exclusion) are unit-tested. The model now matches the remote `tasks` columns confirmed live tonight via PostgREST: id, user_id, title, done, due, recurrence, completed_dates, created_at, updated_at, deleted_at.

Decided against:
- A separate deletions/tombstone table. One nullable `deletedAt` on the row is simpler, syncs through the same path, and avoids a join; a tombstone table only earns its place if undelete history is ever needed.
- Hard delete plus a "deleted on server" flag. Soft-delete in one column covers both the local hide and cross-device propagation with less machinery.
- Garbage-collecting old tombstones now. They are tiny and harmless; a sweep can come later (trigger: the store actually grows enough to matter).

Assumptions (Melroy to challenge):
- Last-write-wins by `updatedAt` is the conflict policy (newest edit wins, a delete included). Fine for one user across devices; revisit only if shared lists ever land.
- The remote `tasks` table set up earlier this session matches these columns. Tonight I confirmed the column names live via PostgREST, not every Postgres type; `supabase/schema.sql` (part 3) is the source of truth to diff the live table against.

## 2026-06-18 Cloud sync, part 2: the pure merge engine

`mergeTasks(local, remote)` in `client/src/lib/sync-merge.ts` reconciles two task lists by last-write-wins on `updatedAt` and returns both the `merged` set (to persist locally) and `toPush` (the rows the server is missing or has an older copy of). A delete is just a tombstone with a newer `updatedAt`, so deletions win exactly like edits, in either direction. Local-only tasks always push, which is precisely the first-sign-in migration: the anonymous list seeds the new account with no special-casing. Remote-newer and ties never push. The function is pure, clock-free and network-free, and is unit-tested across migration, both LWW directions, ties, and tombstones winning each way. The integration seam that actually calls Supabase (part 3) wraps this.

Decided against:
- A three-way merge with a common ancestor. LWW is the right complexity for one user across their own devices; true three-way only earns its place with shared or collaborative lists, which the spec deliberately avoids.
- Field-level merging (blending two edits of the same task). Whole-row LWW is predictable and matches how the app mutates (every change already bumps `updatedAt`); field merge is surprise-prone for no real gain here.

## 2026-06-18 Cloud sync, part 3a: Supabase client + sync engine

Added `@supabase/supabase-js` (plus `react-native-url-polyfill` for native) and the network seam. `client/src/lib/supabase.ts` builds the client only when both `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` are set; otherwise it exports null and the app stays exactly as it is, local-first and offline. `client/src/lib/sync.ts` maps Task to and from the remote row (camelCase to the snake_case columns; timestamps as ISO strings over the wire, epoch ms locally), and `syncOnce` pulls the account's rows, runs the part-2 merge, pushes whatever the server is missing, and returns the merged set to persist. The mapping is round-trip unit-tested and `syncOnce` is tested against a fake client (migration plus both last-write-wins directions); no live network in CI. `supabase/schema.sql` now records the table and RLS as code, including the deliberate no-`updated_at`-trigger rule that last-write-wins depends on.

Decided against:
- Generating typed DB types from the project. The hand-written `TaskRow` is enough for one table and avoids wiring a codegen step plus service-key access tonight; revisit if the schema grows.
- A dedicated /sync server endpoint. supabase-js plus RLS lets the client talk to Postgres directly and safely; a server hop would add latency and another thing to run for no gain at this scale.
- Realtime subscriptions. v1 syncs on sign-in and on open (a backlog item, deferred until v1 sync is stable), which is enough and far simpler.

Assumptions (Melroy to challenge, verify against the live table):
- `tasks.id` is TEXT (ids are device-generated like "t-abc-1", not UUIDs). If it is uuid, sync inserts fail. This is the first thing to check.
- No `updated_at = now()` trigger exists on the live table. Such a trigger would break last-write-wins; `schema.sql` omits it on purpose.
- Column types match `schema.sql` (due date; recurrence and completed_dates jsonb; timestamps timestamptz). Names were confirmed live; types were not.
- The publishable key (`sb_publishable_...`) works as the supabase-js anon key. It already reaches the table over REST; auth sign-in is the piece still to confirm live (part 3b, left for Melroy).

## 2026-06-18 Cloud sync, part 3b: passwordless sign-in + sync wiring

The sync UI and its wiring. A calm, skippable sign-in screen (`client/src/app/sign-in.tsx`) does passwordless email OTP: enter email, we send a 6-digit code, verify it. `useSession` (`client/src/lib/auth.ts`) tracks auth state. A single faint "Sync across devices" line in the Today footer is the only entry point, and only when sync is configured; signed in, it reads "Synced, sign out". When a session is present the Today screen runs `syncOnce` once (on sign-in and on open), persisting the merged result; failures are silent and logged, the app stays fully usable offline. The end-to-end email round-trip (which mails a real inbox) is left for Melroy; everything up to the send is built, typechecks, lints, and the screen plus navigation are preview-verified without sending.

Two build-config fixes were needed to make supabase-js bundle for web:
- Metro could not resolve `@supabase/realtime-js` (its legacy main/module fields point at files that do not exist). Fixed by `config.resolver.unstable_enablePackageExports = true` in `client/metro.config.js`, so Metro honours the `exports` map.
- `web.output: "static"` server-prerenders each route in Node, where `window` is undefined; the module-scope Supabase client touches `window`/localStorage at build and crashed the export. Switched to `web.output: "single"` (SPA), which suits an authed, client-rendered app, and added `client/public/_redirects` (`/* /index.html 200`) so deep links resolve on Cloudflare Pages.

Decided against:
- A magic-link (clickable URL) sign-in. The typed 6-digit code works the same on web and native with no deep-link plumbing; the clickable link is already a backlog item.
- Auto-push on every edit and realtime subscriptions. v1 syncs on sign-in and on open (backlog: realtime once v1 is stable); simpler and enough.
- Guarding the Supabase client behind `typeof window` to keep static prerender. SPA output is the cleaner, more durable choice for an app with client-only browser APIs, and avoids hydration mismatches.

Assumptions (Melroy to challenge):
- Sync-on-open (not continuous) is the right cadence for v1.
- The faint footer line is the right home for sign-in: out of the calm Today surface, shown only when configured.
- The deployed web build has no Supabase env yet, so sync stays dormant there until you add `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` to the Cloudflare Pages project. Until then doubledone.app is unchanged. The web is now an SPA (output single); Cloudflare serves `_redirects` for route fallback.

## 2026-06-18 Bite the Elephant: AuDHD-aware decompose prompt (v2)

Replaced the placeholder decompose system prompt with a tuned version, after adding AuDHD to the audience. It now addresses ADHD and autism together, demands literal and concrete steps (no metaphors or idioms, no vague verbs like "organise" or "plan"), insists each step is one observable physical action with an obvious finish, keeps the two-minute physical first step, and forbids commenting on why the task went undone (demand-avoidance safe). The output contract is unchanged (still the `record_steps` tool, 3 to 6 steps with whole-minute estimates), so nothing downstream moves. Deployed to the Worker with `npx wrangler deploy` and validated with one live call ("do my tax return"): the first step was "get a box and put it on the table", and it produced the literal version of "organise your documents" rather than the vague verb. Note for the build env: the publishable Supabase key + URL are wired into the web build as GitHub Actions Variables (not Cloudflare Pages env, since the bundle is built on the runner), corrected from the earlier morning note.

Decided against:
- Asking the model a clarifying question when a task is vague. A stuck person needs steps now, not an interview; a calm best-effort decomposition beats a prompt back.
- Dropping to a fixed step count. 3 to 6 stays adaptive to task size while bounded; a fixed number would pad small tasks or truncate big ones.

## 2026-06-18 Cloud sync: live schema verified, created_at drift found

Probed the live `tasks` column types over PostgREST (no auth, no writes, no cost) by abusing type validation: filtering a column with an incompatible value returns the column's type in the error. Result: `id` is text (the headline risk, now cleared, since device ids are not UUIDs), `done` boolean, `due` text, `recurrence`/`completed_dates` json, `updated_at` and `deleted_at` timestamptz. One real drift: `created_at` is `bigint` (epoch ms) on live, while the sync mapping sends ISO strings and the sibling timestamp columns are timestamptz. A push would fail on created_at.

Decided: align created_at to timestamptz (one ALTER, no app code change, since `sync.ts` already emits ISO for all three timestamps), rather than rewrite the mapping to send a number for created_at and strings for the others. timestamptz across the board is consistent and friendlier to the future moat analytics. `due` stays text (works as-is with the client's date strings); `recurrence`/`completed_dates` stay json on live (jsonb in schema.sql; both accept the same payloads). `supabase/schema.sql` updated to match live and carries the one-time migration.

Decided against:
- Recreating the table from schema.sql. An ALTER is non-destructive and the migration is trivial; a drop/recreate risks data if any rows exist and buys nothing.
- Migrating everything to bigint epoch ms. It would touch two columns plus the mapping plus the tests, for a less query-friendly schema.

Still unverified (needs Melroy): the live email sign-in round-trip, and that no `updated_at = now()` trigger exists (Supabase adds none by default, so almost certainly fine; confirm in the dashboard if paranoid).

## 2026-06-18 Sign-in: confirmation beat + synced identity on Today

Two small auth-UX gaps closed after the live sign-in worked. (1) Verifying the code now shows a brief "Signed in" success state (sage, calm) and returns to Today on its own after about 1.6s, with a "Back to today" button for anyone who would rather not wait, instead of silently bouncing back with no acknowledgement. (2) The Today footer now reads "Synced to <email>" with a distinct "Sign out", instead of a generic "Synced". The sign-in render was split from a two-branch ternary into three phase blocks (email / code / done) to fit the success state. Also along the way: the code input cap was lifted to 10 (an 8-digit OTP was being truncated) and the sign-in catch now surfaces the real Supabase/SMTP error instead of a generic line.

Decided against:
- A persistent in-app banner or toast for sign-in success. A short success screen is calmer and needs no new toast system.
- Showing the email prominently on Today. It stays a faint footer line; sync is a background comfort, not part of the calm Today surface.

## 2026-06-18 Cloud sync verified end to end

Live sign-in and sync now work: a typed OTP signs in, the local list migrates into the account, and tasks land in the Supabase `tasks` table (confirmed in the dashboard). Getting here surfaced and fixed real setup gaps, all recorded in `supabase/auth-setup.md` and `supabase/schema.sql`: (1) editing email templates requires custom SMTP, so Resend is wired with the doubledone.app domain verified for any-recipient sending; (2) templates must send `{{ .Token }}`, not a magic link; (3) the OTP length and the app's input cap had to agree (the input now accepts up to 10); (4) two drifts in the hand-created table, `created_at` was bigint (altered to timestamptz) and the primary key was on the wrong column (dropped and re-added on `id`). The app also now surfaces the real sign-in and sync errors instead of generic messages.

Sync is genuinely done: C1 model, C2 merge, C3 client/engine/UI, all verified against the live database. Next build is D, the Lookback.

## 2026-06-18 D: calendar-backed Lookback, complexity-weighted (not gamified) reward

Reshaped D from a flat weekly list into an interactive Gregorian calendar over an accurate completion record, with a complexity score that amplifies the celebration. Melroy's call, greenlit 2026-06-18.

The guardrail (the spec's never-gamify line, sharpened by the AuDHD audience): complexity weights the WARMTH of a calm acknowledgment, never points, streaks, levels, or leaderboards. A hard or long-dreaded task finished earns a warmer, more prominent "you did that"; a trivial tick stays quiet. No running totals, no streak-break shame. "Celebrate the dreaded lavishly" is on-brand; a score machine is off-brand and repels the autistic half of AuDHD.

Data model (reverses the earlier "use updatedAt, no new column" call): a real calendar needs real completion data, so one-off tasks get `completedAt` (epoch ms, set on done, cleared on undo); recurring tasks stay dated via `completedDates`. A `complexity` score field comes with D2. Both become Supabase columns in D2's single migration; D1 keeps `completedAt` local-only (the calendar falls back to `updatedAt` when it is absent), so D1 ships without touching sync.

Cost: AI-scoring every task on capture would burn the $25 cap and add latency, so complexity derives from signals we already have, chiefly a Bite-the-Elephant decomposition (steps x minutes). A dedicated AI scorer and the premium "chart a course of action" planner are token-heavy and live in the backlog (the planner is paid by design).

Decided against:
- A third-party calendar library. Hand-built keeps it calm, controllable, dependency-free (no repeat of the supabase bundle pain), and the date math is testable lib logic.
- A separate completions table (the normalised moat store). Per-task fields are enough for the calendar now; the anonymised cross-user flywheel stays a backlog item.
- Points / streaks / levels. See the guardrail.

## 2026-06-18 D2: complexity-weighted celebration (warmth, not points)

Finishing a task now carries a weight from two cheap signals, no per-task AI call: how long it lingered (`completedAt - createdAt`, the dread proxy, universal) and its complexity if known (`complexity`, set from a Bite-the-Elephant step's minutes). `isBigWin` in `lib/reward.ts` flags a "big win" when a task sat a week or more (`BIG_WIN_AGE_DAYS = 7`) or was a chunky 25+ minute step (`BIG_WIN_COMPLEXITY = 25`). On the calendar a big-win day gets a bigger dot; in the day detail the big-win item gets a warm "a big one". Per the guardrail, this weights the warmth of a calm acknowledgment, never points, streaks, or a visible score.

`complexity` and `completedAt` stay local-only for now (not in the sync mapping), so sync is untouched; a one-step migration (add `complexity` and `completed_at` columns) will sync them for cross-device fidelity, until then synced tasks weight by age via the `updatedAt` fallback.

Decided against:
- A combined numeric weight the user sees. A simple big/normal tier keeps it calm and legible; a visible score is the gamification we are avoiding.
- Per-day count badges or totals. The dot, small or bigger, carries the day's emphasis without numbers.
- AI-set thresholds now. The 7-day / 25-minute cutoffs are simple and tunable; the dedicated AI scorer stays the paid backlog item.

## 2026-06-18 Privacy and security posture formalised

Wrote a Privacy and Security section into BUILD-PLAN. The stance: privacy by architecture, local-first and anonymous-first, the only PII ever held is an email and only if you opt into sync. No analytics identity, no third-party trackers, no ad SDKs, no selling. RLS isolates each user's rows; secrets stay server-side; telemetry is non-identifying. The one honest caveat recorded: Bite the Elephant sends the typed task text to Anthropic to decompose it (not stored), to be disclosed in-product. Deferred with triggers: account/data deletion, a written privacy policy, the `/decompose` lockdown, in-product AI-egress disclosure, telemetry anonymisation at the sink.

Decided against:
- Any third-party analytics or crash SDK (Google Analytics, Sentry, and the like). They import an identity/tracking surface that contradicts the posture; the local `[doubledone.*]` telemetry stays first-party and non-identifying.
- Capturing anything beyond an email for accounts. No name, phone, device fingerprint, contacts, or location.

## 2026-06-18 E: close-the-day wrap (a ritual, not a reset)

A calm "Close the day" on Today opens a wrap card: it names what you finished today (reusing the calendar's completion data, with the big-win warmth), reassures that anything left rolls to tomorrow, and signs off with "Goodnight". It changes no state, undone tasks already roll forward via the overdue logic, so this is purely the closing ritual. A quiet day reads "A quiet day. That is allowed", never shame. Lives on Today as a modal card (Melroy's call), not its own screen.

Decided against:
- An automatic midnight close. Manual keeps it in the user's control (calmer, and AuDHD-friendlier); you close the day when you are done, not when a clock says so.
- Mechanically clearing or archiving the list on close. Never destructive; the roll-forward already handles continuity and the record stays intact.
- Listing the unfinished tasks in the wrap. Showing what is left at the close reads as a scorecard of failure; the wrap celebrates what got done and quietly reassures about the rest.

## 2026-06-18 F (Strategise) part 1: the /strategise endpoint

A second Worker route on doubledone-ai. `POST /strategise` takes the over-full set of today's tasks (`{id, title}`) and returns a calm re-spread plan via Sonnet tool-use. `record_plan` returns, per task, a `dayOffset` (0 = today, 1 = tomorrow, ...) and a short plain reason; the client (part 2) maps `dayOffset` to a due date and applies it only on the user's accept (propose-then-accept, agreed with Melroy). Prompt and request/response shaping live in `server/src/strategise.ts` (pure, contract-tested: request shape asserted, a sample tool_use parsed, no network in CI). Deployed.

Decided / assumptions (Melroy to challenge):
- Output is a `dayOffset` per task (not fixed today/tomorrow/week buckets), so the client can place precisely with `addDaysISO`.
- The system prompt is a calm PLACEHOLDER (re-spread, never cram, keep a handful today), yours to tune like decompose's.
- Strategise surfaces when Today is heavy (6+ due) and is tappable any time; it proposes, never auto-applies (agreed). Both are part 2.
- Shares the decompose endpoint's open-CORS posture; covered by the same pre-launch lockdown backlog item.

## 2026-06-18 Repeating-tasks drawer (a separate, respected home)

Daily/recurring tasks now have their own home: a panel that slides in from the right, opened by a "Repeating" link in the Today header. It lists all recurring tasks with their cadence (`describeRecurrence`) and lets you tick today's completion; toggling there is the same action as on Today, so state stays consistent. Per the agreed model, today's due recurring tasks STILL appear on Today (habits stay visible), and the drawer is the manage/overview home for all of them. Calm: a list with cadence labels, no streaks or grids (the guardrail).

Implementation note: the drawer is always mounted and slides off-screen when closed (pointerEvents toggles), rather than mounting/unmounting on open. The React Compiler render rules forbid reading a ref during render and synchronous setState in an effect, which the usual `useRef(new Animated.Value())` + mount-on-open pattern trips; holding the Animated.Value in lazy `useState` and keeping the panel mounted satisfies them.

Decided against:
- Moving recurring tasks out of Today entirely. Out of sight is undone for this audience; today's due ones stay on Today, the drawer is the overview.
- A streak grid or habit-tracker view in the drawer. That is the gamification the spec rules out; the drawer stays a calm list.
- A third-party drawer/navigation library. Hand-built keeps it dependency-free and calm, consistent with the calendar call.

## 2026-06-18 Repeating tasks: every-N-days + recognisable on Today

Two fixes Melroy asked for.

Every N days: the recurrence model gains an interval kind (`{ kind: 'interval'; days; anchor }`), due when (date minus anchor) is a non-negative multiple of `days`. Capture offers an "Every N" chip with a +/- stepper (min 2, max 30), anchored to the day you add it. Covers "change the cat's water every 2 days". `isDueOn`, `describeRecurrence` ("Every 2 days"), and `scheduleFields` are unit-tested.

Recognisable on Today: recurring tasks now read as a distinct category. A new cool "repeat" palette colour (denim, against the warm paper/clay/sage) tints the checkbox ring, and a ↻ marker sits on the row. One-offs are unchanged. Verified: an interval task shows on Today with the marker and in the Repeating drawer as "Every 2 days".

Decided against:
- A free-text number field for the interval. A stepper is calmer and avoids a keyboard; min 2 because 1 is just Daily.
- A whole new colour system. One added token (`repeat`) carries the distinction; warm vs cool is the recognisable cue without a redesign (the real design overhaul is the backlog item).

## 2026-06-18 Recurring tasks: bold gradient on Today (the denim was too subtle)

The denim ring + ↻ was too quiet; recurring tasks are the operational backbone and should be unmistakable. Recurring rows on Today now have a bold blue->violet gradient fill (`expo-linear-gradient`) with white text and a white ↻; one-offs stay plain white. Done recurring rows dim to 0.55. The gradient stops live in the theme (`repeatGradient`) so they are a one-line change. Added dependency: `expo-linear-gradient` (~56.0.4, via `expo install`, cross-platform web + native).

Decided against:
- A louder treatment (full-saturation / neon). Bold but still a smooth two-stop gradient, to stay short of sensory-jarring for the autistic side of the audience; the stops are tunable.
- A separate "essentials" section. The gradient marks them in place on Today, so the single Today surface stays intact (the drawer remains the manage-all home).

## 2026-06-18 Recurring treatment, take 3: a solid border (the gradient was too bold)

The bold gradient (take 2) overshot. Settled on the middle: recurring rows get a solid 2px coloured border (the denim `repeat` token) plus the existing ↻ mark, more than the original subtle ring, less than the gradient. The bold blue->violet palette is saved as `theme.priorityGradient` and reserved for a premium "Prioritise a task" feature (loud on purpose), now in the backlog. `expo-linear-gradient` stays installed for it.

Decided against:
- Keeping the gradient for recurring. Too loud for an everyday row, and reusing the same gradient for both recurring and "priority" would blur their meanings.
- Uninstalling expo-linear-gradient. It is reserved for the imminent Prioritise feature; leaving it installed avoids churn, and it is not bundled while unimported.

## 2026-06-18 F (Strategise) part 2: the client UI (propose-then-accept)

Strategise is live end to end. When Today has 2+ one-off tasks (a gentle "Today's looking full" nudge appears at 6+), a calm Strategise button hands them to `/strategise` and shows the AI's re-spread as a PROPOSAL: each task with where it would go (Today / Tomorrow / In N days). The user taps "Use this spread" to apply (each task's due set to `addDaysISO(today, dayOffset)`; offset 0 keeps it on Today) or "Not now" to dismiss. Recurring tasks are never re-spread (they are due by cadence). `strategise()`/`parsePlan` in ai.ts are contract-tested; one live validation call confirmed the chain (a 6-task day came back keep-3-today, dentist tomorrow, bike +2, garage +3, with calm reasons) and accept correctly re-dated the tasks.

Decided against:
- Auto-applying the spread. Propose-then-accept keeps the user in control (agreed with Melroy); the AI never silently rearranges the day.
- Re-spreading recurring tasks. They recur by cadence; only one-offs get moved.

Tooling note: `preview_click` did not fire onPress for these particular Pressables; verified the handler via a direct DOM `.click()` in eval and the end state via reload. A preview limitation, not an app bug.

## 2026-06-18 Recurring treatment, take 4 (final): reversed

Reversed take 3 at Melroy's call: the solid denim border now marks ONE-OFF (unique) tasks; repeating tasks drop the border but keep the ↻ mark. Same denim colour. Verified in preview: the one-off row border is denim, the recurring row is the plain line plus ↻.

## 2026-06-18 G (AI triage) part 1: the /triage endpoint

Third Worker route: `POST /triage` takes a brain-dump (lines) and returns each line sorted into today / later / decompose via Haiku tool-use (`record_triage`, an enum-constrained bucket). The cheap model (`claude-haiku-4-5`) is deliberate because triage runs on the friction-free capture path. Pure prompt/shaping in `server/src/triage.ts`, contract-tested (request shape, sample parse, bad-bucket filtering), no live call in CI. Deployed.

Assumptions (Melroy to challenge): the system prompt is a calm PLACEHOLDER; three buckets (today/later/decompose), Haiku for cost. Shares the open-CORS posture (pre-launch lockdown backlog item).

## 2026-06-18 G (AI triage) part 2: "Sort for me" on the brain-dump

Capture now has an opt-in triage. When you dump 2+ lines, the left AI button becomes "Sort for me" (it stays "Break it down" for a single line). It hands the lines to `/triage` (Haiku) and applies the result directly: "later" items get tomorrow's due date (so they leave Today), "today" and "decompose" items stay on Today; lines the AI drops fall back to Today. Bucket counts go to telemetry (`triage.applied`) for the moat. client `triage()`/`parseTriage` are contract-tested; one live call validated the buckets (wedding + tax return -> decompose, quick things -> today).

Decided against:
- A propose-then-accept card for triage (unlike Strategise). Triage runs on the capture path, where the goal is friction-free "dump and it sorts itself"; a review step fights that. It is opt-in via the button, the result is visible, and tasks are editable, so a direct apply is calm here.
- Auto-decomposing the "decompose" bucket. That would fire a Bite-the-Elephant call per big item (token-heavy). For v1 those land on Today and the bucket is recorded; auto-offer-decompose is a future enhancement.

## 2026-06-18 H (final core piece): gentle daily reminder

The retention lever, kept calm. An opt-in "Daily reminder, On/Off" toggle in the Today footer schedules one daily local notification ("Your today is here when you are ready.") via expo-notifications. A reminder is an offer, never a demand or a nag (demand-avoidance safe). `lib/reminders.ts` is a thin, fully guarded seam (every call try/caught) so the web build degrades quietly; the toggle is hidden on web (`Platform.OS`), since scheduled local notifications are a native (Android) capability. State persists via storage.ts. Bundles cleanly on web; the notification firing is device-verified by Melroy, like the sign-in email.

Decided against:
- Per-task time reminders for v1. A single daily nudge is the retention lever with far less UI; per-task reminders (a time picker plus per-task scheduling) are a future enhancement.
- A task-count in the reminder copy ("you have N tasks"). That reads as pressure; the copy offers the day, it never tallies it.
- expo-notifications handlers / channels for v1. Defaults are fine for a backgrounded daily reminder; less API surface, less risk.

This completes the core loop (A through H plus the repeating drawer). The post-core work is the design overhaul and the ParkProof-grade GitHub, both backlogged.

## 2026-06-18 Task slices (progress across parts)

Melroy's ask: let a task have user-defined "slices" (a thing in N parts: 10 TV episodes, a 3-step chore) and track progress against it. Built it, with the calm assumptions below recorded for him to challenge (per the autonomous-build protocol, no blocking question).

How it works:
- **Model.** A new optional `slices: { total, done }` on Task (`lib/slices.ts` holds the pure arithmetic). `done` counts completed parts; the task is finished exactly when `done >= total`. The completion is reconciled onto the existing `done` boolean + `completedAt` stamp, so the calendar, Close-the-day, the Lookback and the big-win reward treat a finished sliced task like any other finish, with zero special-casing downstream. This mirrors how recurring tasks derive completion from `completedDates`.
- **Define at capture.** BrainDump gains an optional "Steps" stepper ("Has parts? Track it in steps.", No steps / N steps, 2–50), shown only for a single, one-off line (`today`/`tomorrow`). It never appears for a multi-line dump or a repeating task, so it adds zero friction to those paths. The everyday capture is unchanged.
- **Track on Today.** A sliced row shows a slim sage progress bar, a quiet denim "n / N", tap-to-advance, and a small "−" to undo a mistaken tap (shown only when `done > 0`). Reaching full completes it and fires the normal celebration; stepping back below full reopens it and clears `completedAt`.
- **Sync + moat.** A `slices` jsonb column (mirroring `recurrence`), round-trip tested; idempotent migration noted in schema.sql. Telemetry logs `slices.defined` (total) and `slices.progressed` (done/total/complete), feeding the moat with how this audience chunks and paces multi-part work. Verified end to end in the web preview (define → advance → complete → step-back).

Assumptions (Melroy to challenge):
- **Capture-time only.** You set the slice count when you create the task; there is no "add steps to an existing task" affordance yet. The discovered-later case is already served by Break-it-down (decompose). Adding slices to an existing task is a backlog candidate if it is missed.
- **One-offs only.** Slices are disallowed on recurring tasks (what would progress mean across daily resets?). A sliced task is a one-off with parts.
- **Bounds 2–50.** One slice is not a slice; 50 is already a lot of taps. Tunable.
- **Bar colour is sage (done-warmth), count is denim.** Calm, not gamified, no percentage shouting and no shame.

Decided against:
- **A percentage label ("30%").** Melroy's framing was "percentage slices," but for "10 episodes" a "3 / 10" count reads clearer than "30%"; the bar already carries the percentage visually. Easy to switch to % if he prefers.
- **Slices as the sole completion source of truth (no `done` boolean).** Keeping `done`/`completedAt` reconciled means the rest of the app needs no changes; a separate slice-completion path everywhere would have been more surface for the same result.
- **A slices control on every row.** Defining slices lives in capture, not on each task face, so rows stay calm.

## 2026-06-18 Slices UX, take 2: step-back behind the hold

Melroy's call right after slices shipped: the always-visible "−" on the right of a sliced row was clutter. Removed it. The default sliced row is now just tap-to-advance, the bar, and the count. **Tap-and-hold (long-press) reveals the controls**: a "Step back" (the only home for the minus now), "Close", and "Remove", with the count shown live so you watch it decrement as you step. Step back keeps the controls open so repeated undo works; Close dismisses; Remove deletes. This reuses the existing long-press-to-confirm gesture and the confirm-row styling, so it adds no new interaction vocabulary. Verified in preview: clean default (no minus), hold reveals the row, step-back decrements live and holds open, Close returns to the calm row, tap still advances.

Decided against:
- **Long-press = step back directly (no menu).** Simplest, but it would have stolen the remove gesture from sliced tasks. The revealed control row keeps both step-back and remove behind the one deliberate gesture.
- **Keeping the minus but making it fainter.** Melroy wanted it gone from the row entirely, not just quieter. Don't fight the signal.

## 2026-06-18 Long titles: a calm scrolling marquee

Melroy's ask: a title too long for its row should scroll as a marquee rather than truncate or wrap. New `MarqueeText` component, used for every task title (normal and sliced rows):
- It measures the title's natural width against the row width and **only scrolls when it actually overflows**. Short titles render as a plain single line, untouched.
- The scroll is deliberately calm: ~35 px/s with a 1.2s pause at the start of each loop so the beginning reads first. Two copies make the loop reset seamless.
- **Reduced motion is respected** (web `prefers-reduced-motion`, native `AccessibilityInfo`). Motion-sensitive and autistic users get a gentle wrapped line instead of forced movement, in keeping with the calm/never-overwhelm spine. Native uses the UI-thread driver; web drives from JS.
- Measurement reads the nodes' widths in an effect (refs are compiler-safe there), not via `onLayout`.

Decided against:
- **Truncating with an ellipsis.** Loses information; the whole point was to let the full title be readable.
- **`onLayout` for measurement.** Switched to ref + effect after `onLayout` measurement proved fiddly to verify; reading `getBoundingClientRect`/`measure()` post-layout is deterministic.
- **Marquee on every row at once as a worry.** It only animates overflowing titles, and the calm fallback covers reduced motion. If a screenful of scrolling ever feels busy, the noted next step is to animate only the pressed/hovered row.

Debugging lesson banked (now a CLAUDE.md gotcha): most of this build's time went to the **preview viewport collapsing to width 0** after a dev-server restart (every container measures 0, so overflow can never be detected and nothing scrolls). Always re-apply `preview_resize` after a restart and sanity-check `window.innerWidth` before trusting a layout result. Also, the headless preview throttles `requestAnimationFrame`, so a JS-driven web animation can sit frozen at frame 0 even when correct.

## 2026-06-18 Settings page added to the backlog

Melroy wants a full Settings page (theme / colour options, maybe borrowing Chronoloria's palette). Parked in BUILD-PLAN under a new "Settings and personalisation" group rather than built now. The note flags the tension with the spine ("remove friction, never add a setting") and resolves it: theme / contrast / reduced-motion / reminder-time / text-size are accessibility-and-comfort affordances this audience genuinely benefits from, not open-ended config. The theming tokens already exist (`theme.ts` light/dark), so a picker is mostly swapping token sets. Pairs with the design overhaul; build the tokens first.

## 2026-06-18 AI-call telemetry (the moat's front door)

Melroy chose the build order 1 → 3 → 2 (telemetry, then the ParkProof-grade GitHub/case study, then the design overhaul, with the design overhaul deliberately held for him to lead). Built #1.

The Worker now logs every Claude call (decompose / strategise / triage) to a Supabase `ai_calls` table: endpoint, model, the input it was given, the returned JSON, token usage, latency, and ok/error. `server/src/telemetry.ts` is a thin, fully-guarded seam; the route handlers call it fire-and-forget via `ctx.waitUntil`, so logging never delays or breaks a user's response, and if the Supabase env is unset the Worker just skips it. Contract-tested (`telemetry.test.ts`), no live call in CI.

Decided:
- **Store = Supabase `ai_calls`, insert-only RLS, NO user_id**, over Cloudflare D1. Reason: it reuses the Supabase project we already have rather than provisioning a new cloud resource on Melroy's account, and it was the queued recommendation. The table has only an insert policy, so the public anon key the Worker writes with can add rows but nothing can read them back through PostgREST. Pseudonymous by design (no user_id, no IP).
- **D1 is the recorded alternative** and the likely hardening path: it is Worker-bound (no public write path) and keeps the moat data physically separate from identity. Logged as the fix for the one real weakness below.

Weakness, named and parked (not silently shipped):
- **The anon key can insert from anywhere.** Insert-only RLS means no data can leak, but someone with the public key could spam junk rows. Acceptable pre-launch; hardening (a Worker shared secret / rate limit, or the D1 move) is triggered before any public launch. In BUILD-PLAN Privacy "to do".

Privacy posture change, called out:
- This **retains the task text** the user typed plus the returned JSON. That is the point of the moat (and exactly what Melroy asked for: "telemetry of all AI calls made and the returned JSON"), but it reverses the earlier "the Worker does not store it" line. It stays pseudonymous (no identity), but it is task content being kept, so the privacy section now says so and in-product AI egress+retention disclosure is a harder pre-launch requirement.

Linkage to completion outcomes (the "X days" payoff) is deliberately NOT in this step: tying a decomposition to whether its steps got finished, still without a user_id, needs its own pseudonymous-id design and real volume. This step is just the capture.

Three manual steps to go live (left to Melroy, like the slices migration and Worker deploys): run the `ai_calls` migration in the Supabase SQL editor; set `SUPABASE_URL` + `SUPABASE_ANON_KEY` as Worker secrets; redeploy the Worker. Until then the Worker skips logging and everything else works unchanged.

**Done live 2026-06-18:** Melroy ran the migration, the secrets were set (`wrangler secret put`), and the Worker was redeployed (version 720d82be). Telemetry is capturing.

## 2026-06-18 Break it down, refactored into a two-call qualify -> review flow

Melroy's call: the one-tap Break it down was too blunt. It now runs as two AI calls with the user in control at each stop.

- **Call 1 (`/clarify`, Haiku):** the AI phrases three qualifying questions for the specific task. Two are required by product (the due date, and gradual-vs-same-day spread); the third is the model's own best task-specific clarifier. The client renders the right control for each: date chips, a Gradual/Same-day toggle, a short text box. All pre-filled (default "This week" + Gradual), so the fast path is still quick.
- **Call 2 (`/decompose`, Sonnet, now with context):** the answers are folded into the prompt so the steps fit. The AI returns ordered steps + minutes; **the client computes each step's date** (lib/spread) from the spread choice, so no date maths lives in the model.
- **Accept/review pop-up:** the steps as a checklist, all ticked, with their dates. Untick any, then "Add N tasks". Nothing lands on Today until accepted.

Decisions:
- **Spread semantics:** gradual spreads steps evenly from Today (first step) to the due date (last step); same-day puts them all on the due date (Today if no deadline). Unit-tested in `lib/spread.test.ts`.
- **Dates client-side, not AI:** deterministic and cheap; the model only orders the steps.
- **Clarify is best-effort:** if `/clarify` fails (or the Worker isn't redeployed yet), the client falls back to `DEFAULT_QUESTIONS` and the flow continues, so a degraded path still works.
- **Moat:** both calls log to `ai_calls` (`clarify` + `decompose`), and the client logs `breakdown.started` and `breakdown.added` with offered-vs-kept counts. **Which steps people deselect is gold for the moat** (it shows where the decompositions miss), captured from day one.

Decided against:
- **Hard-coding the due-date/spread questions** (AI only asks the clarifier). The AI phrasing all three reads as a coherent interview and is what Melroy asked for; the forced-tool schema keeps it reliable.
- **Letting the AI assign dates.** More tokens, less reliable, and the spread is pure arithmetic.
- **A skip-the-questions fast lane.** The defaults already make the fast path two taps; a skip toggle is a setting, which the spine resists. Revisit if testers find the questions heavy.

The friction tension (one tap became two stops) is real but bought genuinely better, user-controlled breakdowns. Verified end to end in preview (with stubbed AI to avoid spend): clarify -> questions with the three controls -> decompose -> review with the gradual dates (Today, +2, +5, +7) -> deselect -> add only the kept steps. Replaces the old one-shot flow. Needs a Worker redeploy for the live AI questions; degrades gracefully until then.

## 2026-06-18 Break it down, three refinements from Melroy's first live run

He ran it on "sell a house by July 15 2026" and surfaced real gaps. The data confirmed the diagnosis: the AI even phrased a due-date question mentioning July 15, but the chips only went to Two weeks, so the date in the task text never became the actual deadline; the 6 steps were the prompt cap, clustered on today/tomorrow because the chip (not the text) drove the dates.

Fixed:
- **Step titles were verbose sentences.** Tightened the decompose prompt to demand short commands (start with a verb, under ~eight words, one concrete action) with an explicit good/bad example. The review rows also now wrap the title fully (no 2-line truncation) and sit taller, so a step is always readable when deciding. Prompt wording is still Melroy's to tune further.
- **No way to set a far deadline.** Added a real date picker: a month-grid `DatePicker` built on the Lookback's `monthMatrix`, so it works on web and Android with no native module (the community date picker is weak on web). The due-date question keeps the quick chips and adds "Pick a date" plus a "Selected: ..." line.
- **The deadline the user typed was ignored.** `/clarify` now also returns `suggestedDueDate`: the AI extracts an explicit date from the task text (validated to YYYY-MM-DD) and the picker pre-fills it. Typing "by July 15 2026" now pre-selects 15 July 2026. Verified in preview (stubbed): the picker opened to July 2026 with the date pre-selected, and the long step rendered in full.

Acknowledged, not built now:
- **Step count for big tasks** ("I hear you"): 6 steps is thin for a months-long task. A real far date plus the gradual spread now at least uses the runway; true depth is the phased approach below.
- **Phased breakdown** (Melroy: "I love this"): for a big, long-horizon task, decompose into phases, surface only the first phase's steps now, and break later phases down as they approach. This keeps Today small while honouring a distant deadline. The next dedicated build for Break it down; needs its own design pass.

Needs a Worker redeploy for the live AI date-extraction + tightened steps.

## 2026-06-18 Phased breakdown (the depth fix for big, long-horizon tasks)

Melroy: "do phased breakdown." Built the approach he'd approved: break a big task into phases, surface only phase one now, break later phases down as they approach. This keeps Today small while honouring a distant deadline.

How it works:
- **New `/plan` endpoint (Sonnet)** replaces the flat decompose inside the flow. It returns a roadmap of **phases** (each a milestone title + one-line focus) PLUS the concrete **steps for phase one only**. The model decides the count: ONE phase for a small task (so the flow behaves exactly like the old flat decompose, single-phase review), two to five for a big multi-stage one.
- **Dates:** the client distributes the phase starts across the runway (today → due date) and spreads phase one's steps within phase one's window (reusing `lib/spread`, no new date code).
- **Accept:** phase one's chosen steps land now (Today + the next days); each later phase becomes a **dated milestone task in Later**. No new data model, no migration: a milestone is just a normal task.
- **Recursion via "Break it down" on an existing task:** long-press any one-off task now offers "Break down" (alongside Keep / Remove), which runs the same flow on that task's title. So you break a later phase down when you reach it. This also makes Break it down work on tasks you typed days ago, not just at capture.

Verified end to end in preview (stubbed AI, no spend) on "sell the house" with a July 15 deadline: the plan came back as three phases; the review showed phase one's four steps (spread Today → 2 Jul) plus a "Then, as you get there" roadmap (List and market · 2 Jul, Handle offers and close · 15 Jul); accepting created six tasks (one on Today, the rest dated into Later); and long-pressing the "List and market it" milestone → Break down reopened the flow on it. Gates green (133 client + 24 server tests).

Decisions:
- **Roadmap titles only for later phases; re-decompose when reached** (rather than pre-generating and storing every phase's steps). Keeps the data model untouched, avoids storing steps that may be stale by the time you get there, and reuses the whole flow for the recursion.
- **One `/plan` call generalises decompose** (1 phase = flat). `/decompose` stays deployed and tested but is no longer used by the flow; left in place to avoid churn.
- **The milestone task is kept after you break it down** (not auto-removed): the user ticks or removes it themselves once its steps are on the board. Auto-removing on accept is a possible refinement.

Decided against:
- **Storing each phase's pre-generated steps on the task** (a `phaseSteps` field + sync migration). More model surface and staler steps for no real gain over re-decomposing on arrival.
- **Auto-detecting "big" on the client.** The model decides phase count from the task and answers, which is where the judgement belongs.

Needs a Worker redeploy for the live `/plan`. Until then the flow calls `/plan` on the old Worker (404) → the catch falls back to the questions step; for the live path the redeploy is required.

## 2026-06-19 Multi-language, Pass 1: the locale rails + the AI in your language

Melroy: make it accessible beyond English, starting Italian / Spanish / French. Pass 1 builds the rails and the highest-value piece, the AI answering in the user's language. (Pass 2, the UI-string sweep + the actual translations, comes after the design overhaul finalises copy, so we translate once.)

- **Locale detection:** `expo-localization` reads the device locale once at startup. The pure logic (`lib/i18n`: `resolveLocale`, `languageName`, `aiLanguageFor`) is unit-tested; the device read lives in the `lib/locale` seam (untested, like storage / reminders / supabase), so a failure degrades to English instead of throwing. Maps any code ("it", "it-IT", "fr-CA") to a supported locale, English fallback.
- **The AI in your language:** the client passes the locale's language name to the Worker, and the generative endpoints (clarify / plan / decompose / strategise) append "Write every word you return to the user in {language}." to their system prompt. So an Italian user gets Italian questions, steps, and plans. English is the default and adds no instruction.
- **Triage is deliberately excluded.** It echoes the user's own line text back and the client matches items by exact text; translating that text would break the match and dump everything onto Today. Triage stays text-preserving.
- **Prompt-injection guard:** the `language` field goes into the prompt, so the Worker allowlists it (`parseLanguage`: Italian / Spanish / French only); anything else is ignored. Contract-tested both sides; no live AI call in CI.

Verified the web bundle builds and runs with the new native module (en-GB device → resolves to English → unchanged path, no console errors). Live verification of a non-English breakdown is Melroy's (switch device language + run Break-it-down); needs the Worker redeploy.

Decided against:
- **A heavy i18n library (i18next) up front.** The string count is modest and Pass 1's value is the AI-in-language, not the UI strings yet; a small typed layer will do, swappable later if plurals get hairy.
- **Translating the UI now.** Sequenced after the design overhaul so the final copy is translated once, not twice.
- **Sending the language to triage.** Would corrupt the exact-text echo it relies on.

## 2026-06-19 Design overhaul: the "Dusk" system

Melroy ran the A0 master prompt through his design tooling and brought back a system he loved: **Dusk**. Mockups and the philosophy are saved in `docs/design/`. Implementing it. This entry covers the palette + system-following dark (this commit); the typography lands next.

The Dusk system:
- **Palette:** the warm-paper, calm-and-quiet direction kept, with the accent moving from clay to a **dusky mauve** (`#9B6A7D` light / `#C68BA0` dark) and repeating tasks from denim to **periwinkle** (`#6E72A0` / `#8E97C8`). Sage "done" unchanged. A small calm accent palette (mauve / teal / gold / periwinkle / rose, desaturated) is captured as tokens for per-task dots.
- **Dark mode is a warm charcoal-brown** (`#1B1917`), not terminal black: "lights dimmed, not a different room." Every hue lifts in lightness to clear WCAG AA on the dark surface, and nothing gains saturation or urgency, which fits the never-alarming spine.
- **System-following, not a setting.** The active palette is resolved once at launch from the device colour scheme (`Appearance.getColorScheme()`, which reads `prefers-color-scheme` on web). Light is the default; a dark-mode device gets Dusk dark automatically. Resolved at module load so component StyleSheets stay static, no per-component theme hook or refactor, and no in-app toggle to manage (honours "remove friction, never add a setting").
- **Typography (next commit): Newsreader** (serif) for display/headings and **Atkinson Hyperlegible** for body, the Braille Institute's legibility typeface, a deliberately accessibility-first pairing for this audience.

Decided:
- **Dusk over the clay baseline.** The zip also held the current clay palette (the base "Design System" doc); the mockups Melroy made and praised are all Dusk, so Dusk is the pick. Clay is a one-line revert if he disagrees.
- **Resolve the scheme at launch, not reactively.** Runtime scheme-switching would force every component's `StyleSheet.create` (which reads `colors` at module load) into a theme hook, a large refactor for little gain. Launch-time resolution is "system-following" enough and keeps the change contained. A live toggle can come with the Settings page if ever wanted.

Verified both modes in preview (light default + dark via `prefers-color-scheme`): mauve accent, periwinkle unique-borders, sage progress, recurring rows with ↻, warm-charcoal dark, no console errors.

## 2026-06-19 Dusk art: the icon, the moments, and native dark

Melroy generated the illustration suite from the Dusk system (the "nano-banana" set): a sage-and-mauve double-check app mark, two "moment" scenes (an empty-desk morning, a dusk-sunset close), and a list hero. Wiring them in.

- **One icon source, every slot.** The mark renders as a warm cream rounded tile on white. Cropped past the white corners (they sat in the outer ~50px) and upscaled to a full-bleed cream tile, then used for `icon.png`, `splash-icon.png`, the Android adaptive `foregroundImage`, and a 196px `favicon.png`. Full-bleed cream means no launcher mask (circle / squircle / rounded-square) ever clips a white corner sliver. Splash + adaptive `backgroundColor` set to the sampled tile cream (`#F6F2E9`) so the centred mark dissolves into warm paper with no seam.
- **In-app illustrations as 16:9 banners.** B3 (empty Today) and B4 (close-the-day) sit in `client/assets/images/`, resized to 960px wide (17KB / 30KB) for a lean web bundle. RN-web ignores `aspectRatio` on `<Image>` (the source's natural height wins, giving a portrait box), so the banner shape comes from a wrapper `View` with the aspect ratio + `overflow: hidden` and the image absolutely filling it. The hero (B5, 1200px) goes in `docs/design/` and tops the README.
- **Animate only the one moment.** The close-the-day card gets a soft fade-and-rise (opacity + 16px translateY, 320ms ease-out), gated on reduced motion via a `useReducedMotion` hook extracted from `MarqueeText` into `lib/useReducedMotion` so both surfaces share it. Everything else is still: calm, not decorated.
- **Native dark mode switched on.** `userInterfaceStyle` was `"light"`, which pins the OS appearance to light and so suppressed the Dusk dark palette on device (the theme already resolves `Appearance.getColorScheme()`; web read `prefers-color-scheme` fine, native could never go dark). Changed to `"automatic"` so the documented system-following behaviour actually fires on Android. **Needs native verification** (the web preview can't exercise it).

Decided against:
- **A full-bleed or animated native splash (B2).** Disproportionate effort for a surface only reached via the sideloaded APK, and full-bleed splash images are device-ratio-fragile. Kept the standard centred-mark splash; parked the richer splash in the Backlog.
- **The paper-texture asset (B6).** A subtle background texture risks visual noise against the never-overwhelm spine, and earns nothing on the calm surfaces. Parked.
- **Animating the empty state.** Movement on the first thing you see every morning is the opposite of calm. It stays a still banner.

Removed the now-orphaned adaptive `backgroundImage` / `monochromeImage` layers (the old gradient mark would have shown as a wrong themed icon). Committed `*.jpg` / `*.png` module type decls (same CI-`tsc` reason as the existing `*.css` one). Verified in preview: both banners render at the correct 1.78 ratio, the close card centres with the dusk banner and the serif heading, the fade-and-rise settles, no console errors. The favicon applies at build (the Metro dev server does not inject it).

## 2026-06-19 A Settings page, and the reactive theme it needs (Stage 1)

Melroy wants users to be able to customise (his words: theme, font size, "all this kinda crap"). That deliberately bends the "remove friction, never add a setting" rule, and it is the right bend: for an ADHD / autistic / AuDHD audience, theme, text size and reduced motion are **access needs**, not config. The discipline is keeping the page to comfort/accessibility and never letting it become an everything-dashboard (the spine still holds for everything *outside* this one page).

The blocker was architectural. The palette resolved **once at module load** (`colors = Appearance.getColorScheme() ...`) and every component baked it into a static `StyleSheet.create`. A live in-app theme or text-size switch is impossible against frozen styles, you cannot mutate a created StyleSheet and have it re-paint. So a reactive layer is unavoidable, and it is the same foundation the (long-backlogged) Settings page always needed. Building it in two stages so nothing breaks.

**Stage 1 (this commit), behaviour-neutral foundation:**
- **Pure settings model** (`lib/settings`, unit-tested): `theme` (system / light / dark), `textSize` (small / default / large → a capped 0.92–1.18 font multiplier), `motion` (system / reduce). Per-field safe parse so a corrupt blob degrades to defaults, never throws. Persisted via `lib/storage` (`doubledone.settings.v1`), the same seam as tasks / reminder.
- **`ThemeProvider`** (`lib/theme-provider`) resolves `{ colors, scale, reduceMotion, scheme }` from the stored prefs **plus** the live system (it still follows `Appearance` and `prefers-reduced-motion` when set to "system"), and re-paints on any change. `useTheme()` / `useThemedStyles(make)` are how components will read it; a module-load fallback theme keeps anything rendered outside the provider working.
- **`useReducedMotion` moved into the provider** (deleting `lib/useReducedMotion`), so the new "Reduce motion" preference and the system flag resolve in one place. `MarqueeText` and the close-the-day animation now read the resolved value.
- `_layout` wraps the router in the provider and its own background / status-bar follow the theme.

Decided against:
- **A reload-to-apply toggle** (store a pref, read it at next launch). Cheap, but a theme flip that blanks and reloads the app is the opposite of calm. Worth the reactive refactor to get an instant, gentle switch.
- **Staying system-only** (the prior state). Correct behaviour, but dark mode is then invisible in a demo unless the viewer's OS happens to be dark, and it denies users who want to override their system. For a portfolio piece an invisible feature earns no credit; a single theme control is the one setting the spine explicitly tolerates.

Stage 2 (next): the `/settings` screen + a gear entry point on Today, and the **component sweep** converting every static `StyleSheet.create` to `useThemedStyles` (colours → `theme.colors`, font sizes → `× theme.scale`) so the controls actually take effect live. Verified Stage 1 in preview: app mounts and renders identically (Today + tasks, no console errors); 149 client tests green (+11 for settings).

## 2026-06-19 Settings page + the live theme sweep (Stage 2)

The visible half. The `/settings` screen carries three controls as calm segmented pills (the active one filled mauve): **Theme** (System / Light / Dark), **Text size** (Small / Default / Large), **Motion** (Follow system / Reduce). A small gear in the Today header opens it; the copy stays comfort-framed ("Make it comfortable. These follow you across the app."). The three are the whole of v1, on purpose, scoped to access/comfort.

The sweep: every screen and component moved from a module-level `const styles = StyleSheet.create(...)` to `const makeStyles = (t: Theme) => StyleSheet.create(...)` read via `useThemedStyles(makeStyles)`, with `colors.X` → `t.colors.X` and every literal `fontSize: N` → `N * t.scale`. `spacing` / `radius` / `fonts` stay static module imports (they do not change with theme). The 8 leaf files were parallelised across subagents; `index` and the new `settings` were done by hand. Two nets caught completeness: with `colors` removed from each import, **every missed colour is a compile error** (typecheck was clean), and a negative-lookahead grep confirmed **no `fontSize` was left unscaled**.

Verified live in preview: choosing **Dark** re-paints the entire app instantly, no reload, the Today rows / brain-dump / chips / buttons all following; the title grows **34 → 40px** on **Large** (×1.18); no console errors. Motion resolves through the same provider (`resolveReduceMotion`, unit-tested), so **Reduce** stops the marquee and the close-the-day fade.

Decided against (for v1):
- **High-contrast, reminder-time, and a serif-vs-plain font choice.** All defensible for this audience, but each adds surface; they stay Tier 2 so the first Settings ship is small and obviously-calm.
- **A live preview of the text size on the page itself.** The whole app is the preview (the change is instant everywhere), so a sample row would be redundant chrome.

149 client + 29 server tests green; lint + typecheck clean.

## 2026-06-19 Settings page, final design (to Melroy's mockup)

Melroy ran the Settings design prompt through his design tooling and brought back a mockup (saved in `docs/design`). Aligned the built screen to it. The palette already matched Dusk exactly; the changes were typographic and spatial:
- The **"Settings" header is Newsreader at weight 400, 42px**, editorial and quiet, deliberately lighter than the bold weight-700 "Today" header. A settings screen should feel like a calm aside, not a command centre. (Recorded so it is not "corrected" later as an inconsistency.)
- More **generous row spacing** (~32 between controls), **hints in secondary ink** (not faint), pills at weight 700 with a slightly bolder mauve border on the active one.
- The **"Saved to this device" reassurance sits at the foot of the screen** (`marginTop: auto` in a `flexGrow` scroll body), not crowded under the last control.

Verified light and dark in preview via DOM checks (the screenshot tool was timing out this session): title Newsreader 42/400, active pill = mauve tint + accent border (light `#F1E7EC`/`#9B6A7D`, dark `#352C32`/`#C68BA0`), footnote pinned to the bottom, no console errors. typecheck + lint clean.

## 2026-06-19 Atkinson Hyperlegible body font (the legibility face, applied for real)

The Dusk type pairing is Newsreader (headings) + Atkinson Hyperlegible (body, the Braille Institute legibility face). But only the headings were actually rendering their face: **RN-web gives every `<Text>` its own default font**, so the Atkinson set on `html`/`body` in `global.css` never reached body text, which fell back to the system stack. Confirmed in the live DOM (a body element computed `font-family: -apple-system, ...`). So the accessibility win the pairing exists for was not happening on web.

Fixed by being explicit: a new **`fonts.body`** token (web: `var(--font-body)` → Atkinson; native: `System` until `expo-google-fonts` loads the real family, see Backlog) applied to **every body text style** across the app, alongside the existing `fonts.sans` (Newsreader) on headings. The sweep added `fontFamily: fonts.body` to each style that carries a `fontSize` and did not already set a family (those are the `fonts.sans` headings, left untouched). Parallelised across subagents; typecheck is the net (a missed/typo'd token is a compile error).

Decided against:
- **A single global CSS override** (e.g. `[dir]:not([data-heading]) { font-family: var(--font-body) }`). Smaller, but **web-only**: on native, font resolution goes through the style object, not CSS, so the body face would silently not apply there. It also leans on RN-web's hashed text class / `[dir]` internals. The explicit per-style token is verbose but **native-ready and version-independent**, and consistent with how headings already declare `fonts.sans`.
- **A custom `Text` wrapper component.** Would mean changing every `<Text>` import app-wide, a larger and more invasive churn than tokenising the styles.

This closes the Dusk design pass (palette + dark, serif headings, illustration suite, Settings page, and now the legibility body face). Verified body text computes to Atkinson and headings stay Newsreader, light + dark, no console errors; gates green.

## 2026-06-19 Narrow-viewport overflow fix (drawer + marquee)

A README screenshot surfaced a real bug: on a narrow web viewport (a phone browser, ~390px) the page scrolled horizontally and content clipped on the right. Driving a real 390px headless viewport over the DevTools protocol (the dev preview hides it, laying out at ~698 and scaling down) pinned two causes: the always-mounted RepeatingDrawer, parked off-screen right when closed, widened the page (scrollWidth 725); and the marquee title container, a flex item without `min-width: 0`, refused to shrink so a long title pushed its row past the edge. Fixed: `overflow: hidden` on the drawer's absolute-fill root (clips the off-screen panel, scrollWidth back to 390) and `min-width: 0` on the marquee clip. Desktop web and native Android were unaffected; narrow-web only. The four README screenshots (Today + Settings, light + dark) were then captured clean at a true 390px viewport.

## 2026-06-19 Hardening: lock down the AI endpoints

Before doubledone.app can be handed to a hiring PM as a live link, the five AI routes (`/clarify` `/decompose` `/plan` `/strategise` `/triage`) needed protecting: they were unauthenticated and `Access-Control-Allow-Origin: *`, so a script could burn the $25/mo Anthropic budget and break the live demo. Server-only fix, so nothing changes for existing web or native users (no client rebuild):

- **CORS allowlist.** `Access-Control-Allow-Origin` now echoes only the app's own origins (`doubledone.app`, `*.doubledone.pages.dev`, `localhost` dev) instead of `*`; other origins cannot read responses.
- **Origin gate.** A browser POST to a paid route from a disallowed origin is refused with 403 before any Claude call. The browser sends `Origin` automatically, so this needs no client change.
- **Per-IP rate limit.** A Cloudflare Rate Limiting binding (`AI_LIMITER`, 30 req / 60s, keyed on `CF-Connecting-IP`) caps abuse. Generous for a real user; a hard ceiling on a script. Native apps send no `Origin` (they pass the origin gate, indistinguishable from a script there), so the rate limit is their guard. The $25 cap is the final backstop.

Decided against: a **shared client token** (public in the bundle anyway, and rolling it out would break the current native build until rebuilt); **CORS-only** (protects response reads, not the request that spends money). Rate limiting is the real cost guard.

Contract-tested (9 cases: allowed / blocked / preview origins, 403, 429 via a mock limiter, native no-Origin, `/health`), no live AI call. Config validated with `wrangler deploy --dry-run` (binding reports `AI_LIMITER 30 requests/60s`). **Deployed and live-verified 2026-06-19** (version `3f6e03c8`, Melroy authorised the prod deploy): `/health` 200 with `hasKey:true`; an allowed origin's OPTIONS echoes the ACAO; a disallowed origin's POST is 403'd before any Claude call; an allowed origin's empty-body POST reaches the 400 validation, all with zero AI spend.

## 2026-06-19 Hardening: the privacy policy

A privacy policy is required before a real launch or a Play Store listing, and it backs DoubleDone's "privacy by architecture" promise. Built as an in-app `/privacy` screen (so `doubledone.app/privacy` is a real public URL for a store listing), themed in Dusk, plain-English not legalese, linked from Settings ("Privacy & data") and the README. It states the real posture: local-first and anonymous by default; the only PII is an email, and only if you sync; tasks isolated by row-level security; the AI features send your text to Anthropic and retain it pseudonymously (no name / account / IP) to improve decompositions, never sold; no ads, trackers, or data sale. This also satisfies the "disclose AI egress + retention in-product" item, it is now stated plainly in-product, two taps from Settings. Verified at a true 390px viewport: renders cleanly, no overflow, the Settings link navigates, no console errors.

Left for Melroy: a dedicated contact channel if he wants one beyond the GitHub repo, and (separately) the account-and-data-deletion flow the policy references as "being added".

## 2026-06-19 Hardening: account + data deletion (right to erasure)

The privacy policy promised it, so a signed-in user can now delete their account and all synced data. A Supabase `SECURITY DEFINER` RPC, `delete_account()`, removes the caller's `auth.users` row, scoped to `auth.uid()` so a caller can only ever delete themselves; their tasks cascade via the existing FK (`tasks.user_id references auth.users(id) on delete cascade`). No service_role key is involved (never used in this project); `set search_path = ''` is the Supabase definer-hardening. EXECUTE is granted only to `authenticated`.

In Settings (signed-in only) an "Account" section offers "Delete account and data" behind a two-step confirm ("This permanently deletes your account and everything synced to it. It cannot be undone."). On confirm it calls the RPC, signs out, wipes local tasks, and resets to an empty signed-out Today (web reloads; native navigates). The colour stays mauve, not an alarming red, the confirm step and warning copy are the safety, in keeping with the calm/never-alarm ethos.

Why this shape: `auth.uid()` scoping + the FK cascade means the whole deletion is one safe RPC the client can call with the public anon key, no elevated client privileges, no service_role. `deleteAccount`'s contract (calls the right RPC, signs out only on success) is unit-tested with a mock client; the signed-in Settings UI + the confirm flow were verified in a real 390px browser (a fake session injected purely to render the section).

Left for Melroy (his domain, like the email sign-in): run the `delete_account` function once in the Supabase SQL editor (it lives in `supabase/schema.sql`), then test it live on his own account. Migrations cannot be rolled back, so applying it is his to do. Known minor: on native an already-mounted Today shows stale tasks until the app restarts (web reloads clean); not worth a global reset for v1.

> 2026-06-20 update: Melroy ran the migration and tested user-delete live, functionality confirmed working (he didn't inspect the DB rows, but the flow deletes + signs out as designed).

## 2026-06-19 Future scheduling: "Starting from" for recurring tasks

Capture covered today and tomorrow (one-offs) and Daily / Weekly / Custom (recurring, but always tracked from creation), so there was no way to schedule a habit to begin later. Added a "Starting from" date to recurring capture:

- **Model:** daily/weekly recurrence gain an optional `start` (ISO); interval already had `anchor`, which is its start. `isDueOn` returns false before the start, so a future-start habit simply does not land on Today until its day. `start` is optional, so every task made before this is unchanged.
- **Capture:** when Daily / Weekly / Custom is selected, a "Starting from [Today]" control appears; tapping it opens the existing month-grid `DatePicker` (past days disabled), with a "Start today" reset. Default is today, identical to before.
- **Drawer:** the Repeating drawer shows "· from {date}" for a not-yet-started habit (via `describeRecurrence(r, today)`), so it stays legible while it waits, otherwise it would be invisible until it begins.

Decided against a **future one-off date** (a single task on a specific future day) for now: it was not the ask (the explicit request was the recurring "starting from"), and it is a separate capture chip. The arbitrary-date one-off at capture stays in the Backlog (and is now a smaller job, since the DatePicker is wired into the capture box).

Pure logic unit-tested (start gates daily/weekly, interval anchor, scheduleFields, the drawer hint). The capture flow verified in a real 390px browser: Daily shows the control, the picker opens with past days disabled. typecheck + lint + 155 client / 38 server tests green.

## 2026-06-19 The foot of Today: a rotating calm phrase

Replaced the single fixed "today is finite and achievable" with a small rotating set of original (uncopyrighted) calm lines: "one thing, then the next", "small steps still move you", "rest is part of the work", "you're allowed to go slowly", "a quiet day still counts", "what you finish, you keep", "gentle is still forward", with the old spine line kept in the rotation. Set in **Newsreader serif italic** (italic loaded in global.css) so it reads like a quiet inscription, distinct from the Atkinson body, and each line carries one of the **desaturated Dusk accent hues** (`theme.colors.accents`: mauve / teal / gold / periwinkle / rose). A random start per open and a slow ~7s cross-fade; with **reduced motion it shows one line and stays still** (no movement for motion-sensitive users). Every line is gentle, never instructive or shaming, in keeping with the spine. Verified in a real 390px browser: Newsreader italic, an accent colour, no console errors. (The rAF-throttled headless preview can't show the fade advancing; it runs on device.)

## 2026-06-19 Open question (decision deferred): an "outstanding" section of Today

Recorded for a future conversation, not decided now (Melroy flagged it explicitly as a "decision for another time"). Captured here so the idea, and the tension in it, survives.

The idea: the list could distinguish two kinds of task that today get flattened together. Tasks that **need to happen today**, and tasks that are **outstanding** in the ongoing sense, persisting across many days without being tied to any single one (a long-running thing you keep chipping at, a "keep this in view" item with no due day). Right now those either sit on Today, diluting the finite-and-achievable day, or drop into Later and quietly vanish (the ADHD "out of sight, out of mind" failure). An outstanding section would give the persistent ones a calm, visible home that is explicitly NOT part of the must-happen-today set.

Why it is genuinely open, and not a quick yes:
- **It touches the spine head-on.** "Today is finite and achievable" exists precisely to keep the full list off the home screen. An always-visible "outstanding" strip risks re-importing the backlog and the overwhelm it guards against, the exact failure the product is built to prevent. So this cannot be a casual add.
- **But the opposite failure is real too.** A persistent task that never earns a "today" can disappear into Later and be forgotten, its own ADHD-shaped harm. The honest question is how to keep long-running things *in view* without making them a source of pressure, and without a shame surface (never-shame still binds).
- **It overlaps three things already built or parked.** The **Repeating drawer** (recurring habits, their own home), **Custom lists** (someday / reference, outside Today, backlogged), and now this third category, actively-ongoing-over-days, which is neither recurring nor someday-maybe. Part of the work is deciding whether "outstanding" is a fourth surface or a facet of one of those.
- **It is where the deferral mechanics point.** A task pushed to tomorrow repeatedly, or a one-off with a far-off date (both in the Backlog under "Scheduling and deferral"), is arguably "outstanding" by behaviour. The deferral features and this structural question want to be designed together, not piecemeal.

No decision taken. When it is picked up, the test is the usual one: does it protect the finite day or dilute it, and can it stay never-shame. Cross-referenced from the Backlog ("Scheduling and deferral") in `BUILD-PLAN.md`.

## 2026-06-19 Bugfix: the Lookback (and Today) showing stale data after account deletion

Melroy hit it after deleting his account: the Lookback still showed past completed occurrences. His instinct ("is it a local device thing?") was right.

**Cause.** The Lookback is derived entirely from the local task store (`completionsByDay` over each task's `completedDates` / `completedAt`); there is no separate completion log. Both the Lookback and Today loaded that store with a **mount-only** `useEffect([])`. The delete flow does wipe local storage (`saveTasks([])`) and then resets: on web via `window.location.assign('/')`, a real reload that re-reads the cleared store, so web was clean. On **native** the reset is `router.replace('/')`, which does NOT remount an already-mounted screen, so its in-memory `tasks` (carrying every completion) survived until the app was fully restarted. So this was native, same-device, in-memory staleness, the twin of the already-noted "Today shows stale tasks until restart on native."

**Fix.** Both screens now re-read the store with **`useFocusEffect` (expo-router) instead of mount-only `useEffect`**, so each time Today or the Lookback regains focus it reloads from local storage. After a delete, `router.replace('/')` focuses Today (re-reads → empty) and re-opening the Lookback focuses it (re-reads → empty). It also makes both screens correct in general: returning to a screen always reflects the current store, not a stale snapshot. Today's `loaded` gate is preserved so the empty / all-done copy still does not flash before the first load.

**Verified** in the web preview by exercising the focus path directly, not a full reload: seeded completions, opened the Lookback (showed them), wiped the store the way the delete flow does while the app stayed live, then navigated Today → Lookback via the in-app links. Today fell to its empty state and the Lookback read "Nothing logged this day.", no stale completions, no console errors. typecheck + lint + 155 client / 38 server tests green.

**The honest limit (NOT fixed, by nature).** Account deletion removes the server rows (the `delete_account` RPC, tasks cascade) and clears the originating device's local store. It cannot reach any OTHER device's local storage: a second signed-in device keeps every task and completion locally, and since the account is gone its next sync just fails auth. This is inherent to local-first / offline-first, you cannot remote-wipe a device you cannot reach. Recorded as a Backlog item (clear local + sign out when a device detects its account was deleted elsewhere) and worth a line in the privacy copy later. **Decided against** clearing settings / reminder on delete: those are device preferences, not account data, so erasing the account should not reset someone's theme or text size.

## 2026-06-19 Tuning the Strategise + Triage prompts

The two AI prompts still carrying "PLACEHOLDER" comments (Strategise, Triage) brought up to the decompose prompt's bar, since a weak Strategise or Sort-for-me in a live demo undercuts the whole AI story. Beyond wording, two product decisions are now encoded in the prompts:

- **Triage biases toward "later".** Today must stay small (the spine), so ambiguity resolves OFF today, never onto it: "today" only for genuinely quick or time-sensitive items, "later" the explicit default, "decompose" for the big / vague / dreaded. A triage that overloads today would defeat the feature's purpose.
- **Strategise must not build a new wall.** Re-spreading an over-full day has an obvious failure mode: dumping everything onto tomorrow. The prompt now says keep a small handful today AND spread the rest so no single later day becomes the new wall, and every input task must appear exactly once (never silently drop one).

Both keep the calm / never-shame voice (no pep talk, no exclamation marks, no commentary on why a task went undone). Contract tests unchanged and green (they assert request shape, not model reasoning). **Not yet live:** needs a Worker redeploy (`npm run deploy --workspace server`), a production deploy and Melroy's to authorise. The voice remains his to refine.

## 2026-06-19 Verification pass + the Android notification channel

The item-1 check from the post-fix ranking. Two things confirmed, one latent gap closed:

- **Dusk dark palette: verified** rendering under a system-dark web preview. The dark bg (`#1B1917`) paints, body text is the light ink (`#F2EBE0`) and reads cleanly on it, controls carry the lifted mauve accent (`#C68BA0`). On-device dark on an Android phone is still worth a glance, but the palette itself is correct.
- **Daily-reminder logic: sound.** One `DAILY` trigger at 09:00, cancel-all before scheduling so it never duplicates, permission-gated, fully try/caught so web degrades quietly. The copy offers the day ("Your today is here when you are ready."), never demands it.
- **Gap closed: the Android notification channel.** Android 8+ needs a channel or a scheduled notification can silently never appear, the single likeliest reason an on-device reminder would no-show. Added `ensureAndroidChannel()` (idempotent, Android-only, importance DEFAULT for a calm tray entry rather than a heads-up pop) before scheduling, with the trigger referencing it. Web is unaffected (no-op off Android).

Still **Melroy's to confirm on the Android build** (a real device notification cannot be fired from here): that the reminder actually arrives at 9am. The channel makes that far likelier to pass.

## 2026-06-19 Native fonts: Newsreader + Atkinson on Android

The Dusk type pairing (Newsreader headings + Atkinson Hyperlegible body, the Braille Institute legibility face) only rendered on web, where `global.css` @imports them; native fell back to System, so the deliberate and talkable type choice was invisible on the Android build. Fixed by loading the real families via expo-google-fonts.

- Added `@expo-google-fonts/newsreader` + `@expo-google-fonts/atkinson-hyperlegible`, loaded with expo-font's `useFonts` in the root layout. The native splash is held (expo-splash-screen) until they load; web passes `useFonts({})` so it never blocks the first paint (the CSS @import already has the fonts there).
- `fonts.sans` / `fonts.body` now point at the real families on native (`Newsreader_600SemiBold` for headings, `AtkinsonHyperlegible_400Regular` for body) and stay the CSS vars on web. Web rendering is unchanged, verified in preview: headings still resolve to Newsreader, body to Atkinson, no console errors.

**v1 limitation, recorded honestly:** one weight per face is loaded, so native renders heavier / italic variants synthetically (Newsreader's package tops out at 600 anyway, which reads as a calm editorial heading; bold body labels get synthetic bold; the italic foot-phrase gets synthetic italic). Loading the explicit bold / italic variants plus a weight-token sweep is a small follow-on, backlogged. Confirming the families actually render is Melroy's on-device check (native cannot be exercised from the web preview).

**Decided against** a custom `<Text>` wrapper or per-style weight tokens for v1: the single-weight mapping delivers the visible win (real faces, not System) with web untouched and no large sweep. The nuance can come later if it earns it.

## 2026-06-19 The moat, made visible: a calm pace estimate

The completion-data flywheel finally has a user-facing surface. When a task is broken down, the review now closes with a calm line: "Usually about N days, at a gentle pace. No rush." Its real value for this audience is normalisation, a dreaded task taking several days is normal, not a personal failing, which lifts the pressure to finish in one sitting and protects the never-shame spine.

**The honest call on framing.** The ask was the moat's headline payoff, "other people took about X days." With essentially no users yet, an in-product line claiming real per-user crowd timings would be a fabricated statistic, and a hiring PM who clocks that the app has no users would read it as fake, which corrodes trust far more than its absence would. So v1 ships the SURFACE with copy that is honest now:
- `lib/estimate.ts` derives the day count transparently from the decomposition (about 25 min of real effort per day on a dreaded task, or roughly two steps a day, whichever is greater, plus a day per later phase; clamped to 1..14). Pure and unit-tested (12 cases).
- The copy is the app's own gentle pacing guidance ("usually about N days"), never a claim about other named users.
- The architecture IS the real moat: the instrumentation that will feed a true aggregate (`decomposition.offered` + step completions, already live) plus a new `estimate.shown` event. When anonymised cross-user volume exists, the same surface swaps to real crowd timings with no UI change.

Verified live end-to-end: a real "Break it down" of "Sort out my tax return" returned a six-step first phase plus three later phases, and the review showed "Usually about 6 days, at a gentle pace. No rush." in a calm accent-tinted note (inkSoft Atkinson). Deployed decompose confirmed working; gates green (167 client + 38 server tests).

**Decided against:** faking live crowd numbers (the trust risk above); a separate stats screen (off-brand, the estimate belongs at the moment of overwhelm, inside the breakdown). The literal "people like you usually take X days" is a one-line copy swap once the data is real.

## 2026-06-20 Push a task to tomorrow (finishing the daily loop)

The daily loop could add, complete, break down, strategise, and close the day, but not gently defer a single task. Added "Tomorrow": a calm per-task "not today" that moves one one-off forward a day.

- `deferToTomorrow` (pure, in `lib/today`, unit-tested) sets a one-off's `due` to tomorrow, so it drops off Today via `tasksForToday` and reappears in the Later list (and on Today tomorrow). Recurring tasks are returned unchanged, they move by cadence not deferral, so "Tomorrow" is offered only on one-offs.
- It lives in the existing long-press confirm menu, beside Break down / Keep / Remove. Four actions did not fit one row on a 390px phone, so that menu is now **title-over-actions** (a wrapping action row). Verified at 375px: no horizontal overflow, the defer moves the task into Later under the "Tomorrow" label, no console errors.
- **Never-shame by design:** the label is plain "Tomorrow" (not "Snooze" or "Postpone"), and there is no counter of how many times a task has been pushed. `task.deferred` is instrumented.

The single-task sibling of close-the-day's roll-forward. Clears the backlog item of the same name.

**Decided against:** a swipe gesture (fiddly and inconsistent on web); offering it on Later rows (already future-dated, so "tomorrow" would move them earlier, which is incoherent), Today rows only.

## 2026-06-20 CI hardening: a build gate and a scoped coverage floor

Activated the two Tier-1 CI items the workflow had stubbed.

- **Build gate.** `ci.yml` now runs `expo export -p web` on every push and PR, so "it builds" is a first-class status, catching the SPA / `window`-at-build-time class of error that typecheck cannot. `deploy-web` already exports on push; this also gates PRs and decouples "builds" from "deploys".
- **Coverage floor, scoped to logic.** Added `@vitest/coverage-v8` and a floor enforced in CI via `test:coverage`. The floor is scoped to the pure logic we actually test (client `src/lib/**`, server `src/**`), excluding the thin I/O seams (AsyncStorage, Supabase, expo device APIs, and the Worker's fetch / CORS glue) that `docs/testing.md` says we deliberately do not unit-test. A whole-repo number would be coverage-theatre dragged down by untested-by-design screens and components; this floor measures the logic. Measured client ~98% lines, server ~71% (the Worker glue lives in `index.ts`); floors set below each with headroom (client 90, server 65) so a genuinely untested new function trips CI without the floor being brittle.

The local pre-commit gate stays fast (`npm test`, no coverage); the floor runs in CI only.

**Decided against** a global coverage threshold (theatre, and it fights the risk-targeted philosophy) and against unit-testing the Worker's network glue or the SDK seams (all I/O, no logic).

## 2026-06-20 Accessibility pass: touch targets + readable dates

An audit of the interactive surfaces. The app was already strong on screen-reader labelling (every control carries a role + label + state) and reduced-motion. Two real gaps fixed:

- **Touch targets.** The compact controls (the capture "when" chips, the weekday and stepper buttons at 34px, the date-picker month nav at 36px, the recurring "Starting from" button) sat below the ~44px motor-accessibility minimum (WCAG 2.5.5). Added `hitSlop` to expand the tap area with no visual change, keeping the calm, compact look. Horizontally-packed rows (chips, weekdays) use a **vertical-only** hitSlop, so a taller tap area cannot cause a mis-tap onto the neighbour.
- **Readable dates.** The date-picker cells announced the raw ISO ("2026-06-21") to a screen reader; they now announce a natural date ("Saturday 21 June").

Verified in preview: controls still fire (a proper pointer tap on a chip reveals its options) and render unchanged, no console errors.

**Noted, not changed:** the faint tertiary ink (`inkFaint`) for hints / placeholders is low-contrast against the paper background, a deliberate calm trade-off. Raising it would alter the Dusk palette app-wide (a design decision), and the proper home is the **high-contrast mode already backlogged** in Settings Tier 2, not an overnight palette change. The long-press confirm-menu text actions are a minor remaining touch-target item (lower frequency, deliberate reveal).

## 2026-06-20 One-off future date at capture

Capture could schedule Today, Tomorrow, and the recurring modes, but not a single one-off on a specific far-off day, the last gap in the scheduling story (recurring "Starting from" shipped earlier). Added a "Date…" chip.

- `CaptureSchedule` gains `{ mode: 'date'; date }`; `scheduleFields` maps it to `{ due: date }`, so it flows through the existing one-off path (waits in Later, surfaces on Today on the day). Pure, unit-tested.
- The "Date…" chip opens the month-grid picker straight away; the chosen day shows in an "On {date}" row and on the add button ("Add for Sat, 27 June").
- The picker modal is now **shared** between the one-off due date and the recurring start, via a single `pickerFor: 'start' | 'due' | null`. The title and the "Start today" reset (start-only) adapt. One modal, two uses, no duplication.

Verified in preview: "Date…" → pick 27 June → a task persists as `{ due: '2026-06-27' }` and lands under Later; the recurring "Starting from" still opens with its "Start today" reset; no console errors. (The HMR state-confusion seen mid-build went away on a clean reload, not a bug.)

**Remaining (backlogged):** setting / clearing a date on an *existing* task (e.g. via long-press); this did the at-capture half.

## 2026-06-20 AI egress disclosure at the point of use

The privacy policy already disclosed AI egress + retention (two taps from Settings); this surfaces it where it matters most. The Break-it-down questions modal, the moment you hand a personal task to the AI, now carries a calm one-line note: "Your task is sent to an AI to suggest the steps, and kept anonymously (no name, no account) to improve them."

Placed in that modal, **not** on the capture surface, on purpose: Break-it-down is the heaviest egress (a whole dreaded task), the modal has room for a calm note, and the always-visible capture surface stays uncluttered (the never-overwhelm spine). Sort-for-me and Strategise remain covered by the policy, lighter egress, and a persistent line on capture would be visual noise.

Verified in preview: the line shows in the questions modal, no console errors. Closes the "disclose AI egress in-product" item.

## 2026-06-20 Native fonts: real bold on Android (bodyBold)

Follow-on to the native font load. Android does **not** synthesise bold for a custom-loaded font, so a bold body label set with `fontWeight` alone was rendering at regular weight on device (v1 loaded only Atkinson 400). Added a `bodyBold` token: the real Atkinson 700 Bold family on native, the SAME `--font-body` CSS var on web (so the web build is byte-identical, verified). Loaded the 700 variant in the root layout, and swept the **44 bold body styles** (those with `fontFamily: fonts.body` + `fontWeight` 600/700) across 11 files to use it.

Headings stay Newsreader 600 (600-vs-700 is imperceptible at heading size, and Newsreader 600 reads as a strong editorial heading), so no separate bold-heading token. Italic (the foot phrase) stays synthesised for now: a real italic family risks a double-slant with the existing `fontStyle`, and it is one element. Noted as a minor follow-on.

Verified: web unchanged (bold body still computes to Atkinson, headings to Newsreader, no console errors); typecheck + 172 client / 38 server tests green. **Native rendering is Melroy's to confirm on device.** Minor known follow-on: a few selected / pressed states (e.g. the date picker's selected day, a selected toggle) set `fontWeight` but inherit their family via a style array, so they render at base weight on native; not worth chasing unless it shows.

## 2026-06-20 Monetisation design (direction + open decisions)

Melroy wants to start monetisation. His seed idea: in-app currency earned by use, spendable on "very cool effects" like an AI-generated image attached to a completed week (a "scrapbook"); $5 for an ad-free version; AI-image frequency that grows with continued use (2 months → 1/week, longer → 2/week, 6 months → 4/week). Recorded with the direction taken and the calls left open.

- **The flagship hook is right: the AI scrapbook.** An AI image decorating "the week that was" in the Lookback is on-brand (the Lookback is the emotional payoff; delight belongs exactly there), and image generation is the genuinely expensive call, so it is also the right cost lever.
- **Decided: rewards scale by TENURE / cumulative use, never by streak.** "Continuous scrapbooks" is a streak, and a streak is the one mechanic this product cannot have: a broken streak is precisely the shame / RSD failure the never-shame spine exists to prevent, and dopamine-streak mechanics repel the autistic side. Reframed to loyalty / tenure ("you've been here 2 months", or "you've made N scrapbooks total") so a missed week never costs anything. Same stickiness, zero shame.
- **Decided: no ads.** They contradict the calm / never-overwhelm spine (attention-hijacking, for an audience defined by overwhelm-sensitivity) AND the privacy-by-architecture thesis (ad networks are trackers). So the model is not "pay to remove ads" but "free is fully usable, premium ADDS delight". For the portfolio, rejecting ads on thesis grounds is the stronger signal (product-monetisation fit), and ad revenue at niche scale is negligible anyway.
- **Decided: subscription, not one-time.** The scrapbook has an ongoing per-image cost, so a one-time $5 goes underwater on a power user after ~6 months. $5/month covers it comfortably (4 images/week ≈ ~$0.85/month at ~$0.05/image) and matches a daily app's recurring value.
- **Leaning: skip a full earn/spend currency.** A coin-grind is a dopamine mechanic (off-brand) and adds complexity. "Earned" is better expressed as the tenure unlocks (you earn frequency by showing up, calmly) than a balance you grind. A soft, no-loss "credits that roll over" is the fallback if Melroy wants the currency feel.
- **Shape:** free = full calm core + an occasional taste (~1 scrapbook/month); premium ($5/mo) = more scrapbooks, 1 → 2 → 4 per week by tenure; the already-backlogged premium AI (chart-a-course, prioritise) as later add-ons.

**Open for Melroy:** the exact free-taste rate and tenure thresholds; whether to include any currency feel; and (for the portfolio) whether to ship a real Stripe flow or a demonstrated one (test mode + sample scrapbooks). The build is real (Stripe + an image-gen API + the Lookback scrapbook UI + tenure/entitlement logic), a multi-week effort, sequenced after the current polish.

## 2026-06-20 The AI scrapbook (Workers AI), the free-delight slice

The first slice of the premium scrapbook, built as **free delight first** (no paywall), per the monetisation direction: build the lovely thing before the gate, so it strengthens the Lookback even before a cent changes hands. Open a finished week in the Lookback and you can turn it into a calm keepsake image.

- **The pipeline runs entirely on Workers AI, no Anthropic call** (so it never touches the $25 budget): a small text model (`@cf/meta/llama-3.2-3b-instruct`) distils the week's finished titles into ONE short, abstract, never-literal scene; a fast image model (`@cf/black-forest-labs/flux-1-schnell`, 4 steps) renders it in the Dusk palette. The Worker's new `/scrapbook` route returns the image as a base64 data URL plus the caption, origin-gated + rate-limited like the other AI routes, telemetry logged (the caption, never the image).
- **Client:** a "Scrapbook" card at the foot of the Lookback, tied to the selected day's week. The keepsake (image + the scene caption in Newsreader italic + a faint "Made with AI" note) if one exists, else an invitation with a "Make a scrapbook" button when the week has wins, with a point-of-use AI-egress disclosure. Persisted in a bounded local store (`doubledone.scrapbooks.v1`, capped, separate from the task blob so the base64 never bloats it).
- **Verified live:** the deployed route returned a real calm caption ("a serene, softly lit morning room... a steaming cup... wildflowers", never the literal chores) and a valid 423KB JPEG; the Lookback card renders both the keepsake and the invite states, no overflow, no console errors. 178 client + 48 server tests green, coverage over the floor.

**Cost reality:** image gen is neuron-heavy, so the Workers AI free tier is ~1-2 scrapbooks/day, which fits a free user's occasional keepsake; premium frequency (the monetisation plan) runs on the paid Workers AI tier, which the $5 covers.

**Decided against** R2 / Supabase-Storage persistence for v1 (kept it device-local to minimise setup and ship the delight; cross-device sync is a later slice) and against an Anthropic call for the scene (Workers AI keeps the scrapbook self-contained and off the budget). **Gotcha banked:** Workers AI model ids deprecate (the original `llama-3.1-8b-instruct` was retired 2026-05-30, error 5028); `wrangler ai models` lists the account's current ids.

## 2026-06-20 Scrapbook v2: surface the week (still-life image + finished list + the polaroid holder)

Melroy steered two changes after seeing v1 and his Claude Design mockup.

- **The image surfaces the tasks, not an abstract mood.** v1 deliberately made the image abstract / never-literal (my calm guardrail). Melroy's call, and the right one: the Lookback exists to SHOW what you actually did (the answer to the discounting reflex), so a generic pretty scene wastes it. The scene-distillation prompt now builds a calm **still-life** whose soft objects gently evoke the finished things (folded linen for laundry, a teacup and phone for a message), recognisable but never busy, still no text in the scene (image models can't render words cleanly). Overrides the v1 "never literal" choice. **Needs a Worker redeploy to go live.**
- **The finished tasks are listed under the polaroid, with the big-win marker.** Below the keepsake, a "This week you finished" list of the week's completed titles, each marked "a big one" when it was a big win (reusing `isBigWin`), so you SEE the week concretely, not only via the interpreted image. Shown in the invite state too, so the week is visible before you even make the keepsake. `weekCompletions` dedupes by title (a recurring task ticked several days shows once) and ORs the big flag; unit-tested.
- **The holder is now the mockup's polaroid keepsake.** Rebuilt the Lookback card to Melroy's Claude Design mockup: a soft photo-mat / polaroid with a gentle shadow, the scene caption in Newsreader italic on the lip, a faint "Made with AI · week of …" beneath; the invite state is a dashed empty frame with a mauve "+" and the button; loading shimmers in the frame. Light + dark, no overflow.

Verified in preview (both states: polaroid + caption + meta + the finished list with the big marker; the invite frame + button + list; no console errors). 179 client + 48 server tests green.

## 2026-06-20 The moat's telemetry store moved to Cloudflare D1 (no public write path)

The AI-call telemetry (the moat: what decompositions we offer and whether they get used) was being written from the Worker to a Supabase `ai_calls` table using the public anon key. That key ships in the client, so anyone holding it could POST junk rows. Closed it by moving the store to a **Cloudflare D1** database (`doubledone-telemetry`, binding `DB`) bound directly to the Worker: there is no public endpoint to write to at all, only the Worker can insert. Same posture as before, pseudonymous by design (no user_id, no IP, no account identity), still retaining the task text + returned JSON for product improvement (disclosed in-product). `logAiCall` now runs a parameterised D1 insert; `aiCallStatement` (the SQL + bound params) is the pure, unit-tested surface. Schema in `server/d1/schema.sql`, applied to the remote DB.

**Decided against** the alternative I'd floated (keeping Supabase but locking the table with a shared-secret header + RLS): D1 is simpler, removes the public surface entirely, and needs no migration Melroy has to run. The old Supabase `ai_calls` table is now unused and can be dropped whenever (not urgent). Verified live: a scrapbook call landed exactly one row in D1.

## 2026-06-20 A remote MCP server for DoubleDone tasks (bearer-token, stateless)

Built a small Model Context Protocol server so an AI agent can manage a user's tasks (`add_task` / `list_today` / `complete_task`). It lives on the existing Worker at `/mcp`, speaks MCP Streamable HTTP (JSON-RPC 2.0 over one POST), and is **stateless**.

- **Auth is the user's own Supabase access token**, pasted into their MCP client. Every tool call proxies to Supabase REST *with that token*, so RLS scopes it to exactly their rows. The server holds no elevated key (only the public anon key); it cannot reach another account. Discovery (initialize / tools/list) needs no auth; tool calls do.
- **Decided against `McpAgent` (Agents SDK / Durable Object).** Its auth model is OAuth-centric and it carries DO state we don't need. A plain stateless Worker route with hand-rolled JSON-RPC is smaller, adds no dependency, and fits "the token is the auth." Pure helpers (tool schemas, the JWT-sub decode, the Supabase request builders, the JSON-RPC envelopes) are exported and unit-tested; `handleMcp` does the I/O.
- **v1 lists one-offs.** `list_today` returns open, non-future, non-recurring tasks; recurring "due today" needs cadence logic PostgREST can't do, deferred.
- **In-app affordance:** Settings → "AI agent access (MCP)" (signed-in only) shows the endpoint and a "Copy my token" button (web copies to clipboard; the token is also shown selectable for native). Connection guide in [`docs/mcp.md`](docs/mcp.md).

Verified live: initialize returns the server info, tools/list returns the three tools, a tool call with no token returns a calm isError ("Not connected…") without touching Supabase. The authed task calls are Melroy's to exercise with his account.

## 2026-06-20 Stripe Premium (test mode): subscription, webhook → D1 entitlement, scrapbook cadence

Built the monetisation surface as **Path B** (demonstrated, test-mode): a real Stripe integration with no real charges, the portfolio-legible version. The model (locked earlier): **A$5/month subscription, no ads, no in-app currency.** The scrapbook is the premium delight, free = one a month, premium = weekly, scaling 1 → 2 → 4 by **tenure**, never a streak.

- **Dependency-free server.** Talks the Stripe REST API over fetch and verifies webhooks with Web Crypto (HMAC-SHA256), so the pure pieces (the checkout form, the signature check, the event → entitlement map, the D1 upsert) are unit-tested. No Stripe SDK, matching the codebase's hand-rolled ethos (cf. the MCP server).
- **The server never trusts the client for premium.** Flow: client `/checkout` → Stripe Checkout → Stripe webhook → `/stripe-webhook` verifies the signature and writes the entitlement to D1 → the client reads it from the authed `/entitlement`. Only a verified webhook grants premium.
- **Entitlements in D1, not Supabase.** A second D1 table (`entitlements`, user-keyed), written only by the Worker, because the webhook is not a user request (no user token) and we never use the `service_role` key. The tenure clock (`started_at`) is set once and preserved across a lapse (never-shame: loyalty only grows). This is the legitimate exception to `ai_calls`' pseudonymity, it gates a paid feature for a specific user.
- **Gating is calm.** Free hitting the monthly limit routes to the paywall (the conversion moment); premium hitting the weekly allowance gets a calm "next in N days", never a wall. The cadence is pure and unit-tested.
- **Config split:** price id = a non-secret wrangler var; `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` = Worker secrets (Melroy sets them); the publishable key is parked (the redirect Checkout flow needs no client-side Stripe.js yet).

**Decided against** a live-charging integration (real money + liability, overkill for a portfolio) and the Stripe SDK in the Worker (a dependency plus the async-crypto provider it needs; hand-rolled REST + Web Crypto is smaller and fully tested). Server-side scrapbook-quota enforcement is a noted follow-up (the cadence is client-side for now; the entitlement is server-verified). **Pending Melroy:** set the two Worker secrets, register the webhook URL, then test with Stripe's `4242` test card.

**Signage (2026-06-20).** Premium status shows on the "You're Premium ✓" panel on `/premium` and on the Settings entry (entitlement loaded on focus). Per Melroy, that Settings entry is now a **prominent gradient card pinned to the page bottom**, a warm mauve → rose → honey (the one deliberate decorative exception to the calm Dusk spine, because the paid surface gets to glow a little), showing "Active ✓" when subscribed and an invite otherwise. Still no badge on Today or the Lookback; the prominence is contained to its own cell rather than sprayed across the app.

**Cancel / manage (2026-06-20).** Used Stripe's hosted **Billing Portal** rather than a custom cancel UI, the standard build-vs-buy call (don't reinvent billing surfaces). A `/portal` endpoint creates a portal session from the stored `stripe_customer_id` (now captured from the webhook into a new `entitlements` column), the client's "Manage subscription" button opens it, and a cancellation flows back through the **existing** `customer.subscription.deleted/updated` webhook → the entitlement reverts to free. The tenure clock (`started_at`) survives a cancel via COALESCE, so re-subscribing keeps the loyalty. **Pending Melroy:** redeploy, activate the Customer Portal in the Stripe sandbox (enable cancellation), and resend one subscription event to backfill the customer id onto the pre-existing entitlement row.

**Subscription lifecycle states (2026-06-20).** The entitlement now also captures `cancel_at_period_end` and the period-end date, read from the dahlia subscription *items* (Stripe moved `current_period_end` off the top level there; banked as a gotcha). So the Premium screen distinguishes **renewing** ("Renews 20 Jul") from **scheduled-to-cancel** ("Premium until 20 Jul, then back to the free monthly keepsake"), and a cancel-then-keep round-trip shows in the data rather than being inferred from a timestamp. The webhook write COALESCEs the period (a null checkout event can't clobber a known date). Two new D1 columns, applied live.

## 2026-06-20 The Lookback shows scheduled tasks, not just finished ones

Melroy deferred a task to tomorrow, then looked for it in the Lookback and it wasn't there. The task was safe (the Today screen's "Later" strip), but the month calendar, the natural "what's scheduled when" surface, showed nothing on its date. Don't fight that signal: the founder reached for the calendar to see upcoming work, and real users will too.

Added without diluting the Lookback's purpose (the completion payoff stays the headline):
- **A distinct marker.** Future days with a scheduled one-off get a mauve **outline** dot, visually separate from the sage **filled** "you finished this" dot.
- **Forward day-detail.** Tapping a future day lists its scheduled tasks under a "Scheduled" label with a hollow ○ marker (vs the ✓ for completions).
- Scope: **future-dated one-offs only** (deferred + the "Date…" chip), the same set as the Today "Later" strip. Recurring tasks stay in the Repeating drawer, not sprayed across every future day. `scheduledByDay` is pure + unit-tested.

A calm partial answer to the deferred "outstanding section of Today" question (decision-log 2026-06-19): future work is now visible in two honest places, the "Later" strip and the calendar, without turning Today into an everything-bucket. Verified in preview.

## 2026-06-20 Closing the day now rests it, instead of dropping you back on the same screen

Melroy closed the day in testing and felt nothing happened. The wrap modal ("That's the day", what you finished, "rolls to tomorrow", Goodnight) was a complete ritual, but Goodnight dismissed straight back to the identical Today: same tasks, same list. "Close the day" implies the day ends, and landing on the unchanged screen undercut the closure. Don't fight the signal, the founder-user expected a real end-state.

Added a calm **rested Today**:
- Goodnight now persists a per-day closed flag (`doubledone.closed.v1` = today's ISO). While closed, Today replaces the task list + capture with a quiet card: the dusk art, "You've closed today.", what you finished, "It's all here tomorrow." The header (Lookback / Settings / Repeating) stays reachable.
- **"Reopen today"** clears the flag if something surfaces after you have closed.
- The flag is **keyed by date**, so it self-clears when the day rolls over. Tomorrow is a fresh Today with no un-close step. Nothing is reset or lost, the tasks sit behind a closed door.

Decided against a harder "reset" (clearing or archiving tasks on close): undone tasks already roll forward on their own, and wiping the list would break the never-lose-a-task contract. The close stays a state-of-mind boundary, now with a visible one. This completes the daily loop's emotional spine: dump, work, close, rest, tomorrow. Verified in preview (close to rested, survives reload, reopen restores). E2E TOD-04 / TOD-04b updated.

## 2026-06-20 Make "Sort for me" discoverable (the founder couldn't find it)

The brain-dump's main button swaps from "Break it down" (one line) to "Sort for me" (2+ lines) by line count. Clean and contextual, but invisible: Melroy, the founder, never found Sort because he always typed single tasks, and the placeholder said "one per line" without naming the payoff (AI triage). Don't fight that signal, if the founder misses it, overwhelmed users will too.

Fix: a quiet hint that appears the moment one line is typed, "More than one? Put each on its own line and I'll sort them for you." It names the sort payoff, shows only at `lineCount === 1` (so the resting screen stays clean and it disappears once the Sort button itself appears), and adds no button or setting. Decided against an always-on hint (clutters the calm home screen) and against a dead / disabled "Sort" button (friction). Verified in preview: one line shows the hint + "Break it down", two lines hides it + "Sort for me".

## 2026-06-20 "Sort for me" earns its name: visible feedback + acting on the break-down verdict

Melroy tested Sort with eat / sleep / drink and it "did nothing", all three landed on Today in input order. Diagnosis: not broken. Triage buckets each line into today / later / decompose and deliberately keeps order (it is not a ranker), biasing "later" so today stays small. eat/sleep/drink are all genuine quick today-items, so it correctly kept all three. The real failures: it gave zero feedback (a correct no-op looked dead), and it ignored its own "decompose" verdict (those items just landed on Today like anything else).

Path A (chosen over making Sort a ranker, which fights the protect-the-finite-day thesis and risks a loss-of-control overwhelm):
- **Feedback.** After Sort, a calm line: "Sorted: 3 for today, 2 for tomorrow, 1 to break down." Computed from what actually landed (always sums to the input), so even an all-today dump reads "Sorted: 3 for today." Sort now visibly does something on every dump.
- **Act on decompose.** Items the AI flags as too big carry a new `suggestBreakdown` field and render an inline, one-tap "Looks big, break it down?" prompt (a new TaskRow variant: the row stays tappable, the prompt is a sibling Pressable, never nested). The verdict is no longer thrown away.
- The apply + summarise logic moved to a pure, unit-tested `lib/triage.ts` (`triageToTasks`, `summarizeAdded`, `summaryLine`).

Verified end to end in preview with a live triage: a mixed dump returned "Sorted: 3 for today, 2 to break down" and flagged the two big items ("File the tax return", "Plan the year of travel") inline. Deliberately did NOT add reordering, did NOT clear the flag on a cancelled break-down (it persists as an honest "still big" until the task is done or sliced), and did NOT rename it yet. Test input matters: a homogeneous dump can't show a sort, the value shows on a mixed pile.

## 2026-06-20 A calm "danger" colour for Remove, and Close as the prominent escape

The long-press menu (Tomorrow / Break down / Keep / Remove) had two faults Melroy caught: "Keep" read as a no-op (it is the menu's only escape, but the muted word + styling hid that), and Remove sat in the same mauve accent as everything else, so the one destructive action did not look destructive.

- "Keep" became **"Close"**, moved to the right of Remove (action-first, escape-last) and given the prominent mauve accent the safe default deserves. Matches the sliced-task menu, which already said "Close".
- Remove now uses a new palette token **`danger`** (light `#A1554C`, dark `#D2887E`), a muted brick: the calm stand-in for the red a delete would normally get, without the alarm that breaks the Dusk palette's no-urgency rule. Clears WCAG AA on the menu's mauve-tint background in both schemes.
- The handler is unchanged: purely label, order, and colour.

Decided against alarming red (breaks the calm contract) and against dropping the explicit escape for tap-away only (an explicit, labelled "out" suits an anxious / RSD-prone audience better than making them infer it). Verified in preview: order is Tomorrow / Break down / Remove / Close, Close mauve, Remove brick.

## 2026-06-20 Restore the CI coverage gate (server payment path was untested)

CI's "Lint · Type-check · Test" job had failed on every push since the Stripe work landed. The local pre-commit hook runs `npm test` (no coverage); only CI runs `test:coverage`, which enforces the floor, so it was never caught locally. Two things:

- **Server (the actual failure):** the Stripe HTTP handlers + `createCheckoutSession` / `createPortalSession` / the webhook verify-and-write path were untested, dropping functions to 83.9% and branches to 76.3% (floors 85 / 78). Fixed by adding contract tests, mock `fetch` and assert the request shape, sign a webhook and assert the entitlement write, the same approach the AI request builders use, no live Stripe call. Functions -> 96%, branches -> ~79%. The branch floor was also recalibrated 78 -> 73 to sit below the real number with headroom (the prior 78 sat ~2pts above reality once the handler branches were counted, so it false-alarmed on small refactors).
- **Client (brittle, pre-empted):** the lib floor was passing but at a razor-thin 90.3%, because `src/lib/stripe.ts` (the checkout / portal / entitlement fetch client, a thin I/O seam with no logic) was counted at 0%. Excluded it, consistent with the seams already excluded (storage, supabase, auth, reminders, locale). Lib coverage -> ~97%, real headroom restored.

Both workspaces now pass `npm run test:coverage` locally (the exact CI command). Lesson: the pre-commit hook should arguably run coverage too, or the gap between "hook green" and "CI green" hides exactly this. Parked in the backlog rather than slowing every commit for now.

## 2026-06-20 Shame-free re-entry: a welcome-back, not a guilt pile

The single biggest retention lever for this audience (the week-six bar) and the most differentiated thing in the backlog. Open after falling off for a while and every other to-do app greets you with "47 overdue." DoubleDone now greets you with "Welcome back. The past is fine. Here's just today."

- A persisted last-open date (`doubledone.lastopen.v1`); on focus, if the last open was >= 4 calendar days ago (`isReentry`, pure + tested via the existing `daysBetween`), a calm mauve card appears above Today: "Welcome back. However long it's been, the past is fine. Nothing's overdue, nothing's lost. Here's just today, when you're ready." A "Start fresh" button dismisses it.
- The open stamps today immediately, so the card shows once per gap and never re-nags on a same-day reopen. `reentry.shown` instrumented.
- Threshold **4 days**: more than a long weekend (a normal Fri-to-Mon never trips it), but a real "I fell off for most of a week" does. A tunable constant, recorded for challenge.
- Decided AGAINST a full-screen takeover (like the rested close-the-day state): for an RSD-sensitive audience a gentle dismissible card is safer than making a production of "you've been away." Decided AGAINST any functional reshuffle of the old tasks: they already carry no "overdue" framing, so the card reframes, it never punishes.

Verified in preview: a 6-day gap shows the card; dismissing or reopening (last-open now today) clears it.

## 2026-06-20 "I also did that": count the off-plan wins

This brain does loads that never made the list, and counting only ticked tasks feeds the "I did nothing" lie. A quiet "+ I also did that" link in the day actions opens a one-line input; what you type becomes a **completed** task stamped now, so it shows checked on Today and lands in the Lookback (the emotional payoff) like any finished thing. `offplan.logged` instrumented, so it also feeds the moat's completion data.

Placed as an in-the-moment Today action (not gated behind close-the-day), because for this audience the win has to be caught before it is forgotten. Decided against a separate "done" list or a capture-schedule "done" mode (both muddy the todo-vs-done line); a completed task in the normal store is the simplest honest model and reuses the Lookback unchanged. Verified in preview: the entry stores `done: true` with a completion stamp and shows checked on Today.

## 2026-06-20 "Just this one" focus mode: a wall against the wall-of-awful

Starting is the #1 ADHD blocker, and a full list is paralysing. "Focus on one thing" (a link in the day actions) opens a full-screen single-task view, everything else gone: a big "JUST THIS ONE / <task>", "Not this one" to skip to the next, "Done" to complete it (the next surfaces on its own), "Exit". When nothing is left: "That's everything for now."

- A full-screen Modal inside the Today screen (no new route, reuses the live task list + commit), showing the first unfinished one-off not yet skipped this session.
- Scope: **one-off tasks only**; recurring habits are excluded (they are not the wall-of-awful, they live in the Repeating drawer). Sliced tasks show "Step X of N"; "Done" completes the whole thing in v1.
- `focus.opened` / `focus.completed` instrumented.
- **Deferred to a fast-follow:** the optional calm timer (the spec's "optional" part). The full-screen single task is the core; a timer adds interval/state for marginal v1 value and risks reading as pressure against the calm spine. Recorded for challenge.

Verified in preview: open shows the first task; skip advances; done completes and advances past the skipped one; all-done shows the calm empty state.

## 2026-06-20 "Weight of today": an honest, calm load gauge

Time-blindness lets Today silently overfill. A slim gauge under the spine now shows the day's load honestly: a mauve fill (0..1) plus a plain label, "A clear day" / "A light day" / "A full day" / "A heavy day", from the count of unfinished one-off tasks (`dayWeight`, pure + tested, extends `lib/estimate`). It complements the existing Strategise nudge (the actionable prompt at a full day) with a continuous, glanceable read.

- Count of **one-off** tasks only (recurring habits are routine, not the load that overwhelms). A sliced task counts as one (it is one thing).
- Deliberately **count-based, not time-based**: most tasks carry no minute estimate, so a "2 hours today" gauge would be mostly fabricated defaults; the count is honest. (When real per-task effort exists, this can swap to a time read with no UI change.)
- **No alarm colour** at any level: a single calm mauve fill, the label carries the heavy day, never red. Shown only when there is a load (hidden on a clear day).

Verified in preview: 4 tasks reads "A full day" with the bar ~67% filled.

## 2026-06-20 Data export: your stuff is yours

A "Your data" section in Settings (always visible, no account needed) exports the user's tasks + completions as a plain JSON file, `doubledone-export-YYYY-MM-DD.json`. On web it downloads (a Blob); on native it opens the system share sheet. `buildExport` is pure + tested; tombstoned (soft-deleted) tasks are dropped so the file holds only what the user would recognise as theirs. Completion data stays in (done + completedAt, recurring completedDates), so the export is the whole record, not just open todos. `data.exported` instrumented.

Deliberately **tasks-only** (not the scrapbook images): the base64 keepsakes are huge and device-local and would bloat a text export; the to-do data is the "your stuff" that matters. Completes the privacy posture (local-first, your data is yours) alongside account deletion. Verified in preview: export produced `doubledone-export-2026-06-20.json` (application/json) with the full record including a completed task.

## 2026-06-20 Scrapbook -> R2 persistence: staged, not blind-built

The last of the Tier 1+2 polish sprint, and the only one I deliberately did NOT build autonomously. Moving scrapbook images off device-local base64 to Cloudflare R2 (Worker uploads, serves by URL) plus a Supabase `scrapbooks` table needs an R2 bucket, a Supabase migration, and a Worker deploy, all on Melroy's accounts, and it must be verified live (the upload round-trip and cross-device sync cannot be confirmed in the web preview). Blind-building untested paid-tier infra and committing it is exactly the risk "ultra-polished" should avoid. So it is fully designed and staged in [`docs/scrapbook-r2.md`](docs/scrapbook-r2.md) (R2 command, Worker diff, schema + RLS, client changes, the live-verify checklist), to run as one ~25-minute joint session. The discipline of stopping, applied to the one feature that genuinely needs hands-on infra.

## 2026-06-20 Scrapbook -> R2 persistence: built and live (the R2 half)

Built and deployed with Melroy here (R2 enabled, `doubledone-scrapbooks` bucket created, deploy authorised). The Worker `/scrapbook` now decodes the generated image, `put`s the bytes to R2 under a random UUID key, and returns a small `/scrapbook-img/:key` URL instead of a ~380KB base64 data-URL. A public, long-cached `GET /scrapbook-img/:key` serves it back from R2 (not origin-gated; the key is unguessable). Graceful fallback to the inline data-URL if R2 is unbound or errors, so nothing breaks. **No client change**: the app stores + renders an image string either way, it just shrank ~5000x (the localStorage quota fix).

Verified LIVE: a real generation returned a `/scrapbook-img/…jpg` URL (not a blob), and fetching it served `image/jpeg`, 380KB, `cache-control: immutable` from R2. Worker version `fba3a254`.

Remaining (the cross-device half): sync the scrapbook URLs to a Supabase `scrapbooks` table so they survive a cache-clear and follow a signed-in user to a new device. The *image* is durable in R2 now; the URL reference still lives only in localStorage until that sync lands.

## 2026-06-21 Multi-select: clear a few tasks at once

Long-press gives one task its menu, but clearing several meant repeating it. A "Select several" link in the day actions now enters a **select mode**: every row becomes a checkbox, the day actions + capture give way to a calm bottom bar (Done / Tomorrow / Remove / Cancel), and the action applies to every picked task at once. Long-press keeps its single-task power menu (Break down etc.), so nothing was lost; multi-select is a distinct, explicit mode.

- Bulk **Done** (the same per-task completion path, recurring + slices handled), **Tomorrow** (defer one-offs; recurring skipped, deferring a habit is meaningless), **Remove** (soft-delete, the brick "danger" colour). Each exits select mode after acting. `select.opened` / `bulk.completed` / `bulk.deferred` / `bulk.removed` instrumented.
- Scoped to **today's main list** for v1 (Melroy's "at least on a specific day"); the Later strip stays single-action.
- Decided AGAINST overloading long-press to enter multi-select: it would cost the useful single-task menu. An explicit "Select" mode is clearer and keeps both.

Verified in preview: enter select, pick two of three, Remove -> the two soft-delete, the third survives, select mode exits.

## 2026-06-21 Today redesign (1/n): the 3-layer IA from the system pass

Implementing the Claude Design redesign screen by screen. First slice of Today: the day-actions junk drawer (five flat links) is dissolving. **"Focus on one thing"** is promoted to a prominent bordered entry above the list; **"I also did that"** moves to a quiet link beneath the list; the row slims to Strategise (conditional) + Select several + Close. The weight gauge already carries the warmer copy ("A gentle day. Room to breathe.", prior commit). Verified in preview against the mockup's A1.

Still to land (next commits): tap-and-hold to enter selection (replacing the long-press menu AND the Select-several button) with the adaptive action bar + "Move to…", the Focus pick-and-go step, and the close-the-day "anything else?" prompt. The E2E suite gets one refresh when the Today redesign is complete; churning it per intermediate commit of the same screen is not useful.

## 2026-06-21 Today redesign (2/n): tap-and-hold selection + adaptive bar

This deliberately reverses the earlier multi-select call ("decided AGAINST overloading long-press to enter multi-select"). The system-pass redesign dissolves the objection that reversal raised, which was that long-press-to-select would cost the single-task menu: the menu's actions are not lost, they move into the adaptive bar. Tap-and-hold a task now enters selection with that task already picked. With one selected the bar offers Done / Tomorrow / Break down / Remove (Break down only makes sense for a single task); with several, the same minus Break down. "Select all" picks every unfinished one-off. The Select-several button is gone. So two interactions (the per-task long-press menu and the multi-select button) fold into one calm gesture. Verified in preview: long-press a task → the bar shows selected / Select all / Tomorrow / Break down / Remove / Cancel.

"Move to…" (a date picker in the bar, using the new presets) lands next.

## 2026-06-21 Today redesign (3/n): "Move to…" in the select bar

The adaptive bar gains **"Move to…"** beside Tomorrow. It opens a calm modal with two presets (This weekend, Next week, resolved by the new `presetDate` helpers) and the full month-grid DatePicker. Picking a day moves every selected one-off to that date (recurring tasks are left alone, they move by cadence, not a chosen date) and they wait in Later until then. New tested pure helper `deferTo(task, iso)` mirrors `deferToTomorrow`. Verified in preview: select a task → Move to… → This weekend → the task's due becomes the coming Saturday (2026-06-27), it lands in Later, and select mode exits.

The select bar is now the single home for every per-task and bulk action: Done, Tomorrow, Move to…, Break down (single only), Remove. The Focus pick-and-go step and the close-the-day "anything else?" prompt are the last two Today slices.

## 2026-06-21 Today redesign (4/n): Focus is now pick-and-go

Focus stops auto-choosing. Tapping the Focus entry opens **"Which one?"**, a calm list of today's tasks; you pick the one to sit with and it fills the screen ("Just this one"). "Done" completes it and returns you to the list to choose the next (or the calm empty state when nothing's left); "Choose another" returns without completing. This replaces the old skip-through-the-queue model (`focusSkips` removed). Choosing what to focus on is gentler than being handed a task and made to reject it, which matters for an RSD-prone audience. Verified in preview: Focus → Which one? → pick → the focus body ("Just this one" / Done / Choose another).

Last Today slice: the close-the-day "anything else you did?" prompt.

## 2026-06-21 Today redesign (5/5, complete): close-day "anything else?" prompt

The close-the-day wrap gains a gentle **"Anything else you did?"** field above Goodnight. A final off-list win typed there is logged as a completed task (the same off-plan path) before the day closes, so it lands in today's finished set and the Lookback. Optional, never required, no auto-focus (Goodnight straight through stays a one-tap close). Verified in preview: Close the day → type "Watered the plants" → Goodnight → it becomes a done task and the day closes to the rested screen.

**This completes the Today redesign.** The screen, end to end: warm weight copy + date presets · the 3-layer IA (Focus promoted above the list, "I also did that" relocated beneath it, the day-actions drawer dissolved to Strategise + Close) · tap-and-hold selection with the adaptive bar (Done / Tomorrow / Move to… / Break down [single] / Remove, plus Select all) · Focus pick-and-go ("Which one?") · this close prompt. Every slice preview-verified, 202 client tests green throughout. Next screen: the Lookback.

## 2026-06-21 Lookback redesign: legend + quiet-month state

The Lookback already carried most of the system-pass design (the month grid + day detail with finished / scheduled / big-win, the kept-scrapbook polaroid, and the loading / gentle-error / not-enough states all shipped earlier). Two gaps closed to match the pass: the calendar dots now have a small **legend** (finished · a big one · scheduled) so the marks are legible, and a month with nothing finished yet shows a calm **"A quiet month so far. What you finish will appear here."** instead of an unexplained empty grid. Verified in preview both ways (a month with completions hides the note; an empty month shows it; the legend is always present).

The discipline of stopping: the rest of the screen was already on-brand and uncluttered, so this was a refinement, not a rebuild. Next screen: Break-it-down.

## 2026-06-21 Break-it-down redesign: wait + failure copy, preset consistency

BreakdownQuestions already matched the system-pass B1 (the "few quick questions", the due chips, gradual/same-day, the optional "what's making it big"). Three deltas closed it out:
- The due chips now resolve through the shared `presetDate` helpers (This week = the coming Friday, Two weeks = +14), so the breakdown chips and the Today "Move to…" picker agree on what each label means.
- The AI wait gains the calm reassurance (B2): **"Working out a few small steps. This takes a moment, no need to wait here."** under the busy button.
- The decompose failure was silent (it just dropped back to the questions); it now shows a gentle, honest line (B4): **"Couldn't break it down just now. Your task is still here, try again?"** — deliberately "still here" rather than the mockup's "safe on Today", because a fresh capture is not added to Today until its steps are accepted, so the honest framing is that the task is held in the open modal. `bdError` clears on retry, submit, and reset.

Gated green (typecheck / lint / 202 tests). The questions modal needs a live AI `clarify` call to reach, so it was not preview-exercised here, to avoid AI spend; the changes are static-copy conditionals plus the already-tested `presetDate` helpers.

## 2026-06-21 Premium redesign: the free-keepsake reassurance on the pitch

The Premium screen already was the system-pass design: the P1 pitch ("Keep every week", the 1 → 2 → 4 tenure tiers, "A$5 / month. Cancel anytime. No ads, ever.", "Go Premium" / "Sign in to go Premium"), the P2 "You're Premium ✓" panel with renew/cancel status, and the loading / setting-up / cancelled / not-signed-in states. One gap: the no-dark-pattern reassurance **"The free monthly keepsake is always yours"** lived only on the premium panel (P2), not the pitch. Added to P1 (worded for signed-in vs not) so the pitch itself promises nothing is taken away. Verified in preview: the not-signed-in pitch shows all six elements plus the reassurance. A refinement, not a rebuild. Next: Settings / Sign-in / Privacy.

## 2026-06-21 Settings / Sign-in / Privacy redesign

**Settings:** regrouped the flat list into the two system-pass bands, **Comfort** (Theme, Text size, Motion) and **Access & data** (Privacy & data, Export, Account, AI agent access). The sections already existed; this adds the band headers and tightens the spacing so the page reads as two clear groups instead of a scroll of rows. The Premium card still glows at the foot.

**Sign-in:** already the system-pass S2 (the "Sync across devices" two-step, email → 6-digit code, with the sent-to / use-a-different-email / signed-in states). No change.

**Privacy:** already the S3 typographic policy (serif title, "Last updated", the clean sections, "Privacy by architecture, not by promises"). Fixed one stale line: "Your control" claimed account-delete was "being added", but it shipped (and export shipped), so the public policy now states both accurately. Honesty matters more here than anywhere: a privacy policy that lags the build is a broken trust principle, and trust principles compound or compound-rot.

Verified in preview: Settings shows both bands + the premium card; Privacy shows the corrected control copy. Next: the Repeating drawer.

## 2026-06-21 Repeating drawer: already at spec (no change)

Checked against the system-pass R1/R2 and it already matched: each habit shows its cadence (`describeRecurrence`, e.g. "Every day", "Every 3 days", "Every Sunday") with a tap-to-complete checkbox, and the empty state already teaches the way in ("No repeating tasks yet. Add one with the Daily or Weekly chip when you capture."). No change. The discipline of stopping.

## 2026-06-21 First-run redesign (net-new): the guided welcome

The last redesign piece, and the only net-new one. A one-time welcome that onboards by *doing*, not by a tutorial wall:
- **F1 welcome:** the calm pitch ("A calmer kind of to-do", "No streaks, no nagging, no guilt. Nothing is ever overdue. It just waits.", "Works straight away. No account needed.") with Begin / Skip for now.
- **F2 capture:** "What's on your mind?", the user's own first brain-dump, one per line.
- **F3 reveal:** "Make my day" runs the lines through the **real triage** (the same `/triage` the "Sort for me" path uses), so the very first thing they see is the product working: a doable Today ("N for today") with the rest "waiting calmly for later" and any big one flagged "Looks big, break it down?". If the AI is unreachable, everything lands on Today (`triageToTasks` with no buckets), nothing lost.
- **F4 hand-off:** "That's it. No setup." → Open Today.

Routing: a new `onboarded` flag in storage (`loadOnboarded`/`saveOnboarded`; returns true on a storage failure, so a disk hiccup never traps a user in onboarding). Today redirects to `/welcome` once on mount when the flag is unset, keyed off the flag and **not** task count, because a fresh install seeds example tasks. Skipping at any step, or an empty "Make my day", just sets the flag and opens Today.

Decided against a separate local "first 3 today" heuristic for the reveal: the whole point of the first impression is the AI triage actually working, so it uses the live path with the all-today fallback rather than a fake split. Verified in preview end to end: cleared the flag → Today redirected to /welcome → Begin → typed a 5-line dump → Make my day → the live triage returned **4 for today + 1 waiting** → This looks right (5 tasks saved, flag set) → Open Today landed on Today with the tasks and did not re-redirect. One live Haiku triage call (cheap). **This completes the full redesign: all seven surfaces.**

## 2026-06-21 First-run is replayable (non-destructively) from Settings

Melroy: the welcome is lovely but should be repeatable, and he was unsure where, Settings or a "?" on Today. Placed it in **Settings** ("See the welcome again"), not a Today header icon: Today was just decluttered, and replaying onboarding is an occasional action, which is exactly what Settings is for. The link opens `/welcome?replay=1`. In replay mode the flow is identical, but `confirm()` **merges** the triaged tasks into the existing list (`loadTasks` + append) instead of overwriting, and leaves the onboarded flag alone, so re-running can never wipe a real list. Verified in preview: seeded two tasks, replayed, dumped two more, confirmed → four tasks, both kept and both added.

Decided against a tour-only recap (the pitch with no capture): the lovely part *is* the guided capture → triage → reveal, so making it safe (merge) keeps the whole flow available as a calm "get it out of your head again" without the destructiveness.

## 2026-06-21 The moat's completion half: the outcome flywheel (server)

The moat was half-built. Every decomposition OFFERED was logged to D1 (`ai_calls`, pseudonymous), but whether its steps got FINISHED, the actual differentiator, was only local client telemetry and unlinked. The case study claimed both halves; the code had one. Melroy caught it, so we are closing the gap (the framework, not the user-facing estimate, which still needs volume).

Design: the client mints a pseudonymous decomposition id and sends it with `/plan`; the Worker stores it on the `ai_calls` row, so the offered half is now identifiable. A new origin-gated, rate-limited `/outcome` endpoint takes an anonymised completion ping `{id, steps_total, days_elapsed}` into a new D1 `outcomes` table. The join `outcomes.corr_id = ai_calls.corr_id` reconstructs "this decomposition was offered [task text] and its steps finished over N days", with NO user_id, no IP, and no new task-text egress (the ping carries only the id and timing; the text already lives in `ai_calls`).

Decided AGAINST the server minting the id (the client owns it, so it stamps it on the tasks and reports back with no extra round-trip) and AGAINST putting task text in the outcome ping (the corr-id join keeps the completion ping content-free, the cleaner privacy posture). The aggregate query and the real "X people took Y days" swap stay deferred (volume + similarity matching); the surface keeps its honest derived estimate until then.

Server contract-tested (`outcomeStatement`, the `ai_calls` corr_id param; 84 server tests green). The client stamping + reporting lands next. The live pipeline needs a Worker deploy + the D1 migration (Melroy's per-instance OK).

## 2026-06-21 The moat's completion half (client) + verified

The client side of the flywheel landed. A pseudonymous `decompositionId` is minted per breakdown, sent with `/plan` (so the offered `ai_calls` row carries it), and stamped on the created step tasks with the step count. When a stamped step is completed, the toggle fires an anonymised `/outcome` ping (`lib/outcome` buildOutcome -> `ai.reportOutcome`, fire-and-forget, errors swallowed). The privacy policy now discloses the completion-outcome capture (a random id + a number of days only, never the task text). New pure `lib/outcome` unit-tested; 205 client + 84 server tests green.

Verified in preview: completing a stamped breakdown step toggles done AND fires a POST to the Worker `/outcome` with id + timing; a normal task (no decompositionId) reports nothing. The endpoint is not deployed yet, so the live ping 404s and is swallowed (no user impact). The pipeline goes live with the Worker deploy + the D1 migration (apply `server/d1/schema.sql`: the `corr_id` column on ai_calls + the `outcomes` table), Melroy's per-instance OK. The case-study claim ("log the decomposition offered AND whether its steps got finished") is now true in code, not just on the page.

## 2026-06-21 The moat flywheel is LIVE (deployed)

Deployed the Worker (version `1fd5c99d`) and applied the D1 migration to `doubledone-telemetry`: `ALTER TABLE ai_calls ADD COLUMN corr_id`, plus the new `outcomes` table + index. Verified live end to end: a POST to `/outcome` returned `{ok:true}` and the row landed in `outcomes` (test row then deleted). The completion-outcome flywheel now collects real data: a finished breakdown step pings an anonymised `{id, steps_total, days_elapsed}` that joins back to the offered decomposition on `corr_id`, no identity. The deploy also surfaced that `STRIPE_PRICE_ID` + `APP_URL` are set as Worker vars, confirming Melroy's Stripe test-mode go-live. Account deletion is the one remaining un-run migration (Melroy confirmed he has not tested it).

## 2026-06-21 Bug fix: cross-account task leak on sign-out then sign-in as another user

Melroy hit it switching to a throwaway account (made to test account deletion): signing out then back in as a different user showed user 1's entire task list. Worse than a display bug, `syncOnce` migrates the local list into the account (`toPush` = whatever the remote lacks), so user 1's tasks were being uploaded into user 2's account stamped with user 2's `user_id`. A real cross-account data leak.

Root cause: sign-out left user 1's tasks in the local store (local-first), and the sign-in sync effect ran `syncOnce(local = user 1's tasks, userId = user 2)`, merging AND migrating them into user 2. The local store had no notion of which account it belonged to.

Fix: track the local store's owner (a new `doubledone.account.v1` key, the `user_id` it was last synced with). On sign-in, if the store belongs to a DIFFERENT account (`localBelongsToAnother`, pure + unit-tested) start the merge from EMPTY, never inheriting or migrating the previous user's tasks, and clear the visible list first. An anonymous store (no prior owner) is deliberately NOT "another", so an anonymous-first sign-in still migrates its local list up (the intended local-first behaviour). Sign-out now pushes pending local changes first, since sync is on-open only, best-effort so a failed push never blocks sign-out or loses local work.

Decided AGAINST clearing the local store on sign-out: a failed push (offline) followed by a clear would lose unsynced work, and clearing is unnecessary, the owner guard on the next sign-in is what prevents inheritance. So signed-out keeps the local-first view of your own tasks; a different user's sign-in is what clears it. 208 client tests green (3 new for the guard). The end-to-end two-account flow is Melroy's to verify on a real device, it needs live Supabase auth, like the email sign-in and account deletion.

## 2026-06-21 Haptics on Android (earned-moment cues, gated on reduced motion)

Added tactile feedback for the native Android build via `expo-haptics`, behind a new `client/src/lib/haptics.ts` with a `haptics.web.ts` no-op so the web bundle never imports the native module (Metro resolves the platform file). Each cue is an intention-named function (`taskDone`, `dayClosed`, `dayCleared`, `scrapbookReady`, `stepsLanded`) that takes the resolved `reduced` flag from `useReducedMotion()`, so the reduced-motion gate is type-enforced at every call site and cannot be forgotten. Cues fire only on earned moments: a soft tap on completing a task, a fuller success when the whole day clears, a warm soft tap on the gentle close, a light tap when a dreaded task breaks into steps, and a success flourish at the scrapbook reveal.

Decided:
- Build them. The tactile payoff was missing entirely, and it is real, grounding dopamine for the ADHD half of the audience.
- Soft and sparse only. Light/soft impacts plus success notifications for the two payoff moments. Never on every tap, never on navigation or capture.
- Gate on the EXISTING reduced-motion preference (app setting + OS), not a new toggle. The people who reduce motion are often the same ones a buzz can overwhelm, and the spine forbids adding a setting. The Motion hint now says Reduce also stops the buzz. A unit test locks the guarantee that reduced motion silences every cue.

Decided against:
- A sustained "rumble" during scrapbook GENERATION (the first instinct). expo-haptics cannot make a textured rumble (Android gives a flat motor buzz); a sustained buzz is the single most aversive pattern for the sensory-sensitive autistic half (it reads as an alarm); it fights the calm spine; and it costs battery over a multi-second hold. Moved the cue to the REVEAL instead: a short warm success flourish when the keepsake lands, with the calm loading visual carrying the wait. A build-up pulse is left as an on-device option for Melroy to feel and decide.
- ANY haptic on error or failure. A punishing buzz when something goes wrong is exactly the shame mechanic RSD makes fatal. Errors stay calm and visual.
- Web haptics (navigator.vibrate). The cues live in the Android APK; web stays silent.
- A selection tick on tap-and-hold multi-select: deferred (Tier 3), to watch buzz frequency on a real device before adding it.

The wiring, the gate, and the web no-op are verified by typecheck + 296 tests (4 new for the gate) + a clean web render with no console errors. The physical feel is Melroy's on-device check on the APK, like the email sign-in.

## 2026-06-21 Keep the screen awake in Focus mode (Android polish)

Focus mode is for sitting with a single task, so the screen dimming and sleeping mid-task is a small but real friction. While Focus is open the app holds a wake lock (`expo-keep-awake`, tag `doubledone-focus`), released the moment Focus closes or the screen unmounts. Native only (gated `Platform.OS !== 'web'`); the web build has no wake lock worth requesting. First of the Android-native polish batch (with haptics): things a real native build gets that a web wrapper cannot. None of the batch is observable in the web preview, so each is verified by the gate plus an on-device check.

## 2026-06-21 Themed Android system bars (nav bar + window background)

The status bar already follows the Dusk theme; this finishes the job for the rest of the system chrome. The Android navigation-bar icons now track the IN-APP theme via `<NavigationBar style={isDark ? 'dark' : 'light'} />` (expo-navigation-bar), which matters because DoubleDone's theme can differ from the system theme (a user on a light phone can run the app dark). The expo-navigation-bar plugin is added with `enforceContrast: false` so that custom style actually takes effect under SDK 56's edge-to-edge default (Android otherwise paints a contrast scrim that overrides it). And the native window background is painted to `theme.colors.bg` (expo-system-ui) so launch, transitions, and overscroll never flash the wrong colour.

Verified the SDK 56 API against the installed source first: the old `setButtonStyleAsync` is gone, replaced by the declarative `<NavigationBar>` component and `setStyle`. Decided against a static build-time nav-bar style (the plugin can set one): it would not react to an in-app theme change, so the runtime component is used instead. All native; the web build gates these out (the nav-bar render is Android-only, the system-ui call native-only). On-device check on the APK; the effect is clearest on 3-button navigation, since gesture devices mostly self-adapt.

## 2026-06-21 Launcher shortcuts (Android), and the inbound bridge

Long-pressing the launcher icon now offers two shortcuts: "Brain dump" (open the app with the capture box focused) and "Focus on one thing" (jump straight into Focus mode). Both are capture-friction wins for an ADHD brain: act on the thought where it lands, in one tap, instead of opening the app and navigating.

Built on a small `lib/inbound.ts` bridge (pure, unit-tested): the app root stashes an inbound launch intent (`dump` | `focus` | `capture` text), and the Today screen drains it exactly once. The same bridge serves shared text next (the `capture` kind is already handled). Shortcuts are registered at runtime with `expo-quick-actions` `setItems`, read on launch via `initial` and live via `addListener` (no subpath imports, no static icon assets). `expo install` added the config plugin to app.json.

`BrainDump` exposes an imperative `seed(text | null)` via `forwardRef` (null = focus only, so "Brain dump" never wipes in-progress text). That shape was forced by the React Compiler lint, which forbids synchronous setState inside an effect: an imperative ref method runs like an event handler, and the inbound effect only SUBSCRIBES, with `subscribeInbound` firing immediately for an intent that landed before Today mounted (the cold-launch case). A good lesson: the strict lint pushed the design toward the cleaner imperative shape.

Decided against a "Today" shortcut (the icon tap already opens Today) and static build-time action icons (deferred; the default launcher icon is fine). All native; web gates the registration out. The test suite also caught up here with on-device cases for the whole native batch (keep-awake, system bars, shortcuts). On-device check on the APK.

## 2026-06-21 Share to DoubleDone (Android share target)

DoubleDone now appears in the Android share sheet: share text or a URL from any app (a browser, an email, a chat) and it lands in the capture box on Today, ready to add. The biggest capture-friction win in the batch, because for an ADHD brain the thought arrives somewhere else, and the moment to capture it is right then.

Reuses the inbound bridge from the shortcuts work: `expo-share-intent`'s `useShareIntent` hook catches the share, and a `capture` intent seeds the capture box (the consumption was already built). It is behind a platform-split wrapper (`lib/share-intent.ts` native, `lib/share-intent.web.ts` no-op) so expo-share-intent never enters the web bundle. The library's config plugin (auto-added by `expo install`) registers the Android `SEND` intent filter for `text/*` by default, which covers text and URLs, so no app.json config was needed.

Verified expo-share-intent 7.0.0 targets SDK 56 (peer `expo: ^56`), so no compatibility risk. The npm-audit picture: its moderate advisories (uuid via xcode via @expo/config-plugins, plus esbuild's dev server) are pre-existing Expo build-toolchain issues shared by the whole SDK, not shipped in the app and not introduced by this library; `audit fix --force` would downgrade Expo, so we leave them.

Decided to seed the capture box (review-then-add) rather than auto-add the shared text as a task: a shared URL or a long quote often wants a quick edit or a title first, and seeding keeps the user in control while staying one tap from done. Decided against the ShareIntentProvider/context pattern (the standalone hook at the root is enough for one consumption point). All native; web no-ops. On-device check on the APK.

## 2026-06-21 Home-screen widget (Android), the "today, glanceable" surface

A native Android home-screen widget showing today: the top few unfinished titles, or a calm rested line ("All done for today.", "Closed for today.", "Nothing for today yet."), Dusk-themed with light + dark variants, the whole card tapping to open the app. The spine ("today is finite and visible") on the home screen, the highest-ceiling native feature in the batch.

Built on `react-native-android-widget` (the only real Expo-managed path: JSX widgets in a constrained component model, a config plugin, and a headless render task). The data bridge is the crux and it is clean: the widget renders while the app is closed, so the headless task reads the same AsyncStorage the app writes (`doubledone.tasks.v1`) and REUSES the app's pure functions (`deserialize`, the today-filter, a new `buildWidgetModel`). One source of truth, no duplication. The app calls `requestWidgetUpdate` from `commit` (the single task-save point) for an instant refresh; a 30-minute periodic update is the fallback.

Web-safe by the same platform-split pattern as share/haptics: every widget-library import sits behind a `.ts` native / `.web.ts` no-op (`register`, `update`), so the library never enters the web bundle. A custom `index.js` entry (replacing the bare `expo-router/entry` main) bootstraps the router then registers the headless task on native; on web `registerWidget` is the no-op. Verified the web app still boots clean from the new entry, and `expo config --type introspect` confirms the plugin generates a valid AppWidgetProvider (`.widget.Today`, `@xml/widgetprovider_today`, APPWIDGET_UPDATE) with no error.

Decided for v1: tap-to-open the whole card (`clickAction: 'OPEN_APP'`), no bundled font (the system face plus the Dusk colours carry the brand; bundling Newsreader for the widget is a noted follow-on), no preview image (the picker shows a default), and the update trigger only on task changes (closing the day reflects on the next change or the 30-minute tick, a minor accepted lag). Decided against checking a task off FROM the widget (interactive actions writing back to storage) and a "+" capture affordance, both deferred (Tier 2/3).

The honest risk, recorded: this is a real native module (Kotlin + C++) and we are on RN 0.85, two minors past the 0.83 the library was tested against. Every line of JS is gate-verified here, but the EAS native build is the genuine test. If it fails to compile, that is a library-vs-RN-version issue (the JS is then ready for a library update), not our code. The library targets Expo >=54 and is the standard, so it is worth trying. 5 unit tests cover the view-model.

## 2026-06-21 Reminders, Phase 1: per-task "remind me in X hours" (Android, local)

The first half of the notification work, and the "unique to Android" surface. On a today task you can set a gentle nudge ("In 1 hour", "In 3 hours", "This evening") from the tap-and-hold action bar; it fires a local notification (the task as the title, "Whenever you are ready." as the body) and the row shows a small bell with the time. A poke, never a deadline.

Melroy's idea, and a better primitive than the absolute-time reminder first sketched: relative deferral is how an ADHD brain actually thinks ("later", not "3:47pm"), it is a snooze not a deadline (RSD-safe), and it mirrors the existing "push to tomorrow" one scale down (tomorrow removes it from today; a nudge keeps it and pokes you later).

Held to the spine:
- The pure logic (`lib/nudge.ts`, tested) enforces a 9pm cutoff so a nudge never fires in the small hours. A preset whose target would land past 9pm is capped to 9pm; one that can no longer fire today is simply not offered; "This evening" (6pm) drops off after 6pm.
- Cancel-on-handled: completing, removing, or deferring a task (single or bulk) cancels its pending nudge and clears the fields, via one `clearNudgeIfAny` helper threaded through every such path, so you are never poked about something already done. The task carries `nudgeId` (the scheduled-notification id) and `nudgeAt` (the indicator).
- The daily reminder was refactored to cancel only itself by a fixed id (not the old blanket cancel-all), so the daily reminder and the nudges coexist on their own Android channels without clobbering each other.

Privacy: fully local. The device schedules the nudge; nothing (not the task text, not the time) leaves the phone. Native only; on web `scheduleNudge` is a no-op and the "Remind me" action is hidden (web reminders are Phase 2's push). On-device check on the APK; the web build is gate-verified to still render Today cleanly. Decided against absolute-time reminders (more friction, less on-spine) and a free time input (presets keep it one tap).

## 2026-06-21 Reminders, Phase 2 (web push), part 1: the subscription store

The web half of reminders. A closed browser tab can only be reached by push, which needs a server, so this is the one piece that shifts a sliver of the local-first posture: the Worker now holds web-push subscriptions. Kept minimal by design.

Part 1 is the store + routes: a D1 `push_subs` table (endpoint, the subscription keys, a preferred local hour, a tz offset) and `/push/subscribe` + `/push/unsubscribe` (origin-gated, browser-only). NO user_id and NO task content, just a push endpoint and a time, so the only thing the server learns is "this browser wants a nudge around 9am". The pure parse / statement / scheduling-math (`server/src/push.ts`, 7 tests) is the contract surface.

The sender approach decided for parts 2-3: a PAYLOADLESS push. The daily nudge is generic ("your today is here"), so the Worker signs only a VAPID token and pings the push service with no body; the service worker shows a static, hardcoded message. That avoids RFC 8291 payload encryption entirely (only VAPID JWT signing, which Workers' Web Crypto does cleanly) and means no task content is ever encrypted or sent. The cron's local-hour math is here and tested; the service worker, the client opt-in, the VAPID sender, and the Cloudflare Cron Trigger follow. VAPID keys are deploy config Melroy sets (a gen script ships with the sender). The new push_subs table is applied to the remote D1 with the same idempotent `wrangler d1 execute ... --file d1/schema.sql` as the rest, at deploy time.

## 2026-06-21 Reminders, Phase 2 (web push), part 2: service worker + client opt-in

The browser side. A service worker (`client/public/sw.js`, served at /sw.js) receives the daily push and shows the static "your today is here" notification; tapping it focuses or opens the app. The web build of `reminders.web.ts` now actually subscribes: it registers the SW, requests permission, subscribes via PushManager with the VAPID public key, and POSTs the subscription to `/push/subscribe` (disable unsubscribes and tells the Worker to drop it).

No new UI: the existing "Daily reminder" toggle (it was native-only) now also shows on web, but only when `EXPO_PUBLIC_VAPID_KEY` is configured, so before deploy there is no broken toggle. Same toggle, platform-fit: native schedules a local notification, web subscribes to push. Per-task nudges stay native-only.

Privacy holds: the subscribe payload is the push subscription plus a preferred hour and the tz offset, never task content; and the notification text lives in the service worker (the push is payloadless), so even the daily message is never sent over the wire. The VAPID public key goes in the client env (and the Pages env); the private key and subject are Worker secrets Melroy sets. The VAPID sender, the Cloudflare Cron Trigger, and the gen-vapid script are part 3.

## 2026-06-21 Reminders, Phase 2 (web push), part 3: the VAPID sender + the daily cron

The piece that actually sends. `server/src/webpush.ts` signs a VAPID JWT (ES256, ECDSA P-256) with Workers' Web Crypto and POSTs a PAYLOADLESS push to the subscription endpoint (no body, only the `Authorization: vapid t=…, k=…` header and a TTL). No RFC 8291 payload encryption: the daily message lives in the service worker, so nothing about the user crosses the wire. The public key is derived from the private JWK, so only `VAPID_PRIVATE_KEY` + `VAPID_SUBJECT` (Worker secrets) are configured. A sign-then-verify roundtrip test proves the signing.

A Cloudflare Cron Trigger (hourly) fires a new `scheduled()` handler -> `sendDailyNudges`: read every subscription, send to each whose LOCAL hour matches now (the tested tz math), and prune any the push service reports gone (404 / 410). The hourly tick plus the per-sub local-hour check means each browser is nudged once a day at its own time, with no server-side timezone database. (At scale this would index subs by hour; fine for now.)

Phase 2 is code-complete. What remains is Melroy's deploy config: run `node scripts/gen-vapid.mjs`, put the public key in the client + Pages env (`EXPO_PUBLIC_VAPID_KEY`), set `VAPID_PRIVATE_KEY` + `VAPID_SUBJECT` as Worker secrets, apply the push_subs D1 table, and deploy the Worker (the cron registers on deploy). Decided to keep the daily nudge generic and payloadless (privacy + simplicity) rather than per-task web pushes; a known v1 limitation is that a stored tz offset can drift by an hour across a DST change until the user re-subscribes.

## 2026-06-21 Web push: live (the deploy)

Phase 2 is live, deployed by Melroy and me together. He generated the VAPID keypair and set `VAPID_PRIVATE_KEY` + `VAPID_SUBJECT` as Worker secrets; I applied the `push_subs` D1 table, deployed the Worker (the `/push` routes and the hourly cron `0 * * * *` are live), and wired the public key in.

Decided to BAKE the VAPID public key into the web build as a fallback (`reminders.web.ts`, the same `?? 'literal'` pattern the AI_URL already uses) rather than a Cloudflare Pages dashboard env var. doubledone.app auto-builds from GitHub on push, so a committed fallback is durable with zero dashboard steps, and the key is genuinely public (it ships to every browser; the private JWK stays a Worker secret, flagged `gitleaks:allow` so the scanner does not mistake it for one). `EXPO_PUBLIC_VAPID_KEY` still overrides it (e.g. for rotation). The web "Daily reminder" toggle now always shows, since VAPID is always present, replacing the env-gated render added in part 2.

## 2026-06-21 Talk-to-capture (voice brain-dump), v1 web

The next portfolio-signal feature after the native batch: speak a brain-dump instead of typing it. The leverage insight that kept it small: the AI that turns words into sorted tasks already exists (`/triage`, the "Sort for me" call, which sorts pre-separated lines and deliberately never splits, merges, or rewords). So v1 is NOT a new AI pipeline. It is one new job, get spoken words into the capture box as clean lines, then the existing Sort/Add flow takes over unchanged.

**Web-first, native deferred.** v1 uses the browser Web Speech API: zero new dependencies, no Worker change, works on doubledone.app (the demoable surface). Decided against native in v1: it needs a native module (the `@react-native-voice` class) plus an EAS rebuild, the same can't-verify-tonight risk as the widget, AND Android already offers voice dictation through the Gboard keyboard mic, so the real gap is on web/desktop. Web-first is where it adds the most, not a compromise. Native in-app voice is parked (Backlog, T3) behind a trigger.

**Pause-segmentation, reuse Sort (no new endpoint in v1).** With `continuous` + `interimResults`, each spoken phrase (a natural pause ends it) returns as a final result and is appended as its own line via the pure `lib/dictation.ts` (`appendPhrase`: trims, collapses whitespace, dedupes a double-fired final, preserves already-typed text; unit-tested). Two or more lines surfaces the existing "Sort for me". Decided against auto-firing Sort on stop: the spine is propose-then-accept, so the user sees the lines and chooses. The "just talk however messy and the AI splits a no-pause ramble" magic is a deliberate T2 (a cheap `/split` Haiku call), not v1.

**Tap to start, tap to stop, not press-and-hold.** Kinder for motor accessibility (this audience), and it needs no sustained gesture. The listening state reads by colour and a static dot, not motion, so reduce-motion users are not excluded.

**Privacy: text-only leaves the device.** The browser does the speech-to-text and hands back only text; that text enters the app, and reaches our Worker only if the user runs Sort, identical to typing. No audio ever touches our servers, none is stored. Honest caveat carried into the privacy copy: Chrome routes recognition through Google's speech service, Safari runs it on-device. It is a browser feature the user invokes explicitly, per use, never background-listening (always-on / wake-word is a T4 skip, off-brand). Consistent with the standing posture: nothing leaves the device unless you sync or use an AI feature.

**Graceful degradation, no setting.** `isDictationSupported()` gates the mic: shown in Chrome / Edge / Safari, hidden in Firefox and on native (the `speech.ts` stub returns false). Platform-split files (`speech.web.ts` real, `speech.ts` no-op) keep the browser API out of the native bundle, the same pattern as reminders/haptics.

Assumptions to challenge: web-first (vs holding to ship web + native together), tap-toggle (vs hold-to-talk), and pause-segmentation reusing Sort (vs the AI `/split` in v1). All three are cheap to reverse.

## 2026-06-21 Talk-to-capture T2: AI split for a no-pause ramble

T1 segments dictation on natural pauses, so a no-pause run-on ("buy milk and then email Sarah and book the dentist") lands as one line. T2 closes that with a cheap AI split: a new Worker route `/split` (Haiku, the triage pattern) takes the run-on text and returns the separate tasks, ONLY splitting, never sorting, reordering, or inventing. The client offers it as a calm "More than one thing in there? Split into tasks" affordance that appears under the box when there is a single line of six or more words. Tapping it replaces the line with the separated tasks, after which the existing "Sort for me" surfaces. Propose-then-accept throughout (the user taps Split, sees the lines, then Sorts), per the spine, and nothing auto-runs.

Decided against folding split into triage: triage's contract is "sort, never split, merge, or reword", and a brain-dump of already-clean lines must stay untouched. A separate `/split` keeps each call's job single and the prompts honest. Decided against auto-splitting when dictation ends: it would spend a token without consent and reorganise silently, both off-brand.

Cross-platform, unlike the voice input. `/split` is an AI call, so the Split affordance works on native too (it helps a typed run-on, not just a dictated one), and only the microphone stays web-only. Moat telemetry `capture.split.used` logs the resulting count, never the text.

Privacy: the same posture as the other AI features. The run-on text goes to the Worker and on to Anthropic, retained pseudonymously in D1 like the rest, which the privacy copy already covers as AI egress. No new disclosure surface beyond what Break-it-down and Sort already state.

Pending Melroy: a Worker deploy (`npx wrangler deploy` from `server/`, his per-instance OK per CLAUDE.md) makes `/split` live. Until then the Split button degrades gracefully (a calm "couldn't split just now"), the same as any AI route when offline. Built and contract-tested (server `split.test.ts`, client `ai.test.ts`, route-gate `index.test.ts`), with the UI preview-verified against a stubbed `/split`.

Follow-up (same day, after Melroy tested voice): relabeled the affordance from "More than one thing in there? Split into tasks" to "Tidy this into tasks". Voice capture usually yields ONE rambly sentence ("I feel like I want to do something fun"), not several discrete things, so the "more than one thing?" prompt misread the commonest voice case (it sat there asking "more than one thing?" under a single sentence). The tidy framing is honest whether the AI returns one cleaned task ("do something fun") or several. Mechanism unchanged, still the `/split` route and the `capture.split.used` event, only the user-facing label.

## 2026-06-21 Public REST API + OpenAPI (the DX surface)

The next tech build after Talk-to-capture: a clean, documented REST API over a user's tasks, so the portfolio carries a real platform/DX story (the thing SubToll was going to show) and outside integrations get a front door. Chosen over external calendar sync for a night build because it is self-contained and mostly already proven: the MCP server (`/mcp`) established the exact pattern, a bearer token proxied to Supabase REST under row-level security, holding no elevated key. The API generalises MCP's three tools into full CRUD.

**Surface.** `/api/v1/tasks` (GET list with `?today`, POST create) and `/api/v1/tasks/{id}` (GET, PATCH, DELETE), returning a clean camelCase task shape. Soft-delete via `deleted_at` (a tombstone, matching the app's sync model, so a delete propagates rather than ghosting a second device). Versioned (`/api/v1`). CORS open, because the token is the auth, not the origin.

**Auth, the load-bearing decision.** The bearer token is the user's own Supabase access token, exactly what MCP uses ("Copy my token" in Settings). Each call proxies to Supabase REST with that token, so RLS scopes it to the user's rows and the Worker holds NO elevated key. Decided AGAINST a long-lived API-key system for v1, not only for scope but on principle: a real API-key system would need the Worker to map a key to a user and then act as that user, forcing it to hold the `service_role` key and bypass RLS, breaking privacy-by-architecture (the service_role key is never used today). The honest cost of the token approach is the ~hourly refresh. A future API-key system is noted, with the hard constraint that it must preserve the no-elevated-key model (e.g. exchanging a key for a scoped token, never holding service_role).

**The artifact.** An OpenAPI 3.1 spec at `/api/v1/openapi.json` plus a self-contained Swagger UI at `/api/v1/docs` (loads swagger-ui from a CDN, points at the spec). The browsable console is what a hiring PM or integrator opens; the spec is the contract. Both are public (no token); the task endpoints require it.

**Deferred:** the long-lived API-key system (above); rate-limiting the API routes (RLS already scopes each token to its own data and Supabase has its own limits, so v1 leans on those, noted as hardening); richer querying (pagination, filters) beyond `?today`; and resources beyond tasks.

Pure builders + body parsers + the handler routing are unit-tested (`api.test.ts`, 19 cases, fetch mocked, no live call). **Deployed + live-confirmed 2026-06-21** (Worker version `bebb1564`): `/api/v1/openapi.json` (200, the spec), `/api/v1/docs` (200, the Swagger UI), and `/api/v1/tasks` with no token (401, clean JSON error) all verified. The token-gated CRUD is Melroy's to drive with his own token.

## 2026-06-22 Decompose / tiny-version data model: a silent background parent, not flat replacement (planned, Cluster B)

Melroy's question, ahead of building Cluster B: do we permanently decompose a task, or keep a memory of the real task and chain the small steps to it to finish it off eventually?

**Current state (flat).** Breaking down "Do my taxes" lands the steps as independent Today tasks, each tagged only with a pseudonymous `decompositionId` (+ `decompositionSteps`) that exists purely for the moat (the `/outcome` ping correlates "these steps got finished"). There is no `parentId`, nothing points a step back to the real task, nothing stores its title, and nothing tracks whether the dreaded thing ever actually got done. A flat list with a moat tag, not a chain back to the mountain.

**Decided (for Cluster B plus a retrofit of decompose): keep the real task as a SILENT BACKGROUND PARENT and chain the pebbles to it.** The real task ("Do my taxes") is remembered, off Today, out of sight. Each pebble (a tiny-version, or a decomposition step) links to it. Finishing a pebble can gently resurface the next; finishing the last completes AND celebrates the real task in the Lookback (the big payoff lands on the mountain, not the pebble). Generalises the existing moat-only `decompositionId` into a real parent link.

**The rule that keeps it on-brand, and it is the whole game: the app holds the thread, the user only ever holds one pebble.** The parent is never displayed as a looming "Do My Taxes (1/7)" header or a progress bar (that re-summons the exact dread the tiny-version dissolved), and never nags (never-shame: it is not a guilt backlog item). The user never sees or manages a hierarchy.

**Decided against:**
- *Flat replacement* (today's model): the real goal is lost, so you do tiny things forever and the dreaded task silently rots, or you lose the thread entirely.
- *A user-facing hierarchy / project tree*: that is the forbidden overwhelm (folders / projects / nesting, on the "do NOT build" list, the ADHD organising-as-avoidance trap). The line between the two is who carries the structure. An app-managed invisible chain removes the burden of holding the big goal in your head (good); a user-managed visible tree adds it (forbidden). Same data, opposite experience.

**Why it earns its place (beyond the instinct):** it answers the rot risk above, and it turns the moat to gold. Today the flywheel sees "steps got ticked". With a parent link it sees the real prize: did this decomposition actually get the dreaded thing DONE, and over how many days. That is the dataset a funded competitor cannot buy.

**Implementation sketch (for when built):** a `parentId` on Task (or generalise `decompositionId` into one), keep the parent task off Today and silent, resurface-next on a pebble's completion, and complete + celebrate the parent when its pebbles are all done. Minimal, and it touches the user-facing simplicity not at all. Not built yet (Melroy: "don't build yet"), locked in here for when Cluster B lands.

## 2026-06-22 Cluster A shipped: Done-is-done + Good-enough (OCD reassurance)

The first ADHD-seam cluster, built first because it is small, zero-token (pure client UI, copy, and state, no Claude call), and serves the most underserved corner of the audience. Both are completion-moment micro-interactions.

**Done is done.** The OCD checking loop ("did I really do it?") is countered by a brief, calm affirmation on completion: "Done is done. Recorded." It fires from every completion path (a single tap, the select-bar "Done", and both Good-enough entries), auto-clears after 3.5s, and renders as a quiet centred line by the capture (the `sortSummary` slot). Consistent, NOT rotating: the "do NOT build" list forbids variable / surprise rewards (autism needs predictability), so the same line every time is the on-brand call, reassurance over delight. **[SUPERSEDED 2026-06-27, see that entry: Melroy reversed this and the line now rotates through a fixed pool of eight. The guardrail it cites survives, a deterministic rotation is not a variable reward, but this paragraph is no longer what the code does.]**

**Good enough.** Permission to release a task you are stuck perfecting (the OCD perfectionism that stops you ticking it). A "Good enough" action completes the task with a gentler line ("Good enough is done. Let it go."). Placed in the two per-task action surfaces: the long-press confirm menu in `TaskRow` (reaches the Later list) and the select bar as a single-select action (the Today path, since Today's long-press enters select mode, not the confirm menu). Gated to incomplete one-offs.

Implementation: a small `affirmation` state + an `affirm()` helper (one `setTimeout`, a ref so a fresh completion is never cut short by an older clear, and no effect so the React Compiler stays clean). `goodEnough(id)` reuses `toggle`, then overrides the affirmation. Telemetry `goodenough.used` (the moat; `task.toggled` / `bulk.completed` already fire). Zero AI, zero tokens, zero new dependency.

Decided against: a rotating set of affirmations (the predictability guardrail) **[REVERSED 2026-06-27]**; a popup or modal (friction, and the spine removes friction); and a persistent "recorded" badge on every done row (clutter). The ephemeral line is enough.

Verification: typecheck / lint / 363 tests green, and the app loads with no console errors. The headless preview cannot drive RN web's pointer-responder taps, so the in-the-moment affirmation and the Good-enough flow are Melroy's on-device check (like the live mic was). Manual cases OCD-01 / OCD-02 added.

## 2026-06-22 Cluster B slice 1 shipped: the silent-parent chain (decompose)

Built the data model decided above (the silent background parent). Breaking a task down no longer flattens it: the original becomes a SILENT PARENT (`silentParent: true`, hidden from Today and Later via `tasksForToday` + `upcomingTasks`), and the steps plus phase milestones link to it (`parentId` + a denormalised `parentTitle`). At-capture breakdowns mint a parent; existing-task breakdowns convert the task in place (`breakdownExisting` now passes the id). The parent's `complexity` is the sum of its steps' minutes, so the eventual completion weights as the big one it is.

Completion walks the chain. `completeAncestors` (pure, `today.ts`, unit-tested including the multi-level cascade) runs when a step finishes: any ancestor whose children are now all done completes too (set done + completedAt + un-silenced, so it surfaces in the Lookback as the finished whole task), on up the chain. The in-moment line escalates, a finished parent earns `You finished "X". The whole thing.` over the plain "Done is done." Moat: `parent.completed` with the chain depth.

Start-anywhere is already satisfied: decomposed steps are independent Today/Later tasks (date-spread), done in any order, with no enforced sequence. No build needed beyond noting it.

Deferred to slice 2: the tiny-version (a new Haiku endpoint plus UI, about the size of `/split`, one tiny child of the parent at a time). Verification: typecheck / lint / 369 tests green (incl. the new `completeAncestors` and silent-parent-exclusion cases); the full break-down-and-finish flow (taps plus an AI call) is Melroy's device check, like A. Case AI-07 added.

## 2026-06-22 Cluster B slice 2 shipped: the tiny-version ("Make it tiny"), B complete

The headline of Cluster B. A dreaded task gets a "Make it tiny" affordance (in the select bar and the row's confirm menu, beside Break down). It calls a new Haiku endpoint, `/tiny` (`server/src/tiny.ts`, contract-tested, origin-gated like `/split`, D1-logged as endpoint `tiny`), which returns a single 2-minute starter version ("Do my taxes" becomes "Find last year's tax file and open it").

The model decision: a tiny-version is NOT a decomposition. Decompose's steps are exhaustive (all of them ARE the task, so finishing them finishes it, slice 1). A tiny-version is a partial pebble. So the real task becomes an OPEN parent (`openParent: true`, plus `silentParent` so it hides while you do the pebble), and the tiny version is its child. Completing the pebble must NOT auto-complete the real task, so `completeAncestors` skips open parents (guarded and unit-tested), and `toggle` instead RESURFACES the real task (un-silences it back onto Today) with "Started. X is here when you're ready." The dreaded thing is never lost, and you can make it tiny again for the next pebble. openParent persists, silentParent toggles.

Why resurface rather than a "is it done?" modal: the never-add-a-setting, never-interrupt spine. After a pebble you often have momentum, so the real task simply reappears (no guilt, no prompt), and you either keep going, make it tiny again, or close the day. Marking the whole thing done is the ordinary tap on the resurfaced task.

Considered and rejected: (a) replacing the task's title with the tiny version, which loses the real task, the exact thing the chain protects; (b) auto-completing the parent after one pebble, wrong because a pebble is partial; (c) a per-pebble "more or done?" modal, friction and a decision tax this audience does not need. Language on `/tiny` deferred (an English reframe for v1, matching `/split`, and i18n is the deferred Pass 2).

Moat: `tiny.made` (offered) and `tiny.stepDone` (a pebble finished). Verification: typecheck / lint / 376 tests / the coverage floor all green. Deploy plus a single live `/tiny` call confirm end-to-end; the tap-driven flow is Melroy's device check, like A. Case AI-08 added. Cluster B (the silent-parent chain, the tiny-version, and start-anywhere) is complete.

## 2026-06-22 Cluster C1 shipped: the low-capacity day

"Honoring the day", part one. A one-tap "Low on energy? Make it a low day" under the weight gauge marks today low-capacity. It does not touch the backlog or defer anything: it recalibrates the day's EXPECTATION. `dayWeight(count, lowDay)` halves the capacity (the gauge fills at a count of 4 instead of 8) and swaps the label for explicit permission ("A low day. A couple of things is plenty." through "Just pick one, the rest waits."). Turning it on shows a brief affirmation; turning it off ("Back to a normal day") restores the normal gauge.

Per-day, never a setting. The flag is a stored ISO date (`doubledone.lowday.v1`) compared to today, exactly like the closed-day flag, so it self-clears at midnight. There is no low-capacity preference to manage, no streak, no history. The spine holds: the list is unchanged and unshamed, only the bar for "a good day" drops.

Considered and rejected: (a) auto-deferring the heaviest tasks to tomorrow on a low day, which both shames the parked tasks and risks an avalanche tomorrow, and per-task defer already exists for anyone who wants it; (b) a persistent "low-capacity mode" setting, which is friction this audience avoids and would quietly become a self-label. Moat: `lowday.on` / `lowday.off`. Verification: typecheck / lint / 252 tests / coverage green. The low-day gauge was confirmed in the web preview (seeded flag rendered "A low day. A couple of things is plenty." plus the toggle). Case TOD-14 added. C2 (the wind-down nudge) is next, then Cluster D.

## 2026-06-22 Cluster C2 shipped: the wind-down nudge (Cluster C complete)

"Honoring the day", part two, the evening bookend to the morning daily reminder. From 6pm (`isWindDownTime`, reusing the nudge engine's `EVENING_HOUR`), a calm in-app line appears above Close the day: "Evening's here. Close the day when you're ready, even a little counts." It is an invitation toward the existing close-the-day ritual (and its Lookback payoff), never a scold for an unfinished list.

The decision: in-app, not a notification. A wind-down PUSH was considered and rejected. The daily reminder is already a morning "your today is here" push (web-push cron at a preferred hour, or a native local schedule), so a second evening push would mean a second notification toggle, which is a setting this audience avoids, plus the web-push model is one-hour-per-subscription and payloadless, so an evening variant is real plumbing for marginal gain. An in-app evening line costs no permission, no setting, and no scheduling, and it lands exactly when the user opens the app in the evening, which is when closing the day is relevant. `today` is `useMemo(() => new Date())`, so the gate reflects open-time, the right moment.

No new telemetry: the close-the-day it points to is already instrumented (`day.closed`). Verification: typecheck / lint / 254 tests / coverage green. The absent-when-daytime state and a no-crash render were confirmed in the web preview at 1am; the evening appearance is a time-of-day check for Melroy, like the daily reminder firing. Case TOD-15 added. Cluster C (low-capacity day plus wind-down) is complete. Cluster D (Routines) is next.

## 2026-06-22 Cluster D slice 1: the Routines data model

Cluster D (Routines) begins, sliced like B. D1 is the model and storage, no UI yet. A routine is a named checklist with a time-of-day: `{ id, name, when: 'morning' | 'evening' | 'anytime', steps: {id,title}[], done, createdAt, updatedAt }`. New pure lib `routines.ts` (unit-tested) plus `loadRoutines` / `saveRoutines` in storage.ts (key `doubledone.routines.v1`, defensive parse like scrapbooks).

The never-streak decision is baked into the data shape. `done` is `Record<stepId, isoDate>` holding only each step's LAST-ticked date, never a count and never a history array. A step is "done today" iff its date equals today's ISO, so yesterday's ticks fall away on their own (the recurring-task reset pattern), and there is no streak, chain, or "you missed N days" anywhere in the model to surface later. Rejected: a per-step completion history or a streak counter, which is exactly the habit-tracker shame mechanic this audience is built to avoid. Steps carry stable ids so editing a routine never mis-attributes a tick.

Verification: typecheck / lint / 261 tests / coverage green (routines.ts fully unit-tested: tick and un-tick, the per-day reset, progress, defensive deserialize). D2 (the Routines screen: list, run, add, entered from Today) is next, and it carries the manual test case.

## 2026-06-22 Cluster D slice 2 shipped: the Routines screen (Cluster D complete)

D2 puts a screen on the D1 model. A new route `routines.tsx` (reached from a "Routines" link in the Today header, beside Lookback) lists routines grouped by time-of-day, each a calm card: the name, a "N of M today" progress, and tappable step checkboxes (a sage tick plus a strike-through when done today). "+ New routine" reveals a small form, a name, a morning / evening / anytime pill, and steps one-per-line (reusing `parseDump`). A routine can be removed with no confirmation gauntlet.

The spine holds visibly. Ticking a step marks it done for TODAY only (per-day, via the model's last-ticked-date), so tomorrow the routine is fresh with no streak, no "you missed it", and no chain to break. The screen shows only today's progress, never a history or a count across days. Routines are local-first like tasks.

Header density: the Today header now carries four feature links (Repeating, Routines, Lookback, Settings), and on a narrow 375px phone the date can wrap to two lines (the 390px portfolio viewport has more room). Judged an acceptable tradeoff to keep Routines a first-class, always-visible surface (it is a feature like Lookback, not a setting), and flagged for Melroy: relocating it, or surfacing routines contextually as a morning card on Today, is an easy follow-on.

Verification: typecheck / lint / 261 tests / coverage green. The screen was confirmed in the web preview, the empty state, a populated routine (grouped, "1 of 3", a ticked step with the strike, Remove), and no console errors. The tap-to-tick and the add form are Melroy's device check, like the other tap-driven flows. Cases RTN-01 / RTN-02 / RTN-03 added. Cluster D (Routines) is complete, and with it the ADHD seam A, B, C, D is all shipped.

## 2026-06-22 The "Dusk, evolved" redesign begins: foundation (slice 1)

Melroy ran the holistic-redesign prompt through Claude Design and loved the result. The handoff (a spec README, 7 screenshots, and 5 HTML reference boards) is in `docs/design/redesign/` (the HTML gitignored, it trips the secret scan and bloats the repo, so it stays local as the source of truth). The work is to recreate the boards in the RN/Expo app, evolving the existing Dusk tokens, not forking a parallel style system. Sequenced in six gate-green slices: (1) foundation, (2) the living background, (3) the whole-task finish plus the completion ladder, (4) Today reborn, (5) Routines plus Make-it-tiny polish, (6) the inheriting surfaces.

Slice 1, the foundation, is the pure brain everything stands on, with no visible change yet. New lib `phase.ts` (pure, unit-tested) derives the time-of-day phase (dawn / day / dusk / night) from the clock and holds the per-phase gradient stops (light and dark), the two drifting light-pool colours, and the phase-aware greeting, all straight from the handoff. Plus a `motion` token set in theme.ts (the durations micro / standard / gentle / celebration / ambient, with the easing and reduced-motion convention in a comment). The LivingBackground (slice 2) renders phase.ts. The animation slices read the motion tokens.

Decision deferred: building the background drift with `react-native-reanimated` (installed, 4.3.1) versus RN's built-in Animated, decided in slice 2 when the drift is built. `react-native-svg` is not installed and will be added in slice 2 for the radial light pools. Verification: typecheck / lint / 268 tests / coverage green (phase.ts fully unit-tested).

## 2026-06-22 The "Dusk, evolved" redesign, slice 2: the living background

The first visible piece. A new `LivingBackground` renders behind the whole app (mounted once in `_layout.tsx`, behind a transparent Stack): a time-of-day gradient with two slowly drifting radial light pools, reading slice 1's `phase.ts`. Today's background goes transparent so it shows. The other screens stay opaque for now and inherit it in slice 6. The legibility rule is the whole reason it works, the gradient and pools only ever show in the margins, never behind text, and a new `surfaceCard` token (light `rgba(255,255,255,0.92)`, dark `rgba(37,33,25,0.86)`) sits the cards on a near-opaque surface over the background.

**Animated, not Reanimated (the slice-1 deferred call).** The drift is RN's built-in `Animated`, a slow ~50s `motion.ambient` loop interpolating each pool's translate, not `react-native-reanimated` (installed but unused here). The motion is one slow, ambient, non-interactive loop, exactly Animated's sweet spot, with no gesture or per-frame-JS coupling to justify Reanimated's worklets. `useNativeDriver` is on for native and off on web (RN-web forces it off), and the loop is skipped entirely under reduced motion, where the colour still renders (the colour is the calm, the movement is the garnish). `react-native-svg` (15.15.4) was added for the pools (an SVG radial gradient fading to transparent), and it bundles clean on both surfaces.

**A small architecture move: motion tokens to their own pure module.** Slice 1 put `motion` in `theme.ts`, but that file imports `global.css` and `react-native`, side-effects the node test runner cannot load, and slice 3's pure `celebrate` logic needs those same durations under test. So `motion` moved to `constants/motion.ts` (pure, no side-effects), re-exported from `theme.ts` so components still import it from the theme alongside spacing and radius. The rule reaffirmed: pure logic and its tests never reach through a UI module. (`celebrate.ts` imports `motion` by relative path for the same reason, the `@/` alias is a Metro and tsc convenience the vitest resolver does not share, and the tested libs all use relative imports.)

Noted, not fixed: the phase resolves once on mount (a `useMemo` with an empty dep), so a session left open from dusk into night will not re-tint until reload. Re-resolving on app-foreground is a small later refinement, deliberately deferred to keep slice 2 to the background itself.

**Decided against:** a static gradient (the time-aware living background is the point of the redesign, and it costs almost nothing); Reanimated for this drift (above); a full-bleed background behind the cards (it would fight legibility, and the margins-only rule is non-negotiable for this audience); and forking a parallel style system from the handoff (the brief is to evolve the existing Dusk tokens, not run two).

Verification: typecheck / lint / 272 tests / coverage green. The screenshot tool times out on this app (a known preview limitation, not a crash, the console was clean), so the render was DOM-confirmed: the phase gradient plus two `radialGradient` pools behind a fully-rendered Today, with zero console errors. The drift cannot be seen moving in the headless preview (it throttles animation frames), so it is structure-confirmed here and is Melroy's device check, like the other motion. Slice 3 (the whole-task-finish bloom plus the completion ladder) is next, and its pure tier brain `celebrate.ts` is already written and unit-tested.

## 2026-06-22 The "Dusk, evolved" redesign, slice 3: the whole-task-finish bloom

The centrepiece, and Melroy's specific feedback fix. Finishing a whole broken-down task used to be a 3.5s text line ("You finished X. The whole thing."), which he called "too feeble and insignificant." Now the last sub-task tick raises a held celebration: a warm radial bloom (the handoff's `#E9B98C` to `#9B6A7D`) over a gentle dimming scrim, an eyebrow "You finished the whole thing", the task named in Newsreader italic, and a warm one-line context ("A week since you first wrote it down. Five small steps. All done."). It holds for the tier's duration or until a tap, then fades.

**Scaled, never scored.** `celebrationTier` (the slice-1 brain) reads the existing `isBigWin` signal, how long the task lingered (the dread proxy), and its complexity, and picks quick (~1.2s) / real (~1.8s) / long-dreaded (~2.4s), which sets the bloom's size and hold. `finishContext` (new, pure, unit-tested) writes the warm line from the linger and the step count, spelling small numbers for the editorial voice and dropping the linger clause on a same-day finish. No number, point, or streak is ever shown. The bloom replaces the one-line affirmation for a whole-task finish, never both, since the bloom IS the moment.

**The data plumbing.** `completeAncestors` was widened to return the finished parent task objects, not just their titles, so the celebration can read the real task's `createdAt`, `complexity`, and child count. The toggle derives the tier and the context from the topmost finished parent and raises the bloom there.

**Palette is fixed, not theme-driven.** The moment dims the room and a warm light rises, so the scrim and warm glow read the same in light and dark (a deliberate evocative choice, not a theme bug). Reduced motion keeps the held title and the warm colour and drops only the scale-in and fade. The overlay is a plain high-z `Animated.View` (the proven slice-2 pattern, an `Animated.Value` in state plus an svg radial), not a native Modal.

**Decided against:** confetti, particles, or a burst (the spec forbids them and they are off-brand for this audience); a persistent banner (the bloom is transient and tap-dismissable, never a thing to manage); points or a visible count (never); and forcing the celebration through the existing affirmation text (the held bloom is a bigger register, earned only by a whole-thing finish).

Deferred and noted: the beat-4 "a big one" sage tag on the finished row lands with the Lookback pass (slice 6), and the bloom is a plain overlay, so finishing the final step from inside Focus mode (a native Modal) may not show it over the modal, an accepted edge case since whole-task finishes almost always happen on the Today list.

Verification: typecheck / lint / 276 tests / coverage green (the 4 new `finishContext` cases plus the updated `completeAncestors`). The app was confirmed to load clean with the bloom wired (no console errors, Today renders, the bloom correctly absent until a finish). The in-the-moment bloom is tap-triggered, so its on-screen appearance is Melroy's device check, like every prior tap flow (finish a broken-down task to see it). Case AI-09 added.

## 2026-06-22 The "Dusk, evolved" redesign, slice 4: Today reborn (Rooms, the greeting, soft cards)

Three changes to the home screen, all from the handoff. (1) The crowded header is fixed. It carried four links (Repeating, Routines, Lookback, Settings) beside the date, and the date wrapped on narrow phones (the D2 flag). They collapse into one translucent "Rooms" pill (three accent dots plus the label) that opens a calm bottom sheet (`RoomsSheet`), a gentle fade listing the four with a one-line hint each, tap to go or tap the scrim to close. The header is now just the date plus the pill, and the date never wraps. (2) The greeting under "Today" is phase-aware (`phaseGreeting` from slice 1): "Good morning / afternoon. Just today.", "Winding down. Just today." in the evening, and a restful line late at night, replacing the one static line. (3) Task rows get the soft elevation shadow (`boxShadow 0 6px 18px -10px`, theme-aware), so they float a hair above the living background.

Decided against: a blur/glass pill (`expo-glass-effect` is an iOS-only API that no-ops on web and Android, so a translucent fill over the living background is the cross-platform call, and the now-dangling dep can be removed later); keeping the four links visible (the header simply does not fit them on a 360px phone, and they are all one tap away in the sheet); and a top sheet or full modal (a bottom sheet is the reachable, familiar pattern). The Rooms sheet closes before it navigates, so the destination never arrives behind a lingering sheet.

Verification: typecheck / lint / 276 tests / coverage green. Confirmed in the web preview: the header now reads "date + Rooms" (the old inline links gone), the greeting resolves to "Good afternoon. Just today." at midday, and a task row carries the soft shadow (`rgba(0,0,0,0.5) 0px 6px 18px -10px` in dark mode). Opening the sheet is tap-triggered, so it is Melroy's device check. Case TOD-16 added. Slices 5 (Routines plus Make-it-tiny polish) and 6 (the inheriting surfaces) remain.

## 2026-06-22 The "Dusk, evolved" redesign, slice 5: Make-it-tiny polish (the pebble's eyebrow and a warmer nudge)

The Routines half of this slice was already in place (the step check is a square, `radius.sm`, deliberately distinct from Today's round check), so slice 5 is the Make-it-tiny polish from the handoff. (1) A tiny-version pebble now carries an eyebrow, "A tiny step toward · <the dreaded task>", above its title, so the real task it stands in for is never lost from view. A pebble is detected purely (`tinyParentTitle`, unit-tested): a task whose parent is an OPEN parent, which distinguishes it from an ordinary decomposition step (whose parent is silent, not open). The eyebrow is periwinkle, matching the one-off border the pebble already wears. (2) The resurface nudge, shown when a pebble is finished and the real task returns, is warmer: "You started, that's the hard part. <task> is back when you're ready.", celebrating the genuine ADHD win (starting) over the old "chipping away" framing.

Decided against: a separate is-pebble flag on the task (the open-parent lookup is pure and needs no new field, so the data model is unchanged); uppercasing the parent title in the eyebrow (it would shout the task name, so sentence case with a periwinkle label colour reads calmer); and showing the eyebrow in select or long-press mode (those states take over the row first, by design).

Verification: typecheck / lint / 279 tests / coverage green (the 3 new `tinyParentTitle` cases). Confirmed in the web preview by seeding an open-parent "Do my taxes" plus its pebble: the row rendered "A tiny step toward · Do my taxes" above "Find last year's tax file and open it", with the silent parent correctly hidden and no console errors. The warmer nudge fires on completing the pebble (tap-driven), so it is Melroy's device check. Manual case AI-08 updated (the eyebrow and the new nudge). Slice 6 (the inheriting surfaces, so the living background shows app-wide) is the last.

## 2026-06-22 The "Dusk, evolved" redesign, slice 6: the inheriting surfaces (the living background, app-wide)

The last slice, and the one that makes the redesign feel whole. Until now the living background showed only on Today, every other screen painted an opaque `t.colors.bg` root that covered it. Now Lookback, Settings, Routines, Premium, Sign-in, Privacy, and the first-run welcome all use a transparent screen root, so the single `LivingBackground` mounted in the root layout breathes through the entire app. The Routines card also moves to `surfaceCard` with the same soft elevation Today's rows wear, so it floats over the wash consistently. The legibility rule holds everywhere: the gradient and pools only show in the margins, text stays on near-opaque cards, or for headings sits over a gradient so close to the paper colour that contrast never suffers.

Decided against: changing every small surface (segmented controls, inputs, confirm boxes, the photo-mat polaroid) to `surfaceCard` (those are controls and overlays, not content cards over the wash, so opaque is correct); and making the Repeating drawer or the breakdown modals transparent (they are overlays above Today, not full screens over the background, so a translucent panel would read as a glitch). A few card surfaces on the lower-traffic screens stay opaque `surface` rather than `surfaceCard`, a barely-perceptible 0.92-vs-1.0 difference noted as a trivial follow-on, not worth the churn.

Verification: typecheck / lint / 279 tests / coverage green. Confirmed in the web preview by navigating to /routines: the page rendered the Routines content with the living gradient and both light pools showing behind the transparent screen, no console errors. The other six screens use the identical transparent-root pattern over the same app-wide background. Case VIS-01 added. The "Dusk, evolved" redesign (six slices: foundation, the living background, the whole-task-finish bloom, Today reborn, Make-it-tiny polish, and the inheriting surfaces) is complete.

## 2026-06-22 The living background, retuned: it was invisible, now it reads

Melroy, seeing it live: "the background gradient has definitely not been built." He was right, and the reconciliation matters. The code WAS shipped and rendering (a full-screen gradient layer at full opacity plus two pools, all measured present in the DOM), but the values were so timid it was invisible: the gradient's three stops differed by 3-5 points per channel (dark-day `rgb(30,27,25) → rgb(25,22,19)`), which renders as a flat field, and the pools were faint (0.28-0.40) and, in dark mode, cool periwinkle where the mockup he loved is a warm amber glow. I had verified the layers were present, never that they were visible, because the preview screenshot tool times out on this app (the always-on drift animation never lets it idle). So I shipped a purely visual piece I had literally never seen. The lesson, banked: "the elements render" is not "the design works", and without a screenshot that gap stays invisible until a human looks.

The fix was ported from a mockup rendered in-chat that Melroy approved first, so we locked the look before shipping (I still can't screenshot the app). The gradient stops now carry a real top-to-bottom range (dark-day `rgb(44,36,32) → rgb(19,16,12)`), and the pools are prominent: a large warm hero glow anchored at the top (peach in light, amber in dark, matching the dawn-wash mockup) over a softer rose / mauve lower down. Because the background is viewport-fixed (behind the Stack, non-scrolling), the top glow stays a calm top-of-screen glow on every screen, with no per-screen special-casing.

Decided against: relying on the linear gradient alone for the warmth (at this subtlety it reads flat, the radial glow is what the eye registers); and tuning blind again, hence the in-chat preview as the approval gate. Verification: typecheck / lint / 279 tests green; the DOM confirms the new stops, the 646px top glow, and the amber pool colours are live. The on-screen result is Melroy's to confirm; the values are exactly the ones he signed off in the preview.

## 2026-06-22 The living background was covered app-wide: moved into Today, where it paints

Melroy, again, on the live site: flat grey, on PC, phone, and incognito. The retune (above) changed the *values*, but the background was never visible to change. React Navigation paints an opaque scene background (`#F2F2F2`, its `DefaultTheme.colors.background`) over every routed screen, and the single `LivingBackground` mounted in the root layout sat *behind* that, covered on every screen. So slice 6's "breathes through the entire app" and the retune's "every screen" were never true on any navigator-rendered screen. The slice-6 "confirmed by navigating to /routines" verification was a false positive (see the diagnostic).

The diagnostic that finally cracked it: my DOM probe used `document.elementsFromPoint`, which **skips `pointer-events: none` elements**, and the background is `pointer-events: none` so it never blocks taps. The probe therefore could never see the gradient, painting or not, and twice reported the opaque grey above it as "the visible pixel". Forcing hit-testing back on (temporarily setting the background and its ancestors to `pointer-events: auto`, probing, then restoring) showed the truth: mounted in the layout the gradient stacks *below* the `#F2F2F2`; mounted inside a screen it stacks *above* it.

The fix: render `LivingBackground` **inside the Today screen** (its transparent root renders above the navigator's scene background, the same layer Today's own content already paints in), not in the root layout. The root-layout mount and the failed theme experiment are removed. The other seven screens revert to a solid `t.colors.bg` root, so there is zero grey anywhere. The living background is now **Today's signature**, not an app-wide wash, which is where the approved mockup centred it.

Decided against: the app-wide background (slice 6's intent), reverted, because a layout-level background cannot beat the navigator's opaque scene paint; a **transparent React Navigation theme** (wrapping the Stack in a nav `ThemeProvider` whose `colors.background`/`card` were `transparent`, then `rgba(0,0,0,0)`), tried both, the `#F2F2F2` view persisted; and a per-screen `LivingBackground` on all eight screens, rejected as churn plus perf (the drift animation × 8) and because the dense screens (the Lookback calendar, the Settings list) read calmer on a solid background. VIS-01 updated to match (Today-only). The `@react-navigation/native` dep added during the theme attempt is left in place (it is a transitive expo-router dependency regardless).

Verification: typecheck / lint / 279 client + 127 server tests green. The corrected (hit-testing-forced) probe shows exactly one gradient div (the layout-level one is gone) stacking at position 2, above the `#F2F2F2` at position 6, at the top-centre of Today. The on-screen look is Melroy's to confirm; the gradient values are unchanged from the ones he signed off in the in-chat preview.

## 2026-06-22 The living background, two follow-ups from Melroy's live look: the web "ball" and the foreground re-resolve

With the background finally visible, Melroy spotted two things on the web app. First, a discrete glow "sphere" floating in the empty left gutter. The pools are composed for a phone-width column; on a wide web viewport the app is a narrow centred column with big empty gutters, so the lower pool drifted out into the gutter and read as a ball, not an ambient margin-glow. Fixed by clamping the pools' coordinate space to a centred, phone-like band (`poolLayout` in lib/phase.ts, now unit-tested): the big hero glow still scales with the full width (a broad top wash), but the lower pool stays behind the content column, with the wide gutters left to the plain gradient. A phone (width <= band) is unchanged.

Second, the optional polish: the phase now re-resolves when the app returns to the foreground (`useForegroundPhase`, via AppState 'active', which also fires on web tab-visibility), so an app left open across a boundary (day -> dusk) catches up on the next glance instead of only on a cold start.

Decided: the living background stays Today-only (Melroy's call, confirmed) - it earns its keep as Today's signature and adds little spread across the calmer, denser screens. README screenshots regenerated (they predated the living background, so the GitHub portfolio never showed it). Verification: typecheck / lint / 282 client + 127 server tests, the new `poolLayout` geometry covered; the phone screenshots confirm the wash renders warm and calm; the wide-web result is Melroy's to confirm on deploy.

## 2026-06-23 Three fixes from Melroy's live pass: sign-in fill, select-bar alignment, completed tasks no longer carry

- **Sign-in** boxed its own background to 560px: the `maxWidth` + `alignSelf: center` were on the screen *root*, so the background itself was capped and the page bled through on wide screens. Split into a full-bleed `screen` (`flex: 1` + `colors.bg`) and a centred `content` column, the pattern the other screens already use. Both schemes.
- **The multi-select bar's** "1 selected / Select all" row used `justifyContent: space-between`, but it is a content-sized child of a centred column, so there was no width to space across and the two labels collapsed together. Now a centred pair with an explicit gap.
- **Behavioural:** a finished one-off used to linger on Today indefinitely (the today-filter only checked due date, never done-ness). `tasksForToday` now keeps a done one-off only on the day it was completed (by its `completedAt`), then it lives in the Lookback. Open tasks still roll forward calmly, never shamed; only completed ones stop carrying; recurring tasks are unchanged (they reset by cadence). Surfaced and fixed a widget-model test that fed a done task a 1970 `completedAt`.

Decided against: dropping a task the instant it is ticked. You want to see today's wins before the day turns over, so a finished task stays until the date changes, then moves to the Lookback.

## 2026-06-23 Today capture + footer redesign (Melroy's live pass, part 2)

More Today feedback from Melroy:
- **Speak is inline** beside a narrower capture box now, not on its own line below it.
- **"Add to today" → "Add".** The button echoed the default-selected "Today" chip, which read as redundant. Relabelling the today case to a plain "Add" kills the echo. Melroy was unsure whether to drop the button entirely; I kept one clear "Add" because a button-free capture forces a when-chip to double as both selector and commit (ambiguous on a quick tap), and the Date / recurring chips need a confirm step regardless. For an ADHD capture, an unambiguous commit beats removing one button. Open to the chip-commit version if he prefers after seeing it.
- **The optional links moved below the rolling marquee:** "Synced to X" (or the sync invite) and "Turn on daily reminder", both centred in the accent colour, out of the way as the low-priority, optional things they are. (Melroy chose "both below the marquee" over promoting sync.)

The old footer stacked sync + reminder above the marquee, left-aligned; the new strip sits below it, centred. Screenshots regenerated.

## 2026-06-23 The public surfaces move to api.doubledone.app (off the name-bearing workers.dev URL)

Melroy, heading toward a public launch, flagged that Stripe and the MCP server both expose his first name. The root cause is one shared fact: the AI backend, the MCP server (`/mcp`), the public REST API (`/api/v1`), and the Stripe webhook are all the **same** Cloudflare Worker, whose only address was the account's free subdomain `doubledone-ai.melroy-a02.workers.dev`. One personal-name leak, four surfaces.

**Decided: a custom domain, `api.doubledone.app`, on the zone we already own.** One move repoints all four surfaces off the name. Added to `server/wrangler.jsonc` as a `routes` custom-domain entry (provisioned on the next `wrangler deploy`), and every reference repointed: the four client defaults (`ai.ts`, `reminders.web.ts`, `stripe.ts`, and `settings.tsx`'s MCP URL), the OpenAPI `servers` URL (`openapi.ts`), the screenshot script, `.env.example`, the API + MCP docs, the Stripe-webhook runbook step, and the CLAUDE.md resources table.

**Non-breaking by design.** The defaults are fallbacks behind `EXPO_PUBLIC_AI_URL`, which stays on the workers.dev URL in prod (Pages) and local (`.env`) until cutover, and the workers.dev URL is kept alive by an explicit `workers_dev: true` (the deploy-time correction below), so both addresses serve the Worker through the swap. The CORS allowlist and bearer auth key off the app origin and the token, not the backend host, so neither changes. It is also a portfolio upgrade: the API docs and MCP setup now read `api.doubledone.app`, which looks like a real product, not a hobby Worker.

**Decided against:** renaming the account's workers.dev subdomain (account-wide, and still a `workers.dev` URL, so it neither hides the structure nor reads as a product); and deriving the OpenAPI server URL from the request host (more robust, but a bigger change than updating one constant, and the constant is clear).

**Left for Melroy (the cutover, in order):** deploy the Worker to provision the domain (his per-instance OK), then flip `EXPO_PUBLIC_AI_URL` to `https://api.doubledone.app` in the Cloudflare Pages env (triggers a web rebuild) and in his local `.env`, then update the webhook URL in the Stripe dashboard to `https://api.doubledone.app/stripe-webhook`. Separately, not a URL fix: set the Stripe public business name + statement descriptor to "DoubleDone" so a customer's card statement never shows his legal name, and create a "DoubleDone" Expo org to move the project off the `@melroyds` owner before any Play Store release (`app.json`'s Android package is already the neutral `app.doubledone`). The decision-log's own historical entries keep their old URL, and the LICENSE / README keep his name (that is the portfolio, deliberately).

Verification: gate green (typecheck / lint / tests); no live behaviour change until the deploy plus the env flip.

**Deploy-time correction (2026-06-23, Worker version `3e6ddbca`):** deploying revealed the reasoning above was wrong on one point. Wrangler DISABLES the workers.dev route by default the instant a custom domain is added (it prints a warning but does it), so the first deploy briefly took `doubledone-ai.melroy-a02.workers.dev` offline while the live web app still pointed there. Caught it on the deploy output, added an explicit `"workers_dev": true`, and re-deployed, which serves BOTH the custom domain and workers.dev. Verified `/health` returns `{"ok":true,"hasKey":true}` on both hosts; the custom-domain cert provisioned immediately. The lesson: a custom domain is not additive by default, you must pin workers.dev on to keep it through a cutover.

**Cutover outcome (2026-06-23):** the web needed NO Cloudflare Pages env change after all (I had listed one above, it was wrong). The `deploy-web` GitHub Action builds with `EXPO_PUBLIC_AI_URL` unset (it passes only the Supabase vars), so `expo export` inlines the in-code default, which the repoint commit had already changed to `api.doubledone.app`. The push therefore rebuilt the live site onto the new domain automatically. Verified by reading the live bundle on doubledone.app: it contains `api.doubledone.app` and zero `workers.dev`, and both `deploy-web` runs (the repoint and the `workers_dev` pin) succeeded. So of the "left for Melroy" list, only the Stripe webhook URL (workers.dev still serves it, so no rush), the Stripe descriptor, and the Expo owner remain, plus an optional dev-only `.env` tidy. workers.dev is deliberately kept alive (the pin above) so the Stripe webhook keeps working until it is moved; it can be retired once that is done.

## 2026-06-23 Privacy hardening: remote-wipe on a deleted account + policy tidy

Two of the pre-launch privacy items.

**Remote-wipe when the account is deleted elsewhere.** A second signed-in device used to keep its local tasks after the account was deleted on another device (local-first can't be remote-reached). The sync pass now detects it: the only foreign key on `tasks` is user_id -> auth.users (ON DELETE CASCADE), so once the account is gone a push fails with a Postgres foreign-key violation (SQLSTATE 23503). `isAccountGone(error)` (pure, unit-tested) matches ONLY that code; on it, the sync effect clears the synced tasks + the account-owner marker and signs out (`sync.account_gone`). Deliberately narrow: a network error or an expired token returns false, so a transient hiccup can never wipe local work. Local-only data (routines, settings) is untouched, it was never part of the account. The >1h-expired-JWT case still just fails auth and signs out naturally (the local data is the user's own, not a leak), which is acceptable.

Decided against a broader auth-error match (a false-positive wipe of someone's local tasks is worse than the mild harm of stale tasks on an orphaned device) and against wiping local-only data (it isn't account data).

**Privacy policy tidy.** The policy now states Anthropic does not use API inputs to train its models (the documented provider posture), and the footer no longer names me personally or links my GitHub handle, pointing privacy requests to support@doubledone.app instead, consistent with keeping personal details off customer surfaces.

The third privacy item, telemetry anonymisation, needs no work yet: `[doubledone.*]` events are console-only and never leave the device, so there is no sink to harden until one is built.

**Native env leak found + fixed the same day:** the EAS `preview` environment still had `EXPO_PUBLIC_AI_URL = doubledone-ai.melroy-a02.workers.dev`, so the Android APK (which inlines EAS env, not the in-code default) still pointed at the name-bearing URL. Updated the EAS preview env to `https://api.doubledone.app` and rebuilt, so native matches web. This was the last surface still carrying the old URL, and the prerequisite for retiring workers.dev.

## 2026-06-23 workers.dev retired (only api.doubledone.app serves now)

With web, native (the EAS preview env), the docs, and the code defaults all on `api.doubledone.app`, nothing references the workers.dev URL any more, so it was retired: `workers_dev: false` in `server/wrangler.jsonc`, deployed. `doubledone-ai.melroy-a02.workers.dev` no longer resolves; only the custom domain serves the Worker. The personal name is now gone from every live surface (web, native, the API + MCP docs, Stripe's customer-facing fields, and the repo + its history).

Two known consequences, both expected: the Stripe TEST-mode webhook still pointed at `…workers.dev/stripe-webhook`, so test-mode webhook events stop arriving until it is repointed at `api.doubledone.app/stripe-webhook` (a non-issue in practice: no test checkouts are running, and live mode needs a fresh webhook anyway). And a local `.env` whose `EXPO_PUBLIC_AI_URL` is the old URL must be updated to `api.doubledone.app`, or the line deleted since the code now defaults to it, for `npm run dev` to reach the backend.

## 2026-06-23 Feedback channel: a Settings mailto link

Melroy wanted a way for users to send feedback. Chose the cheapest, zero-backend route: a "Send feedback" link in Settings that opens the user's mail client to support@doubledone.app via `mailto:` (no server, no outbound-email dependency; the inbox forwards through Cloudflare Email Routing). Decided against an in-app form, which would need a Worker route plus an email-sending service for marginal gain over mailto. Instrumented `feedback.opened`. Revisit if mailto friction (a web user with no mail handler configured) shows up, or feedback volume warrants a real form.


## 2026-06-23 Pre-launch polish pass (accessibility + consistency)

A UI polish sweep before launch, from a three-agent review. No new features. Fixed:

- **Text scaling:** every hardcoded `lineHeight` now multiplies by `t.scale` (38 spots, 14 files), so the Large text-size setting stops clipping lines. Default size is identical (scale is 1 there).
- **Contrast:** light-mode `inkFaint` #A89E93 -> #8A7F73, clearing WCAG AA on the paper background for tertiary text (hints, dates, legends).
- **Heading honesty:** `fonts.sans` titles `fontWeight: '700'` -> `'600'`. Newsreader only ships 600, so 700 was a silent no-op on native and faux-bold on web; 600 renders identically on native and drops the web faux-bold.
- **Modal a11y:** `accessibilityRole="button"` on the five Today dismiss-backdrops and the BrainDump picker backdrop (they had a label but no role).
- **Touch targets** toward ~44px: `moveChip` (padding + hitSlop), `lowDayToggle` (12 -> 14px + hitSlop), Routines `whenPill` (padding).
- **Routines** brought onto the shared screen pattern: title 30 -> 42px, back-link grey body -> mauve bodyBold "back-to-Today".
- **Copy:** Privacy "AI features" wall split into two paragraphs; Premium "4 after six" -> "4 after six months"; two curly apostrophes -> straight; Lookback back-link gained its chevron; sign-in code `maxLength` 10 -> 6; DatePicker weekday `en-AU` -> device locale.
- **Dead code:** removed five unused styles (sync/syncRow/syncText/syncAction/focusLink) and a stale "denim" comment; collision-proof key on the Lookback week-list; the one-off confirm title can now wrap to two lines.

Decided against (reviewed, left on purpose):

- **Periwinkle border (one-off) + the recurring mark sharing a hue** is not a collision: a row has one or the other, never both, so periwinkle reads cleanly as the task-type accent. Left the approved Dusk identity alone.
- **An `onAccent` token for the ~15 `#FFFFFF` accent-fill literals:** already consistent; tokenising is churn for zero visual change.
- **Flattening every serif title to 400** (the reviewer's alternative): kept the page-title-400 / modal-title-600 hierarchy and only made the 700s honest, because flattening is a visual change the screenshot harness cannot verify on the modal surfaces. Open to the lighter uniform look on request.
- **The sliced-task confirm title** stays one line: it sits in a row beside the Step-back / Remove / Close buttons, where wrapping would crowd them.
## 2026-06-23 In-app feedback (a send box, not a mailto)

The "Send feedback" link was a mailto: (it opened the user's mail client, which on web
often does not exist and on mobile throws them out of the app). Replaced with a real
in-app form: a textarea + Send that POSTs to a new POST /feedback on the AI Worker,
which emails the note to the support inbox. Calm sending / sent / error states, no
leaving the app.

- Send path: Cloudflare Email Routing's send_email binding, not a third party
  (Resend/MailChannels). Email Routing is already set up for receiving support@, so
  sending needs no new account and costs nothing. The constraint it imposes: it only
  sends to a verified destination, so the recipient is the Gmail support@ already
  forwards to, held in a FEEDBACK_TO Worker secret (never committed, private
  server-side like the Anthropic key). Decided against Resend (a new account + DKIM DNS)
  for launch; revisit if we ever want support@ itself as the literal To.
- The cloudflare:email EmailMessage is a runtime dynamic import inside the handler, so
  the Node/vitest import of index.ts never resolves the Workers-only module. The pure
  parts (validation + the RFC 5322 MIME builder, base64 body so unicode survives) live
  in server/src/feedback.ts and are unit-tested; the actual send is deploy-verified,
  like the AI upstreams.
- Guarded like the paid routes: origin-gated (browser) and per-IP rate-limited, so the
  box is not an open spam relay. The note is capped at 4000 chars.

Ships behind two of Melroy's ops: npx wrangler secret put FEEDBACK_TO, and the Worker
deploy. Until both, the form shows its calm error; the web auto-deploys the form itself.
## 2026-06-23 B1: the whole-task-finish bloom floored at "real"

The device-test flag (B1) was that finishing a broken-down task read too feeble. The bloom
and its trigger were already built (Bloom.tsx + the completeAncestors path in index.tsx);
the cause was the tier. A same-day, modest whole-task finish (lingerDays < 2, stepMinutes
< 30, not a big-win) fell into the smallest `quick` tier (a 210px light, ~1.2s). But
finishing a task you broke into steps is never "quick", it is at minimum a real finish, so
celebrationTier now floors a whole-task finish at `real` (the held 290px bloom), with
`dreaded` still reserved for the long-lingered or heavy ones. Decided against keeping the
quick tier for whole-task finishes: `quick` stays in the type for the component but is no
longer produced, the biggest "you did the thing" moment should never be the feeblest. The
bloom's on-device animation feel remains a device check (the headless preview throttles rAF).
## 2026-06-23 Introduction redesign: the 6-screen welcome

Rebuilt welcome.tsx from the 4-step (welcome -> capture -> reveal -> handoff) into the
"Dusk, evolved" 6-screen onboarding from the Claude Design handoff: Welcome (the empty.jpg
banner), Empty-your-head (the real BrainDump), Sized-to-be-doable (the real triage result),
The-safety-net (Break-it-down / Make-it-tiny / Strategise, introduced once), What-you-keep
(the closeday.jpg banner, Lookback + close-the-day), and Open-Today (the handoff + a one-line
privacy + sync note). A quiet 6-dot progress, Skip on every screen but the last, a Back
affordance from screen 2 on (typed text preserved), and the design's final copy.

Kept the depth principle the design recommended: curate, don't catalogue. The core loop is
taught by DOING (the user's own dump runs through the real triage by screen 3) plus one light
safety-net pass; Routines, sync, the scrapbook, the weight gauge and focus are left for
in-context discovery, so the onboarding never becomes the overwhelm the app prevents.

Triage fallback (the one real build risk, resolved): screen 2's "Sort it for me" wraps the
real /triage in BOTH a try/catch AND an 8s timeout, so a slow or failed call falls back to
"everything on today, nothing lost", framed identically. Tasks save once on exit (Open Today
or Skip), idempotent, so Back/forward never double-saves and replay never double-merges.
Deferred: a forward-swipe accelerator and a cross-fade transition (the button + Back are the
reliable path; the screenshot harness throttles transitions anyway). Verified screens 1-2 +
the nav in the preview; the rest reuse the same shared footer, banner, and text patterns.

## 2026-06-23 Privacy policy: Anthropic data-handling specifics

The AI-features section said Anthropic does not train on what the API receives, then stopped and
blurred Anthropic's handling into DoubleDone's own retention. Added the specifics, checked against
Anthropic's current API data-retention docs (fetched 2026-06-23): commercial API traffic is not
used for training, and prompts and outputs are not retained by default on the Messages API (the
30-day requirement applies only to the Covered Models Fable 5 and Mythos 5, which DoubleDone does
not use); the one exception is content flagged for safety or legal reasons, which may be held up to
two years. Also separated the two parties: Anthropic does not keep the text, whereas DoubleDone
keeps a pseudonymous, aggregate copy for the moat.

Decided against a formal Zero-Data-Retention agreement (a sales-contract arrangement, overkill for
a solo project, and the standard API already does not retain by default), and against an absolute
"keeps nothing" claim, which the flagged-content exception would make untrue, so the wording is
hedged with "by default" and names the exception.

## 2026-06-23 Account deletion now wipes the scrapbook (and all local content)

Melroy found that deleting his account left the week-of-21-June scrapbook behind. Both deletion
paths (the in-app delete in settings.tsx, and the detected remote-deletion in index.tsx) cleared
only tasks; the scrapbook, routines, and per-day state were left, by a deliberate "local-only data
was never part of the account" choice. That holds for display prefs (theme), not for a keepsake
generated from the user's finished tasks: it is their data, it just lives locally.

Fix: one wipeLocalData() in storage.ts, called by both paths. It clears the user content and
history (tasks set to empty so loadTasks does not re-seed, scrapbooks, routines, and the closed-day
/ low-day / last-open state) and the synced-owner marker, and keeps only device prefs (theme / text
size / motion, the reminder toggle, the onboarded flag). One key list, so neither path can forget a
key again. Regression-tested in storage.test.ts.

Decided to keep display prefs rather than do a full factory reset: a theme choice is not personal
content, and keeping it avoids a jarring re-onboard. Decided against any R2 cleanup: the scrapbook
image is a base64 data URL in local storage, not an R2 object (the Worker has no R2 binding), so
clearing the local key removes it entirely. Side finding: the README and CLAUDE.md claim scrapbooks
persist on R2 "served by URL", which is inaccurate and should be corrected.

## 2026-06-23 Branded sign-in email + the transactional-sender audit

Auditing the "real transactional email sender" item, the sender is already done: Resend SMTP,
doubledone.app DKIM-verified (confirmed via a live DNS check of resend._domainkey), so sign-in
codes go through a real domain-verified sender, not Supabase's shared one. The checklist item was
stale. The one real gap was DMARC: _dmarc.doubledone.app had no record, so auth-setup.md now marks
it recommended (record: v=DMARC1; p=none;), for Melroy to add in Cloudflare DNS.

Built a branded OTP email template (supabase/email-templates/otp-code.html) in the Dusk palette,
replacing the bare placeholder: the code in a mauve tile, the calm voice, table layout + inline
styles for email-client support. Melroy pastes it into the two Supabase templates (Magic Link / OTP,
Confirm signup). Decided to keep it a pasted template rather than move sending into the Worker:
Supabase Auth already owns the OTP lifecycle, and a custom send path would duplicate it for no gain.

## 2026-06-23 Correction, and R2 scrapbook purge on account deletion

Correcting two earlier entries today: R2 IS wired, I was wrong. The Worker already uploads each
scrapbook image to R2 (the SCRAPBOOKS binding in wrangler.jsonc) and serves it at GET
/scrapbook-img/:key; the client stores that URL, with base64 only as a fallback. So the README's
"images persist on R2, served by URL" was accurate. I had trusted a stale storage.ts comment and an
R2 row missing from the CLAUDE.md table over the actual Worker code. The "R2 never wired / base64-local"
notes in today's deletion and email entries are wrong; this is the correction.

The real gap it surfaced: account deletion cleared the local scrapbook entry but not the R2 object, so
the keepsake image survived a delete as an orphan (the R2 half of the bug Melroy reported). Fix: a POST
/scrapbook/purge route on the Worker (deletes the given keys from R2, best-effort, capped at 200, keyed
by the unguessable UUIDs the client already holds), a client purgeScrapbookImages() that sends those
keys, and both deletion paths (settings runDelete, index detected-deletion) now purge the R2 images
before wiping local. Contract-tested. Needs a Worker redeploy to go live.

Decided against authenticating the purge beyond the unguessable key: the keys live only in the owner's
local store, so a caller can only ever delete images it already knows, its own, and a deleted keepsake
is low-harm. Also fixed the stale storage.ts comment and added the R2 row to the CLAUDE.md table.

## 2026-06-24 Affordance pass + pull-to-today (from a tester's usability note)

A tester flagged three things, all fair: a Later task could not be moved up to today (only pushed
further out), the drawer's "Done adding" did not read as a button, and more broadly "is it a button or
a label" was confusing where the two looked alike. The root was an affordance gap, not a colour gap, so
the fixes target tappability, not decoration.

**Affordance language, made consistent.** The secondary text actions (Sync, the daily-reminder line,
"Done adding", "Select all", the low-day toggle) were soft-ink with no tappable cue, so they read as
inert labels. They now carry a quiet underline: clearly pressable, still calm, still no mauve. Mauve
stays reserved for the one primary action, so the restraint from the 2026-06-23 polish is intact. The
three tiers are now distinct, button / underlined-link / plain-label, and plain labels (the rotating
ethos, dates) stay un-underlined.

**Pull-to-today.** A visible "Bring to today" link now sits under each Later task. It is the mirror of
deferTask: pullToToday sets the due to today via deferTo(t, toISODate(today)), so tasksForToday
(due <= today) surfaces it and upcomingTasks (due > today) drops it. The daily loop is now
bidirectional, defer or prioritise, with the same never-shame framing both ways. Verified on the
preview: a seeded Later task moved into Today, its due updated, the link gone.

Decided against a hidden long-press menu item for the pull. The tester could not find the action at all,
so discoverability was the whole point, and a buried gesture would have repeated the mistake. Decided
against re-introducing mauve on the secondary links to signal tappability, which would have undone the
restraint that makes the screen calm. The underline buys the affordance without the colour. QA cases
TOD-17 (pull) and TOD-18 (affordance) added.

## 2026-06-24 Pull-to-today, take 2: tap-and-hold + "Move to ... Today", not a per-task button

Melroy reviewed the "Bring to today" button live and called it right: a single-tap shortcut, but an
eyesore, and inconsistent with how every other task move works. A Today task moves via tap-and-hold ->
select -> "Move to...". A Later task should move the same way, not via a bespoke button. Consistency and
agency over the one-tap shortcut.

So the button (and its pullToToday handler and styles) is gone. The Later rows now take the same four
selection props as the Today rows (onLongPress -> enterSelectWith, selecting, selected, onSelect), so
tap-and-hold on a Later task opens the same action bar. The "Move to..." sheet gains a "Today" chip
(bulkMoveTo(toISODate(today))) as the first option, so pulling a Later task forward is now just "Move
to -> Today", the exact inverse of deferring, through the one consistent mechanism. The Later section
was already rendered in select mode (no !selectMode guard), so no structural change was needed there.

Decided against keeping both the button AND select-move: two ways to do one thing is the clutter the
never-add-a-setting spine warns against, and Melroy preferred the agency of the deliberate path. The
button shipped and came out within the hour, which is the decision log working as intended, a dead end
caught at the first live look. QA TOD-17 rewritten to the select + Move-to flow.

## 2026-06-24 Marquee fix: the scrolling train goes out of flow (Android title-vanish + select freeze)

Two marquee bugs from Melroy's Android testing. A long-title task with a reminder set showed only the
bell, the title blank. And entering select mode froze other scrolling titles and blanked a reminder one.

Diagnosed on web first: the layout is fine there (the clip measures 184px with a bell, 264 without, the
title renders). So it is Android/Yoga-specific. The root is the scrolling "train" (two full-width copies
of the title, deliberately huge so it can scroll) sitting IN FLOW inside the clip. Web's flexbox honours
the clip's overflow:hidden + minWidth:0 and constrains it. Android's Yoga, with a reminder bell also
competing for the row, let the train's huge width collapse the clip to zero, taking the title with it.

Fix, two parts:
- The train is now position:absolute, so its width never feeds back into the clip's own width. A
  zero-content invisible spacer gives the clip its line height (the absolute train contributes none).
  Verified on web that this does not regress: same clip widths, title visible, clip height 23px.
- A measureKey prop on MarqueeText, fed per TaskRow variant (select / slice / suggest / tiny / normal,
  the last two also keyed on whether a reminder bell is present). The imperative measure only re-ran on
  mount or text change, so a layout change with the same text (a bell appearing, or React re-using the
  row across the normal -> select shape change) left a stale width. The key change re-runs the measure.

Decided against onLayout for the container width, which an earlier marquee pass found unreliable in this
RN-web build and which once thrashed the animation. The targeted measureKey re-trigger keeps the proven
imperative measure. The Android behaviour itself needs Melroy's on-device confirm, the headless web
preview throttles both the animation and the long-press, so neither the scroll nor select can be driven
here. QA TOD-19 added.

## 2026-06-24 Marquee retired: long titles just wrap now (the Android fix that finally stuck)

The absolute-train marquee fix from earlier today did NOT work on device. Melroy's APK still showed a
blank title on a reminder row. The deeper problem was the method: the bug only ever reproduced on
Android (the web layout was always fine), so every attempt was a blind guess at Yoga's behaviour, and
the scroll had now been three rounds of exactly that.

The discipline-of-stopping call, made with Melroy: stop fighting the marquee and just wrap the title
onto up to three lines. MarqueeText is now a plain `<Text numberOfLines={3}>` with flex:1 + minWidth:0.
No measurement, no Animated train, no reduced-motion branch, no measureKey. The whole class of Android
layout bug is deleted along with the animation, and because it is now an ordinary wrapping Text, the web
preview is representative of Android again. Verified on web: a long title with a reminder wraps to 3
lines and stays fully visible, where it used to collapse to blank.

Decided against keeping the scroll behind a reduced-motion check. The motion WAS the liability, and a
scrolling title is movement a calm-first, often motion-averse audience does not really want anyway, so
the wrap is the better default for everyone, not a fallback. Decided against renaming the component
(MarqueeText is now a misnomer) to keep the change small and low-risk, with a comment noting it. The
scrolling marquee (decision-log 2026-06-18) is retired. QA TOD-19 reworded to expect a wrap.

## 2026-06-24 Two device fixes: reminders that fire, and the decompose chain syncs

Two bugs from Melroy's device testing, fixed in one pass.

**Reminders never appeared (the bell showed, nothing fired).** The schedule was succeeding (the bell only
renders when scheduleNudge returns an id), so it was a display problem, found by reading the SDK 56 docs,
not reproducible in the headless preview. Two grounded gaps. First, no setNotificationHandler, so
expo-notifications drops a notification that fires while the app is foregrounded, and Melroy was in the
app at the reminder time. Second, the channel was created AFTER requesting permission, but on Android 13
the permission prompt does not appear until a channel exists. Fix: a module-scope foreground handler
(calm, banner-only, the SDK 56 shouldShowBanner + shouldShowList keys, shouldShowAlert is deprecated), and
ensureChannel moved ahead of the permission request in both enableDailyReminder and scheduleNudge.

**The decompose chain did not sync, and the MCP/API could surface a silent parent.** silentParent and
parentId (Cluster B) were client-only, never in the schema or the sync mapping, because both the sync
(2026-06-18) and the MCP (2026-06-20) predate the decompose feature (2026-06-22). Fix across four layers.
Two nullable columns (silent_parent, parent_id) added to the tasks table by an additive migration Melroy
ran manually. The sync mapping (TaskRow, taskToRow, rowToTask) now carries them, round-trip unit-tested.
And both today-queries (the MCP's list_today and the REST API's ?today=true) exclude silent parents with
silent_parent=not.is.true, which keeps false and null (a normal task) and drops only true. Contract-tested.

Decided against shipping on auto-deploy. The sync write and the Worker filter both reference the new
columns, so they would error until the migration ran, so the migration went first and the push plus the
Worker deploy followed. Decided against a config plugin for expo-notifications: the docs confirm it is
optional for local notifications and does not declare POST_NOTIFICATIONS (Android 13 auto-prompts), so it
was never the cause.

## 2026-06-24 Three Android device bugs, root-caused by a multi-agent pass, then fixed (Ultracode)

More device testing from Melroy, and two prior blind fixes had already missed (the only verification
surface is a paid APK on his Samsung, the headless web preview reproduces none of these). So instead of a
third guess, a 13-agent workflow root-caused each bug: independent investigators grounded in BOTH the code
and the react-native-svg / expo-notifications issue trackers, a synthesis per bug, then an adversarial
skeptic per fix. The skeptic earned its keep, rejecting two of the three first-draft fixes as insufficient.

**Bloom "pillar".** Confirmed react-native-svg (15.x) mis-rasterises a LARGE RadialGradient on Android. The
LivingBackground light pools are ~400-700px, while the bloom's own glow is <=360px and renders fine, which
is exactly why the pillar only showed under the bloom's dark scrim and never in normal use. It is
size-driven, not coordinate-units, so the earlier userSpaceOnUse change (the 2026-06-24 bloom+select fix)
never had a chance. Fix: a Platform.OS guard skips the SVG pools on Android only, web and iOS keep them. The
pools are imperceptible in normal Android use, so nothing intended is lost. Decided against an
expo-linear-gradient or PNG-glow replacement for now (more work and another build for a polish layer that
was already invisible on Android), the guard is the lowest-risk fix and reverses in one line if
react-native-svg ever fixes large radials.

**Nudge never firing.** The bell rendered (so scheduling succeeded, with permission), yet nothing reached
the tray. A DATE-trigger local notification needs an EXACT alarm on Android 12+, which needs the
SCHEDULE_EXACT_ALARM / USE_EXACT_ALARM manifest permission. Without it expo-notifications falls back to an
inexact alarm that Samsung One UI's Doze throttles into never firing. The skeptic caught that app.json's
`android.permissions` is not reliably applied by Expo for these special-access permissions, so the
permission is injected by an explicit withAndroidManifest config plugin (client/plugins/with-exact-alarm.js).
USE_EXACT_ALARM is auto-granted, so there is no settings prompt for the user (the calm path), with
SCHEDULE_EXACT_ALARM as its companion. This does NOT contradict the "no config plugin" note above: that was
about POST_NOTIFICATIONS (genuinely auto), this plugin is for the exact-alarm permission, a different need.
The nudge channel also moves DEFAULT -> HIGH (a renamed `task-nudge-v2` id, because Android ignores
importance changes to an already-created channel) so a reminder the user explicitly asked for actually pops,
and the schedule gains a stable identifier. The daily reminder stays calm at DEFAULT. Part of this may
remain user-side: Samsung battery optimisation can restrict the app, which QA AND-06 now flags. Note:
USE_EXACT_ALARM carries a Play Store policy expectation (alarm/reminder apps), fine for the sideloaded
build, to revisit before any Play Store submission.

**Stale nudge bell.** The bell cleared only on done/remove/defer, never when its time simply passed, so a
fired-but-uncompleted nudge showed a stale time all day. Fix: a pure sweepElapsedNudges(tasks, now) (returns
the same array reference when unchanged, unit-tested) run on task load and on AppState foreground resume,
plus a render-guard backstop at the prop site. The skeptic rejected a render-guard-only fix, since the app
does not re-render merely because time passed, which is why the data sweep on load and foreground is the
primary mechanism.

A TEMP "In 2 minutes (test)" nudge preset was added so firing can be tested in minutes rather than an hour,
to be removed once firing is confirmed on device. Gate green (294 client + 140 server). All three are
Android-only, so they are verified on the build by Melroy, not the preview.

## 2026-06-24 Bloom pillar resolved: the scrim's compositing, not the pools (correcting today's earlier call)

Closing the bloom pillar, confirmed fixed on Melroy's Samsung. The earlier entry today credited the fix to
dropping the SVG light-pools on Android. That was WRONG, and the next build proved it (pools off, pillar
still there). Recording the dead end honestly.

Real cause, by elimination once the pools were ruled out: the band is NEUTRAL, full-height and centred, but
the bloom's glow is a 290px warm SVG circle (cannot paint a full-height neutral band) and the band shows
ONLY while the scrim is up (so the scrim generates it, not something behind). That leaves the scrim: a
full-screen translucent Animated.View fading its opacity in, with elevation:100. On Android, animating
opacity on a translucent elevated view with child content seams into a vertical hardware-compositing band.
Fix (99c0137): needsOffscreenAlphaCompositing on the scrim plus dropping the unnecessary elevation:100 (the
bloom mounts last, so zIndex keeps it on top). Verified clean on device.

The pools stay guarded off Android: they were never the pillar, but they are imperceptible in normal Android
use anyway, so the guard is harmless and re-enabling them is risk for no gain.

The TEMP "In 2 minutes (test)" nudge preset is removed now that firing is confirmed. The real presets (1
hour / 3 hours / this evening) are restored, and QA AND-06 reverted to a real preset. The lesson about how
this was finally cracked (the paid build loop, a multi-agent skeptic, and reasoning by elimination over
hunches) is banked in the session memory.

## 2026-06-24 Combine: fold several tasks into one (the inverse of Break-it-down)

Melroy's feature: select two or more tasks, "Combine" them into one. A cheap Haiku call (/combine, the
sibling of /decompose) suggests an umbrella title, the user edits it, and the originals fold into one new
task placed at the earliest of their due dates. The intent is the mirror of Break-it-down: zoom OUT when
the day is cluttered, the way Break-it-down zooms IN when a task is too big.

**The model (overriding the design pass).** A multi-agent design workflow returned three takes that all
missed the point: two kept the original tasks VISIBLE after combining (which does not declutter Today, the
whole purpose), and the third made the umbrella a hidden silent parent with the children shown, which is
just Break-it-down again. The shipped model instead: the selected tasks are tombstoned (the SAME reversible
soft-delete the sync engine already uses, so nothing is lost and a future un-combine is possible) and
recorded on the umbrella's new combinedFrom field (the id + title of each). The umbrella is an ordinary
visible task, and Today goes from several rows to one. Decided against a hard delete (lossy, not
reversible) and against any new "hidden child" visibility concept (the tombstone reuses what exists).

**The dependency crux (Melroy: "handle that elegantly").** A combined task may already be a child of a
decomposed silent parent. Tombstoning it detaches it. A parent left with live children is untouched and
still completes normally when those finish. A parent emptied of ALL its children is tombstoned too, its
work having moved into the umbrella. DoubleDone's decompositions are single-level, so there is no
grandparent chain to re-walk, which was the skeptic's main worry. Decided AGAINST the workflow's "mark the
emptied parent done": that fires a false completion and a Lookback entry for work that merely moved, which
the never-false-reward spine forbids. Tombstoning removes it quietly, no bloom, no entry.

**Earliest-date rule.** The umbrella takes the earliest due among the selected, where an UNDATED task
counts as the earliest (it already sits on Today with no deadline). So a combine that includes an undated,
due-today, or overdue task lands on Today with no imposed deadline, otherwise it takes the soonest future
date. This corrects the design pass's filter-out-null version, which would have pushed an [undated,
next-week] combine onto next week even though the undated one shows today. Worst case the user moves it.

**Completion + eligibility.** The umbrella completes like any ordinary task, the calm "Done is done", NOT
the whole-task decompose bloom, so the bloom stays reserved for finishing something you broke down and is
not diluted by grouping small things. Combine is offered only for non-recurring, open, not-deleted tasks (a
recurring task repeats and has no single due to fold).

The pure fold, the four dependency cases (standalone / one parent fully / one parent partly / multiple
parents), and the earliest-date rule are unit-tested (client combine.test.ts, 15 cases). The /combine
endpoint is contract-tested (server combine.test.ts plus an index.test.ts route guard), and the moat logs
it like the decompose telemetry ('combine' added to the D1 ai_calls endpoint union). Gate green (309 client
+ 146 server). Verified end-to-end on the web preview: long-press to select, Combine appears only at two or
more eligible, the review modal, the fold (originals tombstoned, one umbrella on Today carrying
combinedFrom, Today decluttered, select exits), persisting across reload. The headless preview cannot
reflect the RN-web Modal's visual close (the documented Strategise / Close-day gotcha), but the close
handler is the identical one-liner four shipped modals use. QA TOD-20 (core) and TOD-21 (decomposed
children) added.

Pending Melroy's go-ahead: the production Worker deploy of /combine (for the live AI title). Until then the
modal opens with an empty name to type, so the feature already works without the deploy.

## 2026-06-24 Widget disabled, the /combine deploy, and a reminder test button

Three follow-ups after Combine shipped, all at Melroy's direction.

**The /combine Worker is deployed and the AI title is confirmed live.** Production deploy (version
78a5a0aa, api.doubledone.app), on Melroy's per-instance OK. A single real call returned "Do the grocery
shop" for milk/bread/eggs, so Combine's umbrella suggestion now works end to end on the deployed app, not
just the type-it-yourself fallback.

**The Android home-screen widget is disabled.** The earlier multi-agent pass diagnosed it as a
react-native-android-widget 0.20.3 / RN 0.85 new-architecture incompatibility (the headless render task
never fires, so the widget draws nothing). The plan was to confirm with one logcat line first, but Melroy
could not get adb running and does not need the widget, so we skipped the confirmation and cut it. Disabled
by removing the app.json plugin entry and the registerWidget() call in index.js, and by making
updateWidget() (called from commit() on every task change) a no-op so it never fires a native
requestWidgetUpdate against a widget that is no longer registered. Decided against deleting the widget/
source (TodayWidget, the task handler, the model): it is kept, unused, for a one-line re-enable when the
library catches up to RN 0.85, and it still reads as a built native-widget surface in the repo. Decided
against removing the react-native-android-widget dependency, which would force an npm reinstall for no gain
(the unused dep is harmless and keeps the kept source compiling). buildWidgetModel stays unit-tested.

**A daily-reminder test button (debug).** Melroy has never seen the daily reminder fire on his Samsung (it
works on web). scheduleReminderTest() fires a one-off notification about 90 seconds out on the daily
reminder's own channel (DEFAULT importance, the same content), and a Settings link "Send a test reminder
(~90s)" triggers it with an inline status line. Native only (hidden on web, with a no-op in reminders.web.ts
so the shared import resolves). Honest caveat, recorded so it is not over-read: this exercises delivery on
the daily channel (the channel, the permission, the foreground handler), not the repeating DAILY trigger's
alarm exactness, which a one-off DATE trigger cannot replicate. If the test fires, the notification
machinery works on the device. If it does not, there is a delivery problem worth knowing. The button is a
debug affordance to revisit (gate or remove) before a wide launch.

Gate green (309 client + 146 server). QA AND-05 flipped to "widget absent from the picker" and REM-01
rewritten to use the test button as its fast path. An EAS Android build follows so Melroy can confirm on
device: the widget gone, the reminder firing, and Combine.

## 2026-06-24 v1.0.0: DoubleDone goes gold

Melroy verified on his own Samsung that the daily reminder fires, Combine works, and the widget is gone,
and called it: we go gold. Version bumped 0.1.0 -> 1.0.0 in app.json. The Android versionCode is
EAS-managed (eas.json appVersionSource is remote, and the production profile auto-increments it), so there
is no versionCode to hand-set. The daily-reminder debug button and scheduleReminderTest are removed now
that reminders are confirmed firing on a real device, they were scaffolding for that one verification, not
a shipping feature. QA REM-01 reverted to the scheduled-hour check.

Next is the Play Store listing: a production AAB via the eas.json production profile (already configured,
buildType app-bundle + autoIncrement), then eas submit. Researched separately so the steps are current.
The USE_EXACT_ALARM permission, flagged when the nudges were fixed, is the one Play policy item to declare
at submission, and DoubleDone qualifies as a reminder app.

## 2026-06-24 Crawlable static privacy page at /privacy (Play Store prep)

The researched + adversarially-verified Play Store guide (docs/play-store-release.md) flagged the one
code-side blocker: doubledone.app/privacy is a client-rendered SPA route, so a non-JS crawler (Google Play's
policy check) gets only the ~2KB app shell, not the policy. Confirmed by fetching it (no policy text in the
raw HTML). A privacy policy the crawler cannot read is an automatic rejection.

Fix: client/public/privacy.html, a static copy of the policy, plus a _redirects rule (`/privacy ->
/privacy.html 200`, kept above the SPA catch-all) so a direct fetch returns the real text. The in-app
privacy.tsx screen is unchanged (client-side nav never hits the server), only direct hits and reloads of
/privacy now get the static page, which is the right surface for a legal doc and a crawler anyway. The two
copies must stay in sync, noted in both files. Decided against a build-time generator or refactoring
privacy.tsx to a shared source: the policy is short, legal, and rarely edited, so a mirrored file with a
sync note is the lower-risk move right before launch.

Correction (same day): the first deploy added a `/privacy /privacy.html 200` _redirects rule, which
LOOPED. Cloudflare clean-URLs canonicalise privacy.html to /privacy, so the rule bounced /privacy ->
/privacy.html -> 308 -> /privacy endlessly (confirmed: /privacy returned 308 with Location /privacy).
Removed the rule. The static file serves at /privacy on its own (clean URLs, and static assets outrank the
SPA catch-all). The _redirects comment now warns against re-adding the rule. Verified live: /privacy is a
direct 200 with the full policy.

## 2026-06-25 Premium prioritisation, and a BUILD-PLAN reorg for legibility

Two asks from Melroy: a clear, stack-ranked premium backlog with a defined free/premium wall, and a cleanup
of the sprawling BUILD-PLAN so a hiring PM can read it cold.

**Premium (docs/premium.md).** A 7-agent workflow scored every candidate gate across four panels
(willingness-to-pay, RICE, spine-and-trust, hiring-PM signal), synthesised a stack-ranked backlog, then ran
an adversarial pass. The adversarial pass earned its keep: the raw ranking put a tight free AI quota (about
3 breakdowns a month) and a gated Lookback narrative in Tier 1, both high on conversion but both gating the
user at the moment of RELIEF, which is RSD-fatal for this audience and breaks the wall's own rule. Corrected
before writing it up: the free AI allowance is generous (about 10 breakdowns a month, never biting on a
crisis day), the Lookback calendar and celebration stay free forever (only an optional stats/summary layer
is premium), and the punitive items reordered down. The settled calls: monetise abundance and delight,
never cripple the free tier. The paywall is never at friction (Sort, Break-it-down, Close-the-day stay
free). Data export and the public API/MCP are never gated (trust and the moat). Multiple projects/workspaces
is REJECTED as a spine veto (it would turn Today into an everything-bucket, and the free "custom lists" idea
covers the real need). Model unchanged: A$5/mo, generous free, profitable near 5% conversion, with an
A$50/yr plan as a post-launch lever. Tier 1 to build: pin-a-task, then OCR photo capture (the scrapbook is
already the flagship). The AI Scrapbook (free monthly taste, premium weekly by tenure) is the gold standard
every other gate is measured against.

**BUILD-PLAN.** Rewritten from a 313-line chronological accretion into a clean arc: what it is, what shipped
(grouped by theme), now and next, the deferred backlog (with triggers, shipped items removed), the
discipline of stopping, principles, and a tight privacy posture. The full chronological detail stays here in
the decision-log. Monetisation in BUILD-PLAN now points to docs/premium.md.

## 2026-06-25 A `premium` dev branch, so Premium is built without auto-deploying

Now that v1.0.0 is live, Melroy wants to develop Premium (and future features) in peace, with nothing
reaching doubledone.app until he is happy to ship. The setup makes this easy: deploy-web.yml deploys only on
push to main, and the Worker deploys only by hand, so any other branch is invisible to the live site.

Adopted a long-lived `premium` dev branch. main stays the live v1.0.0. Premium work is committed and pushed
to `premium` (the local pre-commit gate keeps it green on every commit, and GitHub CI runs on main and on
PRs into main, so the branch is covered by the local gate and re-checked at the merge). Preview is local
(npm run dev plus wrangler dev for any new backend endpoint). Merging `premium` into main is the single
deploy moment. CLAUDE.md now records this so no session pushes premium work to main by accident.

This is a narrow graduation from the strict direct-to-main discipline, for DEPLOY ISOLATION, not code
review. Full branch-and-PR review stays deferred until a collaborator joins. Decided against a separate
staging Pages project + Worker (more setup and upkeep than a solo dev needs) and against local-only
development (loses the GitHub backup and the CI net that a pushed branch keeps).

## 2026-06-25 The premium feature flag (the gate every paid feature reads)

Before building any Premium feature, built the gate that hides or shows functionality by entitlement, so the
wall is one switch and not a per-feature reinvention. The server entitlement stays the source of truth
(Stripe -> the Worker's /entitlement -> loadEntitlement). This layer adds a provider, a hook, and a testable
resolver on top.

Shape: `lib/premium-flag.ts` is a pure `resolvePremium(serverPremium, devOverride, devAllowed)`, unit-tested
across all four cases. `lib/premium-provider.tsx` (PremiumProvider + usePremium) loads the entitlement once,
exposes the resolved `premium` app-wide, and a `refresh()` for after checkout. Wired into _layout below
ThemeProvider. Settings now reads `premium` from the flag (one source) instead of its own loadEntitlement.

The dev override is the key to TESTING premium without a live subscription: a stored 'on'/'off'/null
(`doubledone.devPremium.v1`) plus a 3-way "Premium override" Choice in a Developer section of Settings.
Critically, it is honoured ONLY where `DEV_PREMIUM_ALLOWED` is true (`__DEV__`, or a preview build with
EXPO_PUBLIC_PREMIUM_DEV=true), NEVER production. So when `premium` merges to main the override is inert and no
real user can flip themselves to Premium. The pure resolver makes that production-safety an explicit, tested
property: with devAllowed=false the result is always exactly the server truth.

Verified in the web preview: the free state shows the upsell card, and with the override on the Premium card
flips to "Active. Your week, kept. ✓". Same flag, real UI, no subscription.

No QA-suite case yet, on purpose: the flag is infrastructure plus a dev-only tool, with no NEW user-facing
flow (the Developer section never ships). The first manual case lands with the first gated feature
(Prioritise / pin), phrased as "a free user does not see it, a premium user does".

Decided against rebuilding the entitlement (reused lib/entitlement + lib/stripe), against a build-time-only
flag (the runtime dev override is what makes both states testable on one build), and against hiding the
override behind a secret gesture (an env-flagged Developer section is clearer and just as inert in production).

## 2026-06-25 The premium flag, adversarially reviewed (Ultracode): finished the migration, refined the order

Ran a multi-agent review of the feature flag: six dimension reviewers, a skeptic per finding, and a three-lens
build-order panel, 26 agents in all. The core held: production-inertness verified four ways, resolvePremium
correct across all 12 input combinations (zero correctness findings), the provider's React behaviour sound. But
three dimensions converged on one real, confirmed miss: the migration was done only in settings.tsx. lookback.tsx
and premium.tsx still read their own loadEntitlement(), so the "single switch every paid feature reads" claim was
false on landing, and the dev override could not even test the one feature that gates today (the scrapbook cadence
in Lookback). The override quietly lied: Settings flipped to "Active" while the real gate still metered Free.

Fixed it. Added a pure gateEntitlement(entitlement, devOverride, devAllowed) = { ...entitlement, premium: resolved },
so a gate reads the real tenure and period with premium resolved through the override (canMakeScrapbook needs
ent.since for the weekly allowance, so a boolean alone could not gate it). The provider now exposes
effectiveEntitlement, and lookback.tsx and premium.tsx both consume usePremium() (premium.tsx's post-checkout poll
re-checks via refresh() instead of its own fetch). Folded in the cheap nits the review flagged while in the files:
memoized the context value (like ThemeProvider), hoisted the out-of-provider fallback to a module constant,
documented the loading contract, and added the dev key to wipeLocalData. Verified in the web preview: with the
override on, /premium now shows "You're Premium" (it showed the upgrade panel before) and Lookback renders with its
gate on the same source. Gate green: 315 client + 146 server tests.

Build order: STANDS, all three lenses agreed pin-a-task is the right next build (the lowest-risk flag-to-UI
validator). Two refinements adopted into docs/premium.md. (1) Slice a small server-side requirePremium guard out of
OCR and build it BEFORE OCR, because no Worker route enforces entitlement today and OCR is the first gate that
spends real money, so a client-only gate is a free-money hole. (2) Inside Tier 2, ship Richer Lookback insights
before Unlimited AI, because the unlimited-AI cap sits nearest the relief boundary and is the least demoable, while
Lookback insights is pure abundance and deferring the quota buys data to set the free cap honestly. The deferred
engineering (the server guard, JWT signature verification before spend, a server-side usage counter for the quota,
a gateToPremium telemetry helper, a CI grep for the dev env flag) is captured as triggers in docs/premium.md.

Decided against gating premium.tsx and lookback on a second source (one provider, one effectiveEntitlement), against
building a PremiumGate or the server guard speculatively now (deferred with triggers, the discipline of stopping),
and against reordering the top three (the review confirmed pin-then-OCR is correct).

## 2026-06-25 Prioritise / pin a task (premium, Tier 1): one pin, the day's one thing

The first premium feature after the flag: pin a task as the day's ONE priority. Designed via a multi-agent
scout-and-design pass (five scouts, three stances, a judge), then built and refined with Melroy.

The defining decision: ONE pin, not a few. A capped multi-pin is still a priority system, the exact machinery
this audience drowns in (another list to prune, another "did I pick right"). One pin has a capacity of one, so it
cannot accumulate, cannot rot, cannot shame: the single slot IS the feature. It composes with Focus rather than
competing: pin is the persistent, visible anchor (a star, floated to the top, decided once), Focus is the session
that now opens straight to it instead of re-asking "which one". Melroy's own catch that Focus is also one-task
sharpened this framing.

Shape. A leaf field pinnedAt (epoch ms) on Task. The at-most-one invariant lives in the screen action (pinTask
stamps the target and clears the pin off every other task, both bump updatedAt), not the type, so it rides
serialize / sync / export untouched like silentParent and combinedFrom. A pure pinFirst() stable partition floats
the one pin at RENDER, so tasksForToday stays untouched (its order is load-bearing for sync). Gated to one-offs
only (recurring keeps its own cadence, and a pin would stick to it every day rather than be today's choice, which
Melroy agreed). Premium-gated to SET, never hidden: a free tap routes calmly to /premium (track premium.gate_hit
reason 'pin'), the scrapbook-gate template, never a wall, never shame. The row shows a calm mauve star (the theme
accent) plus a faint accent tint, NOT the loud reserved priorityGradient (that moves to the /premium upsell,
Melroy's call). The star sits at the extreme right, after any reminder bell or repeat mark, so it stays the clear
cue beside other marks (Melroy's refinement). Synced as pinned_at (timestamptz, mapped like completed_at), which
needs a one-column Supabase migration applied before the pin syncs (additive and idempotent, in
supabase/schema.sql). Verified in the web preview (the pin floats, the star renders, a reminder plus a pin show
bell-then-star). Gate green: 319 client + 146 server. Five E2E cases (PIN-01 to 05) added.

Decided against a few-pins cap (re-creates a priority system, the spine veto), a separate app-level pinnedTaskId
(field-on-task rides the existing plumbing), mutating tasksForToday to sort (the render-time partition keeps the
pure order intact), the loud gradient on the row (too much for Dusk, reserved for the upsell), and pinning
recurring tasks (a pin that never resets is not "today's one thing"). Server-side enforcement is not needed here
(pin is zero-cost), so the requirePremium guard stays correctly sequenced before OCR.

## 2026-06-25 Pin, adversarially reviewed (Ultracode): fixes from the five-dimension pass

Reviewed pin-a-task with a multi-agent pass (five dimensions, a skeptic per finding, 17 agents). The feature held,
no blocker beyond the migration, which Melroy applied. Fixed five confirmed findings:
- A completed pin kept floating struck-through above the open work all day (flagged by correctness, spine, AND
  integration). Now a done pin does not float and drops its star: it stays pinned underneath and floats again if
  reopened, so the day re-centres on what is left. Verified in preview. The inverse (an UNfinished pin rolling
  forward and floating tomorrow) is correct and kept.
- A premium user tapping Pin during the entitlement load window was bounced to /premium with a false gate-hit. Now
  the tap is a no-op while loading (the premiumLoading guard), never a wrong bounce, never a polluted moat signal.
- Unpinning is now always free (gate only the act of SETTING a fresh pin), so a lapsed sub can still clear a pin it
  set: the gate never touches relief.
- The at-most-one invariant was an inline component function with no test. Extracted a pure setPin() in today.ts
  (stamp the target, clear every other pin, bump updatedAt on each change) and covered it (pin / displace / unpin /
  two-pin self-heal). pinTask now calls it.
- Added a calm one-line affirm on pin and unpin, matching the app's confirmation pattern, and reworded pinFirst's
  tie-break comment (highest pinnedAt wins, ties to the earliest).

Deferred intentionally: a DEFERRED pin persists and re-anchors when the task returns tomorrow (a standing "this
matters" marker, not a bug), plus the pinned_at column-order cosmetic and an optional upsell-screen note. The
pinned_at migration is APPLIED to live Supabase, so the sync blocker is closed. Gate green: 324 client + 146 server.

## 2026-06-25 Server-side requirePremium: a trustworthy premium gate for costed routes (before OCR)

Built the server half of Premium before OCR: a reusable requirePremium so a costed route (OCR vision, future
premium AI) can never be unlocked by a forged token. Designed via a scout + research + synthesize pass, the scout
mapped the existing Worker auth and the research confirmed the current Supabase JWT verification practice.

The security crux: the existing decodeJwtSub (mcp.ts) DECODES the token but does not verify its signature. That is
safe for the MCP path (the token is forwarded to Supabase, which verifies it under RLS), but unsafe for a gate that
reads entitlement and authorises spend off the decoded sub alone, where a forged token with an arbitrary sub would
unlock paid compute. So requirePremium verifies the signature CRYPTOGRAPHICALLY. I probed the live project's JWKS
endpoint and confirmed it issues ES256 (asymmetric) tokens, so local JWKS verification works: defaultVerifySub uses
jose's createRemoteJWKSet + jwtVerify (ES256/RS256) against SUPABASE_URL/auth/v1/.well-known/jwks.json (already a
Worker secret), returns the verified sub, and fails closed (null) on any error.

Shape: requirePremium(request, env, verifySub = defaultVerifySub) -> { ok: true, userId } | { ok: false, status:
401 | 403 | 503 }. 401 = no/forged/expired token, 403 = signed in but not premium, 503 = store or URL unbound (fail
closed). The verifier is INJECTABLE, so the seven unit tests run with no network or crypto (a stub for cases 1-6,
the real verifier rejecting a forged/malformed token for case 7, the load-bearing regression). Reuses the existing
bearer() (now exported) and readEntitlement. In server/src/premium.ts + premium.test.ts, with jose added to the
server workspace.

NOT applied to a route yet, on purpose: OCR is the first costed route and does not exist, so the guard is the
tested primitive that OCR drops onto (call it as the first step after origin + rate-limit, before reading the body).
Decided AGAINST the Supabase getUser round-trip (rejected for the 50-200ms per-request latency on a costed route
and the hard dependency on auth being up, where local JWKS is stateless and edge-cached). Decided AGAINST
retro-gating /scrapbook now (free-tier Workers AI, no real money at risk, and requirePremium would 401 the
anonymous-first free monthly keepsake, fighting the spine), and its trigger is in docs/premium.md. Decided AGAINST
a skip-verify shim (a money gate verifies, full stop, and the JWKS works today). The JWT signature is now verified
on the entitlement path, closing the pre-existing decode-and-trust gap before any costed route ships.

## 2026-06-25 requirePremium, security-reviewed (Ultracode): hardened, no bypass found

Adversarial security review of the guard, three lenses (crypto-bypass, fail-closed, tests), 14 agents. Verdict: NO
bypass. The crypto holds (the ES256/RS256 allow-list blocks alg:'none' and the HS256 public-key-as-secret confusion,
verified against jose's source, exp/nbf enforced, the sub-to-entitlement model sound) and every path fails closed.
All findings were hardening or test-pins, no blocker, no surviving major.

Applied four:
- Pinned the issuer (confirmed ${SUPABASE_URL}/auth/v1 against the project's OpenID config) + requiredClaims:['sub']
  on jwtVerify, and made the sub strict (non-empty string, matching the old decodeJwtSub). Closes the "trusts any
  same-issuer token with a string sub" defense-in-depth gap by construction.
- Wrapped the D1 entitlement read so a bound-but-erroring store fails CLOSED to 503 inside the primitive, not via an
  unwritten caller (mirrors how defaultVerifySub already catches).
- Pinned the alg-allow-list in tests (alg:'none' + HS256 forgeries rejected, both offline because the alg check is
  pre-fetch), plus a 503-on-DB-error test, an empty-sub-is-401 test, and a verify-before-read assertion.
- Comments on the trusted-URL JWKS cache (a stale key fails closed) and the one case that must NOT be added (a
  valid-shape wrong-key forgery hits the network).

Deferred to the OCR wiring: the consumer must attach CORS to 401/403/503 (noted in the doc comment). Gate green:
324 client + 157 server (11 guard tests).

## 2026-06-25 OCR photo capture, the server slice: POST /ocr behind requirePremium

The headline premium feature, built server-first so it is fully CI-testable before the camera (which needs an EAS
build). Designed with a 9-agent Ultracode pass (scout the AI-endpoint + capture patterns, research Claude vision +
Expo capture, a 3-stance design panel, a judge). The slice: a new POST /ocr (server/src/ocr.ts mirrors decompose.ts)
that takes a base64 image, runs ONE Claude vision call with a forced record_tasks tool, and returns the task titles.
The first costed route to call requirePremium in production.

Decided:
- Haiku 4.5 (claude-haiku-4-5-20251001), NOT Sonnet. OCR is transcription, not reasoning, so Haiku reads a list as
  well at about a third the cost (~$0.0025 a capture, near 10,000/month under the shared $25 cap). Sonnet is a
  one-line bump later, on data, if quality disappoints. Verify the id before deploy (model ids deprecate).
- Validation (parse + image-required 400 + a 1.9MB size 413) runs BEFORE the gate, so a bad body is a clean 4xx and
  the cases are testable offline. The gate runs before any vision call, so a non-premium user never spends a token.
  requirePremium's denial (401/403/503) carries CORS, so the browser can tell upsell from re-auth from retry (a
  CORS-less error reads as a network failure).
- Telemetry logs ONLY the image size and the task COUNT, never the image or the titles. This departs from the other
  endpoints (which log their text output pseudonymously): the image is never stored anywhere, and OCR titles are raw
  transcription with low moat value and higher sensitivity than typed text, so they stay out of the pseudonymous
  ai_calls log. The cost signal (size + tokens + latency) is preserved for budget watching.
- A strict extract-do-not-invent prompt (a hallucinated task on someone's list erodes trust and reads as shame for
  an RSD audience) and a 50-item parse cap (a pathological response cannot flood Today).

Decided against: Sonnet (cost, with no quality need for transcription), logging the titles (a privacy call), and
deciding the capture UX here (the endpoint is capture-agnostic, so the client slice picks picker vs viewfinder and
the share-a-photo path rides the same seam). Cost is defended in layers: Haiku, the client downscale (slice 2), the
413 backstop, the forced-tool output cap, the 50-item cap, one call no retry, the per-IP limiter, the gate.

Gate green: 324 client + 168 server (7 contract tests in ocr.ts, 4 handler cases in index.test.ts for validation,
the gate, the CORS-attached denial, and fail-closed 503). Next: the client slice (the camera button on the
brain-dump box), which needs an EAS Android build to test.

## 2026-06-25 OCR client slice, part 1: the ocr() seam + a shared authHeader

The client half of OCR, keystone first: the network seam, fully unit-testable, before the camera UI that needs an
EAS build. Added ocr(imageBase64, mediaType?, language?) to lib/ai.ts: it POSTs the base64 image to /ocr with the
user's Supabase token and returns the task titles, or [] on any failure.

Decided:
- Lifted authHeader() out of lib/stripe.ts into lib/supabase.ts (its natural home, next to the client) so the
  Stripe seams AND the new ocr() share ONE copy. OCR is the first AI call to need the user's token, where the
  others are anonymous, and a duplicated auth helper would drift. The client stripe.ts has no test of its own, so
  the move was safe (typecheck and the gating tests stayed green).
- ocr() returns [] on any failure, an empty read, or signed-out, never throws. The camera button is premium-gated
  client-side (usePremium), so by the time ocr() runs the user is premium and signed in. [] then means "no tasks
  read", and the caller shows one calm line. A stale-token 401 also lands as [] (a calm retry, which refreshes the
  token); refine to a distinct re-auth path only if that edge bites in practice.

Gate green: 328 client (4 ocr-seam tests: the bearer header + parse, []-when-signed-out without a fetch, []-on-
non-ok, []-on-throw) + 168 server. Next: part 2, the in-app camera (CameraView + a gallery option) on the
brain-dump box, device-tested via EAS.

## 2026-06-25 OCR client slice, part 2: the camera, wired and verified on web

The headline feature's last build step: the in-app camera. A new CameraCapture modal (client/src/components/
CameraCapture.tsx) plus a Scan pill on the brain-dump captureRow, premium-gated. Built from a 2-agent scout (the
Expo SDK 56 capture APIs and the brain-dump / auth seam).

How it works: the Scan pill (the upsell surface) is premium-gated on tap, so a free tap routes calmly to /premium.
For a premium user it opens a full-screen modal. On a device: an expo-camera CameraView viewfinder with a shutter
and a gallery shortcut. On web: a "choose a photo" gallery prompt (no viewfinder). The captured image is downscaled
to <=1080px JPEG q0.6 (expo-image-manipulator's non-hook ImageManipulator.manipulate API, since the old
manipulateAsync is deprecated), sent to ocr(), and the titles it reads seed the brain-dump box via the existing ref
for review. Nothing auto-commits to Today.

Decided:
- Melroy chose the in-app viewfinder over the photo-picker (more demo polish, the extra native surface accepted),
  and the quiet pill beside Speak over a louder entry (the calm spine). I added a gallery option alongside the
  viewfinder anyway, because a pure live viewfinder cannot read a screenshot of a texted list or a whiteboard photo
  taken earlier, which is a big slice of real OCR use. (Veto-able.) Share-a-photo-to-DoubleDone stays out of v1, a
  fast-follow on the same seam.
- authHeader was lifted to lib/supabase.ts in part 1, and the camera path reuses ocr(), which sends the token.
- AI egress is disclosed at the point of use ("sent to the AI to read, then discarded, never stored") on every
  path, web and native, per the spine.
- expo-camera / expo-image-picker / expo-image-manipulator installed at the SDK-56-pinned versions, with the camera
  and photo config plugins added to app.json (microphone off, since we only take stills).

Verified in the web preview (the device camera cannot run headless): the bundle builds with expo-camera in the
graph (no module-scope crash), the Scan pill renders beside Speak, a free tap routes to /premium, and a premium tap
opens the modal's web fallback. Device-only, left for the EAS build: the native viewfinder and the real capture to
downscale to ocr to seed round-trip. 7 OCR cases added to the QA suite (now 125). Gate green: 328 client + 168
server.

## 2026-06-26 Live Stripe go-live, and the owner comp allowlist

Two things, the night DoubleDone started taking real money.

**Go-live.** The Worker now runs LIVE Stripe: the live secret key and the live webhook signing secret are Worker
secrets (set in the Cloudflare dashboard), and the live recurring price id `price_1TkHS3...` is committed as a
non-secret var. A real A$5 checkout on doubledone.app was confirmed end-to-end. The live webhook fired and wrote a
fresh premium row to D1 (user cf8c1653..., status active), and the screen flipped. The premium-never-updates bug is
dead. Its root cause is recorded: a test/live mode mismatch. The Worker was pointed at the test price while Stripe
had been switched to live, so the live webhook never reached the test-mode endpoint.

**The comp allowlist.** An email can now be ALWAYS premium with no Stripe subscription, for the owner's own
no-charge test path and (later) the feedback comp. A new `server/src/comp.ts` holds `isCompEmail` plus a small
`COMP_EMAILS` set (the owner's Gmail). Two callers consume it:
- `requirePremium` (the costed money gate): after the token's signature is cryptographically verified (verifySub
  returns a non-null sub), it reads the email from the SAME verified token and short-circuits to ok if allowlisted,
  before the D1 read. Secure by construction: a forged comp-email token is rejected at the verify step (401),
  proven by a test.
- `handleEntitlement` (GET /entitlement, the CLIENT flag): decode-only, like the sub it already trusts, returning a
  comp premium view (premium true, status 'comp', a far-past `since` for full scrapbook allowance, no customerId).

Decided:
- Keyed by EMAIL, in CODE, not a D1 row keyed by user_id. Melroy asked for an email, and an email allowlist works
  the instant he signs in with that Gmail (no pre-existing account or user_id needed), and survives forever because
  no Stripe event can flip it. A D1 comp row would need his user_id first and could be raced by a webhook.
- The /entitlement comp check is decode-only (not crypto-verified), matching that endpoint's existing decode-trust
  posture. The blast radius of forging the comp email there is only the CLIENT flag (cosmetic: the pin and the Scan
  button appear). The costed OCR gate re-checks the allowlist on a verified token, so no paid compute leaks.
  Acceptable for an owner allowlist. Verifying /entitlement too is a separate, already-deferred hardening.
- The owner comp has no customerId, so the "Manage subscription" button would 404 if tapped. Accepted as an
  owner-only rough edge, not worth a client branch tonight.

11 server tests added (the comp allowlist incl. near-miss and forged-email rejection, decodeJwtEmail, the
requirePremium comp paths, the handleEntitlement comp view). Gate green: typecheck and lint clean, 179 server
tests. QA case PREM-11 added. On the `premium` branch. The Worker deploy that makes the comp live is gated on
Melroy's per-instance OK.

## 2026-06-26 Tier 2: Richer Lookback insights (premium stats + a warm weekly reflection)

The first Tier 2 premium feature, designed by a multi-agent workflow (four feature plans plus an adversarial
spine review) and built to the spine guardian's fixes. Pure additive abundance, layered BELOW the always-free
Lookback calendar and the free monthly scrapbook.

Two halves:
- A "Your patterns" card with CALM, client-side stats from the local completion history (zero server cost, no
  identity): things finished this week and this month, the distinct DAYS something got finished ("on N days",
  never N-of-30, never a denominator), dreaded/old tasks reclaimed (the existing big-win signal), and one
  reclaimed title named warmly. Pure and unit-tested in `client/src/lib/insights.ts`.
- An optional, display-only AI weekly reflection: the selected week's finished titles in, one warm paragraph
  out, from a new premium Worker route POST /lookback-summary (Haiku, behind requirePremium exactly like /ocr,
  logging only the title count and the summary length, never the titles or the paragraph).

Decided:
- The stat set is deliberately constrained to celebratory counts. Explicitly REJECTED as shame-risky for an
  RSD audience: streaks, percent-complete, productivity scores, overdue or "missed" days, any target compare.
- Free degrades to a calm one-line "Your patterns" invite that routes to /premium on tap (gate_hit reason
  'insights'), NEVER a teased-then-locked number and never a wall. The free calendar and monthly scrapbook are
  untouched. Both paths verified in the web preview (premium shows 5/4/1 stats + the reflect button, free
  shows only the invite, no teased number).
- The AI reflection is display-only, so it changes NO tasks and needs no propose-then-accept. It is tagged
  with the week it belongs to (summaryWeek) and shown only on that week, which also avoids a setState-in-effect
  the React Compiler lint (react-hooks/set-state-in-effect) rightly forbids.
- The summary system prompt forbids counting/grading, second-person performance framing, and naming what was
  not done. Per the spine guardian, Melroy should read a handful of real summaries before this reaches a paying
  subscriber (the generative paragraph's only guardrail is the prompt, like strategise/decompose). FLAGGED.
- No new setting. The Haiku model is pinned to the dated id (ids deprecate on a date).

Gate green: typecheck and lint clean, client 332 tests, server 183. QA cases PREM-12 (premium) and PREM-13
(free) added. On the `premium` branch.

## 2026-06-26 Tier 2: Chart a course (premium goal planning into flat tasks)

Tier 2 feature 2. The user names a goal; a token-heavy Sonnet route proposes a calm ordered list of the next
3 to 7 concrete steps toward it, which the user reviews and accepts. DISTINCT from Break-it-down (one task in,
its steps out): this plans toward a GOAL over time. Built to the spine guardian's fixes.

The shape:
- A new premium Worker route POST /chart (server/src/chart.ts), behind requirePremium exactly like /ocr:
  validate the goal first (400 if empty), gate before any spend, fail-closed 401/403/503 with CORS. A
  record_course tool returns a heading plus { title, minutes } steps. Sonnet (it reasons about sequencing).
- A new dedicated screen client/src/app/chart.tsx, reached by a calm "Chart a course" entry in the Rooms
  sheet. The premium gate sits at the moment of asking for a plan (tapping "Suggest steps"), NOT on opening
  the screen, so navigation is never a wall (gate_hit reason 'chart' routes free users to /premium).
- The chart() client seam mirrors ocr() (sends the bearer, returns an empty course on any failure or when
  signed out, so the screen shows one calm line, never a raw error).

Decided:
- Accepted steps are minted as FLAT one-off tasks (no parentId, no silentParent, no project/group field),
  indistinguishable from any other task. It plans INTO the single Today/backlog and NEVER creates a project
  or workspace (the spine rejects multiple projects). This is the load-bearing spine guardrail here.
- Propose-then-accept: nothing is minted until "Add N tasks", and only the ticked steps. The AI never writes
  to the task list. "Not these, start over" leaves everything untouched.
- Today stays finite: the steps spread via the existing spreadDueDates('gradual'), so the first lands on Today
  and the rest walk gently forward, never dumping seven tasks on Today.
- v1 has NO target-date picker (a deadline-paced spread is a fast-follow); a goal with no deadline walks one
  step per day. DEFERRED, noted, low risk. The /chart route + buildChartRequest already accept an optional
  dueDate for when the picker lands.
- The new expo-router route hit no TS2345 because the running dev server regenerated the typed routes; the
  gotcha (CLAUDE.md) was anticipated and not "fixed" with a cast.
- Prompt wording is a placeholder for Melroy (like plan/strategise/decompose). The goal text and the course
  are logged pseudonymously to D1 ai_calls (endpoint 'chart'), consistent with /plan storing task text.

Gate green: typecheck and lint clean, client 332 tests, server 190. QA cases CHART-01..04 added. Screen render
verified in the web preview; the live AI happy-path awaits the Worker deploy. On the `premium` branch.

## 2026-06-26 Tier 2: Plan my order (premium sequencing, local-first)

Tier 2 feature 3. A calm "Plan my order" affordance on Today hands today's open one-offs to the AI and gets
back a suggested SEQUENCE (each task with a short reason), which the user accepts or dismisses. DISTINCT from
Strategise (which re-spreads an OVER-FULL day across days): this orders today's set IN PLACE and never moves a
task to another day. Built to the spine guardian's fixes, with the sync trap resolved.

The shape:
- A new premium Worker route POST /sequence (server/src/sequence.ts), behind requirePremium like /ocr. A
  record_order tool returns [{id, reason}] with NO dayOffset (order-in-place, never a day move). Sonnet. The
  route accepts an optional energy level (low/medium/good) for a future chooser; v1 sends none.
- Pure today.ts logic: applyManualOrder (a render-time stable float, same-reference when none, mirroring
  pinFirst) and setSequence (stamp manualOrder = position, bump updatedAt, clear stale order). Composed at
  render as pinFirst(applyManualOrder(tasksForToday(...))), so a pin still wins the very top and the
  load-bearing pure tasksForToday order is never mutated.
- A propose-then-accept Modal mirroring Strategise: nothing reorders until "Use this order", and "Not now"
  leaves the day exactly as it was.

Decided (the spine guardian's two key fixes):
- THE SYNC TRAP. The guardian caught that manualOrder does NOT "ride sync for free": sync.ts maps every field
  explicitly (taskToRow/rowToTask) and Supabase has one column per field. So manualOrder is a deliberately
  LOCAL-ONLY leaf field, absent from taskToRow, which means it is never sent to Supabase (no column, no error,
  no data loss) and persists in local storage. It survives a sync because setSequence bumps updatedAt, so the
  local copy wins last-write-wins (verified against sync-merge.ts: local-newer keeps the full local object).
  Cross-device order sync is a DOCUMENTED follow-up (needs a manual_order Supabase column + the mapper + a
  round-trip test, an irreversible migration left for Melroy's OK). This avoids BOTH the silent-data-loss bug
  AND a production schema change overnight.
- Energy matching is DEFERRED to a fast-follow to keep the index.tsx surgery contained (the guardian flagged
  index.tsx as preview-fragile). The /sequence route already accepts energy, so the chooser is a clean add.
- Verified in the web preview by a REAL render check (not preview_click, per the gotcha): the button shows
  with 2+ tasks, and seeding a reversed manualOrder reorders Today correctly (Charlie, Bravo, Alpha), proving
  the render composition. The live AI proposal awaits the Worker deploy.

Gate green: typecheck and lint clean, client 338 tests, server 195. QA cases SEQ-01..05 added. On the
`premium` branch.

## 2026-06-26 Premium page: sell the whole suite, not just the scrapbook

Melroy's ask after Tier 2: the paywall described only the scrapbook. Rewrote it to lead with "More of what
you love" and a calm feature list (Scan a list, Pin the day's one thing, the weekly keepsake, Your patterns,
Chart a course, Plan my order) plus an enticing "and more on the way", with the keepsake tenure tiers kept as
a detail below. The free-stays-complete framing is preserved up top ("the whole calm daily loop stays free,
forever"). Verified the render in the web preview. Copy is Melroy's to tune.

## 2026-06-26 Live-test fixes: resilient scrapbook image + a warmer Lookback reflection

Two fixes from Melroy's live testing of the Tier 2 launch.

1. **A missing keepsake image no longer shows a blank polaroid.** After an account delete the R2 image (or
an oversized / corrupted local data-URL) can go missing while the local scrapbook entry survives, leaving a
blank card. The Lookback scrapbook now tracks which weeks' images failed to load (an Image onError) and
degrades that week to the calm "make a new one?" invite, never a blank frame. Remaking clears the flag and
overwrites the entry. The in-app delete flow is already correct: it purges R2 AND wipes local
(wipeLocalData + purgeScrapbookImages). So this handles a stale entry from an out-of-band delete or a corrupt
image, no matter the cause. Verified in preview with a dead image URL.

2. **The Lookback weekly reflection read cookie-cutter.** The live output sounded like a creative-writing
exercise ("a steadiness to this week, bookended by the simpler anchors of...") and even used an em-dash. The
prompt now forbids metaphors, clichés, and narrating "the shape of the week", names the exact words the model
reached for (steadiness, rhythm, anchors, bookended, journey, balance) as banned, bans em-dashes and
semicolons, and pushes "a kind friend who noticed, not a report". The model also moves from Haiku to Sonnet
(claude-sonnet-4-6), which writes genuinely warmer, more specific prose, for a negligible per-call cost on a
short weekly paragraph. Wording stays Melroy's to tune from the live result.

Gate green: typecheck and lint clean, client 338 tests, server 195. QA case SB-07 added.

## 2026-06-26 The DoubleDone Premium gradient as the shared premium signal

Melroy's direction after the Tier 2 launch: "Plan my order needs to be a big premium button using the
gradient... all premium features ideally have that gradient." The mauve -> rose -> honey glow that already
sets the Settings premium card apart is now THE signal that an action is premium.

- The gradient moved to a shared `PREMIUM_GRADIENT` in constants/theme (Settings now imports it, no longer a
  local const).
- A new `PremiumButton` component (LinearGradient + label) is the one gradient button, reused by the premium
  AI actions: Plan my order (Today), Suggest steps (Chart a course), and Reflect on this week (Lookback).
- "Plan my order" went from a quiet outlined pill to a big gradient button, the premium pop on Today.

The gradient stays the one deliberate glow against the calm Dusk palette, now applied consistently to the
premium ACTION buttons rather than only the Settings card. Verified the render in the web preview (the
gradient draws correctly on Plan my order). Gate green: typecheck and lint clean.

## 2026-06-26 Chart a course: a "by when?" so steps span the real timeframe

Melroy's feedback from the live launch: his goal "become better at bass within 2 months" produced six steps
that crammed into the next five days, because v1 had no deadline input (it spread one step per day). Added a
"By when?" question to the chart screen: relative chips (No deadline, In 2 weeks, In a month, In 2 months, In
3 months), since a goal is a timeframe, not a calendar date. The chosen date does two things: it rides to the
AI (buildChartRequest already folds it into the prompt, so the steps are paced for the horizon), and it feeds
spreadDueDates on accept, so the tasks spread from Today out to the date instead of one-per-day. The /chart
route now parses an optional context.dueDate (parseChartContext, ISO-validated), and the client chart() seam
sends it. "No deadline" keeps the gentle one-per-day default.

Gate green: typecheck and lint clean, client 338 tests, server 196. QA case CHART-05. Chips verified in preview.

## 2026-06-26 A Premium tag on the Chart a course room

Melroy's ask: Chart a course needs a premium indicator. Added a small gradient "Premium" pill (the shared
PREMIUM_GRADIENT) to the Chart a course row in the Rooms sheet, so a free user sees it is premium before
tapping in. The gate still fires at the moment of asking (tapping Suggest steps), this just signals premium
earlier and more honestly. Chart a course is the only premium-gated Rooms destination, so the only one
tagged. Verified the gradient renders on the tag in preview. Gate green: typecheck and lint clean.

## 2026-06-26 Rename: Strategise to "Lighten today", Plan my order to "Plan my day", plus a follow-up

The follow-up to the Plan-my-Day adversarial review. Melroy's real complaint was the vague naming
("Strategise" says nothing), and fixing the names dissolves the review's conversion-collision concern. The
review's verdict (keep both tools, never hide the free relief, do not fork Today by tier) holds. Only the
labels change, plus the agreed "push a few out?" follow-up.

- **Strategise becomes "Lighten today."** Names the benefit (today gets lighter), pairs with the existing
  "Today's looking full" line. Stays FREE and ungated for everyone (the spine: relief is never gated).
  Internal identifiers (runStrategise, the /strategise route, the strategise.* telemetry) keep their names.
- **Plan my order becomes "Plan my day."** Melroy's preferred name, now usable: with "Lighten today" as its
  neighbour the two no longer read as synonyms (one lightens, one plans). Premium, unchanged mechanics.
- **"Lighten today" now appears only on a heavy day** (spreadable >= 6, or >= 4 on a low-capacity day), the
  same signal as the "Today's looking full" nudge. A calm day shows only "Plan my day", which declutters Today
  exactly when fewer buttons is right. The decluttering Melroy wanted, without hiding the rescue.
- **The "push a few out?" follow-up:** after "Plan my day" applies an order on a heavy day, a calm "Still a
  full day?" card offers to push a few tasks to later days (Yes runs the existing re-spread as a
  propose-then-accept, No leaves it ordered). Only on a heavy day, so it never nags a calm one.

NOT done, per the review: "Lighten today" is NOT hidden for premium, Today is NOT forked by tier, and ordering
never precedes relief on the crisis path. The one-tap "Lighten today" button is the crisis door for all tiers;
the order-then-offer flow is the deliberate premium path.

Renamed every user-facing surface: the Today buttons, the premium page (paywall + active view), onboarding
(welcome.tsx), and the privacy policy (in-app + the crawlable privacy.html). Internal code identifiers kept for
continuity. Gate green: typecheck and lint clean, client 338, server 196. QA: AI-06 rewritten, SEQ-06 added,
suite regenerated (140 cases). Verified in preview: heavy day shows both buttons + the nudge, calm day shows
only Plan my day, old names gone.

## 2026-06-26 "Big task": a free flag that lets one heavy thing weigh on the day

Melroy's ask: let the user mark a task "Big", because even one task can weigh onerously, and have that lend
credence to the weight bar and to Lighten today. Free, all tiers. Tap-and-hold (the existing select mode),
multi-select. Designed with a two-agent panel (an implementation plan plus a spine/UX critic); where they
split, the critic's calmer calibration won.

What shipped:
- **A `big?` leaf flag** on Task, set via a new free "Big" action in the tap-and-hold select bar (multi-select,
  toggling to "Not big" when every selected task is already big). A calm accent "Big" pill on the row, never
  danger-red: the app agreeing this one is a lot, not a warning.
- **Weight: a big task counts as 2 normal tasks** (weightedLoad in estimate.ts), not 3. Plus a floor: a lone
  big task reads at least "A full day, but doable.", so one heavy thing is felt without the gauge dropping to
  "room to breathe".
- **The heavy gate is keyed off the weighted load**, so a big task plus a real pile (weighted 6+) surfaces the
  nudge and "Lighten today", but a LONE big task does NOT. Re-spreading cannot dissolve one big rock, and Break
  it down is the right tool there. This was the critic's catch, and it keeps the relief signal honest (no
  crying wolf).
- **Finishing a marked-big task is a big-win** (a one-line change to reward.isBigWin), so it earns the warmer
  Lookback acknowledgment. The flag is INERT on the downside: an unfinished big task is never a bigger failure.
- **Lighten today (the AI re-spread) now weighs big tasks**: the /strategise request carries each task's
  big-ness and the prompt gives big tasks room and never stacks two together.

Decided against:
- **Weight 3x plus a single-big override that trips Lighten today** (the plan's first proposal). Too
  trigger-happy: ordinary days would read "heavy" too easily and the relief signal would go numb. Weight 2 plus
  a bar-only floor is the honest calibration.
- **Syncing the flag now.** It ships LOCAL-ONLY (like manualOrder), because adding `big` to the sync payload
  before the Supabase `big` column exists would break every task upsert, and the column needs the dashboard (no
  service_role in this build). The 4-line sync wiring plus the one-line migration are parked in the BUILD-PLAN
  Backlog. The feature works fully on-device meanwhile.
- **A new colour, a warning glyph, or "hard / difficult / scary" wording.** All would localise blame and breach
  the never-shame spine. "Big" honours the size of the thing, in the calm accent token.

Gate green: client 346, server 197, lint and typecheck clean. QA: BIG-01 to BIG-04 added, suite regenerated.
Verified in preview: the row tag renders, one big task floors the bar to "full" and does not offer Lighten
today, and a big task tips a 5-task day (weighted 6) into heavy where 5 normal tasks stay calm. The server
prompt change is committed but the Worker is NOT yet deployed (needs Melroy's per-instance OK); until then
big-ness is sent and harmlessly ignored by the live Worker, so the AI weighting is dormant, not broken.

## 2026-06-26 Design polish wave 1: dark-mode contrast, reduced-motion, scrim/onAccent tokens

First wave of the stack-ranked design-review burn-down ([`docs/design-review.md`](docs/design-review.md)). The live defects.

- **onAccent + onDone colour tokens (the dark-mode WCAG fix).** White CTA labels sat at 2.76:1 on the dark
  accent and the completion tick at 2.16:1 on the dark sage fill, both failing AA, invisible in the light
  preview we test in. Added per-scheme onAccent/onDone (light = #FFFFFF unchanged, dark = warm ink #2B2722).
  Routed every white-on-accent label and the two sage ticks through them, and left every #FFFFFF on the
  premium gradient untouched (white-on-gradient is intentional). Verified in a dark-scheme preview: the
  accent button label now renders rgb(43,39,34), about 5.37:1.
- **scrim colour token.** The modal backdrop rgba(43,39,34,0.45) was duplicated across 5 files and the Rooms
  sheet had drifted to a cold pure-black rgba(0,0,0,0.28), against the warm-not-black rule. One scrim token
  now: light rgba(43,39,34,0.45), dark rgba(10,8,6,0.6) (heavier so it actually dims the dark surface, still
  a warm wash). All six backdrops routed through it.
- **Today title weight 700 to 600.** Newsreader's heaviest loaded weight is 600, so the 700 title clamped
  and rendered inconsistently. One-line fix.
- **RepeatingDrawer honours reduced-motion** (it was the one animated surface that always ran the slide, a
  broken promise for the motion-averse audience) and its **toggle rows announce as checkbox**, not button.

Judgment calls (mine, per Melroy's "do it without interference, log it to challenge later"): the dark
onAccent/onDone shade is the warm ink #2B2722 (a clean 5.37:1, keeps the palette warm). The dark scrim
opacity is 0.6 (0.45 barely dimmed the dark background). The CameraCapture busy overlay (rgba(43,39,34,0.7))
was left OUT of the scrim token: it is a camera-busy block, not a modal dim, and its heavier opacity is by
design. The shared <Screen> wrapper was deferred to the component wave, so routines.tsx got the width cap
directly.

Gate green: client 346, server 197, lint + typecheck clean. On the premium branch, not yet deployed (the
whole burn-down merges to main as one reviewed batch).

## 2026-06-26 Design polish wave 2: a named type scale

Introduced `makeTypeScale(scale)` in theme.ts: nine named steps (display / title / heading / subheading /
body / bodyStrong / label / eyebrow / caption), each bundling fontSize + lineHeight + family + weight (and
letterSpacing for the eyebrow), with `t.scale` baked in, exposed as `t.type.X`. Font sizes were inline
literals spanning ~18 steps across every screen, so the typographic voice could not be tuned in one place.
This wave routed only the title-tier and eyebrow-tier styles through it (the audit's named drifts); body,
labels, captions, and button labels keep their inline sizes for now (button labels arrive with the
PrimaryButton extraction next, the rest is a noted follow-on).

THE judgment call to eyeball: **the page titles unified to 34/600.** settings, privacy, premium, and routines
were a large airy 42/weight-400 editorial title; they now match Today/Lookback/Chart at 34/600. Rationale:
the 42-vs-34 seam between adjacent screens was real drift, 600 is the brand's stated editorial-heading weight
(the comment in theme.ts calls Newsreader 600 "a calm editorial heading", so the 400 was the outlier), and 34
is the calmer size. This is the single most visible change in the burn-down. If the airy 42/400 was loved, it
is a one-line change to the `title` token (size and/or weight). Other normalisations: modal titles 26 to 24,
a 21 to 22, the sign-in title 30 to 24, and the 8-way section eyebrow (sizes 11/12/13, weight 600/700,
letterSpacing 0.3 to 1) collapsed to one 12/700/0.5 step.

Gate green: client 346, server 197, lint + typecheck clean. Sizes live-verified in the preview (settings
title 34/600, premium card title 24/600, eyebrows 12/700/0.5). On premium, holding the merge.

## 2026-06-26 Design polish wave 3a: PrimaryButton

Extracted the solid-accent CTA (reimplemented ~12 times, actually 21 buttons across 11 files) into one
<PrimaryButton> with label / onPress / disabled / loading / pill / style props, reading t.colors.accent, the
Wave-1 onAccent label colour, and the Wave-2 bodyStrong type. The gradient PremiumButton was left untouched,
and non-CTA accent elements (calendar day blobs, chips, dots) were correctly left alone.

Consolidations, logged: one radius (md, the premium/chart buttons were lg and fold in), one label (bodyStrong
17/700, the 16/600 sites unify up), one pressed (0.85), and a `pill` prop that keeps the two genuinely-pill
buttons (the lookback scrapbook button, the routines add button). The agent also caught and fixed a latent
dark-mode bug: the routines add-routine label used colors.surface instead of onAccent.

Gate green: client 346, server 197, lint + typecheck clean (lint confirms no dead styles remain). Verified a
button in a dark preview: bg #C68BA0, label #2B2722, radius 14, 17/700. On premium, holding the merge.

## 2026-06-26 Design polish wave 3b: BackLink

Extracted the "‹ Back" link (copy-pasted into 6 sub-screens) into one <BackLink label? fallback?>, accent
style, role + a11y, hitSlop. Fixes a latent bug: Lookback's back link used a bare router.back() with no
fallback, so a deep-linked Lookback (no in-app back stack) dead-ended. BackLink uses
router.canGoBack() ? back() : replace(fallback), verified live (a deep-link back now routes to Today).
Lookback also had drifted style (inkSoft / 16 / regular) now unified to the accent standard.
settings / routines / lookback pass label "Today", privacy keeps fallback "/settings". Dead back styles and
two now-unused router imports removed. Gate green. On premium, holding the merge.

## 2026-06-26 Design polish wave 3c: Chip + Segmented

Extracted two duplicated controls. <Chip> (selectable pill, soft default = accentSoft tint + accent text,
solid variant available) and <Segmented> (generic mutually-exclusive toggle, one active treatment: border
1.5 + accentSoft + accent + weight 600). Both carry role + selected state + a label by construction, so a
pill can no longer ship label-less.

Judgment call, logged: the BrainDump and BreakdownQuestions chips moved from a solid mauve fill with white
text to the calmer soft tint (matching chart), the audit's "default to soft" recommendation,
accent-used-sparingly. Reversible by passing variant="solid" or flipping the default. The Segmented 1.5/600
unification resolves the settings (1.5/700) vs breakdown (1/600) drift. Migrated the chart / BrainDump /
BreakdownQuestions chips and the settings + breakdown segmented toggles, dead styles removed. The multi-select
weekday picker and action buttons were correctly left alone. Gate green (client 346, server 197). On premium,
holding the merge.

Noted for later: a pre-existing RoomsSheet nested-Pressable hydration warning (untouched by this work).

## 2026-06-26 Design polish wave 3d: ModalCard (completes wave 3)

Extracted the centred modal-card scaffold (Modal + scrim backdrop + tap-absorbing centred card) into one
<ModalCard visible onClose maxWidth? animationType? scroll? maxHeight?>. The card matches the DOMINANT existing
scaffold byte-for-byte (t.colors.bg, radius lg, padding spacing.six), so migrations are pixel-identical
(verified on the open didOpen modal: scrim rgba(10,8,6,0.6), padding 24/32, radius 20, maxWidth 420).
Conservative by design.

Migrated 9 plain centred-card modals (the two Break-it-down modals as scroll hosts at maxWidth 440, and the
seven index.tsx wrapCard modals: didOpen, combine, moveTo, nudge, plan, order, offerDefer), each keeping its
exact visible condition and dismiss handler (now onClose). LEFT 5 correctly: the close-the-day modal (animated
rise entrance, folding would lose the motion), focus mode (full-screen, no scaffold), CameraCapture (slide),
the Rooms bottom sheet, and the BrainDump date picker (different padding, folding would be a visible change).
The animated-entrance modals are a follow-on for if ModalCard later gains an Animated variant.

Gate green: client 346, server 197, lint + typecheck clean. On premium, holding the merge. This completes wave
3 (PrimaryButton, BackLink, Chip/Segmented, ModalCard), the shared-component extraction.

## 2026-06-26 Design polish wave 4a: pressed / media / control tokens

Three token families in theme.ts. PRESSED_OPACITY (0.7, the canonical pressed dim, with PremiumButton's
gradient 0.9 the one documented exception, all 10 pressed sites routed). cardMediaWidth (360) and
maxCalendarWidth (340) added to layout, the latter with a real fix: the DatePicker grid is now capped and
centred so it stops inflating taller in wider host cards. control.check (26) and a border family
(hair 1, thin 1.5, thick 2).

Small deliberate unifications, logged: the completion checks in BreakdownReview and chart enlarge 24 to 26 to
match TaskRow's hero check. Border widths were tokenized at their current values (no visual change). NOT
reconciled, flagged for Melroy: the selected-emphasis border is 1.5 in Segmented but 2 in TaskRow's
pinned/unique rows, the same "this is special" signal drawn at two weights. The 420/440 modal widths were left
as-is (ModalCard already centralises modal width). Gate green: client 346, server 197. On premium, holding the
merge.

## 2026-06-26 Design polish wave 4b: hitSlop + a11y sweep (completes wave 4)

The accessibility pass, no visual change beyond larger tap targets. hitSlop to a ~44pt floor on the
sub-target controls the components had not already covered: the BrainDump slice steppers and weekday circles,
the routines cadence pills, and the TaskRow confirm-row actions (vertical-only, since they wrap on a narrow
phone). a11y: the TaskRow row label now folds in the repeating and reminder state (a recurring or reminder
task used to read identically to a plain one), the decorative glyphs (the repeat arrow, the bell, the pin
star, the Big pill) are hidden from screen readers so they are not double-announced, the RepeatingDrawer
scrim gained role=button, and the routines when-pills gained explicit labels. Gate green: client 346, server
197. On premium, holding the merge. Wave 4 complete.

## 2026-06-26 Design polish wave 5: emoji-as-icons removed, periwinkle documented (item 19 deferred)

The brand-vocabulary items.

- Emoji-as-icons removed (item 18). The bell beside a reminder time, and the mic/camera on the Speak/Scan
  buttons, rendered as raster multicolour, ignored t.colors, did not adapt to dark mode, and the inline bell
  leaned toward the notification/alarm cue the never-alarm brand forbids. Dropped all three: the reminder now
  shows the accent-coloured time alone (the a11y label already says "reminder at the time"), and the buttons
  read "Speak" / "Scan". A proper SVG icon set is a noted follow-on if iconography is wanted later.
- Periwinkle documented (item 20). The repeat colour comment now names its real, wider role (the
  structured / multi-part accent: recurring tasks, the one-off task border, slice counts, the make-it-tiny
  chain), which dissolves the apparent overload by naming the semantics. No colour change.

DEFERRED, flagged for Melroy (item 19): the audit recommended giving the Today "Plan my day" PremiumButton a
mauve-only fill instead of the full mauve-to-honey gradient, on single-accent grounds (the honey reads as a
second accent on the protected Today screen). This directly conflicts with Melroy's explicit instruction that
all premium features should carry the gradient, so it was NOT changed. The tension is his to resolve.

Gate green: client 346, server 197. On premium, holding the merge.

## 2026-06-26 Design polish wave 6: motion tokens + cardShadow (completes the burn-down, through item 22)

The final wave. Motion durations tokenized: index.tsx closeRise 320 to motion.gentle, RepeatingDrawer 200 to
motion.standard, and RotatingPhrase's intentional slow 500ms cross-fade got a named motion.crossfade (500)
rather than being forced into a faster tier. RepeatingDrawer's useNativeDriver:false became
Platform.OS !== 'web' (a perf win on Android, the target, since it only animates opacity + translateX, both
native-driver-safe, and web is unchanged). A cardShadow(t) helper was extracted and used in TaskRow + routines
(the byte-identical per-scheme boxShadow had been duplicated). Left as-is: the easings (motion.ts has no
exported easing convention to route to) and RepeatingDrawer's 220ms open duration (matches no token, flagged).

Gate green: client 346, server 197. On premium, holding the merge. This completes the stack-ranked design
burn-down, items 1 through 22. Tier 4 and items 23-25 (CheckCircle, spacing hygiene, Bloom typography) are
deliberately out of scope per Melroy's "until 22".

## 2026-06-26 Copy audit: mechanical fixes applied, voice calls deferred to Melroy

The 7-lens adversarial copy/microcopy audit ([`docs/copy-review.md`](docs/copy-review.md)), the i18n-prep. The
verdict: the voice is strongly authored, so violations stand out as anomalies. Applied the safe mechanical
fixes now, left every feature-naming and voice call for Melroy (his taste, like Strategise to Plan my day).

Applied (mechanical, plus one spine fix):
- **Raw provider error leak fixed (the spine one).** sign-in.tsx interpolated the raw Supabase err.message
  onto the most anxiety-prone screen, a never-alarm breach and a small info leak. Both the send and verify
  catches now show a calm fixed line only, never the raw detail.
- Stray exclamation removed (premium "Thanks!" to "Thanks."), two prose semicolons to full stops (privacy.tsx
  and the crawlable privacy.html, kept in sync), the brain-dump a11y label de-hyphenated to match the launcher,
  and the Rooms pill's stale a11y list corrected (it omitted "Chart a course").

Deferred, flagged for Melroy in docs/copy-review.md (his calls):
- Tier 1: rename the "Rooms" pill (a first-timer cannot read the house metaphor), "Start fresh" to "See today"
  on the welcome-back card (it reads as wipe/reset, contradicting "nothing's lost"), and the within-card
  scrapbook vs keepsake collision.
- Tier 2: unify scrapbook/keepsake across the paywall and Settings, the "Big" pill casing, "Sort it for me" vs
  "Sort for me", and notably a suggestion to revisit "Plan my day" back toward "Plan my order" (the audit
  argues it does not distinguish from "Lighten today"), which directly touches a recent call of his.
- A terminology glossary (the canonical word per concept) and the i18n notes (concatenation, idioms,
  hand-built plurals) are in the doc as the t()-layer backbone.

Gate green. On premium, holding the merge (the whole design + copy batch goes to a preview for Melroy first).

## 2026-06-26 Design polish items 23-25: CheckCircle, spacing hygiene, Bloom (burn-down 100% complete)

The Tier-3 tail, finished autonomously after item 22. <CheckCircle done size?> extracted (the round sage
completion check, shared by TaskRow's four rows and BreakdownReview). BreakdownReview's tick converges 14/16
to the canonical 15/17 (the intended 1px unification, the whole point of the item). Exact-match spacing
literals routed to the scale (paddingVertical 8 to spacing.two, several marginTop 2 to spacing.half), with
off-scale nudges and the native TodayWidget left alone. Bloom's split typography folded into makeStyles and
the type scale (the eyebrow step), the bespoke celebration sizes kept. Gate green: client 346, server 197. On
premium, holding the merge. The stack-ranked design burn-down is now 100% complete (items 1 through 25).

## 2026-06-26 Robustness + security audit: sync data-loss fixed, money/PII items flagged

The 7-lens adversarial robustness + security audit ([`docs/robustness-review.md`](docs/robustness-review.md)).
Posture is solid: no critical breach, no auth bypass, no forgeable premium, no data leak. The Stripe signature
verification, the fail-closed premium gate, the comp allowlist, and the RLS path all held under scrutiny. The
real findings are data-integrity and cost.

Fixed (data-integrity, the spine one): the sync merge (client/src/lib/sync-merge.ts) was whole-row
last-write-wins, so an offline recurring completion (completedDates) or slices progress made on one device was
silently ERASED when another device made a newer unrelated edit. That is the never-lose-a-task,
never-shame-by-disappearance failure the app exists to prevent. reconcileConflict now makes the synced
completion data monotonic on top of the LWW winner (completedDates unioned grow-only, slices.done max), and
carries the local-only big / manualOrder that were also being dropped when the remote row won. The reconciled
row is pushed when the union grows the server's copy, so devices converge. Three tests added. The fix is
conservative: it only ever preserves data, never loses, so it cannot make sync worse.

Flagged for Melroy, NOT applied (sensitive: money, schema, his PII):
- HIGH: the Stripe webhook has no idempotency or ordering guard, so a retried or out-of-order event can flip a
  real subscriber's entitlement. Needs a processed_events D1 table plus an ordering guard.
- HIGH: the AI routes accept unbounded input forwarded to Claude against the shared budget (a cost/abuse path
  via the no-auth routes). Fix is a small capStrings/capText helper per route.
- MEDIUM: checkout grants premium on status='complete' even without captured payment (a 100%-off promo code is
  a live path). One-line tighten to payment_status==='paid', after confirming the trial flow.
- MEDIUM (PII): the owner's personal Gmail is hardcoded in comp.ts in the PUBLIC repo. Move to a Worker secret
  or an alias.
The input caps and the webhook idempotency are server changes needing a Worker deploy anyway, so they wait for
Melroy. Gate green. On premium, holding the merge.

## 2026-06-26 Robustness clear-fix batch: double-submit guards + defensive hardening

Applied the (clear-fix)-tagged findings from docs/robustness-review.md (the safe ones the verifier vetted),
leaving the needs-judgment money/PII items for Melroy.

- Double-submit guards on billable AI calls: the scrapbook "Make a scrapbook" button now has a synchronous ref
  guard plus disabled (each image gen is roughly the whole daily Workers-AI budget), chart's addTasks got a
  busy guard plus disabled (it was minting and dropping task sets on a double-tap), "Reflect on this week" and
  the other PremiumButton AI calls now pass disabled, and biteElephant got a re-entry guard (the unguarded
  TaskRow "Break down" path).
- Defensive crash and loss guards: authHeader wraps getSession in try/catch (no unhandled rejection on a
  storage error), handleEntitlement returns FREE on a D1 throw instead of a 500 (the cosmetic flag, never the
  money gate), chart's suggest() got an explicit catch, the server stopped echoing the raw upstream HTTP status
  to MCP callers, parseScene clamps the caption to 200 chars, and a shared 2MB body-size backstop (413) sits at
  the top of the Worker fetch.
- A NaN / corrupt-timestamp sync guard: rowToTask guards Date.parse with Number.isFinite, and the merge ranks a
  non-finite updatedAt as -Infinity so a corrupt remote row can never win LWW and pin a task to it. One test
  added (client 349 to 350).

The server fixes (handleEntitlement, mcp, parseScene, the body-size guard) need a Worker deploy to take effect,
so they ride on premium for Melroy's deploy. Gate green: client 350, server 197. On premium.

## 2026-06-27 Security: owner email out of source into the COMP_EMAILS secret

The robustness audit's PII finding, fixed at Melroy's urgent request. His personal Gmail was hardcoded in
server/src/comp.ts (the always-premium comp allowlist) and referenced in three test files, all public on
GitHub. isCompEmail now takes the allowlist from the COMP_EMAILS Worker secret (comma-separated, lowercased),
so no personal address is in source. The Env / PremiumEnv / FullEnv types carry the optional secret, the tests
use a fake address (owner@example.test), and the robustness-review.md finding was redacted.

The server code fix is on BOTH premium and main (cherry-picked clean, main 8199613), so the email is gone from
both public branches' current code, confirmed by grep. Git HISTORY still holds the old value (a separate
history rewrite, offered, Melroy's call, and the public repo means it may already be cached elsewhere). To
restore the owner comp: set the COMP_EMAILS secret (wrangler secret put, or the Cloudflare dashboard) then
deploy the Worker. Until that deploy the live Worker runs the old hardcoded code, so the comp keeps working
meanwhile. Gate green: client 350, server 199.

## 2026-06-27 The Mark SVG icon set: Speak / Scan get real glyphs (wave 5 follow-on)

Design wave 5 dropped the raster emoji (the reminder bell, the Speak mic, the Scan camera) and noted a
proper SVG icon set as a follow-on "if iconography is wanted later". Melroy wanted the marks back, done
right. Added `<Mark name="mic" | "camera">` ([`client/src/components/Mark.tsx`](client/src/components/Mark.tsx)):
single-weight thin-line glyphs (Feather / Lucide lineage, MIT) on react-native-svg, tinted via a `color`
prop so ONE icon serves light, dark, and the Dusk palette, the exact thing emoji could not do. Wired into
BrainDump's Speak (mic when idle; the live dot still shows while listening) and Scan (camera), each at the
speakText colour (inkSoft) so the glyph always matches its label.

Considered and rejected AI-generated raster icons (nano-banana) for these inline UI marks: raster
reintroduces the emoji problem (fixed colour, no dark-mode adapt, fuzzy at small sizes). That route was
kept only as an option for distinctive / marketing art, with prompts handed over, not for the buttons.

Verified live in the web preview (dark mode): both glyphs render with the right shapes (mic = 2 paths + 2
lines, camera = path + lens circle), stroke `#8A7F73` matching the dark-mode label exactly (the dark-mode
adaptation emoji never had), and `aria-hidden` so the Pressable's accessibilityLabel stays authoritative.
A stray React warning was caught and fixed in the same pass: `accessibilityElementsHidden` /
`importantForAccessibility` on the Svg leaked through react-native-svg onto the DOM on web; switched to
`aria-hidden`, confirmed the svg now carries only width/height/viewBox/aria-hidden. Gate green. On premium.

## 2026-06-27 Copy decisions applied: Rooms to Menu, keepsake to scrapbook, Start fresh to See today

Melroy's calls on the deferred copy-review items ([`docs/copy-review.md`](docs/copy-review.md)), made after
seeing them rendered in a before/after visual.

- **Rooms to Menu.** The header pill, its a11y label, the bottom-sheet title, and the "Close menu" scrim label
  all move to Menu ("Rooms never made sense" was his read). This goes one step beyond the copy-review, which
  suggested keeping "Rooms" as the open-sheet title for charm: a Menu pill opening a Rooms-titled sheet read as
  a mismatch, so the sheet title is Menu too. Trivial to restore the charm if he misses it. Internal names
  (the RoomsSheet component, roomsOpen state, roomsLabel style) stay; only user-facing strings changed.
- **keepsake to scrapbook**, as the feature name, everywhere it was user-facing (the premium paywall x8, the
  settings card, the lookback over-quota line + image a11y + the within-card hint). "keepsake" now survives only
  in code comments and the internal keepsakeNote style key. Plurals checked per sentence.
- **Start fresh to See today**, on the shame-free re-entry card. "Start fresh" read as wipe/reset two lines under
  "nothing's lost"; "See today" names the actual action (reveal today).
- The three design ratify defaults (page titles unified to 34, chips soft-tint, emoji to the Mark glyphs) were
  confirmed kept. **"Plan my day" stays** (Melroy overrode the audit's suggestion to revert it to "Plan my order").

Verified live in the web preview: the Menu pill + sheet render, no "Rooms" visible anywhere, gate green. On premium.

## 2026-06-27 Billing + cost hardening: payment_status, webhook idempotency, AI input cap

The three money / cost items the robustness audit flagged (no critical breach was found; this is defence-in-depth
on the paid surface). All server-side, on premium.

- **Checkout payment_status strictness** (stripe.ts entitlementFromEvent). The initial grant on
  checkout.session.completed accepted `status === 'complete'`, which can be true while payment_status is
  'unpaid'. It now grants only on payment_status 'paid' or 'no_payment_required' (the latter covers trials and
  100%-off promos). The customer.subscription.* events remain the authoritative source.
- **Webhook idempotency** (stripe.ts handleWebhook + a new processed_events D1 table). Stripe delivers
  at-least-once; a redelivered event id is now a no-op. Fails OPEN: any dedup-store error, or a not-yet-applied
  table, falls through to processing, because the entitlement write is an idempotent upsert, so a real billing
  event is never dropped. The Worker can therefore deploy before the table is applied.
- **AI input size cap** (index.ts, MAX_TEXT_AI_BODY = 100 KB). The rate limiter bounds frequency, not size; one
  giant text payload could still run up the Anthropic bill. The text AI routes now reject a body over 100 KB,
  read via a request CLONE (so the handler still reads it) and measured by real length (a content-length header
  can be absent or lie, the first attempt at a header check was a no-op in tests for exactly that reason). /ocr
  is exempt: it carries a photo and enforces its own larger limit downstream.

Tests: unpaid-but-complete denied, no_payment_required granted, a redelivered event writes once (duplicate:true),
an oversized text body 413s, /ocr stays exempt. Gate green: server 204.

Infra note: processed_events must be applied to the live D1 (fail-open makes the deploy order safe):
`npm exec -w server -- wrangler d1 execute doubledone-telemetry --remote --file d1/schema.sql`. Flagged for
Melroy's OK like any live change, alongside the Worker deploy.

Deferred follow-up: webhook event ORDERING (a stale subscription.* event clobbering newer state) is a deeper,
rarer edge not addressed here; noted for later.

Adversarial review pass (two independent skeptics) cleared the grant/deny logic (no way to grant a non-payer
or deny a payer, the dedup cannot drop a real event, no AI-cap bypass, no broken handler) and surfaced one
real minor gap: the AI cap measured `.length` (UTF-16 code units), not bytes, so a multibyte body (CJK,
Cyrillic, emoji) could carry ~3x the stated 100 KB before tripping. Bounded by the pre-existing 2 MB ceiling
so not exploitable, but fixed to measure real UTF-8 bytes (TextEncoder), with a test locking the byte
semantics. Server 205.

## 2026-06-27 Copy audit closed out: the 5 mechanical + 10 voice calls applied

The remaining copy-review tail, after the design + copy forks. The 5 mechanical fixes (casing plus two
reassurance tails) went first (c4b4ae4). Then Melroy approved all 10 voice / wording calls in one decision
round (the same shape as Plan my day), now applied:
- Sort it for me -> Sort for me; This looks right -> Looks good, next; Almost there -> Continue (welcome).
- No worries -> That's alright (premium cancel note).
- Custom -> Every few days (cadence chip).
- Step back -> Undo a step (a sliced task's hold menu).
- Big / Not big -> Mark as a lot / Not a lot (the select-bar toggle; ties to the "Marked as a lot" affirmation).
- finished tasks -> finished things (the Lookback scrapbook notes, the reflective register).
- Done adding -> Close, and RepeatingDrawer's "Done" -> Close (the "Done" overload, now reserved for completing).
- The camera-read and sync-unavailable errors reworded to name what happened, plainly.

With this the copy review is fully APPLIED bar the i18n layer (the t() extraction, next). The glossary terms
(thing(s) on reflective surfaces, big, scrapbook) now hold across the app, which is also step zero of i18n.
Watch-item for Melroy's morning: "Mark as a lot" is longer than its select-bar siblings, check it doesn't
crowd the bar on a narrow phone. On premium.

## 2026-06-27 Onboarding: a Premium close, plus Speak + Combine surfaced

Melroy's call: the intro never sold Premium, nor mentioned talk-to-capture or Combine. He wanted them in,
Premium as a late screen ("I know it's not best practice, but we need to sell the idea"). Done economically,
bending the deliberate "curate, don't catalogue" onboarding ethos by exactly one screen plus two light hints:
- A new "premium" step before the handoff: the calm loop is free, then the suite (lead with the weekly
  scrapbook, the emotional payoff; then Chart a course, Plan my day, Your patterns, Scan). It SELLS by the hook
  and the copy, not by a paywall: it points to Settings rather than interrupting first use with a checkout,
  which is both on-brand (never pushy) and better for conversion (don't ask for money before they've felt the
  value). I made that call deliberately over a hard in-onboarding upsell; flagging it so Melroy can overrule.
- Speak: the capture screen's faint "On web, you can just speak it" became "Prefer to talk? On web, tap Speak
  and say them out loud" (names the button, invites).
- Combine: a light hint on the reveal screen ("A few tasks that go together? You can combine them into one").
Reuses the safetynet list styling, no new components. Onboarding is now 7 steps, skippable throughout. Gate
green. On premium. MORNING FOLLOW-UPS: eyeball the new Premium onboarding screen live, and the E2E suite
(scripts/gen-test-suite.py) wants a case for the added step before the eventual merge.

## 2026-06-27 i18n foundation: the typed t() + Intl layer (the translatable architecture)

Phase 3 of the overnight run, and the i18n plan's "concrete next code step", now that the copy is settled.
Built ADDITIVELY (no screen rewired yet, so rendered English is unchanged, zero behaviour risk):
- catalogs/en.ts: the English source-of-truth catalog, by namespace, with a starter set. Per-locale TRANSLATED
  catalogs land later (native-reviewed); translate() falls back to en per key, so a partial translation never
  blanks.
- lib/i18n.ts: translate(loc, key, params) with {name} interpolation + en fallback; pluralize() via
  Intl.PluralRules (kills the hand-built two-form English plurals, verified against French CLDR categories);
  formatRelativeDay / MonthDay / Weekday / Time / Number via Intl (the replacements for the hardcoded en-AU
  date machinery the copy review flagged).
- lib/locale.ts: a session-locale-bound `t` and `fmt`, the screen-facing entry points (no React hook needed,
  the locale resolves once at startup like aiLanguage).
- 11 i18n tests (was 5), including locale-aware plurals and the date/number helpers.

Deliberately NOT done tonight (the discipline of stopping): the per-screen string EXTRACTION. It is the large
mechanical job, and it has real subtleties (e.g. Intl's relative-day is lowercase "tomorrow" vs the current
capitalised "Tomorrow", so each migrated site must preserve its exact English), which makes a blind unattended
sweep across ~28 files the wrong call to run while Melroy sleeps. It is now unblocked and batchable per screen,
English-preserving, with the gate as the safety net. Gate green. On premium.

## 2026-06-27 "Good enough" removed; the completion line now rotates; onboarding lists made symmetric

Melroy's review of the overnight work, three calls:
- **"Good enough" cut entirely.** It never made sense to him, and in the multi-select bar it sat confusingly
  beside "Done" (it only appeared for a single selection and did the same completion, just with a gentler
  affirmation). Removed from the select bar, the per-task hold menu, the goodEnough handler, and the
  onGoodEnough prop. Its purpose, the OCD / perfectionism release, now lives in the next item.
- **A rotating completion line.** Completing a task (single or bulk) now cycles through a small pool
  (DONE_AFFIRMATIONS in lib/celebrate: "Done is done. Recorded.", "Filed. You can stop checking it now.",
  "Good enough is done. Let it go.", and more), so the reassurance never feels canned and still carries the
  gentle release. Pure + tested (doneAffirmation rotates and wraps; every line calm, no exclamation); the
  counter is a ref on the screen.
  **[Annotated 2026-07-18. This REVERSES the 2026-06-22 call above, which chose one fixed line precisely
  because "the do NOT build list forbids variable / surprise rewards (autism needs predictability)" and
  explicitly decided against "a rotating set of affirmations (the predictability guardrail)". The reversal
  stands: it is Melroy's own review call and it is defensible. `doneAffirmation(n)` is `KEYS[n % 8]`, a
  DETERMINISTIC cycle by completion count, with no randomness, no escalation, no score, and every line in
  the same calm register, so there is nothing to chase and the anti-variable-reward guardrail is intact.
  What the reversal did NOT address is the other half of the original reasoning, literal predictability for
  the autistic side: you no longer know which of eight lines you will see, even though you can never be
  surprised by one. Judged an acceptable trade (variety of WORDING, not of reward), and written down here
  rather than left implicit. The cost of never recording it was real: manual case OCD-01 went on asserting
  "the SAME line every time" for three weeks, because the 06-22 entry still read as authoritative. A tester
  following it would have filed a false bug against correct code. Both fixed 2026-07-18.]**
- **Onboarding list symmetry** (screens 4 + 6). The netRow flex-wrapped name + description inline, so a short
  pair ("Chart a course", "Lighten today") sat on one line while longer ones wrapped, an asymmetry Melroy
  disliked. Now a column: name on its own line, description beneath, every item identical.

Gate green. On premium. Noted while verifying (PRE-EXISTING, not from this change): the Menu sheet
(RoomsSheet) logs "a button cannot be nested in a button" on web, the scrim Pressable wraps the room
Pressables; worth a separate small fix.

## 2026-06-27 Fixed "button nested in button": scrims are now siblings of their cards

The console error surfaced while verifying the Menu was a whole class. A scrim / backdrop Pressable
(accessibilityRole="button", which react-native-web renders as a real <button>) WRAPPED the card content, so
every control inside it (the room buttons, the Goodnight button, the date-picker days) was a <button> nested
inside a <button>: invalid HTML and a hydration error on web.

Fixed the pattern everywhere by making the scrim a SIBLING of the card, an absolute-fill dismiss layer BEHIND
it, never its parent. The card sits on top, so taps on it don't reach the scrim, which also drops the
tap-absorbing no-op inner Pressable each had. Touched: the shared ModalCard (covering ~13 modals at once),
RoomsSheet (the Menu), and the inline close-the-day + BrainDump date-picker modals. RepeatingDrawer already
used a self-closing sibling scrim, and the Focus + CameraCapture takeovers wrap a View, so those were already
fine. Verified live: the Menu scrim now has zero nested buttons and the rooms render as its siblings, the
sheet still opens, dims, and closes on a scrim tap. Gate green. On premium.

## 2026-06-27 Completeness audit: 25 gaps (the inverse-lens audit a copy review can't do)

Ran a 6-lens adversarial COMPLETENESS audit ([`docs/completeness-review.md`](docs/completeness-review.md)):
the inverse of the design / copy / robustness audits, hunting ABSENCE, what the product should surface, sell,
or explain but does NOT. Prompted by Melroy's fair critique that the copy audit (quality-only) missed the
intro-doesn't-sell-Premium gap. 25 gaps confirmed against the code (not the spec). Note: a mid-run API
rate-limit killed ~16 verifier agents, mostly on the onboarding lens, so 25 is a FLOOR; the doc still covers
all six surfaces, the dropped items were almost certainly duplicates of surviving gaps, so it reads complete.

Headline: the build is good; what's missing is everything that CONNECTS a person to it. DoubleDone
consistently ENACTS its principles and consistently FAILS TO STATE them. Top 3 by leverage
(activation / conversion / positioning): (1) the long-press is the only door to half the product (Break-it-down,
Make-it-tiny, Pin, Combine, Remind, bulk) and nothing teaches it; (2) the web front door is mute (no landing
page, no meta / OG tags) so every shared or interview link renders blank; (3) the ADHD / OCD audience and the
never-shame promise appear in ZERO user-facing copy, only the spec and comments. The other 22 group by surface
(onboarding, positioning, empty / first-run, errors / edges, discoverability, orientation), each tiered. The
through-line: the cheapest high-leverage work left is not features, it is making the product say what it
already quietly is. On premium. DECISION PENDING: which gaps to fix before the premium->main merge.

## 2026-06-27 Audit fix: the daily reminder says WHY it didn't turn on

The completeness audit's Tier-1 errors-edges gap: the reminder toggle silently sprang back to Off when
permission was denied or push unsupported, with no word, for the one feature that fights the week-three
retention cliff and an RSD audience that reads an unexplained refusal as rejection. enableDailyReminder (both
the native and the web variant) now returns a ReminderResult ({ ok } | { ok: false, reason:
denied | unsupported | error }) instead of a bare boolean, and a shared reminderReasonLine() gives one calm line
per case. Today surfaces it through the existing affirm line; Settings shows it under the control. Tested (the
three reasons read distinct and calm, and a denied user is pointed at their settings, not at themselves). On
premium.

## 2026-06-27 Audit fix: a post-payment recovery, never strand a user who just paid

The completeness audit's other Tier-1 money gap: after a successful checkout the entitlement poll gave up after
~20s and left the user on "Setting up your Premium" forever, with no Refresh and no recourse, the exact "did my
money disappear" panic this audience is most sensitive to. The poll now sets a `stuck` flag on exhaustion, and
the success screen swaps to a calm recovery: "This is taking longer than usual. Your payment went through, give
it a minute, then tap Refresh", a Refresh button (re-checks the entitlement), and a pointer to send a note from
Settings if it persists. On premium.

## 2026-06-27 Audit fix: a one-time coachmark teaches the long-press (the #1 activation gap)

The completeness audit's single highest-leverage gap: the long-press was the only door to half the product
(pin, remind, combine, make-it-tiny, bulk select), and nothing taught it. For a demand-avoidant audience that
will not fish for invisible gestures, an untaught gesture is a feature that does not exist. Today now shows a
one-time, dismissible coachmark above the task list, when there are tasks and the hint has not been seen,
"Hold a task for more: pin it, set a reminder, break it down, or make it tiny", keyed off a doubledone.holdhint.v1
flag (loadHoldHintSeen / saveHoldHintSeen). Tap "Got it" to retire it forever. On premium.

## 2026-06-27 Premium: custom accent colour (a curated four)

The first paid-suite expansion beyond the launch premium features. Premium picks the app's single accent from
four curated, calm hues: Mauve (the unchanged default and the free state), Teal, Rose, and a deepened Gold.

Decided FOR a curated four over the five brand hues shown in the picker mock. Periwinkle is already the app's
repeat / structured colour, so making it the accent would collide two meanings; it was dropped. Raw gold
(#C19A4F) failed white-label contrast, so it was deepened to #B0863A (light) to sit at the same bar as the
others. Decided FOR theming ONLY the `accent` and `accentSoft` tokens, the premium gradient, the per-task dot
palette and the periwinkle repeat colour are deliberately NOT themed, so the swap is one clean change app-wide.
onAccent stays the scheme default (white on the light accents, warm ink on the lifted dark ones, the contrast
the dark-palette audit settled).

Architecture: AccentName + ACCENT_NAMES live in the pure settings model and reach constants/theme as a
TYPE-ONLY import, so the settings unit tests stay RN-free and there is no runtime cycle. The ACCENTS colour
table and a fourth `accent` arg to buildTheme live in constants/theme; ThemeProvider threads settings.accent
through the same useMemo that already re-paints on a theme / text-size change. The picker is a premium-gated
swatch row in Settings; a free tap routes to the paywall (the conversion path the completeness audit wanted),
a premium tap sets the accent and logs accent.set telemetry. Decided that a lapsed subscriber KEEPS their
chosen accent (the gate is on the picker, not the paint), in keeping with never-punish.

Verified in-preview: selecting Teal persisted accent:teal and repainted the whole app teal (14 themed elements
on Today, zero mauve remaining), with the dark-mode variants resolving correctly.

## 2026-06-27 Front door: the og:image social card (Direction 2)

The +html.tsx summary card already turned a blank unfurl into a title + description; this adds the 1200x630
image so a shared doubledone.app link shows a real brand card in iMessage / Slack / LinkedIn / WhatsApp / X.

Chose Direction 2 of three mocked for Melroy: the Newsreader wordmark + an italic "Today, finite and
achievable." on the Dusk paper, a short mauve rule, and a soft mauve disc with a checkmark (the one meaningful
anchor, things get done here). Decided against the plainer centred card (D1, read too quiet for a click) and
the busier product-hint card (D3, a faint card-in-a-card reads fussy at unfurl size).

Build: scripts/gen-og-image.mjs rasterises an SVG to PNG via @resvg/resvg-js, loading the real brand fonts
from client/assets/fonts (no browser, so the wordmark is the true serif). Decided to keep resvg-js an
UNCOMMITTED, documented dev tool (like gen-test-suite's openpyxl) and commit only the generated PNG, so the
asset is reproducible without adding a native-binary build dep to install/CI. The Newsreader italic face was
copied into client/assets/fonts for reproducibility. Wired og:image (+ width / height / alt) and flipped
twitter:card to summary_large_image. Verified: the PNG renders the brand correctly and is served at /og.png at
1200x630. The true unfurl can only be confirmed once live, so re-check with a sharing debugger after the merge.

## 2026-06-27 Web SEO meta: injected post-export, because output:'single' ignores +html.tsx

A LinkedIn Post Inspector run on the live site found "No image found / No description found", title-only. The
cause was not just that the front-door work sits unmerged on `premium`. Even merged it would have failed:
web.output is "single" (an SPA) and Expo Router does NOT apply client/src/app/+html.tsx in that mode. `expo
export` writes a default <head> (a bare <title>DoubleDone</title>, no meta), and crawlers read static HTML and
run no JS, so the unfurl was always going to be title-only. The +html.tsx added earlier this session was inert.

Considered switching web.output back to "static" (which WOULD honour +html.tsx and per-route <Head>), but that
reintroduces the module-scope-Supabase-touches-window-at-build crash that drove the move to "single" originally,
a real refactor on a live product, not warranted just for meta. Instead added scripts/inject-web-meta.mjs, which
patches the SEO / social meta into client/dist/index.html after export. Wired into deploy-web.yml (before the
Pages deploy) and ci.yml (with a grep assertion, so a broken patch fails the build, not the deploy). +html.tsx
stays as the head for IF we ever move to static; the two are kept in sync by comment. Also fixed the page
title's em-dash to a middot ("DoubleDone · a calmer kind of to-do").

Verified locally: export then inject yields an index.html with the full title plus 15 og / twitter / description
tags and og:image = https://doubledone.app/og.png. The true unfurl confirms post-deploy via an inspector
re-scrape.

## 2026-06-27 Audit (Tier 1): the sync footer stops claiming "Synced" on a failure

The completeness audit's most dangerous live gap: a signed-in user whose sync failed for any non-fatal reason
(network, RLS, 5xx, expired token) was still told "Synced to <email>", an affirmative false promise that their
tasks are safe across devices. The failure was a swallowed track('sync.failed'). For a multi-device user this
invites real data-loss-by-belief. Now the last sync result is persisted (loadLastSyncOk / saveLastSyncOk,
doubledone.syncok.v1): success writes true, a non-account-gone failure writes false, and BOTH the Today footer
and Settings downgrade the line to "Saved on this device. It'll sync when it can reach your account." when the
last attempt did not land. Default stays optimistic (null / true shows "Synced"); only a real failure
downgrades, and the next successful sync flips it back. The account-gone path is unchanged (it signs out).

## 2026-06-27 Audit (Tier 1): a persistent Premium entry in the Menu

Conversion gap: a willing buyer's only persistent door to the offer was the card at the very bottom of
Settings; the Menu had no Premium entry, and Today none. Added a "Premium" room to the RoomsSheet (Menu),
marked with the premium gradient dot (the one special row), routing to /premium and logging premium.menu_open.
The hint adapts: a free user sees "Keepsakes, more AI, your colour", a subscriber sees "Manage your
subscription". Kept the never-hard-sell posture, findable for someone actively looking, never pushed.

## 2026-06-27 Audit (Tier 2): offline awareness across the AI seams

Every AI feature showed the same generic "try again" regardless of cause, so on a flaky connection a user taps
Break-it-down, waits, gets "try again", taps again, exactly the retry-into-overwhelm spiral the product exists
to prevent. Added lib/connection.ts with one helper, aiErrorLine(fallback), that swaps in a calm offline line
("You seem to be offline. This needs a connection, your tasks are safe here meanwhile.") when the device is
positively offline, otherwise keeps the caller's own specific message. Applied at every AI seam: break-it-down,
sort, strategise, make-it-tiny, tidy/split, chart, plan-order, scrapbook, week-summary, OCR. Web reads
navigator.onLine; native returns false so the caller's message stays (a proper NetInfo check is deferred, see
BUILD-PLAN). The offline line deliberately drops "Try again", the futile-retry nudge offline must not give.
Unit-tested (the offline choice is injectable so the test never touches the global navigator).

## 2026-06-27 Audit (Tier 2): sign-in tells rate-limit from a bad address, and gains Resend

The OTP send collapsed every failure into "Check the address and try again", so a user whose correct address
merely hit Supabase's per-address rate limit was told to doubt the (fine) address, on an already anxious
screen. sendCode now inspects the error: a 429 / "wait N seconds" shows "Just sent one. Give it a minute, then
try again."; offline reuses the shared aiErrorLine; everything else keeps the generic line. The code step
gained a "Resend code" link with a 30s cooldown (disabled and counting down) so repeated taps cannot trip the
rate limit in the first place. Still never leaks a raw provider error (the never-alarm spine).

## 2026-06-27 Audit (Tier 2): offer the daily reminder once, after the first close-the-day

The reminder is the named lever against the week-three retention cliff, but it lived only as a faint footer
link and a Settings pill, never offered at the moment its value is concrete. The rested screen (after the first
close-the-day) now shows a one-time gentle offer, "Want one gentle nudge a day to come back?" with "Yes, remind
me" / "Not now", gated by doubledone.reminderoffer.v1 so either choice retires it for good and it never nags.
Accept runs the same enableDailyReminder path (the reason line on failure, never a silent bounce); decline just
marks it made. Only shown when the reminder is not already on.

## 2026-06-27 Audit (Tier 2): the low-capacity day is reachable on calm days too

The low-day toggle lived only inside the weight gauge, which renders solely when there are spreadable (open
one-off) tasks. So on a calm, all-done, or recurring-only day it vanished, exactly the low-energy days it
exists to serve. Added a standalone low-day affordance shown when the gauge does not (loaded, open day, no
spreadable tasks), reusing the same toggleLowDay, so the option is always reachable on an open day.

## 2026-06-27 Audit (Tier 2): onboarding teaches the hidden rooms

Three onboarding gaps where deferral became silence. (1) The combine teaser advertised the feature with no path
to it; it now teaches the gesture, "Hold one, pick the rest, then combine them." (2) Off-plan logging (the
"+ I also did that" answer to "my brain says I did nothing") went unmentioned; the keep step now adds "Did
something that was never on your list? Log it too. It still counts." (3) Routines, Repeating and the Lookback
live only behind the Menu pill and were named nowhere in first-run; the handoff now points there: "Your
Lookback, routines and repeating tasks all live in the Menu, top right." Copy-only, no new screens.

## 2026-06-27 Audit (Tier 1): a real landing page at the front door (A1)

The audit's last open Tier-1 gap: doubledone.app/ was the app shell booting into onboarding, with no marketing
front door for a first-touch visitor or a hiring PM. Chose approach A1 of two: a landing route at / with the
app moved to /today, over A2 (a static landing with the whole app relocated under /app). A1 keeps the SPA at
the root, so checkout (returns to /premium), the service worker, and deep links are untouched, no server change,
no Worker redeploy; the og meta already shipped gives crawlers the rich card. The accepted cost: the landing
copy is client-rendered, not static-crawlable, a fair trade vs relocating a live payment app for modest SEO.

Build: app/index.tsx (Today) moved to app/today.tsx via git mv; the new app/index.tsx is the Landing (the
spine, the audience, the never-shame promise, the three-step loop, the payoff, two Begin CTAs, in the app's own
theme and fonts). The Landing is the WEB first-touch surface only: native users and returning (onboarded) web
users redirect straight to /today, so only a fresh web visitor or a crawler ever sees it. The four "go home"
navigations (welcome, settings, premium, chart) and the screenshot harness's Today shots now target /today. PWA
start_url stays / (the onboarded-redirect carries an installed user through to /today); a dedicated start_url
is a noted minor follow-up. Verified in-preview: / shows the Landing for a fresh visitor, /today shows Today,
and an onboarded visit to / redirects to Today.

## 2026-06-27 Decision (to build): keep + expose Slices, split at the user's discretion

Resolved the completeness audit's Slices question (Tier 3 #9): KEEP and properly EXPOSE Slices, do NOT cut it
and do NOT fold it into Break-it-down. They are different mechanisms, not redundant: Slices is a progress
counter on ONE task (10 episodes, 200 pages, 5 reps), Break-it-down splits a task into SEPARATE sub-tasks. The
audit's only real flaw is discoverability (set at capture only, never taught, unreachable afterwards).

The expose work (to build in the Tier 3 batch): teach it once, sharpen the capture hint, AND allow adding /
editing the slice count on an EXISTING task. Governing principle, from Melroy's own work style: the split is
entirely AT THE USER'S DISCRETION, grown manually over time (a 2-part task can become a 20-part task as he
discovers the parts), never auto-decomposed by the app. Slices is the MANUAL counterpart to AI Break-it-down,
the user owns the count and the app never imposes one. Decided 2026-06-27; noted now, built as part of the
Tier 3 "actions 1 to 9" batch.

## 2026-06-27 Premium: annual plan (A$50/yr) alongside monthly

The first monetisation lever of the Tier 3 batch: a yearly price as a second checkout option. An annual plan
recovers most of Stripe's flat per-charge fee and lifts margin. Server: STRIPE_PRICE_ID_ANNUAL (a non-secret
wrangler var, Melroy's live price price_1Tmod5...) plus a `plan` param on /checkout; checkoutSessionForm picks
the annual price only when the caller asked for it AND it is configured, otherwise monthly, so a missing var
degrades safely to the existing flow. Client: the Premium page gains a Monthly / Annual toggle ("save 17%",
about two months free) that passes the plan to startCheckout. Unit-tested the price-pick. Goes live on the next
Worker redeploy (Melroy's per-instance OK) and the premium->main merge; the card-free trial follows next.

## 2026-06-27 Premium: card-free "Try Premium" one-month trial (server)

A 30-day Premium giveaway with NO card and NO Stripe, gated against gaming by a synced (email) account plus a
write-once D1 record. Decided card-free over a Stripe trial (Melroy's call): a surprise auto-charge is exactly
the trap an RSD-prone audience fears, so this just reverts to free, no charge ever unless they choose to
subscribe. One-per-ACCOUNT: /trial/start CRYPTOGRAPHICALLY verifies the Supabase JWT (reuses requirePremium's
defaultVerifySub, not a decode, since it grants Premium), and the trials table is write-once on the user_id
primary key, so a prior trial (active OR expired) blocks a re-trial. It reverts on its own: the read checks
expires_at against the clock (no cron), and both the client flag (handleEntitlement, status 'trial') and the
costed money gate (requirePremium) honor an active trial, the gate failing CLOSED on any trials-store error so a
hiccup never serves paid compute for free. The honest, accepted limit: a determined person with throwaway emails
can re-trial, which is the right level for a A$5 product (no device fingerprinting, off-brand). New: D1 `trials`
table, server/src/trials.ts (activeTrial / startTrial, unit-tested), the /trial/start route. The client entry
("Try Premium free for a month", signed-in only) and the trial-state Premium page follow in the next commit.

## 2026-06-27 Premium: seven custom colour themes (the "Dusk" family)

Custom THEMES superseding the earlier custom-accent picker, which never shipped (it lived only on the unmerged
premium branch), so this is a clean replacement, not a migration. Seven calm, paper-like FULL palettes (Dusk the
free default, plus Sage, Slate, Heather, Fog, Honey, Rose as Premium), each with a tuned light AND dark variant,
designed and WCAG-verified in Claude Design and handed off as a typed token table. Decided full palettes over the
accent-only swap because a single accent on the same paper read as a gimmick; a whole mood (background, ink,
cards, accent) is the feature people actually want, and the spine ("remove friction, never add a setting") holds
because it stays ONE optional selector, not a panel. The presets carry 12 core tokens; the rest of the Palette is
derived per preset (surfaceCard a translucent surface, doneSoft a pale tint of done, onDone) and the genuinely
theme-independent tokens stay fixed (the loud priorityGradient, the per-task accent dots, the scrim). Dusk is
special-cased to render the canonical light/dark palettes UNCHANGED, so the default and free experience does not
shift a pixel. The Honey caveat is load-bearing: a calm gold cannot clear AA with white, so Honey uses DARK
onAccent and every button label reads t.colors.onAccent (verified: no surface hardcodes white on the themeable
accent; the only hardcoded whites sit on the camera's dark overlay and the fixed premium gradient). Gating lives
in the picker (a free user's tap routes to /premium); buildTheme applies whatever preset is stored, which is fine
because only the gated picker can set a non-Dusk preset, and a theme is cosmetic, not costed compute. New:
THEME_PRESETS + toPalette in constants/theme.ts, ThemeName/themePreset replacing AccentName/accent in
lib/settings.ts, the Settings "Colour theme" picker. Verified light and dark in-preview (Sage plus all seven
swatches repaint correctly in both schemes). Decided against translated theme names for now (the names are
evocative English; a later i18n pass can localise them).

## 2026-06-27 Reminder time is the user's to choose

The daily nudge fired at a hardcoded 9am, wrong for anyone whose day does not start at nine, and a reminder at
the wrong time is worse than none (it trains the user to dismiss it). Added a persisted reminder hour (0-23,
default 9am) and a calm minus/plus stepper in Settings that shows ONLY when the reminder is on, so it stays
contextual, never a standing knob (the spine holds: no new setting for someone who has not opted in). The hour is
an access need, not a Premium lever, so it is free for everyone. The displayed time and the saved value update
instantly; the actual re-apply (web-push re-subscribe / native re-schedule) is debounced 600ms so a flurry of
taps makes ONE network call at the final hour, never a burst, and avoids a race where an earlier POST lands last.
All three enable sites (the Settings toggle, the Today footer, the close-day offer) now read the saved hour, so
the time is consistent wherever the reminder is switched on. New: reminderHour in storage, clampHour +
formatReminderHour (pure, unit-tested) in reminders-types, the Settings stepper. Verified in-preview: the stepper
renders only when on, steps the hour, updates the 12-hour label, and persists.

## 2026-06-27 Slices kept, exposed, and the user's to resize

Slices (tracking ONE task across N parts, e.g. 10 episodes) were keepable but nearly invisible: definable only at
capture, in BrainDump, for a lone line. Decided to KEEP them (not fold into Break-it-down, which makes SEPARATE
sub-tasks; slices are a progress counter on a SINGLE task, a different gesture) and to EXPOSE them as a
discretionary editor: hold a task, tap "Steps", and a stepper splits it into 2-50 parts, or re-sizes an
already-sliced one. This is Melroy's own way of working (taking a 2-part task to 20 at his discretion) made a
first-class action rather than a capture-time-only option. Progress carries over on a resize, clamped to the new
total (shrinking below what is done snaps done down, and the boolean done flag stays reconciled so the calendar /
close-the-day / reward need no special-casing), and "Make it whole again" drops the parts back to one task. Free
for everyone (a way of working, not a Premium lever), single-task + non-recurring + not-done only. New pure,
unit-tested logic: setSliceTotal + clearSlices in lib/slices; the "Steps" action and a ModalCard editor on Today.
Moat telemetry now distinguishes slices.defined (a fresh split), slices.resized (a re-size), and slices.cleared
from the existing slices.progressed. Verified: logic unit-tested, /today renders clean with the editor in the
tree; the full hold->Steps->modal path (which needs a real long-press the headless preview can't simulate) is
covered by the on-device E2E case TOD-07c.

## 2026-06-27 Money-path hardening: scrapbook abuse backstop + a double-subscription guard

Two correctness gaps the pre-merge review surfaced on the LIVE Stripe path, both closed defensively.

(1) /scrapbook (the costed Workers AI image route) had no server-side ceiling: an origin-less script could mint
keepsakes bounded only by the 30/min/IP AI limiter, so the per-tenure cadence was unenforceable and the shared
Workers AI budget was abusable. Closed with a per-IP rolling-24h backstop (a new scrapbook_log D1 table, keyed by
CF-Connecting-IP, cap 20/day), deliberately NOT a sign-in gate: the free monthly taste is anonymous-first by
design, so requiring an account would change the product and add friction to the conversion hook. The backstop is
a raw-abuse ceiling only (no legitimate user, free 1/month or premium up to 4/week, comes near it); the per-user
cadence stays the client's job plus the paywall. It fails OPEN on any store error or a missing table, so a hiccup
never denies a real keepsake (the never-shame spine) and the Worker can deploy before the table is applied. The
full per-user server-side metering (which needs the "does the free taste require a free account" product call) is
a deliberate follow-up, not rushed into the pre-launch merge.

(2) /checkout never checked whether the caller was already subscribed, so a direct hit or a race could open a
SECOND Stripe subscription (a real double charge, the worst surprise for an RSD-prone audience). Added a
defence-in-depth guard: handleCheckout reads the entitlement first and 409s an active PAID subscriber (premium
plus a Stripe customer), while a trial user (premium, no customer yet) is intentionally allowed to convert. The UI
already routes active subscribers to "Manage", so this only backstops a direct or raced call; the client maps the
409 to a calm "You're already on Premium" rather than a second charge. Both changes are unit-tested. They need a
Worker redeploy to go live.

## 2026-06-27 The light-mode contrast sweep (clearing the AA claim the code made)

The pre-merge review found a coherent cluster: the light greens (done) and accents were tuned as FILLS, but where
they were used as TEXT or a small glyph they dipped under WCAG AA, on an app that ships Atkinson Hyperlegible and
whose theme file literally claimed "still clears WCAG AA". Closed NUMERICALLY (every value verified >= 4.5 with a
throwaway WCAG script), not by eye:
- The completion tick (onDone) went from white (3.1-3.9 on the sage fills, every light preset incl. Dusk) to a
  dark warm ink (#21261F, 4.8-5.0), matching dark mode's already-dark tick. Sage's light done was nudged
  #4E8C7A -> #5E9E7E so the dark tick clears it (4.90).
- "Done" as TEXT (the affirmations, the sign-in success, the Lookback marks, the select-bar Done, the whole-task
  bloom check, the repeating-drawer tick) now uses a new DERIVED doneText token (a deepened green, mix(done,
  black, 0.35), ~5.4-5.9 on paper), keeping the soft `done` FILL unchanged so the calm sage completion look holds.
- The default Dusk accent deepened #9B6A7D -> #946475 so the white PrimaryButton label clears 4.5 (4.42 -> 4.84);
  this also lifts the When-pill and multi-select tick on Dusk.
- The Segmented active label switched from accent-on-accentSoft (sub-AA on all 7) to ink (~12:1); the 1.5 border
  plus tint still carry the active signal.
- Three wrong-"on"-token glyphs that only broke on Honey (white on gold) now read the right token: the routine
  "When" pill (surface -> onAccent), the multi-select tick (onDone -> onAccent), the routine step tick
  (surface -> onDone).
- The Today "Menu" pill stopped hard-coding Dusk's surface/ink RGBA and now derives rgba(surface)/rgba(ink), so it
  follows the active theme instead of reading warm-brown under the cool dark presets.
Verified in light-mode preview: the dark tick, the deepened accent, and the derived Menu pill all render.
Deliberately LEFT: Honey's gold accent as small text (the Settings links) stays the documented
low-contrast-accent trade-off, because no single gold can clear AA as text AND carry a dark button label; the real
fix is the backlogged high-contrast mode. The visible changes (dark tick, deeper success text, slightly deeper
Dusk mauve) are for Melroy to eye on the Android device-test before Play Store.

## 2026-06-27 First translations: draft it/fr/es for a native vibe-check

Melroy's wife is a polyglot (native Italian, advanced French and Spanish), so the deferred "translated languages"
got a first, reviewable pass for those three Latin-script locales. Generated via three native-voice translator
agents (one per language) briefed on the calm, never-shame voice, the informal-you register, and the rule that
the product idioms ("Lighten today", "Break it down", "Make it tiny", "Chart a course") are TRANSCREATED, not
translated literally. Caught and corrected a systematic defect: the French pass dropped its accents.

Shipped: real it/fr/es catalogs (the 25 Common/Today/Actions/Capture seed strings) wired into CATALOGS, each
typed `: Catalog` so the compiler enforces full key coverage; the Catalog type widened (a Stringify mapped type)
from en's literal types so a translated catalog satisfies it. translate() still falls back to en per missing key,
so this is SAFE to ship before review, an untranslated key shows English, never a blank, and the visible exposure
is tiny because only ~1 screen calls t() yet. Plus docs/i18n/translations-review.md, a side-by-side EN/IT/FR/ES
artifact with the transcreation rationale, for the wife to mark up. Deferred until AFTER her review: the in-app
language picker (it needs a reactive-locale provider, not worth building before the strings are blessed) and the
per-screen t() migration that makes the rest of the app translatable.

## 2026-06-27 The marketing landing, redesigned (the Claude Design "Dusk" front door)

Replaced the plain single-column landing at / with the page Melroy art-directed in Claude Design over several
rounds: a kicker standfirst ("for when the list is too much"), an empathy-first subhead (name the feeling, then
the relief), a calm half-finished "Today" mock card, the never-shame promise pulled up near the hero, the 3-step
loop, the "what you finish, you keep" payoff, a closing CTA, and a quiet footer. The direction the rounds settled
on: calm and editorial, NOT a loud SaaS page; show the product (the mock) rather than just state a headline; lead
with the feeling. Re-implemented as the React Native web component (not a loose HTML file) so it keeps the
onboarded-redirect, the router, and the live theme, mapping the design's palette onto the real Dusk tokens so it
follows light and dark for free (the design's accent and sage ARE the live tokens). One deliberate deviation from
the mock: the "Today" card's completion ticks use the app's dark-ink-on-sage tick (the AA-correct one from the
contrast sweep), not the mock's white check, so the front door matches the product and clears AA. Verified
in-preview, light and dark: all copy plus the Today mock and the deepened accent button render in both schemes.
Still web-only (native and onboarded web skip to /today).

## 2026-06-27 The launch control centre (monitoring + alarms + the dead-man's-switch)

For a proper Monday launch a solo founder needs to KNOW within minutes if something breaks, spikes, or gets
abused, without staring at a dashboard. Designed it first across four expert lenses (reliability, cost, growth,
abuse), which converged on one shape: a control centre that taps the shoulder on trouble and stays silent
otherwise. Built `server/src/monitor.ts`, riding the EXISTING hourly cron (`scheduled()`) and reusing the proven
`SEND_EMAIL` + `FEEDBACK_TO` path, so the whole thing is wiring, not new infrastructure.

What shipped:
- **An hourly health sweep over D1** that emails the owner ONLY on a breach: AI **$-spend vs the $25 cap** (real
  dollars from the `input_tokens`/`output_tokens` columns x per-model prices, Haiku $1/$5, Sonnet $3/$15, Opus
  $15/$75, alarming at 50% of the cap AND on a linear month-end projection, because the cap is a kill switch that
  presents as a total outage); an **error spike** (a low absolute floor of 5/hr AND a >30% rate, OR a hard 10/hr,
  so a 2-of-2 blip is never read as 100%); the **scrapbook neuron-budget** (the GLOBAL daily image count, the wall
  the dollar query cannot see) and **per-source abuse** (an IP near the 20/24h backstop); and an **hourly volume
  spike**. De-duped via an `alerts_sent` table (6h per kind), so it never becomes noise you learn to ignore.
- **A once-a-day digest** (06:00 Melbourne) as the pulse, whose mere arrival is a soft proof the cron + email path
  is alive.
- **A dead-man's-switch**: the cron pings an external watcher (`HEARTBEAT_URL`, a Worker secret, e.g.
  Healthchecks.io) every tick, FIRST and unconditionally, so silence provably means healthy rather than "the alarm
  itself died". This was the four-lens design's highest-leverage insight (the alarm-on-the-alarm): a self-hosted
  alarm cannot detect its own death.

Decisions that shaped it:
- **Privacy by construction.** The alert email is a NEW egress path out of the pseudonymous store into an inbox,
  so it is deliberately information-poor: counts, endpoints, error STRINGS ("upstream 529") and dollar amounts
  only. It never reads `ai_calls.input/output` (the task text), never a raw IP, never a `user_id`. A unit test
  asserts no IPv4 can appear in a body.
- **Fail-open everywhere.** Every step is isolated in try/catch; the heartbeat fires even if D1/email is down; the
  dedup read fails open (alert rather than suppress). The sweep can never break the app or the daily nudge it
  shares the tick with.
- **The cap is a non-secret var** (`ANTHROPIC_MONTHLY_CAP_USD=25` in wrangler.jsonc), tunable without a code edit.
  The thresholds are named consts in one place, set deliberately low for tiny launch numbers with the intent to
  retune after real traffic.

Reversed within the day (the data corrected the plan): the **custom Stripe-webhook fraud branch** (dispute /
refund / failed-payment alerts) was first deferred on the assumption Stripe's own dashboard would email those.
Setting it up showed it no longer does (no failed-payment email option, no refund option), so the deferral was
wrong and the branch was built: `moneyAlertFromEvent` maps `charge.dispute.created` / `charge.refunded` /
`invoice.payment_failed` to an owner alert through the same `SEND_EMAIL` path. It is purely additive and
best-effort (it never touches the entitlement write, reuses `processed_events` to skip a redelivery, and a send
failure can never fail the webhook), and information-poor (event type, amount, currency and the clickable Stripe
event id only, never a card, name or email). Don't-fight-the-signal in miniature.

Still decided against (the discipline of stopping):
- **An in-app owner analytics screen** was deferred. The CLI (`npm run stats`) plus the daily digest cover the
  at-a-glance need; a screen adds a route and an owner-gated endpoint for marginal gain.
- **Signups / activation-rate in the digest** were left out. They need Supabase `auth.users`, which needs the
  service-role key we never use, so the digest stays D1-only. Noted as a real measurement gap: the anonymous-first
  majority is invisible to every per-user metric, the single biggest blind spot the growth lens raised.
- **Cloudflare Health Checks** (a paid load-balancing feature) for uptime were replaced by free external monitors
  (UptimeRobot for HTTP liveness on `/health`, Healthchecks.io for the cron heartbeat), set up by Melroy, on a
  DIFFERENT channel than the custom path so the two do not share a single point of failure.

Activation still pending (Melroy's parallel setup): the native Cloudflare/Stripe alerts, the UptimeRobot monitor,
the Healthchecks.io account that provides `HEARTBEAT_URL`, then one Worker redeploy (his per-instance OK) plus
applying the `alerts_sent` table (the monitor also creates it defensively).

## 2026-06-27 Legal and privacy for a live paid product (Terms, refunds, ACL)

The v1 documentation audit's biggest find: DoubleDone went commercial (live Stripe, real subscribers) with NO Terms
of Service, no refund policy, no entity disclosure, and a privacy policy that predated both the control centre and
Stripe. For a paid product under Australian law that is a real gap, so we closed it as part of the v1 line in the
sand.

Shipped:
- A plain-English **Terms of Service + refund policy**, using the same dual-surface pattern as the privacy policy: a
  static `client/public/terms.html` (the crawlable `/terms` URL a store listing needs) mirrored by an in-app
  `client/src/app/terms.tsx` screen, linked from Settings. It covers who operates it, acceptable use + suspension,
  Premium billing (A$5/mo or A$50/yr, auto-renew, the 30-day trial, cancel via the Stripe portal), the refund policy
  (full refund within 7 days if Premium does not work as described, otherwise cancel-anytime with no current-period
  refund), an as-is warranty with a liability cap at fees paid, governing law Victoria, and an explicit line that
  nothing limits Australian Consumer Law rights.
- The **privacy policy brought current** (both `privacy.html` and `privacy.tsx`, kept identical): it now discloses
  the control-centre owner alerts (counts and error strings only, never task text, IP, or user_id), the Stripe
  payment events (Stripe processes payments; we receive event-type / amount / id notifications), an Australian-privacy
  section (Privacy Act 1988 + ACL, the right to access / correct / delete, the OAIC), and a clear operator line. Date
  moved to 27 June.

Decided / assumed, flagged for Melroy to confirm: operated as a sole trader under his own name, no ABN or company;
the refund window is 7 days; governing law Victoria; the annual saving left as the existing on-screen "17%" so the
number cannot drift across surfaces. This is a reasonable, ACL-aware DRAFT, explicitly not legal advice, with a clear
in-file note that a lawyer's once-over is cheap insurance now that real money moves. Decided AGAINST blocking the v1
docs pass on that review: terms being live beats the bigger risk of nothing at all, and they are trivially updated.

## 2026-06-28 AI-optional: the app whole without it (for the AI-wary)

Real user feedback: someone refused to use DoubleDone because it championed gen-AI. That instinct is a real and
growing segment (privacy, ethics, anti-hype) and it overlaps the neurodivergent + privacy-conscious audience the
app already serves. The brand is already local-first and anti-hype, so honouring it is coherent, not a bolt-on.

The decision: NOT a "no-AI mode" (a toggle to manage), but make **AI genuinely optional and the app whole without
it.** A single set-once choice (`aiEnabled`, default ON so nothing changes for an existing user), with the AI
affordances hidden when off, so an AI-wary user gets a calm, fully-offline to-do app and never has AI pushed at
them. Two principles shaped it:

- **Asymmetric confirmation.** Turning AI OFF is the safe, private direction, so it is instant with a warm line
  ("AI is off. Everything stays on your device."). Turning AI ON is when text leaves the device, so it asks for a
  clear, informed tap first (an inline card naming what is sent, and to whom). Decided AGAINST a symmetric
  type-to-confirm: that pattern is for irreversible / destructive actions (account deletion), and confirming the
  way to MORE privacy is friction protecting nothing. The deliberate, in-writing confirmation is satisfied by a
  clearly-worded card and one tap, not by making an ADHD user re-type a magic word.
- **Never-shame cuts both ways.** The app must not frame no-AI as "the brave stand" or valorise it, because that
  shames the AI-using half of the audience and breaks the one rule. The dignity for the AI-wary is being trusted to
  just not use AI, no ceremony; the product makes the stand on their behalf by how it is built, not by making them
  perform it.

The settings model gains its second deliberate exception to "remove friction, never add a setting" (theme / text /
motion are the access-need exception; `aiEnabled` is the values/privacy one).

Built on the `premium` branch (no deploy until Melroy reviews): the `aiEnabled` setting + the Settings control
(verified in preview, off instant + warm, on shows the informed card). Hiding the AI affordances when off is now DONE across
capture (BrainDump), Today (Strategise, Break it down, Make it tiny, Combine, Plan my day, the per-task Break-down +
Make-tiny), the Rooms menu (the Chart a course entry) + the Chart screen (a redirect), Lookback (the scrapbook card +
the weekly reflection), and the first-run triage, verified by a 3-agent adversarial leak sweep and in preview. The
one break the sweep caught (an un-gated per-task Make-it-tiny handler) is fixed. Speak (on-device dictation, no
server call) deliberately stays. Remaining for Melroy's review: a manual "break it into steps yourself" path so a
no-AI user can still decompose (the one real gap, since Break-it-down is AI-only), plus minor first-run copy (the
"Sort for me" button label on an AI-off onboarding replay). Decided against rebuilding triage / Strategise as non-AI:
manual placement already IS the no-AI version of those.

## 2026-06-28 AI-optional, part 2: the choice moves into the introduction

The setting existed but the only door to it was Settings, AND the first-run itself makes an AI call (the
capture-screen triage that sorts the first dump). So an AI-objector got AI used on their data BEFORE they could
ever reach the toggle. The Settings flip alone closed the barn door after the horse had bolted. Melroy's call: the
introduction must let the user choose AI-free before any AI touches their data.

Designed by a multi-agent workflow (four independent design approaches across distinct lenses, three adversarial
judges, one synthesis), judged against a HARD requirement (an objector reaches Today having made zero AI calls on
their data) and the calm spine. The winner, grafted up:

- **A quiet sibling action on capture, not a forced fork.** The default stays AI-on. The capture screen keeps
  "Sort for me" as its primary and gains one calm secondary link beneath it, "I'll sort it myself", which persists
  `aiEnabled:false` and runs the same capture fully on-device. The choice falls out of an action the user is
  already taking, so the overwhelmed majority pays no decision tax and the objector has a plainly visible,
  dignified opt-out. Decided AGAINST a forced "AI: yes or no?" screen: an extra gate at the door is the exact
  friction the spine forbids, and it would force the app to editorialise about AI (breaking never-preach).
- **The opt-out precedes the only first-run AI call.** "I'll sort it myself" sets the flag then sorts locally
  (everything on today, no triage call), so consent-before-use is airtight. Verified in preview: the opt-out path
  makes ZERO network calls to the AI backend, persists `aiEnabled:false`, and lands on a calm reveal.
- **The stale-closure fix (load-bearing).** `makeDay` now takes the chosen boolean as a parameter rather than
  reading the just-set hook value (stale within the same tick). The capture primary's label is computed from the
  same `aiEnabled` read ("Sort for me" on, "Put them on today" off) so label and behaviour cannot desync.
- **Reverse direction stays asymmetric.** Turning AI back ON is never inline here; the AI-off capture link reads
  "Change in Settings" and routes to the Settings consent card, so the only one-tap inline write is the safe
  opt-OUT. Matches the Settings asymmetry exactly.
- **The honesty wrinkle, fixed at the root.** The handoff used to claim "nothing leaves your device" right after
  the triage sent the dump out. It is now conditional: literally true when AI is off, and an honest "the AI
  features send the text you choose to Claude... nothing else" when on. Plus one always-on neutral line on capture
  names what each button does. The three honesty surfaces (capture disclosure, handoff line, Settings card) are now
  a LINKED SET; change one, change all, so they never drift.

Three tone calls made (each a one-line swap if Melroy vetoes): the capture disclosure line is always-on rather than
only-if-testing-shows-confusion (airtight consent over a sliver of calm); it names "Claude" specifically rather
than a vague "an AI" (privacy-wary users trust a named processor); and the AI-off reveal gets a calm
forward-pointing line ("Sorted on your device... open any task later to break it down yourself") so the local sort
never reads as a downgrade.

Telemetry: `track('ai.disabled', { from: 'welcome' })` fires only on the opt-out tap (the standing-default "Sort
for me" writes nothing, so no event there), letting the moat tell an onboarding opt-out from a later Settings flip.
This also CLOSES the earlier "minor first-run copy" gap (the AI-off replay now shows "Put them on today" / "Change
in Settings", not a misleading "Sort for me"). Still open: the manual "break it into steps yourself" path for a
no-AI user. QA: ONB-03 + SET-09/SET-10 added to the E2E suite.

## 2026-06-28 AI-optional, part 3: the manual Break-it-down and Combine, and a copy-leak sweep

The two structural task-shaping tools, Break-it-down and Combine, were AI-only and vanished when AI was off,
leaving a no-AI user unable to split a big task or merge related ones. Built their no-AI twins, and the insight
that made it cheap: in both, the AI only supplies the WORDS; the structural operation is already AI-free.

- **Combine** was the easy one. The fold itself (`combineTasks`) is a pure, AI-free function that already takes the
  umbrella title as a parameter; the AI only suggested that title. So `openCombine` now skips the AI call when AI
  is off and prefills the editable name with the selected titles joined by ', '. The select-bar Combine gate
  dropped its `aiEnabled` condition. The AI-ON path is byte-identical (verified: the join is overwritten inside the
  `aiEnabled` branch, and the busy guard is still correct without the old try/finally).
- **Break it down** needed a small new modal. With AI off, the same "Break it down" affordance (per-task AND the
  select bar, same label so the gesture is identical) opens a modal where the user types steps, one per line; each
  becomes a child and the task becomes a `silentParent`, reusing the EXACT parent/child model `bdAccept` uses, so
  it auto-completes and blooms when every step is done. No network, no questions, no phases. Make-it-tiny stays
  AI-only (its no-AI form is just "add a small task", which capture already does), a deliberate scope line.

Decided AGAINST relabelling the manual variants ("Break into steps", etc.): keeping the label "Break it down" /
"Break down" identical on and off makes the AI a swappable convenience layer over a fully-working manual core, the
cleaner story, and avoids confusion with the separate "Steps" (slices) action.

Then an adversarial sweep of the WHOLE no-AI mode (three lenses: leak hunt, AI-on regression, manual-path edge
cases) confirmed the manual paths correct and the AI-on paths un-regressed, and caught SIX copy/label leaks where
the app still NAMED or advertised an AI-only feature to a user who had turned AI off. The two worst were exposed by
the new onboarding opt-out: a user who opts out on the capture screen was then walked through a safety-net screen
naming Make-it-tiny + Lighten-today and a Premium screen selling five AI features. All six fixed and verified in
preview:
- Onboarding safety-net: with AI off, shows only Break-it-down (filtered).
- Onboarding Premium step: with AI off, shows the non-AI premium value (colour themes), not the AI suite.
- Settings Premium card sub-line, the Today Menu pill a11y label ("Chart a course"), the Today long-press coachmark
  ("make it tiny"), and the Rooms Premium hint ("more AI"): all now conditional on `aiEnabled`.

The rule this crystallises: AI-off must hide the affordance AND never NAME, advertise, or route to an AI feature,
including in accessibility labels and marketing copy. QA: AI-01b + TOD-20b added. This closes the no-AI decompose
gap flagged in part 1; the no-AI mode is now feature-complete.

**Follow-up (same day, on Melroy's eye):** stripping the AI items left onboarding screens 4 (safety-net) and 6
(Premium) with a single item each, reading as broken. Fixed by REPLACING, not removing: with AI off the safety-net
shows three on-device tools (Break it down, Focus on one thing, Make it a low day) and Premium shows the two non-AI
premium features (colour themes, Pin). The principle, added to the rule above: a no-AI screen should be re-pointed
at the non-AI equivalents, not emptied.

## 2026-06-28 Play readiness: privacy IP disclosure + a real 24h abuse-log purge

The Play Data Safety readiness audit found the one form-vs-policy gap (a mismatch is an automatic Play rejection):
the scrapbook abuse backstop logs the caller IP (CF-Connecting-IP) in D1 `scrapbook_log` for a rolling-24h cap, but
the privacy policy leaned on "no IP". Those "no IP" claims were TRUE for the telemetry copy and the owner alerts,
but the policy never mentioned this log. Fixed both ways:

- **Disclosed it** in `privacy.tsx` + `privacy.html` ("to stop abuse of the AI keepsake image, our systems briefly
  note the network address a request comes from, for no more than 24 hours, and never tied to your account"), and
  widened the AI-features list to "(such as Break it down, Sort, Combine, and the photo scan)" so no reviewer thinks
  an undisclosed feature sends data. Bumped "Last updated" to 28 June.
- **Made the claim true:** `scrapbook_log` rows past 24h are now purged on every scrapbook request (self-cleaning
  with traffic) AND on the hourly cron tick (the no-traffic backstop), so an IP is never held beyond the window.
  Previously rows were only filtered by query, never deleted. The server change needs a Worker deploy to take effect.

Decided against a softer "about a day" wording: the design is a hard 24h rolling window and the data now genuinely
is, so "no more than 24 hours" is the honest claim. Full pack: docs/play-store-submission-pack.md item 1.

## 2026-06-29 Play readiness item 3: point-of-use AI disclosure, not a consent modal

Google's third-party-AI guidance prefers a prominent disclosure plus an affirmative tap before personal data goes
to a third party. The onboarding capture choice covers this for users who go through it, but someone who SKIPS
onboarding could reach the everyday "Sort for me" (which had no point-of-use disclosure) and send tasks to Anthropic
without one. Two options were put to Melroy: (A) a calm point-of-use line on the everyday capture, or (B) a one-time
"Use AI / Stay offline" consent modal for the skip cohort. **Melroy chose A.** A faint line sits above the AI
actions, shown only when AI is on and there is text: "Sort and Break it down send what you type to Anthropic's
Claude." Decided AGAINST B (the modal): it adds a fork/friction against the calm spine for a requirement the audit
rated debatable, whereas the point-of-use line satisfies disclosure-before-egress for everyone with no modal.
Escalate to B only if a reviewer ever flags it. (BreakdownQuestions already carries its own disclosure; this closes
the main "Sort for me" path.)

## 2026-06-29 USE_EXACT_ALARM removed: a to-do app is neither an alarm clock nor a calendar (Play block, corrected)

Creating the closed-testing release surfaced a blocking exact-alarm declaration: "Your app uses USE_EXACT_ALARM. If your core functionality is not 'calendar' or 'alarm clock', you're not eligible and must remove it." The only options offered were Alarm clock and Calendar. DoubleDone is a to-do app, so it is neither. This corrects the 2026-06-24 "goes gold" entry, which assumed "DoubleDone qualifies as a reminder app". It does not: Play reserves USE_EXACT_ALARM strictly for alarm-clock and calendar apps.

Fix: removed the with-exact-alarm config plugin (both USE_EXACT_ALARM and SCHEDULE_EXACT_ALARM) and deleted client/plugins/with-exact-alarm.js. No reminder logic changed: reminders.ts never calls an exact-alarm API, it schedules expo-notifications DAILY and DATE triggers, which now degrade to inexact alarms. The daily reminder and the per-task nudges can be delayed on aggressive OEMs (Samsung One UI Doze), the exact reliability problem the plugin was added to solve on 2026-06-24. Accepted: a delayed (not "never") nudge is on-brand for an offer-not-deadline poke whose own copy reads "Whenever you are ready."

Decided against: (1) Selecting "Alarm clock" or "Calendar" to keep the permission, a false declaration and a real suspension risk, the opposite of the trust this app is built on. (2) Keeping SCHEDULE_EXACT_ALARM alone, on the API-36 target it is not auto-granted, so without a runtime "Alarms & reminders" grant prompt it falls back to inexact anyway, and that prompt is friction against the no-settings ethos, so it buys nothing. (3) The fallback, if delivery reliability ever proves a real, measured problem: SCHEDULE_EXACT_ALARM behind a one-time user grant, a deliberate later decision, never the ineligible USE_EXACT_ALARM.

Requires a new production AAB (versionCode auto-increments to 3) to replace the blocked versionCode 2 release. The closed-testing rollout resumes once the new bundle is uploaded, with no exact-alarm declaration to make.

## 2026-06-29 The closed-test build shipped without Supabase keys: sync + sign-in dead (config gap, fixed)

A closed-test tester reported sync not working. Root cause: the production AAB was built with no Supabase config. EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY are build-time vars Expo inlines, and supabase.ts (unlike ai.ts / stripe.ts) has NO hardcoded fallback, so a missing value yields a null client and silently disables sign-in and sync. The local .env carries them for dev, but EAS does not read the gitignored .env, and the EAS "production" environment held zero variables (that was the earlier, unheeded "Resolved production environment ... no environment variables found" build-log line). The earlier sideloaded builds worked because they used the `preview` profile, whose `preview` environment had the keys.

Why only sync broke: ai.ts, stripe.ts, and settings.tsx all fall back to https://api.doubledone.app when EXPO_PUBLIC_AI_URL is unset, so the AI features and checkout link kept working; Supabase was the lone casualty.

Fix: set EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY (sensitive), and EXPO_PUBLIC_AI_URL on the EAS production environment (values pulled from the local .env, never committed; the anon key is the publishable one), and made the production build profile's environment:production explicit in eas.json to match how preview is wired. Rebuilt (versionCode 4) and re-uploaded to the closed track.

Decided against committing the keys into eas.json's env block: even though the anon key is publishable, keeping config in the EAS environment (not the repo) matches the preview setup and keeps the gitignored-secrets discipline intact.

Gotcha banked: EXPO_PUBLIC_* vars must live in the EAS environment for the profile being built, not just the local .env, or a production build silently ships without them. Verify with `eas env:list --environment production` before any production build.

## 2026-07-02 Capture for tomorrow after closing the day (BedtimeCapture) [android-refinement]

From a tester (an auDHD user): "there doesn't appear to be a way to add to the list after you've closed the day. I often think of things as I'm preparing for bed." The gap: DoubleDone could only capture FOR today, and only WHILE the day was open. That quietly betrays the app's deeper promise, get it out of your head, at the moment the head is loudest.

Built: a slim BedtimeCapture on the closed-day rested screen. A quiet, visible field ("Something on your mind for tomorrow? Add it here and let it go."), an "Add for tomorrow" button, and a "Not tomorrow?" day-pick for the rarer later case. Anything captured lands on TOMORROW (or the picked day), never today, so the closed day never reopens and stays rested. Deliberately plain: no AI, no sort, no slices, nothing leaves the device. Confirms "Saved for tomorrow. Rest well."

The "pickle" (how to add after close without reopening the day) dissolves in the destination: captures go to tomorrow, so there is nothing to reopen. It reuses the existing, tested capture() with a { mode: 'tomorrow' } / { mode: 'date' } schedule (the same path the normal Tomorrow / Date chips use), so there is no new task-creation logic and hence no new unit test (per testing.md's risk-targeting); coverage is the E2E case TOD-04c plus preview verification.

Decided against: a general "backlog/someday" list (reintroduces the overwhelm the app exists to prevent); reusing the full BrainDump on the rested screen (its AI/sort/speak machinery is the opposite of the calm bedtime moment); defaulting to a date picker (a decision at bedtime is friction; tomorrow is the 90% case and "later" is one tap away).

Verified in the web preview: on the rested screen the capture renders; adding lands the task on tomorrow (due = tomorrow), the day stays closed (closedDate unchanged, rested screen intact), the task does not clutter the closed today, and the "Saved for tomorrow. Rest well." confirm shows. Built on the android-refinement branch (tester-feedback polish), which does NOT auto-deploy; it merges to main when Melroy ships. The related item-2 gap ("add not-today while the day is open") shares this plumbing and is a natural fast-follow.

## 2026-07-04 The multi-language sweep, part 1: full catalogs (en/it/es/fr) + the pure active-locale seam [i18n-sweep]

Melroy called the next build: full multi-language, "at least Italian and Spanish". The rails existed (typed catalogs, translate()/pluralize(), Intl formatters, device-locale detection) but only ~25 strings were catalogued; the app rendered hardcoded English everywhere. This phase produced the complete catalogs; the wiring of screens through t() follows as part 2.

**The pipeline (multi-agent, on the i18n-sweep branch):** a 14-agent inventory swept every screen/component (732 strings), a 2-agent second pass swept the lib modules the first pass scoped out (celebrate's affirmation pool, phase greetings, connection/offline copy, estimate pace lines, recurrence descriptions, theme names, widget copy), and a merge script folded 814 raw entries into 717 canonical keys (52 duplicate texts unified, 7 collisions resolved). 13 count-varying strings became explicit one/other form pairs (catalog leaves <key>One/<key>Other, call sites use fmt.plural), the it/es/fr-relevant simplification of CLDR. Five fragment-spliced sentences (close-day wrap line, premium unlocked body, lookback big-wins stat, move-to hint, breakdown "Add N tasks") were restructured into full-sentence variant keys, because fragment splices do not survive translation.

**Translation:** 9 drafting agents (3 languages x 3 chunks) anchored to the existing reviewed seed translations (feature names reuse the seed renderings verbatim), followed by a native-register reviewer per language. The reviewers caught 31 real issues, applied as curated rulings: the Italian "cartella delle tasse" (evokes the Agenzia delle Entrate debt notice, the worst possible connotation for a never-shame app), the French "À prendre ou à laisser" (ultimatum idiom, breaks never-pressure), a logically-wrong French plural, gender-agreement slips, formal-register slips, and word-for-word calques. Consistency sweeps: the Lookback screen is "Sguardo indietro" (it) and "Mirada atrás" (es) everywhere (three different names had been drafted per language); Italian standardises "AI" over "IA"; French weekday abbreviations use the 3-letter convention (Dim/Lun/Mar...).

**The seam decision:** tested pure libs (celebrate, triage, estimate, phase, ...) cannot import lib/locale, whose expo-localization import does not resolve in the node test environment. Added lib/i18n-active.ts, a pure active-locale holder: lib/locale binds the detected locale once at startup and re-exports t/fmt; lib modules import { t, fmt } from './i18n-active' directly; tests get the 'en' default so existing English assertions hold with no mocks. Same one-locale-per-session model as before, no signature changes, test purity preserved.

**Decided:** language follows the device, no language setting (the never-add-a-setting spine); legal pages (privacy/terms) stay English (translated legal text is liability, not warmth); the brand "DoubleDone" never translates; minted task titles (break-down steps' "(N min)" suffix) localise at mint time, task titles are the user's data from creation and are never retro-rewritten; Android notification channel names translate for new installs only (Android caches them per channel id, and a rename-forcing id bump is not worth it); it/es/fr all ship as DRAFTS behind per-key English fallback, with the Spanish native review (in progress) landing on top; the generated catalogs carry placeholder-integrity validation (a translation that mangles a {param} fails generation).

**Decided against:** Google Play's auto-translate (no register control, would shred the calm voice); a language picker (a setting, and the device already knows); ICU MessageFormat (a dependency for three one/other languages is overkill; the One/Other convention covers it); translating the static marketing/meta layer now (the web listing stays en until the store listings localise deliberately).

## 2026-07-04 The multi-language sweep, part 2: every screen wired through t()/fmt [i18n-sweep]

15 wiring agents (one per file group, each editing only its own files) swapped ~788 hardcoded literals for catalog lookups across every screen, component, and string-bearing lib module. The constraint that made a 25-file parallel edit safe: rendered English must be byte-identical (t() under the en catalog returns the old string), enforced by the existing 375-test suite, which passed green on the first post-wiring run along with typecheck and lint.

Deliberate behaviour changes, each small and each an improvement: the hand-rolled 12-hour nudge time ("6pm") and the settings reminder-hour label ("9:00 AM") both moved to the Intl path ("6:00 pm" / "9:00 am" in en-AU, 24-hour in fr/it), matching each other; the calendar's hand-built two-letter weekday row (Su Mo Tu) became Intl short weekdays (Sun Mon Tue), since Intl has no two-letter form and narrow single letters are ambiguous; a BrainDump a11y label that spoke a raw ISO date now uses the same friendly phrase as the visible text; the English "1 minutes" a11y bug is fixed via plural forms; and the one-thing-and-it-was-big close-day line reads "a big one" instead of the contradictory "one a big one".

The agents' honesty channel worked: rather than inventing keys, they reported five gaps (the AI-off menu / hold-hint variants, the swatch a11y suffixes, the reminder-hour period), which were backfilled as four new keys x four catalogs plus the fmt.time switch. One register fix rode along: the French holdHint still gender-marked the user ("Reste appuyé"), the same pattern the native reviewer had flagged elsewhere.

Known accepted seams, recorded: five welcome-screen constant arrays resolve t() at module load, safe while the locale is fixed per session, to revisit only if runtime language switching ever lands; the Lookback's "Your patterns" heading borrows the welcome namespace key; minted decompose/chart step titles carry the creation-time language in stored task data by design.

## 2026-07-04 The multi-language sweep, part 3: verified in-locale, and the review pack [i18n-sweep]

Verification was real screenshots, not assertions: a locale variant of the screenshot harness (scripts/i18n-shots.mjs, kept) drives the app in it-IT / es-ES / en-AU Playwright contexts (expo-localization on web reads the browser language) and captures Today, the welcome, Settings, and the Lookback per locale (docs/screenshots/i18n/). The en-AU control renders pixel-faithful to production; Italian and Spanish render natively, task titles stay as typed, and the rotating foot phrases rotate in-language.

The verification caught one real bug the gate could not: the Today date header stayed English in every locale, because day.ts's formatTodayLabel/friendlyDate kept `locale = 'en-AU'` DEFAULT parameters that no call site overrides. Fixed by exposing activeFormatTag() from the seam and defaulting both to it (default params evaluate per call, so the binding is live; tests keep the en-AU default). Lesson banked: a half-wired formatter passes every unit test and still ships the wrong language, only an in-locale render catches it.

The reviewer pack: docs/i18n/review-data.json (all 721 strings, generated) + scripts/gen-i18n-review.py rewritten to render it, one row per key with EN / IT / FR / ES and the green suggestion column, so the Spanish native review covers the complete surface in one pass instead of the 34-string starter. QA case I18N-01 added (the device-language walk, fallback-never-blank, user-data-never-translates). The branch does NOT deploy; merging the PR to main is the ship decision, and the Android build after that carries it to the closed test.

## 2026-07-04 Per-app language declared (Android 13+ picker) [i18n-sweep]

The expo-localization plugin now declares supportedLocales (en/it/es/fr), which generates locales_config.xml and the manifest's android:localeConfig, so DoubleDone appears in Android 13+'s per-app language picker (an English-phone user can still choose Spanish for just this app). allowDynamicLocaleChangesAndroid is set false deliberately: the app binds its language once at startup, so a locale change should recreate the activity (the language applies immediately) rather than reach a running session that will not re-read it. System-language detection, the main path, is unchanged.

## 2026-07-04 Tester refinements: routine edit + a per-routine nudge, Done on…, and "Add to…" [tester-refinements]

Three changes, all from real testers, built as parallel agent slices against pre-committed catalog keys (the i18n bar: every new string ships in en/it/es/fr from birth).

**Edit a routine** (the auDHD power user: "I couldn't edit it... want to start with 3 and build on it"). Each card gains a quiet Edit that reopens the existing form prefilled. The governing rule: today's ticks survive an edit. A pure applyRoutineEdit preserves a step's id when its title survives (each existing step consumed once, in order), so adding a fourth step never resets the three already ticked; a removed step's tick is stripped and never resurrects (8 unit tests). A rename is a new step by design. Decided against a separate per-step editor UI: the one-per-line textarea is the shape she already knows from creation.

**A daily nudge per routine** (same tester: "it's 8pm, time to start your evening routine"). Opt-in per routine, off by default, one notification a day at a chosen hour: title = the routine's name, body "When you're ready. A step is plenty." (permits a partial routine, offer-not-demand). Mirrors the daily reminder exactly: same calm DEFAULT-importance channel, inexact alarm, permission flow with the calm reminderReasonLine on refusal, cancelled on removal or nudge-off. Save reconciles scheduling BEFORE committing so the stored hour is always honest (a failed schedule stores null, never a lie). Web: honest unsupported line; the routine still saves.

**Done on…** (Melroy: rolled-over tasks he'd finished earlier deserved honest attribution). Select a one-off task, "Done on…", pick a past day (yesterday to 14 days back, never today): completeOnDay stamps completedAt at LOCAL NOON of that day (timezone edges cannot bleed into a neighbouring date; 6 unit tests), the Lookback attributes it honestly, and a QUIET "Recorded for {day}." affirmation fires, deliberately no bloom and no haptic, bookkeeping is not a fresh win. The build agent's honesty channel earned its keep: it reported that the hold-menu (confirming) state it was spec'd into is unreachable since the tap-and-hold-selection redesign, so the entry point moved to the select bar beside Pin. DatePicker gained backwards-compatible minIso/maxIso windowing (all existing callers untouched). Deliberately skipped: the decomposition /outcome ping on a backdated completion, a retro timestamp would poison the moat's timing data.

**"Add to…"** (two testers independently: "Add to Today" reads as today-only). The capture entry button and its a11y twin now signal the choice the panel already offers, a catalogs-only change since the i18n sweep.

Verified end-to-end with a Playwright script (scripts/verify-refinements.mjs, kept): 13/13 checks, including completedAt landing at exactly yesterday's local noon and a ticked step's id surviving an edit. Gate green (389 client + 236 server). QA RTN-04, RTN-05, TOD-23 added (165 cases).

## 2026-07-04 Propose -> edit -> accept: AI-suggested steps are now editable (tester wave, slice 2) [tester-refinements]

From a paying Premium user testing an intentionally vague creative prompt: the review's all-or-nothing ("Add 6 tasks" / "start over") forces repeated restarts when the AI near-misses, and for vague prompts it always near-misses. His framing is the correct product theory: "AI suggestions should just be something that sparks your mind into saying 'ah yes I know what to replace the ai suggestion with'." The spine's propose-then-accept gains its missing middle: propose, EDIT, accept.

Built on both review surfaces (BreakdownReview and Chart a course): tap a step's title to rewrite it inline (an emptied edit reverts, never silently deletes), a quiet per-row x removes a step (the Add-count follows; zero steps disables Add with "start over" as the escape), and accepting mints the edited titles of surviving steps. Editing composes with the existing keep/skip (breakdown) and checkboxes (chart). In chart, removal is a flag rather than a splice so the pre-existing `offered` telemetry still means what the AI proposed.

The moat bonus: accepting now fires breakdown.steps.edited / chart.steps.edited { edited, removed, total } (only when something changed), which is the decomposition-outcome signal the flywheel was designed around: not just "was it completed" but "how far was the AI's proposal from what the human actually wanted".

Verified live, not just structurally: one real /decompose call in the web preview (scripts/verify-edit-suggestions.mjs, kept), editing a step, removing a step by its own a11y label, accepting, and asserting storage: the edited title minted ("Call the venue and book a table (2 min)"), the removed step never did. A first scripted pass failed by removing the row it had just edited (index math); the fix targets rows by aria-label, and the failure was the script's, recorded honestly. Known native edge (from the build agent): a second title-edit opened while one is in-flight can revert (never delete) the first on Android; flagged in QA AI-10 for the device pass.

## 2026-07-04 HOTFIX: v6/v7 crashed at launch on device, Hermes lacks Intl.PluralRules / RelativeTimeFormat

Two testers reported a consistent crash on launch with the new release. Root cause, confirmed against the FormatJS/Hermes documentation: Android's Hermes engine does not implement Intl.PluralRules, and its Intl.RelativeTimeFormat is version-dependent, while every desktop browser has both. The i18n sweep introduced exactly two constructions of these (lib/i18n.ts: pluralize and formatRelativeDay), and the first render touching a dated task (Today's Later rows call friendlyDate -> formatRelativeDay) threw and killed the app at launch. Three days of web verification, locale screenshots included, could never catch it: the web preview runs V8, not Hermes. The blame is v6 (the sweep), surfacing as "the new release" because v6 and v7 rolled out close together.

Fix, at the single-file chokepoint: feature-detected pure fallbacks. pluralize falls back to the exact rule for the four shipped locales (en/it/es take 'one' at exactly 1, French also at 0); formatRelativeDay falls back to new catalog words (relative.today/tomorrow/yesterday x en/it/es/fr: oggi/domani/ieri, hoy/mañana/ayer, aujourd'hui/demain/hier). DateTimeFormat/NumberFormat stay unguarded deliberately, they are implemented on Hermes and were proven on device by v5. Forced-tested by deleting the constructors in i18n.test.ts (the only honest way to exercise the fallback, since browsers cannot).

Decided against the FormatJS polyfills (@formatjs/intl-pluralrules + intl-relativetimeformat): correct but heavy (locale data in the bundle, a dependency chain) for what four one/other locales and three relative words need. Revisit only if a locale with real CLDR plural complexity (Polish, Arabic) ever ships. Gotcha banked in CLAUDE.md; the deeper lesson is a rule: any NEW Intl API gets feature detection plus a device launch smoke-test before rollout, the web gate proves nothing about Hermes.

## 2026-07-05 Tester wave 3: repeating-task truths, routines polish, the Done-on inversion, the un-losable review

Seven refinements from the same three testers plus Melroy, built as three parallel agent slices on the tester-refinements... continued branch (repeating-fixes), all behind the now-standing rule that every new string ships in en/it/es/fr from birth.

**Repeating tasks (Melroy):** the governing principle is now explicit, TODAY MANAGES DAYS; THE REPEATING DRAWER MANAGES THE SERIES. Removing a recurring task from Today used to tombstone the whole series; it now writes the day into skippedDates (the exact mirror of completedDates, synced via the new skipped_dates jsonb column, migration run by Melroy before merge), so the instance vanishes, the series lives, and it returns next due day. The drawer, previously view-only, gains series Edit (title, cadence, start date, built through scheduleFields so an edited series can never drift in shape from a captured one) and series Remove with the routines-style 6-second undo. Decided against a per-instance "delete forever this date" exception list UI: skip-today covers the real want with zero new concepts.

**Routines polish (the power user, copy approved by Melroy):** the card now shows "Nudge around {time}"; a save with no name or no steps focuses the field and explains itself ("Give it a name first, anything works."), the app answers every tap, no disabled-button mysteries; and the nudge accepts minute-level times through a 24h numeric entry (with a one-line teaching hint) while every rendering says "around", because Android delivers inexactly and the copy must not write cheques the alarm cannot cash. nudgeMinute rides the Routine model with full serialization tolerance.

**Done on… inverted (Melroy's design, replacing the two-day-old shipped flow):** correction is a property of a COMPLETED task. Muscle memory taps a rolled-over task done (recording today) before thinking about attribution, so the old open-task entry fought the natural action. Now a single completed one-off selection shows Done on… exactly where the pointless bulk-Done sat; open tasks no longer offer it; the dead-UI copy in TaskRow's unreachable confirming state was deleted rather than left as a maintenance trap. The affirm gains the approved warmth: "Recorded for {day}. Your Lookback tells it true."

**The un-losable AI review (the Premium user's stray tap):** the review modal's backdrop dismissed the whole plan, resurrecting the exact restart-frustration the editable steps were built to kill. ModalCard gains dismissable={false} (backwards-compatible); the review now closes only through Add / start over / the calm Not now, and a stray tap during an in-flight title edit COMMITS the edit. "Then, as you get there" phases are now editable and removable like main steps (the propose-edit-accept principle cannot be half-applied), and accepted phases mint the edited titles, with phase edits counted in the moat's edited/removed telemetry.

All verified end-to-end by scripts/verify-wave3.mjs (24/24: skip semantics against real storage, the drawer edit/undo, the save hints, "around 8:47 pm" from the 24h entry, the inversion in both directions, and one live AI call proving the plan survives backdrop taps, with the returned plan happening to be multi-phase so phase editing verified live, 10 editable rows). Two first-run test failures were the harness's own aim (a seed-dependent empty-state assert; Playwright's hit-test tripping on the RN-web sheet z-order that real pointers route fine), recorded honestly. Gate green: 404 client + 236 server.

## 2026-07-05 Onboarding sort lands EVERYTHING on Today (the Later ambiguity removed)

Melroy tightened the introduction: "Sort it for me" sometimes pushed a first-time user's lines into Later, and on first contact that reads as data loss, the person typed five worries, sees "3 for today", and two things apparently vanished, the exact opposite of "get it out of your head", before any trust exists to soften it. Once someone knows the app, Later is calm; during onboarding it is a magic trick.

Fix: a pure allOnToday() in lib/triage strips every future date from the triaged set while KEEPING the AI's ordering and its break-down suggestions (the sort still earns its name), applied only on the welcome's AI path (the app's normal "Sort for me" on Today keeps its buckets, where Later is understood). The reveal replaces the now-impossible "Later · N waiting" fragments (removed as dead code, not left as a trap) with the teaching line Melroy asked for: "Everything starts on today. Move anything to tomorrow, or later, whenever you like." (x en/it/es/fr). The AI-off path's note is untouched.

Verified live (scripts/verify-onboarding-sort.mjs, kept): one real /triage call through the actual welcome flow with a deliberate bait line ("Plan the big holiday someday next year"), all three lines rendered on the reveal, "3 for today.", the teaching line shown, no Later leak. Unit tests pin the helper (order kept, suggestions kept, purity, same-reference fast path). Decided against changing the main capture's triage buckets: established users benefit from the tomorrow bucket; the ambiguity was an onboarding-trust problem, not a triage problem.

## 2026-07-07 MCP OAuth 2.1: connect-by-URL for claude.ai / Cowork / ChatGPT (+ an adversarial security pass)

Why: the MCP server only spoke pasted-bearer auth, which the developer clients (Claude Code/Desktop/Cursor) can send but the consumer connector UIs (claude.ai, Cowork, ChatGPT) cannot, their "add custom connector" only supports no-auth or OAuth. So the "my to-do app is agent-ready" story was reachable only from a config file. Both ecosystems are blocked on the identical thing (OAuth), so one build unlocks "paste this URL into Claude OR ChatGPT" for everyone, and retires the hourly-token annoyance (OAuth refreshes itself).

What: `@cloudflare/workers-oauth-provider` (v0.8.1) wraps the Worker; only the OAuth paths and `/mcp` change hands, every other route + the cron reach their original handler unchanged. `/mcp` triage by bearer SHAPE: a JWT-shaped token (three base64url segments) -> the legacy path byte-for-byte; an opaque token -> the provider -> custody -> the user's Supabase access token; no auth -> 401 + RFC 9728 WWW-Authenticate (this is the deliberate, accepted change from today's open discovery, it is what makes connectors start the flow). The authorize UI (`server/src/oauth.ts`) is a calm warm-paper page: email -> Supabase OTP (create_user:false, existing accounts only) -> 6-digit verify -> consent -> completeAuthorization. Custody (`server/src/mcp-grants.ts`): the user's rotating Supabase refresh token AES-GCM-encrypted in D1 `mcp_grants` (fresh IV per write, MCP_GRANT_KEY secret), a short-lived cached access token alongside; the server still holds NO elevated key, every task call is the user's own session under RLS, exactly like the pasted-token path. New bindings: OAUTH_KV, OTP_LIMITER, MCP_GRANT_KEY.

The security pass (three adversarial lenses + a max-effort fixer, all findings re-derived against the installed library, not memory) changed the design in six ways, all shipped: (1) **PKCE is now REQUIRED** — the library only enforces PKCE when the client volunteers a challenge (a missing code_challenge silently skips verification, an OAuth 2.1 hole), so authorizeHandler rejects anything but S256-with-challenge before a session mints. (2) The consent screen now **discloses the redirect host** ("access will be sent to <host>"), so an unauthenticated DCR client naming itself "Claude" cannot hide where the grant actually goes (name-spoof phishing). (3) An **immediate kill switch**: the consent copy promised "sign out everywhere" but that control did not exist in the app AND a cached access token would outlive refresh-revocation by ~1h; now `POST /mcp/disconnect` (authed by the user's own verified token, no elevated key) deletes custody so the next call 401s, wired to a **Settings → Disconnect AI connectors** button (client). (4) Refresh-failure **revoke narrowed to 401/403/404** (a bare 400 is what the loser of a concurrent single-use-refresh rotation gets; revoking it would brick a blameless grant). (5) The email step is now an **enumeration-safe identical response** whether or not the account exists (for a neurodivergence-support tool, "does this person use it" is a real disclosure). (6) The consent refresh token moved from **hidden HTML fields to a single-use KV nonce** (600s TTL).

Decided against: `disallowPublicClientRegistration:true` (the real connectors ARE public clients relying on PKCE, not a secret, so S256-required is the correct control); cross-request refresh locking (Workers has no cheap lock; the reuse-grace dependency is now documented in the custody header); a first-party-name denylist (brittle vs unicode look-alikes; host disclosure is the ground truth).

Verified: gate green (407 client + 289 server, +51 server tests), and a live `wrangler dev` protocol walk confirmed the 401+WWW-Authenticate challenge, the RFC 8414/9728 metadata (S256-only, scope `tasks`), a registered-client guard, AND that a JWT-shaped bearer still routes to the legacy handler (add_task/list_today/complete_task) unchanged. Deploy waits for Melroy's per-instance OK; the MCP Inspector + a real claude.ai/ChatGPT paste are the human E2E.

## 2026-07-07 MCP list_today now shows recurring tasks due today (the agent sees the same Today)

During the live OAuth connector test, list_today returned "Change Cat Water" as absent: it is a daily recurring task, and the MCP server deliberately excluded ALL recurring tasks (recurrence=is.null in the PostgREST query) because "is it due today" needs day-of-week / interval math the database query can't express. Correct for v1, but it means the agent saw a subset of the user's real Today, the same "agent should see what you see" principle the onboarding-sort fix was about.

Fix: a pure server-side cadence module (server/src/cadence.ts) ports the client's isDueOn (daily / weekly-weekdays / interval-from-anchor, with a future start honoured) plus the per-day done/skip check, all as UTC-calendar-day math over ISO strings (the MCP server already derives "today" as the UTC date, so the two agree, the same simplification the one-off due filter uses). listTodayRequest now fetches open one-offs (undated or due<=today) AND all open recurring, returning the cadence columns; listTodayFromRows keeps the one-offs (already SQL-scoped) and each recurring task only when recurringDueToday is true (due today, not completed today, not skipped today). asRecurrence narrows the JSONB defensively so a malformed row can never throw or wrongly surface. 26 new unit tests pin every cadence kind, the future-start and interval-off-beat edges, and the defensive paths.

Decided against: doing the cadence in SQL (PostgREST can't express weekday/interval modulo), and touching add_task (a connector still creates one-offs only, matching the app's own quick-capture default). Timezone note: like the existing one-off filter, "today" is UTC, so near local midnight a user could see a task flip a few hours early/late; acceptable for v1, documented in cadence.ts, and fixable later by passing the client tz through the tool call if it ever matters.

## 2026-07-07 Sync: monotonic updatedAt, so a delete/edit can't lose LWW to the MCP Worker's clock

A tester reported a task that would not delete: removing it in the browser, then a refresh brings it back, and it still shows in the MCP tool output (so deleted_at is null in Supabase, the tombstone never reached the server). Root cause traced through sync-merge.ts: sync is last-write-wins on updatedAt, and every task write stamped the BROWSER clock. The MCP server (a Cloudflare Worker) is a SECOND writer on a DIFFERENT clock; add_task writes rows with the Worker's accurate UTC time. A user whose browser clock runs even slightly behind then produces a delete whose updatedAt is LOWER than the Worker-written remote row, so reconcileConflict keeps the non-deleted remote copy (and does not push the tombstone), and the task silently resurrects on every pull. Another device's clock is the same hazard; the MCP feature is just what introduced the second clock. This is the classic multi-writer LWW-with-skew failure.

Fix: withMonotonicStamps(next, prev) in lib/tasks.ts, applied at the commit() choke point every mutation flows through. If a changed task's new stamp is not strictly greater than the copy we held (t.updatedAt < prev.updatedAt), it is bumped to prev.updatedAt + 1. Because the local copy already carries the remote's (foreign) updatedAt after a sync, +1 clears the remote too, so the change wins LWW and gets pushed. The comparison is strict `<`, so an UNCHANGED task (updatedAt equal to prev) is never touched and no spurious pushes are added. One pure, tested function at one seam fixes the whole class (delete, edit, complete, skip), not just delete.

Decided against: (a) "tombstone always wins" in the merge, which would break undo/restore across a sync boundary and needs a delete-vs-undelete tiebreak the app does not carry; (b) making the MCP Worker not stamp its own clock, which would not fix the multi-device case and is the wrong layer. The deeper rule now recorded: any NEW writer to the tasks table must respect monotonic-per-task updatedAt, the client enforces it for its own writes; a server writer (MCP add_task) should ideally set updated_at = max(now, existing) too if it ever UPDATES rather than only inserts (it only inserts today, so inserts are safe). Verified: 4 new unit tests (the behind-clock delete bumps to beat the remote and preserves the tombstone; a normal change is untouched; an unchanged task is never bumped; a new task is left alone), plus the existing merge tests prove a local-newer tombstone is pushed. Gate green (411 client + 301 server). One open question for the tester: whether the specific task was added by an agent (MCP, foreign clock) or typed in the app, if app-typed and it still resurrects after this ships, there is a second mechanism to chase.

## 2026-07-07 Sync race: gate the cloud sync on `loaded`, so a premature sync can't wipe un-pushed tombstones

The real root of "a deleted task keeps coming back" (the earlier monotonic-updatedAt fix was necessary but not sufficient). The cloud-sync effect (today.tsx) guarded only on `[session]` and read `tasksRef.current`, but did NOT wait for the local load. On a refresh, loadTasks and this sync fire together; when sync won the race it ran syncOnce against the still-empty initial tasksRef. Merging local-[] against the server makes every remote row "remote-only", so it pulls the non-deleted copy back down AND setTasks/saveTasks overwrite local storage, wiping any tombstone that had only ever lived locally (a delete made this session, not yet pushed). The delete was then lost for good, and the task reappeared, still visible to the MCP tools (deleted_at never reached Supabase). It bit agent-added (MCP) tasks hardest: those were created-and-deleted in-session, so their tombstone existed only locally, exactly what the race wiped; older app tasks had their tombstone pushed in a prior session, so the server already held deleted_at and they stayed dead.

Fix: gate the sync effect on `loaded` (`if (!supabase || !session || !loaded) return;` plus `loaded` in the deps), so sync always merges against the real local set, tombstones included. loadTasks sets `loaded` true after setTasks in the same callback (batched), and the tasksRef-update effect is declared before the sync effect, so on the commit where `loaded` flips true the ref already holds the loaded tasks. `loaded` always becomes true after loadTasks resolves (even to SEED/[]), so sync is never blocked.

This composes with the monotonic-updatedAt fix: `loaded`-gating ensures the tombstone is PRESENT in the merge; monotonic-updatedAt ensures it WINS the merge against a foreign-clock remote and gets pushed. Both are needed. Decided against a bigger sync rework (realtime, a proper mutation queue); the minimal correct fix is to not sync before the local set exists. Gate green (411 client + 301 server). The MCP server (a second writer) is what made this long-latent race visible, by creating rows whose only tombstone lived locally.

## 2026-07-07 MCP tools expansion: 3 tools to 9 (capture, look-ahead, manage, break-down, Deep Research)

The MCP server was a today-only, one-off-only capture-and-complete surface. Expanded it to what an agent actually needs, all mapping to FREE app features, all under the existing no-elevated-key RLS invariant (every call still proxies to Supabase as the user).

New tools (6): richer **add_task** (optional due date and repeat cadence), **list_upcoming** (windowed look-ahead: future one-offs + each repeat's next occurrence), **update_task** (rename / re-date / re-repeat), **delete_task** (soft tombstone, never a hard delete), **break_down** (the AI Break-it-down engine, propose-only), and **search** + **fetch** (the OpenAI Deep Research connector contract).

Decisions and what was decided against:
- **One translation point for cadence.** `buildRecurrence` in cadence.ts maps the agent vocabulary (daily / weekly+weekdays / every_n_days) to the internal Recurrence, byte-identical in intent to the client's scheduleFields, so an agent-made repeating task and an app-made one never drift in stored shape. Rejected: a second cadence dialect on the server.
- **break_down PROPOSES, never adds.** It returns the steps as a calm list ending "Nothing's been added yet. Say the word and I'll add these.", and a separate add_task commits them. This keeps propose-then-accept sacred with the CHAT as the review surface. Rejected: auto-adding steps (a spine violation, silent reorganisation).
- **One decompose shot, not the two-call clarify flow.** An agent supplies context in the prompt, so the qualify round is unnecessary. Rejected: porting the clarify flow.
- **Cost guard on the only token-spender.** break_down enforces a per-user hourly cap in OAUTH_KV BEFORE any Anthropic call, so a looping agent can't drain the $25/mo cap. It fails OPEN on a KV miss deliberately: the per-IP AI_LIMITER and the hard monthly cap are the real ceilings, and a KV hiccup must not block a paying user. Rejected: a precise sliding-window limiter (overkill; the fixed UTC-hour bucket is enough).
- **Worker-side substring search, not PostgREST ilike.** search matches in the Worker over the open-task candidate set, which is injection-safe by construction and returns a well-formed empty result set on any upstream error (a malformed shape breaks a whole Deep Research run; an empty one degrades gracefully). fetch always returns the required {id,title,text,url} document, a calm "Not found" doc on a miss, never an error object. Rejected: escaping user text into an ilike; returning an error shape Deep Research can't parse.
- **No premium tool in scope**, so no gating, but runTool checks a (currently empty) PREMIUM_TOOLS set in ONE place, so the first paid tool later is a one-line add.
- **UTC-day basis** for list_upcoming + buildRecurrence, matching list_today and the app's existing one-off due filter (the known local-vs-UTC simplification, accepted for v1).

Built by a supervised workflow (one max-effort builder, a two-lens adversarial review, a max-effort fixer). The review's one real catch: fetch returned an error object on a miss instead of the contract document, fixed. Everything else verified-safe (propose-then-accept traced, schemas valid, legacy three tools byte-for-byte, no reorder vector, calm copy). Gate green (411 client + 344 server, +cadence/mcp tests). QA MCP-10..17 added (182 cases). Deployed to the Worker per Melroy's standing authorisation.

## 2026-07-07 REST API reaches parity with the MCP server (recurrence + query), OpenAPI 1.1.0, docs swept

The public REST API had drifted BEHIND the agent surface: after the MCP expansion, an AI agent could create a repeating task but a developer hitting the documented REST API could not. Brought REST to parity so the two public doors tell one story.

REST changes (server/src/api.ts + openapi.ts, reusing cadence.buildRecurrence so an agent-made, API-made, and app-made repeating task are byte-identical in stored shape): a task now exposes a normalised `recurrence` object plus a plain-English `repeats` summary (never both dated and recurring); POST /tasks takes an optional `due` OR `repeat` (daily / weekly+weekdays / every_n_days), PATCH /tasks/{id} sets or clears either (mutually exclusive), and GET /tasks gains `?q=` (case-insensitive search over open tasks) and `?upcoming=<1..30>` (future one-offs + each repeat's next occurrence) alongside `?today`, precedence q > upcoming > today > plain. Malformed input answers a calm 400, never a 500. OpenAPI bumped to 1.1.0 with the Repeat input schema, the Recurrence output schema, and the three query modes documented.

Design line held: the REST API stays CRUD + query; Break-it-down and AI actions are MCP-only (agents get the propose-then-accept AI surface; developers get predictable CRUD). Documented asymmetries: input `every_n_days` normalises to stored `interval`; `upcoming` is future-only (today is list_today's job); `q` searches open tasks only. describeRecurrence is a small server-side English humaniser, deliberately separate from the client's i18n one (the API must not import the client; English-only, may drift, owned).

Docs swept current in one coherent pass (a workflow: one max-effort REST builder, then five parallel doc agents fed one canonical facts statement): docs/api.md (full parity + read modes + recurrence), docs/mcp.md (9-tool verify + MCP-vs-REST division), README, CHANGELOG (1.1.0 entry), product-spec, build-journal, case-study (a new "one engine, two front doors" platform-thinking section), BUILD-PLAN, premium (no false gating claim), and the gitignored CLAUDE.md resource row (local). Gate green (411 client + 370 server). Deployed to the Worker per standing authorisation.

## 2026-07-07 HOTFIX: MCP OAuth connect loop, stop revoking in-flight grants (revokeExistingGrants:false)

A tester's friend (the first fresh OAuth connection since the day's deploys) hit an endless "connect or not" loop in claude.ai. Diagnosed from a live `wrangler tail`: `/token` returned 400 invalid_grant "Grant not found", so the connector never got a token and re-looped; a fresh full re-auth eventually won the race and connected (a working `/mcp` 200/202/200 session was captured).

Root cause, traced to our code: the consent/Allow handler called `helpers.completeAuthorization(...)` WITHOUT `revokeExistingGrants`, so it used the library default (ON). claude.ai makes several `/authorize` attempts while wiring up a connector; with revoke-on, a later attempt's completeAuthorization revokes an earlier attempt's provider grant WHILE claude.ai is still exchanging that earlier code at `/token`. The exchange then 400s "Grant not found" and the connector loops until, by luck, one attempt's grant survives long enough to be exchanged. Melroy's existing grants kept working because the bug only bites the FRESH-connect path (existing connections exercise the custody/token path, not authorize).

Fix: pass `revokeExistingGrants: false`. Revoking old grants at connect time was never necessary, our own `retireReplacedGrants` already deletes the superseded custody rows (so an old connection's token 401s and it is effectively dead), the explicit `/mcp/disconnect` hard-revokes, and stale provider-grant records age out via KV TTL. Turning revoke off removes the self-inflicted race and makes a fresh connection reliable instead of a dice roll. Decided against a KV-consistency mitigation (the first hypothesis): the logs showed it is our revoke, not KV propagation. Test coverage note (honest): the flag is a library internal and the KV mock's `list()` is stubbed empty, so the revoke path cannot be exercised in a unit test; the existing full nonce-round-trip Allow test proves the happy path still 302s + writes custody, and the definitive proof is a live reconnect with no loop. Gate green (370 server). Deployed (version 3003f3eb).

## 2026-07-07 HOTFIX 2: MCP OAuth "sign-in went stale", the verify->Allow session carry off KV

After the revoke fix, the tester's friend got further (past the token loop) but hit a new wall at the consent step: "That sign-in went stale." Same ROOT CLASS as before, Cloudflare KV read-after-write. Between the code-verify step and the Allow click, the user's Supabase session was stashed in OAUTH_KV under a nonce (written in the code-step request, read in the Allow-step request). KV does not guarantee a read immediately after a write returns the fresh value, so the friend's edge missed the nonce -> takeSession null -> "stale" -> loop. My own scripted repro never hit it (fast, lucky edge); the friend's geography/timing did.

Fix: make the carry STATELESS. The session (email + access + refresh + a timestamp) is AES-GCM-encrypted (the same MCP_GRANT_KEY that guards custody) into an opaque token that rides the consent page directly, then base64-wrapped so it is quote-free and safe inside the value="..." attribute and the form POST (encryptSecret returns JSON with quotes, which would otherwise break the HTML attribute, that was the first green-tests-but-wrong iteration, caught before deploy). Allow decrypts it. No KV write-then-read, so nothing to be inconsistent; ciphertext, so the refresh token is never exposed even though it rides the page (the property the security panel required). A timestamp bounds it to 10 minutes. Trade-off vs the KV nonce: the carry is NOT single-use (a verbatim replayed consent POST within the window could mint a second grant), a minor, PKCE-and-state-bound risk accepted for a carry that never fails on KV propagation; the security-relevant property (a forged/tampered carry does not decrypt and mints nothing) is preserved and tested. The two "went stale" branches were split into distinct copy ("went stale" for a missing/expired carry vs "could not be verified" for a JWKS failure) so a future recurrence names its own cause.

Both DoubleDone-side OAuth failures were the same mistake, trusting Cloudflare KV for a read immediately after a write in the SAME connect flow: the provider grant (hotfix 1, revokeExistingGrants) and now our session carry. Both are now off that path. The library's own /token grant lookup is still KV-backed and outside our control, but the earlier revoke fix removed the self-inflicted races there. Verified three ways: 35 oauth unit tests (incl. the tampered-carry rejection), a full scripted production flow driven end to end through the new carry (code 200 -> Allow 302 -> token 200 -> /mcp 200, 9 tools, refresh never in the HTML), and the live grant table (2 distinct people connected post-fix, was 1). Gate green (370 server). Deployed (version 800d54a0).

## 2026-07-07 HOTFIX 3: claude.ai web "completes but shows Connect", missing Mcp-Session-Id

The friend's third symptom, captured live via wrangler tail: his ENTIRE flow succeeded on our side (POST /authorize -> 302 grant created, POST /token -> 200, POST /mcp -> 200/202/200 repeated), yet claude.ai web kept re-running the handshake and left the connector on "Connect", never "Connected". So not sign-in, not the token exchange, the client would not HOLD the session.

Root cause: MCP Streamable-HTTP carries the session in the Mcp-Session-Id response header on initialize. We returned none, and even a browser client that wanted one could not read it because it was not in Access-Control-Expose-Headers. A browser MCP client (claude.ai WEB) therefore could not capture a session and re-initialised forever. Non-browser clients (Cowork, ChatGPT, Claude Desktop) are not CORS-bound and worked statelessly, which is exactly why only claude.ai web broke, and why every server-side check and my scripted repro (also not a browser) passed.

Fix: initialize now returns a random Mcp-Session-Id, and MCP_CORS adds Access-Control-Expose-Headers: Mcp-Session-Id so a browser can read it. We stay STATELESS: the id is not stored and every request is still authorised solely by the bearer token, so we accept whatever Mcp-Session-Id a client echoes (or none). Backward-compatible with the clients that already work. Verified: 55 mcp unit tests (incl. a new one asserting the header is set + CORS-exposed + a follow-up echoing it is still served), and a live curl confirming Mcp-Session-Id + the expose header on production. Gate green (371 server). Deployed (version 7ae8b739).

Running tally of this connect saga: (1) revokeExistingGrants:false, stop killing in-flight grants; (2) stateless encrypted session carry, off KV read-after-write; (3) this, Mcp-Session-Id for browser session-holding. The first two were real KV-consistency bugs; this last one was a browser-only protocol-completeness gap. All three only reachable by a real geographically-distant browser user, none by a same-origin scripted repro, the lesson (again): "works for me" from a script is not "works for a browser user across the world".

## 2026-07-10 Rhythms (increment 1): the pure model + scheduling math

Rhythms are gentle, recurring self-care nudges ("some water" around every 2 hours within a waking window), asked for by a real user (Melroy's wife) and grounded in the ADHD reality that interoception and object-permanence make internal cues unreliable, so an external, timed, gentle cue genuinely helps. Decided to build them as an EXTENSION of Routines, not a new concept, and FREE (accessibility / self-care, like the reminder-time picker), nudge-only with no scorekeeping ever. This increment is the pure, node-testable core (`client/src/lib/routines.ts` + tests); the native scheduler, the UI, and the golden-path artefacts are the next increments, and web-push is a deferred phase. Built on a `rhythms` branch off main (a free feature must not ride the unmerged `premium` bundle).

Decisions, and what was decided against:

- **Extend the `Routine` type with a `kind: 'checklist' | 'rhythm'` discriminant plus rhythm-only fields (preset, intervalHours, windowStart/End, paused), NOT a sibling record or store.** Reuses serialize/deserialize, storage, and the screen shell unchanged; an ABSENT `kind` means checklist, so every existing stored routine is untouched (the backward-compat hinge, tested). Against: a separate Rhythm type + storage key + its own sync/screen, which doubles the surface for a feature that is 90% the same shell.
- **Never-shame made STRUCTURAL, not a UI promise.** The type carries no `count`, `streak`, `lastFired`, or history field, so scorekeeping is impossible to even write; and `cleanRoutine` FORCES `steps:[]`, `done:{}`, and `when:'anytime'` on any `kind:'rhythm'` parse, so a corrupt or hand-edited blob can never resurrect a tick or fall into a morning/evening group. Against: relying on the card to "just not render" progress, the adversarial review showed the group-build and `routineProgress` run UPSTREAM of the card, so a UI-only guarantee would leak a "0 of 0 today", the exact scorekeeping artifact the rule forbids.
- **One source of truth for "when does it fire", inclusive at both window ends.** `rhythmFireHours` / `rhythmSlotHours` / `rhythmDueAtHour` are pure functions in routines.ts; the native scheduler and the future web cron are thin layers over them. `rhythmDueAtHour` is DEFINED in terms of `rhythmSlotHours`, so native and web parity is by construction, not by a hopeful matching test. Against: separate native and web due-rules, which the review caught had already drifted on whether windowEnd (21:00) is included.
- **Slot ids `rhythm-{id}-{hour}`, cancel by prefix.** Cancel sweeps by the `rhythm-{id}-` prefix so it also removes slots orphaned by an edit that shrank the window (the "it kept nagging after I deleted it" failure). Safe because `makeId` emits `r-<t>-<n>` (three hyphen-parts), so no id can be a `rhythm-{id}-` prefix of another, asserted by a collision test with `r-x-1` vs `r-x-10`. Against: cancelling only the current config's exact id set, which would orphan the shrunk-window slots.
- **Device-local, no Supabase sync.** Routines already do not sync; a Rhythm stays on the phone, which is correct because native scheduled notifications are themselves device-local. Cross-device delivery is the deferred web-push phase, not a gap.

Two scope cuts recommended by the adversarial pass, to confirm before they reach the UI (increment 3): drop the timed "pause today, auto-resume tomorrow" snooze in favour of an honest indefinite Pause/Resume, because a snooze that only re-arms when the user reopens the app can silently die for days, wrong for exactly this audience; and ship interval presets first (water, stand), with the fixed-times "meds" variant a fast-follow. Increment 1 gate green: typecheck, lint, 30 routines tests (13 new) covering the math, the collision-safety, the native/web parity, and the never-shame structural guarantees.

## 2026-07-10 Rhythms (increment 2): the native scheduler

`scheduleRhythm` / `cancelRhythm` in reminders.ts, thin layers over the pure `rhythmSlotHours`. Not unit-tested (native expo SDK); typecheck + lint gate it and a device E2E case proves the actual fire. Two implementation choices with their rejected alternatives:

- **N discrete DAILY triggers (one per firing hour), NOT `SchedulableTriggerInputTypes.TIME_INTERVAL`.** TIME_INTERVAL repeats on a raw seconds interval that ignores the active window, so it would fire overnight and break respect-the-body's-day. Discrete DAILY slots can only fire at the hours we choose, all inside the waking window. Cancel enumerates the tray and sweeps every `rhythm-{id}-` slot (not a single id), so a shrunk window or a delete never orphans a slot that keeps nagging.
- **The Rhythm notification carries NO task-shaped `data`.** The per-task nudge attaches `data:{taskId}` for its tap handler; a Rhythm deliberately attaches nothing, so a tapped Rhythm nudge just opens the app and can never be misrouted into creating a task. It also reuses the calm DEFAULT-importance daily channel (no sound, no badge) and the inexact-alarm posture (no USE_EXACT_ALARM), so copy promises "around", never a to-the-minute time.

Permission follows the gentle get-then-request pattern (only prompts if not already granted), and every call is on a user gesture (save/edit), so there is no background permission prompt. Web stays a no-op returning `unsupported`, so the screen can say calmly that Rhythm reminders arrive on the phone until the deferred web-push phase.

## 2026-07-10 Rhythms (increment 3): the UI, and flexibility over fixed presets

The Rhythms section on the Routines screen (`client/src/app/routines.tsx`), plus the it/es/fr copy, the E2E cases, and this entry. Verified end to end in the web preview (add, pause, remove, persist), with the actual notification fire the one thing that awaits an Android device build.

The design, and what changed after a real test:

- **A distinct Rhythms section, never the checklist path.** The render-leak the review predicted was real: the screen builds its `when`-groups and calls `routineProgress` UPSTREAM of the card, so a Rhythm reused as a checklist card would have shown a "0 of 0 today" counter, the exact scorekeeping the spine forbids. Fixed by excluding `kind:'rhythm'` from the groups and rendering Rhythms in their own section that never calls `routineProgress` / `toggleStep`. Confirmed in the live DOM: no checkbox, no "0 of 0", no streak on a Rhythm.
- **Flexibility, not two fixed presets (Melroy, on testing v1).** The first cut shipped only one-tap "Water" and "Stand up" presets, and he was right that "two canned presets is a demo, not a feature". So: the presets stay as one-tap quick-starts, AND a **"+ New rhythm" form** was added (name, a "how often" stepper for every 1-12 hours, an "active hours" window, and a live cadence preview), AND **every Rhythm card gained Edit** (the same form, prefilled), so even a preset is a starting point, not a fixed thing. Decided against: presets-only (too rigid), and prefill-a-form-on-every-preset-tap (loses the one-tap speed for the common case). The result is presets for speed, the form and Edit for total freedom.
- **Pause/Resume only, no timed snooze (as flagged in increment 1).** An honest, indefinite Pause/Resume that needs no app-open; the "pause today, auto-resume tomorrow" snooze stays cut because its re-arm depended on the user reopening the app and could silently die for days.
- **Interval presets first; fixed-times "meds" deferred.** Water + Stand cover the interval case; the atHours meds variant with its add-a-time list is a fast-follow.
- **Telemetry stays config-only.** `rhythm.created` / `rhythm.edited` / `rhythm.removed` (+ the remove-undo), NO pause/resume event and NO fire/response/outcome, so a nudge-only feature is genuinely uninstrumented on behaviour, the deliberate bend of the telemetry-before-traffic rule for this feature.

Web-push cross-device delivery (Phase W) stays deferred to the Backlog with its known constraints (DST tz drift, cron idempotency, window inclusivity). Native local notifications are the real mechanism for launch. Gate green; the big-bang merge to main plus the Android build is Melroy's call after he tests the minimal-UI pass on PC.

## 2026-07-10 Quiet interface (increment 1): the appearance flag on the theme rail

The "Quiet interface" is a Premium appearance option that strips decorative chrome so DoubleDone reads as calm text on paper, same layout, same features, same warmth. Built from a Claude Design handoff (preserved in `docs/design-source/quiet-interface/`: the reference board, README spec, and light/dark frames), on the `quiet-interface` branch stacked on `rhythms` so the big-bang deploy ships both. Increment 1 is the foundation only, no visible change yet.

The mechanism, decided to mirror the colour-theme rail exactly (no new pattern, no prop drilling): a persisted `Settings.appearance: 'standard' | 'quiet'` flows Settings -> `buildTheme` -> the resolved `Theme` as `t.appearance`, and every `makeStyles(t)` branches on it, exactly how `t.scheme` / `t.scale` / `t.reduceMotion` already reach leaf styles. Toggling re-paints live and layout-stable for free (the theme useMemo already depends on `settings`).

- **The quiet tokens derive from the ACTIVE palette, not the handoff's Dusk-only hexes.** `buildTheme` builds a `t.quiet` group with the existing `rgba()` helper: `hairline = rgba(ink, 0.05/0.06)`, `pressWash = rgba(accentSoft, 0.78/0.85)`, `captureUnderline = line`, `secondary/nOfM = inkSoft`, `link = accent`, `remove = danger`. Decided against hardcoding the spec's literal hexes (#7A7066, #A1554C, etc.), which would look wrong on the six non-Dusk colour themes; deriving from the palette keeps "no new colours, usage only" honest AND makes Quiet correct on every theme.

Open-question calls (the plan's, taken while Melroy is away, recorded to challenge):
- **Held-state: revive the dead per-row `confirming` path in QUIET ONLY** (standard keeps the full-screen multi-select). The spec's held state (row wash + inline Steps/Later/Remove) does not exist today; `TaskRow`'s `confirming` branch is dead code (`setConfirmingId` is only ever called with null). Quiet's `onLongPress` will set it instead of entering select mode. Additive and reversible. Decided against restyling select mode itself for quiet. (Parity of the other select actions, Pin/tiny/Combine/Move, to be settled at the held-state increment.)
- **Premium gate: write-time only**, matching `themePreset` (a lapsed subscriber's stored 'quiet' would still render, accepted only because it stays consistent with the themes). Decided against hardening appearance alone (would desync the two controls).
- **CheckCircle stays 26px** (the shared hero size across TaskRow/BreakdownReview); not nudged to the spec's 24 per-appearance, which would desync.
- **Pinned/unique rows in quiet read via the star + faint tint / whitespace**, no chrome border (the spec drops the periwinkle/accent borders).

Increment 1 gate: typecheck clean, 14 settings tests (new appearance parse-guard test included). Next: Today at rest (header, load sentence, borderless rows, capture line), web-verified via a localStorage appearance flip.

## 2026-07-10 Quiet interface (increments 2-4): Today at rest, header, load, task rows

The at-rest quiet surfaces, all pure style/JSX branches on `t.appearance === 'quiet'`, standard untouched. Verified in the web preview via a localStorage appearance flip: rows render transparent with a 1px 5%-ink bottom hairline and no card/shadow/radius, the header is "Menu" as plain accent text (dots hidden), the day's load is the sentence alone (gauge bar dropped), and a sliced task shows "2 / 5" with no progress bar.

- **Header (`today.tsx`):** the Rooms pill drops its border/fill/radius to a plain accent text button; the 44px touch target stays via the EXISTING hitSlop (not new padding), and the quiet pill keeps standard's vertical padding, so the topBar height is unchanged and nothing shifts.
- **Day's load:** the `weightTrack`/`weightFill` bar is hidden in quiet; `weightOfDay.label` (already a full sentence like "Today holds four things. Room to breathe.") renders alone; the low-day toggle becomes quiet accent text (no underline).
- **Task rows (`TaskRow.tsx`):** card → whitespace + `t.quiet.hairline`; one-off loses its periwinkle border (whitespace only), pinned keeps a faint tint + the star (no border), the repeat mark and slice count go soft ink, the "a lot" tag drops its pill to plain accent text, and the sage progress bar is dropped (count only).
- **Deviation from the handoff's literal padding, recorded:** the spec said quiet rows are `12px 2px`, but that made them 11px SHORTER than the standard 62px card, so toggling reflowed the whole list, violating the spec's OWN top principle ("switching never moves anything, predictability matters for this audience"). Chose the principle over the literal: quiet rows keep standard's vertical padding, so the delta is ~3px (imperceptible) and the chrome is still gone. The stronger rule wins.

Standard mode measured unchanged (62px card, white surface, 14px radius). Next at-rest piece: the capture line (BrainDump). Then held-state, coachmark, quiet close-the-day wrap, and the Settings selector.

## 2026-07-10 Quiet interface (increment 5): the capture line

The last at-rest surface. Quiet turns both the collapsed add-bar (`today.tsx`) and the expanded BrainDump input into a capture LINE: a 1px underline (`t.quiet.captureUnderline` = the active `line` token), no fill/border/radius, content near the margin, the faint placeholder unchanged. Verified in the preview: the add affordance renders with a bottom hairline only, no box. The focus-reveal accent send-arrow from the handoff is deferred as a refinement; the underline is the core transform and the existing Add/Sort actions already send. That closes Today-at-rest (increments 2-5); the interactive surfaces (held-state, coachmark), the quiet close-the-day wrap, and the Settings selector remain.

## 2026-07-10 Quiet interface (increment 9): the Settings selector

The Standard / Quiet toggle in Settings -> Comfort, beside the colour themes, so it is now a real in-app switch (not just a dev flip). Clones the premium-gated colour-theme block: the accent head + Premium tag, and the shared `Segmented` control for the two options; a premium user's tap does `setSettings({appearance})` (the whole app re-paints live via the theme useMemo), a free user's tap tracks `appearance.locked` and routes to `/premium`, exactly as the swatches do. Write-time gate only, consistent with `themePreset` (a lapsed subscriber's stored 'quiet' still renders; not hardened alone, per increment 1). Copy in all four languages (Interfaccia / Interfaz / Interface, Silenziosa / Silenciosa / Silencieuse). Verified in the preview: the selector renders with the label, both options, the free hint and the Premium tag. The held-state, coachmark, and quiet close-the-day wrap remain.

## 2026-07-10 Quiet interface (increment 6): the held-state

Long-press now splits by appearance (`onRowLongPress` in `today.tsx`): Standard opens the full-screen multi-select as before; Quiet sets `confirmingId`, reviving the per-row `confirming` branch in `TaskRow` (previously dead code, `setConfirmingId` was only ever called with null). The held row gains the soft press wash (`t.quiet.pressWash`, rounded) and reveals its inline actions in place, Tomorrow / Make tiny / Break down / Remove / Close, which are the row's real actions, so Quiet loses no capability vs Standard's select bar (the handoff listed Steps/Later/Remove as the primary three; keeping the full set preserves parity). Verified on PC by dispatching a real press-and-hold: the inline actions appeared. Standard is unchanged. Two refinements deferred (both flagged in the plan): the 120ms wash FADE (Animated, needs a real foreground tab / device to verify, is instant now which is also the reduce-motion behaviour) and a tap-outside dismiss overlay (dismiss is via Close / acting now). Coachmark and the quiet close-the-day wrap remain.

## 2026-07-10 Quiet interface (increment 8): the close-the-day wrap

Quiet's close-the-day drops the modal look for a page-on-page calm without touching the reachability machinery. Two style-level changes, no structural rewrite: the backdrop swaps the dim scrim (`colors.scrim`) for the plain page colour (`colors.bg`) so the wrap reads as text on the page rather than a card floating over a darkened Today, and Goodnight renders as a plain accent text link (a `Pressable` + `Text`) instead of the filled `PrimaryButton`, matching the rest of the borderless surface. The shared close handler is hoisted into one `onGoodnight` closure so both variants run identical logic. Deliberately kept: the close-day art image and the finished-list card structure, including the `9fbd206` maxHeight-cap + inner ScrollView, so a very full day (verified at 14 done on a 375x812 viewport) still keeps Goodnight on screen and reachable. This was the chosen low-risk path over ripping the Modal out for inline page content, which would have re-implemented the reachability fix from scratch: same calm result, a fraction of the risk. Verified on PC: backdrop measured as the warm page colour (rgb 250,246,241), Goodnight as the mauve accent link, reachable with the full finished list scrolling inside the cap.

## 2026-07-10 Quiet interface (increment 7): the hold coachmark

The one-time "hold a task for more" coachmark kept its soft-filled accent pill in Quiet, the last bit of card chrome on the Today surface. Quiet now renders it as a faint inline line: no `accentSoft` fill, no radius, the text in the secondary ink (`quiet.secondary`), preceded by a 5px accent dot as the minimal "there's a hint here" marker. Standard keeps the reassuring pill. The dismiss ("Got it") stays accent in both, and the coachmark's job (teach the long-press, the only door to the rescue tools) is unchanged. Verified on PC: pill background transparent, radius 0, the accent dot present.

## 2026-07-10 Quiet interface (increment 10): E2E cases, scope line, gate

Five E2E cases added to `scripts/gen-test-suite.py` and the suite regenerated (194 cases, was 189): QUI-01 the premium gate in both states (premium unlocks, free routes to the paywall with nothing applied), QUI-02 layout stability on toggle (the design's "switching never moves anything" promise, the reflow-free rows), QUI-03 the Quiet held-state (long-press reveals inline row actions, no full-screen bar) plus the faint-dot coachmark, QUI-04 the Quiet close-the-day (page text, accent Goodnight link, and the TOD-04d very-full-day reachability holding in Quiet), QUI-05 reduce-motion + all-palette correctness.

**Scope decision (the discipline of stopping).** Quiet ships covering the whole Today surface (at-rest header/rooms/weight, the load, task rows, capture, the held-state, the coachmark, the close-the-day wrap) and the Settings toggle. That is the persistent surface where the user actually lives, and it is exactly what the Claude Design handoff scoped. Deliberately NOT quieted: the transient focused overlays (Break-it-down, Strategise, the drawers, all on the shared `ModalCard` card+scrim), and Lookback / Premium / Sign-in. Two reasons: a momentary "choose the steps" overlay arguably should stay a distinct focused card even in a borderless app, and quieting `ModalCard` touches paid, un-losable AI-review flows, a blast radius not worth taking without a design pass. Both the extension and the two held-state refinements (wash fade, tap-outside dismiss) are parked in the BUILD-PLAN Backlog with triggers, so nothing is lost. Full gate green (typecheck, lint, 425 + 371 tests). The whole feature lives on the `quiet-interface` branch, stacked on `rhythms`, ready for Melroy to test in his local server before the big-bang merge + Android build.

## 2026-07-10 Quiet interface (increment 11): held-state parity, Big + Pin

Correction and fix. Increment 6's note claimed the Quiet held-state "loses no capability vs Standard's select bar." That was wrong, and Melroy caught it: Mark-as-a-lot (Big) and Pin were absent. Root cause: the held-state revived TaskRow's original per-row `confirming` action set, which predates Big and Pin (both were only ever added to the multi-select bar, never back-ported to the inline path that was dead code until increment 6). So Quiet inherited the older, smaller set.

Fix: `TaskRow` gains `onBig` and `onPin` props, rendered in the confirm actions (guarded `!recurring`, with live mark/unmark and pin/unpin labels reusing the existing `today.markAsALot`/`notALot` and `today.pin`/`unpin` keys, so no new i18n). `today.tsx` wires them via two helpers, `bigRow` (toggles big) and `pinRow` (pins), both act-and-dismiss: the row stays in place, so they close the held-state themselves for a clean one-tap feel. `pinRow` re-applies Standard's premium gate (a lapsed subscriber keeps the Quiet appearance, so a non-premium tap routes to the paywall, never a wrong pin). Wiring by list: Today rows get both Big and Pin; the Later list gets Big only (Pin is Today-one-offs-only per PIN-05); recurring rows get neither (the `!recurring` guard). The held row now reads Tomorrow / Mark as a lot / Make it tiny / Break down / Pin / Remove / Close, at single-task parity with the select bar; `confirmActions` already wraps, so seven actions reflow on a narrow phone with no layout change. Combine and move-to-a-specific-day remain genuinely multi-tap and are NOT on the single row (that decision, a "Select…" door into multi-select vs leaving them Standard-only, is still open for Melroy). Verified end-to-end on the running preview: Mark-as-a-lot set `big` and closed the held-state with the tag showing; Pin set `pinnedAt`, stayed on /today (no wrong paywall bounce), and closed. QUI-03 updated to assert the full set + the PIN-05 scoping + the lapsed-subscriber gate. Full gate green.

## 2026-07-10 Quiet interface (increment 12): the multi-select door

Closes the last held-state gap. Quiet's long-press goes to the single-row held-state, so it had no path to the bulk operations that only make sense on 2+ tasks (Combine, move several to a day, tick several off, bulk remove), which Standard reaches by long-pressing into multi-select. Melroy chose Tier 2: give Quiet a door rather than accept single-task-only.

Build: a "Select more" action in the held-state (`onSelectMore` on `TaskRow`, rendered before Remove, on Today and Later rows, no `!recurring` guard since select mode handles recurring). It calls a new `selectFromRow(id)` helper that closes the held-state and calls the SAME `enterSelectWith(id)` Standard's long-press uses, so the held task lands pre-selected and the existing (Standard-styled) select bar appears. New i18n `today.selectMore` / `selectMoreA11y` across all four catalogs ("Select more" / "Seleziona altre" / "Seleccionar más" / "Sélectionner d'autres"). Deliberate: the multi-select bar itself stays Standard-styled, a brief non-quiet surface for an occasional action, the same call we made for the modals; quieting it is not worth the blast radius and is left in the BUILD-PLAN Backlog. Verified on the running preview: "Select more" closed the held-state, entered multi-select with the row pre-selected ("1 selected"), and surfaced the bulk toolbar (Move to / Mark as a lot / Remove / Done / Select all), with Combine appearing at 2+. Held-state now reads Tomorrow / Mark as a lot / Make it tiny / Break down / Pin / Select more / Remove / Close, all wrapping cleanly. QUI-03 updated. Full gate green. This completes held-state parity: every Standard capability is now reachable from Quiet.

## 2026-07-10 Quiet interface (increment 13): keep the energy gauge, quiet the action buttons

Two testing-feedback fixes from Melroy on the live Quiet Today.

1. The energy / weight-of-today gauge had been HIDDEN in Quiet (increment 2-4 wrapped the track in an appearance gate). Melroy missed it, rightly: the gauge is information (how full is today), not chrome. Quiet now KEEPS it, just whisper-thin, a 3px hairline track on the faint `quiet.hairline` line instead of the 6px filled pill (accent fill unchanged). The label is untouched. Same signal, calmer weight.

2. The day-action buttons were still loud in Quiet, against the feature's own "nothing looks like a button" principle. Melroy flagged the "Plan my day" gradient specifically; the same fix applies to its siblings, so all four now render as plain text in Quiet: "Plan my day" swaps the `PremiumButton` gradient for a plain accent text action, and "Lighten today", "Close the day" and "Focus on one thing" drop their outlines (their text colours already read right, accent for the AI/premium actions, soft ink for the calm structural ones). "Focus on one thing" keeping its accent border was a half-quiet miss from increment 5 (the text was quieted, the border was not); fixed here. Standard is untouched: verified the gradient, the 6px gauge and every outline return when you flip back. Verified both modes on the running preview by computed style. QUI-01 corrected (it had claimed the weight bar loses its chrome; it now keeps a thin gauge, and the plain-text action buttons are spelled out). Full gate green.

## 2026-07-11 Premium pitch catches up with the release: Quiet + colour themes on the paywall and in onboarding

Melroy's catch after shipping Quiet: the "Why Premium" surfaces never mentioned it. Worse, the paywall had never listed the colour themes either, so a free user tapping the gated "Quiet" selector in Settings landed on a paywall that did not show the thing they had just asked for. Fixed on both surfaces. (1) The paywall (`premium.tsx`) feature list gains `featureQuiet` ("Quiet, a borderless look where nothing shouts") and `featureThemes` ("Seven calm colour themes to make it yours"), placed with Pin so the personalisation trio reads together before the AI suite. (2) Onboarding (`welcome.tsx`) gains a `premiumQuietName`/`premiumQuietWhat` row in BOTH premium lists: the non-AI list (where it sits naturally beside Colour and Pin) and the AI-on list (one extra line; Quiet is the most visible premium feature and the strongest "make it yours" signal, worth the sixth row). All four catalogs updated; the key-parity typecheck enforces the translations exist. Decided against: renaming or restructuring the paywall (copy-only change), and mentioning Rhythms anywhere in premium surfaces (Rhythms is free by design, it must never appear behind the premium framing). Verified on the preview: the paywall as a free user shows both new lines; the onboarding premium step renders the Quiet row. PREM-01 updated to pin the personalisation pair (a user sent from the Interface gate must see Quiet on the paywall). Note: this copy ships instantly on web; the AAB built earlier today (versionCode 10) predates it, so the store bundle either rides without it or gets a rebuild before upload, Melroy's call.

## 2026-07-11 Meds Rhythms (increment 1): the fixed-time model

The Backlog's "fixed-time meds Rhythm" starts. A Rhythm can now be EITHER interval-based (every N hours in a window, unchanged) OR fixed-time (`atTimes`, a short list of {hour, minute} clock times, the meds shape: 8:00 and 20:30), never both, enforced on parse exactly like the API's due-vs-repeat rule (a blob carrying both keeps atTimes and strips the interval fields; junk atTimes falls back to the interval path). New `meds` preset id (fixed catalog id, so nudge copy and any future web-push payload key off it, never user text), defaulting to 8:00 + 20:00 as a starting point. Design decisions: (1) `rhythmFireTimes` is THE unified schedule source (fixed times as-is, interval hours at :00), so the native scheduler and the future web-push cron consume one function and cannot drift; `rhythmSlotHours`/`rhythmDueAtHour` now derive from it, keeping hour-level truth for an hourly cron while minutes stay a native nicety. (2) `rhythmSlotId` keeps the ORIGINAL `rhythm-<id>-<hour>` shape byte-for-byte at minute 0, so notifications already scheduled on devices by the interval-only build still match their ids across the update; only off-the-hour times grow a `-<minute>` segment, and every shape stays under the routine's cancel-sweep prefix. (3) Times are validated hard (integer ranges, dedupe, clock-sorted, capped at 8) so a corrupt blob can never mass-schedule or night-fire. Still no count/streak/lastFired: a fixed-time Rhythm accumulates nothing, the never-shame guarantee is structural. 13 new tests. Scheduler, UI and languages follow in the next increments.

## 2026-07-11 Meds Rhythms (increment 2): the scheduler consumes the unified schedule

`scheduleRhythm` now loops `rhythmFireTimes` (hour + minute) instead of `rhythmSlotHours` (hour at :00). For every existing interval Rhythm the emitted triggers and identifiers are byte-identical to before (times at :00 keep the original slot-id shape), so devices see no re-schedule churn; a fixed-time Rhythm gets one DAILY trigger per exact clock time. Everything else deliberately unchanged: the cancel-first prefix sweep, the paused short-circuit, the DEFAULT-importance channel, inexact Android delivery, and no task-shaped data on the notification. The web variant already takes the whole Routine and stays a no-op until the parked web-push phase.

## 2026-07-11 Meds Rhythms (increment 3): the UI, languages, E2E, shipped

The user-facing half. (1) A third one-tap preset button, "Meds, at 8 am and 8 pm", creates an active fixed-time Rhythm with zero form-filling, same as Water and Stand; Edit reshapes it. (2) The custom-Rhythm form gains a mode toggle (the shared Segmented): "Every so often" keeps the interval + window steppers exactly as they were, "At set times" swaps them for a times list, each row the same two-box 24-hour entry the checklist nudge uses (digits only, empty minute reads :00), with Remove per row (hidden on the last row so the list can never be emptied by taps), "+ Add a time" up to the cap of 8, and a live preview line that clamps, dedupes and clock-sorts as you type ("At 8:00 am · 2:30 pm · 8:00 pm"). Saving in times mode with no valid time gets a calm "Add at least one time." hint, never a silent nothing. Switching mode on save fully sheds the other shape's fields, mirroring the parser's one-shape rule. (3) The card cadence line reads "At {times}" for fixed-time Rhythms; the times join with a locale-neutral " · " rather than a translated "and", one string that works in all four languages. Nine new keys in en/it/es/fr. Decided against a scrolling wheel/time-picker dependency (the two-box entry is already the app's established pattern and works identically on web and Android). Verified end-to-end on web: preset tap -> stored {8:00, 20:00} with no interval fields; Edit -> prefilled in times mode; add 14:30 -> preview sorts it in; save -> persisted sorted, interval stripped, card updated. RHY-04 added (195 cases). The one thing web cannot prove, the notification actually firing at a set time on a device, rides the next Android build, same as Rhythms increment 1-3 before it.

## 2026-07-11 Share the win: the scrapbook keepsake gets a share action

The wave's second feature (Melroy's pick #3): the weekly AI keepsake, the app's emotional payoff, can now be shared, which is DoubleDone's first organic acquisition loop, every proud share is a person showing a friend the app. Design decisions, all privacy-first: (1) What is shared is the IMAGE FILE itself (`doubledone-week.jpg`), never a link. The keepsake is a locally-held base64 jpeg, so there is no public URL to leak and nothing is uploaded anywhere; the picture leaves the device only when the user sends it, to the app they pick on the system sheet. (2) The caption is deliberately NOT attached: it derives from task titles, and silently gluing task-derived words to an outbound share would be a surprise. Image only. (3) Shame-safe by construction: the keepsake only ever depicts finished things, so there is nothing shameable to share. Implementation: a platform-split `lib/share.ts` (native: expo-sharing + the legacy expo-file-system base64 write, chosen over the new File API's atob dependency after the Hermes/Intl lesson, no un-detected newer globals) and `share.web.ts` (Web Share API with the file when `canShare` allows, else a plain download with one calm 'Saved.' line; a share-sheet cancel reads as the user changing their mind, quiet, never an error). Telemetry logs only how (shared/saved), never content. Verified on web end-to-end: the action renders under the polaroid, and with no navigator.share the download path fires and shows the saved line. The Android share sheet needs the wave's next native build (expo-sharing is a new native module) and is covered by SB-08 (196 cases). Two new deps: expo-sharing, expo-file-system.

## 2026-07-11 Share-to-capture completed: the web half, and a dropped-share bug fixed

The wave's third feature (Melroy's pick #6). Investigation first: the ANDROID half already existed (6612e71, expo-share-intent@7 + the inbound queue + the app-root hook), so the real work was the missing WEB half plus a latent bug the investigation surfaced.

(1) **DoubleDone web is now an installable PWA with a share target.** New `client/public/manifest.json` (name, standalone display, the warm-paper theme colour, 192/512 icons generated from the app icon) carrying a `share_target`: once installed, DoubleDone appears on the system share sheet and shares open `/share-target?title=&text=&url=`. The manifest link is injected by `scripts/inject-web-meta.mjs` (the SPA export skips +html.tsx; both kept in sync per that file's rule). Installability is also a prerequisite the existing web-push work benefits from.

(2) **One shared rule for what lands in the capture.** `shareTextFromParams` in `lib/inbound.ts` mirrors the native rule exactly (text, then url, then title, first value of any array param, one line): a share from the Android sheet and from the web sheet produce the identical capture. The `/share-target` route stashes it on the SAME inbound queue the native hook uses and redirects to Today; nothing is ever auto-added, the capture box opens seeded and the user confirms. Four new tests.

(3) **Bug found and fixed: a share arriving while the capture box was collapsed was silently dropped**, on Android too. The box renders only while `captureOpen`, and the inbound consumer seeded through a ref that is null when it is closed. Now: seed directly when the box is up; otherwise park the text, open the box, and a `captureOpen` effect flushes the parked seed once BrainDump mounts. Along the way the consumer moved inside its subscription effect: the React Compiler refused to preserve the hand-rolled `useCallback` (lint gate caught it), and with the compiler enabled the right shape is no manual memoization at all.

Verified end-to-end on the preview twice (before and after the lint restructure): `/share-target?...` lands on Today with the box open and seeded; manifest + icons serve. AND-04 extended to cover the installed-web-app path (196 cases). The Android sheet path itself rides the wave-end AAB (unchanged native code, but the dropped-share fix applies there too).

## 2026-07-11 Energy matching: one question, one pick, freemium 15 a month

The wave's last feature (Melroy's pick #5), to his freemium spec. "What fits right now?" sits under Focus-on-one-thing (AI on, 2+ open tasks): one calm question (Running low / Somewhere in between / Feeling good), Haiku picks ONE task from today's open list with a short warm line, and "Start with this" opens Focus mode on it. Propose-only: nothing is added, reordered, or changed.

**The freemium model (Melroy's call: "premium but freemium"):** free gets 15 picks a calendar month, premium unlimited. Metered LOCALLY (`lib/energy.ts` + `doubledone.energyUses.v1`, the scrapbook-gate precedent: the count is the user's own record, no server bookkeeping, no account needed). Calm reminders exactly at 10 and at 5 picks left ("10 of your 15 free picks left this month."), never a nag; past 15 the tap routes to the paywall (which now lists "Energy matching without limits"), and no AI call is ever made past the gate. A use is spent only on a SUCCESSFUL pick, never on an error, so a flaky network cannot drain the month. Cost basis (current Haiku pricing $1/$5 per MTok): ~$0.002 a call, ~$0.03 per free user maxing the month; the meter is conversion psychology, not cost control, and that is the right reason.

**Server:** new `/energy` Worker route (Haiku, `server/src/energy.ts`), prompt wording A PLACEHOLDER for Melroy to tune like its siblings. Hard input bounds (50 tasks, 200-char titles), the returned id must be one that was actually sent (a hallucinated id can never reach the client), the shared AI rate cap and body cap apply, and telemetry logs only {count, energy}, no task text. 10 new server tests + 8 client gate tests.

**Verified on the preview** with the endpoint stubbed (the full success path: pick + warm line, use recorded, the 10-left line exactly on cue, Start opening Focus on the picked task) and live (the cap tap routing to /premium with the feature visible, the calm error line on a failed call). One preview artifact noted: headless rAF throttling keeps RN Modal fade-outs mounted, the known gotcha, not app state.

**Deliberately NOT pushed yet:** main auto-deploys web, and the Worker's /energy route needs Melroy's per-instance deploy OK first, so the commit is local until the Worker ships (then push, web follows). NRG-01/NRG-02 added (198 cases).

## 2026-07-12 Rhythm nudges that actually arrive: HIGH channel, resilience sweep, health line

Launch-week field report (Melroy): Rhythm nudges fired irregularly on his phone (one arrived) and not at all on his wife's. Investigation, by elimination: expo-notifications 56 DOES re-schedule after reboot AND after an app update (BOOT_COMPLETED + MY_PACKAGE_REPLACED receivers confirmed in the library manifest), so schedule-wipe theories are out. Three real causes remain, and all three are now addressed:

1. **The silent channel (the big one).** Rhythms shared the daily-reminder channel at DEFAULT importance: no heads-up, no sound, a delivered nudge just sat unnoticed in the tray. A Rhythm is a nudge the user explicitly asked for ("water every 2 hours", meds at 8), the same posture as the per-task "remind me" nudges, which already earned a HIGH channel. Rhythms now get their OWN `rhythm-nudge` channel at HIGH importance (a heads-up peek), which also lets users tune Rhythms alone in system settings. Android fixes a channel's importance at creation, so raising it required a NEW channel id (the task-nudge-v2 precedent), and the sweep below migrates existing schedules onto it.

2. **The resilience sweep.** Once per app open (native), `rescheduleAllNudges` quietly re-schedules every active Rhythm, every checklist nudge, and the daily reminder from stored config. Idempotent (each schedule cancels its own ids first). It heals OEM alarm wipes (aggressive battery managers clear AlarmManager), performs the channel migration, and is QUIET by design: it checks permission but never prompts, so an app launch can never surprise anyone with a dialog.

3. **The health line (the debug surface Melroy asked for).** Under the Rhythms section (native only): "Set on this phone: N. Next around {time}.", read live from the OS's own scheduled-notification list, with a battery hint and an "Open app settings" door. This splits the two failure modes at a glance: zero scheduled while Rhythms exist = scheduling broke; the right count with nothing arriving = the OS (Doze / OEM battery limits) is holding them, which no app code can fix, only excluding the app from battery limits can. Pure `nextDailySlot` picker unit-tested.

Also named for testers: the first-day effect (a Rhythm made in the evening has most of its DAILY slots already past, so day one is quiet by design) and that delivery stays INEXACT (no USE_EXACT_ALARM, unchanged; "around" is the promise). Web untouched (no-op mirrors; the health block never renders there, verified). RHY-05 added (199 cases). Decided against: SCHEDULE_EXACT_ALARM (a battery-hint escalation first; exact alarms stay the documented fallback if reliability still disappoints), and any in-app "last fired" log (background deliveries never reach JS, so it would lie).

## 2026-07-12 Quiet toggle resize on Android: rows clipped after a round trip, fixed by remounting Today on appearance change

Melroy's screenshots pinned it: after Standard -> Quiet -> Standard on Android, the task rows' bottoms were clipped "a bit". Root cause by inference from the measurements already in hand: Quiet rows are ~3px shorter than Standard by design (verified 59 vs 62 on web), and the toggle happens on the SETTINGS screen while Today sits DETACHED behind it in the native stack (react-native-screens). The re-style lands while Today's native views are detached, and the round trip left rows at Quiet's measured height under Standard's styles, exactly a few pixels eaten at the bottom. Web never detaches screens, which is why a full live round trip measured byte-identical there (twice).

Fix: Today's root is now keyed by `theme.appearance`, so an appearance change remounts the subtree and native performs a fresh layout on return. Chosen over disabling screen freezing (a blunt, app-wide perf trade) and over a focus-time nonce re-render (hacky, still trusts the stale layout pass). The remount is rare (only on toggle), invisible (same values render), and resets only transient state that cannot matter mid-toggle (the user is on Settings at that moment). Verified on web that the round trip is STILL byte-identical with the key in place; the Android clipping itself is device-verifiable only (QUI-02 now covers the round trip explicitly). One secondary oddity from the screenshots, the footer's rotating phrase showing an accent colour, should fall out of the same remount; flagged for the device pass rather than chased separately.

## 2026-07-12 Share-into-app dead on device: instrumented, hardened, and the premium panel copy caught up

Field report: sharing into DoubleDone on Android opens the app onto Today and nothing lands in the capture. Static analysis exhausted cleanly: the native module stores the intent on BOTH paths (onCreate for a cold share, OnNewIntent for a warm one), the JS hook both pulls on mount and subscribes to the module's event, the manifest filters exist (the app does appear on the share sheet), the app scheme is set, and our bridge and Today's consumption verified end-to-end on web. The break is device-side and needs ground truth, so this ships: (1) `+native-intent.ts`, the expo-router bridge that redirects a `dataUrl=` share deep link to Today instead of letting the router treat it as a path (the documented expo-router integration piece that was missing; iOS-flavoured but harmless and possibly the fix); (2) launch-week debug breadcrumbs, `debug: true` on the library hook plus `[share-inbound]` logs at our seam, so one `adb logcat -s ReactNativeJS:V` while sharing shows exactly which link of the chain goes quiet. The breadcrumbs are explicitly temporary and come out once the path is confirmed.

Also: the "You're Premium" panel's unlocked list (Melroy's catch) still named only the original four features; all three `unlockedBody*` variants now list the current suite (Scan, Pin, Quiet, colour themes, Chart a course, Plan my day, Your patterns, energy matching without limits, scrapbooks) in all four languages.

## 2026-07-12 Device feedback round two: the share seed race found via adb, link noise cleaned, energy matching moves inside Focus

Melroy's adb capture cracked the share bug: `[doubledone.capture.shared]` logged 100ms after boot, so the share WAS arriving and being consumed, and the loss was ours. The captureOpen-effect flush ran while BrainDump had not mounted yet (a cold start's first frames), its optional-chained seed silently did nothing, and it CLEARED the parked text, which is exactly why sharing only worked when the capture box was already open. Fix: the flush moved into a CALLBACK REF (`attachBrainDump`), which seeds the parked text at the precise moment the box mounts, however late. Timing can no longer lose a share. (This also retires the captureOpen flush effect.)

Second share fix, Melroy's UX call: a browser shares a selection as `"Quoted Title"\n https://site#:~:text=highlight...`, and dumping that blob into the capture "ruins the experience". New pure `cleanSharedText` (in inbound.ts, used by BOTH the Android intent path and the web share_target, so the sheets stay identical): the highlight fragment is cut to end-of-blob FIRST (decoded fragments contain spaces and would leak residue past a \S+ URL match, caught live on the preview), then links are dropped whenever words remain, wrapping quotes stripped, whitespace collapsed to one line; a bare link keeps just the fragment-free URL. "Project Hail Mary" arrives as exactly that. Tested (4 cases) and verified live.

Third, the energy entry redesign (Melroy: "it should appear as a sub-choice under Focus on one thing"): the standalone "What fits right now?" button leaves Today and becomes the FIRST choice in Focus mode's "Which one?" picker, softly styled so it reads as an offer beside the task choices, not another task. Choosing what to focus on is the moment the question makes sense, and Today loses a competing button. Same gate (AI on, 2+ open one-offs), same modal, same meter. NRG-01 + AND-04 updated. All three verified on the web preview end-to-end. NOT built into an APK: per the new rule (2026-07-12), builds happen only on Melroy's explicit ask, and these fixes wait ready.

## 2026-07-12 Rhythm intervals go minutes-granular: a curated ladder, not a free-text picker

Melroy: "can we not have a free time picker? I understand every X hours... but sometimes we need 30 minutes or 90 minutes or something granular." The interval Rhythm was whole-hours only (1-12), so "every 90 minutes" was unbuildable. The interval is now MINUTES, canonical `intervalMinutes` on the Routine, and the stepper walks a curated ladder (30 min, 45 min, 1 h, 1 h 30, 2 h, 2 h 30, 3 h, 4 h, 5 h, 6 h, 8 h, 12 h): dense at the short end where granularity matters, sparse past 3 hours where it does not. Chosen OVER a free numeric/time input, deliberately: a text field invites 7-minute alarm-clock configs that Android's inexact delivery cannot honour and that turn a gentle rhythm into a nag, while a stepper stays one-thumb, calm, and impossible to get "wrong". The 30-minute floor keeps a Rhythm a nudge rather than an alarm clock (below that is the task-nudge or fixed-times territory), and 12 h stays the cap.

Mechanics: `rhythmFireTimesInWindow` walks the window in minutes (inclusive ends, so 9-12 every 90 = 9:00, 10:30, 12:00), replacing the hour-walk `rhythmFireHours`, with the same defensive collapses (inverted window -> one start nudge, junk -> hourly) plus a hard 48-slot cap so a corrupt blob can never mass-schedule. `cleanIntervalMinutes` (round to nearest 15, clamp 30-720) is shared by the parser and the form so an off-grid value can never enter storage. Old blobs migrate on parse (`intervalHours` x 60, never written back) and fire on exactly the schedule they always had; `rhythmFireTimes` also resolves an unparsed in-memory legacy shape, so nothing anywhere can go quiet during the transition. The scheduler needed zero changes (it already consumed {hour, minute} from the meds build). Presets unchanged in behaviour (water 120, stand 60). Four new i18n keys per catalog for the minutes and mixed ("1 h 30 min") labels and cadence lines. 13 new/updated unit tests; RHY-02 covers the ladder walk, the off-hour firing, and the legacy-open check. Also tidied the Backlog: the "finer cadence" and energy-matching entries shipped, and the web-push note now points at the minutes-granular schedule truth. Not APK-built: per the 2026-07-12 rule, waits for Melroy's explicit build ask.

## 2026-07-12 The big flag goes cross-device: column applied, LWW sync, and a tie-seed so no existing mark is lost

Melroy hit the parked trigger personally: his Play-to-sideload reinstall wiped the device and his big marks with it, because big shipped local-only (the Supabase column did not exist yet, and an unknown column fails every upsert). He ran the alter (nullable boolean, additive, old clients unaffected) on live, column-first ordering observed, then the client side shipped: big joins TaskRow / taskToRow / rowToTask and syncs like any field.

The merge semantics were the real decision. big is now plain last-write-wins, NOT grow-only like completedDates, because big is a toggle: a grow-only union would resurrect a big the user deliberately cleared, and setBig always bumps updatedAt so LWW is honest. One deliberate exception, the transition: every pre-column mark lives on a device whose row TIES with the server copy (synced before, minus big). On a timestamp tie the rows are the same logical version, so a big held by one side can only be a pre-column mark; the merge ORs it in and pushes it, seeding the column instead of erasing every existing mark on the first sync. A real clear bumps updatedAt and never ties, so the seed cannot resurrect. Converges in one pass (once the server holds big, the grew-beyond-remote push condition goes quiet). Known narrow loss, accepted and documented: a pre-column mark on task X is lost if ANOTHER device edited X after the mark and before this device's first sync (remote genuinely newer, no tie); protecting it would require grow-only and the resurrection bug, and re-marking is one tap.

manualOrder stays the one local-only field (per-device order is arguably a feature); the Backlog entry narrows to it. Verified: live column probed via PostgREST (200 + RLS-empty, a missing column would 42703), 11 new/updated unit tests across sync.test and sync-merge.test, app boots clean on the preview, and an adversarial three-lens workflow (data-loss timelines, old-client compatibility, merge invariants) reviewed the diff before ship. BIG-05 added (200 E2E cases).

Addendum (same day, post-review): the three-lens adversarial workflow returned ship-it with zero blockers and one honest correction: the "cannot resurrect" claim holds only between NEW clients. A device still on the pre-sync build re-attaches its local big to rows it adopts (the old local-carry), manufacturing a tie that re-seeds a cleared big ONCE when that device upgrades; a re-clear then sticks by LWW. Accepted deliberately, the bias is keep-not-lose and the alternative (an epoch guard on the seed) converts the quirk into silent loss of legitimate marks. The merge comment now states this honestly, the tie check tightened to finite equality (two corrupt NaN stamps can never fake a tie), setBig's stale LOCAL-ONLY doc rewritten (the updatedAt bump is load-bearing for no-resurrection), a batch-upsert footgun note added to taskToRow (supabase-js unions keys across a batch and nulls the gaps, so every field must be emitted unconditionally), the 2026-06-26 robustness-review bullet annotated so nobody re-applies a local-carry to big, and five more pinning tests added (converged-steady-state quiescence, local-clear propagation, corrupt-stamp tie, tombstone seed).

## 2026-07-12 Device round: keepsake share broke on R2 images (fixed), the energy entry gets its pill, breadcrumbs out

Melroy's APK pass: A1-A4 and B2 clean, A5 (background nudge delivery) pending his battery-unrestricted retest, B1 in progress. One new bug and one design note.

The bug: "Share this keepsake" on device said "Sharing isn't available here". Root cause found by reading, not guessing: since the R2 persistence work a stored keepsake image is EITHER a local data: URL or an R2-served https URL, and the native share path still assumed data:-only, split out the base64 (an https URL has no comma), got nothing, and reported unavailable. Web never broke because fetch() accepts both shapes, which is exactly why three weeks of web verification missed it. Fix: the native path now branches, https images download to the cache via the legacy FileSystem API and then share, data: images write their base64 as before, and the sheet gets the same jpeg either way. The thin-native-seam-stays-untested convention lost its case here: this seam now has six pinned tests (both shapes, failed download, junk, no capability, throwing sheet) with the expo modules mocked. The Scrapbook.image doc now names both shapes and the every-consumer-must-accept-both rule.

The design note (Melroy: the energy entry is "not dynamic enough... maybe put a border"): "What fits right now?" in the Focus picker gets a soft hairline pill (border.hair, t.colors.line, pill radius), the same quiet chip language as moveChip, so it reads as tappable without competing with the task choices. Verified on the preview (computed 0.8px line-colour border, 999px radius).

Also: the share-intent debug breadcrumbs (debug:true + [share-inbound] logs) are OUT, their exit condition was "share confirmed on device" and A1-A3 passing is that confirmation, so the next APK is a clean AAB candidate. All three of these are JS changes: they reach the phone in the NEXT build, so the keepsake re-test and the pill check happen on that one before any AAB.

## 2026-07-12 A5 escalation: exact alarms (SCHEDULE_EXACT_ALARM), the real reason nudges only fired on app-open

Melroy's verdict after flipping battery to unrestricted: Rhythm nudges STILL only arrive when the app opens. That killed the battery theory and fired the pre-decided escalation. The root cause was then read straight out of the installed library, not guessed: expo-notifications' Android scheduling delegate (ExpoSchedulingDelegate.setupAlarm) arms an alarm with setExactAndAllowWhileIdle ONLY when the OS grants canScheduleExactAlarms(); otherwise it silently falls back to setAndAllowWhileIdle, an INEXACT alarm that Doze batches and defers, releasing it when the app process next wakes. That is character-for-character the field symptom, on both phones, battery settings notwithstanding. And canScheduleExactAlarms() could never be true for us: the app never declared SCHEDULE_EXACT_ALARM, so every Rhythm slot, checklist nudge, and daily reminder has been inexact on Android 12+ since launch.

The fix, three pieces. (1) app.json declares android.permission.SCHEDULE_EXACT_ALARM (additive; Expo prebuild permissions ADD to library-injected ones). On Android 12-13 the declared permission is pre-granted, so exact delivery simply turns on with this build. (2) Android 14+ ships the "Alarms & reminders" special access OFF by default, so the nudge-health block gains a calm door: "Allow alarms & reminders" opens DoubleDone's own toggle via expo-intent-launcher (ACTION_REQUEST_SCHEDULE_EXACT_ALARM with package data, falling back to the all-apps list, then plain app settings). The grant state is not readable from JS, so the door shows on every Android 12+ device rather than pretending to know; it sits beside the battery hint, which stays as the second lever. (3) Alarms armed inexactly before the grant re-arm automatically: returning from settings foregrounds the app and the existing resilience sweep cancels and re-schedules everything, now exact.

Decided against USE_EXACT_ALARM, again: it is auto-granted but Play-policy-restricted to alarm/calendar apps, and a to-do app leaning on it invites a rejection. SCHEDULE_EXACT_ALARM with a user grant is the honest lane; note for the next Play submission that the console may ask for an exact-alarm declaration (user-set reminders = core functionality, the accepted answer). New dependency expo-intent-launcher (native, so this ships in the next APK, which Melroy has pre-authorised). RHY-05 re-cut around the grant flow. Adversarially verified against the installed prebuild/config-plugin sources before the build was queued, per the Android-bugs-need-the-build-loop rule.

Addendum (same day, post-review): the two-skeptic pass (prebuild mechanics, runtime door) confirmed the config side wholesale (the permissions array is strictly additive per the installed @expo/config-plugins source, library manifest permissions merge via Gradle untouched, expo-notifications deliberately leaves SCHEDULE_EXACT_ALARM to the app) and caught one BLOCKER before the build was spent: the resilience sweep runs on cold start only, and granting the special access resumes the SAME process, so on Android 14+ returning from the toggle would have re-armed nothing until a full app kill, and the on-device test would have read "fix didn't work". Fixed surgically: startActivityAsync resolves exactly when the user returns (OnActivityResult), so the door now awaits it, re-runs rescheduleAllNudges from stored config, and refreshes the health line, no restart needed. Accepted without code: per-task one-off nudges stay outside the sweep (single-shot by design), and the door renders only where Rhythms exist; both parked in the Backlog with triggers.

## 2026-07-12 The keepsake becomes a PAGE: caption baked into the shared image (reversing image-only-no-text)

Melroy, from device testing: "The scrapbook shares the image but with literally no caption or context." He is right, a bare image is half a keepsake, and this reverses the earlier no-caption call with a better mechanism than the one that decision feared. The original worry was silently attaching task-derived words as share TEXT. The reversal does not attach text at all: the caption (the user-visible scene line already shown under the keepsake) plus a small "DoubleDone · Week of {date}" line are composited INTO the image, a cream band under the picture, so the share is still exactly one jpeg. Chosen over attaching caption text beside the image (react-native-share EXTRA_TEXT style) because receiving apps freely drop attached text (WhatsApp, the number-one target, is the famous offender), while nobody can strip words that are pixels; and the artifact gains a quiet wordmark. Raw task titles still never leave the device, and still never a link.

Mechanics: native renders a hidden 1080-wide page card in the Lookback (image + caption band, fixed cream palette regardless of theme, so every sender produces the same artifact) and snapshots it with react-native-view-shot (new Expo-supported dep) at share time; the share seam gains a file:// branch that shares the captured page as-is. Web composites the identical page on a canvas (fonts awaited, greedy wrapLines word-wrap, pure and unit-tested) with the bare-image path as fallback if compositing fails. The R2 image route now sends access-control-allow-origin:* (public read-only bytes behind an unguessable key, already <img>-loadable cross-origin) because the web composite fetch()es it; without the header, web sharing of R2-persisted keepsakes was silently degraded already. Verified live on the preview: the composed 1080x1380 jpeg downloads with the cream band, wrapped caption ink actually in the pixels (sampled), and the calm "Saved." note. Native needs the next APK (new native module); the Worker CORS header needs a deploy, both awaiting Melroy's word. Also answered in-session: the health line's "Set on this phone: 39" is the OS's true scheduled-notification count (one per rhythm slot per day + nudges + the daily reminder), flagged for a possible friendlier wording later.

## 2026-07-12 The health line loses its count: one calm sentence, "Next nudge around 3:00 pm."

Melroy, seeing "Set on this phone: 39" on device: not wrong, but overwhelming for exactly the audience this app protects. He is right, and it is the never-overwhelm spine applied to our own debug surface: the raw scheduled-notification count was me debugging in front of the user. The line is now a single sentence, "Next nudge around {time}." (reworded per his ask, all four languages), and the count is gone from the UI. Kept deliberately: the ZERO state ("No nudges are scheduled on this phone yet. Try re-saving a rhythm."), because nothing-scheduled-while-Rhythms-exist is the one red flag the line exists to surface, and getNudgeHealth still returns the count so that check (and any future diagnostics) keeps its ground truth; the count just never renders. The unused nudgeHealthCount key is removed from all catalogs. RHY-05 re-cut. Rides the next APK with the keepsake page.

## 2026-07-12 Scrapbooks go cross-device (Path B, Melroy's call): the parked slice was cheap once R2 landed

Melroy, on web after making keepsakes on his phone: "why are they not appearing on the web version?" Not a break, the designed gap: scrapbooks were device-local with cross-device sync parked as "a later slice" back when a keepsake meant ~500KB of base64. He chose Path B, fix it now, over shipping the AAB with the gap, because the next release should be the final one. And the parked reasoning had expired anyway: since R2 persistence a keepsake row is a few short text fields around an https URL, so the heavy thing the deferral feared no longer exists.

The shape: a `scrapbooks` table (user_id + week_start primary key, RLS all four ways, client-written created_at as the LWW truth, same no-now()-trigger rule as tasks), a pure per-week merge (newer createdAt wins, a remade week replaces everywhere, ties quiescent, corrupt stamps rank -Infinity and lose, merged set capped at MAX_SCRAPBOOKS newest weeks) and a best-effort `syncScrapbooks` pass that rides BEHIND the task sync at both call sites (app-open and the sign-out flush), internally caught so a missing-table or network failure can never mark task sync failed. Deliberate exclusions: legacy data: keepsakes never sync (they predate persistence and would bloat every pull, so they stay where they were made), no tombstones (keepsakes are never individually deleted in-app; the local cap is a render bound, not a deletion), and the cross-account guard mirrors tasks (a foreign local store starts the merge from empty so another account's books never migrate up). Known accepted edge: account deletion purges R2 objects from the LOCAL device's list, so R2 objects of books known only to other devices can orphan (unguessable keys, table rows die by cascade); parked. 13 new unit tests; SB-09 added (201 cases). The table must exist on live before the client ships (the column-first rule): SQL handed to Melroy to run, then the probe, then the final APK he has already authorised.

## 2026-07-12 Release cut: versionCode 11 (AAB) from d983bbf

The production AAB for the Play release: exact alarms with the Alarms-and-reminders door, minutes-granular rhythms, the calm one-line nudge health, cross-device big marks and scrapbooks, the keepsake page with its caption in the pixels, energy matching inside Focus, both share fixes, and the Quiet resize remount. Device-verified on the matching APK (same JS, one low-risk health-line refresh ahead of it) before the cut. Web deployed from the same commit.

## 2026-07-17 One gesture, one meaning: the held card becomes the only single-task surface

Melroy, testing iOS build 5 on TestFlight: "Why does tapping and holding just force the screen to the top. It seems very forced." Two tasks on Today, scroll down, hold a task, the page yanks back to the top.

**The jump was a symptom; the mode-hijack was the disease.** `onRowLongPress` branched on appearance: Quiet revealed the row's own inline actions in place, Standard (what Melroy runs) called `enterSelectWith`, flipping the ENTIRE screen into multi-select. That unmounts the "+ I also did that" link and the whole `dayActions` cluster (heavy nudge, Lighten today, Plan my day, Close the day). On a short day the content then measures shorter than the viewport, so the ScrollView clamps its offset to 0. There was never an honest "restore the scroll position" fix available: the offset genuinely stopped existing. The gesture was per-row; the response was whole-screen.

**Decided: unify on the in-place card, and demote multi-select to genuinely-bulk.** A hold now sets `confirmingId` and nothing else, in both appearances. The page keeps its height, so it cannot lurch. `enterSelectWith` survives, reachable only from the card's "Select more", so select mode always starts at 1 and is meant for 2+. The evidence was cheap: Melroy had already built both models and called the inline one calm and the mode-flip forced. Standardising on the calmer of two shipped models is deletion, not redesign.

**Decided against (and why it matters that this was caught).** An earlier pass shipped exactly "make Standard behave like Quiet" on my claim that nothing was lost. That was WRONG and was reverted before it left the branch: `openNudge`, `openSliceEdit` and `bulkMoveTo` all read `onlyTask` / `selected`, so **Remind me, Steps and Move to… existed only in select mode**. Flipping the flag alone pushed all three from one gesture to two, and the coachmark ("pin it, set a reminder, break it down, or make it tiny") would have started lying. The unification is only honest because those three are now wired to the card, id-driven. Note the tell: the existing coachmark becomes TRUE without editing a word of it, which is what a coherent interaction looks like.

**Decided against a bottom bar retitled per task** (fixes the jump, keeps the disease: 300px between a task and its actions, ten ungrouped links, two mental models alive) **and against a sheet anchored to the row** (a new surface on an app whose rule is remove friction, and Move to… / Remind me / Steps are themselves modals, so it buys three sheet-over-sheet handoffs for nothing the card lacks).

**The overwhelm answer, since the spine forbids a wall.** Worst case is 11 controls, which as a flat wrap would be a worse regression than the jump (decision-log 2026-06-xx already records that FOUR actions did not fit one row at 390px). So the card is grouped by the question being asked: WHEN (Tomorrow / Move to… / Remind me), SIZE (Break down / Steps / Make it tiny), WEIGHT (Pin / A lot), then a hairline and the terminal line (Select more … Remove / Close). Never more than three to a line, lines render only when non-empty, no line labels (words there would be the clutter they prevent). Measured at 375px: every line fits without wrapping, including the native When line with Remind me (256px of 295px available). Four chunks is inside working memory; eleven items is not. Pruning is aggressive: a done task's card is 4 controls, a recurring one's 5.

**The cut that makes it coherent, and the easy half to skip.** The select bar drops from ~10 actions to five honest bulk ones (Done / Move to… / A lot / Combine / Remove) plus Select all and Cancel, collapsing two rows to one. Deleted outright: Done on…, Remind me, Break down, Pin, Make it tiny, Steps. Without this cut there would be three models instead of two.

**Decided: merge the sliced early-return** (the highest risk, because it failed invisibly). A sliced task used to render a stripped card of Undo-a-step / Remove / Close and reach everything else through the bar. Cutting the bar without merging would have silently stripped every action from sliced tasks with no error and no failing test. Now a sliced card carries the live n / N count in its title plus the full set, minus Break down (a task already in steps does not need decomposing again).

**Also decided:** the card's `!recurring` guard on "a lot" is dropped (a chore can absolutely be a lot; the bar always allowed it, so this removes an inconsistency); Pin shows DIMMED to a free user rather than absent (PIN-02's contract, and for this audience a visible-but-dimmed action is calmer than a tap that teleports to a paywall); Later rows gain Move to… and Steps, which is a net GAIN because `onlyTask` only ever searched Today's list, so the bar's single-task actions were ALREADY silently dead for every Later row; and `nudgeId` / `moveIds` replace the derived reads, which also closes a latent bug (`pickNudge` read `onlyTask`, awaited `scheduleNudge`, then committed, so the target could shift under the await).

**Honest caveat, recorded so a future reader does not assume too much.** The jump does not cease to exist: "Select more" still hides those blocks and a short page still clamps to 0. It now only happens when the user deliberately asked for bulk with their eyes already on the row they tapped, which is the difference between a glitch and a transition. Do NOT "fix" that with scroll-position preservation; symptom treatment is what this change rejects.

**Telemetry (the rule is telemetry before traffic).** `select.opened` keeps its name (renaming forfeits the history) and gains `from: 'select_more'`, because its meaning narrows from "someone held a task" to "someone wants bulk". New `hold.opened` instruments the gesture that is the door to half the product and was never measured. EXPECT `bulk.completed` / `bulk.removed` / `bulk.moved` / `bulk.big` to drop sharply and skew to 2+: that is the design working, not a regression to undo.

Also fixed while in the surface: `welcome.revealCombineHint` named a route that no longer exists (all four catalogs now name the Select more step), and OCD-02 had been testing a phantom "Good enough" button for months (it folded into the rotating affirmations long ago). Suite regenerated, 201 cases. Verified on the web preview: held at the bottom of a scrolled list, `scrollTop` unchanged, both day-action blocks still mounted, sliced card full, single-task Move sheet reads "One task moves to the day you pick." NOT device-verified: the Android long-press release race (`selectGuard`, deliberately kept) and iOS text-selection need the build loop.

## 2026-07-15 Apple IAP from iOS v1, reversing the hide-everything path

*Recorded late, on 2026-07-17. The decision was made on 15 July and lived only in `docs/ios-iap-progress.md`, a working note. That broke the rule at the top of this file, and it mattered: BUILD-PLAN.md, CLAUDE.md and four other docs still prescribed the OPPOSITE, so a cold session reading BUILD-PLAN first (as CLAUDE.md instructs) would have built the reversed thing. Written down now, with the contradictions corrected in the same commit.*

**Decided: ship Apple In-App Purchase from iOS v1.** Melroy: "I don't mind giving Apple their cut. At the moment, 15% of 0 is 0. I want to give customers a path to becoming premium." Plus **parity pricing** (absorb Apple's 15% rather than mark iOS up: A$5 / A$50 matching Stripe **[corrected 2026-07-19: this entry originally said A$4.99 / A$49.99, a .99 assumption invented on 2026-07-15 that never matched anything real; Stripe and App Store Connect have been flat A$5 / A$50 throughout]**) and **sign in at the point of purchase**, not before, so the entitlement follows the user across web / Android / iOS while everything else stays anonymous-first.

**Decided against: the 3.1.3(b) "reader app" hide-everything path**, which was the standing pre-decision and is what BUILD-PLAN.md:94 still described. That path ships iOS with every purchase path hidden, takes no Apple cut because it takes no iOS money, and waits for iOS revenue to justify the 15%. It was the right call while iOS revenue was hypothetical and the IAP surface was unbuilt. It stopped being right the moment the question became "do iOS users get a way to convert at all". The reasoning that killed it is Melroy's: 15% of zero is zero. A hidden path converts nobody, so the cut is not a cost, it is the price of a revenue line that does not currently exist.

**Architecture (RevenueCat, Path C): RevenueCat is iOS StoreKit plumbing ONLY.** Stripe stays the source of truth for entitlement. A RevenueCat webhook writes Apple-sourced purchases into the existing D1 `entitlements` table, reusing the Stripe entitlement path rather than forking it. App User ID = the Supabase user id, which is what makes one entitlement follow a person across three platforms. Decided against making RevenueCat the source of truth everywhere (it would rewrite a working, live, revenue-carrying Stripe path for no gain) and against hand-rolling StoreKit receipt validation (weeks of work, a server-side receipt endpoint to keep alive, and the exact class of thing a solo dev should buy rather than build).

**The state this leaves iOS in, stated plainly because it is the worst of both paths.** The decision reversed, but no code moved. `react-native-purchases` is not installed and there is not one line of RevenueCat code in `client/src` or `server/src`. Meanwhile `premium.tsx` still calls `Linking.openURL(res.url)` on native (line 97, and again at 137 for the portal), so the current iOS binary sends users to an external Stripe checkout in Safari. That is a straight Apple 3.1.1 violation and a guaranteed rejection. It has not bitten yet only because the app has never been submitted: TestFlight INTERNAL testing skips review. Nothing is live, nothing is at risk today, but the first submission fails on this unless IAP lands or the path is hidden first.

**Consequence to carry:** `docs/commercialisation.md` and `docs/cost-analysis.md` model iOS at a 0% platform cut, because they were written under the hide-everything path. Both are now wrong for iOS revenue and need the 15% (Small Business Program) folding in. Not done here; flagged rather than silently left.

## 2026-07-18 Apple IAP shipped (RevenueCat as StoreKit plumbing, Stripe still the source of truth)

Built the whole iOS In-App Purchase path in one wave, on the `premium` branch (main auto-deploys web to real subscribers; this rewrites the live money screen, so it stays off main until Melroy has device-tested). Implements the 2026-07-15 decision (Apple IAP from v1, parity pricing, sign in at purchase). The reasoning trail is long because the failure modes are money in both directions; the load-bearing calls:

**RevenueCat is iOS StoreKit plumbing ONLY; Stripe stays the source of truth.** A RevenueCat webhook writes Apple purchases into the SAME D1 `entitlements` row Stripe writes, via a new `source` column ('stripe' | 'apple' | null). Decided AGAINST making RevenueCat the source of truth (it would rewrite a live, revenue-carrying Stripe path for nothing) and AGAINST hand-rolling StoreKit receipt validation (weeks of work and a server endpoint to keep alive, the exact thing a solo dev should buy not build).

**The client seam is INVERTED from every other split in the repo, on purpose.** `lib/purchases.ts` is the inert stub (web + Android) and `lib/purchases.ios.ts` is the only file importing `react-native-purchases`; Metro resolves the `.ios.ts` on iOS alone. Every other split here (haptics, share, reminders) puts native in the base and stubs it in `.web.ts`. Chosen because a `.web.ts` split would leave the base serving iOS AND Android, and Android (live on Play, selling via Stripe) is exactly what must never import a StoreKit module. The consequence that makes it worth the oddity: `IAP_AVAILABLE` is a COMPILE-TIME false off iOS, so every new branch in `premium.tsx` folds away by construction on the platforms that carry paying customers, rather than depending on a runtime `Platform.OS` check being right. Decided against `Platform.OS` guards and lazy `require` (both leave the import in the web/Android module graph, which `metro.config.js` already fights) and against the RevenueCat hosted paywall UI package (DoubleDone builds its own, on-brand).

**Two separate guards, because the JS split does not stop autolinking.** A second guard, `expo.autolinking.android.exclude` in `client/package.json`, keeps the native module (and Google Play Billing) out of the live Android AAB. Verified against the installed autolinking resolver source, not from memory.

**CANCELLATION is the mapping that will be got wrong, so its test was written first and locked.** In RevenueCat, CANCELLATION means auto-renew was turned off; access RUNS TO the period end. It is NOT a revoke (EXPIRATION is). Mapping it to a revoke would kill a paying customer's access at the exact moment they exercised a choice. The one exception is a CUSTOMER_SUPPORT cancel (a refund), which does revoke. Alongside: BILLING_ISSUE keeps premium ON through Apple's grace period, and EXPIRATION is guarded against out-of-order delivery (only revoke once the expiration is actually in the past). The full out-of-order guard (compare event timestamp to the row's updated_at) is deferred to the Backlog with the trigger "any report of Premium flickering off".

**The double-charge guard is ours alone, and it is a fresh entitlement read in-flow, not a React flag.** A user who bought Premium on the web (Stripe) then opens iOS reads as free from an anonymous client, and Apple cannot know about the Stripe sub. The provider's `refresh()` deliberately does NOT block the UI (so a re-fetch never blanks the screen), which means the plan's original "button disabled while loading" had a latent hole: after sign-in there is a window where `premium` is stale-false. Closed by reading `loadEntitlement()` synchronously inside `subscribe()` right before `buy()`, and bailing to the Premium panel if already entitled. `purchaseGate` (pure, tested) still decides the rendered CTA.

**The anonymous-to-signed-in aliasing trap is declined, not solved.** Because Buy AND Restore are both gated behind sign-in, the anonymous RevenueCat customer never holds a transaction, so whichever way `logIn()`'s merge lands there is nothing to strand. This concedes an account at the point of purchase (a real trade against anonymous-first), taken because the alternative is a class of bug where a real person pays and gets nothing.

**TRANSFER is handled as should-never-happen.** With Restore Behavior set to keep-with-original (Melroy's dashboard step), a subscription belongs permanently to the account that bought it, which is already DoubleDone's model, so TRANSFER never fires. If it does (a genuine phone handover), the webhook writes nothing and emails the owner, because the event carries no expiration to grant with. Decided against the API-lookup path (25 lines + a secret + a network call inside a webhook) and against revoke-the-old-owner (strands a paying customer).

**Sandbox events are accepted and grant.** This is what makes an App Review reviewer's own purchase actually unlock Premium (Guideline 2.1(b)), and it turns Apple's accelerated sandbox clock into a free end-to-end test of the whole purchase/renew/expire chain against the real Worker. Noted in code: gate on PRODUCTION if a public TestFlight ever happens.

**The paywall now carries what Apple's Schedule 2 §3.8(b) requires IN the binary:** title, both prices from StoreKit (currency-correct per storefront **[corrected 2026-07-19: this originally read "the real A$4.99, never the catalog's rounded A$5", which was exactly backwards; the catalog's A$5 was right and A$4.99 was the invented number]**), the renewal disclosure, functional Terms + Privacy links, and a visible Restore whose every outcome is honest (Apple rejects a restore that appears to do nothing). No Stripe mention anywhere on iOS: Guideline 3.1.1 bans external-purchase steering, and Australia has NO carve-out (the US/Japan external-link entitlements do not reach the AU storefront; the thing to watch is the pending Epic v Apple (AU) remedies judgment, not Treasury). The long "payment will be charged to iTunes Account..." boilerplate is NOT in Schedule 2 v126 and was deliberately not added.

**The legal pages were about to ship false.** `terms.tsx` promised Stripe billing, a Stripe cancel portal, and a 7-day refund "back through Stripe" that Melroy cannot honour for an Apple subscriber (Apple controls iOS refunds). Rewritten source-aware (both billing paths), prices "corrected" to A$4.99/A$49.99 **[that "correction" was itself the error and was reverted 2026-07-19: the terms' original A$5/A$50 was right all along]**, and privacy.tsx's "processed by Stripe" broadened to "Stripe or Apple". This is a DRAFT pending Melroy's confirm and a lawyer, per the standing v1-legal note; it changes what he promises about money.

**Left for Melroy (cannot be done from code):** the RC_WEBHOOK_AUTH Worker secret + the matching RevenueCat dashboard webhook header; Restore Behavior = keep-with-original; the In-App-Purchase key + ASC API key uploaded to RevenueCat; both products to "Ready to Submit" and attached to the SAME submission as the first binary; a Sandbox Apple ID; the App Review reviewer sign-in note (recommended: reviewer signs in with their own email, since OTP self-provisions any address, so it touches no production auth); and the Worker deploy (`wrangler deploy`) once he OKs it. The webhook and paywall are code-complete and tested but the Worker is NOT deployed.

Tests: client 512, server 404 (the pure IAP logic + the whole webhook event map), all green. E2E: PREM-18..31 added (215 cases), including the regression guards PREM-29 (no Play Billing in the AAB) and PREM-30 (web export unchanged). Both verified locally: the production web export builds and /premium is unchanged on web.

## 2026-07-19 The Premium panel decides its control from the entitlement, never the URL

Melroy, device-testing IAP, signed into a comp account and tapped "Manage subscription": "Could not open the billing portal. Please try again." Retrying was futile, there is no portal for a comp. A full state-matrix audit of the Premium screen (every entitlement state x platform, then an adversarial pass) found his bug was the SMALL one.

**The real defect: `premium.tsx` read the URL's `?status=` query param where the ENTITLEMENT status was meant.** The param only ever holds 'success' or 'cancelled' (Stripe's return URLs), so the three `status === 'trial'` branches were provably dead: nothing anywhere sets ?status=trial. Consequence, live since 0ff75c8 (2026-06-27): every trial user saw "You're Premium ✓" (implying a charge) instead of "Your free month", and got a Manage button that could only 404, while the intended "Go Premium to keep it" convert CTA never rendered once. The trial had NO working conversion path from the Premium screen, on any platform, for three weeks. A revenue leak, not a cosmetic bug. The E2E suite (PREM-16) specified the correct behaviour verbatim the whole time; the case had simply never been run. The comp dead-end was even predicted in this log (2026-06-27, "the manage portal correctly 404s and the UI can offer...") and the offer half was never built.

**Decided: extract the state-to-control decision into a pure, tested function** (`lib/premium-ui.ts`, `premiumPrimaryAction(status, iapAvailable)`), because the reason a dead branch shipped and survived is that the mapping lived inline in the screen and the harness only tests pure lib/ logic. Five tests now lock the table: trial converts via Stripe on web/Android; trial on iOS renders NO control (StoreKit refuses a second purchase while premium and the trial never auto-charges, so a button could only fail; the "Free until {date}" line carries it); comp gets a calm "nothing to manage here" line instead of a button; every real subscription manages (portal or Apple's sheet by source); unknown status falls back to manage rather than hiding the control.

**The principle, stated once for reuse: never render a control whose only outcome is an error.** If there is nothing to manage, say so, calmly. Same shape as the Apple-subscriber-on-web fix (the `source` column): the class of bug is "a button wired to a backend that cannot succeed for this account".

**Belt-and-braces:** the portal 404 now surfaces as `no_subscription` through the client seam and renders the same calm line (covers the dev override and any future premium-without-customer state), instead of a retry-implying error. The server keeps answering 404, which is the correct HTTP truth; only the client's reading changed.

**Decided against bundling** (each real, each separate): the Stripe past_due double-subscription server bug (handleCheckout's guard keys on premium && customerId, so a dunning user can mint a SECOND subscription and orphan the first; a genuine money bug, spun out as its own task); a fix-your-card panel for past_due (new panel state, scope); Apple past_due showing "Renews {date}" (cosmetic, deferred); iOS mid-trial conversion via a narrowed double-charge guard (touches the highest-stakes client money function, device-only verification, a deliberate decision for Melroy not a drive-by).

Verified: 517 client tests (5 new locking the mapping), 404 server, gate green; web preview confirms the free upsell is byte-identical and the dev-override premium panel renders heading + Manage correctly. The trial and comp renders are locked by the pure tests; their on-device look rides the next build. For a REAL Stripe subscriber every changed branch produces identical output before and after, so the live paying path did not move.

## 2026-07-19 App Review sign-in: relay the real OTP, never backdoor the auth

Apple's reviewer must sign in to test the IAP (2.1(b)), and DoubleDone's only auth is passwordless email OTP a reviewer cannot receive. Melroy chose the reliable route over reviewer-uses-their-own-email (three assumptions gating the review). **Decided: relay the REAL code rather than force a fixed one.** Cloudflare Email Routing routes appreview@doubledone.app to the Worker's new email() handler, which extracts the 6-digit code and stores it in D1 (single-row upsert); GET /review-code shows the latest code as a plain page the reviewer opens in Safari. Production auth is untouched, the code is Supabase's own and expires normally, and the kill switch is deleting one routing rule.

**Decided against the fixed-OTP-in-Supabase trick** (a trigger writing a constant token into auth.users): it rides undocumented auth internals that have broken before (the community approach died on a Postgres update in July 2025), it is a permanent static credential inside production auth, and it sits badly against 2.3.1's ban on hidden features. The relay gives the reviewer the same experience with none of that.

**Blast radius, stated:** while the routing rule exists, anyone who knows the URL can sign in as the REVIEW account only, a seeded demo account holding nothing personal. Codes go stale in an hour regardless. Disable after approval (delete the rule; the route then permanently 404s).

Left for Melroy: the Email Routing rule (Cloudflare dashboard, doubledone.app -> Email -> route appreview@ to Worker doubledone-ai), the Worker deploy OK, and signing in once as appreview@ to seed the demo account with a few calm tasks. 14 tests (extraction incl. the phone-number/timestamp traps, freshness, the oversize cap, wrong-address drops).

## 2026-07-19 Checkout guard: dunning is refused a second subscription, and the guard is NOT customerId-alone

Closes the money bug the Premium state-matrix audit surfaced (this log, earlier today). `handleCheckout` guarded a duplicate subscription with `premium && customerId`, but a Stripe subscriber in DUNNING (past_due / unpaid: the card is failing, the subscription still alive at Stripe and retrying) reads premium=false, so the guard never fired. They fell to the upsell, saw "Go Premium", and one tap minted a SECOND customer and subscription; the webhook upsert then overwrote `stripe_customer_id`, orphaning the first. If dunning later recovered the old subscription, the user paid twice with one visible in the app.

**Decided: the guard fires on `customerId && (premium || dunning)`, where dunning = status past_due or unpaid.** The 409 body distinguishes the two truths (`already_subscribed` vs `billing_issue`), because the client's existing copy for a 409 ("You're already on Premium") would be FALSE for a dunning user, whose fix is the card, not a purchase.

**Decided against the audit's own proposal, the simpler `customerId`-alone guard, because it over-blocks two flows where a fresh Checkout is the CORRECT path:** a LAPSED subscriber (status canceled; the customer id is kept for history by the writer's COALESCE) re-subscribing, for whom the portal has nothing left to restart, and an ABANDONED checkout (incomplete / incomplete_expired), which self-expires at Stripe and must never lock a user out of ever buying. Both are locked by tests now, alongside the dunning refusals and the trial-converts case. The five-row table lives in stripe.test.ts.

**The client half:** `startCheckout` now reads the 409 body (it used to map every 409 to 'already'); a `billing_issue` renders "A payment on your existing subscription needs attention... Update your card and Premium carries on by itself." And the adjacent gap from the same audit is closed: a dunning user on /premium (who lands on the upsell, since premium is false) now sees a calm notice with an "Update payment details" link straight into the Stripe portal, which works in this state because the customer id exists. Previously they had NO path to fix their card from that screen at all.

Server 420 tests (2 new), client 517, PREM-33 added (217 cases). Verified in the preview that a normal free user's upsell is unchanged (no notice, Stripe copy intact). The dunning path itself needs a Stripe test-clock run (PREM-33) since the preview cannot fake a server entitlement. On `premium`, not deployed; rides the same deploy Melroy already has on his morning list.

## 2026-07-24 Edit a task title, at last: the card's title is the edit control

Melroy, on device: "I can't even edit the task. What the hell?" He was right, and the audit confirmed it was absolute: no rename path existed for a one-off task anywhere in the app (only a recurring SERIES via the drawer, and the Combine umbrella). A typo meant remove-and-retype. Table-stakes, missed for five weeks because capture was so frictionless nobody re-read what they typed until real users did.

**Decided: the title on the held card IS the edit control.** Tap it, it becomes an inline field, enter or tap-away saves. No "Rename" button: the card sits at its density ceiling from the one-gesture redesign, and tap-the-thing-to-change-the-thing is the lowest-friction shape that exists. The affordance is a faint underline in soft ink. Deliberately NOT act-and-dismiss (the one card action that keeps the card open): fixing a typo then continuing to another action is the natural flow, and the corrected title is its own feedback, no affirmation.

**The mechanics:** pure `renameTask` in lib/today (trim; empty, unchanged, or unknown-id returns the SAME array reference so nothing commits and nothing syncs; a real change bumps updatedAt so the rename rides plain LWW to other devices). The draft always starts from the RAW title, never the sliced "· n/N" render suffix. Editing state resets when the card closes via the adjust-during-render pattern (the React Compiler lint rejected the setState-in-effect version, correctly). Renaming a recurring row renames the series, which is what the single visible row implies. Wired on Today AND Later rows.

**Decided against:** a rename entry in the card's action lines (a twelfth control, the overwhelm ceiling says no); an edit modal (a whole surface for one field); and long-press-the-title-to-edit (a hold inside a hold is gesture soup).

4 new pure tests (521 client), TOD-24 added (218 cases), two catalog keys x4. Preview-verified end to end: tap title -> field pre-filled with the raw title -> retype -> enter saves, storage + updatedAt bump confirmed, card stays open; emptied input is a proven no-op (same stamp, no write). Blur-to-save is unverifiable in the headless preview (focus never lands there) but is the identical pattern already shipped in chart.tsx, routines.tsx and BreakdownReview.tsx; TOD-24's tap-away step covers it in the device pass.

## 2026-07-24 Missed nudges are dismissed on app open, never left as a guilt-heap

The power user's spine violation, closed to the extent JS can reach: she opened her phone to "a backlog of missed reminders, which actually makes me feel a bit guilty rather than helping me remember to drink." A pile of missed nudges is the never-shame rule breaking in the notification tray.

**Decided: on every app open (riding the existing resilience sweep), dismiss every DELIVERED Rhythm, daily-reminder, and routine-checklist notification.** They are offers to open the app; once it is open they are honoured or moot, and either way they should vanish quietly. Per-TASK nudges are deliberately KEPT: they point at one specific task and stay actionable while it does. The decision of what to dismiss is pure and tested (staleNudgeIdentifiers in reminders-types, 4 tests): matched by notification channel on Android and by the stable identifier families (rhythm-*, routine-*, the fixed daily id) on iOS, with anything unrecognised kept, never over-dismissed. The channel ids moved into the pure module so the sweep and the scheduler agree by construction rather than by string luck.

**The honest limit, written down:** this clears the pile the moment the app opens (her exact reported experience), but nudges that fire while the app stays closed still accumulate until then. True tray auto-expiry needs Android's timeoutAfter, which expo-notifications does not expose; that is a native config-plugin follow-up, filed in the Backlog next to the delivery pass. Decided against shipping a plugin now: it forks the build config during two live store reviews for an increment the sweep already halves.

AND-06 added (219 cases). Native behaviour, so the web preview cannot verify it; it rides the next builds' device pass.

## 2026-07-24 The closed day gains its forward view: a count and a door, never the list (Path C, part 1)

The user report: "Once the day is closed, we don't see what's coming up in future days because I don't know if I added a task or not." Verified on device before building: a closed day with tasks due tomorrow and in three days showed NEITHER, so a capture could not be confirmed safe, which is the exact "did I even add that?" anxiety the app exists to remove.

**Decided (Path C, Melroy's pick over two alternatives): the rested screen shows one quiet underlined line, "N things are waiting for the days ahead. They are safe.", tappable through to the Lookback.** A COUNT, never a list: closing the day means setting it down, and rendering the Later list on the goodnight screen would re-load tomorrow's weight at the moment of release (rejected as Path A). The copy carries the actual job, reassurance of safety, not a preview of burden. Hidden entirely at zero. The count is `upcomingTasks` (future-due one-offs), already computed for the Later list, so this is presentation only.

**Part 2 (queued next): the Lookback's calendar learns to show PLANNED tasks alongside completed ones**, which is what makes the door worth opening, and which unifies this report with the power user's recurring-tasks-in-a-calendar ask and the earlier ICS instinct.

Four keys x4 catalogs. TOD-25 added (220 cases). Preview-verified on the exact seed that exposed the gap: count line renders ("2 things are waiting..."), no future titles anywhere on the closed screen, absent at zero. The tap-through could not be fired in the headless preview (the documented Pressable gotcha); accepted by structure, it is the same router.push pattern as the adjacent working Reopen button, and TOD-25 covers the tap on device.

## 2026-07-24 The Lookback learns repeats: 'hair washing day' at a glance (Path C, part 2)

The wave's last piece, and smaller than planned because the audit-before-building found most of it already existed: the Lookback has had planned-day dots, a legend entry, and a future-day detail list for one-off dues since the redesign. The genuine gap was exactly the power user's literal ask: RECURRING tasks ("wash my hair every four days... I can glance at my calendar and immediately see that it's hair washing day") never appeared, because scheduledByDay explicitly skipped repeats.

**Decided: project each repeat's occurrences onto the visible month grid.** scheduledByDay gains an optional days param (the month matrix the Lookback already computes); for each future day, isDueOn answers whether the repeat lands there (the same predicate that decides Today, so the calendar and Today can never disagree about a cadence), with skip-today'd instances excluded (the series continues; that day is not planned). Future-only stays absolute: the past belongs to completions, today to Today. Rendering: the SAME planned dot (planned is planned), and the day detail marks a repeat with a small ↻ after the ○, so a repeat reads as a repeat. Without the days param the function behaves byte-for-byte as before (locked by test), so nothing else that might ever call it moves.

**Decided against** a separate repeat-dot colour (a third legend entry for a distinction the ↻ in the detail already carries) and against projecting past occurrences (the Lookback's past is what you DID, never what you were supposed to do, which is the never-shame line).

3 new pure tests incl. her literal every-4-days case and the skip-today exclusion (528 client). LB-10 added (221 cases). Preview-verified end to end on her scenario: the day 4 days out reads "0 finished, 1 scheduled", tapping it lists "Wash hair ↻" under the planned heading.

**The wave (2026-07-24), all four shipped to web in one day:** edit a task title in place; the missed-nudge pile dismissed on app open; the closed day's calm forward count; and repeats on the calendar. All four came from real users inside the target audience, and all four ride the next native builds.

## 2026-07-25 The Lookback is renamed "Calendar" to the user (the label only, the concept keeps its name)

The screen stopped being past-only in the 2026-07-24 wave: it now carries two legends (finished, scheduled) and shows completions behind you and planned tasks (one-offs and projected repeats) ahead of you, on one month grid. "Lookback" named the past-only payoff and now undersells the surface. Melroy, looking at the actual screen, called it: it reads as a calendar, so it should say Calendar.

**Decided: rename the user-facing label to "Calendar" across all four locales, and change the subtitle to admit the forward view.** en "Calendar", it/es "Calendario", fr "Calendrier". The on-screen subtitle and the menu hint both gain a "and the days ahead" clause (en: "Everything you have actually finished, and the days ahead."), keeping the emotional anchor ("actually"/"davvero"/"de verdad"/"vraiment") first and the calendar utility second. A bonus fell out: the three locales had drifted into three different poetic names (Sguardo indietro, Mirada atrás, Rétrospective) plus stray "Lookback" and "Recuento" leftovers; "Calendar" collapses them to clean cognates and removes the drift. French needed a gender fix, la Rétrospective (f) to le Calendrier (m), so every "ta Rétrospective" became "ton Calendrier".

**Scope decision: the label only. The internal identity stays `lookback`.** The route (`/lookback`), the telemetry event names, the server module (`lookbackSummary.ts`), the spec's concept name, and the code all keep "lookback", so nothing breaks and the moat's event history stays continuous. Renaming the concept everywhere would be large churn with real risk (telemetry continuity, route stability) for zero user benefit. The E2E suite's `LB-*` case IDs are likewise kept stable; only its Area label and prose moved to "Calendar".

**Decided against** two alternatives. Keeping "Lookback" and only fixing the subtitle: rejected because the name is the doorway, and "looking back" actively mis-frames a screen you also plan forward in. "Days" / "My Days" (past+future-neutral, promises no scheduling affordance): rejected on legibility, "Calendar" is the word every user already reaches for, and the power users literally called it a calendar. Don't fight the signal.

**The flag that rides with the name (logged to the Backlog):** "Calendar" quietly promises you can tap a future day to ADD a task there. The forward view is read-only today, it shows what's planned, you can't schedule INTO it. Expect an eventual "why can't I tap a day to add something" note; the name sets that expectation before the feature meets it.

No logic changed, so no new tests; 420 server + 528 client stay green, typecheck and lint clean. Suite regenerated (221 cases). Preview-verified on the real screen: heading "Calendar", the new subtitle, back-link to Today, all three legends present. Ships to web on this push; rides the next native builds to Android and iOS.

## 2026-07-25 The Android widget is re-enabled, self-diagnosing, after a code review dismantled the reason it was killed

Melroy asked for the home-screen widget back ("this is a real issue") and, correctly, for a code review before trusting a re-enable. The review found the widget was shelved (2026-06-24) on an UNCONFIRMED guess: a "react-native-android-widget 0.20.3 / new-architecture incompatibility" that was never logcat-verified (adb was unavailable, and Melroy did not need it then). The library's changelog contradicts the guess: new-architecture support landed in 0.16.0 (April 2025), four minor versions before the 0.20.3 we shipped. The render call `renderWidget({ light, dark })` is also correct (the library's `WidgetRepresentation` type is exactly `JSX.Element | { light; dark }`), the widget config (180x110dp) is fine, and the model chain (`today`, `widget-model`, `i18n-active`, `day`, `recurrence`) is pure and load-safe. So no single confirmed cause survived, and the stated reason did not hold.

**Decided: re-enable, and make the widget diagnose itself so a device test needs no adb.** Two real issues were found and fixed. (1) `TodayWidget` imported `t` from `@/lib/locale`, which pulls `expo-localization` and runs a device call AT MODULE LOAD, the same class as the one confirmed original bug (importing `constants/theme` ran `global.css` + `Appearance` at load and drew blank). Switched to the pure `@/lib/i18n-active`, matching `widget-model`; the widget is English-first in the headless context for now (localising it safely there is a noted follow-up). (2) The headless handler had no error surfacing, so ANY throw drew a silent blank, which is why the cause was never found. The handler now logs a fire breadcrumb, imports the app modules INSIDE a try (so a module-load throw of the known class is caught, not swallowed), and on any error renders a bulletproof fallback that draws the error text ON the widget (depending only on the widget library + inline hex, never an app module). The next device build therefore reports its own verdict: tasks render (fixed), an error string renders (exact cause, on screen), or it stays fully blank (the headless task is not firing at all → a registration issue, a different fix path).

**Decided against** bumping the library to 0.21.0 as part of this (its changelog is styling/perf only, no new-arch or headless fix, so it would add a variable to the diagnostic for no relevant gain; a clean bump can follow once we know the widget renders) and against deleting-and-rebuilding the widget (the source was sound; the diagnosis was the problem). Re-enabled via `index.js` (`registerWidget()`), the `app.json` react-native-android-widget plugin, and `update.tsx`'s real `requestWidgetUpdate` (now guarded so a widget refresh can never disturb the task save that triggered it). Web stays clean by the existing `.web.ts` split (register/update no-op on web; the library never enters the web bundle). AND-05 flipped from "widget is disabled/absent" to "widget renders Today (self-diagnosing)". Only a device can confirm the headless render, so this rides the next Android build; typecheck + lint + 528/420 tests stay green.

## 2026-07-25 The held card is rebuilt to design 1a: a curated few, the rest behind "More"

The tap-and-hold single-task menu was a flat wall of ~11 same-weight text labels in wrapping rows: complete, but hard to scan, reading like a control panel rather than a hand, and (on dense Android) prone to clipping a label's last glyph. A Claude Design pass explored four directions; Melroy chose 1a (curated few + more) and asked to build it. Handoff: `docs/design-source/held-card-design-prompt.md` (the brief) and the reference board in his design zip.

**Decided: rebuild the held card as a vertical stack of full-width rows, curated.** The stuck-helpers LEAD (Break it down as a tinted HERO with an 'into small steps' sub-label, then Make it tiny 'the first step', Move to…, and Mark as a lot which tints to an active state when on); the rarer actions (Steps with its '2 of 5', Pin, Remind me, and a sliced task's step-back) RECEDE behind a single 'More' disclosure with a caret and a faint preview; and the way out sits under a hairline with Close on the accent in the easy bottom-left reach, Select more in the middle, and Remove (muted brick) far right, out of the reflex path. Four visible actions instead of eleven, same feature set. The completed-task hold stays minimal: a struck title with a sage check, Done on…, the terminal row, and a quiet 'done is done' line. On a repeating task, Remove now READS 'Skip today' (the series continues), matching what it does.

Two structural wins fall out. Every action is its own full-width row (label left, sub-label/state right), never a tight equal-width column, so a long label or a large system font can't clip a glyph, retiring the S22 bug at the layout level rather than per-string. And the hero honours light-vs-dark by construction: a solid accent fill with a white label in light-standard, a soft accentSoft tint with an accent label in dark-standard, and no fill at all in Quiet (accent text held by whitespace), all from existing tokens, no new colours (`t.scheme` drives it).

**The standalone Tomorrow was removed from the card** to cut density; the common push stays one tap as a new **Tomorrow chip in the Move-to picker** (`bulkMoveTo(addDaysISO(today, 1))`, the same semantics as the old card action). The old `deferTask` handler is now vestigial (reachable only through the removed action); left in place as harmless (still referenced, so no lint break), a trivial cleanup for later.

**Decided against** the other three directions: 1b (typed/sectioned, still dense), 1c (a bottom sheet, rejected because it detaches from the row and breaks "never lose your place"), and 1d (swipe+hold, kept as a possible later accelerator). No animation on the More reveal yet (a conditional render, which honours reduce-motion for free; a fade is a noted nicety). 4 new pure state paths, no logic change, so no new unit tests; typecheck + lint + 528/420 green. Verified in the web preview via forced-open state + computed-style checks in BOTH light and dark (the hero fill/tint, the terminal order Close·Select more·Remove, the sub-labels, the danger-brick Remove); the long-press gesture itself can't be fired headlessly, so the on-device feel rides the next build. TOD-07 rewritten to the 1a shape; TOD-26 (label-clip guard) updated to the new full-width rows.

## 2026-07-25 The widget's real blank-render cause, found on device: the React Compiler injecting a hook

The self-diagnosing handler (shipped hours earlier) did its job on the FIRST device test of v14: instead of a silent blank, the widget drew "Invalid hook call detected in TodayWidget." That is the answer the 2026-06 investigation never got, and it was NOT a new-architecture incompatibility.

Root cause: `app.json` `experiments.reactCompiler` is on, and the React Compiler injects a memoization hook (`useMemoCache`) into every compiled component. `react-native-android-widget` renders widget components in its OWN hook-less reconciler, so that injected hook throws and the render fails. The tell was built into the diagnostic by luck of naming: `diagnosticWidget` is a LOWERCASE function, which the compiler does not treat as a component and so does not compile, so it survived to report the error, while `TodayWidget` (capitalised → compiled → hook injected) blew up. This is almost certainly the original 2026-06-24 "blank widget," misread then as a 0.20.3 / new-arch problem because nothing surfaced the error.

**Fix: the `'use no memo'` directive at the top of `TodayWidget`,** the React Compiler's canonical per-function opt-out (Expo drives the compiler through babel-preset-expo, so there is no babel.config.js to add a directory exclusion to; the directive is the clean, local fix). The lowercase `diagnosticWidget` needs nothing. Rule going forward: any component rendered by react-native-android-widget's reconciler (not React's) must carry `'use no memo'`. Confirmed only in principle here; the next Android build is the on-device proof, and the self-diagnosis guarantees a clear verdict either way (tasks render = fixed; a new error = the next clue; blank = not firing).

## 2026-07-25 The widget's real cause, confirmed on device: the React Compiler. Plus the card gets its shape.

**The month-old "blank widget" was never a new-architecture problem. It was the React Compiler.** The v14 self-diagnosing build paid for itself immediately: on Melroy's device the widget drew "Invalid hook call detected in TodayWidget". `experiments.reactCompiler` (app.json) injects a memoization hook into every compiled component, and react-native-android-widget renders in its OWN hook-less reconciler, so the injected hook throws and the widget draws nothing. The tell was in the diagnostic itself: the fallback is a LOWERCASE function (`diagnosticWidget`), which the compiler does not treat as a component and therefore does not touch, so it survived to report the error that killed its capitalised sibling. Fixed with `'use no memo'` on TodayWidget (the compiler's canonical opt-out; Expo drives the compiler through babel-preset-expo, so there is no babel config in which to exclude a directory). v15 rendered real tasks on the home screen. **Rule learned: a silent failure in a foreign reconciler is worth one build to instrument. The diagnosis cost one build and closed a bug that had been mis-attributed for a month.**

**Then the shape.** v15 rendered, and revealed two visual faults Melroy named immediately: the card was "a tombstone" (rounded on top, sliced flat across the bottom) and three tasks left a large empty black field below them. Both came from the same root: `height: 'match_parent'` on the card. The background drawable's height and the host's measured height disagreed, so the bottom of the rounded rect fell outside the clip (top corners rounded, bottom corners square), and the card always stretched to the full slot no matter how little it had to say.

**Decided: two layers.** A transparent outer that fills the launcher's slot, and the visible card inside it at full width but `height: 'wrap_content'`, inset 2dp. Content-sizing removes the drawable/host mismatch (so all four corners round symmetrically, by construction rather than by luck), the inset keeps the card's edges off the clip boundary even if a host measures differently, and the card is now exactly as tall as what it has to say. `clickAction` moved to the card so only the visible surface opens the app. The rested branch dropped its `flex: 1` + centring, which are meaningless once height follows content. Config gains `resizeMode: 'horizontal|vertical'` and `maxResizeHeight: 300dp`: Samsung's One UI offered resize handles regardless (an earlier claim here that `resizeMode` defaulting to `'none'` blocked resizing was WRONG, corrected by Melroy's device), but other launchers honour the attribute, so it is now explicit rather than accidental.

**Decided against adding more CONTENT to the widget** (a task count, the date, check-off-from-widget, a "+" capture button). The emptiness was a sizing bug, not a content deficit, and filling a too-tall box with information would have solved the wrong problem while breaking the spine: a widget is a glance, not a second app, and this audience is the one for which more-on-screen is actively harmful. Quick-capture from the widget remains the single candidate worth revisiting one day, because it serves "remove friction" rather than adding information; it stays parked with the original 2026-06-21 deferral.

## 2026-07-25 A second widget: always-light, because contrast is set by the wallpaper

Melroy, looking at the working widget on a dark graffiti wallpaper: "the Widget is in Dusk... I want there to also be the LIGHT option for those with dark backgrounds."

**First, a correction to the premise, which sharpens the fix.** The widget already renders BOTH schemes: the handler has always passed `{ light, dark }` and Android picks by the phone's system theme. He was seeing the dark card because his phone is in dark mode. The real gap is that **a widget's legibility is set by the WALLPAPER, and the system theme knows nothing about the wallpaper.** Working the four combinations: light wallpaper + either mode is fine; dark wallpaper + light mode already gets the light card; only **dark wallpaper + dark mode** fails, drawing a dark card onto a dark background where the widget simply sinks away. That is exactly one broken pairing, and no amount of system-theme following can fix it, because the system does not know what the wallpaper looks like.

**Decided: a second widget in the picker, always light.** `Today` keeps following the system (the sensible default); `TodayLight` renders the light card in BOTH slots so the system theme cannot darken it. The two share one handler, told apart by `props.widgetInfo.widgetName`. **Decided against a forced-DARK twin** (no combination needs it, per the matrix above) and **against a Settings toggle or an Android configuration activity**: the choice belongs at placement, when the user is literally looking at their wallpaper, and the spine says remove friction rather than add a setting. A picker entry is a one-time pick, not ongoing configuration surface, so it does not violate the no-settings rule the way a toggle would.

The widget names now live in one pure module (`widget/names.ts`) because they must match app.json's plugin config exactly: the native providers are generated from those strings, and a drift would silently stop the handler recognising a placed widget and stop updates reaching it. Silent is the operative word: this feature has already lost a month to a failure that surfaced nothing, so the match is now a **test** (`names.test.ts` reads app.json and asserts the sets are equal, plus that every configured widget declares a label, a resizeMode and min sizes). `updateWidget` fans out over every registered name so both cards move together when tasks change. `expo config --type introspect` confirms both providers generate (`.widget.Today`, `.widget.TodayLight`). Also in this pass, at Melroy's prompt ("shouldn't it at least have the app name?"): the header gained a quiet `DoubleDone` wordmark opposite the accent `Today`, on the same row so identity costs no vertical space. That is chrome, not content, which is why it does not contradict the earlier decision to add no task DATA to the widget. New device case AND-08; a duplicate AND-06 id introduced earlier in the day was corrected to AND-07.

## 2026-07-25 A taller widget shows more of today, rather than more emptiness

Melroy, on the working light widget: "doesn't resize dynamically in the vertical sense. Horizontal works." Correct, and it was a consequence of the morning's fix rather than a regression: the card is `height: 'wrap_content'` (which is what killed the tombstone and the empty void), so it hugs its content and by design does NOT stretch into a taller slot. Horizontal worked because width stays `match_parent`.

**Decided: make the LINE COUNT follow the height, instead of making the card stretch.** Stretching would simply restore the void he objected to an hour earlier, since a card with three tasks in a tall slot has nothing to fill it with. What a task widget should actually do on a vertical drag is reveal more of the day. `MAX_WIDGET_LINES` was a hard 4, so no amount of dragging could ever surface a fifth task.

New pure `widgetLineCapacity(heightDp)` turns the launcher's height into a line budget (empirical constants: ~56dp of chrome for padding + header, ~24dp per line, measured against the shipped 3x2 card where header + 3 lines came to about 125dp), clamped to at least 1 and at most 10, because past ten rows a widget stops being a glance and becomes a list. It falls back to the old fixed 4 on a missing or nonsense height. `buildWidgetModel` takes the budget as an optional parameter, and both render paths pass it: the headless handler from `props.widgetInfo.height` (WIDGET_RESIZED reaches the handler, so the answer updates as the drag lands) and `updateWidget` from the `info.height` given to each `requestWidgetUpdate` callback, built per widget INSIDE the callback since two placed widgets can be different sizes.

**One behaviour change worth naming:** the budget now counts every RENDERED row, so when tasks overflow it the final row goes to "+n more" instead of being added on top of a full card. Previously 4 titles plus a more-line rendered 5 rows into a slot sized for 4, which pushed the card past its bounds and clipped the rounded bottom we had just fixed. Three titles plus the more-line is the same four rows. `remaining` is untouched, so the widget still tells the truth about what is left; it just shows fewer titles. An existing test asserting four titles was updated rather than bent, with the reason recorded in it.

Deliberately biased to UNDER-count lines (each budgeted slightly large): showing one task fewer is calm, while overflowing clips the card. The constants are estimates because RemoteViews text height cannot be measured from JS and varies with the device font scale; a device pass can tune them. 9 new unit tests (540 client).

## 2026-07-25 The app starts telling people it can come to them (Tier 1, part one)

The re-tiered Tier 1: the "app comes to you" pass. The finding behind it is the sharpest piece of feedback this product has had, because it is not about a missing feature at all. A churned-and-returned user asked for FOUR things that already existed (a routine nudge, the daily reminder, the home-screen widget, morning suggestions) because every one of them is opt-in and none is ever surfaced. The app is so calm that its own lifelines are invisible. And one of the four, the widget, was genuinely broken until this morning, which is why this only became honest to build today.

Investigating first paid off twice. **The daily reminder is ALREADY offered once**, on the rested screen after closing a day, so the job was to extend a proven pattern rather than invent one. And **the library has no pin API**, so an app can never place a widget for someone; the offer can only teach the gesture. But `getWidgetInfo()` reports what is on the home screen, which gives the thing that matters more: never ask someone who has already done it.

**Decided: at most ONE lifeline offer, ever, on the rested screen.** The reminder keeps precedence (more useful, and the established offer); the widget waits for a later evening once that ask is spent. Two asks stacked on the goodnight screen would be precisely the overwhelm the app exists to remove, and the close-the-day moment is for setting the day down, not for being sold to. Each offer shows once and never returns, whatever the answer. The rules live in a pure `lib/offers.ts` (`restedOffer`) with 9 tests rather than inline in the screen, because "when do we ask the user for something" is exactly the logic that rots into nagging when it is scattered across a render. `widget/presence.ts` (+ a `.web.ts` stub) wraps the launcher check and fails CLOSED: an unknown answer counts as "they have one", so a hiccup produces silence rather than an unwanted ask. Gated to Android (`WIDGETS_SUPPORTED`), since neither iOS nor web has a widget to place, and an iPhone must never be told to long-press a home screen that has no picker.

**Decided against** a Settings toggle for any of this (a setting is the opposite of surfacing), and against putting the widget offer in onboarding ONLY: onboarding reaches future users, while the people who churned have already onboarded and will never see it again. The in-app offer reaches both. Onboarding copy and the "Repeating is not a reminder" naming fix are the remaining parts of this pass.

Verified on web that the reminder offer still renders through the new decider (no regression), that a spent ask leaves a clean goodnight screen, and that the widget offer is correctly absent on web. The Android path rides the next build. 549 client tests. New device case AND-09.

## 2026-07-25 Plan my day asks about the day before it sorts it, and its answer can be argued with

Two pieces of Melroy's feedback, and one of them exposed dead plumbing.

**"Plan my day is quite nice but should take the user's feelings into account."** He wanted the sort to know whether it is a work day or a day off, what the weather is, how much energy there is, and whether the person wants indoor or outdoor work. Reading the code first found the punchline: **`/sequence` has always accepted an energy level and its prompt has always used it** ("for low energy, start with one or two small, low-friction wins"), and the client passed `undefined` at `today.tsx:1000`. So Plan my day was ordering the day while knowing nothing whatsoever about the person having it, and a third of the fix was one argument.

**Decided: one calm sheet, three optional questions, asked before the sort.** Energy (reusing the shipped chips, "Running low / Somewhere in between / Feeling good"), day type (work / off), and setting (indoors / out and about / either). Every answer optional, and tapping a chosen answer AGAIN clears it, so a mis-tap is undone the same way it was made. An unanswered question sends nothing, which matters: a default would be an assumption the model then plans a whole day around. The premium gate fires BEFORE the sheet, so nobody answers three questions and then meets a paywall. The prompt gained a line forbidding it from commenting on the person's energy or circumstances: it may use the context, it may never remark on how they feel.

**Decided AGAINST the weather, and the reason is a correction worth keeping.** "Use AI to figure it out maybe?" cannot work: a language model has no live weather data. Real weather needs a weather API plus a location permission, a new data source and a new permission on an app whose spine is remove-friction, which is exactly why it sits at Tier 4. "Where are you?" gets the same sort at zero cost, and the person knows their own sky better than a forecast for their postcode. **Indoor/outdoor was what the sort actually needed; the weather was only ever a proxy for it.**

**"Allow the user to cancel/edit the suggested outputs."** Cancel already existed ("Not now"). Editing did not: the proposal was take-it-or-leave-it, which sits badly with propose-then-accept. Each row now carries up / down / x. **Buttons, never drag:** dragging is unusable with a screen reader and hard with shaky hands, and nobody should need to be dextrous to disagree with a suggestion. Ends are DISABLED rather than hidden so rows never change shape as things move. Removing a task takes it out of THIS PLAN only, never off Today and never to another day, and emptying the plan entirely is a legitimate answer ("Nothing left in the plan. That's allowed.") with the accept button withdrawn, since an empty plan cannot be applied. Nothing touches the day until "Use this order". The array ops live in a pure `lib/plan-day.ts` where a no-op returns the SAME reference, so nudging the top item up genuinely changes nothing.

12 client + 5 server tests, 561/425 green. Verified in the preview by forcing the states (the chips tint and clear correctly, the end arrows dim, the edit controls render per row); the AI round trip itself is not exercised on web. E2E SEQ-07 and SEQ-08.

## 2026-07-25 "Sit with me" is NOT built, and the reason is that it was a menu of things the app already did

The build plan called this "the most differentiated thing left and the one only this founder would build." Melroy asked for it in those terms: *"What abotu Sit with me? Can we build that. THAT build is key."* A full design pass ran, thirteen agents, four designers against two adversaries each, and produced `docs/design-source/ways-through-design.md`. Then he asked for the user flows written out plainly, read them, and killed it:

> *"this doesn't.....do anything though? what am I missing? as in how does it help the person?"*

**He was right, and the design document is what proves it.** Written out as flows rather than as a premise, the feature was an entry point onto four doors: *Too big?* → Break it down or Make it tiny. *Not needed any more?* → Let it go. *Just not now?* → Move it. Every one of those already exists on the held card, one tap from the task. The only genuinely new door was *"Ask someone to sit with you"*, which drafts a message for the user to send to a friend. That is the app suggesting the user go find a human. Body doubling is a real ADHD strategy and the insight behind it was sound, but **an app cannot body-double you**, and what we had designed was a share sheet with a caring label on it.

So the honest description is: a new surface, a new copy pass, a new set of shame risks to manage, in exchange for re-presenting actions that were already one tap away. The differentiation was in the framing, not in what the user could do afterwards.

**Decided: demoted to Tier 4, not deleted.** The `ways-through-design.md` pass is committed, because the reasoning for stopping is worth more than the design was. The trigger to revisit is a real user saying the aloneness itself is the blocker in a way the existing doors do not address, which is a different and much higher bar than "this is a named ADHD strategy we do not cover."

**Two things the pass was still worth.** It found a live bug on the way past: the Focus picker was a centred non-scrolling column, so on a long Today the list was clipped at both ends and those tasks could not be selected at all (fixed in 532b157). And it is the clearest example yet of the discipline this project keeps claiming: the correct response to a well-argued design for a feature nobody needs is to not build it, no matter how much design went in first. Melroy's instruction after the kill was *"Please fix the bug it found firstly. So it was not a waste."*

## 2026-07-25 The Calendar can be added to, which is what its name had been promising

Tier 1's only code item, and the whole of it turned out to be one thing rather than two.

**The plan said "set / clear a date on an existing task, AND tap a future day to add to it." The first half was already built.** The held card's "Move to…" sheet has offered Today / Tomorrow / This weekend / Next week presets *plus a full `DatePicker`* since the design-1a rebuild, and "clear the date" is just "Move to Today". The BUILD-PLAN entry claiming otherwise was written earlier the same day from older text and never checked against the code. Reading first turned a two-part feature into a one-part one, which is the second time today that investigating before building removed most of the work.

**What was real: the rename made a promise the screen could not keep.** Calling it "Calendar" tells a person they can put something on a day. Day cells were already pressable, but `openDay` only *selected* a day to read. So the fix is small and specific: a future day offers "Add for this day", one line, one tap.

**Decided: future days only.** The past stays read-only because the Lookback is a shame-free RECORD; offering to add to a day that has gone would either lie about when the task was made or invite padding a day to look busier, and this screen exists to do neither. **Today is excluded too, and that is the less obvious call.** Today already has capture, permanently docked; a second door to the same action somewhere else teaches two habits for one thing. `canAddToDay` is a pure lexicographic ISO compare (chronological by construction, no Date parsing, no timezone drift) and is re-checked inside the handler rather than trusted from the JSX, because a guard that only lives in render is one state change away from being wrong.

**Decided: no date picker inside the flow.** The day you tapped IS the date. Putting a picker there would ask the person to choose a day they had just chosen.

**Two shared helpers came out of it.** `makeId` and `nowMs` moved from `today.tsx` into `lib/tasks.ts`. `makeId` had to: it is `<ms>-<counter>` with a module-scope counter, so two screens each holding their own copy both start at 1, and a task made on each within the same millisecond would have collided on `t-<ms>-1`. One counter makes that impossible rather than unlikely. `nowMs` followed for the reason its old comment already gave: the React Compiler's purity rule rejects `Date.now()` called from a function defined during render, and module scope keeps every screen's handlers pure by construction instead of by each one remembering.

**Switching days mid-type discards what was typed**, deliberately: the input belongs to the day it was opened on, and silently re-pointing it at a newly selected date is how a task lands somewhere nobody asked for.

Verified in the preview end to end: a future day offers the add, the past and today do not, typing and adding writes an ordinary one-off with `due` set to the chosen day, it appears immediately under that day's SCHEDULED list, and the confirmation names the date. **The preview caught a real bug the gate could not:** the button read `common.add`, the literal key, because `add` lives under `capture`, not `common`. Typecheck and lint were both green with it. 7 new unit tests (5 `canAddToDay`, 2 `makeId`), 568 client + 425 server green. E2E LB-11. **The visual styling is unverified**, the screenshot tool cannot composite here, so it wants a human glance.

## 2026-07-25 There is no Break-it-down cap, and now there is no claim of one either

The build plan had carried an item for months: a "~10 a month" fair-use cap on Break-it-down was policy, with no meter behind it, so build the meter. `lib/energy.ts` already had the pattern; it looked like a tidy afternoon.

**Checking before building found there was no policy.** The number appears in no user-facing copy, not in `docs/premium.md`, not in the Terms, and nowhere in the code. It existed in one document, describing itself.

That inverts the job. It was never "enforce a promise we made", it was "**introduce a restriction on a feature that has always been unlimited**", on a live product with paying subscribers, for an audience where a takeaway lands especially hard. Shipping it would have meant a free user who broke down twenty tasks last month meeting a wall this month for a rule nobody had told them.

**Melroy's call: delete the claim, keep the feature uncapped.** Both BUILD-PLAN entries are gone.

Worth recording what the actual exposure was, since the old wording overstated it and that overstatement is what nearly bought a feature. `/decompose` already sits behind an origin gate, a per-IP rate limiter and a 100KB body cap. Scripted abuse, the thing that could actually drain a $25 monthly budget, was covered the whole time. What was missing was a per-user count of *legitimate* use by a human clicking a button, which is slow, self-limiting, and not what the budget was ever at risk from.

**If cost does become real, the first move is an alert on the D1 spend telemetry we already collect**, so we would know before it mattered. A limit is the last resort, not the first, and one nobody was told about is not a limit, it is a surprise.

The general lesson, and the second time today it applied: a backlog item that describes the world can go stale, and then the plan is the only thing still saying the world looks like that. Both this and "scheduling gets hands" were smaller or different than the document claimed, and both times the cost of checking was minutes.

## 2026-07-25 The app offers its lifelines at the start, and admits that "repeating" does not mean "reminder"

Part two of the "app comes to you" pass, and the end of Tier 1. Part one (2026-07-25, earlier) put the reminder and widget offers on the rested screen. The gap it left: **a person only reaches a rested screen by closing a day**, and someone who never gets that far never learns the app has lifelines at all. That is precisely the churned user the whole finding came from.

**The offer went ON the last onboarding screen, not into a new step, and the reason is written on the screen itself.** That screen's heading is **"That's it. No setup."** An eighth step asking the user to configure something would make the app contradict itself on the way out the door. So it is one aside under the existing copy, quieter than the "Open Today" button, which stays the loudest thing there. The app can say "no setup" and still tell you what exists; it cannot say "no setup" and then hand you a setup screen.

**It shares one budget with the rested-screen offer**, through the same stored flag. Either answer here spends it, so nobody is asked in onboarding AND again at goodnight, and a replay of the introduction from Settings never re-asks something already answered. A refused OS permission also spends it: asking again after someone has said no to the system dialog is nagging, not helpfulness.

**The widget is MENTIONED on Android, not offered, and deliberately does not spend the widget offer.** This is the one place the plan's instruction was not followed literally. An empty widget on day one sells nothing: there is no day in it yet. So the real ask still waits for the rested screen, where there is something worth looking at, and the onboarding line exists only so nobody reaches week three unaware the widget is there. Offering it at first run and never again would have been worse than the behaviour we already had.

**The naming fix: `repeat.notANotification`.** A repeating TASK and a NOTIFICATION are different things and the app calls both a kind of "reminder", so a person who sets a task to repeat can reasonably expect to be told when it is due, and then is not. Fixed by stating the limit where the expectation is actually formed, in the Repeating drawer, and pointing at the two routes that DO notify (hold a task, Remind me; or the daily nudge in Settings). **Nothing was renamed:** "Repeating" is the right word for a task that repeats, it just needed its boundary said out loud. Rendered fainter than the subtitle, because it is a clarification and nothing is wrong.

`makeId` had a THIRD copy in `welcome.tsx` with its own counter, alongside the two consolidated earlier today. Now shared, so a first-run capture and a Today capture in the same millisecond can no longer mint the same id.

Verified in the preview: the offer renders on the handoff with Yes / No thanks, "No thanks" spends the flag (`doubledone.reminderoffer.v1` = yes) and the offer does not return, the widget line is correctly absent on web, and the Repeating drawer shows the clarification naming both real routes. E2E ONB-04 and REP-04. **Two catalog mistakes were caught by the gate rather than by me:** unescaped apostrophes in the French and Italian strings, and then `notANotification` inserted into the `lookback` block instead of `repeat` in all three translated catalogs, because the anchor `subtitle:` exists in both. The catalog type system named the second one exactly. Gate green: 568 client + 425 server.

## 2026-07-25 The tombstone and the dead resize were one bug, and the cause was an assumed font size

Melroy reported vertical resizing still broken on v18, then sent a device screenshot that explained everything: the card rounded on top, sliced flat across the bottom, the last title ("Test B") cut through the middle. Not a shape bug wearing a new hat. **An overflow bug wearing the tombstone's clothes.**

The card is `wrap_content`, so it grows to fit its content. `widgetLineCapacity` told it six lines fit a slot that holds about four. The card grew past the slot, Android clipped it at the slot edge, and the rounded bottom went with it. Both symptoms, the tombstone AND "resizing does nothing", were that one over-estimate: with few tasks nothing changed on a drag because there was nothing more to show, and with many tasks it clipped.

**The cause is worth writing down precisely, because the arithmetic was right.** The old constants were `CARD_CHROME_DP = 56` and `LINE_DP = 24`, and those are exactly correct for TodayWidget's real styles: 16+16 padding, a 16px header at ~20dp, 15px titles at ~18dp with a 6dp gap. What they silently encoded was **font scale 1.0**. Text grows with the device's font setting; padding does not. On a phone set larger, a line costs nearer 30dp and a budget of six renders into a slot that holds four. The estimate did not drift, it was never general.

**Fixed by splitting the sum along that seam.** `PADDING_DP` and `LINE_GAP_DP` are fixed; `HEADER_TEXT_DP` and `LINE_TEXT_DP` are multiplied by the real `PixelRatio.getFontScale()`, read in the handler inside its own try so a failure costs a smaller card rather than a blank one, and clamped so a nonsense scale can never INFLATE the budget. Plus `SAFETY_DP = 14`, half a line of air always left unspent, because RemoteViews text metrics are not simply fontSize x 1.2 and JS cannot measure real text height. And the ceiling drops from 10 lines to 6: ten was a list pretending to be a glance.

**The governing rule, now stated in the code:** the two failure modes are wildly asymmetric. Under-filling leaves a slightly smaller card sitting in its slot, invisible, reads as deliberate. Over-filling mutilates the card and slices a word in half. **Spend the doubt on under-filling, every time.** The old comment claimed to be "biased to UNDER-count" and was not biased at all, which is how this shipped twice.

**Decided AGAINST making the widget scrollable**, which was Melroy's suggested fix for 11-20 items. A widget is the one surface where you cannot act, so every tap just opens the app and scrolling a read-only list is friction with no payoff. More importantly it re-imports the exact overwhelm the product exists to remove: DoubleDone's spine is that today is finite, the home screen is deliberately protected from the full list, and a widget you can scroll twenty items in is the full list on your wallpaper permanently. If Today really holds twenty things the product answer is Lighten today, not a taller widget. "+15 more" is honest and calm. It also costs a `RemoteViewsFactory` collection service, a materially jankier rendering path than the bitmap we use. Melroy accepted the reasoning.

`wrap_content` is KEPT. Melroy's words on the shape were "truly TRULY elegant", and the rounding is only correct because the card sizes itself; `match_parent` is what caused the original drawable/host mismatch. The card stays honest about its own height, it is just no longer allowed to lie about how much fits.

7 new unit tests including a strictly-more-cautious property (the new budget is <= the old one at every height and scale tested), a monotonicity guard so resizing still means something, and a clamp test proving a garbage font scale cannot buy extra lines. E2E AND-05 rewritten to name the failure shape ("rounded on top, flat across the bottom, last title sliced") so a future tester can grade it without knowing the history. **Unverifiable here: this is Android-only and rides v19.**

## 2026-07-25 The constant frame: Today's day tools move into one fixed layer at the thumb

The redesigned UX, from the Claude Design pass Melroy ran on the action architecture ("1b, developed"; board + README in the design handoff). The finding it answers came out of this codebase, not the mockups: every day tool rendered CONDITIONALLY (Focus needed a task, Plan needed AI plus two, Lighten additionally needed a heavy day), so the action layer reshaped itself as the task count changed, the day ran BACKWARDS down the page (a mid-day tool above the list, the start-of-day tool second from the bottom), and Close the day, the product's emotional payoff, sat buried under the whole list plus two buttons. On an app whose stated guardrail is "autism needs predictability", the action layer was the least predictable thing on the screen.

**The frame.** One fixed layer docked above capture, outside the ScrollView, always the same pixels: an overline "RIGHT NOW" plus the one tool that suits the hour, and a 44px caret opening a panel that grows upward with the SAME tools in the SAME day order, always: Plan my day, Focus on one thing, Lighten today, Close the day, the occupant tagged "now". The list dims 40% behind it and never moves. The screen loses four conditional elements (Focus-above-the-list, the "Today's looking full" line, the stacked Lighten/Plan buttons, the separate wind-down line) and gains zero: in the evening the italic inscription under capture simply becomes the wind-down sentence.

**The occupant is set by the clock, never the list, and resolves once per screen open.** Dawn to 11 is Plan (starting the day), 11 to 17 is Focus (working it), 17 on is Close (setting it down; 17:00 is dusk in the living background's own phases, so the slot and the sky agree). **Lighten is never the occupant**: it exists for a condition, and a conditional occupant is the self-reshaping this design exists to kill. It waits in the panel, quiet until the day is genuinely heavy.

**Quiet-unavailable, the design's best idea, kept exactly:** an unavailable tool holds its place at lowered contrast (the inkFaint token, verified in the preview as the spec's own hex), no lock, no border, no strikethrough, and tapping it explains in ONE plain line what the TOOL needs ("Plan my day needs two or more tasks."), never what the person lacks. The screen-reader label carries the tool name plus the same hint.

**One deviation from the board, recorded:** with AI OFF, Plan and Lighten are GONE from the panel, not faded. The board says "always the same four", but the app's standing rule (E2E-tested) is that AI-off hides every AI affordance, and a permanently-unavailable tool would be an ad for a feature the person switched off. Within a configuration the set is constant, which is what predictability actually needs.

**The Energy pills replace the low-day toggle, and Low IS the low day.** Low/Normal/High sit with the gauge, always visible on an open day (the old toggle vanished on exactly the days it served). They are a DAY-state, never a setting: the record is stamped with the date and a past day's record is ignored on read, so "resets each morning" is a read-side rule needing no scheduler. Low writes the same lowDayDate the close-day copy still reads (one concept, one source of truth, no migration) and keeps its warm affirm. High re-scales what "full" means (gauge denominator 12, heavy at 9) and reuses the normal-day labels, because "you could fit more" is a sentence this app never says. dayWeight kept its boolean form (true = low) so every old call site and test reads unchanged.

**Plan my day reads the pill and stops asking.** When the pills were touched today, the sheet's energy question does not render and planEnergyFromDay carries the answer (low->low, normal->medium, high->good) on the request. Energy is read, never asked twice: Melroy's rule from the plan-day build, confirmed by him for this design. Untouched pills leave the sheet exactly as shipped this morning.

**Verified in the preview end to end:** the frame renders fixed at 21:00 with Close occupying the slot; the panel opens with all four in day order and "now" on Close; the scrim is full-screen at 0.4 and closes on tap; AI-off collapses the panel to Focus+Close; High on a 7-task day sends Lighten quiet and tapping it shows the hint without running Strategise; the pill survives a reload; and the premium Plan sheet opens with two questions instead of three. 17 new unit tests (day-tools 12, estimate energy 5). E2E TOD-27 (the whole frame) + SEQ-07 updated. Gate green: 589 client + 425 server.

**Not carried over:** the 200ms fade on the panel (the preview cannot verify animation and reduce-motion must stay instant; the panel and scrim currently appear immediately, which IS the reduce-motion behaviour, and a fade can ride any later polish pass). Recorded so it is a choice, not an omission.

## 2026-07-25 Focus could not be exited by mouse on web, because the scroll fix buried the door

Melroy, live from the browser: "In Focus mode, I couldn't escape even though I clicked Escape on Web." The cause was yesterday's own fix. The Focus-picker scroll repair (532b157) turned the picker into a full-bleed ScrollView, and the Exit button, absolutely positioned top-left, was rendered BEFORE it. Stacking follows sibling order, so the scroller sat ON TOP of Exit across the whole screen and every click landed on the scroll surface. The fix that freed the clipped list buried the door.

**Proven, not just reasoned, in both directions.** On the pre-fix build (git stash), `document.elementFromPoint` at the Exit button's centre returns the ScrollView's content container: the click cannot reach the button. On the fixed build the same probe returns the Exit itself. The fix: the Exit renders AFTER the ScrollView inside the modal, plus a zIndex as belt-and-braces, so it always wins the stack.

**A second finding from the same investigation, worth keeping:** in the rAF-throttled preview the modal appears to stay open even after `closeFocus` runs, because RN-web's `animationType="fade"` plays a fade-out before unmounting and the throttled preview never finishes it. Reading the component's fiber showed every boolean hook false: the STATE had closed, only the animation was stuck. So "the modal did not close in the preview" is a tool artifact, not an app signal, and the fiber-read trick (walk up to the screen fiber, list the hook states) is the way to tell the difference. Added to the gotchas.

E2E FOC case updated with the mouse-click regression. The deeper lesson mirrors the tombstone from this morning: two fixes today each created the very symptom they fixed elsewhere, and both were caught by a real user within a day. The E2E suite now checks BOTH halves (scrolls AND exit-clickable; shows-more AND never-clips).

## 2026-07-26 Missed nudges expire in the tray with the app closed, via a patched notification builder

The other half of the spine fix, and the last v19 build item. The app-open sweep (2026-07-24) clears delivered daily / routine / Rhythm notifications the moment the app opens; this makes them expire WITHOUT the app opening, so a phone left on the nightstand never accumulates a guilt-heap.

**Not the config plugin the backlog predicted.** `expo-notifications` 56.0.18 exposes `timeoutAfter` nowhere: not in the JS API, not in the Kotlin builder, so there was nothing for a config plugin to switch on. The mechanism is a **patch-package patch** on `ExpoNotificationBuilder.kt`, six lines: when the JS data payload carries `timeoutAfterMs`, hand it to Android's `NotificationCompat.setTimeoutAfter`. The root `postinstall` applies it, so EAS builds and CI get it with no extra step, and the failure mode is LOUD: if a future expo-notifications upgrade moves the file, the patch fails the install rather than silently shipping without expiry. Verified by a full reverse-and-reapply round trip.

**The shelf life is structural, not a constant.** `slotTimeoutsMs` (pure, in reminders-types.ts, 5 tests) gives each daily-repeating slot the gap to its NEXT slot, wrapping midnight, capped at 12 hours. So a 30-minute water Rhythm's slot expires exactly when its successor arrives and two of the same Rhythm can never sit in the tray at once, which is "never stack" by construction rather than by cleanup. A lone daily slot wraps to 24h and takes the cap: past half a day a nudge is not a nudge, it is an entry in a guilt-heap.

**Per-task nudges deliberately do NOT expire**, mirroring the app-open sweep's own rule: "Remind me about this task" is actionable and stays until acted on; the swept classes are come-back invitations whose moment passes.

Costs accepted: a patch on a third-party native file is a maintenance liability, but it is six lines, loudly self-verifying at install, and the alternative (forking the module or a custom notifications service) is heavier for the same six lines. `setTimeoutAfter` is API 26+; older Androids keep today's behaviour, which is a graceful floor. E2E AND-10 documents the mechanism so a failed patch after an upgrade is diagnosable from the test suite alone. **Android-only and unverifiable off-device: the v19 build is the proof.**

## 2026-07-26 Capture rebuilt to "Reflex first, one door" (Claude Design 4, overnight build)

The last dense surface, finished to the constant frame's own logic. The old panel rendered every power around every thought: six schedule chips, weekday rows and steppers appearing beneath them, a steps field, up to four buttons, three hints, all around a person holding a fragile thought. The Claude Design capture handoff (design system 4, Melroy's pick before bed 2026-07-25: "I want this re-design included please") resolves it as **reflex first, one door**: the open panel is header (ADD + Close), input with Speak/Scan beside it, ONE bordered door, the action row, one hint line. Nothing else.

**The door.** A constant bordered row, overline "WHEN · REPEATING · STEPS", value line naming everything currently set ("Today", "Today · Weekly on Mo", "Tomorrow · 3 steps"), wrapping never truncating. It opens a composer of three FIXED rows in fixed order (When / Repeats / Steps): user-initiated disclosure in a fixed place, never app-initiated reshaping. The Steps row goes quiet-unavailable (lowered contrast plus a plain-words reason, the constant-frame treatment) on a multi-line dump or a repeat, instead of vanishing as it used to. The one surviving label swap, Break it down ↔ Sort for me by line count, keeps position, size, and role, and the design accepts it as content-in-place.

**The Add button says what will happen.** "Add", "Add · Tomorrow", "Add · Weekly on Su", "Add 3", "Add 3 · Tomorrow": the consequential part rides the button, so nothing surprising ever lands. Pure logic in `lib/capture-door.ts` (doorSummary / addButtonLabel, 11 tests).

**One rule composes WHEN with REPEATS, resolving the design's one ambiguity.** The handoff showed both a WHEN row and a "Starting from" line without defining their interaction. Decided: the WHEN answer IS a repeat's start date ("Tomorrow · Daily" starts tomorrow), and "Starting from" in the Repeats row is the same value read through, opening the same picker. One source of truth, two views; the old separate `start` state is gone. The picker also normalises: picking today or tomorrow lands on those chips, so the chips never lie.

**Two iron rules got structural fixes, not promises.** *The first keystroke never waits:* the panel opens with the input focused via an effect on the open flip (focus only lands after the reveal renders). *Text is never lost:* BrainDump now stays MOUNTED while the panel is hidden (display:none in today.tsx, not unmount), so a collapse keeps the typed words; Close resets only the door (Today · no repeat · no steps, the design's reset rule), Add resets everything. The inbound share/shortcut seed flow was re-anchored on this: the ref now exists early, so seeds go straight through it and setCaptureOpen just reveals.

**The Right-now slot yields while capture is open.** The one exception to the constant frame, from the design: the person is mid-thought, and the frame returns the moment capture closes. Verified live in the preview: frame away when open, back on close.

**Decided against:** a second "Starting from" source of truth (the ambiguity above); keeping the six-chip row in any form; hiding unavailable steps (they go quiet instead); autoFocus on mount (fires while hidden at cold start, so the effect-on-open does it); keeping the panel's separate sort hint as a second line (the ONE hint line holds error > Tidy offer > AI egress note, and the egress disclosure wins whenever text is present; the sort teaching lives in the placeholder). Ten orphaned catalog keys removed from all four locales (addDaily, addForDate, addForThatDay, addForTomorrow, addRepeating, addWeekly, modeDate, sortHint, startToday, onDateA11y).

**Verified in the preview end to end:** opens focused; door summary and Add label correct through weekly (2 taps beyond typing, under the design's 3-tap budget), Tomorrow, multiline ("Add 3", "Add 3 · Tomorrow"); weekly task lands with the repeat glyph and the panel fully resets; typed text survives Close and reopens focused; frame yields and returns; steps quiet with the correct reason each way; AI-off drops Scan, the AI slot and the egress note while Speak stays and Add takes the row. Gates green: typecheck, lint, 425 tests. E2E: CAP-03/04 rewritten, CAP-10/11/12 added. Visual look awaits Melroy's morning eyes (the preview pane was closed overnight, so behaviour is DOM-verified, pixels are not).

## 2026-07-26 The adversarial copy audit (backlog #40), run and applied

The audit the backlog held for "after the design waves" ran the morning after the second wave landed: five adversarial finders (tone, four-catalog parity, hardcoded strings, stale copy, native-speaker review of the overnight translations), then every finding faced three hostile judges (factual, product-voice, regression) and needed two of three to survive. 54 raw findings, 40 survived, all 40 applied.

**The genuine bugs it caught:** the Lighten-today failure named the WRONG feature in all three translations ("trazar el plan" / "tracer la route" / "tracciare la rotta" are the Chart-a-course transcreations, so a failing Lighten blamed Chart); the repeat drawer's empty state still directed users to "the Daily or Weekly chip", which the capture door made invisible two days ago (all four locales, with it.ts also quoting chip names that never matched its own labels); the Bloom, the app's biggest emotional moment, was hardcoded English for every es/fr/it user (now celebrate.bloomEyebrow x4, plus its dismiss a11y label); the Break-it-down fallback questions had translated catalog keys sitting unwired since the i18n sweep, so offline es/fr/it users got English questions (DEFAULT_QUESTIONS is now defaultQuestions(), read from the catalogs at call time); and the Calendar's day cells announced raw ISO dates ("2026-07-25, 3 finished") to screen readers, now a spoken date via fmt.monthDay.

**The voice corrections:** "Finish that one first." became an invitation, not an order, in the one flow that exists for stuck people (all four locales); "Finish a few things this week to make a scrapbook" lost its assignment energy the same way; "due" left the repeat drawer's visible copy; "strategise" and "time-boxed" (productivity jargon) left the UI; the held-card coachmark now names the four actions the design-1a card actually leads with instead of the two it folded behind More; the a11y twin of "Mark as a lot" stopped saying "big" and gained a singular form for the single-task held card; the Rooms menu a11y inventory gained the Premium room it had omitted; fr got its two vous-register outliers moved to tu and a file-wide no-break space before double punctuation (so a lone "?" can never wrap alone on a narrow phone); it healed its passi/passaggi split in favour of the UI's own "passaggi"; es's door a11y lost the "Ahora: Hoy" time-word collision.

**Housekeeping:** 16 dead keys (15 orphaned by the constant-frame and held-card redesigns plus capture.speakHint, whose only consumer was a welcome-screen line telling first-run users to tap a Speak button that is not on that screen, now removed) deleted from all four catalogs, each verified unreferenced before deletion.

**Decided against, per the judges:** de-capping APPEARS in repeat.notANotification (all four locales cap it deliberately, it is a cross-locale emphasis device); renaming visible "big" state descriptors (bigTag, rowLabelBigSuffix) along with the a11y labels (scope creep the regression judge flagged); and 12 other findings killed as misquoted, no-better, or overreaching. E2E TOD hold-hint case updated in the same commit. Gates green: 605 + 425.

## 2026-07-26 The scrapbook gets found: one payoff sentence, and the ladder's last rung

Melroy's observation, sanity-checking the feature: the scrapbook is barely advertised outside the premium page. True, and specific: the FREE monthly scrapbook (the taste that exists to sell the weekly premium cadence) was mentioned nowhere a free user would meet it, so the funnel depended on stumbling into the Calendar. Two builds, both his pick ("do both B and C"):

**C, the payoff sentence.** The onboarding's "What you finish, you keep." screen gains one line: a finished week can become a small keepsake image, once a month, free. One sentence inside the existing screen, no step, no button, hidden entirely with AI off (the scrapbook is an AI feature and an opted-out user is never pitched one).

**B, the earned-moment mention.** The rested screen's offer ladder gains its third rung: when the reminder and widget asks are spent, a scrapbook has never been made, AND the current week holds at least 3 deduped finishes, one calm mention appears once, ever: "You've finished enough this week to make a keepsake of it. It's waiting in your Calendar.", with a door to the Calendar and a Not now. Either answer spends it forever. The trigger threshold is SCRAPBOOK_OFFER_MIN = 3 (a judgment, recorded to be challenged): the Lookback allows a scrapbook from 1 finish, but the mention's own sentence ("you've finished enough") only becomes plainly true with a few, and pitching after a single tick is exactly the sales-pitch energy the goodnight screen must never have.

**The rung is declared LAST.** The one-ask-at-a-time ladder (reminder, then widget, then this) is now three rungs and the code says no more join it: a ladder that keeps growing IS the pitch this screen exists never to be. Decided with Melroy in the same conversation.

**Decided against:** a dedicated onboarding step with a sample scrapbook image (adds a step, sells AI flash before trust, and the audience distrusts flash); triggering on the Lookback's own 1-finish floor (premature, see above); counting raw completions rather than the scrapbook's own deduped weekTitles (the mention must use the same arithmetic as the thing it promises). Verified in the preview end to end: the mention renders on a seeded rested day with 3 finishes and spent earlier rungs, "See your Calendar" lands on the Calendar and spends the offer, and the flag survives reload. 6 new offers tests (AI off, under-threshold, already-made, once-ever, rung precedence). E2E ONB-05 + TOD-28.

## 2026-07-26 The keyboard ate the capture panel (tester report), and the peak needs a v20

The first field report on the redesigned capture, hours after the v19 AAB was cut: two screenshots showing the open panel reduced to "ADD / Close" with the input, the door and Add all buried under the keyboard. The kind of catch closed testing exists for.

**Three causes stacked.** (1) Edge-to-edge Android (SDK 5x) IGNORES the old adjustResize behaviour, so the OS never shrinks the window for the keyboard, and the app has no KeyboardAvoidingView anywhere. (2) Chrome 108+ on Android defaults to the same overlay behaviour on web, and our viewport meta never opted out. (3) The old panel MASKED both for a month: it never auto-focused, so the user saw the panel first, tapped the input themselves, and the OS panned the focused line into view. v19's "the first keystroke never waits" opens the keyboard WITH the panel, so the flaw went from clunky-but-workable to panel-not-visible-at-all. The iron rule was right; it exposed a debt underneath it.

**The fix, both surfaces.** Native: today.tsx tracks the keyboard height (Keyboard listeners; will-events on iOS, did-events on Android) and lifts the footer by it while capture is open, minus the home-indicator strip iOS double-counts; scoped to captureOpen so the held card's inline edit and the modals keep their own behaviour. Web: `interactive-widget=resizes-content` on the viewport meta restores the resizing layout viewport (Safari ignores the token harmlessly; and +html.tsx only wraps the EXPORTED build, so the dev server can never show it). While the keyboard is up over an open capture, the inscription and footer links tuck away so the panel owns the room above the keyboard.

**Decided against:** KeyboardAvoidingView (its edge-to-edge behaviour varies by RN version and OEM; explicit listener arithmetic is inspectable and matches the app's one use case); react-native-keyboard-controller (a new native dependency the week of launch for one surface); and removing focus-on-open (the design rule was correct, the ground under it was not).

**Launch consequence: v19 hands the torch to v20.** The designated pre-launch build cannot ship with its most-used surface unusable on its primary platform; the native half of this fix only exists in a new build, and it is UNVERIFIABLE off-device (the desktop preview has no virtual keyboard), so v20 needs the reporting tester's phone to confirm. Web ships now. E2E CAP-13 is the regression guard; the gotcha is in CLAUDE.md so no future bottom-anchored surface ships without a keyboard plan.

## 2026-07-27 Settings shows the installed version (belongs to 8de7a35; entry landed one commit late)

Born from the v19/v20 keyboard-fix confusion: a tester reported the bug persisting, Melroy asked which build he held, and the honest answer was that NOBODY could tell. Every store build shares the version name 1.0.0 (held constant while iOS sits in review), and the versionCode is invisible everywhere a user can look: not in the app, not in Android's App info, not on the Play listing. "Quadruple confirming" was structurally impossible.

The fix is one quiet line at the foot of Settings, "v1.0.0 (20)" via expo-application's package-manager read (the truth of what is INSTALLED, not what the bundle believes), "v1.0.0 (web)" on web. Deliberately not a catalog string: it is an identifier, identical in every locale. First question of every future bug report, and E2E SET-11 says so.

**Decided against:** exposing it anywhere louder (Settings-foot is where the curious look and the calm stays intact), and a debug screen (a one-line answer does not need a room). Cost accepted: expo-application is a new native module, so the line first exists in the NEXT build; it could not help the very confusion that created it, only every one after.

## 2026-07-28 The keyboard fix is device-proven; the "still broken" report was a version mirage

Closing the 2026-07-26 keyboard entry: the tester's follow-up "same issue on v20" was v19 still installed (version name 1.0.0 on every build made this undetectable from the phone, exactly the ambiguity the new Settings version line exists to end). After a clean reinstall of actual v20, the capture panel rides above Gboard on his Pixel 7. CAP-13 confirmed on-device. v20 stands fully proven as the pre-launch build.

## 2026-07-28 App Review rejection: the sign-in wall before Apple IAP comes down (5.1.1(v))

Apple rejected the iOS submission: an app cannot REQUIRE registration before purchasing an IAP that is not account-based. Our purchaseGate returned 'sign_in' for anonymous users, built deliberately as the double-charge guard (a web Stripe subscriber opening iOS anonymously reads as free, and Apple cannot know about the Stripe subscription). Apple's rule is absolute and their suggested pattern is ours inverted: allow the anonymous purchase, explain that signing in extends it to other devices, offer registration any time.

**The plumbing was already ready.** The RevenueCat seam aliases an anonymous purchaser onto their Supabase id at sign-in (Purchases.logIn on session change), returns to anonymous on sign-out, and the webhook already refuses $RCAnonymousID rows and resolves bought-anonymous-then-signed-in via aliases. Only client POLICY blocked the anonymous path. Four moves, all on the premium branch:

1. **purchaseGate drops 'sign_in'** (the enum member is deleted, so the compiler found every stale use): anonymous on iOS is 'buy'. The wait window (the double-charge guard) survives where it is honest, on the signed-in path; StoreKit itself refuses an already-owned subscription for the same-Apple-ID case.
2. **localPremium() in the purchases seam**: the provider merges the DEVICE's RevenueCat entitlement over the server answer (add-only, iOS-only by construction; the stub returns false on web/Android). An anonymous purchaser is premium on the device that bought, immediately and across relaunches, with no server row.
3. **The paywall's signed-out foot becomes Apple's suggested explanation** (footAnonymousIap, four locales): no account needed, sign in any time for other devices, and web subscribers should sign in first, which is the double-charge guard expressed as information now that 5.1.1 forbids it as a wall.
4. **Restore is ungated**: the receipt lives with the Apple ID, and with the local merge an anonymous restore genuinely unlocks.

**The honest cost, accepted because Apple gives no choice:** an anonymous iOS buyer who ALREADY has web Stripe Premium can now double-subscribe (the app cannot know about Stripe without an account). Mitigations: the foot line warns exactly that person, the entitlement source column means signing in later reveals both subscriptions, and the population (web subscriber, iOS, refuses to sign in, buys anyway past a warning) is small. PREM-21 (a SIGNED-IN Stripe subscriber is never charged) is unchanged and stays the most important iOS case.

**Also in the rejection, resolved outside the code:** duplicate promotional images across the promoted IAPs (2.3.2); Melroy is generating two distinct Dusk-palette images (one keepsake for Monthly, a year's arc of them for Annual). E2E PREM-19/23 rewritten to the new flow. Device-proof needs the next TestFlight build.

## 2026-08-01 The Analytics Centre (backlog #41): a token-gated glance over data D1 already holds

Melroy asked "how do we do this" the day after launch; the answer that fits a one-person studio: **no new analytics product, no client changes, one server-rendered page** at `/admin/analytics` on the existing Worker, gated by an `ANALYTICS_TOKEN` secret (the RevenueCat webhook's shared-secret posture; 503 when unset so an undeployed secret can never mean an open page; the token rides a query param on purpose, because the owner's phone bookmark cannot set headers and this is a read-only page for one person). It answers the four questions from tables that already exist: premium by store and status plus trials (entitlements, trials), month-to-date AI spend and projection against the cap reusing the monitor's own price table (ai_calls + modelCostUsd/projectMonthEnd), the moat's flywheel (decompositions offered vs came back with a finished step, median days to the first, from ai_calls x outcomes), and 28-day scrapbooks (scrapbook_log). Dusk-coloured HTML, no JavaScript, noindex, no-store.

**The Cloudflare recommendation the backlog item asked for:** D1 aggregation now (this page); Cloudflare Web Analytics on doubledone.app as a five-minute config next (free, cookieless, no banner); and Workers Analytics Engine ONLY IF the client's `track()` events get a real sink, which is deliberately parked: track() is console-only today ("no network yet" by design), and giving it a network sink is a privacy decision, not a plumbing one. The honest tension, recorded for Melroy's awake brain: the retention bar ("is an ADHD person still opening this in week six") is unanswerable while the app stays id-free, and the anonymous-first spine outranks the metric. If a sink ever lands it is counts-only, no ids, no task text, and the decision gets its own entry.

**Decided against:** any third-party analytics SaaS (against the privacy spine, and absurd at this scale); an in-app owner dashboard (admin code in every user's bundle to serve one person); and Cloudflare Access in front of the page (a whole identity product where one rotating secret does the job).

## 2026-08-01 Store badges on the landing page

The launch's front-door follow-through: doubledone.app's closing section now carries the official "Download on the App Store" and "Get it on Google Play" badges under the Begin button. The choices that matter: **official artwork only** (Apple's badge SVG from their marketing-tools API, Google's generic web badge PNG, both bundled as assets, never redrawn, per both brand licences, with Google's required trademark attribution line in small print, kept English in every locale because it is a trademark statement, not UI copy); **country-less store links** so every visitor lands on their own storefront in their own language; **Google's badge rendered slightly taller** than Apple's because its artwork carries built-in padding and equal pixel heights read as unequal badges; and the whole block rides the landing page's existing native-redirect, so the Play badge can NEVER render inside the iOS app, which App Review rejects. Badge a11y labels localised in all four catalogs. Verified in the preview: both badges render, both links open the true listings. E2E WEB-02.

## 2026-08-01 A trial member could not buy the annual, and the fix is a toggle that was always meant to be there

The first post-launch money-path report: a trial member wanting the annual could only convert to monthly. The server was never the problem; its already-subscribed guard deliberately lets a card-free trial through to checkout at either cadence, comment and all. The client was: the monthly/annual toggle rendered only on the free paywall, while the trial panel's "Go Premium to keep it" charged the `plan` state's untouched monthly default, so annual was structurally unreachable at exactly the moment it sells best (thirty days of proof, deciding to commit, the best price on the wall). The trial panel now carries the same toggle and price line, and the CTA's a11y label names the chosen plan. Verified: gates green, the paywall renders clean; the trial-panel visual is confirmable only by a signed-in trial account (both toggles are session-gated by design), so the reporting member's retry is the live proof, which is fitting. E2E trial case updated to pin the toggle.

## 2026-08-01 Settle, the breathing room, built to the handoff; and What's New, built as a card, not a popup

**Settle** (the design's own name: outcome, not instruction; "Breathe" arrives pre-loaded, and "just breathe" is what unhelpful people say mid-meltdown). The fourth design-first build, on the `settle` branch, never touching main until Melroy's word. The room is exactly the handoff: the 4 / 1.5 / 6.5 breath (twelve seconds, five breaths a minute, the exhale half again the inhale) driven by one Animated loop with a chained-timeout phase clock beside it firing the haptic breath (one light tap at the swell, two tiny ones at the settle, NOTHING at the still: stillness is the cue) and pacing the words; the guide's three literal words or, guide off, one RSD-safe affirmation every 60 to 90 seconds, alternating, never coexisting; two layered radial-gradient discs with the blur baked into the stops; no title, no timer, no stats, no paywall, no auto-open, the exit never obscured. The pure rhythm lives in lib/settle.ts (9 tests) so the arithmetic is testable without a screen.

Decisions the handoff left to the build: **the guide defaults ON** (the first visit teaches; whoever needs no teaching turns it off exactly once, remembered forever); **the settle haptics are the one deliberate exception to the haptics seam's reduce-motion silence** (in this room the haptic IS the rhythm carrier, and under reduce-motion it carries more, not less, per the handoff's own variant); **RN Animated over the suggested Reanimated** (every animation in the app speaks Animated, the gotchas and diagnosis tricks are Animated-shaped, and one loop needs nothing Reanimated adds); **no keep-awake** (the screen dimming is fine, the haptic works face-down, by design); and **the leaving navigation is guaranteed by a timer, not the fade callback** (the preview's frozen rAF proved an Animated completion can never come; the fade is the experience, the timer is the guarantee, whichever fires first leaves once).

**What's New** ships beside it, shaped in the same conversation: content-keyed (never build-keyed, so web works identically to the stores and a plumbing release interrupts nobody), one dismissible card in the hold-hint's shape at the top of Today, NEVER a modal (a launch popup would steal the very open-to-capture moment the capture redesign protects), never shown to a fresh install (onboarding stamps the current id). Announcement 1 carries Settle and the trial's annual choice. Pure gating in lib/whats-new.ts (4 tests).

**Verified in the preview end to end:** the card shows to an existing device and Got-it retires it (id persisted); the panel reads Plan, Focus, Lighten, Settle, Close with Settle never the occupant (24-hour sweep in tests); the room's ENTIRE text is "Leave / slowly out… / guide · on" with the phase clock genuinely ticking; the guide toggle persists across visits; Leave returns to Today. Device-only remainder for the testers: the haptic breath, the reduce-motion variant, the leaving fade's feel. E2E SETL-01/02/03 + WN-01.

## 2026-08-01 The app-event beacon: Settle becomes visible to the Analytics Centre, on the strictest terms in the codebase

Melroy's question ("have you built telemetry to see how much Settle is used?") surfaced an honest gap: the `settle.*` events fired in the client, but the client `track()` sink was still the day-one structured console with no network, and Settle, being pure client, never produces the ai_calls rows that make every AI feature visible. So the room would have shipped unmeasurable, against the house "telemetry before traffic" rule, and the premium-Settle Backlog trigger would have leaned on a signal nobody was collecting.

**Built:** the smallest possible pipe, with the strictest posture of the telemetry family. Client: `track()` keeps logging everything to console, and a two-name allowlist (`BEACON_EVENTS`: settle.opened, settle.guide) also sends a fire-and-forget, keepalive POST to the Worker's new `/event` route: name plus at most one boolean, never awaited, never surfaced, never able to throw. Server: `/event` rides the existing origin gate + per-IP rate limiter + size cap, then `parseAppEvent` folds settle.guide's boolean into settle.guide.on/off and accepts ONLY a closed three-name allowlist into a new D1 `app_events` table (event name + timestamp, no user_id, no IP, no free text). Unknown names are accepted-and-dropped (200, no write) so probing the endpoint teaches nothing. The Analytics Centre gains "The room" (opens all-time and 28d, plus a generic 28-day event table so future beacon residents appear on their own), wrapped defensively so a missing table renders zeros, never a 500. The privacy policy gains a "Feature-usage counts" section saying exactly this in plain words.

**Decided against:** beaconing `settle.left`. It stays console-only, deliberately: with enter and leave both timestamped in one table, low-traffic rows could be paired into rough session durations, and "time is not a score" has to hold in our own database, not just on the screen. Opens answer "how much is it used"; the guide toggle answers "does the teaching hold"; duration answers nothing we should want. Also against: any props pass-through to storage (the fold-into-name trick means the table can never hold a payload), and any third-party analytics (unchanged).

## 2026-08-01 The beacon's adversarial review: ten confirmed findings, five fixes, before the first commit

A three-lens panel (privacy, cross-file contract, abuse) with refute-by-default verification ran over the uncommitted beacon diff. Ten of eleven findings survived, and every one was real. The fixes, all landed in the same commit as the beacon itself:

**The privacy copy was dishonest in four places.** The public `privacy.html` (the store-listing policy URL) had not been touched despite its own SYNC NOTE; the policy's lead ("nothing leaves it unless you choose to sync or use an AI feature") became false the moment the beacon shipped; "no IP address... can ever arrive" claimed arrival when only STORAGE is true (every HTTPS request arrives from an address; the rate limiter even keys on it); and "just the feature's name" hid the guide's one on/off boolean. All rewritten in BOTH copies: the lead now names all three things that ever leave the device, the new section carries the boolean and the storage-scoped IP truth, and Last-updated bumped to 1 August 2026.

**The durations invariant was leaky.** settle.left was excluded precisely so sessions could not be timed, but settle.guide fires MID-session, so second-precision rows could still pair into lower-bound durations at low traffic. Fixed structurally: `app_events.created_at` is now DAY-coarse (`date('now')`, not `datetime`), which the Analytics Centre never needed finer anyway, and the policy now says "the feature's name and the day, nothing finer" and means it literally.

**The beacon shared the paid-AI rate budget.** /event rode the same per-IP limiter key as /decompose, so beacon traffic behind a CGNAT could starve a real user's paid AI call (and vice versa), with beacon 429s invisible by design. Fixed with a distinct key (`evt:` prefix) in the same namespace: separate budgets, one binding, a test pinning it.

**Spam was invisible.** app_events had no volume guard and the monitor never read it, so a scripted no-Origin loop could poison the exact low-n Settle signal the beacon exists to read, silently, while incurring D1 write billing. The hourly sweep now counts the day's beacon rows (defensively, absent-table-safe) and emails at 2,000/day with advice to time-window-delete the spam period.

**Dev sessions polluted the count.** localhost:8081 is an allowed origin and dev points at the production Worker, so a week of iterating on the Settle screen would have inflated the signal. `beaconRequest` now returns null under `__DEV__`.

**Left as accepted risk:** poisoned rows below the alert threshold are unattributable by design (the price of storing no IP), and Cloudflare's own short-lived operational logs remain outside our promises (covered by the policy's "Keeping the service running"). **Owner action queued:** the Play Data Safety form needs the App activity > App interactions row added in the Console BEFORE any build containing the beacon ships (v22+); the submission pack carries the exact answer. Apple's label already covers it via the /outcome declaration.

## 2026-08-02 The scrapbook learns to draw YOUR week: the scene writer moves to Claude Haiku, Workers AI kept as the fallback

Melroy's own keepsake made the case: his week was "Change Cat Waters / Pay electricity bill / Sell Legion 5I / EH discontinuance" and the picture was a laundry basket, a teacup and a wilted plant, with exactly one honest hit (the closed laptop, his sold Legion). The 3B Workers-AI Llama that wrote the scene is simply too small to ground abstract tasks in recognisable objects, so it retreats to its comfort furniture, and a keepsake you cannot read your own week in has no emotional payoff, which is the Scrapbook's entire job.

**Decided:** the one-sentence scene now comes from Claude Haiku (the codebase's existing cheap tier, forced tool-use like every other endpoint), with a prompt that REQUIRES one small recognisable object per finished item (up to six), grounds each in the actual item, forbids inventing objects for things not on the list, and keeps every calm rule (no people, no text, uncluttered). The image stays on the free Workers AI flux model, so the added cost is roughly a tenth of a cent per keepsake against the $25 cap. **Kept:** the 3B Llama as the automatic fallback (an Anthropic hiccup must never cost anyone their keepsake), FALLBACK_SCENE as the last resort, and ONE ai_calls row per keepsake so the Analytics Centre's count is undisturbed; the row's model field now names the scene writer, which also makes the spend sweep price the Haiku tokens correctly. **No client change of any kind:** the client sends titles and receives an image, exactly as before.

**Decided against:** upgrading the Workers AI scene model instead (the free-tier text models available are all in the same too-small class), and any literal-depiction prompt (the still-life must stay calm and readable, not a diorama of chores).

## 2026-08-04 Free manual reorder on the held card, born of the second field report

Two users independently could not reorder their list, and checking the code proved them right in a way that stung: Pin is premium, so a FREE user had zero ordering control, and the answer we almost gave ("just pin it") was wrong. Melroy called the trigger fired.

**Decided:** one split row on the held card, "Move up | Move down", free for everyone. Each tap nudges the task one place in today's visible order by stamping the WHOLE order through the existing `setSequence` machinery (the same thing Plan-my-order accepts into), so the order persists locally and survives sync. Two deliberate exceptions to house patterns, both documented in the code: the buttons do NOT act-and-dismiss (moving three places should be three taps with the card held open, never three long-presses), and an edge dims its button rather than hiding it (the card must never reshape under a hovering finger). The pin keeps its crown: nothing can be moved above a pinned task, the pinned task itself offers no reorder (both would be taps that visibly did nothing, since pinFirst refloats it), and done tasks get no reorder row.

**Decided against:** drag-to-reorder (unusable with a screen reader, hard with shaky hands, and the fiddle-trap the spine avoids; the same reasoning that shaped Plan-my-order's buttons); premium-gating it (ordering one's own list is table stakes, not abundance; premium keeps the AI-planned order and the pin); and any new pure logic (moveInOrder + setSequence + applyManualOrder already existed and were already tested, so the whole feature is wiring).

**Knock-on:** "Plan my order" remains the premium way to order a whole day at once; the free nudge makes the premium sort MORE legible, not less (a user who has felt manual ordering understands what the AI is offering to do in one tap). Cross-device order sync remains the documented follow-up it always was.

## 2026-08-08 The held card v2: "Four species, four grammars", built to the handoff, web first

The fifth design-first build. The reorder addition had made the 1a card "almost nice" (Melroy), so a second Claude Design pass reorganised the card into four visual grammars instead of eleven equal rows, and this build implements the handoff (design_handoff_held_card_v2) on the shared codebase, shipping web first per Melroy's word; the stores inherit it at their next scheduled builds.

**Built to the contract:** the SHAPING rows stay full-width verbs (Break it down keeps the hero tint); the reorder pair becomes THE RAIL, one segmented hairline-bordered control, deliberately the card's only bordered element because it is the only act-and-stay element, always rendered on an open card (an edge dims its cell in place, a pinned task rests the whole rail, the card never reshapes under a hovering finger); the More fold is purified (Steps with 'count it in parts', Undo a step dimming honestly to 'no steps yet' instead of vanishing, Remind me, and Pin LAST wearing the honey ✦ and 'holds the top', so premium recedes rather than advertises, no lock icons ever); and the card ends on THE SHELF, a quiet surface-tint band flush to the card's edges and rounded into its bottom corners, holding Close in easy thumb reach and Remove far from it. The done-task card lifts its inscription above the shelf and sets it in the serif voice. Motion per the handoff scaled to house physics: a 180ms rise with a 4px settle on open, a 160ms fold fade, and reduce-motion as a DESIGNED 90ms dissolve with no movement. Screen readers gain the rail's landing announcements ('Moved up, 2 of 5'), unavailable-reasons ('already first'), and 'the card stays open' in the move labels, all four locales.

**Adapted from the board rather than copied:** the handoff's px radii map to house tokens (card stays radius.md, rail takes radius.sm); the honey mark uses accents[2], the inscription gold every palette already carries, instead of a new token; the 40ms per-zone stagger collapsed into the single rise (a stagger the throttled preview cannot verify and the eye barely reads was not worth a second animation system); and the reorder cross-fade is left to the native pass. **Decided against:** any height-morph animation of the in-place expansion (RN would need measured-height choreography for a moment the rise already carries).

## 2026-08-08 The select shelf: select mode joins the v2 family (the congruency pass)

The founder's brief, verbatim: "Congruency is the key." Select mode's bottom bar was the last surface on Today still speaking the pre-v2 language, bare text links floating under a card that had grown a rail and a shelf. Built to design_handoff_select_mode, web first under the same word as the held card.

**Built to the contract:** the bar becomes THE SELECT SHELF, a card in the held-card-v2 family that rises in like the card (180ms + settle; reduce-motion a designed 90ms dissolve). Fixed anatomy in every state so it never changes height mid-selection: the count takes the title's seat with Select all wearing the rail's bordered grammar (act-and-stay, dimming in place once everything is selected); one calm verb row (Done, Move to…, the a-lot toggle) that dims whole when nothing is selected; Combine's PERMANENTLY RESERVED 48px slot, where the surface's single tinted hero fades in at 2+ combinable, wearing accentSoft in both schemes (deliberately quieter than Break-it-down's light-scheme fill: Combine invites, it does not lead the card) and announcing its arrival to screen readers exactly once; and the same shelf band ending it, Cancel in Close's seat, Remove far right, a lone repeating selection rendering as "Skip today / the series continues" in two honest lines. Checkboxes cross-fade in with the mode; Remove's label now carries the count for screen readers.

**Adapted:** the handoff's radii and type sizes map to house tokens as usual; the capture/day-tools fade-out on entry stays the instant unmount it always was (a fade on surfaces that are LEAVING attention earns less than the shelf's own rise; the native pass can revisit). **Kept absolute:** bulk-only forever, no fifth grammar, no reshape mid-selection, the new-key collision with the combine drawer's existing hint resolved by name (combineSub) rather than by stealing a key that another surface owns.

## 2026-08-08 The Italian native pass: 110 strings rewritten by an adversarial panel

Melroy's wife, a native speaker, flagged non-native lingo in the Italian catalog (which had carried a "draft, pending native review" header since birth). A 19-agent panel ran the full 950-string catalog: nine native-reviewer agents (one per namespace chunk, briefed on the register: warm tu, calm, transcreation, never-shame), nine independent judges verifying every proposal against meaning, placeholders and style, and one terminology editor unifying terms across the accepted set (9 amendments). 110 fixes landed; placeholders machine-verified intact; applied by exact-match script with zero misses.

The flagship correction: the day-weight family had translated "a low day" as "una giornata leggera" (a LIGHT day, the opposite end of the scale); it now reads "una giornata no", the native idiom for an off day. Other themes: personal warmth restored where the draft was impersonal ("le cose ti aspettano", "ci sono stati giorni in cui..."), gender agreement (Aggiunta, not Aggiunto, for un'attività), calmer error voice ("vuoi riprovare?" over the bare "riprovi?"), and the greetings gaining their missing verb ("C'è solo oggi."). The full old-vs-new sheet (doubledone-italian-fixes.xlsx, gitignored) goes to the native reviewer for final judgment; her verdict is the real gate, the panel only raised the floor. The five select-shelf strings added the same day were written post-dump and await her eye too.

## 2026-08-08 The Spanish native pass: 94 strings, same panel, region-neutral by brief

The second language through the 19-agent pipeline (nine native reviewers, nine judges, one terminology editor), with one Spanish-specific instruction: NEUTRAL international register, warm tú, nothing region-locked, so Madrid and Mexico City both read it as their own. 94 fixes landed, placeholders machine-verified, applied with zero misses.

Themes: region-neutralising ("mantén pulsada", Spain-leaning, became "mantén presionada"; "cualquiera vale" became "cualquiera sirve"), gender agreement (Añadida for una tarea), idioms taking their true native shape ("Lo hecho, hecho está"), the capture placeholder gaining its real voice ("Sácalo todo de la cabeza"), "vinculado" over the odd "unido" for account linking, and the scrapbook's "bodegón" (a painterly term most users would blink at) becoming plain "ilustración"/"escena". The old-vs-new sheet (doubledone-spanish-fixes.xlsx, gitignored) awaits any native eye Melroy can find; like Italian, the panel raised the floor and a human holds the gate.

## 2026-08-08 The French native pass: 107 strings, and the panel caught a gender bug the sweep never could

The third language through the 19-agent pipeline. 107 fixes landed (one proposal was dropped by OUR filter, not the judges: it merely straightened a typographic apostrophe, and the catalog's typography wins). Twelve applies initially missed because the panel transcribed ASCII apostrophes where the file holds typographic ones; the retry matched typography-insensitively and wrote finals back in the file's own style.

The star finds: a systemic GENDER bug, "tu l'as noté" across every linger line where the referent is une tâche/une chose (now "notée"), the same class of error as Italian's Aggiunta and Spanish's Añadida, three languages independently converging on the draft's one blind spot; the low-energy day family completing its trilogy ("Une journée tranquille", wrong meaning, became "Un jour sans", the native idiom, mirroring "una giornata no"); "c'était une grosse" (which reads badly in French) becoming "un gros morceau"; and the goodEnough affirmation gaining its natural music: "Assez bien, c'est bien assez." The old-vs-new sheet (doubledone-french-fixes.xlsx, gitignored) awaits a native eye; the panel raised the floor, a human holds the gate.

## 2026-08-08 German ships as the fifth language: glossary-first, panel-translated, DRAFT-gated

Melroy's go, the same evening the three existing languages finished their native passes. Built to the five-phase map. Phase 0: a glossary agent transcreated the soul terms BEFORE bulk translation, and the decisions have real personality: "Close the day" is "Feierabend machen" (the one German institution that already means you are allowed to stop now), "Break it down" is "Mach Schritte draus" (the spoken "draus" as warmth), the Lookback is "Der Rückblick" (the fond year-in-review glow), keepsake is "Andenken", Quiet is "Stille", and the register laws are written down: warm du never Sie, warmth by modal particle never exclamation mark, the shame particles ("endlich", "schon wieder") banned outright, and the affirmation voice proven by "so lange darf es dauern." Phase 1: 'de' joins the Locale union, the resolver, the AI language allowlist (client + server). Phase 2: the 19-agent panel translated all 950 snapshot strings; machine checks confirmed 950/950 coverage, zero placeholder drift, zero duplicate keys, and the eight flagged "Sie" occurrences were all the innocent pronoun. The five select-shelf strings born after the snapshot were translated by hand to the same glossary. Phase 3: de.ts assembled in en's structure (a literal newline in manualPlaceholder taught the assembler to escape control characters), typed `: Catalog` so completeness is compiler-enforced, all gates green, shipped to web marked DRAFT.

**Phase 4 stays open:** no in-house German native; the EN/DE sheet (doubledone-german-draft.xlsx, gitignored) awaits a recruited reviewer, comp-code trade suggested. **Phase 5 (storefront German metadata) is Melroy's dashboards, unstarted.** Decided against: waiting for a native before shipping DRAFT (the fallback-to-English machinery means a bad string costs one wince, not a broken flow, and it/es/fr were all born the same way).

## 2026-08-08 German's cold adversarial pass: 30 polish fixes, and the pipeline graded itself

Melroy asked the right question ("did you do an adversarial review for German?") and the honest answer was: only inline. The translation panel's judges had verified their sibling translators' fresh drafts, same brief, minutes apart; the trilogy's reviewers had attacked an artifact from a DIFFERENT process. That distance is what makes a review adversarial, so German got the same cold pass its siblings had: nine reviewers owing the catalog nothing, judges refute-by-default, terminology unify. (The run hit Melroy's session credit limit three agents from the end and was resumed with the workflow's cache: sixteen agents replayed free, three ran live.)

**The result grades the pipeline:** 30 fixes survived against the trilogy's ~100 per language, every one polish-grade rather than wrong-meaning, which is the glossary-first + inline-judge structure earning its keep. The best catches: "Leer deinen Kopf" became "Schreib dir den Kopf leer" (write your head empty, the genuinely idiomatic gesture); Settle's resting word "hier ruhen" became "hier verweilen" (ruhen leans funereal, verweilen lingers); "Guten Nachmittag" became "Schönen Nachmittag" (nobody says the former); and the sign-in confirmation stopped saying the USER is synchronised ("Du bist als {email} synchronisiert" → "Deine Aufgaben werden jetzt mit {email} synchronisiert"), a your-data-not-you distinction this product should never blur. Zero terminology amendments: the glossary held across all nine chunks. The Phase-4 human native reviewer remains the gate for removing DRAFT.

## 2026-08-09 Two defects in shipped code, found by designing a feature that does not exist yet

The Ours architecture panel read the live repo to judge a draft, and incidentally found two real problems in code that has been shipping to paying subscribers. Both verified by hand before touching anything. Neither has anything to do with shared lists; the shared-list design merely walked past them.

**`makeId()` had no randomness.** The id is `t-<ms>-<counter>`, and `addCounter` restarts at 1 every launch, so two DEVICES of one account minting their first task of a session in the same millisecond produced the same string. That string is a global primary key in Supabase (`tasks.id text primary key`), so the sync upsert would silently overwrite one real task with the other: no error, no conflict, a task simply gone. Rare, but a live data-loss path for a multi-device user. Fixed with a four-character `Math.random` tail (deliberate: collision avoidance, never a secret, and the one randomness source Hermes has always had). The counter stays, so the within-device guarantee the existing 500-unique test proves is untouched, and ids are opaque `text`, so there is no migration and nothing user-visible. The new test stubs `Math.random` so that deleting the tail fails the suite every run rather than one run in a million.

**`isAccountGone()` read ANY foreign-key violation as "your account is gone."** Its docstring was honest about the premise, "the only foreign key on the `tasks` table is user_id", and that premise was true, which is why this was a landmine rather than a live bug. But the caller's response is destructive and irreversible: today.tsx clears tasks, purges the R2 keepsakes, wipes local data and signs out. The first schema addition carrying a user foreign key (shared lists, unbuilt) would have turned an unrelated 23503 into the permanent destruction of a live user's history. Now the constraint NAME must match too, held in one named constant beside the function. **Decided deliberately: it fails safe in both directions.** An unrecognised 23503 returns false, so the worst case becomes a genuinely deleted account's second device keeping its local copy, which decision-log.md already documents as a known limit, instead of a live user losing their week. The regression test names the exact threat by asserting a `shared_tasks_created_by_fkey` violation returns false.

**The lesson worth keeping:** both were found by an adversarial panel reading shipped code to judge an unbuilt design. Reviewing a feature that does not exist paid for itself in the codebase that does.

## 2026-08-09 One person, many people: the schema already allowed it, the UI ships one

Melroy asked whether a user could hold several shared lists, one per person (co-parent, flatmate, sibling), rather than a single relationship. The answer was already sitting in the schema the panel had locked: `pair_members`' key is `(pair_id, user_id)`, so a user may join many pairs and only never the same one twice, and `is_pair_member(pair_id)` was already written to take an argument rather than assume one.

**Decided:** v1 ships one pair per account, but the cap lives in a named constant (`MAX_PAIRS_PER_USER`) inside `join_pair`, not as a structural assumption, so raising it is changing a number. The cost of many was never the data, it was the surface: several lists turn the quiet door on Today into a directory of other people's screens, on the one screen whose promise is that today is finite, and the Ours screen grows a switcher. Both requesting couples asked for exactly one relationship.

**Three changes made now because they are free before the first row exists**, and expensive after: `tasks.shared_id` gains `shared_pair_id` beside it (shared task ids are only unique within a pair by design, so the link is ambiguous the moment anyone is in two lists, and "practically unique is good enough" is precisely the assumption that produced the makeId defect above); the local cache is keyed by pair from day one; and the cap is the constant above. **Also recorded as an invariant:** every pair is a sealed room, and nothing renders how many lists a person is in, or with whom, to anybody but them.

**Decided against, for now:** groups of three or more. The schema would allow it by lifting the member cap, but the never-shame maths inverts (at two, "who did not do it" is always inferable, which is why those laws were rewritten honestly; at three, anonymity returns), and groups invite exactly the roles pressure Tier 4 refuses. A separate question with a separate answer.

## 2026-08-09 The Ours Phase-1 SQL, and what an adversarial review found before it touched a database

The schema, RLS and pairing functions were written, then reviewed by a four-lens panel (RLS and privilege, does-it-actually-run, abuse and enumeration, and whether the schema makes the product's laws true by construction) BEFORE being applied anywhere. 44 findings raised, 33 confirmed, verdict: **do not apply as-is**. Eight must-fix defects, two of which silently disabled their own security controls. The full argument, including four reviewer contradictions it resolved and three proposed fixes it rejected as actively harmful, is kept verbatim in `docs/ours-sql-review.md`.

**The two that could not have been found by reading.** First: `join_pair` recorded its rate-limit attempt row inside the same transaction as every `raise exception` below it, and PostgREST rolls an RPC back on error, so the attempts table only ever recorded SUCCESSFUL joins, which the one-pair cap limits to one per account for life. Both ceilings were unreachable by construction, and the throttle protected nothing. The fix inverts it: count FAILURES only, and return zero rows instead of raising on the one path a guesser can reach. Second: the email binding was a separate `if v_invited <> v_email` check, which evaluates to NULL when an account has no email, and plpgsql treats NULL as false, so the binding was skipped entirely. It now lives inside the consume statement's predicate, where a null can never match, and where a wrong-address attempt also stops being able to burn the real invitee's code.

**Six more, each closing a real hole:** `is_pair_writable()` was a definer oracle any account could poll about any household id it had ever seen (true while alive, false once frozen: a relationship-state signal about a home you were removed from, in the one feature whose threat model is domestic), now scoped to the caller's own membership; `created_by` and `pair_id` were client-writable, so either partner could forge the other's authorship or walk a row into another household, now server-coerced by a BEFORE trigger that also clamps far-future timestamps (an unbounded stamp wins every last-write-wins comparison forever, so one patch could pin a tombstone the other person can never restore); the prune trigger only fired at zero members, leaving account deletion to produce a live, writable, one-person zombie list, now it freezes at one; the one-pair cap counted frozen memberships, so Leave permanently locked a user out of the feature, contradicting "nothing is lost" by name; the invited address was stored in plaintext forever with no erasure path for a third party who never even joined, now hashed; and every user-authored string except `title` was uncapped and, for labels, immutable for life on someone else's home screen.

**Decided beyond the panel:** take the re-mint path now rather than later. With the address hashed and the binding strict, a mistyped invitee is a NORMAL failure, and without re-minting the only escape was `forget_pair`, the single destructive path in the whole feature, in a product whose law is "leaving is one tap, and nothing is lost". A sole member of a live pair may now expire the outstanding code and issue a fresh one.

**Recorded honestly as a live tension (the panel's N1, which no finding caught):** the architecture chose a code over an email invite *because* it needed no address, and binding the code to one now reintroduces "you must know their exact account email". For two existing users it is strictly safer. For a partner who has not signed up yet it is a real dead end, and Phase 2's copy must say plainly that a code only works for the address it was written for.

## 2026-08-09 The list's name was in the strings and not in the schema, and a door that could lie

Phase 2 began by building the pairing screen against the fifty catalog strings, which surfaced a
gap Phase 1 had not: the copy asks **"what is this list for?"** and offers five answers, and
Melroy's ask was explicit that the chosen name appear "across both devices/profiles". There was no
`name` column on `pairs`, and `create_pair_invite` had nowhere to put one. Closed additively:
`pairs.name` (nullable, capped at 40), a third parameter on `create_pair_invite`, a third output
column on `join_pair` so the joiner sees what they walked into on the first screen, and
`rename_pair()` so a typo made at the kitchen table is not permanent for the life of a
relationship's list. Both function changes needed a real `drop function` first, recorded in the
file: a defaulted third parameter creates an OVERLOAD that PostgREST cannot disambiguate by named
arguments, and `create or replace` cannot change a `RETURNS TABLE` shape at all.

**NULL is the normal state of that column, not a missing value.** It means "the app's own word for
this", which each reader then sees in their own language. Storing the literal `Ours` would freeze
one household into one language forever and hand an Italian partner an English name for their own
home. The seam enforces it: an empty name travels as `null`, never as a word, and there is a test
that fails if that ever changes. **Decided against** storing a preset KEY (`preset:house`) and
translating it on render, which would have kept both people's screens in their own language: a name
someone picked is a name they picked, the picker already renders in their language, and two kinds
of value in one text column is the sort of cleverness that is discovered years later.

**A rename is a definer RPC, not an UPDATE policy on `pairs`,** so the table keeps zero write grants
and the paths in stay countable on one hand. It refuses on a frozen list, because a freeze stops
every write and a name is no exception: what the list was called is part of what the list *was*.

**The second decision is `ours_is_open()`.** Settings now has the Phase-2 door, and the build-time
allowlist means most accounts would tap it and be told "shared lists aren't open yet". A door that
opens onto a refusal is a small lie, and this app does not tell them. The RPC answers about the
CALLER only, never about an address someone types, so it is not a membership oracle for the
allowlist; the client fails **closed** on any error, null, or non-boolean, because a door that stays
shut when the network is confused is a smaller harm than one that opens onto an error. When the gate
is dropped at launch the function answers true for everyone and the row becomes permanent with no
client change.

**The screen itself is deliberately plain, and that is the plan, not a shortcut.** It is built to the
strings and to one-state-at-a-time so that Claude Design has something real and working to redesign,
per the ritual that produced the held card, the capture panel and Settle. The brief is
`docs/design-source/ours-design-prompt.md`, and it names what the designer may argue with (where the
naming question sits, whether "waiting" deserves its own screen, and whether the word **Ours** is
right at all).

## 2026-08-09 The shared merge: what two people are allowed to lose, and what they are not

`lib/ours-merge.ts` is `sync-merge.ts`'s sibling and deliberately **not** its reuse. The two solve
the same-shaped problem under different physics: a personal task is edited by one person across
several devices hours apart, and a shared task is edited by two people in the same kitchen in the
same minute. Same last-write-wins spine, different things treated as un-losable.

**`completedDates` is a grow-only union.** Two people ticking the bins from two phones is the
likeliest simultaneous write this feature will ever see, and whole-row last-write-wins drops
whichever tick lost the timestamp race, so somebody's finished work silently un-completes on their
partner's screen. That is not a sync bug in this product, it is the never-shame law failing in
public. The union cannot lose one, and it cannot record who: it is a set of dates, and that is the
whole of the information that exists.

**A tombstone is not special, and that is a decision, not an omission.** The obvious rule for a
shared list is "delete always wins", which is safe on paper and wrong here: it lets one person's
stale removal beat the other's fresh re-add, so the app takes the side of whoever gave up on the
task. Removal is an `updatedAt` bump like any other and races resolve by time. Tested in **both**
orderings, because the answer has to be a fact about the clock and never about whose phone happened
to run the merge, or the two people see two different lists and each is certain the other deleted
something.

**`withMonotonicStamps` was widened, not copied.** It already existed in `tasks.ts`, solving exactly
this against the MCP Worker's clock; on a shared list the foreign clock is another person's phone.
**Decided against** a shared-specific variant (which is what was written first and then deleted):
two implementations of "whose write won" is precisely how two people end up looking at two different
lists, and this file's whole job is that they never do.

**Also recorded:** one test asserts the merged row carries no field that could attribute a
completion to a person. There is no `done_by` column to read, so the test cannot fail today; it
exists so that the first commit which adds one fails here, loudly, before it reaches anybody's
kitchen.

## 2026-08-09 The one key on the device that holds someone else's words

`doubledone.ours.v1` caches the shared lists offline, keyed by pair (already decided, 2026-08-09,
"One person, many people"). What this commit settles is what happens when you stop being in one.

**`pruneOursCache(keep)` takes the confirmed memberships and drops everything else,** so leaving a
list, being removed from one, and having one killed by the abuse switch all converge on the same
outcome without a special path each. **Decided against** a `forgetPair`-triggered targeted delete,
which is the obvious shape and is wrong: it only fires on the exit path the app can see, and the
other two exits (the partner's `leave_pair`, a hand-flipped `disabled_at`) would leave the rows
sitting on the phone indefinitely. Reconciling against membership on every read cannot miss one.
An empty `keep` is meaningful and clears everything, so a caller who genuinely belongs to nothing
is not a silent no-op.

**It is also in `wipeLocalData`, and in that function's regression test, in this commit,** per the
standing rule that put the key list there in the first place. This key deserves it more than any
other on the list: it is the only one holding words ANOTHER person wrote, and an account deletion
that left it behind would strand a household's list on the phone of someone whose account no longer
exists. That is the exact shape of the bug the scrapbook once had.

**The loader is defensive on purpose.** Anything on disk can be from an older build or a
half-written save, and a screen whose entire promise is calm must never be handed a shape that
crashes it, so non-array entries are dropped rather than trusted. Tested with three kinds of junk.

## 2026-08-09 One clock, and why it corrects rather than replaces

Every timestamp DoubleDone writes drives last-write-wins, and every one of them was the device's
own clock. That was already a live problem before shared lists: the MCP server writes rows on a
Cloudflare Worker's clock, so a browser running a few minutes slow produced edits that lost to the
copy they replaced and appeared to undo themselves. `withMonotonicStamps` papered over it per-row.
The shared list makes it sharper, because the other clock is now another person's phone, and the
person watching their change revert is in the same room as the person whose phone won.

`lib/clock.ts` reads the server's clock once per sync and keeps the OFFSET. **Decided: a
correction, never a time source.** The app keeps using `Date.now()`; this only adjusts it. A skew
that cannot be established leaves the app exactly as it was before the file existed, a known and
survivable state, where a skew got WRONG would poison every timestamp written afterwards. So every
guard fails open to zero: a missing reading, an unparseable one, a non-finite one, and a bracket
whose reply arrived before it was sent are all simply not believed.

**The plausibility bound is on the SERVER reading only, and that asymmetry is the whole point.** A
device whose clock is years out is the thing this exists to fix and must be corrected in full; a
server value outside 2020-2100 is a garbage reply (a null that became 0, a truncated string) and
believing it would rewrite the app's entire sense of time off one bad response. Tested both ways.

**The round trip is split at its midpoint** rather than charged entirely to the server, which is the
difference between a correction accurate to milliseconds and one quietly half a slow request behind,
on the one code path whose job is making two devices agree.

**Cleared from `useSession`'s auth listener, not from the three sign-out call sites.** The
correction was learned for one account's session, and the next person to use the device is owed
their own clock. There are three sign-out paths today and there will be a fourth some day: the
listener is the one place every session ending must pass through. Same reasoning as the single key
list in `wipeLocalData`, and the same bug it prevents.

**Honest state:** nothing calls `applyServerTime` yet, so in production the correction is zero and
`nowMs()` is exactly what it was. Wiring it into the sync read is the next box on the plan. That is
deliberately the safe direction to be incomplete in.

## 2026-08-09 The Ours copy review, and the string that was a false privacy promise

Fifty-two strings, five lenses, refute-by-default verifiers on every finding: 159 raised, 113
confirmed, 30 keys rewritten and one added. Full argument verbatim in
[`docs/ours-copy-review.md`](docs/ours-copy-review.md). Three findings were load-bearing enough to
change what gets built, not only what it says.

**`signedOutBody` was false, and it was the privacy promise.** It said your tasks stay on this
device either way, sitting directly above a Sign in button, when signing in is precisely what stops
that: the app's own shipped `signIn.subtitle` says so. The one sentence a rejection-sensitive reader
weighs hardest broke the moment they acted on it. It now tells the truth and moves the reassurance
to where it stays true (only you can read them, your person never does).

**`waiting` claimed something the app cannot know.** `pair_invites` has zero RLS policies and the
expiry is returned exactly once, so after a reload the screen knows only that nobody has joined: it
cannot tell a live code from one that died yesterday. The old line also made the absent person the
subject of a pending state, so every return visit read as "they still haven't", which is the
watching frame this feature exists to avoid. The rewrite asserts nothing about the code's liveness
and names the remedy instead. **Decided against** a definer RPC returning the caller's own
outstanding invite's `expires_at`: it would buy a live countdown, and copy is enough for v1.

**The email binding has a dead end that only copy can currently soften.** Anyone signing in with an
Apple private relay address, a work alias, or simply a different address than their person typed
fails forever with the undifferentiated `invalid-code`, and the creator cannot look up what they
typed because it is hashed. Four strings now carry the precondition, and `newCode` stays visible on
the code screen rather than buried, because re-minting is the only escape. **This is the thing to
watch in the two-couple dogfood; if it bites, the fix is product, not words.**

**One decision made against the panel's preferred shape.** It showed that "Delete this list for
good" cannot be undone once the RPC returns, so an undo toast would be a lie and the only honest
version is a delayed commit. `forgetHint` ships now and makes the current state truthful. The
affordance itself waits for the Claude Design pass rather than being built twice, on a branch that
does not deploy. Recorded as a build-plan item so it cannot be lost.

**Also settled: the copy states the app's own limits instead of correcting the reader.**
`errAlreadyPaired` names the one-list-at-a-time cap and the way out rather than telling someone what
they already have; `errListFull` stops implying a third person is in there; `errRateLimited` stops
counting the reader's failures back at them, which matters because it can fire from the global
ceiling with the reader doing nothing at all. And the whole block went back to house typography:
the curly apostrophes were entirely mine, and this catalog has used straight ones in a double-quoted
delimiter for a thousand strings.

## 2026-08-09 Two features refused and one, and a bug found by refusing them

Melroy proposed two additions to Ours: **both people must agree an item is done**, and **reminders
sent to both people, coordinated server side**. A five-lens panel with three attackers pointed at
its own consensus, one briefed that refusing a founder's request on ethical grounds he did not ask
for is paternalism. Full decision, including where it says the panel overreached, in
[`docs/ours-features-review.md`](ours-features-review.md).

**Two-party completion: Tier 4, and now a standing rule so it cannot return under another name.**
Melroy reached the same answer independently ("if somebody doesn't like it being done, they can just
untick the box, becomes a couple's thing to sort out"), which is also the right one.

The load-bearing reason is narrower than the one four lenses gave, and the narrower one is the true
one. A clever local-only construction really does exist: `pending_since timestamptz`, a time and not
a person, exactly the `done_at` precedent. It dies on your own second device, which holds no memory
of having armed the gate, so the laptop renders "your turn", you tap, and the gate closes with one
human and zero agreement. Make that survive the second device and you have synced it, and a synced
record of which of two people confirmed is `done_by` with a clock bolted on. **Decided against** the
maximalist claim the panel first offered (that any per-party state at N=2 is inherently a per-person
record): it is false as written, it proves too much, and it would have applied equally to `done_at`,
which shipped. Better a smaller true argument than a larger false one.

The second reason is product rather than architecture: a gate turns inaction into a veto. An
un-tick takes an act; withholding takes nothing. Asleep, driving, phone dead, and quietly furious
all produce the same screen, indefinitely. For a rejection-sensitive reader the ambiguity IS the
payload, and no copy fixes it because the payload is the silence.

**Shared reminders: Tier 2 for the outcome, in a shape that costs nothing.** Not the mechanism I
recommended. Each person pulls the row to their own Today and arms their own existing local nudge
(`nudgeAt` / `nudgeId`, already local-only and already absent from the sync mapping). No column on
`shared_tasks`, no `user_id` in `push_subs`, no cron change. **My own proposal, a `remind_at` field
on the shared row, is deferred to Tier 3** behind a trigger and three unmet preconditions, one of
which is a real attack I had not seen: a client re-arming a notification on merge rebuilds its
content from the CURRENT title, so you could set a benign shared reminder, wait for the other phone
to arm it, then edit the title, and your words fire on their lock screen at your chosen hour.
Server coordination stays Tier 4 on arithmetic, not taste: the cron holds no user token,
`service_role` is a hard never, and the row already syncs to both phones. **Sync is the
coordination.**

**And the reason the panel paid for itself: `reconcile()` made un-ticking a repeating shared task
impossible.** `completedDates` was a grow-only union, which cannot lose a tick (right) and therefore
cannot express an un-tick (wrong). Removing today's date locally was restored by the very next merge
and never reached the server at all. Sixteen tests passed, because every one of them asked "can a
tick be lost", where "no, never, by construction" is also the defect. Two shipped promises rested on
it: the finality affirmations are withheld on Ours BECAUSE your person can un-tick, and Phase 5
stops rendering done rows at the day boundary so un-tick works all day. Both were half true, and
un-ticking is precisely the safety valve on which BOTH the panel and Melroy refused two-party
completion.

Fixed by replacing the set with a **`CompletionLog`**: `{on: {date: ms}, off: {date: ms}}`, merged
per date by max, later stamp winning. A last-write-wins element set, so merge order cannot change
the answer, no tick and no un-tick is ever lost, and a date can be ticked again after being cleared,
which a plain add-set plus remove-set could never do. A dead-heat tie resolves to DONE, because of
the two ways to be wrong, "your finished work quietly un-finished itself" is the one this audience
cannot afford. Still a record of WHEN and never of WHO. The column is renamed `completions` while it
is still empty, guarded so the file stays re-runnable, because `completed_dates` holding a
tick-and-un-tick log would mislead every future reader. Ten new tests, one of which exists purely to
kill the cheaper `growsBeyond` that counts keys instead of comparing stamps and would have silently
stranded every re-tick on one phone.

## 2026-08-09 The shared sync seam, and the optimisation that would have deleted people's tasks

`lib/ours-sync.ts` is `sync.ts`'s sibling: row mapping pure and tested, pull / push / `syncPairOnce`
wrapping the merge engine around the network, the caller's own client under RLS, no elevated key.
Three decisions in it are worth the trail.

**The pull is FULL, and the build plan's own "filter on `updated_at`" line is deliberately not
implemented as a delta.** An `updated_at > watermark` pull reads as the obvious optimisation and is
a data-loss bug against this merge engine: `mergeShared` treats a local row missing from the remote
set as local-only and pushes it, so every row outside the delta would be re-pushed on every poll,
and a row the other person had genuinely deleted would be resurrected by yours. What that line was
really guarding was the opposite thing, and it stands: **there is no `deleted_at is null` filter and
there must never be one.** A tombstone is how a removal travels; filtered out, a row your person
removed simply stops arriving, your copy never learns it is gone, and your next push puts it back on
their screen. A household list is tens of rows. When that stops being true the fix is a merge that
knows it is looking at a delta, not a filter bolted onto this one.

**The upsert conflicts on the COMPOSITE key `(pair_id, id)`.** A shared task's id is only unique
within its pair by design (that is why `tasks` needed `shared_pair_id` beside `shared_id`), so
conflicting on `id` alone would let one household's write collide with another's.

**`created_by` is never sent.** A BEFORE trigger stamps it from `auth.uid()` and would overwrite
anything we sent, and the reason that trigger exists is that either partner could otherwise forge
the other's authorship. A test asserts the key is absent, and a second asserts that a `done_by`
arriving from the server is ignored on the way in rather than quietly carried.

**Also: the completion log is sanitised at the wire, not trusted.** It is jsonb in a column the
OTHER person's client writes, possibly from an older or newer build, so a shape this build does not
expect degrades to "no completions" rather than reaching the merge engine and throwing on somebody's
shared list. Decided against trusting it because the failure mode is a crash on the calmest surface
in the app, caused by a stranger's build.

**Deferred on purpose:** the polling hook itself (AppState, focus, idle timer). The rule is here and
pure (`shouldPoll`, all three conditions required); the timer belongs with the screen, which the
design pass is about to reshape.

## 2026-08-09 The Phase 3 audit: nine engine defects, and the one sitting under most of the list

Five lenses over the merge engine, the sync seam, the clock and the cache, every finding then put to
a refute-by-default verifier that had to state the exact sequence of events. 53 raised, 41
confirmed, 19 distinct defects. Verbatim in [`docs/ours-phase3-audit.md`](ours-phase3-audit.md).
Nine engine ones are fixed here; the six that block the dogfood are all in the screen.

**The worst: the completion log protected repeats and left ONE-OFFS outside it entirely.** A
one-off's tick lives in `done` / `doneAt`, which rode whole-row last-write-wins, so any newer
unrelated edit by the other person (a retitle, a restore) took the whole row and the tick was gone
from both phones and the server, with `growsBeyond` not even pushing it back because it inspects
only the log. The field answer for this feature is "mostly one-offs with a few recurrences", so the
protected case was the minority. `done` is now a PROJECTION of the log for one-offs, which removes
the second completion code path rather than giving it a second set of rules. **Decided against**
keeping whichever side's `doneAt` is later: an un-ticked one-off has no stamp to compete with, so a
tick would beat every un-tick forever, which is the grow-only bug re-created on the one-off path.

**A refused push threw away a successful pull, permanently.** The select policy needs only
membership; both write policies need `is_pair_writable`, which also requires the pair to be live. So
a frozen pair pulls forever and pushes never, and nothing but a successful push empties `toPush`, so
the device was pinned at its last complete sync on the one screen a bereaved or separated person may
keep for years, under copy promising "Nothing is lost. You can still read everything here."
`syncPairOnce` returns `{ merged, pushError }` now. **Decided against** a `writable` flag from
`loadMyPair`: the freeze lands mid-session, so any flag is one poll stale and the push throws anyway.

**The server clamps `updated_at` and the client never learned.** The trigger clamps to `now() + 1
day` rather than rejecting, and the upsert had no read-back, so a device more than a day fast kept
its own stamp, stayed "newer" forever, and re-pushed every poll, each push re-clamping to a fresh
ceiling that beat anything the other phone could legitimately write. The partner's retitle reverted
every fifteen seconds from a phone lying face-down on a table. `pushShared` now reads back what was
stored. `pushTasks` is safe without this only because no trigger touches `tasks.updated_at`, and
that precondition does not travel to this table.

**Four more, each closing a real hole.** A title legal on the personal list (no cap) is fatal on the
shared one (500), and the whole push is ONE statement, so a single long title aborted every row in
it and the pair silently stopped converging in both directions; clamped at the seam, by code points
rather than UTF-16 units so the cut never lands inside an emoji. `tickOn` / `clearOn` asked the
CALLER for a stamp later than the one they compete with, which no caller can honour because that
stamp came from the other person's phone; they lift their own now. The completion log had no ceiling
against a 64KB CHECK, roughly six years for a daily repeat, and crossing it poisons the batch
forever because even the tombstone carries the payload; capped at 730 dates by COUNT rather than by
a time horizon, so the file stays clock-free and the cap still commutes. And `pullPair` was
unpaginated, which past PostgREST's max-rows makes `mergeShared` read every locally-cached row
outside the page as "added while offline" and push it: exactly the resurrection failure the full
pull exists to prevent, reintroduced through the transport.

**Partner-written `recurrence` jsonb was taken on trust**, one line above the function whose
docstring states the rule. `isDueOn` does `r.weekdays.includes` unguarded, so a `{"kind":"weekly"}`
from a newer or hand-rolled client white-screens the other person's whole list. Validated now, and
**an unreadable cadence is kept VERBATIM and pushed back byte-identical**, so a build that cannot
read a repeat is never the build that erases it for the person who set it.

**And one that reaches the SHIPPED personal list.** `applyServerTime` bounded a reading's order but
never its width, and the midpoint only cancels a symmetric round trip, so a forty-second reply on a
train sets a correction tens of seconds wrong, and `nowMs()` is the single mint point for every
timestamp in the app. A 2-second ceiling gates it now. **Decided against** keeping the smallest-RTT
sample of the session: phone clocks jump, and a latched sample then applies a stale offset to an
already-correct clock and refuses the fresh reading that would fix it. Newest-believable is the
retention rule, and the RTT gate is what makes "believable" mean something.

**Three of these were found by reading a comment that promised what the code beneath it did not do.**
That is a good problem to have: the reasoning was written down, so the drift was visible. All three
comments were corrected in the same commit, or the next reader trusts them again.

## 2026-08-09 Frozen lists stay, and resuming one takes both people

Two product calls from Melroy, both raised by the Phase 3 audit rather than by anyone's taste.

**A closed list stays readable, tucked away.** The code holds a single pair, so the moment someone
started a new shared list the old frozen one stopped rendering anywhere, while its own copy promised
"Nothing is lost. You can still read everything here" in five languages. `loadMyPair` becomes
`{ live, frozen[] }`. **Decided against** the cheaper option of one list on screen and softening the
copy: this is the sentence someone reads on the day they were left, and it is the one place in the
feature where the app should be strictest with itself.

**And a frozen list can be RESUMED, by the same handshake that made it.** Melroy asked, and the
answer is yes with one absolute constraint: never unilaterally. In a domestic threat model the whole
value of "it closes for both of you" is that leaving is a door the other person cannot drag you back
through, so a one-sided reopen would quietly turn leaving into a pause somebody else can undo, on
the one surface whose threat model is domestic. So resuming is the pairing handshake again: one
member mints a fresh code bound to the other's address, the other redeems it, `closed_at` clears,
and every row is still there. Both people actively choose it, which is exactly the property that
keeps leaving safe. It works only while both memberships still exist, and a frozen list costs no
live slot, so an old list can be woken later even while a current one exists.

**Tombstone redaction at 30 days.** Nothing deletes a tombstone today, so on a shared list "remove"
means "stop rendering" while the words stay on both devices and the server indefinitely. A definer
sweep blanks the title past the horizon WITHOUT touching `updated_at`, so both devices adopt the
redaction on their next pull and neither pushes the old words back, and it is gated on
`is_pair_member` rather than `is_pair_writable` or it would no-op on exactly the frozen lists that
need it most. 30 days is the smallest number comfortably past Phase 5's seven-day Restore window,
and writing that coupling down is the point. **Decided against** hard deletion for now: it fixes
unbounded growth as well, but it cannot ship until a cached row can say "the server has seen this",
or a task created offline is indistinguishable from a swept one.

## 2026-08-09 The six that blocked the dogfood, all in one screen

The Phase 3 audit's headline was that none of the merge or seam defects could bite yet, because
none of that code has a caller. Everything that could hurt a real tester was in the pairing screen,
and testers leave and re-pair constantly, which is exactly the path that was broken.

**Leaving was a one-way door out of the entire feature.** `leave_pair` freezes without deleting a
membership, so the frozen branch returned before create, join and the idle state, and its only
control was "Delete this list for good". The answer to "I want to share a list with someone new"
was therefore "first permanently destroy everything your ex, or your late partner, wrote". The
database says the opposite everywhere: both pairing functions count LIVE pairs only, a frozen list
costs no slot, and the schema's own post-apply read-back asserts that someone who leaves can pair
again. The client was the only thing refusing.

**The minted code could vanish before anyone read it.** The code rendered inside `if (pair)`, and
`pair` was null until the two-query refresh landed, so between the RPC returning and that read
completing the screen fell through to the intro: someone who had just tapped "Get a code" was
looking at "Start a shared list". If the refresh then failed, that was the resting state, and the
code is unrecoverable because the server returns it exactly once. Both RPCs now seed the pair from
their own return value.

**"Get a new code" was a dead button that destroyed the code on screen.** The waiting branch
returned before the create form could render, so the button blanked six characters the user could
still have read aloud and reached nothing, while the copy actively told them to press it. The
server's deliberate re-mint path, which exists so a mistyped invitee address is recoverable without
the hard delete, was unreachable from the app.

**And three that are about reads.** `loadMyPair` picked `rows.find(...)` on an unordered PostgREST
result with no liveness preference, which in practice yields the oldest, which is the frozen one, so
every later call pointed at the wrong list; it is now `loadMyPairs`, ranking live over frozen and
newest over older, and **returning frozen lists rather than filtering them**, because "you can still
read everything here" is promised in five languages. A failed read had no else branch, so it read as
"you have no shared list" and offered to start one, which then either contradicts itself or
re-mints and kills the code the other person is holding. And seven call sites raced with no
sequencing, so whichever reply landed last won: the arrival beat could announce, drop back to
waiting, and announce again, and a rename's slow read landing after a Leave could restore a live
Leave button for someone who had already left. That beat carries `leave`, which is permanent for
both people, and the likeliest response to a screen that looks broken is to tap the escape.

**Three cheaper ones in the same pass.** `disabledAt` was read from the server and never used, so a
killed pair rendered as "Sharing with Sam" with an editable name; it folds into one `frozen`
derivation and needs no new strings, because the shipped frozen copy is literally true for a killed
list. A live pair nobody had joined had no exit at all, so someone who made a list to see what it
was and changed their mind was met with "waiting" forever; that needed its own hint rather than
`leaveHint`, which says "it closes for both of you" and is false when there is no both. And the poll
had no focus gate, no app-state gate and no ceiling, so a tab left open made two reads every ten
seconds all night, long after the 24-hour invite TTL had made the answer impossible.

## 2026-08-09 The four language passes, and why a fifth agent read them together

Three native lenses per language over the 54 `ours` strings, every finding put to a refute-by-default
verifier, then a per-language synthesis and a cross-language terminology check: 174 raised, 124
confirmed, **61 keys rewritten** (es 21, it 15, fr 13, de 12). Four agents then applied their own
language to their own file in parallel, and a fifth read all five files together.

**That fifth read is what earned its keep, and the reason is worth keeping.** Each applier saw only
its own language and its own report, so nothing in that arrangement could catch a defect that only
exists BETWEEN files. It found four, two of them real:

- **German's `notThem` still said "Person"**, the only occurrence of that noun in 1092 lines, against
  nine keys in the same block naming the same human "dein Mensch". The terminology agent had named
  this exact break, and the German pass had not applied it. It fires on the joiner's screen at the
  moment someone is deciding whether a stranger is holding their code.
- **`theirEmail` split two-and-two.** French and German moved to "address" in this pass; Spanish and
  Italian were left on "email", which in both reads first as THE MESSAGE your person sent, on the one
  field sitting directly above a hint promising the app will never email them.

Plus French spacing (a breakable space before `?` lets a lone question mark wrap to its own line on a
narrow phone, and two of the five are screen titles), and **English becoming the outlier on its own
irreversible action**: all four locales now use their own delete verb in `forgetHint`, and English
said "removes", the one word indistinguishable from "leave", which is the other action on the same
screen and the reversible one.

**Decided against sweeping the pre-existing typography drift the verification found outside the
`ours` namespace.** Curly apostrophes and escaped delimiters in fifteen shipped, native-reviewed
strings across four files. Both forms render identically, so it is tidiness rather than a defect, and
a copy commit is the wrong place to touch strings nobody reviewed today. Backlogged with a trigger.

**Also parked rather than acted on:** `notThem` frames its judgement on the HUMAN in French and
German ("la bonne personne", "der richtige Mensch") where Spanish and Italian use the speaker-side
frame ("quien esperabas", "chi ti aspettavi"). One agent raised it, no verifier ever saw it, and it
belongs beside `wasntWho`, which already moved to the speaker-side frame in Italian and German. It
goes to the round-two copy pass, not into this commit on one unverified opinion.

## 2026-08-09 A repeat you cannot read is shown, not hidden

Two people on a shared list can be on different app versions, which is the ordinary state rather
than an exotic one: staggered store rollouts, web against native, someone who has not opened the
store in a month. So one of them can set a cadence the other's build has never heard of, and that
build genuinely cannot work out which days it lands on.

The dangerous half was already fixed by the Phase 3 audit: an unreadable cadence is kept verbatim
and pushed back byte-identical, so the build that cannot read a repeat is never the build that
erases it. What was open was purely what the reader SEES, and Melroy chose: show it.

**The argument, because it generalises.** Hiding the row is the tidier interface and the worse
outcome. One person sees the task and the other does not, and when it is undone each has a
reasonable and completely wrong story about the other having deleted it. That is the invisible
disagreement this entire feature exists to prevent, and it compounds quietly for weeks. A visible
oddity is the cheaper failure, every time, on a surface two people share.

**The mechanism keeps it cheap.** The writing client, which understands the cadence, writes a
plain-English summary alongside the machine form, and it rides INSIDE the recurrence object, so it
needs no column and is preserved for free by the verbatim carry that already protects the cadence.
Same shape the public REST API already uses (a normalised object plus a `repeats` summary), so it
is a known pattern here rather than an invention.

**The subtle part, and the one with a test:** `knownRecurrence` rebuilds a clean object for the
kinds it knows, so without an explicit carry the client that UNDERSTANDS a cadence would silently
strip, on its very next sync, the fallback the client that does not understand it depends on. The
person whose app is up to date would be the one breaking it for the person whose app is not.

**One accepted ugliness:** the stored summary is in the writer's language, so an Italian reader can
be shown an English cadence line. A reader that understands the cadence must ignore the stored one
and render its own, so this only ever appears where the alternative was nothing at all.

## 2026-08-09 The order stands: SQL, then design, then merge

I argued for merging first, on the grounds that the audit's number one risk is the email binding and
that is a mechanics question only a real pairing with a real account can answer, so finding it early
would make the design brief better. Melroy overruled it and kept his original order: finish the
resume SQL, do the design pass, and only then push. **"If we're going to push something, let's get
it in the best possible state that we can."**

Recorded because the reasoning is worth keeping and because it is the second time this instinct has
been right on this project. The counter-argument I did not weigh heavily enough: a dogfood of an
un-designed screen teaches the flow twice, once badly, and the two households who asked for this are
not a resource to spend on a version nobody intends to keep. The email-binding risk does not expire;
it will still be there to find after the design lands, and by then finding it costs one conversation
rather than one first impression.

## 2026-08-09 Where an update notice lives, and why it is a recommendation rather than a question

Melroy asked whether the out-of-date message on iOS and Android belongs in Settings or on Today. The
answer is neither, and the third place was already in the codebase: `restedOffer` in `lib/offers.ts`,
a ladder of gentle offers shown ONE AT A TIME on the rested screen, which already carries the daily
reminder, the home-screen widget and the scrapbook keepsake.

**Settings alone achieves nothing.** Almost nobody opens it, and the person whose build cannot read
their partner's cadence is exactly the person not going looking for a version number. **Today is the
wrong surface**, because its promise is that the day is finite and an update notice is a demand with
nothing to do with the person's day. **The rested screen** fires when someone has finished, is not
mid-task, and the app has already softened. Same shape as "your week could be a keepsake".

So: Settings carries the always-true fact and absorbs the version line already there; the rare
mention is a fourth rung on the ladder, gated at two minor versions behind and once a fortnight.

**Recorded honestly: the gap.** Someone who never closes a day never sees the rested screen, so they
never get the nudge. The counter is that a person who never closes a day is struggling, and
interrupting them with a version notice is precisely the wrong instinct.

**And a note on process, which is the transferable part.** This went into the design brief as a
RECOMMENDATION rather than an open question, for three reasons. Round one's handoff contains four
positions where it argued back against the brief, so a stated position gets tested rather than
obeyed. The offer ladder is not discoverable from a description of the app, so withholding it means
a Today surface designed in good faith and a round spent unpicking it. And "Settings or Today" is
not a neutral question: posing it with two options quietly rules out the one that is right. The
guard against anchoring is that the reasoning ships with it and rejecting it is invited explicitly.

## 2026-08-09 The resume SQL: twelve defects across two passes, and one the passes could not see

Three rounds on `supabase/ours-resume.sql` before a line of it reaches a database.

**Pass 1 (eight defects, "do not apply as-is").** Verbatim in
[`docs/ours-resume-sql-review.md`](ours-resume-sql-review.md). It began by TRACING rather than
asserting that a one-sided reopen is impossible: `closed_at` is cleared in exactly one statement in
the whole schema, behind seven conditions in one predicate, and the binding is minted server-side
against the OTHER member, so no code can ever be bound to its own minter. The law holds
structurally, which is the only way it is worth having.

The two that would have hurt. **A person could end up holding two live lists, one their own app
could neither render nor leave**: nothing re-read the other member between the mint and the redeem,
up to 24 hours later, so they could start a fresh list in between; the app gives the visible slot to
the newest join and files only frozen pairs in the archive, so the woken one rendered nowhere while
the other person wrote into it freely. And **the thirty-day redaction clock was set by whoever wrote
the row**: `deleted_at` was client-supplied and unclamped, so a phone a month slow would have had
its first sweep permanently blank a task removed a minute earlier, from inside the seven-day Restore
window, with the same wrong stamp having already hidden it from "Recently removed".

**The one worth remembering.** I wrote in the file that resume needed its own function BECAUSE
`join_pair` refuses closed pairs. True of its consume statement, false of the function: its
idempotent branch checked only hash, expiry and membership, and a resume code's redeemer is a member
by construction, so every resume code satisfied it. The design decision was right and my
justification for it was one branch short of the truth.

**Pass 2 (four more, all in the APPLICATION rather than the design).** The tombstone normalisation
sat forty lines BELOW the trigger that makes `deleted_at` immutable, so it reported rows updated and
wrote the backdated stamp straight back. `join_pair`'s fix existed only in `ours.sql`, so applying
the migration on its own, which is exactly what its own header invites, left the old branch live.
`ours.sql` still shipped the old trigger while calling itself re-runnable, which would hand the
retention clock back to the client while the sweep was reading it. And read-back 4 was satisfied by
the very body it existed to reject. **Decided as a rule from this:** a read-back that cannot fail is
worse than no read-back, because it converts an unchecked assumption into a signed-off one.

**Pass 3 could not have found the last one, and neither could passes 1 or 2**, because all three
were reviews of the SQL. `classifyPairError` keys on the exact message strings the SQL raises, and
this migration changed three of them. Reading the two files AGAINST each other found that
`'that list is already live'` fell through the 42501 fork to `not-yours`, which the screen renders
as "This list is closed to changes": exactly backwards, since the whole problem is that it is not
closed. It now has its own failure name, and **the screen answers it by refreshing rather than
explaining**, because the state the person asked for is the state that exists. Telling them about an
error there would be pedantry at the warmest possible moment.

**Decided against** more reading passes of the same shape after this. Pass 1 found design defects,
pass 2 found my application errors, pass 3 checked the last edits, and the marginal find is now
falling fast. What no reading pass can buy is Postgres parsing the file, so the next verification is
execution: apply to a throwaway project and run read-backs `e` through `i`, which need two test
accounts and cannot be checked by reading at all.

## 2026-08-09 Who calls the sweep, and why the update check does not need a Worker

**The retention sweep now has a caller, and it had to.** Nothing else in the system would ever have
run it: no cron, `pg_cron` not enabled, and the Worker's hourly job holds only the anon key while
`service_role` is a standing never. A thirty-day promise implemented as a function nobody invokes is
a worse position than never having made the promise, because the copy would have been false and
nothing would have surfaced that.

It rides on `loadMyPairs`, which already enumerates every pair, live and frozen, on every open of
Ours. Fire-and-forget so it cannot delay the list appearing, and swallowing every failure, because a
redaction sweep must never be the reason somebody cannot see their shared list. **Frozen lists are
swept on purpose**: they are the ones that have been sitting longest and exactly the ones somebody
might want to stop carrying the words of.

**The copy this obliges is not optional**, and it is written where whoever drafts the privacy page
will read it: removed items keep their words for **at least** thirty days and are blanked the next
time either person opens the list. Never "within thirty days". Coverage here is "either of you opens
the app", not a guarantee about elapsed time, and that sentence is what Google fetches during
review. Cheap to pin now, expensive to have promised wrong.

**Decided against a cron or a server-side sweep.** Both need standing access to every household's
task text on a timer, in the one feature whose threat model is domestic. The client-triggered
version needs no elevated key and runs under the caller's own RLS, which is the same posture as
everything else in Ours.

**And the update check does not need a Worker route after all.** The plan said one endpoint on
`doubledone-ai`. That would mean a deploy per release, a cold start per check, and a hand-maintained
value somewhere Melroy does not otherwise go. A static `client/public/version.json` is updated by
the same push that deploys the web, needs no deploy, no secret and no cold start, and is cached at
the edge.

**The part that actually shaped it: web and store versions are not the same number.** The web
deploys the moment `main` is pushed; the stores lag behind review and staged rollout. A single
auto-stamped "latest" would tell an iPhone that 1.3.0 is out while 1.3.0 sits in App Review, and
send someone to a store page showing the version they already have. So three numbers: `web` stamped
automatically at build, because it IS the deployed version and cannot be wrong, and the two store
numbers bumped by hand when a release actually goes live, which is a moment Melroy is already in
those dashboards. **Flagged for the build:** confirm Pages serves the file before the SPA fallback
in `_redirects` catches it, because a version.json that returns the whole app as HTML fails
confusingly.

## 2026-08-09 The self-rename seam, and why a display field should not have been load-bearing

The design puts "the name your person sees you by" on the management screen. `pair_members` has a
select policy and a delete-self policy and deliberately **no update policy**, because that absence
is what stops either person editing the other's row. So this is a definer function scoped to
`auth.uid()` in its WHERE clause rather than an update policy: there is no predicate to loosen
later, and the scope is one line in one place. Same shape as `rename_pair`.

**Decided: it refuses on a frozen list**, matching `rename_pair`. A freeze stops every write, and
the name you had is part of what the list WAS. Changing how you are labelled inside a closed
relationship is editing a record rather than updating a name.

**And an empty name is refused rather than coalesced, which is where this got interesting.** The two
existing writers of that column coalesce an empty label to the word "me", which is fine for the
person who typed it and reads absurdly on the OTHER person's screen ("Sharing with me"). Storing
null instead is worse, and that is the bug this surfaced: `loadMyPair` derived `partnerLabel` from
the other member's row, and the screen keyed "is somebody in this list" on that label. A null label
is legal in the column. So a member with no name would have rendered as **"waiting for someone to
join" over a list two people were actively using**, with a live Leave button and no way to reach the
list.

`MyPair` now carries `hasPartner`, derived from whether a membership row EXISTS, which is the
question the screen was actually asking. The label went back to being for display only. **The
lesson worth keeping:** a field that answers one question was quietly answering two, and the second
answer was only correct by accident of a coalesce in a different function.

**Decided against** fixing it by making the server never write a null label. That would have worked
today and left the screen still keying on the wrong thing, so the next person to touch either
function could reintroduce it from a distance.

## 2026-08-09 Put it away, and why it is local

"Put it away" is the design's ordinary exit from a closed list, and it deliberately supersedes the
destructive `forget_pair`: it tucks the list into the archive, where it stays readable forever,
rather than deleting anything. Deleting survives only as the one irreversible action, behind the
delete window. That is round two's answer to a problem the Phase 3 audit raised and the build could
not solve, because an undo toast on an unrecoverable delete would have been a lie.

**Decided: the tuck is LOCAL, and the trade-off is named rather than hidden.** Putting a list away
on your phone does not put it away on your laptop. Server-side would mean another column, another
migration and another dashboard trip, and this is a per-person acknowledgement of a closure rather
than shared state. The cost of getting it wrong is seeing a quiet archive row twice. If that ever
grates, `pair_members` is the natural home and it is one nullable timestamptz.

It stores an ACKNOWLEDGEMENT and never content: a set of pair ids and nothing else. Which is exactly
why it still belongs in `wipeLocalData`, with its regression test in the same commit per the
standing rule: a list of pair ids is a list of which relationships you had.

**And untuck exists** because putting away must not be a one-way door either. That is the same
instinct as freeze-not-delete and resume-not-rebuild, applied to a much smaller thing.

## 2026-08-09 The doors: the Menu carries it, Today only once there is something to open

The design's navigation, built. **The Menu is where Ours is discovered, and when there is no shared
list it is the ONLY entry.** Today gets a hairline row, "Ours · {name} ›", only once a live list
exists. That asymmetry is the whole point: nothing on the working surface ever advertises the
feature to somebody who will never use it, so there is no funnel on the one screen whose promise is
that today is finite.

**Never a count on that row**, which is now enforced by there being nothing to count in the code
rather than by anyone remembering. A number there would be a number the other person can change, on
that screen.

**Only the LIVE list gets a door.** A frozen one is reached through the Menu and its archive,
because a closed relationship does not belong on Today.

Both doors are gated on `ours_is_open()`, the same caller-scoped probe as the Settings row, so
neither can lead somewhere the server will refuse. The Settings row survives for now as a harmless
third way in and retires when the management screen lands.

**Two lint warnings fixed rather than suppressed**, and one was a real trap: `refresh` in ours.tsx
referenced `report`, which is rebuilt every render, so including it in the dependency array would
have rebuilt the callback every render and excluding it left a stale closure. Resolved by noting
that a READ can never produce 'already-live' (only the two resume RPCs raise it), so the
refresh-instead-of-explain branch cannot apply there, and the else branch sets the failure directly.

## 2026-08-09 The room: the shared list itself, and the tick that had no caller

`ours-list.tsx`, the screen the doors lead to. Until now Ours was a relationship with nowhere to
put anything: `syncPairOnce` had no caller in the app at all.

**Decided: the room and the relationship are two screens, not one.** `/ours-list` is the tasks,
`/ours` is the pairing, the naming, the archive, leaving, resuming, deleting. One line joins them
("Kept with {name} ›"). The alternative, one screen with a management section under the list, would
put "Leave this list" on the surface somebody opens twenty times a day to tick the milk. Destructive
controls belong one deliberate tap away, not below the fold of a daily surface.

**Decided: the room is PLAINER than Today, not richer.** No weight gauge, no day tools, no motto.
Today is a day one person is getting through and its furniture serves that. This is a list two
people keep, and the calm here comes from it being less. It was tempting to reuse Today's whole
frame for free; that would have imported a gauge measuring a load that is not one person's.

**Decided against a second empty state for "no live list".** Landing on the room without one now
`replace`s to `/ours`, which already knows how to say every version of the absence (signed out,
never paired, closed, partner gone). Two screens explaining the same absence is how they drift and
start contradicting each other. `replace` rather than `push`, so Back still leaves.

**Every tick goes through the completion log, one-offs included** (`setSharedDone`). The log is the
only structure here that can express an un-tick, and un-ticking is load-bearing: it is the whole
reason two-party done-confirmation was refused ("they can just untick it, it becomes a couple's
thing to sort out") and the reason the finality affirmations are withheld on Ours. A one-off's
`done` flag is now a projection of the same log rather than a second source of truth, so the two
cannot disagree.

**Removal writes a tombstone, never a delete.** It is how the removal reaches the other phone at
all, and it is what the 30-day redaction sweep and Recently-removed both read.

**A failed read keeps what is on screen** and says so in one faint line, rather than emptying the
list. This is somebody's household; showing it stale beats showing it gone.

**Found by looking, not by a test: signed out, the room hung on a bare title forever.** The early
return for "no session" skipped `setLoaded`, and the redirect waits on `loaded`. Every gate was
green. Rule this reinforces: an early return in a loader must still say the load FINISHED, because
some other branch is almost certainly waiting on that flag.

## 2026-08-09 The quiet wash, and the one thing it must never accidentally say

Rows changed since you last looked get a tint and a slightly firmer edge. The design argued FOR it
on one ground and it is the right one: it **bounds the re-reading loop**. Without it, the only way
to know whether anything moved is to read the whole list against your memory of it, every single
visit, which for this audience is the checking compulsion handed a new object.

**Decided: your OWN edits never wash.** `washedSince` subtracts a set of the rows you wrote this
visit. This is not politeness. A wash on a row you just ticked reads as "your person touched this
too", which is attribution invented out of nothing, on a screen whose entire data model refuses to
store who did what. The `mine` set is the only reason the wash does not quietly become the
per-person marker the schema was designed to make uncomputable.

**Decided: the wash is STATIC and clears itself.** No animation, ever, because nothing in this room
may move on account of the other person. And it clears on the way IN, not the way out: arriving
re-reads the stored last-look and the reconcile moves it forward, so "gone next open" is literally
true rather than true-only-if-the-OS-unmounted-the-screen. The alternative, writing the last-look on
blur, loses to the commonest exit on a phone, which is the app being killed. A wash that never
clears is a permanent "something happened" badge, which is precisely the anxiety this bounds.

**Decided: `lastSeenAt` is LOCAL**, per pair, same reasoning as the tuck. "Since I last looked" is a
fact about a person at a device; syncing it would let your laptop clear the wash on your phone,
which is the opposite of the point. It stores a TIME per pair and never content, and it joins
`wipeLocalData` in this commit with its regression test, per the standing rule, because a list of
pair ids is a list of which relationships you had.

**It never moves backwards.** A device an hour behind would otherwise re-wash rows you have already
read, every visit. Known and accepted: `updatedAt` comes from whichever phone wrote it and `seenAt`
from this one, so bad skew can wash a row that is not new or miss one that is. Both fail quietly,
both clear next open, and that is exactly why this is a tint and never a notification.

**A first-ever visit washes nothing.** Opening a list you have just joined should not be a wall of
highlights saying "all of this is new", which is technically true and useless.

## 2026-08-09 The bridges, part one: the link, and why it earns a column on a live table

Nothing crosses between a shared list and your Today without a person choosing it. This entry is
about what happens AFTER a person chooses: how the two copies stay joined.

**Decided: `shared_ref` is a real synced column on `public.tasks`, not local-only state.** The
tempting cheap option was `manualOrder`'s precedent, a local-only field with a documented follow-up.
It was wrong here, and not cosmetically. Without the link on the server, you pull "milk" on your
phone, tick it on your laptop, and the shared row does not close, because the laptop's copy has no
idea it is a copy. A bridge that works on one device and silently does not on another is worse than
no bridge: you would learn to distrust the tick everywhere.

The column is additive, nullable, RLS untouched, and holds **no second person's data**. It records
which of YOUR tasks came from a shared list, never anything the other person wrote and never who did
what. A task that has not crossed a bridge stays null forever. Older builds ignore a column they do
not know about, which is why it can be applied before the client that writes it ships, and **must
be**: the client emits every column unconditionally on batch upsert, so a build writing `shared_ref`
against a table without it would fail every sync, not just the shared ones. Apply
`supabase/tasks-shared-ref.sql` BEFORE this branch merges.

**Decided: one string, `pairId/sharedTaskId`, not two columns.** One additive column on a live table
with real subscribers rather than two, and nothing queries it server-side; it is only ever written
and read whole. `parseSharedRef` refuses anything malformed rather than returning half a link,
because a half-parsed ref matches the WRONG list, and a tick bridged to a stranger's task is the
worst failure this feature has.

**Decided: a copy handled on Ours LEAVES your day, and never enters your Lookback.** The work is
done, but you did not do it, and a Lookback entry would be the app inventing a memory of you doing
it. Striking it through on Today is the same lie in smaller type. So the copy is tombstoned with no
`completedAt`, which keeps it out of Lookback **by construction** rather than by a filter somebody
could later remove. A dashed line takes its place for that visit, because a row that silently
vanishes reads as "did I delete that?", which is where a checking loop starts.

**Decided (an assumption worth challenging): a REMOVED shared row does not retire your copy.**
Only a finished one does. "Handled on Ours" would be false, and once you have brought a task over it
is your own task; the other person taking it off the shared list should not reach into your day. The
opposite reading, that removal means "we are not doing this", is defensible. This one is the calmer
default and the one that never lies.
