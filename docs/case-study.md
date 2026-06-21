# DoubleDone, a case study

*How a calm to-do app for ADHD brains got scoped, sequenced, and deliberately held back. Written for anyone who wants to see the product thinking, not just the code. The contemporaneous version lives in [`decision-log.md`](../decision-log.md); this is the narrative.*

---

## The pivot: choosing the right thing to build

The planned next portfolio piece was SubToll, a subscription-audit tool. It was shelved before a line was written, for two reasons that are really one reason.

- **Motivation is the binding constraint** for solo nights-and-weekends work, and SubToll never had it. DoubleDone did: the founder runs his life off to-do lists and has ADHD-shaped work patterns. He is the user, he will dogfood it daily, and he will not lose interest.
- **Monetisation followed from that.** "Find your forgotten subscriptions" is a one-shot value prop with no reason to keep paying. A daily to-do app you actually open is intrinsically subscription-shaped. The thing SubToll could never manufacture, DoubleDone has by nature.

The lesson banked: pick the project you will still want to open in week six, because that is also the project users will.

## The spine

**Today is finite and achievable.** The home screen is Today, sized to be doable, and every feature exists to protect it from the overwhelm of the full list. This single sentence is the product's spine, and it is the tie-breaker for every scope decision. When a feature would turn Today into an everything-bucket, it loses, no matter how good it is. (Custom lists, for example, are designed to live *outside* Today for exactly this reason.)

## The audience, and why generic apps fail them

DoubleDone is for ADHD, autism, the AuDHD overlap, OCD, and chronic overwhelm. Neurotypical productivity apps optimise for capture and structure and reward you with streaks. For this audience those patterns backfire on predictable failure modes:

- **Task-initiation paralysis**, the dreaded task is too big to begin.
- **Time blindness**, "today" silently fills past what a day holds.
- **The discounting reflex**, the brain throws away everything already done.
- **Rejection-sensitive dysphoria**, guilt mechanics (overdue-red, nags, broken streaks) repel rather than motivate.

Designing *around these specific failures*, rather than bolting "ADHD" onto a generic app, is the whole product. The calm, predictable, never-shame surface also fits the autistic side, where dopamine-streak apps actively repel.

## The one rule that cannot break

**Never shame the backlog.** Celebrate closing a task; never punish one for existing. With rejection-sensitive dysphoria, a guilt-based app is not under-motivating, it is actively harmful, and users leave. This rule is load-bearing and it shows up everywhere:

- No overdue-red, no nagging. Undone work just rolls forward, quietly.
- "Close the day" is a gentle wrap, not a scorecard: it shows what you finished and reassures that nothing is lost.
- The Lookback exists to answer the discounting reflex with evidence: *here is everything you actually finished, the old dreaded things included.* It is the emotional payoff, deliberately not a stats dashboard.

When a design choice and this rule conflicted, the rule won.

## The core loop

Brain-dump → AI triage → break the dreaded thing down → work a small day → strategise if it is over-full → close the day → see what you finished. Two design calls define its feel:

- **Propose-then-accept for anything that rearranges your day.** Strategise (re-spread an over-full day) and the Break-it-down review both *propose* and wait for a tap. The AI never silently reorganises your list. Control matters most exactly where the AI is most useful.
- **Capture is the deliberate exception.** Triage ("Sort for me") applies its result directly, no review step, because the capture surface must be the lowest-friction thing in the app. A review step there would fight the one moment that has to be effortless.

**Break it down** is the clearest expression of the spine. A dreaded task becomes a short interview (a due date, a pace, one smart clarifier), then a plan you accept. For a big, long-horizon task it returns a *roadmap of phases*: only phase one is broken into steps now, and each later phase waits in Later as a dated milestone, broken down when you reach it. The deadline is honoured without ever dumping forty tasks onto today. And the break-down no longer flattens the task: the original is kept as a silent background parent, so you hold one small step at a time while the app quietly tracks the whole, and finishing the steps completes the dreaded thing itself.

## The moat

Per-user history is switching cost. The real moat is a **cross-user completion-data flywheel**: log the decomposition the AI offered and whether its steps actually got finished, by people who struggle to finish, so Break-it-down improves for everyone as it scales. A funded competitor cannot buy that dataset.

The decision that makes it legible as intelligence is **day-one instrumentation**: every AI call is captured from the first feature, before there is any data to use. The privacy tension (this audience distrusts data collection) is resolved by architecture, not policy: the telemetry is **pseudonymous** (no user identity) and lives in a store with **no public write path** (a Worker-bound database, so it cannot be written or read through any public API), and the posture is aggregate, anonymise, never sell. The user-facing payoff ("people usually finish this in about three days") is deliberately deferred until there is enough honest volume to mean it. Both halves of that loop are now wired: the decomposition we offered, and an anonymised signal of whether its steps actually got completed, which the silent-parent chain sharpens from "the steps were ticked" to "the dreaded thing actually got done".

## Trade-offs worth seeing

- **Tiered AI for cost.** Haiku on the cheap, friction-free paths (triage, the clarifying questions); Sonnet where reasoning matters (planning, decomposition, re-spreading). Forced tool-use with enum-constrained schemas and defensive parsing keeps a malformed model response from ever crashing a screen. A $25/mo cap bounds spend.
- **Date maths on-device, not in the model.** The AI orders the steps; the client computes the dates. Deterministic, cheap, and untestable in the model is now testable in pure code.
- **Re-decompose later phases instead of storing them.** Phased breakdown keeps only phase one's steps; later phases are re-broken-down when reached. No stale pre-generated steps, and no data-model migration. The reusable Break-it-down flow *is* the recursion.
- **Local-first, anonymous-first.** The entire app works with no account. Sync is opt-in, the only PII is an email, and row-level security isolates every user. Privacy is the architecture, not a paragraph.
- **Remove friction, never add a setting.** Light-first, no theme toggle to forget, defaults that just work. A Settings page is on the backlog, and its own entry argues with the spine before allowing itself in.

## The discipline of stopping

The hardest part of a solo build is not adding things. The backlog is kept live, every item carries a **trigger** for when it earns its place, and just as importantly the decision-log records what was decided **against** and why. That trail is the product-management artifact: it shows sequencing, restraint, and a founder who can be watched saying no to their own good ideas.

The same discipline applies to the project itself: once the core loop is feature-complete and demoable, the leverage moves from *more features* to *legibility, polish, and reach*. Knowing where that line is, and choosing to stop building and go ship the story, is part of the craft.

## The redesign: when polish becomes the work

The first version earned an honest complaint from its own founder: Today had become cluttered. Not broken, *cluttered*, the way any screen does when feature after feature lands as "one more link in the row" and nobody steps back. That is the failure mode of shipping fast and solo: each addition is locally reasonable, and the sum is a junk drawer.

So the whole UI took a system-pass redesign, and the first call was scope. Of seven surfaces, only Today genuinely needed rebuilding; the other five (the Lookback, Break-it-down, Premium, Settings, the Repeating drawer) were already close to the calm target and took small refinements or none at all. Auditing each screen against the spec *before* touching it is the discipline of stopping pointed at a redesign: "redesign everything" was really "rebuild one, refine a few, leave the rest." Tearing up what already works is its own kind of overwork.

Today's rebuild folded a row of five flat actions into the screen itself: "Focus on one thing" promoted to a calm entry, off-list logging tucked beneath the list, and a single tap-and-hold gesture that replaced *both* a per-task menu and a separate multi-select button. One gesture, one clear set of actions, instead of a drawer of links.

The redesign also surfaced the one thing a feature-complete app still lacked: a front door. New users arrived mid-stream. The fix is a guided first-run that onboards by *doing*, your first brain-dump runs through the real triage, so the first thing you see is the product working, a doable Today, not a tutorial wall or an empty void. It is the spine delivered as a first impression. And because the lovely part is the guided capture rather than a recap, it was made replayable and non-destructive from Settings, not locked to install day.

## Going deep: from one feature each to a system

The first cut mapped one feature to each failure mode, and that clean one-to-one was the right MVP. It was also, on reflection, too thin for the hardest of them. Task initiation is where this audience loses the most days, and a single Break-it-down does not cover the moment when even the first step is too much, or the moment when a dreaded task keeps looming because you can still see the whole of it.

So the product went *deep* on the failure modes rather than wide on new ones. Founder-market-fit is exactly the ability to feel where the thin spots are:

- **Crossing the start line** got two more answers. Break-it-down stopped flattening the task: the original is kept as a silent background parent, so you only ever hold one small pebble and the boulder never looms, yet finishing the pebbles still finishes the real thing. And "Make it tiny" shrinks a stuck task to a literal two-minute version, because sometimes the work is just getting unstuck.
- **The day itself** got gentler. A one-tap "low day" recalibrates Today to a smaller target when you have less to give, and a quiet evening wind-down invites you to close the day instead of nagging you about it.
- **The OCD and perfectionism overlap**, which the product had always named in its audience but never actually served, finally got features. "Done is done" reassures that a finished task is filed and you can stop checking, and "Good enough" gives permission to release a task you are over-polishing.
- **Structure without a streak.** Routines are a calm morning or evening checklist that keeps no streak and no history, so there is nothing to break. It is the one piece of this seam most apps get wrong, and getting it right is the entire point.

This is the move from "a calm to-do app with some ADHD touches" to a system organised around how these brains actually fail. It is also the part hardest to copy: a competitor can clone a screen in a weekend, but not the accumulated judgment about which thin spot to deepen next.

## What this is meant to show

A product manager who:

- picks the right thing to build (founder-market fit, intrinsic monetisation) and can say why the alternatives lost;
- designs from a population's real failure modes, not a feature list;
- goes *deep* on those failure modes rather than wide on new ones, and can tell which thin spot to deepen next;
- holds one non-negotiable rule and lets it override good ideas;
- builds a defensible data moat and resolves its privacy tension by architecture;
- and keeps a reasoning trail honest enough to reconstruct every call, including the roads not taken;
- and knows when polish is the highest-leverage work, scoping a redesign by auditing each surface rather than rebuilding on reflex.

## Status

Core loop shipped on web ([doubledone.app](https://doubledone.app)) and Android, then a full design pass, a guided replayable first-run, and a deep ADHD product seam: the silent-parent chain, Make-it-tiny, the low-capacity day, the wind-down, never-streak Routines, and OCD reassurance, plus talk-to-capture and a public REST API beside the agent MCP server. The completion-outcome half of the moat is now instrumented too. Next: multi-language. The full sequence and the parked-with-triggers backlog are in [`BUILD-PLAN.md`](../BUILD-PLAN.md).
