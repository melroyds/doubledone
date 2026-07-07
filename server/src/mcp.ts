// A small, stateless MCP server for DoubleDone tasks, so an AI agent (Claude
// Desktop, ChatGPT, the MCP Inspector, etc.) can capture, look ahead over, manage
// and break down the user's tasks. It speaks the MCP Streamable-HTTP transport in
// JSON mode (JSON-RPC 2.0 over a single POST). Auth is a bearer token the user
// pastes into their MCP client: their Supabase access token. Every DATA tool call
// proxies to the Supabase REST API WITH that token, so row-level security scopes it
// to exactly their own rows; this server holds no elevated key. Discovery
// (initialize / tools/list) needs no auth.
//
// Since the OAuth connector path landed (see oauth.ts), the Supabase token can also
// arrive INJECTED: the OAuth layer validates its own opaque token, resolves the
// user's session from grant custody (mcp-grants.ts), and calls handleMcp with an
// 'oauth' token source. The legacy pasted-token path still reads the header
// exactly as it always did; nothing about it changed.
//
// The one AI/token spender is break_down (the app's Break-it-down engine, reused
// from decompose.ts). It PROPOSES steps only, never writes, and is per-user
// hourly-rate-limited against OAUTH_KV so an agent loop can't drain the Anthropic
// budget. Everything else is a thin, cheap Supabase proxy.
//
// The spine holds even through an agent: propose-then-accept. break_down shows steps
// and adds nothing; the human says yes; the agent then calls add_task per step. No
// tool shames a backlog, punishes an old task, or deletes anything for real (delete
// is a soft tombstone, exactly like the app).
//
// Pure helpers (the tool schemas, the JWT decode, the Supabase request builders, the
// row->list mappers, the OpenAI deep-research shapers) are exported and unit-tested;
// handleMcp does the I/O.

import { asRecurrence, buildRecurrence, isDueOn, recurringDueToday, type RepeatSpec, type Recurrence } from './cadence';
import {
  buildDecomposeRequest,
  DECOMPOSE_MODEL,
  type DecomposeContext,
  parseDecomposeResponse,
  type Step,
} from './decompose';
import { logAiCall, type TelemetryEnv } from './telemetry';

// Widened past SUPABASE_* so break_down can reach Anthropic (ANTHROPIC_API_KEY), rate-limit
// per user (OAUTH_KV), and log to the moat (DB). All optional and additive: the two handleMcp
// call sites (index.ts) already pass the full Worker Env, and OAuthEnv extends this, so nothing
// else has to change. TelemetryEnv contributes DB.
export type McpEnv = TelemetryEnv & {
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  // The OAuth provider's KV store, reused here ONLY as a per-user counter for the break_down
  // hourly cap (namespaced keys, see BREAKDOWN_KEY_PREFIX). Typed to just the two methods this
  // needs so we don't depend on a @cloudflare/workers-types version.
  OAUTH_KV?: { get(key: string, options?: unknown): Promise<unknown>; put(key: string, value: string, options?: unknown): Promise<unknown> };
};

export const MCP_PROTOCOL_VERSION = '2025-06-18';
export const SERVER_INFO = { name: 'doubledone', version: '1.0.0' };

// The `repeat` object schema shared by add_task and update_task (JSON Schema). Kept as one
// const so the two tools describe recurrence identically to an agent. Mirrors RepeatSpec /
// the client's CaptureSchedule vocabulary.
const REPEAT_SCHEMA = {
  type: 'object',
  description: 'Make the task repeat. Mutually exclusive with `due`.',
  properties: {
    kind: { type: 'string', enum: ['daily', 'weekly', 'every_n_days'], description: 'How it repeats.' },
    weekdays: {
      type: 'array',
      items: { type: 'integer', minimum: 0, maximum: 6 },
      description: 'For weekly: the days, 0=Sun .. 6=Sat. Required when kind is weekly.',
    },
    days: { type: 'integer', minimum: 1, description: 'For every_n_days: the interval in days. Required when kind is every_n_days.' },
    start: { type: 'string', description: "Optional 'YYYY-MM-DD' the repeat begins; defaults to today." },
  },
  required: ['kind'],
  additionalProperties: false,
} as const;

// Each tool carries an optional `premium` flag so a future paid tool can be gated in ONE place
// (see the entitlement gate in runTool). Every tool here maps to a FREE app feature, so none is
// set today; the hook exists so adding a premium tool is a one-line change, not a dispatch rewrite.
export const TOOLS = [
  {
    name: 'add_task',
    description:
      "Add a task to the user's DoubleDone. By default it lands on today. Optionally schedule it for a future day (`due`) OR make it repeat (`repeat`), never both.",
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'The task title.' },
        due: { type: 'string', description: "Optional 'YYYY-MM-DD' for a one-off on a future day. Mutually exclusive with `repeat`." },
        repeat: REPEAT_SCHEMA,
      },
      required: ['title'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_today',
    description: "List the user's open tasks for today (not done, not future-dated). Returns each task's id for complete_task.",
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'list_upcoming',
    description:
      "Look ahead: the user's future-dated tasks and the next occurrence of each repeating task, within a window (default 7 days). Read-only.",
    inputSchema: {
      type: 'object',
      properties: { days: { type: 'integer', minimum: 1, maximum: 30, description: 'How many days ahead to look (1-30, default 7).' } },
      additionalProperties: false,
    },
  },
  {
    name: 'complete_task',
    description: "Mark one of the user's tasks done, by the id from list_today.",
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'The task id from list_today.' } },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'update_task',
    description:
      "Change one of the user's tasks: its title, its `due` day, or its `repeat`. Setting `due` clears any repeat and vice versa. Pass null to clear a field. At least one change is required.",
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The task id (from list_today or list_upcoming).' },
        title: { type: 'string', description: 'A new title.' },
        due: { type: ['string', 'null'], description: "'YYYY-MM-DD' to schedule it, or null to clear the date. Clears any repeat." },
        repeat: { anyOf: [REPEAT_SCHEMA, { type: 'null' }], description: 'A repeat object to make it recur, or null to stop it recurring. Clears any due date.' },
      },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'delete_task',
    description: "Remove one of the user's tasks. It is tombstoned (recoverable), never hard-deleted.",
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'The task id to remove.' } },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'break_down',
    description:
      "Break a dreaded or vague task into small, ordered, time-boxed steps. This ONLY proposes the steps; it adds nothing. Show them to the user, and once they agree, call add_task for each step. Costs a little AI time, so use it when a task genuinely needs breaking down.",
    inputSchema: {
      type: 'object',
      properties: {
        task: { type: 'string', description: 'The task to break down.' },
        context: { type: 'string', description: 'Optional extra detail that would help (constraints, what stage it is at).' },
        steps: { type: 'integer', minimum: 2, maximum: 10, description: 'Optional desired number of steps (2-10).' },
      },
      required: ['task'],
      additionalProperties: false,
    },
  },
  // --- OpenAI Deep Research connector contract (read-only) ------------------------------------
  // ChatGPT's deep-research connector calls exactly `search` then `fetch`, and expects a specific
  // JSON shape returned as text content. These two complete that contract; a wrong shape silently
  // breaks Deep Research, so the shapes are pinned in searchResultsFrom / fetchResultFrom + tests.
  {
    name: 'search',
    description: "Search the user's open tasks by keyword. Returns matching tasks for Deep Research.",
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'The search text.' } },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'fetch',
    description: 'Fetch one task by id, for Deep Research.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'The task id from search.' } },
      required: ['id'],
      additionalProperties: false,
    },
  },
] as const;

// The tools that require a premium entitlement. Empty today (every tool maps to a FREE app
// feature); it is the single list a future paid tool joins, checked once in runTool.
export const PREMIUM_TOOLS: ReadonlySet<string> = new Set<string>();

// --- JSON-RPC envelopes ----------------------------------------------------

export function rpcResult(id: string | number | null, result: unknown): object {
  return { jsonrpc: '2.0', id, result };
}
export function rpcError(id: string | number | null, code: number, message: string): object {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

export function initializeResult(clientVersion?: string): object {
  // Echo the client's protocol version when given (maximises compatibility), else ours.
  return {
    protocolVersion: clientVersion ?? MCP_PROTOCOL_VERSION,
    capabilities: { tools: {} },
    serverInfo: SERVER_INFO,
  };
}
export function toolsListResult(): object {
  return { tools: TOOLS };
}

// --- Tool results ----------------------------------------------------------

export type ToolResult = { content: { type: 'text'; text: string }[]; isError?: boolean };

export function toolText(text: string, isError = false): ToolResult {
  return isError ? { content: [{ type: 'text', text }], isError: true } : { content: [{ type: 'text', text }] };
}

// --- Auth: read the user id out of the bearer JWT --------------------------

/** The `sub` (user uuid) from a Supabase access-token JWT, or null. No signature
 *  check needed: Supabase verifies the token on the REST call; this only needs the
 *  user id to satisfy the RLS insert check (user_id = auth.uid()). */
export function decodeJwtSub(token: string): string | null {
  const parts = token.split('.');
  if (parts.length < 2) return null;
  try {
    let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4;
    if (pad) b64 += '='.repeat(4 - pad);
    const sub = (JSON.parse(atob(b64)) as { sub?: unknown }).sub;
    return typeof sub === 'string' && sub.length > 0 ? sub : null;
  } catch {
    return null;
  }
}

/** Decode the `email` claim from a JWT payload, WITHOUT verifying the signature. A caller that needs a
 *  trustworthy email (the premium money gate) MUST verify the token first; the comp check reads this only
 *  after requirePremium has cryptographically verified the same token. Mirrors decodeJwtSub's base64url. */
export function decodeJwtEmail(token: string): string | null {
  const parts = token.split('.');
  if (parts.length < 2) return null;
  try {
    let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4;
    if (pad) b64 += '='.repeat(4 - pad);
    const email = (JSON.parse(atob(b64)) as { email?: unknown }).email;
    return typeof email === 'string' && email.length > 0 ? email : null;
  } catch {
    return null;
  }
}

// --- Supabase REST request builders (pure, unit-tested) --------------------

function supaHeaders(env: McpEnv, token: string, write: boolean): Record<string, string> {
  const h: Record<string, string> = { apikey: env.SUPABASE_ANON_KEY ?? '', authorization: `Bearer ${token}` };
  if (write) {
    h['content-type'] = 'application/json';
    h.prefer = 'return=representation';
  }
  return h;
}

export function addTaskRequest(
  env: McpEnv,
  token: string,
  t: { id: string; userId: string; title: string; now: string; due?: string | null; recurrence?: Recurrence | null },
): { url: string; init: RequestInit } {
  // due and recurrence are OPTIONAL and additive: an add with neither is byte-for-byte the
  // original row. When present they are written into the same columns the app / sync use, so
  // an agent-made dated or repeating task is indistinguishable from an app-made one.
  const row: Record<string, unknown> = {
    id: t.id,
    user_id: t.userId,
    title: t.title,
    done: false,
    created_at: t.now,
    updated_at: t.now,
  };
  if (t.due != null) row.due = t.due;
  if (t.recurrence != null) row.recurrence = t.recurrence;
  return {
    url: `${env.SUPABASE_URL}/rest/v1/tasks`,
    init: {
      method: 'POST',
      headers: supaHeaders(env, token, true),
      body: JSON.stringify(row),
    },
  };
}

export function listTodayRequest(env: McpEnv, token: string, todayIso: string): { url: string; init: RequestInit } {
  // Open, not deleted, not a silent parent (a decompose umbrella the app hides from Today).
  // Two kinds pass: an open one-off that is undated or due today-or-earlier, AND any open
  // recurring task, whose "due today" is decided in the Worker (see cadence.ts) because
  // PostgREST can't do the day-of-week / interval math. The cadence fields come back so the
  // tool can filter. silent_parent=not.is.true keeps false/null rows, excluding only true.
  const q = new URLSearchParams({
    select: 'id,title,recurrence,completed_dates,skipped_dates,due',
    deleted_at: 'is.null',
    silent_parent: 'not.is.true',
    or: `(and(recurrence.is.null,done.is.false,or(due.is.null,due.lte.${todayIso})),and(recurrence.not.is.null,done.is.false))`,
    order: 'created_at.asc',
  });
  return { url: `${env.SUPABASE_URL}/rest/v1/tasks?${q.toString()}`, init: { method: 'GET', headers: supaHeaders(env, token, false) } };
}

/** Turn the raw PostgREST rows into the id+title list to show. A one-off row (recurrence
 *  null) is already scoped by the SQL (open, due today-or-earlier); a recurring row is kept
 *  only if it is due today and not yet done/skipped today (cadence.ts, the logic PostgREST
 *  can't express). Order is preserved (the query sorts by created_at). Pure + unit-tested. */
export function listTodayFromRows(rows: unknown, todayIso: string): { id: string; title: string }[] {
  if (!Array.isArray(rows)) return [];
  const out: { id: string; title: string }[] = [];
  for (const r of rows) {
    if (r == null || typeof r !== 'object') continue;
    const row = r as { id?: unknown; title?: unknown; recurrence?: unknown; completed_dates?: unknown; skipped_dates?: unknown };
    if (typeof row.id !== 'string' || typeof row.title !== 'string') continue;
    if (row.recurrence == null) {
      out.push({ id: row.id, title: row.title }); // an open one-off, already scoped by the SQL
    } else if (recurringDueToday(row.recurrence, row.completed_dates, row.skipped_dates, todayIso)) {
      out.push({ id: row.id, title: row.title });
    }
  }
  return out;
}

export function completeTaskRequest(env: McpEnv, token: string, id: string, now: string): { url: string; init: RequestInit } {
  const q = new URLSearchParams({ id: `eq.${id}` });
  return {
    url: `${env.SUPABASE_URL}/rest/v1/tasks?${q.toString()}`,
    init: {
      method: 'PATCH',
      headers: supaHeaders(env, token, true),
      body: JSON.stringify({ done: true, completed_at: now, updated_at: now }),
    },
  };
}

/** PATCH a task's mutable fields (title / due / recurrence), ALWAYS bumping updated_at so the
 *  change wins last-write-wins sync (schema.sql: there is deliberately no now() trigger; the
 *  writer is authoritative). A due<->repeat switch is explicit: setting `due` also nulls
 *  `recurrence`, and setting `recurrence` also nulls `due`, so a task is never both at once.
 *  Only the keys present in `fields` are sent (a PATCH), so an unspecified field is untouched. */
export function updateTaskRequest(
  env: McpEnv,
  token: string,
  id: string,
  fields: { title?: string; due?: string | null; recurrence?: Recurrence | null },
  now: string,
): { url: string; init: RequestInit } {
  const q = new URLSearchParams({ id: `eq.${id}` });
  const patch: Record<string, unknown> = { updated_at: now };
  if (fields.title !== undefined) patch.title = fields.title;
  if (fields.due !== undefined) {
    patch.due = fields.due; // string schedules it, null clears it
    if (fields.due != null) patch.recurrence = null; // scheduling a one-off day stops any repeat
  }
  if (fields.recurrence !== undefined) {
    patch.recurrence = fields.recurrence; // an object makes it repeat, null stops it
    if (fields.recurrence != null) patch.due = null; // a repeat has no single due day
  }
  return {
    url: `${env.SUPABASE_URL}/rest/v1/tasks?${q.toString()}`,
    init: { method: 'PATCH', headers: supaHeaders(env, token, true), body: JSON.stringify(patch) },
  };
}

/** SOFT-delete: set the deleted_at tombstone (and bump updated_at), exactly like the app. The
 *  client hides tombstoned rows and the tombstone syncs; nothing is ever hard-deleted here. */
export function deleteTaskRequest(env: McpEnv, token: string, id: string, now: string): { url: string; init: RequestInit } {
  const q = new URLSearchParams({ id: `eq.${id}` });
  return {
    url: `${env.SUPABASE_URL}/rest/v1/tasks?${q.toString()}`,
    init: {
      method: 'PATCH',
      headers: supaHeaders(env, token, true),
      body: JSON.stringify({ deleted_at: now, updated_at: now }),
    },
  };
}

// --- list_upcoming: future one-offs + each repeat's next occurrence in a window -------------

/** The window bounds for list_upcoming: strictly AFTER today, up to and including today+days.
 *  Clamps `days` to 1..30 (default 7) so a bad or huge arg can't fan out unbounded. */
export function upcomingWindow(days: unknown, todayIso: string): { count: number; endIso: string } {
  const n = typeof days === 'number' && Number.isFinite(days) ? Math.floor(days) : 7;
  const count = Math.max(1, Math.min(30, n));
  return { count, endIso: addDaysIso(todayIso, count) };
}

/** Fetch the rows list_upcoming reasons over: open, not deleted, not a silent parent, and either
 *  a future one-off due within the window OR any open recurring task (its next occurrence is
 *  computed in the Worker). Uses the same silent_parent / deleted guards as list_today. */
export function listUpcomingRequest(env: McpEnv, token: string, todayIso: string, endIso: string): { url: string; init: RequestInit } {
  const q = new URLSearchParams({
    select: 'id,title,recurrence,completed_dates,skipped_dates,due',
    deleted_at: 'is.null',
    silent_parent: 'not.is.true',
    // A future one-off (open, dated strictly after today, on/before the window end), OR any open
    // recurring task (kept for cadence walking below). The one-off date math PostgREST can do; the
    // recurring "next occurrence" it cannot, so those are filtered in listUpcomingFromRows.
    or: `(and(recurrence.is.null,done.is.false,due.gt.${todayIso},due.lte.${endIso}),and(recurrence.not.is.null,done.is.false))`,
    order: 'due.asc',
  });
  return { url: `${env.SUPABASE_URL}/rest/v1/tasks?${q.toString()}`, init: { method: 'GET', headers: supaHeaders(env, token, false) } };
}

/** Map the upcoming rows to dated entries, in date order. A one-off contributes its `due` day
 *  (already window-scoped by the SQL). A recurring task contributes its NEXT due day: walk
 *  today+1 .. today+count and take the first day it is due AND not already completed/skipped
 *  on (a repeat that's done for its next hit shows the one after). Pure + unit-tested; the
 *  tool formats and caps the output. */
export function listUpcomingFromRows(rows: unknown, todayIso: string, count: number): { id: string; title: string; when: string }[] {
  if (!Array.isArray(rows)) return [];
  const out: { id: string; title: string; when: string }[] = [];
  for (const r of rows) {
    if (r == null || typeof r !== 'object') continue;
    const row = r as { id?: unknown; title?: unknown; recurrence?: unknown; completed_dates?: unknown; skipped_dates?: unknown; due?: unknown };
    if (typeof row.id !== 'string' || typeof row.title !== 'string') continue;
    if (row.recurrence == null) {
      // A future one-off. Trust the SQL window, but keep the day so we can sort/format uniformly.
      if (typeof row.due === 'string') out.push({ id: row.id, title: row.title, when: row.due });
    } else {
      const next = nextOccurrence(row.recurrence, row.completed_dates, row.skipped_dates, todayIso, count);
      if (next) out.push({ id: row.id, title: row.title, when: next });
    }
  }
  // Stable date order (the SQL sorts one-offs, but the computed recurring days must interleave).
  out.sort((a, b) => (a.when < b.when ? -1 : a.when > b.when ? 1 : 0));
  return out;
}

/** The first day in (today, today+count] a recurrence is due and not already done/skipped, or
 *  null if it doesn't recur inside the window. Reuses cadence.isDueOn + asRecurrence (no
 *  date-math or JSONB-narrowing reimpl). */
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

// --- OpenAI Deep Research shapes (search / fetch) ------------------------------------------
// ChatGPT's connector expects search -> { results: [{ id, title, url }] } and
// fetch -> { id, title, text, url }, each returned as a JSON string in text content. The url
// is a stable app link (the connector renders it as the citation). Kept tiny and pinned.

const APP_URL = 'https://doubledone.app';

/** Fetch the open, non-deleted, non-silent-parent tasks to substring-search (title only). We
 *  pull the small candidate set and match in the Worker (case-insensitive), which is simpler and
 *  safer than escaping user text into a PostgREST ilike. Order is stable (created_at). */
export function searchTasksRequest(env: McpEnv, token: string): { url: string; init: RequestInit } {
  const q = new URLSearchParams({
    select: 'id,title,recurrence,due,completed_dates,skipped_dates',
    deleted_at: 'is.null',
    silent_parent: 'not.is.true',
    done: 'is.false',
    order: 'created_at.asc',
  });
  return { url: `${env.SUPABASE_URL}/rest/v1/tasks?${q.toString()}`, init: { method: 'GET', headers: supaHeaders(env, token, false) } };
}

/** Case-insensitive substring match over task titles, in the OpenAI deep-research result shape.
 *  Capped so a huge list can't blow the response. Pure + unit-tested (the shape is the contract). */
export function searchResultsFrom(rows: unknown, query: string, cap = 20): { id: string; title: string; url: string }[] {
  if (!Array.isArray(rows)) return [];
  const needle = query.trim().toLowerCase();
  const out: { id: string; title: string; url: string }[] = [];
  for (const r of rows) {
    if (out.length >= cap) break;
    if (r == null || typeof r !== 'object') continue;
    const row = r as { id?: unknown; title?: unknown };
    if (typeof row.id !== 'string' || typeof row.title !== 'string') continue;
    // An empty query returns everything (up to the cap): the connector sometimes probes with "".
    if (needle === '' || row.title.toLowerCase().includes(needle)) {
      out.push({ id: row.id, title: row.title, url: APP_URL });
    }
  }
  return out;
}

/** Fetch a single task by id (any state), for the deep-research `fetch` call. */
export function fetchTaskRequest(env: McpEnv, token: string, id: string): { url: string; init: RequestInit } {
  const q = new URLSearchParams({
    select: 'id,title,done,recurrence,due,completed_dates,skipped_dates',
    id: `eq.${id}`,
    limit: '1',
  });
  return { url: `${env.SUPABASE_URL}/rest/v1/tasks?${q.toString()}`, init: { method: 'GET', headers: supaHeaders(env, token, false) } };
}

/** The OpenAI deep-research `fetch` document for one row, or null if the row is missing/invalid.
 *  `text` is a short human line, "{title} — {status}", where status folds in due/repeat/done.
 *  Pure + unit-tested (the shape is the contract). */
export function fetchResultFrom(rows: unknown, id: string, todayIso: string): { id: string; title: string; text: string; url: string } | null {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const row = rows[0] as { id?: unknown; title?: unknown; done?: unknown; recurrence?: unknown; due?: unknown };
  if (typeof row.id !== 'string' || typeof row.title !== 'string') return null;
  return { id: row.id, title: row.title, text: `${row.title} — ${describeStatus(row, todayIso)}`, url: APP_URL };
}

/** A well-formed, contract-satisfying `fetch` document for a miss (id not found, deleted since
 *  search, or an upstream blip). Deep Research requires all four fields on every fetch response,
 *  so this returns a calm empty document instead of an off-shape {error} object. Echoes the
 *  requested id so the connector can still tie the response to its request. Pure + unit-tested. */
export function fetchNotFoundDoc(id: string): { id: string; title: string; text: string; url: string } {
  return { id, title: 'Not found', text: 'This task is no longer available.', url: APP_URL };
}

// --- small shared helpers (pure) -----------------------------------------------------------

/** ISO 'YYYY-MM-DD' `days` after `iso` (UTC calendar math, matching cadence.ts). */
export function addDaysIso(iso: string, days: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) + days * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

/** A short, calm status line for a task, e.g. "done", "on today", "due 2026-07-10",
 *  "repeats". Used by fetch's `text`. No shame, no raw fields. */
function describeStatus(row: { done?: unknown; recurrence?: unknown; due?: unknown }, todayIso: string): string {
  if (row.done === true) return 'done';
  if (row.recurrence != null) return 'repeats';
  if (typeof row.due === 'string') return row.due > todayIso ? `due ${row.due}` : 'on today';
  return 'on today';
}

// --- break_down: the AI proposer (the only token spender), rate-limited per user -----------

// Per-user hourly cap on break_down, enforced in OAUTH_KV. Keys are namespaced so they can't
// collide with the OAuth provider's own keys or the session stash. A fixed-window counter (one
// key per user per UTC hour) is enough here: it's a budget guardrail, not a precise limiter.
const BREAKDOWN_KEY_PREFIX = 'mcp:bd:';
export const BREAKDOWN_HOURLY_CAP = 20;

/** The KV key for a user's break_down count in the current UTC hour. Exported for the test. */
export function breakdownRateKey(sub: string, nowMs: number): string {
  const hourBucket = Math.floor(nowMs / 3_600_000);
  return `${BREAKDOWN_KEY_PREFIX}${sub}:${hourBucket}`;
}

/** Increment the user's hourly break_down counter and report whether they are now OVER the cap.
 *  Fails OPEN (allowed) if KV is unbound or errors: the per-IP AI_LIMITER + the Anthropic monthly
 *  cap are the harder walls; this is the friendly per-user guardrail. Best-effort, never throws. */
async function overBreakdownCap(env: McpEnv, sub: string, nowMs: number): Promise<boolean> {
  if (!env.OAUTH_KV) return false;
  const key = breakdownRateKey(sub, nowMs);
  try {
    const current = Number((await env.OAUTH_KV.get(key)) ?? 0);
    if (Number.isFinite(current) && current >= BREAKDOWN_HOURLY_CAP) return true;
    // Bump the count, TTL just past the hour so old buckets self-expire.
    await env.OAUTH_KV.put(key, String((Number.isFinite(current) ? current : 0) + 1), { expirationTtl: 3900 });
    return false;
  } catch {
    return false; // fail open on a KV hiccup
  }
}

/** Render the proposed steps as a calm, readable list plus the propose-then-accept reminder. */
export function formatBreakdown(steps: Step[]): string {
  const lines = steps.map((s) => {
    const mins = Number.isFinite(s.minutes) && s.minutes > 0 ? ` (${s.minutes} min)` : '';
    return `• ${s.title}${mins}`;
  });
  return `${lines.join('\n')}\n\nNothing's been added yet. Say the word and I'll add these.`;
}

// --- Tool execution (I/O) --------------------------------------------------

async function runTool(env: McpEnv, token: string, name: string, args: Record<string, unknown>): Promise<ToolResult> {
  const sub = decodeJwtSub(token);
  if (!sub) return toolText('Could not read your token. Re-copy it from DoubleDone Settings.', true);
  const now = new Date().toISOString();
  const todayIso = now.slice(0, 10);

  // Single entitlement gate for any future premium tool. Empty today, so this never fires;
  // when a paid tool is added it joins PREMIUM_TOOLS and this is the ONE place it's checked.
  if (PREMIUM_TOOLS.has(name)) {
    return toolText('That is a Premium feature. You can turn it on in DoubleDone Settings.', true);
  }

  if (name === 'add_task') {
    const title = typeof args.title === 'string' ? args.title.trim() : '';
    if (!title) return toolText('A title is required.', true);
    // due XOR repeat: an agent must not send both (the app never does either).
    const hasDue = args.due != null;
    const hasRepeat = args.repeat != null;
    if (hasDue && hasRepeat) return toolText("A task can have a due date or a repeat, not both. Pick one.", true);
    let due: string | null | undefined;
    let recurrence: Recurrence | null | undefined;
    if (hasDue) {
      if (typeof args.due !== 'string' || !isValidIsoDay(args.due)) return toolText("The due date needs to look like 'YYYY-MM-DD'.", true);
      due = args.due;
    }
    if (hasRepeat) {
      recurrence = buildRecurrence(args.repeat as RepeatSpec, todayIso);
      if (!recurrence) return toolText("I couldn't read that repeat. Use daily, weekly (with weekdays 0-6), or every_n_days (with days).", true);
    }
    const taskId = `mcp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const { url, init } = addTaskRequest(env, token, { id: taskId, userId: sub, title, now, due, recurrence });
    const res = await fetch(url, init);
    // Don't echo the raw upstream HTTP status (minor backend-topology leak); give a plain line, like api.ts.
    if (!res.ok) return toolText('Could not add it just now. Try again.', true);
    const when = due ? ` for ${due}` : recurrence ? ', repeating' : ' to today';
    return toolText(`Added "${title}"${when}.`);
  }

  if (name === 'list_today') {
    const { url, init } = listTodayRequest(env, token, todayIso);
    const res = await fetch(url, init);
    if (!res.ok) return toolText('Could not list tasks just now. Try again.', true);
    const rows = (await res.json()) as unknown;
    const tasks = listTodayFromRows(rows, todayIso);
    if (tasks.length === 0) return toolText('Nothing on today. Enjoy the quiet.');
    return toolText(tasks.map((t) => `• ${t.title}  [${t.id}]`).join('\n'));
  }

  if (name === 'list_upcoming') {
    const { count, endIso } = upcomingWindow(args.days, todayIso);
    const { url, init } = listUpcomingRequest(env, token, todayIso, endIso);
    const res = await fetch(url, init);
    if (!res.ok) return toolText('Could not look ahead just now. Try again.', true);
    const rows = (await res.json()) as unknown;
    const items = listUpcomingFromRows(rows, todayIso, count);
    if (items.length === 0) return toolText(`Nothing scheduled in the next ${count} day${count === 1 ? '' : 's'}.`);
    // Cap the printed list so a big backlog can't produce a wall of text.
    const shown = items.slice(0, 40);
    const body = shown.map((t) => `• ${t.title} — ${t.when}  [${t.id}]`).join('\n');
    const more = items.length > shown.length ? `\n…and ${items.length - shown.length} more.` : '';
    return toolText(body + more);
  }

  if (name === 'complete_task') {
    const taskId = typeof args.id === 'string' ? args.id.trim() : '';
    if (!taskId) return toolText('A task id is required (use list_today first).', true);
    const { url, init } = completeTaskRequest(env, token, taskId, now);
    const res = await fetch(url, init);
    if (!res.ok) return toolText('Could not complete it just now. Try again.', true);
    const rows = (await res.json()) as unknown;
    return Array.isArray(rows) && rows.length > 0 ? toolText('Marked it done. Nice.') : toolText('No matching task found.', true);
  }

  if (name === 'update_task') {
    const taskId = typeof args.id === 'string' ? args.id.trim() : '';
    if (!taskId) return toolText('A task id is required.', true);
    const fields: { title?: string; due?: string | null; recurrence?: Recurrence | null } = {};
    if (args.title !== undefined) {
      const title = typeof args.title === 'string' ? args.title.trim() : '';
      if (!title) return toolText('A new title can\'t be empty.', true);
      fields.title = title;
    }
    if (args.due !== undefined) {
      if (args.due === null) fields.due = null;
      else if (typeof args.due === 'string' && isValidIsoDay(args.due)) fields.due = args.due;
      else return toolText("The due date needs to look like 'YYYY-MM-DD', or null to clear it.", true);
    }
    if (args.repeat !== undefined) {
      if (args.repeat === null) fields.recurrence = null;
      else {
        const recurrence = buildRecurrence(args.repeat as RepeatSpec, todayIso);
        if (!recurrence) return toolText("I couldn't read that repeat. Use daily, weekly (with weekdays 0-6), or every_n_days (with days), or null to stop it.", true);
        fields.recurrence = recurrence;
      }
    }
    // At least one mutable field is required (updated_at alone is not a user-meaningful change).
    if (fields.title === undefined && fields.due === undefined && fields.recurrence === undefined) {
      return toolText('Tell me what to change: a title, a due date, or a repeat.', true);
    }
    const { url, init } = updateTaskRequest(env, token, taskId, fields, now);
    const res = await fetch(url, init);
    if (!res.ok) return toolText('Could not update it just now. Try again.', true);
    const rows = (await res.json()) as unknown;
    return Array.isArray(rows) && rows.length > 0 ? toolText('Updated.') : toolText('No matching task found.', true);
  }

  if (name === 'delete_task') {
    const taskId = typeof args.id === 'string' ? args.id.trim() : '';
    if (!taskId) return toolText('A task id is required.', true);
    const { url, init } = deleteTaskRequest(env, token, taskId, now);
    const res = await fetch(url, init);
    if (!res.ok) return toolText('Could not remove it just now. Try again.', true);
    const rows = (await res.json()) as unknown;
    return Array.isArray(rows) && rows.length > 0 ? toolText('Removed.') : toolText('No matching task found.', true);
  }

  if (name === 'break_down') {
    const task = typeof args.task === 'string' ? args.task.trim() : '';
    if (!task) return toolText('Tell me the task to break down.', true);
    if (!env.ANTHROPIC_API_KEY) return toolText('Breaking down is unavailable right now.', true);
    // COST GUARD: the only token spender. Enforce the per-user hourly cap BEFORE any spend.
    if (await overBreakdownCap(env, sub, Date.now())) {
      return toolText("Let's pause breaking things down for a bit. Try again shortly.");
    }
    // Fold the optional context / desired step count into the decompose context (reusing the
    // app's Break-it-down engine). `steps` becomes a hint in the answer field; the model still
    // decides the real count within its 3-6 guidance.
    const context: DecomposeContext | undefined = buildBreakdownContext(args);
    const { url, init } = buildDecomposeRequest(task, env.ANTHROPIC_API_KEY, context);
    const started = Date.now();
    const res = await fetch(url, init as RequestInit);
    if (!res.ok) return toolText("I couldn't break that down just now. Try again.", true);
    const raw = (await res.json()) as unknown;
    const steps = parseDecomposeResponse(raw);
    // Log to the moat if D1 is reachable from here (it is, via the widened env). Awaited, but
    // logAiCall swallows all errors and returns void, so it can never break the tool result.
    await logAiCall(env, {
      endpoint: 'decompose',
      model: DECOMPOSE_MODEL,
      input: { task, via: 'mcp' },
      output: { steps: steps.length },
      inputTokens: usageOf(raw).input,
      outputTokens: usageOf(raw).output,
      latencyMs: Date.now() - started,
      ok: steps.length > 0,
    });
    if (steps.length === 0) return toolText("I couldn't find useful steps for that. Try rewording it.", true);
    return toolText(formatBreakdown(steps));
  }

  // --- OpenAI Deep Research: search + fetch (read-only, shape-pinned) ---
  if (name === 'search') {
    const query = typeof args.query === 'string' ? args.query : '';
    const { url, init } = searchTasksRequest(env, token);
    const res = await fetch(url, init);
    // Even on an upstream miss, return the well-formed empty shape so Deep Research doesn't choke.
    const rows = res.ok ? ((await res.json()) as unknown) : [];
    return toolText(JSON.stringify({ results: searchResultsFrom(rows, query) }));
  }

  if (name === 'fetch') {
    const fid = typeof args.id === 'string' ? args.id.trim() : '';
    // The connector's fetch contract requires an { id, title, text, url } document on EVERY
    // response. A miss (empty id, deleted-since-search, or an upstream blip) still returns a
    // well-formed doc, so Deep Research parses it and drops the source cleanly rather than
    // choking on an off-shape object. Same reasoning as search's empty-shape-on-error.
    if (!fid) return toolText(JSON.stringify(fetchNotFoundDoc(fid)));
    const { url, init } = fetchTaskRequest(env, token, fid);
    const res = await fetch(url, init);
    const rows = res.ok ? ((await res.json()) as unknown) : [];
    const doc = fetchResultFrom(rows, fid, todayIso);
    return toolText(JSON.stringify(doc ?? fetchNotFoundDoc(fid)));
  }

  return toolText(`Unknown tool: ${name}`, true);
}

/** Anthropic token usage, defensively (mirrors telemetry.extractUsage without the import cycle risk). */
function usageOf(raw: unknown): { input: number | null; output: number | null } {
  const usage = (raw as { usage?: { input_tokens?: unknown; output_tokens?: unknown } } | null)?.usage;
  return {
    input: typeof usage?.input_tokens === 'number' ? usage.input_tokens : null,
    output: typeof usage?.output_tokens === 'number' ? usage.output_tokens : null,
  };
}

/** Fold break_down's optional args into a DecomposeContext, or undefined if there's nothing to add.
 *  `context` becomes the free-text detail; a `steps` hint rides the same channel the app uses for a
 *  qualifying answer, nudging granularity without overriding the model's judgement. */
function buildBreakdownContext(args: Record<string, unknown>): DecomposeContext | undefined {
  const detail = typeof args.context === 'string' && args.context.trim() ? args.context.trim() : '';
  const wantSteps = typeof args.steps === 'number' && Number.isInteger(args.steps) && args.steps >= 2 && args.steps <= 10 ? args.steps : null;
  if (!detail && wantSteps == null) return undefined;
  const parts: string[] = [];
  if (detail) parts.push(detail);
  if (wantSteps != null) parts.push(`Aim for about ${wantSteps} steps.`);
  return { question: 'Extra detail:', answer: parts.join(' ') };
}

/** True for a well-formed, real calendar day 'YYYY-MM-DD'. Rejects e.g. 2026-13-40. */
function isValidIsoDay(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

// --- The HTTP handler ------------------------------------------------------

// Token-authed, not origin-gated, so a browser-based MCP client (the Inspector)
// can reach it. The token is the auth.
const MCP_CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, authorization, mcp-protocol-version, mcp-session-id',
};

function mcpJson(payload: unknown): Response {
  return new Response(JSON.stringify(payload), { headers: { 'content-type': 'application/json', ...MCP_CORS } });
}

/** Where tools/call gets its Supabase access token. 'header' is the legacy pasted-token
 *  path: read the bearer straight off the request, exactly as always. 'oauth' is the
 *  connector path: the OAuth layer resolves the token from grant custody, and a null
 *  there means the grant is dead, which must surface as HTTP 401 invalid_token (not an
 *  in-band calm text) so claude.ai / ChatGPT re-run the OAuth flow instead of wedging. */
export type McpTokenSource = { kind: 'header' } | { kind: 'oauth'; getToken: () => Promise<string | null> };

/** 401 for a dead OAuth grant (custody revoked, refresh family invalidated). The
 *  WWW-Authenticate header mirrors the provider's RFC 9728 challenge, resource metadata
 *  URL and all, so a connector treats it exactly like an expired token and re-authorizes. */
function oauthGrantGone(request: Request): Response {
  const url = new URL(request.url);
  const meta = `${url.origin}/.well-known/oauth-protected-resource${url.pathname}`;
  const description = 'This connection is no longer authorized. Reconnect DoubleDone.';
  return new Response(JSON.stringify({ error: 'invalid_token', error_description: description }), {
    status: 401,
    headers: {
      'content-type': 'application/json',
      'WWW-Authenticate': `Bearer realm="OAuth", resource_metadata="${meta}", error="invalid_token", error_description="${description}"`,
      ...MCP_CORS,
    },
  });
}

export async function handleMcp(request: Request, env: McpEnv, source: McpTokenSource = { kind: 'header' }): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: MCP_CORS });
  if (request.method !== 'POST') return new Response('doubledone-mcp', { status: 405, headers: MCP_CORS });

  let body: { id?: unknown; method?: unknown; params?: unknown };
  try {
    body = (await request.json()) as { id?: unknown; method?: unknown; params?: unknown };
  } catch {
    return mcpJson(rpcError(null, -32700, 'parse error'));
  }
  const id = typeof body.id === 'string' || typeof body.id === 'number' ? body.id : null;
  const method = typeof body.method === 'string' ? body.method : '';

  // Notifications (initialized, cancelled, …) expect no response body.
  if (method.startsWith('notifications/')) return new Response(null, { status: 202, headers: MCP_CORS });

  if (method === 'initialize') {
    const pv = (body.params as { protocolVersion?: unknown } | undefined)?.protocolVersion;
    return mcpJson(rpcResult(id, initializeResult(typeof pv === 'string' ? pv : undefined)));
  }
  if (method === 'tools/list') return mcpJson(rpcResult(id, toolsListResult()));
  if (method === 'ping') return mcpJson(rpcResult(id, {}));

  if (method === 'tools/call') {
    let token: string;
    if (source.kind === 'header') {
      const auth = request.headers.get('Authorization') ?? '';
      token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
      if (!token) {
        return mcpJson(
          rpcResult(id, toolText('Not connected. Paste your DoubleDone token into this MCP server (Settings → MCP access in the app).', true)),
        );
      }
    } else {
      const resolved = await source.getToken();
      if (!resolved) return oauthGrantGone(request);
      token = resolved;
    }
    if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
      return mcpJson(rpcError(id, -32603, 'server not configured'));
    }
    const p = (body.params ?? {}) as { name?: unknown; arguments?: unknown };
    const name = typeof p.name === 'string' ? p.name : '';
    const args = (p.arguments && typeof p.arguments === 'object' ? p.arguments : {}) as Record<string, unknown>;
    try {
      return mcpJson(rpcResult(id, await runTool(env, token, name, args)));
    } catch {
      return mcpJson(rpcResult(id, toolText('Something went wrong reaching DoubleDone. Try again.', true)));
    }
  }

  return mcpJson(rpcError(id, -32601, `method not found: ${method}`));
}
