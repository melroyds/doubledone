// A one-shot bridge for inbound launch intents (a launcher quick-action shortcut today,
// shared text next), captured at the app root and consumed once by the Today screen.
// Module-level and synchronous so the root can stash an intent before Today mounts;
// Today drains it on mount (for a cold launch) and subscribes for any that arrive while
// it is already open. A native concept; inert on web, where the sources never fire.

export type Inbound =
  | { kind: 'dump' } // open the capture box, ready to type
  | { kind: 'focus' } // open Focus mode
  | { kind: 'capture'; text: string }; // prefill the capture box with shared text

let pending: Inbound | null = null;
const listeners = new Set<() => void>();

/** Stash an inbound intent and notify any subscriber. Last one wins. */
export function setInbound(intent: Inbound): void {
  pending = intent;
  listeners.forEach((l) => l());
}

/** Take the pending intent, clearing it, so it is acted on exactly once. */
export function takeInbound(): Inbound | null {
  const intent = pending;
  pending = null;
  return intent;
}

/** Subscribe to inbound arrivals; returns an unsubscribe. */
export function subscribeInbound(listener: () => void): () => void {
  listeners.add(listener);
  // Fire immediately for an intent that arrived before this listener subscribed (a cold
  // launch via shortcut, where the root stashes the intent before Today mounts).
  if (pending) listener();
  return () => {
    listeners.delete(listener);
  };
}
