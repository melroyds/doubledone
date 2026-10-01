import { describe, expect, it } from 'vitest';

import { canMakeScrapbook, type Entitlement, FREE_ENTITLEMENT, readEntitlementReply, weeklyAllowance } from './entitlement';

const DAY = 86_400_000;
const now = Date.parse('2026-06-20T12:00:00Z');
const premium = (since: string | null): Entitlement => ({ premium: true, status: 'active', since, currentPeriodEnd: null, cancelAtPeriodEnd: false, source: 'stripe' });

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

// The Worker's reply, parsed so a failed read is never mistaken for "free" (lib/iap buyCheck).
describe('readEntitlementReply', () => {
  it('reads a 200 as an answer, field by field', () => {
    expect(
      readEntitlementReply(200, { premium: true, status: 'active', since: '2026-01-01T00:00:00Z', currentPeriodEnd: 1800000000, cancelAtPeriodEnd: true, source: 'google' }),
    ).toEqual({
      ok: true,
      signedIn: true,
      entitlement: { premium: true, status: 'active', since: '2026-01-01T00:00:00Z', currentPeriodEnd: 1800000000, cancelAtPeriodEnd: true, source: 'google' },
    });
  });

  it('reads a free account as free, and an empty object as free too', () => {
    expect(readEntitlementReply(200, { premium: false })).toEqual({ ok: true, signedIn: true, entitlement: FREE_ENTITLEMENT });
    expect(readEntitlementReply(200, {})).toEqual({ ok: true, signedIn: true, entitlement: FREE_ENTITLEMENT });
  });

  it('reads every non-200 as a FAILED read, never as free', () => {
    for (const status of [401, 404, 429, 500, 502, 503]) expect(readEntitlementReply(status, { premium: false })).toEqual({ ok: false });
  });

  it('reads a 200 whose body is not an object as failed (a catch-all plain-text 200, a null, an array)', () => {
    for (const body of [null, 'doubledone-ai', 42, [], undefined]) expect(readEntitlementReply(200, body)).toEqual({ ok: false });
  });

  it('only a real true is premium, and unknown values degrade field by field', () => {
    const r = readEntitlementReply(200, { premium: 'yes', status: 7, since: 3, currentPeriodEnd: Number.NaN, cancelAtPeriodEnd: 'true', source: 'paypal' });
    expect(r).toEqual({ ok: true, signedIn: true, entitlement: FREE_ENTITLEMENT });
  });
});
