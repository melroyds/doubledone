# DoubleDone, Build Plan

*The operational doc. Where we are, what is next, in what order. If you are a fresh session, read this after CLAUDE.md and you know exactly where to start.*

---

## Current state (as of 2026-06-17)

Capture loop working and shipped to both surfaces: web live at doubledone.app, Android installable via EAS.

- ✅ golden-path harness cloned, remote detached, Inspector activated (`core.hooksPath .githooks`)
- ✅ Trimmed to solo Tier 0 (removed CONTRIBUTING, PR template, issue templates)
- ✅ `docs/product-spec.md`, `CLAUDE.md`, `decision-log.md` written
- ✅ Domain `doubledone.app` registered (Cloudflare, WHOIS redacted, auto-renew on)
- ✅ **`client/` scaffolded**, Expo SDK 56 (React Native 0.85, expo-router, `src/app`), stripped to a calm Today shell, builds clean for web (`expo export`, 780 modules)
- ✅ Repo is an **npm-workspaces monorepo**: a thin root `package.json` delegates the gates into `client/`; Inspector + CI run from root
- ✅ Gates green locally: `typecheck` (tsc) · `lint` (expo lint) · `test` (vitest, 15 cases over `lib/day` + `lib/telemetry`) · secret-scan
- ✅ Telemetry contract live: `[doubledone.*]` via `client/src/lib/telemetry.ts`, wired at the Today toggle (telemetry before traffic)
- ✅ **Today persists** on-device (AsyncStorage) and **brain-dump capture** is live: type many lines, each becomes a task (steps 2-3 done; store parse/recovery tested in `lib/tasks`)
- ✅ **Shipped to both surfaces:** web live at [doubledone.app](https://doubledone.app) (Cloudflare Pages), Android APK installable via EAS (sideload). One codebase, two targets.
- ⬜ No `server/` or `supabase/` yet (steps 4 and 12 below)
- ✅ GitHub remote live and **public**: github.com/melroyds/doubledone, `main` pushed, CI wired

## The immediate next action

**AI backend (step 4).** Stand up the small Render service that holds the Anthropic key (never called from the client), with the request-contract test (mock the SDK, assert the request shape) from the first commit. Set the Anthropic spend cap and a budget alert before any traffic. This unlocks Bite the Elephant (step 5), where the completion-outcome instrumentation for the moat begins in earnest.

---

## Day-0 checklist (from PLAYBOOK.md)

```
[x] Repo created from harness · MIT LICENSE · README present
[x] Inspector activated (git config core.hooksPath .githooks)
[x] .env.example committed; real .env gitignored
[~] CI live on GitHub (lint · typecheck · test · secret-scan); secret-scan hardened for the initial-push edge case
[x] gitleaks installed locally (v8.30), secret-scan backstop active
[x] Telemetry log prefix decided: [doubledone.*] via client/src/lib/telemetry.ts; first events task.added / task.toggled / day.cleared
[~] Risk list growing: date math (lib/day), telemetry contract (lib/telemetry), store parse/recovery (lib/tasks) tested; AI request contract + decomposition parser still to add
[ ] Cost alarm before any traffic (Anthropic spend cap + budget alert), due before the AI backend (step 4)
[x] Decision-log started the same day
```

---

## Tier 1 build sequence (the core loop)

Build in this order. Each step is shippable and demoable on its own.

1. ✅ **Expo client scaffold** + Today view shell (web target first, the demoable surface). *Done 2026-06-17.*
2. ✅ **Brain-dump capture**, the friction-free "get it out of your head" input. *Done 2026-06-17.*
3. ✅ **Local store** (anonymous-first, on-device) for tasks + the Today view reading from it. *Done 2026-06-17.*
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

## Backlog (deferred work, with triggers)

The single home for everything we have consciously parked. Nothing here is dropped. Each item has a trigger for when it earns a place in the sequence above. When we defer something in a session, it lands here.

**Sync, beyond v1** (v1 is tasks-only, step 12)
- Live / realtime updates (changes appear on the other device without a refresh). Trigger: v1 sync is stable and the refresh delay actually annoys you.
- Google one-tap sign-in alongside the email code. Trigger: sign-in friction shows up, or real users ask.
- Clickable email magic-link on web, in addition to the typed code. Trigger: you want one-tap web sign-in and the deep-linking is set up.
- Sharing a list with another person. Trigger: a real second-user case (caution: this edges toward the team-tool trap the spec warns against, weigh hard).
- Syncing the cross-user completion data (the moat flywheel) to its own anonymised store. Trigger: enough users that the aggregate is worth mining, pairs with the AI features.

**AI, beyond the core**
- Energy-level matching (suggest tasks that fit your current energy). Trigger: Bite the Elephant and triage are solid and you want smarter sequencing.
- Calendar read (see the day's meetings to size Today). Trigger: core loop sticky and time-blindness needs calendar context.

**Platform and distribution**
- Play Store release, versus the current sideloaded APK. Trigger: polished enough to show publicly and you want auto-updates plus the store-listing portfolio signal (~$25 one-off plus review).
- Over-the-air updates (refresh the installed app with no reinstall). Trigger: reinstalling for each change gets old.
- A real transactional email provider for sign-in mail, versus Supabase's shared sender. Trigger: real users, or test mail landing in spam.

**Developer surface (AX / DX)**
- Public REST API plus OpenAPI spec. Trigger: a reason for outside integrations, or the portfolio wants the DX story.
- MCP server (let AI agents drive DoubleDone). Trigger: same.

**Monetisation**
- Paid tier via Stripe, gating the genuinely expensive AI features. Trigger: the AI features prove their value and you are ready to charge.

**Polish and tech debt**
- Custom DoubleDone app icon and splash (currently the generic Expo art). Trigger: visual identity decided.
- Delete-a-task gesture (today you can complete but not remove). Trigger: soon, it is a basic gap, promote to the sequence when sync or close-the-day lands.
- Investigate the expo-router "multiple renderers" dev warning. Trigger: before launch, or if it ever surfaces in production.
- Tier-1 CI hardening: a coverage floor and a build job (PLAYBOOK). Trigger: real users, when silent regressions start costing people.

---

## The non-negotiables (carry into every session)

- **Today is finite and achievable** is the spine. The home is Today, sized to be doable.
- **Never shame the backlog.** Celebrate closing old tasks, never punish their existence.
- **Near-zero maintenance.** Remove friction, never add a setting. The retention bar is week six.
- **Instrument completion outcomes from the first AI feature.** Telemetry before traffic. The moat depends on it.
- **Solo, direct to main, Claude handles git. Never `--no-verify`.**

Full what/why in `docs/product-spec.md`. Full why-trail in `decision-log.md`. The discipline in `PLAYBOOK.md`.
