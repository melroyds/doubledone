import { describe, expect, it } from 'vitest';

import { type DayContext, dropFromOrder, hasContext, moveInOrder } from './plan-day';

describe('hasContext', () => {
  it('is false when they skipped every question', () => {
    expect(hasContext({})).toBe(false);
  });

  it('is true on any single answer', () => {
    expect(hasContext({ energy: 'low' })).toBe(true);
    expect(hasContext({ day: 'off' })).toBe(true);
    expect(hasContext({ setting: 'out' })).toBe(true);
  });

  it('treats a full answer set as context', () => {
    const c: DayContext = { energy: 'good', day: 'work', setting: 'indoors' };
    expect(hasContext(c)).toBe(true);
  });
});

describe('moveInOrder', () => {
  const items = ['a', 'b', 'c'];

  it('swaps an item up', () => {
    expect(moveInOrder(items, 1, -1)).toEqual(['b', 'a', 'c']);
  });

  it('swaps an item down', () => {
    expect(moveInOrder(items, 1, 1)).toEqual(['a', 'c', 'b']);
  });

  it('never mutates the array it was given', () => {
    const before = ['a', 'b', 'c'];
    moveInOrder(before, 0, 1);
    expect(before).toEqual(['a', 'b', 'c']);
  });

  // A no-op returns the SAME reference, so nothing re-renders and the plan is not marked edited.
  it('is a same-reference no-op at the edges and on a bad index', () => {
    expect(moveInOrder(items, 0, -1)).toBe(items);
    expect(moveInOrder(items, 2, 1)).toBe(items);
    expect(moveInOrder(items, -1, 1)).toBe(items);
    expect(moveInOrder(items, 9, -1)).toBe(items);
  });

  it('handles a single-item plan without falling over', () => {
    const one = ['only'];
    expect(moveInOrder(one, 0, -1)).toBe(one);
    expect(moveInOrder(one, 0, 1)).toBe(one);
  });
});

describe('dropFromOrder', () => {
  const items = ['a', 'b', 'c'];

  it('drops the first, middle and last', () => {
    expect(dropFromOrder(items, 0)).toEqual(['b', 'c']);
    expect(dropFromOrder(items, 1)).toEqual(['a', 'c']);
    expect(dropFromOrder(items, 2)).toEqual(['a', 'b']);
  });

  it('never mutates the array it was given', () => {
    const before = ['a', 'b', 'c'];
    dropFromOrder(before, 1);
    expect(before).toEqual(['a', 'b', 'c']);
  });

  it('is a same-reference no-op on a bad index', () => {
    expect(dropFromOrder(items, -1)).toBe(items);
    expect(dropFromOrder(items, 3)).toBe(items);
  });

  it('can empty the plan entirely, which is a legitimate answer', () => {
    expect(dropFromOrder(['only'], 0)).toEqual([]);
  });
});
