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
