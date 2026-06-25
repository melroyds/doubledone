import { describe, expect, it } from 'vitest';

import { type Completion } from './calendar';
import { lookbackStats } from './insights';

const c = (title: string, big = false, recurring = false): Completion => ({ id: title, title, recurring, big });

describe('lookbackStats', () => {
  // now = Mon 15 June 2026. Its week (Sun-Sat) is 14-20 June. Month prefix '2026-06-'.
  const now = new Date(2026, 5, 15);

  it('counts week, month, distinct active days, and big wins, naming the latest reclaimed win', () => {
    const byDay = new Map<string, Completion[]>([
      ['2026-06-15', [c('A'), c('B', true)]], // 2 finishes, in week + month, one big
      ['2026-06-16', [c('C')]], // in week + month
      ['2026-06-18', [c('F', true)]], // in week + month, a later big win
      ['2026-06-10', [c('D')]], // in month, NOT in this week
      ['2026-05-30', [c('E', true)]], // last month: excluded everywhere
    ]);
    expect(lookbackStats(byDay, now)).toEqual({
      finishedThisWeek: 4, // 15(2) + 16(1) + 18(1)
      finishedThisMonth: 5, // + 10(1)
      activeDaysThisMonth: 4, // 15, 16, 18, 10
      bigWinsThisMonth: 2, // B and F (E is May)
      bigWinTitle: 'F', // the most recent big win this month (18 > 15)
    });
  });

  it('counts two finishes on one day as a single active day (no denominator, no streak)', () => {
    const byDay = new Map<string, Completion[]>([['2026-06-15', [c('A'), c('B'), c('C')]]]);
    const stats = lookbackStats(byDay, now);
    expect(stats.finishedThisMonth).toBe(3);
    expect(stats.activeDaysThisMonth).toBe(1);
  });

  it('counts a recurring task once per day it was ticked', () => {
    const byDay = new Map<string, Completion[]>([
      ['2026-06-14', [c('Meds', false, true)]],
      ['2026-06-15', [c('Meds', false, true)]],
      ['2026-06-16', [c('Meds', false, true)]],
    ]);
    const stats = lookbackStats(byDay, now);
    expect(stats.finishedThisMonth).toBe(3);
    expect(stats.activeDaysThisMonth).toBe(3);
  });

  it('returns all-zero with a null title for an empty history (no crash, no NaN)', () => {
    expect(lookbackStats(new Map(), now)).toEqual({
      finishedThisWeek: 0,
      finishedThisMonth: 0,
      activeDaysThisMonth: 0,
      bigWinsThisMonth: 0,
      bigWinTitle: null,
    });
  });
});
