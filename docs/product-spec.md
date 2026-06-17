# DoubleDone, Product Spec v1

*A calm, ADHD-friendly daily to-do app that makes today feel finite and achievable, and quietly remembers everything you actually got done.*

> Live at doubledone.app (registered, parked). Sibling in posture to Chronoloria, which is the grand, narrative, "turn your week into a story" version. DoubleDone is the deliberately un-grand one: get the dishes started, see what you did, feel okay.

---

## What it is, in one sentence

DoubleDone takes the things you have been avoiding, breaks them into pieces small enough to actually start, shows you only what today needs, and at the end shows you everything you finished so your brain cannot tell you that you did nothing.

The name: "done done," the phrase for actually-finished rather than kinda-finished. Spellable, celebratory, and the completion word is the dopamine word for this audience.

---

## The spine: today is finite and achievable

Every decision serves one emotional promise. The core failure mode for ADHD, OCD, and the chronically overwhelmed is opening a list of forty things and freezing. DoubleDone's whole job is to make today small, achievable, and visible, and to use AI to keep it that way when life pushes back.

The home screen is **Today**, sized to be doable. Everything else is plumbing in service of that.

---

## Who it is for

**Primary:** adults with ADHD, OCD, or chronic overwhelm who operate off a to-do list but drown in it. Task-initiation paralysis, time blindness, the wall of awful. The founder is one of these people and uses this daily. Founder-market fit is the strongest asset.

**Secondary:** developers and AI agents, via a public API and an MCP server (the AX/DX surface, deferred but architected for).

**Not for:**
- Neurotypical productivity optimisers (Motion, Todoist serve them well)
- Teams or project managers (the moment it has assignees and dependencies it is competing with Asana and has lost)
- Anyone wanting a habit-streak guilt machine

---

## The job to be done

> "I know what I need to do. I just cannot make myself start, and when I look at the whole list I feel worse, and at the end of the day my brain tells me I accomplished nothing even when I did a lot. Help."

Two implied promises: lower the stakes of starting, and provide evidence against the brain's lie that nothing got done.

---

## The core loop (the daily ritual)

1. **Open** in the morning, see Today, already sized to be achievable
2. **Brain-dump** anything rattling around (getting it out of your head is the relief)
3. **AI triages** the dump into today / later / needs-decomposing
4. **Work the day**, recurring tracker tasks sitting right there
5. **Stuck?** Bite the elephant (AI breaks the dreaded task into atomic, time-boxed steps and drops them into today)
6. **Drowning?** Strategise (AI re-spreads an over-full day, with reasoning about priority, energy, deadlines)
7. **Close the day** gently, what got done, what rolls forward, zero guilt for what did not

---

## Features, tiered

| Tier | Feature | Note |
|---|---|---|
| **1, build first** | Today view, brain-dump capture, AI hydration, Bite the Elephant, recurring daily tracker | The whole core loop. Nothing ships without these. |
| **2, soon after** | Strategise reshuffle, finished-old-task celebration, close-the-day wrap, the Lookback, gentle nudges | What makes it sticky rather than merely functional. |
| **3, defer** | Cross-device sync, calendar read, energy-level matching, public API, MCP server | Real, not day-one. Each gets a build trigger. |
| **4, skip** | Teams, assignees, dependencies, Gantt, social feed | Wrong product. |

---

## The Lookback (emotional core, not a stats page)

The single feature that does the most for this audience. ADHD brains discount past accomplishment, so the lived experience is constant low-grade failure even after a productive week. The Lookback shows "here is everything you actually finished this week, including the dreaded old things you finally closed." It is evidence against the brain's lie. It is the payoff that makes someone open the app again tomorrow.

It also grows into the moat (below): a week of history is nice, a year of history is switching cost.

---

## The moat (designed for, instrumented from day one)

Two loops.

**Per-user (switching cost):** the app learns your real patterns and accumulates your history. The longer you use it, the more it knows and the more painful to leave.

**Cross-user (the flywheel, the real moat):** every decomposition offered plus whether its steps actually got completed is a proprietary signal nobody else has. After enough users, "Bite the Elephant" is tuned on what decompositions genuinely get finished *by people who struggle to finish things*, and it improves for everyone as it scales. A funded competitor cannot buy that dataset, only earn it with a user base.

**What makes it legible as intelligence:** day-one instrumentation. We do not log "task done." We log the decomposition offered, which steps were done, in what order, what was abandoned, the user's stated context. That capture decision, made before there is a single user, is the artefact that proves to a hiring PM we design for defensibility. Document it explicitly in the case study.

**The privacy tension, resolved:** this audience distrusts data collection, rightly. The flywheel aggregates and anonymises, is opt-in and transparent, serves the user not an advertiser, and is never sold. Designing a data moat for a privacy-sensitive audience is itself the senior signal, and it extends the privacy-respecting thread from ParkProof and SubToll.

---

## Monetisation (native, not bolted on)

- **Free:** Today view, manual capture, basic recurring tasks, a few AI elephant-bites a month. Enough to prove it fits your brain, because this audience will not pay before they trust it.
- **Paid, roughly 6 to 9 AUD/month:** unlimited AI decomposition and hydration, Strategise, the full Lookback, the celebration and momentum system, alerts.
- **The honest paywall:** the AI features cost real tokens. You gate the thing that genuinely costs money, not an arbitrary wall. Reads as fair, which matters doubly for an audience sensitive to feeling exploited.

Subscription is native because the value is daily and ongoing, not one-shot. This is the thing SubToll could never manufacture and DoubleDone does not have to.

---

## The one design trap that kills products in this category

ADHD productivity tools have a graveyard, and they die the same way: the executive dysfunction the app treats is the same dysfunction that makes people stop opening it, so it becomes one more thing to maintain and they fall off by week three.

Two hard rules from this:

1. **Near-zero maintenance.** The app must open already knowing what today should be. Never add a setting when you could remove friction. The retention bar is "is an ADHD person still opening this in week six," and if that fails, features and monetisation are both moot.
2. **Never shame the backlog.** Celebrate the win of closing an old task lavishly, never punish the task for existing. "You finally did the thing you have been circling for three weeks" lands. "This task has been rotting for 34 days" destroys, especially for anyone with rejection-sensitive dysphoria. Same behavioural goal, opposite emotional valence. This is the line between understanding the audience and bolting ADHD onto a generic app.

---

## What it is not

- Not a project manager (no dependencies, assignees, Gantt)
- Not a team tool (single-user, or it is fighting Asana)
- Not a calendar replacement (it reads your day, it does not run your meetings)
- Not a habit tracker that shames (streaks break gently, never a guilt mechanic)
- Not grand or mythical (that is Chronoloria; DoubleDone is calm and grounded on purpose)

---

## Stack

- **Client:** React Native + Expo, one codebase to native Android (the daily-habit differentiator) and web (the demoable surface). Carried from Chronoloria.
- **Backend:** small AI service holding the Anthropic key, on Render. Never call Claude from the client.
- **Data + auth:** Supabase (Postgres + Auth + Row Level Security). Postgres suits the Lookback, delta, and flywheel queries; RLS gives privacy by architecture.
- **AI, tiered for cost:** Haiku for cheap frequent triage, Sonnet for decomposition and Strategise, Opus for the premium Lookback narrative moments.
- **Local-first, anonymous-first:** every feature works without an account; cloud is opt-in durability.
- **Harness:** the golden-path playbook. Tier 0 to start (single main, Inspector + gitleaks + CI badge, risk-targeted tests, telemetry before traffic, cost alarm, journal from day one).

---

## Success criteria for the portfolio piece

In rough priority order:

1. The core loop works end to end: brain-dump, AI triage, Bite the Elephant into today, check off, close the day.
2. The Lookback renders a real week of completed work, including aged tasks, and feels good.
3. Day-one instrumentation is in place: completion outcomes for decompositions are captured from the first commit, even before there is data to use.
4. The case study walks through the spine, the moat (with the instrumentation decision), and the never-shame design call, so a hiring PM sees retention thinking, defensibility thinking, and audience empathy.
5. The freemium-to-paid flow works in Stripe test mode.
6. Live on doubledone.app, demoable web plus an installable Android build.
7. AI cost stays sane via the tiering, under a set monthly budget alarm.

---

## Open questions (decide in the first sprint)

- Visual identity. Calm, low-friction, not grand. Likely soft and warm, the opposite of Chronoloria's epic palette.
- How much of the Lookback ships in v1 versus Tier 2.
- Whether the brain-dump is text-first or also voice (voice suits ADHD capture, adds scope).
- The exact celebration mechanic for closing aged tasks (the reward shape that motivates without ever shaming).

---

*Opinionated on purpose. Argue with it in the decision-log.*
