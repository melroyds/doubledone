import { describe, expect, it } from 'vitest';

import { dayPhase, driftAt, PHASE_GRADIENT, PHASE_POOLS, phaseGreeting, poolLayout } from './phase';

function at(h: number): Date {
  return new Date(2026, 5, 22, h, 0, 0);
}

describe('dayPhase', () => {
  it('maps the clock to dawn / day / dusk / night', () => {
    expect(dayPhase(at(6))).toBe('dawn');
    expect(dayPhase(at(8))).toBe('dawn');
    expect(dayPhase(at(9))).toBe('day');
    expect(dayPhase(at(12))).toBe('day');
    expect(dayPhase(at(17))).toBe('dusk');
    expect(dayPhase(at(19))).toBe('dusk');
    expect(dayPhase(at(20))).toBe('night');
    expect(dayPhase(at(23))).toBe('night');
    expect(dayPhase(at(2))).toBe('night');
  });
});

describe('PHASE_GRADIENT and PHASE_POOLS', () => {
  it('every phase has three light and three dark stops', () => {
    (['dawn', 'day', 'dusk', 'night'] as const).forEach((p) => {
      expect(PHASE_GRADIENT[p].light).toHaveLength(3);
      expect(PHASE_GRADIENT[p].dark).toHaveLength(3);
    });
  });
  it('has two light-pool colours per theme', () => {
    expect(PHASE_POOLS.light).toHaveLength(2);
    expect(PHASE_POOLS.dark).toHaveLength(2);
  });
});

describe('phaseGreeting', () => {
  it('greets by time of day, always ending on the spine', () => {
    expect(phaseGreeting(at(7))).toBe('Good morning. Just today.');
    expect(phaseGreeting(at(14))).toBe('Good afternoon. Just today.');
    expect(phaseGreeting(at(19))).toBe('Winding down. Just today.');
    expect(phaseGreeting(at(23))).toBe('Just today. The rest can wait.');
  });
});

describe('driftAt (one clock for every LivingBackground)', () => {
  const LEG = 50_000;

  it('rises from 0 to 1 across the first leg, then falls back across the second', () => {
    expect(driftAt(0, LEG)).toEqual({ value: 0, rising: true, remainingMs: LEG });
    expect(driftAt(LEG / 4, LEG)).toEqual({ value: 0.25, rising: true, remainingMs: LEG * 0.75 });
    expect(driftAt(LEG, LEG)).toEqual({ value: 1, rising: false, remainingMs: LEG });
    expect(driftAt(LEG * 1.5, LEG)).toEqual({ value: 0.5, rising: false, remainingMs: LEG / 2 });
  });

  it('repeats every two legs, so a real timestamp lands mid-loop', () => {
    const now = 1_790_000_123_456;
    expect(driftAt(now, LEG)).toEqual(driftAt(now + LEG * 2, LEG));
    const at = driftAt(now, LEG);
    expect(at.value).toBeGreaterThanOrEqual(0);
    expect(at.value).toBeLessThanOrEqual(1);
    expect(at.remainingMs).toBeGreaterThan(0);
    expect(at.remainingMs).toBeLessThanOrEqual(LEG);
  });

  it('lands exactly on the end of the current leg, where the steady loop takes over', () => {
    for (const now of [1_790_000_200_000, 1_790_000_237_500, 12_345]) {
      const at = driftAt(now, LEG);
      const end = driftAt(now + at.remainingMs, LEG);
      expect(end.value).toBe(at.rising ? 1 : 0);
      expect(end.rising).toBe(!at.rising);
    }
  });

  it('is continuous: a millisecond moves it by at most one millisecond of drift', () => {
    for (const t of [1, LEG - 1, LEG + 1, LEG * 2 - 1]) {
      expect(Math.abs(driftAt(t + 1, LEG).value - driftAt(t, LEG).value)).toBeLessThanOrEqual(1 / LEG + 1e-12);
    }
  });
});

describe('poolLayout', () => {
  it('keeps the lower pool phone-positioned on a narrow screen', () => {
    const { pool } = poolLayout(375, 812);
    expect(pool.x).toBeCloseTo(375 * 0.28); // ox = 0, so x = bandW * 0.28
    expect(pool.size).toBe(375); // min(375, 460)
  });

  it('centres the lower pool in a clamped band on a wide screen (no gutter sphere)', () => {
    const { pool } = poolLayout(1280, 900);
    // band clamped to 600, centred: ox = (1280 - 600) / 2 = 340
    expect(pool.x).toBeCloseTo(340 + 600 * 0.28);
    expect(pool.size).toBe(460); // min(600, 460), not scaled up to the full width
    // its centre lands behind the content column, not out in the left gutter
    const centre = pool.x + pool.size / 2;
    expect(centre).toBeGreaterThan(1280 * 0.45);
    expect(centre).toBeLessThan(1280 * 0.65);
  });

  it('keeps the hero glow large and screen-centred at any width', () => {
    const { glow } = poolLayout(1280, 900);
    expect(glow.size).toBeCloseTo(1280 * 1.7);
    expect(glow.x).toBeCloseTo((1280 - 1280 * 1.7) / 2); // centred, a negative inset
  });
});
