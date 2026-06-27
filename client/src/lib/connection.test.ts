import { describe, expect, it } from 'vitest';

import { aiErrorLine } from './connection';

describe('aiErrorLine', () => {
  it('keeps the caller fallback when online', () => {
    expect(aiErrorLine('Could not sort just now. Try again.', false)).toBe('Could not sort just now. Try again.');
  });

  it('swaps in the calm offline line when offline', () => {
    const line = aiErrorLine('Could not sort just now. Try again.', true);
    expect(line).toContain('offline');
    expect(line).toContain('safe here');
    expect(line).not.toContain('Try again'); // the futile-retry nudge is exactly what offline must not say
  });

  it('never shames and never exclaims', () => {
    const line = aiErrorLine('x', true);
    expect(line).not.toMatch(/!/);
  });
});
