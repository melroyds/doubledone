// The capture door's language: the pure logic behind "Reflex first, one door" (Claude Design
// capture handoff, chosen by Melroy 2026-07-26). The expanded capture panel now fronts ONE
// bordered door whose value line names everything currently set ("Today · Weekly on Mondays ·
// 3 steps"), and the Add button repeats the consequential part before the tap ("Add · Weekly on
// Mondays", "Add 3 · Tomorrow"), so nothing surprising ever lands.
//
// WHEN and REPEATS compose on one rule, resolved from a design ambiguity (decision log,
// 2026-07-26): the WHEN answer IS a repeat's start date. "Today · Weekly" starts today,
// "Tomorrow · Daily" starts tomorrow, and the composer's "Starting from" line is the same value
// read through, never a second source of truth that could disagree.

import { friendlyDate } from './day';
import { t } from './i18n-active';

export type CaptureWhen = 'today' | 'tomorrow' | 'date';
export type CaptureRepeat = 'daily' | 'weekly' | 'everyN' | null;

export type DoorState = {
  when: CaptureWhen;
  /** The picked ISO date; only read when `when === 'date'`. */
  dueDate: string;
  repeat: CaptureRepeat;
  /** Selected weekdays (0=Sun..6=Sat); only read when `repeat === 'weekly'`. */
  weekdays: number[];
  /** The N in every-N-days; only read when `repeat === 'everyN'`. */
  everyNDays: number;
  /** The slice count; 0 = whole task. */
  steps: number;
};

const WEEKDAY_KEYS = [
  'capture.weekdayShortSun',
  'capture.weekdayShortMon',
  'capture.weekdayShortTue',
  'capture.weekdayShortWed',
  'capture.weekdayShortThu',
  'capture.weekdayShortFri',
  'capture.weekdayShortSat',
] as const;

/** "Today" / "Tomorrow" / the picked day, in the app's friendly-date voice. */
export function whenLabel(s: Pick<DoorState, 'when' | 'dueDate'>, today: Date): string {
  if (s.when === 'today') return t('common.today');
  if (s.when === 'tomorrow') return t('common.tomorrow');
  return friendlyDate(s.dueDate, today);
}

/** "Daily" / "Weekly on Mo, We" / "Every 3 days", or null when the task does not repeat. */
export function repeatLabel(s: Pick<DoorState, 'repeat' | 'weekdays' | 'everyNDays'>): string | null {
  if (s.repeat === 'daily') return t('capture.modeDaily');
  if (s.repeat === 'weekly') {
    const days = [...s.weekdays].sort((a, b) => a - b).map((d) => t(WEEKDAY_KEYS[d] ?? 'capture.weekdayShortSun'));
    return t('capture.weeklyOn', { days: days.join(', ') });
  }
  if (s.repeat === 'everyN') return t('capture.everyNDays', { count: s.everyNDays });
  return null;
}

/**
 * The door's value line: everything currently set, in plain words joined by middle dots.
 * "Today" is the calm default; anything beyond it earns its place. Wraps, never truncates
 * (the caller renders it without numberOfLines).
 */
export function doorSummary(s: DoorState, today: Date): string {
  const parts = [whenLabel(s, today)];
  const rep = repeatLabel(s);
  if (rep) parts.push(rep);
  if (s.steps > 0) parts.push(t('today.stepsCount', { count: s.steps }));
  return parts.join(' · ');
}

/**
 * Add's label repeats the consequential part before the tap, so the button says what will
 * actually happen: "Add" / "Add · Tomorrow" / "Add · Weekly on Mo" / "Add 3 · Sat 2 Aug".
 * A multi-line dump carries its line count ("Add 3"), and the door's settings apply to every
 * line, which is exactly why the count and the consequence share the label.
 */
export function addButtonLabel(s: DoorState, today: Date, lineCount: number): string {
  const base = lineCount >= 2 ? t('capture.addN', { count: lineCount }) : t('capture.add');
  const consequence = repeatLabel(s) ?? (s.when !== 'today' ? whenLabel(s, today) : null);
  return consequence ? `${base} · ${consequence}` : base;
}
