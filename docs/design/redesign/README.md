# Handoff: DoubleDone "Dusk, evolved" — holistic visual & motion redesign

## Overview
A top-to-bottom visual and motion pass over DoubleDone (the calm, ADHD/autism-friendly daily to-do app). The product logic already ships; this handoff is purely the **visual + motion layer**. It delivers four new things on top of the existing "Dusk" system:

1. A **living background** (time-of-day gradient that drifts slowly).
2. A **motion language** (one small set of durations/easings, reduced-motion rules).
3. A **reborn Today** screen (living background applied, soft elevation, and the crowded 4-link header solved).
4. The **completion moments** — a calm feedback ladder, with the **whole-task finish** as the centrepiece.

The never-shame spine is absolute: no streaks, points, overdue-red, guilt, or gamification. Calm is the product working, not a decoration.

## About the design files
The files in this bundle are **design references created in HTML** — prototypes showing intended look, color, type, spacing, and motion. They are **not production code to copy**. The task is to **recreate these designs in the existing DoubleDone codebase** (React Native + Expo, web + Android, one codebase) using its established patterns: `expo-linear-gradient` (already installed), `react-native-reanimated`, SVG, and the live tokens in `client/src/constants/theme.ts`. Evolve those tokens; do not fork a parallel style system.

- `DoubleDone Redesign.html` — the full redesign spec board (this is the primary reference; live animations show real proposed speeds).
- `DoubleDone System Pass.html` / `DoubleDone System Pass (Dark).html` — the already-calm surfaces (Lookback, Break-it-down, Premium, Settings, Sign-in, Privacy, Repeating, first-run) in light + dark. They inherit this system unchanged; use them for those screens' layouts.
- `DoubleDone Today Redesign.html` — the Today IA (Focus flow, tap-hold selection, close-the-day) the visual layer sits on.

## Fidelity
**High-fidelity.** Final colors, typography, spacing, radii, and motion timings. Recreate pixel-faithfully using the codebase's components. Exact values are in **Design Tokens** below.

---

## Design Tokens

### Colour — Light (evolve existing `theme.ts` light)
| Role | Hex | Use |
|---|---|---|
| Paper bg | `#FAF6F1` | base background (now under the living gradient) |
| Surface | `#FFFFFF` | cards/rows — now at ~0.92 opacity over the background |
| Ink | `#2B2722` | primary text (keep full opacity; never over the gradient directly) |
| Soft ink | `#7A7066` | secondary text |
| Faint ink | `#A89E93` | placeholder/meta |
| Hairline | `#ECE4D8` | borders/dividers |
| Accent (mauve) | `#9B6A7D` | single accent, sparing |
| Mauve tint | `#F1E7EC` | accent fill surfaces (Focus, selected) |
| Sage (done) | `#7E9B6B` | completion — never an alarming green |
| Sage tint | `#E9EFE2` | progress track |
| Periwinkle | `#6E72A0` | one-off task border + repeat ↻ mark |
| Brick (destructive) | `#A1554C` | Remove/destructive — never red |

### Colour — Dark (warm charcoal, lifted to clear WCAG AA)
| Role | Hex |
|---|---|
| Bg | `#1B1917` (Today night uses `#1A171C → #131017` gradient) |
| Surface | `#252119` (~0.86 opacity over bg) |
| Ink | `#F2EBE0` · Soft `#A89E93` · Faint `#7A7066` |
| Hairline | `#34302A` |
| Accent (mauve) | `#C68BA0` · tint `#352C32` |
| Sage | `#9DB98A` · track `#2A3024` |
| Periwinkle | `#8E97C8` · Brick `#D2887E` |

### The living background — "Dawn Wash" (recommended direction)
A vertical `expo-linear-gradient` whose stops are resolved from the device clock on app open, drifting gently within the phase. Two large blurred radial "light pools" drift behind it on slow Reanimated loops. **Phase = state, not motion** — the colour still applies under reduced-motion; only the drift stops.

Phase gradient stops (top → mid → bottom):
| Phase | When | Light | Dark |
|---|---|---|---|
| Dawn | 5–9am | `#FBEFE2 → #F6E3D6 → #F1E7EA` | `#221C24 → #1E1A22 → #1B1917` |
| Day | 9am–5pm | `#FCF8F2 → #FAF6F1 → #F7F1E8` | `#1E1B19 → #1B1917 → #191613` |
| Dusk | 5–8pm | `#F7ECE4 → #F1E2E0 → #E9DCE2` | `#231C20 → #1F1A1C → #1B1917` |
| Night | 8pm–5am | `#ECE6E6 → #E6DEE0 → #DED8DC` | `#1A171C → #16141A → #121016` |

Light pools (two blurred radial Views, ~280–300px, `blur ~16px`, drifting 40–53s loops):
- Light: pool1 `rgba(231,176,140,0.40)` (warm), pool2 `rgba(196,142,160,0.28)` (mauve).
- Dark: pool1 `rgba(110,114,170,0.34)` (periwinkle), pool2 `rgba(150,106,135,0.30)` (mauve).

**Legibility rule (sacred):** the gradient/pools only ever show in margins. Cards sit at ~0.86–0.92 opacity so body text is always full-contrast ink on near-opaque surface, never on the gradient.

The greeting + wind-down line derive from the same phase: "Good morning. Just today." (day) / "Winding down. Just today." (evening).

### Motion language
| Token | Duration | Use |
|---|---|---|
| micro | 120ms | tick fill, chip select |
| standard | 200ms | state change, action bar, row settle |
| gentle | 320ms | modal/sheet fade-in, progress fill |
| celebration | 1.2–2.5s | whole-task finish bloom (scaled) |
| ambient | 40–60s | living-background drift loop |

Easing: `ease-out` for entrances, `ease-in-out` for ambient loops + state changes. **No spring overshoot / bounce / `back` easing anywhere.** Principles: fade over move; always interruptible; proportionate. Never: confetti, particles, shake, flash, idle pulsing, auto-advance.

**Reduced-motion:** every animation collapses to its end-state with ≤1ms cross-fade. State (colour, layout, phase) still updates; only movement is removed. Gate on `AccessibilityInfo.isReduceMotionEnabled()` / the in-app Motion=Reduce setting.

### Spacing & radius
4pt scale: 8 / 12 / 16 / 24 / 32. Radii: 8 (chips/small), 14 (controls), 16–20 (cards/rows), pill (999). Elevation: hairline at rest; rows in the reborn Today get one soft shadow `0 6px 18px -10px rgba(43,39,34,0.18)` (light) / `0 6px 18px -10px rgba(0,0,0,0.5)` (dark) so they float a hair above the wash.

### Type
- Headings: **Newsreader** (serif). "Today" ~48px/1.02. Inscriptions/wind-down lines in *italic*.
- Body/UI: **Atkinson Hyperlegible** (keep for legibility). Body 16–17px, secondary 14–15px, meta 12–13px.

---

## Screens / Views

### 1. Today (reborn) — light & dark
**Purpose:** the home screen, sized to be doable; one clear action per moment.
**Layout (top→bottom):** living-background gradient + 2 drifting pools behind everything → header row → title → weight gauge + "Low on energy?" → Focus entry → task list → "+ I also did that" → spacer → pinned capture box → wind-down line.

**Header — the fix.** The old header crowded **4 links (Repeating, Routines, Lookback, Settings) + the date**, and the date wrapped on ≤360px phones. **Solution:** collapse all four destinations into ONE pill control labelled **"Rooms"** (three dots + label) that opens a sheet listing the four. Today's header then holds only `Wednesday, 18 June` (now `white-space:nowrap`, never wraps) + the Rooms pill (translucent, `backdrop-filter: blur(4)`).

**Components:**
- **Rooms pill:** border `1px rgba(43,39,34,0.10)` light / `rgba(242,235,224,0.14)` dark, bg `rgba(255,255,255,0.6)` / `rgba(37,33,25,0.6)`, radius pill, padding 8×13. Three 4px accent dots + "Rooms" label in accent, weight 700, 13px.
- **Weight gauge:** 6px pill track `rgba(ink,0.08)`, accent fill width = today's load. Caption "A gentle day. Room to breathe." (reworded — never "A full day"). Right-aligned "Low on energy?" text button in accent (the one-tap low-capacity toggle).
- **Focus entry:** mauve-tint fill `rgba(241,231,236,0.85)`, `1.5px` accent border, radius 16, `◉` + "Focus on one thing" in accent, weight 700, 17px.
- **Task rows:** surface `rgba(255,255,255,0.92)` / `rgba(37,33,25,0.86)`, radius 16, soft shadow (above). One-off = `1.5px` periwinkle border; repeating = hairline border + `↻` periwinkle mark; sliced = inline 4px sage progress track + `n / m` periwinkle label; done = sage-filled 25px check + struck-through faint text. 25px round check, `2px` faint border unchecked. Optional trailing 9px category dot.
- **"+ I also did that":** dashed hairline border, radius 16, accent label — the off-list logger.
- **Capture box (pinned):** surface ~0.95 opacity, radius 16, strong soft shadow; placeholder "Add a thing, or dump it all…", a mic/voice glyph, and a 34px accent send circle.
- **Wind-down line:** Newsreader italic, accent, centered (e.g. "small steps still move you" / "rest is part of the work"). Pulls from the existing wind-down copy set.

### 2. Living background — direction picker (reference only)
Three directions shown (Dawn Wash, Drifting Light, Horizon). **Recommendation: Dawn Wash + one slow light pool from Drifting Light.** Horizon (a depicted scene) is kept as an optional user-chosen "scene," never the default — a depicted landscape competes with the list for this audience.

### 3. Completion moments
**The ladder (quiet → celebratory), each calm and distinct:**
1. Everyday tick — fill to sage 120ms, row settles. Nothing more.
2. Routine step — ticks, recedes into its routine card.
3. "Done is done" — soft "filed" settle + reassurance copy (OCD: releasing a checked-and-rechecked task).
4. "Good enough" — gentle exhale, task releases (releasing a stuck-perfected task).
5. Cleared the day — wash warms to dusk; close-the-day wrap opens.
6. **Whole-task finish — the centrepiece** (below).

**Whole-task finish (storyboard, 4 beats):** triggered when the LAST piece of a broken-down task is ticked.
1. The final step ticks (last sub-task in the list).
2. The pieces gather into one warm point of light — a radial **bloom** (warm `#E9B98C` → mauve `#9B6A7D`), concentric soft rings.
3. **Held & named:** eyebrow "You finished the whole thing", the task title in Newsreader *italic* 30px, a warm one-line context ("Three weeks since you first wrote it down. Five small steps. All done."). Held ~2.4s OR tap to continue.
4. Settles into Today: lands checked + "a big one" sage tag, and into the Lookback.

**Scaling (no new model, no visible number):** read intensity from the existing `isBigWin` signal + how long the task lingered (dread proxy) + complexity (steps × minutes). Three tiers: *quick win* (~1.2s small light, no full hold) → *real finish* (~1.8s bloom + held title) → *long-dreaded* (~2.4s warmest bloom + inscription). Reduced-motion keeps the held title + warm colour; only the bloom's movement is removed.

**Why it's not gamification:** triggered by genuine effort/dread, never engagement; no points, no streak, no balance; a missed day costs nothing. It's recognition of the specific hard thing done — the direct counter to the discounting reflex.

### 4. Routines — light & dark (`DoubleDone Routines and Tiny.html`)
**Purpose:** calm morning/evening rituals; a routine is a few small steps run together. Grounded in `client/src/app/routines.tsx`.
**Layout:** back link "‹ Today" → title "Routines" → subtitle "Gentle rituals. No streaks, no pressure, just today." → optional Undo banner → groups (Morning / Evening / Anytime), each a heading + routine cards → "+ New routine" pill (or the add-form when adding).
**Components:**
- **Routine card:** surface ~0.92 opacity, radius 18–20, soft elevation (as Today). Head row: routine name (Newsreader 18–19px) + progress "2 of 3" (soft ink, right). Then step rows.
- **Step row:** a **square** sage check (22px, radius 8 / `radius.sm`) — deliberately distinct from Today's *round* one-off check — `1.5px` hairline border unchecked, sage fill + white tick checked; label strikes through + goes soft when done. Ticking marks done **for today only** (fresh tomorrow). Trailing "Remove" in brick.
- **Undo banner:** surface row, "Routine removed." + "Undo" in accent. Appears ~6s after Remove; never an "are you sure?" dialog.
- **New-routine form:** name input → when-pills (Morning/Evening/Anytime segmented control, active = accent fill) → steps textarea (one per line, parsed by the same `parseDump`) → Cancel + "Add routine" pill.
- **Empty state:** "No routines yet. A routine is a few small steps you do together, like a morning start or an evening wind-down." + the New-routine pill.
**Never:** streaks, cross-day counts, "you missed it". Progress is only today's "n of m".

### 5. Make it tiny — light & dark (`DoubleDone Routines and Tiny.html`)
**Purpose:** the 2-minute "pebble" that gets you over the start line on a dreaded task. Grounded in `makeTiny` (index.tsx), `tiny` (ai.ts), and the open-parent/resurface logic in `today.ts`.
**Three states:**
- **Affordance:** "Make it tiny" sits in the per-task control row beside "Break it down", offered **only on one-off tasks** (not recurring). Accent label.
- **The pebble replaces it:** on tap, an affirm toast "Made it tiny. Just this one." The real task becomes a **silent open parent** (never auto-completes) and the 2-minute pebble takes its place on Today. The pebble carries a periwinkle border + an eyebrow "A TINY STEP TOWARD · <parent title>" so the link is always visible. Tapping "Make it tiny" again refuses gently: "You already have a tiny step for this. Finish that one first." (one pebble at a time).
- **Pebble done → real task returns:** the spent pebble retires (no pile-up); the real task lands back on Today. A gentle progress nudge in sage-tint celebrates *starting*: "You started. That's the hard part." + "The tiny step is done. <parent> is back when you're ready, no rush." The returned task offers "tiny again?".
**Why it honours the spine:** the nudge celebrates the genuine ADHD win (starting) and never implies the task is "still not done"; the real task is never lost.

### 6. Other surfaces
Lookback, Break-it-down, Premium, Settings (regrouped Comfort / Access & data), Sign-in, Privacy, Repeating drawer, and first-run were specced in `DoubleDone System Pass.html` (light) and `DoubleDone System Pass (Dark).html`, and inherit this system unchanged.

---

## Screenshots
Reference renders in `screenshots/` (light + dark where the surface has both). The HTML files are the source of truth; these are for quick scanning.
- `today-reborn.png` — Today reborn, **light + dark** side by side (living background, Rooms header, soft elevation).
- `living-background.png` — the three background directions + the recommendation.
- `completion-moments.png` — the whole-task-finish storyboard + the scaling tiers.
- `routines.png` — Routines **light** (steps ticking), **dark** (new-routine form + Undo banner), and the empty state.
- `make-it-tiny.png` — the affordance, the pebble (**dark**), and the real-task-returns nudge (**light**).
- `surfaces-lookback-light.png` / `surfaces-lookback-dark.png` — a representative inheriting surface (the Lookback) in both themes.

## Interactions & Behavior
- **Rooms pill** → opens a sheet (gentle 320ms fade) listing Repeating, Routines, Lookback, Settings.
- **Tick** → 120ms sage fill + tick scale 0.6→1; text strikes through, color → faint.
- **Last sub-task tick** → fire whole-task finish (scaled); interruptible by tap.
- **Background** → resolve phase on app foreground; drift loops 40–60s; re-resolve on phase boundary crossing.
- **Low on energy?** → one tap trims Today to the low-capacity set (existing logic).
- All transitions fade, 200ms standard. Honor reduced-motion everywhere.

## State Management
- `backgroundPhase: 'dawn'|'day'|'dusk'|'night'` — derived from `Date` on foreground; drives gradient stops + greeting + wind-down line.
- `reduceMotion: boolean` — from `AccessibilityInfo` + Motion setting; gates every animation.
- `colorScheme: 'light'|'dark'` — device/user choice (no new setting).
- Completion: `celebrationTier` derived at completion time from `isBigWin` + linger + complexity; drives bloom size/duration. No persisted score.

## Assets
No new raster assets. Background is gradient + blurred Views (or SVG). The Lookback AI "scrapbook" keepsake is a separate existing feature. Icons: reuse the codebase's existing set; the glyphs in the mocks (◉ ↻ ⌥ ✓) are placeholders for your icon components.

## Files
- `DoubleDone Redesign.html` — primary reference (living bg, motion, Today reborn, completion moments).
- `DoubleDone Routines and Tiny.html` — the two newly-designed standalone boards (Routines + Make it tiny), light + dark.
- `DoubleDone System Pass.html`, `DoubleDone System Pass (Dark).html` — the inheriting surfaces, light + dark.
- `DoubleDone Today Redesign.html` — Today IA (Focus, selection, close-the-day).
- `screenshots/` — reference renders of every board, light + dark.
- Codebase touchpoints: `client/src/constants/theme.ts` (tokens), `client/src/app/index.tsx` (Today), `client/src/app/routines.tsx` (Routines), `client/src/components/TaskRow.tsx`, `BrainDump.tsx`, `client/src/lib/today.ts` + `tiny`/`ai.ts` (Make-it-tiny), and the completion/animation layer.
