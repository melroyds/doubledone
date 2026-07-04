// Pure calendar logic for the Lookback: a true Gregorian month grid and the
// "what did I finish each day" aggregation. No React, no storage, fully tested.
// Leap years and month lengths come from the platform Date, so they are correct
// by construction. Week starts on Sunday, matching the capture weekday chips.

import { toISODate } from './day';
import { fmt } from './i18n-active';
import { isBigWin } from './reward';
import { isRecurring, type Scheduled } from './today';

// Weekday column headers, localised ("Sun".."Sat" in English). Evaluated when this module
// first loads, which is after lib/locale has bound the device locale (the root layout
// imports lib/locale before any screen), so the labels come out in the user's language.
// 2024-01-07 is a known Sunday, so index 0..6 maps Su..Sa like the grid.
export const WEEKDAY_LABELS = Array.from({ length: 7 }, (_, i) => fmt.weekday(new Date(2024, 0, 7 + i)));

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

/** Header label, e.g. "June 2026", month name per the device locale. */
export function monthLabel(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
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

export type ScheduledItem = { id: string; title: string };

/**
 * Map of ISO date -> one-off tasks scheduled for that FUTURE day (a deferred or
 * "Date…" task). Only future-dated, not-done, not-tombstoned one-offs; recurring
 * tasks live in the Repeating drawer, so they are not marked on the calendar here.
 * Mirrors the "Later" list, but grouped by due date for the month grid.
 */
export function scheduledByDay<T extends Completable>(tasks: T[], today: Date): Map<string, ScheduledItem[]> {
  const todayIso = toISODate(today);
  const byDay = new Map<string, ScheduledItem[]>();
  for (const t of tasks) {
    if (t.deletedAt || isRecurring(t) || t.done) continue;
    if (t.due != null && t.due > todayIso) {
      const list = byDay.get(t.due);
      if (list) list.push({ id: t.id, title: t.title });
      else byDay.set(t.due, [{ id: t.id, title: t.title }]);
    }
  }
  return byDay;
}
