import { describe, expect, it } from 'vitest';

import { canMakeScrapbook, type Entitlement, FREE_ENTITLEMENT, weeklyAllowance } from './entitlement';

const DAY = 86_400_000;
const now = Date.parse('2026-06-20T12:00:00Z');
const premium = (since: string | null): Entitlement => ({ premium: true, status: 'active', since, currentPeriodEnd: null, cancelAtPeriodEnd: false });

describe('weeklyAllowance', () => {
  it('scales with tenure and never shrinks', () => {
    expect(weeklyAllowance(null, now)).toBe(1);
    expect(weeklyAllowance(new Date(now - 10 * DAY).toISOString(), now)).toBe(1); // < 2 months
    expect(weeklyAllowance(new Date(now - 70 * DAY).toISOString(), now)).toBe(2); // > 2 months
    expect(weeklyAllowance(new Date(now - 200 * DAY).toISOString(), now)).toBe(4); // > 6 months
  });
});

describe('canMakeScrapbook (free)', () => {
  it('allows the first of the calendar month, then meters to the paywall', () => {
    expect(canMakeScrapbook(FREE_ENTITLEMENT, [], now)).toEqual({ allowed: true, remaining: 1 });
    const madeThisMonth = [Date.parse('2026-06-03T09:00:00Z')];
    expect(canMakeScrapbook(FREE_ENTITLEMENT, madeThisMonth, now)).toEqual({ allowed: false, reason: 'free_monthly' });
  });

  it('does not count last month against this month', () => {
    const lastMonth = [Date.parse('2026-05-28T09:00:00Z')];
    expect(canMakeScrapbook(FREE_ENTITLEMENT, lastMonth, now)).toMatchObject({ allowed: true });
  });
});

describe('canMakeScrapbook (premium)', () => {
  it('allows up to the weekly allowance, then a calm wait with a reset time', () => {
    const ent = premium(new Date(now - 10 * DAY).toISOString()); // allowance 1
    expect(canMakeScrapbook(ent, [], now)).toMatchObject({ allowed: true });
    const oneThisWeek = [now - 2 * DAY];
    const gate = canMakeScrapbook(ent, oneThisWeek, now);
    expect(gate.allowed).toBe(false);
    if (!gate.allowed && gate.reason === 'premium_weekly') {
      expect(gate.resetAt).toBe(now - 2 * DAY + 7 * DAY); // oldest in-window + 7 days
    }
  });

  it('higher tenure unlocks more per week', () => {
    const ent = premium(new Date(now - 200 * DAY).toISOString()); // allowance 4
    const threeThisWeek = [now - DAY, now - 2 * DAY, now - 3 * DAY];
    expect(canMakeScrapbook(ent, threeThisWeek, now)).toMatchObject({ allowed: true });
  });
});
