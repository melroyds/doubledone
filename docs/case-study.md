# DoubleDone, a case study

*How a calm daily to-do app for ADHD, autistic and OCD minds was scoped, shipped to the web, the App Store and Google Play, turned into a small business, and deliberately held back. Written for anyone who wants the product thinking, not just the code. The contemporaneous record is [`decision-log.md`](../decision-log.md), the live plan is [`BUILD-PLAN.md`](../BUILD-PLAN.md) and the spec is [`product-spec.md`](product-spec.md). This page is the narrative. Where a claim matters, it links to the decision or the file behind it.*

---

## At a glance

- **What it is.** A calm daily to-do app. The home screen is Today, sized to be doable.
- **Who it is for.** People with ADHD, autism, the AuDHD overlap, OCD and chronic overwhelm.
- **Where it runs.** [doubledone.app](https://doubledone.app), the App Store and Google Play, all from one Expo codebase, with a Cloudflare Worker for AI and billing and optional Supabase sync.
- **Where it is now.** 1.7.0 is live on both stores. 1.8.0 (iOS build 41, Android versionCode 35) is with the stores as of 2026-10-05. The web runs `main`, so it already carries 1.8.0.
- **The business.** Freemium, with paying subscribers. Premium sells through Stripe on the web, Apple in-app purchase on iOS and Google Play Billing on Android, the last two through RevenueCat.
- **Who built it.** Melroy D'Souza, solo, in Melbourne.

## Why this, and not the planned thing

DoubleDone replaced a planned project, SubToll, a subscription-audit tool, before a line of SubToll was written. There were two reasons, and they turned out to be one.

- **Motivation is the binding constraint** on solo nights-and-weekends work, and SubToll never had it. DoubleDone did. Melroy built it out of care for people he works with, has managed and is friends with who have ADHD and OCD. He does not have ADHD himself. The founder-market fit is proximity and close-up empathy, not lived experience, and it is why the product is organised around how these people get stuck rather than around a feature list.
- **Monetisation followed from that.** "Find your forgotten subscriptions" is a one-shot value with no reason to keep paying. A daily app that people actually open is subscription-shaped by nature.

The day-one reasoning still holds: pick the project you will still want to open in week six, because week six is also the bar for the people who use it. ([founding entry](../decision-log.md#2026-06-17-project-founded))

## The audience, and why generic apps fail them

Mainstream productivity apps optimise for capture and structure, then reward you with streaks. For this audience those patterns backfire on predictable failure modes:

- **Task-initiation paralysis.** The dreaded task is too big to begin.
- **Time blindness.** "Today" quietly fills past what a day can hold.
- **The discounting reflex.** The brain throws away everything already done and reports that you did nothing.
- **Rejection-sensitive dysphoria.** Guilt mechanics (overdue red, nags, broken streaks) repel rather than motivate.

Designing around these specific failures, rather than adding "ADHD" to a generic app, is the whole product. The calm, predictable, never-pressure surface also fits the autistic side of the audience, where dopamine-streak apps actively repel, and it matters for the demand avoidance that is common in AuDHD. ([`product-spec.md`](product-spec.md))

## The spine

**Today is finite and achievable.** The home screen is Today, sized to be doable, and every feature exists to protect it from the overwhelm of the full list. That one sentence is the tie-breaker for every scope call. When a feature would turn Today into an everything-bucket, it loses, however good it is.

Two examples of the spine doing its job:

- **Ours, the shared list, lives beside Today, not on it.** It has its own tab in the heading. A shared row arrives on your Today by itself only when someone gives it a day or a rhythm, anything else waits on the shared list until you bring it over, and the tab shows a small "!" when your person changed something, never a count.
- **Today's tools sit in one constant frame.** Plan my day, Focus, Lighten today, Settle and Close the day always sit in the same order (with AI switched off, Plan my day and Lighten today are simply absent), with one "Right now" suggestion picked by the hour the screen opened. A tool that does not apply yet stays in its place at low contrast with a plain hint, so nothing moves under a thumb. ([`day-tools.ts`](../client/src/lib/day-tools.ts))

## The one rule that cannot break

**Never shame the backlog.** Celebrate closing a task, never punish one for existing. For a reader with rejection-sensitive dysphoria, a guilt-based app is not under-motivating, it is harmful, and people leave. ([the rule, as founded](../decision-log.md#the-one-rule-that-cannot-break))

It is load-bearing, and it shows up in the code rather than in a style guide:

- **No overdue state.** An undone one-off due today or earlier simply shows on Today. Nothing turns red. ([`today.ts`](../client/src/lib/today.ts))
- **Close the day** shows what you finished, offers "Anything else you did?", then rests: "You've closed today." Reopening is one tap.
- **The Calendar** (called the Lookback inside the code) answers the discounting reflex with evidence: everything you actually finished, the old dreaded things included. It is deliberately not a stats dashboard.
- **Celebration is warmth, never points.** Affirmation lines on a tick, and a bloom when a whole broken-down task finishes, sized by how long it waited and how hard it was. No streaks, no scores. ([`reward.ts`](../client/src/lib/reward.ts), [`celebrate.ts`](../client/src/lib/celebrate.ts))
- **Nothing to break.** Routines tick per day and yesterday falls away. Rhythms (gentle recurring nudges such as water or meds) store no count and no history at all.
- **Coming back is welcomed.** After four or more days away, Today opens with a welcome back, not a pile. ([decision](../decision-log.md#2026-06-20-shame-free-re-entry-a-welcome-back-not-a-guilt-pile))
- **On a shared list, a tick records a time, never a person.** There is no `done_by` column, and the schema says there never will be. ([`ours.sql`](../supabase/ours.sql))

The rule's hardest test came from a user, who asked for more constant, more forceful reminders. Their own word for it was a contract. **Hold me to it** answers that without breaking the rule, because shame is judgement about the past and force is delivery intensity about the future, chosen per task by the person. On the phone apps: one contract at a time, a fixed and readable ladder (30 minutes, 90 minutes, 3 hours, 6 hours, then 09:30 daily), quiet hours from 21:30 to 08:30, the same calm words every time, and "Let it go" in one tap with no confirm. Relentless about the thing, kind about the person. ([decision](../decision-log.md#2026-08-22-hold-me-to-it-force-without-shame), [`hold.ts`](../client/src/lib/hold.ts))

## The core loop

Brain-dump, sort it, break the dreaded thing down, work a small day, lighten it if it is over-full, close the day, then see what you finished.

- **Capture** is a floating + that raises a panel without popping the keyboard. One line per thing. One door sets When (today, tomorrow or a date), Repeating (daily, weekly on chosen days, every few days, monthly) or Steps. With AI on, **Sort for me** files a dump between today and later and flags what needs breaking down, **Tidy this into tasks** splits a run-on ramble, and **Scan** (Premium) reads a photo of a list. Text shared from any app lands in the box for you to confirm. Nothing is ever auto-added.
- **Break it down** turns a dreaded task into three short questions (by when, gradual or all at once, and one smart clarifier), then a plan you can edit before accepting. A big, long-horizon task returns a roadmap of phases. Only phase one is broken into steps now, and each later phase waits in Later, broken down when you reach it. The original task is kept as a silent parent, so you hold one small step at a time and finishing the steps finishes the real thing.
- **Make it tiny** shrinks a stuck task to a two-minute version. The real task comes back once the tiny step is done.
- **Focus** ("Just this one") shows one task, keeps the screen awake, and steps through parts one at a time.
- **Lighten today** proposes moving some of an over-full day to later days. **Plan my day** (Premium) proposes an order after asking about your energy and the kind of day it is.
- **Where you left off** (1.8.0) lets any of your one-off tasks carry one short line for next time, such as "Called them, ring back Thursday", stamped with the day you wrote it. It is free, and it syncs only to your own account. It is never sent to an AI feature or a shared list, and never returned by the REST API or MCP. ([`leftoff.ts`](../client/src/lib/leftoff.ts), [decision](../decision-log.md#2026-10-04-where-you-left-off-built-one-free-line-per-task))

The AI can be switched off entirely in Settings, and the app is whole without it. That choice is offered during onboarding, so an AI-wary person never has it pushed at them. ([decision](../decision-log.md#2026-06-28-ai-optional-the-app-whole-without-it-for-the-ai-wary))

## The moat

Per-user history is switching cost. The real moat is a **cross-user completion-data flywheel**: log the breakdown the AI offered and whether its steps actually got finished, by people who struggle to finish, so Break it down can improve for everyone as it scales. A funded competitor cannot buy that dataset. ([founding entry](../decision-log.md#the-moat-designed-for-instrumented-from-day-one))

What makes it legible as a strategy rather than a slide is **day-one instrumentation**. The AI-call log was built on 2026-06-18, the day after the project was founded, long before there was any data to use. How it works now:

- **The offered half.** The Worker logs every AI call to a Cloudflare D1 database with no public write path: endpoint, model, the input it was given, the JSON it returned, tokens and latency. It holds no user id and no IP. It does keep the task text that was typed, and the privacy policy says so. A few routes keep only counts (Scan never stores the image or its titles). ([`telemetry.ts`](../server/src/telemetry.ts), [`schema.sql`](../server/d1/schema.sql), [why D1](../decision-log.md#2026-06-20-the-moats-telemetry-store-moved-to-cloudflare-d1-no-public-write-path))
- **The completion half.** The client mints a random id for each breakdown and sends it with the plan request. When a step is finished, the app sends only `{id, steps_total, days_elapsed}`, no text and no identity, and the two halves join on that id. ([`outcome.ts`](../client/src/lib/outcome.ts), [decision](../decision-log.md#2026-06-21-the-moats-completion-half-the-outcome-flywheel-server))
- **Feature usage** is a short, closed list. The app may send 20 named events, and the Worker keeps only the 26 names on its own allowlist, as one counter per name per day. The only detail kept is folded into a name, such as which of three rough stages a hold reached. No task text, ids or user id, and nothing from a development build. ([`telemetry.ts`](../client/src/lib/telemetry.ts), [`events.ts`](../server/src/events.ts), [the telemetry review](../decision-log.md#2026-10-04-the-telemetry-review-built-every-track-call-decided-three-new-counts-and-a-counter-instead-of-a-row-per-event))

The privacy tension (this audience distrusts data collection) is resolved by architecture, not by a paragraph: pseudonymous by design, aggregate, never sold.

**The honest part.** The pace line at the end of a breakdown ("Usually about 6 days, at a gentle pace. No rush.") is computed from the plan itself, clamped to between 1 and 14 days. It is not crowd data, because claiming "people like you took X days" before there is enough volume would be a fabricated statistic. The surface is built so the real number can replace the heuristic with no UI change. ([`estimate.ts`](../client/src/lib/estimate.ts), [decision](../decision-log.md#2026-06-19-the-moat-made-visible-a-calm-pace-estimate))

## What shipped, and when

| Date | Milestone |
|---|---|
| 2026-06-17 | Project founded. The spine, the moat and the one rule written down first. |
| 2026-06-18 | First builds on the web and a sideloaded Android APK. The AI backend is a Cloudflare Worker, not the planned Render service. |
| 2026-06-20 to 21 | The MCP server, then the public REST API. The moat's telemetry moves to D1 and the completion half goes live. |
| 2026-06-23 | The web app is live for real users. |
| 2026-06-26 | Live Stripe, the night DoubleDone started taking real money. |
| 2026-06-28 | AI becomes optional, and the app stays whole without it. |
| 2026-07-04 | Every screen in four languages. German follows as the fifth on 2026-08-08. |
| 2026-07-07 | MCP grows to nine tools and gains OAuth 2.1, so hosted assistants connect by pasting a URL. |
| 2026-07-15 to 18 | Apple in-app purchase decided, then built. |
| 2026-07-31 | Live worldwide on the App Store (v1.0, build 13) and Google Play production (versionCode 20). |
| 2026-08-13 to 16 | Ours, the shared list for two people, opens to every signed-in user. |
| 2026-08-30 to 31 | 1.5.0 with Hold me to it, live on all three. |
| 2026-09-27 | Today v3 on the web, Quiet made free, deleting an account now stops billing first, and the Android app stops selling (Path C, shipped in 1.6.0). |
| 2026-10-03 | Android 1.7.0 sells Premium through Google Play Billing, at 100%. iOS 1.7.0 follows on 2026-10-04. |
| 2026-10-04 to 05 | Where you left off, live on the web. 1.8.0 goes to the stores. |

Behind those dates: 1,918 automated tests (1,230 client, 688 server) and a manual launch gate of 477 cases, [`docs/qa/e2e-test-suite.md`](qa/e2e-test-suite.md), both counted on 2026-10-05.

## Decisions worth seeing

A handful of the strongest calls, each with the trail behind it.

### Local-first, anonymous-first

The whole app works with no account. Tasks live on the device first, and sync is opt-in through a passwordless email code. An account needs nothing but an email address, and row-level security isolates every user's rows. Merging is last-write-wins on each task's `updatedAt`, with soft-delete tombstones, so an anonymous list moves up to a new account on first sign-in with no special casing. There are no analytics, crash-reporting or ad SDKs. The only billing SDK is RevenueCat, in the native apps.

- **Decided against:** a three-way merge, field-level merging and realtime sync. Last-write-wins is the right complexity for one person across their own devices.
- **Trade-off accepted:** sync runs when Today opens and on sign-in, not continuously, so a change made by an agent appears on the next sync rather than live in an open app.
- **Trail:** [privacy posture](../decision-log.md#2026-06-18-privacy-and-security-posture-formalised), [the merge engine](../decision-log.md#2026-06-18-cloud-sync-part-2-the-pure-merge-engine), [`sync-merge.ts`](../client/src/lib/sync-merge.ts).

### Propose-only AI

The AI never silently reorganises anyone's list. Lighten today, Break it down, Plan my day, Chart a course and energy matching all propose and wait for a yes. After a paying tester pointed out that all-or-nothing reviews force restarts when the AI nearly gets it right, the review gained its missing middle: propose, edit, accept. The same rule reaches agents. The MCP `break_down` tool returns steps and adds nothing until the person says so in the chat.

- **The deliberate exception:** Sort for me applies its result directly, because the person asked for it with one tap and capture must stay the lowest-friction moment in the app.
- **Trail:** [Lighten today, propose then accept](../decision-log.md#2026-06-18-f-strategise-part-2-the-client-ui-propose-then-accept), [propose, edit, accept](../decision-log.md#2026-07-04-propose---edit---accept-ai-suggested-steps-are-now-editable-tester-wave-slice-2-tester-refinements), [MCP stays propose-only](../decision-log.md#2026-07-07-mcp-tools-expansion-3-tools-to-9-capture-look-ahead-manage-break-down-deep-research).

### Premium on three storefronts, one entitlement

Web subscribers pay through Stripe. On iOS, the standing plan was to hide every purchase path to avoid Apple's cut. Melroy reversed it with one line: "15% of 0 is 0." A hidden path converts nobody, so the cut is the price of a revenue line that did not exist. iOS sold from its first release, parity-priced, absorbing the cut. Every storefront writes the same single entitlement row per person on the Worker, with a `source` column, and the Supabase user id is the RevenueCat app user id, so one subscription follows a person across all three platforms. Apple's review then rejected a sign-in wall before purchase, so iOS now allows an anonymous purchase and attaches it to an account at sign-in.

- **Decided against:** making RevenueCat the source of truth (it would rewrite a live Stripe path for nothing) and hand-rolling receipt validation.
- **Trail:** [Apple IAP from v1](../decision-log.md#2026-07-15-apple-iap-from-ios-v1-reversing-the-hide-everything-path), [the App Review rejection](../decision-log.md#2026-07-28-app-review-rejection-the-sign-in-wall-before-apple-iap-comes-down-511v), [`entitlements.ts`](../server/src/entitlements.ts).

### Google Play: Path C first, then Path A

Play rejected Android 1.5.1 for showing a fixed A$ price to a reviewer abroad. A policy sweep against Google's own pages then found the deeper problem: the Android app's link out to Stripe had never been allowed. There were two real fixes. Path A was Play Billing through RevenueCat, the right end state at a week or two of work. Path C was to sell nothing on Android, a few days. Melroy shipped C first to get the new design out, with A parked and a trigger set. Then he built A. Android 1.7.0 sells through Play, parity-priced, with prices shown only from the store's own price string and no figure of ours anywhere in the Android build.

- **How:** three compile-time switches, set per platform in [`storefront.ts`](../client/src/lib/storefront.ts) and [`storefront.android.ts`](../client/src/lib/storefront.android.ts), so the Android rules live in the Android build alone. Path C's branches are kept on purpose, because flipping one switch back to false is the pre-decided rollback.
- **Android requires an account to buy,** unlike iOS, because an anonymous buyer who already pays on the web would be one tap from a second charge.
- **Trail:** [Path C](../decision-log.md#2026-09-27-path-c-the-android-app-sells-nothing-google-plays-payments-and-subscriptions-policies), [Path A, slice 3](../decision-log.md#2026-10-01-path-a-slice-3-the-android-app-sells-premium-through-google-play-built-not-shipped), [`path-a-runbook.md`](path-a-runbook.md).

### Quiet, made free

The Quiet interface strips the screen to calm text on paper, with the same layout and the same features. It launched as Premium, paired with the colour themes as the personalisation layer. That pairing put Quiet on the wrong side of its own line. For this audience a less cluttered screen is an access need, in the same family as text size and reduced motion, and charging for relief sits badly with the spine. The gate also hid a trap: a member whose Premium or trial ended while on Quiet could not even tap back to Standard. Quiet became free on every platform. The six other colour themes stay Premium, because they really are an extra, and Dusk, the default, is always free, so nobody can get stuck.

- **Trail:** [Quiet is free for everyone](../decision-log.md#2026-09-27-quiet-is-free-for-everyone).

### Ours, built narrow

The shared list is for exactly two people: one live list at a time, an invite code tied to the partner's email that lasts a day, and nothing on the list that says who did what. The schema already allowed one person to hold several lists. The interface ships one, because several would turn the quiet door on Today into a directory of other people's screens. Groups of three or more were declined, because groups invite the roles and pressure the one rule exists to refuse.

- **Trail:** [one person, many people](../decision-log.md#2026-08-09-one-person-many-people-the-schema-already-allowed-it-the-ui-ships-one), [the features review](ours-features-review.md).

### Deleting an account stops billing first

Deleting an account used to remove only the login, so a Stripe subscription could keep charging someone who had no account left to cancel it from. Now the app first asks the Worker to cancel every chargeable subscription, and turn off a Google Play renewal, and deletes nothing unless the reply proves it worked. Apple billing cannot be cancelled from a server, so Apple subscribers are told plainly before they confirm.

- **Trail:** [deleting an account stops Stripe billing first](../decision-log.md#2026-09-27-deleting-an-account-stops-stripe-billing-first), [`account.ts`](../client/src/lib/account.ts).

## The discipline of stopping

The hardest part of a solo build is not adding things. Every parked item carries a **trigger** for when it earns its place, and the decision log records what was decided **against** and why. That trail is the product-management artefact. Some of the best calls in it are things that were not built:

- **"Sit with me" was designed and then killed.** The build plan called it the most differentiated thing left. Thirteen agents designed it. Written out as plain user flows, it turned out to be doors to actions already one tap away on the held card, plus one new door that drafted a message to a friend: a share sheet with a caring label. Melroy read the flows and asked: "how does it help the person?" Demoted to Tier 4, with the design kept, because the reasoning for stopping was worth more than the design. ([decision](../decision-log.md#2026-07-25-sit-with-me-is-not-built-and-the-reason-is-that-it-was-a-menu-of-things-the-app-already-did))
- **A usage cap that existed only in the planning documents was deleted, not built.** The plan carried a fair-use cap of about ten breakdowns a month as policy, so the next job was to build the meter. Checking first found it in no user-facing copy, no Terms and no code. Building it would have meant introducing a new restriction on a live product, for an audience where a takeaway lands hard. Scripted abuse was already covered by rate limits and body caps. ([decision](../decision-log.md#2026-07-25-there-is-no-break-it-down-cap-and-now-there-is-no-claim-of-one-either))
- **Two requested Ours features were refused.** "Both people must agree it is done" turns inaction into a veto, and for a rejection-sensitive reader the ambiguity of silence is the harm. Server-coordinated reminders were refused in favour of each person setting their own existing reminder on the row, because sync already is the coordination. Refusing them also exposed a real bug: un-ticking a repeating shared task was impossible, which the passing tests had never asked about. ([decision](../decision-log.md#2026-08-09-two-features-refused-and-one-and-a-bug-found-by-refusing-them))
- **Readings are decided before the data arrives.** "+ I also did that" stays if it is used at least three times in a 21-day window and goes if not, with the window's start, end and query written down in advance. Where you left off opens its Tier 2 only if saves happen on most days four weeks after the store build. Nobody gets to decide on a mood. ([the telemetry review](../decision-log.md#2026-10-04-the-telemetry-review-built-every-track-call-decided-three-new-counts-and-a-counter-instead-of-a-row-per-event))
- **Done is not held hostage to undone.** Hold me to it shipped as its own release instead of riding with finished money fixes for paying customers. ([decision](../decision-log.md#2026-08-22-hold-me-to-it-force-without-shame))

The same discipline applies to redesigns. The first system pass, in June, found that only Today needed rebuilding, so "redesign everything" became "rebuild one, refine a few, leave the rest". Today v3, in September, was built from a design handoff on its own branch and preview URL, because a merge to `main` is the web deploy.

## The platform surface: one engine, two front doors

A calm consumer app did not have to have a developer surface. Building one with restraint is the platform signal. DoubleDone exposes a person's own tasks two ways on one Cloudflare Worker, both acting only with that person's own Supabase token under row-level security, so the server holds no elevated key.

- **A public REST API** (OpenAPI 3.1, version 1.2.3, at `/api/v1`, with a browsable Swagger UI at `/api/v1/docs`). Create, read, update and soft-delete tasks, with three read modes: a substring search, a look-ahead of 1 to 30 days, and the app's own Today. A task can have a date or a repeat, never both. ([`docs/api.md`](api.md))
- **An MCP server** for AI agents, with nine tools: add, list today, list upcoming, complete, update, delete, a propose-only `break_down`, and a `search` and `fetch` pair that follows the OpenAI Deep Research connector contract. There are two ways in: a pasted token for local tools such as Claude Code, Claude Desktop and Cursor, and OAuth 2.1 with S256 PKCE for hosted assistants such as claude.ai and ChatGPT. The rotating refresh token is held encrypted, and Settings has an immediate Disconnect. ([`docs/mcp.md`](mcp.md))

The calls worth seeing:

- **One recurrence engine.** Both surfaces share `buildRecurrence`, so a repeating task made by an agent, by the API or in the app has the same shape. Completing a repeating task from either surface ticks one day and never closes the series, the same rule as the app. ([`cadence.ts`](../server/src/cadence.ts), [decision](../decision-log.md#2026-09-25-a-repeat-is-ticked-for-today-never-closed-on-both-public-surfaces-api-audit-prs-b-and-c))
- **Intelligence lives where consent lives.** The AI action is MCP-only, because a chat can ask for a yes before anything lands. The REST API stays plain CRUD plus query on purpose.
- **Every bearer is verified before it can touch money, paid AI or a person's data.** Signature, issuer and expiry are checked against Supabase's published keys. ([`verify.ts`](../server/src/verify.ts), [decision](../decision-log.md#2026-09-25-the-bearer-is-verified-before-money-ai-spend-and-both-public-surfaces-api-audit-pr-a))

## Going commercial: the rigour that is not features

Feature-complete is not launch-ready. Much of the work between the two was rigour.

- **The server never trusts the client about money.** Premium status comes from the Worker's entitlement row, which only the server writes: from verified webhooks (a Stripe signature, and for RevenueCat a shared secret plus an optional HMAC signature), and from its own lookup at RevenueCat that attaches an anonymous Apple purchase after sign-in. The client asserts nothing. Sandbox purchases are refused, except for a few named review and test accounts. Guards on event order and on which subscription a delivery belongs to stop a late or stray event from overwriting a live one. ([`stripe.ts`](../server/src/stripe.ts), [`revenuecat.ts`](../server/src/revenuecat.ts), [the RevenueCat fixes](../decision-log.md#2026-10-04-three-revenuecat-money-path-fixes-overdue-the-day-after-play-went-live))
- **Display fails soft, charging fails closed.** If the entitlement cannot be read, the screen shows the calm free state, but a purchase is refused rather than risking a second charge. Checkout answers "already subscribed" instead of selling twice, and the Premium AI routes refuse when they cannot check.
- **The free tier is good on purpose.** The whole daily loop, Break it down, Make it tiny, Lighten today, Sort for me, Combine, the Calendar, Routines, Rhythms, Ours, Settle, Quiet, 15 energy picks a month and a monthly scrapbook are free. For this audience a crippled free tier reads as bait and switch. Premium adds Scan, Pin, the colour themes, Chart a course, Plan my day, Your patterns, unlimited energy matching and a weekly scrapbook, with a card-free 30-day trial. On the web that is A$5 a month or A$50 a year. In the apps, the store shows its own local price. ([`docs/premium.md`](premium.md))
- **Operations before scale.** An hourly check emails the founder only when something crosses a line: AI spend at half the US$25 monthly budget or projected over it, error rates, volume and scrapbook abuse. It sends a short daily pulse, and it is built to ping an outside dead-man's switch every hour, so a monitor that has stopped is noticed too. It alerts rather than cutting anyone off. A solo founder cannot watch a dashboard, so the system has to tap the shoulder. ([`monitor.ts`](../server/src/monitor.ts), [`docs/operations.md`](operations.md))
- **Measure the claim, then make it.** When the theme file claimed WCAG AA contrast, every value was computed rather than judged by eye, and the tokens that fell short were changed until the claim was true.

## Field testing on real hands

The gap between "verified on the web" and "works in a hand" has been the story of every release. The founder tests on his own phones and the people around him test on theirs, and the bugs they report are real even after weeks of browser checks.

- **Diagnosis by reading, not guessing.** A share that seemed dead was proved by an adb capture to arrive and then be lost to a mount-order race. Nudges that never came ended in the notification library's own Android source: without one permission, every alarm had been silently downgraded to an inexact one that the OS defers. The fix took the honest lane, the user-granted "Alarms & reminders" permission, over an auto-granted one Play reserves for alarm clocks and calendars. ([decision](../decision-log.md#2026-07-12-a5-escalation-exact-alarms-schedule_exact_alarm-the-real-reason-nudges-only-fired-on-app-open))
- **Even our own instruments follow the rule.** The reminder health line once read "Set on this phone: 39". That was the developer debugging in front of the user, and it became one calm sentence: "Next nudge around 3:00 pm."
- **Reversing well.** The scrapbook share launched image-only, so no task-derived words would leave the device as a surprise. Testing showed a bare image is half a keepsake. The caption is now baked into the image's pixels, so the share is still exactly one file the person has seen in full. The principle stayed and the mechanism changed. ([decision](../decision-log.md#2026-07-12-the-keepsake-becomes-a-page-caption-baked-into-the-shared-image-reversing-image-only-no-text))

## Honest lessons

- **Documents drift, and the code is the record.** Early status lines in the README, the commercialisation doc and the build plan called the Android versionCode 11 build "live on Google Play" when it had only reached closed testing. The Apple in-app purchase reversal lived for two days in a working note while the build plan still prescribed the opposite. The Break it down cap above existed only in the plans. Each surfaced only when someone checked the code or the store console instead of the document. ([the IAP entry](../decision-log.md#2026-07-15-apple-iap-from-ios-v1-reversing-the-hide-everything-path))
- **The web preview is a witness that always says yes.** Two Android builds crashed at launch on real devices because Android's JavaScript engine lacks parts of `Intl` that every browser has. Sharing text into the app on an iPhone had never worked, because the share extension's default rule accepted only links, and it was found only on 2026-09-25, the first time anyone shared text from an iPhone. Both had passed every browser check. ([decision](../decision-log.md#2026-09-25-ios-share-never-worked-and-it-was-one-missing-rule))
- **Read the store's policy before its reviewer reads it for you.** Both store rejections were right. Apple's was chiefly a sign-in wall before purchase. Google's surfaced a link to Stripe that had never been allowed. A policy sweep against the primary source belongs before the first release, not after a rejection.
- **Money bugs are silent.** A subscriber's question about an Apple charge took a full day and two outside dashboards to answer. The charge was correct, but our own data could not show it. Following the question turned up sandbox purchases writing the production entitlements table, and an anonymous Apple buyer who existed nowhere in our database for ten days. Every RevenueCat delivery is now logged with its outcome. ([sandbox](../decision-log.md#2026-08-19-sandbox-purchases-were-writing-the-production-entitlements-table), [the missing customer](../decision-log.md#2026-08-19-a-paying-customer-who-existed-nowhere-in-our-data))
- **Row-level security is not the whole front door.** An API audit on 2026-09-25 found the agent path and the billing routes decoding the token and trusting it without verifying it. Row-level security kept everyone's data safe throughout, but a forged token could reach another person's billing portal and drive the agent break-down spender. Verification moved in front of the billing routes, both public surfaces and the agent spender the same day.
- **The moat has to be tested like a feature.** The completion half was quietly undercounting. Two causes were found and fixed on 2026-10-04: only a tick on a row reported a step's outcome (a step finished in Focus or in bulk reported nothing), and the second sync after a breakdown wiped the id that links each step to its plan. A drift test now fails unless every task field is either synced or deliberately kept on the device. The completion rate is re-read only after the fix has been live on all three surfaces for a month. ([decision](../decision-log.md#2026-10-04-every-way-of-finishing-walks-up-stuck-big-tasks-are-repaired-sync-keeps-what-the-server-cannot-store-and-combine-never-loses-a-task))
- **The growth problem is reach, not design.** Three weeks after Hold me to it shipped, its telemetry showed it had been tried once. The feature was not the problem. Too few people knew the app existed. That moved the next effort from building to outreach.

## What this is meant to show

A product manager who:

- picks the right thing to build, from founder-market fit grounded in care for real people, and can say why the alternative lost
- designs from a population's real failure modes, not a feature list, and goes deep on them rather than wide
- holds one non-negotiable rule and lets it override good ideas, including the founder's own
- builds a defensible data moat, resolves its privacy tension by architecture, and refuses to fake its payoff before the data is real
- takes a product from feature-complete to commercially live on three storefronts, through app-store rejections and a payments-policy pivot, without breaking the platforms that already pay
- gives a consumer app a restrained developer surface, REST and MCP at parity on one engine, without letting it bloat the product
- pre-decides the stressful readings and rollbacks before they arrive
- keeps a reasoning trail honest enough to reconstruct every call, the roads not taken and the mistakes included.

## Status

**Live and commercial on the web, the App Store and Google Play.** 1.7.0 is live on both stores, and Premium sells through Stripe on the web, Apple on iOS and Google Play on Android. 1.8.0, carrying Where you left off and a set of fixes to how broken-down and tiny tasks finish, is with the stores as of 2026-10-05: iOS build 41 for App Review, and Android versionCode 35 for closed testing first, then Production. The web at [doubledone.app](https://doubledone.app) runs `main` and already has it. The full sequence and the parked-with-triggers backlog are in [`BUILD-PLAN.md`](../BUILD-PLAN.md).
