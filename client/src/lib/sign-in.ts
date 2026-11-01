import { isAuthApiError, isAuthRetryableFetchError } from '@supabase/supabase-js';

// The sign-in screen's two decisions that are worth a test, kept out of the screen so node can run them
// (bug sweep 2026-11-01, #10 and #20). Pure: no React, no expo-router, no network.

/**
 * A send or verify failure that is really "you just asked" (a 429, or a "wait N seconds" message), told apart so a
 * user whose correct address or code was fine is never told to doubt it. Moved here from the screen unchanged:
 * the send path reads it exactly as before.
 */
export function isRateLimit(e: unknown): boolean {
  const err = e as { status?: number; message?: string } | null;
  return err?.status === 429 || /rate|too many|seconds|security purposes/i.test(err?.message ?? '');
}

/** Why a typed code did not sign you in, as far as the error can honestly tell. */
export type VerifyFailure = 'offline' | 'storageBlocked' | 'rateLimited' | 'codeRefused' | 'unexplained';

/**
 * A browser refusing to let the app save, which is what a session save meets with site data blocked: a
 * SecurityError, or a QuotaExceededError (Safari's old private mode). Read by NAME, never `instanceof`, because
 * Hermes has no DOMException, and only a browser throws these on a save anyway.
 */
function isStorageBlocked(e: unknown): boolean {
  const name = (e as { name?: unknown } | null | undefined)?.name;
  return name === 'SecurityError' || name === 'QuotaExceededError';
}

/**
 * Read a `verifyOtp` failure. Until 2026-11-01 every failure said "That code did not work", so a good code on a
 * dropped connection sent people off to doubt it and ask for another.
 *
 * - `offline`: auth-js wraps every fetch that never got an answer as an AuthRetryableFetchError with status 0,
 *   on the web and on the phones alike, so this needs no navigator check (which the phones cannot make).
 * - `storageBlocked`: the browser would not let the session be saved. The server took the code, so it is spent,
 *   but it was not the code's fault, and the fix is a browser setting, not a retry.
 * - `rateLimited`: a 429, "you just asked".
 * - `codeRefused`: the server read the code and said no. Only an AuthApiError with a 4xx status means that.
 * - `unexplained`: everything else, chiefly a server error. Not the code's fault either.
 */
export function verifyFailure(e: unknown): VerifyFailure {
  if (isAuthRetryableFetchError(e) && e.status === 0) return 'offline';
  if (isStorageBlocked(e)) return 'storageBlocked';
  if (isRateLimit(e)) return 'rateLimited';
  if (isAuthApiError(e) && e.status >= 400 && e.status < 500) return 'codeRefused';
  return 'unexplained';
}

// Two lines rather than one for the two readings that are not the code's fault: only a browser can block saving, so
// a line naming the browser would be wrong on a phone, and a line without it would send a blocked browser round a
// retry loop on a reassuring sentence.
const VERIFY_FAILURE_KEY: Record<VerifyFailure, string> = {
  offline: 'common.offlineLine',
  storageBlocked: 'signIn.storageBlocked',
  rateLimited: 'signIn.rateLimited',
  codeRefused: 'signIn.codeInvalid',
  unexplained: 'signIn.codeNotChecked',
};

/** The catalogue key the screen shows for a reading. */
export function verifyFailureKey(failure: VerifyFailure): string {
  return VERIFY_FAILURE_KEY[failure];
}

/** The three router calls leaving needs: expo-router's own `router` satisfies it, and a test can fake it. */
export type SignInExit = {
  canGoBack(): boolean;
  back(): void;
  replace(href: '/note' | '/today'): void;
};

/**
 * Leave sign-in: back to whichever screen opened it, as before. When there is nothing to go back to (a reload on
 * /sign-in, a deep link, a home-screen web app that opened there), `router.back()` is a silent no-op, which left
 * "Not now", "Back to Today" and the timed return all dead, with no browser Back to fall back on. Then go where
 * the screen's own words say it is taking you: the note, or Today.
 */
export function leaveSignIn(router: SignInExit, toNote: boolean): void {
  if (router.canGoBack()) router.back();
  else router.replace(toNote ? '/note' : '/today');
}
