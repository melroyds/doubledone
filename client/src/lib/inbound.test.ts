import { afterEach, describe, expect, it, vi } from 'vitest';

import { setInbound, shareTextFromParams, subscribeInbound, takeInbound } from './inbound';

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

describe('shareTextFromParams (the web share_target rule, mirrors native text ?? webUrl)', () => {
  it('text wins over url and title', () => {
    expect(shareTextFromParams({ title: 'An article', text: 'read this', url: 'https://x.example' })).toBe('read this');
  });
  it('falls back to the url, then the title', () => {
    expect(shareTextFromParams({ title: 'An article', url: 'https://x.example' })).toBe('https://x.example');
    expect(shareTextFromParams({ title: 'An article' })).toBe('An article');
  });
  it('returns null when nothing usable was shared (empty or whitespace)', () => {
    expect(shareTextFromParams({})).toBeNull();
    expect(shareTextFromParams({ text: '   ', title: '' })).toBeNull();
  });
  it('takes the first value when a router param arrives as an array', () => {
    expect(shareTextFromParams({ text: ['first', 'second'] })).toBe('first');
    expect(shareTextFromParams({ text: [], url: 'https://x.example' })).toBe('https://x.example');
  });
});
