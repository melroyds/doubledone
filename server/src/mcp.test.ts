import { describe, expect, it } from 'vitest';

import {
  addTaskRequest,
  completeTaskRequest,
  decodeJwtEmail,
  decodeJwtSub,
  handleMcp,
  initializeResult,
  listTodayFromRows,
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

  it('list_today fetches open one-offs (due today or earlier) AND open recurring, for cadence filtering', () => {
    const { url, init } = listTodayRequest(env, 'tok', '2026-06-20');
    expect(init.method).toBe('GET');
    expect(url).toContain('/rest/v1/tasks?');
    const dec = decodeURIComponent(url);
    expect(dec).toContain('deleted_at=is.null');
    expect(dec).toContain('silent_parent=not.is.true');
    // the cadence fields come back so listTodayFromRows can decide
    expect(dec).toContain('completed_dates');
    expect(dec).toContain('skipped_dates');
    // one-off branch (open, undated or due<=today) OR any open recurring
    expect(dec).toContain('and(recurrence.is.null,done.is.false,or(due.is.null,due.lte.2026-06-20))');
    expect(dec).toContain('and(recurrence.not.is.null,done.is.false)');
  });

  it('listTodayFromRows keeps open one-offs, and recurring only when due-and-not-done-today', () => {
    const today = '2026-06-20'; // a Saturday (UTC)
    const rows = [
      { id: 'o1', title: 'One-off', recurrence: null }, // SQL-scoped one-off -> kept
      { id: 'd1', title: 'Daily due', recurrence: { kind: 'daily' }, completed_dates: [], skipped_dates: [] }, // kept
      { id: 'd2', title: 'Daily done today', recurrence: { kind: 'daily' }, completed_dates: [today] }, // dropped (done today)
      { id: 'd3', title: 'Daily skipped today', recurrence: { kind: 'daily' }, skipped_dates: [today] }, // dropped (skipped)
      { id: 'w1', title: 'Weekly Sat', recurrence: { kind: 'weekly', weekdays: [6] } }, // kept (Sat)
      { id: 'w2', title: 'Weekly Mon', recurrence: { kind: 'weekly', weekdays: [1] } }, // dropped (not today)
      { id: 'i1', title: 'Every 2d from anchor', recurrence: { kind: 'interval', days: 2, anchor: '2026-06-18' } }, // kept (2 days on)
      { id: 'i2', title: 'Every 2d off-beat', recurrence: { kind: 'interval', days: 2, anchor: '2026-06-19' } }, // dropped (1 day on)
      { id: 'f1', title: 'Future daily', recurrence: { kind: 'daily', start: '2026-07-01' } }, // dropped (not started)
    ];
    const kept = listTodayFromRows(rows, today).map((t) => t.id);
    expect(kept).toEqual(['o1', 'd1', 'w1', 'i1']);
  });

  it('listTodayFromRows is defensive: junk rows and a bad recurrence never throw or leak', () => {
    const today = '2026-06-20';
    const rows = [null, 42, { id: 'x' }, { title: 'no id' }, { id: 'b1', title: 'Bad rec', recurrence: { kind: 'weird' } }];
    expect(listTodayFromRows(rows, today)).toEqual([]);
    expect(listTodayFromRows('not-an-array', today)).toEqual([]);
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
