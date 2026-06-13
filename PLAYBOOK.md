# The Playbook

> A self-contained, stack-agnostic playbook for building things well — so I don't relearn
> what past-me already paid for. Read it on **day 0**. Come back on **day 3** at the first
> hard infrastructure question, and on **day 6** when something breaks in a way that feels
> familiar.
>
> It merges two disciplines: **product judgment** (sequencing, testing the risky bits,
> learning in public) and **enforced quality gates** (making the right thing automatic).
> Every rule is tagged `[0]`/`[1]`/`[2]` for the tier it kicks in.

---

## 0. The one mental model: tiers

Don't drown a weekend MVP in process; don't under-protect a real product. Pick a tier and
turn dials as the project grows.

- **Tier 0 — Solo MVP.** Ship fast, learn fast. Single `main`. The local Inspector + a green
  CI badge are your whole safety net — and they're enough.
- **Tier 1 — Real users.** Silent failures now cost real people. Add coverage gates,
  multi-stage CI, a rollback playbook, a feedback channel, friendly errors.
- **Tier 2 — Collaborators.** Process now protects you from each other. Add a branch model,
  CONTRIBUTING, PR templates, mandated hooks, CHANGELOG.

---

## 1. Sequencing beats stack `[0]`

Order is a craft skill — practise it.

- User-facing Tier-A features ship **before** infra pivots.
- **Telemetry ships before traffic** — write the log line before the feature it measures.
- Tests ship before architecture experiments.
- When the first attempt fails, the **right pivot removes components, not adds them.** If
  your fix is *cleverer*, be suspicious. If it's *simpler*, you're probably right.

## 2. Quality gates — make the right thing automatic `[0]`

The layer most solo projects skip and regret. Don't rely on a careful brain; rely on a script.

- **Run a local Inspector on every commit.** `.githooks/pre-commit`, activated with
  `git config core.hooksPath .githooks`. It lints, type-checks, tests, and **blocks secrets**
  in seconds, on your machine, before anything leaves it.
- **Type errors are a hard gate.** No `tsc --noEmit || true`. A type error that only
  "surfaces" is a type error that ships.
- **Block secrets two ways:** a built-in regex *and* gitleaks. A leaked key in git history
  is painful to undo — this is the check that saves you from your worst day.
- **Never `--no-verify`.** If the gate blocks you, the gate is doing its job.
- **Quote every path in shell scripts** — `"$VAR"`, always. A space in a folder name
  (`D:\My Project`) word-splits an unquoted variable and the hook dies on `command not found`.
  (Learned the hard way.)
- **A green CI badge is worth two hours of tests on its own** — the highest-signal thing a
  reviewer sees in five seconds.
- **Verify CI after every push.** Don't trust "should be green." Red CI on commit N hides
  invisibly under every commit after it.

## 3. Testing — risk-targeted, not coverage-chasing `[0]`

A test suite is a promise to future-you: *"if you change this, you'll be told if you broke
something the user cares about."* More than that is overhead; less is theatre.

- Test the **5–6 surfaces that would actually hurt a user**: time/date math (DST, midnight
  wrap), storage/quota recovery, distance/geo, money math, the AI request contract.
- **Co-locate tests** (`thing.ts` + `thing.test.ts`) so the test shows up in the same diff
  as the change.
- ~100–150 cases across 5–6 files is the right size for an MVP. More is anti-portfolio.
- **Don't** test component rendering, snapshots, trivial getters, or live API calls.

## 4. AI integration is testable — at the contract layer `[0]`

Treat the model like a structured-data API, and the system prompt like a contract.

- **Schema-enforce the output** so the model literally cannot return malformed data.
- **Mock the SDK; assert the request shape** — system-prompt content, schema, parameters.
  Don't test the model's reasoning in CI; that's the live site's job.
- **Every shipped prompt fix gets a regression test.** Future-you will refactor the prompt
  and delete a line — the test catches it.
- For slow inferences, **return `202` + a job id and poll**; don't fight the gateway timeout.
- Use **prompt caching** for warm-call latency; design the system prompt to cross the threshold.

## 5. Ops & deploy `[0→1]`

- **Idempotent setup scripts for everything** `[0]` — re-runnable, check-then-skip. Write
  each resource's name to one file that the deploy script sources; new config flows through.
- **The deploy script prints what it's about to do** before anything destructive. `[0]`
- **Friendly errors over raw HTTP** `[1]` — 5xx → "this took too long, try again", not
  "Service Unavailable".
- **A rollback playbook in CLAUDE.md** `[1]` — symptom → first-check → fix, with exact revert
  commands and a list of what *can't* be rolled back. The first time you need it is the
  worst time to write it.
- **Smoke-test the real production URL on a real device** before declaring launch done `[1]`
  — incognito, every user flow. localhost hides CORS, auth-callback, and cache bugs.

## 6. Docs in three tiers `[0→1]`

Don't conflate them.

1. **README.md** `[0]` — what is this, how to run it, the live demo. Audience: anyone landing on the repo.
2. **CLAUDE.md** `[0]` — engineering notes, resource IDs, gotchas, file layout, rollback playbook. Audience: anyone (incl. AI assistants) touching the code.
3. **Case study + build journal** `[1]` — narrative. Write the journal **the same week**,
   while the dead ends are still raw; retrospectives written months later soften failures
   into a tidy success story and lose their value.

## 7. Security & cost `[0→1]`

- **`.env.example` committed; real `.env` never** `[0]`. Read config via `process.env` /
  `import.meta.env`, never literals.
- **Least-privilege from day 1** `[1]` — the smallest IAM policy you'd ship to prod, not admin.
- **A budget alarm before any traffic** `[0]` (e.g. AWS Budgets at $10/mo). Cost the cheap
  features carefully; skip the expensive ones decisively — free tiers cover more than you think.
- **Verifiable integrity where it matters** `[1]` — asymmetric signing (e.g. KMS ECDSA) with
  an offline public-verify path. Almost no MVPs do this; it disproportionately impresses.

## 8. Commit & branch hygiene `[0→2]`

- **Conventional Commits, non-negotiable** `[0]`: `feat(scope):`, `fix(scope):`, `docs:`,
  `chore:`, `test:`. Your git log becomes a readable decomposition of your thinking.
- **Put the "why" in the message** `[0]` — what changed, *why*, what it was before, what broke.
- **Branch model when it's not just you** `[2]`: `feature/*` off `develop`, PR into `develop`,
  never push `main` directly. Solo, a single `main` is fine.

---

## The Day-0 checklist

```
[0] Repo created · MIT LICENSE · README skeleton with a "Try it live →" placeholder
[0] Activate the Inspector:  git config core.hooksPath .githooks
[0] .env.example committed; real .env gitignored
[0] CI workflow green (even with one trivial test) — badge in the README
[0] gitleaks installed locally + the secret-scan CI job on
[0] Telemetry log prefix decided (e.g. [app.event {}]) before the first feature
[0] Risk list written: the 5–6 surfaces that hurt users if they break → one test file each
[0] Budget/cost alarm set before any traffic
[0] Build-journal Day-1 entry written the same day
[1] Coverage gate on · multi-stage CI (build/security) · rollback playbook in CLAUDE.md
[1] Feedback channel shipped BEFORE you announce
[1] Pre-launch smoke test on the real prod URL, real device, incognito
[2] develop/feature branches · CONTRIBUTING · PR template · CHANGELOG · SECURITY.md
```

---

## What this is for

Not rules to follow religiously — a way to **not rediscover what past-me already paid for.**
Fork it, argue with it, delete the parts that don't fit. Make it yours.

*Distilled from ParkProof + patterns admired in a collaborator's project. Authored fresh;
no code copied. MIT.*
