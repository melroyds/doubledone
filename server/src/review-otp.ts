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
// The second review account (Path A, 2026-10): Google Play's reviewer needs one that is NOT comped, so it
// can reach Play's purchase screen (a comped account is already Premium and never sees it). Each address
// keeps its OWN latest code (row 1 and row 2), and the page labels each with its address: one shared row
// would hand Apple's reviewer a code meant for the other account whenever two reviews overlapped (the
// 2026-10-01 review), and Supabase would rightly refuse it. Each address needs its own Cloudflare Email
// Routing rule to this Worker, and deleting that rule is its kill switch.
export const REVIEW_BUY_EMAIL = 'appreview-buy@doubledone.app';

/** The review_otp row an address relays into: 2 for the purchase account, 1 for the original. */
export function reviewSlot(to: string): 1 | 2 | null {
  const t = to.toLowerCase();
  if (t.includes(REVIEW_BUY_EMAIL)) return 2; // checked first, so the order of the addresses never matters
  if (t.includes(REVIEW_EMAIL)) return 1;
  return null;
}
const SLOT_EMAIL: Record<number, string> = { 1: REVIEW_EMAIL, 2: REVIEW_BUY_EMAIL };

// Extract the one-time code from a Supabase sign-in email. The default template carries a
// 6-digit token; prefer a 6-digit run near the words "code" or "token" (so a year or an address
// in the footer can never win), falling back to the first standalone 6-digit run anywhere.
export function extractOtpCode(raw: string): string | null {
  const near = /(?:code|token)[^0-9]{0,40}(\d{6})(?!\d)/i.exec(raw);
  if (near) return near[1];
  const any = /(?<!\d)(\d{6})(?!\d)/.exec(raw);
  return any ? any[1] : null;
}

/**
 * The readable text of an email: every text/plain and text/html part, decoded (base64 or
 * quoted-printable) with the HTML tags dropped. The HEADERS are never included. Searching the raw
 * message served the send time as the code (2026-09-27: a header carried "010601", 01:06:01 UTC, and
 * the real code sat in a base64 body where no digit run was visible), so the reviewer was handed a
 * code Supabase rightly refused. A message with no header block at all is taken as plain text.
 */
export function emailBodyText(raw: string): string {
  if (!/^[A-Za-z0-9-]+:/.test(raw)) return raw;
  const texts: string[] = [];
  const walk = (part: string, depth: number) => {
    const m = /\r?\n\r?\n/.exec(part);
    if (!m) return;
    const headers = part.slice(0, m.index).replace(/\r?\n[ \t]+/g, ' ');
    const body = part.slice(m.index + m[0].length);
    const header = (name: string) => new RegExp(`^${name}:[ \t]*(.*)$`, 'im').exec(headers)?.[1] ?? null;
    const ctype = header('content-type') ?? 'text/plain';
    const cte = (header('content-transfer-encoding') ?? '7bit').trim().toLowerCase();
    const boundary = /boundary="?([^";\r\n]+)"?/i.exec(ctype)?.[1];
    if (/^multipart\//i.test(ctype) && boundary && depth < 6) {
      const pieces = body.split(`--${boundary}`);
      for (const piece of pieces.slice(1)) {
        if (piece.startsWith('--')) break; // the closing delimiter
        walk(piece.replace(/^\r?\n/, ''), depth + 1);
      }
      return;
    }
    if (!/^text\//i.test(ctype)) return;
    let text = cte === 'base64' ? decodeBase64(body) : cte === 'quoted-printable' ? decodeQuotedPrintable(body) : body;
    if (/text\/html/i.test(ctype)) text = htmlToText(text);
    texts.push(text);
  };
  walk(raw, 0);
  return texts.join('\n');
}

function bytesToText(bytes: Uint8Array): string {
  return new TextDecoder('utf-8').decode(bytes); // not fatal: a stray byte never loses the code
}

function decodeBase64(body: string): string {
  try {
    const bin = atob(body.replace(/[^A-Za-z0-9+/=]/g, ''));
    return bytesToText(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  } catch {
    return '';
  }
}

function decodeQuotedPrintable(body: string): string {
  const joined = body.replace(/=\r?\n/g, ''); // soft line breaks can split the code itself
  const bytes: number[] = [];
  for (let i = 0; i < joined.length; i++) {
    const hex = joined[i] === '=' ? joined.slice(i + 1, i + 3) : '';
    if (/^[0-9A-Fa-f]{2}$/.test(hex)) {
      bytes.push(parseInt(hex, 16));
      i += 2;
    } else {
      bytes.push(...new TextEncoder().encode(joined[i]));
    }
  }
  return bytesToText(Uint8Array.from(bytes));
}

function htmlToText(html: string): string {
  return html
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, ' ') // CSS colours like #010101 live here
    .replace(/<[^>]+>/g, ' ') // attributes too: a link's token hash is not the code
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/&amp;/gi, '&');
}

async function ensureTable(db: D1LikeDatabase): Promise<void> {
  // Idempotent, like alerts_sent: the table exists after the first email regardless of schema.sql.
  await db.prepare('CREATE TABLE IF NOT EXISTS review_otp (id integer primary key, code text not null, updated_at text not null)').bind().run();
}

/** Store an address's latest code (one row per review address, each a single-row upsert). */
export async function storeReviewCode(db: D1LikeDatabase, code: string, nowISO: string, slot: 1 | 2 = 1): Promise<void> {
  await ensureTable(db);
  await db
    .prepare('INSERT INTO review_otp (id, code, updated_at) VALUES (?3, ?1, ?2) ON CONFLICT(id) DO UPDATE SET code = ?1, updated_at = ?2')
    .bind(code, nowISO, slot)
    .run();
}

const FRESH_MS = 60 * 60 * 1000; // Supabase's own OTP validity; a staler code is useless anyway

/** GET /review-code: each review address's latest fresh code, labelled with the address, as a tiny plain
 *  page a reviewer can read in Safari. 404 when no fresh code exists (nothing arrived yet, or the email
 *  routes have been removed). */
export async function handleReviewCode(db: D1LikeDatabase | undefined, nowMs: number): Promise<Response> {
  if (!db) return new Response('not configured', { status: 503 });
  try {
    await ensureTable(db);
    const { results } = await db
      .prepare('SELECT id, code, updated_at FROM review_otp WHERE id IN (1, 2) ORDER BY id')
      .bind()
      .all<{ id: number; code: string; updated_at: string }>();
    const rows = results ?? [];
    if (!rows.length) return new Response('No code yet. In the app, enter the review email and tap the send button, then refresh this page.', { status: 404 });
    const fresh = rows
      .map((row) => ({ row, age: nowMs - Date.parse(row.updated_at) }))
      .filter(({ age }) => age >= 0 && age < FRESH_MS);
    if (!fresh.length) {
      return new Response('The last code has expired. In the app, tap the send button again, then refresh this page.', { status: 404 });
    }
    const lines = fresh.map(({ row, age }) => {
      const mins = Math.max(0, Math.floor(age / 60_000));
      return `${SLOT_EMAIL[row.id] ?? 'review account'}: ${row.code} (sent ${mins} minute${mins === 1 ? '' : 's'} ago)`;
    });
    return new Response(`DoubleDone App Review sign-in code. Use the line for the email you entered.\n${lines.join('\n')}\n(codes expire after an hour)`, {
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
  const slot = reviewSlot(message.to);
  if (!slot) return;
  try {
    // The whole message (an OTP email is a few KB); cap the read defensively at 256 KB.
    if (message.rawSize > 256 * 1024) return;
    const raw = await new Response(message.raw).text();
    const code = extractOtpCode(emailBodyText(raw)); // the decoded body only, never the headers
    if (code) await storeReviewCode(db, code, nowISO, slot);
  } catch {
    // best effort: a failed relay just means the reviewer taps "send code" again
  }
}
