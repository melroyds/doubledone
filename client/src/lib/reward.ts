// How much of an accomplishment finishing a task was, from cheap signals only:
// how long it lingered (the dread proxy) and its complexity if known (a
// Bite-the-Elephant decomposition's minutes). No AI call, no points, no streaks.
// This weights the WARMTH of the calendar's acknowledgment, never a score the
// user sees. Thresholds are deliberately simple and tunable.

import { daysBetween } from './day';

export const BIG_WIN_AGE_DAYS = 7; // a task that sat a week or more before you closed it
export const BIG_WIN_COMPLEXITY = 25; // a genuinely chunky step (~25+ estimated minutes)

type Weighable = { createdAt: number; completedAt?: number | null; complexity?: number | null; big?: boolean };

/** Whole days a one-off lingered between created and finished (0 if not yet finished). */
export function ageInDays(t: Weighable): number {
  if (t.completedAt == null) return 0;
  return Math.max(0, daysBetween(new Date(t.createdAt), new Date(t.completedAt)));
}

/**
 * A "big win": a task the user marked big, a long-dreaded task finally closed, or a
 * genuinely chunky one. Drives a bigger calendar dot and a warmer line, nothing punitive.
 */
export function isBigWin(t: Weighable): boolean {
  return Boolean(t.big) || ageInDays(t) >= BIG_WIN_AGE_DAYS || (t.complexity ?? 0) >= BIG_WIN_COMPLEXITY;
}
