# DoubleDone, Premium

*The monetisation strategy and the prioritised premium roadmap: where the wall between free and paid sits, and why. Prioritised across four panels (willingness-to-pay, RICE, spine-and-trust, and hiring-PM signal) with an adversarial review. The principle underneath everything: monetise abundance and delight, never cripple the free tier, and never gate the user at the moment they need relief.*

---

## The thesis

DoubleDone is free to use, completely: the whole daily loop, all the AI relief, and the Lookback that proves you did something, with no account and fully offline. Premium is **additive**, more of what you love, never the difference between a working app and a broken one. For a rejection-sensitive audience a gutted free tier reads as bait-and-switch and churns before it converts. The strongest signal here is not what we charge for, it is what we refuse to gate.

---

## The wall

**Free forever** (the complete, never-shamed daily loop):
- Capture (typed, spoken, and AI-tidy), Today and the daily loop, Break-it-down\*, Strategise, Sort-for-me, Make-it-tiny
- The Lookback: the calendar, your completion history, and the warm celebration
- Cross-device sync and account, full offline use, data export
- The ADHD seam: Done-is-done / Good-enough, the low-capacity day, Routines, shame-free re-entry, gentle reminders
- The public REST API and the MCP server

> \*The AI features carry a **generous** free allowance (about 10 breakdowns a month, enough to feel unlimited in normal use). Premium lifts the cap. The allowance is deliberately never tight enough to bite on a crisis day, because that would gate the relief, which the spine forbids.

**Premium (A$5 / month)** (abundance, power, and optional polish):
- The **AI Scrapbook**: a weekly keepsake image, scaling 1 to 2 to 4 a week by tenure; free keeps a monthly taste *(shipped)*
- **Unlimited AI**, beyond the free allowance
- **OCR photo capture**: photograph a post-it or a printed list, Claude vision turns it into tasks
- **Prioritise / pin a task**
- **Richer Lookback insights**: stats and an optional AI weekly summary, layered on top of the free calendar, never replacing it
- **AI "chart a course"** (goal planning) and **AI sequencing / energy matching**
- Later and guarded: **colour categories**, **task notes**, **custom themes**, **two-way calendar sync**

**Never gated, on principle:**
- **Data export.** Privacy is non-negotiable; gating it reads as holding your own data hostage.
- **The public API and MCP.** The developer moat grows by adoption, not by a toll.
- **The relief moments.** Sort-for-me, Break-it-down, and Close-the-day are always free. The paywall sits at the moment of *abundance*, never the moment of friction.

**Deliberately not built** (the spine protects these): multiple projects or workspaces (it turns Today into an everything-bucket), streaks or points, tags or folders, social by default, variable rewards, and any AI that silently reorganises.

---

## The roadmap, stack-ranked

The AI Scrapbook is the model every gate is held to: monetise the genuinely expensive thing (image generation), keep a free monthly taste, and scale by loyalty (tenure), never by a streak.

**Tier 1, ship first** (additive delight, nothing removed from free):
1. **AI Scrapbook**, shipped, keep iterating. The flagship.
2. **The premium feature flag**, shipped. The gate every paid feature reads, with a dev override to test premium and free locally without a subscription. The foundation everything below sits on, and all three premium surfaces (Settings, Lookback's scrapbook gate, the Premium screen) read it.
3. **Prioritise / pin a task** (~8h, client-only). Visual only, free users lose nothing, and it lets them feel the premium polish. The lowest-risk validator of the flag-to-UI loop, so it comes first.
4. **A server-side premium guard** (small, built BEFORE OCR). A reusable `requirePremium` on the Worker (bearer sub to the D1 entitlement to a 402). No AI route enforces entitlement today, which is fine while the gated things are free (scrapbook) or zero-cost (pin), but OCR is the first gate that spends real Anthropic money, so a client-only gate would be a free-money hole. Retro-hardens the scrapbook too.
5. **OCR photo capture** (~40h). Photograph a post-it or printed list, and Claude vision turns it into tasks. Melroy's original ask and the headline. Camera plus a new vision endpoint, so device-tested, and it sits on the guard from step 4.

**Tier 2, power and expansion:**
6. **Richer Lookback insights** (a stats and summary layer on top of the always-free calendar). Promoted ahead of Unlimited AI: pure abundance, zero proximity to the relief boundary, and it sells "more of what you love" in a single screenshot.
7. **Unlimited AI** (generous free allowance, unlimited for premium). Held just below Lookback insights: its cap sits nearest the relief boundary (the spine's danger zone), so deferring it protects the spine and buys real usage data to set the free allowance honestly.
8. **AI "chart a course"** (goal planning, token-heavy by design).
9. **AI sequencing / energy matching** (propose-then-accept daily ordering).

**Tier 3, personalisation, guarded and later:**
10. **Custom themes** (calm presets, not a WYSIWYG editor).
11. **Colour categories** (strict guard-rails, a quiet cue not a tagging system; requires a written decision-log entry on why it will not feed organising-as-avoidance before it ships).
12. **Task notes** (ruthlessly minimal: text plus one voice memo, never a notes CRUD that spirals into mini-projects).
13. **Two-way calendar sync** (OAuth-heavy, high support, the latest).

**Engineering, deferred with triggers** (the gating plumbing, parked but not lost, from the multi-agent review of the feature flag):
- **A server-side `requirePremium` guard** (the Tier-1 step 4 above): no Worker route checks entitlement today, so build it before OCR. Trigger: the start of the OCR build, at the latest.
- **Verify the Supabase JWT signature** before any endpoint authorises spend off the decoded `sub` (the entitlement read trusts the `sub` today, which is safe for the RLS-forwarded MCP path but load-bearing once a costed route gates on it). Trigger: with the server guard, before OCR.
- **The per-user AI usage counter** (for Unlimited AI's cap) lives server-side in a user-keyed store, NOT the pseudonymous `ai_calls` log, to preserve the moat's no-user-id property; a new pure `canUseAi()` mirrors `canMakeScrapbook`. Trigger: when Unlimited AI is picked up.
- **A tiny `gateToPremium(feature, reason)` helper** (log the gate-hit with a consistent payload, then route to /premium), so the moat's gate-hit signal stays consistent. Not a heavyweight `<PremiumGate>`. Trigger: the second gated surface lands (pin or OCR).
- **A CI grep** asserting the exported web bundle contains no `EXPO_PUBLIC_PREMIUM_DEV`, so an env-wiring mistake fails the build instead of shipping a live dev toggle. Trigger: cheap, do with the server guard.

**Hold or reject:**
- **Multiple projects / workspaces, REJECT** (spine veto, it would turn Today into an everything-bucket). If the need is real, solve with free "custom lists" that live outside Today, never a Today meta-choice.
- **Advanced breakdown customisation, hold.** Solve "I want 3 steps" with a smarter prompt, not sliders that feed analysis paralysis.
- **Sync conflict-resolution UI, hold.** Rare; single-device is the norm.

---

## The model

A **A$5 / month** subscription. The value is daily and ongoing and the AI carries a real per-call cost, so a subscription maps to both where a one-off would not. The price is deliberately low: a cost-sensitive, RSD-prone audience means a high price amplifies churn-by-guilt, so the funnel stays wide. No ads, and we never sell data (the moat is aggregate, anonymised completion data).

Unit economics are healthy: roughly 13 US cents to serve a user a month (about 85% of it AI), a premium user pays around 25 times their cost to serve, and it is profitable near a 5% conversion rate with a flat cost curve (cost per user does not climb with conversion). Post-launch levers: an **annual plan (A$50/yr)** that recovers most of Stripe's flat per-charge fee, and possibly a higher power-user tier. A separate "developer premium" only if API volume ever justifies it; the v1 API stays free.

---

## How this was prioritised

Four panels scored every candidate gate: willingness-to-pay, RICE, spine-and-trust, and hiring-PM signal. An adversarial review then caught the trap the raw ranking fell into: a tight free AI quota and a gated Lookback narrative both scored well on conversion, but both would gate the user at the exact moment of relief, which is fatal for this audience. The fix (a generous free allowance, the Lookback core always free, and the punitive items reordered down) is what makes the wall coherent. Premium unlocks more of what you love, never what you need.
