// The App Review sign-in relay. Apple's reviewer must sign into DoubleDone to test the IAP
// (Guideline 2.1(b)), but sign-in is passwordless email OTP and a reviewer cannot read our inbox.
// Rather than forcing a fixed code through Supabase's undocumented auth internals (fragile, and a
// permanent backdoor in production auth), we relay the REAL code: Cloudflare Email Routing routes
// mail for the review address to this Worker's email() handler, which extracts the 6-digit code
// and stores it in D1; GET /review-code shows the latest one. The reviewer taps "send code" in the
// app, opens the URL from the review notes, reads the code, types it. Production auth is untouched.
//
// Security posture, stated plainly: while the email route exists, anyone who knows the URL can
// sign in as the REVIEW account (a seeded demo account holding nothing personal). That is the
// whole blast radius. The kill switch is deleting the Email Routing rule in the Cloudflare
// dashboard (no new codes can ever arrive), and codes expire on Supabase's side regardless.

import { type D1LikeDatabase } from './entitlements';

export const REVIEW_EMAIL = 'appreview@doubledone.app';

// Extract the one-time code from a Supabase sign-in email. The default template carries a
// 6-digit token; prefer a 6-digit run near the words "code" or "token" (so a year or an address
// in the footer can never win), falling back to the first standalone 6-digit run anywhere.
export function extractOtpCode(raw: string): string | null {
  const near = /(?:code|token)[^0-9]{0,40}(\d{6})(?!\d)/i.exec(raw);
  if (near) return near[1];
  const any = /(?<!\d)(\d{6})(?!\d)/.exec(raw);
  return any ? any[1] : null;
}

async function ensureTable(db: D1LikeDatabase): Promise<void> {
  // Idempotent, like alerts_sent: the table exists after the first email regardless of schema.sql.
  await db.prepare('CREATE TABLE IF NOT EXISTS review_otp (id integer primary key, code text not null, updated_at text not null)').bind().run();
}

/** Store the latest code (a single-row upsert; only ever one current code). */
export async function storeReviewCode(db: D1LikeDatabase, code: string, nowISO: string): Promise<void> {
  await ensureTable(db);
  await db
    .prepare('INSERT INTO review_otp (id, code, updated_at) VALUES (1, ?1, ?2) ON CONFLICT(id) DO UPDATE SET code = ?1, updated_at = ?2')
    .bind(code, nowISO)
    .run();
}

const FRESH_MS = 60 * 60 * 1000; // Supabase's own OTP validity; a staler code is useless anyway

/** GET /review-code: the latest relayed code as a tiny plain page a reviewer can read in Safari.
 *  404 when no fresh code exists (nothing arrived yet, or the email route has been removed). */
export async function handleReviewCode(db: D1LikeDatabase | undefined, nowMs: number): Promise<Response> {
  if (!db) return new Response('not configured', { status: 503 });
  try {
    await ensureTable(db);
    const row = await db.prepare('SELECT code, updated_at FROM review_otp WHERE id = 1').bind().first<{ code: string; updated_at: string }>();
    if (!row) return new Response('No code yet. In the app, enter the review email and tap the send button, then refresh this page.', { status: 404 });
    const age = nowMs - Date.parse(row.updated_at);
    if (!(age >= 0 && age < FRESH_MS)) {
      return new Response('The last code has expired. In the app, tap the send button again, then refresh this page.', { status: 404 });
    }
    const mins = Math.max(0, Math.floor(age / 60_000));
    return new Response(`DoubleDone App Review sign-in code: ${row.code}\n(sent ${mins} minute${mins === 1 ? '' : 's'} ago; codes expire after an hour)`, {
      headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
    });
  } catch {
    return new Response('unavailable', { status: 503 });
  }
}

/** The email() handler branch: mail routed to the review address lands here. Reads the raw
 *  message, extracts the code, stores it. Anything else routed our way is dropped silently. */
export async function handleReviewEmail(
  message: { to: string; raw: ReadableStream; rawSize: number },
  db: D1LikeDatabase | undefined,
  nowISO: string,
): Promise<void> {
  if (!db) return;
  if (!message.to.toLowerCase().includes(REVIEW_EMAIL)) return;
  try {
    // The whole message (an OTP email is a few KB); cap the read defensively at 256 KB.
    if (message.rawSize > 256 * 1024) return;
    const raw = await new Response(message.raw).text();
    const code = extractOtpCode(raw);
    if (code) await storeReviewCode(db, code, nowISO);
  } catch {
    // best effort: a failed relay just means the reviewer taps "send code" again
  }
}
