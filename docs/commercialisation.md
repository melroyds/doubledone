# DoubleDone, commercialisation

*The commercial story end to end: who it is for, how it makes money, whether the economics work, how it grows, and how we would know it is working. A strategy artifact, not a forecast. Pairs with [`cost-analysis.md`](cost-analysis.md) for the numbers.*

---

## TL;DR

- **Value.** The first to-do app built *around* the ADHD / AuDHD / OCD failure modes rather than retrofitted onto a neurotypical optimiser. Founder-market-fit plus a never-shame architecture the incumbents cannot copy without rebuilding their core.
- **Money.** Freemium. The whole core loop is free and genuinely useful; **A$5/mo premium** buys delight and power (the scrapbook cadence, and later Plan-my-day / Prioritise), never core function. Subscription, because both the value and the cost are ongoing.
- **Economics.** ~$0.13/user/mo to run; a premium user pays ~25× their cost. Profitable at a conservative 5% conversion, and margin scales with conversion (cost/user is ~flat).
- **Growth.** Community-led, the ADHD community is vocal, online, and shares tools, so low CAC, compounded by a cross-user completion-data **flywheel** that strengthens the product as it grows.
- **Success = retention.** The north star is the **week-six bar**: is an ADHD person still opening this. Acquisition is easy in this niche; staying is the proof of fit.

## 1. Value proposition

**Who.** Adults with ADHD, autism, the AuDHD overlap, OCD, or chronic overwhelm who have bounced off mainstream to-do apps. A large, vocal, underserved segment the giants treat as edge cases.

**The pain.** Todoist, Motion, Sunsama, TickTick are built for neurotypical optimisation, more capture, more structure, streaks, points. For this brain those patterns *backfire*:
- **Task-initiation paralysis** — the dreaded task is too big to start.
- **Time blindness** — "today" silently fills past what a day holds.
- **The discounting reflex** — the brain throws away everything you did and says you did nothing.
- **Rejection-sensitive dysphoria (RSD)** — a guilt-based, overdue-red, nagging app is not motivating, it is repelling.

So the category leaders don't just fail to help this user, they actively make them feel worse, then the user blames themselves.

**The answer.** DoubleDone is built around those failure modes, one feature each:
- Break-it-down + **focus mode** for task initiation.
- The **weight-of-today** gauge for time blindness.
- **"I also did that"** + the Lookback for the discounting reflex.
- The never-shame spine + **shame-free re-entry** for RSD.

The promise in one line: *your brain can't tell you that you did nothing.*

**Why it is defensible.**
- **Founder-market-fit.** The founder is in the audience and dogfoods daily. This shows in a thousand small calls competitors won't make.
- **Never-shame is architecture, not a setting.** No overdue-red, no streaks, undone work rolls forward quietly. A competitor can't bolt this on; it contradicts their engagement model (streaks and nags are how they retain neurotypical users).
- **The calm/predictable design** fits the autistic side, where dopamine-streak apps actively repel.
- **The wedge.** A reachable, high-need, tool-sharing community the incumbents ignore because it is "small" by their standards and hostile to their playbook.

## 2. Monetisation model

**Freemium, with a free tier that is genuinely good.** The entire core loop, capture, AI triage, Break-it-down, the Lookback, close-the-day, sync, is free. For an RSD-prone, trust-sensitive audience, a crippled free tier reads as a bait-and-switch and churns them before they convert. Free has to earn the relationship.

**Premium (A$5/mo) buys delight and power, never core function:**
- **The AI scrapbook cadence** (live): free gets an occasional taste (~1/month), premium unlocks more (scaling 1 → 2 → 4 per week by *tenure / cumulative use, never a streak*).
- **Coming:** Plan-my-day, Prioritise-a-task, and the "chart a course" planner, the token-heavy AI features that are paid by design.

**Why subscription, not one-time.** The value is daily and ongoing, and the AI has an ongoing per-call cost. Subscription aligns price with both. (This is exactly the recurring-value hook SubToll, the shelved sibling, could never manufacture.)

**Pricing rationale.** A$5/mo is deliberately low: the audience can be cost-sensitive, and for RSD a high price plus a lapsed month equals churn-by-guilt. Accessible price, wide top of funnel.
- **No ads** (sensory load + trust).
- **Never sell data.** The moat is *aggregate and anonymous*, and stays that way.
- **Packaging roadmap:** an **annual plan (A$50/yr)** cuts Stripe's per-charge fee ~12× and adds commitment; a future higher tier captures power users without raising the entry price.

## 3. Unit economics

(Full model in [`cost-analysis.md`](cost-analysis.md).)

- **Cost to serve:** ~$0.13/user/mo, ~85% of it AI, scaling linearly.
- **A premium user pays ~25×** their cost to serve (A$5 ≈ US$3.30 vs ~$0.13).
- **LTV (premium):** at ~12 months average life (conservative for a niche tool that fits), ~A$60 gross → ~US$36 contribution after cost + Stripe fees.
- **CAC:** community-led and word-of-mouth target a CAC near zero. Even a modest paid CAC of ~A$15 pays back in ~3 months and sits far below LTV.
- **Margin:** ~20% gross at 5% conversion; because cost/user is flat, every conversion point above 5% drops almost straight to margin.

The shape that matters: **flat per-user cost, conversion-driven revenue.** Growth doesn't erode margin, and improving conversion or packaging lifts it without touching the cost base.

## 4. Growth

**Acquisition (community-led first):**
- **Where the audience already is:** ADHD subreddits, ADHD-creator TikTok / Instagram / YouTube, Discord communities. The hook is authenticity, *built by one of us, around how our brains actually fail*.
- **Content:** the founder's story and the never-shame philosophy are inherently shareable, and double as the portfolio narrative.
- **Word of mouth:** this community shares tools that genuinely work, the cheapest and highest-trust channel.

**Growth loops:**
1. **The data flywheel (the moat).** More users → richer anonymous cross-user completion data → the honest "others took about N days" estimate and smarter decompositions → a better product → more users. Instrumented from day one, before there was data to use, on purpose.
2. **The keepsake loop.** The Lookback / scrapbook is a calm artifact worth sharing. Opt-in only (sharing is sensory- and RSD-sensitive), but a shared keepsake is organic exposure that fits the brand.
3. **Gentle referral.** Invitational, never gamified, in keeping with the spine.

**Defensibility.** The flywheel is the durable moat: a competitor can clone the UI in a weekend, but not the cross-user timing data or the never-shame trust, which compound with scale and tenure.

## 5. Measurement of success

**North star: week-six retention.** *Is an ADHD person still opening this in week six.* For this audience acquisition is the easy part; retention is both the hard part and the proof of product-market-fit. Everything else is a leading indicator of this.

| Layer | Metric | Why |
|---|---|---|
| **Activation** | completed the core loop in week one (capture → break down → finish one thing → see the Lookback) | the "aha" is seeing you did something |
| **Retention** | D1 / D7 / D30 / **W6** curves; curve *flattening* | a flat tail is product-market-fit for a habit tool |
| **Conversion** | free → premium % (target ≥ 5%) | the revenue lever, given flat cost/user |
| **Helpfulness** (calm-appropriate) | completions/week, off-plan logs ("I also did that"), dreaded tasks finally closed | did it help you *do the thing*, not how long you stared at it |
| **Moat** | anonymous completion-data volume + estimate accuracy | the flywheel's health |

**Deliberately NOT a metric:** daily-active-time / session-maximisation. Optimising for time-in-app would betray the calm spine, the goal is to help you finish and leave, not to trap you.

**Counter-metrics (guardrails):**
- **Never-shame invariant held** (no guilt mechanics shipped, ever).
- **Churn-by-guilt** watched (do lapses correlate with not returning? if so, re-entry isn't gentle enough).
- **No dark-pattern engagement** creeping in under growth pressure.

## Risks & honest unknowns

- **Retention is unproven.** The whole thesis rests on the W6 bar, and there is no real-user data yet. This is the first thing to validate.
- **Niche size vs ambition.** The wedge is reachable and underserved, but "how big" is unvalidated; expansion beyond the ADHD core is a later, separate bet.
- **The calm-vs-growth tension.** Every standard growth lever (streaks, nags, gamified referral) is one the spine forbids. Growth has to come from fit and word of mouth, slower but more durable, and a real constraint to hold under pressure.
- **AI cost at heavy use** and **FX** (USD costs, AUD revenue) are the cost-side risks (see cost-analysis.md).

**Bottom line:** a genuinely differentiated product for an underserved, reachable audience, with flat per-user costs, a conversion-driven model that is profitable from 5%, a compounding data moat, and a single honest thing left to prove, that this audience stays.
