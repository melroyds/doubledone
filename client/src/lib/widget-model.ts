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

// The card's dp costs, split by whether the user's font scale moves them. This split is the whole
// fix (device-reported 2026-07-25, second time): the card is `wrap_content`, so an over-generous
// budget makes it grow PAST its slot, Android clips it at the slot edge, and the rounded bottom is
// sliced off. The "tombstone" and "vertical resize does nothing" were always the same bug.
//
// The first attempt used flat constants of 56 and 24. Those are arithmetically correct for
// TodayWidget's real styles: padding 16+16, a 16px header (~20dp), and 15px titles (~18dp) with a
// 6dp gap. What they silently assumed was **font scale 1.0**. Text grows with the device's font
// setting and padding does not, so at a large setting the real line cost is nearer 30dp and a
// budget of 6 renders into a slot that holds 4.
const PADDING_DP = 32; // 16 top + 16 bottom, fixed
const HEADER_TEXT_DP = 20; // the 16px "Today" row, scales
const FIRST_LINE_EXTRA_DP = 4; // the first title's marginTop is 10 rather than 6
const LINE_TEXT_DP = 18; // a 15px title, scales
const LINE_GAP_DP = 6; // the gap between titles, fixed

// Half a line of air, always left unspent. The estimate above cannot be exact: RemoteViews text
// metrics are not simply fontSize x 1.2, and there is no way to measure real text height from JS.
// This margin covers that error in the only direction that matters, because the two failure modes
// are wildly asymmetric: UNDER-filling leaves a slightly smaller card sitting in its slot, which is
// invisible and reads as deliberate, while OVER-filling mutilates the card and slices a word in
// half. Spend the doubt on under-filling, every time.
const SAFETY_DP = 14;

/** Hard ceiling on lines, whatever the height. Past this a widget is a list, not a glance. */
const MAX_LINES_CEILING = 6;

/**
 * How many task lines fit in a widget `heightDp` tall at the device's `fontScale`. This is what
 * makes the widget respond to a vertical resize: drag it taller and it shows MORE TASKS rather than
 * more emptiness (the card is `wrap_content`, so it never stretches to fill a slot it has nothing
 * to put in). Always at least one line, so the tiniest widget still says something.
 *
 * `fontScale` defaults to 1, the Android default. The handler passes the real value; if reading it
 * fails there, 1 is the honest fallback and SAFETY_DP still guards the result.
 */
export function widgetLineCapacity(heightDp: number, fontScale: number = 1): number {
  if (!Number.isFinite(heightDp) || heightDp <= 0) return MAX_WIDGET_LINES; // unknown height: the old default
  // A nonsense scale must never make the budget LARGER, so clamp at 1 from below.
  const scale = Number.isFinite(fontScale) && fontScale > 1 ? fontScale : 1;
  const chrome = PADDING_DP + HEADER_TEXT_DP * scale + FIRST_LINE_EXTRA_DP;
  const perLine = LINE_TEXT_DP * scale + LINE_GAP_DP;
  const fits = Math.floor((heightDp - chrome - SAFETY_DP) / perLine);
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
