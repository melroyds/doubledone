# DoubleDone, cost analysis

*What it costs to run, modelled across scale. The figures are estimates: usage is assumed, and provider prices change (checked ~June 2026; Haiku re-confirmed at the 2026-07-11 energy-matching build). The value here is the **shape of the cost curve** and **where the money goes**, not penny-precision. Costs in USD; Premium is A$5/mo (~US$3.30 net of FX) or A$50/yr. Now that v1 is live, re-run these against the real `ai_calls` telemetry (Cloudflare D1) and the control centre's daily digest, the table exists for exactly this. Updated 2026-07-12 for the versionCode 11 release: the energy-matching route, keepsake storage (R2 + the scrapbooks table), and the paid Expo (EAS) subscription.*

---

## TL;DR

- **DoubleDone is cheap to run.** The only meaningful variable cost is **AI** (Claude + the scrapbook image). Everything else, Workers, R2, D1, Pages, Supabase, is near-free until six figures.
- **~$0.13 per registered user per month**, all-in, dominated by AI usage, scaling **linearly** (no large fixed costs to amortise).
- **The unit economics work at every scale.** A conservative 5% premium conversion at A$5/mo covers cost with ~20% gross margin, and margin widens fast as conversion rises (revenue scales with conversion; cost per user stays flat).
- **Watch-items:** the Anthropic token bill (tiered, capped at $25/mo, and now watched hourly by the control centre), the scrapbook image (the priciest single AI op, deliberately gated), and Stripe's flat US$0.30 fee, charged in USD regardless of billing currency, so ~9% of a ~US$3.30 sub on its own before the percentage fee.
- **One new fixed line (July 2026):** a paid Expo (EAS) subscription for build capacity, **US$19/month** (US$228/yr), replacing the free-tier build quota. Flat with scale, so it behaves like the domain: at 100 users it is ~$0.19/user/mo (briefly the biggest single line), by 10,000 it is $0.002 and noise.

## Assumptions

| Lever | Assumption | Why |
|---|---|---|
| Active rate | 50% of registered users are monthly-active | ADHD retention is hard; only active users incur AI cost |
| AI / active user / mo | 8 Break-it-downs, 12 triages, 4 Strategise, plus a few cheap Haiku calls (Talk-to-capture `/split`, Make-it-tiny `/tiny`, energy matching `/energy`) | the AI features at moderate use |
| Energy picks / active user / mo | ~4 at moderate use; free tier hard-capped at 15 per calendar month | freemium-metered; a use is spent only on a successful pick |
| Scrapbooks / active user / mo | ~0.6 avg (free ~1/mo, premium ~4/mo, not all make one) | the priciest AI op |
| Premium conversion | 5% of registered users | conservative for a niche with strong founder-market-fit |
| Premium price | A$5/mo (~US$3.30 net) | from the decision-log |

## Provider prices used (approximate, USD)

- **Claude** (Anthropic): Haiku ~$1 / $5 per M tokens (in/out); Sonnet ~$3 / $15 per M.
- **Workers AI** (scrapbook image, flux-1-schnell): ~$0.08 / image (conservative; image gen is the heaviest neuron op, hence the gating).
- **R2**: $0.015 / GB-mo storage, $4.50 / M writes, **no egress fee** (the reason it beats S3 here).
- **Workers**: $5/mo paid plan (10M requests included), $0.30 / M after.
- **Supabase**: free ≤ 50k MAU / 500MB; Pro $25/mo ≤ 100k MAU / 8GB.
- **Stripe**: 2.9% + $0.30 per charge.
- **D1, Pages**: free at this scale. **Domain**: ~$10/yr (~$1/mo).
- **Expo EAS**: a paid subscription since July 2026 (Android build capacity, after the free-tier monthly build cap became the binding constraint on the release loop). A flat monthly line at Expo's current plan pricing. Record the exact figure from the invoice when re-running this model.

## Unit economics (per action)

| Action | Models | Cost |
|---|---|---|
| **Break it down** | Haiku clarify + Sonnet decompose | ~$0.0135 |
| **Sort / triage** | Haiku | ~$0.0015 |
| **Talk-to-capture (`/split`)** | Haiku | ~$0.0015 |
| **Make it tiny (`/tiny`)** | Haiku | ~$0.0015 |
| **Strategise** | Sonnet | ~$0.012 |
| **Energy match (`/energy`)** | Haiku | ~$0.002 |
| **Scrapbook** | Workers AI image + R2 (~$0) | ~$0.08 |

`/split` and `/tiny` (both shipped 2026-06-22) are occasional, same-class Haiku calls, priced like triage above. They are too cheap and too infrequent to move the per-user figure: even a generous 4 `/split` + 4 `/tiny` per active user adds ~$0.012/mo, lost in the rounding against the ~$0.22 below.

**Energy matching (`/energy`, shipped 2026-07-11)** is the same class again, with a meter on top. Free gets 15 picks a calendar month and no AI call is ever made past the gate, so the worst-case free-user add is 15 × $0.002 = **~$0.03/mo, hard-bounded by design**. Premium is unmetered, but even an implausibly heavy 10-picks-a-day premium user costs ~$0.60/mo against ~US$3.30 of revenue. At the assumed ~4 picks/mo it adds under a cent and vanishes into the rounding. The meter exists as conversion psychology, not cost control, and the numbers show why that is the honest framing.

**AI per active user / month** ≈ 8×0.0135 + 12×0.0015 + 4×0.012 + 0.6×0.08 ≈ **$0.22** (of which Claude ~$0.17, scrapbook image ~$0.05). The `/split`, `/tiny`, and `/energy` Haiku calls sit inside that ~$0.17 Claude share and do not change the rounded total.

## The spread

Monthly, by registered-user count (50% active):

| Line item | 100 | 1,000 | 10,000 | 100,000 |
|---|--:|--:|--:|--:|
| Active users | 50 | 500 | 5,000 | 50,000 |
| Claude (Anthropic) | $8.70 | $87 | $870 | $8,700 |
| Workers AI (scrapbook) | $2.40 | $24 | $240 | $2,400 |
| Cloudflare Workers | free | free | $5 | $5 |
| R2 / D1 / Pages | ~$0 | ~$0 | ~$1 | ~$1 |
| Supabase | free | free | free | $25 |
| Stripe fees (5% premium) | $2.0 | $19.8 | $198 | $1,980 |
| Domain | $1 | $1 | $1 | $1 |
| **Total cost / mo** | **~$14** | **~$132** | **~$1,315** | **~$13,112** |
| **Cost / user / mo** | $0.14 | $0.13 | $0.13 | $0.13 |
| Premium revenue (5% × US$3.30) | $16.5 | $165 | $1,650 | $16,500 |
| **Gross margin / mo** | ~$2 | ~$33 | ~$335 | ~$3,388 |
| **Gross margin %** | ~15% | ~20% | ~21% | ~21% |

*Not in the totals above: the paid Expo (EAS) subscription (July 2026), **US$19/month** flat. Being flat it matters most at the 100-user column (~$0.19/user/mo there, more than the AI line) and dilutes to $0.002 by 10,000. Fold it into the totals when re-running this table against live telemetry. Energy matching (`/energy`) IS in the shape: it rides inside the Claude row, bounded by its own free-tier meter.*

## Where the money goes

- **AI is ~85% of cost** (Claude ~65%, scrapbook image ~18%). Everything else is a rounding error until 100k users.
- **The scrapbook image is modelled paid, but currently rides free.** At today's scale the Workers AI image generation fits inside the account's daily free neuron allocation (one image is roughly a day's free budget, which is exactly why the cadence is gated). The ~$0.08/image column is the honest at-scale price, and the current cash spend on that line is ~$0.
- **Infra is almost free.** Cloudflare's no-egress R2 plus the Workers / Pages / D1 free tiers make the platform cost trivial. That is a deliberate stack choice, not luck.
- **Keepsake persistence (R2 + the Supabase `scrapbooks` table, cross-device since 2026-07-12) adds no meaningful marginal cost.** A keepsake is one jpeg in R2 per user-week, capped at the 16 newest weeks per user, and R2 charges storage at $0.015/GB-mo with no egress fee, so even the shared/viewed images cost nothing to serve. The `scrapbooks` sync row is a few short text fields around an https URL, trivial against Supabase's free tier. Storage is the cheap half of the scrapbook, generation (above) is the gated half.
- **Expo EAS is the one new fixed line (July 2026).** Build tooling, not serving cost: it does not scale with users at all, so it thins per-user cost as the base grows and only stings at very small user counts.
- **Stripe's flat US$0.30** is charged in USD, so it is ~9% of a ~US$3.30 monthly sub on its own, well above the 2.9% headline once added. On 5,000 monthly subs that is ~$1,500/mo of pure fixed fee. **The annual plan (A$50/yr, live) cuts the charge count 12×** and recovers most of it.
- **Supabase** is the only step-change (free → $25 Pro at 50k MAU → usage). Tiny next to AI.
- **Most of the 2026-06-22 work adds zero run cost.** Routines, the low-capacity day, and the wind-down nudge are fully local and client-side, so they touch no provider bill. The silent-parent chain (Break-it-down) reuses the existing decompose call and adds no AI. Only `/split` and `/tiny` add cost, and both are marginal Haiku.

## Margin levers (in order of impact)

1. **Conversion rate.** Cost/user is ~flat ($0.13); revenue is all conversion. 5% → 10% roughly doubles margin. The niche + founder-market-fit make >5% plausible.
2. **AI usage per user.** The cost driver. Tiered models (Haiku for cheap ops), the $25 cap, and the control centre's hourly sweep already manage it; a heavy-user cohort is the cost risk to watch.
3. **Premium price / packaging.** A$5 is low. An annual plan (Stripe-fee saving) or a higher tier lifts revenue with no cost change.
4. **Scrapbook image.** The priciest op; already gated (free monthly, premium weekly). A cheaper model or tighter free cadence protects it at scale.

## The honest risks

- **Anthropic spend is the one unbounded line, now bounded.** It is hard-capped at $25/mo in production (`ANTHROPIC_MONTHLY_CAP_USD`) and watched by the launch control centre, which sweeps the D1 `ai_calls` telemetry hourly, alarms at 50% of the cap with a month-end projection, and lets AI routes fail gracefully rather than overrun. The risk is now early-warned, not open.
- **Free-tier abuse.** The AI routes are origin-gated + per-IP rate-limited, but a determined abuser is the tail risk on the AI bill.
- **FX.** Costs are USD, revenue is AUD; a weak AUD compresses margin. Stripe's flat fee is USD too, so it bites hardest on small monthly subs, which is why annual billing (one charge, not twelve) matters below ~1,000 subscribers.
- **Apple, when iOS ships.** Premium is Stripe today, and the pre-decided iOS path (see `BUILD-PLAN.md`) starts with no purchase path on iOS at all (existing subscribers unlock under Apple's 3.1.3(b)). If real In-App Purchase ever ships, Apple's 15% replaces Stripe's ~2.9% + $0.30 on those subscriptions, a materially different fee structure that this model does not yet include. Re-cut the Stripe rows before that decision, not after.

**Bottom line:** a usage-priced cost base of ~$0.13/user that is ~85% AI, against ~$0.165/user of revenue at a deliberately conservative 5% conversion. The gross margin is positive at every scale modelled, but thin below ~1,000 users where Stripe's flat per-charge fee dominates, and it ramps with user count and conversion (the levers push margin up without pushing cost up). These figures are modelled pre-launch; v1 is now live and logging to D1, so they will be validated against real cohort usage. The July 2026 additions do not move the shape: energy matching is bounded by its own free-tier meter, keepsake storage is negligible by construction, and the EAS subscription is a flat tooling line that dilutes with growth.
