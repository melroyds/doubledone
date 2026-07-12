# DoubleDone, Product Spec v1

*A calm, ADHD-friendly daily to-do app that makes today feel finite and achievable, and quietly remembers everything you actually got done.*

> Live at doubledone.app, web and an installable Android app from one codebase, with real Stripe subscribers since 2026-06-26. Sibling in posture to Chronoloria, which is the grand, narrative, "turn your week into a story" version. DoubleDone is the deliberately un-grand one: get the dishes started, see what you did, feel okay.

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

**Primary:** adults with ADHD, autism, the AuDHD overlap, OCD, or chronic overwhelm who operate off a to-do list but drown in it. Task-initiation paralysis, time blindness, the wall of awful. The founder built this for the people he works with, has managed, and is close to who are these people. That proximity, not a personal diagnosis, is the strongest asset.

**Why AuDHD especially.** The autism-plus-ADHD overlap is underserved and a sharp fit. Autism pulls toward routine, predictability, low sensory load, and no surprises. ADHD pulls toward low friction and externalised memory. DoubleDone's calm, near-zero-maintenance, never-shame, no-new-settings spine serves both at once, where the typical dopamine-streak ADHD app actively repels the autistic side. Demand avoidance, common in AuDHD, is also why the never-pressure, never-shame framing is non-negotiable rather than merely nice.

**Secondary:** developers and AI agents, via a public API and an MCP server (the AX/DX surface). Both are now shipped, a coherent pair. The MCP server (`/mcp`, bearer-token, tasks under the user's own RLS) is the AX surface, a nine-tool set including the AI Break-it-down engine (propose-only, so nothing is added without the user's yes). The DX surface is a versioned public REST API (`/api/v1`, CRUD plus query) with an OpenAPI 3.1 spec and a browsable Swagger console at `/api/v1/docs`. Both authenticate with the user's own access token and proxy to Postgres under RLS, so the backend holds no elevated key and privacy-by-architecture stays intact. Crucially, both surfaces share the same cadence engine, so a repeating task created by an agent, by the REST API, or in the app is indistinguishable in shape.

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
2. **Brain-dump** anything rattling around, typed or spoken (getting it out of your head is the relief). On web you can talk it out, and one tap tidies a rambling sentence into clean task lines. You can also share into DoubleDone from any other app, via the Android share sheet or the installed web app: whatever arrives is cleaned to one calm line, words kept, links dropped, and waits in the capture box for your yes. Nothing is ever auto-added.
3. **AI triages** the dump into today / later / needs-decomposing
4. **Work the day**, recurring tracker tasks sitting right there. Finishing anything earns a brief, calm "Done is done. Recorded." that quiets the "did I really do it?" loop.
5. **Stuck?** Bite the elephant (AI breaks the dreaded task into atomic, time-boxed steps and drops them into today). When even that is too much, **Make it tiny** returns one two-minute starter, and the real task waits quietly until you have momentum.
6. **Drowning?** Strategise (AI re-spreads an over-full day, with reasoning about priority, energy, deadlines). Or mark it a **low day** in one tap and the bar for "a good day" drops to match your capacity.
7. **Close the day** gently, what got done, what rolls forward, zero guilt for what did not. From the evening, a quiet in-app line invites you to close the day whenever you are ready.

---

## Features, tiered

| Tier | Feature | Note |
|---|---|---|
| **1, build first** | Today view, brain-dump capture (typed and spoken), AI hydration, Bite the Elephant, recurring daily tracker | The whole core loop. Nothing ships without these. Voice capture, the AI "tidy this into tasks" split, and share-to-capture (share from any app, one calm line lands in the capture box) shipped on top. |
| **2, soon after** | Strategise reshuffle, finished-old-task celebration, close-the-day wrap, the Lookback, gentle nudges | What makes it sticky rather than merely functional. |
| **2, the ADHD seam** | Done-is-done and Good-enough (OCD reassurance), the silent-parent chain and Make-it-tiny (task initiation), low-capacity day, energy matching and the wind-down nudge (honouring the day), Routines and Rhythms | The features that make it fit this audience, not a generic app with ADHD bolted on. All shipped (see the seam section below). |
| **3, defer** | Calendar read | Real, not day-one. It keeps its build trigger. (Cross-device sync, the MCP server, the public REST API, and energy matching, all originally Tier 3, have since shipped.) |
| **4, skip** | Teams, assignees, dependencies, Gantt, social feed, habit streaks, user-facing project trees | Wrong product. The streak machine and the folder tree are not omissions, they are the traps this audience needs avoided. |

---

## The ADHD seam (the features that fit the audience, not bolt onto it)

A generic to-do app with a calm coat of paint is still a generic to-do app. This is the layer that meets the specific failure modes of ADHD, autism, the AuDHD overlap, and OCD where they actually happen, in the moment, with no new setting to manage. All of it shipped. It is grouped into four clusters by the moment it serves.

### A. Done is done (OCD reassurance)

For the checking loop and rejection-sensitive dysphoria. Two micro-interactions at the completion moment.

- **Done is done.** Finishing a task shows one calm, consistent line: "Done is done. Recorded." It answers the OCD question "did I really do it?" with a quiet, reliable acknowledgement, then fades. It is the same line every time on purpose. Variable or surprise rewards are off-brand here, because the autistic side of the audience needs predictability, so reassurance beats novelty.
- **Good enough.** Permission to release a task you are stuck perfecting. A "Good enough" action closes it with a gentler line, "Good enough is done. Let it go." For the OCD perfectionism that will not let a thing be ticked until it is flawless, this is the release valve. It is offered, never imposed.

### B. Crossing the start line (task-initiation paralysis)

The wall of awful, met two ways. The shared idea: the app holds the thread so the user only ever holds one small piece. The dreaded task is remembered as a **silent parent**, off Today and out of sight, never shown as a looming "Do My Taxes (1 of 7)" header and never nagging, because re-summoning the whole mountain re-summons the dread.

- **Break it down (the silent-parent chain).** Bite the Elephant no longer flattens a task into loose steps that lose the real goal. The original becomes the silent parent, and the atomic steps chain back to it. Finish the steps in any order, on any day, and when the last one is done the real task completes itself and lands in the Lookback with "You finished X. The whole thing." The payoff lands on the mountain, not the pebble.
- **Make it tiny.** When even a full breakdown is too much, one tap returns a single two-minute starter ("Do my taxes" becomes "Find last year's tax file and open it"). A tiny version is a partial pebble, not the whole task, so finishing it does not pretend the dreaded thing is done. Instead the real task quietly resurfaces with "Started. X is here when you're ready." You keep going on momentum, make it tiny again, or close the day. The dreaded thing is never lost and never shamed.

### C. Honouring the day (time blindness, gentle structure)

Two bookends, and a mid-day companion, that respect the day's real shape without adding a single setting.

- **Low day.** One tap, "Low on energy? Make it a low day," recalibrates the weight-of-today gauge to a gentler capacity. It does not defer or hide anything on the list, it lowers the bar for what counts as a good day ("A low day. A couple of things is plenty."). It is per-day and self-clears at midnight, so there is no low-capacity mode to manage and no risk of it quietly becoming a self-label.
- **What fits right now? (energy matching, shipped 2026-07-11).** Inside Focus mode, the full-screen "just this one" view, the "which one?" picker opens with a question rather than a task: Running low / Somewhere in between / Feeling good. The AI picks one task from today's open list with a short warm line, and "Start with this" opens Focus on it. Propose-only: nothing is added, reordered, or changed. It is the freemium AI feature: 15 picks a calendar month free, metered locally (the count is the user's own record, no server bookkeeping), with calm reminders at exactly 10 and 5 left, never a nag, and a pick is spent only on a successful answer so a flaky network cannot drain the month. Premium removes the limit.
- **The wind-down nudge.** From the evening, a calm in-app line appears above Close the day: "Evening's here. Close the day when you're ready, even a little counts." It is an invitation toward the close-the-day ritual and its Lookback payoff, never a scold for an unfinished list. It is in-app, not a notification, so it costs no permission and no extra toggle, and it lands exactly when you open the app in the evening.

### D. Routines and Rhythms (gentle structure, never a streak)

A morning, evening, or anytime checklist on its own screen, for the days that go better with a known sequence. The autism side leans on routine and predictability, and this serves it directly.

The hard line: this is **not** a habit tracker. The model keeps only each step's last-ticked date, never a count and never a history. A step ticked today is done for today, and tomorrow the routine is simply fresh. There is no streak to break, no chain to protect, and no "you missed N days" anywhere in the data to surface later. The habit-streak shame mechanic is exactly what this audience is built to avoid, so it does not exist in the shape of the data, not just the UI.

**Rhythms (built 2026-07-10 to 2026-07-12)** extend Routines with gentle, recurring self-care nudges, free for everyone because self-care is accessibility, not a perk. ADHD makes internal cues unreliable (interoception and object permanence), so an external, timed, gentle cue genuinely helps: some water around every two hours, stand up every hour, meds at 8 am and 8 pm. A Rhythm takes one of two shapes: an interval inside your waking window, chosen from a curated ladder (every 30 minutes up to every 12 hours, dense at the short end where granularity matters), or a short list of fixed clock times, the meds shape. The ladder is a stepper, not a free-text picker, so a Rhythm can never be configured into an alarm-clock nag. The never-shame rule is structural here too: a Rhythm carries no count, no streak, and no history of fires, so scorekeeping is impossible to even write, and pausing is honest and indefinite, never a snooze that silently dies.

Reliability earned its own arc, because for this audience a nudge that quietly fails to arrive is worse than none. Rhythm nudges ride their own high-importance channel so they peek instead of sitting unnoticed in the tray, the app re-arms every schedule on open (healing the alarm wipes that aggressive battery managers perform), and on Android 12+ a calm "Allow alarms & reminders" door asks for exact alarm delivery (SCHEDULE_EXACT_ALARM), so nudges arrive on time once it is allowed rather than whenever the OS gets around to batching them. The health read under Rhythms is a single sentence, "Next nudge around 3:00 pm.", deliberately no counts, because even a diagnostic surface must not overwhelm the person it serves.

---

## The Lookback (emotional core, not a stats page)

The single feature that does the most for this audience. ADHD brains discount past accomplishment, so the lived experience is constant low-grade failure even after a productive week. The Lookback shows "here is everything you actually finished this week, including the dreaded old things you finally closed." It is evidence against the brain's lie. It is the payoff that makes someone open the app again tomorrow.

It also grows into the moat (below): a week of history is nice, a year of history is switching cost.

The Lookback now ends in a keepsake: the **scrapbook** (shipped 2026-06-20). One tap turns a finished week into a calm still-life image whose soft objects gently evoke what you actually finished, framed as a polaroid with its scene line underneath. It shares as a proper page, the caption and a small "DoubleDone · Week of {date}" baked into the picture itself (2026-07-12), never loose text a receiving app can strip, and raw task titles never leave the device. Shame-safe by construction, since a keepsake only ever depicts finished things, and every proud share is a person showing a friend the app, the first organic acquisition loop. Keepsakes follow the account across devices (2026-07-12), so a week made on the phone is waiting on the web. Free makes one a month; premium makes them weekly, growing with tenure, never a streak.

---

## The moat (designed for, instrumented from day one)

Two loops.

**Per-user (switching cost):** the app learns your real patterns and accumulates your history. The longer you use it, the more it knows and the more painful to leave.

**Cross-user (the flywheel, the real moat):** every decomposition offered plus whether its steps actually got completed is a proprietary signal nobody else has. After enough users, "Bite the Elephant" is tuned on what decompositions genuinely get finished *by people who struggle to finish things*, and it improves for everyone as it scales. A funded competitor cannot buy that dataset, only earn it with a user base.

**Both halves are now live.** The offered half (the decomposition the AI proposed) was logged from the start. The completion half (whether its steps actually got finished, and over how many days) shipped as an anonymised outcome ping that joins back to the offered decomposition on a pseudonymous correlation id, with no user id, no IP, and no new task-text egress. The flywheel is collecting real data, not a promise on a page. The silent-parent chain deepens it: because the steps now link back to the real task, the signal is no longer just "steps got ticked," it is "did this decomposition actually get the dreaded thing done." That is the version of the dataset a competitor most wants and least can buy.

**What makes it legible as intelligence:** day-one instrumentation. We do not log "task done." We log the decomposition offered, which steps were done, in what order, what was abandoned, the user's stated context. That capture decision, made before there is a single user, is the artefact that proves to a hiring PM we design for defensibility. Document it explicitly in the case study.

**The privacy tension, resolved:** this audience distrusts data collection, rightly. The flywheel aggregates and anonymises, is opt-in and transparent, serves the user not an advertiser, and is never sold. Designing a data moat for a privacy-sensitive audience is itself the senior signal, and it extends the privacy-respecting thread from ParkProof and SubToll.

---

## Monetisation (native, not bolted on)

Live and real: Stripe subscriptions have been charging actual money since 2026-06-26.

- **Free:** the whole core loop. Today, capture in every form (typed, spoken, shared-in), Routines and Rhythms, the full Lookback calendar and celebration, a generous AI allowance (about ten Break-it-downs a month, sized to never bite on a crisis day), one scrapbook keepsake a month, and 15 energy-matching picks a month. Enough to prove it fits your brain, because this audience will not pay before they trust it.
- **Paid, A$5/month or A$50/year:** the unlimited AI suite (decomposition and hydration, Strategise, Chart a course, Plan my day, scanning a photographed list, energy matching without limits), richer Lookback insights with a warm weekly reflection, and weekly scrapbook keepsakes that grow with tenure, never a streak.
- **The honest paywall:** the AI features cost real tokens. You gate the thing that genuinely costs money, not an arbitrary wall. Reads as fair, which matters doubly for an audience sensitive to feeling exploited. The wall is never at friction (Sort, Break-it-down, and Close-the-day stay free) and never at the moment of relief, and data export and the public API/MCP are never gated, because trust is the product.
- **Personalisation, the second paid layer:** Pin the day's one thing (2026-06-25), seven calm colour themes (2026-06-27), and the Quiet interface (2026-07-10), a borderless appearance that strips the decorative chrome so DoubleDone reads as calm text on paper, same layout, same features, same warmth. For the sensory side of the audience, chrome is noise, and Quiet is the strongest make-it-yours signal on the paywall. It gates comfort, never capability.
- **What stays free on principle:** Rhythms. Self-care nudges are accessibility, and they never appear behind the premium framing.

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
- **Backend:** small AI service holding the Anthropic key, a Cloudflare Worker at api.doubledone.app (the original Render plan was superseded before launch). Never call Claude from the client. The scrapbook's image pipeline runs on Workers AI, so keepsakes never touch the Anthropic budget.
- **Data + auth:** Supabase (Postgres + Auth + Row Level Security). Postgres suits the Lookback, delta, and flywheel queries; RLS gives privacy by architecture.
- **AI, tiered for cost:** Haiku for cheap frequent triage and the energy-matching pick, Sonnet for decomposition and Strategise, Opus for the premium Lookback narrative moments.
- **Local-first, anonymous-first:** every feature works without an account; cloud is opt-in durability. Sync now carries the whole record, tasks, the "a lot" marks, and scrapbook keepsakes (the marks and keepsakes joined 2026-07-12), so signing in on a second device brings your history with you.
- **Harness:** the golden-path playbook. Tier 0 to start (single main, Inspector + gitleaks + CI badge, risk-targeted tests, telemetry before traffic, cost alarm, journal from day one).

---

## Success criteria for the portfolio piece

> All seven were met. DoubleDone went live 2026-06-23 and moved from portfolio piece to live commercial product when Stripe went live on 2026-06-26, so this section now reads as history rather than a target.

In rough priority order:

1. The core loop works end to end: brain-dump, AI triage, Bite the Elephant into today, check off, close the day.
2. The Lookback renders a real week of completed work, including aged tasks, and feels good.
3. Day-one instrumentation is in place: completion outcomes for decompositions are captured from the first commit, even before there is data to use.
4. The case study walks through the spine, the moat (with the instrumentation decision), and the never-shame design call, so a hiring PM sees retention thinking, defensibility thinking, and audience empathy.
5. The freemium-to-paid flow works in Stripe test mode.
6. Live on doubledone.app, demoable web plus an installable Android build.
7. AI cost stays sane via the tiering, under a set monthly budget alarm.

---

## Open questions

- The App Store path. The codebase is iOS-ready (the platform seams are split), but Premium runs on Stripe, so an in-app-purchase strategy decision is needed before any App Store release. Decided before an iOS build, not urgent.

**Resolved since v1 of this spec:**

- **Visual identity:** calm warm paper (the Dusk palette), soft and grounded, the opposite of Chronoloria's epic look. Then personal on top of calm: seven colour themes (2026-06-27) and the premium Quiet interface (2026-07-10), so calm is the default and personal is the option.
- **How much of the Lookback ships in v1:** all of it. The calendar and celebration shipped free and stay free; premium adds the richer insights, the warm weekly reflection, and the weekly scrapbook cadence.
- **Voice brain-dump:** shipped on web. Speak the dump, and one AI tap tidies a rambling sentence into clean task lines. Text-first held for native, where the keyboard mic already covers it.
- **The celebration mechanic for aged tasks:** the reward is complexity-weighted warmth, never points or streaks. A long-dreaded or chunky task earns a warmer, more prominent acknowledgement, and a decomposed mountain that finally completes lands in the Lookback as "You finished X. The whole thing." It motivates without ever shaming the task for having existed.

---

*Opinionated on purpose. Argue with it in the decision-log.*
