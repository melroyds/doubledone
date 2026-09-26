import { describe, expect, it } from 'vitest';

import { type Recurrence } from './recurrence';
import { groupRepeating, REPEAT_GROUPS } from './repeating';
import { type Task } from './tasks';

function task(id: string, recurrence?: Recurrence, over: Partial<Task> = {}): Task {
  return { id, title: id, done: false, createdAt: 1, updatedAt: 1, ...(recurrence ? { recurrence } : {}), ...over };
}

const daily: Recurrence = { kind: 'daily' };
const weekly: Recurrence = { kind: 'weekly', weekdays: [4] };
const every3: Recurrence = { kind: 'interval', days: 3, anchor: '2026-09-01' };
const monthly: Recurrence = { kind: 'monthly', day: 15 };

describe('groupRepeating', () => {
  it('groups by the kind of rhythm, most frequent first, keeping list order inside a group', () => {
    const groups = groupRepeating([
      task('bins', weekly),
      task('cat', daily),
      task('plants', every3),
      task('rent', monthly),
      task('kitchen', daily),
      task('mum', weekly),
    ]);
    expect(groups.map((g) => g.kind)).toEqual(['daily', 'weekly', 'interval', 'monthly']);
    expect(groups.map((g) => g.items.map((x) => x.id))).toEqual([['cat', 'kitchen'], ['bins', 'mum'], ['plants'], ['rent']]);
    expect(groups.map((g) => g.labelKey)).toEqual(['repeat.groupDaily', 'repeat.groupWeekly', 'repeat.groupInterval', 'repeat.groupMonthly']);
  });

  it('draws no group that has nothing in it', () => {
    const groups = groupRepeating([task('bins', weekly)]);
    expect(groups).toHaveLength(1);
    expect(groups[0].kind).toBe('weekly');
  });

  it('leaves out one-offs, explicit non-repeats and removed series', () => {
    const groups = groupRepeating([
      task('milk'),
      task('plain', { kind: 'none' }),
      task('gone', daily, { deletedAt: 5 }),
      task('kept', daily, { deletedAt: null }),
    ]);
    expect(groups.flatMap((g) => g.items.map((x) => x.id))).toEqual(['kept']);
  });

  it('is empty when nothing repeats, which is what shows the room empty state', () => {
    expect(groupRepeating([])).toEqual([]);
    expect(groupRepeating([task('milk')])).toEqual([]);
  });

  it('has a heading for every kind a repeat can be', () => {
    const kinds: Recurrence['kind'][] = ['daily', 'weekly', 'interval', 'monthly'];
    expect(REPEAT_GROUPS.map((g) => g.kind)).toEqual(kinds);
  });
});
