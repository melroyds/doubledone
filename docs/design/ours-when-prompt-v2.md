# Design prompt v2: does a day END a rhythm, or START it?

*Paste into Claude Design. Written 2026-08-16, from the code, after v1 was written from memory and
the boards faithfully reproduced its false premises.*

**Read the "What v1 got wrong" section before anything else.** If you have seen the earlier
DoubleDone When boards, two of their stated premises are false and one of their labels does not
exist in the app.

---

## The product, briefly

DoubleDone is a calm daily to-do app for people who find to-do apps overwhelming. Built with ADHD,
autistic and OCD friends in mind. Live on web, the App Store and Google Play, with paying
subscribers. The spine: **today is finite and achievable.** No streaks, no scores, nothing that
shames a task for existing.

**Ours** is a shared list between exactly two people, with three inviolable laws: nothing is ever
attributed, nothing counts or compares, and nothing moves because the other person acted.

A task carries **a date** or **a rhythm**, never both. On Ours, either one is what makes the row
appear on both people's Todays on the day. A plain undated row stays on the shared list and reaches
nobody's Today, which is the rule that stops one person filling the other's morning.

---

## What v1 got wrong, so you do not inherit it

1. **"A rhythm can never be changed" is false.** The room's held card has always offered a rhythm
   editor, pre-seeded with the current cadence, on every row. What is genuinely missing is exactly
   three moves: **anything back to plain, a rhythm to a date, and a date to a different date.**
2. **The card's label is `Repeat…`**, not "Set a rhythm". Any board saying "replace Set a rhythm" is
   describing a control that does not exist.
3. **The personal Move-to picker has four presets**, not two: Today, Tomorrow, This weekend, Next
   week, plus a month grid. A design that offers only Today and Tomorrow silently deletes two.
4. **Ours has no per-occurrence skip.** Personal repeating tasks can skip a single day; shared ones
   cannot, because there is no per-date state on a shared row. On a shared repeat, Remove ends the
   series for both people, and its label deliberately reads "Remove" rather than "Skip today"
   because the reassuring label once did exactly that, unrecoverably.
5. **The room's held card has no reordering and no reminders.** Any board drawing Move up, Move
   down or Remind me on a shared row is drawing controls that do not render.

---

## Already decided. Not up for design.

These came out of an adversarial review and are settled. Design within them.

- **No new sheet.** The work extends the existing `CadenceSheet`, described below.
- **The door on the held card gets renamed** from `Repeat…` to a name covering both answers, showing
  the current value beside it.
- **Two labelled zones**, with the word "or" carrying the exclusivity.
- **Returning to plain is a chip, not a Clear button and not a confirm dialog.**
- **A summary line states the outcome before the commit**, and the commit button names it.
- **The personal Today card is out of scope.** Ours only, this round.
- **A passed date renders exactly like a future one.** No overdue, no red, no age, no arithmetic.

---

## The component you are extending, exactly as it is

`CadenceSheet` is THE cadence surface, one in the whole app. It was lifted out of the personal
Repeating drawer so the shared list could use identical controls rather than grow a second picker
that drifts. Its own header comment says: *"It owns the cadence and nothing else: no series list, no
removal, no undo."*

**Two callers**, and they must both keep working:

| Caller | Surface | Notes |
|---|---|---|
| The **Repeating drawer** | personal | Manages the whole collection. Removal lives in the drawer, NOT in the sheet. |
| The **room** | shared | Passes a note: "You'll both see it on its day." |

**What it renders today**, top to bottom, inside a modal card:

1. An **editable title** (you may want to fix the wording in the same breath as the rhythm).
2. Three cadence chips: **Daily · Weekly · Every few days**.
3. A detail region that changes with the chip: seven weekday toggles for Weekly, a stepper for
   Every few days.
4. **A start date**, with an inline month grid, seeded from the existing rhythm's anchor. *This
   already exists.* An interval's phase survives an edit because of it.
5. An optional one-line note the caller supplies.
6. A commit button that **names the cadence** rather than saying Save, on the reasoning that on a
   shared list the last thing you read before committing should be the thing you are committing your
   person to.

**What it cannot do:** express "no rhythm". Its save path only ever emits daily, weekly or every-N,
and it refuses to commit anything else.

**What the room's held card offers around it:** the title (tap to rename in place), `Repeat…`,
`Bring to my Today` (only on rows that will not arrive by themselves), and a bottom shelf with
Close, Select more, Remove.

---

## The one question

**When a row already repeats and you choose a day, does that day become the rhythm's start, or does
it end the rhythm and make the row a one-off?**

Both are defensible and the app currently says both.

**Compose** is what the capture bar does, one surface directly above the room. Choosing "Tomorrow"
and "Weekly" there produces a weekly repeat starting tomorrow. `CadenceSheet` is already built this
way: it holds a start date today. Compose also lets somebody re-phase a repeat, which is a real
thing people want ("move bin night to Fridays, starting next week"). But if a day cannot end a
rhythm, something else must, and the only candidate is the plain chip, which is an odd way to say
"stop repeating".

**Replace** is what the earlier boards proposed. One answer at a time, exclusivity is honest and
visible, and ending a rhythm is reachable from the same place you set it. But it contradicts the
capture bar using the identical chips, and it makes re-phasing a repeat impossible without
rebuilding it, which on a shared list means ending the series for two people.

There may be a third answer. The day zone could mean different things depending on whether a rhythm
is selected: a due date when there is no rhythm, a start date when there is, with ending a rhythm as
its own distinct act. If that is right, say how a person understands the change without being told.

**Resolve it, argue it, and make the resolution visible in the interface rather than in a rule
somebody has to learn.**

---

## Deliver

1. **The extended `CadenceSheet`**, in each meaningful state, on the SHARED surface: a plain row, a
   dated row, a repeating row, and mid-change where the choice is about to alter the other half.
2. **The same sheet on the PERSONAL Repeating drawer**, where a day zone may be meaningless and "no
   rhythm" means the entry should not exist. One component, two surfaces. Show what is hidden and
   say what the prop is called.
3. **The held card's door row**: its name, its value in every state, and where it sits relative to
   `Bring to my Today`.
4. **The wording, exactly.** Every label and every summary line. Write summaries as whole standalone
   sentences or as short dot-joined fragments, never as a sentence assembled from a slot in the
   middle, because five locales cannot take a mid-clause slot-fill.
5. **The state for a rhythm this build cannot read** (a newer version wrote it). It must be shown,
   never editable, and it must keep its route onto somebody's day.
6. **What you deliberately did not build, and why.** This section usually carries the most value.

## Constraints

- Two people read this. A change is visible to somebody else within fifteen seconds. Never imply the
  other person did something, never name them.
- No confirm dialogs. Undo is setting it back.
- No new settings. The rule is remove friction, never add a setting.
- Phone, one-handed, at the largest accessible text size, in five languages (en/de/es/fr/it) where
  strings run up to 40% longer than English.
- **Voice: no em-dashes at all**, minimal semicolons, calm, plain, no exclamation marks. Never
  clinical: no "treatment", "therapy", "symptoms".

## Do not

- Do not invent controls. If you draw a control, it must be one this document says exists.
- Do not design the personal Today held card. Out of scope.
- Do not put removal inside the sheet. The drawer owns that, deliberately.
- Do not use the words "Skip today" anywhere on a shared row.
