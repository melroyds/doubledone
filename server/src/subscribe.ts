// The landing page's email list (2026-10-18, from an external website audit: "no audience to launch to").
//
//   POST /subscribe        {email, locale, website}  JSON from the page's script, or a plain form post without it
//   GET  /unsubscribe?t=   a calm page with one "Leave the list" button. Opening it changes NOTHING: mail scanners
//                          (Safe Links, Mimecast, Proofpoint) open every link in a message, and a delete-on-GET
//                          would quietly drop everyone behind them.
//   POST /unsubscribe?t=   deletes the row. Also the RFC 8058 one-click target (List-Unsubscribe=One-Click), which
//                          mail clients send as a POST.
//
// What it keeps, and nothing more: the email address (lowercased), the page's language, when it joined, and a
// random token for leaving. No IP, no user id. Leaving deletes the row (the hosting provider's short-lived D1
// backups age out within 30 days, as the privacy policy says).
//
// Deliberately NO email is sent at sign-up. The Worker's only mail path is Cloudflare's send_email binding, which
// can deliver only to addresses verified on the account, so it cannot write to a stranger; and a confirmation mail
// on request would make this form a way to send mail to anyone. So: a single opt-in, guarded by the page's
// honeypot, an Origin check, a per-IP rate limit (IPv6 by its /64, since one machine can own a whole /64), and a
// ceiling on new rows a day. An Origin can be forged by a script, so none of that proves consent: the FIRST message
// to the list must be confirm-only, and anyone who does not confirm is deleted (BUILD-PLAN Backlog).
//
// Never reveals whether an address is already on the list: every valid request gets the same reply. The JSON reply
// carries subscribed:true, which the page requires (a bare 200 proves nothing: an older Worker answers any path).

import type { D1LikeDatabase } from './telemetry';

export const SUBSCRIBE_LOCALES = ['en', 'de', 'es', 'fr', 'it'] as const;
const SITE = 'https://doubledone.app';
const API = 'https://api.doubledone.app';
const MAX_EMAIL = 254;
export const MAX_BODY = 4096;
/** New addresses a day before the form says "try later". Far above real interest; a ceiling on a stuffing run. */
export const DAILY_NEW_CAP = 200;
const DAY_MS = 86_400_000;

export type SubscribeEnv = {
  DB?: D1LikeDatabase;
  SUBSCRIBE_LIMITER?: { limit(options: { key: string }): Promise<{ success: boolean }> };
};

export const SUBSCRIBERS_SQL =
  'CREATE TABLE IF NOT EXISTS subscribers (email TEXT PRIMARY KEY, locale TEXT NOT NULL, created_at INTEGER NOT NULL, token TEXT NOT NULL UNIQUE)';

let tableReady = false;
async function ensureTable(db: D1LikeDatabase): Promise<void> {
  if (tableReady) return;
  await db.prepare(SUBSCRIBERS_SQL).run();
  tableReady = true;
}
/** For tests: forget that the table was made in this isolate. */
export function resetSubscribeTableFlag(): void {
  tableReady = false;
}

/** A plausible address, or null. Deliberately simple: the real proof is a confirmed note, never a regex. */
export function normaliseEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const email = raw.trim().toLowerCase();
  if (!email || email.length > MAX_EMAIL) return null;
  // eslint-disable-next-line no-control-regex
  if (/[\s\u0000-\u001f\u007f<>()[\]\\,;:"]/.test(email)) return null;
  const at = email.lastIndexOf('@');
  if (at < 1 || at !== email.indexOf('@')) return null;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (local.length > 64 || domain.length < 4 || domain.length > 253) return null;
  if (!/^[a-z0-9.-]+\.[a-z]{2,63}$/.test(domain) || domain.includes('..') || domain.startsWith('.') || domain.startsWith('-')) return null;
  return email;
}

export function normaliseLocale(raw: unknown): (typeof SUBSCRIBE_LOCALES)[number] {
  return (SUBSCRIBE_LOCALES as readonly unknown[]).includes(raw) ? (raw as (typeof SUBSCRIBE_LOCALES)[number]) : 'en';
}

/** The rate-limit key for an address: IPv4 whole, IPv6 by its /64 (a single host can rotate through a /64). */
export function limitKey(ip: string | null): string {
  if (!ip) return 'unknown';
  if (!ip.includes(':') || ip.includes('.')) return ip; // IPv4, or an IPv4-mapped IPv6 address
  const [head, tail] = ip.toLowerCase().split('::');
  const h = head ? head.split(':') : [];
  const t = tail !== undefined && tail !== '' ? tail.split(':') : [];
  const groups = tail === undefined ? h : [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill('0'), ...t];
  return `${groups.slice(0, 4).map((g) => g || '0').join(':')}::/64`;
}

/** The body as text, never more than `max` bytes read: a chunked upload with no Content-Length cannot make the
 *  Worker buffer megabytes. Null when it is too big. */
export async function readCapped(request: Request, max: number): Promise<string | null> {
  const declared = request.headers.get('content-length');
  if (declared !== null && Number(declared) > max) return null;
  if (!request.body) return '';
  const reader = request.body.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => {});
      return null;
    }
    parts.push(value);
  }
  const all = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    all.set(p, at);
    at += p.byteLength;
  }
  return new TextDecoder().decode(all);
}

type Fields = { email?: unknown; locale?: unknown; website?: unknown };

function parseFields(text: string, form: boolean): Fields | null {
  if (form) {
    const p = new URLSearchParams(text);
    return { email: p.get('email'), locale: p.get('locale'), website: p.get('website') };
  }
  try {
    const body = JSON.parse(text) as unknown;
    return typeof body === 'object' && body !== null ? (body as Fields) : null;
  } catch {
    return null;
  }
}

/** POST /subscribe. `allowed` is the Worker's own origin check (the app's origins only). */
export async function handleSubscribe(
  request: Request,
  env: SubscribeEnv,
  cors: Record<string, string>,
  allowed: (origin: string | null) => boolean,
  now: number,
): Promise<Response> {
  const form = (request.headers.get('content-type') ?? '').includes('application/x-www-form-urlencoded');
  // A form post (no JavaScript) gets a calm page back via a redirect to the landing's own anchors.
  const reply = (status: number, body: Record<string, unknown>, anchor: 'ddl-thanks' | 'ddl-oops') =>
    form
      ? new Response(null, { status: 303, headers: { Location: `${SITE}/#${anchor}`, 'cache-control': 'no-store' } })
      : Response.json(body, { status, headers: cors });

  // Cheap refusals first, before a byte of the body is read.
  if (!allowed(request.headers.get('Origin'))) return reply(403, { error: 'forbidden origin' }, 'ddl-oops');
  if (env.SUBSCRIBE_LIMITER) {
    const { success } = await env.SUBSCRIBE_LIMITER.limit({ key: `subscribe:${limitKey(request.headers.get('CF-Connecting-IP'))}` });
    if (!success) return reply(429, { error: 'slow down' }, 'ddl-oops');
  }

  const text = await readCapped(request, MAX_BODY);
  const fields = text === null ? null : parseFields(text, form);
  if (!fields) return reply(400, { error: 'invalid' }, 'ddl-oops');

  // The honeypot: a field people never see. A bot that fills it is told it worked, and nothing is kept.
  if (typeof fields.website === 'string' && fields.website.trim() !== '') {
    return reply(200, { ok: true, subscribed: true }, 'ddl-thanks');
  }

  const email = normaliseEmail(fields.email);
  if (!email) return reply(400, { error: 'invalid' }, 'ddl-oops');
  const locale = normaliseLocale(fields.locale);

  if (!env.DB) return reply(503, { error: 'unavailable' }, 'ddl-oops');
  try {
    await ensureTable(env.DB);
    const recent = await env.DB.prepare('SELECT COUNT(*) AS n FROM subscribers WHERE created_at > ?').bind(now - DAY_MS).first<{ n: number }>();
    if ((recent?.n ?? 0) >= DAILY_NEW_CAP) return reply(503, { error: 'busy' }, 'ddl-oops');
    // Joining again just takes the newest language; the row, its date and its token stay as they were.
    await env.DB.prepare(
      'INSERT INTO subscribers (email, locale, created_at, token) VALUES (?, ?, ?, ?) ON CONFLICT(email) DO UPDATE SET locale = excluded.locale',
    )
      .bind(email, locale, now, crypto.randomUUID())
      .run();
  } catch {
    return reply(503, { error: 'unavailable' }, 'ddl-oops');
  }
  return reply(200, { ok: true, subscribed: true }, 'ddl-thanks');
}

const TOKEN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function page(title: string, body: string, status = 200): Response {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>DoubleDone</title><style>body{margin:0;background:#FAF6F1;color:#2B2722;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;line-height:1.6;font-size:17px}main{max-width:520px;margin:0 auto;padding:64px 22px}h1{font-family:Georgia,serif;font-weight:600;font-size:30px;margin:0 0 12px}a{color:#8D5D6F}button{margin-top:20px;min-height:50px;padding:0 26px;border:0;border-radius:999px;background:#8D5D6F;color:#fff;font:inherit;font-weight:700;cursor:pointer}button:focus-visible,a:focus-visible{outline:3px solid #8D5D6F;outline-offset:3px}@media (prefers-color-scheme:dark){body{background:#1B1917;color:#F2EBE0}a{color:#C68BA0}button{background:#C68BA0;color:#2B2722}}</style></head><body><main><h1>${title}</h1>${body}</main></body></html>`;
  return new Response(html, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}

const SUPPORT = '<a href="mailto:support@doubledone.app">support@doubledone.app</a>';

/** GET /unsubscribe?t=: the page and its button only. Changes nothing, so a mail scanner opening it is harmless. */
export function handleUnsubscribePage(request: Request): Response {
  const token = (new URL(request.url).searchParams.get('t') ?? '').trim().toLowerCase();
  if (!TOKEN.test(token)) {
    return page('That link looks incomplete.', `<p>Nothing has changed. To leave the list, write to ${SUPPORT} and we'll take you off by hand.</p>`, 400);
  }
  return page(
    'Leave the DoubleDone list?',
    `<p>One tap and your address is deleted from the list. No more notes.</p><form method="post" action="${API}/unsubscribe?t=${token}"><button type="submit">Leave the list</button></form>`,
  );
}

/** POST /unsubscribe?t= (the page's button, or a mail client's RFC 8058 one-click): delete the row, and say truly
 *  what happened. The token is the only authority; it is random and unguessable. */
export async function handleUnsubscribe(request: Request, env: SubscribeEnv): Promise<Response> {
  const fromQuery = new URL(request.url).searchParams.get('t');
  let token = fromQuery ?? '';
  if (!token) {
    const text = (await readCapped(request, MAX_BODY)) ?? '';
    token = new URLSearchParams(text).get('t') ?? '';
  }
  token = token.trim().toLowerCase();
  if (!TOKEN.test(token)) {
    return page('That link looks incomplete.', `<p>Nothing has changed. To leave the list, write to ${SUPPORT} and we'll take you off by hand.</p>`, 400);
  }
  if (!env.DB) {
    return page("That didn't go through.", `<p>You're still on the list for now. Try again in a moment, or write to ${SUPPORT}.</p>`, 503);
  }
  try {
    await ensureTable(env.DB);
    const res = (await env.DB.prepare('DELETE FROM subscribers WHERE token = ?').bind(token).run()) as { meta?: { changes?: number } } | null;
    const gone = (res?.meta?.changes ?? 0) > 0;
    return gone
      ? page("You're off the list.", `<p>Your address is deleted. No more notes from DoubleDone. If that was a slip, you can join again any time on <a href="${SITE}/">doubledone.app</a>.</p>`)
      : page('This address is not on the list.', `<p>It may have left already. If notes still arrive, write to ${SUPPORT} and we'll stop them by hand.</p>`);
  } catch {
    return page("That didn't go through.", `<p>You're still on the list for now. Try again in a moment, or write to ${SUPPORT}.</p>`, 503);
  }
}
