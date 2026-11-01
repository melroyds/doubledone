import { afterEach, describe, expect, it, vi } from 'vitest';

import worker, { type Env } from './index';
import type { D1LikeDatabase } from './telemetry';

const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    ANTHROPIC_API_KEY: 'test-key',
    AI_LIMITER: { limit: async () => ({ success: true }) },
    ...overrides,
  } as Env;
}

function req(method: string, path: string, opts: { origin?: string; body?: unknown } = {}): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (opts.origin) headers.Origin = opts.origin;
  return new Request('https://doubledone-ai.example.dev' + path, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
}

// The security gate is the point: no upstream Claude call is reached in any of
// these (403 / 429 / 400 / OPTIONS all return before the body is even read or
// before the AI fetch), so the tests never touch the network.
describe('CORS + origin gate', () => {
  it('echoes the allow-origin header for an allowed origin', async () => {
    const res = await worker.fetch(req('OPTIONS', '/clarify', { origin: 'https://doubledone.app' }), makeEnv(), ctx);
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://doubledone.app');
  });

  it('allows Cloudflare Pages preview subdomains', async () => {
    const res = await worker.fetch(req('OPTIONS', '/clarify', { origin: 'https://abc123.doubledone.pages.dev' }), makeEnv(), ctx);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://abc123.doubledone.pages.dev');
  });

  it('omits the allow-origin header for a disallowed origin', async () => {
    const res = await worker.fetch(req('OPTIONS', '/clarify', { origin: 'https://evil.example' }), makeEnv(), ctx);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('refuses a paid route from a disallowed browser origin', async () => {
    const res = await worker.fetch(req('POST', '/clarify', { origin: 'https://evil.example', body: { task: 'x' } }), makeEnv(), ctx);
    expect(res.status).toBe(403);
  });

  it('lets an allowed origin through the gate to validation', async () => {
    const res = await worker.fetch(req('POST', '/clarify', { origin: 'https://doubledone.app', body: {} }), makeEnv(), ctx);
    expect(res.status).toBe(400); // task required, reached before any upstream call
  });

  it('lets a native request (no Origin) through the gate', async () => {
    const res = await worker.fetch(req('POST', '/clarify', { body: {} }), makeEnv(), ctx);
    expect(res.status).toBe(400);
  });
});

describe('the app-event beacon (/event)', () => {
  it('refuses a browser from a foreign origin', async () => {
    const res = await worker.fetch(req('POST', '/event', { origin: 'https://evil.example', body: { name: 'settle.opened' } }), makeEnv(), ctx);
    expect(res.status).toBe(403);
  });

  it('accepts an allowlisted event and answers ok', async () => {
    const res = await worker.fetch(req('POST', '/event', { origin: 'https://doubledone.app', body: { name: 'settle.opened' } }), makeEnv(), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('accepts-and-drops an unknown name (probing teaches nothing)', async () => {
    let wrote = false;
    const env = makeEnv({
      DB: {
        prepare: () => {
          wrote = true;
          throw new Error('should not be reached');
        },
      } as never,
    });
    const res = await worker.fetch(req('POST', '/event', { origin: 'https://doubledone.app', body: { name: 'not.a.thing' } }), env, ctx);
    expect(res.status).toBe(200);
    expect(wrote).toBe(false);
  });

  it('answers a calm 400 to a non-JSON body', async () => {
    const r = new Request('https://doubledone-ai.example.dev/event', {
      method: 'POST',
      headers: { 'content-type': 'application/json', Origin: 'https://doubledone.app' },
      body: 'not json',
    });
    const res = await worker.fetch(r, makeEnv(), ctx);
    expect(res.status).toBe(400);
  });

  it('rate-limits /event on its OWN key, never spending the paid-AI window of a shared IP', async () => {
    const keys: string[] = [];
    const env = makeEnv({
      AI_LIMITER: {
        limit: async ({ key }: { key: string }) => {
          keys.push(key);
          return { success: true };
        },
      },
    });
    await worker.fetch(req('POST', '/event', { origin: 'https://doubledone.app', body: { name: 'settle.opened' } }), env, ctx);
    await worker.fetch(req('POST', '/clarify', { origin: 'https://doubledone.app', body: { task: 'x' } }), env, ctx);
    expect(keys[0]).toMatch(/^evt:/);
    expect(keys[1]).not.toMatch(/^evt:/);
  });
});

describe('rate limit', () => {
  it('returns 429 when the limiter rejects', async () => {
    const env = makeEnv({ AI_LIMITER: { limit: async () => ({ success: false }) } });
    const res = await worker.fetch(req('POST', '/clarify', { origin: 'https://doubledone.app', body: { task: 'x' } }), env, ctx);
    expect(res.status).toBe(429);
  });

  it('skips the limit cleanly when no binding is present', async () => {
    const env = makeEnv({ AI_LIMITER: undefined });
    const res = await worker.fetch(req('POST', '/clarify', { origin: 'https://doubledone.app', body: {} }), env, ctx);
    expect(res.status).toBe(400);
  });
});

describe('text AI route size cap', () => {
  it('413 when a text route body exceeds the cap (a cost backstop on top of the rate limit)', async () => {
    const res = await worker.fetch(req('POST', '/clarify', { origin: 'https://doubledone.app', body: { task: 'a'.repeat(120_000) } }), makeEnv(), ctx);
    expect(res.status).toBe(413);
  });

  it('exempts /ocr from the text cap (a photo is legitimately large; OCR has its own limit)', async () => {
    const res = await worker.fetch(req('POST', '/ocr', { origin: 'https://doubledone.app', body: { image: 'a'.repeat(120_000) } }), makeEnv(), ctx);
    expect(res.status).not.toBe(413); // not caught by the text cap; OCR's own larger limit governs
  });

  it('measures UTF-8 bytes, not characters (a multibyte body over the byte cap still 413s)', async () => {
    // 40k multibyte chars is only 40k UTF-16 units but ~120 KB of UTF-8, so a .length check would have
    // let it through. The byte measure must catch it.
    const res = await worker.fetch(req('POST', '/clarify', { origin: 'https://doubledone.app', body: { task: 'あ'.repeat(40_000) } }), makeEnv(), ctx);
    expect(res.status).toBe(413);
  });
});

describe('OCR (premium-gated)', () => {
  it('400 when no image is provided (validation runs before the gate)', async () => {
    const res = await worker.fetch(req('POST', '/ocr', { origin: 'https://doubledone.app', body: {} }), makeEnv(), ctx);
    expect(res.status).toBe(400);
  });

  it('413 when the image is too large (a server backstop on vision cost)', async () => {
    const res = await worker.fetch(
      req('POST', '/ocr', { origin: 'https://doubledone.app', body: { image: 'a'.repeat(2_000_000) } }),
      makeEnv(),
      ctx,
    );
    expect(res.status).toBe(413);
  });

  it('401 for a valid image with no token, and the denial carries CORS (not an opaque failure)', async () => {
    const res = await worker.fetch(
      req('POST', '/ocr', { origin: 'https://doubledone.app', body: { image: 'aGVsbG8=' } }),
      makeEnv(),
      ctx,
    );
    expect(res.status).toBe(401); // the premium gate is reached: no Bearer token
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://doubledone.app');
  });

  it('503 (fail closed) when a token is present but the entitlement store is unbound', async () => {
    const r = new Request('https://doubledone-ai.example.dev/ocr', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Origin: 'https://doubledone.app',
        Authorization: 'Bearer some-token',
      },
      body: JSON.stringify({ image: 'aGVsbG8=' }),
    });
    const res = await worker.fetch(r, makeEnv(), ctx); // makeEnv binds no DB / SUPABASE_URL
    expect(res.status).toBe(503);
  });
});

describe('Chart a course (premium-gated)', () => {
  it('400 when no goal is provided (validation runs before the gate)', async () => {
    const res = await worker.fetch(req('POST', '/chart', { origin: 'https://doubledone.app', body: {} }), makeEnv(), ctx);
    expect(res.status).toBe(400);
  });

  it('401 for a valid goal with no token, and the denial carries CORS (not an opaque failure)', async () => {
    const res = await worker.fetch(
      req('POST', '/chart', { origin: 'https://doubledone.app', body: { goal: 'run a half marathon' } }),
      makeEnv(),
      ctx,
    );
    expect(res.status).toBe(401); // the premium gate is reached: no Bearer token
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://doubledone.app');
  });

  it('503 (fail closed) when a token is present but the entitlement store is unbound', async () => {
    const r = new Request('https://doubledone-ai.example.dev/chart', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Origin: 'https://doubledone.app',
        Authorization: 'Bearer some-token',
      },
      body: JSON.stringify({ goal: 'run a half marathon' }),
    });
    const res = await worker.fetch(r, makeEnv(), ctx); // makeEnv binds no DB / SUPABASE_URL
    expect(res.status).toBe(503);
  });
});

describe('feedback', () => {
  it('400s when text is missing', async () => {
    const res = await worker.fetch(req('POST', '/feedback', { origin: 'https://doubledone.app', body: {} }), makeEnv(), ctx);
    expect(res.status).toBe(400);
  });

  it('refuses a disallowed browser origin', async () => {
    const res = await worker.fetch(req('POST', '/feedback', { origin: 'https://evil.example', body: { text: 'hi' } }), makeEnv(), ctx);
    expect(res.status).toBe(403);
  });

  it('503s when no send_email binding is configured', async () => {
    const res = await worker.fetch(req('POST', '/feedback', { origin: 'https://doubledone.app', body: { text: 'hi' } }), makeEnv(), ctx);
    expect(res.status).toBe(503);
  });

  it('sends the note and answers a plain ok when nobody signed in (no month can follow)', async () => {
    const sent: unknown[] = [];
    const env = makeEnv({ SEND_EMAIL: { send: async (m: unknown) => void sent.push(m) }, FEEDBACK_TO: 'inbox@example.com' } as never);
    const res = await worker.fetch(req('POST', '/feedback', { origin: 'https://doubledone.app', body: { text: 'Love the folds', ai: true } }), env, ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(sent).toHaveLength(1);
  });

  it('the eligibility route answers 401 JSON without a token, never the catch-all', async () => {
    const res = await worker.fetch(req('GET', '/gift/eligibility', { origin: 'https://doubledone.app' }), makeEnv(), ctx);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'sign_in_required' });
  });
});

describe('scrapbook', () => {
  it('runs the two-step AI pipeline and returns a data-url image + caption', async () => {
    const env = makeEnv({
      AI: {
        run: async (model: string) =>
          model.includes('flux') ? { image: 'BASE64IMG' } : { response: 'a quiet field at dawn' },
      },
    });
    const res = await worker.fetch(
      req('POST', '/scrapbook', { origin: 'https://doubledone.app', body: { titles: ['Booked dentist', 'Did laundry'] } }),
      env,
      ctx,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { image: string; caption: string };
    expect(body.image).toBe('data:image/jpeg;base64,BASE64IMG');
    expect(body.caption).toBe('a quiet field at dawn');
  });

  it('400s when titles are missing', async () => {
    const res = await worker.fetch(
      req('POST', '/scrapbook', { origin: 'https://doubledone.app', body: {} }),
      makeEnv({ AI: { run: async () => ({}) } }),
      ctx,
    );
    expect(res.status).toBe(400);
  });

  it('502s if the image step yields nothing', async () => {
    const env = makeEnv({
      AI: { run: async (model: string) => (model.includes('flux') ? {} : { response: 'scene' }) },
    });
    const res = await worker.fetch(
      req('POST', '/scrapbook', { origin: 'https://doubledone.app', body: { titles: ['x'] } }),
      env,
      ctx,
    );
    expect(res.status).toBe(502);
  });
});

describe('split', () => {
  it('400s when text is missing (reached before any upstream call)', async () => {
    const res = await worker.fetch(req('POST', '/split', { origin: 'https://doubledone.app', body: {} }), makeEnv(), ctx);
    expect(res.status).toBe(400);
  });

  it('refuses a disallowed browser origin before any upstream call', async () => {
    const res = await worker.fetch(req('POST', '/split', { origin: 'https://evil.example', body: { text: 'a and b' } }), makeEnv(), ctx);
    expect(res.status).toBe(403);
  });
});

describe('combine', () => {
  it('400s when fewer than two titles are given (reached before any upstream call)', async () => {
    const res = await worker.fetch(
      req('POST', '/combine', { origin: 'https://doubledone.app', body: { titles: ['only one'] } }),
      makeEnv(),
      ctx,
    );
    expect(res.status).toBe(400);
  });

  it('refuses a disallowed browser origin before any upstream call', async () => {
    const res = await worker.fetch(
      req('POST', '/combine', { origin: 'https://evil.example', body: { titles: ['a', 'b'] } }),
      makeEnv(),
      ctx,
    );
    expect(res.status).toBe(403);
  });
});

describe('health', () => {
  it('reports key presence without leaking it', async () => {
    const res = await worker.fetch(req('GET', '/health'), makeEnv(), ctx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; hasKey: boolean };
    expect(body.ok).toBe(true);
    expect(body.hasKey).toBe(true);
  });
});

describe('scrapbook purge (R2 delete on account deletion)', () => {
  it('deletes each given untagged key and reports the count (the ownership rules: scrapbook-purge.test.ts)', async () => {
    const A = '0b9a7c3e-1f2d-4c5b-8a6e-9d0f1e2a3b4c.jpg';
    const B = '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f.jpg';
    const deleted: string[] = [];
    const SCRAPBOOKS = {
      put: async () => undefined,
      get: async () => null,
      head: async () => ({}),
      delete: async (k: string) => {
        deleted.push(k);
      },
    };
    const res = await worker.fetch(
      req('POST', '/scrapbook/purge', { origin: 'https://doubledone.app', body: { keys: [A, B] } }),
      makeEnv({ SCRAPBOOKS }),
      ctx,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, deleted: 2, refused: 0 });
    expect(deleted).toEqual([A, B]);
  });

  it('is a no-op when R2 is unbound', async () => {
    const res = await worker.fetch(
      req('POST', '/scrapbook/purge', { origin: 'https://doubledone.app', body: { keys: ['0b9a7c3e-1f2d-4c5b-8a6e-9d0f1e2a3b4c.jpg'] } }),
      makeEnv({ SCRAPBOOKS: undefined }),
      ctx,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, deleted: 0, refused: 0 });
  });
});

/** A D1 double that records every statement it is asked to prepare, answers `all` with `rows`, and can fail its writes. */
function recordingDb(opts: { rows?: unknown[]; failWrites?: boolean } = {}): D1LikeDatabase & { sql: string[] } {
  const sql: string[] = [];
  return {
    sql,
    prepare(q: string) {
      sql.push(q);
      const stmt = {
        bind: () => stmt,
        run: async () => {
          if (opts.failWrites) throw new Error('d1 down');
          return {};
        },
        first: async () => null,
        all: async () => ({ results: (q.includes('FROM push_subs') ? (opts.rows ?? []) : []) as never[] }),
      };
      return stmt;
    },
  };
}

// #17 (2026-11-01): the route answered ok before the write ran (ctx.waitUntil), so a failed save looked like a
// success and the browser never sent it again. Now ok means stored.
describe('web push subscribe: ok means stored (#17)', () => {
  const body = { subscription: { endpoint: 'https://push.example/abc', keys: { p256dh: 'KEY', auth: 'AUTH' } }, hour: 8, tzOffset: -630 };

  it('answers ok once the subscription is stored', async () => {
    const DB = recordingDb();
    const res = await worker.fetch(req('POST', '/push/subscribe', { origin: 'https://doubledone.app', body }), makeEnv({ DB }), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(DB.sql.some((q) => q.startsWith('INSERT INTO push_subs'))).toBe(true);
  });

  it('answers 503 with CORS when the save fails, so the browser tries again on its next open', async () => {
    const res = await worker.fetch(req('POST', '/push/subscribe', { origin: 'https://doubledone.app', body }), makeEnv({ DB: recordingDb({ failWrites: true }) }), ctx);
    expect(res.status).toBe(503);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://doubledone.app');
  });

  it('answers 503 when no store is bound: nothing was saved', async () => {
    const res = await worker.fetch(req('POST', '/push/subscribe', { origin: 'https://doubledone.app', body }), makeEnv(), ctx);
    expect(res.status).toBe(503);
  });
});

// #18 (2026-11-01): the cron runs every 15 minutes so a half-hour zone gets its nudge on the hour, and everything
// else that rode the hourly tick still runs once an hour, on the :00 tick.
describe('the cron: nudges every quarter hour, the hourly work on the :00 tick only (#18)', () => {
  afterEach(() => vi.unstubAllGlobals());

  const tick = (iso: string) => ({ scheduledTime: Date.parse(iso), cron: '*/15 * * * *', noRetry() {} }) as unknown as ScheduledController;
  function collecting(): { ctx: ExecutionContext; settle: () => Promise<unknown> } {
    const pending: Promise<unknown>[] = [];
    return {
      ctx: { waitUntil: (p: Promise<unknown>) => void pending.push(p), passThroughOnException() {} } as unknown as ExecutionContext,
      settle: () => Promise.all(pending),
    };
  }
  async function vapidKey(): Promise<string> {
    const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
    return JSON.stringify(await crypto.subtle.exportKey('jwk', pair.privateKey));
  }
  const SUBS = [
    { endpoint: 'https://push.example/adelaide', hour: 8, tz_offset: -630 },
    { endpoint: 'https://push.example/nepal', hour: 8, tz_offset: -345 },
    { endpoint: 'https://push.example/newfoundland', hour: 8, tz_offset: 210 },
    { endpoint: 'https://push.example/melbourne', hour: 9, tz_offset: -660 },
  ];

  /** Run one tick and report which endpoints were pushed, whether the heartbeat was pinged, and what D1 was asked. */
  async function run(iso: string) {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) => {
        calls.push(String(input));
        return new Response(null, { status: 201 });
      }),
    );
    const DB = recordingDb({ rows: SUBS });
    const { ctx: c, settle } = collecting();
    await worker.scheduled(tick(iso), makeEnv({ DB, VAPID_PRIVATE_KEY: await vapidKey(), HEARTBEAT_URL: 'https://hc.example/ping' }), c);
    await settle();
    return { pushed: calls.filter((u) => u.startsWith('https://push.example/')), heartbeat: calls.includes('https://hc.example/ping'), sql: DB.sql };
  }

  it('each half-hour and 45-minute zone is nudged on its own quarter hour, on the hour locally', async () => {
    expect((await run('2026-11-01T21:30:00Z')).pushed).toEqual(['https://push.example/adelaide']); // 08:00 ACDT
    expect((await run('2026-11-01T02:15:00Z')).pushed).toEqual(['https://push.example/nepal']); // 08:00 NPT
    expect((await run('2026-11-01T11:30:00Z')).pushed).toEqual(['https://push.example/newfoundland']); // 08:00 at UTC-3:30
    expect((await run('2026-11-01T22:00:00Z')).pushed).toEqual(['https://push.example/melbourne']); // 09:00 AEDT
  });

  it('a :15, :30 or :45 tick sends the nudges and nothing hourly: no heartbeat, no sweep, no purge', async () => {
    for (const iso of ['2026-11-01T21:15:00Z', '2026-11-01T21:30:00Z', '2026-11-01T21:45:00Z']) {
      const r = await run(iso);
      expect(r.sql.some((q) => q.includes('FROM push_subs')), iso).toBe(true);
      expect(r.heartbeat, iso).toBe(false);
      expect(r.sql.some((q) => q.includes('scrapbook_log') || q.includes('breakdown_counts')), iso).toBe(false);
      vi.unstubAllGlobals();
    }
  });

  it('the :00 tick also pings the heartbeat and runs both purges, once an hour as before', async () => {
    const r = await run('2026-11-01T21:00:00Z');
    expect(r.sql.some((q) => q.includes('FROM push_subs'))).toBe(true);
    expect(r.heartbeat).toBe(true);
    expect(r.sql.some((q) => q.startsWith('DELETE FROM scrapbook_log'))).toBe(true);
    expect(r.sql.some((q) => q.startsWith('DELETE FROM breakdown_counts'))).toBe(true);
  });
});

// PR A (2026-09-25): the money routes are origin-gated for BROWSER callers like the AI routes. A foreign
// Origin is refused before the handler; a missing Origin (native apps) reaches the handler, whose own
// verified-bearer check then answers. Handlers are tested in stripe.test.ts; this proves the gate.
describe('the money routes: origin gate before the verified bearer', () => {
  const routes: [string, string][] = [
    ['POST', '/checkout'],
    ['POST', '/portal'],
    ['POST', '/account/close-billing'],
    ['GET', '/entitlement'],
  ];
  for (const [method, path] of routes) {
    it(`${method} ${path} refuses a foreign browser origin (403) before anything else`, async () => {
      const res = await worker.fetch(req(method, path, { origin: 'https://evil.example', body: method === 'POST' ? {} : undefined }), makeEnv(), ctx);
      expect(res.status).toBe(403);
    });
    it(`${method} ${path} lets a native caller (no Origin) reach the handler, which asks for sign-in`, async () => {
      const res = await worker.fetch(req(method, path, { body: method === 'POST' ? {} : undefined }), makeEnv(), ctx);
      expect(res.status).toBe(401); // sign_in_required: no bearer, past the gate
    });
    it(`${method} ${path} lets the app's own origin through the gate`, async () => {
      const res = await worker.fetch(req(method, path, { origin: 'https://doubledone.app', body: method === 'POST' ? {} : undefined }), makeEnv(), ctx);
      expect(res.status).toBe(401);
    });
  }
});
