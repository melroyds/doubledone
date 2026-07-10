# Handoff: DoubleDone "Quiet interface" — Premium appearance option

## Overview
**Quiet interface** is an opt-in, Premium appearance option that strips decorative chrome off DoubleDone so the app reads as calm text on paper. Same layout, same features, same warmth — cards, pills, filled buttons, the load gauge and the bordered capture all come off, replaced by plain text separated by whitespace. "The same calm app with the volume turned down," never a different app, never cold minimalism.

It sits **beside the colour themes** in Settings → Comfort as one selector: `Standard / Quiet`. Premium-gated the same way as themes. Standard stays the default. Switching never moves anything — Quiet changes dressing only, so toggling back and forth is layout-stable (predictability matters for this audience).

## About the design files
- `DoubleDone Quiet Interface.html` — the reference board (open in any browser): six principles, a standard→quiet component comparison, and five phone frames — Today at rest + one task held (light AND dark) + the close-the-day wrap in the quiet treatment.
- `screenshots/quiet-frames.png` — the five frames.
- `screenshots/quiet-components.png` — the standard→quiet component strip.

These are **design references in HTML, not code to copy**. Recreate in the existing React Native + Expo codebase using its patterns and the live tokens in `client/src/constants/theme.ts`.

## The six principles (build requirements, not suggestions)
1. **Quiet at rest, responsive on touch.** Interactive elements look like plain text until pressed. On press, a soft wash fades in under the finger (120ms); a long-press reveals the row's inline actions. Affordance is revealed by interaction, not shown permanently.
2. **A discoverability floor.** Every task keeps its small tap circle (open / sage check when done) so the primary tap never needs discovering. Keep the one-time "hold for more" coachmark.
3. **Replace separation, don't delete it.** Rows read distinct via whitespace + at most a 5%-ink hairline. Never one undifferentiated column.
4. **Multi-step stays legible.** A stepped task shows a quiet right-aligned "2 of 5" in soft ink — never a progress bar or chip. Expanded steps are ordinary quiet rows.
5. **Keep the warmth.** Newsreader headings, mauve accent on the few text links that stay coloured ("Break it down", "Steps", "Goodnight"), the italic wind-down lines. Quiet, not grey.
6. **Accessible by construction.** Atkinson body unchanged; interactive text ≥4.5:1 (soft ink) or accent ≥4:1 at bold 15px+; every text action padded invisibly to a ≥44px target; motion gentle and instant under reduce-motion.

## Token usage (no new colours — usage deltas only)
| Element | Light | Dark |
|---|---|---|
| Row hairline | `rgba(43,39,34,0.05)` | `rgba(242,235,224,0.06)` |
| Press/hold wash | `#F1E7EC` @ 0.78, radius 14 | `#352C32` @ 0.85, radius 14 |
| Capture underline | `#ECE4D8` | `#34302A` |
| Text links (accent) | `#9B6A7D`, weight 700 | `#C68BA0`, weight 700 |
| Quiet secondary actions | `#7A7066` | `#A89E93` |
| Remove (destructive) | `#A1554C` (muted brick, never red) | `#D2887E` |
| Done check | `#7E9B6B` fill, white ✓ | `#9DB98A` fill, `#1B1917` ✓ |
| Type marks (↻) | faint `#A89E93` | faint `#7A7066` |
| "n of m" counter | soft `#7A7066`, 13px | `#A89E93`, 13px |

## Component spec (quiet mode)
**Appearance flag.** `appearance: 'standard' | 'quiet'` stored preference (same store as theme preset). Resolve once, pass through the same token/props path components already consume. Premium-gated with the themes.

**Header.** Date stays plain text (never wraps). The Rooms pill becomes a plain accent text button, padded to 44px. Title "Today" in Newsreader unchanged.

**Day's load.** The gauge bar is removed; the load renders as one sentence reusing the existing weight-copy tiers, e.g. "Today holds four things. Room to breathe." Low-capacity entry, if shown, is quiet accent text.

**Task row.** No card, border, or background. `min-height 48px`, padding `12px 2px`, bottom hairline (token above; omit on last row). 24px circle, 2px faint border; done = sage fill + check, title struck-through + faint. Repeating ↻ goes faint (colour noise drops with the chrome — *judgment call, easily reverted to periwinkle if the type-colour system should stay*). One-off's periwinkle card border has no quiet equivalent; task type reads from the marks.

**Multi-step task.** Title + right-aligned "2 of 5" (soft ink). "Break it down" remains an accent text link beneath the title, padded to 44px. A small dot-row is an acceptable optional alternative to the counter — never a bar.

**Held state (long-press, keep the existing 400ms delay).** The row gains the wash (bleed ~8px past the text column, radius 14, fade in 120ms) and reveals inline actions under the title: `Steps` (accent) · `Later` (soft ink) · `Remove` (brick) — each ≥44px. Release/tap outside dismisses. Under reduce-motion the wash appears instantly.

**Coachmark.** One line above the list, first run only: a 5px accent dot + "Hold any task for more" in faint ink. Dismiss permanently after the first successful long-press (persisted flag). Expose to screen readers as a hint.

**Capture.** The bordered input becomes a capture line: faint placeholder "Add a thing, or dump it all…" over a 1px underline, 48px target. On focus, the send affordance (accent ↑) and keyboard appear; voice entry unchanged where standard has it.

**Close the day.** Centered soft-ink bold text, 44px target, above the wind-down italic line.

**Close-the-day wrap (quiet).** No modal card, no scrim: the wrap is text on the page — Newsreader "That's the day", the finished list with sage ✓s, "a big one" as a sage italic inscription (not a chip), the reassurance line, and `Goodnight` as the lone accent text action.

## Motion
Only micro-fades: wash and state changes at 120ms ease. Nothing else changes vs standard. `prefers-reduced-motion` / Motion=Reduce ⇒ instant end-states everywhere.

## Codebase touchpoints
- `client/src/constants/theme.ts` — appearance flag alongside theme resolution.
- `client/src/components/TaskRow.tsx` — quiet variant (row, circle, counter, held state).
- `client/src/components/BrainDump.tsx` — capture line variant.
- `client/src/app/index.tsx` — header (Rooms as text), load sentence, Close the day, coachmark, quiet close-the-day wrap.
- `client/src/app/settings.tsx` — the Standard / Quiet selector beside the colour themes, Premium gate.

## What it is NOT
- Not a re-layout — same structure, chrome removed.
- Not zero-affordance — the circles and coachmark are the floor.
- Not grey — the Dusk warmth, serif and accent stay.
