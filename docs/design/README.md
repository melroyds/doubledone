# Design

The DoubleDone visual system, **Dusk**: calm and warm, low-arousal, never gamified. Light-first, with a warm-charcoal dark that follows the system. Newsreader (serif) for headings, Atkinson Hyperlegible (the Braille Institute's legibility face) for body.

| File | What it is |
|---|---|
| [`design-system.html`](design-system.html) | The full design-system reference (A0): tokens, type, components. Open in a browser. |
| [`components.html`](components.html) | Component states (A6): rows, buttons, chips, the capture send button, per-task dots, the date picker. |
| [`lookback.html`](lookback.html) | The Lookback calendar (A4): completion dots, big-win marks, the day detail. |
| [`today-dusk-light-dark.png`](today-dusk-light-dark.png) | The Today screen, light and dark. |
| [`dusk-light-and-dark.png`](dusk-light-and-dark.png) | The Dusk light/dark philosophy. |

**Where it's implemented:** the palette and dark mode live in [`client/src/constants/theme.ts`](../../client/src/constants/theme.ts); the typography is wired in [`client/src/global.css`](../../client/src/global.css). See the "Design overhaul (Dusk)" entry in [`decision-log.md`](../../decision-log.md) for the why.
