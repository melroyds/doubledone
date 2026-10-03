import { describe, expect, it } from 'vitest';

import type { D1LikeDatabase } from './entitlements';
import { emailBodyText, extractOtpCode, handleReviewCode, handleReviewEmail, REVIEW_BUY_EMAIL, REVIEW_EMAIL, reviewSlot, storeReviewCode } from './review-otp';

const NOW = Date.parse('2026-07-19T10:00:00Z');

function fakeDb(): D1LikeDatabase & { rows: Map<number, { code: string; updated_at: string }> } {
  const rows = new Map<number, { code: string; updated_at: string }>();
  return {
    rows,
    prepare(sql: string) {
      let args: unknown[] = [];
      const stmt = {
        bind(...a: unknown[]) {
          args = a;
          return stmt;
        },
        async run() {
          if (sql.startsWith('CREATE TABLE')) return;
          rows.set((args[2] as number | undefined) ?? 1, { code: args[0] as string, updated_at: args[1] as string });
        },
        async first<T>() {
          return (rows.get(1) ?? null) as T | null;
        },
        async all<T>() {
          return { results: [...rows.entries()].sort(([a], [b]) => a - b).map(([id, r]) => ({ id, ...r })) as T[] };
        },
      };
      return stmt;
    },
  };
}

describe('extractOtpCode', () => {
  it('finds the code next to the word "code" even with other numbers around', () => {
    const raw = 'Date: Sat, 19 Jul 2026 10:00:00\nYour sign-in code is 482913. It expires in 60 minutes. Ref 20260719.';
    expect(extractOtpCode(raw)).toBe('482913');
  });

  it('finds a {{ .Token }}-style code after the word token', () => {
    expect(extractOtpCode('One-time token: 004217')).toBe('004217');
  });

  it('falls back to the first standalone 6-digit run when no keyword is near', () => {
    expect(extractOtpCode('hello 123456 world')).toBe('123456');
  });

  it('never matches part of a longer number (a phone, a timestamp)', () => {
    expect(extractOtpCode('call +61412345678 thanks')).toBeNull();
    expect(extractOtpCode('id 1234567')).toBeNull();
  });

  it('returns null when there is no 6-digit run at all', () => {
    expect(extractOtpCode('no numbers here')).toBeNull();
    expect(extractOtpCode('12345')).toBeNull();
  });
});

describe('the relay round-trip', () => {
  it('stores a code and serves it fresh', async () => {
    const db = fakeDb();
    await storeReviewCode(db, '482913', new Date(NOW - 2 * 60_000).toISOString());
    const res = await handleReviewCode(db, NOW);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('482913');
    expect(body).toContain('2 minutes ago');
  });

  it('404s before any code has arrived, with a calm instruction', async () => {
    const res = await handleReviewCode(fakeDb(), NOW);
    expect(res.status).toBe(404);
    expect(await res.text()).toContain('tap the send button');
  });

  it('404s a code older than an hour (useless to the reviewer anyway)', async () => {
    const db = fakeDb();
    await storeReviewCode(db, '482913', new Date(NOW - 61 * 60_000).toISOString());
    const res = await handleReviewCode(db, NOW);
    expect(res.status).toBe(404);
    expect(await res.text()).toContain('expired');
  });

  it('a newer code replaces the old one (single-row upsert)', async () => {
    const db = fakeDb();
    await storeReviewCode(db, '111111', new Date(NOW - 10 * 60_000).toISOString());
    await storeReviewCode(db, '222222', new Date(NOW - 60_000).toISOString());
    const body = await (await handleReviewCode(db, NOW)).text();
    expect(body).toContain('222222');
    expect(body).not.toContain('111111');
  });

  it('503s with no DB rather than crashing', async () => {
    expect((await handleReviewCode(undefined, NOW)).status).toBe(503);
  });
});

describe('handleReviewEmail', () => {
  const asStream = (s: string) => new Response(s).body as ReadableStream;

  it('relays a code addressed to the review account', async () => {
    const db = fakeDb();
    await handleReviewEmail({ to: REVIEW_EMAIL, raw: asStream('Your code: 482913'), rawSize: 20 }, db, new Date(NOW).toISOString());
    expect(db.rows.get(1)?.code).toBe('482913');
  });

  it('relays a code addressed to the second, purchase review account (Play review set 2) into its OWN row', async () => {
    const db = fakeDb();
    await handleReviewEmail({ to: REVIEW_BUY_EMAIL, raw: asStream('Your code: 615204'), rawSize: 20 }, db, new Date(NOW).toISOString());
    expect(db.rows.get(2)?.code).toBe('615204');
    expect(db.rows.has(1)).toBe(false); // never over the original account's code
  });

  it('matches the review addresses whatever their case', async () => {
    const db = fakeDb();
    await handleReviewEmail({ to: 'AppReview-Buy@DoubleDone.app', raw: asStream('Your code: 615204'), rawSize: 20 }, db, new Date(NOW).toISOString());
    expect(db.rows.get(2)?.code).toBe('615204');
  });

  it('keeps both accounts readable when two reviews overlap, each labelled with its address', async () => {
    const db = fakeDb();
    await handleReviewEmail({ to: REVIEW_EMAIL, raw: asStream('Your code: 482913'), rawSize: 20 }, db, new Date(NOW - 3 * 60_000).toISOString());
    await handleReviewEmail({ to: REVIEW_BUY_EMAIL, raw: asStream('Your code: 615204'), rawSize: 20 }, db, new Date(NOW - 60_000).toISOString());
    const res = await handleReviewCode(db, NOW);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain(`${REVIEW_EMAIL}: 482913 (sent 3 minutes ago)`);
    expect(body).toContain(`${REVIEW_BUY_EMAIL}: 615204 (sent 1 minute ago)`);
  });

  it('shows only the fresh codes, and 404s with the calm line when none is fresh', async () => {
    const db = fakeDb();
    await storeReviewCode(db, '482913', new Date(NOW - 61 * 60_000).toISOString(), 1);
    await storeReviewCode(db, '615204', new Date(NOW - 2 * 60_000).toISOString(), 2);
    const body = await (await handleReviewCode(db, NOW)).text();
    expect(body).toContain('615204');
    expect(body).not.toContain('482913');
    const stale = fakeDb();
    await storeReviewCode(stale, '615204', new Date(NOW - 90 * 60_000).toISOString(), 2);
    const res = await handleReviewCode(stale, NOW);
    expect(res.status).toBe(404);
    expect(await res.text()).toContain('expired');
  });

  it('routes each address to its slot, and anything else nowhere', () => {
    expect(reviewSlot(REVIEW_EMAIL)).toBe(1);
    expect(reviewSlot(REVIEW_BUY_EMAIL)).toBe(2);
    expect(reviewSlot('someone@doubledone.app')).toBeNull();
  });

  it('ignores mail for any other address', async () => {
    const db = fakeDb();
    await handleReviewEmail({ to: 'someone@doubledone.app', raw: asStream('Your code: 482913'), rawSize: 20 }, db, new Date(NOW).toISOString());
    expect(db.rows.size).toBe(0);
  });

  it('ignores an oversized message (defensive cap)', async () => {
    const db = fakeDb();
    await handleReviewEmail({ to: REVIEW_EMAIL, raw: asStream('Your code: 482913'), rawSize: 500 * 1024 }, db, new Date(NOW).toISOString());
    expect(db.rows.size).toBe(0);
  });

  it('stores nothing when no code can be found, and never throws', async () => {
    const db = fakeDb();
    await handleReviewEmail({ to: REVIEW_EMAIL, raw: asStream('welcome to the newsletter'), rawSize: 30 }, db, new Date(NOW).toISOString());
    expect(db.rows.size).toBe(0);
  });
});

// Real sign-in emails are MIME: headers full of timestamps, bodies in base64 or quoted-printable.
// 2026-09-27 the relay served "010601" (the send time, from a header) while the real code sat in a
// base64 body, and Supabase refused it. These are shaped like what actually arrives.
const b64 = (s: string) => btoa(unescape(encodeURIComponent(s))).replace(/(.{76})/g, '$1\r\n');
const HEADERS = [
  'Received: by mx.example.com with SMTP id 010601; Sat, 27 Sep 2026 01:06:01 +0000',
  'Message-ID: <20260927.010601.4821@mail.supabase.io>',
  'Date: Sat, 27 Sep 2026 01:06:01 +0000',
  'From: Supabase Auth <noreply@mail.app.supabase.io>',
  'To: appreview@doubledone.app',
  'Subject: Your sign-in code',
  'MIME-Version: 1.0',
].join('\r\n');

describe('emailBodyText + extractOtpCode on real-shaped mail', () => {
  it('finds the code in a base64 HTML body and ignores the timestamps in the headers', () => {
    const html = '<html><head><style>.c{color:#010601}</style></head><body><h2>Your code</h2><p>Enter this code: <strong>482913</strong></p><a href="https://example.com/verify" data-ref="123456">link</a></body></html>';
    const raw = `${HEADERS}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${b64(html)}\r\n`;
    expect(extractOtpCode(emailBodyText(raw))).toBe('482913');
  });

  it('reads a multipart/alternative message, quoted-printable text with a soft break inside the code', () => {
    const raw = [
      HEADERS,
      'Content-Type: multipart/alternative; boundary="b1"',
      '',
      '--b1',
      'Content-Type: text/plain; charset=utf-8',
      'Content-Transfer-Encoding: quoted-printable',
      '',
      'Your code is 73=',
      '0152 =E2=80=94 it expires in an hour.',
      '--b1',
      'Content-Type: text/html; charset=utf-8',
      'Content-Transfer-Encoding: base64',
      '',
      b64('<p>Your code is <b>730152</b></p>'),
      '--b1--',
      '',
    ].join('\r\n');
    expect(extractOtpCode(emailBodyText(raw))).toBe('730152');
  });

  it('never takes a number from the headers, even when the body has no code', () => {
    const raw = `${HEADERS}\r\nContent-Type: text/plain\r\n\r\nWelcome to DoubleDone.\r\n`;
    expect(extractOtpCode(emailBodyText(raw))).toBeNull();
  });

  it('relays the real code end to end from an encoded message', async () => {
    const db = fakeDb();
    const raw = `${HEADERS}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${b64('<p>Your code: 604218</p>')}\r\n`;
    await handleReviewEmail({ to: REVIEW_EMAIL, raw: new Response(raw).body as ReadableStream, rawSize: raw.length }, db, new Date(NOW).toISOString());
    expect(db.rows.get(1)?.code).toBe('604218');
  });
});
