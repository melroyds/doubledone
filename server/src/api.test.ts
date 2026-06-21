import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createRequest,
  deleteRequest,
  handleApi,
  listRequest,
  newTaskId,
  parseCreate,
  parseUpdate,
  toApiTask,
  updateRequest,
} from './api';

const env = { SUPABASE_URL: 'https://sb.example.co', SUPABASE_ANON_KEY: 'anon-key' };

// A minimal unsigned JWT carrying just a `sub` (decodeJwtSub reads the payload only;
// Supabase verifies the signature on the real REST call, the API never does).
function fakeJwt(sub: string): string {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'none' })}.${b64({ sub })}.sig`;
}

function req(method: string, path: string, opts: { token?: string; body?: unknown } = {}): Request {
  const headers: Record<string, string> = {};
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  return new Request('https://doubledone-ai.example.dev' + path, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
}

describe('toApiTask', () => {
  it('maps a row to the public camelCase shape', () => {
    expect(
      toApiTask({ id: 't1', title: 'A', done: true, due: '2026-06-21', created_at: 'c', completed_at: 'd' }),
    ).toEqual({ id: 't1', title: 'A', done: true, due: '2026-06-21', createdAt: 'c', completedAt: 'd' });
  });
  it('defaults the nullable fields', () => {
    const t = toApiTask({ id: 't2', title: 'B', done: false });
    expect(t.due).toBeNull();
    expect(t.completedAt).toBeNull();
  });
});

describe('request builders', () => {
  it('listRequest adds the today filters only when asked', () => {
    expect(listRequest(env, 'tok').url).not.toContain('due.lte');
    expect(listRequest(env, 'tok', { today: true, todayIso: '2026-06-21' }).url).toContain('due.lte.2026-06-21');
  });

  it('createRequest POSTs the user_id, title, and done:false', () => {
    const { url, init } = createRequest(env, 'tok', { id: 'api-1', userId: 'u1', title: 'Buy milk', due: null, now: 'N' });
    expect(url).toContain('/rest/v1/tasks');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({ id: 'api-1', user_id: 'u1', title: 'Buy milk', done: false });
  });

  it('updateRequest stamps completed_at when done is set true', () => {
    const body = JSON.parse(updateRequest(env, 'tok', 't1', { done: true }, 'NOW').init.body as string);
    expect(body.done).toBe(true);
    expect(body.completed_at).toBe('NOW');
  });

  it('deleteRequest soft-deletes via a PATCH on deleted_at', () => {
    const { init } = deleteRequest(env, 'tok', 't1', 'NOW');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body as string).deleted_at).toBe('NOW');
  });
});

describe('parseCreate', () => {
  it('requires a non-empty title', () => {
    expect(parseCreate({ title: 'x' })).toEqual({ body: { title: 'x', due: null } });
    expect('error' in parseCreate({})).toBe(true);
    expect('error' in parseCreate({ title: '  ' })).toBe(true);
  });
  it('validates due as an ISO date', () => {
    expect(parseCreate({ title: 'x', due: '2026-06-21' })).toEqual({ body: { title: 'x', due: '2026-06-21' } });
    expect('error' in parseCreate({ title: 'x', due: 'soon' })).toBe(true);
  });
});

describe('parseUpdate', () => {
  it('accepts any of title / done / due', () => {
    expect(parseUpdate({ done: true })).toEqual({ body: { done: true } });
    expect(parseUpdate({ due: null })).toEqual({ body: { due: null } });
  });
  it('rejects an empty patch or an empty title', () => {
    expect('error' in parseUpdate({})).toBe(true);
    expect('error' in parseUpdate({ title: '' })).toBe(true);
  });
});

describe('newTaskId', () => {
  it('is api-prefixed for legible provenance', () => {
    expect(newTaskId(0, 'abc')).toBe('api-0-abc');
  });
});

describe('handleApi', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('serves the OpenAPI spec without a token', async () => {
    const res = await handleApi(req('GET', '/api/v1/openapi.json'), env);
    expect(res.status).toBe(200);
    const spec = (await res.json()) as { openapi: string; paths: Record<string, unknown> };
    expect(spec.openapi).toBe('3.1.0');
    expect(spec.paths).toHaveProperty('/tasks');
  });

  it('serves the Swagger UI page without a token', async () => {
    const res = await handleApi(req('GET', '/api/v1/docs'), env);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
  });

  it('401s a task call with no token', async () => {
    expect((await handleApi(req('GET', '/api/v1/tasks'), env)).status).toBe(401);
  });

  it('lists tasks for a valid token (mocked Supabase)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => [{ id: 't1', title: 'A', done: false, due: null, created_at: 'c', completed_at: null }],
      }) as unknown as Response),
    );
    const res = await handleApi(req('GET', '/api/v1/tasks', { token: fakeJwt('u1') }), env);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { tasks: { id: string }[] }).tasks[0].id).toBe('t1');
  });

  it('creates a task and returns 201', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => [{ id: 'api-1', title: 'Buy milk', done: false, due: null, created_at: 'c', completed_at: null }],
      }) as unknown as Response),
    );
    const res = await handleApi(req('POST', '/api/v1/tasks', { token: fakeJwt('u1'), body: { title: 'Buy milk' } }), env);
    expect(res.status).toBe(201);
    expect(((await res.json()) as { task: { title: string } }).task.title).toBe('Buy milk');
  });

  it('400s a create with no title', async () => {
    expect((await handleApi(req('POST', '/api/v1/tasks', { token: fakeJwt('u1'), body: {} }), env)).status).toBe(400);
  });

  it('204s a delete', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => [{}] }) as unknown as Response));
    expect((await handleApi(req('DELETE', '/api/v1/tasks/t1', { token: fakeJwt('u1') }), env)).status).toBe(204);
  });

  it('404s an unknown path under /api/v1', async () => {
    expect((await handleApi(req('GET', '/api/v1/nope', { token: fakeJwt('u1') }), env)).status).toBe(404);
  });
});
