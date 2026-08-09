import { Platform } from 'react-native';

import { updateStatus, type UpdateStatus } from './updates';

// The impure half of "is there a newer DoubleDone": the one fetch, and the platform read.
// The rules live in updates.ts, which stays pure and fully tested; this file is the seam.
//
// Everything here fails QUIET. A build that cannot reach the server is not a build that should
// start telling its user things, and the worst acceptable outcome is "we could not tell", never a
// spinner, an error line, or a crash on a screen somebody opened to write down one thing.

const AI_URL = process.env.EXPO_PUBLIC_AI_URL ?? 'https://api.doubledone.app';

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
 * Ask the Worker what the newest shipped version is, and turn it into what this build should say.
 *
 * NULL means "we could not tell", and it is deliberately distinct from a status saying you are
 * current. Collapsing the two made Settings answer "Up to date" to a request that never arrived,
 * which is a small lie told confidently, and confidence is exactly the thing it has no right to
 * here. A failure, a malformed reply, an absent value and an unreachable Worker all answer null,
 * and every caller renders nothing at all for it.
 */
export async function checkForUpdate(currentVersion: string): Promise<UpdateStatus | null> {
  const platform = currentPlatform();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const res = await fetch(`${AI_URL}/version`, { signal: controller.signal });
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
