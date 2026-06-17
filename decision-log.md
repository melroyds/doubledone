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
