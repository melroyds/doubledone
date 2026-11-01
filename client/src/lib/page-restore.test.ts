import { describe, expect, it, vi } from 'vitest';

import { onPageRestored } from './page-restore';

// A pageshow as a browser fires it: `persisted` is true only when the page came back from the back-forward cache.
const pageshow = (persisted: boolean) => Object.assign(new Event('pageshow'), { persisted });

// Back from Stripe's page can bring ours back frozen as it was left, with Go Premium stuck on "Opening checkout…"
// (the 1 Nov bug sweep, #19). This is the signal the Premium screen settles on.
describe('onPageRestored (Back brings the page out of the back-forward cache)', () => {
  it('runs when the page comes back from the back-forward cache', () => {
    const page = new EventTarget();
    const settle = vi.fn();
    onPageRestored(page, settle);
    page.dispatchEvent(pageshow(true));
    expect(settle).toHaveBeenCalledTimes(1);
  });

  it('stays quiet on an ordinary load, which starts fresh anyway, and on leaving', () => {
    const page = new EventTarget();
    const settle = vi.fn();
    onPageRestored(page, settle);
    page.dispatchEvent(pageshow(false));
    page.dispatchEvent(new Event('pageshow')); // a browser that never says
    page.dispatchEvent(Object.assign(new Event('pagehide'), { persisted: true })); // going into the cache, not out
    expect(settle).not.toHaveBeenCalled();
  });

  it('runs on every return, and never once the screen has gone', () => {
    const page = new EventTarget();
    const settle = vi.fn();
    const stop = onPageRestored(page, settle);
    page.dispatchEvent(pageshow(true));
    page.dispatchEvent(pageshow(true));
    stop();
    page.dispatchEvent(pageshow(true));
    expect(settle).toHaveBeenCalledTimes(2);
  });

  it('does nothing on a phone, where there is no page to listen to', () => {
    const settle = vi.fn();
    expect(() => onPageRestored(undefined, settle)()).not.toThrow();
    expect(() => onPageRestored(null, settle)()).not.toThrow();
    // React Native's `window` is its global object, which has no addEventListener
    expect(() => onPageRestored({} as EventTarget, settle)()).not.toThrow();
    expect(settle).not.toHaveBeenCalled();
  });
});
