# DoubleDone, Build Plan

*The operational doc. Where we are, what is next, in what order. If you are a fresh session, read this after CLAUDE.md and you know exactly where to start.*

---

## Current state (as of 2026-06-17)

Client scaffolded. The folder of docs is now a running app.

- ✅ golden-path harness cloned, remote detached, Inspector activated (`core.hooksPath .githooks`)
- ✅ Trimmed to solo Tier 0 (removed CONTRIBUTING, PR template, issue templates)
- ✅ `docs/product-spec.md`, `CLAUDE.md`, `decision-log.md` written
- ✅ Domain `doubledone.app` registered (Cloudflare, WHOIS redacted, auto-renew on)
- ✅ **`client/` scaffolded**, Expo SDK 56 (React Native 0.85, expo-router, `src/app`), stripped to a calm Today shell, builds clean for web (`expo export`, 780 modules)
- ✅ Repo is an **npm-workspaces monorepo**: a thin root `package.json` delegates the gates into `client/`; Inspector + CI run from root
- ✅ Gates green locally: `typecheck` (tsc) · `lint` (expo lint) · `test` (vitest, 15 cases over `lib/day` + `lib/telemetry`) · secret-scan
- ✅ Telemetry contract live: `[doubledone.*]` via `client/src/lib/telemetry.ts`, wired at the Today toggle (telemetry before traffic)
- ⬜ No `server/` or `supabase/` yet (steps 4 and 12 below)
- ✅ GitHub remote live and **public**: github.com/melroyds/doubledone, `main` pushed, CI wired

## The immediate next action

**Local store + brain-dump (steps 2-3).** The Today shell already has a one-line add, but tasks live in memory and vanish on reload. Next: an on-device store (anonymous-first) so Today persists across reloads, then grow the single-line add into the friction-free multi-line brain-dump that AI triage reads. Land the store's risk test (quota / eviction) in the same commit.

---

## Day-0 checklist (from PLAYBOOK.md)

```
[x] Repo created from harness · MIT LICENSE · README present
[x] Inspector activated (git config core.hooksPath .githooks)
[x] .env.example committed; real .env gitignored
[~] CI live on GitHub (lint · typecheck · test · secret-scan); secret-scan hardened for the initial-push edge case
[x] gitleaks installed locally (v8.30), secret-scan backstop active
[x] Telemetry log prefix decided: [doubledone.*] via client/src/lib/telemetry.ts; first events task.added / task.toggled / day.cleared
[~] Risk list started: date math (lib/day) + telemetry contract (lib/telemetry) tested; still to add local-store/quota, AI request contract, decomposition parser as those features land
[ ] Cost alarm before any traffic (Anthropic spend cap + budget alert), due before the AI backend (step 4)
[x] Decision-log started the same day
```

---

## Tier 1 build sequence (the core loop)

Build in this order. Each step is shippable and demoable on its own.

1. ✅ **Expo client scaffold** + Today view shell (web target first, the demoable surface). *Done 2026-06-17.*
2. **Brain-dump capture**, the friction-free "get it out of your head" input
3. **Local store** (anonymous-first, on-device) for tasks + the Today view reading from it
4. **AI backend** on Render holding the Anthropic key, with the request-contract test (mock SDK, assert shape) from the start
5. **Bite the Elephant**, Sonnet decomposition of a stuck task into atomic time-boxed steps, dropped into Today. The killer acquisition moment. Instrument completion outcomes from this first AI feature (the moat starts here).
6. **AI triage / hydration**, sort the brain-dump into today / later / decompose (Haiku, cheap)
7. **Recurring daily tracker**, the repeating-tasks subsection

## Tier 2 (what makes it sticky)

8. **The Lookback**, everything finished this week, including aged tasks. The emotional payoff.
9. **Finished-old-task celebration**, reward closing the dreaded, never shame the backlog
10. **Close-the-day wrap**, gentle, rolls forward, zero guilt
11. **Strategise**, Sonnet re-spreads an over-full day
12. **Supabase auth + sync**, opt-in cloud durability, RLS for privacy
13. **Gentle nudges / notifications**, native, the retention lever

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
