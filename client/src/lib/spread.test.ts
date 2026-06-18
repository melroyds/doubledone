import { describe, expect, it } from 'vitest';

import { spreadDueDates } from './spread';

// A fixed "today" so the ISO maths is stable.
const today = new Date(2026, 5, 18); // 2026-06-18 (local)

describe('spreadDueDates — sameday', () => {
  it('puts every step on the due date', () => {
    expect(spreadDueDates(3, today, '2026-06-25', 'sameday')).toEqual(['2026-06-25', '2026-06-25', '2026-06-25']);
  });

  it('puts every step on Today (null) when there is no deadline', () => {
    expect(spreadDueDates(3, today, null, 'sameday')).toEqual([null, null, null]);
  });

  it('collapses a today/past deadline onto Today', () => {
    expect(spreadDueDates(2, today, '2026-06-18', 'sameday')).toEqual([null, null]);
    expect(spreadDueDates(2, today, '2026-06-10', 'sameday')).toEqual([null, null]);
  });
});

describe('spreadDueDates — gradual', () => {
  it('spreads evenly from Today (null) to the due date', () => {
    // due in 6 days, 3 steps: today, +3, +6
    expect(spreadDueDates(3, today, '2026-06-24', 'gradual')).toEqual([null, '2026-06-21', '2026-06-24']);
  });

  it('keeps the first step on Today and the last on the due date', () => {
    const out = spreadDueDates(4, today, '2026-06-24', 'gradual'); // horizon 6
    expect(out[0]).toBeNull();
    expect(out[out.length - 1]).toBe('2026-06-24');
  });

  it('never moves a step backwards', () => {
    const out = spreadDueDates(5, today, '2026-06-30', 'gradual').map((d) => d ?? '2026-06-18');
    const sorted = [...out].sort();
    expect(out).toEqual(sorted);
  });

  it('takes one day per step when there is no deadline', () => {
    expect(spreadDueDates(3, today, null, 'gradual')).toEqual([null, '2026-06-19', '2026-06-20']);
  });

  it('a single step just starts Today', () => {
    expect(spreadDueDates(1, today, '2026-06-25', 'gradual')).toEqual([null]);
  });

  it('handles fewer days than steps by sharing days', () => {
    // due tomorrow (horizon 1), 3 steps: today, then tomorrow, tomorrow
    expect(spreadDueDates(3, today, '2026-06-19', 'gradual')).toEqual([null, '2026-06-19', '2026-06-19']);
  });
});

describe('spreadDueDates — edges', () => {
  it('returns an empty array for no steps', () => {
    expect(spreadDueDates(0, today, '2026-06-25', 'gradual')).toEqual([]);
  });
});
