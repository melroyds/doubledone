# DoubleDone, commercialisation

*The commercial story end to end: who it is for, how it makes money, whether the economics work, how it grows, and how we would know it is working. A strategy artifact, not a forecast. Pairs with [`cost-analysis.md`](cost-analysis.md) for the numbers.*

**Status (July 2026): live, commercial, multi-platform, and agent-operable.** DoubleDone ships at [doubledone.app](https://doubledone.app) with real paying subscribers on Stripe (since 26 June 2026). Since launch the reach has widened materially: the Android app is **live on Google Play** (versionCode 11, submitted and released 12 July 2026), an **iOS / TestFlight** build is in progress (second platform), and the app now speaks **four languages** (English, Italian, Spanish, French, device-follow, no setting). It is also **operable by AI agents**: Claude and ChatGPT can drive a user's tasks through a public MCP server (OAuth, acting as the user under row-level security), alongside a Swagger-documented public REST API. The launch control centre watches cost and health hourly. The 12 July 2026 Android release (versionCode 11) widened the premium suite materially: the Quiet interface, custom colour themes, energy matching inside Focus (15 free picks a month, unlimited on Premium), and keepsakes that follow the account across devices and share as a proper page. This document reflects the shipped reality, not a plan. The pricing, the trial, and the premium features below are all live.

---

## TL;DR

- **Value.** The first to-do app built *around* the ADHD / AuDHD / OCD failure modes rather than retrofitted onto a neurotypical optimiser, and it goes deep on each, including the OCD side most apps ignore. Founder-market-fit plus a never-shame architecture the incumbents cannot copy without rebuilding their core.
- **Money.** Freemium. The whole core loop is free and genuinely useful. **Premium is A$5/month or A$50/year**, and it buys delight and power (the weekly scrapbook keepsake, richer AI, the Quiet interface, custom themes, unlimited energy matching), never core function. A **30-day card-free trial** lets the value land before a payment method is asked for.
- **Economics.** ~$0.13/user/mo to run; a premium user pays ~25× their cost. Profitable from a conservative 5% conversion, and margin scales with conversion because cost/user is roughly flat. The one unbounded line, AI spend, is now **hard-capped at $25/mo and watched hourly**.
- **Growth.** Community-led: the ADHD community is vocal, online, and shares tools, so low CAC, compounded by a cross-user completion-data **flywheel** that strengthens the product as it grows. The surface to grow into has widened since launch, four languages, iOS in progress, and a modern "operable by Claude and ChatGPT" hook that reaches the AI-tooling audience.
- **Success = retention.** The north star is the **week-six bar**: is an ADHD person still opening this. Acquisition is easy in this niche; staying is the proof of fit. We now have real users to measure it against.

## 1. Value proposition

**Who.** Adults with ADHD, autism, the AuDHD overlap, OCD, or chronic overwhelm who have bounced off mainstream to-do apps. A large, vocal, underserved segment the giants treat as edge cases.

**The pain.** Todoist, Motion, Sunsama, TickTick are built for neurotypical optimisation, more capture, more structure, streaks, points. For this brain those patterns *backfire*:
- **Task-initiation paralysis**, the dreaded task is too big to start.
- **Time blindness**, "today" silently fills past what a day holds.
- **The discounting reflex**, the brain throws away everything you did and says you did nothing.
- **Rejection-sensitive dysphoria (RSD)**, a guilt-based, overdue-red, nagging app is not motivating, it is repelling.

So the category leaders don't just fail to help this user, they actively make them feel worse, then the user blames themselves.

**The answer.** DoubleDone is built around those failure modes, and has gone deep on each rather than wide on new ones:
- **Task initiation:** Break-it-down (which keeps the real task as a silent background parent so it never looms), **Make it tiny** (a 2-minute version of a stuck task), and **focus mode**, where since 12 July 2026 the first offer is **energy matching** ("What fits right now?": one calm question, one pick that fits the energy you actually have).
- **Time blindness:** the **weight-of-today** gauge, plus a one-tap **low-capacity day** that recalibrates Today when you have less to give.
- **Unreliable internal cues (interoception and object permanence):** **Rhythms**, gentle recurring self-care nudges (water every 90 minutes, meds at set times) with no count and no streak, free by design because self-care access is never a paywall.
- **The discounting reflex:** **"I also did that"**, the Lookback, and the chain that credits the whole dreaded task when its small steps are done.
- **RSD:** the never-shame spine, **shame-free re-entry**, **Routines** with no streak to break, and a gentle evening **wind-down**.
- **The OCD and perfectionism overlap:** **"Done is done"** and a calm completion close that never demands more, the first touches aimed squarely at that side of the audience.

The promise in one line: *your brain can't tell you that you did nothing.*

**Why it is defensible.**
- **Founder-market-fit.** The founder built this for the people he works with, has managed, and is close to who live it, out of proximity rather than a personal diagnosis. This shows in a thousand small calls competitors won't make.
- **Depth, not a veneer.** The product answers each failure mode several ways now, and the OCD overlap too. That accumulated, dogfooded judgment about which thin spot to deepen next is the part a funded team cannot shortcut. They can copy a screen, not the sequence of calls that built it.
- **Never-shame is architecture, not a setting.** No overdue-red, no streaks, undone work rolls forward quietly. A competitor can't bolt this on; it contradicts their engagement model (streaks and nags are how they retain neurotypical users).
- **The moat.** A cross-user completion-data flywheel, instrumented from day one: every decomposition offered, and whether its steps got completed, flows into pseudonymous telemetry (no user id, no IP). It is what makes the product smarter as it scales and what a funded competitor cannot buy. Aggregate, anonymous, never sold.
- **The calm/predictable design** fits the autistic side, where dopamine-streak apps actively repel.
- **The wedge.** A reachable, high-need, tool-sharing community the incumbents ignore because it is "small" by their standards and hostile to their playbook.
- **A platform, not just an app (the 2026 wedge).** DoubleDone is operable by the AI assistants people already use: paste one URL into Claude or ChatGPT and it can capture, plan, and complete a user's tasks, *as them*, under their own row-level security. Most to-do apps bolt AI *inside* the app; DoubleDone goes the other way and meets the user in the assistant they already live in, which for an executive-function-challenged audience is the calmest possible interface, no new app to open, no habit to build. A public, Swagger-documented REST API sits beside it for developers. This is easy to copy as a feature and hard to copy as a posture, and it is a marketing angle the incumbents are not using.

## 2. Monetisation model

**Freemium, with a free tier that is genuinely good.** The entire core loop, capture, AI triage, Break-it-down, the Lookback, close-the-day, sync, is free. For an RSD-prone, trust-sensitive audience, a crippled free tier reads as a bait-and-switch and churns them before they convert. Free has to earn the relationship.

**The trial: 30 days, no card.** Every new synced account gets a one-time 30-day Premium trial, granted on sign-up, no card required (write-once per account, so it cannot be farmed). It is the activation and confidence lever: this audience is trust-sensitive, so proving the value before asking for a card matters more here than almost anywhere. It is also an honest churn backstop, a lapsed Premium does not silently re-grant a trial, so lifetime value stays real.

**Premium (A$5/month or A$50/year) buys delight and power, never core function:**
- **The AI scrapbook** (the headline): free gets an occasional taste (~1/month), Premium unlocks more (scaling 1 → 2 → 4 per week by tenure / cumulative use, never a streak). Since 12 July 2026 keepsakes **follow the account across devices** and **share as a proper page**, one jpeg with the caption and a quiet "DoubleDone · Week of X" wordmark baked into the pixels, so the emotional payoff doubles as the organic loop.
- **Richer AI:** Plan my day (sequencing), Chart a course (goal planning), and Lookback insights, the token-heavy AI features that are paid by design. Plus photo-to-tasks scan (OCR) and pinning a task to the top.
- **Energy matching without limits.** "What fits right now?" is freemium: free gets 15 picks a calendar month (with calm reminders at 10 and 5 left, never a nag, and no AI call is ever made past the gate), Premium removes the meter. The meter is conversion psychology, not cost control, and that is the honest reason.
- **The Quiet interface:** a premium borderless appearance that strips the chrome so the app reads as calm text on paper, same layout, same features. Personalisation that converts on feel, like the themes.
- **The six non-default colour themes** (Dusk, the calm default, is always free): a low-cost delight lever that converts on aesthetics, not on withheld function.

**Two prices, one product.** Monthly (A$5) is the default; annual (A$50) is offered at checkout for the commitment-minded. Annual is not only a discount: it recovers Stripe's flat ~US$0.30 per-charge fee roughly twelve times over (one charge a year instead of twelve), so it lifts margin more than the headline saving suggests.

**Why subscription, not one-time.** The value is daily and ongoing, and the AI has an ongoing per-call cost. Subscription aligns price with both. (This is exactly the recurring-value hook SubToll, the shelved sibling, could never manufacture.)

**Pricing rationale.** A$5/mo is deliberately low: the audience can be cost-sensitive, and for RSD a high price plus a lapsed month equals churn-by-guilt. Accessible price, wide top of funnel.

**Guardrails:**
- **No ads** (sensory load + trust).
- **Never sell data.** The moat is aggregate and anonymous, and stays that way.
- **The AI budget is capped and watched.** Anthropic spend is hard-capped at $25/month, and the control centre sweeps hourly: it alarms the founder at 50% of the cap and projects month-end spend, so a launch-day spike or an abuse run is caught before it becomes a surprise bill or a silent outage. Cost control is operational now, not aspirational.

## The funnel

The path from stranger to subscriber, and where each step is instrumented:
1. **Land** on doubledone.app (the calm, empathy-first landing) or the Play Store listing.
2. **Use it free**, no account needed. The core loop has to earn the relationship before anything is asked.
3. **Sync** (optional), email only, a one-time code. This is the first identity, and where the 30-day trial auto-starts.
4. **Sample Premium** during the trial: a scrapbook keepsake, a Chart-a-course plan, the Quiet interface, a custom theme.
5. **Convert** as the trial nears its end (the warmest moment), or stay free indefinitely with no nag.
6. **Land in Premium**: the first scrapbook is the activation moment that makes the subscription feel worth it.

The control centre's daily digest tracks the live shape of this: trials active, new Premium per day, and the spend each cohort drives.

## 3. Unit economics

(Full model in [`cost-analysis.md`](cost-analysis.md).)

- **Cost to serve:** ~$0.13/user/mo, ~85% of it AI, scaling linearly.
- **A premium user pays ~25×** their cost to serve (A$5 ≈ US$3.30 vs ~$0.13).
- **LTV (premium):** at ~12 months average life (conservative for a niche tool that fits), ~A$60 gross → ~US$36 contribution after cost and Stripe fees. Annual subscribers lift this by cutting the per-charge fee.
- **CAC:** community-led and word-of-mouth target a CAC near zero. Even a modest paid CAC of ~A$15 pays back in ~3 months and sits far below LTV.
- **Margin:** ~20% gross at 5% conversion; because cost/user is flat, every conversion point above 5% drops almost straight to margin.
- **The cost cap is live.** The one unbounded line is AI spend, now capped at $25/mo and enforced by the hourly sweep, which projects month-end and alarms at 50%. AI routes fail gracefully (never a user-facing crash) if the cap is ever reached. Cost is no longer the open risk it was pre-launch.
- **The July 2026 additions do not move the figure.** Energy matching runs on Haiku at ~$0.002 a call, and the free tier's 15-pick monthly cap bounds the worst-case free user at ~$0.03/mo by construction. Keepsake storage (R2 plus the Supabase scrapbooks table) is negligible, R2 charges no egress and a sync row is a few short text fields. The one new fixed line is the paid Expo (EAS) subscription for build capacity, US$19/month, flat with scale. The ~$0.13/user figure stands.
- **FX.** Costs are USD (Anthropic, Stripe's flat fee), revenue is AUD. Stripe's ~US$0.30 flat fee is charged in USD regardless of billing currency, roughly 9% of an A$5 sub, which is why the flat fee, not the percentage fee, dominates margin at small scale, and why annual billing matters below ~1,000 subscribers.

The shape that matters: **flat per-user cost, conversion-driven revenue.** Growth doesn't erode margin, and improving conversion or packaging lifts it without touching the cost base.

## 4. Growth

**Acquisition (community-led first):**
- **Where the audience already is:** ADHD subreddits, ADHD-creator TikTok / Instagram / YouTube, Discord communities. The hook is authenticity, *built by one of us, around how our brains actually fail*.
- **Content:** the founder's story and the never-shame philosophy are inherently shareable, and double as the portfolio narrative.
- **Word of mouth:** this community shares tools that genuinely work, the cheapest and highest-trust channel.
- **"Your AI can run your to-do list" (a modern, shareable hook).** DoubleDone connects to Claude and ChatGPT, so a user can add, plan, and finish tasks from inside the assistant they already use. Few calm/niche apps have this, so it is a genuine differentiator *and* a demo-able piece of content (the connect-it-live clip) that reaches the AI-tooling audience, adjacent to but wider than the ADHD core. Deliberately a wedge, not the core pitch: the never-shame story still leads.

**Reach (widened since launch).** The addressable market is no longer Android-and-English only. The app now follows the device language across **English, Italian, Spanish, and French** (the AI answers in the user's language too), and an **iOS / TestFlight** build is in progress (started 5 July 2026), a second platform and the larger share of the calm-premium demographic. The codebase is iOS-ready, the platform-split seams are already in place. Localised *store listings* and in-market marketing are a deliberate, separate step, taken only when a given market is actually pursued, not before.

**The Apple decision, pre-named.** Premium today is Stripe, and an App Store release cannot ship until the In-App-Purchase strategy is decided, Apple's rules make that a gate, not a detail. **DECIDED 2026-07-15, and it reversed the pre-decision.** Apple IAP ships from iOS v1 via RevenueCat, at parity pricing (A$5 / A$50 matching Stripe, absorbing Apple's 15% rather than marking iOS up). Melroy: "15% of 0 is 0. I want to give customers a path to becoming premium." The old pre-decided path, hiding every purchase path under Apple's 3.1.3(b) allowance until iOS revenue justified the cut, is superseded: a hidden path converts nobody, so the cut buys a revenue line rather than costing one. See `decision-log.md` (2026-07-15). **This page still models iOS at a 0% platform cut and is now WRONG for iOS revenue: fold in the 15% before quoting any iOS margin.**

**The first-week go-to-market playbook (concrete):**
- **Where:** r/ADHD and r/adhdwomen (read the rules, lead with the story not a link), ADHD Discords, and ADHD creators on TikTok / Instagram. Not Product Hunt first, the audience is not there.
- **The message:** built by someone who works alongside and cares for people with ADHD, around how these brains actually fail, with the one promise that lands, *your brain can't tell you that you did nothing.* Show the never-shame spine (no streaks, no red), it is the thing that makes people who have bounced off ten apps lean in.
- **The format:** the founder's story plus a short demo of Break-it-down or the Lookback keepsake. Authenticity over polish.
- **The earliest signal to watch:** activation (did week-one sign-ups run the core loop at least once), not raw downloads. A 20-sign-up day at 60% activation beats a 50-sign-up day at 20%.

**Growth loops:**
1. **The data flywheel (the moat).** More users → richer anonymous cross-user completion data → the honest "others took about N days" estimate and smarter decompositions → a better product → more users. Instrumented from day one, before there was data to use, on purpose. Both halves are live: the decomposition offered, and whether its steps got completed.
2. **The keepsake loop, now live (shipped 11-12 July 2026).** The scrapbook keepsake has a share action: one jpeg page with the caption and a quiet "DoubleDone · Week of X" wordmark baked into the pixels, so no receiving app can strip the context, and raw task titles still never leave the device. Opt-in only (sharing is sensory- and RSD-sensitive), and shame-safe by construction, the keepsake only ever depicts finished things. Every proud share is a person showing a friend the app, the first organic acquisition loop actually shipped.
3. **Gentle referral (backlog, not v1).** Invitational link sharing, never gamified; for v1 the moat and word of mouth are the acquisition levers.

**Defensibility.** The flywheel is the durable moat: a competitor can clone the UI in a weekend, but not the cross-user timing data or the never-shame trust, which compound with scale and tenure.

## Churn, retention, and the levers

Retention is the whole thesis, so the failure modes deserve naming:
- **The RSD lapse-and-spiral.** A user misses a few days, feels the guilt, and avoids the app entirely. This is the most dangerous churn for this audience and the reason the never-shame spine and shame-free re-entry exist. The lever: the app must always welcome you back and never count the days against you.
- **Cost sensitivity.** A$5 is deliberately low, and the trial removes the upfront ask. If churn clusters at the trial-to-paid boundary, the lever is the activation path (did they reach a scrapbook), not the price.
- **A better-fitting alternative.** Possible, but the moat, the completion flywheel and the accumulated never-shame judgment, is what makes the product harder to leave the longer you stay.

How we watch it: weekly cohort pulls from the D1 telemetry (activation, return rate, premium-route use), plus the control centre's daily digest. A premium user whose activity goes quiet is the earliest churn signal, well before Stripe ever reports a cancellation.

**If AI cost spikes (the decision tree).** The control centre alarms before the cap bites. When it does: (1) read the endpoint mix in the alert, a Sonnet-heavy spike (decompose, chart) costs far more than a Haiku-heavy one (triage); (2) if it is abuse, the per-IP rate limit and the scrapbook backstop already bound a single actor, so tighten those or block at the edge; (3) if it is genuine demand, the choices are to narrow the most expensive AI features behind Premium, drop to a cheaper model on the hot path, or, in extremis, pause new sign-ups rather than degrade paying users. The cap means the worst case is a graceful AI pause, never a runaway bill.

## 5. Measurement of success

**North star: week-six retention.** *Is an ADHD person still opening this in week six.* For this audience acquisition is the easy part; retention is both the hard part and the proof of product-market-fit. Everything else is a leading indicator of this.

| Layer | Metric | Why |
|---|---|---|
| **Activation** | completed the core loop in week one (capture → break down → finish one thing → see the Lookback) | the "aha" is seeing you did something |
| **Retention** | D1 / D7 / D30 / **W6** curves; curve *flattening* | a flat tail is product-market-fit for a habit tool |
| **Conversion** | trial → paid %, and free → premium % (target ≥ 5%) | the revenue lever, given flat cost/user |
| **Helpfulness** (calm-appropriate) | completions/week, off-plan logs ("I also did that"), dreaded tasks finally closed | did it help you *do the thing*, not how long you stared at it |
| **Moat** | anonymous completion-data volume + estimate accuracy | the flywheel's health |

**Deliberately NOT a metric:** daily-active-time / session-maximisation. Optimising for time-in-app would betray the calm spine, the goal is to help you finish and leave, not to trap you.

**Counter-metrics (guardrails):**
- **Never-shame invariant held** (no guilt mechanics shipped, ever).
- **Churn-by-guilt** watched (do lapses correlate with not returning? if so, re-entry isn't gentle enough).
- **No dark-pattern engagement** creeping in under growth pressure.

## Risks & honest unknowns

- **Retention is the open question, but now measurable.** The thesis rests on the W6 bar. We are live with real users, so for the first time there is a real curve forming rather than a hypothesis. Early, but no longer blind.
- **The anonymous-first majority is hard to measure.** By design most users never sync, so per-user activation and retention can only be computed for the signed-in minority. If the curve reads low, the first question is "is nobody returning, or is nobody syncing", and only a privacy-safe anonymous ping (never task text) can tell them apart. This is the biggest measurement gap.
- **Niche size vs ambition.** The wedge is reachable and underserved, but "how big" is unvalidated; expansion beyond the ADHD core is a later, separate bet.
- **The calm-vs-growth tension.** Every standard growth lever (streaks, nags, gamified referral) is one the spine forbids. Growth has to come from fit and word of mouth, slower but more durable, and a real constraint to hold under pressure.
- **AI cost and FX** are now bounded (the cap plus the hourly sweep) rather than open, but heavy real usage will still test the per-user assumptions, which were modelled pre-launch and will be validated against live D1 telemetry.

**Bottom line:** a genuinely differentiated product for an underserved, reachable audience, now live and commercial with real subscribers, multi-platform (Android in closed test, iOS in progress with the IAP call pre-decided) and multi-lingual, agent-operable as a modern wedge, with flat per-user costs under a live cap, a conversion-driven model profitable from 5%, a compounding data moat, and one honest thing still to prove over time, that this audience stays.
