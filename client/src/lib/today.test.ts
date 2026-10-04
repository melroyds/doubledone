import { describe, expect, it } from 'vitest';

import { type Recurrence } from './recurrence';
import { applyManualOrder, completeAncestors, deferTo, deferToTomorrow, hasActiveTinyChild, healStuckParents, holdSecond, isDoneOn, pinFirst, renameTask, resurfaceOpenParent, setBig, setPin, setSequence, settleCompletions, skipOn, tasksForToday, tinyParentTitle, toggleDoneOn, type Scheduled, upcomingTasks, tuckFinished } from './today';

const today = new Date(2026, 5, 17);
const iso = '2026-06-17';
const daily = { kind: 'daily' } as Recurrence;

describe('isDoneOn', () => {
  it('a one-off uses its done flag', () => {
    expect(isDoneOn({ done: true }, today)).toBe(true);
    expect(isDoneOn({ done: false }, today)).toBe(false);
  });

  it('a recurring task is done only on dates in completedDates', () => {
    expect(isDoneOn({ done: false, recurrence: daily, completedDates: [iso] }, today)).toBe(true);
    expect(isDoneOn({ done: false, recurrence: daily, completedDates: [] }, today)).toBe(false);
    expect(isDoneOn({ done: true, recurrence: daily }, today)).toBe(false); // global done ignored
  });

  it('a recurring task completed yesterday reads not done today (daily reset)', () => {
    expect(isDoneOn({ done: false, recurrence: daily, completedDates: ['2026-06-16'] }, today)).toBe(
      false,
    );
  });
});

describe('pinFirst', () => {
  const t = (id: string, pinnedAt?: number) => ({ id, ...(pinnedAt != null ? { pinnedAt } : {}) });

  it('returns the same array reference when nothing is pinned', () => {
    const tasks = [t('a'), t('b'), t('c')];
    expect(pinFirst(tasks)).toBe(tasks);
  });

  it('floats the single pinned task to the front, preserving the rest order', () => {
    const tasks = [t('a'), t('b', 100), t('c')];
    expect(pinFirst(tasks).map((x) => x.id)).toEqual(['b', 'a', 'c']);
  });

  it('floats the most-recently pinned when more than one is pinned, the rest unchanged', () => {
    const tasks = [t('a', 100), t('b'), t('c', 200)];
    expect(pinFirst(tasks).map((x) => x.id)).toEqual(['c', 'a', 'b']);
  });

  it('does not float a completed pin, so a finished one thing recedes and the day re-centres', () => {
    const tasks = [t('a'), { id: 'b', pinnedAt: 100, done: true }, t('c')];
    expect(pinFirst(tasks).map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('setPin', () => {
  const mk = (id: string, pinnedAt?: number) => ({ id, updatedAt: 0, ...(pinnedAt != null ? { pinnedAt } : {}) });

  it('pins a task: stamps pinnedAt and bumps updatedAt', () => {
    const out = setPin([mk('a'), mk('b')], 'a', 500);
    expect(out.find((x) => x.id === 'a')).toMatchObject({ pinnedAt: 500, updatedAt: 500 });
    expect(out.find((x) => x.id === 'b')).not.toHaveProperty('pinnedAt');
  });

  it('pinning a second task clears the first pin and bumps both updatedAt, so the displacement syncs', () => {
    const out = setPin([mk('a', 100), mk('b')], 'b', 500);
    expect(out.find((x) => x.id === 'b')).toMatchObject({ pinnedAt: 500, updatedAt: 500 });
    const a = out.find((x) => x.id === 'a')!;
    expect(a).not.toHaveProperty('pinnedAt');
    expect(a.updatedAt).toBe(500);
    expect(out.filter((x) => x.pinnedAt != null)).toHaveLength(1);
  });

  it('acting on the current pin unpins it: clears pinnedAt, bumps updatedAt, none left pinned', () => {
    const out = setPin([mk('a', 100), mk('b')], 'a', 500);
    const a = out.find((x) => x.id === 'a')!;
    expect(a).not.toHaveProperty('pinnedAt');
    expect(a.updatedAt).toBe(500);
    expect(out.filter((x) => x.pinnedAt != null)).toHaveLength(0);
  });

  it('self-heals a two-pinned race: pinning one clears every other pin', () => {
    const out = setPin([mk('a', 100), mk('b', 200), mk('c')], 'c', 500);
    expect(out.filter((x) => x.pinnedAt != null).map((x) => x.id)).toEqual(['c']);
  });
});

describe('applyManualOrder', () => {
  const t = (id: string, manualOrder?: number) => ({ id, ...(manualOrder != null ? { manualOrder } : {}) });

  it('returns the same array reference when nothing has a manual order', () => {
    const tasks = [t('a'), t('b'), t('c')];
    expect(applyManualOrder(tasks)).toBe(tasks);
  });

  it('floats ordered tasks ahead by ascending manualOrder, the rest keeping their order', () => {
    const tasks = [t('a'), t('b', 1), t('c'), t('d', 0)];
    expect(applyManualOrder(tasks).map((x) => x.id)).toEqual(['d', 'b', 'a', 'c']);
  });

  it('is a stable partition: un-ordered tasks keep their incoming relative order', () => {
    const tasks = [t('a'), t('b'), t('c', 5)];
    expect(applyManualOrder(tasks).map((x) => x.id)).toEqual(['c', 'a', 'b']);
  });
});

describe('setSequence', () => {
  const mk = (id: string, manualOrder?: number) => ({ id, updatedAt: 0, ...(manualOrder != null ? { manualOrder } : {}) });

  it('stamps manualOrder = position for each id in the order and bumps updatedAt', () => {
    const out = setSequence([mk('a'), mk('b'), mk('c')], ['c', 'a', 'b'], 500);
    expect(out.find((x) => x.id === 'c')).toMatchObject({ manualOrder: 0, updatedAt: 500 });
    expect(out.find((x) => x.id === 'a')).toMatchObject({ manualOrder: 1, updatedAt: 500 });
    expect(out.find((x) => x.id === 'b')).toMatchObject({ manualOrder: 2, updatedAt: 500 });
  });

  it('clears a stale manualOrder off a task not in the new order, bumping its updatedAt', () => {
    const out = setSequence([mk('a', 0), mk('b', 1)], ['b'], 500);
    expect(out.find((x) => x.id === 'b')).toMatchObject({ manualOrder: 0, updatedAt: 500 });
    const a = out.find((x) => x.id === 'a')!;
    expect(a).not.toHaveProperty('manualOrder');
    expect(a.updatedAt).toBe(500);
  });

  it('leaves an unrelated, never-ordered task untouched (the same reference, no churn)', () => {
    const before = mk('a');
    const out = setSequence([before, mk('b')], ['b'], 500);
    expect(out.find((x) => x.id === 'a')).toBe(before);
  });
});

describe('renameTask', () => {
  const mk = (id: string, title: string) => ({ id, title, updatedAt: 0 });

  it('renames the one task, trims, and bumps updatedAt so the rename syncs', () => {
    const out = renameTask([mk('a', 'Old name'), mk('b', 'Keep me')], 'a', '  New name  ', 900);
    expect(out.find((t) => t.id === 'a')).toMatchObject({ title: 'New name', updatedAt: 900 });
    expect(out.find((t) => t.id === 'b')).toMatchObject({ title: 'Keep me', updatedAt: 0 });
  });

  it('an empty or whitespace title is a no-op returning the SAME array (no commit, no sync write)', () => {
    const tasks = [mk('a', 'Old name')];
    expect(renameTask(tasks, 'a', '   ', 900)).toBe(tasks);
    expect(renameTask(tasks, 'a', '', 900)).toBe(tasks);
  });

  it('an unchanged title (after trimming) is a no-op returning the SAME array', () => {
    const tasks = [mk('a', 'Same')];
    expect(renameTask(tasks, 'a', ' Same ', 900)).toBe(tasks);
  });

  it('an unknown id is a no-op returning the SAME array', () => {
    const tasks = [mk('a', 'Old name')];
    expect(renameTask(tasks, 'zzz', 'New', 900)).toBe(tasks);
  });
});

describe('setBig', () => {
  const mk = (id: string, big?: boolean) => ({ id, updatedAt: 0, ...(big ? { big } : {}) });

  it('marks every given id big and bumps updatedAt, leaving others untouched by reference', () => {
    const c = mk('c');
    const out = setBig([mk('a'), mk('b'), c], ['a', 'b'], true, 500);
    expect(out.find((x) => x.id === 'a')).toMatchObject({ big: true, updatedAt: 500 });
    expect(out.find((x) => x.id === 'b')).toMatchObject({ big: true, updatedAt: 500 });
    expect(out.find((x) => x.id === 'c')).toBe(c);
  });

  it('clears big by deleting the key (absent, not false) and bumps updatedAt', () => {
    const out = setBig([mk('a', true), mk('b', true)], ['a'], false, 500);
    const a = out.find((x) => x.id === 'a')!;
    expect(a).not.toHaveProperty('big');
    expect(a.updatedAt).toBe(500);
    expect(out.find((x) => x.id === 'b')).toMatchObject({ big: true }); // untouched
  });
});

describe('toggleDoneOn', () => {
  it('flips done for a one-off', () => {
    expect(toggleDoneOn({ done: false }, today).done).toBe(true);
    expect(toggleDoneOn({ done: true }, today).done).toBe(false);
  });

  it('adds then removes today for a recurring task, leaving other days untouched', () => {
    const base = { done: false, recurrence: daily, completedDates: ['2026-06-16'] };
    const onceDone = toggleDoneOn(base, today);
    expect(onceDone.completedDates).toEqual(['2026-06-16', iso]);
    const undone = toggleDoneOn(onceDone, today);
    expect(undone.completedDates).toEqual(['2026-06-16']);
  });
});

describe('skipOn', () => {
  it('adds the day to skippedDates without mutating the original (purity)', () => {
    const base = { done: false, recurrence: daily, skippedDates: ['2026-06-16'] };
    const skipped = skipOn(base, today);
    expect(skipped.skippedDates).toEqual(['2026-06-16', iso]);
    expect(base.skippedDates).toEqual(['2026-06-16']); // untouched
    expect(skipped).not.toBe(base);
  });

  it('is idempotent: skipping an already-skipped day changes nothing', () => {
    const once = skipOn<Scheduled>({ done: false, recurrence: daily }, today);
    const twice = skipOn(once, today);
    expect(twice.skippedDates).toEqual([iso]);
    expect(twice).toBe(once);
  });

  it('a skipped daily task vanishes from Today but returns tomorrow', () => {
    const skipped = skipOn({ id: 'd', done: false, recurrence: daily }, today);
    expect(tasksForToday([skipped], today)).toEqual([]);
    expect(tasksForToday([skipped], new Date(2026, 5, 18)).map((t) => t.id)).toEqual(['d']);
  });

  it('a skipped weekly task returns on its next weekday', () => {
    // 2026-06-17 is a Wednesday (3); the task repeats Wed + Fri.
    const weekly = { kind: 'weekly', weekdays: [3, 5] } as Recurrence;
    const skipped = skipOn({ id: 'w', done: false, recurrence: weekly }, today);
    expect(tasksForToday([skipped], today)).toEqual([]);
    expect(tasksForToday([skipped], new Date(2026, 5, 18))).toEqual([]); // Thursday: not due anyway
    expect(tasksForToday([skipped], new Date(2026, 5, 19)).map((t) => t.id)).toEqual(['w']); // Friday: back
  });

  it('does not touch completedDates', () => {
    const skipped = skipOn({ done: false, recurrence: daily, completedDates: ['2026-06-16'] }, today);
    expect(skipped.completedDates).toEqual(['2026-06-16']);
  });

  it('a one-off is never affected by skippedDates', () => {
    const oneOff = { id: 'o', done: false, skippedDates: [iso] };
    expect(tasksForToday([oneOff], today).map((t) => t.id)).toEqual(['o']);
  });
});

describe('deferToTomorrow', () => {
  it('sets an undated one-off to due tomorrow', () => {
    const undated: Scheduled = { done: false };
    expect(deferToTomorrow(undated, today).due).toBe('2026-06-18');
  });

  it('moves an overdue one-off forward to tomorrow (not just to today)', () => {
    expect(deferToTomorrow({ done: false, due: '2026-06-10' }, today).due).toBe('2026-06-18');
  });

  it('leaves a recurring task unchanged (it moves by cadence, not deferral)', () => {
    const task = { done: false, recurrence: daily, completedDates: [iso] };
    expect(deferToTomorrow(task, today)).toBe(task);
  });

  it('a deferred task leaves Today and lands in the Later list', () => {
    const deferred = deferToTomorrow({ id: 'x', done: false }, today);
    expect(tasksForToday([deferred], today)).toEqual([]);
    expect(upcomingTasks([deferred], today).map((t) => t.id)).toEqual(['x']);
  });
});

describe('deferTo', () => {
  it('moves a one-off to the given date', () => {
    const undated: Scheduled = { done: false };
    expect(deferTo(undated, '2026-06-25').due).toBe('2026-06-25');
    expect(deferTo({ done: false, due: '2026-06-10' } as Scheduled, '2026-06-25').due).toBe('2026-06-25');
  });
  it('leaves a recurring task unchanged (it moves by cadence, not a chosen date)', () => {
    const task = { done: false, recurrence: daily, completedDates: [iso] };
    expect(deferTo(task, '2026-06-25')).toBe(task);
  });
});

describe('tasksForToday', () => {
  it('keeps undated, due-today, overdue (rolled forward), and recurring; not future', () => {
    const tasks = [
      { id: 'undated', done: false },
      { id: 'due-today', done: false, due: iso },
      { id: 'overdue', done: false, due: '2026-06-10' },
      { id: 'future', done: false, due: '2026-06-20' },
      { id: 'daily', done: false, recurrence: daily },
    ];
    expect(tasksForToday(tasks, today).map((t) => t.id)).toEqual([
      'undated',
      'due-today',
      'overdue',
      'daily',
    ]);
  });

  it('keeps a one-off finished today and a recurring done today, drops one finished earlier', () => {
    const todayMs = new Date(2026, 5, 17, 9).getTime();
    const yesterdayMs = new Date(2026, 5, 16, 9).getTime();
    const tasks = [
      { id: 'done-today', done: true, completedAt: todayMs },
      { id: 'done-earlier', done: true, completedAt: yesterdayMs },
      { id: 'open', done: false },
      { id: 'daily-done', done: false, recurrence: daily, completedDates: [iso] },
    ];
    expect(tasksForToday(tasks, today).map((t) => t.id)).toEqual(['done-today', 'open', 'daily-done']);
  });

  it('excludes soft-deleted (tombstoned) tasks, recurring or not', () => {
    const tasks = [
      { id: 'live', done: false },
      { id: 'gone', done: false, deletedAt: 123 },
      { id: 'gone-daily', done: false, recurrence: daily, deletedAt: 123 },
    ];
    expect(tasksForToday(tasks, today).map((t) => t.id)).toEqual(['live']);
  });

  it('hides a silent parent (its children show instead)', () => {
    const tasks = [
      { id: 'parent', done: false, silentParent: true },
      { id: 'step', done: false, parentId: 'parent' },
    ];
    expect(tasksForToday(tasks, today).map((t) => t.id)).toEqual(['step']);
  });
});

describe('upcomingTasks', () => {
  it('returns future one-offs not done, soonest first', () => {
    const tasks = [
      { id: 'today', done: false, due: iso }, // due today, not upcoming
      { id: 'later', done: false, due: '2026-06-25' },
      { id: 'soon', done: false, due: '2026-06-19' },
      { id: 'past', done: false, due: '2026-06-10' },
      { id: 'done-future', done: true, due: '2026-06-20' },
      { id: 'recurring', done: false, recurrence: daily },
      { id: 'undated', done: false },
    ];
    expect(upcomingTasks(tasks, today).map((t) => t.id)).toEqual(['soon', 'later']);
  });

  it('excludes soft-deleted future tasks', () => {
    const tasks = [
      { id: 'soon', done: false, due: '2026-06-19' },
      { id: 'gone', done: false, due: '2026-06-20', deletedAt: 1 },
    ];
    expect(upcomingTasks(tasks, today).map((t) => t.id)).toEqual(['soon']);
  });

  it('excludes a future-dated silent parent', () => {
    const tasks = [
      { id: 'soon', done: false, due: '2026-06-19' },
      { id: 'parent', done: false, due: '2026-06-20', silentParent: true },
    ];
    expect(upcomingTasks(tasks, today).map((t) => t.id)).toEqual(['soon']);
  });
});

describe('completeAncestors (Cluster B chain)', () => {
  type TestTask = {
    id: string;
    title: string;
    parentId?: string;
    done: boolean;
    updatedAt: number;
    silentParent?: boolean;
    completedAt?: number | null;
    openParent?: boolean;
    deletedAt?: number | null;
  };
  const mk = (id: string, parentId: string | undefined, done: boolean, silentParent = false): TestTask => ({
    id,
    title: id,
    parentId,
    done,
    updatedAt: 0,
    silentParent,
  });

  it('completes a parent when its last child is done, and reports it', () => {
    const tasks = [mk('p', undefined, false, true), mk('c1', 'p', true), mk('c2', 'p', true)];
    const { tasks: next, completed } = completeAncestors(tasks, 'c2', today, 100);
    const parent = next.find((t) => t.id === 'p');
    expect(parent?.done).toBe(true);
    expect(parent?.completedAt).toBe(100);
    expect(parent?.silentParent).toBe(false);
    expect(completed.map((t) => t.title)).toEqual(['p']);
  });

  it('leaves the parent open while a sibling is unfinished', () => {
    const tasks = [mk('p', undefined, false, true), mk('c1', 'p', true), mk('c2', 'p', false)];
    const { tasks: next, completed } = completeAncestors(tasks, 'c1', today, 100);
    expect(next.find((t) => t.id === 'p')?.done).toBe(false);
    expect(completed).toEqual([]);
  });

  it('cascades up: the last step finishes the milestone and then the root', () => {
    const tasks = [mk('root', undefined, false, true), mk('mile', 'root', false, true), mk('s1', 'mile', true)];
    const { tasks: next, completed } = completeAncestors(tasks, 's1', today, 100);
    expect(next.find((t) => t.id === 'mile')?.done).toBe(true);
    expect(next.find((t) => t.id === 'root')?.done).toBe(true);
    expect(completed.map((t) => t.title)).toEqual(['mile', 'root']);
  });

  it('does nothing for a task with no parent', () => {
    expect(completeAncestors([mk('a', undefined, true)], 'a', today, 100).completed).toEqual([]);
  });

  it('stops below an ancestor already back on Today (it is finished by its own tick)', () => {
    const tasks = [mk('root', undefined, false, false), mk('mile', 'root', false, true), mk('s1', 'mile', true)];
    const { tasks: next, completed } = completeAncestors(tasks, 's1', today, 100);
    expect(completed.map((t) => t.id)).toEqual(['mile']);
    expect(next.find((t) => t.id === 'root')?.done).toBe(false);
  });

  it('never auto-completes an open (tiny-version) parent', () => {
    const tasks = [{ ...mk('p', undefined, false, true), openParent: true }, mk('c', 'p', true)];
    expect(completeAncestors(tasks, 'c', today, 100).completed).toEqual([]);
  });

  it('hasActiveTinyChild is true only for an incomplete, non-deleted child', () => {
    expect(hasActiveTinyChild([mk('p', undefined, false, true), mk('c', 'p', false)], 'p')).toBe(true);
    expect(hasActiveTinyChild([mk('p', undefined, false, true), mk('c', 'p', true)], 'p')).toBe(false); // done
    expect(hasActiveTinyChild([mk('p', undefined, false, true), { ...mk('c', 'p', false), deletedAt: 1 }], 'p')).toBe(false); // retired
    expect(hasActiveTinyChild([mk('p', undefined, false, true)], 'p')).toBe(false); // no child
  });

  it('resurfaceOpenParent un-silences an open parent and retires the spent pebble', () => {
    const tasks = [{ ...mk('p', undefined, false, true), openParent: true }, mk('c', 'p', true)];
    const { tasks: next, parentTitle } = resurfaceOpenParent(tasks, 'c', 100);
    expect(parentTitle).toBe('p');
    expect(next.find((t) => t.id === 'p')?.silentParent).toBe(false);
    expect(next.find((t) => t.id === 'c')?.deletedAt).toBe(100); // pebble retired, no pile-up
  });

  it('resurfaceOpenParent ignores a non-open (exhaustive) parent and a parentless task', () => {
    expect(resurfaceOpenParent([mk('p', undefined, false, true), mk('c', 'p', true)], 'c', 100).parentTitle).toBeNull();
    expect(resurfaceOpenParent([mk('a', undefined, true)], 'a', 100).parentTitle).toBeNull();
  });

  it('dates the finished parents to the step\'s own completion when told to', () => {
    const tasks = [mk('p', undefined, false, true), mk('c', 'p', true)];
    const parent = completeAncestors(tasks, 'c', today, 100, 40).tasks.find((t) => t.id === 'p');
    expect(parent?.completedAt).toBe(40);
    expect(parent?.updatedAt).toBe(100); // the sync stamp is still now
  });
});

// Every way a task gets finished goes through settleCompletions (2026-10-04). Until then only the row tick
// walked up, so the last step done in Focus, in bulk or on a stepped task left the big task hidden for good.
describe('settleCompletions (one parent walk for every completion path)', () => {
  type T = { id: string; title: string; parentId?: string; done: boolean; updatedAt: number; silentParent?: boolean; completedAt?: number | null; openParent?: boolean; deletedAt?: number | null };
  const t = (id: string, parentId?: string, over: Partial<T> = {}): T => ({ id, title: id, parentId, done: false, updatedAt: 0, ...over });
  // A breakdown made on this build: Break it down writes openParent: false, so its finish is never in doubt.
  const big = (over: Partial<T> = {}) => t('big', undefined, { silentParent: true, openParent: false, ...over });

  it('finishes the big task when the last step is done, and names it for the bloom', () => {
    const tasks = [big(), t('s1', 'big', { done: true, completedAt: 50 }), t('s2', 'big', { done: true, completedAt: 60 })];
    const r = settleCompletions(tasks, ['s2'], today, 100);
    const parent = r.tasks.find((x) => x.id === 'big');
    expect(parent).toMatchObject({ done: true, silentParent: false, completedAt: 60 }); // the step's own completion
    expect(r.whole?.id).toBe('big');
    expect(r.wholeDepth).toBe(1);
    expect(r.parentBack).toBeNull();
  });

  it('a bulk Done of every step finishes the big task once', () => {
    const tasks = [big(), t('s1', 'big', { done: true }), t('s2', 'big', { done: true })];
    const r = settleCompletions(tasks, ['s1', 's2'], today, 100);
    expect(r.tasks.filter((x) => x.id === 'big' && x.done)).toHaveLength(1);
    expect(r.wholes).toHaveLength(1);
  });

  it('reports every whole task a bulk Done finishes, not only the last', () => {
    const tasks = [
      t('a', undefined, { silentParent: true, openParent: false }), t('a1', 'a', { done: true }), t('a2', 'a', { done: true }),
      t('b', undefined, { silentParent: true, openParent: false }), t('b1', 'b', { done: true }), t('b2', 'b', { done: true }),
    ];
    const r = settleCompletions(tasks, ['a2', 'b2'], today, 100);
    expect(r.wholes.map((w) => w.task.id)).toEqual(['a', 'b']);
    expect(r.whole?.id).toBe('b');
  });

  it('a tiny step brings its real task back and retires the pebble', () => {
    const tasks = [t('real', undefined, { silentParent: true, openParent: true }), t('pebble', 'real', { done: true })];
    const r = settleCompletions(tasks, ['pebble'], today, 100);
    expect(r.tasks.find((x) => x.id === 'real')).toMatchObject({ silentParent: false, done: false });
    expect(r.tasks.find((x) => x.id === 'pebble')?.deletedAt).toBe(100);
    expect(r.parentBack).toBe('real');
    expect(r.whole).toBeNull();
  });

  // The review's catch: a tiny step's real task whose flag a sync wiped (or that came from another device,
  // which never receives it) looks exactly like a one-step breakdown. Finishing it on a guess put a task the
  // user never finished in the Lookback, with a bloom.
  it('brings back, never finishes, a one-step parent whose tiny flag is unknown', () => {
    const tasks = [t('real', undefined, { silentParent: true }), t('pebble', 'real', { done: true, completedAt: 50 })];
    const r = settleCompletions(tasks, ['pebble'], today, 100);
    expect(r.tasks.find((x) => x.id === 'real')).toMatchObject({ done: false, silentParent: false });
    expect(r.tasks.find((x) => x.id === 'pebble')).toMatchObject({ done: true, completedAt: 50 }); // kept, still in the Lookback
    expect(r.tasks.find((x) => x.id === 'pebble')?.deletedAt).toBeUndefined();
    expect(r.whole).toBeNull();
    expect(r.parentBack).toBe('real');
  });

  it('still finishes a known one-step breakdown (openParent false), bloom and all', () => {
    const tasks = [big(), t('only', 'big', { done: true, completedAt: 50 })];
    expect(settleCompletions(tasks, ['only'], today, 100).whole?.id).toBe('big');
  });

  // A once-tiny task broken down carried its stale flag, so every real step behaved as a tiny step (retired
  // on its tick, the task never finished). Two or more live children mean a decomposition.
  it('treats a stale tiny flag on a real decomposition as the decomposition it is', () => {
    const tasks = [t('real', undefined, { silentParent: true, openParent: true }), t('s1', 'real', { done: true }), t('s2', 'real')];
    const r = settleCompletions(tasks, ['s1'], today, 100);
    expect(r.tasks.find((x) => x.id === 's1')?.deletedAt).toBeUndefined(); // a real completion, never retired
    expect(r.tasks.find((x) => x.id === 'real')).toMatchObject({ openParent: false, silentParent: true, done: false });
    const r2 = settleCompletions(r.tasks.map((x) => (x.id === 's2' ? { ...x, done: true } : x)), ['s2'], today, 200);
    expect(r2.whole?.id).toBe('real');
  });

  // The re-verify's catch: an unknown-flag task brought back keeps its first, finished pebble live (it may be
  // a real step). Made tiny again, it then had two live children, read as a breakdown, and the second
  // pebble's tick FINISHED the real task. A child done before the newest existed belongs to an earlier round.
  it('never finishes a task made tiny twice, flag known or not', () => {
    for (const openParent of [true, undefined]) {
      const tasks = [
        t('real', undefined, { silentParent: true, openParent }),
        { ...t('p1', 'real', { done: true, completedAt: 100 }), createdAt: 50 },
        { ...t('p2', 'real', { done: true, completedAt: 300 }), createdAt: 200 },
      ];
      const r = settleCompletions(tasks, ['p2'], today, 400);
      expect(r.whole).toBeNull();
      expect(r.tasks.find((x) => x.id === 'real')).toMatchObject({ done: false, silentParent: false });
      expect(r.tasks.find((x) => x.id === 'p1')?.deletedAt).toBeUndefined(); // never retired on a guess
    }
  });

  it('never finishes a parent already back on Today by re-ticking its step', () => {
    const tasks = [t('real', undefined, { silentParent: false }), t('only', 'real', { done: true, completedAt: 50 })];
    const r = settleCompletions(tasks, ['only'], today, 100);
    expect(r.whole).toBeNull();
    expect(r.tasks.find((x) => x.id === 'real')?.done).toBe(false);
  });

  it('brings back a tiny real task above a pebble that was itself broken down', () => {
    const tasks = [
      t('root', undefined, { silentParent: true, openParent: true }),
      t('pebble', 'root', { silentParent: true, openParent: false }),
      t('a', 'pebble', { done: true }),
      t('b', 'pebble', { done: true }),
    ];
    const r = settleCompletions(tasks, ['b'], today, 100);
    expect(r.tasks.find((x) => x.id === 'pebble')).toMatchObject({ done: true }); // the pebble's whole: a finished task
    expect(r.tasks.find((x) => x.id === 'pebble')?.deletedAt).toBeUndefined(); // of record, never retired
    expect(r.tasks.find((x) => x.id === 'root')).toMatchObject({ silentParent: false, done: false });
    expect(r.backs.map((b) => b.title)).toEqual(['root']);
  });

  it('says which kind came back: a tiny task, or one whose kind is unknown', () => {
    const tiny = settleCompletions([t('r', undefined, { silentParent: true, openParent: true }), t('p', 'r', { done: true })], ['p'], today, 9);
    expect(tiny.parentBackTiny).toBe(true);
    const unknown = settleCompletions([t('r', undefined, { silentParent: true }), t('p', 'r', { done: true })], ['p'], today, 9);
    expect(unknown.parentBackTiny).toBe(false);
  });

  it('ignores an id that is not done, has no parent, or has gone', () => {
    const tasks = [big(), t('s1', 'big'), t('loose', undefined, { done: true }), t('gone', 'big', { done: true, deletedAt: 5 })];
    const r = settleCompletions(tasks, ['s1', 'loose', 'gone', 'missing'], today, 100);
    expect(r.tasks).toEqual(tasks);
    expect(r.whole).toBeNull();
  });
});

// The repair for parents already stuck (2026-10-04): steps finished in Focus before the fix, or on another
// device, through the API or by an agent, none of which walk a parent.
describe('healStuckParents', () => {
  type T = { id: string; title: string; parentId?: string; done: boolean; createdAt?: number; updatedAt: number; silentParent?: boolean; completedAt?: number | null; openParent?: boolean; deletedAt?: number | null; combinedFrom?: { id: string; title: string }[] };
  const t = (id: string, parentId?: string, over: Partial<T> = {}): T => ({ id, title: id, parentId, done: false, createdAt: 0, updatedAt: 10, ...over });
  const NOW = 1_000_000;

  it('finishes a hidden big task whose steps are all done, dated to its last step, stamped from its own row', () => {
    const tasks = [t('big', undefined, { silentParent: true }), t('s1', 'big', { done: true, completedAt: 30 }), t('s2', 'big', { done: true, completedAt: 70 })];
    expect(healStuckParents(tasks, NOW).find((x) => x.id === 'big')).toMatchObject({ done: true, completedAt: 70, silentParent: false, updatedAt: 11 });
  });

  // The review's catch: stamping `now` let a stale device's repair beat a real edit made since elsewhere.
  // Stamped from the row (+1), the repair beats only the copy it was derived from.
  it('never stamps the clock: two devices repairing the same state write identical rows', () => {
    const tasks = [t('big', undefined, { silentParent: true }), t('s1', 'big', { done: true, completedAt: 30 }), t('s2', 'big', { done: true, completedAt: 70 })];
    expect(healStuckParents(tasks, NOW)).toEqual(healStuckParents(tasks, NOW + 99_999));
  });

  it('walks up a chain: a finished milestone finishes its root', () => {
    const tasks = [
      t('root', undefined, { silentParent: true }),
      t('m1', 'root', { silentParent: true }),
      t('m2', 'root', { done: true, completedAt: 10 }),
      t('s1', 'm1', { done: true, completedAt: 20 }),
      t('s2', 'm1', { done: true, completedAt: 15 }),
    ];
    const out = healStuckParents(tasks, NOW);
    expect(out.find((x) => x.id === 'm1')).toMatchObject({ done: true, completedAt: 20 });
    expect(out.find((x) => x.id === 'root')).toMatchObject({ done: true, completedAt: 20 });
  });

  it('brings back, open, a task with a single finished step: it may be a tiny step whose flag a sync wiped', () => {
    const tasks = [t('maybeTiny', undefined, { silentParent: true }), t('only', 'maybeTiny', { done: true, completedAt: 30 })];
    expect(healStuckParents(tasks, NOW).find((x) => x.id === 'maybeTiny')).toMatchObject({ done: false, silentParent: false });
  });

  it('brings back a task whose steps were all removed, open, never lost', () => {
    const tasks = [t('big', undefined, { silentParent: true }), t('s1', 'big', { deletedAt: 9 }), t('s2', 'big', { deletedAt: 9 })];
    expect(healStuckParents(tasks, NOW).find((x) => x.id === 'big')).toMatchObject({ done: false, silentParent: false });
  });

  it('waits out the Undo window: a step removed seconds ago leaves its parent alone', () => {
    const tasks = [t('big', undefined, { silentParent: true }), t('s1', 'big', { done: true, completedAt: 5 }), t('s2', 'big', { done: true, completedAt: 6 }), t('s3', 'big', { deletedAt: NOW - 2000 })];
    expect(healStuckParents(tasks, NOW)).toBe(tasks);
    expect(healStuckParents(tasks, NOW + 10_000).find((x) => x.id === 'big')?.done).toBe(true);
  });

  it('brings back the real task behind a tiny step that was done or removed, retiring a spent pebble', () => {
    const spent = [t('real', undefined, { silentParent: true, openParent: true }), t('pebble', 'real', { done: true, completedAt: 40 })];
    const a = healStuckParents(spent, NOW);
    expect(a.find((x) => x.id === 'real')).toMatchObject({ silentParent: false, done: false });
    expect(a.find((x) => x.id === 'pebble')?.deletedAt).toBe(40);
    const removed = [t('real', undefined, { silentParent: true, openParent: true }), t('pebble', 'real', { deletedAt: 9 })];
    expect(healStuckParents(removed, NOW).find((x) => x.id === 'real')?.silentParent).toBe(false);
  });

  it('clears a stale tiny flag on a decomposition and finishes it, keeping every step', () => {
    const tasks = [t('real', undefined, { silentParent: true, openParent: true }), t('s1', 'real', { done: true, completedAt: 30 }), t('s2', 'real', { done: true, completedAt: 40 })];
    const out = healStuckParents(tasks, NOW);
    expect(out.find((x) => x.id === 'real')).toMatchObject({ done: true, completedAt: 40, openParent: false });
    expect(out.filter((x) => x.parentId === 'real' && x.deletedAt != null)).toEqual([]);
  });

  it('leaves alone a parent still waiting on a step, an open tiny step, and a parent with no steps yet', () => {
    const tasks = [
      t('a', undefined, { silentParent: true }),
      t('a1', 'a', { done: true }),
      t('a2', 'a'),
      t('b', undefined, { silentParent: true, openParent: true }),
      t('b1', 'b'),
      t('c', undefined, { silentParent: true }), // its steps may not have synced yet
    ];
    expect(healStuckParents(tasks, NOW)).toBe(tasks); // the SAME array: nothing to commit
  });

  it('tidies away, never finishes, a parent whose remaining steps went into a combined task', () => {
    const tasks = [
      t('big', undefined, { silentParent: true }),
      t('s1', 'big', { done: true, completedAt: 5 }),
      t('s2', 'big', { done: true, completedAt: 6 }),
      t('s3', 'big', { deletedAt: 50 }),
      t('umbrella', undefined, { createdAt: 50, combinedFrom: [{ id: 's3', title: 's3' }] }),
    ];
    expect(healStuckParents(tasks, NOW).find((x) => x.id === 'big')).toMatchObject({ deletedAt: 50, done: false });
  });

  // combinedFrom is device-local (and a pre-fix sync wiped it), so a folded step is also known by its
  // tombstone matching the umbrella's createdAt, which both sync.
  it('recognises a folded step without the umbrella\'s record, by the matching tombstone', () => {
    const tasks = [
      t('big', undefined, { silentParent: true }),
      t('s1', 'big', { done: true, completedAt: 5 }),
      t('s2', 'big', { done: true, completedAt: 6 }),
      t('s3', 'big', { deletedAt: 50 }),
      t('umbrella', undefined, { createdAt: 50 }),
    ];
    expect(healStuckParents(tasks, NOW).find((x) => x.id === 'big')).toMatchObject({ deletedAt: 50, done: false });
  });

  it('finishes, not tidies, when a step was finished after the fold (the work was done, not moved)', () => {
    const tasks = [
      t('big', undefined, { silentParent: true }),
      t('s1', 'big', { done: true, completedAt: 5 }),
      t('s2', 'big', { done: true, completedAt: 80 }),
      t('s3', 'big', { deletedAt: 50 }),
      t('umbrella', undefined, { createdAt: 50, combinedFrom: [{ id: 's3', title: 's3' }] }),
    ];
    expect(healStuckParents(tasks, NOW).find((x) => x.id === 'big')).toMatchObject({ done: true, completedAt: 80 });
  });

  it('brings back the real task Combine wrongly deleted with its tiny step, and only that one', () => {
    const wronged = [
      t('real', undefined, { silentParent: true, openParent: true, deletedAt: 50 }),
      t('pebble', 'real', { deletedAt: 50 }),
      t('umbrella', undefined, { createdAt: 50, combinedFrom: [{ id: 'pebble', title: 'pebble' }] }),
    ];
    expect(healStuckParents(wronged, NOW).find((x) => x.id === 'real')).toMatchObject({ deletedAt: null, silentParent: false });
    // Removed by the user AFTER the combine (a different tombstone): stays removed.
    const removedLater = wronged.map((x) => (x.id === 'real' ? { ...x, deletedAt: 80 } : x));
    expect(healStuckParents(removedLater, NOW).find((x) => x.id === 'real')?.deletedAt).toBe(80);
    // Folded on purpose (it is in the umbrella's record itself): stays folded.
    const foldedOnPurpose = wronged.map((x) => (x.id === 'umbrella' ? { ...x, combinedFrom: [{ id: 'pebble', title: 'p' }, { id: 'real', title: 'r' }] } : x));
    expect(healStuckParents(foldedOnPurpose, NOW).find((x) => x.id === 'real')?.deletedAt).toBe(50);
  });

  it('never finishes a task made tiny twice whose second pebble was done elsewhere', () => {
    const tasks = [
      t('real', undefined, { silentParent: true }),
      t('p1', 'real', { done: true, completedAt: 100, createdAt: 50 }),
      t('p2', 'real', { done: true, completedAt: 300, createdAt: 200 }),
    ];
    expect(healStuckParents(tasks, NOW).find((x) => x.id === 'real')).toMatchObject({ done: false, silentParent: false });
  });

  it('leaves a parent alone while the screen still offers Undo on its step, whatever the clock says', () => {
    const tasks = [t('big', undefined, { silentParent: true }), t('s1', 'big', { done: true, completedAt: 5 }), t('s2', 'big', { done: true, completedAt: 6 }), t('s3', 'big', { deletedAt: NOW - 60_000 })];
    expect(healStuckParents(tasks, NOW, new Set(['s3']))).toBe(tasks);
    // A tombstone a few seconds in the FUTURE (a fast clock) is still inside the window.
    const future = tasks.map((x) => (x.id === 's3' ? { ...x, deletedAt: NOW + 2000 } : x));
    expect(healStuckParents(future, NOW)).toBe(future);
  });

  it('matches a folded step to its umbrella in whole milliseconds (a fractional local stamp)', () => {
    const T = 1_759_000_000_000.5;
    const tasks = [
      t('big', undefined, { silentParent: true }),
      t('s1', 'big', { done: true, completedAt: 5 }),
      t('s2', 'big', { done: true, completedAt: 6 }),
      t('s3', 'big', { deletedAt: T }),
      t('umbrella', undefined, { createdAt: Math.trunc(T) }), // the server's copy, whole ms
    ];
    expect(healStuckParents(tasks, NOW).find((x) => x.id === 'big')?.done).toBe(false);
    expect(healStuckParents(tasks, NOW).find((x) => x.id === 'big')?.deletedAt).toBe(T);
  });

  it('follows an umbrella that was itself combined again', () => {
    const tasks = [
      t('big', undefined, { silentParent: true }),
      t('s1', 'big', { done: true, completedAt: 5 }),
      t('s2', 'big', { done: true, completedAt: 6 }),
      t('s3', 'big', { deletedAt: 50 }),
      t('u1', undefined, { createdAt: 50, deletedAt: 70, combinedFrom: [{ id: 's3', title: 's3' }] }),
      t('u2', undefined, { createdAt: 70, combinedFrom: [{ id: 'u1', title: 'u1' }] }),
    ];
    expect(healStuckParents(tasks, NOW).find((x) => x.id === 'big')).toMatchObject({ done: false, deletedAt: 50 });
  });

  it('is idempotent: a second run changes nothing', () => {
    const tasks = [t('big', undefined, { silentParent: true }), t('s1', 'big', { done: true, completedAt: 30 }), t('s2', 'big', { done: true, completedAt: 40 })];
    const once = healStuckParents(tasks, NOW);
    expect(healStuckParents(once, NOW + 5)).toBe(once);
  });
});

describe('tinyParentTitle', () => {
  type TT = { id: string; parentId?: string; parentTitle?: string; openParent?: boolean };

  it('returns the parent title for a pebble whose parent is open', () => {
    const tasks: TT[] = [
      { id: 'p', openParent: true },
      { id: 'peb', parentId: 'p', parentTitle: 'Do my taxes' },
    ];
    expect(tinyParentTitle(tasks, tasks[1])).toBe('Do my taxes');
  });

  it('returns null for a decomposition step (the parent is silent, not open)', () => {
    const tasks: TT[] = [
      { id: 'p' }, // a silent (not open) parent
      { id: 's', parentId: 'p', parentTitle: 'Plan the party' },
    ];
    expect(tinyParentTitle(tasks, tasks[1])).toBeNull();
  });

  it('returns null for a task with no parent', () => {
    const tasks: TT[] = [{ id: 'a' }];
    expect(tinyParentTitle(tasks, tasks[0])).toBeNull();
  });
});

// The held task floats (Melroy's device verdict, 2026-08-23), always BELOW the pin: the paid
// signal keeps its seat by construction, not by convention.
describe('holdSecond', () => {
  const t = (id: string, over: Record<string, unknown> = {}) =>
    ({ id, title: id, done: false, createdAt: 1, updatedAt: 1, ...over }) as never;

  it('floats the held task to the top when nothing is pinned', () => {
    const out = holdSecond([t('a'), t('b'), t('held')], 'held');
    expect(out.map((x: { id: string }) => x.id)).toEqual(['held', 'a', 'b']);
  });

  it('slots BELOW a pinned task, never above it', () => {
    const out = holdSecond([t('pin', { pinnedAt: 5 }), t('a'), t('held')], 'held');
    expect(out.map((x: { id: string }) => x.id)).toEqual(['pin', 'held', 'a']);
  });

  it('returns the same reference when the held task is already seated, or absent, or null', () => {
    const seated = [t('held'), t('a')];
    expect(holdSecond(seated, 'held')).toBe(seated);
    const list = [t('a'), t('b')];
    expect(holdSecond(list, 'missing')).toBe(list);
    expect(holdSecond(list, null)).toBe(list);
  });

  it('keeps a just-done task floated: the closing line plays at the top, where the tick happened', () => {
    const list = [t('a'), t('held', { done: true })];
    const out = holdSecond(list, 'held');
    expect(out.map((x: { id: string }) => x.id)).toEqual(['held', 'a']);
  });

  it('a task that is both pinned and held keeps the pin seat, once', () => {
    const both = [t('x', { pinnedAt: 5 }), t('a')];
    expect(holdSecond(both, 'x')).toBe(both);
  });
});

describe('tuckFinished', () => {
  const day = new Date(2026, 8, 26, 10);
  const doneAt = new Date(2026, 8, 26, 9).getTime();
  const open = { id: 'a', title: 'open', done: false };
  const doneOne = { id: 'b', title: 'done one-off', done: true, completedAt: doneAt };
  const doneRepeat = { id: 'c', title: 'repeat ticked today', done: false, recurrence: { kind: 'daily' as const, start: '2026-09-01' }, completedDates: ['2026-09-26'] };
  const openRepeat = { id: 'd', title: 'repeat not yet', done: false, recurrence: { kind: 'daily' as const, start: '2026-09-01' }, completedDates: ['2026-09-25'] };

  it('keeps open rows in order and tucks the finished ones, one-offs and repeats alike', () => {
    const { open: shown, tucked } = tuckFinished([open, doneOne, openRepeat, doneRepeat], day, [], null);
    expect(shown.map((t) => t.id)).toEqual(['a', 'd']);
    expect(tucked.map((t) => t.id)).toEqual(['b', 'c']);
  });

  it('leaves a just-ticked row in place for its beat, and the held task for its closing line', () => {
    expect(tuckFinished([open, doneOne], day, ['b'], null).open.map((t) => t.id)).toEqual(['a', 'b']);
    expect(tuckFinished([open, doneOne], day, [], 'b').tucked).toEqual([]);
  });

  it('tucks nothing on a day where nothing is finished', () => {
    const rows = [open, openRepeat];
    const { open: shown, tucked } = tuckFinished(rows, day, [], null);
    expect(shown).toEqual(rows);
    expect(tucked).toEqual([]);
  });
});
