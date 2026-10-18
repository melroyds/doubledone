import { describe, expect, it } from 'vitest';

import {
  advanceParts,
  buildStepRows,
  clearParts,
  cleanSlices,
  currentRound,
  FINISH_GUARD,
  finishBody,
  hideGuard,
  hidePatch,
  insertedRowsFilter,
  isDoneOn,
  judgeLevel,
  MAX_WALK_DEPTH,
  needsWrite,
  parseSteps,
  partsGuard,
  partsPatch,
  planFinish,
  setTotal,
  splitStepTitle,
  stepIds,
  stepsMinutes,
  stepsRefusal,
  stepTitle,
  type WalkIo,
  type WalkRow,
  wholeIn,
} from './steps';

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

// --- Linked steps ----------------------------------------------------------------------------------------------

describe('step titles (splitStepTitle + stepTitle)', () => {
  it('appends "(N min)", or leaves the title plain with no minutes', () => {
    expect(stepTitle('Bag up the rubbish', 5)).toBe('Bag up the rubbish (5 min)');
    expect(stepTitle('Bag up the rubbish', null)).toBe('Bag up the rubbish');
  });

  it('strips a "(5 min)" or "(5 Min.)" suffix and keeps its minutes', () => {
    expect(splitStepTitle('Bag up the rubbish (5 min)')).toEqual({ title: 'Bag up the rubbish', minutes: 5 });
    expect(splitStepTitle('Müll rausbringen (12 Min.)')).toEqual({ title: 'Müll rausbringen', minutes: 12 });
  });

  it('strips a leading list marker, the set the app capture strips, including the "• " break_down writes', () => {
    for (const raw of ['• Sweep the floor', '- Sweep the floor', '* Sweep the floor', '1. Sweep the floor', '2) Sweep the floor', '  • Sweep the floor  ']) {
      expect(splitStepTitle(raw)).toEqual({ title: 'Sweep the floor', minutes: null });
    }
    expect(splitStepTitle('• Sweep the floor (3 min)')).toEqual({ title: 'Sweep the floor', minutes: 3 });
  });

  it('leaves a title alone when it only looks like one ("Call 1.30 bus", "Read (part 2)")', () => {
    expect(splitStepTitle('Call 1.30 bus')).toEqual({ title: 'Call 1.30 bus', minutes: null });
    expect(splitStepTitle('Read (part 2)')).toEqual({ title: 'Read (part 2)', minutes: null });
  });
});

describe('parseSteps', () => {
  const two = [{ title: 'One' }, { title: 'Two' }];

  it('cleans each step: the title tidied, minutes from the suffix when absent, due null for today', () => {
    expect(parseSteps([{ title: '• Bag up the rubbish (5 min)' }, { title: 'Sweep', minutes: 10, due: '2026-10-20' }])).toEqual({
      steps: [
        { title: 'Bag up the rubbish', minutes: 5, due: null },
        { title: 'Sweep', minutes: 10, due: '2026-10-20' },
      ],
    });
  });

  it('given minutes win over a suffix, and a non-whole number is rounded (5.4 is 5)', () => {
    expect(parseSteps([{ title: 'Sweep (5 min)', minutes: 8 }, { title: 'Mop', minutes: 5.4 }])).toEqual({
      steps: [
        { title: 'Sweep', minutes: 8, due: null },
        { title: 'Mop', minutes: 5, due: null },
      ],
    });
  });

  it('refuses fewer than two steps, saying a single step never closes the big task', () => {
    expect(parseSteps([{ title: 'Only' }])).toEqual({ error: 'Give at least two steps. One step on its own never closes the big task.', tooFew: true });
    expect(parseSteps([])).toMatchObject({ tooFew: true });
  });

  it('refuses more than twenty, a non-list, and a step that is not an object', () => {
    expect(parseSteps(Array.from({ length: 21 }, (_, i) => ({ title: `S${i}` })))).toMatchObject({ error: expect.stringMatching(/more than 20/) });
    expect(parseSteps('one, two')).toMatchObject({ error: expect.any(String) });
    expect(parseSteps([{ title: 'One' }, 'Two'])).toEqual({ error: 'Step 2 needs to be an object with a title.' });
    expect(parseSteps(Array.from({ length: 20 }, (_, i) => ({ title: `S${i}` })))).not.toHaveProperty('error');
  });

  it('refuses an empty title, bad minutes (0, 481, "5"), a bad due, an unknown key and a 501-character title', () => {
    const bad: [unknown, RegExp][] = [
      [{ title: '  ' }, /Step 2 needs a title/],
      [{ title: '• ' }, /Step 2 needs a title/],
      [{ title: '(5 min)' }, /Step 2 needs a title/],
      [{ title: 'x', minutes: 0 }, /minutes need to be a whole number from 1 to 480/],
      [{ title: 'x', minutes: 481 }, /minutes/],
      [{ title: 'x', minutes: '5' }, /minutes/],
      [{ title: 'x (600 min)' }, /minutes/],
      [{ title: 'x', due: '2026-02-30' }, /due date/],
      [{ title: 'x', due: 20261020 }, /due date/],
      [{ title: 'x', phase: 1 }, /a field it can't take \("phase"\)/],
      [{ title: 'y'.repeat(501) }, /too long/],
    ];
    for (const [second, msg] of bad) expect(parseSteps([two[0], second])).toEqual({ error: expect.stringMatching(msg) });
    expect(parseSteps([two[0], { title: 'y'.repeat(500) }])).not.toHaveProperty('error');
  });

  it('a null minutes or due is the same as leaving it out', () => {
    expect(parseSteps([{ title: 'a', minutes: null, due: null }, two[1]])).toEqual({
      steps: [
        { title: 'a', minutes: null, due: null },
        { title: 'Two', minutes: null, due: null },
      ],
    });
  });
});

describe('buildStepRows', () => {
  const T = Date.parse('2026-10-18T03:00:00.000Z');
  const steps = [
    { title: 'Bag up the rubbish', minutes: 5, due: null },
    { title: 'Sweep', minutes: null, due: '2026-10-20' },
    { title: 'Take it to the tip', minutes: 30, due: null },
  ];
  const ids = stepIds('mcp-abc-xyz123', 3);
  const titleMode = buildStepRows({ userId: 'u1', nowMs: T, parent: { id: ids.parent, title: 'Clear the garage' }, stepIds: ids.steps, steps, withParent: true });

  it('every row carries the SAME key set, so one insert never trips the mixed-keys refusal', () => {
    const keys = Object.keys(titleMode[0]).sort();
    for (const row of titleMode) expect(Object.keys(row).sort()).toEqual(keys);
    expect(keys).toEqual(['complexity', 'created_at', 'done', 'due', 'id', 'open_parent', 'parent_id', 'parent_title', 'silent_parent', 'title', 'updated_at', 'user_id']);
  });

  it('the big task is born hidden as a breakdown (not a tiny task), with the summed minutes and no day', () => {
    expect(titleMode[0]).toEqual({
      id: 'mcp-abc-xyz123-p',
      user_id: 'u1',
      title: 'Clear the garage',
      done: false,
      created_at: '2026-10-18T03:00:00.000Z',
      updated_at: '2026-10-18T03:00:00.000Z',
      parent_id: null,
      parent_title: null,
      silent_parent: true,
      open_parent: false,
      complexity: 35,
      due: null,
    });
  });

  it('each step links to the big task, in order 1 ms apart, with integer minutes and its day or null', () => {
    expect(titleMode.slice(1)).toEqual([
      expect.objectContaining({ id: 'mcp-abc-xyz123-0', title: 'Bag up the rubbish (5 min)', complexity: 5, due: null, created_at: '2026-10-18T03:00:00.001Z' }),
      expect.objectContaining({ id: 'mcp-abc-xyz123-1', title: 'Sweep', complexity: null, due: '2026-10-20', created_at: '2026-10-18T03:00:00.002Z' }),
      expect.objectContaining({ id: 'mcp-abc-xyz123-2', title: 'Take it to the tip (30 min)', complexity: 30, due: null, created_at: '2026-10-18T03:00:00.003Z' }),
    ]);
    for (const row of titleMode.slice(1)) {
      expect(row).toMatchObject({ user_id: 'u1', done: false, parent_id: 'mcp-abc-xyz123-p', parent_title: 'Clear the garage', silent_parent: null, open_parent: null });
      expect(row.updated_at).toBe(row.created_at);
    }
  });

  it('task_id mode writes the steps alone, linked to the existing task under its current title', () => {
    const rows = buildStepRows({ userId: 'u1', nowMs: T, parent: { id: 't-old', title: 'Do the tax' }, stepIds: ids.steps, steps, withParent: false });
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.parent_id === 't-old' && r.parent_title === 'Do the tax')).toBe(true);
  });

  it('ids are unique by construction, the big task -p and each step its index', () => {
    const many = stepIds('api-x-y', 20);
    expect(new Set([many.parent, ...many.steps]).size).toBe(21);
    expect(many.parent).toBe('api-x-y-p');
    expect(many.steps[19]).toBe('api-x-y-19');
  });

  it('minutes add up only over steps that have them, and none at all is null', () => {
    expect(stepsMinutes(steps)).toBe(35);
    expect(stepsMinutes([{ title: 'a', minutes: null, due: null }])).toBeNull();
  });
});

describe('breaking down a task already on the list', () => {
  it('stepsRefusal: done, then repeating, then in parts, then already hidden, else nothing', () => {
    expect(stepsRefusal({ done: true, recurrence: { kind: 'daily' } })).toBe('done');
    expect(stepsRefusal({ recurrence: { kind: 'daily' }, slices: { total: 3, done: 0 } })).toBe('repeats');
    expect(stepsRefusal({ slices: { total: 3, done: 0 }, silent_parent: true })).toBe('parts');
    expect(stepsRefusal({ silent_parent: true })).toBe('hidden');
    expect(stepsRefusal({ done: false, recurrence: { kind: 'none' }, slices: { total: 0, done: 0 }, silent_parent: null })).toBeNull();
  });

  it('hidePatch sets the breakdown flags, and complexity only when a step has minutes', () => {
    expect(hidePatch([{ title: 'a', minutes: null, due: null }])).toEqual({ silent_parent: true, open_parent: false });
    expect(hidePatch([{ title: 'a', minutes: 4, due: null }, { title: 'b', minutes: 6, due: null }])).toEqual({ silent_parent: true, open_parent: false, complexity: 10 });
  });

  it('hideGuard pins open, not hidden, and no repeat or parts, the last two only when they read empty', () => {
    expect(hideGuard({ recurrence: null, slices: null })).toEqual({ done: 'is.false', silent_parent: 'not.is.true', recurrence: 'is.null', slices: 'is.null' });
    // A value the classifier reads as no repeat / no parts would never match is.null, so it is not pinned.
    expect(hideGuard({ recurrence: { kind: 'none' }, slices: { total: 0, done: 0 } })).toEqual({ done: 'is.false', silent_parent: 'not.is.true' });
  });

  it('insertedRowsFilter picks out exactly the ids given', () => {
    expect(insertedRowsFilter(['mcp-a-b-0', 'mcp-a-b-1'])).toEqual({ id: 'in.(mcp-a-b-0,mcp-a-b-1)' });
  });
});

// --- The finish walk -------------------------------------------------------------------------------------------

describe('isDoneOn and currentRound (the app rules, ported)', () => {
  it('a one-off is done when done; a repeat only on a day it was ticked for; {kind: none} is a one-off', () => {
    expect(isDoneOn({ done: true }, '2026-10-18')).toBe(true);
    expect(isDoneOn({ done: false }, '2026-10-18')).toBe(false);
    expect(isDoneOn({ done: false, recurrence: { kind: 'daily' }, completed_dates: ['2026-10-18'] }, '2026-10-18')).toBe(true);
    expect(isDoneOn({ done: true, recurrence: { kind: 'daily' }, completed_dates: ['2026-10-17'] }, '2026-10-18')).toBe(false);
    expect(isDoneOn({ done: true, recurrence: { kind: 'none' } }, '2026-10-18')).toBe(true);
  });

  it('currentRound keeps the live children, less any finished before the newest live one was made', () => {
    const kids = [
      { id: 'old', done: true, completedAt: 1500, createdAt: 1000 },
      { id: 'gone', done: false, createdAt: 3000, deletedAt: 3500 },
      { id: 'new', done: false, createdAt: 2000 },
      { id: 'late', done: true, completedAt: 2500, createdAt: 1001 },
    ];
    expect(currentRound(kids).map((k) => k.id)).toEqual(['new', 'late']);
    expect(currentRound([])).toEqual([]);
  });
});

describe('judgeLevel: the one rule', () => {
  const day = '2026-10-18';
  const P = (extra: WalkRow = {}): WalkRow => ({ id: 'P', title: 'Clear the garage', done: false, silent_parent: true, open_parent: false, ...extra });
  const kid = (id: string, done: boolean, extra: WalkRow = {}): WalkRow => ({
    id,
    done,
    parent_id: 'P',
    created_at: '2026-10-18T00:00:00.000Z',
    completed_at: done ? '2026-10-18T01:00:00.000Z' : null,
    ...extra,
  });

  it('finishes a hidden, open breakdown whose two or more live steps are all done', () => {
    expect(judgeLevel(P(), [kid('a', true), kid('b', true)], day, 0)).toEqual({ kind: 'finish' });
    expect(judgeLevel(P(), [kid('a', true), kid('b', true), kid('c', false, { deleted_at: '2026-10-18T00:30:00.000Z' })], day, 0)).toEqual({ kind: 'finish' });
  });

  it('a step still open is waiting, with the round counts', () => {
    expect(judgeLevel(P(), [kid('a', true), kid('b', false), kid('c', false)], day, 0)).toEqual({ kind: 'waiting', title: 'Clear the garage', done: 1, of: 3 });
    // A stale tiny flag on a breakdown with steps still open waits the same way.
    expect(judgeLevel(P({ open_parent: true }), [kid('a', true), kid('b', false)], day, 0)).toMatchObject({ kind: 'waiting' });
  });

  it("a made-tiny task, a round of one and a stale tiny flag on finished steps are the app's", () => {
    expect(judgeLevel(P({ open_parent: true }), [kid('a', true)], day, 0)).toEqual({ kind: 'app', title: 'Clear the garage' });
    expect(judgeLevel(P(), [kid('a', true)], day, 0)).toEqual({ kind: 'app', title: 'Clear the garage' });
    expect(judgeLevel(P({ open_parent: true }), [kid('a', true), kid('b', true)], day, 0)).toEqual({ kind: 'app', title: 'Clear the garage' });
    expect(judgeLevel(P(), [], day, 0)).toEqual({ kind: 'app', title: 'Clear the garage' });
  });

  it('nothing hidden waits at a missing, removed, done or visible parent', () => {
    const done = [kid('a', true), kid('b', true)];
    for (const parent of [null, P({ deleted_at: '2026-10-18T00:00:00.000Z' }), P({ done: true }), P({ silent_parent: false }), P({ silent_parent: null })]) {
      expect(judgeLevel(parent, done, day, 0)).toEqual({ kind: 'gone' });
    }
  });

  it("an earlier round's finished pebble is not counted", () => {
    const pebble = kid('k', true, { created_at: '2026-10-18T00:00:00.000Z', completed_at: '2026-10-18T00:10:00.000Z' });
    const step = kid('s', true, { created_at: '2026-10-18T00:20:00.000Z', completed_at: '2026-10-18T01:00:00.000Z' });
    expect(judgeLevel(P({ open_parent: null }), [pebble, step], day, 0)).toEqual({ kind: 'app', title: 'Clear the garage' });
  });
});

/** A Supabase stand-in for the walk: reads answer from `rows`, and a finish honours FINISH_GUARD the way PostgREST
 *  would, then writes. Records every finish it was asked for. */
function memoryIo(rows: WalkRow[]): WalkIo & { finishes: { id: string; body: Record<string, unknown>; guard: Record<string, string> }[] } {
  const finishes: { id: string; body: Record<string, unknown>; guard: Record<string, string> }[] = [];
  const matches = (row: WalkRow, guard: Record<string, string>) =>
    row.deleted_at == null &&
    Object.entries(guard).every(([k, v]) => {
      const val = (row as Record<string, unknown>)[k];
      if (v === 'is.false') return val === false;
      if (v === 'is.true') return val === true;
      if (v === 'not.is.true') return val !== true;
      throw new Error(`unexpected guard ${k}=${v}`);
    });
  return {
    finishes,
    async read(id) {
      return { parent: rows.find((r) => r.id === id) ?? null, children: rows.filter((r) => r.parent_id === id) };
    },
    async finish(id, body, guard) {
      finishes.push({ id, body, guard });
      const row = rows.find((r) => r.id === id);
      if (!row || !matches(row, guard)) return 'miss';
      Object.assign(row, body);
      return { ...row };
    },
  };
}

describe('planFinish', () => {
  const day = '2026-10-18';
  const now = '2026-10-18T05:00:00.000Z';
  const at = (min: number) => new Date(Date.UTC(2026, 9, 18, 0, min)).toISOString();
  const chain = (): WalkRow[] => [
    { id: 'G', title: 'Move house', done: false, silent_parent: true, open_parent: false, created_at: at(0) },
    { id: 'P', title: 'Pack the kitchen', parent_id: 'G', done: false, silent_parent: true, open_parent: false, created_at: at(1) },
    { id: 'Q', parent_id: 'G', done: true, created_at: at(2), completed_at: at(30) },
    { id: 's1', parent_id: 'P', done: true, created_at: at(3), completed_at: at(40) },
    { id: 's2', parent_id: 'P', done: true, created_at: at(4), completed_at: at(50) },
  ];

  it('finishes each certain level, dated to the step, with the exact body and guard, never open_parent', async () => {
    const io = memoryIo(chain());
    const out = await planFinish(io, { parentId: 'P', parentTitle: 'Pack the kitchen', completedAt: at(50) }, day, now);
    expect(out.finished.map((f) => f.id)).toEqual(['P', 'G']);
    expect(out.stop).toEqual({ kind: 'gone' });
    for (const f of io.finishes) {
      expect(f.body).toEqual({ done: true, completed_at: at(50), silent_parent: false, updated_at: now });
      expect(f.body).not.toHaveProperty('open_parent');
      expect(f.guard).toEqual({ done: 'is.false', silent_parent: 'is.true', open_parent: 'not.is.true' });
    }
    expect(finishBody(at(50), now)).toEqual(io.finishes[0].body);
    expect(FINISH_GUARD).toEqual(io.finishes[0].guard);
  });

  it('stops at the first level that is not certain, and says why', async () => {
    const rows = chain();
    (rows[2] as Record<string, unknown>).done = false; // Q still open
    const out = await planFinish(memoryIo(rows), { parentId: 'P', parentTitle: null, completedAt: at(50) }, day, now);
    expect(out.finished.map((f) => f.id)).toEqual(['P']);
    expect(out.stop).toEqual({ kind: 'waiting', title: 'Move house', done: 1, of: 2 });
  });

  it("a finish a device beat to it stops as the app's, and claims nothing", async () => {
    const io = memoryIo(chain());
    const beaten: WalkIo = { read: io.read, finish: async () => 'miss' };
    const out = await planFinish(beaten, { parentId: 'P', parentTitle: null, completedAt: at(50) }, day, now);
    expect(out).toEqual({ finished: [], stop: { kind: 'app', title: 'Pack the kitchen' } });
    const failed: WalkIo = { read: io.read, finish: async () => null };
    expect((await planFinish(failed, { parentId: 'P', parentTitle: null, completedAt: at(50) }, day, now)).finished).toEqual([]);
  });

  it("a failed read stops as the app's, naming the big task from the step's own record", async () => {
    const out = await planFinish({ read: async () => null, finish: async () => 'miss' }, { parentId: 'P', parentTitle: 'Pack the kitchen', completedAt: at(50) }, day, now);
    expect(out).toEqual({ finished: [], stop: { kind: 'app', title: 'Pack the kitchen' } });
  });

  it('a lying store that always looks finishable still ends: a cycle on the seen set, a chain at the depth cap', async () => {
    const finishable = (id: string, parent: string): { parent: WalkRow; children: WalkRow[] } => ({
      parent: { id, title: id, done: false, silent_parent: true, open_parent: false, parent_id: parent },
      children: [
        { id: `${id}-a`, done: true, created_at: at(0), completed_at: at(9) },
        { id: `${id}-b`, done: true, created_at: at(0), completed_at: at(9) },
      ],
    });
    const cycle: WalkIo = { read: async (id) => finishable(id, id === 'A' ? 'B' : 'A'), finish: async (id) => ({ id }) };
    const looped = await planFinish(cycle, { parentId: 'A', parentTitle: null, completedAt: at(9) }, day, now);
    expect(looped.finished.map((f) => f.id)).toEqual(['A', 'B']);
    expect(looped.stop).toEqual({ kind: 'gone' });
    let n = 0;
    const endless: WalkIo = { read: async (id) => finishable(id, `L${(n += 1)}`), finish: async (id) => ({ id }) };
    const capped = await planFinish(endless, { parentId: 'L0', parentTitle: null, completedAt: at(9) }, day, now);
    expect(capped.finished).toHaveLength(MAX_WALK_DEPTH);
    expect(capped.stop).toEqual({ kind: 'app', title: null });
  });
});

// --- The shared cases, run against the app's own rules in client/src/lib/settle-parity.test.ts ------------------

type CaseTask = {
  id: string;
  title?: string;
  done?: boolean;
  createdAt: number;
  completedAt?: number;
  deletedAt?: number;
  parentId?: string;
  parentTitle?: string;
  silentParent?: boolean;
  openParent?: boolean;
  recurrence?: unknown;
  completedDates?: string[];
};
type SettleCase = { name: string; tasks: CaseTask[]; completed: string; serverFinishes: string[] };
type SettleCases = { day: string; now: number; cases: SettleCase[] };

/** A fixture task as the row PostgREST would return. */
function toRow(t: CaseTask): WalkRow {
  const iso = (ms: number | undefined) => (ms === undefined ? null : new Date(ms).toISOString());
  return {
    id: t.id,
    title: t.title ?? t.id,
    done: t.done ?? false,
    recurrence: t.recurrence ?? null,
    completed_dates: t.completedDates ?? null,
    completed_at: iso(t.completedAt),
    created_at: iso(t.createdAt),
    silent_parent: t.silentParent ? true : null,
    open_parent: t.openParent ?? null,
    parent_id: t.parentId ?? null,
    deleted_at: iso(t.deletedAt),
  };
}

// node:fs through an untyped dynamic import, as events.test.ts does: the Worker's tsconfig has no node types.
const { readFileSync } = (await import(/* @vite-ignore */ 'node:fs' as string)) as { readFileSync: (p: URL, enc: string) => string };
const fixture = JSON.parse(readFileSync(new URL('./settle-cases.json', import.meta.url), 'utf8')) as SettleCases;

describe('settle-cases.json: the server finishes exactly what each case says', () => {

  it('holds the cases the design asks for', () => {
    expect(fixture.cases.length).toBeGreaterThanOrEqual(13);
  });

  for (const c of fixture.cases) {
    it(c.name, async () => {
      const rows = c.tasks.map(toRow);
      const step = rows.find((r) => r.id === c.completed) as WalkRow;
      const io = memoryIo(rows);
      const out = await planFinish(
        io,
        { parentId: step.parent_id as string, parentTitle: null, completedAt: step.completed_at as string },
        fixture.day,
        new Date(fixture.now).toISOString(),
      );
      expect(out.finished.map((f) => f.id)).toEqual(c.serverFinishes);
      // Every finish is dated to the step, and lands.
      for (const f of out.finished) expect(f.row.completed_at).toBe(step.completed_at);
      expect(io.finishes.length).toBe(c.serverFinishes.length);
    });
  }
});
