import { describe, expect, it } from 'vitest';

import { resolvePremium } from './premium-flag';

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
