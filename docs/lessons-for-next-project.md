# Build journal & lessons

> Two things in one file: a **journal** written *during* the build (while dead ends are still
> raw), and the **lessons** you'll carry forward. The reusable, project-independent
> principles live in [`../PLAYBOOK.md`](../PLAYBOOK.md), this is where *this* project's
> specifics accrue.

## How to use
- Write a journal entry the **same day** as the work. Honesty beats tidiness, a retrospective
  written months later softens the failures into a clean success story and loses its value.
- When a lesson generalises beyond this project, **promote it into `PLAYBOOK.md`**.

## Journal

### Day 1: 2026-06-17
- **Goal:** turn the folder of docs into a running app, scaffold the Expo client and a calm Today shell, with the Tier-0 gates actually firing.
- **Shipped:** Expo SDK 56 client in `client/`, stripped to one Today screen (header, spine line, tappable tasks, one-line add, never-shame copy, warm palette). Repo made an npm-workspaces monorepo so the root gates delegate into `client/`. Pre-commit Inspector generalised to dispatch npm scripts (secret-scan untouched). Vitest wired with the first two risk-test files (`lib/day`, `lib/telemetry`, 15 cases). Telemetry contract `[doubledone.*]` live and wired at the toggle. Web bundle builds clean (`expo export`, 780 modules).
- **Dead ends:** none costly. Two small traps: (1) `create-expo-app --yes` still prompts to skip nested git init, fine under a closed stdin, it takes the default. (2) `tsc` failed on `import '@/global.css'` because the template leans on the gitignored `expo-env.d.ts`; fixed with a committed `declare module '*.css'`.
- **Next:** local on-device store so Today survives a reload (with a quota/eviction risk test), then grow the one-line add into the friction-free brain-dump that feeds AI triage. Set the Anthropic cost alarm before the AI backend lands.

### Day 1 (later): store + brain-dump
- **Shipped:** on-device persistence (AsyncStorage) so Today survives a reload, seed-once on first install, defensive deserialize (corrupt blob and empty list both handled). Replaced the single-line add with a multi-line brain-dump (parseDump strips list markers and drops blanks). New risk-test file `lib/tasks` (12 cases), 27 tests green. Two commits: store, then brain-dump.
- **Next:** AI backend on Render (step 4) with the request-contract test, and the Anthropic cost alarm before any traffic, then Bite the Elephant (step 5).

<!-- one entry per working day -->

## Lessons (this project)
<!-- Append as you learn; promote the general ones to PLAYBOOK.md. -->
- **A subfolder app breaks a root-only Inspector.** The harness hook assumed root-level `eslint`/`tsconfig`/`test`. With the app in `client/`, lint and type-check skipped silently. Fix: have the hook prefer the repo's own `lint`/`typecheck`/`test` npm scripts (workspace-aware), fall back to tool-detection. *(General, worth promoting to PLAYBOOK if the next project is also a monorepo.)*
- **Expo SDK 56 templates type-check against a gitignored file.** `import '@/global.css'` only resolves via the generated `expo-env.d.ts`, which CI won't have. Commit a `declare module '*.css'` so `tsc` is green on a clean checkout.
- **Expo monorepo = explicit Metro config.** Deps hoist to the root `node_modules`; Metro needs `watchFolders` + `nodeModulesPaths` (the documented snippet) or web/native bundling can't resolve packages.
- **gitleaks-action@v2 goes red on the very first push.** It scans only the push commit range, which starts at the root commit's nonexistent parent, so git errors and the job fails with no real leak. CI now runs `gitleaks detect` over full history instead, which also matches the local Inspector.

## Lessons from the redesign (2026-06-21)

Late in the build the whole UI got a system-pass redesign (all seven surfaces) plus a net-new first-run, a dozen commits in one sitting. The portable takeaways:

- **Audit before you rebuild; refine what's already at spec.** Of seven screens, only **Today** genuinely needed a rebuild (it had become a junk-drawer as features piled on) and the **first-run** was net-new. The other five (Lookback, Break-it-down, Premium, Settings/Sign-in, Repeating) were already close to the target, so they took small refinements or no change at all. Reading each screen against the spec *before* touching it turned "redesign 7 screens" into "rebuild 1, refine 4, leave 2". The discipline of stopping applies to redesigns too. *(General.)*
- **One screen, one verified increment, one commit.** The cadence that held quality across the sitting: edit → `typecheck`/`lint`/`test` green → preview-verify the *actual behaviour* (not just that it compiles) → commit with a decision-log entry → next, never more than one screen in flight. Easy to review, trivial to revert, and the why-trail stays honest. *(General.)*
- **A new routing gate can silently break the screenshot harness.** The first-run redirect (Today → `/welcome` when not onboarded) meant the screenshot seed, which never set the onboarded flag, suddenly redirected every Today/Lookback/Settings shot into onboarding. The fix generalises: when you add an app-level gate (onboarding, auth, a paywall), every deterministic screenshot/test seed must set the flag that bypasses it. A seeded state has to satisfy *every* render gate, not just provide data. *(General.)*
- **Onboard by doing, not by telling.** The first-run runs the user's own first brain-dump through the real `/triage` path, so the aha is the product working, not a carousel describing it. Reusing the live path (with the all-to-today fallback) means there's no separate "demo" code to rot.
- **Make the destructive version safe and it becomes reusable.** First-run overwrites (a fresh install has only the seed); making "replay from Settings" *merge* instead turned a one-shot onboarding into a repeatable "get it out of your head again" with zero new screens.
- **Honesty debt hides in the policy.** The redesign caught the privacy policy still saying account-delete was "being added" months after it shipped. A public policy that lags the build is a broken trust principle. Re-read the user-facing promises against the real feature set whenever you touch them.

### Does the golden-path harness need updating?

**No structural change.** The Tier-0 net (local Inspector + gitleaks + green CI) held through the entire redesign with not one `--no-verify`. Two notes worth folding into the harness/PLAYBOOK so the next project gets them for free:

1. **"Seeded states must satisfy every render gate."** The screenshot engine (and any seeded test) should set the flags that bypass onboarding / auth / paywalls, documented right where the seed payload is defined. This is the one thing that would have bitten a less careful redesign silently.
2. **Expo typed-routes note.** Adding an expo-router screen fails local `tsc` until the dev server regenerates the route types (CI is unaffected, the `Href` type falls back to `string`). Already in this repo's CLAUDE.md gotchas; it belongs in the harness's Expo notes.

The first (a general fixture rule) is promoted into [`../PLAYBOOK.md`](../PLAYBOOK.md); the Expo typed-routes note stays a stack-specific gotcha in `CLAUDE.md`.
