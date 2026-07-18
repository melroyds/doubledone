import { describe, expect, it } from 'vitest';

import type { D1LikeDatabase } from './entitlements';
import { extractOtpCode, handleReviewCode, handleReviewEmail, REVIEW_EMAIL, storeReviewCode } from './review-otp';

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
          rows.set(1, { code: args[0] as string, updated_at: args[1] as string });
        },
        async first<T>() {
          return (rows.get(1) ?? null) as T | null;
        },
        async all<T>() {
          return { results: [...rows.values()] as T[] };
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
