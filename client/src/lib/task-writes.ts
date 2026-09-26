// How a personal task list gets written, in one place.
//
// Until the Repeating room, only Today changed the list of repeats, so Today's own `commit` and its
// handlers WERE the write path. A second screen that ticks, edits and removes the same tasks needs the
// same path, not a copy of it: two copies drift, and the drift here is data (a stamp that loses to a
// synced row and resurrects a delete, a nudge left armed on a finished task, a widget showing
// yesterday). So Today's commit and its series handlers live here, word for word, and both screens call
// them. Nothing in this file knows which screen it is on.

import { updateWidget } from '../widget/update';

import { type Recurrence } from './recurrence';
import { cancelNudge } from './reminders';
import { loadClosedDate, loadTasks, saveTasks } from './storage';
import { nowMs, type Task, withMonotonicStamps } from './tasks';
import { isDoneOn, isRecurring, toggleDoneOn } from './today';

/**
 * When a task leaves the active-today state (done, removed, deferred), cancel any pending nudge and
 * strip its fields, so nobody is poked about something already handled.
 */
export function clearNudgeIfAny(task: Task): Task {
  if (!task.nudgeId) return task;
  void cancelNudge(task.nudgeId);
  const next = { ...task };
  delete next.nudgeId;
  delete next.nudgeAt;
  return next;
}

/**
 * Today's commit, without the React state: stamp, save, and keep the home-screen widget in step.
 *
 * Monotonic updatedAt (see withMonotonicStamps) guarantees a task we changed beats the copy we synced,
 * even one written by the MCP Worker's clock or another device, so a delete or an edit can never lose
 * last-write-wins to a future-stamped remote row and silently resurrect on the next pull. Returns the
 * stamped list, which is what the caller must hold in state.
 */
export function writeTasks(next: Task[], previous: Task[], closedDate: string | null): Task[] {
  return stampAndSave(next, previous, closedDate).stamped;
}

// The one body both entry points share, so they cannot come apart. `saved` is there for the queued
// path below, which must not start the next read before this save has landed.
function stampAndSave(next: Task[], previous: Task[], closedDate: string | null): { stamped: Task[]; saved: Promise<void> } {
  const stamped = withMonotonicStamps(next, previous);
  const saved = saveTasks(stamped);
  void updateWidget(stamped, closedDate); // native only; a no-op on web
  return { stamped, saved };
}

/**
 * Tick or untick one task for `day`, the way Today's tick does to the list: a repeat ticks that day
 * only, a one-off flips and stamps when it was finished (the Calendar places it by that), and a task
 * that is now done lets go of its nudge. The rest of a tick (the shared mirror, the telemetry, and on
 * Today the celebrations) belongs to the caller, because it differs by screen.
 */
export function toggleIn(tasks: Task[], id: string, day: Date): Task[] {
  return tasks.map((task) => {
    if (task.id !== id) return task;
    const toggled = { ...toggleDoneOn(task, day), updatedAt: nowMs() };
    if (!isRecurring(toggled)) toggled.completedAt = toggled.done ? nowMs() : null;
    return isDoneOn(toggled, day) ? clearNudgeIfAny(toggled) : toggled;
  });
}

/** Rename or re-cadence a series in place. updatedAt bumps so the edit wins last-write-wins sync. */
export function editSeriesIn(tasks: Task[], id: string, title: string, recurrence: Recurrence): Task[] {
  const now = nowMs();
  return tasks.map((task) => (task.id === id ? { ...task, title, recurrence, updatedAt: now } : task));
}

/** Remove the whole series: the standard tombstone, hidden from every view and synced as a delete. */
export function removeSeriesIn(tasks: Task[], id: string): Task[] {
  const now = nowMs();
  return tasks.map((task) => (task.id === id ? clearNudgeIfAny({ ...task, deletedAt: now, updatedAt: now }) : task));
}

/** The undo: clear the tombstone and the series is back, cadence and history intact. */
export function restoreSeriesIn(tasks: Task[], id: string): Task[] {
  const now = nowMs();
  return tasks.map((task) => (task.id === id ? { ...task, deletedAt: null, updatedAt: now } : task));
}

// One write at a time. Two quick taps must not both read the same stored list and have the second
// save erase the first.
let queue: Promise<unknown> = Promise.resolve();

/**
 * A write from a screen that is NOT Today: re-read the stored list, apply the change to THAT, and write
 * it exactly as Today's commit does.
 *
 * Why re-read. Today stays mounted underneath every room and keeps writing: a warm resume sweeps
 * nudges and settles shared copies, and the widget can add a task while the app is away. A room that
 * wrote its own snapshot back would erase all of that, which is the bug today.tsx's resume handler
 * already paid for once. So the change is applied to what is stored now, not to what was on screen.
 *
 * `onScreen` is what the screen is showing. It is used only when the store reads back EMPTY while the
 * screen is not, because loadTasks answers a failed read with [] and writing a change onto [] would
 * wipe the list.
 */
export function updateStoredTasks(change: (tasks: Task[]) => Task[], onScreen: Task[]): Promise<Task[]> {
  const run = queue.then(async () => {
    const [stored, closedDate] = await Promise.all([loadTasks(), loadClosedDate()]);
    const base = stored.length === 0 && onScreen.length > 0 ? onScreen : stored;
    const { stamped, saved } = stampAndSave(change(base), base, closedDate);
    await saved;
    return stamped;
  });
  queue = run.catch(() => undefined);
  return run;
}
