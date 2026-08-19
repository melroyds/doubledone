import { addDaysISO, daysBetween, friendlyDate, fromISODate, toISODate } from './day';
import { fmt, ordinalDay, t } from './i18n-active';

// A task is either one-off (no recurrence, optionally with a due date) or it
// repeats: daily, on chosen weekdays, or every N days from a start date (e.g.
// the cat's water every 2 days). Kept deliberately small; monthly can join later.
// daily/weekly carry an optional `start` (ISO): before it the task is not yet
// tracked, so a habit can begin in the future. interval's `anchor` already is its
// start. `start` is optional, so tasks made before this feature are unchanged.
export type Recurrence =
  | { kind: 'none' }
  | { kind: 'daily'; start?: string }
  | { kind: 'weekly'; weekdays: number[]; start?: string } // 0=Sun .. 6=Sat
  | { kind: 'interval'; days: number; anchor: string } // every `days` days from `anchor` (ISO date); anchor is the start
  // Monthly, on a day of the month (1-31). A day the month does not have CLAMPS to that month's
  // last day rather than being skipped: "the 31st" in February is the 28th (29th in a leap year).
  // Skipping would be the crueller reading, because the months it silently drops are the ones a
  // rent or a bill reminder cannot afford to miss, and a task that just does not appear is exactly
  // the kind of quiet failure this audience stops trusting an app for.
  | { kind: 'monthly'; day: number; start?: string };

export type Schedulable = {
  due?: string | null; // 'YYYY-MM-DD' for a one-off; null/undefined = someday
  recurrence?: Recurrence;
};

// 2024-01-07 is a known Sunday: a weekday index 0..6 renders through the locale-aware
// formatter ("Sun".."Sat" in English) instead of a hardcoded English table.
const weekdayName = (dow: number): string => fmt.weekday(new Date(2024, 0, 7 + dow));

/** Is this task due on `date`? This is what decides what lands on Today. */
export function isDueOn(task: Schedulable, date: Date): boolean {
  const r = task.recurrence ?? { kind: 'none' };
  switch (r.kind) {
    case 'daily':
      return startedBy(r.start, date);
    case 'weekly':
      return r.weekdays.includes(date.getDay()) && startedBy(r.start, date);
    case 'interval': {
      const diff = daysBetween(fromISODate(r.anchor), date);
      return diff >= 0 && diff % r.days === 0;
    }
    case 'monthly':
      return date.getDate() === effectiveMonthDay(r.day, date) && startedBy(r.start, date);
    case 'none':
      return task.due != null && task.due === toISODate(date);
  }
}

/**
 * Which day of THIS month a monthly recurrence actually lands on.
 *
 * A month that is too short clamps to its last day: "the 31st" is the 28th in February, the 29th in
 * a leap year, the 30th in April. It never skips. Skipping is the crueller reading, because the
 * months it silently drops are precisely the ones a rent or a bill cannot afford to miss, and a task
 * that simply fails to appear is the kind of quiet failure this audience stops trusting an app for.
 *
 * Day 0 of the NEXT month is the last day of this one, which is the standard trick and avoids a
 * leap-year table.
 */
export function effectiveMonthDay(day: number, date: Date): number {
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  return Math.min(Math.max(day, 1), lastDay);
}

// A daily/weekly recurrence can start in the future; before its start the task is
// not yet tracked. No start = tracked from creation (the pre-feature behaviour).
function startedBy(start: string | undefined, date: Date): boolean {
  return start == null || daysBetween(fromISODate(start), date) >= 0;
}

/** A short, calm human label for a recurrence. */
export function describeRecurrence(r: Recurrence, today?: Date): string {
  const base = cadenceLabel(r);
  // Surface a future start so a not-yet-active habit is legible in the drawer.
  const start = r.kind === 'daily' || r.kind === 'weekly' || r.kind === 'monthly' ? r.start : r.kind === 'interval' ? r.anchor : undefined;
  if (today && start && start > toISODate(today)) {
    return t('repeat.fromDate', { base, date: friendlyDate(start, today) });
  }
  return base;
}

function cadenceLabel(r: Recurrence): string {
  switch (r.kind) {
    case 'none':
      return t('repeat.oneOff');
    case 'daily':
      return t('repeat.everyDay');
    case 'monthly':
      return t('repeat.monthlyOnDay', { day: ordinalDay(r.day) });
    case 'interval':
      return r.days === 1 ? t('repeat.everyDay') : t('repeat.everyNDays', { days: r.days });
    case 'weekly': {
      if (r.weekdays.length === 7) return t('repeat.everyDay');
      if (r.weekdays.length === 0) return t('capture.modeWeekly');
      // FRAMED, not bare. This returned just the weekday names ("Gio"), which read as a stray label
      // rather than a rhythm and was the odd one out beside its own siblings, "Every day" and
      // "Every 3 days". Melroy, looking at a shared row: "it just says Thursday. It doesn't specify
      // anything. Feels random." Worse where he found it, because a shared row's rhythm is the
      // answer to "why is this here and when does it come back".
      const days = r.weekdays
        .slice()
        .sort((a, b) => a - b)
        .map(weekdayName)
        .join(', ');
      return t('repeat.everyWeekday', { days });
    }
  }
}

// What the capture UI offers: a deliberately small set. `date` is a single
// one-off on a specific day (the month-grid picker); the recurring modes carry
// their own start.
export type CaptureSchedule =
  | { mode: 'today' }
  // No day at all. Only the shared list offers this, and there it is the DEFAULT: milk and
  // batteries live in the room and are read when you are going to the shop. It is distinct from
  // 'today' on that surface, where 'today' means "put this on both our Todays, now".
  | { mode: 'anytime' }
  | { mode: 'tomorrow' }
  | { mode: 'date'; date: string }
  | { mode: 'daily'; start?: string }
  | { mode: 'weekly'; weekdays: number[]; start?: string }
  | { mode: 'everyN'; days: number; start?: string }
  // `day` is a day of the month, 1-31. A month too short for it clamps to its last day rather
  // than skipping; see effectiveMonthDay.
  | { mode: 'monthly'; day: number; start?: string };

/** Map a capture choice to a task's scheduling fields, relative to `today`. */
export function scheduleFields(
  s: CaptureSchedule,
  today: Date,
): { due?: string | null; recurrence?: Recurrence } {
  switch (s.mode) {
    case 'today':
    case 'anytime':
      return {};
    case 'tomorrow':
      return { due: addDaysISO(today, 1) };
    case 'date':
      return { due: s.date };
    case 'daily':
      return { recurrence: { kind: 'daily', start: s.start ?? toISODate(today) } };
    case 'monthly':
      // Defaults to TODAY's day of the month, which is what somebody choosing "monthly" almost
      // always means, and saves a second decision at the moment of capture.
      return { recurrence: { kind: 'monthly', day: s.day, start: s.start ?? toISODate(today) } };
    case 'weekly':
      return { recurrence: { kind: 'weekly', weekdays: s.weekdays, start: s.start ?? toISODate(today) } };
    case 'everyN':
      return { recurrence: { kind: 'interval', days: s.days, anchor: s.start ?? toISODate(today) } };
  }
}
