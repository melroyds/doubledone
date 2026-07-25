# Claude Design prompt — DoubleDone: the expanded capture panel

Review and redesign the **expanded capture panel** on DoubleDone's Today screen: the surface that opens when you tap "+ Add to…". This is the most-used surface in the product, and it currently renders every power it has around every thought it receives. The visual language is settled; the hierarchy is the question.

## The product

DoubleDone is a calm, never-shame daily to-do app for adults with ADHD, autism, the AuDHD overlap and OCD. The spine: **today is finite and achievable**, and the standing rule is **remove friction, never add a setting**. Brand is "Dusk": Newsreader serif for headings, Atkinson Hyperlegible for body, a soft mauve → honey accent, warm off-white with a full dark mode. Quiet, reassuring, never a nag.

The screen this panel lives on was just re-architected around "the constant frame": one fixed action layer whose controls never appear, vanish, or slide with app state, because **predictability beats clever** for this audience. Capture is the last dense surface untouched by that thinking.

## What the panel is (current state, exactly)

Tapping the docked "+ Add to…" bar expands, in order:

1. A **Close** link (collapse).
2. The **input** ("Empty your head. One line per thing."), multiline, with **Speak** (on-device dictation, where the platform supports it) and **Scan** (premium AI photo-OCR of a written list) beside it.
3. **Six schedule chips in one wrapping row**: Today · Tomorrow · Date… · Daily · Weekly · Every few days. Today is the default. Date… opens a picker; Daily reveals nothing extra; Weekly reveals a row of seven weekday chips; Every few days reveals a − N + stepper; the repeating modes also reveal a "Starting from" date row.
4. A **steps row** ("Has parts? Track it in steps.") with a − / + stepper, for single-line captures only.
5. The action row: **Break it down** (AI, single line) or **Sort for me** (AI, multiple lines) — they swap by line count — and **Add**.
6. Contextual hints: the multiline sort hint, the AI egress note, the steps hint.

With AI off, Scan / Break it down / Sort for me disappear (a standing product rule). Speak stays: it is on-device.

## The tension to design against

Capture has **two jobs living in one panel**:

- **The reflex.** Get a thought out of a busy head *right now*, before it evaporates. One line, today, Add. This is the overwhelming majority of captures, and the moment of highest working-memory fragility this audience has.
- **The composer.** Shape a task deliberately: when, how often, whether it has parts, whether AI should split it.

Today the composer renders around the reflex on every single open. The person holding a fragile thought scans six chips, a stepper, and up to four buttons to do the one thing they came for. The panel is the densest surface in an app whose spine is calm.

**A second, subtler problem: this panel still reshapes itself**, in exactly the way the constant frame just killed elsewhere. Weekday chips and steppers appear under chips as you tap them; Break it down swaps to Sort for me because of what you typed. Distinguish two kinds of change when you design:

- **User-initiated disclosure** (I tapped a door, more appeared where I tapped) is predictability-SAFE.
- **App-initiated reshaping** (controls changed because of what I typed or which chip is active) is what breaks muscle memory.

The current panel does both. Keep the first kind if you use it; design the second kind out where you can, or make it visibly stable (e.g. a fixed region that changes content rather than controls that appear from nowhere).

## A fact that changes the solution space

Almost every composer power **already exists after capture**, on surfaces built this month:

- Re-dating a task: the held card's "Move to…" (presets + full date picker).
- Steps: can be added to and edited on an existing task.
- Break it down: on the held card, one hold away.
- Repeating cadence: editable in the Repeating drawer.

So the chips are not the only door to their powers; for several, they are the *duplicate* door. The redesign is allowed to lean on that: a capture that ships the thought instantly and lets shaping happen where shaping already lives is a legitimate direction, not a feature cut. (Deciding the repeat cadence AT capture is the one power with no true post-capture equivalent for a brand-new task; treat it accordingly.)

## Principles (the standing seven, plus three capture-specific)

1. **Never shame the backlog.** No urgency, no counts, no red.
2. **Predictable beats clever.** See the two kinds of change above.
3. **Calm over dense.** Whitespace is the material.
4. **Propose, never impose.** AI actions stay propose-then-accept.
5. **No new settings.** Never "let the user configure the panel".
6. **One-handed, thumb-reachable.** Add stays easy; nothing destructive near the reflex path.
7. **Screen-reader and shaky-hand navigable.** No gesture-only routes, generous targets, wrap never clip (chips must survive German and Portuguese).
8. **The first keystroke never waits.** Panel opens focused and typing works instantly; nothing may steal focus, ever.
9. **Text is never lost.** Whatever is typed survives every tap, mode change, and collapse.
10. **The multiline brain-dump is sacred.** "Empty your head, one line per thing" is the founding gesture of the app and must remain a first-class use, not a mode behind a door.

## Directions to explore (pick three genuinely different ones)

- **Reflex first, one door to the composer.** The open panel is input + Add (+ Speak). One constant, labelled door ("Tonight? Repeating? Steps?" — find better words) opens the full composer in a fixed region. Same door, same place, every time. Show the composer open AND closed.
- **Ship now, shape after.** Capture collapses to input + Add. Shaping happens where it already lives (the held card, the Repeating drawer), and the panel says so once, gently. Show how someone adds a *weekly* task in this direction without feeling punted.
- **Split by question.** Keep the two genuinely-reflex chips (Today · Tomorrow) visible; fold Date… and all recurrence behind one stable "Another day / repeating…" element. The steps stepper moves behind the same fold or leaves for post-capture.
- Anything better. The framing above is the current understanding, not a constraint.

For each direction, state explicitly what happens to: Speak, Scan, Break it down / Sort for me, the steps stepper, and the AI-off variant.

## Screens to produce (mobile, both dark and light Dusk)

1. The panel just opened, keyboard up, on a small phone — the reflex case
2. The composer / expanded state (whatever your direction's equivalent is)
3. A multiline brain-dump in progress (5+ lines)
4. Adding a weekly task, end to end (the hardest power to keep reachable)
5. The AI-off variant of the main state

## What this is NOT

- Not a restyle: colours, type, and the collapsed "+ Add to…" bar are settled
- Not a feature cut: every current power must remain reachable somewhere obvious
- Not a modal wizard or multi-step form; capture stays one surface
- Not a FAB, not a settings answer, no badges or counts
- Not the bedtime-capture or onboarding-capture variants (same family; they follow whatever pattern wins here)
