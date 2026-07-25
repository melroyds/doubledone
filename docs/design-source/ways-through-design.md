# "Ways through" — the stuck-task companion (design + copy pass)

*Produced 2026-07-25 by a 13-agent design pass: four designers (ADHD lived experience, autistic
predictability, RSD/shame, product minimalism) each drafted the flow and its copy, each draft was
attacked by two adversaries hunting shame, nagging and social pressure, and the survivors were
synthesised. The trigger is USER-INITIATED (Melroy's call): the user taps a control and chooses
their own task, so the app never notices or judges an avoided task. All copy below is final and
shippable. NOT YET BUILT, pending Melroy's read.*

---

## 1. Feature name

**Ways through.**

It appears in the UI exactly once, as the eyebrow on the picker screen. There is no onboarding for it, no menu item named after it, no coachmark. A calm app should not hand this audience another proper noun to learn.

---

## 2. Where the entry point lives

**A quiet text line on Today, in the helpers band above the task list, sitting directly ABOVE the existing "Focus on one thing" line.**

Label: **`Stuck on one thing`**
Accessibility label: `Stuck on one thing. Find a way through it.`

It renders on every live day, ungated. It is **not** gated on `spreadable.length > 0` (the way `focusEntry` is at `today.tsx:1628`), which is exactly why it goes above Focus and not below: Focus disappears on an empty day, so anything under it moves. The unconditional line has to be the top one or it is not in the same place every day. On a day with nothing on the list, the line is still there and it opens straight to the text field, because the thing you cannot start is very often the thing you could not bear to write down.

It hides only once the day is closed. A closed day is a finished emotional state and this flow will not reopen it.

**Why a paralysed person finds this and would not long-press a row:** the long-press is invisible enough that the app ships a coachmark to teach it (`today.holdHint`), and even a user who knows the gesture has to first decide which row to press, which is the blocker itself. This line is legible from across the room, needs no gesture, and lets you say "stuck" before you know what you are stuck on. It also reaches things that are not rows at all.

Chosen over "I'm stuck on something": a first-person label makes the user assert something about themselves every time they pass it, on the home screen, every day. Chosen over "Stuck on something?": permanent furniture should not ask you a question about your state each morning. "Stuck on one thing" is parallel with "Focus on one thing", it is a situation not a confession, and it puts the stuckness in the task.

---

## 3. The picker (the dangerous part)

### Structure, in order down the screen

A full-screen modal reusing the shipped Focus modal's shape and exit control.

1. `Close` (top left, same position as `focusExit`)
2. Eyebrow: **Ways through**
3. Heading: **The one that won't start.**
4. Supporting line: **Type it, or pick one from today. Nothing changes by picking.**
5. **A text field.** Placeholder: **Ring the dentist, open the mail…**
6. Quiet label: **or one from today**
7. The list of task titles.

**The field is above the list. That is the single most important decision on this screen.** The first thing a person sees after admitting they are stuck is open space, not their own undone work. It also means the escape hatch for something not on the list is not sitting under forty rows, and the screen never presupposes that the answer is already visible.

### Contents

Exactly the shipped `spreadable` array: today's open, non-recurring, not-done-today tasks. Nothing else. Not Later, not any other date, nothing completed, no recurring tasks. Recurring is excluded because `canBreakdown`, `canTiny` and `canMoveTo` are all false for repeats, so a repeat would land on a card with most of its doors missing.

Do not build a second list. Render the same rows, the same component, the same array the Focus picker already renders.

### Order

Identical to the Today list behind it. Pin first, then the user's accepted manual order. Never by age, never by "most avoided", never AI-ranked, never re-sorted by anything the app inferred. The thing is where the thing was.

### Cap

**None.** This is a reversal of three of the four drafts and the reasoning is a code fact: `tasksForToday` returns `t.due == null || t.due <= todayIso`, so Today is a rolling accumulator of every undated and every overdue one-off. The array is append-ordered. Therefore "show the top five of Today" is not neutral truncation, it is **an age filter**, and it would render the user's five oldest surviving tasks every single time they admitted to being stuck. That is constraint 1 broken by construction, with no number on screen. A cap also invents a new question the user cannot answer: what is behind it, and is it worse.

No cap, no "show more", no "+12 others", no scrollbar-as-quantity worry. The list simply continues below the fold, in the order it was already in, and the field sits above it so the pile is never the opening image.

**Prerequisite bug fix, required before this ships:** `focusScreen` (`today.tsx:2876`) is `flex: 1, justifyContent: 'center'` with no ScrollView anywhere in that Modal. A long list is currently centred and amputated at both ends with no way to reach the cut rows. Wrap the list in a ScrollView and stop centring an overflowing child. This is a live bug in the shipped Focus picker too.

### At 40 open tasks

It shows 40 and **says nothing about it**. No count, no "that's a lot", no lighten-the-day suggestion, no comment of any kind. Commenting on the length is noticing, and noticing is the one thing this flow must never do. The user sees the field first, and the rows are the same rows they were looking at ten seconds ago.

### Per row

The title. Nothing else. No dates, no chips, no pin marks, no "big" tag, no step counts, no repeat glyphs, no numbering, no colour coding, no icons. Exactly as `focusPickItem` already renders.

Row accessibility label: `Find a way through {title}` (a fork, **not** the shipped `focusOnTaskA11y: 'Focus on {title}'`, which would tell a screen-reader user in this flow to focus on the thing they cannot start).

### Something not on the list

The field takes it. Three words is enough. This covers the task that was never captured, the one on next Tuesday, and the one that only exists in your head.

**Typing surfaces nothing.** No match-as-you-type, no suggestions, no filtering of the rows below. Cut deliberately: it is the only mechanism in any draft by which a Later or backlog item could be rendered without being asked for, and it reflows the screen under the user's thumb, which breaks the no-surprise-motion rule.

**Typing creates nothing.** The doors open on the words. A task exists only if a door that needs one is taken, and that door says where it lands before it lands.

**Silent dedupe on commit:** if the typed text case-insensitively matches an open task the user already has, the flow acts on that task instead of creating a twin. No message, no "you already have this", and it is **not** moved to today. The user asked for it by name, so using it is not the app reorganising anything, and telling them about it would be a small scold.

### Backing out

`Close` exits to Today from anywhere in the flow, in one gesture, from the same corner. No confirm, no toast, no "are you sure", no follow-up, no record shown to the user that the flow was ever opened.

### Why this does not read as a backlog

The rows are strictly a subset of what was on screen one second earlier, in the same order, stripped of every piece of metadata. Nothing is revealed. Nothing is ranked. Nothing is hidden. The eyebrow is a forward-looking offer ("Ways through"), not a label over a pile, and the heading names the task's state, never the person's. The word "stuck" does not appear anywhere above the list.

### Every word on the picker screen

```
Close
Ways through
The one that won't start.
Type it, or pick one from today. Nothing changes by picking.
[ Ring the dentist, open the mail… ]
or one from today
<task titles>
```

On an empty Today the screen is identical with the last two parts absent. Same eyebrow, same heading, same supporting line, same field. No special empty-state copy, no "your list is empty", nothing conceding that you should not be struggling given how little you have on.

---

## 4. The doors

**There is no doors sheet. The picker routes into the existing held card, opened on the chosen row.** Three of the four doors in the brief already ship, the card was rebuilt to lead with the stuck-helpers on 2026-07-25, and a parallel menu of parallel actions is exactly the creep a calm app dies of.

**The rule this buys, and it is the best thing in the design: the held card does not know how you got there.** Long-press or Ways through, it renders identically, always. That also means the buddy door is permanently on every held card, so a user who knows the gesture gets it too.

### On a real task (the shipped card, one row added)

| # | Label | Sub-label | Maps to |
|---|---|---|---|
| 1 | **Break it down** | into small steps | Existing Break it down (tinted hero row, unchanged, manual twin when AI is off) |
| 2 | **Make it tiny** | the first step | Existing Make it tiny, unchanged |
| 3 | **Ask someone to sit with you** | they don't have to help | **NEW.** The share sheet below |
| 4 | **Move to…** | (none, the ellipsis says a date picker follows) | Existing Move to, unchanged |
| 5 | **Mark as a lot** | (existing) | Existing, unchanged |

Then `More` as it is today, then the hairline row: `Close` · `Select more` · `Remove`.

Five visible rows, not four. **"Mark as a lot" is not demoted into More.** It is the user's own capacity self-advocacy, it feeds the weight gauge and unlocks "Lighten today", and trading it for a social ask would put a friend above the user's stated limits.

**"Remove" is not renamed to something softer.** Guilt-free is delivered by the undo, not by an adjective, and making a destructive control more inviting is a bad trade on a card reached by long-press all day. Its recurring variant stays "Skip today".

The card gates itself as it already does: Break it down and Make it tiny hide on a task already in steps. Whatever the card does, it does here. No fork.

### On something typed (a provisional card, same component)

Title is the typed text. One quiet line under it: **Not on your list.**

1. **Break it down** / into small steps
2. **Make it tiny** / the first step
3. **Ask someone to sit with you** / they don't have to help
4. **Move to…** / another day
5. Hairline: `Close` (left) · `Let it go` (right, quiet, not the danger colour)

Each creating door states the consequence at the point of consequence, not as a rules summary up front:

- Break it down review screen gains one line: **These go on today.**
- Make it tiny confirm gains one line: **This goes on today.**
- Move to gains one line: **This goes on the day you pick.**
- Ask someone creates nothing and says nothing about it.
- Let it go creates nothing, removes nothing, and shows: **Let go. Nothing to carry.**

---

## 5. The share message

### The sheet

```
Ask someone to sit with you

Working next to someone, even quietly, makes starting easier for
a lot of people. Some call it body doubling.

[ editable message field, pre-filled, keyboard not raised, cursor not placed ]

This is all that gets sent. Change any of it you like.

Add the task

        Send it

It only goes when you pick someone.

Close
```

### The draft

> Hey. I'm making a start on something today and it goes better with company. Could you be around for twenty minutes or so, on a call or just on text? Nothing for you to do, and no need to talk. Either way is fine.

Four decisions inside it.

**No diagnosis and no trait.** It does not say "I'm stuck", it does not say "I can't start things on my own", it does not mention focus, ADHD, or executive function. It describes the activity, not the sender.

**One out, not three.** "Nothing for you to do, and no need to talk" is the body-doubling fact, and "Either way is fine" hands the friend a costless no. That is one apology, not four. Stacked reassurance teaches the sender that this is a big ask.

**A bounded, small amount of time.** "Can you help me" is open-ended and open-ended is unaskable. "Twenty minutes or so" is soft enough that the sender has not booked themselves a witnessed deadline.

**The task is not named.** Not by default and not by a setting. "Sit with me while I do a thing" is a much lower-stakes ask than naming the tax return, which invites questions about the tax return. Task titles in this app are raw private phrasing and seeing one already pasted into an outgoing message is a jolt.

### Review and edit

The whole message is in a plain editable field, fully visible, before anything is sent. Nothing is hidden behind a scroll. **`Add the task`** is a one-tap insert, not a toggle: it inserts the sentence **`It's {title}.`** after the first sentence, as ordinary editable text the user can then change or delete. It is not remembered between uses, so there is no stored decision about how much of yourself you usually reveal, and no new setting.

`Send it` hands the text to the OS share sheet (`Share.share` on native, `navigator.share` then clipboard on web). No contacts access, no new permission, no contact picker, no directory, no matching, no marketplace, ever. On a device with no share support the button reads **`Copy the message`** and afterwards, once: **`Copied.`**

**After the share sheet closes, the app says nothing.** No affirm, no "hope that helps", no follow-up ever. This is absolute. The app cannot tell a send from a cancel (see the comment in `lib/share.web.ts`), so any congratulation lands squarely on the person who opened their contacts, lost their nerve, and backed out. Praise for a brave thing you know you did not do is a precise humiliation.

Nothing anywhere in the flow asks whether they replied, whether they said yes, or whether it helped.

---

## 6. Every remaining user-facing string, final

**Today screen**
- Entry: `Stuck on one thing`
- Entry a11y: `Stuck on one thing. Find a way through it.`

**Picker**
- Exit: `Close`
- Eyebrow: `Ways through`
- Heading: `The one that won't start.`
- Supporting: `Type it, or pick one from today. Nothing changes by picking.`
- Field placeholder: `Ring the dentist, open the mail…`
- Field a11y: `What the thing is`
- List label: `or one from today`
- Row a11y: `Find a way through {title}`

**Provisional card**
- Under the title: `Not on your list.`
- Let it go affirm: `Let go. Nothing to carry.`
- Let it go a11y: `Let go of {title}`

**Consequence lines (new, one each)**
- `These go on today.`
- `This goes on today.`
- `This goes on the day you pick.`

**Share sheet**
- Heading: `Ask someone to sit with you`
- Body: `Working next to someone, even quietly, makes starting easier for a lot of people. Some call it body doubling.`
- Hint: `This is all that gets sent. Change any of it you like.`
- Insert control: `Add the task`
- Inserted sentence: `It's {title}.`
- Primary: `Send it`
- Under primary: `It only goes when you pick someone.`
- Fallback primary: `Copy the message`
- Fallback confirmation: `Copied.`
- Exit: `Close`
- Row a11y on the card: `Ask someone to sit with you while you do {title}`

**Required global copy fix, outside this flow but reached by it**
- `today.tinyAlreadyActive`, currently `You already have a tiny step for this. Finish that one first.` becomes **`There's already a tiny step for this one.`** with a `Show it` action beside it. Fix all four locales. "Finish that one first" is a rebuke, and entered two seconds after someone admits they are stuck it reads as "you did not finish the last easy thing I gave you."

Everything else in the flow is a shipped string, reused unchanged: `Close`, `Break it down`, `into small steps`, `Make it tiny`, `the first step`, `Move to…`, `Mark as a lot`, `More`, `Select more`, `Remove`, `Skip today`, and the existing Move and Remove affirms. **This flow invents no new affirms except the provisional Let-it-go one.**

---

## 7. Shame checklist

Check every change to this flow against all of it, forever.

1. **No age, anywhere.** No dates, no "added on", no move count, no "still here", no ordering by age or neglect. If a change makes the picker's order depend on anything other than the user's own Today order, it is linger data in disguise, whatever it is called.
2. **No cap that selects.** A cap over an append-ordered accumulator is an age filter. If someone proposes limiting the picker, they must first prove the ordering is not age-correlated. It is.
3. **No counts.** Not "3 more", not "showing 5 of 12", not a badge, not a total, not a comment on how full the list is.
4. **The list reveals nothing new.** Every row must have been on Today one second earlier. No Later, no other dates, no completed, no "recently touched", no AI ranking, no energy match.
5. **Typing surfaces nothing and saves nothing.** No suggestions, no live filtering, no reflow under the thumb, no record created until a door that needs one is taken, and that door says where it lands.
6. **No question about the user's state.** Not on the entry line, not in a heading, not in a placeholder. "Why", "what's stopping you", "how long", "no one to ask?", and "is everything okay" are all banned. Invitation, never interrogation.
7. **The word "stuck" never sits above a list of tasks.** It is allowed on the entry line, where it describes a situation the user chose to name. Above rows it turns a plan into a docket.
8. **No "yet".** "Nothing changes yet" promises that something is coming.
9. **Silence after the share sheet.** The app cannot know what happened and must never guess, congratulate, or ask.
10. **No follow-up on any exit.** Close is free from every screen, from the same corner, with no confirm and no return visit.
11. **The card renders identically however you reached it.** If it ever forks by entry point, that is a surprise, and surprise is what this audience pays for.
12. **No new setting and no new permission.** The task-name insert is a one-tap text edit, never a remembered toggle.
13. **Telemetry is one-way.** Log that the flow opened and which door was taken, pseudonymous, no task text, no user id, **no per-task counter**. Nothing derived from this flow may ever render back to the user, in the Lookback or anywhere else. A per-task struggle count is linger data one product decision away from being surfaced.
14. **Affirms must be true.** Do not say a thing is safe somewhere it is not, do not say something was removed when nothing was, do not say the hard bit is done when the app cannot see whether it happened.
15. **Never provide a buddy.** No matching, no directory, no suggested contact, no strangers. The app normalises the ask and hands over the share sheet. That is the entire permanent scope.

---

## 8. What I cut, and why

- **Cadence rules, linger computation, "don't ask me again", heavy-day suppression.** Pre-cut by the user-initiated trigger. The app never forms an opinion, so there is nothing to tune.
- **The five-row cap.** It looked like the kind decision and it is an age filter over an append-ordered accumulator. This is the single biggest reversal in the whole design.
- **Match-as-you-type.** It was the backlog's side entrance, and it reflowed the screen mid-keystroke.
- **A Someday bucket.** `due: null` does not park anything, `tasksForToday` puts undated tasks back on Today every morning, and onboarding already promises "Everything starts on today". Promising "it's safe there" and handing the task back tomorrow is the one broken promise that would cost trust permanently. A real Someday is a separate feature with its own cost and it is not being smuggled in here.
- **A separate doors sheet.** The held card is the doors. A parallel route to a parallel menu is creep.
- **Renaming Remove.** The undo delivers guilt-free. A prettier word on a destructive control is a bad trade.
- **Demoting "Mark as a lot" into More.** It is capacity self-advocacy and it feeds the weight gauge. Five visible rows is the honest answer.
- **The post-share affirm.** All eight adversary passes hit it. It fires on the person who backed out.
- **A persisted "include the task" toggle.** A setting, and worse, a stored decision about how much of yourself you disclose.
- **The energy match ("What fits right now?") inside this picker.** It is metered, and it is a machine forming an opinion at the most fragile moment in the app. Wrong twice.
- **A "did that help?" follow-up, and any post-flow check-in.** Ever.
- **A contact picker.** Needs a permission, and the share sheet is the right mechanism anyway.
- **A named feature in the UI beyond one eyebrow, plus any onboarding, coachmark or tour for it.**
- **Recurring tasks.** Three of five doors do not apply to them.
- **Special empty-day copy.** Same screen, fewer parts.
- **"Just today. The rest can wait." in this context.** True on Today, false in a picker that may hold forty accumulated tasks.

**Ship order.** Two releases. Release one is the card row and the share sheet alone: one row, one sheet, zero new navigation, and it delivers 100% of the genuinely new capability, since the other three doors already ship. Then the entry line, the picker and the ScrollView fix. If the buddy door goes unused after release one, the entry point is a discoverability question worth answering with five real users, not with a chart, because the telemetry cannot separate "nobody wanted it" from "nobody found it".

---

## 9. The single riskiest remaining thing

**The flow's best door hands a person at their most fragile to another human the app cannot vet, and the reply is the one part of this the app has no way to absorb.**

Everything else here fails safely. A picker nobody opens just sits there. A door nobody taps costs nothing. But "Ask someone to sit with you" is the only path where the feature can actively cause harm rather than merely fail to help: someone with rejection-sensitive dysphoria spends real courage, sends the message, and gets back silence, or "why can't you just do it", or nothing for two days. The copy pre-approves a no. It cannot pre-absorb contempt or a non-reply, and the app deliberately never follows up, so it will not even know it happened.

I would still ship it. Body doubling works, no other product for this audience normalises the ask, and the alternative is leaving the aloneness blocker with zero coverage. But it is the one door where the person can end the flow worse off than they started, and no wording fixes that.
