# Design

The DoubleDone visual system, **Dusk**: calm and warm, low-arousal, never gamified. Light-first, with a warm-charcoal dark that follows the system. Newsreader (serif) for headings, Atkinson Hyperlegible (the Braille Institute's legibility face) for body.

| File | What it is |
|---|---|
| [`design-system.html`](design-system.html) | The full design-system reference (tokens, type, components) generated from the A0 brief. Open in a browser. |
| [`today-dusk-light-dark.png`](today-dusk-light-dark.png) | The Today screen, light and dark. |
| [`dusk-light-and-dark.png`](dusk-light-and-dark.png) | The Dusk light/dark philosophy. |

**Where it's implemented:** the palette and dark mode live in [`client/src/constants/theme.ts`](../../client/src/constants/theme.ts); the typography is wired in [`client/src/global.css`](../../client/src/global.css). See the "Design overhaul (Dusk)" entry in [`decision-log.md`](../../decision-log.md) for the why.
