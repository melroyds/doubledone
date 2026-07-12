import { describe, expect, it } from 'vitest';

import {
  findScrapbook,
  MAX_SCRAPBOOKS,
  type Scrapbook,
  upsertScrapbook,
  weekCompletions,
  weekDates,
  weekStartISO,
  weekTitles,
  wrapLines,
} from './scrapbook';

describe('wrapLines (the keepsake page caption wrap)', () => {
  // A deterministic measure: 10 units per character, so widths are easy to reason about.
  const measure = (s: string) => s.length * 10;

  it('keeps a short caption on one line', () => {
    expect(wrapLines('a quiet week', 200, measure)).toEqual(['a quiet week']);
  });

  it('wraps greedily at the width limit, never mid-word', () => {
    // 'a quiet week of' = 15 chars = 150 > 140, so 'of' starts line two.
    expect(wrapLines('a quiet week of small wins', 140, measure)).toEqual(['a quiet week', 'of small wins']);
  });

  it('gives a single over-wide word its own line instead of looping', () => {
    expect(wrapLines('tiny extraordinarily-long-word end', 120, measure)).toEqual(['tiny', 'extraordinarily-long-word', 'end']);
  });

  it('collapses whitespace and returns [] for an empty caption', () => {
    expect(wrapLines('  spaced   out  ', 500, measure)).toEqual(['spaced out']);
    expect(wrapLines('', 500, measure)).toEqual([]);
    expect(wrapLines('   ', 500, measure)).toEqual([]);
  });
});

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

describe('weekCompletions', () => {
  it('dedupes by title and ORs the big flag across the week', () => {
    const byDay = new Map<string, { title: string; big?: boolean }[]>([
      ['2026-06-15', [{ title: 'Meds', big: false }, { title: 'Taxes', big: true }]],
      ['2026-06-17', [{ title: 'Meds', big: false }]], // a recurring task ticked again, shown once
      ['2026-07-01', [{ title: 'Outside', big: true }]],
    ]);
    expect(weekCompletions(byDay, '2026-06-14')).toEqual([
      { title: 'Meds', big: false },
      { title: 'Taxes', big: true },
    ]);
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
