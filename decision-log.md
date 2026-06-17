# DoubleDone — Decision Log

*The why-trail. Newest entries at the bottom of each section. Written contemporaneously so the dead ends stay honest.*

---

## 2026-06-17 — Project founded

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

## 2026-06-17 — Client scaffolded (Expo SDK 56)

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

Left reanimated/worklets/glass-effect/@expo/ui in `package.json` even though the calm shell uses none of them — removing template deps risks breaking the Metro/Babel/React-Compiler config the template wires up, and that is a Tier-3 trim, not scaffolding. Noted for later. The Today list is deliberately **in-memory only**: seed tasks and the one-line add reset on reload. No fake persistence pretending to be the real local store (that is step 3).

### Smaller calls

- **Palette:** warm paper `#FBF7F1`, clay accent `#C4715A` used sparingly, sage `#7E9B6B` for done (calm, never an alarming green). Light-first, no theme toggle — remove friction, never add a setting.
- **Committed a `*.css` type declaration.** The template's `import '@/global.css'` only type-checks against the Expo-generated `expo-env.d.ts`, which is gitignored and absent on a fresh CI checkout. A one-line committed `declare module '*.css'` keeps `tsc` green everywhere.
- **create-expo-app gotcha:** even with `--yes`, it prompts "skip initialising a new git repository?" inside an existing repo. In a non-interactive shell stdin is closed and it took the default (skip), which is what we want — no nested `.git`.
