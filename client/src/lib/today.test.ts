import { describe, expect, it } from 'vitest';

import { type Recurrence } from './recurrence';
import { completeAncestors, deferTo, deferToTomorrow, hasActiveTinyChild, isDoneOn, pinFirst, resurfaceOpenParent, setPin, tinyParentTitle, type Scheduled, tasksForToday, toggleDoneOn, upcomingTasks } from './today';

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
