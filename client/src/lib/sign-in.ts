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
export type VerifyFailure = 'offline' | 'rateLimited' | 'codeRefused' | 'unexplained';

/**
 * Read a `verifyOtp` failure. Until 2026-11-01 every failure said "That code did not work", so a good code on a
 * dropped connection sent people off to doubt it and ask for another.
 *
 * - `offline`: auth-js wraps every fetch that never got an answer as an AuthRetryableFetchError with status 0,
 *   on the web and on the phones alike, so this needs no navigator check (which the phones cannot make).
 * - `rateLimited`: a 429, "you just asked".
 * - `codeRefused`: the server read the code and said no. Only an AuthApiError with a 4xx status means that.
 * - `unexplained`: everything else, chiefly a server error, or a browser that blocks saving (the server took the
 *   code and the session could not be kept). Neither is the code's fault.
 */
export function verifyFailure(e: unknown): VerifyFailure {
  if (isAuthRetryableFetchError(e) && e.status === 0) return 'offline';
  if (isRateLimit(e)) return 'rateLimited';
  if (isAuthApiError(e) && e.status >= 400 && e.status < 500) return 'codeRefused';
  return 'unexplained';
}

const VERIFY_FAILURE_KEY: Record<VerifyFailure, string> = {
  offline: 'common.offlineLine',
  rateLimited: 'signIn.rateLimited',
  codeRefused: 'signIn.codeInvalid',
  // No line in all five languages yet tells a server error or blocked storage honestly, so today's line stands
  // until the copy batch adds one. That new key replaces this entry, and nothing else has to change.
  unexplained: 'signIn.codeInvalid',
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
