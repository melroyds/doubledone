import { describe, expect, it } from 'vitest';

import { buildOutcome } from './outcome';
import { type Task } from './tasks';

const base: Task = {
  id: 's1',
  title: 'Clear one shelf',
  done: true,
  createdAt: new Date(2026, 5, 17).getTime(),
  updatedAt: 0,
};

describe('buildOutcome', () => {
  it('returns null for a task that did not come from a breakdown', () => {
    expect(buildOutcome(base, Date.now())).toBeNull();
  });

  it('builds an anonymised payload: id, step total, whole days from offer, no title or identity', () => {
    const task: Task = { ...base, decompositionId: 'd-abc', decompositionSteps: 4 };
    const now = new Date(2026, 5, 20).getTime(); // 3 days after createdAt
    const out = buildOutcome(task, now);
    expect(out).toEqual({ id: 'd-abc', steps_total: 4, days_elapsed: 3 });
    expect(JSON.stringify(out)).not.toContain('Clear one shelf'); // never the task text
  });

  it('clamps a same-day completion to zero and tolerates a missing step total', () => {
    const task: Task = { ...base, decompositionId: 'd-x' };
    expect(buildOutcome(task, base.createdAt)).toEqual({ id: 'd-x', steps_total: null, days_elapsed: 0 });
  });
});
