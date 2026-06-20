import { describe, expect, it } from 'vitest';

import { summarizeAdded, summaryLine, triageToTasks } from './triage';

describe('triageToTasks', () => {
  const today = new Date(2026, 5, 20); // 20 Jun 2026
  const ids = () => {
    let n = 0;
    return () => `id-${n++}`;
  };

  it('keeps today on Today, defers later to tomorrow, flags decompose', () => {
    const lines = ['Quick call', 'Plan the trip', 'File taxes'];
    const items = [
      { text: 'Quick call', bucket: 'today' as const },
      { text: 'Plan the trip', bucket: 'decompose' as const },
      { text: 'File taxes', bucket: 'later' as const },
    ];
    const out = triageToTasks(lines, items, today, 1000, ids());

    expect(out[0].due).toBeUndefined();
    expect(out[0].suggestBreakdown).toBeUndefined();
    expect(out[1].suggestBreakdown).toBe(true);
    expect(out[1].due).toBeUndefined();
    expect(out[2].due).toBe('2026-06-21');
  });

  it('preserves input order and stamps incrementing createdAt', () => {
    const lines = ['a', 'b'];
    const out = triageToTasks(lines, [], today, 500, ids());
    expect(out.map((t) => t.title)).toEqual(['a', 'b']);
    expect(out[0].createdAt).toBe(500);
    expect(out[1].createdAt).toBe(501);
  });

  it('falls back to Today for a line the AI dropped', () => {
    const out = triageToTasks(['Orphan'], [], today, 1000, ids());
    expect(out[0].due).toBeUndefined();
    expect(out[0].suggestBreakdown).toBeUndefined();
  });
});

describe('summarizeAdded + summaryLine', () => {
  it('counts buckets from the built tasks', () => {
    expect(summarizeAdded([{ due: '2026-06-21' }, { suggestBreakdown: true }, {}, {}])).toEqual({
      today: 2,
      later: 1,
      decompose: 1,
    });
  });

  it('renders a calm line and omits empty buckets', () => {
    expect(summaryLine({ today: 3, later: 0, decompose: 0 })).toBe('Sorted: 3 for today.');
    expect(summaryLine({ today: 1, later: 2, decompose: 1 })).toBe(
      'Sorted: 1 for today, 2 for tomorrow, 1 to break down.',
    );
  });

  it('returns null when nothing was added', () => {
    expect(summaryLine({ today: 0, later: 0, decompose: 0 })).toBeNull();
  });
});
