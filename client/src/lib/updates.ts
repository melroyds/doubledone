// "Is there a newer DoubleDone?" The pure half.
//
// No network, no platform imports, no clock read of its own, so all of it is unit-testable. The
// seam that actually fetches lives with the screen, and the store links live in the map below.
//
// WHY THIS EXISTS, in one line, because it changes what it may do: two people on a shared list can
// be on different app versions, which is the ordinary state rather than an exotic one, and a
// version gap is what makes one of them unable to read a cadence the other set. This SHRINKS that
// window. It does not close it: rollouts are staggered by days, people decline updates, and some
// older Android devices cannot take the newest build at all. The "show, do not hide" handling of an
// unreadable repeat stays the safety net for the window that remains. Both, never either.
//
// AND WHAT IT MAY NOT DO. This is a to-do app for people who are already carrying more demands than
// they can hold, and the standing rule is remove friction, never add a setting. So: a quiet fact,
// never a nag. No badge, no repeated modal, nothing that reads as "you are out of date" to someone
// who opened the app to write down one thing. `shouldMention` below is deliberately hard to satisfy.

/** Where an update actually comes from, per platform. Web updates itself; the stores do not. */
export type UpdateRoute = 'reload' | 'store' | 'none';

export type UpdateStatus = {
  /** A newer version exists than the one running. */
  behind: boolean;
  /** How far behind, in released versions, when that is knowable. Used only to decide whether a
   *  build is old ENOUGH to be worth mentioning outside Settings. */
  majorBehind: boolean;
  route: UpdateRoute;
};

/**
 * Compare two dotted version strings.
 *
 * Deliberately permissive: a malformed or missing part counts as 0 rather than throwing, because
 * this runs on a reply from the network and the worst acceptable outcome is "we could not tell",
 * never a crash on a screen someone opened to write down one thing. Returns a negative number when
 * `a` is older, 0 when they match, positive when `a` is newer.
 */
export function compareVersions(a: string, b: string): number {
  const parts = (v: string) =>
    String(v ?? '')
      .split('.')
      .map((p) => {
        const n = Number.parseInt(p, 10);
        return Number.isFinite(n) ? n : 0;
      });
  const left = parts(a);
  const right = parts(b);
  const len = Math.max(left.length, right.length);
  for (let i = 0; i < len; i += 1) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * What, if anything, this build should say about being out of date.
 *
 * `latest` comes from the server and is not trusted: an absent, malformed or OLDER value all mean
 * "we cannot tell", which resolves to nothing to say. Failing quiet is the whole posture. A build
 * that cannot reach the server is not a build that should start telling its user things.
 */
export function updateStatus(current: string, latest: string | null | undefined, platform: 'web' | 'ios' | 'android'): UpdateStatus {
  const none: UpdateStatus = { behind: false, majorBehind: false, route: 'none' };
  if (!latest || typeof latest !== 'string') return none;
  const diff = compareVersions(current, latest);
  if (diff >= 0) return none;

  // Web can genuinely update itself, by reloading onto assets the server already has. The stores
  // are the only update path on iOS and Android: there is no in-app update API on iOS at all, and
  // Play's needs a native module we do not ship. So the honest offer differs by platform, and the
  // copy must too.
  const route: UpdateRoute = platform === 'web' ? 'reload' : 'store';
  const [cur, lat] = [current, latest].map((v) => Number.parseInt(String(v).split('.')[0] ?? '0', 10) || 0);
  const [curMinor, latMinor] = [current, latest].map((v) => Number.parseInt(String(v).split('.')[1] ?? '0', 10) || 0);
  return { behind: true, majorBehind: lat > cur || latMinor - curMinor >= 2, route };
}

/**
 * Whether to mention it OUTSIDE Settings, where it is always simply true.
 *
 * Three conditions, all required, and they exist to make this rare. Being one patch behind is not
 * worth a person's attention; being two minor versions or a major behind means the other half of a
 * shared list may be reading things this build cannot. `lastMentionedAt` is the honest brake: once a
 * fortnight at most, however far behind, because a message that repeats is a nag no matter how
 * gently it is worded.
 */
export const MENTION_GAP_MS = 14 * 24 * 60 * 60_000;

export function shouldMention(status: UpdateStatus, lastMentionedAt: number | null, now: number): boolean {
  if (!status.behind || !status.majorBehind) return false;
  if (!Number.isFinite(now)) return false;
  if (lastMentionedAt == null) return true;
  if (!Number.isFinite(lastMentionedAt)) return true;
  return now - lastMentionedAt >= MENTION_GAP_MS;
}

/**
 * Where to send someone who wants the update.
 *
 * Melroy, 2026-08-09: point at the respective stores on native. The iOS id is the App Store Connect
 * app id already recorded in CLAUDE.md; the Android id is the package name. Both are public, both
 * are already in the store listings, and neither is a secret.
 */
export const STORE_URLS = {
  ios: 'https://apps.apple.com/app/id6790136615',
  android: 'https://play.google.com/store/apps/details?id=app.doubledone',
} as const;

export function updateUrl(platform: 'web' | 'ios' | 'android'): string | null {
  if (platform === 'ios') return STORE_URLS.ios;
  if (platform === 'android') return STORE_URLS.android;
  return null; // web reloads itself; there is nowhere to send anybody
}
