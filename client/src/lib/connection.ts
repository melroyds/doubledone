// Offline awareness for the network-dependent (AI) seams. On a flaky connection the generic "try again"
// invites the retry-into-overwhelm spiral the product exists to prevent: a user taps Break-it-down, waits,
// gets "try again", taps again, with no signal that retrying is futile until they reconnect. When we can
// positively tell the device is offline we say so plainly and reassure that nothing is lost.
//
// Web reads navigator.onLine. On native, navigator.onLine is undefined, so isOffline returns false and the
// caller's own specific message is kept (a proper NetInfo check is a deferred add, see the BUILD-PLAN backlog).

import { t } from './i18n-active';

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
  return offline ? t('common.offlineLine') : fallback;
}

/**
 * Why a Premium AI call (Scan, Chart a course, Plan my day, Reflect on this week) came back without an answer. Each
 * screen used to show one line for every miss, and Chart's said "Try rephrasing the goal?" when the server had
 * refused the request before any AI saw it (2026-11-03, a paying friend's iPhone without an account). Now:
 *  - 'not_confirmed': no proof the server accepts reached it, or it could not verify the one it got (a 401), or the
 *    app had no credential to send at all. Nothing went to the AI.
 *  - 'not_active': the server checked, and Premium is not active for this account or purchase (a 403). Nothing went
 *    to the AI.
 *  - 'unavailable': the server, the store check or the AI could not do it just now (a 429, a 5xx, a timeout, no
 *    network, a reply that was not an answer). The feature's own "try again" line, or the offline line.
 * A real AI answer that is empty is not a miss: the screen keeps its own line for that, and only that line may
 * blame the input ("Try rephrasing the goal?", "couldn't read any tasks").
 */
export type PremiumMiss = 'not_confirmed' | 'not_active' | 'unavailable';

/** The miss a refused or failed HTTP status means (lib/ai premiumCall reads it). */
export function premiumMiss(status: number): PremiumMiss {
  if (status === 401) return 'not_confirmed';
  if (status === 403) return 'not_active';
  return 'unavailable';
}

/**
 * The line a Premium AI miss shows. Only 'unavailable' can be the connection, so only it can become the offline line:
 * a 401 or a 403 came back from the server, so the device was online (and premiumCall reads an offline device with no
 * credential as 'unavailable'). `retryLine` is the feature's own calm "just now, try again" line. `offline` is
 * injectable for the tests, like aiErrorLine.
 */
export function premiumMissLine(miss: PremiumMiss, retryLine: string, offline: boolean = isOffline()): string {
  if (miss === 'not_active') return t('premium.aiNotActive');
  if (miss === 'not_confirmed') return t('premium.aiNotConfirmed');
  return aiErrorLine(retryLine, offline);
}
