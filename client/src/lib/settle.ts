// Settle, the breathing room: the pure rhythm (Claude Design "Settle" handoff, Melroy's pick
// 2026-08-01). A blob that BREATHES on the 4 / 1.5 / 6.5 cycle: swell 4s, still 1.5s, settle
// 6.5s. Twelve seconds a breath, five breaths a minute, the exhale half again the inhale (the
// vagal point). Everything time-shaped lives here so the room's arithmetic is testable without
// a screen: phase resolution, the leave-fade rule, and the affirmation cadence.

export const SWELL_MS = 4000;
export const STILL_MS = 1500;
export const SETTLE_MS = 6500;
export const CYCLE_MS = SWELL_MS + STILL_MS + SETTLE_MS; // 12s

export type BreathPhase = 'swell' | 'still' | 'settle';

/** Where in the breath a clock time falls. `t` is ms since the room opened. */
export function phaseAt(t: number): { phase: BreathPhase; phaseElapsed: number } {
  const c = ((t % CYCLE_MS) + CYCLE_MS) % CYCLE_MS; // negative-safe
  if (c < SWELL_MS) return { phase: 'swell', phaseElapsed: c };
  if (c < SWELL_MS + STILL_MS) return { phase: 'still', phaseElapsed: c - SWELL_MS };
  return { phase: 'settle', phaseElapsed: c - SWELL_MS - STILL_MS };
}

/**
 * The leaving fade (design: "you leave on an out-breath, not a cut"): fade over the remainder
 * of the CURRENT settle, capped at 800ms; anywhere else in the breath, the plain 800ms. The
 * caller applies the reduce-motion override (instant) itself.
 */
export const LEAVE_FADE_CAP_MS = 800;
export function leaveFadeMs(t: number): number {
  const { phase, phaseElapsed } = phaseAt(t);
  if (phase !== 'settle') return LEAVE_FADE_CAP_MS;
  return Math.max(1, Math.min(LEAVE_FADE_CAP_MS, SETTLE_MS - phaseElapsed));
}

// Affirmations (guide OFF only; the guide and affirmations alternate, never coexist): at most
// one line every 60 to 90 seconds, 3s fade-in, gone within 12s, never stacking.
export const AFFIRMATION_MIN_GAP_MS = 60_000;
export const AFFIRMATION_MAX_GAP_MS = 90_000;
export const AFFIRMATION_FADE_IN_MS = 3_000;
export const AFFIRMATION_VISIBLE_MS = 12_000;

/** When the next affirmation may appear. `rand01` in [0,1) spreads the gap so the room never
 *  becomes a metronome of words. */
export function nextAffirmationDelay(rand01: number): number {
  return AFFIRMATION_MIN_GAP_MS + Math.floor(rand01 * (AFFIRMATION_MAX_GAP_MS - AFFIRMATION_MIN_GAP_MS));
}

/** Rotate through the affirmation set in order: predictable beats clever, even here. */
export function affirmationIndex(shownCount: number, setSize: number): number {
  return setSize > 0 ? shownCount % setSize : 0;
}

// The blob's breath, as targets the screen animates between. The board specified 1.09 /
// ±6%, but a static board cannot feel motion: on a real phone the movement read as "50%
// too non-dramatic" (Melroy, first device test, 2026-08-01), so the travel roughly
// doubled. Reduce-motion still holds the geometry still and breathes the warmth instead.
export const BLOB_SCALE_REST = 1.0;
export const BLOB_SCALE_FULL = 1.2;
export const BLOB_OPACITY_DELTA = 0.12;

/** The word fades (guide words fade in at each phase and out before the next; the chop of a
 *  hard swap was the first thing the device test caught). Short under reduce-motion, per the
 *  handoff's "all fades ≤200ms" rule there. */
export const WORD_FADE_MS = 500;
export const WORD_FADE_REDUCED_MS = 150;
