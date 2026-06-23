import { describe, expect, it } from 'vitest';

import worker, { type Env } from './index';

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
  it('deletes each given key and reports the count', async () => {
    const deleted: string[] = [];
    const SCRAPBOOKS = {
      put: async () => undefined,
      get: async () => null,
      delete: async (k: string) => {
        deleted.push(k);
      },
    };
    const res = await worker.fetch(
      req('POST', '/scrapbook/purge', { origin: 'https://doubledone.app', body: { keys: ['a.jpg', 'b.jpg'] } }),
      makeEnv({ SCRAPBOOKS }),
      ctx,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, deleted: 2 });
    expect(deleted).toEqual(['a.jpg', 'b.jpg']);
  });

  it('is a no-op when R2 is unbound', async () => {
    const res = await worker.fetch(
      req('POST', '/scrapbook/purge', { origin: 'https://doubledone.app', body: { keys: ['a.jpg'] } }),
      makeEnv({ SCRAPBOOKS: undefined }),
      ctx,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, deleted: 0 });
  });
});
