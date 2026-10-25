import { describe, expect, it } from 'vitest';

import { type Entitlement, FREE_ENTITLEMENT, type EntitlementRead } from './entitlement';
import { givenMonthRunning, monthEndDue, stepMonthEnd } from './month-end';

const NOW = 1_800_000_000;
const ok = (e: Partial<Entitlement>, signedIn = true): EntitlementRead => ({ ok: true, signedIn, entitlement: { ...FREE_ENTITLEMENT, ...e } });
const given = ok({ premium: true, status: 'given', currentPeriodEnd: NOW + 100 });

describe('the end of a free month, said once', () => {
  it('remembers a running month, and says nothing yet', () => {
    expect(stepMonthEnd(null, given, NOW)).toEqual({ next: { end: NOW + 100, kind: 'given', shown: false, due: false }, showEnd: false });
  });
  it('becomes due once a good read shows the end has passed and Premium is off', () => {
    const prev = { end: NOW - 1, kind: 'given' as const, shown: false, due: false };
    const step = stepMonthEnd(prev, ok({}), NOW);
    expect(step.showEnd).toBe(true);
    expect(monthEndDue(step.next)).toBe(true);
    expect(stepMonthEnd({ ...prev, shown: true }, ok({}), NOW).showEnd).toBe(false);
  });
  it('is shown at the next first paint, then never again', () => {
    expect(monthEndDue({ end: NOW - 1, kind: 'trial', shown: false, due: true })).toBe(true);
    expect(monthEndDue({ end: NOW - 1, kind: 'trial', shown: true, due: false })).toBe(false);
    expect(monthEndDue({ end: NOW - 1, kind: 'trial', shown: false, due: false })).toBe(false); // the clock alone never makes it due
    expect(monthEndDue(null)).toBe(false);
  });
  it('never on a failed read, a blip that reads as free before the end, signed out, or after paying', () => {
    const prev = { end: NOW - 1, kind: 'trial' as const, shown: false, due: false };
    expect(stepMonthEnd(prev, { ok: false }, NOW)).toEqual({ next: prev, showEnd: false });
    expect(stepMonthEnd({ ...prev, end: NOW + 500 }, ok({}), NOW).showEnd).toBe(false);
    expect(stepMonthEnd(prev, ok({}, false), NOW).showEnd).toBe(false);
    expect(stepMonthEnd(prev, ok({ premium: true, status: 'active', currentPeriodEnd: NOW + 9999 }), NOW)).toEqual({ next: null, showEnd: false });
  });
  it('a new month resets the line, the same month keeps it', () => {
    const shown = { end: NOW + 100, kind: 'given' as const, shown: true, due: false };
    expect(stepMonthEnd(shown, given, NOW).next?.shown).toBe(true);
    expect(stepMonthEnd({ ...shown, end: NOW - 9 }, given, NOW).next?.shown).toBe(false);
  });
  it('a given month holds the rating ask until it ends; the card-free month does not', () => {
    expect(givenMonthRunning({ end: NOW + 1, kind: 'given', shown: false, due: false }, NOW)).toBe(true);
    expect(givenMonthRunning({ end: NOW - 1, kind: 'given', shown: false, due: false }, NOW)).toBe(false);
    expect(givenMonthRunning({ end: NOW + 1, kind: 'trial', shown: false, due: false }, NOW)).toBe(false);
    expect(givenMonthRunning(null, NOW)).toBe(false);
  });
});
