// How a broken-down task's steps land on the calendar, from the user's pacing
// answers in the Break-it-down questions. Pure and tested; the screen calls this
// after the AI returns the ordered steps, so the date maths never lives in the
// model (cheaper, and deterministic).

import { addDaysISO, daysBetween, fromISODate, toISODate } from './day';

export type SpreadMode = 'gradual' | 'sameday';

/**
 * Assign a due date to each of `count` ordered steps. A returned `null` means
 * "Today" (undated, lands on Today like any task), an ISO string is a future day.
 *
 * - sameday: every step shares one day, the due date (or Today if there is no
 *   deadline, or the deadline is today/past).
 * - gradual: the steps walk forward in order. With a due date they spread evenly
 *   from Today (the first step) to the due date (the last step). With no deadline
 *   they take one day each from Today, so only the first sits on Today.
 */
export function spreadDueDates(
  count: number,
  today: Date,
  dueDate: string | null,
  mode: SpreadMode,
): (string | null)[] {
  if (count <= 0) return [];
  const todayIso = toISODate(today);
  // A deadline that is today or in the past collapses everything onto Today.
  const horizon = dueDate && dueDate > todayIso ? daysBetween(today, fromISODate(dueDate)) : 0;

  if (mode === 'sameday') {
    const day = horizon > 0 ? addDaysISO(today, horizon) : null;
    return Array.from({ length: count }, () => day);
  }

  // gradual
  if (horizon <= 0) {
    // No deadline (or due today): one step per day from Today, first step Today.
    return Array.from({ length: count }, (_unused, i) => (i === 0 ? null : addDaysISO(today, i)));
  }
  if (count === 1) return [null]; // a lone step just starts Today
  return Array.from({ length: count }, (_unused, i) => {
    const offset = Math.round((i * horizon) / (count - 1));
    return offset === 0 ? null : addDaysISO(today, offset);
  });
}
