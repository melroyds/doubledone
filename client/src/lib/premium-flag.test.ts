import { describe, expect, it } from 'vitest';

import { FREE_ENTITLEMENT } from './entitlement';
import { gateEntitlement, resolvePremium } from './premium-flag';

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
