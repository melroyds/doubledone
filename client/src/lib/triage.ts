// Apply an AI triage to a brain-dump: map each line to a Task (today stays put,
// later gets tomorrow's date, decompose is flagged to break down) and summarise
// what happened so "Sort for me" can show its work. Pure + unit-tested; the screen
// does the fetch and the commit.

import { type TriagedItem } from './ai';
import { addDaysISO } from './day';
import { type Task } from './tasks';

export type TriageSummary = { today: number; later: number; decompose: number };

/**
 * Build the tasks to add from a triaged brain-dump. Order follows the user's input
 * (triage sorts into buckets, it never reorders). A line the AI dropped falls back
 * to Today, never lost.
 */
export function triageToTasks(
  lines: string[],
  items: TriagedItem[],
  today: Date,
  now: number,
  makeId: () => string,
): Task[] {
  const bucketOf = new Map(items.map((it) => [it.text, it.bucket]));
  return lines.map((title, i) => {
    const base: Task = { id: makeId(), title, done: false, createdAt: now + i, updatedAt: now + i };
    const bucket = bucketOf.get(title);
    if (bucket === 'later') return { ...base, due: addDaysISO(today, 1) };
    if (bucket === 'decompose') return { ...base, suggestBreakdown: true };
    return base;
  });
}

/** Count what actually landed where, from the built tasks (always sums to the input). */
export function summarizeAdded(tasks: Pick<Task, 'due' | 'suggestBreakdown'>[]): TriageSummary {
  let today = 0;
  let later = 0;
  let decompose = 0;
  for (const t of tasks) {
    if (t.due) later += 1;
    else if (t.suggestBreakdown) decompose += 1;
    else today += 1;
  }
  return { today, later, decompose };
}

/** A calm one-line summary of what Sort did, or null if nothing was added. */
export function summaryLine(s: TriageSummary): string | null {
  const parts: string[] = [];
  if (s.today > 0) parts.push(`${s.today} for today`);
  if (s.later > 0) parts.push(`${s.later} for tomorrow`);
  if (s.decompose > 0) parts.push(`${s.decompose} to break down`);
  if (parts.length === 0) return null;
  return `Sorted: ${parts.join(', ')}.`;
}
