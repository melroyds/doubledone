import { describe, expect, it } from 'vitest';

import { dayWeight, describePace, paceDays, weightedLoad } from './estimate';

describe('dayWeight', () => {
  it('reads clear at zero, scaling up to heavy, never below clear', () => {
    expect(dayWeight(0)).toEqual({ level: 'clear', label: 'A clear day', fill: 0 });
    expect(dayWeight(3).level).toBe('light');
    expect(dayWeight(6).level).toBe('full');
    expect(dayWeight(8).level).toBe('heavy');
    expect(dayWeight(20).level).toBe('heavy');
  });
  it('fills 0..1 and caps at 1', () => {
    expect(dayWeight(4).fill).toBeCloseTo(0.5);
    expect(dayWeight(8).fill).toBe(1);
    expect(dayWeight(100).fill).toBe(1);
  });
});

describe('dayWeight (low-capacity day)', () => {
  it('recalibrates to a gentler capacity: fewer tasks read as a fuller day', () => {
    expect(dayWeight(2, true).level).toBe('light');
    expect(dayWeight(4, true).level).toBe('full');
    expect(dayWeight(5, true).level).toBe('heavy');
  });
  it('gives permission in the label, never scolds', () => {
    expect(dayWeight(2, true).label).toBe('A low day. A couple of things is plenty.');
    expect(dayWeight(6, true).label).toContain('pick one');
  });
  it('fills faster than a normal day (capacity ~halved)', () => {
    expect(dayWeight(4, true).fill).toBe(1); // 4 fills the low-day gauge
    expect(dayWeight(4, false).fill).toBeCloseTo(0.5); // same count, normal day
  });
});

describe('weightedLoad', () => {
  it('counts a big task as heavier than a normal one (each big adds one extra)', () => {
    expect(weightedLoad(3, 0)).toBe(3);
    expect(weightedLoad(3, 1)).toBe(4);
    expect(weightedLoad(3, 2)).toBe(5);
  });
});

describe('dayWeight (big tasks)', () => {
  it('floors a lone big task to at least "full" so one heavy thing is felt, never "room to breathe"', () => {
    const lone = dayWeight(1, false, 1);
    expect(lone.level).toBe('full');
    expect(lone.fill).toBeGreaterThanOrEqual(0.5);
    expect(lone.label).toBe('A full day, but doable.');
    expect(dayWeight(1, false, 0).level).toBe('light'); // same single task, unmarked, reads light
  });

  it('lets big tasks push a piled day into heavy via the weighted load', () => {
    expect(dayWeight(5, false, 1).level).toBe('full'); // weighted 6
    expect(dayWeight(7, false, 1).level).toBe('heavy'); // weighted 8
  });

  it('floors a lone big task on a low day too, with the low-day full label', () => {
    const lone = dayWeight(1, true, 1);
    expect(lone.level).toBe('full');
    expect(lone.label).toBe('A low day. Be gentle, the rest can wait.');
  });

  it('keeps the clear-day guard: no tasks is still clear', () => {
    expect(dayWeight(0, false, 0).level).toBe('clear');
  });
});

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
