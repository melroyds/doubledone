import { describe, expect, it } from 'vitest';

import { availableNudgePresets, formatNudgeTime, nudgeTargetFor } from './nudge';

function at(h: number, m = 0): Date {
  return new Date(2026, 5, 21, h, m, 0, 0); // 21 June 2026
}

describe('nudgeTargetFor', () => {
  it('schedules a relative poke in the future', () => {
    expect(nudgeTargetFor('1h', at(10))?.getHours()).toBe(11);
    expect(nudgeTargetFor('3h', at(10))?.getHours()).toBe(13);
  });

  it('"this evening" is 6pm, and only while it is still before then', () => {
    expect(nudgeTargetFor('evening', at(10))?.getHours()).toBe(18);
    expect(nudgeTargetFor('evening', at(19))).toBeNull();
  });

  it('never fires after the 9pm cutoff: a late relative nudge is capped to 9pm', () => {
    expect(nudgeTargetFor('3h', at(19))?.getHours()).toBe(21); // 10pm -> 9pm
    expect(nudgeTargetFor('1h', at(20, 30))?.getHours()).toBe(21); // 9:30pm -> 9pm
  });

  it('returns null once it is too late to fire today (no small-hours pokes)', () => {
    expect(nudgeTargetFor('1h', at(21, 30))).toBeNull();
    expect(nudgeTargetFor('3h', at(22))).toBeNull();
  });
});

describe('availableNudgePresets', () => {
  it('offers all three earlier in the day', () => {
    expect(availableNudgePresets(at(10)).map((p) => p.id)).toEqual(['1h', '3h', 'evening']);
  });

  it('drops "this evening" after 6pm but keeps the capped relative ones', () => {
    expect(availableNudgePresets(at(19)).map((p) => p.id)).toEqual(['1h', '3h']);
  });

  it('offers nothing once it is too late to fire today', () => {
    expect(availableNudgePresets(at(21, 30))).toEqual([]);
  });
});

describe('formatNudgeTime', () => {
  it('formats whole and half hours with am/pm', () => {
    expect(formatNudgeTime(at(18).getTime())).toBe('6pm');
    expect(formatNudgeTime(at(21).getTime())).toBe('9pm');
    expect(formatNudgeTime(at(9, 30).getTime())).toBe('9:30am');
    expect(formatNudgeTime(at(0).getTime())).toBe('12am');
  });
});
