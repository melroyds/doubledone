import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createRequest,
  deleteRequest,
  describeRecurrence,
  handleApi,
  listRequest,
  newTaskId,
  parseCreate,
  parseStepsBody,
  parseUpdate,
  searchTasks,
  toApiTask,
  updateRequest,
  upcomingTasks,
  upcomingWindow,
} from './api';
import { bodyOf, type Call, failWith, GARBLED, paramsOf, REJECTS, sequence } from './fetch-sequence.test-helper';
import { decodeJwtSub, handleMcp } from './mcp';

const env = { SUPABASE_URL: 'https://sb.example.co', SUPABASE_ANON_KEY: 'anon-key' };

// The verifier stub for the existing behaviour tests: a decoded sub counts as verified, so these tests
// keep testing what they always tested. The PR A block at the bottom uses the REAL verifier with forged
// tokens to prove the wall, and never touches the network (a rejected alg needs no key fetch).
const trust = async (token: string) => decodeJwtSub(token);

// A minimal unsigned JWT carrying just a `sub`. The behaviour tests pass the `trust` stub so it counts as
// verified; the PR A block at the bottom feeds the same shape to the REAL verifier and expects a 401.
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
    ).toEqual({
      id: 't1',
      title: 'A',
      done: true,
      due: '2026-06-21',
      recurrence: null,
      repeats: null,
      partsTotal: null,
      partsDone: null,
      parentId: null,
      parentTitle: null,
      hidden: false,
      createdAt: 'c',
      completedAt: 'd',
    });
  });
  it('defaults the nullable fields', () => {
    const t = toApiTask({ id: 't2', title: 'B', done: false });
    expect(t.due).toBeNull();
    expect(t.completedAt).toBeNull();
    expect(t.recurrence).toBeNull();
    expect(t.repeats).toBeNull();
  });
  it('exposes a normalised recurrence plus a human summary', () => {
    const t = toApiTask({ id: 't3', title: 'Water plants', done: false, recurrence: { kind: 'weekly', weekdays: [1, 3, 5] } });
    expect(t.recurrence).toEqual({ kind: 'weekly', weekdays: [1, 3, 5], start: undefined });
    expect(t.repeats).toBe('Mon, Wed, Fri');
    expect(t.due).toBeNull();
  });
  it('never surfaces the completed_dates / skipped_dates bookkeeping', () => {
    const t = toApiTask({ id: 't4', title: 'C', done: false, recurrence: { kind: 'daily' }, completed_dates: ['2026-07-01'], skipped_dates: ['2026-07-02'] });
    expect(Object.keys(t)).not.toContain('completed_dates');
    expect(Object.keys(t)).not.toContain('skipped_dates');
    expect(t.repeats).toBe('every day');
  });
  it('a malformed recurrence column becomes null, not a throw', () => {
    const t = toApiTask({ id: 't5', title: 'D', done: false, recurrence: { kind: 'nonsense' } });
    expect(t.recurrence).toBeNull();
    expect(t.repeats).toBeNull();
  });
});

describe('describeRecurrence', () => {
  it('summarises each kind in calm English', () => {
    expect(describeRecurrence({ kind: 'daily' })).toBe('every day');
    expect(describeRecurrence({ kind: 'interval', days: 3, anchor: '2026-07-01' })).toBe('every 3 days');
    expect(describeRecurrence({ kind: 'interval', days: 1, anchor: '2026-07-01' })).toBe('every day');
    expect(describeRecurrence({ kind: 'weekly', weekdays: [0, 6] })).toBe('Sun, Sat');
    expect(describeRecurrence({ kind: 'weekly', weekdays: [0, 1, 2, 3, 4, 5, 6] })).toBe('every day');
    expect(describeRecurrence({ kind: 'monthly', day: 1 })).toBe('every month on the 1st');
    expect(describeRecurrence(null)).toBeNull();
  });

  // The ordinal is hand-rolled here for the same reason it is on the client: this summary must be
  // computable without an i18n dependency. The teens are where every hand-rolled ordinal breaks.
  it('inflects the day of the month, teens included', () => {
    const day = (d: number) => describeRecurrence({ kind: 'monthly', day: d });
    expect([day(1), day(2), day(3), day(4)]).toEqual([
      'every month on the 1st',
      'every month on the 2nd',
      'every month on the 3rd',
      'every month on the 4th',
    ]);
    expect([day(11), day(12), day(13)]).toEqual([
      'every month on the 11th',
      'every month on the 12th',
      'every month on the 13th',
    ]);
    expect([day(21), day(22), day(23), day(31)]).toEqual([
      'every month on the 21st',
      'every month on the 22nd',
      'every month on the 23rd',
      'every month on the 31st',
    ]);
  });
});

describe('request builders', () => {
  it('listRequest adds the today filters only when asked', () => {
    expect(listRequest(env, 'tok').url).not.toContain('due.lte');
    // No silent_parent FILTER on the plain list (the column is selected, to guard writes, but nothing is excluded).
    expect(new URL(listRequest(env, 'tok').url).searchParams.has('silent_parent')).toBe(false);
    const todayUrl = decodeURIComponent(listRequest(env, 'tok', { today: true, todayIso: '2026-06-21' }).url);
    expect(todayUrl).toContain('due.lte.2026-06-21');
    expect(todayUrl).toContain('silent_parent=not.is.true');
  });

  it('createRequest POSTs the user_id, title, and done:false', () => {
    const { url, init } = createRequest(env, 'tok', { id: 'api-1', userId: 'u1', title: 'Buy milk', due: null, now: 'N' });
    expect(url).toContain('/rest/v1/tasks');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({ id: 'api-1', user_id: 'u1', title: 'Buy milk', done: false });
    expect(body).not.toHaveProperty('recurrence'); // omitted when absent: byte-for-byte the old row
  });

  it('createRequest writes recurrence when a repeat is given', () => {
    const body = JSON.parse(
      createRequest(env, 'tok', { id: 'api-2', userId: 'u1', title: 'Stretch', due: null, recurrence: { kind: 'daily', start: '2026-07-07' }, now: 'N' }).init.body as string,
    );
    expect(body.recurrence).toEqual({ kind: 'daily', start: '2026-07-07' });
    expect(body).not.toHaveProperty('due');
  });

  it('updateRequest stamps completed_at when done is set true', () => {
    const body = JSON.parse(updateRequest(env, 'tok', 't1', { done: true }, 'NOW').init.body as string);
    expect(body.done).toBe(true);
    expect(body.completed_at).toBe('NOW');
  });

  it('updateRequest makes due and recurrence mutually exclusive', () => {
    // Setting a due day nulls any repeat.
    const dueBody = JSON.parse(updateRequest(env, 'tok', 't1', { due: '2026-07-10' }, 'NOW').init.body as string);
    expect(dueBody.due).toBe('2026-07-10');
    expect(dueBody.recurrence).toBeNull();
    // Setting a repeat nulls any due day.
    const repBody = JSON.parse(updateRequest(env, 'tok', 't1', { recurrence: { kind: 'daily', start: '2026-07-07' } }, 'NOW').init.body as string);
    expect(repBody.recurrence).toEqual({ kind: 'daily', start: '2026-07-07' });
    expect(repBody.due).toBeNull();
    // Clearing due (null) does NOT touch recurrence.
    const clearBody = JSON.parse(updateRequest(env, 'tok', 't1', { due: null }, 'NOW').init.body as string);
    expect(clearBody.due).toBeNull();
    expect(clearBody).not.toHaveProperty('recurrence');
  });

  it('deleteRequest soft-deletes via a PATCH on deleted_at, on a live row only', () => {
    const { url, init } = deleteRequest(env, 'tok', 't1', 'NOW');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body as string).deleted_at).toBe('NOW');
    // A second removal must not move the first one's time (the app reads it for Undo and Combine).
    expect(Object.fromEntries(new URL(url).searchParams)).toEqual({ id: 'eq.t1', deleted_at: 'is.null' });
  });
});

describe('parseCreate', () => {
  it('requires a non-empty title', () => {
    expect(parseCreate({ title: 'x' })).toEqual({ body: { title: 'x', due: null, repeat: null } });
    expect('error' in parseCreate({})).toBe(true);
    expect('error' in parseCreate({ title: '  ' })).toBe(true);
  });
  it('validates due as an ISO date', () => {
    expect(parseCreate({ title: 'x', due: '2026-06-21' })).toEqual({ body: { title: 'x', due: '2026-06-21', repeat: null } });
    expect('error' in parseCreate({ title: 'x', due: 'soon' })).toBe(true);
  });
  it('accepts a repeat object (deep validation is deferred to buildRecurrence)', () => {
    const r = parseCreate({ title: 'x', repeat: { kind: 'daily' } });
    expect('body' in r && r.body.repeat).toEqual({ kind: 'daily' });
  });
  it('rejects due and repeat together', () => {
    expect('error' in parseCreate({ title: 'x', due: '2026-07-10', repeat: { kind: 'daily' } })).toBe(true);
  });
  it('rejects a non-object repeat', () => {
    expect('error' in parseCreate({ title: 'x', repeat: 'daily' })).toBe(true);
  });
});

describe('parseUpdate', () => {
  it('accepts any of title / done / due / repeat', () => {
    expect(parseUpdate({ done: true })).toEqual({ body: { done: true } });
    expect(parseUpdate({ due: null })).toEqual({ body: { due: null } });
    expect(parseUpdate({ repeat: { kind: 'weekly', weekdays: [1] } })).toEqual({ body: { repeat: { kind: 'weekly', weekdays: [1] } } });
    expect(parseUpdate({ repeat: null })).toEqual({ body: { repeat: null } });
  });
  it('rejects an empty patch or an empty title', () => {
    expect('error' in parseUpdate({})).toBe(true);
    expect('error' in parseUpdate({ title: '' })).toBe(true);
  });
  it('rejects a non-null due and a non-null repeat together', () => {
    expect('error' in parseUpdate({ due: '2026-07-10', repeat: { kind: 'daily' } })).toBe(true);
    // Clearing a date while setting a repeat is fine (they don't conflict).
    expect('body' in parseUpdate({ due: null, repeat: { kind: 'daily' } })).toBe(true);
  });
});

describe('searchTasks', () => {
  const rows = [
    { id: 'a', title: 'Call the dentist', done: false },
    { id: 'b', title: 'Buy DENTAL floss', done: false },
    { id: 'c', title: 'Water plants', done: false },
  ];
  it('matches case-insensitively over titles', () => {
    expect(searchTasks(rows, 'dent').map((t) => t.id)).toEqual(['a', 'b']);
  });
  it('returns full task objects (with the recurrence fields)', () => {
    const [t] = searchTasks(rows, 'water');
    expect(t).toMatchObject({ id: 'c', title: 'Water plants', recurrence: null, repeats: null });
  });
  it('an empty query returns everything up to the cap', () => {
    expect(searchTasks(rows, '')).toHaveLength(3);
    expect(searchTasks(rows, '  ')).toHaveLength(3);
  });
  it('is defensive against a non-array', () => {
    expect(searchTasks(null, 'x')).toEqual([]);
  });
});

describe('upcomingWindow', () => {
  it('defaults to 7 and clamps 1..30', () => {
    expect(upcomingWindow(null, '2026-07-07').count).toBe(7);
    expect(upcomingWindow('0', '2026-07-07').count).toBe(1);
    expect(upcomingWindow('99', '2026-07-07').count).toBe(30);
    expect(upcomingWindow('3', '2026-07-07')).toEqual({ count: 3, endIso: '2026-07-10' });
  });
});

describe('upcomingTasks', () => {
  const today = '2026-07-07'; // a Tuesday (UTC)
  it('keeps future one-offs on their due day', () => {
    const rows = [{ id: 'a', title: 'Vet', done: false, due: '2026-07-09' }];
    expect(upcomingTasks(rows, today, 7)).toMatchObject([{ id: 'a', due: '2026-07-09' }]);
  });
  it("surfaces a repeat's next occurrence as its due, and sorts with one-offs", () => {
    const rows = [
      { id: 'daily', title: 'Stretch', done: false, recurrence: { kind: 'daily' } },
      { id: 'oneoff', title: 'Vet', done: false, due: '2026-07-09' },
    ];
    const out = upcomingTasks(rows, today, 7);
    // The daily repeat's next hit is tomorrow (07-08), which sorts before the 07-09 one-off.
    expect(out.map((t) => [t.id, t.due])).toEqual([
      ['daily', '2026-07-08'],
      ['oneoff', '2026-07-09'],
    ]);
    expect(out[0].repeats).toBe('every day');
  });
  it('skips a repeat already completed on its next day, taking the one after', () => {
    const rows = [{ id: 'd', title: 'Stretch', done: false, recurrence: { kind: 'daily' }, completed_dates: ['2026-07-08'] }];
    expect(upcomingTasks(rows, today, 7)[0].due).toBe('2026-07-09');
  });
  it('drops a repeat with no occurrence inside the window', () => {
    // Weekly on Sunday (0); with a 1-day window from Tuesday it never lands.
    const rows = [{ id: 'w', title: 'Laundry', done: false, recurrence: { kind: 'weekly', weekdays: [0] } }];
    expect(upcomingTasks(rows, today, 1)).toEqual([]);
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
    const res = await handleApi(req('GET', '/api/v1/openapi.json'), env, trust);
    expect(res.status).toBe(200);
    const spec = (await res.json()) as { openapi: string; paths: Record<string, unknown> };
    expect(spec.openapi).toBe('3.1.0');
    expect(spec.paths).toHaveProperty('/tasks');
  });

  it('serves the Swagger UI page without a token', async () => {
    const res = await handleApi(req('GET', '/api/v1/docs'), env, trust);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
  });

  it('401s a task call with no token', async () => {
    expect((await handleApi(req('GET', '/api/v1/tasks'), env, trust)).status).toBe(401);
  });

  it('lists tasks for a valid token (mocked Supabase)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => [{ id: 't1', title: 'A', done: false, due: null, created_at: 'c', completed_at: null }],
      }) as unknown as Response),
    );
    const res = await handleApi(req('GET', '/api/v1/tasks', { token: fakeJwt('u1') }), env, trust);
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
    const res = await handleApi(req('POST', '/api/v1/tasks', { token: fakeJwt('u1'), body: { title: 'Buy milk' } }), env, trust);
    expect(res.status).toBe(201);
    expect(((await res.json()) as { task: { title: string } }).task.title).toBe('Buy milk');
  });

  it('400s a create with no title', async () => {
    expect((await handleApi(req('POST', '/api/v1/tasks', { token: fakeJwt('u1'), body: {} }), env, trust)).status).toBe(400);
  });

  it('creates a repeating task and returns its recurrence + repeats summary', async () => {
    let sentBody: Record<string, unknown> = {};
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        sentBody = JSON.parse(init.body as string);
        return {
          ok: true,
          json: async () => [{ id: 'api-1', title: 'Stretch', done: false, due: null, recurrence: sentBody.recurrence, created_at: 'c', completed_at: null }],
        } as unknown as Response;
      }),
    );
    const res = await handleApi(req('POST', '/api/v1/tasks', { token: fakeJwt('u1'), body: { title: 'Stretch', repeat: { kind: 'weekly', weekdays: [1, 3, 5] } } }), env, trust);
    expect(res.status).toBe(201);
    const { task } = (await res.json()) as { task: { recurrence: unknown; repeats: string } };
    expect(task.recurrence).toMatchObject({ kind: 'weekly', weekdays: [1, 3, 5] });
    expect(task.repeats).toBe('Mon, Wed, Fri');
    // The row written to Supabase carried the translated recurrence, no due.
    expect(sentBody.recurrence).toMatchObject({ kind: 'weekly', weekdays: [1, 3, 5] });
    expect(sentBody).not.toHaveProperty('due');
  });

  it('400s a create with both due and repeat', async () => {
    const res = await handleApi(req('POST', '/api/v1/tasks', { token: fakeJwt('u1'), body: { title: 'x', due: '2026-07-10', repeat: { kind: 'daily' } } }), env, trust);
    expect(res.status).toBe(400);
  });

  it('400s a create with a malformed repeat (never a 500)', async () => {
    // weekly with no weekdays: buildRecurrence returns null -> calm 400.
    const res = await handleApi(req('POST', '/api/v1/tasks', { token: fakeJwt('u1'), body: { title: 'x', repeat: { kind: 'weekly' } } }), env, trust);
    expect(res.status).toBe(400);
  });

  it('searches with ?q (case-insensitive, Worker-side)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => [
          { id: 'a', title: 'Call the DENTIST', done: false },
          { id: 'b', title: 'Water plants', done: false },
        ],
      }) as unknown as Response),
    );
    const res = await handleApi(req('GET', '/api/v1/tasks?q=dentist', { token: fakeJwt('u1') }), env, trust);
    expect(res.status).toBe(200);
    const { tasks } = (await res.json()) as { tasks: { id: string }[] };
    expect(tasks.map((t) => t.id)).toEqual(['a']);
  });

  it('windows with ?upcoming, surfacing a repeat next-occurrence as due', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => [{ id: 'd', title: 'Stretch', done: false, recurrence: { kind: 'daily' } }],
      }) as unknown as Response),
    );
    const res = await handleApi(req('GET', '/api/v1/tasks?upcoming=5', { token: fakeJwt('u1') }), env, trust);
    expect(res.status).toBe(200);
    const { tasks } = (await res.json()) as { tasks: { id: string; due: string; repeats: string }[] };
    expect(tasks[0].id).toBe('d');
    expect(tasks[0].repeats).toBe('every day');
    // A concrete future day, not null (the repeat's next landing).
    expect(tasks[0].due).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('patches a task to repeat and returns the recurrence (read first: a repeat is refused on some shapes)', async () => {
    const before = { id: 't1', title: 'A', done: false, due: '2026-07-10', recurrence: null, created_at: 'c', completed_at: null };
    const calls = sequence([before], [{ ...before, due: null, recurrence: { kind: 'daily', start: '2026-07-07' } }]);
    const res = await handleApi(req('PATCH', '/api/v1/tasks/t1', { token: fakeJwt('u1'), body: { repeat: { kind: 'daily' } } }), env, trust);
    expect(res.status).toBe(200);
    const { task } = (await res.json()) as { task: { repeats: string } };
    expect(task.repeats).toBe('every day');
    expect(calls.map((c) => c.init.method)).toEqual(['GET', 'PATCH']);
    expect(bodyOf(calls[1]).due).toBeNull(); // setting a repeat clears the due day
  });

  it('400s a patch with both due and repeat', async () => {
    const res = await handleApi(req('PATCH', '/api/v1/tasks/t1', { token: fakeJwt('u1'), body: { due: '2026-07-10', repeat: { kind: 'daily' } } }), env, trust);
    expect(res.status).toBe(400);
  });

  it('204s a delete', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => [{}] }) as unknown as Response));
    expect((await handleApi(req('DELETE', '/api/v1/tasks/t1', { token: fakeJwt('u1') }), env, trust)).status).toBe(204);
  });

  it('a DELETE of a task already removed is still a 204, and the tombstone is never written again', async () => {
    // The read only finds live rows, so a second delete writes nothing at all.
    const calls = sequence([]);
    expect((await handleApi(req('DELETE', '/api/v1/tasks/t1', { token: fakeJwt('u1') }), env, trust)).status).toBe(204);
    expect(calls.map((c) => [c.init.method, paramsOf(c).deleted_at])).toEqual([['GET', 'is.null']]);
  });

  it('404s an unknown path under /api/v1', async () => {
    expect((await handleApi(req('GET', '/api/v1/nope', { token: fakeJwt('u1') }), env, trust)).status).toBe(404);
  });
});

describe('PR A: the bearer is verified before any call', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('a forged alg:none token is a 401 with the re-copy hint, and Supabase is never asked (real verifier)', async () => {
    const spy = vi.fn();
    vi.stubGlobal('fetch', spy);
    const res = await handleApi(req('GET', '/api/v1/tasks', { token: fakeJwt('victim-1') }), env); // no stub: the real verifier
    expect(res.status).toBe(401);
    expect(((await res.json()) as { error: string }).error).toMatch(/expired or invalid/);
    expect(spy).not.toHaveBeenCalled();
  });

  it('a forged token cannot reach the create path either', async () => {
    const spy = vi.fn();
    vi.stubGlobal('fetch', spy);
    const res = await handleApi(req('POST', '/api/v1/tasks', { token: fakeJwt('victim-1'), body: { title: 'x' } }), env);
    expect(res.status).toBe(401);
    expect(spy).not.toHaveBeenCalled();
  });

  it('an upstream 401 (a token refused after verification) is a 401, never a 502 "upstream error"', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 401, json: async () => ({}) }) as unknown as Response));
    const res = await handleApi(req('GET', '/api/v1/tasks', { token: fakeJwt('u1') }), env, trust);
    expect(res.status).toBe(401);
    expect(((await res.json()) as { error: string }).error).toMatch(/expired or invalid/);
  });

  it('an upstream 500 stays the 502', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) }) as unknown as Response));
    const res = await handleApi(req('GET', '/api/v1/tasks', { token: fakeJwt('u1') }), env, trust);
    expect(res.status).toBe(502);
  });

  it('the no-token 401 points at the real Settings label', async () => {
    const res = await handleApi(req('GET', '/api/v1/tasks'), env, trust);
    expect(((await res.json()) as { error: string }).error).toContain('AI agent access (MCP)');
  });
});

describe('PR B + C: a repeat is ticked, not closed; a bad id is a 400; a throw is a calm 500', () => {
  afterEach(() => vi.unstubAllGlobals());
  const todayIso = new Date().toISOString().slice(0, 10);
  const row = { id: 'r1', title: 'Meds', done: false, due: null, recurrence: { kind: 'daily' }, completed_dates: ['2026-09-01'], created_at: 'c', completed_at: null };

  it('PATCH done:true on a REPEATING task writes completed_dates with today and leaves done alone', async () => {
    const calls = sequence([row], [row]);
    const res = await handleApi(req('PATCH', '/api/v1/tasks/r1', { token: fakeJwt('u1'), body: { done: true } }), env, trust);
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(2);
    expect(calls[0].init.method).toBe('GET');
    const w = bodyOf(calls[1]);
    expect(w.completed_dates).toEqual(['2026-09-01', todayIso]);
    expect(w.done).toBeUndefined();
    const task = ((await res.json()) as { task: { done: boolean; repeats: string | null } }).task;
    expect(task.done).toBe(false);
    expect(task.repeats).toBeTruthy();
  });

  it('PATCH done:true on a ONE-OFF still closes it', async () => {
    const one = { ...row, recurrence: null, completed_dates: null };
    const calls = sequence([one], [{ ...one, done: true, completed_at: 'now' }]);
    const res = await handleApi(req('PATCH', '/api/v1/tasks/r1', { token: fakeJwt('u1'), body: { done: true } }), env, trust);
    expect(res.status).toBe(200);
    expect(bodyOf(calls[1]).done).toBe(true);
    expect(bodyOf(calls[1]).completed_dates).toBeUndefined(); // a one-off never carries the tick array
  });

  it('PATCH done on an unknown id is a 404 after the read, with no write', async () => {
    const calls = sequence([]);
    const res = await handleApi(req('PATCH', '/api/v1/tasks/nope', { token: fakeJwt('u1'), body: { done: true } }), env, trust);
    expect(res.status).toBe(404);
    expect(calls).toHaveLength(1);
  });

  it('updateRequest sends completedDates as completed_dates', () => {
    const body = JSON.parse(updateRequest(env, 'tok', 't1', { completedDates: ['2026-09-25'] }, 'NOW').init.body as string);
    expect(body.completed_dates).toEqual(['2026-09-25']);
    expect(body.done).toBeUndefined();
  });

  for (const method of ['GET', 'PATCH', 'DELETE']) {
    it(`${method} /tasks/%E0 (an id that does not decode) is a calm 400 with CORS, never a raw 500`, async () => {
      const spy = vi.fn();
      vi.stubGlobal('fetch', spy);
      const res = await handleApi(req(method, '/api/v1/tasks/%E0', { token: fakeJwt('u1'), body: method === 'PATCH' ? { title: 'x' } : undefined }), env, trust);
      expect(res.status).toBe(400);
      expect(res.headers.get('access-control-allow-origin')).toBe('*');
      expect(spy).not.toHaveBeenCalled();
    });
  }

  it('GET /tasks/{id} returns the task (the item route finally has a handler test)', async () => {
    sequence([row]);
    const res = await handleApi(req('GET', '/api/v1/tasks/r1', { token: fakeJwt('u1') }), env, trust);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { task: { id: string } }).task.id).toBe('r1');
  });

  it('a fetch that rejects is a JSON 500 with CORS, never a raw Cloudflare page', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('boom'); }));
    const res = await handleApi(req('GET', '/api/v1/tasks', { token: fakeJwt('u1') }), env, trust);
    expect(res.status).toBe(500);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(((await res.json()) as { error: string }).error).toMatch(/Try again/);
  });
});

describe('PR B review: REST resolves done against the shape after the patch, and takes a day', () => {
  afterEach(() => vi.unstubAllGlobals());
  const repeat = { id: 'r1', title: 'Meds', done: false, due: null, recurrence: { kind: 'daily' }, completed_dates: ['2026-09-01'], created_at: 'c', completed_at: null };

  it('PATCH {done:true, repeat:null} on a repeat closes the one-off it makes, with no tick write (parity with MCP)', async () => {
    const calls = sequence([repeat], [{ ...repeat, recurrence: null, done: true }]);
    const res = await handleApi(req('PATCH', '/api/v1/tasks/r1', { token: fakeJwt('u1'), body: { done: true, repeat: null } }), env, trust);
    expect(res.status).toBe(200);
    const w = bodyOf(calls[1]);
    expect(w.done).toBe(true);
    expect(w.recurrence).toBeNull();
    expect(w.completed_dates).toBeUndefined();
  });

  it('PATCH {done:true, day} ticks the named day on a repeat', async () => {
    const calls = sequence([repeat], [repeat]);
    const res = await handleApi(req('PATCH', '/api/v1/tasks/r1', { token: fakeJwt('u1'), body: { done: true, day: '2026-09-24' } }), env, trust);
    expect(res.status).toBe(200);
    expect(bodyOf(calls[1]).completed_dates).toEqual(['2026-09-01', '2026-09-24']);
  });

  it('an impossible day, or a day without done, is a calm 400', () => {
    expect(parseUpdate({ done: true, day: '2026-02-30' })).toEqual({ error: 'day must be a real calendar day (YYYY-MM-DD)' });
    expect(parseUpdate({ day: '2026-09-24' })).toEqual({ error: 'day only makes sense with done' });
  });
});

describe('parts over REST: partsTotal / partsDone, absolute and forward-only', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
  const token = fakeJwt('u1');
  /** A row as getRequest's SELECT returns it: a one-off tracked in parts. */
  const sliced = (done: number, total: number, extra: object = {}) => ({
    id: 's1',
    title: 'Watch Severance',
    done: false,
    due: null,
    recurrence: null,
    completed_dates: null,
    slices: { total, done },
    silent_parent: null,
    parent_id: null,
    created_at: 'c',
    completed_at: null,
    ...extra,
  });
  const oneOff = (extra: object = {}) => ({ ...sliced(0, 1), id: 't1', title: 'Call the vet', slices: null, ...extra });
  const patch = (id: string, body: unknown) => handleApi(req('PATCH', `/api/v1/tasks/${id}`, { token, body }), env, trust);
  const taskOf = async (res: Response) => ((await res.json()) as { task: Record<string, unknown> }).task;
  const errorOf = async (res: Response) => ((await res.json()) as { error: string }).error;
  /** The guard filters of a recorded PATCH, without the select the REST write adds. */
  const guardOf = (c: Call) => {
    const q = paramsOf(c);
    delete q.select;
    return q;
  };

  // --- the task shape and the body checks -----------------------------------------------------

  it('toApiTask exposes partsTotal / partsDone, cleaned the way the app cleans them, and null for a whole task', () => {
    expect(toApiTask({ id: 's', title: 'S', done: false, slices: { total: 10, done: 3 } })).toMatchObject({ partsTotal: 10, partsDone: 3 });
    expect(toApiTask({ id: 's', title: 'S', done: false, slices: { total: 5.5, done: 7 } })).toMatchObject({ partsTotal: 5, partsDone: 5 });
    for (const slices of [null, undefined, { total: 0, done: 0 }, { total: '5', done: 1 }, 'junk']) {
      expect(toApiTask({ id: 's', title: 'S', done: false, slices })).toMatchObject({ partsTotal: null, partsDone: null });
    }
  });

  it('parseCreate takes partsTotal 2-50 (with a due day too), and refuses it with a repeat', () => {
    expect(parseCreate({ title: 'x', partsTotal: 4 })).toEqual({ body: { title: 'x', due: null, repeat: null, partsTotal: 4 } });
    expect(parseCreate({ title: 'x', due: '2026-11-02', partsTotal: 4 })).toMatchObject({ body: { due: '2026-11-02', partsTotal: 4 } });
    expect(parseCreate({ title: 'x', partsTotal: null })).toEqual({ body: { title: 'x', due: null, repeat: null } });
    for (const partsTotal of [1, 51, 2.5, '4']) expect('error' in parseCreate({ title: 'x', partsTotal })).toBe(true);
    expect('error' in parseCreate({ title: 'x', partsTotal: 4, repeat: { kind: 'daily' } })).toBe(true);
  });

  it('parseUpdate takes partsTotal (or null) and partsDone, one change of shape at a time', () => {
    expect(parseUpdate({ partsTotal: 6 })).toEqual({ body: { partsTotal: 6 } });
    expect(parseUpdate({ partsTotal: null })).toEqual({ body: { partsTotal: null } });
    expect(parseUpdate({ partsDone: 0 })).toEqual({ body: { partsDone: 0 } });
    expect(parseUpdate({ partsDone: 3, title: 'x' })).toEqual({ body: { title: 'x', partsDone: 3 } });
    // Any two of partsTotal / partsDone / done is a 400: each can finish the task, so two have no single meaning.
    for (const body of [{ partsTotal: 4, partsDone: 2 }, { partsTotal: 4, done: true }, { partsDone: 2, done: true }, { partsTotal: null, done: false }]) {
      expect(parseUpdate(body)).toEqual({ error: 'send one of partsTotal, partsDone or done at a time' });
    }
    expect('error' in parseUpdate({ partsTotal: 4, repeat: { kind: 'daily' } })).toBe(true);
    expect('error' in parseUpdate({ partsDone: 2, repeat: { kind: 'daily' } })).toBe(true);
    for (const partsDone of [-1, 51, 2.5, '2', null]) expect('error' in parseUpdate({ partsDone })).toBe(true);
    for (const partsTotal of [1, 51, 2.5, '4']) expect('error' in parseUpdate({ partsTotal })).toBe(true);
  });

  it('POST partsTotal writes slices {N, 0} and returns the task with its parts', async () => {
    const calls = sequence([{ ...sliced(0, 4), id: 'api-1', title: 'Read the report' }]);
    const res = await handleApi(req('POST', '/api/v1/tasks', { token, body: { title: 'Read the report', partsTotal: 4 } }), env, trust);
    expect(res.status).toBe(201);
    expect(bodyOf(calls[0]).slices).toEqual({ total: 4, done: 0 });
    expect(await taskOf(res)).toMatchObject({ partsTotal: 4, partsDone: 0 });
  });

  it('POST partsTotal with a repeat, or two shapes in one PATCH, is a 400 before Supabase is asked', async () => {
    const calls = sequence([]);
    expect((await handleApi(req('POST', '/api/v1/tasks', { token, body: { title: 'x', partsTotal: 4, repeat: { kind: 'daily' } } }), env, trust)).status).toBe(400);
    expect((await patch('s1', { partsDone: 2, done: true })).status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  // --- partsDone ------------------------------------------------------------------------------

  it('partsDone forward: one read, then one PATCH of the counts alone, pinned to the stored counts', async () => {
    const calls = sequence([sliced(1, 4)], [sliced(2, 4)]);
    const res = await patch('s1', { partsDone: 2 });
    expect(res.status).toBe(200);
    expect(await taskOf(res)).toMatchObject({ partsTotal: 4, partsDone: 2, done: false });
    expect(calls.map((c) => c.init.method)).toEqual(['GET', 'PATCH']);
    expect(bodyOf(calls[1])).toEqual({ updated_at: expect.any(String), slices: { total: 4, done: 2 } });
    expect(guardOf(calls[1])).toEqual({ id: 'eq.s1', deleted_at: 'is.null', 'slices->>done': 'eq.1', 'slices->>total': 'eq.4', done: 'is.false' });
  });

  it('partsDone at the total finishes the task: done and its stamp ride the same write', async () => {
    const calls = sequence([sliced(3, 4)], [sliced(4, 4, { done: true, completed_at: 'now' })]);
    const res = await patch('s1', { partsDone: 4 });
    expect(res.status).toBe(200);
    const w = bodyOf(calls[1]);
    expect(w).toEqual({ updated_at: expect.any(String), done: true, completed_at: w.updated_at, slices: { total: 4, done: 4 } });
  });

  it('partsDone equal to the count is a 200 with the task as it stands and NO write, so a retry is harmless', async () => {
    const calls = sequence([sliced(2, 4)]);
    const res = await patch('s1', { partsDone: 2 });
    expect(res.status).toBe(200);
    expect(await taskOf(res)).toMatchObject({ partsDone: 2 });
    expect(calls).toHaveLength(1);
  });

  it('partsDone lower than the count is a 409 (parts only go forward); above the total is a 400; on a whole task a 409', async () => {
    let calls = sequence([sliced(3, 4)]);
    let res = await patch('s1', { partsDone: 1 });
    expect(res.status).toBe(409);
    expect(await errorOf(res)).toMatch(/only go forward/);
    expect(calls).toHaveLength(1);
    vi.unstubAllGlobals();
    calls = sequence([sliced(3, 4)]);
    res = await patch('s1', { partsDone: 9 });
    expect(res.status).toBe(400);
    expect(await errorOf(res)).toBe('partsDone can be at most partsTotal (4)');
    expect(calls).toHaveLength(1);
    vi.unstubAllGlobals();
    calls = sequence([oneOff()]);
    res = await patch('t1', { partsDone: 1 });
    expect(res.status).toBe(409);
    expect(calls).toHaveLength(1);
  });

  it('a row a merge left at every part ticked but still open is closed by partsDone at the total', async () => {
    const calls = sequence([sliced(4, 4)], [sliced(4, 4, { done: true })]);
    expect((await patch('s1', { partsDone: 4 })).status).toBe(200);
    expect(bodyOf(calls[1])).toMatchObject({ done: true, slices: { total: 4, done: 4 } });
  });

  // --- partsTotal -----------------------------------------------------------------------------

  it('partsTotal resizes and carries progress over; at or below what is ticked it finishes the task', async () => {
    let calls = sequence([sliced(3, 10)], [sliced(3, 12)]);
    expect((await patch('s1', { partsTotal: 12 })).status).toBe(200);
    expect(bodyOf(calls[1])).toEqual({ updated_at: expect.any(String), slices: { total: 12, done: 3 } });
    expect(guardOf(calls[1])).toMatchObject({ 'slices->>done': 'eq.3', 'slices->>total': 'eq.10', done: 'is.false' });
    vi.unstubAllGlobals();
    calls = sequence([sliced(4, 10)], [sliced(4, 4, { done: true })]);
    expect((await patch('s1', { partsTotal: 4 })).status).toBe(200);
    expect(bodyOf(calls[1])).toMatchObject({ done: true, completed_at: expect.any(String), slices: { total: 4, done: 4 } });
  });

  it('partsTotal on a whole task starts it at none done', async () => {
    const calls = sequence([oneOff()], [oneOff({ slices: { total: 5, done: 0 } })]);
    const res = await patch('t1', { partsTotal: 5 });
    expect(await taskOf(res)).toMatchObject({ partsTotal: 5, partsDone: 0 });
    expect(bodyOf(calls[1]).slices).toEqual({ total: 5, done: 0 });
    expect(guardOf(calls[1])).toMatchObject({ 'slices->>done': 'is.null', 'slices->>total': 'is.null' });
  });

  it('partsTotal: null makes it one whole task again; on a whole task it writes nothing', async () => {
    let calls = sequence([sliced(3, 10)], [oneOff({ id: 's1' })]);
    expect((await patch('s1', { partsTotal: null })).status).toBe(200);
    expect(bodyOf(calls[1])).toEqual({ updated_at: expect.any(String), slices: null });
    vi.unstubAllGlobals();
    calls = sequence([oneOff()]);
    expect((await patch('t1', { partsTotal: null })).status).toBe(200);
    expect(calls).toHaveLength(1);
  });

  it('partsTotal is a 409 on a repeating task, a task waiting on its steps and a done task', async () => {
    for (const row of [oneOff({ recurrence: { kind: 'daily' } }), oneOff({ silent_parent: true }), oneOff({ done: true })]) {
      const calls = sequence([row]);
      expect((await patch('t1', { partsTotal: 3 })).status).toBe(409);
      expect(calls).toHaveLength(1);
      vi.unstubAllGlobals();
    }
  });

  // --- done -----------------------------------------------------------------------------------

  it('done:true on a task in parts FILLS every part (Done in Focus), pinned to the stored counts', async () => {
    const calls = sequence([sliced(1, 4)], [sliced(4, 4, { done: true })]);
    expect((await patch('s1', { done: true })).status).toBe(200);
    expect(bodyOf(calls[1])).toMatchObject({ done: true, completed_at: expect.any(String), slices: { total: 4, done: 4 } });
    expect(guardOf(calls[1])).toMatchObject({ 'slices->>done': 'eq.1', 'slices->>total': 'eq.4', done: 'is.false' });
  });

  it('done:false on a task in parts is a 409, and done on a task waiting on its steps is a 409', async () => {
    let calls = sequence([sliced(4, 4, { done: true })]);
    let res = await patch('s1', { done: false });
    expect(res.status).toBe(409);
    expect(calls).toHaveLength(1);
    vi.unstubAllGlobals();
    calls = sequence([oneOff({ silent_parent: true })]);
    res = await patch('t1', { done: true });
    expect(res.status).toBe(409);
    expect(await errorOf(res)).toMatch(/tick its steps/);
    expect(calls).toHaveLength(1);
  });

  it('done:true on a task already done is a 200 with no write, so completedAt is never re-stamped', async () => {
    for (const row of [oneOff({ done: true, completed_at: 'then' }), sliced(2, 5, { done: true })]) {
      const calls = sequence([row]);
      const res = await patch(row.id, { done: true });
      expect(res.status).toBe(200);
      expect(calls).toHaveLength(1);
      vi.unstubAllGlobals();
    }
  });

  it('a one-off close is guarded by done=is.false, and a guarded write that matches nothing is a 409, not a 404', async () => {
    let calls = sequence([oneOff()], [oneOff({ done: true })]);
    expect((await patch('t1', { done: true })).status).toBe(200);
    expect(guardOf(calls[1])).toEqual({ id: 'eq.t1', deleted_at: 'is.null', done: 'is.false' });
    vi.unstubAllGlobals();
    calls = sequence([oneOff()], []);
    const res = await patch('t1', { done: true });
    expect(res.status).toBe(409);
    expect(await errorOf(res)).toMatch(/changed just now/);
  });

  it('a new repeat is a 409 on a task in parts, a task waiting on its steps and a step', async () => {
    for (const row of [sliced(3, 10), oneOff({ silent_parent: true }), oneOff({ parent_id: 'p1' })]) {
      const calls = sequence([row]);
      expect((await patch(row.id, { repeat: { kind: 'daily' } })).status).toBe(409);
      expect(calls).toHaveLength(1);
      vi.unstubAllGlobals();
    }
  });

  it('a read that comes back 401 is the 401 the contract promises', async () => {
    sequence(failWith(401));
    expect((await patch('s1', { partsDone: 2 })).status).toBe(401);
  });

  // --- the contract and the parity with MCP ---------------------------------------------------

  it('OpenAPI is 1.3.0 and documents the parts fields and the 409', async () => {
    const res = await handleApi(req('GET', '/api/v1/openapi.json'), env, trust);
    type Schema = { properties: Record<string, unknown>; required?: string[] };
    const spec = (await res.json()) as {
      info: { version: string };
      paths: Record<string, Record<string, { responses: Record<string, unknown> }>>;
      components: { schemas: Record<string, Schema>; responses: Record<string, unknown> };
    };
    expect(spec.info.version).toBe('1.3.0');
    const { Task, TaskInput, TaskPatch } = spec.components.schemas;
    expect(Task.required).toEqual(expect.arrayContaining(['partsTotal', 'partsDone']));
    expect(TaskInput.properties).toHaveProperty('partsTotal');
    expect(TaskPatch.properties).toHaveProperty('partsTotal');
    expect(TaskPatch.properties).toHaveProperty('partsDone');
    expect(spec.paths['/tasks/{id}'].patch.responses['409']).toEqual({ $ref: '#/components/responses/Conflict' });
    expect(spec.components.responses).toHaveProperty('Conflict');
  });

  /** Call one MCP tool through the real handler, on the same stubbed fetch. */
  const mcpTool = (name: string, args: object) =>
    handleMcp(
      new Request('https://doubledone-ai.example/mcp', {
        method: 'POST',
        headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
      }),
      env,
      { kind: 'header' },
      trust,
    );

  it('parity: an MCP part tick and REST partsDone write the same columns under the same guard', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-18T03:00:00.000Z'));
    const viaMcp = sequence([sliced(2, 10)], [sliced(3, 10)]);
    await mcpTool('complete_task', { id: 's1' });
    vi.unstubAllGlobals();
    const viaRest = sequence([sliced(2, 10)], [sliced(3, 10)]);
    await patch('s1', { partsDone: 3 });
    expect(bodyOf(viaRest[1])).toEqual(bodyOf(viaMcp[1]));
    expect(guardOf(viaRest[1])).toEqual(guardOf(viaMcp[1]));
  });

  it('parity: the last part writes the same finish from MCP complete_task, REST partsDone and REST done:true', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-18T03:00:00.000Z'));
    const viaMcp = sequence([sliced(9, 10)], [sliced(10, 10, { done: true })]);
    await mcpTool('complete_task', { id: 's1' });
    vi.unstubAllGlobals();
    const viaPartsDone = sequence([sliced(9, 10)], [sliced(10, 10, { done: true })]);
    await patch('s1', { partsDone: 10 });
    vi.unstubAllGlobals();
    const viaDone = sequence([sliced(9, 10)], [sliced(10, 10, { done: true })]);
    await patch('s1', { done: true });
    expect(bodyOf(viaMcp[1])).toEqual({ slices: { total: 10, done: 10 }, done: true, completed_at: '2026-10-18T03:00:00.000Z', updated_at: '2026-10-18T03:00:00.000Z' });
    expect(bodyOf(viaPartsDone[1])).toEqual(bodyOf(viaMcp[1]));
    expect(bodyOf(viaDone[1])).toEqual(bodyOf(viaMcp[1]));
    expect(guardOf(viaPartsDone[1])).toEqual(guardOf(viaMcp[1]));
    expect(guardOf(viaDone[1])).toEqual(guardOf(viaMcp[1]));
  });
});

describe('linked steps over REST: steps on create, POST /tasks/{id}/steps, and the finish walk', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
  const NOW = '2026-10-18T03:00:00.000Z';
  const freeze = () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(NOW));
  };
  const token = fakeJwt('u1');
  const at = (min: number) => new Date(Date.UTC(2026, 9, 18, 0, min)).toISOString();
  /** A row as getRequest's SELECT returns it. */
  const row = (extra: object = {}) => ({
    id: 't1',
    title: 'Clear the garage',
    done: false,
    due: null,
    recurrence: null,
    completed_dates: null,
    slices: null,
    silent_parent: null,
    parent_id: null,
    parent_title: null,
    created_at: 'c',
    completed_at: null,
    ...extra,
  });
  const step = (id: string, extra: object = {}) => row({ id, title: `${id} (5 min)`, parent_id: 'P', parent_title: 'Clear the garage', ...extra });
  const big = (extra: object = {}) => ({ ...row({ id: 'P', silent_parent: true }), open_parent: false, deleted_at: null, created_at: at(0), ...extra });
  const kid = (id: string, done: boolean, extra: object = {}) => ({ id, done, recurrence: null, parent_id: 'P', deleted_at: null, created_at: at(1), completed_at: done ? at(30) : null, ...extra });
  const twoSteps = [{ title: '• Bag up the rubbish (5 min)' }, { title: 'Take it to the tip', minutes: 30 }];
  const post = (path: string, body: unknown) => handleApi(req('POST', `/api/v1${path}`, { token, body }), env, trust);
  const patch = (id: string, body: unknown) => handleApi(req('PATCH', `/api/v1/tasks/${id}`, { token, body }), env, trust);
  const guardOf = (c: Call) => {
    const q = paramsOf(c);
    delete q.select;
    return q;
  };
  const errorOf = async (res: Response) => ((await res.json()) as { error: string }).error;

  // --- the task shape and the body checks -----------------------------------------------------------------------

  it('toApiTask exposes parentId, parentTitle and hidden', () => {
    expect(toApiTask(row({ parent_id: 'P', parent_title: 'Clear the garage' }))).toMatchObject({ parentId: 'P', parentTitle: 'Clear the garage', hidden: false });
    expect(toApiTask(row({ silent_parent: true }))).toMatchObject({ parentId: null, parentTitle: null, hidden: true });
    expect(toApiTask(row({ parent_id: '', parent_title: 7, silent_parent: 'yes' }))).toMatchObject({ parentId: null, parentTitle: null, hidden: false });
  });

  it('parseCreate takes steps (2-20), never beside due, repeat or partsTotal, and a title of at most 500', () => {
    expect(parseCreate({ title: 'Clear the garage', steps: twoSteps })).toEqual({
      body: {
        title: 'Clear the garage',
        due: null,
        repeat: null,
        steps: [
          { title: 'Bag up the rubbish', minutes: 5, due: null },
          { title: 'Take it to the tip', minutes: 30, due: null },
        ],
      },
    });
    for (const extra of [{ due: '2026-10-20' }, { repeat: { kind: 'daily' } }, { partsTotal: 3 }]) {
      expect(parseCreate({ title: 'x', steps: twoSteps, ...extra })).toEqual({ error: expect.stringMatching(/steps cannot come with due, repeat or partsTotal/) });
    }
    expect(parseCreate({ title: 'x', steps: [{ title: 'one' }] })).toEqual({ error: expect.stringMatching(/at least two steps/) });
    expect(parseCreate({ title: 'y'.repeat(501), steps: twoSteps })).toEqual({ error: 'title can be at most 500 characters' });
  });

  it('parseStepsBody takes { steps } and nothing else', () => {
    expect(parseStepsBody({ steps: twoSteps })).toMatchObject({ steps: [{ title: 'Bag up the rubbish' }, { title: 'Take it to the tip' }] });
    expect(parseStepsBody({ steps: twoSteps, title: 'x' })).toEqual({ error: expect.stringMatching(/send only steps here \(not "title"\)/) });
    expect(parseStepsBody([])).toEqual({ error: 'a JSON object with steps is required' });
    expect(parseStepsBody({})).toMatchObject({ error: expect.any(String) });
  });

  // --- POST /tasks with steps -------------------------------------------------------------------------------------

  it('POST /tasks with steps is ONE insert of the big task and its steps, and answers 201 { task, steps }', async () => {
    freeze();
    const calls = sequence([]);
    // Answer the insert with exactly what was written, in the public SELECT's shape.
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        const rows = JSON.parse(init.body as string) as Record<string, unknown>[];
        return { ok: true, status: 200, json: async () => rows.slice().reverse() } as unknown as Response;
      }),
    );
    const res = await post('/tasks', { title: 'Clear the garage', steps: twoSteps });
    expect(res.status).toBe(201);
    expect(calls).toHaveLength(1);
    expect(calls[0].init.method).toBe('POST');
    expect(paramsOf(calls[0]).select).toContain('parent_title');
    const written = JSON.parse(calls[0].init.body as string) as Record<string, unknown>[];
    expect(written).toHaveLength(3);
    expect(written[0]).toMatchObject({ user_id: 'u1', silent_parent: true, open_parent: false, complexity: 35 });
    expect(String(written[0].id)).toMatch(/^api-[a-z0-9]+-[a-z0-9]+-p$/);
    const out = (await res.json()) as { task: Record<string, unknown>; steps: Record<string, unknown>[] };
    expect(out.task).toMatchObject({ id: written[0].id, title: 'Clear the garage', hidden: true, parentId: null });
    // In the order given, whatever order the insert came back in.
    expect(out.steps.map((s) => s.title)).toEqual(['Bag up the rubbish (5 min)', 'Take it to the tip (30 min)']);
    expect(out.steps.every((s) => s.parentId === written[0].id && s.parentTitle === 'Clear the garage' && s.hidden === false)).toBe(true);
  });

  it('POST /tasks with bad steps, or steps with a due, is a 400 before Supabase is asked', async () => {
    const calls = sequence([]);
    expect((await post('/tasks', { title: 'x', steps: [{ title: 'one' }] })).status).toBe(400);
    expect((await post('/tasks', { title: 'x', steps: twoSteps, due: '2026-10-20' })).status).toBe(400);
    expect((await post('/tasks', { title: 'x', steps: [{ title: 'a' }, { title: 'b', minutes: 481 }] })).status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  // --- POST /tasks/{id}/steps -------------------------------------------------------------------------------------

  it('reads, inserts the steps, then hides the task pinned as read, and answers 201 with both', async () => {
    freeze();
    const calls = sequence([row()], [step('x-0'), step('x-1')], [row({ silent_parent: true })]);
    const res = await post('/tasks/t1/steps', { steps: [{ title: 'Bag up the rubbish' }, { title: 'Sweep' }] });
    expect(res.status).toBe(201);
    expect(calls.map((c) => c.init.method)).toEqual(['GET', 'POST', 'PATCH']);
    const inserted = JSON.parse(calls[1].init.body as string) as Record<string, unknown>[];
    expect(inserted.every((s) => s.parent_id === 't1' && s.parent_title === 'Clear the garage')).toBe(true);
    expect(guardOf(calls[2])).toEqual({ id: 'eq.t1', deleted_at: 'is.null', done: 'is.false', silent_parent: 'not.is.true', recurrence: 'is.null', slices: 'is.null' });
    expect(bodyOf(calls[2])).toEqual({ silent_parent: true, open_parent: false, updated_at: NOW });
    const out = (await res.json()) as { task: Record<string, unknown>; steps: unknown[] };
    expect(out.task).toMatchObject({ id: 't1', hidden: true });
  });

  it('a 404 for a missing task, and a 409 for a done, repeating, in-parts or already hidden one, each after one read', async () => {
    let calls = sequence([]);
    expect((await post('/tasks/nope/steps', { steps: twoSteps })).status).toBe(404);
    expect(calls).toHaveLength(1);
    vi.unstubAllGlobals();
    const conflicts: [object, RegExp][] = [
      [row({ done: true }), /already done/],
      [row({ recurrence: { kind: 'daily' } }), /repeating task cannot be broken into steps/],
      [row({ slices: { total: 3, done: 1 } }), /tracked in parts: send partsTotal: null first/],
      [row({ silent_parent: true }), /already waiting on its steps/],
    ];
    for (const [r, msg] of conflicts) {
      calls = sequence([r]);
      const res = await post('/tasks/t1/steps', { steps: twoSteps });
      expect(res.status).toBe(409);
      expect(await errorOf(res)).toMatch(msg);
      expect(calls).toHaveLength(1);
      vi.unstubAllGlobals();
    }
  });

  it('a hide that matches nothing tombstones exactly the inserted steps and is a 409, with nothing added', async () => {
    freeze();
    const calls = sequence([row()], [step('x-0'), step('x-1')], [], [{ id: 'x' }]);
    const res = await post('/tasks/t1/steps', { steps: twoSteps });
    expect(res.status).toBe(409);
    expect(await errorOf(res)).toBe('the task changed just now, so nothing was added: read it again and retry');
    const ids = (JSON.parse(calls[1].init.body as string) as { id: string }[]).map((s) => s.id);
    expect(paramsOf(calls[3])).toEqual({ id: `in.(${ids.join(',')})` });
    expect(bodyOf(calls[3])).toEqual({ deleted_at: NOW, updated_at: NOW });
  });

  it('if even the tombstone fails, a 502 that says some steps may have landed', async () => {
    sequence([row()], [step('x-0'), step('x-1')], [], failWith(500));
    const res = await post('/tasks/t1/steps', { steps: twoSteps });
    expect(res.status).toBe(502);
    expect(await errorOf(res)).toMatch(/some of its steps may have landed/);
  });

  it('a hide the token is refused for is the 401, with no undo, and says the steps went in', async () => {
    for (const status of [401, 403]) {
      const calls = sequence([row()], [step('x-0'), step('x-1')], failWith(status), [{ id: 'x' }]);
      const res = await post('/tasks/t1/steps', { steps: twoSteps });
      expect(res.status).toBe(401);
      expect(await errorOf(res)).toMatch(/^unauthorized: token expired or invalid\..*Its steps were added, but the task is not hidden behind them yet/);
      expect(calls.map((c) => c.init.method)).toEqual(['GET', 'POST', 'PATCH']);
      vi.unstubAllGlobals();
    }
  });

  it('a hide that answers a 503 but landed is read again, and is the 201 from that read, with no undo', async () => {
    const calls = sequence([row()], [step('x-0'), step('x-1')], failWith(503), [row({ silent_parent: true })]);
    const res = await post('/tasks/t1/steps', { steps: twoSteps });
    expect(res.status).toBe(201);
    expect(calls.map((c) => c.init.method)).toEqual(['GET', 'POST', 'PATCH', 'GET']);
    expect(paramsOf(calls[3])).toMatchObject({ id: 'eq.t1', deleted_at: 'is.null' });
    expect(((await res.json()) as { task: Record<string, unknown> }).task).toMatchObject({ id: 't1', hidden: true });
  });

  it('a hide that throws, or answers what does not parse, is read again, and a task still on the list is undone', async () => {
    freeze();
    for (const answer of [REJECTS, GARBLED, failWith(500)]) {
      const calls = sequence([row()], [step('x-0'), step('x-1')], answer, [row()], [{ id: 'x' }]);
      const res = await post('/tasks/t1/steps', { steps: twoSteps });
      expect(res.status).toBe(502);
      expect(await errorOf(res)).toBe('upstream error');
      expect(calls.map((c) => c.init.method)).toEqual(['GET', 'POST', 'PATCH', 'GET', 'PATCH']);
      const ids = (JSON.parse(calls[1].init.body as string) as { id: string }[]).map((s) => s.id);
      expect(paramsOf(calls[4])).toEqual({ id: `in.(${ids.join(',')})` });
      vi.unstubAllGlobals();
    }
  });

  it('a hide AND the read after it that both come to nothing undo nothing: the 502 that says some steps may have landed', async () => {
    const calls = sequence([row()], [step('x-0'), step('x-1')], REJECTS, failWith(500));
    const res = await post('/tasks/t1/steps', { steps: twoSteps });
    expect(res.status).toBe(502);
    expect(await errorOf(res)).toMatch(/could not be confirmed, and some of its steps may have landed/);
    expect(calls.map((c) => c.init.method)).toEqual(['GET', 'POST', 'PATCH', 'GET']);
  });

  it('a bad body or id is a 400, another method a 405, and nothing reaches Supabase', async () => {
    const calls = sequence([]);
    expect((await post('/tasks/t1/steps', { steps: [{ title: 'one' }] })).status).toBe(400);
    expect((await post('/tasks/t1/steps', { steps: twoSteps, due: '2026-10-20' })).status).toBe(400);
    expect((await post('/tasks/%E0/steps', { steps: twoSteps })).status).toBe(400);
    expect((await handleApi(req('GET', '/api/v1/tasks/t1/steps', { token }), env, trust)).status).toBe(405);
    expect(calls).toHaveLength(0);
  });

  // --- PATCH: the finish walk -------------------------------------------------------------------------------------

  it('done:true on the LAST step closes it, finishes the big task, and lists it in finished', async () => {
    freeze();
    const calls = sequence(
      [step('s2')],
      [step('s2', { done: true, completed_at: NOW })],
      [big()],
      [kid('s1', true), kid('s2', true)],
      [big({ done: true, silent_parent: false, completed_at: NOW })],
    );
    const res = await patch('s2', { done: true });
    expect(res.status).toBe(200);
    const out = (await res.json()) as { task: Record<string, unknown>; finished?: Record<string, unknown>[] };
    expect(out.task).toMatchObject({ id: 's2', done: true, parentId: 'P' });
    expect(out.finished).toEqual([expect.objectContaining({ id: 'P', done: true, hidden: false })]);
    expect(guardOf(calls[4])).toEqual({ id: 'eq.P', deleted_at: 'is.null', done: 'is.false', silent_parent: 'is.true', open_parent: 'not.is.true' });
    expect(bodyOf(calls[4])).toEqual({ done: true, completed_at: NOW, silent_parent: false, updated_at: NOW });
  });

  it('a step that is not the last, or a case left to the app, answers without finished', async () => {
    for (const children of [[kid('s1', false), kid('s2', true)], [kid('s2', true)]]) {
      const calls = sequence([step('s2')], [step('s2', { done: true })], [big()], children);
      const out = (await (await patch('s2', { done: true })).json()) as Record<string, unknown>;
      expect(out).not.toHaveProperty('finished');
      expect(calls).toHaveLength(4);
      vi.unstubAllGlobals();
    }
  });

  it('partsDone that finishes a step walks too, and done:false on a step reopens it alone', async () => {
    let calls = sequence([step('s2', { slices: { total: 2, done: 1 } })], [step('s2', { done: true })], [big()], [kid('s1', true), kid('s2', true)], [big({ done: true })]);
    const out = (await (await patch('s2', { partsDone: 2 })).json()) as { finished?: unknown[] };
    expect(out.finished).toHaveLength(1);
    expect(calls).toHaveLength(5);
    vi.unstubAllGlobals();
    calls = sequence([step('s2', { done: true })], [step('s2')]);
    expect((await patch('s2', { done: false })).status).toBe(200);
    expect(calls).toHaveLength(2);
  });

  // --- DELETE -------------------------------------------------------------------------------------------------------

  const del = (id: string) => handleApi(req('DELETE', `/api/v1/tasks/${id}`, { token }), env, trust);

  it('DELETE of a task waiting on its steps is a 409 after one read, with no write', async () => {
    const calls = sequence([row({ silent_parent: true })]);
    const res = await del('t1');
    expect(res.status).toBe(409);
    expect(await errorOf(res)).toBe('that task is waiting on its steps: delete its steps first, and the app brings it back on its next open');
    expect(calls).toHaveLength(1);
  });

  it('DELETE of any other task reads, then tombstones it pinned to a live task not waiting on its steps', async () => {
    freeze();
    const calls = sequence([row()], [{ id: 't1' }]);
    expect((await del('t1')).status).toBe(204);
    expect(calls.map((c) => c.init.method)).toEqual(['GET', 'PATCH']);
    expect(paramsOf(calls[1])).toEqual({ id: 'eq.t1', deleted_at: 'is.null', silent_parent: 'not.is.true' });
    expect(bodyOf(calls[1])).toEqual({ deleted_at: NOW, updated_at: NOW });
  });

  it('DELETE of a step deletes that step alone (no walk), and a write that misses after the read is a 409', async () => {
    let calls = sequence([step('s2')], [{ id: 's2' }]);
    expect((await del('s2')).status).toBe(204);
    expect(calls).toHaveLength(2);
    vi.unstubAllGlobals();
    calls = sequence([row()], []);
    const res = await del('t1');
    expect(res.status).toBe(409);
    expect(await errorOf(res)).toBe('the task changed just now: read it again and retry');
    vi.unstubAllGlobals();
    sequence(failWith(401));
    expect((await del('t1')).status).toBe(401);
  });

  // --- the contract -----------------------------------------------------------------------------------------------

  it('OpenAPI 1.3.0 documents the steps route, StepInput, StepsCreated and the new read fields', async () => {
    const res = await handleApi(req('GET', '/api/v1/openapi.json'), env, trust);
    type Schema = { properties: Record<string, unknown>; required?: string[] };
    const spec = (await res.json()) as {
      info: { version: string };
      paths: Record<string, Record<string, { responses: Record<string, unknown> }>>;
      components: { schemas: Record<string, Schema> };
    };
    expect(spec.info.version).toBe('1.3.0');
    expect(spec.paths['/tasks/{id}/steps'].post.responses).toMatchObject({
      '201': { content: { 'application/json': { schema: { $ref: '#/components/schemas/StepsCreated' } } } },
      '409': { $ref: '#/components/responses/Conflict' },
    });
    const { Task, TaskInput, StepInput, StepsCreated } = spec.components.schemas;
    expect(Task.required).toEqual(expect.arrayContaining(['parentId', 'parentTitle', 'hidden']));
    expect(spec.paths['/tasks/{id}'].delete.responses['409']).toEqual({ $ref: '#/components/responses/Conflict' });
    expect(TaskInput.properties).toHaveProperty('steps');
    expect(StepInput.required).toEqual(['title']);
    expect(Object.keys(StepInput.properties)).toEqual(['title', 'minutes', 'due']);
    expect(StepsCreated.required).toEqual(['task', 'steps']);
  });

  // --- parity with MCP --------------------------------------------------------------------------------------------

  /** Call one MCP tool through the real handler, on the same stubbed fetch. */
  const mcpTool = (name: string, args: object) =>
    handleMcp(
      new Request('https://doubledone-ai.example/mcp', {
        method: 'POST',
        headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
      }),
      env,
      { kind: 'header' },
      trust,
    );

  it('parity: the last step and its big task are written the same from MCP complete_task and REST done:true', async () => {
    freeze();
    const answers = (): unknown[] => [
      [step('s2')],
      [step('s2', { done: true })],
      [big()],
      [kid('s1', true), kid('s2', true)],
      [big({ done: true, silent_parent: false })],
    ];
    const viaMcp = sequence(...answers());
    await mcpTool('complete_task', { id: 's2' });
    vi.unstubAllGlobals();
    const viaRest = sequence(...answers());
    await patch('s2', { done: true });
    expect(viaRest.map((c) => c.init.method)).toEqual(viaMcp.map((c) => c.init.method));
    for (const i of [1, 4]) {
      expect(bodyOf(viaRest[i])).toEqual(bodyOf(viaMcp[i]));
      expect(guardOf(viaRest[i])).toEqual(guardOf(viaMcp[i]));
    }
    expect(bodyOf(viaMcp[4])).toEqual({ done: true, completed_at: NOW, silent_parent: false, updated_at: NOW });
    // The walk's reads ask the same rows of the same columns.
    for (const i of [2, 3]) expect(paramsOf(viaRest[i])).toEqual(paramsOf(viaMcp[i]));
  });

  it('parity: a breakdown writes the same rows and the same hide from MCP add_steps and REST, ids aside', async () => {
    freeze();
    const answers = (): unknown[] => [[row()], [step('x-0'), step('x-1')], [row({ silent_parent: true })]];
    const viaMcp = sequence(...answers());
    await mcpTool('add_steps', { task_id: 't1', steps: twoSteps });
    vi.unstubAllGlobals();
    const viaRest = sequence(...answers());
    await post('/tasks/t1/steps', { steps: twoSteps });
    const withoutIds = (c: Call) => (JSON.parse(c.init.body as string) as Record<string, unknown>[]).map(({ id: _id, ...rest }) => rest);
    expect(withoutIds(viaRest[1])).toEqual(withoutIds(viaMcp[1]));
    expect(bodyOf(viaRest[2])).toEqual(bodyOf(viaMcp[2]));
    expect(guardOf(viaRest[2])).toEqual(guardOf(viaMcp[2]));
  });
});

describe('the OpenAPI spec and the error messages say what the routes do (the drift fixes)', () => {
  afterEach(() => vi.unstubAllGlobals());
  const token = fakeJwt('u1');
  type Op = { description?: string; responses: Record<string, unknown> };
  const spec = async () =>
    (await (await handleApi(req('GET', '/api/v1/openapi.json'), env, trust)).json()) as {
      paths: Record<string, Record<string, Op>>;
      components: { schemas: Record<string, { properties: Record<string, { description?: string }> }> };
    };

  it('the plain list is every task not deleted, finished and hidden ones included, never "open and dated"', async () => {
    const list = (await spec()).paths['/tasks'].get.description ?? '';
    expect(list).not.toMatch(/open and dated/);
    expect(list).toMatch(/every task you have that is not deleted/);
    expect(list).toMatch(/hidden: true/);
  });

  it('DELETE documents its 204 for nothing to delete, and no 404, which it never returns', async () => {
    const del = (await spec()).paths['/tasks/{id}'].delete;
    expect(Object.keys(del.responses)).not.toContain('404');
    expect(del.description).toMatch(/204 even when no task matches/);
    // The route agrees: a delete that matches nothing is a 204.
    sequence([]);
    expect((await handleApi(req('DELETE', '/api/v1/tasks/nope', { token }), env, trust)).status).toBe(204);
  });

  it('a due day is not promised to be in the future, because only its shape is checked', async () => {
    const s = await spec();
    expect(s.components.schemas.TaskInput.properties.due.description).not.toMatch(/future/i);
    expect(s.paths['/tasks'].post.description).not.toMatch(/future `due`/);
    expect(parseCreate({ title: 'Ring the bank', due: '2020-01-01' })).toEqual({ body: { title: 'Ring the bank', due: '2020-01-01', repeat: null } });
  });

  it('every repeat error names monthly, which the API takes', async () => {
    expect(parseCreate({ title: 'x', repeat: 'daily' })).toEqual({ error: 'repeat must be an object (kind: daily | weekly | every_n_days | monthly)' });
    expect(parseUpdate({ repeat: 5 })).toEqual({ error: 'repeat must be an object (kind: daily | weekly | every_n_days | monthly) or null' });
    const errorOf = async (res: Response) => ((await res.json()) as { error: string }).error;
    const create = await handleApi(req('POST', '/api/v1/tasks', { token, body: { title: 'x', repeat: { kind: 'weekly' } } }), env, trust);
    expect(create.status).toBe(400);
    expect(await errorOf(create)).toBe("couldn't read that repeat: use daily, weekly (with weekdays 0-6), every_n_days (with days), or monthly (with an optional day 1-31)");
    const update = await handleApi(req('PATCH', '/api/v1/tasks/t1', { token, body: { repeat: { kind: 'weekly' } } }), env, trust);
    expect(update.status).toBe(400);
    expect(await errorOf(update)).toBe("couldn't read that repeat: use daily, weekly (with weekdays 0-6), every_n_days (with days), or monthly (with an optional day 1-31), or null to stop it");
  });
});
