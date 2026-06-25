import { describe, expect, it } from 'vitest';

import { isCompEmail } from './comp';

describe('isCompEmail (the always-premium comp allowlist)', () => {
  it('matches the owner email exactly', () => {
    expect(isCompEmail('melroyvivekdsouza@gmail.com')).toBe(true);
  });
  it('is case-insensitive and whitespace-tolerant', () => {
    expect(isCompEmail('  MelroyVivekDsouza@Gmail.com  ')).toBe(true);
  });
  it('rejects any other email, including near-misses', () => {
    expect(isCompEmail('someone@else.com')).toBe(false);
    expect(isCompEmail('melroyvivekdsouza@gmail.com.attacker.com')).toBe(false);
    expect(isCompEmail('melroyvivekdsouza@googlemail.com')).toBe(false);
  });
  it('rejects null, undefined, and empty', () => {
    expect(isCompEmail(null)).toBe(false);
    expect(isCompEmail(undefined)).toBe(false);
    expect(isCompEmail('')).toBe(false);
  });
});
