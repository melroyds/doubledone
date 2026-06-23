// In-app feedback. The client POSTs the user's typed note; the Worker emails it to
// the support inbox via Cloudflare Email Routing's send_email binding. This module
// holds the pure, testable parts (validation + the RFC 5322 MIME builder); the send
// itself (cloudflare:email + the binding) lives in the route handler in index.ts.

export const FEEDBACK_MAX = 4000; // generous for a note; caps abuse + email size

export type FeedbackParse = { ok: true; text: string; context?: string } | { ok: false; error: string };

/** Validate + normalise the posted feedback. Pure, so it is unit-tested directly. */
export function parseFeedback(raw: unknown): FeedbackParse {
  if (typeof raw !== 'object' || raw === null) return { ok: false, error: 'invalid body' };
  const r = raw as { text?: unknown; context?: unknown };
  const text = typeof r.text === 'string' ? r.text.trim() : '';
  if (!text) return { ok: false, error: 'text is required' };
  if (text.length > FEEDBACK_MAX) return { ok: false, error: 'text is too long' };
  // Optional, non-PII context the client volunteers (e.g. "web" / "Android 14").
  const context = typeof r.context === 'string' && r.context.trim() ? r.context.trim().slice(0, 200) : undefined;
  return { ok: true, text, context };
}

/** Base64 of a UTF-8 string, wrapped at 76 cols (RFC 2045), so any unicode in the
 *  note (emoji, accents) survives transit. */
function base64Utf8(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/(.{76})/g, '$1\r\n');
}

export interface FeedbackEmailParts {
  from: string;
  to: string;
  text: string;
  context?: string;
  uuid: string;
  date: string;
}

/** A complete RFC 5322 text/plain message for the send_email binding. uuid + date are
 *  passed in (not read from globals) so this stays pure and unit-testable. */
export function buildFeedbackEmail(p: FeedbackEmailParts): string {
  const body = p.context ? `${p.text}\r\n\r\n--\r\nSent from ${p.context}` : p.text;
  return [
    `From: DoubleDone feedback <${p.from}>`,
    `To: ${p.to}`,
    'Subject: DoubleDone feedback',
    `Message-ID: <${p.uuid}@doubledone.app>`,
    `Date: ${p.date}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="utf-8"',
    'Content-Transfer-Encoding: base64',
    '',
    base64Utf8(body),
  ].join('\r\n');
}
