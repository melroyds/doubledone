import { describe, expect, it } from 'vitest';

import { ageInDays, isBigWin } from './reward';

const day = (y: number, m: number, d: number) => new Date(y, m, d).getTime();

describe('ageInDays', () => {
  it('counts days a one-off lingered before completion', () => {
    expect(ageInDays({ createdAt: day(2026, 5, 1), completedAt: day(2026, 5, 10) })).toBe(9);
  });

  it('is 0 when not completed', () => {
    expect(ageInDays({ createdAt: day(2026, 5, 1) })).toBe(0);
  });
});

describe('isBigWin', () => {
  it('is big when a task sat a week or more', () => {
    expect(isBigWin({ createdAt: day(2026, 5, 1), completedAt: day(2026, 5, 9) })).toBe(true);
  });

  it('is big when the task is genuinely chunky, regardless of age', () => {
    const t = day(2026, 5, 18);
    expect(isBigWin({ createdAt: t, completedAt: t, complexity: 40 })).toBe(true);
  });

  it('is not big for a quick, recently-created task', () => {
    const t = day(2026, 5, 18);
    expect(isBigWin({ createdAt: t, completedAt: t, complexity: 5 })).toBe(false);
  });
});
