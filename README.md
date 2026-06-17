# DoubleDone

[![CI](https://github.com/melroyds/doubledone/actions/workflows/ci.yml/badge.svg)](https://github.com/melroyds/doubledone/actions/workflows/ci.yml)

> A calm, ADHD-friendly daily to-do app. It takes the things you have been avoiding, breaks them into pieces small enough to actually start, shows you only what today needs, and at the end shows you everything you finished, so your brain cannot tell you that you did nothing.

**Status:** early build, solo. Calm Today shell runs on web; the core loop is next.
**Live:** [doubledone.app](https://doubledone.app) *(registered, not yet deployed)*

---

## The idea in one line

Today is finite and achievable. The home screen is Today, sized to be doable, and the app's whole job is to keep it that way when life pushes back.

## What makes it different

Not another productivity optimiser. It is built for how ADHD and overwhelmed brains actually fail: task-initiation paralysis, time blindness, and the brain's habit of discounting everything you already did.

- **Bite the Elephant** — hand it a task you have been dreading, get it back as atomic, time-boxed steps dropped into today.
- **The Lookback** — see everything you actually finished, including the old dreaded things, as evidence against the "I did nothing" lie.
- **Strategise** — when the day is over-full, it re-spreads the load with reasoning about priority, energy, and deadlines.
- **Never shames the backlog.** It celebrates what you close, it never punishes a task for existing.

## Stack

React Native + Expo (one codebase to native Android and web) · Supabase (Postgres + Auth + row-level security) · a small AI backend on Render holding the Anthropic key · Claude, tiered for cost (Haiku triage, Sonnet decomposition, Opus premium moments) · local-first, anonymous-first.

## Run it

```bash
npm install      # from the repo root, npm workspaces installs client/ too
npm run dev      # Expo on web, opens at the printed localhost URL
```
> Native Android: `npm run android` (needs Android Studio or a connected device).

## The docs

| File | What it is |
|---|---|
| [`docs/product-spec.md`](docs/product-spec.md) | The full v1 spec: spine, core loop, tiered features, the moat, monetisation |
| [`decision-log.md`](decision-log.md) | The why-trail, written contemporaneously |
| [`BUILD-PLAN.md`](BUILD-PLAN.md) | Where we are, what is next, in what order |
| [`CLAUDE.md`](CLAUDE.md) | Working notes for any session (human or AI) touching this |
| [`PLAYBOOK.md`](PLAYBOOK.md) | The reusable build discipline (the golden-path harness) |

## Provenance

Built on the [golden-path](https://github.com/melroyds/golden-path) harness. Third portfolio piece, after [ParkProof](https://github.com/melroyds/parkproof) and the Chronoloria sibling. Solo, by Melroy D'Souza, Melbourne, 2026. MIT licensed.
