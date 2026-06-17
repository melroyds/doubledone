# Build journal & lessons

> Two things in one file: a **journal** written *during* the build (while dead ends are still
> raw), and the **lessons** you'll carry forward. The reusable, project-independent
> principles live in [`../PLAYBOOK.md`](../PLAYBOOK.md) — this is where *this* project's
> specifics accrue.

## How to use
- Write a journal entry the **same day** as the work. Honesty beats tidiness — a retrospective
  written months later softens the failures into a clean success story and loses its value.
- When a lesson generalises beyond this project, **promote it into `PLAYBOOK.md`**.

## Journal

### Day 1: 2026-06-17
- **Goal:** turn the folder of docs into a running app, scaffold the Expo client and a calm Today shell, with the Tier-0 gates actually firing.
- **Shipped:** Expo SDK 56 client in `client/`, stripped to one Today screen (header, spine line, tappable tasks, one-line add, never-shame copy, warm palette). Repo made an npm-workspaces monorepo so the root gates delegate into `client/`. Pre-commit Inspector generalised to dispatch npm scripts (secret-scan untouched). Vitest wired with the first two risk-test files (`lib/day`, `lib/telemetry`, 15 cases). Telemetry contract `[doubledone.*]` live and wired at the toggle. Web bundle builds clean (`expo export`, 780 modules).
- **Dead ends:** none costly. Two small traps: (1) `create-expo-app --yes` still prompts to skip nested git init, fine under a closed stdin, it takes the default. (2) `tsc` failed on `import '@/global.css'` because the template leans on the gitignored `expo-env.d.ts`; fixed with a committed `declare module '*.css'`.
- **Next:** local on-device store so Today survives a reload (with a quota/eviction risk test), then grow the one-line add into the friction-free brain-dump that feeds AI triage. Set the Anthropic cost alarm before the AI backend lands.

<!-- one entry per working day -->

## Lessons (this project)
<!-- Append as you learn; promote the general ones to PLAYBOOK.md. -->
- **A subfolder app breaks a root-only Inspector.** The harness hook assumed root-level `eslint`/`tsconfig`/`test`. With the app in `client/`, lint and type-check skipped silently. Fix: have the hook prefer the repo's own `lint`/`typecheck`/`test` npm scripts (workspace-aware), fall back to tool-detection. *(General, worth promoting to PLAYBOOK if the next project is also a monorepo.)*
- **Expo SDK 56 templates type-check against a gitignored file.** `import '@/global.css'` only resolves via the generated `expo-env.d.ts`, which CI won't have. Commit a `declare module '*.css'` so `tsc` is green on a clean checkout.
- **Expo monorepo = explicit Metro config.** Deps hoist to the root `node_modules`; Metro needs `watchFolders` + `nodeModulesPaths` (the documented snippet) or web/native bundling can't resolve packages.
- **gitleaks-action@v2 goes red on the very first push.** It scans only the push commit range, which starts at the root commit's nonexistent parent, so git errors and the job fails with no real leak. CI now runs `gitleaks detect` over full history instead, which also matches the local Inspector.
