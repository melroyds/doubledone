import { describe, expect, it } from 'vitest';

import { FREE_ENTITLEMENT } from './entitlement';
import { entitlementOwnerKey, gateEntitlement, resolvePremium } from './premium-flag';

describe('resolvePremium', () => {
  it('uses the server entitlement when there is no dev override', () => {
    expect(resolvePremium(true, null, true)).toBe(true);
    expect(resolvePremium(false, null, true)).toBe(false);
  });

  it('lets a set dev override win when dev tooling is allowed', () => {
    expect(resolvePremium(false, 'on', true)).toBe(true);
    expect(resolvePremium(true, 'off', true)).toBe(false);
  });

  it('ignores the dev override in production (devAllowed false): always the server truth', () => {
    expect(resolvePremium(false, 'on', false)).toBe(false);
    expect(resolvePremium(true, 'off', false)).toBe(true);
    expect(resolvePremium(false, 'off', false)).toBe(false);
    expect(resolvePremium(true, 'on', false)).toBe(true);
  });
});

describe('gateEntitlement', () => {
  const subscriber = {
    premium: true,
    status: 'active',
    since: '2026-01-01T00:00:00.000Z',
    currentPeriodEnd: 1_800_000_000,
    cancelAtPeriodEnd: false,
    source: 'stripe' as const,
  };

  it('forces premium on under an allowed on-override, keeping the real tenure and period', () => {
    const g = gateEntitlement(FREE_ENTITLEMENT, 'on', true);
    expect(g.premium).toBe(true);
    expect(g.since).toBe(FREE_ENTITLEMENT.since); // tenure stays the real (here null) value
    expect(g.currentPeriodEnd).toBe(FREE_ENTITLEMENT.currentPeriodEnd);
  });

  it('forces premium off under an allowed off-override even for a real subscriber', () => {
    const g = gateEntitlement(subscriber, 'off', true);
    expect(g.premium).toBe(false);
    expect(g.since).toBe('2026-01-01T00:00:00.000Z'); // detail preserved, only premium flips
  });

  it('ignores the override in production (devAllowed false): premium follows the server', () => {
    expect(gateEntitlement(FREE_ENTITLEMENT, 'on', false).premium).toBe(false);
    expect(gateEntitlement(subscriber, 'off', false).premium).toBe(true);
  });
});

// The provider's read follows the ACCOUNT (the 1 Nov bug sweep, #9). It used to read once at launch and then only
// on refresh(), so a payer who signed in from Today stayed free until Settings or Premium opened, and a sign-out
// left Premium on. The provider's load effect runs whenever this key changes, the way React compares deps.
describe('entitlementOwnerKey (when the provider reads the entitlement again)', () => {
  // Replays a session's moments and returns the keys a load would run for.
  function readsFor(moments: [known: boolean, userId: string | null | undefined][]): string[] {
    const reads: string[] = [];
    let last: string | null = null;
    for (const [known, userId] of moments) {
      const key = entitlementOwnerKey(known, userId);
      if (key !== null && key !== last) reads.push(key);
      last = key;
    }
    return reads;
  }

  it('waits while the session is still being found out, so that moment costs no read', () => {
    expect(entitlementOwnerKey(false, null)).toBeNull();
    expect(entitlementOwnerKey(false, 'user-a')).toBeNull();
  });

  it('reads once the session is known, signed in or not', () => {
    expect(entitlementOwnerKey(true, 'user-a')).not.toBeNull();
    expect(entitlementOwnerKey(true, null)).not.toBeNull();
    expect(entitlementOwnerKey(true, undefined)).toBe(entitlementOwnerKey(true, null));
  });

  it('reads again on sign-in, on sign-out and on a switch of account', () => {
    const out = entitlementOwnerKey(true, null);
    const a = entitlementOwnerKey(true, 'user-a');
    expect(a).not.toBe(out);
    expect(entitlementOwnerKey(true, 'user-b')).not.toBe(a);
  });

  it('reads once per account over a whole session, never for the hourly token refresh', () => {
    const reads = readsFor([
      [false, null], // launch: the session is still being found out
      [true, 'user-a'], // known, and signed in
      [true, 'user-a'], // a token refresh: a new session object, the same account
      [true, null], // signed out
      [true, 'user-b'], // signed in as someone else
      [true, 'user-b'], // another token refresh
    ]);
    expect(reads).toEqual([entitlementOwnerKey(true, 'user-a'), entitlementOwnerKey(true, null), entitlementOwnerKey(true, 'user-b')]);
  });

  it('reads at once when there is no sync at all, where signed out is known from the start', () => {
    expect(readsFor([[true, null]])).toHaveLength(1);
  });
});
