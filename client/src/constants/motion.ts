// Motion language (the "Dusk, evolved" redesign): one small set of durations, in ms. Kept
// in its own pure module (no global.css or react-native side effects) so non-UI logic
// like lib/celebrate can import it under the node test runner. Re-exported from theme.ts
// for the components, alongside spacing / radius. Easing convention (applied in
// components): ease-out for entrances, ease-in-out for ambient loops and state changes.
// No spring, bounce, or back overshoot anywhere. Under reduced motion every animation
// collapses to its end-state (see useReducedMotion).
export const motion = {
  micro: 120, // tick fill, chip select
  standard: 200, // state change, action bar, row settle
  gentle: 320, // modal / sheet fade, progress fill
  celebration: { quick: 1200, real: 1800, dreaded: 2400 }, // whole-task finish bloom, scaled
  ambient: 50000, // living-background drift loop (40-60s)
} as const;
