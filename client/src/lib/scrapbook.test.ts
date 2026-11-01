import { describe, expect, it } from 'vitest';

import {
  findScrapbook,
  keepsakeKey,
  MAX_SCRAPBOOKS,
  remakeScrapbook,
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

describe('keepsakeKey', () => {
  const ID = '0b9a7c3e-1f2d-4c5b-8a6e-9d0f1e2a3b4c.jpg';

  it('reads the R2 key out of a served picture address', () => {
    expect(keepsakeKey(`https://api.doubledone.app/scrapbook-img/${ID}`)).toBe(ID);
    expect(keepsakeKey(`https://api.doubledone.app/scrapbook-img/${encodeURIComponent('a b.jpg')}`)).toBe('a b.jpg');
  });

  it('has nothing for a device-only picture', () => {
    expect(keepsakeKey('data:image/jpeg;base64,AAAA')).toBeNull();
    expect(keepsakeKey('')).toBeNull();
  });

  // It runs on the account delete's path, so a malformed address must never throw and stop the wipe after it.
  it('never throws on a malformed address', () => {
    expect(() => keepsakeKey('https://api.doubledone.app/scrapbook-img/%E0%A4%A')).not.toThrow();
    expect(keepsakeKey('https://api.doubledone.app/scrapbook-img/%E0%A4%A')).toBeNull();
  });
});

describe('remakeScrapbook (#3: a remade week names the picture it replaced)', () => {
  const OLD = 'https://api.doubledone.app/scrapbook-img/old.jpg';
  const NEW = 'https://api.doubledone.app/scrapbook-img/new.jpg';
  const at = (weekStart: string, image: string, createdAt: number): Scrapbook => ({ weekStart, image, caption: '', createdAt });

  it('a first keepsake for its week replaces nothing, and stores exactly as upsertScrapbook does', () => {
    const books = [at('2026-06-07', OLD, 5)];
    const entry = at('2026-06-14', NEW, 10);
    const out = remakeScrapbook(books, entry);
    expect(out.replaced).toBeNull();
    expect(out.book).toEqual(entry);
    expect(out.books).toEqual(upsertScrapbook(books, entry));
  });

  it('a remake replaces the week and names the old R2 picture for retiring', () => {
    const out = remakeScrapbook([at('2026-06-14', OLD, 5), at('2026-06-07', 'x', 1)], at('2026-06-14', NEW, 10));
    expect(out.replaced).toBe(OLD);
    expect(out.books.filter((b) => b.weekStart === '2026-06-14')).toEqual([at('2026-06-14', NEW, 10)]);
  });

  it('a device-only (data:) picture has nothing to retire', () => {
    expect(remakeScrapbook([at('2026-06-14', 'data:image/jpeg;base64,AA', 5)], at('2026-06-14', NEW, 10)).replaced).toBeNull();
  });

  it('never names the new picture itself', () => {
    expect(remakeScrapbook([at('2026-06-14', NEW, 5)], at('2026-06-14', NEW, 10)).replaced).toBeNull();
  });

  // The sync keeps the newer createdAt per week. A remake on a clock running behind would lose to the very
  // keepsake it replaced and bring the retired picture back as the week's, so it always outranks it.
  it('always outranks the keepsake it replaces, even on a clock running behind', () => {
    const out = remakeScrapbook([at('2026-06-14', OLD, 500)], at('2026-06-14', NEW, 100));
    expect(out.book.createdAt).toBe(501);
    expect(findScrapbook(out.books, '2026-06-14')?.createdAt).toBe(501);
    expect(remakeScrapbook([at('2026-06-14', OLD, 50)], at('2026-06-14', NEW, 100)).book.createdAt).toBe(100);
    expect(remakeScrapbook([at('2026-06-14', OLD, NaN)], at('2026-06-14', NEW, 100)).book.createdAt).toBe(100);
  });
});
