import { type SupabaseClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { makeSharedRef } from './ours-bridge';
import { isSharedDoneOn, type SharedTask } from './ours-merge';
import { mirrorTickToShared } from './ours-tick';

// The shared cache and the network are seams: mock them and assert the ORDER of what happens, which
// is the behaviour that matters (pull first when the row is missing, write before syncing, note the
// write as mine last). The merge itself is real.
const { loadOursTasks, saveOursTasks, noteOursMine, syncPairOnce } = vi.hoisted(() => ({
  loadOursTasks: vi.fn((_pairId: string): Promise<SharedTask[]> => Promise.resolve([])),
  saveOursTasks: vi.fn((_pairId: string, _rows: SharedTask[]) => Promise.resolve()),
  noteOursMine: vi.fn((_pairId: string, _ids: string[]) => Promise.resolve()),
  syncPairOnce: vi.fn(
    (_client: unknown, _pairId: string, local: SharedTask[]): Promise<{ merged: SharedTask[]; pushError?: unknown }> =>
      Promise.resolve({ merged: local }),
  ),
}));
vi.mock('./storage', () => ({ loadOursTasks, saveOursTasks, noteOursMine }));
vi.mock('./ours-sync', async (importOriginal) => ({ ...(await importOriginal<typeof import('./ours-sync')>()), syncPairOnce }));

const client = {} as SupabaseClient;
const day = new Date(2026, 8, 26);
const iso = '2026-09-26';
const ref = makeSharedRef('pair1', 's1');

function row(over: Partial<SharedTask> = {}): SharedTask {
  return { id: 's1', title: 'Bins', done: false, createdAt: 1, updatedAt: 1, ...over };
}

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.clearAllMocks();
  warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  loadOursTasks.mockImplementation(() => Promise.resolve([]));
  syncPairOnce.mockImplementation((_c, _p, local) => Promise.resolve({ merged: local }));
});
afterEach(() => warn.mockRestore());

describe('mirrorTickToShared', () => {
  it('does nothing without a readable link or a client', async () => {
    await mirrorTickToShared(client, 'no-separator', day, true);
    await mirrorTickToShared(null, ref, day, true);
    expect(loadOursTasks).not.toHaveBeenCalled();
  });

  it('ticks the cached row for the day, syncs it, and notes the write as mine', async () => {
    loadOursTasks.mockImplementation(() => Promise.resolve([row(), row({ id: 's2' })]));
    const onWrite = vi.fn();
    await mirrorTickToShared(client, ref, day, true, onWrite);
    expect(onWrite).toHaveBeenCalledOnce();
    expect(syncPairOnce).toHaveBeenCalledOnce(); // in the cache already, so no pull first
    const written = saveOursTasks.mock.calls[0][1];
    expect(written.find((x) => x.id === 's1')?.done).toBe(true);
    expect(written.find((x) => x.id === 's2')?.done).toBe(false);
    expect(noteOursMine).toHaveBeenCalledWith('pair1', ['s1']);
  });

  it('pulls first when the row is not in the cache, and seeds the cache with the pull', async () => {
    const repeat = row({ recurrence: { kind: 'daily' } });
    syncPairOnce.mockImplementationOnce(() => Promise.resolve({ merged: [repeat] }));
    await mirrorTickToShared(client, ref, day, true);
    expect(syncPairOnce).toHaveBeenCalledTimes(2);
    expect(saveOursTasks.mock.calls[0][1]).toEqual([repeat]); // the seed
    const ticked = saveOursTasks.mock.calls[1][1][0];
    expect(isSharedDoneOn(ticked, iso)).toBe(true);
    expect(noteOursMine).toHaveBeenCalledWith('pair1', ['s1']);
  });

  it('leaves a removed row, or a cadence this build cannot read, untouched', async () => {
    loadOursTasks.mockImplementation(() => Promise.resolve([row({ deletedAt: 5 })]));
    await mirrorTickToShared(client, ref, day, true);
    loadOursTasks.mockImplementation(() => Promise.resolve([row({ rawRecurrence: { kind: 'yearly' } })]));
    await mirrorTickToShared(client, ref, day, true);
    expect(saveOursTasks).not.toHaveBeenCalled();
    expect(noteOursMine).not.toHaveBeenCalled();
  });

  it('keeps the merged list and says so quietly when the push did not land', async () => {
    loadOursTasks.mockImplementation(() => Promise.resolve([row()]));
    syncPairOnce.mockImplementation((_c, _p, local) => Promise.resolve({ merged: local, pushError: new Error('offline') }));
    await mirrorTickToShared(client, ref, day, true);
    expect(warn).toHaveBeenCalledWith('[ours] tick did not reach the shared list', expect.any(Error));
    expect(saveOursTasks).toHaveBeenCalledTimes(2);
    expect(noteOursMine).toHaveBeenCalledOnce();
  });

  it('never throws: a failed pull is logged and the local copy stands', async () => {
    syncPairOnce.mockImplementation(() => Promise.reject(new Error('down')));
    await expect(mirrorTickToShared(client, ref, day, false)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith('[ours] mirrorTickToShared failed', expect.any(Error));
  });
});
