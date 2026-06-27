// Pure progress arithmetic for sliced tasks (a thing done in N parts: 10 TV
// episodes, a 3-step chore). The screen calls applySliceDelta on a tap and then
// stamps updatedAt / completedAt from the done transition, exactly as toggle()
// does. Kept pure and side-effect free so the render linter is happy and the
// logic is unit-testable without React. The moat note: how people slice and pace
// multi-part work is logged at the call site (telemetry 'slices.defined' /
// 'slices.progressed'), never here.

import { type Slices } from './tasks';

// Sensible bounds for a user-defined slice count. One slice is not a slice; 50 is
// already a lot of taps for one task (a long series). Tunable, not load-bearing.
export const MIN_SLICES = 2;
export const MAX_SLICES = 50;

/** Whether a task is sliced (tracked across parts) rather than whole. */
export function hasSlices(t: { slices?: Slices | null }): boolean {
  return t.slices != null && t.slices.total >= 1;
}

/** 0..1 progress, guarded against a zero or malformed total. */
export function sliceFraction(s: Slices): number {
  if (s.total <= 0) return 0;
  return Math.min(1, Math.max(0, s.done / s.total));
}

/** Whether every slice is done (the sliced task's completion test). */
export function sliceComplete(s: Slices): boolean {
  return s.total > 0 && s.done >= s.total;
}

/**
 * Move a sliced task by `delta` slices (clamped to 0..total) and reconcile its
 * `done` flag: a sliced task is finished exactly when every slice is done, so the
 * boolean stays in lock-step with the count and the rest of the app (calendar,
 * close-the-day, reward) needs no special-casing. A no-op (already at a bound)
 * returns the SAME reference so callers can skip a needless updatedAt bump. Pure:
 * the caller stamps updatedAt / completedAt from the done transition.
 */
export function applySliceDelta<T extends { slices?: Slices | null; done: boolean }>(
  task: T,
  delta: number,
): T {
  const s = task.slices;
  if (s == null) return task;
  const done = Math.min(s.total, Math.max(0, s.done + delta));
  if (done === s.done) return task;
  return { ...task, slices: { total: s.total, done }, done: sliceComplete({ total: s.total, done }) };
}

/**
 * Set (or change) a task's slice count, clamped to [MIN_SLICES, MAX_SLICES]. Progress carries over, clamped
 * to the new total (shrinking below what is already done snaps `done` down to it), and the boolean done flag
 * is reconciled so the calendar / close-the-day / reward need no special-casing. This is the discretionary
 * "split this into N parts" the user drives: any whole task can become sliced, and a sliced task can be
 * re-sized at will. Pure: the caller stamps updatedAt.
 */
export function setSliceTotal<T extends { slices?: Slices | null; done: boolean }>(task: T, total: number): T {
  const t = Math.min(MAX_SLICES, Math.max(MIN_SLICES, Math.round(total)));
  const prevDone = task.slices?.done ?? 0;
  const done = Math.min(t, Math.max(0, prevDone));
  return { ...task, slices: { total: t, done }, done: sliceComplete({ total: t, done }) };
}

/** Turn a sliced task back into a whole one (drops the parts). The done flag is left as-is. Pure. */
export function clearSlices<T extends { slices?: Slices | null }>(task: T): T {
  if (task.slices == null) return task;
  return { ...task, slices: null };
}
