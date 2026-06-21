// Web Push subscription store (Phase 2 of reminders). Holds a browser's PushSubscription
// plus the user's preferred LOCAL nudge hour and tz offset, so a daily "your today is
// here" nudge can reach the web app (PC + phone) while it is closed. D1 is Worker-bound,
// so there is no public write path. NO user_id and NO task content is stored: just a push
// endpoint and a time. The pure statement builders + scheduling math are the contract
// surface and are unit-tested, mirroring telemetry.ts.
import type { D1LikeDatabase } from './telemetry';
import { sendPush, type VapidJwk } from './webpush';

export type PushEnv = { DB?: D1LikeDatabase };

export type PushSub = {
  endpoint: string;
  p256dh: string;
  auth: string;
  hour: number; // preferred local hour for the daily nudge, 0-23
  tzOffset: number; // minutes from UTC (Date.getTimezoneOffset; positive = behind UTC)
};

/** Validate + normalise an incoming subscribe body `{ subscription, hour, tzOffset }`.
 *  `subscription` is a PushSubscription.toJSON(). Returns null if malformed. */
export function parsePushSub(raw: unknown): PushSub | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const b = raw as Record<string, unknown>;
  const sub = (b.subscription ?? null) as Record<string, unknown> | null;
  const endpoint = typeof sub?.endpoint === 'string' ? sub.endpoint : '';
  const keys = (sub?.keys ?? null) as Record<string, unknown> | null;
  const p256dh = typeof keys?.p256dh === 'string' ? keys.p256dh : '';
  const auth = typeof keys?.auth === 'string' ? keys.auth : '';
  if (!endpoint || !p256dh || !auth) return null;
  const hour = typeof b.hour === 'number' && b.hour >= 0 && b.hour <= 23 ? Math.floor(b.hour) : 9;
  const tzOffset = typeof b.tzOffset === 'number' && Number.isFinite(b.tzOffset) ? Math.trunc(b.tzOffset) : 0;
  return { endpoint, p256dh, auth, hour, tzOffset };
}

/** UPSERT statement + ordered params for a subscription (idempotent on endpoint). */
export function upsertSubStatement(sub: PushSub): { sql: string; params: unknown[] } {
  const sql =
    'INSERT INTO push_subs (endpoint, p256dh, auth, hour, tz_offset) VALUES (?, ?, ?, ?, ?) ' +
    'ON CONFLICT(endpoint) DO UPDATE SET p256dh=excluded.p256dh, auth=excluded.auth, hour=excluded.hour, tz_offset=excluded.tz_offset';
  return { sql, params: [sub.endpoint, sub.p256dh, sub.auth, sub.hour, sub.tzOffset] };
}

/** DELETE statement + params for one subscription. */
export function deleteSubStatement(endpoint: string): { sql: string; params: unknown[] } {
  return { sql: 'DELETE FROM push_subs WHERE endpoint = ?', params: [endpoint] };
}

/** Store (or refresh) a subscription. Best effort; skips cleanly with no D1 binding. */
export async function saveSub(env: PushEnv, sub: PushSub): Promise<void> {
  if (!env.DB) return;
  try {
    const { sql, params } = upsertSubStatement(sub);
    await env.DB.prepare(sql)
      .bind(...params)
      .run();
  } catch {
    // best effort
  }
}

/** Remove a subscription (on unsubscribe, or when the push service reports it gone). */
export async function deleteSub(env: PushEnv, endpoint: string): Promise<void> {
  if (!env.DB) return;
  try {
    const { sql, params } = deleteSubStatement(endpoint);
    await env.DB.prepare(sql)
      .bind(...params)
      .run();
  } catch {
    // best effort
  }
}

/** The local hour for a sub at a given UTC instant. `tzOffset` is Date.getTimezoneOffset()
 *  minutes (positive = behind UTC), so local = UTC - offset. Pure. */
export function localHour(utcNowMs: number, tzOffsetMin: number): number {
  return new Date(utcNowMs - tzOffsetMin * 60_000).getUTCHours();
}

/** Whether a sub is due to be nudged at the cron's current UTC time (its local hour
 *  matches its preferred hour). The daily cron runs hourly and fires the due subs. */
export function subDueAt(sub: { hour: number; tzOffset: number }, utcNowMs: number): boolean {
  return localHour(utcNowMs, sub.tzOffset) === sub.hour;
}

export type CronEnv = { DB?: D1LikeDatabase; VAPID_PRIVATE_KEY?: string; VAPID_SUBJECT?: string };

/** The daily-nudge cron body: read every subscription, send a payloadless push to each
 *  whose local hour matches now, and prune subscriptions the push service reports gone
 *  (404 / 410). Best effort; skips cleanly when D1 or the VAPID key is unconfigured. */
export async function sendDailyNudges(env: CronEnv, nowMs: number): Promise<void> {
  if (!env.DB || !env.VAPID_PRIVATE_KEY) return;
  let jwk: VapidJwk;
  try {
    jwk = JSON.parse(env.VAPID_PRIVATE_KEY) as VapidJwk;
  } catch {
    return;
  }
  const subject = env.VAPID_SUBJECT || 'mailto:hello@doubledone.app';
  let subs: { endpoint: string; hour: number; tz_offset: number }[] = [];
  try {
    const rows = await env.DB.prepare('SELECT endpoint, hour, tz_offset FROM push_subs').all<{
      endpoint: string;
      hour: number;
      tz_offset: number;
    }>();
    subs = rows.results ?? [];
  } catch {
    return;
  }
  const nowSeconds = Math.floor(nowMs / 1000);
  for (const s of subs) {
    if (!subDueAt({ hour: s.hour, tzOffset: s.tz_offset }, nowMs)) continue;
    const status = await sendPush(jwk, subject, s.endpoint, nowSeconds);
    if (status === 404 || status === 410) await deleteSub(env, s.endpoint);
  }
}
