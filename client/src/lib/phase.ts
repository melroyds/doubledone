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

/** The vertical gradient stops per phase, light and dark, from the handoff. */
export const PHASE_GRADIENT: Record<Phase, { light: Stops; dark: Stops }> = {
  dawn: { light: ['#FBEFE2', '#F6E3D6', '#F1E7EA'], dark: ['#221C24', '#1E1A22', '#1B1917'] },
  day: { light: ['#FCF8F2', '#FAF6F1', '#F7F1E8'], dark: ['#1E1B19', '#1B1917', '#191613'] },
  dusk: { light: ['#F7ECE4', '#F1E2E0', '#E9DCE2'], dark: ['#231C20', '#1F1A1C', '#1B1917'] },
  night: { light: ['#ECE6E6', '#E6DEE0', '#DED8DC'], dark: ['#1A171C', '#16141A', '#121016'] },
};

/** The two drifting light-pool colours (warm, then mauve or periwinkle) per theme. */
export const PHASE_POOLS = {
  light: ['rgba(231,176,140,0.40)', 'rgba(196,142,160,0.28)'] as const,
  dark: ['rgba(110,114,170,0.34)', 'rgba(150,106,135,0.30)'] as const,
};

/** The greeting that drifts with the time of day, always ending on the spine. */
export function phaseGreeting(date: Date): string {
  const h = date.getHours();
  if (h >= 5 && h < 12) return 'Good morning. Just today.';
  if (h >= 12 && h < 17) return 'Good afternoon. Just today.';
  if (h >= 17 && h < 21) return 'Winding down. Just today.';
  return 'Just today. The rest can wait.';
}
