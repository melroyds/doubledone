import { describe, expect, it } from 'vitest';

import { describePace, paceDays } from './estimate';

describe('paceDays', () => {
  it('is at least a day, even with no steps', () => {
    expect(paceDays([])).toBe(1);
  });

  it('a tiny single-step task is about a day', () => {
    expect(paceDays([{ minutes: 10 }])).toBe(1);
  });

  it('scales with total effort at ~25 min/day', () => {
    // 4 x 20 = 80 min -> ceil(80/25) = 4; steps/2 = 2; max = 4
    expect(paceDays([{ minutes: 20 }, { minutes: 20 }, { minutes: 20 }, { minutes: 20 }])).toBe(4);
  });

  it('never fewer days than about two steps a day', () => {
    // 6 trivial steps -> effort tiny, but ceil(6/2) = 3
    expect(paceDays(Array.from({ length: 6 }, () => ({ minutes: 1 })))).toBe(3);
  });

  it('adds a day for each later phase', () => {
    expect(paceDays([{ minutes: 20 }], 2)).toBe(3); // base 1 + 2 phases
  });

  it('clamps to a calm maximum of 14 days', () => {
    expect(paceDays([{ minutes: 1000 }])).toBe(14);
  });

  it('ignores negative or zero minutes safely', () => {
    expect(paceDays([{ minutes: -5 }, { minutes: 0 }])).toBe(1);
  });
});

describe('describePace', () => {
  it('phrases a single day calmly', () => {
    expect(describePace(1)).toBe('Usually about a day, at a gentle pace. No rush.');
  });
  it('phrases two days as a couple', () => {
    expect(describePace(2)).toBe('Usually a couple of days, at a gentle pace. No rush.');
  });
  it('gives a concrete count in the mid range', () => {
    expect(describePace(4)).toBe('Usually about 4 days, at a gentle pace. No rush.');
  });
  it('rounds a week-ish span to "about a week"', () => {
    expect(describePace(8)).toBe('Usually about a week, at a gentle pace. No rush.');
  });
  it('softens longer spans to "a week or two"', () => {
    expect(describePace(13)).toBe('Usually a week or two, at a gentle pace. No rush.');
  });
});
