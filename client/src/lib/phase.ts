// The living background's time-of-day phase (the "Dusk, evolved" redesign). Pure: derive
// the phase from the clock, plus the per-phase gradient stops (light + dark), the two
// drifting light-pool colours, and the phase-aware greeting. The LivingBackground
// component renders these; this module is the testable brain. Values come straight from
// the design handoff (docs/design/redesign/README.md).

export type Phase = 'dawn' | 'day' | 'dusk' | 'night';

/** The background phase for a moment: dawn 5-9, day 9-17, dusk 17-20, night otherwise. */
export function dayPhase(date: Date): Phase {
  const h = date.getHours();
  if (h >= 5 && h < 9) return 'dawn';
  if (h >= 9 && h < 17) return 'day';
  if (h >= 17 && h < 20) return 'dusk';
  return 'night';
}

type Stops = readonly [string, string, string]; // top, mid, bottom of the vertical gradient

/** The vertical gradient stops per phase, light and dark. Tuned for a visible warm wash:
 *  the handoff's first values were nearly identical top-to-bottom, so they read as flat. */
export const PHASE_GRADIENT: Record<Phase, { light: Stops; dark: Stops }> = {
  dawn: { light: ['#FCEAD6', '#F7E2D8', '#F0DDE4'], dark: ['#2B2129', '#211A21', '#161217'] },
  day: { light: ['#FCEFDB', '#FAF4EC', '#EFE6D5'], dark: ['#2C2420', '#1E1A15', '#13100C'] },
  dusk: { light: ['#F9E5D5', '#F1DBDC', '#E6D8E6'], dark: ['#2D2125', '#21191D', '#161015'] },
  night: { light: ['#EFE8EF', '#E4DCE9', '#D7D2E3'], dark: ['#231D2B', '#191620', '#110E18'] },
};

/** The two light-pool colours per theme: a prominent warm hero glow (peach in light, amber
 *  in dark, anchored at the top like the dawn wash) then a softer rose / mauve lower down. */
export const PHASE_POOLS = {
  light: ['rgba(245,178,116,0.60)', 'rgba(214,148,172,0.34)'] as const,
  dark: ['rgba(232,150,92,0.36)', 'rgba(170,120,152,0.30)'] as const,
};

/** The greeting that drifts with the time of day, always ending on the spine. */
export function phaseGreeting(date: Date): string {
  const h = date.getHours();
  if (h >= 5 && h < 12) return 'Good morning. Just today.';
  if (h >= 12 && h < 17) return 'Good afternoon. Just today.';
  if (h >= 17 && h < 21) return 'Winding down. Just today.';
  return 'Just today. The rest can wait.';
}
