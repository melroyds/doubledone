// The Today widget's view-model: the same "what does today look like" the app shows,
// distilled to what fits a home-screen widget. Pure and shared, so the headless widget
// task and the app render identical data from one source of truth. No widget-library
// imports here, so it stays trivially testable.
import { toISODate } from './day';
import type { Task } from './tasks';
import { isDoneOn, tasksForToday } from './today';

export type WidgetState = 'tasks' | 'done' | 'empty' | 'closed';

export type WidgetModel = {
  remaining: number; // count of unfinished tasks due today
  lines: string[]; // up to MAX_LINES unfinished titles, the glanceable set
  state: WidgetState;
  message: string; // the calm line for the done / empty / closed states
};

export const MAX_WIDGET_LINES = 4;

/**
 * Build the widget view-model from the stored tasks, the current day, and the closed-day
 * date. Reuses the app's today-filter, so the widget shows exactly what Today shows:
 * unfinished tasks first, then a calm rested line when the day is clear or closed.
 */
export function buildWidgetModel(tasks: Task[], today: Date, closedISO: string | null): WidgetModel {
  const todays = tasksForToday(tasks, today);
  const undone = todays.filter((t) => !isDoneOn(t, today));
  const remaining = undone.length;

  if (closedISO === toISODate(today)) {
    return { remaining, lines: [], state: 'closed', message: 'Closed for today.' };
  }
  if (todays.length === 0) {
    return { remaining: 0, lines: [], state: 'empty', message: 'Nothing for today yet.' };
  }
  if (remaining === 0) {
    return { remaining: 0, lines: [], state: 'done', message: 'All done for today.' };
  }
  return {
    remaining,
    lines: undone.slice(0, MAX_WIDGET_LINES).map((t) => t.title),
    state: 'tasks',
    message: '',
  };
}
