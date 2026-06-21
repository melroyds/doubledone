import { describe, expect, it } from 'vitest';

import type { Task } from './tasks';
import { buildWidgetModel } from './widget-model';

const TODAY = new Date(2026, 5, 21); // 21 June 2026

function task(id: string, title: string, done = false): Task {
  return { id, title, done, createdAt: 1, updatedAt: 1, ...(done ? { completedAt: 1 } : {}) };
}

describe('buildWidgetModel', () => {
  it('lists unfinished tasks for today with the remaining count', () => {
    const m = buildWidgetModel([task('1', 'a'), task('2', 'b', true), task('3', 'c')], TODAY, null);
    expect(m.state).toBe('tasks');
    expect(m.remaining).toBe(2);
    expect(m.lines).toEqual(['a', 'c']);
  });

  it('caps the lines at four but keeps the true remaining count', () => {
    const tasks = ['a', 'b', 'c', 'd', 'e', 'f'].map((t, i) => task(String(i), t));
    const m = buildWidgetModel(tasks, TODAY, null);
    expect(m.lines).toHaveLength(4);
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
