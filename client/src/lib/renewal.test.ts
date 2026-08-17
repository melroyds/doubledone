import { describe, expect, it } from 'vitest';

import { FREE_ENTITLEMENT, type Entitlement } from './entitlement';
import { decideRenewalNotice, LEAD_DAYS, NOTICE_DAYS, NO_RENEWAL_MEMORY, type RenewalMemory } from './renewal';

const NOW = Date.UTC(2026, 7, 17, 12); // Mon 17 Aug 2026, midday
const DAY = 86_400_000;
const YEAR_END = Math.floor((NOW + 365 * DAY) / 1000);
const MONTH_END = Math.floor((NOW + 30 * DAY) / 1000);

const entWith = (endSec: number | null, over: Partial<Entitlement> = {}): Entitlement => ({
  premium: true,
  status: 'active',
  since: '2025-08-17',
  currentPeriodEnd: endSec,
  cancelAtPeriodEnd: false,
  source: 'stripe',
  ...over,
});

/**
 * Walk ONE period through time, threading the memory the way the app does across app launches.
 * `daysOut` is how far the renewal is at each look, so the clock is derived from that period's own
 * end. The first version of this helper measured every look against a fixed origin, which made a
 * SECOND year read as 372 days away and quietly turned a real assertion into a passing one.
 */
function walk(endSec: number, daysOut: number[], start: RenewalMemory = NO_RENEWAL_MEMORY, over: Partial<Entitlement> = {}) {
  let memory = start;
  const notices: { on: string; renews: string }[] = [];
  for (const d of daysOut) {
    const out = decideRenewalNotice(memory, entWith(endSec, over), endSec * 1000 - d * DAY);
    memory = out.memory;
    if (out.noticeOn && out.renewsOn) notices.push({ on: out.noticeOn, renews: out.renewsOn });
  }
  return { memory, notices };
}

describe('decideRenewalNotice', () => {
  it('says nothing for a free account', () => {
    expect(decideRenewalNotice(NO_RENEWAL_MEMORY, FREE_ENTITLEMENT, NOW).noticeOn).toBeNull();
  });

  it('says nothing when there is no period end to talk about', () => {
    expect(decideRenewalNotice(NO_RENEWAL_MEMORY, entWith(null), NOW).noticeOn).toBeNull();
  });

  // THE one this exists for. A monthly period end is never more than ~31 days out, so a subscriber
  // seen only ever inside that window is monthly and must never be told a renewal is coming: twelve
  // notices a year is nagging, and this app does not nag.
  it('never notices a monthly subscription, however often it is checked', () => {
    const everyDayOfTheMonth = Array.from({ length: 30 }, (_, i) => 30 - i);
    const { notices, memory } = walk(MONTH_END, everyDayOfTheMonth);
    expect(notices).toEqual([]);
    expect(memory.annualPeriodEnd).toBeNull();
  });

  it('notices an annual subscription exactly once, dated the day it renews', () => {
    const { notices } = walk(YEAR_END, [365, 200, 60, 20, 14, 7, 1]);
    // Dated a week BEFORE the charge, and the wording carries the charge date itself.
    expect(notices).toEqual([{ on: '2027-08-10', renews: '2027-08-17' }]);
  });

  it('stays quiet until the lead window, then speaks', () => {
    expect(walk(YEAR_END, [365, 200, LEAD_DAYS + 2]).notices).toEqual([]);
    expect(walk(YEAR_END, [365, LEAD_DAYS - 1]).notices).toHaveLength(1);
  });

  // A cancelled subscription is not renewing. Telling somebody who has already decided to leave that
  // they are about to be charged is both false and unkind.
  it('says nothing when the subscription is set to cancel at the period end', () => {
    const learned = walk(YEAR_END, [365]).memory;
    const { notices } = walk(YEAR_END, [7], learned, { cancelAtPeriodEnd: true });
    expect(notices).toEqual([]);
  });

  // ...but it still LEARNS the shape while cancelled, so somebody who changes their mind is covered.
  it('still learns the period is annual while it is cancelling', () => {
    const { memory } = walk(YEAR_END, [365], NO_RENEWAL_MEMORY, { cancelAtPeriodEnd: true });
    expect(memory.annualPeriodEnd).toBe(YEAR_END);
  });

  it('notices the NEXT year too, once the period rolls', () => {
    const first = walk(YEAR_END, [365, 7]);
    expect(first.notices).toHaveLength(1);

    // The renewal happens and the server sends a period end a year further on.
    const nextEnd = Math.floor((NOW + 730 * DAY) / 1000);
    const second = walk(nextEnd, [365, 7], first.memory);
    expect(second.notices).toHaveLength(1);
    expect(second.memory.noticedPeriodEnd).toBe(nextEnd);
  });

  // The documented gap, asserted so it stays a known cost rather than becoming a surprise: a fresh
  // install inside the last 40 days never sees the period long, so cannot tell it from monthly.
  it('stays quiet for a device that first sees the subscription close to renewal', () => {
    expect(walk(YEAR_END, [10]).notices).toEqual([]);
  });

  it('says nothing once the renewal date has passed', () => {
    const memory: RenewalMemory = { annualPeriodEnd: YEAR_END, noticedPeriodEnd: null };
    expect(walk(YEAR_END, [-1], memory).notices).toEqual([]);
  });

  it('always returns a memory to persist, so the caller can write unconditionally', () => {
    expect(decideRenewalNotice(NO_RENEWAL_MEMORY, FREE_ENTITLEMENT, NOW).memory).toEqual(NO_RENEWAL_MEMORY);
  });
});

describe('when the notice lands', () => {
  it('lands a week before the charge, not on the day of it', () => {
    // Seen far out first, so the period is known to be annual, then again inside the lead window.
    const [n] = walk(YEAR_END, [365, LEAD_DAYS]).notices;
    const gap = (Date.parse(n.renews) - Date.parse(n.on)) / DAY;
    expect(gap).toBe(NOTICE_DAYS);
  });

  // A device that first looks with only a few days left must not date a task BACKWARDS: it would
  // arrive already overdue, on the one screen whose whole promise is that nothing ever is.
  it('never dates the task in the past', () => {
    const memory: RenewalMemory = { annualPeriodEnd: YEAR_END, noticedPeriodEnd: null };
    const [n] = walk(YEAR_END, [3], memory).notices;
    const todayThen = new Date(YEAR_END * 1000 - 3 * DAY);
    const p = (x: number) => String(x).padStart(2, '0');
    expect(n.on).toBe(`${todayThen.getFullYear()}-${p(todayThen.getMonth() + 1)}-${p(todayThen.getDate())}`);
  });
});
