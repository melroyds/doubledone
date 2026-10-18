import { beforeEach, describe, expect, it } from 'vitest';

import {
  DAILY_NEW_CAP,
  handleSubscribe,
  handleUnsubscribe,
  handleUnsubscribePage,
  limitKey,
  MAX_BODY,
  normaliseEmail,
  normaliseLocale,
  readCapped,
  resetSubscribeTableFlag,
  type SubscribeEnv,
} from './subscribe';
import type { D1LikeDatabase, D1LikeStatement } from './telemetry';

const cors = { 'Access-Control-Allow-Origin': 'https://doubledone.app' };
const allowed = (o: string | null) => o === 'https://doubledone.app';
const NOW = 1_760_000_000_000;

// A D1 that behaves like the subscribers table: upsert by email, delete by token, count by date.
function fakeDb(opts: { fail?: boolean } = {}) {
  const rows = new Map<string, { email: string; locale: string; created_at: number; token: string }>();
  const sql: string[] = [];
  const db: D1LikeDatabase = {
    prepare(query: string) {
      sql.push(query);
      let args: unknown[] = [];
      const stmt: D1LikeStatement = {
        bind(...values: unknown[]) {
          args = values;
          return stmt;
        },
        async run() {
          if (opts.fail) throw new Error('d1 down');
          let changes = 0;
          if (query.startsWith('INSERT INTO subscribers')) {
            const [email, locale, created_at, token] = args as [string, string, number, string];
            const prev = rows.get(email);
            rows.set(email, prev ? { ...prev, locale } : { email, locale, created_at, token });
            changes = 1;
          }
          if (query.startsWith('DELETE FROM subscribers WHERE token')) {
            for (const [k, r] of rows) if (r.token === args[0]) (rows.delete(k), changes++);
          }
          return { meta: { changes } };
        },
        async first<T>() {
          if (opts.fail) throw new Error('d1 down');
          if (query.startsWith('SELECT COUNT(*)')) {
            const since = args[0] as number;
            return { n: [...rows.values()].filter((r) => r.created_at > since).length } as T;
          }
          return null;
        },
        async all() {
          return { results: [] };
        },
      };
      return stmt;
    },
  };
  return { db, rows, sql };
}

function post(body: unknown, opts: { origin?: string | null; form?: boolean; ip?: string } = {}) {
  const headers: Record<string, string> = {
    'content-type': opts.form ? 'application/x-www-form-urlencoded' : 'application/json',
    'CF-Connecting-IP': opts.ip ?? '203.0.113.7',
  };
  if (opts.origin !== null) headers.Origin = opts.origin ?? 'https://doubledone.app';
  const text = opts.form ? new URLSearchParams(body as Record<string, string>).toString() : typeof body === 'string' ? body : JSON.stringify(body);
  return new Request('https://api.doubledone.app/subscribe', { method: 'POST', headers, body: text });
}

async function send(env: SubscribeEnv, req: Request, now = NOW) {
  const res = await handleSubscribe(req, env, cors, allowed, now);
  const body = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
  return { res, body: body as Record<string, unknown> | null };
}

const unsubPost = (token: string, init: RequestInit = {}) => new Request(`https://api.doubledone.app/unsubscribe?t=${token}`, { method: 'POST', ...init });

beforeEach(() => resetSubscribeTableFlag());

describe('normaliseEmail, normaliseLocale, limitKey', () => {
  it('accepts ordinary addresses and lowercases them', () => {
    expect(normaliseEmail('  Melroy.D+List@Example.COM ')).toBe('melroy.d+list@example.com');
    expect(normaliseEmail('a@b.co')).toBe('a@b.co');
  });
  it('refuses what cannot be an address', () => {
    for (const bad of ['', 'no-at', '@b.co', 'a@', 'a@b', 'a@@b.co', 'a b@c.co', 'a@b..co', 'a@-b.co', 'a@b.c', '<x>@b.co', `${'x'.repeat(65)}@b.co`, 7, null]) {
      expect(normaliseEmail(bad), String(bad)).toBeNull();
    }
    expect(normaliseEmail(`a@${'b'.repeat(250)}.com`)).toBeNull();
  });
  it('keeps only our five languages', () => {
    expect(normaliseLocale('de')).toBe('de');
    expect(normaliseLocale('pt')).toBe('en');
    expect(normaliseLocale(undefined)).toBe('en');
  });
  it('keys IPv4 whole and IPv6 by its /64, so one host cannot rotate through its own block', () => {
    expect(limitKey('203.0.113.7')).toBe('203.0.113.7');
    expect(limitKey('2001:db8:abcd:12::1')).toBe('2001:db8:abcd:12::/64');
    expect(limitKey('2001:db8:abcd:12:ffff:1:2:3')).toBe('2001:db8:abcd:12::/64');
    expect(limitKey('2001:db8::5')).toBe('2001:db8:0:0::/64');
    expect(limitKey('::ffff:198.51.100.4')).toBe('::ffff:198.51.100.4');
    expect(limitKey(null)).toBe('unknown');
  });
});

describe('readCapped: never buffers more than it must', () => {
  it('reads a small body', async () => {
    expect(await readCapped(new Request('https://x/', { method: 'POST', body: 'hello' }), 10)).toBe('hello');
  });
  it('refuses a declared size over the cap without reading', async () => {
    const r = new Request('https://x/', { method: 'POST', body: 'x', headers: { 'content-length': '999999' } });
    expect(await readCapped(r, MAX_BODY)).toBeNull();
  });
  it('stops a chunked upload with no Content-Length the moment it passes the cap', async () => {
    let pulled = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(c) {
        pulled++;
        if (pulled > 100) return c.close();
        c.enqueue(new Uint8Array(1024));
      },
    });
    const r = new Request('https://x/', { method: 'POST', body: stream, duplex: 'half' } as RequestInit);
    expect(await readCapped(r, MAX_BODY)).toBeNull();
    expect(pulled).toBeLessThan(10);
  });
});

describe('POST /subscribe', () => {
  it('keeps the address and language, and says subscribed:true (never just a 200)', async () => {
    const f = fakeDb();
    const { res, body } = await send({ DB: f.db }, post({ email: 'Someone@Example.com', locale: 'fr', website: '' }));
    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true, subscribed: true });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://doubledone.app');
    const row = f.rows.get('someone@example.com');
    expect(row?.locale).toBe('fr');
    expect(row?.created_at).toBe(NOW);
    expect(row?.token).toMatch(/^[0-9a-f-]{36}$/);
    expect(f.sql[0]).toContain('CREATE TABLE IF NOT EXISTS subscribers');
  });

  it('stores no IP, no user id: only email, locale, time, token', async () => {
    const f = fakeDb();
    await send({ DB: f.db }, post({ email: 'a@b.co', locale: 'en' }));
    expect(Object.keys(f.rows.get('a@b.co')!).sort()).toEqual(['created_at', 'email', 'locale', 'token']);
    expect(f.sql.join(' ')).not.toMatch(/\bip\b|user_id/i);
  });

  it('never reveals whether an address is already on the list', async () => {
    const f = fakeDb();
    const first = await send({ DB: f.db }, post({ email: 'a@b.co' }));
    const again = await send({ DB: f.db }, post({ email: 'A@B.CO', locale: 'it' }));
    expect(again.res.status).toBe(first.res.status);
    expect(again.body).toEqual(first.body);
    expect(f.rows.size).toBe(1);
    expect(f.rows.get('a@b.co')?.locale).toBe('it');
  });

  it('answers a bot that fills the hidden field as if it worked, and keeps nothing', async () => {
    const f = fakeDb();
    const { body } = await send({ DB: f.db }, post({ email: 'bot@spam.example', website: 'http://x' }));
    expect(body).toEqual({ ok: true, subscribed: true });
    expect(f.rows.size).toBe(0);
  });

  it('refuses another site, a missing Origin, an oversized or bad body, and a bad address', async () => {
    const f = fakeDb();
    expect((await send({ DB: f.db }, post({ email: 'a@b.co' }, { origin: 'https://evil.example' }))).res.status).toBe(403);
    expect((await send({ DB: f.db }, post({ email: 'a@b.co' }, { origin: null }))).res.status).toBe(403);
    expect((await send({ DB: f.db }, post('not json'))).res.status).toBe(400);
    expect((await send({ DB: f.db }, post('"a string"'))).res.status).toBe(400);
    expect((await send({ DB: f.db }, post('x'.repeat(MAX_BODY + 1)))).res.status).toBe(400);
    const invalid = await send({ DB: f.db }, post({ email: 'nope' }));
    expect(invalid.res.status).toBe(400);
    expect(invalid.body).toEqual({ error: 'invalid' });
    expect(f.rows.size).toBe(0);
  });

  it('checks the origin and the rate limit BEFORE reading the body', async () => {
    let read = false;
    // highWaterMark 0: the stream is pulled only when someone actually reads it, never on its own.
    const body = new ReadableStream<Uint8Array>(
      {
        pull(c) {
          read = true;
          c.close();
        },
      },
      { highWaterMark: 0 },
    );
    const req = (origin: string) =>
      new Request('https://api.doubledone.app/subscribe', { method: 'POST', headers: { Origin: origin, 'content-type': 'application/json' }, body, duplex: 'half' } as RequestInit);
    expect((await send({ DB: fakeDb().db }, req('https://evil.example'))).res.status).toBe(403);
    expect(read).toBe(false);
    const limited: SubscribeEnv = { DB: fakeDb().db, SUBSCRIBE_LIMITER: { limit: async () => ({ success: false }) } };
    expect((await send(limited, req('https://doubledone.app'))).res.status).toBe(429);
    expect(read).toBe(false);
  });

  it('rate-limits per IP (IPv6 by its /64) before touching the list', async () => {
    const f = fakeDb();
    const keys: string[] = [];
    const env: SubscribeEnv = {
      DB: f.db,
      SUBSCRIBE_LIMITER: { limit: async ({ key }) => (keys.push(key), { success: keys.length <= 2 }) },
    };
    await send(env, post({ email: 'a@b.co' }, { ip: '2001:db8:1:2::10' }));
    await send(env, post({ email: 'c@d.co' }, { ip: '2001:db8:1:2::11' }));
    const third = await send(env, post({ email: 'e@f.co' }, { ip: '2001:db8:1:2:9:9:9:9' }));
    expect(third.res.status).toBe(429);
    expect(new Set(keys)).toEqual(new Set(['subscribe:2001:db8:1:2::/64']));
    expect(f.rows.has('e@f.co')).toBe(false);
  });

  it('stops taking new addresses past the daily ceiling, and starts again a day later', async () => {
    const f = fakeDb();
    for (let i = 0; i < DAILY_NEW_CAP; i++) f.rows.set(`p${i}@x.co`, { email: `p${i}@x.co`, locale: 'en', created_at: NOW - 1000, token: `t${i}` });
    const over = await send({ DB: f.db }, post({ email: 'late@x.co' }));
    expect(over.res.status).toBe(503);
    expect(over.body?.subscribed).toBeUndefined();
    expect(f.rows.has('late@x.co')).toBe(false);
    const nextDay = await send({ DB: f.db }, post({ email: 'late@x.co' }), NOW + 86_400_000);
    expect(nextDay.body).toEqual({ ok: true, subscribed: true });
  });

  it('is calm when D1 is missing or down: an error the page shows, never a false success', async () => {
    expect((await send({}, post({ email: 'a@b.co' }))).res.status).toBe(503);
    const down = await send({ DB: fakeDb({ fail: true }).db }, post({ email: 'a@b.co' }));
    expect(down.res.status).toBe(503);
    expect(down.body?.subscribed).toBeUndefined();
  });

  it('serves the page without JavaScript: a form post redirects back to the right anchor', async () => {
    const f = fakeDb();
    const ok = await handleSubscribe(post({ email: 'a@b.co', locale: 'de', website: '' }, { form: true }), { DB: f.db }, cors, allowed, NOW);
    expect(ok.status).toBe(303);
    expect(ok.headers.get('Location')).toBe('https://doubledone.app/#ddl-thanks');
    expect(f.rows.get('a@b.co')?.locale).toBe('de');
    const bad = await handleSubscribe(post({ email: 'nope' }, { form: true }), { DB: f.db }, cors, allowed, NOW);
    expect(bad.status).toBe(303);
    expect(bad.headers.get('Location')).toBe('https://doubledone.app/#ddl-oops');
  });
});

describe('unsubscribe: opening the link changes nothing, the button deletes', () => {
  async function seeded() {
    const f = fakeDb();
    await send({ DB: f.db }, post({ email: 'a@b.co' }));
    await send({ DB: f.db }, post({ email: 'c@d.co' }));
    return { f, token: f.rows.get('a@b.co')!.token };
  }

  it('GET shows a button and deletes nothing (mail scanners open every link)', async () => {
    const { f, token } = await seeded();
    const res = handleUnsubscribePage(new Request(`https://api.doubledone.app/unsubscribe?t=${token}`));
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('<form method="post"');
    expect(html).toContain('Leave the list');
    expect(f.rows.size).toBe(2);
  });

  it('POST deletes the right row outright, and says so', async () => {
    const { f, token } = await seeded();
    const res = await handleUnsubscribe(unsubPost(token), { DB: f.db });
    expect(await res.text()).toContain("You're off the list.");
    expect(f.rows.has('a@b.co')).toBe(false);
    expect(f.rows.has('c@d.co')).toBe(true);
  });

  it('takes the RFC 8058 one-click POST, and a mail client that uppercased the token', async () => {
    const { f, token } = await seeded();
    const oneClick = unsubPost(token.toUpperCase(), { body: 'List-Unsubscribe=One-Click', headers: { 'content-type': 'application/x-www-form-urlencoded' } });
    await handleUnsubscribe(oneClick, { DB: f.db });
    expect(f.rows.has('a@b.co')).toBe(false);
  });

  it('tells the truth when nothing matched, the link is broken, or D1 is down', async () => {
    const { f } = await seeded();
    const none = await handleUnsubscribe(unsubPost('00000000-0000-4000-8000-000000000000'), { DB: f.db });
    expect(await none.text()).toContain('not on the list');
    const broken = await handleUnsubscribe(unsubPost('nonsense'), { DB: f.db });
    expect(broken.status).toBe(400);
    expect(await broken.text()).toContain('support@doubledone.app');
    const down = await handleUnsubscribe(unsubPost('00000000-0000-4000-8000-000000000000'), { DB: fakeDb({ fail: true }).db });
    expect(down.status).toBe(503);
    expect(await down.text()).toContain("still on the list");
    expect(f.rows.size).toBe(2);
  });
});
