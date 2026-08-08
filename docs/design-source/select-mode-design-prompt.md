# Design prompt: select mode, the congruency pass

*For Claude Design. Written 2026-08-08, the day the held card v2 shipped. The founder's brief,
verbatim: "Congruency is the key." Select mode is now the last surface on Today still speaking
the pre-v2 language: bare text links floating at the bottom of the screen, next to a card that
has grown a rail, a shelf, and a grammar. Bring it into the family.*

---

## The product, in five lines

DoubleDone is a calm, never-shame daily to-do app for ADHD, autistic, AuDHD and OCD minds.
The home screen is Today, a finite achievable list. The palette is Dusk (dusty mauve, sage,
cream, periwinkle; warm dark and warm light schemes). Two appearances: **Standard** (soft
cards, hairline borders, gentle elevation) and **Quiet** (chrome-free, whitespace separates).
Four languages (EN/ES/FR/IT), so labels vary widely in length. The one law: nothing may ever
shame, rush, or score the user.

## The design language it must join (held card v2, live)

The card now speaks in four grammars: full-width **label rows** for verbs that dismiss; **the
rail**, a segmented hairline-bordered control for act-and-stay; a **fold** whose unavailable
items dim in place with an honest reason; and **the shelf**, a quiet surface-tint band rounded
into the card's bottom corners (top hairline; `rgba(0,0,0,0.16)` dark / `rgba(43,39,34,0.035)`
light) holding the way out. Premium wears a honey ✦, never a lock. Motion is a 180ms rise with
a small settle; reduce-motion is a designed 90ms dissolve. Congruency means choosing from THIS
vocabulary, not inventing a fifth grammar.

## The surface: select mode

Entered one way: hold a task → "Select more" (the task arrives pre-ticked). Every row becomes
a checkbox (selected rows currently take an accent border + tint). Capture and the day tools
hide while selecting. At the bottom sits the bar:

1. **The count line** — "Tap tasks to select" until something is ticked, then "{n} selected" —
   beside an underlined **Select all**.
2. **One row of bulk actions** (text links today):
   - **Done** — completes all selected.
   - **Move to…** — the date picker for all selected.
   - **Mark as a lot / Not a lot** — a toggle; reads "Not a lot" only when EVERY selected task
     is already marked.
   - **Combine** — appears ONLY when 2+ selected tasks are combinable; the AI merge of
     near-duplicates, and the action that justifies multi-select existing at all.
   - **Remove** — danger-soft, never red-alarmed. On a single selected REPEATING task the
     accessibility wording becomes "skip today; the series continues".
   - Disabled state today: links dim when nothing is selected.
3. **Cancel** — below the row, exits select mode.

## What you may rethink

The bar's entire form (a shelf-band it shares blood with? something anchored and calm?); where
the count lives and how it breathes as it changes; Select all's shape; the disabled grammar
(dim-in-place is the house rule); how Combine earns visual prominence as the surface's hero
without shouting; Remove's distance from the frequent actions; Cancel's place as the way out
(the shelf's Close is precedent); the selected-row treatment so list and bar feel like one
mode; motion for entering/leaving select mode (with its designed reduce-motion variant).

## Hard rules (non-negotiable)

- **Bulk-only, forever.** Every single-task action lives on the held card. Do not add any
  back here, do not add new actions, do not remove capabilities.
- Combine renders only when eligible (2+ combinable); the bar must not reshape when it
  appears or vanishes mid-selection — reserve its place or design for its arrival.
- Remove keeps skip-today semantics and wording on a lone repeating selection.
- Minimum 44px targets; disabled dims in place, never disappears; Remove far from the
  frequent actions; never red-alarmed.
- Both appearances (Standard, Quiet) and both schemes (warm dark, warm light). Labels must
  survive French and Italian without truncation ("Marquer comme beaucoup" is real).
- Screen-reader parity: count changes announced; the toggle names its direction; Remove
  names its true consequence.
- React Native primitives only: View, Text, Pressable, opacity/transform animation. No blur,
  no backdrop-filter. The bar lives on Today (no modal, no sheet), above the safe area.

## Deliverable

Same shape as the held-card v2 handoff: a zip whose README is the contract — layout, spacing
(4px-ish scale), type roles, colour usage in Dusk terms (accent, accentSoft, ink, inkSoft,
inkFaint, surfaceCard, line, danger-soft), the motion spec with reduce-motion, the Quiet
variant, accessibility notes. Boards: empty selection, 3 selected (Combine present), all
selected, a lone repeating task selected (the skip-today wording), Standard/Quiet × dark/light.
