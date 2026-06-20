import { describe, expect, it } from 'vitest';

import {
  findScrapbook,
  MAX_SCRAPBOOKS,
  type Scrapbook,
  upsertScrapbook,
  weekDates,
  weekStartISO,
  weekTitles,
} from './scrapbook';

describe('weekStartISO', () => {
  it('returns the Sunday of the week containing the date', () => {
    expect(weekStartISO(new Date(2026, 5, 17))).toBe('2026-06-14'); // Wed -> Sun 14
    expect(weekStartISO(new Date(2026, 5, 14))).toBe('2026-06-14'); // Sunday -> itself
    expect(weekStartISO(new Date(2026, 5, 20))).toBe('2026-06-14'); // Sat -> Sun 14
  });
});

describe('weekDates', () => {
  it('lists the seven days from the start', () => {
    expect(weekDates('2026-06-14')).toEqual([
      '2026-06-14',
      '2026-06-15',
      '2026-06-16',
      '2026-06-17',
      '2026-06-18',
      '2026-06-19',
      '2026-06-20',
    ]);
  });
});

describe('weekTitles', () => {
  it('gathers completed titles across the week, skipping days outside it', () => {
    const byDay = new Map<string, { title: string }[]>([
      ['2026-06-15', [{ title: 'A' }, { title: 'B' }]],
      ['2026-06-18', [{ title: 'C' }]],
      ['2026-07-01', [{ title: 'Outside' }]],
    ]);
    expect(weekTitles(byDay, '2026-06-14')).toEqual(['A', 'B', 'C']);
  });
});

describe('findScrapbook / upsertScrapbook', () => {
  const mk = (weekStart: string, image = 'x'): Scrapbook => ({ weekStart, image, caption: '', createdAt: 0 });

  it('finds by week', () => {
    expect(findScrapbook([mk('2026-06-14')], '2026-06-14')?.weekStart).toBe('2026-06-14');
    expect(findScrapbook([mk('2026-06-14')], '2026-06-07')).toBeUndefined();
  });

  it('replaces the same week and keeps newest first', () => {
    const next = upsertScrapbook([mk('2026-06-07', 'old')], mk('2026-06-14', 'new'));
    expect(next.map((b) => b.weekStart)).toEqual(['2026-06-14', '2026-06-07']);
    const replaced = upsertScrapbook(next, mk('2026-06-14', 'newer'));
    expect(replaced.filter((b) => b.weekStart === '2026-06-14')).toHaveLength(1);
    expect(replaced[0].image).toBe('newer');
  });

  it('caps the store at MAX_SCRAPBOOKS', () => {
    let books: Scrapbook[] = [];
    for (let i = 0; i < MAX_SCRAPBOOKS + 5; i += 1) {
      books = upsertScrapbook(books, mk(`2026-01-${String(i + 1).padStart(2, '0')}`));
    }
    expect(books).toHaveLength(MAX_SCRAPBOOKS);
  });
});
