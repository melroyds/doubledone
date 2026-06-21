import { afterEach, describe, expect, it, vi } from 'vitest';

import { setInbound, subscribeInbound, takeInbound } from './inbound';

// The bridge is module-level state, so drain it between tests to keep them independent.
afterEach(() => {
  takeInbound();
});

describe('inbound bridge', () => {
  it('takes a stashed intent exactly once', () => {
    setInbound({ kind: 'focus' });
    expect(takeInbound()).toEqual({ kind: 'focus' });
    expect(takeInbound()).toBeNull();
  });

  it('keeps only the latest intent (last wins)', () => {
    setInbound({ kind: 'dump' });
    setInbound({ kind: 'capture', text: 'buy milk' });
    expect(takeInbound()).toEqual({ kind: 'capture', text: 'buy milk' });
  });

  it('notifies a subscriber on arrival and stops after unsubscribe', () => {
    const fn = vi.fn();
    const off = subscribeInbound(fn);
    setInbound({ kind: 'focus' });
    expect(fn).toHaveBeenCalledTimes(1);
    off();
    setInbound({ kind: 'dump' });
    expect(fn).toHaveBeenCalledTimes(1); // no further calls after unsubscribe
  });

  it('fires a new subscriber immediately for an intent that arrived first', () => {
    setInbound({ kind: 'dump' });
    const fn = vi.fn();
    const off = subscribeInbound(fn);
    expect(fn).toHaveBeenCalledTimes(1);
    off();
  });
});
