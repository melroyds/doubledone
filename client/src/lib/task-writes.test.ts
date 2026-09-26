import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type Recurrence } from './recurrence';
import { type Task } from './tasks';
import { clearNudgeIfAny, editSeriesIn, removeSeriesIn, restoreSeriesIn, toggleIn, updateStoredTasks, writeTasks } from './task-writes';

// The seams are native (AsyncStorage, notifications, the Android widget), so they are mocked and the
// tests assert what reaches them: which list is saved, which nudge is cancelled, what the widget is told.
const { cancelNudge, loadTasks, loadClosedDate, saveTasks, updateWidget } = vi.hoisted(() => ({
  cancelNudge: vi.fn(() => Promise.resolve()),
  loadTasks: vi.fn((): Promise<Task[]> => Promise.resolve([])),
  loadClosedDate: vi.fn((): Promise<string | null> => Promise.resolve(null)),
  saveTasks: vi.fn((_tasks: Task[]) => Promise.resolve()),
  updateWidget: vi.fn((_tasks: Task[], _closed: string | null) => Promise.resolve()),
}));
vi.mock('./reminders', () => ({ cancelNudge }));
vi.mock('./storage', () => ({ loadTasks, loadClosedDate, saveTasks }));
vi.mock('../widget/update', () => ({ updateWidget }));

const day = new Date(2026, 8, 26);
const iso = '2026-09-26';
const daily: Recurrence = { kind: 'daily' };

function task(over: Partial<Task> & { id: string }): Task {
  return { title: over.id, done: false, createdAt: 1, updatedAt: 1, ...over };
}

beforeEach(() => {
  vi.clearAllMocks();
  loadTasks.mockImplementation(() => Promise.resolve([]));
  loadClosedDate.mockImplementation(() => Promise.resolve(null));
});

describe('clearNudgeIfAny', () => {
  it('leaves a task with no nudge alone and cancels nothing', () => {
    const plain = task({ id: 'a' });
    expect(clearNudgeIfAny(plain)).toBe(plain);
    expect(cancelNudge).not.toHaveBeenCalled();
  });

  it('cancels the scheduled nudge and strips both of its fields', () => {
    const out = clearNudgeIfAny(task({ id: 'a', nudgeId: 'n1', nudgeAt: 5 }));
    expect(cancelNudge).toHaveBeenCalledWith('n1');
    expect(out).not.toHaveProperty('nudgeId');
    expect(out).not.toHaveProperty('nudgeAt');
  });
});

describe('writeTasks (Today commit)', () => {
  it('stamps against the previous list so a change never loses to a newer synced row', () => {
    const previous = [task({ id: 'a', updatedAt: 500 })];
    const next = [task({ id: 'a', title: 'renamed', updatedAt: 100 })];
    const out = writeTasks(next, previous, '2026-09-25');
    expect(out[0].updatedAt).toBe(501);
    expect(saveTasks).toHaveBeenCalledWith(out);
    expect(updateWidget).toHaveBeenCalledWith(out, '2026-09-25');
  });
});

describe('toggleIn', () => {
  it('ticks a repeat for that day only, and lets go of its nudge once done', () => {
    const out = toggleIn([task({ id: 'r', recurrence: daily, nudgeId: 'n1', nudgeAt: 5 }), task({ id: 'x' })], 'r', day);
    expect(out[0].completedDates).toEqual([iso]);
    expect(out[0].done).toBe(false);
    expect(out[0]).not.toHaveProperty('nudgeId');
    expect(cancelNudge).toHaveBeenCalledWith('n1');
    expect(out[1]).toEqual(task({ id: 'x' }));
  });

  it('unticking a repeat keeps any nudge it has', () => {
    const out = toggleIn([task({ id: 'r', recurrence: daily, completedDates: [iso], nudgeId: 'n1', nudgeAt: 5 })], 'r', day);
    expect(out[0].completedDates).toEqual([]);
    expect(out[0].nudgeId).toBe('n1');
    expect(cancelNudge).not.toHaveBeenCalled();
  });

  it('a one-off flips and records when it was finished, and clears that on untick', () => {
    const done = toggleIn([task({ id: 'o' })], 'o', day)[0];
    expect(done.done).toBe(true);
    expect(typeof done.completedAt).toBe('number');
    const undone = toggleIn([done], 'o', day)[0];
    expect(undone.done).toBe(false);
    expect(undone.completedAt).toBeNull();
  });
});

describe('the series handlers', () => {
  it('edit renames and re-cadences in place with a fresh stamp', () => {
    const weekly: Recurrence = { kind: 'weekly', weekdays: [4] };
    const out = editSeriesIn([task({ id: 'r', recurrence: daily }), task({ id: 'x' })], 'r', 'Bin night', weekly);
    expect(out[0]).toMatchObject({ title: 'Bin night', recurrence: weekly });
    expect(out[0].updatedAt).toBeGreaterThan(1);
    expect(out[1].updatedAt).toBe(1);
  });

  it('remove tombstones the series and cancels its nudge; restore clears the tombstone', () => {
    const removed = removeSeriesIn([task({ id: 'r', recurrence: daily, nudgeId: 'n1', nudgeAt: 5 })], 'r');
    expect(typeof removed[0].deletedAt).toBe('number');
    expect(removed[0]).not.toHaveProperty('nudgeId');
    expect(cancelNudge).toHaveBeenCalledWith('n1');
    const restored = restoreSeriesIn(removed, 'r');
    expect(restored[0].deletedAt).toBeNull();
    expect(restored[0].recurrence).toEqual(daily);
  });
});

describe('updateStoredTasks', () => {
  it('applies the change to what is STORED, not to what the screen was showing', async () => {
    // The screen's snapshot is stale: something wrote while it was open (a widget add).
    const onScreen = [task({ id: 'r', recurrence: daily })];
    const stored = [task({ id: 'r', recurrence: daily }), task({ id: 'widget-add' })];
    loadTasks.mockImplementation(() => Promise.resolve(stored));
    loadClosedDate.mockImplementation(() => Promise.resolve('2026-09-25'));
    const out = await updateStoredTasks((ts) => toggleIn(ts, 'r', day), onScreen);
    expect(out.map((x) => x.id)).toEqual(['r', 'widget-add']);
    expect(out[0].completedDates).toEqual([iso]);
    expect(saveTasks).toHaveBeenCalledWith(out);
    expect(updateWidget).toHaveBeenCalledWith(out, '2026-09-25');
  });

  it('never writes a change onto an empty read while the screen still shows tasks', async () => {
    // loadTasks answers a failed read with [], and writing onto that would wipe the list.
    const onScreen = [task({ id: 'r', recurrence: daily }), task({ id: 'x' })];
    const out = await updateStoredTasks((ts) => removeSeriesIn(ts, 'r'), onScreen);
    expect(out.map((x) => x.id)).toEqual(['r', 'x']);
    expect(typeof out[0].deletedAt).toBe('number');
  });

  it('an empty read with an empty screen stays empty', async () => {
    const out = await updateStoredTasks((ts) => ts, []);
    expect(out).toEqual([]);
  });

  it('runs one write at a time, so a second quick tap builds on the first', async () => {
    let disk: Task[] = [task({ id: 'r', recurrence: daily })];
    loadTasks.mockImplementation(() => Promise.resolve(disk));
    saveTasks.mockImplementation((next: Task[]) => {
      disk = next;
      return Promise.resolve();
    });
    const first = updateStoredTasks((ts) => toggleIn(ts, 'r', day), disk);
    const second = updateStoredTasks((ts) => toggleIn(ts, 'r', day), disk);
    await first;
    const out = await second;
    expect(out[0].completedDates).toEqual([]); // ticked, then unticked: never two reads of the same list
    expect(saveTasks).toHaveBeenCalledTimes(2);
  });

  it('a failed write does not jam the ones after it', async () => {
    loadTasks.mockImplementationOnce(() => Promise.reject(new Error('disk')));
    await expect(updateStoredTasks((ts) => ts, [])).rejects.toThrow('disk');
    loadTasks.mockImplementation(() => Promise.resolve([task({ id: 'a' })]));
    const out = await updateStoredTasks((ts) => ts, []);
    expect(out.map((x) => x.id)).toEqual(['a']);
  });
});
