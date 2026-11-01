import { type SupabaseClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MAX_SCRAPBOOKS, type Scrapbook } from './scrapbook';
import {
  accountKeepsakeImages,
  bookToRow,
  isSyncableBook,
  KEEPSAKE_READ_TIMEOUT_MS,
  mergeScrapbooks,
  pushRemade,
  retireReplacedKeepsake,
  rowToBook,
} from './scrapbook-sync';

// The store is AsyncStorage on a phone, so it is mocked: the tests set what is on the device.
const { loadScrapbooks, saveScrapbooks, loadSyncedOwner } = vi.hoisted(() => ({
  loadScrapbooks: vi.fn((): Promise<Scrapbook[]> => Promise.resolve([])),
  saveScrapbooks: vi.fn((_books: Scrapbook[]) => Promise.resolve()),
  loadSyncedOwner: vi.fn((): Promise<string | null> => Promise.resolve(null)),
}));
vi.mock('./storage', () => ({ loadScrapbooks, saveScrapbooks, loadSyncedOwner }));

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

// The `scrapbooks` table as the client sees it: a select that resolves (optionally filtered by .eq), and an upsert.
function fakeTable(opts: { rows?: unknown[] | null; readError?: unknown; upsertError?: unknown; readThrows?: boolean; hang?: boolean } = {}) {
  const answer = () => {
    if (opts.readThrows) return Promise.reject(new Error('offline'));
    if (opts.hang) return new Promise<never>(() => undefined);
    return Promise.resolve({ data: opts.rows === undefined ? [] : opts.rows, error: opts.readError ?? null });
  };
  const eq = vi.fn((_column: string, _value: string) => answer());
  const select = vi.fn((_columns: string) => Object.assign(answer(), { eq }));
  const upsert = vi.fn((_rows: unknown[], _opts: unknown) => Promise.resolve({ error: opts.upsertError ?? null }));
  const from = vi.fn((_table: string) => ({ select, upsert }));
  return { client: { from } as unknown as SupabaseClient, from, select, eq, upsert };
}

const OLD = 'https://api.doubledone.app/scrapbook-img/old.jpg';
const NEW = 'https://api.doubledone.app/scrapbook-img/new.jpg';

beforeEach(() => {
  vi.clearAllMocks();
  loadScrapbooks.mockImplementation(() => Promise.resolve([]));
  loadSyncedOwner.mockImplementation(() => Promise.resolve(null));
});

describe('accountKeepsakeImages (#3: the account delete reads what the device no longer holds)', () => {
  afterEach(() => vi.useRealTimers());

  it("reads every picture the account's rows name, under RLS", async () => {
    const t = fakeTable({ rows: [{ image: OLD }, { image: NEW }] });
    expect(await accountKeepsakeImages(t.client)).toEqual([OLD, NEW]);
    expect(t.from).toHaveBeenCalledWith('scrapbooks');
    expect(t.select).toHaveBeenCalledWith('image');
  });

  it('keeps only usable addresses', async () => {
    const t = fakeTable({ rows: [{ image: OLD }, { image: '' }, { image: 7 }, {}, null] });
    expect(await accountKeepsakeImages(t.client)).toEqual([OLD]);
  });

  it('answers [] on an error or a throw, so the delete goes ahead without it', async () => {
    expect(await accountKeepsakeImages(fakeTable({ readError: { message: 'rls' } }).client)).toEqual([]);
    expect(await accountKeepsakeImages(fakeTable({ readThrows: true }).client)).toEqual([]);
    expect(await accountKeepsakeImages(fakeTable({ rows: null }).client)).toEqual([]);
  });

  it('never holds the delete up: a read that hangs gives way after the timeout', async () => {
    vi.useFakeTimers();
    const out = accountKeepsakeImages(fakeTable({ hang: true }).client);
    await vi.advanceTimersByTimeAsync(KEEPSAKE_READ_TIMEOUT_MS);
    await expect(out).resolves.toEqual([]);
  });
});

describe('pushRemade (a remade keepsake goes up now, by the sync rule)', () => {
  const fresh = book('2026-07-05', 2_000, { image: NEW });

  it('upserts the remade keepsake over the row for the picture it replaced', async () => {
    const t = fakeTable({ rows: [{ image: OLD, created_at: new Date(1_000).toISOString() }] });
    expect(await pushRemade(t.client, 'u1', fresh, OLD)).toBe(true);
    expect(t.eq).toHaveBeenCalledWith('week_start', '2026-07-05');
    expect(t.upsert).toHaveBeenCalledWith([bookToRow(fresh, 'u1')], { onConflict: 'user_id,week_start' });
  });

  it('upserts when the account has no row for the week yet', async () => {
    const t = fakeTable({ rows: [] });
    expect(await pushRemade(t.client, 'u1', fresh, OLD)).toBe(true);
    expect(t.upsert).toHaveBeenCalledTimes(1);
  });

  it('leaves a newer row from another device alone, and says the account has moved on', async () => {
    const t = fakeTable({ rows: [{ image: 'https://api.doubledone.app/scrapbook-img/other.jpg', created_at: new Date(3_000).toISOString() }] });
    expect(await pushRemade(t.client, 'u1', fresh, OLD)).toBe(true);
    expect(t.upsert).not.toHaveBeenCalled();
  });

  it('reports failure when the account could not be read or written, or the keepsake cannot sync', async () => {
    expect(await pushRemade(fakeTable({ readError: { message: 'rls' } }).client, 'u1', fresh, OLD)).toBe(false);
    expect(await pushRemade(fakeTable({ readThrows: true }).client, 'u1', fresh, OLD)).toBe(false);
    expect(await pushRemade(fakeTable({ upsertError: { message: 'rls' } }).client, 'u1', fresh, OLD)).toBe(false);
    const local = fakeTable();
    expect(await pushRemade(local.client, 'u1', book('2026-07-05', 2_000, { image: 'data:image/jpeg;base64,AA' }), OLD)).toBe(false);
    expect(local.from).not.toHaveBeenCalled();
  });
});

describe('retireReplacedKeepsake (#3: a remake retires the picture it replaced, here and only when safe)', () => {
  const fresh = book('2026-07-05', 2_000, { image: NEW });
  const kept = () => loadScrapbooks.mockImplementation(() => Promise.resolve([fresh, book('2026-06-28', 5)]));
  const purge = vi.fn((_images: string[]) => Promise.resolve());

  it('signed out, on a device that never synced: purges once the new keepsake is saved', async () => {
    kept();
    expect(await retireReplacedKeepsake(OLD, fresh, null, purge)).toBe(true);
    expect(purge).toHaveBeenCalledWith([OLD]);
  });

  it('signed in: the account gets the new keepsake first, then the old picture goes', async () => {
    kept();
    loadSyncedOwner.mockImplementation(() => Promise.resolve('u1'));
    const t = fakeTable({ rows: [{ image: OLD, created_at: new Date(1_000).toISOString() }] });
    expect(await retireReplacedKeepsake(OLD, fresh, { client: t.client, userId: 'u1' }, purge)).toBe(true);
    expect(t.upsert).toHaveBeenCalledTimes(1);
    expect(t.upsert.mock.invocationCallOrder[0]).toBeLessThan(purge.mock.invocationCallOrder[0]);
  });

  it('keeps the old picture when the account could not take the new keepsake', async () => {
    kept();
    const t = fakeTable({ upsertError: { message: 'offline' } });
    expect(await retireReplacedKeepsake(OLD, fresh, { client: t.client, userId: 'u1' }, purge)).toBe(false);
    expect(purge).not.toHaveBeenCalled();
  });

  it('keeps the old picture when the new keepsake did not save, or the device still shows the old one', async () => {
    loadScrapbooks.mockImplementation(() => Promise.resolve([book('2026-07-05', 1_000, { image: OLD })]));
    expect(await retireReplacedKeepsake(OLD, fresh, null, purge)).toBe(false);
    loadScrapbooks.mockImplementation(() => Promise.resolve([])); // an unreadable store proves nothing was kept
    expect(await retireReplacedKeepsake(OLD, fresh, null, purge)).toBe(false);
    expect(purge).not.toHaveBeenCalled();
  });

  // The cross-account guard, as the task sync keeps it: never another account's picture.
  it("never retires another account's picture", async () => {
    kept();
    loadSyncedOwner.mockImplementation(() => Promise.resolve('someone-else'));
    const t = fakeTable();
    expect(await retireReplacedKeepsake(OLD, fresh, { client: t.client, userId: 'u1' }, purge)).toBe(false);
    expect(t.from).not.toHaveBeenCalled();
    expect(purge).not.toHaveBeenCalled();
  });

  // Signing out keeps the device's keepsakes, and the account they synced with may still show the old picture.
  it('signed out on a device that synced with an account: keeps it for that account', async () => {
    kept();
    loadSyncedOwner.mockImplementation(() => Promise.resolve('u1'));
    expect(await retireReplacedKeepsake(OLD, fresh, null, purge)).toBe(false);
    expect(purge).not.toHaveBeenCalled();
  });

  it('never throws, whatever fails', async () => {
    loadScrapbooks.mockImplementation(() => Promise.reject(new Error('disk')));
    await expect(retireReplacedKeepsake(OLD, fresh, null, purge)).resolves.toBe(false);
    kept();
    const failing = vi.fn((_images: string[]) => Promise.reject(new Error('offline')));
    await expect(retireReplacedKeepsake(OLD, fresh, null, failing)).resolves.toBe(false);
  });
});
