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
import { ordinalDay, t } from './i18n-active';

export type CaptureWhen = 'today' | 'tomorrow' | 'date' | 'anytime';
export type CaptureRepeat = 'daily' | 'weekly' | 'everyN' | 'monthly' | null;

export type DoorState = {
  when: CaptureWhen;
  /** The picked ISO date; only read when `when === 'date'`. */
  dueDate: string;
  repeat: CaptureRepeat;
  /** Selected weekdays (0=Sun..6=Sat); only read when `repeat === 'weekly'`. */
  weekdays: number[];
  /** The N in every-N-days; only read when `repeat === 'everyN'`. */
  everyNDays: number;
  /** The day of the month, 1-31; only read when `repeat === 'monthly'`. */
  monthDay?: number;
  /** The slice count; 0 = whole task. */
  steps: number;
  /**
   * This surface's RESTING answer to "when", which is 'today' everywhere except the shared list.
   *
   * It exists so the Add button can stay quiet. The button names the consequence only when the
   * consequence is not the default, so "Add" means "the ordinary thing" on both screens and
   * "Add · Tomorrow" always means you changed something. Hard-coding 'today' as the comparison
   * would have Ours reading "Add · Anytime" on every single ordinary capture, which is a label
   * shouting about the absence of a choice.
   *
   * REPLACED an earlier `whenless` flag, which hid the WHEN row entirely on the shared list. That
   * was right when a shared row could not hold a date at all. It stopped being right the moment
   * dated shared rows started surfacing on both Todays: the room now genuinely has days, so the
   * question is worth asking there, with the calm answer pre-selected.
   */
  whenDefault?: CaptureWhen;
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
  if (s.when === 'anytime') return t('capture.anytime');
  if (s.when === 'today') return t('common.today');
  if (s.when === 'tomorrow') return t('common.tomorrow');
  return friendlyDate(s.dueDate, today);
}

/** "Daily" / "Weekly on Mo, We" / "Every 3 days" / "Monthly on the 15th", or null when it does not repeat. */
export function repeatLabel(s: Pick<DoorState, 'repeat' | 'weekdays' | 'everyNDays' | 'monthDay'>): string | null {
  if (s.repeat === 'daily') return t('capture.modeDaily');
  // The shorter of the two monthly wordings on purpose. `repeat.monthlyOnDay` ("Every month on the
  // 15th") is the drawer's full sentence; a door line and a button label sit beside two or three
  // other pieces and have to stay tight.
  if (s.repeat === 'monthly') return t('capture.monthlyOn', { day: ordinalDay(s.monthDay ?? 1) });
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
  const rep = repeatLabel(s);
  const parts: string[] = [];
  // A repeat SUPERSEDES the when rather than joining it. On a dayless default, "Anytime · Daily"
  // is a contradiction read aloud: a thing with a rhythm is not a thing without a day, and the
  // rhythm is the more useful half. Elsewhere the when is a repeat's START, which is worth saying.
  if (!(rep && s.when === 'anytime')) parts.push(whenLabel(s, today));
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
  // Measured against THIS SURFACE'S default, not against 'today'. The button's job is to name what
  // is unusual about this capture, so on the shared list an ordinary undated add reads "Add", and
  // "Add · Today" there is the genuinely notable case: it will appear on both your days.
  const resting = s.whenDefault ?? 'today';
  const consequence = repeatLabel(s) ?? (s.when !== resting ? whenLabel(s, today) : null);
  return consequence ? `${base} · ${consequence}` : base;
}
