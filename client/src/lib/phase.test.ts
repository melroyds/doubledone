import { describe, expect, it } from 'vitest';

import { dayPhase, PHASE_GRADIENT, PHASE_POOLS, phaseGreeting } from './phase';

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
