import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import { SUPPORTED, translate } from './i18n';
import { isRateLimit, leaveSignIn, type SignInExit, verifyFailure, verifyFailureKey } from './sign-in';

// The sign-in screen's two decisions (bug sweep 2026-11-01, #10 and #20). Every error below is built from the
// real auth-js classes, the shapes `verifyOtp` actually returns: a fetch that never got an answer becomes an
// AuthRetryableFetchError with status 0, a 5xx stays retryable with its own status, and a 4xx with a body
// becomes an AuthApiError. A storage failure while saving the session is not an auth error at all.

describe('verifyFailure: only the server refusing the code blames the code', () => {
  it('a dropped connection is the connection, on the web and on the phones', () => {
    // Chrome, Safari and React Native each word a failed fetch differently; auth-js wraps them all the same way.
    for (const message of ['Failed to fetch', 'Load failed', 'Network request failed']) {
      expect(verifyFailure(new AuthRetryableFetchError(message, 0))).toBe('offline');
    }
  });

  it('a dropped connection stays the connection even when its message sounds like a wait', () => {
    expect(verifyFailure(new AuthRetryableFetchError('The request timed out after 30 seconds', 0))).toBe('offline');
  });

  it('a 429 is "you just asked", by status or by the provider\'s words', () => {
    expect(verifyFailure(new AuthApiError('Request rate limit reached', 429, 'over_request_rate_limit'))).toBe('rateLimited');
    expect(verifyFailure(new AuthApiError('Too many requests', 429, undefined))).toBe('rateLimited');
    expect(
      verifyFailure(new AuthApiError('For security purposes, you can only request this after 20 seconds.', 429, 'over_email_send_rate_limit')),
    ).toBe('rateLimited');
  });

  it('a wrong or expired code, refused by the server, is the code', () => {
    expect(verifyFailure(new AuthApiError('Token has expired or is invalid', 403, 'otp_expired'))).toBe('codeRefused');
    expect(verifyFailure(new AuthApiError('Verify requires a token or a token hash', 400, 'validation_failed'))).toBe('codeRefused');
  });

  it('a server error is never read as a refused code', () => {
    expect(verifyFailure(new AuthRetryableFetchError('Bad gateway', 502))).toBe('unexplained');
    expect(verifyFailure(new AuthRetryableFetchError('', 500))).toBe('unexplained');
    // A 5xx that auth-js does not count as retryable still arrives as an AuthApiError, and is still not a 4xx.
    expect(verifyFailure(new AuthApiError('Database error', 507, 'unexpected_failure'))).toBe('unexplained');
  });

  it('a browser that blocks saving is not the code: the server took it, the session could not be kept', () => {
    expect(verifyFailure(new DOMException('The operation is insecure.', 'SecurityError'))).toBe('unexplained');
    expect(
      verifyFailure(new Error("Failed to read the 'localStorage' property from 'Window': Access is denied for this document.")),
    ).toBe('unexplained');
  });

  it('an error that only looks like a dropped fetch is not taken for one', () => {
    // The guard reads auth-js's own marker, so a bare status 0 from somewhere else proves nothing.
    expect(verifyFailure({ status: 0, message: 'nope' })).toBe('unexplained');
  });

  it('anything else thrown never crashes the reading', () => {
    expect(verifyFailure(undefined)).toBe('unexplained');
    expect(verifyFailure(null)).toBe('unexplained');
    expect(verifyFailure('boom')).toBe('unexplained');
  });
});

describe('verifyFailureKey: the line each reading shows', () => {
  it('maps each reading to its line', () => {
    expect(verifyFailureKey('offline')).toBe('common.offlineLine');
    expect(verifyFailureKey('rateLimited')).toBe('signIn.rateLimited');
    expect(verifyFailureKey('codeRefused')).toBe('signIn.codeInvalid');
  });

  it('a dropped connection and a rate limit never say the code did not work', () => {
    expect(verifyFailureKey('offline')).not.toBe('signIn.codeInvalid');
    expect(verifyFailureKey('rateLimited')).not.toBe('signIn.codeInvalid');
  });

  it('a server error or blocked storage keeps the old line until the copy batch adds an honest one', () => {
    // Pinned on purpose: when the new signIn line lands, this expectation is the one place that changes.
    expect(verifyFailureKey('unexplained')).toBe('signIn.codeInvalid');
  });

  it('every line it can show exists in all five languages, in that language', () => {
    for (const failure of ['offline', 'rateLimited', 'codeRefused', 'unexplained'] as const) {
      const key = verifyFailureKey(failure);
      const english = translate('en', key);
      expect(english, key).not.toBe(key);
      for (const loc of SUPPORTED) {
        if (loc === 'en') continue;
        // Not the key (missing everywhere) and not the English fallback (missing in this catalogue).
        expect(translate(loc, key), `${loc} ${key}`).not.toBe(key);
        expect(translate(loc, key), `${loc} ${key}`).not.toBe(english);
      }
    }
  });

  it('a good code on a dropped connection hears it is offline, not that the code failed', () => {
    const line = translate('en', verifyFailureKey(verifyFailure(new AuthRetryableFetchError('Failed to fetch', 0))));
    expect(line).toContain('offline');
    expect(line).not.toContain('did not work');
  });
});

describe('isRateLimit: unchanged by the move out of the screen (the send path still reads it)', () => {
  it('reads a 429 or the provider\'s wait words', () => {
    expect(isRateLimit({ status: 429 })).toBe(true);
    expect(isRateLimit({ status: 400, message: 'For security purposes, you can only request this after 37 seconds.' })).toBe(true);
    expect(isRateLimit({ message: 'Email rate limit exceeded' })).toBe(true);
    expect(isRateLimit({ message: 'Too many requests' })).toBe(true);
  });

  it('leaves everything else alone', () => {
    expect(isRateLimit({ status: 400, message: 'Unable to validate email address: invalid format' })).toBe(false);
    expect(isRateLimit(new AuthApiError('Token has expired or is invalid', 403, 'otp_expired'))).toBe(false);
    expect(isRateLimit(null)).toBe(false);
    expect(isRateLimit(undefined)).toBe(false);
  });
});

describe('leaveSignIn: there is always a way out', () => {
  function fakeRouter(canGoBack: boolean): SignInExit & { calls: string[] } {
    const calls: string[] = [];
    return {
      calls,
      canGoBack: () => canGoBack,
      back: () => {
        calls.push('back');
      },
      replace: (href) => {
        calls.push(`replace ${href}`);
      },
    };
  }

  it('goes back to whoever opened it, as before', () => {
    for (const toNote of [false, true]) {
      const router = fakeRouter(true);
      leaveSignIn(router, toNote);
      expect(router.calls).toEqual(['back']);
    }
  });

  it('after a reload, with nothing beneath, goes to Today, as the screen says it will', () => {
    const router = fakeRouter(false);
    leaveSignIn(router, false);
    expect(router.calls).toEqual(['replace /today']);
  });

  it('after a reload from the note, goes back to the note', () => {
    const router = fakeRouter(false);
    leaveSignIn(router, true);
    expect(router.calls).toEqual(['replace /note']);
  });

  it('never calls a back that has nowhere to go (the silent no-op that trapped a home-screen web app)', () => {
    for (const toNote of [false, true]) {
      const router = fakeRouter(false);
      leaveSignIn(router, toNote);
      expect(router.calls).not.toContain('back');
      expect(router.calls).toHaveLength(1);
    }
  });
});
