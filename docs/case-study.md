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
- **The OCD and perfectionism overlap**, which the product had always named in its audience but never actually served, finally got a feature. "Done is done" reassures that a finished task is filed and you can stop checking, a calm, consistent line that meets the checking loop without feeding it.
- **Structure without a streak.** Routines are a calm morning or evening checklist that keeps no streak and no history, so there is nothing to break. It is the one piece of this seam most apps get wrong, and getting it right is the entire point.

This is the move from "a calm to-do app with some ADHD touches" to a system organised around how these brains actually fail. It is also the part hardest to copy: a competitor can clone a screen in a weekend, but not the accumulated judgment about which thin spot to deepen next.

## The platform surface: one engine, two front doors

A calm consumer app did not have to have a developer surface at all. Building one, and building it with restraint, is the platform-thinking signal. DoubleDone exposes a user's own tasks two ways on a single Cloudflare Worker, both bearer-authed with the user's own Supabase token and scoped entirely by row-level security, so the server holds no elevated key:

- **A public REST API** (OpenAPI 3.1, version 1.1.0, at `/api/v1` with a browsable Swagger UI at `/api/v1/docs`): a token-authenticated CRUD-plus-query surface over a user's tasks. Create a task that lands on today or takes a future due day or a repeat cadence (but never both dated and recurring), patch any field, and read three ways, a substring search, a look-ahead window, or the app's own Today view.
- **An MCP server** for AI agents (nine tools), so an agent can add, list, complete, update, delete, and *break down* a task, with a `search` / `fetch` pair that implements the OpenAI Deep Research connector contract, putting a user's own task history within reach of a research agent. Two auth paths by design, a pasted token for local tools and OAuth 2.1 with S256 PKCE for the hosted assistants, with an immediate Disconnect kill switch and the rotating refresh token encrypted at rest.

The call worth seeing is that **both surfaces share the same recurrence engine** (`buildRecurrence`). A repeating task made by an agent, by the REST API, or in the app is byte-for-byte the same shape, so the three doors never drift. And the division of labour is deliberate: the **AI actions (Break-it-down, the propose-only decomposition) are MCP-only**, because an agent asks for a yes before anything lands, while the REST API stays pure CRUD-plus-query. The intelligence lives where the consent loop lives; the plumbing stays boring on purpose.

## Going live: the rigour that is not features

Feature-complete is not launch-ready, and the gap between them is what separates a finished prototype from a business. The last stretch was almost entirely rigour, not new features.

- **Monetisation, built so the server never trusts the client.** Premium is a Stripe subscription (A$5/mo or A$50/yr) with a 30-day card-free trial. The client never decides its own premium status: a signature-verified, idempotent webhook writes an entitlement to the database, and a server guard re-checks it on every paid call. The free tier stays genuinely good on purpose, because for an RSD-prone audience a crippled free tier reads as bait-and-switch.
- **Hardening the money path before it saw volume.** A per-IP backstop so a script cannot drain the shared image budget, a double-subscription guard so a user cannot double-charge themselves, and the webhook taught to alert on disputes, refunds, and failed payments. None of it can crash a request; all of it fails open or defensive.
- **Instrumenting operations before scale, not after an incident.** A launch control centre watches spend against a hard cap, error rates, and abuse, hourly, and emails only on a breach, with a daily pulse and a dead-man's-switch so silence provably means healthy. A solo founder cannot watch a dashboard, so the system has to tap the shoulder. The sharpest call, the alarm-on-the-alarm, came from designing it across four independent expert lenses rather than one.
- **Measure the claim, then make it.** When the design system claimed AA contrast, the honest move was to compute the ratios and put the numbers in a test, not to assert it in a doc. A contrast sweep deepened a handful of tokens until the claim was true, then proved it.
- **A real front door.** The marketing landing was redesigned to be calm and editorial rather than loud, empathy first, showing the product rather than shouting a headline, and rebuilt on the live theme so it follows light and dark for free.

**The proof.** Going commercial closed the loop the whole thesis rested on: this audience does pay for a tool that respects how their brains work. There are real paying subscribers, the completion-data flywheel is live and logging what a competitor cannot buy, and the control centre's daily digest now tracks the things that actually matter, activation, spend, and the first signs of whether people stay. The week-six bar is still the bar, but for the first time there is a real curve forming against it, not a hypothesis.

## The second wave: what is paid, what is free, and why

After going commercial, the feature work resumed, and the sorting of paid-versus-free became product thinking in its own right. Four features shipped in the 2026-07-10 to 2026-07-11 window, and the line between them is deliberate:

- **The Quiet interface (premium)** is a borderless appearance where nothing shouts, same layout, same features, calm text on paper. It is premium because personalisation is the paid lane and the calm baseline stays free. Two judgment calls from the build are worth keeping. When the design spec's literal measurements would have made switching appearance reflow the whole list, the spec's own first principle ("switching never moves anything, predictability matters for this audience") won over its numbers. And when the day's-weight gauge vanished as "chrome", the founder's own testing brought it back whisper-thin: it is information, not decoration, and a calm interface must not get calmer by knowing less.
- **Energy matching (freemium, 15 picks a month)** answers the moment when the list is doable and you still cannot choose: one question ("What fits right now?"), one AI pick, propose-only, opening Focus mode on it. It lives inside Focus because choosing what to focus on is the moment the question makes sense; it started as another Today button and device testing moved it. The meter is the honest part: at roughly a fifth of a cent per pick, 15-free-then-paid is conversion psychology, not cost recovery. The reminders at 10 and 5 picks left are calm counts, never a nag, and a failed call never spends a use.
- **Rhythms (free, permanently)** are gentle recurring self-care nudges, water around every couple of hours, meds at 8:00 and 20:30, asked for by a real user, the founder's wife. They are free for the same reason the reminder-time picker is: interoception support is accessibility, not upsell, and a self-care nudge behind a paywall would poison the never-shame promise. The rule is structural here, not editorial: the data shape has no field that could hold a streak or a count, so the shame mechanic is not merely avoided, it is unwritable.
- **Share-to-capture (free)** puts DoubleDone on the system share sheet, Android and installed web alike. The design work was subtraction: a browser shares a quoted title plus a highlight-fragment URL, and what lands in the capture is one clean line, words kept, links dropped, because capture is the one surface that must never make the user tidy up after their tools. Nothing auto-adds; the box opens seeded and you confirm.

## Launch week: the founder as field tester

The gap between "verified on web" and "works in a hand" was launch week's whole story. The founder sideloaded the release candidate, walked it on his own phone and his wife's, and reported symptoms the way a user would: shares that vanished, nudges that never came, rows clipped after toggling a setting, a keepsake that refused to share. Every one had passed weeks of web verification, and every one was real.

Two things about the loop mattered more than the individual fixes. First, diagnosis by reading, not guessing: an adb capture proved a "dead" share was actually arriving and being consumed a tenth of a second after boot (a mount-order race then lost it), and the nudge mystery ended in the notification library's own Android source, where the silent failure lives. Second, the loop is the argument for dogfooding on real hardware: the web preview runs a different JavaScript engine, never detaches screens, and forgives data shapes the native path chokes on, so for a whole class of bug it is a witness that always says yes.

## The reliability saga: keeping a promise the OS wants to break

A rhythm is a promise: "I'll tap your shoulder around every 90 minutes." Launch week showed Android quietly breaking it, on both test phones, and the fix arc is the judgment on display.

**Act one** was product-shaped: nudges were being delivered onto a low-importance notification channel and sitting unread in the tray. A rhythm is a nudge the user explicitly asked for, so it earned a heads-up channel of its own. **Act two** was defensive: a quiet app-open sweep that re-arms everything from stored config, and a health line so the two remaining failure modes, scheduling broke versus the OS is holding them, can be told apart at a glance. **Act three** was the root cause, found by reading the notification library's Android source rather than guessing: without a permission the app had never declared, every nudge since launch had been silently downgraded to an inexact alarm that the OS defers until the app next wakes. The fix took the honest lane, the user-granted "Alarms & reminders" permission with a calm in-app door, over an auto-granted alternative that Play reserves for alarm clocks and calendars, because mislabeling the app to gain a permission is trust debt this product cannot carry.

Two details frame the saga. The escalation was pre-decided: when act two shipped, the log already recorded exact alarms as the documented fallback if reliability still disappointed, so the stressful call was made before the disappointing retest arrived, not during it. And the saga ended with a subtraction: the health line's diagnostic count ("Set on this phone: 39") was the developer debugging in front of the user, overwhelming for exactly the audience the app protects, and it was cut to one calm sentence, "Next nudge around 3:00 pm." The never-overwhelm rule applies to our own instruments too.

## Reversing well: two walked-back decisions

Late change is a skill, and the release week held two reversals, both principled rather than reactive.

- **The keepsake became a page.** The scrapbook share had launched image-only, no caption, because silently attaching task-derived words as share text would be a surprise. Device testing surfaced the other half of the truth: a bare image with no context is half a keepsake. The reversal honours the original concern with a better mechanism: the caption is baked into the image's pixels, a cream band with a quiet wordmark, so the share is still exactly one file the user has seen in full before sending. The deciding fact was empirical, receiving apps freely strip attached text, and nobody can strip pixels. The principle survived; only the mechanism changed.
- **Scrapbooks went cross-device.** Sync had been consciously parked when a keepsake meant half a megabyte of image data. By release week the premise had expired, a keepsake had become a few text fields around a hosted image URL, and the founder hit the gap himself, keepsakes made on his phone missing on web. The call was to fix it before the release rather than after, because shipping a known cross-device gap into a store build buys a support burden with a long tail. A parked decision is only as good as its premise, and re-checking the premise is part of owning the park.

## The freeze: versionCode 11

The release cut is where the discipline of stopping meets shipping. On 2026-07-12, versionCode 11 was cut from a named commit, device-verified on the matching APK first, code-frozen under the git tag `android-v11`, and web deployed from the same code, so every surface tells one story and "what is in the store build" is a lookup, not a memory. The Play release note is the product spine in store-listing form: "Keepsakes now follow your account across devices, and they share as a proper page with their caption on the picture. Rhythms can nudge every 30 or 90 minutes and arrive on time once 'Alarms & reminders' is allowed. Plus calmer details and small fixes throughout." Calm, concrete, nothing over-promised.

## What this is meant to show

A product manager who:

- picks the right thing to build (founder-market fit, intrinsic monetisation) and can say why the alternatives lost;
- designs from a population's real failure modes, not a feature list;
- goes *deep* on those failure modes rather than wide on new ones, and can tell which thin spot to deepen next;
- holds one non-negotiable rule and lets it override good ideas;
- builds a defensible data moat and resolves its privacy tension by architecture;
- and keeps a reasoning trail honest enough to reconstruct every call, including the roads not taken;
- knows when polish is the highest-leverage work, scoping a redesign by auditing each surface rather than rebuilding on reflex;
- thinks in platforms as well as screens, giving a consumer app a restrained developer surface (REST and MCP at parity on one engine, reaching AI research agents) without letting it bloat the product;
- and takes a product the last mile from feature-complete to commercially live, hardening the money paths and instrumenting operations before they meet real volume, then proving the thesis with real paying users;
- and field-tests the release on real devices before freezing it, chasing a reliability promise to its OS-level root cause and reversing two of their own earlier calls cleanly on the way, the principle kept, the mechanism changed.

## Status

**Live and commercial, frozen for the Play release as versionCode 11 (2026-07-12, tag `android-v11`).** The core loop shipped on web ([doubledone.app](https://doubledone.app)) and Android, then a full design pass and a marketing landing, a guided replayable first-run, and a deep ADHD product seam (the silent-parent chain, Make-it-tiny, the low-capacity day, the wind-down, never-streak Routines, OCD reassurance), beside a dual developer surface (a public REST API and an agent MCP server at parity, sharing one recurrence engine, with a Deep Research connector). Then the commercial half: Stripe Premium live with real subscribers (the 30-day trial, the annual plan), the money-path hardening, and the launch control centre. The full i18n sweep (four languages, every screen, the per-app language picker) shipped 2026-07-04, and the July wave, the Quiet interface and colour themes (premium), energy matching (freemium), Rhythms with the exact-alarm reliability arc (free), share-to-capture, cross-device keepsakes and big marks, and the keepsake-as-a-page share, is what versionCode 11 froze. In flight: the Play release rollout, with iOS held behind the Premium in-app-purchase decision. The full sequence and the parked-with-triggers backlog are in [`BUILD-PLAN.md`](../BUILD-PLAN.md).
