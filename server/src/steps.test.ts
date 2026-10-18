import { describe, expect, it } from 'vitest';

import { advanceParts, clearParts, cleanSlices, needsWrite, partsGuard, partsPatch, setTotal, wholeIn } from './steps';

describe('cleanSlices (the client cleanSlices rule, ported)', () => {
  it('keeps well-formed parts as they are', () => {
    expect(cleanSlices({ total: 10, done: 3 })).toEqual({ total: 10, done: 3 });
    expect(cleanSlices({ total: 1, done: 0 })).toEqual({ total: 1, done: 0 }); // one part is still parts, as on the client
  });

  it('floors both counts and clamps done to 0..total', () => {
    expect(cleanSlices({ total: 5.9, done: 2.7 })).toEqual({ total: 5, done: 2 });
    expect(cleanSlices({ total: 5, done: 7 })).toEqual({ total: 5, done: 5 });
    expect(cleanSlices({ total: 5, done: -2 })).toEqual({ total: 5, done: 0 });
  });

  it('a total under one, a missing or non-number count, or a non-object is a whole task', () => {
    expect(cleanSlices({ total: 0, done: 0 })).toBeNull();
    expect(cleanSlices({ total: 0.5, done: 0 })).toBeNull();
    expect(cleanSlices({ total: 5 })).toBeNull();
    expect(cleanSlices({ total: '5', done: 1 })).toBeNull();
    expect(cleanSlices({ total: Number.NaN, done: 1 })).toBeNull();
    expect(cleanSlices({ total: Number.POSITIVE_INFINITY, done: 1 })).toBeNull();
    expect(cleanSlices(null)).toBeNull();
    expect(cleanSlices('5/10')).toBeNull();
    expect(cleanSlices(undefined)).toBeNull();
  });
});

describe('wholeIn', () => {
  it('accepts a whole number inside the bounds and refuses everything else, never rounding', () => {
    expect(wholeIn(2, 2, 50)).toBe(2);
    expect(wholeIn(50, 2, 50)).toBe(50);
    expect(wholeIn(1, 2, 50)).toBeNull();
    expect(wholeIn(51, 2, 50)).toBeNull();
    expect(wholeIn(5.5, 2, 50)).toBeNull();
    expect(wholeIn('5', 2, 50)).toBeNull();
    expect(wholeIn(null, 2, 50)).toBeNull();
  });
});

describe('advanceParts', () => {
  it('+1 moves one part', () => {
    expect(advanceParts({ total: 10, done: 2 }, 3)).toEqual({ slices: { total: 10, done: 3 }, complete: false, changed: true });
  });

  it('+k past the end is clamped to the total, and that completes it', () => {
    expect(advanceParts({ total: 10, done: 8 }, 13)).toEqual({ slices: { total: 10, done: 10 }, complete: true, changed: true });
  });

  it('the last part completes it', () => {
    expect(advanceParts({ total: 3, done: 2 }, 3)).toMatchObject({ complete: true, changed: true });
  });

  it('already complete changes nothing, but still reads as complete', () => {
    expect(advanceParts({ total: 5, done: 5 }, 6)).toEqual({ slices: { total: 5, done: 5 }, complete: true, changed: false });
  });

  it('never lowers: a target below what is ticked changes nothing', () => {
    expect(advanceParts({ total: 10, done: 6 }, 2)).toEqual({ slices: { total: 10, done: 6 }, complete: false, changed: false });
    expect(advanceParts({ total: 10, done: 6 }, 6).changed).toBe(false);
  });
});

describe('setTotal (the app setSliceTotal)', () => {
  it('a whole task starts at none done', () => {
    expect(setTotal(null, 10)).toEqual({ slices: { total: 10, done: 0 }, complete: false, changed: true });
  });

  it('progress carries over a resize', () => {
    expect(setTotal({ total: 10, done: 3 }, 12)).toEqual({ slices: { total: 12, done: 3 }, complete: false, changed: true });
  });

  it('shrinking to or below what is ticked completes it', () => {
    expect(setTotal({ total: 10, done: 4 }, 4)).toEqual({ slices: { total: 4, done: 4 }, complete: true, changed: true });
    expect(setTotal({ total: 10, done: 6 }, 3)).toEqual({ slices: { total: 3, done: 3 }, complete: true, changed: true });
  });

  it('rounds and clamps to 2..50, as the app editor does', () => {
    expect(setTotal(null, 1).slices.total).toBe(2);
    expect(setTotal(null, 99).slices.total).toBe(50);
    expect(setTotal(null, 4.6).slices.total).toBe(5);
  });

  it('the same count is no change', () => {
    expect(setTotal({ total: 10, done: 3 }, 10).changed).toBe(false);
  });
});

describe('needsWrite', () => {
  it('writes when the counts move, or when every part is ticked on a row still open', () => {
    expect(needsWrite({ slices: { total: 5, done: 3 }, complete: false, changed: true }, false)).toBe(true);
    // The merge can leave "5 of 5" next to done:false. A write is what closes it.
    expect(needsWrite({ slices: { total: 5, done: 5 }, complete: true, changed: false }, false)).toBe(true);
    expect(needsWrite({ slices: { total: 5, done: 5 }, complete: true, changed: false }, true)).toBe(false);
    expect(needsWrite({ slices: { total: 5, done: 3 }, complete: false, changed: false }, false)).toBe(false);
  });
});

describe('partsPatch', () => {
  it('a tick that does not finish sends the counts alone, never a done key', () => {
    expect(partsPatch({ slices: { total: 10, done: 3 }, complete: false, changed: true }, 'NOW')).toEqual({ slices: { total: 10, done: 3 } });
  });

  it('the last part sends done and its stamp with the full count', () => {
    expect(partsPatch({ slices: { total: 3, done: 3 }, complete: true, changed: true }, 'NOW')).toEqual({
      slices: { total: 3, done: 3 },
      done: true,
      completed_at: 'NOW',
    });
  });
});

describe('clearParts (the app clearSlices)', () => {
  it('clears a task in parts, and has nothing to clear on a whole one', () => {
    expect(clearParts({ total: 4, done: 1 })).toEqual({ slices: null });
    expect(clearParts(null)).toBeNull();
    expect(clearParts({ total: 0, done: 0 })).toBeNull();
  });
});

describe('partsGuard', () => {
  it('pins both counts to the stored text', () => {
    expect(partsGuard({ total: 10, done: 3 })).toEqual({ 'slices->>done': 'eq.3', 'slices->>total': 'eq.10' });
  });

  it('uses the RAW stored value, never the cleaned one, so a malformed row can still be matched', () => {
    // cleanSlices reads this as 2 of 5; a guard on "2" would never match the stored 2.7 and the agent would loop.
    expect(partsGuard({ total: 5, done: 2.7 })).toEqual({ 'slices->>done': 'eq.2.7', 'slices->>total': 'eq.5' });
    expect(partsGuard({ total: 5, done: 7 })).toEqual({ 'slices->>done': 'eq.7', 'slices->>total': 'eq.5' });
    expect(partsGuard({ total: '5', done: 1 })).toEqual({ 'slices->>done': 'eq.1', 'slices->>total': 'eq.5' });
  });

  it('an absent key is is.null, and so is every key of a null or non-object value', () => {
    expect(partsGuard({ total: 5 })).toEqual({ 'slices->>done': 'is.null', 'slices->>total': 'eq.5' });
    expect(partsGuard(null)).toEqual({ 'slices->>done': 'is.null', 'slices->>total': 'is.null' });
    expect(partsGuard([1, 2])).toEqual({ 'slices->>done': 'is.null', 'slices->>total': 'is.null' });
  });
});
