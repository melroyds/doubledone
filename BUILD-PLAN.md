# DoubleDone — Build Plan

*The operational doc. Where we are, what is next, in what order. If you are a fresh session, read this after CLAUDE.md and you know exactly where to start.*

---

## Current state (as of 2026-06-17)

Foundation only. No app code scaffolded yet.

- ✅ golden-path harness cloned, golden-path remote detached, Inspector activated (`core.hooksPath .githooks`)
- ✅ Trimmed to solo Tier 0 (removed CONTRIBUTING, PR template, issue templates)
- ✅ `docs/product-spec.md`, `CLAUDE.md`, `decision-log.md` written
- ✅ Domain `doubledone.app` registered (Cloudflare, WHOIS redacted, auto-renew on)
- ⬜ No `client/`, `server/`, or `supabase/` yet
- ⬜ No GitHub remote yet (will be private at creation)
- ⬜ No first commit of app code yet

## The immediate next action

**Scaffold the Expo client.** `npx create-expo-app@latest client` (TypeScript), get it running on web, drop in the Today-view shell. That is the step that turns this folder of docs into a running app. Everything below sequences from there.

---

## Day-0 checklist (from PLAYBOOK.md)

```
[x] Repo created from harness · MIT LICENSE · README present
[x] Inspector activated (git config core.hooksPath .githooks)
[x] .env.example committed; real .env gitignored
[~] CI workflow present and green-on-empty — lights up once package.json exists
[ ] gitleaks installed locally (optional; CI runs it regardless)
[ ] Telemetry log prefix decided: use [doubledone.*] — decide the exact events before the first feature
[ ] Risk list: the 5-6 surfaces that hurt users → one test file each (likely: date/recurrence math, AI request contract, local-store/quota, the decomposition parser)
[ ] Cost alarm before any traffic (Anthropic spend cap + a budget alert)
[x] Decision-log started the same day
```

---

## Tier 1 build sequence (the core loop)

Build in this order. Each step is shippable and demoable on its own.

1. **Expo client scaffold** + Today view shell (web target first, the demoable surface)
2. **Brain-dump capture** — the friction-free "get it out of your head" input
3. **Local store** (anonymous-first, on-device) for tasks + the Today view reading from it
4. **AI backend** on Render holding the Anthropic key, with the request-contract test (mock SDK, assert shape) from the start
5. **Bite the Elephant** — Sonnet decomposition of a stuck task into atomic time-boxed steps, dropped into Today. The killer acquisition moment. Instrument completion outcomes from this first AI feature (the moat starts here).
6. **AI triage / hydration** — sort the brain-dump into today / later / decompose (Haiku, cheap)
7. **Recurring daily tracker** — the repeating-tasks subsection

## Tier 2 (what makes it sticky)

8. **The Lookback** — everything finished this week, including aged tasks. The emotional payoff.
9. **Finished-old-task celebration** — reward closing the dreaded, never shame the backlog
10. **Close-the-day wrap** — gentle, rolls forward, zero guilt
11. **Strategise** — Sonnet re-spreads an over-full day
12. **Supabase auth + sync** — opt-in cloud durability, RLS for privacy
13. **Gentle nudges / notifications** — native, the retention lever

## Deferred (Tier 3, with triggers)

Public REST API + OpenAPI, MCP server, calendar read, energy-level matching, the paid tier (Stripe), native Android build + Play Store. Each waits for a real trigger, not day one.

---

## The non-negotiables (carry into every session)

- **Today is finite and achievable** is the spine. The home is Today, sized to be doable.
- **Never shame the backlog.** Celebrate closing old tasks, never punish their existence.
- **Near-zero maintenance.** Remove friction, never add a setting. The retention bar is week six.
- **Instrument completion outcomes from the first AI feature.** Telemetry before traffic. The moat depends on it.
- **Solo, direct to main, Claude handles git. Never `--no-verify`.**

Full what/why in `docs/product-spec.md`. Full why-trail in `decision-log.md`. The discipline in `PLAYBOOK.md`.
