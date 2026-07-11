import { describe, expect, it } from 'vitest';

import {
  applyRoutineEdit,
  cleanIntervalMinutes,
  cleanRhythmTimes,
  deserializeRoutines,
  isFixedTimeRhythm,
  isRhythm,
  isStepDoneToday,
  RHYTHM_AT_TIMES_MAX,
  RHYTHM_MEDS_DEFAULT_TIMES,
  type Routine,
  rhythmDueAtHour,
  rhythmFireTimes,
  rhythmFireTimesInWindow,
  rhythmSlotHours,
  rhythmSlotId,
  rhythmSlotIdPrefix,
  routineProgress,
  serializeRoutines,
  toggleStep,
} from './routines';

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

describe('Rhythms', () => {
  function mkRhythm(over: Partial<Routine> = {}): Routine {
    return {
      id: 'rh1',
      name: 'Water',
      kind: 'rhythm',
      when: 'anytime',
      steps: [],
      done: {},
      preset: 'water',
      intervalMinutes: 120,
      windowStart: 9,
      windowEnd: 21,
      paused: false,
      createdAt: 0,
      updatedAt: 0,
      ...over,
    };
  }

  it('isRhythm distinguishes a Rhythm from a checklist', () => {
    expect(isRhythm(mkRhythm())).toBe(true);
    expect(isRhythm(mk())).toBe(false);
  });

  describe('cleanIntervalMinutes (the canonical normaliser)', () => {
    it('snaps to the nearest 15 minutes', () => {
      expect(cleanIntervalMinutes(100)).toBe(105);
      expect(cleanIntervalMinutes(95)).toBe(90);
      expect(cleanIntervalMinutes(90)).toBe(90);
    });
    it('clamps to the 30-minute floor and the 12-hour cap', () => {
      expect(cleanIntervalMinutes(10)).toBe(30);
      expect(cleanIntervalMinutes(15)).toBe(30);
      expect(cleanIntervalMinutes(10000)).toBe(720);
    });
    it('falls back to hourly on junk', () => {
      expect(cleanIntervalMinutes(0)).toBe(60);
      expect(cleanIntervalMinutes(-90)).toBe(60);
      expect(cleanIntervalMinutes(NaN)).toBe(60);
      expect(cleanIntervalMinutes('every hour')).toBe(60);
      expect(cleanIntervalMinutes(null)).toBe(60);
    });
  });

  describe('rhythmFireTimesInWindow (minutes walk, inclusive both ends, defensive)', () => {
    it('expands a whole-hour interval across the window, including the end when it lands', () => {
      expect(rhythmFireTimesInWindow(9, 21, 120).map((t) => t.hour)).toEqual([9, 11, 13, 15, 17, 19, 21]);
      expect(rhythmFireTimesInWindow(9, 21, 120).every((t) => t.minute === 0)).toBe(true);
      expect(rhythmFireTimesInWindow(9, 21, 300).map((t) => t.hour)).toEqual([9, 14, 19]);
    });
    it('walks sub-hour and mixed intervals off the hour (the granularity ask)', () => {
      expect(rhythmFireTimesInWindow(9, 12, 90)).toEqual([
        { hour: 9, minute: 0 },
        { hour: 10, minute: 30 },
        { hour: 12, minute: 0 },
      ]);
      expect(rhythmFireTimesInWindow(9, 10, 30)).toEqual([
        { hour: 9, minute: 0 },
        { hour: 9, minute: 30 },
        { hour: 10, minute: 0 },
      ]);
    });
    it('supports an hourly cadence', () => {
      expect(rhythmFireTimesInWindow(9, 21, 60).map((t) => t.hour)).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21]);
    });
    it('collapses an interval larger than the window to a single start nudge', () => {
      expect(rhythmFireTimesInWindow(9, 11, 300)).toEqual([{ hour: 9, minute: 0 }]);
    });
    it('guards an inverted window to a single start nudge, never night-time or empty', () => {
      expect(rhythmFireTimesInWindow(21, 9, 120)).toEqual([{ hour: 21, minute: 0 }]);
    });
    it('falls back to hourly on a junk interval', () => {
      expect(rhythmFireTimesInWindow(9, 21, 0)).toEqual(rhythmFireTimesInWindow(9, 21, 60));
    });
    it('never exceeds the slot cap, even at the densest legal cadence over the widest window', () => {
      expect(rhythmFireTimesInWindow(0, 23, 30).length).toBeLessThanOrEqual(48);
    });
  });

  it('rhythmSlotHours resolves a Rhythm, and is empty for a checklist or an interval-less Rhythm', () => {
    expect(rhythmSlotHours(mkRhythm({ intervalMinutes: 120 }))).toEqual([9, 11, 13, 15, 17, 19, 21]);
    // A 90-minute cadence contributes each DISTINCT hour once (10:30 and 12:00 both fire).
    expect(rhythmSlotHours(mkRhythm({ intervalMinutes: 90, windowStart: 9, windowEnd: 12 }))).toEqual([9, 10, 12]);
    expect(rhythmSlotHours(mk())).toEqual([]);
    expect(rhythmSlotHours(mkRhythm({ intervalMinutes: undefined }))).toEqual([]);
  });

  it('rhythmSlotId / prefix are stable and collision-safe across similar ids', () => {
    expect(rhythmSlotId('r-x-1', 9)).toBe('rhythm-r-x-1-9');
    expect(rhythmSlotIdPrefix('r-x-1')).toBe('rhythm-r-x-1-');
    // The cancel sweep for id 'r-x-1' must never catch a sibling 'r-x-10' (the over-cancel bug)...
    expect(rhythmSlotId('r-x-10', 9).startsWith(rhythmSlotIdPrefix('r-x-1'))).toBe(false);
    // ...but must catch every one of its own slots.
    for (const h of rhythmSlotHours(mkRhythm({ id: 'r-x-1' }))) {
      expect(rhythmSlotId('r-x-1', h).startsWith(rhythmSlotIdPrefix('r-x-1'))).toBe(true);
    }
  });

  it('rhythmDueAtHour equals rhythmSlotHours membership; a paused or checklist routine is never due', () => {
    const r = mkRhythm({ intervalMinutes: 120, windowStart: 9, windowEnd: 21 });
    const hours = rhythmSlotHours(r);
    for (let h = 0; h <= 23; h += 1) expect(rhythmDueAtHour(r, h)).toBe(hours.includes(h));
    expect(rhythmDueAtHour(mkRhythm({ paused: true }), 9)).toBe(false);
    expect(rhythmDueAtHour(mk(), 9)).toBe(false);
  });

  describe('deserialize (the defensive parser)', () => {
    it('round-trips a Rhythm', () => {
      expect(deserializeRoutines(serializeRoutines([mkRhythm()]))).toEqual([mkRhythm()]);
    });
    it('coerces a junk interval, an inverted window, an unknown preset, and a non-boolean paused', () => {
      const junk = JSON.stringify([
        { id: 'rh1', name: 'Water', kind: 'rhythm', steps: [], done: {}, intervalMinutes: 0, windowStart: 22, windowEnd: 6, preset: 'coffee', paused: 'yes', createdAt: 0, updatedAt: 0 },
      ]);
      const [r] = deserializeRoutines(junk);
      expect(r.intervalMinutes).toBe(60); // junk interval -> hourly
      expect(r.windowStart).toBe(9); // inverted window -> default 9-21
      expect(r.windowEnd).toBe(21);
      expect(r.preset).toBe('custom'); // an unknown preset id -> custom
      expect(r.paused).toBe(false); // only a literal true pauses
    });
    it('migrates a pre-2026-07 whole-hour blob to minutes and never writes intervalHours back', () => {
      const legacy = JSON.stringify([
        { id: 'rh1', name: 'Water', kind: 'rhythm', steps: [], done: {}, preset: 'water', intervalHours: 2, windowStart: 9, windowEnd: 21, createdAt: 0, updatedAt: 0 },
      ]);
      const [r] = deserializeRoutines(legacy);
      expect(r.intervalMinutes).toBe(120);
      expect(r.intervalHours).toBeUndefined();
      // The migrated Rhythm fires on the same schedule the old one did.
      expect(rhythmSlotHours(r)).toEqual([9, 11, 13, 15, 17, 19, 21]);
      // And the round trip stays minutes-only.
      const [again] = deserializeRoutines(serializeRoutines([r]));
      expect(again).toEqual(r);
    });
    it('an off-grid interval snaps to the 15-minute grid on parse', () => {
      const off = JSON.stringify([
        { id: 'rh1', name: 'Water', kind: 'rhythm', steps: [], done: {}, preset: 'water', intervalMinutes: 100, windowStart: 9, windowEnd: 21, createdAt: 0, updatedAt: 0 },
      ]);
      expect(deserializeRoutines(off)[0].intervalMinutes).toBe(105);
    });
    it('FORCES a Rhythm to carry no steps and no ticks, so a tick can never resurrect (never-shame guarantee)', () => {
      const contaminated = JSON.stringify([
        { id: 'rh1', name: 'Water', kind: 'rhythm', when: 'morning', steps: [{ id: 's1', title: 'sneaky' }], done: { s1: iso }, preset: 'water', intervalMinutes: 120, windowStart: 9, windowEnd: 21, createdAt: 0, updatedAt: 0 },
      ]);
      const [r] = deserializeRoutines(contaminated);
      expect(r.steps).toEqual([]);
      expect(r.done).toEqual({});
      expect(r.when).toBe('anytime'); // and can never fall into a morning/evening group
      expect((r as Record<string, unknown>).count).toBeUndefined();
      expect((r as Record<string, unknown>).streak).toBeUndefined();
    });
    it('treats an old blob with no kind as a checklist (backward-compatible)', () => {
      const [r] = deserializeRoutines(serializeRoutines([mk()]));
      expect(isRhythm(r)).toBe(false);
      expect(r.kind).toBeUndefined();
      expect(r.steps).toHaveLength(2); // its steps are untouched
    });
  });

  describe('fixed-time Rhythms (the meds shape)', () => {
    function mkMeds(over: Partial<Routine> = {}): Routine {
      return mkRhythm({
        id: 'rh2',
        name: 'Meds',
        preset: 'meds',
        intervalMinutes: undefined,
        windowStart: undefined,
        windowEnd: undefined,
        atTimes: [
          { hour: 8, minute: 0 },
          { hour: 20, minute: 30 },
        ],
        ...over,
      });
    }

    describe('cleanRhythmTimes (defensive)', () => {
      it('keeps well-formed times, sorted by clock order', () => {
        expect(cleanRhythmTimes([{ hour: 20, minute: 30 }, { hour: 8, minute: 0 }])).toEqual([
          { hour: 8, minute: 0 },
          { hour: 20, minute: 30 },
        ]);
      });
      it('drops junk entries and collapses duplicates', () => {
        expect(
          cleanRhythmTimes([
            { hour: 8, minute: 0 },
            { hour: 8, minute: 0 }, // duplicate
            { hour: 24, minute: 0 }, // hour out of range
            { hour: 8, minute: 60 }, // minute out of range
            { hour: 8.5, minute: 0 }, // non-integer
            { hour: '8', minute: 0 }, // wrong type
            null,
            'nonsense',
          ]),
        ).toEqual([{ hour: 8, minute: 0 }]);
      });
      it('returns [] for a non-array, so junk falls back to the interval path', () => {
        expect(cleanRhythmTimes(undefined)).toEqual([]);
        expect(cleanRhythmTimes('8am')).toEqual([]);
        expect(cleanRhythmTimes({ hour: 8, minute: 0 })).toEqual([]);
      });
      it('caps at RHYTHM_AT_TIMES_MAX so a corrupt blob can never mass-schedule', () => {
        const many = Array.from({ length: 20 }, (_, i) => ({ hour: i, minute: 0 }));
        expect(cleanRhythmTimes(many)).toHaveLength(RHYTHM_AT_TIMES_MAX);
      });
    });

    it('isFixedTimeRhythm distinguishes the shapes', () => {
      expect(isFixedTimeRhythm(mkMeds())).toBe(true);
      expect(isFixedTimeRhythm(mkRhythm())).toBe(false); // interval Rhythm
      expect(isFixedTimeRhythm(mk())).toBe(false); // checklist
    });

    it('rhythmFireTimes is the unified schedule: fixed times as-is, interval walked in minutes, checklist empty', () => {
      expect(rhythmFireTimes(mkMeds())).toEqual([
        { hour: 8, minute: 0 },
        { hour: 20, minute: 30 },
      ]);
      expect(rhythmFireTimes(mkRhythm({ intervalMinutes: 300 }))).toEqual([
        { hour: 9, minute: 0 },
        { hour: 14, minute: 0 },
        { hour: 19, minute: 0 },
      ]);
      // An unparsed legacy shape (e.g. an in-memory object made before a reload) still resolves.
      expect(rhythmFireTimes(mkRhythm({ intervalMinutes: undefined, intervalHours: 5 }))).toEqual([
        { hour: 9, minute: 0 },
        { hour: 14, minute: 0 },
        { hour: 19, minute: 0 },
      ]);
      expect(rhythmFireTimes(mk())).toEqual([]);
    });

    it('rhythmSlotHours collapses fixed times to their distinct hours (hour-level cron truth)', () => {
      expect(rhythmSlotHours(mkMeds({ atTimes: [{ hour: 8, minute: 0 }, { hour: 8, minute: 30 }, { hour: 20, minute: 0 }] }))).toEqual([8, 20]);
    });

    it('rhythmSlotId keeps the ORIGINAL shape at :00 (device back-compat) and grows a segment off the hour', () => {
      expect(rhythmSlotId('r-x-1', 9)).toBe('rhythm-r-x-1-9'); // unchanged from the interval-only build
      expect(rhythmSlotId('r-x-1', 9, 0)).toBe('rhythm-r-x-1-9'); // minute 0 is byte-identical
      expect(rhythmSlotId('r-x-1', 20, 30)).toBe('rhythm-r-x-1-20-30');
      // Every shape still lands under the routine's cancel-sweep prefix.
      expect(rhythmSlotId('r-x-1', 20, 30).startsWith(rhythmSlotIdPrefix('r-x-1'))).toBe(true);
    });

    it('rhythmDueAtHour honours a fixed-time Rhythm at its hours only; paused is never due', () => {
      const r = mkMeds();
      for (let h = 0; h <= 23; h += 1) expect(rhythmDueAtHour(r, h)).toBe(h === 8 || h === 20);
      expect(rhythmDueAtHour(mkMeds({ paused: true }), 8)).toBe(false);
    });

    it('the meds defaults are a sane twice-a-day starting point', () => {
      expect(rhythmFireTimes(mkMeds({ atTimes: RHYTHM_MEDS_DEFAULT_TIMES }))).toEqual([
        { hour: 8, minute: 0 },
        { hour: 20, minute: 0 },
      ]);
    });

    describe('deserialize (one shape or the other, never both)', () => {
      it('round-trips a fixed-time Rhythm and accepts the meds preset', () => {
        const [r] = deserializeRoutines(serializeRoutines([mkMeds()]));
        expect(r).toEqual(mkMeds());
        expect(r.preset).toBe('meds');
      });
      it('a blob carrying BOTH shapes keeps atTimes and strips the interval fields', () => {
        const both = JSON.stringify([
          { id: 'rh2', name: 'Meds', kind: 'rhythm', steps: [], done: {}, preset: 'meds', intervalMinutes: 120, windowStart: 9, windowEnd: 21, atTimes: [{ hour: 8, minute: 0 }], createdAt: 0, updatedAt: 0 },
        ]);
        const [r] = deserializeRoutines(both);
        expect(r.atTimes).toEqual([{ hour: 8, minute: 0 }]);
        expect(r.intervalMinutes).toBeUndefined();
        expect(r.intervalHours).toBeUndefined();
        expect(r.windowStart).toBeUndefined();
        expect(r.windowEnd).toBeUndefined();
      });
      it('junk atTimes falls back to the interval path exactly as before', () => {
        const junk = JSON.stringify([
          { id: 'rh2', name: 'Meds', kind: 'rhythm', steps: [], done: {}, preset: 'meds', intervalMinutes: 120, atTimes: 'twice a day', createdAt: 0, updatedAt: 0 },
        ]);
        const [r] = deserializeRoutines(junk);
        expect(r.atTimes).toBeUndefined();
        expect(r.intervalMinutes).toBe(120);
        expect(r.windowStart).toBe(9);
      });
    });
  });
});
