import { afterEach, describe, expect, it, vi } from 'vitest';

import { bodyOf, type Call, failWith, paramsOf, sequence } from './fetch-sequence.test-helper';
import {
  addDaysIso,
  addTaskRequest,
  BREAKDOWN_HOURLY_CAP,
  breakdownRateKey,
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
  patchRowRequest,
  searchResultsFrom,
  searchTasksRequest,
  TOKEN_EXPIRED,
  toolsListResult,
  updateTaskRequest,
  upcomingWindow,
} from './mcp';

const env: McpEnv = { SUPABASE_URL: 'https://proj.supabase.co', SUPABASE_ANON_KEY: 'anon-key' };
const jwt = (claims: object) => `header.${btoa(JSON.stringify(claims))}.sig`;
// A JWT with a real sub. The integration tests pass the `trust` stub (decode = verified); the PR A block at
// the bottom runs the real verifier against a forged token and expects the wall.
const USER_JWT = `Bearer ${jwt({ sub: 'user-9', role: 'authenticated' })}`;

// The verifier stub for the existing behaviour tests: a decoded sub counts as verified, so these tests
// keep testing what they always tested. The PR A block at the bottom uses the REAL verifier with forged
// tokens to prove the wall, and never touches the network (a rejected alg needs no key fetch).
const trust = async (token: string) => decodeJwtSub(token);

/** A minimal fetch Response double: ok + a JSON body. */
function jsonRes(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as unknown as Response;
}

/** Call a tools/call and return the parsed tool result. */
async function callTool(name: string, args: object, auth = USER_JWT, e: McpEnv = env) {
  const res = await handleMcp(mcpReq({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }, auth), e, { kind: 'header' }, trust);
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

  it('patchRowRequest patches the row by id, never a tombstone, with the guard the plan asks for', () => {
    const { url, init } = patchRowRequest(env, 'tok', 't1', { done: true, completed_at: 'N', updated_at: 'N' }, { done: 'is.false' });
    expect(init.method).toBe('PATCH');
    const q = Object.fromEntries(new URL(url).searchParams);
    expect(q).toEqual({ id: 'eq.t1', deleted_at: 'is.null', done: 'is.false' });
    expect(JSON.parse(init.body as string)).toEqual({ done: true, completed_at: 'N', updated_at: 'N' });
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
  it('tools/list describes parts: add_task and update_task take `parts`, complete_task takes `count`, never `parts`', () => {
    type Schema = { name: string; inputSchema: { properties: Record<string, unknown> } };
    const props = Object.fromEntries((toolsListResult() as { tools: Schema[] }).tools.map((t) => [t.name, t.inputSchema.properties]));
    expect(props.add_task.parts).toMatchObject({ type: 'integer', minimum: 2, maximum: 50 });
    expect(props.update_task.parts).toMatchObject({ type: ['integer', 'null'], minimum: 2, maximum: 50 });
    // `parts` is the total everywhere else, so the tick count has its own name (the design's rename).
    expect(props.complete_task.count).toMatchObject({ type: 'integer', minimum: 1, maximum: 50 });
    expect(props.complete_task).not.toHaveProperty('parts');
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

describe('PR A: the bearer is verified before any tool runs', () => {
  afterEach(() => vi.unstubAllGlobals());
  const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/=/g, '');
  // The hand-made three-segment string that passed the JWT-shape triage and reached the tools before.
  const forged = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: 'victim-1', role: 'authenticated' })}.`;
  const rpc = (name: string, args: object) => ({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } });
  type Out = { result: { isError?: boolean; content: { text: string }[] } };

  it('a forged token never reaches a tool or the AI spender: real verifier, no network, a plain sentence back', async () => {
    const spy = vi.fn();
    vi.stubGlobal('fetch', spy);
    const res = await handleMcp(mcpReq(rpc('break_down', { task: 'x' }), `Bearer ${forged}`), { ...env, ANTHROPIC_API_KEY: 'sk-test' });
    const body = (await res.json()) as Out;
    expect(body.result.isError).toBe(true);
    expect(body.result.content[0].text).toBe(TOKEN_EXPIRED);
    expect(spy).not.toHaveBeenCalled();
  });

  it('the OAuth custody path is verified too (real verifier): a refused token runs no tool, and answers the calm transient line, NOT the reconnect challenge', async () => {
    const spy = vi.fn();
    vi.stubGlobal('fetch', spy);
    const res = await handleMcp(mcpReq(rpc('list_today', {})), env, { kind: 'oauth', getToken: async () => forged });
    // A null here is likelier a JWKS blip than a bad custody token, and the 401 challenge would make the
    // connector drop a live grant; the dead-grant 401 still comes from custody's own refresh-rejection path.
    expect(res.status).toBe(200);
    const body = (await res.json()) as Out;
    expect(body.result.isError).toBe(true);
    expect(body.result.content[0].text).toMatch(/Try again/);
    expect(spy).not.toHaveBeenCalled();
  });

  it('an upstream 401 on a data tool says the token expired, not "try again"', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 401, json: async () => ({}) }) as unknown as Response));
    const r = await callTool('list_today', {});
    expect(r.result.isError).toBe(true);
    expect(r.result.content[0].text).toBe(TOKEN_EXPIRED);
  });

  it('an upstream 500 keeps the calm transient line', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) }) as unknown as Response));
    const r = await callTool('list_today', {});
    expect(r.result.isError).toBe(true);
    expect(r.result.content[0].text).toMatch(/just now\. Try again/);
  });

  it('break_down refuses an oversized task before any spend, and says so as an error', async () => {
    const spy = vi.fn();
    vi.stubGlobal('fetch', spy);
    const r = await callTool('break_down', { task: 'x'.repeat(2001) }, USER_JWT, { ...env, ANTHROPIC_API_KEY: 'sk-test' });
    expect(r.result.isError).toBe(true);
    expect(spy).not.toHaveBeenCalled();
  });

  it('the hourly cap refusal is an error, so an agent loop stops instead of reading it as success', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const kv = { get: vi.fn(async () => String(BREAKDOWN_HOURLY_CAP)), put: vi.fn(async () => undefined) };
    const r = await callTool('break_down', { task: 'x' }, USER_JWT, { ...env, ANTHROPIC_API_KEY: 'sk-test', OAUTH_KV: kv });
    expect(r.result.isError).toBe(true);
  });

  it('break_down fails CLOSED when the cap store throws: no spend without a working cap', async () => {
    const spy = vi.fn();
    vi.stubGlobal('fetch', spy);
    const kv = { get: vi.fn(async () => { throw new Error('kv down'); }), put: vi.fn(async () => undefined) };
    const r = await callTool('break_down', { task: 'x' }, USER_JWT, { ...env, ANTHROPIC_API_KEY: 'sk-test', OAUTH_KV: kv });
    expect(r.result.isError).toBe(true);
    expect(spy).not.toHaveBeenCalled();
  });

  it('break_down on the pasted-token path honours the per-IP limiter before any spend', async () => {
    const spy = vi.fn();
    vi.stubGlobal('fetch', spy);
    const limiter = { limit: vi.fn(async () => ({ success: false })) };
    const r = await callTool('break_down', { task: 'x' }, USER_JWT, { ...env, ANTHROPIC_API_KEY: 'sk-test', AI_LIMITER: limiter });
    expect(r.result.isError).toBe(true);
    expect(limiter.limit).toHaveBeenCalledTimes(1);
    expect(spy).not.toHaveBeenCalled();
  });

  it('break_down proceeds when the limiter allows', async () => {
    const anthropic = {
      content: [{ type: 'tool_use', name: 'record_steps', input: { steps: [{ title: 'Step one', minutes: 3 }] } }],
      usage: { input_tokens: 5, output_tokens: 5 },
    };
    const spy = vi.fn(async () => jsonRes(anthropic));
    vi.stubGlobal('fetch', spy as unknown as typeof fetch);
    const limiter = { limit: vi.fn(async () => ({ success: true })) };
    const r = await callTool('break_down', { task: 'Tidy desk' }, USER_JWT, { ...env, ANTHROPIC_API_KEY: 'sk-test', AI_LIMITER: limiter });
    expect(r.result.content[0].text).toContain('• Step one (3 min)');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('the no-token line names the real Settings label', async () => {
    const res = await handleMcp(mcpReq(rpc('list_today', {})), env);
    const body = (await res.json()) as Out;
    expect(body.result.content[0].text).toContain('AI agent access (MCP)');
  });
});

describe('PR B: complete_task ticks a repeat for today and closes a one-off (read-first)', () => {
  afterEach(() => vi.unstubAllGlobals());
  const todayIso = new Date().toISOString().slice(0, 10);

  it('a REPEATING task: reads the row, then writes completed_dates with today and never touches done', async () => {
    const calls = sequence([{ id: 'r1', done: false, recurrence: { kind: 'daily' }, completed_dates: ['2026-09-01'] }], [{ id: 'r1' }]);
    const r = await callTool('complete_task', { id: 'r1' });
    expect(r.result.isError).toBeUndefined();
    expect(r.result.content[0].text).toMatch(/^Ticked for \d{4}-\d{2}-\d{2}\./);
    expect(calls).toHaveLength(2);
    expect(calls[0].init.method).toBe('GET');
    expect(decodeURIComponent(calls[0].url)).toContain('deleted_at=is.null');
    const w = bodyOf(calls[1]);
    expect(w.completed_dates).toEqual(['2026-09-01', todayIso]);
    expect(w.done).toBeUndefined();
    expect(w.completed_at).toBeUndefined();
  });

  it('a REPEATING task already ticked today: says so and writes nothing', async () => {
    const calls = sequence([{ id: 'r1', done: false, recurrence: { kind: 'daily' }, completed_dates: [todayIso] }]);
    const r = await callTool('complete_task', { id: 'r1' });
    expect(r.result.content[0].text).toMatch(/^Already ticked for \d{4}-\d{2}-\d{2}\./);
    expect(calls).toHaveLength(1);
  });

  it('a ONE-OFF: reads the row, then closes it with done:true as before', async () => {
    const calls = sequence([{ id: 't1', done: false, recurrence: null, completed_dates: null }], [{ id: 't1' }]);
    const r = await callTool('complete_task', { id: 't1' });
    expect(r.result.content[0].text).toBe('Marked it done. Nice.');
    const w = bodyOf(calls[1]);
    expect(w.done).toBe(true);
    expect(typeof w.completed_at).toBe('string');
    expect(w.completed_dates).toBeUndefined(); // a one-off never carries the tick array
  });

  it('an unknown or deleted id is a calm "No matching task found" with no write', async () => {
    const calls = sequence([]);
    const r = await callTool('complete_task', { id: 'nope' });
    expect(r.result.isError).toBe(true);
    expect(r.result.content[0].text).toBe('No matching task found.');
    expect(calls).toHaveLength(1);
  });

  it('update_task done:false un-ticks today on a repeat, and reopens a one-off', async () => {
    let calls = sequence([{ id: 'r1', recurrence: { kind: 'daily' }, completed_dates: ['2026-09-01', todayIso] }], [{ id: 'r1' }]);
    let r = await callTool('update_task', { id: 'r1', done: false });
    expect(r.result.content[0].text).toMatch(/Un-ticked .* on the server\. A device that already synced/);
    expect(bodyOf(calls[1]).completed_dates).toEqual(['2026-09-01']);
    vi.unstubAllGlobals();
    calls = sequence([{ id: 't1', recurrence: null }], [{ id: 't1' }]);
    r = await callTool('update_task', { id: 't1', done: false });
    expect(r.result.content[0].text).toBe('Reopened.');
    expect(bodyOf(calls[1])).toMatchObject({ done: false, completed_at: null });
  });

  it('update_task with a title AND done is one read and ONE PATCH carrying both', async () => {
    const calls = sequence([{ id: 'r1', recurrence: { kind: 'daily' }, completed_dates: [] }], [{ id: 'r1' }]);
    const r = await callTool('update_task', { id: 'r1', title: 'Meds', done: true });
    expect(r.result.content[0].text).toMatch(/^Ticked for \d{4}-\d{2}-\d{2}\./);
    expect(calls).toHaveLength(2);
    expect(calls[0].init.method).toBe('GET');
    const w = bodyOf(calls[1]);
    expect(w.title).toBe('Meds');
    expect(w.completed_dates).toEqual([todayIso]);
    expect(w.done).toBeUndefined();
  });

  it('update_task rejects a non-boolean done', async () => {
    const r = await callTool('update_task', { id: 'r1', done: 'yes' });
    expect(r.result.isError).toBe(true);
  });

  it('list_today marks a repeating task so the model knows a tick is for today only', async () => {
    sequence([
      { id: 'o1', title: 'Call the vet', recurrence: null },
      { id: 'r1', title: 'Meds', recurrence: { kind: 'daily' }, completed_dates: [], skipped_dates: [] },
    ]);
    const r = await callTool('list_today', {});
    expect(r.result.content[0].text).toContain('• Call the vet  [o1]');
    expect(r.result.content[0].text).toContain('• Meds  (repeats)  [r1]');
  });
});

describe('PR B review: the ticked day is named, and an agent can choose it', () => {
  afterEach(() => vi.unstubAllGlobals());
  const todayIso = new Date().toISOString().slice(0, 10);

  it('names the day it ticked (the UTC day by default)', async () => {
    sequence([{ id: 'r1', recurrence: { kind: 'daily' }, completed_dates: [] }], [{ id: 'r1' }]);
    const r = await callTool('complete_task', { id: 'r1' });
    expect(r.result.content[0].text).toContain(`Ticked for ${todayIso}.`);
  });

  it('ticks the day the agent names (the user\'s local date) instead of the UTC day', async () => {
    const calls = sequence([{ id: 'r1', recurrence: { kind: 'daily' }, completed_dates: [] }], [{ id: 'r1' }]);
    const r = await callTool('complete_task', { id: 'r1', day: '2026-09-24' });
    expect(r.result.content[0].text).toContain('Ticked for 2026-09-24.');
    expect(JSON.parse(calls[1].init.body as string).completed_dates).toEqual(['2026-09-24']);
  });

  it('refuses a day that is not a real calendar day, before any read', async () => {
    const calls = sequence([]);
    const r = await callTool('complete_task', { id: 'r1', day: '2026-02-30' });
    expect(r.result.isError).toBe(true);
    expect(calls).toHaveLength(0);
  });

  it('a {kind: none} recurrence is a one-off to the tick, exactly as it is to list_today', async () => {
    const calls = sequence([{ id: 't1', recurrence: { kind: 'none' }, completed_dates: null }], [{ id: 't1' }]);
    const r = await callTool('complete_task', { id: 't1' });
    expect(r.result.content[0].text).toBe('Marked it done. Nice.');
    expect(JSON.parse(calls[1].init.body as string).done).toBe(true);
  });
});

describe('parts: a task tracked in parts moves forward one part at a time, and never back', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
  const todayIso = new Date().toISOString().slice(0, 10);
  /** A row as the read-first select returns it: a one-off tracked in parts. */
  const sliced = (done: number, total: number, extra: object = {}) => ({
    id: 's1',
    title: 'Watch Severance',
    done: false,
    recurrence: null,
    completed_dates: null,
    slices: { total, done },
    silent_parent: null,
    parent_id: null,
    ...extra,
  });
  const oneOff = (extra: object = {}) => ({
    id: 't1',
    title: 'Call the vet',
    done: false,
    recurrence: null,
    completed_dates: null,
    slices: null,
    silent_parent: null,
    parent_id: null,
    ...extra,
  });
  const text = (r: Awaited<ReturnType<typeof callTool>>) => r.result.content[0].text;
  const shape = (calls: Call[]) => calls.map((c) => [c.url, c.init.method, c.init.body]);

  // --- add_task -------------------------------------------------------------------------------

  it('add_task parts writes slices {N, 0}, and the reply names the parts and ends with the new id', async () => {
    const calls = sequence([{ id: 'x' }]);
    const r = await callTool('add_task', { title: 'Watch Severance', parts: 10 });
    const row = bodyOf(calls[0]);
    expect(row.slices).toEqual({ total: 10, done: 0 });
    expect(text(r)).toBe(`Added "Watch Severance" to today, in 10 parts. [${row.id}]`);
    expect(row.id).toMatch(/^mcp-[a-z0-9]+-[a-z0-9]+$/);
  });

  it('add_task parts sits happily with a due day', async () => {
    const calls = sequence([{ id: 'x' }]);
    const r = await callTool('add_task', { title: 'Read the report', due: '2026-11-02', parts: 4 });
    expect(bodyOf(calls[0])).toMatchObject({ due: '2026-11-02', slices: { total: 4, done: 0 } });
    expect(text(r)).toMatch(/^Added "Read the report" for 2026-11-02, in 4 parts\. \[mcp-/);
  });

  it('every add_task reply now carries the id it wrote, so the agent can act on it without a list call', async () => {
    let calls = sequence([{ id: 'x' }]);
    let r = await callTool('add_task', { title: 'Book the dentist' });
    expect(text(r)).toBe(`Added "Book the dentist" to today. [${bodyOf(calls[0]).id}]`);
    vi.unstubAllGlobals();
    calls = sequence([{ id: 'x' }]);
    r = await callTool('add_task', { title: 'Renew the rego', due: '2026-10-20' });
    expect(text(r)).toBe(`Added "Renew the rego" for 2026-10-20. [${bodyOf(calls[0]).id}]`);
    vi.unstubAllGlobals();
    calls = sequence([{ id: 'x' }]);
    r = await callTool('add_task', { title: 'Water the plants', repeat: { kind: 'daily' } });
    expect(text(r)).toBe(`Added "Water the plants", repeating. [${bodyOf(calls[0]).id}]`);
  });

  it('add_task refuses parts with a repeat, and a part count outside 2-50 or not whole, with no write', async () => {
    const calls = sequence([{ id: 'x' }]);
    for (const args of [
      { title: 'x', parts: 3, repeat: { kind: 'daily' } },
      { title: 'x', parts: 1 },
      { title: 'x', parts: 51 },
      { title: 'x', parts: 2.5 },
      { title: 'x', parts: '3' },
    ]) {
      const r = await callTool('add_task', args);
      expect(r.result.isError).toBe(true);
    }
    expect(calls).toHaveLength(0);
  });

  // --- the reads ------------------------------------------------------------------------------

  it('list_today selects slices and marks a one-off in parts, never a repeat or a malformed value', async () => {
    const calls = sequence([
      { id: 's1', title: 'Watch Severance', recurrence: null, slices: { total: 10, done: 3 } },
      { id: 'o1', title: 'Call the vet', recurrence: null, slices: null },
      { id: 'r1', title: 'Meds', recurrence: { kind: 'daily' }, completed_dates: [], skipped_dates: [], slices: { total: 3, done: 1 } },
      { id: 'b1', title: 'Bad parts', recurrence: null, slices: { total: 0, done: 0 } },
    ]);
    const t = text(await callTool('list_today', {}));
    expect(paramsOf(calls[0]).select.split(',')).toContain('slices');
    expect(t).toContain('• Watch Severance  (3/10 parts)  [s1]');
    expect(t).toContain('• Call the vet  [o1]');
    expect(t).toContain('• Meds  (repeats)  [r1]');
    expect(t).toContain('• Bad parts  [b1]');
  });

  it('list_upcoming marks a one-off in parts too', async () => {
    const tomorrow = addDaysIso(todayIso, 1);
    const calls = sequence([{ id: 'u1', title: 'Read the report', recurrence: null, due: tomorrow, slices: { total: 4, done: 1 } }]);
    const t = text(await callTool('list_upcoming', {}));
    expect(paramsOf(calls[0]).select.split(',')).toContain('slices');
    expect(t).toContain('• Read the report  (1/4 parts) ');
    expect(t).toContain(`${tomorrow}  [u1]`);
  });

  // --- complete_task --------------------------------------------------------------------------

  it('complete_task on a task in parts reads, then sends ONE PATCH of the counts alone, pinned to the stored counts', async () => {
    const calls = sequence([sliced(2, 10)], [{ id: 's1' }]);
    const r = await callTool('complete_task', { id: 's1' });
    expect(r.result.isError).toBeUndefined();
    expect(text(r)).toBe('Ticked one part of "Watch Severance": 3 of 10 done. Pass count to complete_task to tick more, and 7 finishes it.');
    expect(calls).toHaveLength(2);
    expect(calls[0].init.method).toBe('GET');
    expect(paramsOf(calls[0]).select.split(',')).toEqual(expect.arrayContaining(['title', 'done', 'recurrence', 'slices', 'silent_parent']));
    expect(paramsOf(calls[1])).toEqual({ id: 'eq.s1', deleted_at: 'is.null', 'slices->>done': 'eq.2', 'slices->>total': 'eq.10', done: 'is.false' });
    expect(bodyOf(calls[1])).toEqual({ slices: { total: 10, done: 3 }, updated_at: expect.any(String) });
  });

  it('count ticks more, and past the end it is clamped, which finishes the task with done and its stamp', async () => {
    let calls = sequence([sliced(2, 10)], [{ id: 's1' }]);
    let r = await callTool('complete_task', { id: 's1', count: 3 });
    expect(text(r)).toBe('Ticked 3 parts of "Watch Severance": 5 of 10 done. Pass count to complete_task to tick more, and 5 finishes it.');
    expect(bodyOf(calls[1]).slices).toEqual({ total: 10, done: 5 });
    vi.unstubAllGlobals();
    calls = sequence([sliced(8, 10)], [{ id: 's1' }]);
    r = await callTool('complete_task', { id: 's1', count: 5 });
    expect(text(r)).toBe(`Ticked the last 2 parts of "Watch Severance", so it's done: all 10. Nice.`);
    const w = bodyOf(calls[1]);
    expect(w).toEqual({ slices: { total: 10, done: 10 }, done: true, completed_at: w.updated_at, updated_at: expect.any(String) });
  });

  it('the guard pins the RAW stored counts, so a malformed row is still matched (and the write tidies it)', async () => {
    const calls = sequence([sliced(2.7, 5)], [{ id: 's1' }]);
    await callTool('complete_task', { id: 's1' });
    expect(paramsOf(calls[1])).toMatchObject({ 'slices->>done': 'eq.2.7', 'slices->>total': 'eq.5' });
    expect(bodyOf(calls[1]).slices).toEqual({ total: 5, done: 3 });
  });

  it('a row a merge left at every part ticked but still open is closed by the tick', async () => {
    const calls = sequence([sliced(5, 5)], [{ id: 's1' }]);
    const r = await callTool('complete_task', { id: 's1' });
    expect(text(r)).toBe(`Every part of "Watch Severance" was already ticked, so it's marked done now. Nice.`);
    expect(bodyOf(calls[1])).toMatchObject({ slices: { total: 5, done: 5 }, done: true });
  });

  it('a task already done, in parts or not, is "Already done." with one read and no write', async () => {
    // A row an old flaw left done at 2 of 5 must not reach the parts guard (done=is.false), or it loops forever.
    let calls = sequence([sliced(2, 5, { done: true })]);
    let r = await callTool('complete_task', { id: 's1' });
    expect(r.result.isError).toBeUndefined();
    expect(text(r)).toBe('Already done.');
    expect(calls).toHaveLength(1);
    vi.unstubAllGlobals();
    // A done one-off: no second write, so completed_at is never re-stamped and it never moves in the Lookback.
    calls = sequence([oneOff({ done: true })]);
    r = await callTool('complete_task', { id: 't1' });
    expect(text(r)).toBe('Already done.');
    expect(calls).toHaveLength(1);
  });

  it('a one-off close is guarded by done=is.false, and a miss says it changed', async () => {
    let calls = sequence([oneOff()], [{ id: 't1' }]);
    let r = await callTool('complete_task', { id: 't1' });
    expect(text(r)).toBe('Marked it done. Nice.');
    expect(paramsOf(calls[1])).toEqual({ id: 'eq.t1', deleted_at: 'is.null', done: 'is.false' });
    vi.unstubAllGlobals();
    calls = sequence([oneOff()], []);
    r = await callTool('complete_task', { id: 't1' });
    expect(r.result.isError).toBe(true);
    expect(text(r)).toBe('It changed just now. Check list_today.');
    expect(calls).toHaveLength(2);
  });

  it('a parts tick that matches no row says it changed and to try again', async () => {
    sequence([sliced(2, 10)], []);
    const r = await callTool('complete_task', { id: 's1' });
    expect(r.result.isError).toBe(true);
    expect(text(r)).toBe('It changed just now. Try again.');
  });

  it('a task waiting on its steps is refused, with one read and no write, on every done path', async () => {
    const paths: [string, object][] = [
      ['complete_task', { id: 'p1' }],
      ['update_task', { id: 'p1', done: true }],
      ['update_task', { id: 'p1', done: false }],
    ];
    for (const [tool, args] of paths) {
      const calls = sequence([oneOff({ id: 'p1', title: 'Clear the garage', silent_parent: true })]);
      const r = await callTool(tool, args);
      expect(r.result.isError).toBe(true);
      expect(text(r)).toBe('"Clear the garage" is waiting on its steps. Tick those, and it closes or comes back by itself.');
      expect(calls).toHaveLength(1);
      vi.unstubAllGlobals();
    }
  });

  it('count must be a whole number from 1 to 50, checked before any read', async () => {
    const calls = sequence([sliced(0, 10)]);
    for (const count of [0, 51, 2.5, '2']) {
      const r = await callTool('complete_task', { id: 's1', count });
      expect(r.result.isError).toBe(true);
    }
    expect(calls).toHaveLength(0);
  });

  it('count is ignored on a one-off and on a repeat', async () => {
    let calls = sequence([oneOff()], [{ id: 't1' }]);
    expect(text(await callTool('complete_task', { id: 't1', count: 3 }))).toBe('Marked it done. Nice.');
    expect(bodyOf(calls[1])).toMatchObject({ done: true });
    vi.unstubAllGlobals();
    calls = sequence([oneOff({ recurrence: { kind: 'daily' }, completed_dates: [] })], [{ id: 't1' }]);
    await callTool('complete_task', { id: 't1', count: 3 });
    expect(bodyOf(calls[1]).completed_dates).toEqual([todayIso]);
  });

  it('a refused token on the read says so, and nothing is written', async () => {
    const calls = sequence(failWith(401));
    const r = await callTool('complete_task', { id: 's1' });
    expect(text(r)).toBe(TOKEN_EXPIRED);
    expect(calls).toHaveLength(1);
  });

  // --- update_task ----------------------------------------------------------------------------

  it('update_task done:true on a task in parts is +1, and writes exactly what complete_task writes', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-18T03:00:00.000Z'));
    const viaComplete = sequence([sliced(2, 10)], [{ id: 's1' }]);
    await callTool('complete_task', { id: 's1' });
    vi.unstubAllGlobals();
    const viaUpdate = sequence([sliced(2, 10)], [{ id: 's1' }]);
    const r = await callTool('update_task', { id: 's1', done: true });
    expect(text(r)).toMatch(/^Ticked one part of "Watch Severance": 3 of 10 done\./);
    expect(shape(viaUpdate)).toEqual(shape(viaComplete));
    expect(bodyOf(viaUpdate[1]).slices).toEqual({ total: 10, done: 3 }); // one part, never all ten
  });

  it('parts resizes and carries progress over, pinned to the stored counts', async () => {
    const calls = sequence([sliced(3, 10)], [{ id: 's1' }]);
    const r = await callTool('update_task', { id: 's1', parts: 12 });
    expect(text(r)).toBe('"Watch Severance" is now tracked in 12 parts, 3 done.');
    expect(bodyOf(calls[1])).toEqual({ slices: { total: 12, done: 3 }, updated_at: expect.any(String) });
    expect(paramsOf(calls[1])).toMatchObject({ 'slices->>done': 'eq.3', 'slices->>total': 'eq.10', done: 'is.false' });
  });

  it('a parts count at or below what is ticked finishes the task', async () => {
    const calls = sequence([sliced(4, 10)], [{ id: 's1' }]);
    const r = await callTool('update_task', { id: 's1', parts: 4 });
    expect(text(r)).toBe(`"Watch Severance" is now in 4 parts, and all 4 are ticked, so it's done. Nice.`);
    const w = bodyOf(calls[1]);
    expect(w).toEqual({ slices: { total: 4, done: 4 }, done: true, completed_at: w.updated_at, updated_at: expect.any(String) });
  });

  it('parts on a whole task starts it at none done, guarded on the absent counts', async () => {
    const calls = sequence([oneOff()], [{ id: 't1' }]);
    await callTool('update_task', { id: 't1', parts: 5 });
    expect(bodyOf(calls[1]).slices).toEqual({ total: 5, done: 0 });
    expect(paramsOf(calls[1])).toMatchObject({ 'slices->>done': 'is.null', 'slices->>total': 'is.null', done: 'is.false' });
  });

  it('the same parts count again changes nothing and writes nothing', async () => {
    const calls = sequence([sliced(3, 10)]);
    expect(text(await callTool('update_task', { id: 's1', parts: 10 }))).toBe("It's already tracked in 10 parts, 3 done.");
    expect(calls).toHaveLength(1);
  });

  it('parts: null makes it one whole task again, leaving done alone, and says so when it was not in parts', async () => {
    let calls = sequence([sliced(3, 10)], [{ id: 's1' }]);
    let r = await callTool('update_task', { id: 's1', parts: null });
    expect(text(r)).toBe('"Watch Severance" is one whole task again.');
    expect(bodyOf(calls[1])).toEqual({ slices: null, updated_at: expect.any(String) });
    vi.unstubAllGlobals();
    calls = sequence([oneOff()]);
    r = await callTool('update_task', { id: 't1', parts: null });
    expect(r.result.isError).toBeUndefined();
    expect(text(r)).toBe("It wasn't tracked in parts.");
    expect(calls).toHaveLength(1);
  });

  it('parts with done, parts with a new repeat, or a bad parts value is refused before any read', async () => {
    const calls = sequence([sliced(3, 10)]);
    for (const args of [
      { id: 's1', parts: 5, done: true },
      { id: 's1', parts: null, done: false },
      { id: 's1', parts: 5, repeat: { kind: 'daily' } },
      { id: 's1', parts: 1 },
      { id: 's1', parts: 51 },
      { id: 's1', parts: 4.5 },
    ]) {
      const r = await callTool('update_task', args);
      expect(r.result.isError).toBe(true);
    }
    expect(calls).toHaveLength(0);
  });

  it('parts is refused on a repeating task, a task waiting on its steps, and a done task: one read, no write', async () => {
    for (const row of [oneOff({ recurrence: { kind: 'daily' } }), oneOff({ silent_parent: true }), oneOff({ done: true })]) {
      const calls = sequence([row]);
      const r = await callTool('update_task', { id: 't1', parts: 3 });
      expect(r.result.isError).toBe(true);
      expect(calls).toHaveLength(1);
      vi.unstubAllGlobals();
    }
  });

  it('parts on a repeat stopped in the same call is fine: it is judged on the shape after the change', async () => {
    const calls = sequence([oneOff({ recurrence: { kind: 'daily' } })], [{ id: 't1' }]);
    await callTool('update_task', { id: 't1', parts: 3, repeat: null });
    expect(bodyOf(calls[1])).toEqual({ recurrence: null, slices: { total: 3, done: 0 }, updated_at: expect.any(String) });
  });

  it('done:false on a task in parts is refused: parts only go forward', async () => {
    const calls = sequence([sliced(3, 10, { done: true })]);
    const r = await callTool('update_task', { id: 's1', done: false });
    expect(r.result.isError).toBe(true);
    expect(text(r)).toBe('Parts only go forward from here. Step one back in the app.');
    expect(calls).toHaveLength(1);
  });

  it('a new repeat is refused on a task in parts, a task waiting on its steps, and a step: one read, no write', async () => {
    for (const row of [sliced(3, 10), oneOff({ silent_parent: true }), oneOff({ parent_id: 'p1' })]) {
      const calls = sequence([row]);
      const r = await callTool('update_task', { id: 't1', repeat: { kind: 'daily' } });
      expect(r.result.isError).toBe(true);
      expect(calls).toHaveLength(1);
      vi.unstubAllGlobals();
    }
  });

  it('a new repeat on a plain one-off reads first, then lands in one PATCH', async () => {
    const calls = sequence([oneOff({ due: '2026-10-20' })], [{ id: 't1' }]);
    const r = await callTool('update_task', { id: 't1', repeat: { kind: 'daily' } });
    expect(text(r)).toBe('Updated.');
    expect(calls.map((c) => c.init.method)).toEqual(['GET', 'PATCH']);
    expect(bodyOf(calls[1])).toMatchObject({ recurrence: { kind: 'daily' }, due: null });
  });

  it('a title change alone is still one plain PATCH with no read, even on a task waiting on its steps', async () => {
    const calls = sequence([{ id: 'p1' }]);
    expect(text(await callTool('update_task', { id: 'p1', title: 'Clear out the garage' }))).toBe('Updated.');
    expect(calls).toHaveLength(1);
    expect(bodyOf(calls[0])).toEqual({ updated_at: expect.any(String), title: 'Clear out the garage' });
  });

  it('{ repeat: null, done: true } still closes the one-off it makes, now in one guarded PATCH', async () => {
    const calls = sequence([oneOff({ recurrence: { kind: 'daily' }, completed_dates: [] })], [{ id: 't1' }]);
    expect(text(await callTool('update_task', { id: 't1', repeat: null, done: true }))).toBe('Marked it done. Nice.');
    expect(bodyOf(calls[1])).toMatchObject({ recurrence: null, done: true });
    expect(paramsOf(calls[1]).done).toBe('is.false');
  });

  it('a field change still lands when its done needs no write: "Updated. Already done."', async () => {
    const calls = sequence([oneOff({ done: true })], [{ id: 't1' }]);
    const r = await callTool('update_task', { id: 't1', title: 'Call the vet back', done: true });
    expect(text(r)).toBe('Updated. Already done.');
    const w = bodyOf(calls[1]);
    expect(w.title).toBe('Call the vet back');
    expect(w).not.toHaveProperty('done');
    expect(paramsOf(calls[1])).toEqual({ id: 'eq.t1', deleted_at: 'is.null' });
  });
});

describe('linked steps: add_steps writes a breakdown, and the last step closes the big task', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
  const NOW = '2026-10-18T03:00:00.000Z';
  const freeze = () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(NOW));
  };
  const text = (r: Awaited<ReturnType<typeof callTool>>) => r.result.content[0].text;
  const at = (min: number) => new Date(Date.UTC(2026, 9, 18, 0, min)).toISOString();
  /** A task as taskStateRequest returns it. */
  const state = (extra: object = {}) => ({
    id: 't1',
    title: 'Clear the garage',
    done: false,
    recurrence: null,
    completed_dates: null,
    slices: null,
    silent_parent: null,
    parent_id: null,
    parent_title: null,
    ...extra,
  });
  /** A step, as the state read returns it. */
  const step = (id: string, extra: object = {}) => state({ id, title: `${id} (5 min)`, parent_id: 'P', parent_title: 'Clear the garage', ...extra });
  /** The big task as the walk reads it. */
  const big = (extra: object = {}) => ({
    id: 'P',
    title: 'Clear the garage',
    done: false,
    recurrence: null,
    silent_parent: true,
    open_parent: false,
    parent_id: null,
    deleted_at: null,
    created_at: at(0),
    ...extra,
  });
  /** A child as the walk reads it. */
  const kid = (id: string, done: boolean, extra: object = {}) => ({
    id,
    done,
    recurrence: null,
    parent_id: 'P',
    deleted_at: null,
    created_at: at(1),
    completed_at: done ? at(30) : null,
    ...extra,
  });
  const twoSteps = [{ title: '• Bag up the rubbish (5 min)' }, { title: 'Take it to the tip', minutes: 30 }];
  const shape = (calls: Call[]) => calls.map((c) => [c.url, c.init.method, c.init.body]);

  // --- tools/list ---------------------------------------------------------------------------------------------

  it('tools/list: ten tools, add_steps beside break_down, with its schema', () => {
    type Tool = { name: string; description: string; inputSchema: { properties: Record<string, unknown>; required?: string[] } };
    const tools = (toolsListResult() as { tools: Tool[] }).tools;
    expect(tools.map((t) => t.name)).toEqual([
      'add_task',
      'list_today',
      'list_upcoming',
      'complete_task',
      'update_task',
      'delete_task',
      'break_down',
      'add_steps',
      'search',
      'fetch',
    ]);
    const addSteps = tools.find((t) => t.name === 'add_steps') as Tool;
    expect(addSteps.inputSchema.required).toEqual(['steps']);
    expect(Object.keys(addSteps.inputSchema.properties)).toEqual(['task_id', 'title', 'steps']);
    expect(addSteps.inputSchema.properties.steps).toMatchObject({
      type: 'array',
      minItems: 2,
      maxItems: 20,
      items: {
        required: ['title'],
        additionalProperties: false,
        properties: { minutes: { type: 'integer', minimum: 1, maximum: 480 }, due: { type: 'string' } },
      },
    });
    expect(addSteps.description).toMatch(/ONLY after the user has said yes to these exact steps/);
    expect(addSteps.description).toMatch(/Do NOT also call add_task/);
    expect((tools.find((t) => t.name === 'break_down') as Tool).description).toMatch(/call add_steps with the steps they agreed \(not add_task\)/);
    expect((tools.find((t) => t.name === 'complete_task') as Tool).description).toContain(`A STEP (marked '(toward "X")') closes`);
  });

  it('the readers say they are read-only, and the writers keep the protocol defaults', () => {
    type Tool = { name: string; annotations?: { readOnlyHint?: boolean } };
    const tools = (toolsListResult() as { tools: Tool[] }).tools;
    const readOnly = tools.filter((t) => t.annotations?.readOnlyHint === true).map((t) => t.name);
    expect(readOnly).toEqual(['list_today', 'list_upcoming', 'break_down', 'search', 'fetch']);
    for (const name of ['add_task', 'complete_task', 'update_task', 'delete_task', 'add_steps']) {
      expect(tools.find((t) => t.name === name)?.annotations).toBeUndefined();
    }
  });

  // --- add_steps, title mode ----------------------------------------------------------------------------------

  it('title mode is ONE POST of the big task and its steps, every row the same keys, and no PATCH', async () => {
    freeze();
    const calls = sequence([{ id: 'x' }]);
    const r = await callTool('add_steps', { title: 'Clear the garage', steps: twoSteps });
    expect(r.result.isError).toBeUndefined();
    expect(calls).toHaveLength(1);
    expect(calls[0].init.method).toBe('POST');
    const rows = JSON.parse(calls[0].init.body as string) as Record<string, unknown>[];
    expect(rows).toHaveLength(3);
    const keys = Object.keys(rows[0]).sort();
    for (const row of rows) expect(Object.keys(row).sort()).toEqual(keys);
    const [parent, s0, s1] = rows;
    expect(parent).toMatchObject({ title: 'Clear the garage', user_id: 'user-9', silent_parent: true, open_parent: false, complexity: 35, due: null, created_at: NOW });
    expect(String(parent.id)).toMatch(/^mcp-[a-z0-9]+-[a-z0-9]+-p$/);
    // The leading "• " break_down writes is gone, and the minutes are written once, from the suffix.
    expect(s0).toMatchObject({ title: 'Bag up the rubbish (5 min)', complexity: 5, parent_id: parent.id, parent_title: 'Clear the garage', created_at: '2026-10-18T03:00:00.001Z' });
    expect(s1).toMatchObject({ title: 'Take it to the tip (30 min)', complexity: 30, parent_id: parent.id, created_at: '2026-10-18T03:00:00.002Z' });
  });

  it('the reply lists each step with its id, and never the big task', async () => {
    const calls = sequence([{ id: 'x' }]);
    const t = text(await callTool('add_steps', { title: 'Clear the garage', steps: twoSteps }));
    const rows = JSON.parse(calls[0].init.body as string) as { id: string }[];
    expect(t).toBe(
      `Broke "Clear the garage" into 2 steps on today. It's tucked away now, and it closes itself when the last step is ticked.\n` +
        `• Bag up the rubbish (5 min)  [${rows[1].id}]\n• Take it to the tip (30 min)  [${rows[2].id}]`,
    );
    expect(t).not.toContain(rows[0].id);
  });

  it('a dated step says its day, and the reply no longer says "on today"', async () => {
    sequence([{ id: 'x' }]);
    const t = text(await callTool('add_steps', { title: 'Move house', steps: [{ title: 'Book the van' }, { title: 'Pack', due: '2026-10-25' }] }));
    expect(t).toMatch(/^Broke "Move house" into 2 steps\. It's tucked away/);
    expect(t).toMatch(/• Pack {2}\(on 2026-10-25\) {2}\[mcp-/);
  });

  // --- add_steps, task_id mode --------------------------------------------------------------------------------

  it('task_id mode reads, inserts the steps alone, then hides the task with a write pinned to it as read', async () => {
    freeze();
    const calls = sequence([state()], [{ id: 's' }], [{ id: 't1' }]);
    const r = await callTool('add_steps', { task_id: 't1', steps: [{ title: 'Bag up the rubbish' }, { title: 'Sweep' }] });
    expect(r.result.isError).toBeUndefined();
    expect(calls.map((c) => c.init.method)).toEqual(['GET', 'POST', 'PATCH']);
    const rows = JSON.parse(calls[1].init.body as string) as Record<string, unknown>[];
    expect(rows).toHaveLength(2);
    expect(rows.every((s) => s.parent_id === 't1' && s.parent_title === 'Clear the garage' && s.complexity === null)).toBe(true);
    expect(paramsOf(calls[2])).toEqual({
      id: 'eq.t1',
      deleted_at: 'is.null',
      done: 'is.false',
      silent_parent: 'not.is.true',
      recurrence: 'is.null',
      slices: 'is.null',
    });
    // No step has minutes, so complexity is left alone, as the app's manual breakdown leaves it.
    expect(bodyOf(calls[2])).toEqual({ silent_parent: true, open_parent: false, updated_at: NOW });
    expect(text(r)).toMatch(/^Broke "Clear the garage" into 2 steps on today\./);
  });

  it('task_id mode sets complexity on the hidden task when a step has minutes, and nothing else of it', async () => {
    const calls = sequence([state({ due: '2026-10-20' })], [{ id: 's' }], [{ id: 't1' }]);
    await callTool('add_steps', { task_id: 't1', steps: twoSteps });
    expect(bodyOf(calls[2])).toEqual({ silent_parent: true, open_parent: false, complexity: 35, updated_at: expect.any(String) });
  });

  it('each refusal is one read and no write: missing, done, repeating, in parts, already waiting', async () => {
    const cases: [unknown, string][] = [
      [[], 'No matching task found.'],
      [[state({ done: true })], 'That one is already done.'],
      [[state({ recurrence: { kind: 'daily' } })], "A repeating task can't be broken into steps. Add them as their own tasks, or stop it repeating first."],
      [[state({ slices: { total: 3, done: 1 } })], 'That task is tracked in parts. Make it one whole task first (update_task parts: null), then break it down.'],
      [[state({ silent_parent: true })], 'That task is already waiting on its steps. They are on the list.'],
    ];
    for (const [answer, says] of cases) {
      const calls = sequence(answer);
      const r = await callTool('add_steps', { task_id: 't1', steps: twoSteps });
      expect(r.result.isError).toBe(true);
      expect(text(r)).toBe(says);
      expect(calls).toHaveLength(1);
      vi.unstubAllGlobals();
    }
  });

  it('a hiding write that matches nothing tombstones exactly the steps it inserted, then says nothing was added', async () => {
    freeze();
    const calls = sequence([state()], [{ id: 's' }], [], [{ id: 's' }]);
    const r = await callTool('add_steps', { task_id: 't1', steps: twoSteps });
    expect(r.result.isError).toBe(true);
    expect(text(r)).toBe('That task changed just now, so nothing was added. Try again.');
    expect(calls).toHaveLength(4);
    const inserted = (JSON.parse(calls[1].init.body as string) as { id: string }[]).map((s) => s.id);
    expect(paramsOf(calls[3])).toEqual({ id: `in.(${inserted.join(',')})` });
    expect(bodyOf(calls[3])).toEqual({ deleted_at: NOW, updated_at: NOW });
  });

  it('a hiding write that fails is undone the same way, and a refused token says so', async () => {
    const calls = sequence([state()], [{ id: 's' }], failWith(401), [{ id: 's' }]);
    const r = await callTool('add_steps', { task_id: 't1', steps: twoSteps });
    expect(text(r)).toBe(TOKEN_EXPIRED);
    expect(calls.map((c) => c.init.method)).toEqual(['GET', 'POST', 'PATCH', 'PATCH']);
  });

  it('if even the tombstone fails, it says some steps may have landed', async () => {
    sequence([state()], [{ id: 's' }], [], failWith(500));
    const r = await callTool('add_steps', { task_id: 't1', steps: twoSteps });
    expect(r.result.isError).toBe(true);
    expect(text(r)).toBe('Some steps may have landed on their own. Check list_today.');
  });

  it('an insert that fails writes nothing more, and a refused token on title mode says so', async () => {
    let calls = sequence([state()], failWith(500));
    let r = await callTool('add_steps', { task_id: 't1', steps: twoSteps });
    expect(r.result.isError).toBe(true);
    expect(calls).toHaveLength(2);
    vi.unstubAllGlobals();
    calls = sequence(failWith(401));
    r = await callTool('add_steps', { title: 'Clear the garage', steps: twoSteps });
    expect(text(r)).toBe(TOKEN_EXPIRED);
    expect(calls).toHaveLength(1);
  });

  it('task_id and title together, or neither, one step, or bad steps are refused before any call', async () => {
    const calls = sequence([state()]);
    const bad: [object, RegExp][] = [
      [{ task_id: 't1', title: 'x', steps: twoSteps }, /One of them, not both/],
      [{ steps: twoSteps }, /One of them, not both/],
      [{ title: 'x', steps: [{ title: 'Only' }] }, /^Give at least two steps\. One step on its own never closes the big task\. Use add_task or update_task instead\.$/],
      [{ title: 'x', steps: [{ title: 'a' }, { title: 'b', minutes: 0 }] }, /minutes/],
      [{ title: 'x', steps: [{ title: 'a' }, { title: 'b', due: 'tomorrow' }] }, /due date/],
      [{ title: '  ', steps: twoSteps }, /title is required/],
      [{ title: 'y'.repeat(501), steps: twoSteps }, /too long/],
    ];
    for (const [args, says] of bad) {
      const r = await callTool('add_steps', args);
      expect(r.result.isError).toBe(true);
      expect(text(r)).toMatch(says);
    }
    expect(calls).toHaveLength(0);
  });

  // --- complete_task on a step --------------------------------------------------------------------------------

  it('the LAST step closes, then finishes the big task, dated to the step, under the finish guard, never writing open_parent', async () => {
    freeze();
    const calls = sequence([step('s2')], [{ id: 's2' }], [big()], [kid('s1', true), kid('s2', true, { completed_at: NOW })], [{ id: 'P' }]);
    const r = await callTool('complete_task', { id: 's2' });
    expect(text(r)).toBe(`Marked it done. That was the last step, so "Clear the garage" is done too. That's the whole thing.`);
    expect(calls.map((c) => c.init.method)).toEqual(['GET', 'PATCH', 'GET', 'GET', 'PATCH']);
    expect(paramsOf(calls[2])).toMatchObject({ id: 'eq.P', limit: '1' });
    expect(paramsOf(calls[3])).toMatchObject({ parent_id: 'eq.P' });
    expect(paramsOf(calls[3]).select.split(',')).not.toContain('left_off');
    expect(paramsOf(calls[4])).toEqual({ id: 'eq.P', deleted_at: 'is.null', done: 'is.false', silent_parent: 'is.true', open_parent: 'not.is.true' });
    const w = bodyOf(calls[4]);
    expect(w).toEqual({ done: true, completed_at: bodyOf(calls[1]).completed_at, silent_parent: false, updated_at: NOW });
    expect(w).not.toHaveProperty('open_parent');
  });

  it('a step that is not the last writes no parent, and says how many are done', async () => {
    const calls = sequence([step('s2')], [{ id: 's2' }], [big()], [kid('s1', true), kid('s2', true), kid('s3', false), kid('s4', false)]);
    const r = await callTool('complete_task', { id: 's2' });
    expect(text(r)).toBe('Marked it done. 2 of 4 steps toward "Clear the garage" done.');
    expect(calls).toHaveLength(4);
  });

  it('a round of one, a made-tiny pebble or a stale tiny flag is left to the app: no parent write, no tombstone, a neutral reply', async () => {
    const levels: [object, unknown[]][] = [
      [big(), [kid('s1', true)]],
      [big({ open_parent: true }), [kid('k', true)]],
      [big({ open_parent: true }), [kid('s1', true), kid('s2', true)]],
    ];
    for (const [parent, children] of levels) {
      const calls = sequence([step('s1')], [{ id: 's1' }], [parent], children);
      const r = await callTool('complete_task', { id: 's1' });
      expect(r.result.isError).toBeUndefined();
      expect(text(r)).toBe('Marked it done. "Clear the garage" will sort itself out next time DoubleDone opens.');
      expect(calls.filter((c) => c.init.method === 'PATCH')).toHaveLength(1); // the step's own close, nothing else
      vi.unstubAllGlobals();
    }
  });

  it('a big task already back on the list leaves the plain reply', async () => {
    sequence([step('s1')], [{ id: 's1' }], [big({ silent_parent: false })], [kid('s1', true), kid('s2', true)]);
    expect(text(await callTool('complete_task', { id: 's1' }))).toBe('Marked it done. Nice.');
  });

  it('a finish that fails, or that a device beat, never claims the close', async () => {
    for (const answer of [failWith(500), []]) {
      const calls = sequence([step('s2')], [{ id: 's2' }], [big()], [kid('s1', true), kid('s2', true)], answer);
      const t = text(await callTool('complete_task', { id: 's2' }));
      expect(t).toBe('Marked it done. "Clear the garage" will sort itself out next time DoubleDone opens.');
      expect(t).not.toMatch(/done too/);
      expect(calls).toHaveLength(5);
      vi.unstubAllGlobals();
    }
  });

  it('a walk read that fails still answers calmly, naming the big task from the step', async () => {
    sequence([step('s2')], [{ id: 's2' }], failWith(500));
    const r = await callTool('complete_task', { id: 's2' });
    expect(r.result.isError).toBeUndefined();
    expect(text(r)).toBe('Marked it done. "Clear the garage" will sort itself out next time DoubleDone opens.');
  });

  it('a nested chain finishes both, and the reply names the topmost', async () => {
    const calls = sequence(
      [step('s2')],
      [{ id: 's2' }],
      [big({ parent_id: 'G' })],
      [kid('s1', true), kid('s2', true)],
      [{ id: 'P' }],
      [big({ id: 'G', title: 'Move house' })],
      [kid('P', true, { parent_id: 'G' }), kid('Q', true, { parent_id: 'G' })],
      [{ id: 'G' }],
    );
    const t = text(await callTool('complete_task', { id: 's2' }));
    expect(t).toBe(`Marked it done. That was the last step, so "Move house" is done too. That's the whole thing.`);
    expect(calls.filter((c) => c.init.method === 'PATCH').map((c) => paramsOf(c).id)).toEqual(['eq.s2', 'eq.P', 'eq.G']);
  });

  it('a finished level under one still waiting says both', async () => {
    sequence(
      [step('s2')],
      [{ id: 's2' }],
      [big({ parent_id: 'G' })],
      [kid('s1', true), kid('s2', true)],
      [{ id: 'P' }],
      [big({ id: 'G', title: 'Move house' })],
      [kid('P', true, { parent_id: 'G' }), kid('Q', false, { parent_id: 'G' })],
    );
    const t = text(await callTool('complete_task', { id: 's2' }));
    expect(t).toBe('Marked it done. That was the last step, so "Clear the garage" is done too. 1 of 2 steps toward "Move house" done.');
  });

  it('the last part of a step in parts closes it, then walks', async () => {
    const calls = sequence([step('s2', { slices: { total: 2, done: 1 } })], [{ id: 's2' }], [big()], [kid('s1', true), kid('s2', true)], [{ id: 'P' }]);
    const t = text(await callTool('complete_task', { id: 's2' }));
    expect(t).toBe(`Ticked the last part of "s2 (5 min)", so it's done: all 2. Nice. That was the last step, so "Clear the garage" is done too. That's the whole thing.`);
    expect(calls).toHaveLength(5);
  });

  it('a part that does not finish a step in parts walks nothing', async () => {
    const calls = sequence([step('s2', { slices: { total: 3, done: 1 } })], [{ id: 's2' }]);
    await callTool('complete_task', { id: 's2' });
    expect(calls).toHaveLength(2);
  });

  it('a step already done is "Already done." and walks nothing', async () => {
    const calls = sequence([step('s2', { done: true })]);
    expect(text(await callTool('complete_task', { id: 's2' }))).toBe('Already done.');
    expect(calls).toHaveLength(1);
  });

  // --- update_task on steps -----------------------------------------------------------------------------------

  it('update_task done:true on the last step writes exactly what complete_task writes, walk included', async () => {
    freeze();
    const answers = (): unknown[] => [[step('s2')], [{ id: 's2' }], [big()], [kid('s1', true), kid('s2', true)], [{ id: 'P' }]];
    const viaComplete = sequence(...answers());
    const a = text(await callTool('complete_task', { id: 's2' }));
    vi.unstubAllGlobals();
    const viaUpdate = sequence(...answers());
    const b = text(await callTool('update_task', { id: 's2', done: true }));
    expect(shape(viaUpdate)).toEqual(shape(viaComplete));
    expect(b).toBe(a);
  });

  it('update_task parts that finishes a step runs the walk', async () => {
    const calls = sequence([step('s2', { slices: { total: 5, done: 3 } })], [{ id: 's2' }], [big()], [kid('s1', true), kid('s2', true)], [{ id: 'P' }]);
    const t = text(await callTool('update_task', { id: 's2', parts: 3 }));
    expect(t).toMatch(/so it's done\. Nice\. That was the last step, so "Clear the garage" is done too\. That's the whole thing\.$/);
    expect(calls.map((c) => c.init.method)).toEqual(['GET', 'PATCH', 'GET', 'GET', 'PATCH']);
  });

  it('update_task done:false on a step reopens the step only, never the big task it closed', async () => {
    const calls = sequence([step('s2', { done: true })], [{ id: 's2' }]);
    expect(text(await callTool('update_task', { id: 's2', done: false }))).toBe('Reopened.');
    expect(calls).toHaveLength(2);
    expect(paramsOf(calls[1]).id).toBe('eq.s2');
  });

  // --- the reads ----------------------------------------------------------------------------------------------

  it('list_today selects the step columns and marks a step toward its big task, or "(a step)" when unnamed', async () => {
    const calls = sequence([
      { id: 's1', title: 'Bag up the rubbish (5 min)', recurrence: null, parent_id: 'P', parent_title: 'Clear the garage' },
      { id: 's2', title: 'Sweep', recurrence: null, parent_id: 'P', parent_title: null },
      { id: 's3', title: 'Paint', recurrence: null, slices: { total: 3, done: 1 }, parent_id: 'P', parent_title: 'Clear the garage' },
      { id: 'o1', title: 'Call the vet', recurrence: null, parent_id: null },
    ]);
    const t = text(await callTool('list_today', {}));
    expect(paramsOf(calls[0]).select.split(',')).toEqual(expect.arrayContaining(['slices', 'parent_id', 'parent_title']));
    expect(paramsOf(calls[0]).select.split(',')).not.toContain('left_off');
    expect(t).toContain('• Bag up the rubbish (5 min)  (toward "Clear the garage")  [s1]');
    expect(t).toContain('• Sweep  (a step)  [s2]');
    expect(t).toContain('• Paint  (1/3 parts)  (toward "Clear the garage")  [s3]');
    expect(t).toContain('• Call the vet  [o1]');
  });

  it('list_upcoming marks a step on its day', async () => {
    const tomorrow = addDaysIso(new Date().toISOString().slice(0, 10), 1);
    const calls = sequence([{ id: 's1', title: 'Pack', recurrence: null, due: tomorrow, parent_id: 'P', parent_title: 'Move house' }]);
    const t = text(await callTool('list_upcoming', {}));
    expect(paramsOf(calls[0]).select.split(',')).toEqual(expect.arrayContaining(['parent_id', 'parent_title']));
    expect(t).toContain(`• Pack  (toward "Move house")`);
    expect(t).toContain(`${tomorrow}  [s1]`);
  });

  // --- break_down ---------------------------------------------------------------------------------------------

  it('break_down still makes ONE fetch, points at linked steps, and logs the offered steps in full', async () => {
    const anthropic = {
      content: [
        {
          type: 'tool_use',
          name: 'record_steps',
          input: {
            steps: [
              { title: 'Open the door', minutes: 2 },
              { title: 'Bag one box', minutes: 10 },
            ],
          },
        },
      ],
      usage: { input_tokens: 10, output_tokens: 20 },
    };
    const spy = vi.fn(async () => ({ ok: true, json: async () => anthropic }) as unknown as Response);
    vi.stubGlobal('fetch', spy as unknown as typeof fetch);
    const bound: unknown[][] = [];
    const DB = { prepare: () => ({ bind: (...p: unknown[]) => ({ run: async () => bound.push(p) }) }) };
    const e = { ...env, ANTHROPIC_API_KEY: 'sk-test', DB } as unknown as McpEnv;
    const r = await callTool('break_down', { task: 'Clean the garage' }, USER_JWT, e);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(text(r)).toMatch(/\n\nNothing's been added yet\. Say the word and I'll add these as linked steps\.$/);
    expect(text(r)).not.toMatch(/\[[^\]]+\]/);
    expect(bound).toHaveLength(1);
    expect(JSON.parse(bound[0][3] as string)).toEqual({
      steps: [
        { title: 'Open the door', minutes: 2 },
        { title: 'Bag one box', minutes: 10 },
      ],
    });
    expect(JSON.parse(bound[0][2] as string)).toEqual({ task: 'Clean the garage', via: 'mcp' });
  });
});
