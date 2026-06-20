# DoubleDone, cost analysis

*What it costs to run, modelled across scale. The figures are estimates: usage is assumed, and provider prices change (checked ~June 2026). The value here is the **shape of the cost curve** and **where the money goes**, not penny-precision. Costs in USD; the premium price is A$5/mo (~US$3.30 net of FX). Re-run against the real `ai_calls` telemetry (Cloudflare D1) once there is traffic, that table exists for exactly this.*

---

## TL;DR

- **DoubleDone is cheap to run.** The only meaningful variable cost is **AI** (Claude + the scrapbook image). Everything else, Workers, R2, D1, Pages, Supabase, is near-free until six figures.
- **~$0.13 per registered user per month**, all-in, dominated by AI usage, scaling **linearly** (no large fixed costs to amortise).
- **The unit economics work at every scale.** A conservative 5% premium conversion at A$5/mo covers cost with ~20% gross margin, and margin widens fast as conversion rises (revenue scales with conversion; cost per user stays flat).
- **Watch-items:** the Anthropic token bill (tiered + capped + instrumented), the scrapbook image (the priciest single AI op, deliberately gated), and Stripe's $0.30 flat fee making a small A$5 sub cost ~6% to process.

## Assumptions

| Lever | Assumption | Why |
|---|---|---|
| Active rate | 50% of registered users are monthly-active | ADHD retention is hard; only active users incur AI cost |
| AI / active user / mo | 8 Break-it-downs, 12 triages, 4 Strategise | the AI features at moderate use |
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

## Unit economics (per action)

| Action | Models | Cost |
|---|---|---|
| **Break it down** | Haiku clarify + Sonnet decompose | ~$0.0135 |
| **Sort / triage** | Haiku | ~$0.0015 |
| **Strategise** | Sonnet | ~$0.012 |
| **Scrapbook** | Workers AI image + R2 (~$0) | ~$0.08 |

**AI per active user / month** ≈ 8×0.0135 + 12×0.0015 + 4×0.012 + 0.6×0.08 ≈ **$0.22** (of which Claude ~$0.17, scrapbook image ~$0.05).

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

## Where the money goes

- **AI is ~85% of cost** (Claude ~65%, scrapbook image ~18%). Everything else is a rounding error until 100k users.
- **Infra is almost free.** Cloudflare's no-egress R2 plus the Workers / Pages / D1 free tiers make the platform cost trivial. That is a deliberate stack choice, not luck.
- **Stripe's flat $0.30** makes an A$5 sub cost ~6% to process (vs the 2.9% headline). On 5,000 subs that is ~$1,500/mo of pure fixed fee. **An annual plan (A$50/yr) cuts the charge count 12×** and recovers most of it.
- **Supabase** is the only step-change (free → $25 Pro at 50k MAU → usage). Tiny next to AI.

## Margin levers (in order of impact)

1. **Conversion rate.** Cost/user is ~flat ($0.13); revenue is all conversion. 5% → 10% roughly doubles margin. The niche + founder-market-fit make >5% plausible.
2. **AI usage per user.** The cost driver. Tiered models (Haiku for cheap ops), the $25 cap, and the D1 telemetry already manage it; a heavy-user cohort is the cost risk to watch.
3. **Premium price / packaging.** A$5 is low. An annual plan (Stripe-fee saving) or a higher tier lifts revenue with no cost change.
4. **Scrapbook image.** The priciest op; already gated (free monthly, premium weekly). A cheaper model or tighter free cadence protects it at scale.

## The honest risks

- **Anthropic spend is the one unbounded line.** Capped at $25/mo in dev; production needs the cap lifted with real monitoring (the D1 `ai_calls` telemetry is built for this).
- **Free-tier abuse.** The AI routes are origin-gated + per-IP rate-limited, but a determined abuser is the tail risk on the AI bill.
- **FX.** Costs are USD, revenue is A$5; a weak AUD compresses margin.

**Bottom line:** a usage-priced cost base of ~$0.13/user that is ~85% AI, against ~$0.165/user of revenue at a deliberately conservative 5% conversion. It is profitable at every scale modelled, and the levers (conversion, packaging) push margin up without pushing cost up.
