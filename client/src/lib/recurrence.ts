import { toISODate } from './day';

// A task is either one-off (no recurrence, optionally with a due date) or it
// repeats. Kept deliberately small: daily and weekly cover almost everything an
// ADHD daily tool needs, and every extra scheduling option is friction the spec
// warns against. Monthly / interval can join later if a real need shows up.
export type Recurrence =
  | { kind: 'none' }
  | { kind: 'daily' }
  | { kind: 'weekly'; weekdays: number[] }; // 0=Sun .. 6=Sat

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
      return true;
    case 'weekly':
      return r.weekdays.includes(date.getDay());
    case 'none':
      return task.due != null && task.due === toISODate(date);
  }
}

/** A short, calm human label for a recurrence. */
export function describeRecurrence(r: Recurrence): string {
  switch (r.kind) {
    case 'none':
      return 'One-off';
    case 'daily':
      return 'Every day';
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
