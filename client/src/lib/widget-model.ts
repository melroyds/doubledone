// The Today widget's view-model: the same "what does today look like" the app shows,
// distilled to what fits a home-screen widget. Pure and shared, so the headless widget
// task and the app render identical data from one source of truth. No widget-library
// imports here, so it stays trivially testable.
import { toISODate } from './day';
import { t } from './i18n-active';
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

// Empirical dp costs of the card's parts, used to turn a widget's HEIGHT into a line budget.
// CHROME is the padding (16 top + 16 bottom) plus the header row; LINE is a task title plus its
// gap. Measured against the shipped 3x2 card (header + 3 lines came out around 125dp), so they are
// close but not exact: RemoteViews text metrics vary with the device's font scale, and there is no
// way to measure a widget's real text height from JS. Deliberately biased to UNDER-count (a line
// budgeted slightly large), because showing one task fewer is calm while overflowing the slot
// clips the card's rounded bottom, which is the bug we just spent a build fixing.
const CARD_CHROME_DP = 56;
const LINE_DP = 24;

/** Hard ceiling on lines, whatever the height. Past this a widget is a list, not a glance. */
const MAX_LINES_CEILING = 10;

/**
 * How many task lines fit in a widget `heightDp` tall. This is what makes the widget respond to a
 * vertical resize: drag it taller and it shows MORE TASKS rather than more emptiness (the card is
 * `wrap_content`, so it never stretches to fill a slot it has nothing to put in). Always at least
 * one line, so the tiniest widget still says something.
 */
export function widgetLineCapacity(heightDp: number): number {
  if (!Number.isFinite(heightDp) || heightDp <= 0) return MAX_WIDGET_LINES; // unknown height: the old default
  const fits = Math.floor((heightDp - CARD_CHROME_DP) / LINE_DP);
  return Math.max(1, Math.min(MAX_LINES_CEILING, fits));
}

/**
 * Build the widget view-model from the stored tasks, the current day, and the closed-day
 * date. Reuses the app's today-filter, so the widget shows exactly what Today shows:
 * unfinished tasks first, then a calm rested line when the day is clear or closed.
 *
 * `maxLines` is the height-derived budget (see widgetLineCapacity); it counts every RENDERED row,
 * so when there are more tasks than fit, one slot is spent on the "+n more" line rather than added
 * on top of a full card. Omitted, it falls back to the fixed MAX_WIDGET_LINES.
 */
export function buildWidgetModel(tasks: Task[], today: Date, closedISO: string | null, maxLines: number = MAX_WIDGET_LINES): WidgetModel {
  const todays = tasksForToday(tasks, today);
  const undone = todays.filter((t) => !isDoneOn(t, today));
  const remaining = undone.length;

  if (closedISO === toISODate(today)) {
    return { remaining, lines: [], state: 'closed', message: t('widget.closedForToday') };
  }
  if (todays.length === 0) {
    return { remaining: 0, lines: [], state: 'empty', message: t('widget.nothingForToday') };
  }
  if (remaining === 0) {
    return { remaining: 0, lines: [], state: 'done', message: t('widget.allDoneForToday') };
  }
  // When there are more tasks than fit, one row of the budget is spent on the "+n more" line, so
  // the card still ends at `budget` rows rather than budget+1 (which would overflow the very slot
  // the budget was derived from). A one-row budget keeps its task and accepts the extra row.
  const budget = Math.max(1, Math.floor(maxLines));
  const shown = remaining > budget && budget > 1 ? budget - 1 : budget;
  return {
    remaining,
    lines: undone.slice(0, shown).map((t) => t.title),
    state: 'tasks',
    message: '',
  };
}
