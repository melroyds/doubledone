import { describe, expect, it } from 'vitest';

import {
  addTaskRequest,
  completeTaskRequest,
  decodeJwtEmail,
  decodeJwtSub,
  handleMcp,
  initializeResult,
  listTodayRequest,
  type McpEnv,
  toolsListResult,
} from './mcp';

const env: McpEnv = { SUPABASE_URL: 'https://proj.supabase.co', SUPABASE_ANON_KEY: 'anon-key' };
const jwt = (claims: object) => `header.${btoa(JSON.stringify(claims))}.sig`;

function mcpReq(payload: object, auth?: string): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (auth) headers.Authorization = auth;
  return new Request('https://doubledone-ai.example/mcp', { method: 'POST', headers, body: JSON.stringify(payload) });
}

describe('decodeJwtSub', () => {
  it('reads the sub claim from a bearer JWT', () => {
    expect(decodeJwtSub(jwt({ sub: 'user-123', role: 'authenticated' }))).toBe('user-123');
  });
  it('returns null for a malformed token or missing sub', () => {
    expect(decodeJwtSub('not-a-jwt')).toBeNull();
    expect(decodeJwtSub(jwt({ role: 'authenticated' }))).toBeNull();
  });
});

describe('decodeJwtEmail', () => {
  it('reads the email claim from a bearer JWT', () => {
    expect(decodeJwtEmail(jwt({ sub: 'user-123', email: 'a@b.co' }))).toBe('a@b.co');
  });
  it('returns null for a malformed token or missing email', () => {
    expect(decodeJwtEmail('not-a-jwt')).toBeNull();
    expect(decodeJwtEmail(jwt({ sub: 'user-123' }))).toBeNull();
  });
});

describe('supabase request builders', () => {
  it('add_task posts a new row with the user_id and done=false', () => {
    const { url, init } = addTaskRequest(env, 'tok', { id: 't1', userId: 'u1', title: 'Call mum', now: '2026-06-20T00:00:00.000Z' });
    expect(url).toBe('https://proj.supabase.co/rest/v1/tasks');
    expect(init.method).toBe('POST');
    const h = init.headers as Record<string, string>;
    expect(h.apikey).toBe('anon-key');
    expect(h.authorization).toBe('Bearer tok');
    const row = JSON.parse(init.body as string);
    expect(row).toMatchObject({ id: 't1', user_id: 'u1', title: 'Call mum', done: false });
  });

  it('list_today filters to open, non-future, non-recurring, non-deleted, non-silent-parent', () => {
    const { url, init } = listTodayRequest(env, 'tok', '2026-06-20');
    expect(init.method).toBe('GET');
    expect(url).toContain('/rest/v1/tasks?');
    expect(decodeURIComponent(url)).toContain('done=is.false');
    expect(decodeURIComponent(url)).toContain('deleted_at=is.null');
    expect(decodeURIComponent(url)).toContain('recurrence=is.null');
    expect(decodeURIComponent(url)).toContain('silent_parent=not.is.true');
    expect(decodeURIComponent(url)).toContain('due.lte.2026-06-20');
  });

  it('complete_task patches the row by id to done', () => {
    const { url, init } = completeTaskRequest(env, 'tok', 't1', '2026-06-20T00:00:00.000Z');
    expect(init.method).toBe('PATCH');
    expect(decodeURIComponent(url)).toContain('id=eq.t1');
    const patch = JSON.parse(init.body as string);
    expect(patch.done).toBe(true);
    expect(patch.completed_at).toBe('2026-06-20T00:00:00.000Z');
  });
});

describe('protocol envelopes', () => {
  it('initialize echoes the client protocol version and advertises tools', () => {
    const r = initializeResult('2025-03-26') as { protocolVersion: string; capabilities: { tools: object }; serverInfo: { name: string } };
    expect(r.protocolVersion).toBe('2025-03-26');
    expect(r.capabilities.tools).toBeDefined();
    expect(r.serverInfo.name).toBe('doubledone');
  });
  it('tools/list exposes the three task tools', () => {
    const r = toolsListResult() as { tools: { name: string }[] };
    expect(r.tools.map((t) => t.name)).toEqual(['add_task', 'list_today', 'complete_task']);
  });
});

describe('handleMcp', () => {
  it('answers initialize with the server info (no auth needed)', async () => {
    const res = await handleMcp(mcpReq({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }), env);
    const body = (await res.json()) as { result: { serverInfo: { name: string } } };
    expect(body.result.serverInfo.name).toBe('doubledone');
  });

  it('lists tools without auth', async () => {
    const res = await handleMcp(mcpReq({ jsonrpc: '2.0', id: 2, method: 'tools/list' }), env);
    const body = (await res.json()) as { result: { tools: unknown[] } };
    expect(body.result.tools).toHaveLength(3);
  });

  it('tools/call without a token returns a calm isError result, never reaching Supabase', async () => {
    const res = await handleMcp(mcpReq({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'list_today', arguments: {} } }), env);
    const body = (await res.json()) as { result: { isError?: boolean; content: { text: string }[] } };
    expect(body.result.isError).toBe(true);
    expect(body.result.content[0].text).toMatch(/token/i);
  });

  it('answers an unknown method with a JSON-RPC method-not-found error', async () => {
    const res = await handleMcp(mcpReq({ jsonrpc: '2.0', id: 4, method: 'frobnicate' }), env);
    const body = (await res.json()) as { error: { code: number } };
    expect(body.error.code).toBe(-32601);
  });

  it('acks notifications with 202 and no body', async () => {
    const res = await handleMcp(mcpReq({ jsonrpc: '2.0', method: 'notifications/initialized' }), env);
    expect(res.status).toBe(202);
  });
});
