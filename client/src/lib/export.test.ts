import { describe, expect, it } from 'vitest';

import { buildExport } from './export';

describe('buildExport', () => {
  const tasks = [
    { id: 'a', title: 'Buy milk', done: false, createdAt: 1, updatedAt: 1 },
    { id: 'b', title: 'Done thing', done: true, createdAt: 2, updatedAt: 2, completedAt: 3 },
    { id: 'c', title: 'Deleted', done: false, createdAt: 4, updatedAt: 4, deletedAt: 99 },
  ];

  it('exports live tasks as pretty JSON, dropping tombstones', () => {
    const parsed = JSON.parse(buildExport(tasks, 1_750_000_000_000));
    expect(parsed.app).toBe('DoubleDone');
    expect(parsed.schema).toBe(1);
    expect(typeof parsed.exportedAt).toBe('string');
    expect(parsed.taskCount).toBe(2);
    expect(parsed.tasks.map((t: { title: string }) => t.title)).toEqual(['Buy milk', 'Done thing']);
  });

  it('keeps completion data so the export is the whole record', () => {
    const parsed = JSON.parse(buildExport(tasks, 0));
    const done = parsed.tasks.find((t: { id: string }) => t.id === 'b');
    expect(done.done).toBe(true);
    expect(done.completedAt).toBe(3);
  });
});
