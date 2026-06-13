# golden-path

> A personal, reusable **starting point** for new projects — the paved road I take so I
> don't re-litigate the basics every time. It merges two things that are usually separate:
> **product judgment** (what's worth doing, how to test the risky bits, how to learn) and
> **enforced quality gates** (so the right thing happens automatically, every commit, even
> with collaborators).

This is a *framework layer*, not an app. Drop your app into it (any stack — TypeScript is
the worked example here) and the gates light up.

## The idea in one line

ParkProof taught me *what to build and how to learn from it*. A collaborator's setup taught
me *how to make quality un-skippable*. This is both — distilled, and authored fresh.

## Tiers — scale the process to the project

| Tier | When | What's on |
|---|---|---|
| **0 — Solo MVP** | Weekend / portfolio build | single `main`, fast CI + badge, risk-targeted tests, **local Inspector + gitleaks**, telemetry + a cost alarm, journal from day 1 |
| **1 — Real users** | It's live, people rely on it | + coverage gate, multi-stage CI, rollback playbook, feedback channel, friendly errors |
| **2 — Collaborators** | More than one person commits | + `develop`/`feature` branches, CONTRIBUTING + PR template, CHANGELOG, mandated hooks, SECURITY.md |

Start at Tier 0. Graduate a project *up* as it gets real. Same framework, different dials.

## Use it

1. **Copy this repo** as your new project's starting point (or make it a GitHub *template* repo).
2. **Scaffold your app** into it — e.g. `npm create vite@latest .` for TS, or your stack of choice.
3. **Activate the Inspector** (once): `git config core.hooksPath .githooks` — or run
   `scripts/setup.ps1` (Windows) / `scripts/setup.sh` (mac/Linux), which does it for you.
4. **Read [`PLAYBOOK.md`](PLAYBOOK.md)** on day 0. Come back on day 3 (first hard infra
   question) and day 6 (something breaks in a familiar way).

## What's in here

| File | What it is | Tier |
|---|---|---|
| [`PLAYBOOK.md`](PLAYBOOK.md) | The merged playbook — principles, patterns, day-0 checklist | all |
| [`.githooks/pre-commit`](.githooks/pre-commit) | The **Inspector** — local gate (lint · type-check · tests · secret scan) | 0 |
| [`.github/workflows/ci.yml`](.github/workflows/ci.yml) | Tiered CI — the cloud backstop | 0→1 |
| [`CLAUDE.md`](CLAUDE.md) | Engineering-notes template (incl. a rollback playbook) | all |
| [`docs/testing.md`](docs/testing.md) | Risk-targeted testing strategy template | 0 |
| [`docs/lessons-for-next-project.md`](docs/lessons-for-next-project.md) | Your running build journal + lessons | all |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Workflow + gates for when it's not just you | 2 |
| `CHANGELOG.md` · `SECURITY.md` · `.env.example` · `.gitignore` | The usual hygiene | 1→2 |

## Provenance

Distilled from my own **ParkProof** build and from patterns I admired in a collaborator's
project. **No code was copied** from anyone's repo — these are techniques (git hooks,
gitleaks, Conventional Commits, risk-targeted testing, tiered CI) that belong to everyone.
MIT licensed — make it yours.
