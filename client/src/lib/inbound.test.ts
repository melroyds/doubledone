import { afterEach, describe, expect, it, vi } from 'vitest';

import { cleanSharedText, setInbound, shareTextFromParams, subscribeInbound, takeInbound } from './inbound';

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

describe('cleanSharedText (one calm line: words kept, link noise dropped)', () => {
  it("keeps the words and drops the link from a browser's quoted-selection share", () => {
    const chrome = '"Project Hail Mary"\n https://en.wikipedia.org/wiki/Project_Hail_Mary_(film)#:~:text=Edit-,Project%20Hail%20Mary,-is%20a%202026';
    expect(cleanSharedText(chrome)).toBe('Project Hail Mary');
  });
  it('collapses a multiline share into one line', () => {
    expect(cleanSharedText('Buy oat milk\non the way home')).toBe('Buy oat milk on the way home');
  });
  it('keeps a bare link, with the #:~:text= highlight fragment stripped', () => {
    expect(cleanSharedText('https://example.com/a#:~:text=some%20highlight')).toBe('https://example.com/a');
    expect(cleanSharedText('https://example.com/plain')).toBe('https://example.com/plain');
  });
  it('returns null for empty or whitespace', () => {
    expect(cleanSharedText('')).toBeNull();
    expect(cleanSharedText('   ')).toBeNull();
    expect(cleanSharedText(null)).toBeNull();
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
