// Public REST API for DoubleDone tasks: a clean, OpenAPI-described CRUD surface over
// the user's own tasks, on the same Cloudflare Worker as the AI backend and the MCP
// server. Auth is the user's own Supabase access token (the same "Copy my token" the
// MCP uses): each call proxies to Supabase REST WITH that token, so row-level
// security scopes it to their rows and the Worker holds NO elevated key (privacy by
// architecture, preserved). Pure request/response builders + body parsers are
// exported and unit-tested; handleApi does the I/O.

import { decodeJwtSub } from './mcp';
import { OPENAPI_SPEC, SWAGGER_HTML } from './openapi';

export type ApiEnv = { SUPABASE_URL?: string; SUPABASE_ANON_KEY?: string };

// The public JSON shape of a task (camelCase; internal columns like user_id and
// deleted_at are never exposed).
export type ApiTask = {
  id: string;
  title: string;
  done: boolean;
  due: string | null;
  createdAt: string;
  completedAt: string | null;
};

type Row = Record<string, unknown>;

// The Supabase columns the API selects (snake_case, from PostgREST).
const SELECT = 'id,title,done,due,created_at,completed_at';
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Map a Supabase task row to the public API shape, defensively. */
export function toApiTask(row: Row): ApiTask {
  return {
    id: typeof row.id === 'string' ? row.id : String(row.id ?? ''),
    title: typeof row.title === 'string' ? row.title : '',
    done: row.done === true,
    due: typeof row.due === 'string' ? row.due : null,
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

export function getRequest(env: ApiEnv, token: string, id: string): { url: string; init: RequestInit } {
  const q = new URLSearchParams({ select: SELECT, id: `eq.${id}`, deleted_at: 'is.null' });
  return { url: `${tasksUrl(env)}?${q.toString()}`, init: { method: 'GET', headers: headers(env, token, false) } };
}

export function createRequest(
  env: ApiEnv,
  token: string,
  t: { id: string; userId: string; title: string; due: string | null; now: string },
): { url: string; init: RequestInit } {
  const body: Row = { id: t.id, user_id: t.userId, title: t.title, done: false, created_at: t.now, updated_at: t.now };
  if (t.due) body.due = t.due;
  return {
    url: `${tasksUrl(env)}?${new URLSearchParams({ select: SELECT }).toString()}`,
    init: { method: 'POST', headers: headers(env, token, true), body: JSON.stringify(body) },
  };
}

export function updateRequest(
  env: ApiEnv,
  token: string,
  id: string,
  patch: { title?: string; done?: boolean; due?: string | null },
  now: string,
): { url: string; init: RequestInit } {
  const q = new URLSearchParams({ id: `eq.${id}`, deleted_at: 'is.null', select: SELECT });
  const body: Row = { updated_at: now };
  if (typeof patch.title === 'string') body.title = patch.title;
  if (typeof patch.due !== 'undefined') body.due = patch.due;
  if (typeof patch.done === 'boolean') {
    body.done = patch.done;
    body.completed_at = patch.done ? now : null;
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

// --- Body parsing / validation (pure) --------------------------------------

export type CreateBody = { title: string; due: string | null };
export type UpdateBody = { title?: string; done?: boolean; due?: string | null };

/** Validate a POST body. Returns the clean body, or an { error } message. */
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
  return { body: { title, due } };
}

/** Validate a PATCH body (any of title / done / due). Returns the clean patch, or an { error }. */
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
  if (Object.keys(body).length === 0) return { error: 'nothing to update: send title, done, or due' };
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
    if (request.method === 'GET') {
      const today = new URL(request.url).searchParams.get('today') === 'true';
      const { url, init } = listRequest(env, token, { today, todayIso: new Date().toISOString().slice(0, 10) });
      const res = await fetch(url, init);
      if (!res.ok) return json({ error: 'upstream error' }, 502);
      const rows = (await res.json()) as unknown;
      return json({ tasks: Array.isArray(rows) ? rows.map((r) => toApiTask(r as Row)) : [] });
    }
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
      const id = newTaskId(Date.now(), Math.random().toString(36).slice(2, 8));
      const { url, init } = createRequest(env, token, { id, userId: sub, title: parsed.body.title, due: parsed.body.due, now });
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
      const { url, init } = updateRequest(env, token, id, parsed.body, now);
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
