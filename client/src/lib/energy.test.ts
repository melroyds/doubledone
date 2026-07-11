import { describe, expect, it } from 'vitest';

import { canMatchEnergy, ENERGY_FREE_MONTHLY, recordEnergyUse, shouldWarnEnergy } from './energy';

const JUL_10 = new Date(2026, 6, 10, 12, 0).getTime();
const JUL_1 = new Date(2026, 6, 1, 0, 0).getTime();
const JUN_30 = new Date(2026, 5, 30, 23, 0).getTime();

describe('canMatchEnergy (the freemium meter)', () => {
  it('premium is unlimited: always allowed, nothing counted', () => {
    const heavy = Array.from({ length: 40 }, () => JUL_10);
    expect(canMatchEnergy(true, heavy, JUL_10)).toEqual({ allowed: true, remaining: null });
  });

  it('free starts the month with the full 15', () => {
    expect(canMatchEnergy(false, [], JUL_10)).toEqual({ allowed: true, remaining: ENERGY_FREE_MONTHLY });
  });

  it('free counts only THIS calendar month; last month falls away with no carry-over', () => {
    const used = [JUN_30, JUN_30, JUL_1, JUL_10];
    expect(canMatchEnergy(false, used, JUL_10)).toEqual({ allowed: true, remaining: 13 });
  });

  it('free is refused at 15 used, never negative', () => {
    const used = Array.from({ length: 15 }, () => JUL_1);
    expect(canMatchEnergy(false, used, JUL_10)).toEqual({ allowed: false, remaining: 0 });
    expect(canMatchEnergy(false, [...used, JUL_1], JUL_10).remaining).toBe(0);
  });
});

describe('shouldWarnEnergy (reminders at 10 and 5 left)', () => {
  it('warns exactly at 10 and at 5 remaining', () => {
    expect(shouldWarnEnergy(10)).toBe(true);
    expect(shouldWarnEnergy(5)).toBe(true);
  });
  it('stays quiet everywhere else, including premium (null)', () => {
    expect(shouldWarnEnergy(15)).toBe(false);
    expect(shouldWarnEnergy(9)).toBe(false);
    expect(shouldWarnEnergy(0)).toBe(false);
    expect(shouldWarnEnergy(null)).toBe(false);
  });
});

describe('recordEnergyUse', () => {
  it('appends the use, sorted, and bounds the history', () => {
    const many = Array.from({ length: 80 }, (_, i) => JUL_1 + i);
    const next = recordEnergyUse(many, JUL_10);
    expect(next).toHaveLength(60);
    expect(next[next.length - 1]).toBe(JUL_10);
  });
  it('drops junk timestamps', () => {
    expect(recordEnergyUse([Number.NaN, JUL_1], JUL_10)).toEqual([JUL_1, JUL_10]);
  });
});
