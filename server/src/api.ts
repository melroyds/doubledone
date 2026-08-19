// Public REST API for DoubleDone tasks: a clean, OpenAPI-described CRUD surface over
// the user's own tasks, on the same Cloudflare Worker as the AI backend and the MCP
// server. Auth is the user's own Supabase access token (the same "Copy my token" the
// MCP uses): each call proxies to Supabase REST WITH that token, so row-level
// security scopes it to their rows and the Worker holds NO elevated key (privacy by
// architecture, preserved). Pure request/response builders + body parsers are
// exported and unit-tested; handleApi does the I/O.
//
// Recurrence, and the read-parity query params (?q, ?upcoming), are kept in lockstep
// with the MCP server (mcp.ts): the SAME `repeat` vocabulary, translated by the ONE
// cadence.buildRecurrence, and the SAME UTC-calendar-day basis. So a repeating task an
// agent makes and one the app or this API makes are indistinguishable, and `?q` /
// `?upcoming` return what MCP's search / list_upcoming would.

import {
  asRecurrence,
  buildRecurrence,
  isDueOn,
  type Recurrence,
  type RepeatSpec,
} from './cadence';
import { decodeJwtSub } from './mcp';
import { OPENAPI_SPEC, SWAGGER_HTML } from './openapi';

export type ApiEnv = { SUPABASE_URL?: string; SUPABASE_ANON_KEY?: string };

// The public JSON shape of a task (camelCase; internal columns like user_id, deleted_at,
// and the completed_dates / skipped_dates bookkeeping are never exposed).
export type ApiTask = {
  id: string;
  title: string;
  done: boolean;
  due: string | null;
  recurrence: Recurrence | null;
  repeats: string | null; // a short human summary of the recurrence, or null for a one-off
  createdAt: string;
  completedAt: string | null;
};

type Row = Record<string, unknown>;

// The Supabase columns the API selects (snake_case, from PostgREST). recurrence feeds the
// output shape; completed_dates / skipped_dates are read only to compute ?upcoming (a repeat
// already done/skipped for a day shows the next one), never surfaced.
const SELECT = 'id,title,done,due,created_at,completed_at,recurrence,completed_dates,skipped_dates';
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Today as an ISO 'YYYY-MM-DD' UTC calendar day. The same basis MCP and cadence.ts use, so
 *  a repeat's "next occurrence" is computed identically across the REST API and the agent. */
function todayIsoUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "1st", "2nd", "11th", "21st". English only, matching the rest of this summary. */
function ordinalEn(n: number): string {
  const teens = n % 100;
  if (teens >= 11 && teens <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}

/** A short, calm, English human summary of a recurrence ("every day", "Mon, Wed, Fri",
 *  "every 3 days"), mirroring the client's describeRecurrence semantics without its i18n
 *  dependency (the server must not import the client). null for a one-off / no recurrence. */
export function describeRecurrence(r: Recurrence | null): string | null {
  if (!r) return null;
  switch (r.kind) {
    case 'daily':
      return 'every day';
    case 'weekly': {
      if (r.weekdays.length === 7) return 'every day';
      if (r.weekdays.length === 0) return 'weekly';
      return r.weekdays
        .slice()
        .sort((a, b) => a - b)
        .map((d) => WEEKDAY_NAMES[d] ?? String(d))
        .join(', ');
    }
    case 'interval':
      return r.days === 1 ? 'every day' : `every ${r.days} days`;
    case 'monthly':
      // English-only here on purpose, like its siblings: this is the API's `repeats` summary, not
      // app copy, and the server deliberately does not import the client's i18n.
      return `every month on the ${ordinalEn(r.day)}`;
    case 'none':
      return null;
  }
}

/** Map a Supabase task row to the public API shape, defensively. recurrence is normalised
 *  through the shared asRecurrence (a malformed column becomes null, never throws), and
 *  `repeats` is its human summary. */
export function toApiTask(row: Row): ApiTask {
  const recurrence = asRecurrence(row.recurrence);
  return {
    id: typeof row.id === 'string' ? row.id : String(row.id ?? ''),
    title: typeof row.title === 'string' ? row.title : '',
    done: row.done === true,
    due: typeof row.due === 'string' ? row.due : null,
    recurrence,
    repeats: describeRecurrence(recurrence),
    createdAt: typeof row.created_at === 'string' ? row.created_at : '',
    completedAt: typeof row.completed_at === 'string' ? row.completed_at : null,
  };
}

function headers(env: ApiEnv, token: string, write: boolean): Record<string, string> {
  const h: Record<string, string> = { apikey: env.SUPABASE_ANON_KEY ?? '', authorization: `Bearer ${token}` };
  if (write) {
    h['content-type'] = 'application/json';
    h.prefer = 'return=representation';
  }
  return h;
}

const tasksUrl = (env: ApiEnv) => `${env.SUPABASE_URL}/rest/v1/tasks`;

// --- Supabase REST request builders (pure, unit-tested) --------------------

/** List the user's tasks. `today` narrows to open, non-recurring, due-today-or-undated. */
export function listRequest(
  env: ApiEnv,
  token: string,
  opts: { today?: boolean; todayIso?: string } = {},
): { url: string; init: RequestInit } {
  const q = new URLSearchParams({ select: SELECT, deleted_at: 'is.null', order: 'created_at.asc' });
  if (opts.today && opts.todayIso) {
    q.set('done', 'is.false');
    q.set('recurrence', 'is.null');
    q.set('silent_parent', 'not.is.true'); // exclude a decompose umbrella the app hides from Today
    q.set('or', `(due.is.null,due.lte.${opts.todayIso})`);
  }
  return { url: `${tasksUrl(env)}?${q.toString()}`, init: { method: 'GET', headers: headers(env, token, false) } };
}

/** The candidate set for ?q substring search: open, non-deleted, non-silent-parent tasks. We
 *  match in the Worker (case-insensitive, over title), which is injection-safe and mirrors the
 *  MCP `search` tool exactly (searchTasksRequest in mcp.ts), rather than escaping user text into
 *  a PostgREST ilike. Order stable by created_at. */
export function searchRequest(env: ApiEnv, token: string): { url: string; init: RequestInit } {
  const q = new URLSearchParams({
    select: SELECT,
    deleted_at: 'is.null',
    silent_parent: 'not.is.true',
    done: 'is.false',
    order: 'created_at.asc',
  });
  return { url: `${tasksUrl(env)}?${q.toString()}`, init: { method: 'GET', headers: headers(env, token, false) } };
}

/** The rows ?upcoming reasons over: open, non-deleted, non-silent-parent, and either a future
 *  one-off due within the window (today, endIso] OR any open recurring task (its next occurrence
 *  is computed in the Worker). Same window shape and guards as the MCP list_upcoming tool
 *  (listUpcomingRequest in mcp.ts). */
export function upcomingRequest(env: ApiEnv, token: string, todayIso: string, endIso: string): { url: string; init: RequestInit } {
  const q = new URLSearchParams({
    select: SELECT,
    deleted_at: 'is.null',
    silent_parent: 'not.is.true',
    or: `(and(recurrence.is.null,done.is.false,due.gt.${todayIso},due.lte.${endIso}),and(recurrence.not.is.null,done.is.false))`,
    order: 'due.asc',
  });
  return { url: `${tasksUrl(env)}?${q.toString()}`, init: { method: 'GET', headers: headers(env, token, false) } };
}

export function getRequest(env: ApiEnv, token: string, id: string): { url: string; init: RequestInit } {
  const q = new URLSearchParams({ select: SELECT, id: `eq.${id}`, deleted_at: 'is.null' });
  return { url: `${tasksUrl(env)}?${q.toString()}`, init: { method: 'GET', headers: headers(env, token, false) } };
}

export function createRequest(
  env: ApiEnv,
  token: string,
  t: { id: string; userId: string; title: string; due: string | null; recurrence?: Recurrence | null; now: string },
): { url: string; init: RequestInit } {
  // due and recurrence are OPTIONAL and additive: a create with neither is byte-for-byte the
  // original row. When present they write the same columns the app / sync / MCP use, so an
  // API-made dated or repeating task is indistinguishable from an app- or agent-made one.
  const body: Row = { id: t.id, user_id: t.userId, title: t.title, done: false, created_at: t.now, updated_at: t.now };
  if (t.due) body.due = t.due;
  if (t.recurrence != null) body.recurrence = t.recurrence;
  return {
    url: `${tasksUrl(env)}?${new URLSearchParams({ select: SELECT }).toString()}`,
    init: { method: 'POST', headers: headers(env, token, true), body: JSON.stringify(body) },
  };
}

export function updateRequest(
  env: ApiEnv,
  token: string,
  id: string,
  patch: { title?: string; done?: boolean; due?: string | null; recurrence?: Recurrence | null },
  now: string,
): { url: string; init: RequestInit } {
  const q = new URLSearchParams({ id: `eq.${id}`, deleted_at: 'is.null', select: SELECT });
  const body: Row = { updated_at: now };
  if (typeof patch.title === 'string') body.title = patch.title;
  if (typeof patch.done === 'boolean') {
    body.done = patch.done;
    body.completed_at = patch.done ? now : null;
  }
  // due <-> recurrence are mutually exclusive, made explicit (mirrors mcp.ts updateTaskRequest):
  // setting a due day clears any repeat, and setting a repeat clears the due day, so a task is
  // never both. Only keys present in `patch` are sent, so an unspecified field is untouched.
  if (typeof patch.due !== 'undefined') {
    body.due = patch.due; // a string schedules it, null clears it
    if (patch.due != null) body.recurrence = null; // scheduling a one-off day stops any repeat
  }
  if (typeof patch.recurrence !== 'undefined') {
    body.recurrence = patch.recurrence; // an object makes it repeat, null stops it
    if (patch.recurrence != null) body.due = null; // a repeat has no single due day
  }
  return { url: `${tasksUrl(env)}?${q.toString()}`, init: { method: 'PATCH', headers: headers(env, token, true), body: JSON.stringify(body) } };
}

/** Soft delete: a tombstone via deleted_at + updated_at, matching the app's sync model. */
export function deleteRequest(env: ApiEnv, token: string, id: string, now: string): { url: string; init: RequestInit } {
  const q = new URLSearchParams({ id: `eq.${id}` });
  return {
    url: `${tasksUrl(env)}?${q.toString()}`,
    init: { method: 'PATCH', headers: headers(env, token, true), body: JSON.stringify({ deleted_at: now, updated_at: now }) },
  };
}

// --- Read-parity helpers: ?q search + ?upcoming windowing (pure) -----------
// These mirror the MCP read tools (mcp.ts) so an agent and this API answer the same question
// the same way. The cadence math is REUSED from cadence.ts, never reimplemented.

/** Case-insensitive substring match over task titles, returned as the public task shape. Capped
 *  so a huge list can't blow the response. Mirrors MCP searchResultsFrom (same match + cap), but
 *  returns full ApiTask objects, not the deep-research {id,title,url} shape. An empty query
 *  returns everything up to the cap. Pure + unit-tested. */
export function searchTasks(rows: unknown, query: string, cap = 50): ApiTask[] {
  if (!Array.isArray(rows)) return [];
  const needle = query.trim().toLowerCase();
  const out: ApiTask[] = [];
  for (const r of rows) {
    if (out.length >= cap) break;
    if (r == null || typeof r !== 'object') continue;
    const row = r as Row;
    const title = typeof row.title === 'string' ? row.title : '';
    if (needle === '' || title.toLowerCase().includes(needle)) out.push(toApiTask(row));
  }
  return out;
}

/** The window bounds for ?upcoming: strictly AFTER today, up to and including today+days. Clamps
 *  `days` to 1..30 (default 7) so a bad or huge arg can't fan out unbounded. Mirrors MCP
 *  upcomingWindow exactly. `days` is the already-parsed query value (a string or null). */
export function upcomingWindow(days: unknown, todayIso: string): { count: number; endIso: string } {
  const parsed = typeof days === 'string' ? Number(days) : typeof days === 'number' ? days : NaN;
  const n = Number.isFinite(parsed) ? Math.floor(parsed) : 7;
  const count = Math.max(1, Math.min(30, n));
  return { count, endIso: addDaysIso(todayIso, count) };
}

/** Map the upcoming rows to dated tasks, in date order. A one-off contributes its `due` day
 *  (already window-scoped by the SQL). A recurring task contributes its NEXT due day within the
 *  window (the first day in (today, today+count] it is due AND not already completed/skipped),
 *  and that day is surfaced as the task's `due` so an agent/app sees when it next lands. A repeat
 *  with no hit in the window is dropped. Reuses cadence.isDueOn + asRecurrence. Pure + unit-tested. */
export function upcomingTasks(rows: unknown, todayIso: string, count: number): ApiTask[] {
  if (!Array.isArray(rows)) return [];
  const out: { task: ApiTask; when: string }[] = [];
  for (const r of rows) {
    if (r == null || typeof r !== 'object') continue;
    const row = r as Row;
    if (typeof row.id !== 'string' || typeof row.title !== 'string') continue;
    if (row.recurrence == null) {
      if (typeof row.due === 'string') out.push({ task: toApiTask(row), when: row.due });
    } else {
      const next = nextOccurrence(row.recurrence, row.completed_dates, row.skipped_dates, todayIso, count);
      if (next) out.push({ task: { ...toApiTask(row), due: next }, when: next });
    }
  }
  // Stable date order (the SQL sorts the one-offs, but the computed recurring days must interleave).
  out.sort((a, b) => (a.when < b.when ? -1 : a.when > b.when ? 1 : 0));
  return out.map((o) => o.task);
}

/** The first day in (today, today+count] a recurrence is due and not already done/skipped, or
 *  null if it doesn't recur inside the window. Reuses cadence.isDueOn + asRecurrence (no date-math
 *  or JSONB-narrowing reimpl), matching MCP nextOccurrence. */
function nextOccurrence(recurrence: unknown, completed: unknown, skipped: unknown, todayIso: string, count: number): string | null {
  const r = asRecurrence(recurrence);
  if (!r) return null;
  const done = Array.isArray(completed) ? completed : [];
  const skip = Array.isArray(skipped) ? skipped : [];
  for (let i = 1; i <= count; i++) {
    const day = addDaysIso(todayIso, i);
    if (isDueOn(r, day) && !done.includes(day) && !skip.includes(day)) return day;
  }
  return null;
}

/** ISO 'YYYY-MM-DD' `days` after `iso` (UTC calendar math, matching cadence.ts / mcp.ts). */
function addDaysIso(iso: string, days: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) + days * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

// --- Body parsing / validation (pure) --------------------------------------

export type CreateBody = { title: string; due: string | null; repeat: RepeatSpec | null };
export type UpdateBody = { title?: string; done?: boolean; due?: string | null; repeat?: RepeatSpec | null };

/** Validate a POST body. Returns the clean body, or an { error } message. A `repeat` object and a
 *  `due` are mutually exclusive (a task repeats or has one due day, never both, exactly as the app
 *  and MCP add_task enforce). The repeat's INTERNAL correctness is validated at translation time
 *  by cadence.buildRecurrence (which needs today); here we only shape-check and reject due+repeat. */
export function parseCreate(raw: unknown): { body: CreateBody } | { error: string } {
  if (typeof raw !== 'object' || raw === null) return { error: 'a JSON object with a title is required' };
  const o = raw as Row;
  const title = typeof o.title === 'string' ? o.title.trim() : '';
  if (!title) return { error: 'title is required' };
  let due: string | null = null;
  if (typeof o.due === 'string') {
    if (!ISO_DATE.test(o.due)) return { error: 'due must be an ISO date (YYYY-MM-DD)' };
    due = o.due;
  }
  let repeat: RepeatSpec | null = null;
  if (typeof o.repeat !== 'undefined' && o.repeat !== null) {
    if (typeof o.repeat !== 'object') return { error: 'repeat must be an object (kind: daily | weekly | every_n_days)' };
    repeat = o.repeat as RepeatSpec;
  }
  if (due && repeat) return { error: 'a task can have a due date or a repeat, not both' };
  return { body: { title, due, repeat } };
}

/** Validate a PATCH body (any of title / done / due / repeat). Returns the clean patch, or an
 *  { error }. due and repeat are mutually exclusive when both are non-null. Pass due:null to clear
 *  a date, repeat:null to stop repeating. The repeat's internal correctness is validated later by
 *  cadence.buildRecurrence; here we shape-check and enforce the exclusivity. */
export function parseUpdate(raw: unknown): { body: UpdateBody } | { error: string } {
  if (typeof raw !== 'object' || raw === null) return { error: 'a JSON object is required' };
  const o = raw as Row;
  const body: UpdateBody = {};
  if (typeof o.title === 'string') {
    const t = o.title.trim();
    if (!t) return { error: 'title cannot be empty' };
    body.title = t;
  }
  if (typeof o.done === 'boolean') body.done = o.done;
  if (typeof o.due !== 'undefined') {
    if (o.due === null) body.due = null;
    else if (typeof o.due === 'string' && ISO_DATE.test(o.due)) body.due = o.due;
    else return { error: 'due must be an ISO date (YYYY-MM-DD) or null' };
  }
  if (typeof o.repeat !== 'undefined') {
    if (o.repeat === null) body.repeat = null;
    else if (typeof o.repeat === 'object') body.repeat = o.repeat as RepeatSpec;
    else return { error: 'repeat must be an object (kind: daily | weekly | every_n_days) or null' };
  }
  // Setting a due day and a repeat in the same call is contradictory (they clear each other).
  if (body.due != null && body.repeat != null) return { error: 'a task can have a due date or a repeat, not both' };
  if (Object.keys(body).length === 0) return { error: 'nothing to update: send title, done, due, or repeat' };
  return { body };
}

/** A fresh task id for a created task (api- prefix so the source is legible in the DB). */
export function newTaskId(nowMs: number, rand: string): string {
  return `api-${nowMs.toString(36)}-${rand}`;
}

// --- The HTTP handler (I/O) ------------------------------------------------

// Token-authed, not origin-gated (a public API: the token is the auth, not the
// origin). CORS is open so browser-based integrations and the Swagger UI can call it.
const API_CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, authorization',
};

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json', ...API_CORS } });
}

function bearer(request: Request): string {
  const auth = request.headers.get('Authorization') ?? '';
  return auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
}

/** GET /tasks: pick the read mode from the query. Precedence, one mode at a time:
 *  ?q (search) beats ?upcoming beats ?today beats a plain list. Documented in the OpenAPI spec. */
async function handleListTasks(request: Request, env: ApiEnv, token: string): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const q = params.get('q');
  const upcoming = params.get('upcoming');
  const today = params.get('today') === 'true';
  const todayIso = todayIsoUtc();

  if (q !== null) {
    const { url, init } = searchRequest(env, token);
    const res = await fetch(url, init);
    if (!res.ok) return json({ error: 'upstream error' }, 502);
    const rows = (await res.json()) as unknown;
    return json({ tasks: searchTasks(rows, q) });
  }

  if (upcoming !== null) {
    const { count, endIso } = upcomingWindow(upcoming, todayIso);
    const { url, init } = upcomingRequest(env, token, todayIso, endIso);
    const res = await fetch(url, init);
    if (!res.ok) return json({ error: 'upstream error' }, 502);
    const rows = (await res.json()) as unknown;
    return json({ tasks: upcomingTasks(rows, todayIso, count) });
  }

  const { url, init } = listRequest(env, token, { today, todayIso });
  const res = await fetch(url, init);
  if (!res.ok) return json({ error: 'upstream error' }, 502);
  const rows = (await res.json()) as unknown;
  return json({ tasks: Array.isArray(rows) ? rows.map((r) => toApiTask(r as Row)) : [] });
}

/** Route + serve the `/api/v1/*` task surface. index.ts forwards every `/api/` request here. */
export async function handleApi(request: Request, env: ApiEnv): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: API_CORS });

  const { pathname } = new URL(request.url);
  if (!pathname.startsWith('/api/v1')) return json({ error: 'not found (use /api/v1)' }, 404);
  const path = pathname.slice('/api/v1'.length) || '/';

  // Public docs surfaces (no token needed): the spec and a browsable Swagger UI.
  if (path === '/openapi.json' && request.method === 'GET') return json(OPENAPI_SPEC);
  if (path === '/docs' && request.method === 'GET') {
    return new Response(SWAGGER_HTML, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', ...API_CORS } });
  }

  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return json({ error: 'server not configured' }, 500);

  const token = bearer(request);
  if (!token) return json({ error: 'unauthorized: send a Bearer token (DoubleDone Settings, API access)' }, 401);

  // Collection: /tasks
  if (path === '/tasks') {
    if (request.method === 'GET') return handleListTasks(request, env, token);
    if (request.method === 'POST') {
      const sub = decodeJwtSub(token);
      if (!sub) return json({ error: 'unauthorized: could not read the token' }, 401);
      let raw: unknown;
      try {
        raw = await request.json();
      } catch {
        return json({ error: 'invalid JSON body' }, 400);
      }
      const parsed = parseCreate(raw);
      if ('error' in parsed) return json({ error: parsed.error }, 400);
      const now = new Date().toISOString();
      // Translate the agent-shaped repeat through the ONE shared cadence builder. A malformed
      // repeat is a calm 400, never a 500 (buildRecurrence returns null, never throws).
      let recurrence: Recurrence | null = null;
      if (parsed.body.repeat) {
        recurrence = buildRecurrence(parsed.body.repeat, now.slice(0, 10));
        if (!recurrence) {
          return json({ error: "couldn't read that repeat: use daily, weekly (with weekdays 0-6), or every_n_days (with days)" }, 400);
        }
      }
      const id = newTaskId(Date.now(), Math.random().toString(36).slice(2, 8));
      const { url, init } = createRequest(env, token, { id, userId: sub, title: parsed.body.title, due: parsed.body.due, recurrence, now });
      const res = await fetch(url, init);
      if (!res.ok) return json({ error: 'upstream error' }, 502);
      const rows = (await res.json()) as unknown;
      const created = Array.isArray(rows) && rows[0] ? toApiTask(rows[0] as Row) : null;
      return created ? json({ task: created }, 201) : json({ error: 'create failed' }, 502);
    }
    return json({ error: 'method not allowed' }, 405);
  }

  // Item: /tasks/{id}
  const match = path.match(/^\/tasks\/([^/]+)$/);
  if (match) {
    const id = decodeURIComponent(match[1]);
    if (request.method === 'GET') {
      const { url, init } = getRequest(env, token, id);
      const res = await fetch(url, init);
      if (!res.ok) return json({ error: 'upstream error' }, 502);
      const rows = (await res.json()) as unknown;
      const task = Array.isArray(rows) && rows[0] ? toApiTask(rows[0] as Row) : null;
      return task ? json({ task }) : json({ error: 'not found' }, 404);
    }
    if (request.method === 'PATCH') {
      let raw: unknown;
      try {
        raw = await request.json();
      } catch {
        return json({ error: 'invalid JSON body' }, 400);
      }
      const parsed = parseUpdate(raw);
      if ('error' in parsed) return json({ error: parsed.error }, 400);
      const now = new Date().toISOString();
      // Translate a set-repeat through the shared cadence builder; a malformed repeat is a calm
      // 400. `repeat: null` (clear) stays null and reaches updateRequest as recurrence: null.
      const patch: { title?: string; done?: boolean; due?: string | null; recurrence?: Recurrence | null } = {
        title: parsed.body.title,
        done: parsed.body.done,
        due: parsed.body.due,
      };
      if (typeof parsed.body.repeat !== 'undefined') {
        if (parsed.body.repeat === null) patch.recurrence = null;
        else {
          const recurrence = buildRecurrence(parsed.body.repeat, now.slice(0, 10));
          if (!recurrence) {
            return json({ error: "couldn't read that repeat: use daily, weekly (with weekdays 0-6), or every_n_days (with days), or null to stop it" }, 400);
          }
          patch.recurrence = recurrence;
        }
      }
      const { url, init } = updateRequest(env, token, id, patch, now);
      const res = await fetch(url, init);
      if (!res.ok) return json({ error: 'upstream error' }, 502);
      const rows = (await res.json()) as unknown;
      const task = Array.isArray(rows) && rows[0] ? toApiTask(rows[0] as Row) : null;
      return task ? json({ task }) : json({ error: 'not found' }, 404);
    }
    if (request.method === 'DELETE') {
      const { url, init } = deleteRequest(env, token, id, new Date().toISOString());
      const res = await fetch(url, init);
      if (!res.ok) return json({ error: 'upstream error' }, 502);
      return new Response(null, { status: 204, headers: API_CORS });
    }
    return json({ error: 'method not allowed' }, 405);
  }

  return json({ error: 'not found' }, 404);
}
