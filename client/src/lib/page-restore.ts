// A browser's back-forward cache can bring a page back exactly as it was left, its JavaScript state and all, when
// someone presses Back from a page we sent them to: Stripe's Checkout and its billing portal. Nothing in the app runs
// again (no mount, no focus), so a button left busy while the page navigated away stays busy, reading "Opening
// checkout…" and doing nothing (the 1 Nov bug sweep, #19; Safari restores pages this way most often). A `pageshow`
// with `persisted` true is the one signal that it happened. An ordinary load starts fresh and needs nothing.
//
// Web only. A phone has no such cache, so pass no target there. React Native's `window` has no addEventListener,
// and that is refused too, so a stray native call is a no-op rather than a crash.

/** Call `fn` each time the page is shown again from the back-forward cache. Returns the unsubscribe. */
export function onPageRestored(target: EventTarget | null | undefined, fn: () => void): () => void {
  if (!target || typeof target.addEventListener !== 'function') return () => {};
  const listener = (e: Event) => {
    if ((e as PageTransitionEvent).persisted === true) fn();
  };
  target.addEventListener('pageshow', listener);
  return () => target.removeEventListener('pageshow', listener);
}
