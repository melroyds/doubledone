# Claude Design prompt — DoubleDone "Quiet interface" (Premium)

Design a Premium appearance option for DoubleDone called **Quiet interface**.

## The product
DoubleDone is a calm, never-shame daily to-do app for adults with ADHD, autism, the AuDHD overlap and OCD. Its home screen is **Today**, sized to be doable. The brand is "Dusk": **Newsreader** (a warm literary serif) for headings, **Atkinson Hyperlegible** for body text, a soft **mauve → honey** accent, a warm off-white default with a full dark mode. The tone is quiet and reassuring, never a nag, never a streak.

## The goal
Quiet interface strips the decorative chrome off the interface so the app reads as calm text. It is **opt-in**, a paid appearance option that sits alongside the colour themes. In the standard app, task rows sit in bordered cards, the menu is a pill, primary actions are filled buttons, the day's load is a filled gauge bar, and capture is a bordered input. In Quiet interface all of that chrome comes off: interactive elements become plain text, separated by whitespace instead of boxes. Think "the same calm app with the volume turned down," not a different app.

## Principles that make or break it (honour all six)
1. **Quiet at rest, responsive on touch.** An element looks like plain text until it is pressed. On press, a soft wash appears under the finger; on a long-press, the row's actions reveal. The affordance is revealed by the interaction, not shown permanently.
2. **Keep a discoverability floor.** Every task keeps its small tap circle (open ○, done ✓) so the primary tap never needs discovering. Keep the one-time "hold for more" coachmark that teaches the long-press.
3. **Replace separation, don't just delete it.** With borders gone, rows must still read as distinct: use whitespace, and at most a hair of background tint or a hairline. It must never blur into one undifferentiated column.
4. **Multi-step tasks stay legible.** A task tracked in steps shows a quiet "2 of 5" counter (optionally a small row of dots), never a progress bar or a chip. A broken-down task's steps are just ordinary quiet rows.
5. **Keep the warmth.** Same Newsreader serif headings, same mauve accent on the few things that stay coloured (a text link such as "Break it down"), same calm voice. Quiet must not become cold or grey.
6. **Accessible by construction.** Body stays Atkinson-legible, interactive text keeps enough contrast to be perceivable, tap targets stay at least 44px, motion is gentle and respects reduce-motion.

## Screens to produce (in both light Dusk and dark)
- **Today at rest**: header, the day's load shown as a line of text, a mix of tasks including one multi-step task, the capture line, and "Close the day" as a quiet text action.
- **Today with one task held**: the soft press wash plus the revealed inline actions (e.g. Steps, Later, Remove).
- *(If useful)* the close-the-day wrap in the quiet treatment.

## What it is NOT
- Not a re-layout or re-flow — same layout, chrome removed.
- Not zero-affordance — keep the floor (the tap circles and the coachmark).
- Not cold minimalism — keep the Dusk warmth.
