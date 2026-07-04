import { describe, expect, it } from 'vitest';

import { applyRoutineEdit, deserializeRoutines, isStepDoneToday, type Routine, routineProgress, serializeRoutines, toggleStep } from './routines';

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

describe('applyRoutineEdit', () => {
  // A deterministic id maker so tests can assert which steps are NEW.
  function makeIds(prefix = 'new'): () => string {
    let n = 0;
    return () => {
      n += 1;
      return `${prefix}-${n}`;
    };
  }

  it("keeps a surviving step's id, so its tick for today survives the edit", () => {
    const r = { ...mk(), done: { s1: iso } };
    const out = applyRoutineEdit(r, { name: 'Morning', when: 'morning', stepTitles: ['Water', 'Meds', 'Stretch'], now: 500 }, makeIds());
    expect(out.steps.map((s) => s.id)).toEqual(['s1', 's2', 'new-1']); // kept, kept, added
    expect(isStepDoneToday(out, 's1', iso)).toBe(true); // the tick survives
    expect(out.updatedAt).toBe(500);
  });

  it('gives an added step a fresh id with no tick', () => {
    const out = applyRoutineEdit(mk(), { name: 'Morning', when: 'morning', stepTitles: ['Water', 'Meds', 'Stretch'], now: 500 }, makeIds());
    const added = out.steps[2];
    expect(added).toEqual({ id: 'new-1', title: 'Stretch' });
    expect(out.done['new-1']).toBeUndefined();
  });

  it("strips a removed step's tick so it cannot resurrect when the title comes back later", () => {
    const r = { ...mk(), done: { s2: iso } };
    const removed = applyRoutineEdit(r, { name: 'Morning', when: 'morning', stepTitles: ['Water'], now: 500 }, makeIds());
    expect(removed.done).toEqual({}); // the orphaned tick is stripped
    const back = applyRoutineEdit(removed, { name: 'Morning', when: 'morning', stepTitles: ['Water', 'Meds'], now: 600 }, makeIds());
    expect(back.steps[1].id).toBe('new-1'); // a new step, not the old s2
    expect(isStepDoneToday(back, 'new-1', iso)).toBe(false); // and not ticked
  });

  it('maps duplicate titles one-to-one, in order, consuming each existing step once', () => {
    const r: Routine = {
      ...mk(),
      steps: [
        { id: 'a', title: 'Water' },
        { id: 'b', title: 'Water' },
      ],
      done: { b: iso },
    };
    const out = applyRoutineEdit(r, { name: 'Morning', when: 'morning', stepTitles: ['Water', 'Water', 'Water'], now: 500 }, makeIds());
    expect(out.steps.map((s) => s.id)).toEqual(['a', 'b', 'new-1']);
    expect(isStepDoneToday(out, 'b', iso)).toBe(true);
  });

  it('treats a renamed step as a new step, losing its tick by design', () => {
    const r = { ...mk(), done: { s1: iso } };
    const out = applyRoutineEdit(r, { name: 'Morning', when: 'morning', stepTitles: ['Warm water', 'Meds'], now: 500 }, makeIds());
    expect(out.steps[0].id).toBe('new-1'); // the rename is a new step
    expect(out.done).toEqual({}); // the old title's tick fell away
  });

  it('applies name, when and nudge hour, and clears the nudge when absent', () => {
    const on = applyRoutineEdit(mk(), { name: 'Wind-down', when: 'evening', stepTitles: ['Water'], nudgeHour: 20, now: 500 }, makeIds());
    expect(on.name).toBe('Wind-down');
    expect(on.when).toBe('evening');
    expect(on.nudgeHour).toBe(20);
    const off = applyRoutineEdit(on, { name: 'Wind-down', when: 'evening', stepTitles: ['Water'], now: 600 }, makeIds());
    expect(off.nudgeHour).toBeNull();
  });

  it('carries the nudge minute alongside the hour, and clears it when absent', () => {
    const on = applyRoutineEdit(
      mk(),
      { name: 'Wind-down', when: 'evening', stepTitles: ['Water'], nudgeHour: 20, nudgeMinute: 47, now: 500 },
      makeIds(),
    );
    expect(on.nudgeHour).toBe(20);
    expect(on.nudgeMinute).toBe(47);
    const off = applyRoutineEdit(on, { name: 'Wind-down', when: 'evening', stepTitles: ['Water'], now: 600 }, makeIds());
    expect(off.nudgeMinute).toBeNull();
  });

  it('does not mutate the original routine', () => {
    const r = { ...mk(), done: { s1: iso } };
    applyRoutineEdit(r, { name: 'X', when: 'anytime', stepTitles: ['Meds'], now: 500 }, makeIds());
    expect(r.steps.map((s) => s.title)).toEqual(['Water', 'Meds']);
    expect(r.done).toEqual({ s1: iso });
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

  it('round-trips a valid nudge hour and drops an invalid one', () => {
    const withNudge = { ...mk(), nudgeHour: 20 };
    expect(deserializeRoutines(serializeRoutines([withNudge]))).toEqual([withNudge]);
    const junk = JSON.stringify([
      { ...mk(), nudgeHour: 24 },
      { ...mk(), nudgeHour: 9.5 },
      { ...mk(), nudgeHour: 'evening' },
    ]);
    for (const r of deserializeRoutines(junk)) expect(r.nudgeHour).toBeUndefined();
  });

  it('round-trips a valid nudge minute and drops an invalid one', () => {
    const withTime = { ...mk(), nudgeHour: 20, nudgeMinute: 47 };
    expect(deserializeRoutines(serializeRoutines([withTime]))).toEqual([withTime]);
    const atZero = { ...mk(), nudgeHour: 20, nudgeMinute: 0 };
    expect(deserializeRoutines(serializeRoutines([atZero]))).toEqual([atZero]); // :00 is a value, not junk
    const junk = JSON.stringify([
      { ...mk(), nudgeHour: 20, nudgeMinute: 60 },
      { ...mk(), nudgeHour: 20, nudgeMinute: -1 },
      { ...mk(), nudgeHour: 20, nudgeMinute: 30.5 },
      { ...mk(), nudgeHour: 20, nudgeMinute: 'ish' },
      { ...mk(), nudgeHour: 20, nudgeMinute: null },
    ]);
    for (const r of deserializeRoutines(junk)) {
      expect(r.nudgeHour).toBe(20); // the valid hour survives its junk minute
      expect(r.nudgeMinute).toBeUndefined();
    }
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
