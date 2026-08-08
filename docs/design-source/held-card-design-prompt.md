# Design prompt: the held card, second pass

*For Claude Design. Written 2026-08-08 after the free-reorder addition made the card "almost
nice" (the founder's words). The first pass (design 1a, 2026-07-25) is live and loved; this
is a refinement, not a teardown.*

---

## The product, in five lines

DoubleDone is a calm, never-shame daily to-do app for ADHD, autistic, AuDHD and OCD minds.
The home screen is Today, a finite achievable list. The palette is Dusk (dusty mauve, sage,
cream, periwinkle; warm dark and warm light schemes). Two appearances exist: **Standard**
(soft cards, hairline borders, gentle elevation) and **Quiet** (chrome-free, whitespace does
the separating). Four languages (EN/ES/FR/IT), so label lengths vary widely. The one law:
nothing may ever shame, rush, or score the user.

## The surface being refined: the held card

Long-press any task on Today and the row expands IN PLACE into that task's own action card.
Nothing else on screen moves, there is no modal and no mode to leave. This in-place quality
is load-bearing: do not replace it with a sheet, popover, or screen.

**Current contents, top to bottom (open task):**

1. **Title**, tappable to edit (faint underline is the affordance)
2. **Break it down** (the tinted hero row) · sub-label "into small steps"
3. **Make it tiny** · "the first step"
4. **Move to…**
5. **Mark as a lot** · "weight"
6. **↑ Move up | ↓ Move down** (NEW, a split row, free): nudges the task one place per tap.
   The ONLY action that does not dismiss the card (three places = three taps with the card
   held open). At an edge, its button dims rather than hides.
7. **More** (a disclosure) → Steps, Undo a step, Pin (premium; dimmed for free users, tap
   opens the paywall calmly), Remind me
8. A hairline, then the terminal row: **Close** (bottom-left, easy thumb reach) ·
   Select more · **Remove** (far right, away from the reflex path; reads "Skip today" on a
   repeating task)

**The done-task variant** is deliberately minimal: title with a tick, "Done on…", the
terminal row, and one line: a finished thing needs nothing shaped.

## Why a second pass now

- Design 1a promised "four calm helpers"; the card now shows six visible rows plus a fold.
  It works, but the calm is thinning.
- The reorder row was added by engineering to the existing grammar and reads bolted-on:
  two arrows in a row of full-width labels, no visual family of its own.
- The card can open very tall. A scroll-into-view fix now guarantees the whole card is
  visible, but height itself is the design problem: the card's bottom edge and its ending
  deserve intention (the founder noticed the ending first).
- The hierarchy has blurred. There are really four species of action on one card:
  *shaping* (Break it down, Make it tiny, Steps), *logistics* (Move to, reorder),
  *attributes* (Mark as a lot, Pin), and *meta* (Remind me, edit title, Select more).

## What you may rethink

Grouping and visual hierarchy of everything above; where the reorder pair lives and what it
looks like; whether the More disclosure earns its place or a better structure retires it;
how the card ENDS (the bottom edge, the terminal row's shape); the height budget and what
recedes; how Pin signals premium without nagging; motion on open/close (minimal, and a
reduce-motion variant that is a designed state, not an absence); the done-task card.

## Hard rules (non-negotiable)

- Minimum 44px touch targets. Buttons, never drag (screen readers, shaky hands).
- Every action reachable and labelled for a screen reader; state changes announced.
- The reorder pair must NOT act-and-dismiss; everything else does.
- An unavailable action dims, it never disappears (the card must not reshape under a
  hovering finger).
- Remove stays far from Close. Remove is never red-alarmed; calm, not scary.
- In place, never a modal. Both appearances (Standard and Quiet), both schemes (warm dark,
  warm light). Labels must survive French and Italian lengths without truncation.
- React Native primitives only: View, Text, Pressable, opacity/transform animation. No
  blur, no backdrop-filter, no gradients beyond what a solid tint can fake.
- No new actions, no removed capabilities, no paywall changes.

## Deliverable

Same shape as the Settle handoff that worked so well: a zip whose README is the contract —
layout and spacing (in a 4px-ish scale), type roles, colour usage named in Dusk terms
(accent, accentSoft, ink, inkSoft, inkFaint, surfaceCard, line), the motion spec with its
reduce-motion variant, the Quiet variant, and accessibility notes. Mockups of the open
card in all four combinations (Standard/Quiet × dark/light) plus the done variant and the
edge states (first task, last task, pinned task, free user seeing Pin).
