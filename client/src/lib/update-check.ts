import { Platform } from 'react-native';

import { updateStatus, type UpdateStatus } from './updates';

// The impure half of "is there a newer DoubleDone": the one fetch, and the platform read.
// The rules live in updates.ts, which stays pure and fully tested; this file is the seam.
//
// It reads a STATIC FILE, not a Worker route, and that was a deliberate reversal (build plan,
// 2026-08-09). A Worker route means a hand-maintained number in a dashboard nobody otherwise
// visits, and a web version that goes stale the first time somebody forgets to bump it, which
// would tell every web user forever that a newer version is ready while reloading changed nothing.
// The static file is written by the same push that deploys the web, with `web` stamped from
// app.json at build (scripts/stamp-version.mjs) so it cannot be wrong, and it is cached at the
// edge with no Worker involved at all.
//
// Everything here fails QUIET. A build that cannot reach the file is not a build that should start
// telling its user things, and the worst acceptable outcome is "we could not tell", never a
// spinner, an error line, or a crash on a screen somebody opened to write down one thing.

/**
 * Absolute, and the same URL on every platform. On web it is same-origin; on a device there is no
 * origin to be relative to, so a relative path would silently resolve to nothing.
 */
const VERSION_URL = 'https://doubledone.app/version.json';

/** Two and a half seconds, then give up. Nobody is waiting for this and nothing depends on it. */
const TIMEOUT_MS = 2_500;

export type Platform3 = 'web' | 'ios' | 'android';

/** Which platform's newest version to ask about. Anything exotic reads as web, which is the one
 *  that can genuinely update itself and therefore the safest default. */
export function currentPlatform(): Platform3 {
  if (Platform.OS === 'ios') return 'ios';
  if (Platform.OS === 'android') return 'android';
  return 'web';
}

/**
 * What this build should say about being out of date, or NULL for "we could not tell".
 *
 * Null is deliberately distinct from a status saying you are current. Collapsing the two made
 * Settings answer "Up to date" to a request that never arrived, which is a small lie told
 * confidently, and confidence is exactly the thing it has no right to here.
 *
 * A failure, a timeout, a malformed reply and an absent value all answer null. So does the SPA
 * fallback: `client/public/_redirects` sends `/*` to index.html, so if Pages ever served the app's
 * HTML for this path instead of the file, `res.json()` throws and this returns null rather than
 * comparing a version against a page of markup.
 */
export async function checkForUpdate(currentVersion: string): Promise<UpdateStatus | null> {
  const platform = currentPlatform();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const res = await fetch(VERSION_URL, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const body: unknown = await res.json();
    if (typeof body !== 'object' || body === null) return null;
    const latest = (body as Record<string, unknown>)[platform];
    if (typeof latest !== 'string' || !latest) return null;
    return updateStatus(currentVersion, latest, platform);
  } catch {
    return null;
  }
}
