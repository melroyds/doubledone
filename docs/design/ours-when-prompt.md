# Design prompt: changing WHEN on a shared row

*Paste into Claude Design. Written 2026-08-13, after Melroy found that a shared row's date and
rhythm can be set once and never changed.*

---

## The product

DoubleDone is a calm daily to-do app for people who find to-do apps overwhelming. Built with ADHD,
autistic and OCD friends in mind. It is live on web, the App Store and Google Play, with paying
subscribers.

The spine: **today is finite and achievable.** The home screen is Today, sized to be doable. Every
decision serves protecting someone from the overwhelm of their whole list. There are no streaks, no
scores, and nothing that shames a task for existing.

**Ours** is a shared list between exactly two people. It has three inviolable laws:

1. **Nothing is ever attributed.** There is no field anywhere saying who did a thing. A done row is
   just done.
2. **Nothing counts or compares** between the two people.
3. **Nothing moves because the other person acted.** You find things changed when you look, like a
   kitchen table.

## The problem to solve

A shared row can carry **a date** ("Thursday") or **a rhythm** ("Every Thu"), never both. Those are
what make it appear on both people's Today screens on the day. An undated, non-repeating row stays
on the shared list and never reaches anybody's Today, which is the rule that stops one person making
the other's morning heavier.

**You can set a date or a rhythm once. You can never change either, and you can never clear either.**

- Set it to tomorrow, and it is tomorrow forever.
- Make it repeat weekly, and it repeats weekly forever.
- No way back to a plain, dateless row.

The only escape is to remove the row and re-create it, which on a repeat is the action that ends the
series for both people.

**Why it happened, which matters for the fix:** dated shared rows are two days old. Before that a
shared row had no date, so nothing was missing. **The field grew and the editing surface did not
follow it.** Design something where that cannot silently happen again.

## What exists today, and must be respected

**The room** (the shared list screen). Press and hold a row and it opens a held card offering:
Rename (inline, on the title), **Set a rhythm**, **Bring to my Today** (undated rows only), Remove.
There is no date control at all.

**`CadenceSheet`** is the existing rhythm editor, shared by the room and the personal Repeating
drawer. It is a modal sheet: an editable title, a cadence choice (Daily / Weekly with weekday
toggles / Every N days), an optional one-line note the caller supplies (the room passes "You'll both
see it on its day"), and Save. **It has no way to express "no rhythm".** Its `onSave` hands back a
title and a recurrence, so it cannot currently say "none".

**Today's own held card** solves the same problem for personal tasks with a **"Move to…"** action
that opens a month-grid date picker in a modal card, with a Tomorrow shortcut. That pattern is
proven and familiar to existing users.

**The capture bar** on the shared list already asks this question well, and its answer is the
vocabulary to stay consistent with: a single door labelled with what is currently set, opening a row
of choices reading **Anytime · Today · Tomorrow · Pick a date**, plus a separate **Repeating** row
underneath. "Anytime" is the calm default and means "lives on the list, reaches nobody's day".

## Constraints

- **A date and a rhythm are mutually exclusive.** Setting one must clear the other, and the design
  must make that obvious BEFORE the tap, not as a surprise afterwards.
- **Two people read this.** Any change is visible to somebody else within fifteen seconds. The design
  must never imply the other person did something, and must never name them.
- **Never shame.** No "overdue", no red, no "you set this 3 weeks ago". A date passing is not a
  failure.
- **Clearing must be as easy as setting.** Going back to a plain row is a legitimate, common thing to
  want, and it is currently impossible.
- **No new settings.** The product rule is "remove friction, never add a setting".
- **Voice:** calm, plain, no exclamation marks, **no em-dashes at all**, minimal semicolons. Never
  clinical: no "treatment", "therapy", "symptoms".
- Must work at the largest accessible text size, on a phone, one-handed, in five languages
  (en/de/es/fr/it) where strings run up to 40% longer than English.

## What to design

**The way a person changes, or clears, WHEN a shared row happens.**

Some questions worth answering rather than assuming:

- Is this one control or two? The capture bar treats "when" and "repeating" as two rows behind one
  door. The room currently treats rhythm as its own sheet and date as nonexistent. **Should the room
  match the capture bar it sits directly above?** There is a real argument that the place you SET a
  thing and the place you CHANGE it should look the same, and a real counter-argument that a held
  card is not a capture panel.
- Where does clearing live? A "None" chip among the others, a separate clear action, or does
  selecting the currently-selected option toggle it off (which the capture door already does for
  repeats)?
- Does `CadenceSheet` grow a "no rhythm" option, or does the whole thing move to a different shape?
  It is shared with the personal Repeating drawer, so changing it touches a second surface.
- How does a person understand that setting a date **removes** a rhythm? The capture bar's answer is
  a summary line that always states what is currently set.

## Deliverables

1. The **held card** for a shared row, in each meaningful state: plain, dated, repeating, and a
   repeat this build cannot read (shown, never editable).
2. Whatever **sheet or picker** the change happens in, in each state, including how a person gets
   back to a plain row.
3. The **wording**, exactly. Every label, every summary line, every confirmation. Copy is the design
   here more than the layout is.
4. A short note on **what you deliberately did not build**, and why. That section usually carries the
   most value.

## What NOT to do

- No "are you sure?" dialogs. Undo beats confirm, everywhere in this app.
- No red, no warning triangles, no urgency.
- No date arithmetic shown to the user ("in 3 days", "2 weeks overdue").
- Nothing that reveals or implies which person set the date.
- No new top-level navigation. This lives inside the row you are already holding.
