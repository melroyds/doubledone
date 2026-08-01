import { describe, expect, it } from 'vitest';

import {
  affirmationIndex,
  AFFIRMATION_MAX_GAP_MS,
  AFFIRMATION_MIN_GAP_MS,
  CYCLE_MS,
  LEAVE_FADE_CAP_MS,
  leaveFadeMs,
  nextAffirmationDelay,
  phaseAt,
  SETTLE_MS,
  STILL_MS,
  SWELL_MS,
} from './settle';

describe('the breath clock (4 / 1.5 / 6.5)', () => {
  it('sums to a twelve-second cycle, five breaths a minute', () => {
    expect(CYCLE_MS).toBe(12_000);
    expect(SWELL_MS + STILL_MS + SETTLE_MS).toBe(CYCLE_MS);
  });

  it('resolves each phase at its boundaries', () => {
    expect(phaseAt(0).phase).toBe('swell');
    expect(phaseAt(3_999).phase).toBe('swell');
    expect(phaseAt(4_000).phase).toBe('still');
    expect(phaseAt(5_499).phase).toBe('still');
    expect(phaseAt(5_500).phase).toBe('settle');
    expect(phaseAt(11_999).phase).toBe('settle');
    expect(phaseAt(12_000).phase).toBe('swell'); // the next breath
  });

  it('wraps any clock time into the cycle, negatives included', () => {
    expect(phaseAt(CYCLE_MS * 40 + 4_100).phase).toBe('still');
    expect(phaseAt(-500).phase).toBe('settle'); // 11.5s into the cycle
  });

  it('reports elapsed time within the phase', () => {
    expect(phaseAt(4_500).phaseElapsed).toBe(500);
    expect(phaseAt(6_000).phaseElapsed).toBe(500);
  });
});

describe('the leaving fade (out-breath, never a cut)', () => {
  it('fades over the remainder of the current settle, capped at 800ms', () => {
    // 300ms of settle left: the fade takes exactly that remainder
    expect(leaveFadeMs(SWELL_MS + STILL_MS + SETTLE_MS - 300)).toBe(300);
    // early in the settle, the cap holds
    expect(leaveFadeMs(SWELL_MS + STILL_MS + 100)).toBe(LEAVE_FADE_CAP_MS);
  });

  it('is the plain cap anywhere outside the settle', () => {
    expect(leaveFadeMs(0)).toBe(LEAVE_FADE_CAP_MS);
    expect(leaveFadeMs(SWELL_MS + 100)).toBe(LEAVE_FADE_CAP_MS);
  });

  it('never returns a zero-length fade', () => {
    expect(leaveFadeMs(CYCLE_MS - 1)).toBeGreaterThan(0);
  });
});

describe('affirmation cadence (guide off only)', () => {
  it('spaces lines 60 to 90 seconds apart', () => {
    expect(nextAffirmationDelay(0)).toBe(AFFIRMATION_MIN_GAP_MS);
    expect(nextAffirmationDelay(0.999)).toBeLessThan(AFFIRMATION_MAX_GAP_MS);
    expect(nextAffirmationDelay(0.5)).toBeGreaterThanOrEqual(AFFIRMATION_MIN_GAP_MS);
  });

  it('rotates the set in order, never randomly (predictable beats clever)', () => {
    expect(affirmationIndex(0, 4)).toBe(0);
    expect(affirmationIndex(5, 4)).toBe(1);
    expect(affirmationIndex(0, 0)).toBe(0); // an empty set never divides by zero
  });
});
