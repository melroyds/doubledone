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

## Lessons from the ADHD seam (2026-06-22)

A deep run that added a whole product seam (OCD reassurance, the silent-parent chain, Make-it-tiny, the low-capacity day, the wind-down, Routines) plus talk-to-capture and a public API, then updated every public doc. The portable takeaways:

- **Go deep on the core failure mode before going wide.** The MVP mapped one feature to each failure mode, which was the right thing to ship. The highest-leverage next move was not a new failure mode, it was a second and third answer to the hardest existing one (task initiation), because that is where the audience actually loses days. Founder-market-fit is largely the ability to feel which thin spot to deepen. *(General.)*
- **Bake the principle into the data model, not just the copy.** Routines keep no streak because the model stores only each step's last-ticked date, with no count and no history to surface. A rule enforced by the shape of the data cannot be undone by a later UI tweak, which is what you want for a load-bearing rule like never-shame. *(General.)*
- **Keep the real object, never flatten it.** Breaking a task into steps used to replace the task. Keeping the original as a silent parent and chaining the steps to it preserved the thing the user actually has to finish, and it upgraded the moat's signal from "steps ticked" to "the dreaded thing done" for free. When you decompose something, hold on to the whole.
- **Slice a large feature, commit each slice green.** Routines shipped as a tested model first, then the screen; the start-line work shipped as the chain first, then the tiny-version. Each slice was its own green commit with its own decision-log entry, so nothing large was ever in flight at once. *(General.)*
- **Parallelise a doc overhaul, keep the argument yourself.** Updating six public docs at once, the engineering and numbers docs went to focused sub-agents with tight briefs and the decision-log as the source of truth, while the front-door and argument docs (README, case study, commercialisation) stayed first-person. Even the mechanical consistency pass (scrubbing em-dashes to match house style) went to an agent. The judgment stayed central, the typing fanned out. *(General.)*

## Lessons from going live (2026-06-26 to 27)

The last stretch took DoubleDone from feature-complete to commercially live: Stripe Premium with real subscribers, the money-path hardening, the launch control centre, and a full v1 documentation pass. The portable takeaways:

- **Feature-complete is not launch-ready, and the gap is rigour, not features.** Going live added almost no user-facing surface. It added a signature-verified entitlement path the server trusts over the client, a per-IP backstop and a double-subscription guard on the money paths, and an operations layer that watches spend and health. The discipline that ships features is not the discipline that ships a business; budget for the second one. *(General.)*
- **Instrument operations before scale, not after the first incident.** A solo founder cannot watch a dashboard, so the control centre had to reach out: alarm only on a breach, prove itself alive with a daily pulse, and, the highest-leverage call, carry a dead-man's-switch so silence provably means healthy rather than "the alarm died". Designing it across four independent expert lenses surfaced that blind spot a single pass would have missed. *(General.)*
- **Measure the claim, then make it.** When the design system asserted AA contrast, the honest move was to compute the ratios into a test and deepen the failing tokens until the number was true, not to write "AA" in a doc. Any claim a product makes about itself, accessibility, privacy, uptime, should be backed by something that fails loudly when it stops being true. *(General.)*
- **A live paid product needs its legal surfaces, and "nothing" is the bigger risk.** The v1 audit's sharpest find was that the app went commercial with no Terms of Service, no refund policy, and a privacy policy that predated half its data flows. A reasonable plain-English draft, clearly marked for later legal review, beats the gap. Ship the honest version now. *(General.)*
- **Audit docs against the running product, do not trust them.** A parallel review found 70 doc gaps, the most damaging being a README that still called the live, paying Stripe integration "test mode". Docs rot silently the moment the product moves past them; a periodic "does it still say what it is" pass, checked against the actual code, is cheap insurance for anything a hiring PM or a user reads. *(General.)*
