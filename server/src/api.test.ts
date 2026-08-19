import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createRequest,
  deleteRequest,
  describeRecurrence,
  handleApi,
  listRequest,
  newTaskId,
  parseCreate,
  parseUpdate,
  searchTasks,
  toApiTask,
  updateRequest,
  upcomingTasks,
  upcomingWindow,
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
    ).toEqual({ id: 't1', title: 'A', done: true, due: '2026-06-21', recurrence: null, repeats: null, createdAt: 'c', completedAt: 'd' });
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
    expect(listRequest(env, 'tok').url).not.toContain('silent_parent');
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

  it('deleteRequest soft-deletes via a PATCH on deleted_at', () => {
    const { init } = deleteRequest(env, 'tok', 't1', 'NOW');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body as string).deleted_at).toBe('NOW');
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
    const res = await handleApi(req('POST', '/api/v1/tasks', { token: fakeJwt('u1'), body: { title: 'Stretch', repeat: { kind: 'weekly', weekdays: [1, 3, 5] } } }), env);
    expect(res.status).toBe(201);
    const { task } = (await res.json()) as { task: { recurrence: unknown; repeats: string } };
    expect(task.recurrence).toMatchObject({ kind: 'weekly', weekdays: [1, 3, 5] });
    expect(task.repeats).toBe('Mon, Wed, Fri');
    // The row written to Supabase carried the translated recurrence, no due.
    expect(sentBody.recurrence).toMatchObject({ kind: 'weekly', weekdays: [1, 3, 5] });
    expect(sentBody).not.toHaveProperty('due');
  });

  it('400s a create with both due and repeat', async () => {
    const res = await handleApi(req('POST', '/api/v1/tasks', { token: fakeJwt('u1'), body: { title: 'x', due: '2026-07-10', repeat: { kind: 'daily' } } }), env);
    expect(res.status).toBe(400);
  });

  it('400s a create with a malformed repeat (never a 500)', async () => {
    // weekly with no weekdays: buildRecurrence returns null -> calm 400.
    const res = await handleApi(req('POST', '/api/v1/tasks', { token: fakeJwt('u1'), body: { title: 'x', repeat: { kind: 'weekly' } } }), env);
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
    const res = await handleApi(req('GET', '/api/v1/tasks?q=dentist', { token: fakeJwt('u1') }), env);
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
    const res = await handleApi(req('GET', '/api/v1/tasks?upcoming=5', { token: fakeJwt('u1') }), env);
    expect(res.status).toBe(200);
    const { tasks } = (await res.json()) as { tasks: { id: string; due: string; repeats: string }[] };
    expect(tasks[0].id).toBe('d');
    expect(tasks[0].repeats).toBe('every day');
    // A concrete future day, not null (the repeat's next landing).
    expect(tasks[0].due).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('patches a task to repeat and returns the recurrence', async () => {
    let sentBody: Record<string, unknown> = {};
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        sentBody = JSON.parse(init.body as string);
        return {
          ok: true,
          json: async () => [{ id: 't1', title: 'A', done: false, due: null, recurrence: sentBody.recurrence, created_at: 'c', completed_at: null }],
        } as unknown as Response;
      }),
    );
    const res = await handleApi(req('PATCH', '/api/v1/tasks/t1', { token: fakeJwt('u1'), body: { repeat: { kind: 'daily' } } }), env);
    expect(res.status).toBe(200);
    const { task } = (await res.json()) as { task: { repeats: string } };
    expect(task.repeats).toBe('every day');
    expect(sentBody.due).toBeNull(); // setting a repeat clears the due day
  });

  it('400s a patch with both due and repeat', async () => {
    const res = await handleApi(req('PATCH', '/api/v1/tasks/t1', { token: fakeJwt('u1'), body: { due: '2026-07-10', repeat: { kind: 'daily' } } }), env);
    expect(res.status).toBe(400);
  });

  it('204s a delete', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => [{}] }) as unknown as Response));
    expect((await handleApi(req('DELETE', '/api/v1/tasks/t1', { token: fakeJwt('u1') }), env)).status).toBe(204);
  });

  it('404s an unknown path under /api/v1', async () => {
    expect((await handleApi(req('GET', '/api/v1/nope', { token: fakeJwt('u1') }), env)).status).toBe(404);
  });
});
