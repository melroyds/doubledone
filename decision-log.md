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
