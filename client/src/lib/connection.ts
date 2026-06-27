// Offline awareness for the network-dependent (AI) seams. On a flaky connection the generic "try again"
// invites the retry-into-overwhelm spiral the product exists to prevent: a user taps Break-it-down, waits,
// gets "try again", taps again, with no signal that retrying is futile until they reconnect. When we can
// positively tell the device is offline we say so plainly and reassure that nothing is lost.
//
// Web reads navigator.onLine. On native, navigator.onLine is undefined, so isOffline returns false and the
// caller's own specific message is kept (a proper NetInfo check is a deferred add, see the BUILD-PLAN backlog).

const OFFLINE_LINE = 'You seem to be offline. This needs a connection, your tasks are safe here meanwhile.';

/** True only when we can positively tell the device is offline (web). Unknown (native) returns false. */
export function isOffline(): boolean {
  return typeof navigator !== 'undefined' && 'onLine' in navigator && navigator.onLine === false;
}

/**
 * The message to show when a network / AI action fails: the calm offline line when the device is offline,
 * otherwise the caller's own specific fallback. One helper so every AI seam degrades the same calm way.
 * `offline` is injectable so the choice is unit-testable without touching the global navigator.
 */
export function aiErrorLine(fallback: string, offline: boolean = isOffline()): string {
  return offline ? OFFLINE_LINE : fallback;
}
