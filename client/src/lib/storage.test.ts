import AsyncStorage from '@react-native-async-storage/async-storage';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  claimWidgetCountDay,
  loadGlanceMemory,
  loadHold,
  loadReminderStyle,
  saveGlanceMemory,
  saveReminderHour,
  saveReminderOn,
  saveReminderStyle,
  loadOursCache,
  loadOursTasks,
  clearOursMine,
  loadOursMine,
  loadOursSeen,
  loadTuckedPairs,
  markOursSeen,
  noteOursMine,
  peekTasks,
  pruneOursCache,
  saveClosedDate,
  saveHold,
  saveOursTasks,
  saveTasks,
  type StorageChange,
  subscribeStorageChange,
  tuckPair,
  untuckPair,
  wipeLocalData,
} from './storage';
import { serialize, type Task } from './tasks';

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
    // the review ask's memory is device state: clearing it would re-arm an ask the stores already counted
    expect(removed).not.toContain('doubledone.review.v1');
    expect(removed).not.toContain('doubledone.reviewquiet.v1');
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

// The quiet wash's memory: when you last looked at each shared list. A time per pair, never content.
describe('when you last looked at a shared list', () => {
  beforeEach(() => vi.clearAllMocks());

  function stubSeen(raw: string | null) {
    vi.mocked(AsyncStorage.getItem).mockImplementation((key: string) =>
      Promise.resolve(key === 'doubledone.oursSeen.v2' ? raw : null),
    );
  }
  const written = () => JSON.parse(vi.mocked(AsyncStorage.setItem).mock.calls.at(-1)![1] as string);

  it('remembers a look, per pair, without disturbing the other pairs', async () => {
    stubSeen(JSON.stringify({ 'p-1': 1000 }));
    await markOursSeen('p-2', 5000);
    expect(written()).toEqual({ 'p-1': 1000, 'p-2': 5000 });
  });

  // A device an hour behind would otherwise re-wash rows you have already read, every visit.
  it('never moves backwards', async () => {
    stubSeen(JSON.stringify({ 'p-1': 9000 }));
    await markOursSeen('p-1', 5000);
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  it('ignores a corrupt time rather than storing one', async () => {
    stubSeen(null);
    await markOursSeen('p-1', Number.NaN);
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  it('survives junk on disk rather than throwing on a calm screen', async () => {
    for (const junk of ['not json', JSON.stringify([1, 2]), JSON.stringify({ 'p-1': 'soon', 'p-2': 4000 })]) {
      stubSeen(junk);
      const out = await loadOursSeen();
      expect(Object.values(out).every((v) => typeof v === 'number')).toBe(true);
    }
    stubSeen(JSON.stringify({ 'p-1': 'soon', 'p-2': 4000 }));
    expect(await loadOursSeen()).toEqual({ 'p-2': 4000 });
  });

  // Keyed by pair id, so it says which relationships you had. It goes with the rest on deletion.
  it('is cleared by wipeLocalData', async () => {
    stubSeen(null);
    await wipeLocalData();
    expect(vi.mocked(AsyncStorage.multiRemove).mock.calls[0][0]).toContain('doubledone.oursSeen.v2');
  });
});

// The wash's other half: rows YOU changed from outside the room. Without it, ticking a brought copy
// on Today came back tinted as your partner's change, which is the room inventing an event.
describe('shared rows you changed from outside the room', () => {
  beforeEach(() => vi.clearAllMocks());

  function stubMine(raw: string | null) {
    vi.mocked(AsyncStorage.getItem).mockImplementation((key: string) =>
      Promise.resolve(key === 'doubledone.oursMine.v1' ? raw : null),
    );
  }
  const written = () => JSON.parse(vi.mocked(AsyncStorage.setItem).mock.calls.at(-1)![1] as string);

  it('remembers ids per pair, without disturbing the other pairs', async () => {
    stubMine(JSON.stringify({ 'p-1': ['a'] }));
    await noteOursMine('p-2', ['b']);
    expect(written()).toEqual({ 'p-1': ['a'], 'p-2': ['b'] });
  });

  it('does not duplicate an id you wrote twice', async () => {
    stubMine(JSON.stringify({ 'p-1': ['a', 'b'] }));
    await noteOursMine('p-1', ['a']);
    expect(written()['p-1']).toEqual(['b', 'a']);
  });

  it('writes nothing when there is nothing to note', async () => {
    stubMine(null);
    await noteOursMine('p-1', []);
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  // A courtesy is not worth unbounded storage; oldest fall off first.
  it('caps the list, keeping the newest', async () => {
    stubMine(JSON.stringify({ 'p-1': Array.from({ length: 200 }, (_, i) => `old-${i}`) }));
    await noteOursMine('p-1', ['newest']);
    const out = written()['p-1'];
    expect(out).toHaveLength(200);
    expect(out.at(-1)).toBe('newest');
    expect(out).not.toContain('old-0');
  });

  it('is forgotten per pair once the room has marked itself seen', async () => {
    stubMine(JSON.stringify({ 'p-1': ['a'], 'p-2': ['b'] }));
    await clearOursMine('p-1');
    expect(written()).toEqual({ 'p-2': ['b'] });
  });

  it('survives junk on disk rather than throwing on a calm screen', async () => {
    for (const junk of ['not json', JSON.stringify([1, 2]), JSON.stringify({ 'p-1': 'nope' }), JSON.stringify({ 'p-1': [1, 'a'] })]) {
      stubMine(junk);
      const out = await loadOursMine('p-1');
      expect(Array.isArray(out)).toBe(true);
      expect(out.every((id) => typeof id === 'string')).toBe(true);
    }
  });

  // Keyed by pair id, so it says which relationships you had. It goes with the rest on deletion.
  it('is cleared by wipeLocalData', async () => {
    stubMine(null);
    await wipeLocalData();
    expect(vi.mocked(AsyncStorage.multiRemove).mock.calls[0][0]).toContain('doubledone.oursMine.v1');
  });
});

// The storage change notice (2026-11-10): the one hook every write path for the day passes through, so the
// widget and the notification follow Goodnight, Reopen, a sync and the sweeps, not only Today's commit.
describe('the storage change notice', () => {
  const offs: (() => void)[] = [];
  const listen = (listener: (c: StorageChange) => void) => {
    const off = subscribeStorageChange(listener);
    offs.push(off);
    return off;
  };
  const heardAll = () => {
    const heard: StorageChange[] = [];
    listen((c) => heard.push(c));
    return heard;
  };
  const task = (id: string): Task => ({ id, title: id, done: false, createdAt: 1, updatedAt: 1 });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(AsyncStorage.getItem).mockImplementation(() => Promise.resolve(null));
  });
  afterEach(() => {
    while (offs.length > 0) offs.pop()!();
  });

  it('saves exactly as before for existing callers: same key, same value, nothing thrown', async () => {
    heardAll();
    const tasks = [task('a')];
    await expect(saveTasks(tasks)).resolves.toBeUndefined();
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('doubledone.tasks.v1', serialize(tasks));
  });

  it('tells every listener once a task save has landed, and stops telling one that unsubscribed', async () => {
    const first = heardAll();
    const second: StorageChange[] = [];
    const off = listen((c) => second.push(c));
    await saveTasks([task('a')]);
    off();
    off(); // safe twice
    await saveTasks([task('b')]);
    expect(first).toEqual(['tasks', 'tasks']);
    expect(second).toEqual(['tasks']);
  });

  it('tells only AFTER the write landed, never while it is in flight', async () => {
    const heard = heardAll();
    let land: () => void = () => {};
    vi.mocked(AsyncStorage.setItem).mockImplementationOnce(() => new Promise<void>((resolve) => (land = resolve)));
    const saving = saveTasks([task('a')]);
    await Promise.resolve();
    expect(heard).toEqual([]);
    land();
    await saving;
    expect(heard).toEqual(['tasks']);
  });

  it('says nothing when a save failed, because nothing changed to show', async () => {
    const heard = heardAll();
    vi.mocked(AsyncStorage.setItem).mockRejectedValueOnce(new Error('disk full'));
    await expect(saveTasks([task('a')])).resolves.toBeUndefined();
    vi.mocked(AsyncStorage.setItem).mockRejectedValueOnce(new Error('disk full'));
    await saveClosedDate('2026-11-10');
    vi.mocked(AsyncStorage.removeItem).mockRejectedValueOnce(new Error('disk full'));
    await saveHold(null);
    expect(heard).toEqual([]);
  });

  it('tells about the closed day, which is how Goodnight and Reopen reach the widget', async () => {
    const heard = heardAll();
    await saveClosedDate('2026-11-10');
    await saveClosedDate(null);
    expect(heard).toEqual(['closed', 'closed']);
  });

  it('tells about the held task, because the hold moves the order the widget and the notification show', async () => {
    const heard = heardAll();
    await saveHold({ taskId: 't1', title: 'x', heldAt: 1, notifIds: [] });
    await saveHold(null);
    expect(heard).toEqual(['hold', 'hold']);
  });

  it('ends an account wipe with one wipe notice, once everything is gone', async () => {
    const order: string[] = [];
    listen((c) => order.push(c));
    vi.mocked(AsyncStorage.multiRemove).mockImplementationOnce(() => {
      order.push('removed');
      return Promise.resolve();
    });
    await wipeLocalData();
    expect(order).toEqual(['tasks', 'removed', 'wipe']);
  });

  it('still says wipe when part of the wipe failed, so nothing outside the app keeps the old day', async () => {
    const heard = heardAll();
    vi.mocked(AsyncStorage.multiRemove).mockRejectedValueOnce(new Error('disk'));
    await wipeLocalData();
    expect(heard.at(-1)).toBe('wipe');
  });

  it('a listener that throws or rejects never reaches the save and never silences the others', async () => {
    listen(() => {
      throw new Error('boom');
    });
    listen(async () => {
      throw new Error('async boom'); // must not surface as an unhandled rejection either
    });
    const heard = heardAll();
    await expect(saveTasks([task('a')])).resolves.toBeUndefined();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(heard).toEqual(['tasks']);
    expect(AsyncStorage.setItem).toHaveBeenCalledTimes(1);
  });

  it('a listener leaving mid-notice does not disturb that round', async () => {
    const heard: string[] = [];
    let offB: () => void = () => {};
    listen(() => {
      heard.push('a');
      offB();
    });
    offB = listen(() => heard.push('b'));
    await saveTasks([]);
    await saveTasks([]);
    expect(heard).toEqual(['a', 'b', 'a']);
  });

  it('one function subscribed twice is two subscriptions, each with its own unsubscribe', async () => {
    const heard: StorageChange[] = [];
    const fn = (c: StorageChange) => heard.push(c);
    const off1 = listen(fn);
    listen(fn);
    off1();
    await saveClosedDate(null);
    expect(heard).toEqual(['closed']);
  });
});

// A reader that must never write: the widget and the notification read the day, they never seed it.
describe('peekTasks', () => {
  beforeEach(() => vi.clearAllMocks());

  it("reads nothing stored as an empty day and writes nothing (no seed: that is Today's first open)", async () => {
    vi.mocked(AsyncStorage.getItem).mockImplementation(() => Promise.resolve(null));
    expect(await peekTasks()).toEqual([]);
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  it('reads the stored tasks defensively', async () => {
    const stored = [{ id: 'a', title: 'a', done: false, createdAt: 1, updatedAt: 2 }];
    vi.mocked(AsyncStorage.getItem).mockImplementation(() => Promise.resolve(JSON.stringify([...stored, { junk: true }])));
    expect(await peekTasks()).toEqual(stored);
  });

  it('answers null when the read FAILS, so a surface keeps what it shows rather than drawing an empty day', async () => {
    vi.mocked(AsyncStorage.getItem).mockImplementation(() => Promise.reject(new Error('disk')));
    expect(await peekTasks()).toBeNull();
  });
});

describe('loadHold', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reads the contract through the shared parser, and a failed or junk read as none', async () => {
    const contract = { taskId: 't1', title: 'x', heldAt: 1, notifIds: ['n1'] };
    vi.mocked(AsyncStorage.getItem).mockImplementation((key: string) => Promise.resolve(key === 'doubledone.hold.v1' ? JSON.stringify(contract) : null));
    expect(await loadHold()).toEqual(contract);
    vi.mocked(AsyncStorage.getItem).mockImplementation(() => Promise.resolve('not json'));
    expect(await loadHold()).toBeNull();
    vi.mocked(AsyncStorage.getItem).mockImplementation(() => Promise.reject(new Error('disk')));
    expect(await loadHold()).toBeNull();
  });
});

// The daily reminder's settings tell the change notice too (2026-11-10): the notification IS the reminder in its glance
// style, so an Off, a new hour or a new style from any screen reaches it from the save itself, never ahead of it.
describe("the reminder's settings and the glance's memory", () => {
  const offs: (() => void)[] = [];
  const heardAll = () => {
    const heard: StorageChange[] = [];
    offs.push(subscribeStorageChange((c) => heard.push(c)));
    return heard;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(AsyncStorage.getItem).mockImplementation(() => Promise.resolve(null));
  });
  afterEach(() => {
    while (offs.length > 0) offs.pop()!();
  });

  it('tells "reminder" once the switch, the hour or the style has landed, with the values stored as before', async () => {
    const heard = heardAll();
    await saveReminderOn(false);
    await saveReminderHour(7.6);
    await saveReminderStyle('glance');
    expect(heard).toEqual(['reminder', 'reminder', 'reminder']);
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('doubledone.reminder.v1', 'off');
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('doubledone.reminderhour.v1', '8');
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('doubledone.reminderstyle.v1', 'glance');
  });

  it('says nothing when the save failed, and never throws', async () => {
    const heard = heardAll();
    vi.mocked(AsyncStorage.setItem)
      .mockRejectedValueOnce(new Error('disk full'))
      .mockRejectedValueOnce(new Error('disk full'))
      .mockRejectedValueOnce(new Error('disk full'));
    await expect(saveReminderOn(true)).resolves.toBeUndefined();
    await expect(saveReminderHour(9)).resolves.toBeUndefined();
    await expect(saveReminderStyle('nudge')).resolves.toBeUndefined();
    expect(heard).toEqual([]);
  });

  it('reads the style as the nudge unless the glance was chosen, so every existing user is unchanged', async () => {
    expect(await loadReminderStyle()).toBe('nudge');
    vi.mocked(AsyncStorage.getItem).mockImplementation((key: string) => Promise.resolve(key === 'doubledone.reminderstyle.v1' ? 'glance' : null));
    expect(await loadReminderStyle()).toBe('glance');
    vi.mocked(AsyncStorage.getItem).mockImplementation(() => Promise.resolve('GLANCE'));
    expect(await loadReminderStyle()).toBe('nudge');
    vi.mocked(AsyncStorage.getItem).mockImplementation(() => Promise.reject(new Error('disk')));
    expect(await loadReminderStyle()).toBe('nudge');
  });

  it("keeps the glance's memory under its own key, and saving it tells no notice (no refresh can set off another)", async () => {
    const heard = heardAll();
    const memory = { hour: 9, postedAt: 1, seenAt: 2, arrivalAt: 3, dismissedOn: '2026-11-10' };
    await saveGlanceMemory(memory);
    expect(heard).toEqual([]);
    const [key, raw] = vi.mocked(AsyncStorage.setItem).mock.calls.at(-1)!;
    expect(key).toBe('doubledone.glance.v1');
    vi.mocked(AsyncStorage.getItem).mockImplementation((k: string) => Promise.resolve(k === 'doubledone.glance.v1' ? (raw as string) : null));
    expect(await loadGlanceMemory()).toEqual(memory);
  });

  it('reads a missing, junk or unreadable memory as empty', async () => {
    const empty = { hour: null, postedAt: null, seenAt: null, arrivalAt: null, dismissedOn: null };
    expect(await loadGlanceMemory()).toEqual(empty);
    vi.mocked(AsyncStorage.getItem).mockImplementation(() => Promise.resolve('{oops'));
    expect(await loadGlanceMemory()).toEqual(empty);
    vi.mocked(AsyncStorage.getItem).mockImplementation(() => Promise.reject(new Error('disk')));
    expect(await loadGlanceMemory()).toEqual(empty);
  });

  it('a failed memory save never throws', async () => {
    vi.mocked(AsyncStorage.setItem).mockRejectedValueOnce(new Error('disk full'));
    await expect(saveGlanceMemory({ hour: 9, postedAt: null, seenAt: null, arrivalAt: null, dismissedOn: null })).resolves.toBeUndefined();
  });
});

// The widget.placed count's once-a-day claim (lib/widget-count): the first claim of a day stamps it, every later one
// that day is refused, and a storage failure refuses too, so a hiccup can only miss a count, never send two.
describe('claimWidgetCountDay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(AsyncStorage.getItem).mockImplementation(() => Promise.resolve(null));
  });

  it('claims a day nothing has counted, and stamps it under its own key', async () => {
    expect(await claimWidgetCountDay('2026-11-10')).toBe(true);
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('doubledone.widgetcount.v1', '2026-11-10');
  });

  it('refuses the day already stamped, without writing, and claims the next one', async () => {
    vi.mocked(AsyncStorage.getItem).mockImplementation((key: string) => Promise.resolve(key === 'doubledone.widgetcount.v1' ? '2026-11-10' : null));
    expect(await claimWidgetCountDay('2026-11-10')).toBe(false);
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
    expect(await claimWidgetCountDay('2026-11-11')).toBe(true);
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('doubledone.widgetcount.v1', '2026-11-11');
  });

  it('refuses when storage cannot be read or written, and never throws', async () => {
    vi.mocked(AsyncStorage.getItem).mockImplementationOnce(() => Promise.reject(new Error('disk')));
    expect(await claimWidgetCountDay('2026-11-10')).toBe(false);
    vi.mocked(AsyncStorage.setItem).mockRejectedValueOnce(new Error('disk full'));
    expect(await claimWidgetCountDay('2026-11-10')).toBe(false);
  });

  it('is device bookkeeping, so the account wipe leaves it', async () => {
    await wipeLocalData();
    const removed = [
      ...vi.mocked(AsyncStorage.removeItem).mock.calls.map(([k]) => k),
      ...vi.mocked(AsyncStorage.multiRemove).mock.calls.flatMap(([ks]) => ks as string[]),
    ];
    expect(removed).not.toContain('doubledone.widgetcount.v1');
  });
});
