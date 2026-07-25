import { describe, expect, it } from 'vitest';

import type { Task } from './tasks';
import { buildWidgetModel, MAX_WIDGET_LINES, widgetLineCapacity } from './widget-model';

const TODAY = new Date(2026, 5, 21); // 21 June 2026

// A done task carries a completedAt of TODAY: the today-filter keeps a finished task only on
// its completion day, so the widget's "done" state needs a same-day completion to count.
function task(id: string, title: string, done = false): Task {
  return { id, title, done, createdAt: 1, updatedAt: 1, ...(done ? { completedAt: TODAY.getTime() } : {}) };
}

describe('buildWidgetModel', () => {
  it('lists unfinished tasks for today with the remaining count', () => {
    const m = buildWidgetModel([task('1', 'a'), task('2', 'b', true), task('3', 'c')], TODAY, null);
    expect(m.state).toBe('tasks');
    expect(m.remaining).toBe(2);
    expect(m.lines).toEqual(['a', 'c']);
  });

  // CHANGED 2026-07-25: this used to assert four titles. The budget now counts every RENDERED row,
  // so when tasks overflow it, the last row goes to "+n more" instead of being added on top of a
  // full card (which pushed the card past the slot it was sized for and clipped its rounded
  // bottom). Three titles plus the more-line is the same four rows. `remaining` is untouched: the
  // widget always tells the truth about how much is left, it just shows fewer titles.
  it('spends the last budgeted row on "+n more", and never misreports what is left', () => {
    const tasks = ['a', 'b', 'c', 'd', 'e', 'f'].map((t, i) => task(String(i), t));
    const m = buildWidgetModel(tasks, TODAY, null);
    expect(m.lines).toHaveLength(3);
    expect(m.remaining).toBe(6);
  });

  it('is "done" when today had tasks but none are left', () => {
    const m = buildWidgetModel([task('1', 'a', true)], TODAY, null);
    expect(m.state).toBe('done');
    expect(m.lines).toEqual([]);
  });

  it('is "empty" when nothing is set for today', () => {
    expect(buildWidgetModel([], TODAY, null).state).toBe('empty');
  });

  it('is "closed" when the day was closed today, never shaming what is left', () => {
    const m = buildWidgetModel([task('1', 'a')], TODAY, '2026-06-21');
    expect(m.state).toBe('closed');
  });
});

// A vertical resize must change WHAT THE WIDGET SAYS, not just its frame: the card is
// `wrap_content` so it never stretches, and without a height-derived budget a taller widget would
// simply show the same four tasks with dead space under them (reported on device 2026-07-25).
describe('widgetLineCapacity', () => {
  it('grows with height, so a taller widget shows more of today', () => {
    const short = widgetLineCapacity(110);
    const tall = widgetLineCapacity(300);
    expect(tall).toBeGreaterThan(short);
  });

  it('always offers at least one line, however cramped the slot', () => {
    expect(widgetLineCapacity(1)).toBe(1);
    expect(widgetLineCapacity(40)).toBe(1);
  });

  it('caps out, because past a point a widget is a list and not a glance', () => {
    expect(widgetLineCapacity(5000)).toBe(10);
  });

  it('falls back to the fixed default when the height is unknown or nonsense', () => {
    expect(widgetLineCapacity(0)).toBe(MAX_WIDGET_LINES);
    expect(widgetLineCapacity(-50)).toBe(MAX_WIDGET_LINES);
    expect(widgetLineCapacity(Number.NaN)).toBe(MAX_WIDGET_LINES);
  });
});

describe('buildWidgetModel line budget', () => {
  const many = Array.from({ length: 12 }, (_, i) => task(String(i), `t${i}`));

  it('spends one row of the budget on "+n more", so the card never overflows its slot', () => {
    const m = buildWidgetModel(many, TODAY, null, 4);
    expect(m.lines).toHaveLength(3); // 3 titles + the "+n more" row = the 4 rows we budgeted for
    expect(m.remaining).toBe(12);
    expect(m.remaining - m.lines.length).toBe(9); // what the "+9 more" line reports
  });

  it('uses the whole budget when everything fits, with no more-line to pay for', () => {
    const four = many.slice(0, 4);
    expect(buildWidgetModel(four, TODAY, null, 4).lines).toHaveLength(4);
  });

  it('shows more tasks at a taller budget', () => {
    expect(buildWidgetModel(many, TODAY, null, 8).lines).toHaveLength(7);
  });

  it('keeps its one task at a one-row budget rather than showing none', () => {
    expect(buildWidgetModel(many, TODAY, null, 1).lines).toHaveLength(1);
  });

  it('defaults to the old fixed budget when none is passed (the pre-2026-07-25 behaviour)', () => {
    expect(buildWidgetModel(many, TODAY, null).lines).toHaveLength(MAX_WIDGET_LINES - 1);
  });
});
