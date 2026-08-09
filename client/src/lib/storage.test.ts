import AsyncStorage from '@react-native-async-storage/async-storage';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  loadOursCache,
  loadOursTasks,
  loadTuckedPairs,
  pruneOursCache,
  saveOursTasks,
  tuckPair,
  untuckPair,
  wipeLocalData,
} from './storage';

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(() => Promise.resolve(null)),
    setItem: vi.fn(() => Promise.resolve()),
    removeItem: vi.fn(() => Promise.resolve()),
    multiRemove: vi.fn(() => Promise.resolve()),
  },
}));

/** Point the mocked getItem at a canned payload for OURS_KEY, ignoring every other key. */
function stubOurs(raw: string | null) {
  vi.mocked(AsyncStorage.getItem).mockImplementation((key: string) =>
    Promise.resolve(key === 'doubledone.ours.v1' ? raw : null),
  );
}
const written = () => JSON.parse(vi.mocked(AsyncStorage.setItem).mock.calls.at(-1)![1] as string);

describe('wipeLocalData', () => {
  beforeEach(() => vi.clearAllMocks());

  it('clears the scrapbook and the rest of the user content, keeping device prefs', async () => {
    await wipeLocalData();

    // tasks reset to an explicit empty, not removed, so loadTasks does not re-seed
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('doubledone.tasks.v1', expect.any(String));
    // the synced-owner marker is cleared
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith('doubledone.account.v1');

    // the content + history keys go in one multiRemove, including the scrapbook (the regression)
    const removed = vi.mocked(AsyncStorage.multiRemove).mock.calls[0][0];
    expect(removed).toContain('doubledone.scrapbooks.v1');
    expect(removed).toContain('doubledone.routines.v1');
    expect(removed).toContain('doubledone.closed.v1');
    expect(removed).toContain('doubledone.lowday.v1');
    expect(removed).toContain('doubledone.lastopen.v1');

    // device-level display prefs are not personal content, so they stay
    expect(removed).not.toContain('doubledone.settings.v1');
    expect(removed).not.toContain('doubledone.reminder.v1');
    expect(removed).not.toContain('doubledone.onboarded.v1');
  });

  // The shared list is the only key holding words ANOTHER person wrote. Leaving it behind would
  // strand a household's list on the phone of someone whose account no longer exists, which is the
  // exact shape of the bug the scrapbook once had and this one key list exists to prevent.
  it('clears the shared lists, the one thing here that is not only yours', async () => {
    await wipeLocalData();
    expect(vi.mocked(AsyncStorage.multiRemove).mock.calls[0][0]).toContain('doubledone.ours.v1');
  });
});

describe('the shared-list cache', () => {
  beforeEach(() => vi.clearAllMocks());

  it('is keyed by pair, so two households can never blend into one list', async () => {
    stubOurs(JSON.stringify({ 'pair-a': [{ id: 'bins' }], 'pair-b': [{ id: 'nappies' }] }));

    expect((await loadOursTasks('pair-a')).map((t) => t.id)).toEqual(['bins']);
    expect((await loadOursTasks('pair-b')).map((t) => t.id)).toEqual(['nappies']);
  });

  it('returns empty for a pair this device has never cached, which is not an error', async () => {
    stubOurs(null);
    expect(await loadOursTasks('pair-a')).toEqual([]);
    expect(await loadOursCache()).toEqual({});
  });

  it('writing one pair leaves the other pair’s rows untouched', async () => {
    stubOurs(JSON.stringify({ 'pair-a': [{ id: 'bins' }], 'pair-b': [{ id: 'nappies' }] }));
    await saveOursTasks('pair-a', [{ id: 'bins' }, { id: 'milk' }] as never);

    expect(Object.keys(written())).toEqual(['pair-a', 'pair-b']);
    expect(written()['pair-b']).toEqual([{ id: 'nappies' }]);
  });

  // Anything on disk can be from an older build or half-written. A screen must never be handed a
  // shape it will crash on, on a surface whose whole promise is calm.
  it('survives junk on disk rather than handing a screen something that crashes it', async () => {
    stubOurs('not json at all');
    expect(await loadOursCache()).toEqual({});

    stubOurs(JSON.stringify(['an', 'array']));
    expect(await loadOursCache()).toEqual({});

    stubOurs(JSON.stringify({ good: [{ id: 'a' }], bad: 'not an array', alsoBad: null }));
    expect(Object.keys(await loadOursCache())).toEqual(['good']);
  });
});

describe('pruneOursCache', () => {
  beforeEach(() => vi.clearAllMocks());

  // Leaving a list, being removed from one, and having one killed all converge here: whatever the
  // reason, the other person's words stop being on this device.
  it('drops every pair that is not a confirmed membership', async () => {
    stubOurs(JSON.stringify({ keep: [{ id: 'a' }], gone: [{ id: 'b' }] }));
    await pruneOursCache(['keep']);
    expect(Object.keys(written())).toEqual(['keep']);
  });

  it('treats an empty membership list as meaningful and clears everything', async () => {
    stubOurs(JSON.stringify({ gone: [{ id: 'b' }] }));
    await pruneOursCache([]);
    expect(written()).toEqual({});
  });

  it('writes nothing when there was nothing to drop', async () => {
    stubOurs(JSON.stringify({ keep: [{ id: 'a' }] }));
    await pruneOursCache(['keep']);
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });
});

// "Put it away" is the design's ordinary exit from a closed list, superseding the destructive
// forget_pair. It stores an acknowledgement, never content: a set of pair ids and nothing else.
describe('putting a closed list away', () => {
  beforeEach(() => vi.clearAllMocks());

  function stubTucked(raw: string | null) {
    vi.mocked(AsyncStorage.getItem).mockImplementation((key: string) =>
      Promise.resolve(key === 'doubledone.oursTucked.v1' ? raw : null),
    );
  }
  const written = () => JSON.parse(vi.mocked(AsyncStorage.setItem).mock.calls.at(-1)![1] as string);

  it('remembers one, and is idempotent so a double tap is one tuck', async () => {
    stubTucked(null);
    await tuckPair('p-1');
    expect(written()).toEqual(['p-1']);

    stubTucked(JSON.stringify(['p-1']));
    vi.clearAllMocks();
    stubTucked(JSON.stringify(['p-1']));
    await tuckPair('p-1');
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  // Putting away must not be a one-way door either. The archive brings one back out.
  it('brings one back out', async () => {
    stubTucked(JSON.stringify(['p-1', 'p-2']));
    await untuckPair('p-1');
    expect(written()).toEqual(['p-2']);
  });

  it('survives junk on disk rather than throwing on a calm screen', async () => {
    for (const junk of ['not json', JSON.stringify({ a: 1 }), JSON.stringify([1, null, 'p-1'])]) {
      stubTucked(junk);
      const out = await loadTuckedPairs();
      expect(Array.isArray(out)).toBe(true);
      expect(out.every((id) => typeof id === 'string')).toBe(true);
    }
  });

  // It says which relationships you had, so it goes with everything else on account deletion.
  it('is cleared by wipeLocalData', async () => {
    stubTucked(null);
    await wipeLocalData();
    expect(vi.mocked(AsyncStorage.multiRemove).mock.calls[0][0]).toContain('doubledone.oursTucked.v1');
  });
});
