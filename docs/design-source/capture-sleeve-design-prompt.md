# Claude Design prompt: DoubleDone, the capture sleeve

Redesign how a person adds a task in DoubleDone. The direction is decided: **at rest, capture is one + button on the right, under the thumb. Tapping it slides a slim input out of the button, like a sleeve.** Work out how that looks and behaves end to end, without losing a single thing the current composer can do.

## The product

DoubleDone is a calm, never-shame daily to-do app for adults with ADHD, autism, the AuDHD overlap and OCD. It is live on web, iOS and Android. The spine: **today is finite and achievable.** The standing rule: **remove friction, never add a setting.**

Brand "Dusk": Newsreader serif for headings, Atkinson Hyperlegible for body, a mauve accent (#946475 light, #C68BA0 dark), warm paper (#FAF6F1) and a full dark mode (#1B1917). There are seven colour themes, and the accent changes with each. A Premium "Quiet" appearance strips the chrome back to calm text. The app is in five languages (en, de, es, fr, it), and German and French run long.

## Why now

The attached Today v3 is the current preview: a "Today · Ours" tab heading, a Right now card near the top, and a one-line composer docked at the bottom. A fresh pair of eyes looked at it and said "what?". Nothing felt different enough. Her suggestion for capture was a + on the right with the input sliding out of it, which is exactly what the founder had pictured. So this round should be **visibly bolder than v3, and still calm.**

## What capture must still do (every item reachable and obvious)

- **One line is one task. Several lines are a brain dump**, one task each, in the order typed, with leading bullets stripped. The multi-line brain dump is the app's founding gesture: first-class, never behind a door.
- **Add names its consequence before the tap:** "Add", "Add 3", "Add · Tomorrow", "Add 3 · Weekly on Mo, We".
- **When.** A day: Today, Tomorrow, Pick a date, with Anytime first on the shared list. Or a rhythm:
  - Daily.
  - Weekly, with seven weekday circles.
  - Every few days, with a 2 to 30 stepper.
  - Monthly, with a 1 to 31 grid and "Short months use their last day."

  "Starting from" appears whenever a rhythm is set. Steps is a stepper (none, or 2 to 50). It is disabled with a stated reason for a multi-line entry or a repeating task, and it never disappears. One summary line joins it all: "Today · Weekly on Fr · 3 steps".
- **Speak** (dictation on web and iOS; Android relies on the keyboard's mic) and **Scan** (a photo of a list; Premium, with AI on).
- **The AI shapers**, on Today with AI on only:
  - Break it down, for one line.
  - Sort for me, for two or more lines.
  - Tidy this into tasks, for one long run-on line.
- **One AI note** that names only what this surface actually has. It must never mention Sort on the shared list.
- **Errors and busy states.** An error stays visible until the next keystroke. While an AI action runs, a spinner sits in that control only and the input is read-only.
- **Just added.** A new row gets a soft tint and a "just added" mark while you keep adding. A screen reader hears "Added." or "Added. Tomorrow.", and focus stays in the input for the next line.
- **Seeding.** Shared text, the launcher's "Brain dump" shortcut and Scan all land in the input, appended under any draft, with the input focused.
- **The shared list ("Ours") uses the same capture**, with four differences:
  - It rests on Anytime.
  - It has no Steps and no AI shapers.
  - A one-line note beside When says what a day means there ("You'll both see it that day.").
  - The placeholder is "Add to {list name}".

## Hard constraints

1. **Text is never lost.** Tapping away, ticking a task, opening When, a Scan or a share never clears what is typed. Only Add, an accepted breakdown or a successful Sort does.
2. **The keyboard.** Nothing on this stack lifts bottom UI by itself: Android is edge-to-edge, and Chrome overlays the keyboard. The sleeve and everything it opens must sit above the keyboard. Show the keyboard-up state on a small phone.
3. **One-handed.** The + and Add sit at the right thumb, nothing destructive is on the reflex path, and every target is at least 44pt.
4. **Predictable.** The + is always in the same place. Nothing appears or vanishes as you type in a way that moves something else; a control that cannot act dims in place and says why.
5. **Screen readers and switch access.** The + is a real button with a name and an expanded or collapsed state. Focus moves into the sleeve on open and back on close.
6. **Reduced motion.** The sleeve still works as a short fade or a cut. Design that variant properly.
7. **The list stays reachable.** The resting + must never cover the last task or a row's own controls, and the list scrolls clear of it.
8. **No new settings.** No badges, counts, streaks or red.
9. **Every look.** Quiet appearance, dark mode, the seven themes, the largest text size, and long German strings.
10. **Wide web (desktop).** Decide whether the sleeve stays bottom-right or becomes an inline line under the list, and show it.

## A reversal to design against

An earlier capture brief said "not a floating action button". This round deliberately reverses that: the + IS the resting state. Make it feel like DoubleDone, soft, warm and unmistakably the one way in, not a Material FAB. Explore:

- whether it carries a word ("+ Add") or only the mark;
- whether it floats over the list or rests on its own quiet strip;
- how it relates to the Right now card above, so the screen has one clear top and one clear bottom.

## Directions to explore (three genuinely different ones)

- **The sleeve slides left out of the +** to near full width, one line tall. When and the AI shapers ride a small tray just above it, only while it is open.
- **The sleeve grows up into a small sheet.** The + becomes the Add button at its corner, and When is the sheet's second row.
- **The sleeve is minimal:** input and Add only, with When, Steps and the AI behind one clearly labelled door inside the sleeve.
- **Anything better.** These are the current understanding, not a constraint.

For each direction, say exactly what happens to Speak, Scan, Break it down, Sort for me, Tidy, Steps, the When door, the AI-off variant and Ours.

## Screens to produce (mobile, light and dark Dusk)

1. Today at rest with the + (a real-looking day: 5 or 6 tasks, one repeating, one done).
2. The sleeve opening, in two or three frames, keyboard up, on a small phone.
3. Typing one line, with Add reading "Add · Tomorrow".
4. A five-line brain dump, with Sort for me available.
5. Adding a weekly task, end to end.
6. Two tasks added in a row: the tint visible, the sleeve still open.
7. Ours with the sleeve (Anytime and its note).
8. AI off, the Quiet appearance, and the largest text in German.
9. Wide web.
10. Tapping away with half a sentence typed, and where those words wait.

## Deliver

A handoff README like the previous rounds:

- exact measurements on the live tokens;
- every string, with new ones listed for translation into five languages;
- motion timings, with the reduced-motion variant;
- accessibility notes;
- what was left out on purpose.

## Not this

- Not a restyle of the rest of Today: the heading, Right now and the list stay as they are.
- Not a feature cut.
- Not a modal wizard or a multi-step form.
- Not the bedtime capture on a closed day, which follows whatever pattern wins here.
