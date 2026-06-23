import AsyncStorage from '@react-native-async-storage/async-storage';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { wipeLocalData } from './storage';

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(() => Promise.resolve(null)),
    setItem: vi.fn(() => Promise.resolve()),
    removeItem: vi.fn(() => Promise.resolve()),
    multiRemove: vi.fn(() => Promise.resolve()),
  },
}));

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
});
