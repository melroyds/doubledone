# Testing strategy

> Not a coverage-percentage game. A risk-targeted suite that defends the parts of DoubleDone that would
> hurt a real person if they broke: a task on the wrong day, a list that quietly loses something, a
> charge that should not happen, or words leaving the device that should not.

DoubleDone is tested in three layers:

1. **Automated logic tests** (Vitest), run on every commit and in CI.
2. **Contracts** held by the typecheck and the tests, which keep two copies of the same truth from
   drifting apart.
3. **A manual end-to-end suite and real-device checks**, for everything only a person holding a phone
   can see.

## The gates

| Gate | Command | Where it runs |
|---|---|---|
| Logic tests | `npm test` | the pre-commit Inspector, on every commit |
| Tests with coverage floors | `npm run test:coverage` | CI |
| Typecheck, a hard gate | `npm run typecheck` | the Inspector on every commit, and CI |
| Lint (`expo lint`, client only) | `npm run lint` | the Inspector when JS or TS is staged, and CI |
| Secret scan | automatic | the Inspector on every added line, and CI over the full history |
| Web build | `npx expo export -p web`, then the meta and version checks | CI |
| Manual end-to-end suite | [`qa/`](qa) | by hand, before a release |

The Inspector is [`.githooks/pre-commit`](../.githooks/pre-commit), turned on once per clone with
`npm run setup`. A failing gate blocks the commit, and the hooks are never bypassed with `--no-verify`.

CI ([`.github/workflows/ci.yml`](../.github/workflows/ci.yml)) runs on every push to `main` and every
pull request into it. The web deploy ([`.github/workflows/deploy-web.yml`](../.github/workflows/deploy-web.yml))
runs on the same pushes as a separate workflow and does not wait for CI, so the Inspector is the gate
that stands in front of a deploy. Pushes to other branches do not run CI.

## The numbers

As of 2026-10-05, on release 1.8.0:

| Suite | Files | Tests |
|---|---|---|
| Client, [`client/src`](../client/src) (64 in `lib/`, 1 in `widget/`) | 65 | 1,230 |
| Server, [`server/src`](../server/src) | 37 | 688 |
| **Total** | **102** | **1,918** |

Each suite runs in two to three seconds. The manual suite holds **477 cases**.

Coverage floors, which fail CI when crossed:

| Scope | Lines | Functions | Statements | Branches |
|---|---|---|---|---|
| Client, `src/lib` logic only ([`client/vitest.config.ts`](../client/vitest.config.ts)) | 90 | 90 | 90 | 85 |
| Server, all of `src` ([`server/vitest.config.ts`](../server/vitest.config.ts)) | 70 | 85 | 70 | 73 |

On 2026-10-05 the client logic measured 95.5% lines, 92.5% functions and 95.2% branches, and the server
measured 81.2% lines, 93.5% functions and 83.9% branches. Both floors sit
below the real numbers with headroom, so a genuinely untested new function trips CI while a small
refactor does not. The report is a text summary in the terminal. There is no HTML report.

## How the tests are built

- **Vitest in a plain node environment.** Pure TypeScript, no React Native transform, no component
  rendering.
- **Co-located.** `thing.test.ts` sits beside `thing.ts`, so a refactor and its test arrive in the same
  diff.
- **Logic lives in `client/src/lib` so it can be tested.** Screens and components stay thin, and the
  rules they follow (what shows on Today, how two devices merge, which offer a closed day may show) are
  pure functions with their own tests.
- **The Worker runtime is stubbed, not faked.** Its runtime-only `cloudflare:workers` module is aliased
  to a small stub in [`server/src/test-stubs/`](../server/src/test-stubs).
- **Real SQLite where a double would prove nothing.**
  [`server/src/sqlite-d1.test-helper.ts`](../server/src/sqlite-d1.test-helper.ts) loads the real
  [`server/d1/schema.sql`](../server/d1/schema.sql) into an in-memory SQLite. The entitlement guards,
  the usage counters and both RevenueCat paths run against it, so a schema change that breaks a guard
  fails a test.
- **The token verifier is injectable.** Most tests pass a stub. The security tests run the real
  verifier against forged tokens (`alg: none`, HS256) to prove they never reach anyone's data, billing
  or the AI budget.

## What we test, and why

Each row is here because a silent regression would cause harm someone would feel.

### Client (`client/src/lib`)

| Area | Tests | Risk if it breaks |
|---|---|---|
| Days and repeats | `day`, `recurrence`, `when`, `repeating`, `today`, `calendar`, `capture-door` | a task on the wrong day, a repeat that never comes back, a daily tick that does not reset |
| The local store | `storage`, `tasks`, `task-writes`, `clock`, `export` | a saved task silently vanishes, a corrupt blob crashes the app on open |
| Sync | `sync`, `sync-merge`, `scrapbook-sync` | two devices fight, an offline tick is lost, another account's list is merged into yours, an unrelated error wipes a live account |
| Ours, the shared list | `ours-api`, `ours-sync`, `ours-merge`, `ours-bridge`, `ours-tick`, `pairing` | one household's list bleeds into another, a tick closes on one phone and not the other |
| Money | `iap`, `premium-ui`, `entitlement`, `premium-flag`, `renewal`, `account` | a double charge, a paid feature locked, an Android screen naming a price or biller Google Play forbids, an account deleted with its subscription still running |
| AI calls | `ai`, `triage`, `outcome` | a request the Worker cannot read, a Premium call that forgets the user's token |
| Telemetry | `telemetry` | something leaves the device that should not. The test pins the allowlist at exactly twenty names, so growing it is a deliberate act |
| Calm by design | `day-tools`, `offers`, `hold`, `nudge`, `estimate`, `celebrate`, `reward`, `routines` | a tool offered at the wrong hour or held back without saying why, two asks stacked on a closed day, a nudge inside quiet hours |
| Words and access | `i18n`, `spoken`, `menu-a11y` | a launch crash on Android's Hermes engine, a screen reader stumbling over a soft hyphen, a Menu label that misnames its doors |
| Small promises | `leftoff`, `updates`, `widget-model` | a note that grows past one line, an update nudge that nags or never clears, a widget that overflows its slot |

### Server (`server/src`)

| Area | Tests | Risk if it breaks |
|---|---|---|
| The AI request contract | one per route: `clarify`, `decompose`, `plan`, `strategise`, `triage`, `split`, `tiny`, `combine`, `energy`, `ocr`, `lookbackSummary`, `chart`, `sequence`, `scrapbook` | the wrong model, an unbounded answer, a malformed reply that breaks the app instead of degrading calmly |
| Identity | `api`, `mcp`, `oauth`, `premium`, `close-billing`, `mcp-grants` | a forged token reaching data, billing or the AI budget, PKCE skipped, the sign-in page revealing who has an account |
| Billing | `stripe`, `revenuecat`, `revenuecat-api`, `entitlements`, `trials`, `comp` | a forged webhook, a sandbox purchase granting real Premium, one store switching off another store's live subscriber |
| The edge | `index`, `lang`, `feedback`, `events`, `telemetry` | a foreign site spending the AI budget, a language field carrying instructions, free text reaching the usage counters |
| One cadence engine | `cadence` | a repeat made by an agent or the REST API drifting in shape from one made in the app |
| Running the service | `monitor`, `analytics`, `push`, `webpush`, `review-otp` | an alarm that never fires, a reminder that never sends |

## The AI request contract

No test calls a live model. It would be slow, flaky and costly, and it would test the model rather than
our code. Instead:

- **On the server**, each route has a request builder and a response parser. The tests assert the
  request: the Anthropic messages URL, the `anthropic-version` header, the model id, a `max_tokens`
  ceiling, a forced `tool_choice` naming one tool, and the user's text in the message. The parser tests
  feed replies shaped like real `tool_use` answers, plus junk, so a bad answer degrades calmly. See
  [`server/src/decompose.test.ts`](../server/src/decompose.test.ts). The weekly reflection is the one
  free-text route, and its test pins that it sends no tools
  ([`server/src/lookbackSummary.test.ts`](../server/src/lookbackSummary.test.ts)).
- **On the client**, [`client/src/lib/ai.test.ts`](../client/src/lib/ai.test.ts) stubs `fetch` and
  asserts what the app sends to the Worker, that a failed answer throws, and that the Premium scan
  carries the user's token.

## Contracts that keep copies in step

Some truths have to live in two places. Nothing in the language stops the copies drifting, so a test or
the typecheck does.

- **The platform-split contract**
  ([`client/src/lib/platform-split.contract.ts`](../client/src/lib/platform-split.contract.ts)). Metro
  picks a `.ios.ts` or `.android.ts` file on a phone, but `tsc` reads only the base file. A name missing
  from `purchases.android.ts` would compile clean and be `undefined` on an Android phone, on the money
  path, where the web preview can never see it. This types-only file fails `npm run typecheck` unless
  each pair exports the same names with mutually assignable types. Boolean flags are widened first, so a
  switch may differ in value per platform but never in kind. It covers `purchases` (base, iOS and
  Android) and `storefront` (base and Android). A new `.ios.ts` or `.android.ts` split joins it the day
  it is created. The `.web.ts` splits are not part of it.
- **Schema drift** ([`client/src/lib/schema-drift.test.ts`](../client/src/lib/schema-drift.test.ts)).
  [`supabase/ours.sql`](../supabase/ours.sql) and [`supabase/ours-resume.sql`](../supabase/ours-resume.sql)
  each hold a copy of `join_pair` and of the shared-task origin trigger, on purpose: the migration must
  apply on its own, and the schema must stay re-runnable. The test proves the two `join_pair` bodies are
  byte-identical, that both refuse a closed or disabled list on both paths, and that both triggers keep
  `deleted_at` on the server rather than trusting the client.
- **Widget names** ([`client/src/widget/names.test.ts`](../client/src/widget/names.test.ts)). The
  widget names live in code and in [`client/app.json`](../client/app.json). If they drift, the widget
  still renders but stops updating, so the match is a test.
- **Translations.** Every catalogue in [`client/src/lib/catalogs/`](../client/src/lib/catalogs) is typed
  against English, so a missing key in any of the five languages fails the typecheck.
  [`client/src/lib/premium-ui.test.ts`](../client/src/lib/premium-ui.test.ts) reads every line Android
  may show or speak on the paywall, in all five catalogues, and fails on a currency figure, a dollar
  word, a percentage, Apple or Stripe.
- **The D1 schema**, through the real-SQLite helper above.

## Checks that run by hand

These touch live systems or store copy, so they sit outside the gates.

- **`python scripts/check-migrations.py`** answers which [`supabase/`](../supabase) migrations are live.
  It probes PostgREST with the publishable key from `client/.env` and reads the error codes. It writes
  nothing and never prints the key. Run it after applying a migration. It only knows the objects named
  in its `CHECKS` list, so a new migration adds its objects there.
- **`node scripts/check-listings.mjs`** gates the Google Play listing copy: character limits, real
  diacritics, protected claims kept, and no price, currency, Stripe or web checkout.
- **`scripts/verify-*.mjs`** are one-off Playwright walkthroughs against the local dev server, kept from
  specific changes. They are not part of any gate.

## What we deliberately do not test

- **Component rendering and snapshots.** Low signal, high churn.
- **Live API and model calls.** Mock the call, assert the request shape.
- **The thin I/O seams.** The client floor excludes the AsyncStorage, Supabase, auth, locale and Stripe
  wrappers, plus the device seams (reminders, haptics, share intent, speech, purchases). Their logic is
  pulled out into tested pure modules such as `nudge.ts`, `dictation.ts`, `inbound.ts` and `iap.ts`.
- **Trivial getters.** Coverage-chasing is theatre.

## Running

```bash
npm test                          # client, then server, one shot
npm run test:watch                # client, watch mode
npm run test:coverage             # both, with the floors enforced
npm --workspace server run test   # server only
npm run typecheck                 # client, then server
npm run lint                      # client
```

## The manual end-to-end suite

The automated tests cover logic and contracts. Everything that needs a human, real devices and a real
account (sign-in and sync, account deletion, purchases on each store, shared lists between two phones,
the MCP round trip and the REST API, reminders, the widget, the keyboard, fonts and screen readers)
lives in a fillable suite in [`qa/`](qa).

- **477 cases.** P1 must pass before a release (225), P2 is important polish (212), P3 is edge cases
  (40).
- **Platform tags:** Both 362, Android 44, Web 25, Desktop 18, iOS 10, Worker 5, OAuth 4, API 3,
  Setup 3, Device 2, Inspector 1.
- **Largest areas:** Ours (124), Premium (61), Today (45), MCP (20), Capture (19), Settings (16). The
  newest are LEFT-01 to LEFT-11, for "Where you left off" in 1.8.0.
- **One source of truth.** The `CASES` list in [`scripts/gen-test-suite.py`](../scripts/gen-test-suite.py)
  holds each case as (id, area, priority, test, steps, expected, platform).
  `python scripts/gen-test-suite.py` (it needs `openpyxl`) rewrites both
  [`qa/DoubleDone-E2E-Test-Suite.xlsx`](qa/DoubleDone-E2E-Test-Suite.xlsx), with a Result dropdown,
  Findings and Date columns, and the readable [`qa/e2e-test-suite.md`](qa/e2e-test-suite.md). The
  `.xlsx` is a template, so copy it before a run.
- **The rule.** Any user-facing feature or flow adds its cases to `CASES` in the same commit, tagged
  P1, P2 or P3 with any prerequisite in its steps, and the suite is regenerated. A feature that ships
  without a case is not done.

## Device testing

The rules below were each paid for on a real phone.

- **The web preview is not a phone.** It runs V8 rather than Hermes, it never detaches screens, and its
  `fetch()` forgives what a phone will not. A device-side branch verified only on the web is unverified.
  The [build journal](build-journal.md) records three launch-week bugs that the web preview could not
  show.
- **A new `Intl` API is feature-detected and smoke-tested on a device.** Hermes lacks
  `Intl.PluralRules`, and an early build crashed at launch on every Android phone while the browser
  stayed green. The fallbacks are forced-tested by deleting the constructors in
  [`client/src/lib/i18n.test.ts`](../client/src/lib/i18n.test.ts), and the first build that adds a new
  `Intl` call gets a launch check on a real device.
- **Anything at the bottom of the screen that can take focus needs a keyboard plan and a real-phone
  look**, on Android and on an iPhone. Case CAP-13 is the regression guard for the capture panel.
- **Install from the store's testing track, and never sideload over a Play install.** The signatures
  differ, so a sideloaded build and a Play build cannot update over each other. See
  [`play-store-release.md`](play-store-release.md).
- **Check money on a real store install.** An Android build is proven from a Play testing track before
  it is promoted to production (section 11 of [`play-store-release.md`](play-store-release.md)). The
  iPhone purchase walkthrough, from the sandbox account to the double-charge guard, is in
  [`ios-submission-prep.md`](ios-submission-prep.md), and the Premium cases in the suite cover each
  store.
- **Native builds are spent on purpose.** Batch the fixes, prove what can be proved on the web first,
  and queue an EAS build only on the owner's explicit ask ([`operations.md`](operations.md), Cutting a
  release).
- **What only a phone can show has its own cases, run on a phone**: native reminders, Rhythms, Hold me
  to it, exact alarms, the Android widget, the share sheet, launcher shortcuts, haptics, the camera scan
  and keeping the screen awake in Focus.

## Philosophy in one paragraph

A test suite is a promise to future you: *"if you change this, you'll be told if you broke a thing the
user cares about."* Anything more is overhead. Anything less is theatre. Size it to the failure modes a
senior engineer would worry about, plus a green CI badge, then let the manual suite and a real phone
catch what logic tests never can.
