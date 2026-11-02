// The time zone an account keeps for a connected AI assistant (#24, 2026-11-02). An agent's "today" used to be the
// UTC day, so a Melbourne morning was still yesterday to it. The Worker now reads the day from the device's IANA
// time-zone name, which the account keeps in Supabase user_metadata.tz and Supabase puts in every access token.
//
// Kept ONLY for a person who connects an assistant: tapping Copy my token ('connect' here), or Allow on a connector's
// sign-in page (the Worker writes it there). Once a zone exists, the app keeps it current ('refresh', on Today's
// focus and a warm resume), and a refresh never creates one. Disconnect AI connectors clears it (forgetZone), and
// deleting the account removes it with the account. The privacy pages say exactly this.
//
// Pure decision plus a network seam that takes supabase.auth, so it is node-testable. The device's zone is read in
// lib/locale.ts (expo-localization), never from Intl's resolvedOptions in shared code: Hermes' Intl is not to be
// trusted (the CLAUDE.md gotcha).

import type { Session } from '@supabase/supabase-js';

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

/** The zone an account keeps (user_metadata.tz), or null. */
export function storedZone(session: Pick<Session, 'user'> | null | undefined): string | null {
  const tz = (session?.user?.user_metadata as { tz?: unknown } | undefined)?.tz;
  return typeof tz === 'string' && tz.length > 0 ? tz : null;
}

export type ZoneReason = 'connect' | 'refresh';

/**
 * The zone to write, or null for no write. 'connect' writes when signed in and the device's zone is valid and
 * differs from the stored one. 'refresh' writes ONLY when a zone is already stored and differs: it never creates one,
 * because an account that never connected an assistant never keeps a zone.
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
  refreshSession(): Promise<{ data: { session: Session | null } }>;
  updateUser(attributes: { data: { tz: string | null } }): Promise<{ error: unknown }>;
};

/** Write the zone the decision asks for, then refresh, because the zone reaches the NEXT access token, not the one
 *  in hand (updateUser only swaps session.user). Returns the session to use next: the refreshed one when both
 *  landed, else the one it was given. Never throws. */
async function writeZone(auth: ZoneAuth, session: Session, tz: string): Promise<Session> {
  try {
    const { error } = await auth.updateUser({ data: { tz } });
    if (error) return session;
    return (await auth.refreshSession()).data.session ?? session;
  } catch {
    return session;
  }
}

/** Today's 'refresh': keep a zone the account already has in step with this device (after a flight, say). Writes
 *  nothing for an account that keeps none, and makes no network call when nothing changed. Never throws. */
export async function keepZoneCurrent(auth: ZoneAuth, device: unknown): Promise<void> {
  try {
    const session = (await auth.getSession()).data.session;
    if (!session) return;
    const tz = decideZone('refresh', { signedIn: true, stored: storedZone(session), device });
    if (tz) await writeZone(auth, session, tz);
  } catch {
    // best effort: the next open tries again
  }
}

/**
 * Copy my token's 'connect': keep this device's zone on the account first, then hand back the fresh access token,
 * which carries it. Waits at most `waitMs`, then hands back the token it started with, so the copy is never stuck
 * (that token works, on the UTC day, until it expires within the hour). Null when signed out or the session cannot
 * be read, the same as before.
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
  const tz = decideZone('connect', { signedIn: true, stored: storedZone(session), device });
  if (!tz) return start; // already kept: no network, the copy is instant
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<string>((resolve) => {
    timer = setTimeout(() => resolve(start), waitMs);
  });
  try {
    return await Promise.race([writeZone(auth, session, tz).then((s) => s.access_token || start), late]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** After Disconnect AI connectors: the Worker clears the zone, so refresh to make this device's view match. If the
 *  account still keeps one (the Worker's clear did not land), clear it from here. Never throws. */
export async function forgetZone(auth: ZoneAuth): Promise<void> {
  try {
    const session = (await auth.refreshSession()).data.session;
    if (storedZone(session) === null) return;
    await auth.updateUser({ data: { tz: null } });
  } catch {
    // best effort: the privacy promise is backed by the Worker's own clear
  }
}
