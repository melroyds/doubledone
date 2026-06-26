import { describe, expect, it } from 'vitest';

import { isCompEmail } from './comp';

// A fake comp allowlist for the tests; the owner's real address lives only in the COMP_EMAILS secret.
const ALLOW = 'owner@example.test';

describe('isCompEmail (the always-premium comp allowlist)', () => {
  it('matches an allowlisted email exactly', () => {
    expect(isCompEmail('owner@example.test', ALLOW)).toBe(true);
  });
  it('is case-insensitive and whitespace-tolerant', () => {
    expect(isCompEmail('  Owner@Example.Test  ', ALLOW)).toBe(true);
  });
  it('supports a comma-separated list', () => {
    expect(isCompEmail('b@x.test', 'a@x.test, b@x.test')).toBe(true);
  });
  it('rejects any other email, including near-misses', () => {
    expect(isCompEmail('someone@else.com', ALLOW)).toBe(false);
    expect(isCompEmail('owner@example.test.attacker.com', ALLOW)).toBe(false);
  });
  it('rejects everything when the allowlist is unset or empty (no comps in source)', () => {
    expect(isCompEmail('owner@example.test', undefined)).toBe(false);
    expect(isCompEmail('owner@example.test', '')).toBe(false);
  });
  it('rejects null, undefined, and empty', () => {
    expect(isCompEmail(null, ALLOW)).toBe(false);
    expect(isCompEmail(undefined, ALLOW)).toBe(false);
    expect(isCompEmail('', ALLOW)).toBe(false);
  });
});
