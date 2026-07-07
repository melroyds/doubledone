import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  addDaysIso,
  addTaskRequest,
  BREAKDOWN_HOURLY_CAP,
  breakdownRateKey,
  completeTaskRequest,
  decodeJwtEmail,
  decodeJwtSub,
  deleteTaskRequest,
  fetchNotFoundDoc,
  fetchResultFrom,
  fetchTaskRequest,
  formatBreakdown,
  handleMcp,
  initializeResult,
  listTodayFromRows,
  listTodayRequest,
  listUpcomingFromRows,
  listUpcomingRequest,
  type McpEnv,
  searchResultsFrom,
  searchTasksRequest,
  toolsListResult,
  updateTaskRequest,
  upcomingWindow,
} from './mcp';

const env: McpEnv = { SUPABASE_URL: 'https://proj.supabase.co', SUPABASE_ANON_KEY: 'anon-key' };
const jwt = (claims: object) => `header.${btoa(JSON.stringify(claims))}.sig`;
// A JWT with a real sub, so runTool gets past decodeJwtSub in the handleMcp integration tests.
const USER_JWT = `Bearer ${jwt({ sub: 'user-9', role: 'authenticated' })}`;

/** A minimal fetch Response double: ok + a JSON body. */
function jsonRes(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as unknown as Response;
}

/** Call a tools/call and return the parsed tool result. */
async function callTool(name: string, args: object, auth = USER_JWT, e: McpEnv = env) {
  const res = await handleMcp(mcpReq({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }, auth), e);
  return (await res.json()) as { result: { isError?: boolean; content: { text: string }[] } };
}

function mcpReq(payload: object, auth?: string, extra?: Record<string, string>): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json', ...extra };
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
  it('tools/list exposes the full tool set, add_task/list_today/complete_task first (unchanged)', () => {
    const r = toolsListResult() as { tools: { name: string }[] };
    const names = r.tools.map((t) => t.name);
    // The original three still exist and still work.
    expect(names).toContain('add_task');
    expect(names).toContain('list_today');
    expect(names).toContain('complete_task');
    // The new tools are all present.
    expect(names).toEqual(
      expect.arrayContaining(['list_upcoming', 'update_task', 'delete_task', 'break_down', 'search', 'fetch']),
    );
  });
});

describe('handleMcp', () => {
  it('answers initialize with the server info (no auth needed)', async () => {
    const res = await handleMcp(mcpReq({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }), env);
    const body = (await res.json()) as { result: { serverInfo: { name: string } } };
    expect(body.result.serverInfo.name).toBe('doubledone');
  });

  it('assigns a Streamable-HTTP session id on initialize and exposes it to browsers (claude.ai web)', async () => {
    const res = await handleMcp(mcpReq({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }), env);
    // The session id lets a browser client hold the connection; without CORS exposure it cannot read it.
    expect(res.headers.get('Mcp-Session-Id')).toBeTruthy();
    expect((res.headers.get('Access-Control-Expose-Headers') ?? '').toLowerCase()).toContain('mcp-session-id');
    // Stateless: a follow-up call echoing that session id is still served (we do not validate it).
    const followUp = await handleMcp(
      mcpReq({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, undefined, { 'Mcp-Session-Id': res.headers.get('Mcp-Session-Id') as string }),
      env,
    );
    expect(followUp.status).toBe(200);
  });

  it('lists tools without auth', async () => {
    const res = await handleMcp(mcpReq({ jsonrpc: '2.0', id: 2, method: 'tools/list' }), env);
    const body = (await res.json()) as { result: { tools: unknown[] } };
    expect(body.result.tools.length).toBeGreaterThanOrEqual(9);
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

// ---------------------------------------------------------------------------
// Tier 2 / 3 / 1 additions
// ---------------------------------------------------------------------------

describe('add_task request builder (due / repeat additions)', () => {
  it('a plain add is byte-for-byte the original (no due, no recurrence keys)', () => {
    const { init } = addTaskRequest(env, 'tok', { id: 't1', userId: 'u1', title: 'Call mum', now: '2026-06-20T00:00:00.000Z' });
    const row = JSON.parse(init.body as string);
    expect(row).toMatchObject({ id: 't1', user_id: 'u1', title: 'Call mum', done: false });
    expect(row).not.toHaveProperty('due');
    expect(row).not.toHaveProperty('recurrence');
  });

  it('writes due when given, into the same column sync uses', () => {
    const { init } = addTaskRequest(env, 'tok', { id: 't1', userId: 'u1', title: 'Dentist', now: 'N', due: '2026-07-10' });
    expect(JSON.parse(init.body as string).due).toBe('2026-07-10');
  });

  it('writes the recurrence object when given', () => {
    const rec = { kind: 'daily', start: '2026-06-20' } as const;
    const { init } = addTaskRequest(env, 'tok', { id: 't1', userId: 'u1', title: 'Meds', now: 'N', recurrence: rec });
    expect(JSON.parse(init.body as string).recurrence).toEqual(rec);
  });
});

describe('update_task request builder', () => {
  it('always bumps updated_at and PATCHes by id', () => {
    const { url, init } = updateTaskRequest(env, 'tok', 't1', { title: 'New' }, '2026-06-20T00:00:00.000Z');
    expect(init.method).toBe('PATCH');
    expect(decodeURIComponent(url)).toContain('id=eq.t1');
    const patch = JSON.parse(init.body as string);
    expect(patch.updated_at).toBe('2026-06-20T00:00:00.000Z');
    expect(patch.title).toBe('New');
  });

  it('setting a due date clears any recurrence (one-off wins)', () => {
    const { init } = updateTaskRequest(env, 'tok', 't1', { due: '2026-07-01' }, 'N');
    const patch = JSON.parse(init.body as string);
    expect(patch.due).toBe('2026-07-01');
    expect(patch.recurrence).toBeNull();
  });

  it('setting a recurrence clears any due date (repeat wins)', () => {
    const { init } = updateTaskRequest(env, 'tok', 't1', { recurrence: { kind: 'daily', start: '2026-06-20' } }, 'N');
    const patch = JSON.parse(init.body as string);
    expect(patch.recurrence).toEqual({ kind: 'daily', start: '2026-06-20' });
    expect(patch.due).toBeNull();
  });

  it('null due / null recurrence clear the field WITHOUT touching the other', () => {
    const dueCleared = JSON.parse(updateTaskRequest(env, 'tok', 't1', { due: null }, 'N').init.body as string);
    expect(dueCleared.due).toBeNull();
    expect(dueCleared).not.toHaveProperty('recurrence'); // clearing a due doesn't force-null recurrence
    const recCleared = JSON.parse(updateTaskRequest(env, 'tok', 't1', { recurrence: null }, 'N').init.body as string);
    expect(recCleared.recurrence).toBeNull();
    expect(recCleared).not.toHaveProperty('due');
  });

  it('only sends the fields provided (a partial PATCH)', () => {
    const patch = JSON.parse(updateTaskRequest(env, 'tok', 't1', {}, 'N').init.body as string);
    expect(Object.keys(patch)).toEqual(['updated_at']); // nothing but the timestamp
  });
});

describe('delete_task request builder (soft tombstone)', () => {
  it('PATCHes deleted_at + updated_at, never a hard DELETE', () => {
    const { url, init } = deleteTaskRequest(env, 'tok', 't1', '2026-06-20T00:00:00.000Z');
    expect(init.method).toBe('PATCH');
    expect(decodeURIComponent(url)).toContain('id=eq.t1');
    const patch = JSON.parse(init.body as string);
    expect(patch.deleted_at).toBe('2026-06-20T00:00:00.000Z');
    expect(patch.updated_at).toBe('2026-06-20T00:00:00.000Z');
  });
});

describe('list_upcoming windowing + mapping', () => {
  it('upcomingWindow clamps days to 1..30 (default 7) and computes the end day', () => {
    expect(upcomingWindow(undefined, '2026-06-20')).toEqual({ count: 7, endIso: '2026-06-27' });
    expect(upcomingWindow(1, '2026-06-20')).toEqual({ count: 1, endIso: '2026-06-21' });
    expect(upcomingWindow(30, '2026-06-20').count).toBe(30);
    expect(upcomingWindow(999, '2026-06-20').count).toBe(30); // clamped high
    expect(upcomingWindow(0, '2026-06-20').count).toBe(1); // clamped low
    expect(upcomingWindow(-5, '2026-06-20').count).toBe(1);
    expect(upcomingWindow('nope', '2026-06-20').count).toBe(7); // bad type -> default
  });

  it('addDaysIso does UTC calendar math, including month/year roll', () => {
    expect(addDaysIso('2026-06-20', 1)).toBe('2026-06-21');
    expect(addDaysIso('2026-06-30', 1)).toBe('2026-07-01');
    expect(addDaysIso('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('listUpcomingRequest scopes to future one-offs in-window OR any open recurring', () => {
    const { url } = listUpcomingRequest(env, 'tok', '2026-06-20', '2026-06-27');
    const dec = decodeURIComponent(url);
    expect(dec).toContain('deleted_at=is.null');
    expect(dec).toContain('silent_parent=not.is.true');
    expect(dec).toContain('and(recurrence.is.null,done.is.false,due.gt.2026-06-20,due.lte.2026-06-27)');
    expect(dec).toContain('and(recurrence.not.is.null,done.is.false)');
  });

  it('maps future one-offs by their due day and each recurring task to its NEXT occurrence, in date order', () => {
    const today = '2026-06-20'; // Saturday
    const rows = [
      { id: 'o1', title: 'Dentist', recurrence: null, due: '2026-06-24' }, // one-off Wed
      { id: 'd1', title: 'Daily meds', recurrence: { kind: 'daily' } }, // next = tomorrow
      { id: 'w1', title: 'Weekly Mon', recurrence: { kind: 'weekly', weekdays: [1] } }, // next Monday = 22nd
      { id: 'i1', title: 'Every 3d', recurrence: { kind: 'interval', days: 3, anchor: '2026-06-20' } }, // next = 23rd
    ];
    const out = listUpcomingFromRows(rows, today, 7);
    expect(out).toEqual([
      { id: 'd1', title: 'Daily meds', when: '2026-06-21' },
      { id: 'w1', title: 'Weekly Mon', when: '2026-06-22' },
      { id: 'i1', title: 'Every 3d', when: '2026-06-23' },
      { id: 'o1', title: 'Dentist', when: '2026-06-24' },
    ]);
  });

  it('skips a recurring task whose next occurrence is already done/skipped, taking the one after', () => {
    const today = '2026-06-20';
    // Daily, but tomorrow (21st) is already ticked -> next shown is the 22nd.
    const rows = [{ id: 'd1', title: 'Meds', recurrence: { kind: 'daily' }, completed_dates: ['2026-06-21'] }];
    expect(listUpcomingFromRows(rows, today, 7)).toEqual([{ id: 'd1', title: 'Meds', when: '2026-06-22' }]);
  });

  it('drops a recurring task with no occurrence inside the window', () => {
    const today = '2026-06-20';
    const rows = [{ id: 'w1', title: 'Weekly Mon', recurrence: { kind: 'weekly', weekdays: [1] } }];
    expect(listUpcomingFromRows(rows, today, 1)).toEqual([]); // only tomorrow (Sun) is in-window, not Monday
  });

  it('is defensive: junk rows never throw or leak', () => {
    expect(listUpcomingFromRows('nope', '2026-06-20', 7)).toEqual([]);
    expect(listUpcomingFromRows([null, 5, { id: 'x' }, { title: 'no id' }], '2026-06-20', 7)).toEqual([]);
  });
});

describe('OpenAI deep-research shapes (search / fetch)', () => {
  it('searchTasksRequest fetches open, non-deleted, non-silent-parent tasks', () => {
    const dec = decodeURIComponent(searchTasksRequest(env, 'tok').url);
    expect(dec).toContain('deleted_at=is.null');
    expect(dec).toContain('silent_parent=not.is.true');
    expect(dec).toContain('done=is.false');
  });

  it('searchResultsFrom returns the { id, title, url } shape, case-insensitively, capped', () => {
    const rows = [
      { id: 'a', title: 'Buy MILK' },
      { id: 'b', title: 'Call plumber' },
      { id: 'c', title: 'milk the routine' },
    ];
    const r = searchResultsFrom(rows, 'milk');
    expect(r).toEqual([
      { id: 'a', title: 'Buy MILK', url: 'https://doubledone.app' },
      { id: 'c', title: 'milk the routine', url: 'https://doubledone.app' },
    ]);
  });

  it('searchResultsFrom returns everything for an empty query (the connector probe) and respects the cap', () => {
    const rows = Array.from({ length: 30 }, (_, i) => ({ id: String(i), title: `t${i}` }));
    expect(searchResultsFrom(rows, '')).toHaveLength(20);
    expect(searchResultsFrom(rows, '', 5)).toHaveLength(5);
    expect(searchResultsFrom('nope', 'x')).toEqual([]);
  });

  it('fetchResultFrom returns { id, title, text, url } with a calm status line, or null when missing', () => {
    const today = '2026-06-20';
    expect(fetchResultFrom([{ id: 'a', title: 'Dentist', due: '2026-07-01' }], 'a', today)).toEqual({
      id: 'a',
      title: 'Dentist',
      text: 'Dentist — due 2026-07-01',
      url: 'https://doubledone.app',
    });
    expect(fetchResultFrom([{ id: 'b', title: 'Meds', recurrence: { kind: 'daily' } }], 'b', today)?.text).toBe('Meds — repeats');
    expect(fetchResultFrom([{ id: 'c', title: 'Now thing' }], 'c', today)?.text).toBe('Now thing — on today');
    expect(fetchResultFrom([{ id: 'd', title: 'Old', done: true }], 'd', today)?.text).toBe('Old — done');
    expect(fetchResultFrom([], 'x', today)).toBeNull();
    expect(fetchResultFrom('nope', 'x', today)).toBeNull();
  });

  it('fetchTaskRequest filters by id with a limit', () => {
    const dec = decodeURIComponent(fetchTaskRequest(env, 'tok', 't7').url);
    expect(dec).toContain('id=eq.t7');
    expect(dec).toContain('limit=1');
  });

  it('fetchNotFoundDoc is a contract-complete empty document (all four required fields, no error key)', () => {
    const doc = fetchNotFoundDoc('gone-123');
    // The four fields Deep Research requires on every fetch response, and nothing off-shape.
    expect(Object.keys(doc).sort()).toEqual(['id', 'text', 'title', 'url']);
    expect(doc.id).toBe('gone-123'); // echoes the requested id so the connector can tie it back
    expect(doc).not.toHaveProperty('error');
    expect(doc.text).not.toMatch(/error|fail|http|\d{3}/i); // calm, no leak, no shame
  });
});

describe('break_down formatting + rate key', () => {
  it('formatBreakdown lists steps with minutes and the propose-then-accept reminder', () => {
    const out = formatBreakdown([
      { title: 'Open the drawer', minutes: 2 },
      { title: 'Bin the obvious junk', minutes: 5 },
      { title: 'Wipe it down', minutes: 0 }, // no minutes shown when not positive
    ]);
    expect(out).toContain('• Open the drawer (2 min)');
    expect(out).toContain('• Bin the obvious junk (5 min)');
    expect(out).toContain('• Wipe it down'); // present, no "(0 min)"
    expect(out).not.toContain('(0 min)');
    expect(out).toContain("Nothing's been added yet");
  });

  it('breakdownRateKey buckets per user per UTC hour', () => {
    const t0 = Date.UTC(2026, 5, 20, 9, 0, 0); // 09:00
    const t1 = Date.UTC(2026, 5, 20, 9, 59, 0); // same hour
    const t2 = Date.UTC(2026, 5, 20, 10, 0, 0); // next hour
    expect(breakdownRateKey('u1', t0)).toBe(breakdownRateKey('u1', t1)); // same bucket
    expect(breakdownRateKey('u1', t0)).not.toBe(breakdownRateKey('u1', t2)); // rolls at the hour
    expect(breakdownRateKey('u1', t0)).not.toBe(breakdownRateKey('u2', t0)); // per user
    expect(breakdownRateKey('u1', t0)).toContain('mcp:bd:');
  });
});

// ---- handleMcp integration (mocked fetch): the tool dispatch + validation branches ----
describe('tool dispatch through handleMcp (fetch mocked)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('add_task rejects due AND repeat together, without any network call', async () => {
    const spy = vi.fn();
    vi.stubGlobal('fetch', spy);
    const r = await callTool('add_task', { title: 'x', due: '2026-07-01', repeat: { kind: 'daily' } });
    expect(r.result.isError).toBe(true);
    expect(r.result.content[0].text).toMatch(/not both/i);
    expect(spy).not.toHaveBeenCalled();
  });

  it('add_task rejects a malformed repeat with a calm error, no 500, no network call', async () => {
    const spy = vi.fn();
    vi.stubGlobal('fetch', spy);
    const r = await callTool('add_task', { title: 'x', repeat: { kind: 'weekly' } }); // no weekdays
    expect(r.result.isError).toBe(true);
    expect(r.result.content[0].text).toMatch(/repeat/i);
    expect(spy).not.toHaveBeenCalled();
  });

  it('add_task with a valid repeat posts a recurrence row and confirms calmly', async () => {
    const spy = vi.fn(async (_url: string, _init?: RequestInit) => jsonRes([{ id: 't' }]));
    vi.stubGlobal('fetch', spy);
    const r = await callTool('add_task', { title: 'Water the cat', repeat: { kind: 'every_n_days', days: 2 } });
    expect(r.result.isError).toBeUndefined();
    expect(r.result.content[0].text).toMatch(/repeating/i);
    // The posted body carries a well-formed interval recurrence.
    const body = JSON.parse((spy.mock.calls[0][1] as RequestInit).body as string);
    expect(body.recurrence).toMatchObject({ kind: 'interval', days: 2 });
  });

  it('add_task rejects a bad due date shape calmly', async () => {
    const spy = vi.fn();
    vi.stubGlobal('fetch', spy);
    const r = await callTool('add_task', { title: 'x', due: '10 July' });
    expect(r.result.isError).toBe(true);
    expect(spy).not.toHaveBeenCalled();
  });

  it('update_task requires at least one mutable field', async () => {
    const spy = vi.fn();
    vi.stubGlobal('fetch', spy);
    const r = await callTool('update_task', { id: 't1' });
    expect(r.result.isError).toBe(true);
    expect(r.result.content[0].text).toMatch(/what to change/i);
    expect(spy).not.toHaveBeenCalled();
  });

  it('update_task reports "No matching task found" when the PATCH affects no rows', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonRes([])));
    const r = await callTool('update_task', { id: 'missing', title: 'New' });
    expect(r.result.isError).toBe(true);
    expect(r.result.content[0].text).toMatch(/no matching task/i);
  });

  it('delete_task confirms "Removed." on a soft-delete that hit a row', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonRes([{ id: 't1' }])));
    const r = await callTool('delete_task', { id: 't1' });
    expect(r.result.content[0].text).toBe('Removed.');
  });

  it('search returns the OpenAI results shape as JSON text', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonRes([{ id: 'a', title: 'Buy milk' }])));
    const r = await callTool('search', { query: 'milk' });
    const parsed = JSON.parse(r.result.content[0].text);
    expect(parsed).toEqual({ results: [{ id: 'a', title: 'Buy milk', url: 'https://doubledone.app' }] });
  });

  it('fetch returns the OpenAI document shape on a hit, and a well-formed empty document on a miss', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonRes([{ id: 'a', title: 'Dentist', due: '2026-07-01' }])));
    const hit = JSON.parse((await callTool('fetch', { id: 'a' })).result.content[0].text);
    expect(hit).toMatchObject({ id: 'a', title: 'Dentist', url: 'https://doubledone.app' });
    expect(typeof hit.text).toBe('string');

    // A miss still satisfies the required-fields contract (id/title/text/url), never an off-shape
    // {error} object, so Deep Research parses it and drops the source cleanly. It echoes the id.
    vi.stubGlobal('fetch', vi.fn(async () => jsonRes([])));
    const miss = JSON.parse((await callTool('fetch', { id: 'nope' })).result.content[0].text);
    expect(miss).toEqual({ id: 'nope', title: 'Not found', text: 'This task is no longer available.', url: 'https://doubledone.app' });
    expect(miss.error).toBeUndefined();
  });

  it('break_down proposes steps and ADDS NOTHING (no POST to tasks), reusing decompose', async () => {
    // The Anthropic response the decompose parser understands.
    const anthropic = {
      content: [{ type: 'tool_use', name: 'record_steps', input: { steps: [{ title: 'Open the door', minutes: 2 }] } }],
      usage: { input_tokens: 10, output_tokens: 20 },
    };
    const spy = vi.fn(async (url: string) => {
      expect(url).toContain('api.anthropic.com'); // the ONLY call it makes
      return jsonRes(anthropic);
    });
    vi.stubGlobal('fetch', spy as unknown as typeof fetch);
    const r = await callTool('break_down', { task: 'Clean the garage' }, USER_JWT, { ...env, ANTHROPIC_API_KEY: 'sk-test' });
    expect(r.result.content[0].text).toContain('• Open the door (2 min)');
    expect(r.result.content[0].text).toContain("Nothing's been added yet");
    // Exactly one fetch (Anthropic); nothing was written to Supabase tasks.
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('break_down proposal text carries NO task id (a proposal can never read as persisted rows)', async () => {
    // Even if the model echoes an id-shaped string in a step title, the proposal must not present
    // it as an added task. Locks the propose-then-accept spine: an agent can't be tricked into
    // treating the breakdown as already-persisted rows the way list_today's "[id]" lines are.
    const anthropic = {
      content: [
        {
          type: 'tool_use',
          name: 'record_steps',
          input: { steps: [{ title: 'Note the id mcp-abc123 somewhere', minutes: 1 }] },
        },
      ],
      usage: { input_tokens: 4, output_tokens: 4 },
    };
    vi.stubGlobal('fetch', vi.fn(async () => jsonRes(anthropic)) as unknown as typeof fetch);
    const text = (await callTool('break_down', { task: 'x' }, USER_JWT, { ...env, ANTHROPIC_API_KEY: 'sk-test' })).result.content[0].text;
    // No "[id]" citation the way list_today renders persisted rows, and the closing line still
    // makes the not-yet-added state explicit. (The step title text is the model's, verbatim; what
    // matters is the tool never wraps a proposal in the persisted-row "[...]" affordance.)
    expect(text).not.toMatch(/\[[^\]]+\]/);
    expect(text).toContain("Nothing's been added yet");
  });

  it('break_down enforces the per-user hourly cap via OAUTH_KV BEFORE any spend', async () => {
    const spy = vi.fn();
    vi.stubGlobal('fetch', spy);
    // KV already at the cap for this user's current bucket.
    const kv = {
      get: vi.fn(async () => String(BREAKDOWN_HOURLY_CAP)),
      put: vi.fn(async () => undefined),
    };
    const r = await callTool('break_down', { task: 'x' }, USER_JWT, { ...env, ANTHROPIC_API_KEY: 'sk-test', OAUTH_KV: kv });
    expect(r.result.content[0].text).toMatch(/pause breaking things down/i);
    expect(spy).not.toHaveBeenCalled(); // no Anthropic call = no spend
    expect(kv.put).not.toHaveBeenCalled(); // and we didn't even bump the counter
  });

  it('break_down under the cap bumps the KV counter and calls Anthropic', async () => {
    const anthropic = {
      content: [{ type: 'tool_use', name: 'record_steps', input: { steps: [{ title: 'Step one', minutes: 3 }] } }],
      usage: { input_tokens: 5, output_tokens: 5 },
    };
    const fetchSpy = vi.fn(async () => jsonRes(anthropic));
    vi.stubGlobal('fetch', fetchSpy as unknown as typeof fetch);
    const kv = { get: vi.fn(async () => '3'), put: vi.fn(async () => undefined) };
    const r = await callTool('break_down', { task: 'Tidy desk' }, USER_JWT, { ...env, ANTHROPIC_API_KEY: 'sk-test', OAUTH_KV: kv });
    expect(r.result.content[0].text).toContain('• Step one (3 min)');
    expect(kv.put).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('break_down is unavailable (calm) when the AI key is unset, no network call', async () => {
    const spy = vi.fn();
    vi.stubGlobal('fetch', spy);
    const r = await callTool('break_down', { task: 'x' }); // env has no ANTHROPIC_API_KEY
    expect(r.result.isError).toBe(true);
    expect(spy).not.toHaveBeenCalled();
  });
});
