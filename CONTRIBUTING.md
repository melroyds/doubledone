# Contributing

> **Tier 2** — turn this on the moment a second person commits. Solo, a single `main` plus
> the Inspector is enough.

## First-time setup
The pre-commit Inspector is tracked at `.githooks/pre-commit` and does nothing until you
point git at it. Run once per clone:
```bash
git config core.hooksPath .githooks
```
(Or run `scripts/setup.sh` / `scripts/setup.ps1`, which does this for you.) Then install
deps and confirm tests pass.

## Branch model
| Branch | Purpose |
|---|---|
| `main` | Production. **Never push directly.** |
| `develop` | Integration. PRs land here first. |
| `feature/*` | New work — branched from `develop`. |
| `hotfix/*` | Urgent fixes — branched from `main`. |

## Workflow
1. `git switch develop && git pull`
2. `git switch -c feature/short-description`
3. Commit (Conventional Commits; the Inspector runs automatically).
4. `git push -u origin feature/short-description`
5. Open a PR **into `develop`** — `gh pr create --base develop`.
6. Green CI + review → merge.

## Quality gates (enforced, not optional)
The Inspector and CI run: **lint · type-check (hard) · tests · secret scan.** Do not bypass
with `--no-verify`. If a gate blocks you, fix the cause.

## Conventions
- Conventional Commits, with the *why* in the body.
- Update `CHANGELOG.md` under `[Unreleased]`.
- Add a test for any new risk surface (see [docs/testing.md](docs/testing.md)).
- Real secrets never enter the repo — `.env` only.
