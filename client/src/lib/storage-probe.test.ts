import { afterEach, describe, expect, it, vi } from 'vitest';

import { SUPPORTED, translate } from './i18n';
import { blockedOnce, PROBE_KEY, probeStorage, type ProbeStore, siteName } from './storage-probe';

// The web's write-then-read probe (the 1 Nov bug sweep, #31): Today's line shows only when this browser keeps
// nothing. Every way a browser refuses is a false, every way it keeps is a true, and nothing here ever throws.

/** A store that keeps what it is given, the way a working localStorage does. */
function mapStore(): ProbeStore & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, String(v)),
    removeItem: (k) => void map.delete(k),
  };
}

describe('probeStorage', () => {
  it('a store that keeps what it is given: saving works, and the probe key is gone afterwards', () => {
    const store = mapStore();
    store.map.set('doubledone.tasks.v1', '[]');
    expect(probeStorage(() => store)).toBe(true);
    expect(store.map.has(PROBE_KEY)).toBe(false);
    expect([...store.map.keys()]).toEqual(['doubledone.tasks.v1']);
  });

  it('just reading localStorage throws a SecurityError (site data blocked): it keeps nothing', () => {
    const get = () => {
      throw new DOMException("Failed to read the 'localStorage' property from 'Window': Access is denied for this document.", 'SecurityError');
    };
    expect(() => probeStorage(get)).not.toThrow();
    expect(probeStorage(get)).toBe(false);
  });

  it('no storage at all (a webview with DOM storage off): it keeps nothing', () => {
    expect(probeStorage(() => null)).toBe(false);
    expect(probeStorage(() => undefined)).toBe(false);
  });

  it('setItem throws a QuotaExceededError (a full store, old Safari private mode): it keeps nothing', () => {
    const store: ProbeStore = {
      ...mapStore(),
      setItem: () => {
        throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
      },
    };
    expect(() => probeStorage(() => store)).not.toThrow();
    expect(probeStorage(() => store)).toBe(false);
  });

  it('a store that drops the write, so getItem returns something else: it keeps nothing', () => {
    const dropping: ProbeStore = { getItem: () => null, setItem: () => undefined, removeItem: () => undefined };
    expect(probeStorage(() => dropping)).toBe(false);
    const stale: ProbeStore = { getItem: () => 'an older probe', setItem: () => undefined, removeItem: () => undefined };
    expect(probeStorage(() => stale)).toBe(false);
  });

  it('getItem throws after the write: it keeps nothing', () => {
    const store: ProbeStore = {
      ...mapStore(),
      getItem: () => {
        throw new Error('read refused');
      },
    };
    expect(probeStorage(() => store)).toBe(false);
  });

  it('removeItem throws after a good read: saving still works', () => {
    const store = mapStore();
    const sticky: ProbeStore = {
      getItem: store.getItem,
      setItem: store.setItem,
      removeItem: () => {
        throw new Error('remove refused');
      },
    };
    expect(() => probeStorage(() => sticky)).not.toThrow();
    expect(probeStorage(() => sticky)).toBe(true);
  });

  it('writes a fresh value each time, so a value left by an earlier probe never passes for a new write', () => {
    const seen: string[] = [];
    const store = mapStore();
    const spying: ProbeStore = {
      ...store,
      setItem: (k, v) => {
        seen.push(v);
        store.setItem(k, v);
      },
    };
    probeStorage(() => spying);
    probeStorage(() => spying);
    expect(seen).toHaveLength(2);
    expect(seen[0]).not.toBe(seen[1]);
  });
});

describe('blockedOnce: one probe per page load', () => {
  it('asks the browser once, however often Today asks', () => {
    const get = vi.fn(() => {
      throw new DOMException('The operation is insecure.', 'SecurityError');
    });
    const blocked = blockedOnce(get);
    expect(blocked()).toBe(true);
    expect(blocked()).toBe(true);
    expect(blocked()).toBe(true);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('a browser that keeps things is not blocked, and is asked once too', () => {
    const store = mapStore();
    const get = vi.fn(() => store);
    const blocked = blockedOnce(get);
    expect(blocked()).toBe(false);
    expect(blocked()).toBe(false);
    expect(get).toHaveBeenCalledTimes(1);
  });
});

describe('webStorageBlocked, storageSite and the line, as the page sees them', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('with no window there is no browser to ask: never blocked, never due, and nothing throws', async () => {
    const probe = await import('./storage-probe');
    expect(probe.webStorageBlocked()).toBe(false);
    expect(probe.storageLineDue()).toBe(false);
    expect(probe.storageSite()).toBe('doubledone.app');
  });

  it('a browser that blocks site data: due on this page load until "Got it", and the browser is asked once', async () => {
    const reads = vi.fn();
    vi.stubGlobal('window', {
      get localStorage(): Storage {
        reads();
        throw new DOMException('The operation is insecure.', 'SecurityError');
      },
      location: { hostname: 'doubledone.app' },
    });
    const probe = await import('./storage-probe');
    expect(probe.webStorageBlocked()).toBe(true);
    expect(probe.storageLineDue()).toBe(true);
    expect(probe.storageLineDue()).toBe(true); // leaving Today and coming back, before "Got it"
    probe.hideStorageLine();
    expect(probe.storageLineDue()).toBe(false); // hidden for the rest of this page load
    expect(probe.webStorageBlocked()).toBe(true); // the browser still keeps nothing
    expect(reads).toHaveBeenCalledTimes(1);
  });

  it('a reload starts from nothing, so the line comes back', async () => {
    vi.stubGlobal('window', {
      get localStorage(): Storage {
        throw new DOMException('The operation is insecure.', 'SecurityError');
      },
      location: { hostname: 'doubledone.app' },
    });
    const first = await import('./storage-probe');
    first.hideStorageLine();
    expect(first.storageLineDue()).toBe(false);
    vi.resetModules(); // a reload: a fresh page, a fresh module
    const second = await import('./storage-probe');
    expect(second.storageLineDue()).toBe(true);
  });

  it('a browser that keeps things (a private window included) never sees the line', async () => {
    const store = mapStore();
    vi.stubGlobal('window', { localStorage: store, location: { hostname: 'doubledone.app' } });
    const probe = await import('./storage-probe');
    expect(probe.webStorageBlocked()).toBe(false);
    expect(probe.storageLineDue()).toBe(false);
    expect(store.map.size).toBe(0);
  });

  it('names the page it is on, without www', async () => {
    vi.stubGlobal('window', { location: { hostname: 'www.doubledone.app' } });
    expect((await import('./storage-probe')).storageSite()).toBe('doubledone.app');
    vi.resetModules();
    vi.stubGlobal('window', { location: { hostname: 'doubledone.pages.dev' } });
    expect((await import('./storage-probe')).storageSite()).toBe('doubledone.pages.dev');
  });

  it('a page address that cannot be read falls back to doubledone.app', async () => {
    vi.stubGlobal('window', {
      get location(): Location {
        throw new Error('no location');
      },
    });
    expect((await import('./storage-probe')).storageSite()).toBe('doubledone.app');
  });
});

describe('siteName', () => {
  it('drops a leading www, keeps any other host, and falls back to doubledone.app', () => {
    expect(siteName('doubledone.app')).toBe('doubledone.app');
    expect(siteName('WWW.doubledone.app')).toBe('doubledone.app');
    expect(siteName('doubledone.pages.dev')).toBe('doubledone.pages.dev');
    expect(siteName('localhost')).toBe('localhost');
    expect(siteName('')).toBe('doubledone.app');
    expect(siteName(null)).toBe('doubledone.app');
    expect(siteName(undefined)).toBe('doubledone.app');
  });
});

describe('today.storageBlocked, as it reads', () => {
  it('names the site and is calm in all five languages: no braces, no dash, no exclamation mark', () => {
    for (const loc of SUPPORTED) {
      const line = translate(loc, 'today.storageBlocked', { site: 'doubledone.app' });
      expect(line, loc).not.toBe('today.storageBlocked');
      expect(line, loc).toContain('doubledone.app');
      expect(line, loc).not.toMatch(/[{}]/);
      expect(line, loc).not.toMatch(/[—–]/);
      expect(line, loc).not.toContain('!');
    }
  });

  it('is its own line in every language, not the English fallback', () => {
    const english = translate('en', 'today.storageBlocked', { site: 'doubledone.app' });
    for (const loc of SUPPORTED.filter((l) => l !== 'en')) {
      expect(translate(loc, 'today.storageBlocked', { site: 'doubledone.app' }), loc).not.toBe(english);
    }
  });
});
