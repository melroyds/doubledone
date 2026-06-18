import { describe, expect, it } from 'vitest';

import { applySliceDelta, hasSlices, sliceComplete, sliceFraction } from './slices';
import { type Task } from './tasks';

function sliced(total: number, done: number): Task {
  return { id: 'a', title: 'Watch the series', done: done >= total, createdAt: 0, updatedAt: 0, slices: { total, done } };
}

describe('hasSlices', () => {
  it('is true only when slices are present', () => {
    expect(hasSlices(sliced(10, 0))).toBe(true);
    expect(hasSlices({ slices: null })).toBe(false);
    expect(hasSlices({})).toBe(false);
  });
});

describe('sliceFraction', () => {
  it('reports 0..1 progress', () => {
    expect(sliceFraction({ total: 10, done: 0 })).toBe(0);
    expect(sliceFraction({ total: 10, done: 5 })).toBe(0.5);
    expect(sliceFraction({ total: 10, done: 10 })).toBe(1);
  });

  it('guards a zero total instead of dividing by it', () => {
    expect(sliceFraction({ total: 0, done: 0 })).toBe(0);
  });
});

describe('sliceComplete', () => {
  it('is true only when every slice is done', () => {
    expect(sliceComplete({ total: 3, done: 2 })).toBe(false);
    expect(sliceComplete({ total: 3, done: 3 })).toBe(true);
    expect(sliceComplete({ total: 0, done: 0 })).toBe(false);
  });
});

describe('applySliceDelta', () => {
  it('advances one slice and keeps done false until the last', () => {
    const next = applySliceDelta(sliced(3, 1), +1);
    expect(next.slices).toEqual({ total: 3, done: 2 });
    expect(next.done).toBe(false);
  });

  it('finishing the last slice marks the task done', () => {
    const next = applySliceDelta(sliced(3, 2), +1);
    expect(next.slices).toEqual({ total: 3, done: 3 });
    expect(next.done).toBe(true);
  });

  it('stepping back below full reopens the task', () => {
    const next = applySliceDelta(sliced(3, 3), -1);
    expect(next.slices).toEqual({ total: 3, done: 2 });
    expect(next.done).toBe(false);
  });

  it('clamps at the bounds and returns the same reference (a no-op needs no resync)', () => {
    const full = sliced(3, 3);
    expect(applySliceDelta(full, +1)).toBe(full);
    const empty = sliced(3, 0);
    expect(applySliceDelta(empty, -1)).toBe(empty);
  });

  it('leaves a non-sliced task untouched', () => {
    const whole: Task = { id: 'b', title: 'x', done: false, createdAt: 0, updatedAt: 0 };
    expect(applySliceDelta(whole, +1)).toBe(whole);
  });
});
