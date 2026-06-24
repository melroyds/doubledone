# AGENTS.md: working in the DoubleDone client

Guidance for an AI coding agent (or a new engineer) making changes in this package. The aim is
changes that look like they were always here: the same idioms, the same calm, the same gates.

## What this is

DoubleDone is a calm, ADHD-friendly daily to-do app. One Expo / React Native codebase targets
**native Android and web** from the same source. The home screen is **Today**, sized to be
doable. The product's whole job is to protect the user from the overwhelm of the full list, and
to never shame the backlog. Read [`../docs/product-spec.md`](../docs/product-spec.md) for the
what and why, and [`../decision-log.md`](../decision-log.md) for the reasoning behind every
major change.

## Stack

- **Expo SDK 56** (React Native 0.85, new architecture, React Compiler enabled), with
  **expo-router** for file-based routes in `src/app`.
- **TypeScript**, strict.
- **Supabase** (Postgres + Auth + row-level security) for opt-in cloud sync.
- A small **Cloudflare Worker** (in `../server`) holds the Anthropic key and makes every AI
  call. The client never talks to the model provider directly.
- Local-first and anonymous-first. The app is fully usable with no account, storing to
  AsyncStorage. Sync is opt-in.

## Layout

```
src/app/          expo-router routes (Today is index.tsx). Screens only.
src/components/    presentational components (TaskRow, MarqueeText, ...)
src/lib/           pure logic + co-located *.test.ts. The tested core.
src/constants/     theme.ts, the Dusk design tokens (colour, spacing, type, radius)
assets/            fonts, images, icons
```

`src/lib` is where the real logic lives, deliberately kept out of React so it can be unit
tested without a renderer. If you write branching logic, it probably belongs there, with a test.

## Commands (run from the repo root)

```
npm run dev          # Expo on web, the demoable surface
npm run android      # Expo on Android
npm test             # vitest, the logic tests, non-interactive
npm run lint         # expo lint
npm run typecheck    # tsc --noEmit, the hard gate
```

A pre-commit hook runs lint, typecheck, tests, and a secret scan, and CI re-runs them on every
push. Do not bypass it. If it blocks you, it is doing its job.

## Conventions

- **Match the surrounding code.** Comment density, naming, and idiom should be indistinguishable
  from the file you are editing.
- **Style only through the Dusk tokens** in `src/constants/theme.ts` (`t.colors.*`, `spacing.*`,
  `radius.*`, `fonts.*`, and `t.scale` for dynamic type). Never hardcode a colour, size, or font.
- **Tests are co-located and risk-targeted.** Pure logic in `src/lib` gets a `*.test.ts` beside
  it. The AI request contract is a test surface: mock the SDK and assert the request shape,
  rather than testing the model's reasoning.
- **Calm is a constraint, not a vibe.** No streaks, no guilt, no shame mechanics, and never a
  new forced setting. Added friction is a regression. Reduced-motion and large-text must keep
  working.
- **Accessibility is non-negotiable.** Every control has a label and an adequate touch target,
  reduced-motion silences animation (and haptics), and text scales without clipping.
- **Config via env, never literals.** Public keys live in a gitignored `.env`, with every key
  named in `.env.example`. Secrets never reach the client.

## Expo SDK 56 specifics

Expo's APIs change between SDKs. Before reaching for an Expo or React Native API, check the
**versioned** docs at <https://docs.expo.dev/versions/v56.0.0/>, not a general web result that
may describe an older or newer SDK.

## Gotchas that will bite you

- This is an **npm-workspaces monorepo**. Dependencies hoist to the repo-root `node_modules`.
  `metro.config.js` sets `watchFolders` + `nodeModulesPaths` so bundling resolves them, and
  `unstable_enablePackageExports` so `supabase-js` resolves. Do not remove either.
- The web build is `output: "single"` (an SPA), not static. The app is authed and
  client-rendered, and a static prerender touches `window` at build time and crashes.
  `public/_redirects` gives Cloudflare Pages the SPA deep-link fallback.
- `tsc` type-checks `import '@/global.css'` against a committed `src/types.d.ts`
  (`declare module '*.css'`). Do not delete it. A fresh CI checkout lacks the generated Expo
  env types and would otherwise fail.
- Adding a route under `src/app` does not update the typed-route union until the dev server has
  run once (the route types generate to a gitignored `.expo/types`). CI is unaffected.

More surprising bugs and their fixes are logged as Gotchas in the project's engineering notes,
and the reasoning behind the architecture lives in [`../decision-log.md`](../decision-log.md).
