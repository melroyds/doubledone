import { describe, expect, it } from 'vitest';

import { deserializeRoutines, isStepDoneToday, type Routine, routineProgress, serializeRoutines, toggleStep } from './routines';

const iso = '2026-06-22';
const yest = '2026-06-21';

function mk(): Routine {
  return {
    id: 'r1',
    name: 'Morning',
    when: 'morning',
    steps: [
      { id: 's1', title: 'Water' },
      { id: 's2', title: 'Meds' },
    ],
    done: {},
    createdAt: 0,
    updatedAt: 0,
  };
}

describe('isStepDoneToday', () => {
  it('is true only when the step was ticked today', () => {
    const r = { ...mk(), done: { s1: iso, s2: yest } };
    expect(isStepDoneToday(r, 's1', iso)).toBe(true);
    expect(isStepDoneToday(r, 's2', iso)).toBe(false); // yesterday's tick does not count
    expect(isStepDoneToday(r, 'unknown', iso)).toBe(false);
  });
});

describe('toggleStep', () => {
  it('ticks a step for today then un-ticks it, bumping updatedAt each time', () => {
    const ticked = toggleStep(mk(), 's1', iso, 100);
    expect(ticked.done.s1).toBe(iso);
    expect(ticked.updatedAt).toBe(100);
    const unticked = toggleStep(ticked, 's1', iso, 200);
    expect(unticked.done.s1).toBeUndefined();
    expect(unticked.updatedAt).toBe(200);
  });

  it('does not mutate the original routine', () => {
    const r = mk();
    toggleStep(r, 's1', iso, 100);
    expect(r.done.s1).toBeUndefined();
  });
});

describe('routineProgress', () => {
  it("counts only today's ticks against the total", () => {
    const r = { ...mk(), done: { s1: iso, s2: yest } };
    expect(routineProgress(r, iso)).toEqual({ done: 1, total: 2 });
  });
});

describe('deserializeRoutines', () => {
  it('round-trips valid routines', () => {
    const r = [mk()];
    expect(deserializeRoutines(serializeRoutines(r))).toEqual(r);
  });

  it('returns [] for null, non-JSON, or a non-array', () => {
    expect(deserializeRoutines(null)).toEqual([]);
    expect(deserializeRoutines('not json')).toEqual([]);
    expect(deserializeRoutines('{}')).toEqual([]);
  });

  it('drops malformed entries and defaults a bad `when` to anytime', () => {
    const raw = JSON.stringify([
      { id: 'ok', name: 'X', when: 'noon', steps: [{ id: 's', title: 'a' }, { bad: true }] },
      { id: 'no-steps', name: 'Y' },
      { name: 'no-id', steps: [] },
    ]);
    const out = deserializeRoutines(raw);
    expect(out).toHaveLength(1);
    expect(out[0].when).toBe('anytime'); // 'noon' is not a valid slot
    expect(out[0].steps).toEqual([{ id: 's', title: 'a' }]); // the malformed step is dropped
    expect(out[0].done).toEqual({});
  });
});
