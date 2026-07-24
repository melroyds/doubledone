# Claude Design prompt — DoubleDone "Held card" (the tap-and-hold task menu)

Redesign the **tap-and-hold menu** for a single task in DoubleDone. Explore genuinely different, calmer, more scannable ways to present one task's actions, not just a restyle of the current grid. Give me 3 to 4 distinct directions.

## The product
DoubleDone is a calm, never-shame daily to-do app for adults with ADHD, autism, the AuDHD overlap and OCD. Its home screen is **Today**, sized to be doable. The brand is "Dusk": **Newsreader** (a warm literary serif) for headings, **Atkinson Hyperlegible** for body, a soft **mauve → honey** accent, a warm off-white default with a full dark mode (most users are on dark). The tone is quiet and reassuring, never a nag, never a streak, never a control panel.

## The surface being redesigned
On the Today list, pressing and holding a task reveals that task's own actions **in place**: the row expands into a card where it sits, the list does not jump, and the screen never flips into a checkbox/edit mode. It is the one and only single-task action surface in the app.

**The problem to solve.** Today the held card is a flat wall of ~11 text labels stacked in wrapping rows of roughly equal visual weight. It is complete but hard to scan, it reads like a settings panel rather than a gentle hand, nothing signals which actions are the common helpful ones versus the rare ones, and cramming same-weight labels into tight rows has already caused text to clip on dense devices. Holding a *dreaded* task and being met with a dense control grid is the opposite of the calm the app promises.

**What good looks like.** Faster to scan. Action *types* are distinguishable at a glance without clutter. The most-reached-for, most-helpful actions lead; rare ones recede (progressive disclosure is welcome, as long as nothing common gets buried). The destructive action is unmistakably safe to sit near. The whole thing feels like help, not administration. And it stays complete: every action below still reachable.

## The full action set (open task) — keep all of these reachable
Grouped by intent (the grouping is a hint, not a mandate; propose your own if it reads calmer):
- **Reschedule** — *Tomorrow* (one-tap push to tomorrow); *Move to…* (pick a future day); *Remind me* (a gentle per-task notification; native only).
- **Make it approachable** — *Break down* (AI splits it into small steps, the help for the "wall of awful"); *Steps* (track it in manual steps, shows a quiet "2 of 5"); *Make it tiny* (shrink it to the smallest possible first action).
- **Weight** — *Pin* (hold it at the top of Today); *Mark as a lot* (flag it as heavy so finishing it celebrates bigger).
- **Terminal** — *Select more* (enter multi-select for bulk actions); *Remove*; *Close*.
- **The title itself** is tappable to rename the task in place.

**Completed-task variant (design this too, smaller).** When a *finished* task is held, the card is deliberately minimal: only *Done on…* (correct which day it was finished), then *Select more / Remove / Close*. No shaping actions (a finished thing needs nothing shaped), no "Done".

## Principles that make or break it (honour all seven)
1. **Never shame, and protect against the destructive tap.** *Remove* must read as calm and safe-to-sit-near, never punishing, and must never be where the thumb lands by default. For a **repeating** task, *Remove* means "skip today" (the series continues), so the wording/treatment must not imply deletion of the series. *Close* / leaving is always the safe, easy act and should own the easiest reach.
2. **In place, never a context switch.** The card belongs to the row it grew from; the list must not jump, reorder, or flip into another mode. The user never loses their place.
3. **Calm and predictable (autism-first).** Consistent layout every time, no surprise motion, no variable reward. The same task always offers the same things in the same place.
4. **A gentle hand, not a panel.** Lead with the few actions someone actually reaches for when stuck (Break down, Make it tiny, Tomorrow). Let the rare ones (Pin, Mark as a lot, Select more) recede or sit behind a calm "more". Reducing perceived density is the whole job.
5. **One-handed and reachable.** The card can appear anywhere in the list, top or bottom. Safe and common actions belong in the easy thumb zone; the destructive one does not.
6. **Accessible by construction.** Tap targets at least 44px, generous spacing, text that never clips at large system font sizes (this has bitten us), full screen-reader labels, gentle motion that respects reduce-motion.
7. **Two appearances.** It must work in both the **Standard** look (bordered cards, filled controls) and the **Quiet** look (chrome stripped, interactive elements as plain text separated by whitespace). Show how the design degrades gracefully into Quiet.

## Directions to explore (rethink the pattern, don't just restyle)
Give me distinct takes, each with a one-line rationale and its trade-offs. Consider, and feel free to go beyond:
- A **curated few + overflow**: 3 to 4 primary actions shown, the rest behind a single calm "More…".
- A **typed, sectioned card** where each intent group is visually its own calm zone (whitespace, a hair of tint, a quiet label), so the eye lands by purpose.
- A **bottom sheet** that rises from the thumb zone instead of expanding inline (weigh this against principle 2 — if it breaks "in place", say so).
- **Swipe or gesture** shortcuts for the one or two most common actions, with the full menu still available on hold.
- An **icon + label** treatment (the app is text-only today; you may argue for restrained pictograms if they aid scanning without adding noise), and a **text-only** treatment, so I can compare.
Each direction must still honour all seven principles and keep every action reachable.

## Screens to produce (mobile, in dark Dusk and light Dusk)
- **Open task held** — use real content: a normal task ("Valentina Taxes"), and a clearly dreaded/heavy one, so I can see how the "make it approachable" actions feel at the moment of stuckness.
- **Completed task held** — the smaller variant (Done on… / Select more / Remove / Close).
- **The Quiet appearance** of the open-task held card, showing the same design with the chrome removed.

## What it is NOT
- Not a new mode — it stays an in-place reveal on the row, never a full-screen or a list re-layout.
- Not a denser grid — the goal is *less* perceived density, not more labels packed tighter.
- Not icon-noise or novelty — calm, legible, predictable wins over clever.
- Not a place to drop or hide any existing action — reorganise and prioritise, never remove capability.
