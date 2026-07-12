import { describe, expect, it } from 'vitest';

import { MAX_SCRAPBOOKS, type Scrapbook } from './scrapbook';
import { bookToRow, isSyncableBook, mergeScrapbooks, rowToBook } from './scrapbook-sync';

function book(weekStart: string, createdAt: number, over: Partial<Scrapbook> = {}): Scrapbook {
  return {
    weekStart,
    image: `https://api.doubledone.app/scrapbook-img/${weekStart}.jpg`,
    caption: 'a quiet week',
    createdAt,
    ...over,
  };
}

const weeks = (bs: Scrapbook[]) => bs.map((b) => b.weekStart);

describe('scrapbook row mapping', () => {
  it('round-trips a book through the row shape', () => {
    const b = book('2026-07-05', 1752300000000);
    expect(rowToBook(bookToRow(b, 'user-1'))).toEqual(b);
  });

  it('stamps user_id and writes created_at as ISO (client-written LWW truth)', () => {
    const row = bookToRow(book('2026-07-05', 0), 'u');
    expect(row.user_id).toBe('u');
    expect(row.created_at).toBe('1970-01-01T00:00:00.000Z');
    expect(row.week_start).toBe('2026-07-05');
  });

  it('a corrupt created_at parses to a finite fallback, never NaN', () => {
    const b = rowToBook({ week_start: '2026-07-05', image: 'https://x/i.jpg', caption: '', created_at: 'not a date' });
    expect(Number.isFinite(b.createdAt)).toBe(true);
  });
});

describe('isSyncableBook (only R2-served https keepsakes sync)', () => {
  it('https syncs, data: and junk stay device-local', () => {
    expect(isSyncableBook({ image: 'https://api.doubledone.app/scrapbook-img/a.jpg' })).toBe(true);
    expect(isSyncableBook({ image: 'data:image/jpeg;base64,AAAA' })).toBe(false);
    expect(isSyncableBook({ image: '' })).toBe(false);
  });
});

describe('mergeScrapbooks (per-week LWW by createdAt)', () => {
  it('local-only https books push up (the first-sync migration)', () => {
    const res = mergeScrapbooks([book('2026-07-05', 10), book('2026-06-28', 5)], []);
    expect(weeks(res.merged)).toEqual(['2026-07-05', '2026-06-28']); // newest week first
    expect(weeks(res.toPush)).toEqual(['2026-07-05', '2026-06-28']);
  });

  it('a local-only data: book stays in merged but never pushes', () => {
    const legacy = book('2026-07-05', 10, { image: 'data:image/jpeg;base64,AAAA' });
    const res = mergeScrapbooks([legacy], []);
    expect(res.merged).toEqual([legacy]);
    expect(res.toPush).toEqual([]);
  });

  it('remote-only books pull down and push nothing', () => {
    const res = mergeScrapbooks([], [book('2026-07-05', 10)]);
    expect(weeks(res.merged)).toEqual(['2026-07-05']);
    expect(res.toPush).toEqual([]);
  });

  it('the newer local remake wins its week and pushes; the newer remote wins silently', () => {
    const localWins = mergeScrapbooks([book('2026-07-05', 20, { caption: 'remade' })], [book('2026-07-05', 10)]);
    expect(localWins.merged[0].caption).toBe('remade');
    expect(weeks(localWins.toPush)).toEqual(['2026-07-05']);

    const remoteWins = mergeScrapbooks([book('2026-07-05', 10)], [book('2026-07-05', 20, { caption: 'newer elsewhere' })]);
    expect(remoteWins.merged[0].caption).toBe('newer elsewhere');
    expect(remoteWins.toPush).toEqual([]);
  });

  it('a tie is already in sync: keeps the book, pushes nothing (quiescent steady state)', () => {
    const res = mergeScrapbooks([book('2026-07-05', 10)], [book('2026-07-05', 10)]);
    expect(res.merged).toHaveLength(1);
    expect(res.toPush).toEqual([]);
  });

  it('a corrupt local stamp loses to the good remote copy', () => {
    const res = mergeScrapbooks([book('2026-07-05', NaN, { caption: 'corrupt' })], [book('2026-07-05', 10)]);
    expect(res.merged[0].caption).toBe('a quiet week');
    expect(res.toPush).toEqual([]);
  });

  it('caps the merged set at MAX_SCRAPBOOKS newest weeks (the local render bound)', () => {
    const remote = Array.from({ length: MAX_SCRAPBOOKS + 5 }, (_, i) =>
      book(`2026-${String(1 + Math.floor(i / 4)).padStart(2, '0')}-${String(1 + (i % 4) * 7).padStart(2, '0')}`, i),
    );
    const res = mergeScrapbooks([], remote);
    expect(res.merged).toHaveLength(MAX_SCRAPBOOKS);
    // The kept books are the LATEST weeks: nothing older survives ahead of something newer.
    const kept = new Set(weeks(res.merged));
    const dropped = remote.filter((b) => !kept.has(b.weekStart)).map((b) => b.weekStart);
    for (const d of dropped) for (const k of kept) expect(d.localeCompare(k)).toBeLessThan(0);
  });
});
