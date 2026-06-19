import { addDaysISO, daysBetween, friendlyDate, fromISODate, toISODate } from './day';

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
  | { kind: 'interval'; days: number; anchor: string }; // every `days` days from `anchor` (ISO date); anchor is the start

export type Schedulable = {
  due?: string | null; // 'YYYY-MM-DD' for a one-off; null/undefined = someday
  recurrence?: Recurrence;
};

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

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
    case 'none':
      return task.due != null && task.due === toISODate(date);
  }
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
  const start = r.kind === 'daily' || r.kind === 'weekly' ? r.start : r.kind === 'interval' ? r.anchor : undefined;
  if (today && start && start > toISODate(today)) {
    return `${base} · from ${friendlyDate(start, today)}`;
  }
  return base;
}

function cadenceLabel(r: Recurrence): string {
  switch (r.kind) {
    case 'none':
      return 'One-off';
    case 'daily':
      return 'Every day';
    case 'interval':
      return r.days === 1 ? 'Every day' : `Every ${r.days} days`;
    case 'weekly':
      if (r.weekdays.length === 7) return 'Every day';
      if (r.weekdays.length === 0) return 'Weekly';
      return r.weekdays
        .slice()
        .sort((a, b) => a - b)
        .map((d) => WEEKDAY_LABELS[d])
        .join(', ');
  }
}

// What the capture UI offers: a deliberately tiny set, not a full date picker.
export type CaptureSchedule =
  | { mode: 'today' }
  | { mode: 'tomorrow' }
  | { mode: 'daily'; start?: string }
  | { mode: 'weekly'; weekdays: number[]; start?: string }
  | { mode: 'everyN'; days: number; start?: string };

/** Map a capture choice to a task's scheduling fields, relative to `today`. */
export function scheduleFields(
  s: CaptureSchedule,
  today: Date,
): { due?: string | null; recurrence?: Recurrence } {
  switch (s.mode) {
    case 'today':
      return {};
    case 'tomorrow':
      return { due: addDaysISO(today, 1) };
    case 'daily':
      return { recurrence: { kind: 'daily', start: s.start ?? toISODate(today) } };
    case 'weekly':
      return { recurrence: { kind: 'weekly', weekdays: s.weekdays, start: s.start ?? toISODate(today) } };
    case 'everyN':
      return { recurrence: { kind: 'interval', days: s.days, anchor: s.start ?? toISODate(today) } };
  }
}
