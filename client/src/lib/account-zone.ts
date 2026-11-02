// The time zone an account keeps for a connected AI assistant (#24, 2026-11-02). An agent's "today" used to be the
// UTC day, so a Melbourne morning was still yesterday to it. The Worker now reads the day from the device's IANA
// time-zone name, which the account keeps in Supabase user_metadata.tz and Supabase puts in every access token.
//
// Kept ONLY for a person who connects an assistant: tapping Copy my token ('connect' here), or Allow on a connector's
// sign-in page (the Worker writes it there). Once a zone exists, the app keeps it current ('refresh', on Today's
// focus and a warm resume). A refresh writes only when the ACCOUNT still keeps a zone, asked of the server rather
// than read from this device's copy, which can be an hour old: a second signed-in device would otherwise write back
// a zone that Disconnect on another device had just cleared. Disconnect AI connectors clears it (the Worker, and
// forgetZone here as well), and deleting the account removes it with the account. The privacy pages say exactly this.
//
// Pure decision plus a network seam that takes supabase.auth, so it is node-testable. The device's zone is read in
// lib/locale.ts (expo-localization), never from Intl's resolvedOptions in shared code: Hermes' Intl is not to be
// trusted (the CLAUDE.md gotcha).

import type { Session, User } from '@supabase/supabase-js';

/** The shape the Worker accepts before it asks Intl (server/src/zone.ts validZone), kept identical: at most 64
 *  characters of the tz database's own set. Android can rarely give 'GMT+11:00', which this refuses, so the app never
 *  writes a zone the Worker would throw away. The Worker's Intl check stays the final word. */
const ZONE_MAX = 64;
const ZONE_SHAPE = /^[A-Za-z0-9_+\-/]+$/;

/** How long Copy my token waits for the zone to be kept before it copies the token it already has. */
export const TOKEN_WAIT_MS = 3000;

/** The device's zone if it has the shape the Worker accepts, else null. */
export function validZone(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 && v.length <= ZONE_MAX && ZONE_SHAPE.test(v) ? v : null;
}

/** The zone a user record keeps (user_metadata.tz), or null. */
function userZone(user: Pick<User, 'user_metadata'> | null | undefined): string | null {
  const tz = (user?.user_metadata as { tz?: unknown } | undefined)?.tz;
  return typeof tz === 'string' && tz.length > 0 ? tz : null;
}

/** The zone an account keeps as this device last heard it (the session's user_metadata.tz), or null. */
export function storedZone(session: Pick<Session, 'user'> | null | undefined): string | null {
  return userZone(session?.user);
}

const BASE64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** A base64url segment as a string of bytes, one character per byte, or null. Pure, because this repo does not lean
 *  on atob without feature detection (Hermes). */
function bytesOf(segment: string): string | null {
  let out = '';
  let acc = 0;
  let bits = 0;
  for (let i = 0; i < segment.length; i++) {
    const c = segment[i];
    if (c === '=') break;
    const v = BASE64URL.indexOf(c === '+' ? '-' : c === '/' ? '_' : c);
    if (v < 0) return null;
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out += String.fromCharCode((acc >> bits) & 0xff);
      acc &= (1 << bits) - 1;
    }
  }
  return out;
}

/** The zone inside an access token's own claims (user_metadata.tz), or null: what an assistant handed this token
 *  will see. Decode-only, to know what a copy carries, never to decide who anyone is. Read byte for byte, which keeps
 *  the JSON's structure whatever the other claims hold, and a zone name is plain ASCII. */
export function tokenZone(token: string | null | undefined): string | null {
  if (typeof token !== 'string') return null;
  const payload = token.split('.')[1];
  if (!payload) return null;
  const raw = bytesOf(payload);
  if (raw === null) return null;
  try {
    const tz = (JSON.parse(raw) as { user_metadata?: { tz?: unknown } | null } | null)?.user_metadata?.tz;
    return typeof tz === 'string' && tz.length > 0 ? tz : null;
  } catch {
    return null;
  }
}

export type ZoneReason = 'connect' | 'refresh';

/**
 * The zone to write, or null for no write. 'connect' writes when signed in and the device's zone is valid and
 * differs from the stored one. 'refresh' writes ONLY when a zone is already stored and differs: it never creates one,
 * because an account that never connected an assistant never keeps a zone. Which "stored" a refresh may trust is the
 * caller's: keepZoneCurrent asks the account itself before it writes.
 */
export function decideZone(reason: ZoneReason, s: { signedIn: boolean; stored: string | null; device: unknown }): string | null {
  const device = validZone(s.device);
  if (!s.signedIn || !device || device === s.stored) return null;
  if (reason === 'refresh' && s.stored === null) return null;
  return device;
}

/** The slice of supabase.auth this module uses. The real client fits it, and the tests hand it a fake. */
export type ZoneAuth = {
  getSession(): Promise<{ data: { session: Session | null } }>;
  /** The account as the server holds it now (one GET), not this device's copy. */
  getUser(): Promise<{ data: { user: User | null }; error?: unknown }>;
  refreshSession(): Promise<{ data: { session: Session | null } }>;
  updateUser(attributes: { data: { tz: string | null } }): Promise<{ error: unknown }>;
};

/** Keep `tz` on the account when `write` (skipped when the account already keeps it and only the token is behind),
 *  then refresh, because the zone reaches the NEXT access token, not the one in hand (updateUser only swaps
 *  session.user). The refreshed session, or null when either step failed. Never throws. */
async function keepThenRefresh(auth: ZoneAuth, tz: string, write: boolean): Promise<Session | null> {
  try {
    if (write) {
      const { error } = await auth.updateUser({ data: { tz } });
      if (error) return null;
    }
    return (await auth.refreshSession()).data.session;
  } catch {
    return null;
  }
}

/** Today's 'refresh': keep a zone the account already has in step with this device (after a flight, say). Writes
 *  nothing for an account that keeps none, and makes no network call when this device's copy shows nothing changed.
 *  When the copy says a write is due, it asks the account first (one GET, only then) and writes only if the account's
 *  own answer still says so: the copy can be an hour old, and another device may have disconnected the assistants
 *  since, which clears the zone. Never throws. */
export async function keepZoneCurrent(auth: ZoneAuth, device: unknown): Promise<void> {
  try {
    const session = (await auth.getSession()).data.session;
    if (!session) return;
    if (!decideZone('refresh', { signedIn: true, stored: storedZone(session), device })) return;
    const { data, error } = await auth.getUser();
    if (error || !data.user) return; // the account could not be asked: write nothing, the next open asks again
    const tz = decideZone('refresh', { signedIn: true, stored: userZone(data.user), device });
    if (tz) await keepThenRefresh(auth, tz, true);
  } catch {
    // best effort: the next open tries again
  }
}

/**
 * Copy my token's 'connect': keep this device's zone on the account first, then hand back the fresh access token,
 * which carries it. Decided against the token about to be handed over as well as the account: a refresh that failed
 * after the zone was kept leaves the account with the zone and the token without it, and the token is what the
 * assistant reads. Then only a refresh is needed, never a second write. Waits at most `waitMs`, then hands back the
 * token it started with, so the copy is never stuck (that token works, on the UTC day, until it expires within the
 * hour). Null when signed out or the session cannot be read, the same as before.
 */
export async function tokenForAssistant(auth: ZoneAuth, device: unknown, waitMs = TOKEN_WAIT_MS): Promise<string | null> {
  let session: Session | null;
  try {
    session = (await auth.getSession()).data.session;
  } catch {
    return null;
  }
  if (!session) return null;
  const start = session.access_token;
  const tz = validZone(device);
  if (!tz) return start; // nothing to keep: no network, the copy is instant
  const write = decideZone('connect', { signedIn: true, stored: storedZone(session), device: tz }) !== null;
  if (!write && tokenZone(start) === tz) return start; // the token already carries it: no network, the copy is instant
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<string>((resolve) => {
    timer = setTimeout(() => resolve(start), waitMs);
  });
  try {
    return await Promise.race([keepThenRefresh(auth, tz, write).then((s) => s?.access_token || start), late]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** After Disconnect AI connectors succeeds: clear the zone from here as well, every time. The Worker clears it too,
 *  so this is idempotent, and it covers a Worker clear that did not land. updateUser also swaps this device's copy of
 *  the account (session.user), so Today's refresh stops seeing the old zone without a session refresh. Never throws. */
export async function forgetZone(auth: ZoneAuth): Promise<void> {
  try {
    await auth.updateUser({ data: { tz: null } });
  } catch {
    // best effort: the Worker's own clear backs the privacy promise, and Today's refresh asks the account before it
    // writes, so another device's old copy cannot bring the zone back
  }
}
