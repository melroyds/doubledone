// Pure calendar logic for the Lookback: a true Gregorian month grid and the
// "what did I finish each day" aggregation. No React, no storage, fully tested.
// Leap years and month lengths come from the platform Date, so they are correct
// by construction. Week starts on Sunday, matching the capture weekday chips.

import { toISODate } from './day';
import { isBigWin } from './reward';
import { isRecurring, type Scheduled } from './today';

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
export const WEEKDAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export type YearMonth = { year: number; month: number }; // month is 0-11

/**
 * A month as weeks of seven cells. Each cell is an ISO date in that month, or
 * null for the leading/trailing padding that aligns the first day to its weekday.
 */
export function monthMatrix(year: number, month: number): (string | null)[][] {
  const lead = new Date(year, month, 1).getDay(); // 0=Sun .. 6=Sat
  const daysInMonth = new Date(year, month + 1, 0).getDate(); // day 0 of next month
  const cells: (string | null)[] = [];
  for (let i = 0; i < lead; i += 1) cells.push(null);
  for (let d = 1; d <= daysInMonth; d += 1) cells.push(toISODate(new Date(year, month, d)));
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** Header label, e.g. "June 2026". */
export function monthLabel(year: number, month: number): string {
  return `${MONTH_NAMES[month]} ${year}`;
}

/** Step months with year rollover, e.g. addMonths(2026, 11, 1) -> { 2027, 0 }. */
export function addMonths(year: number, month: number, delta: number): YearMonth {
  const base = new Date(year, month + delta, 1);
  return { year: base.getFullYear(), month: base.getMonth() };
}

export type Completion = { id: string; title: string; recurring: boolean; big: boolean };

type Completable = Scheduled & {
  id: string;
  title: string;
  createdAt: number;
  completedAt?: number | null;
  complexity?: number | null;
  updatedAt?: number;
};

/**
 * Map of ISO date -> what was completed that day. A recurring task contributes
 * one entry per date in its completedDates. A one-off contributes on the day it
 * was finished (completedAt, falling back to updatedAt for older or unsynced
 * tasks). Tombstoned tasks are excluded. Never throws on partial data.
 */
export function completionsByDay<T extends Completable>(tasks: T[]): Map<string, Completion[]> {
  const byDay = new Map<string, Completion[]>();
  const add = (iso: string, c: Completion) => {
    const list = byDay.get(iso);
    if (list) list.push(c);
    else byDay.set(iso, [c]);
  };
  for (const t of tasks) {
    if (t.deletedAt) continue;
    const big = isBigWin(t);
    if (isRecurring(t)) {
      for (const iso of t.completedDates ?? []) add(iso, { id: t.id, title: t.title, recurring: true, big });
    } else if (t.done) {
      const when = t.completedAt ?? t.updatedAt;
      if (when != null) add(toISODate(new Date(when)), { id: t.id, title: t.title, recurring: false, big });
    }
  }
  return byDay;
}
