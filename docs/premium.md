# DoubleDone, Premium

*The monetisation strategy and the prioritised premium roadmap: where the wall between free and paid sits, and why. Prioritised across four panels (willingness-to-pay, RICE, spine-and-trust, and hiring-PM signal) with an adversarial review. The principle underneath everything: monetise abundance and delight, never cripple the free tier, and never gate the user at the moment they need relief.*

---

## The thesis

DoubleDone is free to use, completely: the whole daily loop, all the AI relief, and the Lookback that proves you did something, with no account and fully offline. Premium is **additive**, more of what you love, never the difference between a working app and a broken one. For a rejection-sensitive audience a gutted free tier reads as bait-and-switch and churns before it converts. The strongest signal here is not what we charge for, it is what we refuse to gate.

---

## The wall

**Free forever** (the complete, never-shamed daily loop):
- Capture (typed, spoken, and AI-tidy), Today and the daily loop, Break-it-down\*, Strategise (shown in the app as Lighten today), Sort-for-me, Make-it-tiny
- The Lookback: the calendar, your completion history, and the warm celebration
- Cross-device sync and account, full offline use, data export
- The ADHD seam: Done-is-done / Good-enough, the low-capacity day, Routines, shame-free re-entry, gentle reminders
- The **Quiet interface**: a borderless appearance where nothing shouts, same layout, same features *(shipped 2026-07-10 as Premium, made free 2026-09-27: for this audience a calmer screen is an access need, the same reason theme, text size and motion are free)*
- The public REST API and the MCP server

> \*Break-it-down has **no free cap**, and none is planned. This page used to carry "about 10 breakdowns a month" as policy, but no meter, copy or Terms ever said so, and on 2026-07-25 the claim was deleted rather than built (see `decision-log.md`). Scripted abuse is held off by the Worker's origin gate, per-IP rate limit and body cap. The only free AI meter is energy matching's 15 picks a month.

**Premium (A$5 / month, or A$50 / year on the web, while the App Store and Google Play show their own local price)** (abundance, power, and optional polish. The shipped items below match the live paywall as of 1.8.0, October 2026, and the held and later ones are not on it):
- The **AI Scrapbook**: a weekly keepsake image, scaling 1 to 2 to 4 a week by tenure; free keeps a monthly taste *(shipped)*
- **OCR photo capture** ("Scan" on the paywall): photograph a post-it or a printed list, Claude vision turns it into tasks *(shipped)*
- **Prioritise / pin a task** *(shipped)*
- **Richer Lookback insights** ("Your patterns"): stats and an optional AI weekly summary, layered on top of the free calendar, never replacing it *(shipped)*
- **AI "chart a course"** (goal planning) and **AI sequencing** ("Plan my day") *(shipped)*
- **Energy matching without limits**: "What fits right now?" inside Focus mode; free gets 15 picks a calendar month with calm reminders at 10 and 5 left, premium is unmetered *(shipped 2026-07-11)*
- **Custom colour themes**: seven calm palettes, Dusk free for everyone, the other six premium *(shipped 2026-06-27)*
- **Unlimited AI** *(held, see the roadmap. Today there is no free AI cap for it to lift, apart from energy matching)*
- Later and guarded: **colour categories**, **task notes**, **two-way calendar sync**

**Never gated, on principle:**
- **Data export.** Privacy is non-negotiable; gating it reads as holding your own data hostage.
- **The public API and MCP.** The developer moat grows by adoption, not by a toll, and the REST API and MCP server are at parity on one shared engine. The premium AI features (Chart a course, sequencing) are not exposed over the developer surface, so there is no paid tier to gate there.
- **The relief moments.** Sort-for-me, Break-it-down, and Close-the-day are always free. The paywall sits at the moment of *abundance*, never the moment of friction.

**Deliberately not built** (the spine protects these): multiple projects or workspaces (it turns Today into an everything-bucket), streaks or points, tags or folders, social by default, variable rewards, and any AI that silently reorganises.

---

## The roadmap, stack-ranked

The AI Scrapbook is the model every gate is held to: monetise the genuinely expensive thing (image generation), keep a free monthly taste, and scale by loyalty (tenure), never by a streak.

**Tier 1, ship first** (additive delight, nothing removed from free):
1. **AI Scrapbook**, shipped, keep iterating. The flagship.
2. **The premium feature flag**, shipped. The gate every paid feature reads, with a dev override to test premium and free locally without a subscription. The foundation everything below sits on, and all three premium surfaces (Settings, Lookback's scrapbook gate, the Premium screen) read it.
3. **Prioritise / pin a task**, built. One pin (the day's "one thing"), a calm mauve star that floats it to the top of Today, premium-gated to set, and Focus opens straight to it. Client-only, zero server cost, the lowest-risk validator of the flag-to-UI loop. Gated to one-off tasks (recurring keeps its own cadence).
4. **A server-side premium guard**, built. A reusable `requirePremium` on the Worker that cryptographically verifies the Supabase JWT (jose JWKS, the project's ES256 keys), reads the D1 entitlement, and returns 401 / 403 / 503, fail-closed. The money-gate primitive, now in front of `/ocr`, `/lookback-summary`, `/chart` and `/sequence`. Decided against gating the free-tier, anonymous-first scrapbook.
5. **OCR photo capture**, SHIPPED. Photograph a post-it or printed list, and Claude vision turns it into tasks. Melroy's original ask and the headline. A `/ocr` Worker route behind requirePremium (Haiku vision, the image never stored), plus an in-app camera on the brain-dump box with a gallery option. Verified on web first, then rode the production Android builds; it leads the paywall as "Scan".

**Tier 2, power and expansion** (6, 8 and 9's sequencing LIVE 2026-06-26, 9's energy matching followed 2026-07-11, 7 HELD for a product decision):
6. **Richer Lookback insights**, BUILT. A premium "Your patterns" card of calm client-side stats plus an optional warm AI weekly reflection (`/lookback-summary`, Sonnet, behind requirePremium), layered below the always-free calendar. Shame-risky metrics (streaks, percent, scores, missed days) deliberately rejected. Melroy to eyeball a few real summaries before a subscriber sees one.
7. **Unlimited AI**, HELD for Melroy. The spine guardian's call: building the free-tier cap overnight would bake an irreversible D1 schema plus a flag around an unanswered product question (which routes are abundance vs relief, and is there even enough non-relief AI to gate), for zero user-visible value. Pre-decide the metered routes and the allowance number with real usage data first; if anything ships, only the reversible pseudonymous would-block demand-logging. Energy matching (item 9) shipped its own meter without prejudging this: a local calendar-month count on the device (the scrapbook precedent), no D1 schema, fully reversible, so the held question stays open and unforced.
8. **AI "chart a course"**, BUILT. A `/chart` Sonnet route turns a goal into a calm ordered list of next steps, accepted as FLAT one-off tasks into the single Today/backlog (never a project). Gated at the moment of asking. Optional target-date pacing is a fast-follow.
9. **AI sequencing / energy matching**, SHIPPED in full. "Plan my day" proposes a calm in-place order for today's tasks via `/sequence`, accepted via a render-time, local-only `manualOrder` (per-device order is arguably a feature; the cross-device follow-up stays in the Backlog). The energy chooser followed 2026-07-11, moving inside Focus mode's "Which one?" picker on 2026-07-12 after device testing: one calm question (Running low / Somewhere in between / Feeling good), Haiku picks ONE task via `/energy` with a short warm line, propose-only. Freemium on Melroy's call: 15 free picks a calendar month, metered locally like the scrapbook gate (no server bookkeeping, no account needed), reminders exactly at 10 and 5 left, a use spent only on a successful pick, and past 15 the tap routes to the paywall with no AI call made. At roughly USD 0.002 a call the meter is conversion psychology, not cost control, and that is the right reason.

**Tier 3, personalisation, guarded** (two shipped, one of them since made free, two still later):
10. **Custom themes**, SHIPPED 2026-06-27. Seven calm full palettes (Dusk the free default, plus Sage, Slate, Heather, Fog, Honey and Rose as premium), each with a tuned light and dark variant, WCAG-verified, one optional selector and never a WYSIWYG editor.
11. **The Quiet interface**, SHIPPED 2026-07-10, **made free 2026-09-27** (grew out of this tier's instinct, not on the original list). Premium until Melroy's call on 2026-09-27, now an appearance option for everyone that strips decorative chrome so the app reads as calm text on paper: same layout, same features, same warmth, covering the whole Today surface plus the Settings toggle. The transient overlays and the other screens deliberately stay standard, the discipline of stopping. Why it left Premium: a calmer, less cluttered screen is an access need for this audience rather than polish, and the write-time-only gate had a trap in it (a subscriber whose Premium or trial ended while on Quiet could not tap back to Standard, because every tap bounced to the paywall, and on Android that paywall then sold nothing). Colour themes stay Premium, since Dusk is always free and no one can get stuck in a theme.
12. **Colour categories** (strict guard-rails, a quiet cue not a tagging system; requires a written decision-log entry on why it will not feed organising-as-avoidance before it ships).
13. **Task notes** (ruthlessly minimal: text plus one voice memo, never a notes CRUD that spirals into mini-projects).
14. **Two-way calendar sync** (OAuth-heavy, high support, the latest).

**Engineering, deferred with triggers** (the gating plumbing, parked but not lost, from the multi-agent review of the feature flag):
- **A server-side `requirePremium` guard**, BUILT (server/src/premium.ts). Cryptographic JWT verification via jose JWKS against the project's ES256 keys, a fail-closed money gate, unit-tested in `server/src/premium.test.ts`. It also closed the pre-existing decode-and-trust gap (the JWT signature is now verified on the entitlement path). Now called by `/ocr`, `/lookback-summary`, `/chart` and `/sequence`.
- **Gate `/scrapbook` with `requirePremium`**, deferred. Today the scrapbook's image is free-tier Workers AI (its scene is one small Claude Haiku call) and the route is anonymous-first, so gating it would break the free monthly keepsake and guard very little money. Trigger: scrapbook moves to a paid image model, OR the D1 telemetry shows abuse.
- **The per-user AI usage counter** (for Unlimited AI's cap) lives server-side in a user-keyed store, NOT the pseudonymous `ai_calls` log, to preserve the moat's no-user-id property; a new pure `canUseAi()` mirrors `canMakeScrapbook`. Trigger: when Unlimited AI is picked up.
- **A tiny `gateToPremium(feature, reason)` helper** (log the gate-hit with a consistent payload, then route to /premium), so the moat's gate-hit signal stays consistent. Not a heavyweight `<PremiumGate>`. Trigger: the second gated surface lands (pin or OCR).
- **A CI grep** asserting the exported web bundle contains no `EXPO_PUBLIC_PREMIUM_DEV`, so an env-wiring mistake fails the build instead of shipping a live dev toggle. Trigger: cheap, do with the server guard.

**Hold or reject:**
- **Multiple projects / workspaces, REJECT** (spine veto, it would turn Today into an everything-bucket). If the need is real, solve with free "custom lists" that live outside Today, never a Today meta-choice.
- **Advanced breakdown customisation, hold.** Solve "I want 3 steps" with a smarter prompt, not sliders that feed analysis paralysis.
- **Sync conflict-resolution UI, hold.** Rare; single-device is the norm.

---

## The model

A **A$5 / month** subscription, with an **A$50 / year** annual plan beside it. The value is daily and ongoing and the AI carries a real per-call cost, so a subscription maps to both where a one-off would not. The price is deliberately low: a cost-sensitive, RSD-prone audience means a high price amplifies churn-by-guilt, so the funnel stays wide. No ads, and we never sell data (the moat is aggregate, anonymised completion data).

Unit economics are healthy: roughly 13 US cents to serve a user a month (about 85% of it AI), a premium user pays around 25 times their cost to serve, and it is profitable near a 5% conversion rate with a flat cost curve (cost per user does not climb with conversion). Two of the planned levers shipped 2026-06-27: the **annual plan (A$50 / year**, about two months free), which recovers most of Stripe's flat per-charge fee, and a **card-free one-month trial** (server-granted, once per account, no checkout up front). Possibly later: a higher power-user tier. A separate "developer premium" only if API volume ever justifies it; the v1 API stays free.

---

## How this was prioritised

Four panels scored every candidate gate: willingness-to-pay, RICE, spine-and-trust, and hiring-PM signal. An adversarial review then caught the trap the raw ranking fell into: a tight free AI quota and a gated Lookback narrative both scored well on conversion, but both would gate the user at the exact moment of relief, which is fatal for this audience. The fix (a generous free allowance, the Lookback core always free, and the punitive items reordered down) is what makes the wall coherent. Premium unlocks more of what you love, never what you need.
