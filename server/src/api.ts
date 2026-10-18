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
//
// Parts (the app's "Track in steps") share their arithmetic and write guard with MCP too
// (steps.ts). The one deliberate difference: this API's counts are ABSOLUTE (`partsDone: 4`),
// because an HTTP integrator retries and the write must be idempotent, where MCP ticks
// relative to the count (a model reasons best with "one more"). Both only ever go forward.
//
// Linked steps (the app's Break it down) are CRUD too, so they are here as well as on MCP: the
// same rows (steps.ts buildStepRows), the same read, insert and guarded hide, and the same finish
// walk when a step closes. Only the AI that proposes steps stays MCP-only.

import {
  asRecurrence,
  buildRecurrence,
  isDueOn,
  isValidIsoDay,
  type Recurrence,
  type RepeatSpec,
  tickForDay,
} from './cadence';
import { OPENAPI_SPEC, SWAGGER_HTML } from './openapi';
import {
  advanceParts,
  buildStepRows,
  cleanSlices,
  hideGuard,
  hidePatch,
  insertedRowsFilter,
  MAX_PARTS,
  MAX_TITLE_CHARS,
  MIN_PARTS,
  needsWrite,
  parseSteps,
  type PartsChange,
  partsGuard,
  planFinish,
  setTotal,
  type Slices,
  type StepSpec,
  stepIds,
  stepsRefusal,
  type WalkIo,
  type WalkRow,
  walkChildrenQuery,
  walkParentQuery,
  wholeIn,
} from './steps';
import { defaultVerifySub, type SubVerifier } from './verify';

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
  partsTotal: number | null; // the parts a task is tracked in (the app's "Track in steps"), or null for a whole task
  partsDone: number | null; // how many of those are ticked, or null for a whole task
  parentId: string | null; // for a step, the big task it closes; null otherwise
  parentTitle: string | null; // that big task's title as the step recorded it, or null (older rows never sent it)
  hidden: boolean; // waiting behind its steps (a broken-down or made-tiny task): its steps close it or bring it back
  createdAt: string;
  completedAt: string | null;
};

type Row = Record<string, unknown>;

// The Supabase columns the API selects (snake_case, from PostgREST). recurrence and slices feed
// the output shape, and so do parent_id, parent_title and silent_parent (as parentId, parentTitle
// and hidden); completed_dates / skipped_dates are read only to compute ?upcoming (a repeat
// already done/skipped for a day shows the next one), and are never surfaced. left_off is never
// selected at all.
const SELECT = 'id,title,done,due,created_at,completed_at,recurrence,completed_dates,skipped_dates,slices,silent_parent,parent_id,parent_title';
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
 *  `repeats` is its human summary. slices is cleaned the way the app's own load cleans it
 *  (steps.ts cleanSlices), because sync copies whatever a device wrote straight through. */
export function toApiTask(row: Row): ApiTask {
  const recurrence = asRecurrence(row.recurrence);
  const parts = cleanSlices(row.slices);
  return {
    id: typeof row.id === 'string' ? row.id : String(row.id ?? ''),
    title: typeof row.title === 'string' ? row.title : '',
    done: row.done === true,
    due: typeof row.due === 'string' ? row.due : null,
    recurrence,
    repeats: describeRecurrence(recurrence),
    partsTotal: parts ? parts.total : null,
    partsDone: parts ? parts.done : null,
    parentId: typeof row.parent_id === 'string' && row.parent_id ? row.parent_id : null,
    parentTitle: typeof row.parent_title === 'string' ? row.parent_title : null,
    hidden: row.silent_parent === true,
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
  t: { id: string; userId: string; title: string; due: string | null; recurrence?: Recurrence | null; slices?: Slices | null; now: string },
): { url: string; init: RequestInit } {
  // due, recurrence and slices are OPTIONAL and additive: a create with none is byte-for-byte the
  // original row. When present they write the same columns the app / sync / MCP use, so an
  // API-made dated, repeating or in-parts task is indistinguishable from an app- or agent-made one.
  const body: Row = { id: t.id, user_id: t.userId, title: t.title, done: false, created_at: t.now, updated_at: t.now };
  if (t.due) body.due = t.due;
  if (t.recurrence != null) body.recurrence = t.recurrence;
  if (t.slices != null) body.slices = t.slices;
  return {
    url: `${tasksUrl(env)}?${new URLSearchParams({ select: SELECT }).toString()}`,
    init: { method: 'POST', headers: headers(env, token, true), body: JSON.stringify(body) },
  };
}

/** The changes a PATCH resolves to, before they become columns (see updateRequest). */
export type UpdatePatch = {
  title?: string;
  done?: boolean;
  due?: string | null;
  recurrence?: Recurrence | null;
  completedDates?: string[];
  slices?: Slices | null;
};

/** The PATCH for one task. `guard` pins it to the row as the handler read it (planPatch): `done=is.false` so a
 *  second close never re-stamps completedAt, and the stored parts so a concurrent tick or resize is never
 *  reverted. With a guard, no row back means the task changed in between, a 409, not a 404. */
export function updateRequest(
  env: ApiEnv,
  token: string,
  id: string,
  patch: UpdatePatch,
  now: string,
  guard: Record<string, string> = {},
): { url: string; init: RequestInit } {
  const q = new URLSearchParams({ id: `eq.${id}`, deleted_at: 'is.null', select: SELECT, ...guard });
  const body: Row = { updated_at: now };
  if (typeof patch.title === 'string') body.title = patch.title;
  // A repeat's tick: the handler resolves `done` into completed_dates for a recurring row (read-first,
  // see the PATCH route), so `done` itself is only ever sent for a one-off.
  if (patch.completedDates !== undefined) body.completed_dates = patch.completedDates;
  if (typeof patch.done === 'boolean') {
    body.done = patch.done;
    body.completed_at = patch.done ? now : null;
  }
  // Parts: the new counts (riding with done:true when they tick the last part), or null for one whole task.
  if (patch.slices !== undefined) body.slices = patch.slices;
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

/** Soft delete: a tombstone via deleted_at + updated_at, matching the app's sync model. Only a live row
 *  (`deleted_at=is.null`): a repeated DELETE must not move the first removal's time, which the app reads for
 *  its undo window and to match a Combine's folded tasks. */
export function deleteRequest(env: ApiEnv, token: string, id: string, now: string): { url: string; init: RequestInit } {
  const q = new URLSearchParams({ id: `eq.${id}`, deleted_at: 'is.null' });
  return {
    url: `${tasksUrl(env)}?${q.toString()}`,
    init: { method: 'PATCH', headers: headers(env, token, true), body: JSON.stringify({ deleted_at: now, updated_at: now }) },
  };
}

// --- Linked steps and the finish walk (the rows and rules are steps.ts; these only address them) ---------------

/** ONE POST of several rows, so a breakdown's insert is atomic, returning them in the public shape's columns. */
export function insertRowsRequest(env: ApiEnv, token: string, rows: Row[]): { url: string; init: RequestInit } {
  return {
    url: `${tasksUrl(env)}?${new URLSearchParams({ select: SELECT }).toString()}`,
    init: { method: 'POST', headers: headers(env, token, true), body: JSON.stringify(rows) },
  };
}

/** One PATCH of a row by id with exactly the body given (the hiding write, a finish), never on a tombstone, pinned by
 *  `guard`, returning the row in the public shape's columns. */
export function rowPatchRequest(env: ApiEnv, token: string, id: string, body: Row, guard: Record<string, string>): { url: string; init: RequestInit } {
  const q = new URLSearchParams({ id: `eq.${id}`, deleted_at: 'is.null', select: SELECT, ...guard });
  return { url: `${tasksUrl(env)}?${q.toString()}`, init: { method: 'PATCH', headers: headers(env, token, true), body: JSON.stringify(body) } };
}

/** GET tasks with the given filters (the walk's reads, steps.ts walkParentQuery / walkChildrenQuery). */
export function readRowsRequest(env: ApiEnv, token: string, query: Record<string, string>): { url: string; init: RequestInit } {
  return { url: `${tasksUrl(env)}?${new URLSearchParams(query).toString()}`, init: { method: 'GET', headers: headers(env, token, false) } };
}

/** Tombstone exactly the rows a breakdown inserted, when the write that hides their big task missed. */
export function tombstoneRowsRequest(env: ApiEnv, token: string, ids: string[], now: string): { url: string; init: RequestInit } {
  return {
    url: `${tasksUrl(env)}?${new URLSearchParams(insertedRowsFilter(ids)).toString()}`,
    init: { method: 'PATCH', headers: headers(env, token, true), body: JSON.stringify({ deleted_at: now, updated_at: now }) },
  };
}

/** The walk over this surface's reads and writes. Every fetch is caught, because the step's own write has landed by
 *  the time this runs, and a throw must end the walk quietly rather than answer a 500 for a change that was made. */
function walkIo(env: ApiEnv, token: string): WalkIo {
  const rowsOf = async (query: Record<string, string>): Promise<WalkRow[] | null> => {
    const { url, init } = readRowsRequest(env, token, query);
    const res = await fetch(url, init);
    if (!res.ok) return null;
    const rows = (await res.json()) as unknown;
    return Array.isArray(rows) ? (rows.filter((r) => r !== null && typeof r === 'object') as WalkRow[]) : [];
  };
  return {
    async read(id) {
      try {
        const parents = await rowsOf(walkParentQuery(id));
        if (!parents) return null;
        const children = await rowsOf(walkChildrenQuery(id));
        if (!children) return null;
        return { parent: parents[0] ?? null, children };
      } catch {
        return null;
      }
    },
    async finish(id, body, guard) {
      try {
        const w = rowPatchRequest(env, token, id, body, guard);
        const res = await fetch(w.url, w.init);
        if (!res.ok) return null;
        const rows = (await res.json()) as unknown;
        return Array.isArray(rows) && rows[0] && typeof rows[0] === 'object' ? (rows[0] as WalkRow) : 'miss';
      } catch {
        return null;
      }
    },
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

export type CreateBody = { title: string; due: string | null; repeat: RepeatSpec | null; partsTotal?: number; steps?: StepSpec[] };
export type UpdateBody = {
  title?: string;
  done?: boolean;
  due?: string | null;
  repeat?: RepeatSpec | null;
  day?: string;
  partsTotal?: number | null;
  partsDone?: number;
};

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
  // steps: the big task is made together with its linked steps, hidden behind them, with no day of its own (the app
  // makes one from the capture box the same way). So no due, repeat or parts beside them.
  if (typeof o.steps !== 'undefined' && o.steps !== null) {
    if (due || repeat || (typeof o.partsTotal !== 'undefined' && o.partsTotal !== null)) {
      return { error: 'steps cannot come with due, repeat or partsTotal: the big task waits behind its steps (give a step its own due instead)' };
    }
    if (title.length > MAX_TITLE_CHARS) return { error: `title can be at most ${MAX_TITLE_CHARS} characters` };
    const parsed = parseSteps(o.steps);
    if ('error' in parsed) return { error: parsed.error };
    return { body: { title, due: null, repeat: null, steps: parsed.steps } };
  }
  // partsTotal: a one-off only, as the app's capture offers it. A due day is fine.
  if (typeof o.partsTotal !== 'undefined' && o.partsTotal !== null) {
    const partsTotal = wholeIn(o.partsTotal, MIN_PARTS, MAX_PARTS);
    if (partsTotal === null) return { error: `partsTotal must be a whole number from ${MIN_PARTS} to ${MAX_PARTS}` };
    if (repeat) return { error: 'a task tracked in parts cannot repeat: send partsTotal or repeat, not both' };
    return { body: { title, due, repeat, partsTotal } };
  }
  return { body: { title, due, repeat } };
}

/** Validate a PATCH body (any of title / done / due / repeat / partsTotal / partsDone). Returns the
 *  clean patch, or an { error }. due and repeat are mutually exclusive when both are non-null. Pass
 *  due:null to clear a date, repeat:null to stop repeating, partsTotal:null to make a task in parts
 *  one whole task. The repeat's internal correctness is validated later by cadence.buildRecurrence;
 *  here we shape-check and enforce the exclusivity. Only what the body alone can decide is a 400
 *  here; a clash with the task as it stands is the handler's 409 (planPatch). */
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
  // The day a repeat is ticked for (with `done`); a real calendar day, defaulting to the UTC day.
  if (typeof o.day !== 'undefined') {
    if (typeof o.day === 'string' && isValidIsoDay(o.day)) body.day = o.day;
    else return { error: 'day must be a real calendar day (YYYY-MM-DD)' };
  }
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
  if (typeof o.partsTotal !== 'undefined') {
    if (o.partsTotal === null) body.partsTotal = null;
    else {
      const partsTotal = wholeIn(o.partsTotal, MIN_PARTS, MAX_PARTS);
      if (partsTotal === null) return { error: `partsTotal must be a whole number from ${MIN_PARTS} to ${MAX_PARTS}, or null to make it one whole task` };
      body.partsTotal = partsTotal;
    }
  }
  if (typeof o.partsDone !== 'undefined') {
    const partsDone = wholeIn(o.partsDone, 0, MAX_PARTS);
    if (partsDone === null) return { error: `partsDone must be a whole number from 0 to ${MAX_PARTS}` };
    body.partsDone = partsDone;
  }
  // Setting a due day and a repeat in the same call is contradictory (they clear each other).
  if (body.due != null && body.repeat != null) return { error: 'a task can have a due date or a repeat, not both' };
  // One change of shape at a time: each of these can finish the task, and two at once have no single meaning.
  const shapes = [body.partsTotal, body.partsDone, body.done].filter((v) => v !== undefined).length;
  if (shapes > 1) return { error: 'send one of partsTotal, partsDone or done at a time' };
  if ((body.partsTotal !== undefined || body.partsDone !== undefined) && body.repeat != null) {
    return { error: 'a task tracked in parts cannot repeat: send parts or a repeat, not both' };
  }
  if (body.day !== undefined && body.done === undefined) return { error: 'day only makes sense with done' };
  if (Object.keys(body).length === 0) return { error: 'nothing to update: send title, done, due, repeat, partsTotal or partsDone' };
  return { body };
}

/** Validate a POST /tasks/{id}/steps body: `{ steps: [...] }` and nothing else (the big task is already on the list,
 *  so there is nothing to say about it here). The steps go through the one shared check, steps.ts parseSteps. */
export function parseStepsBody(raw: unknown): { steps: StepSpec[] } | { error: string } {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { error: 'a JSON object with steps is required' };
  const o = raw as Row;
  const extra = Object.keys(o).find((k) => k !== 'steps');
  if (extra !== undefined) return { error: `send only steps here (not "${extra}"): the task itself is changed with PATCH /tasks/{id}` };
  const parsed = parseSteps(o.steps);
  return 'error' in parsed ? { error: parsed.error } : { steps: parsed.steps };
}

/** Why a task on the list cannot be broken into steps (steps.ts stepsRefusal), as the 409's message. */
const STEPS_CONFLICTS: Record<'done' | 'repeats' | 'parts' | 'hidden', string> = {
  done: 'that task is already done',
  repeats: 'a repeating task cannot be broken into steps: add them as their own tasks, or send repeat: null first',
  parts: 'that task is tracked in parts: send partsTotal: null first, then break it down',
  hidden: 'that task is already waiting on its steps',
};

/** The rows an insert or a write returned, by id, so the reply lists them in the order they were written. */
function rowsById(rows: unknown): Map<string, Row> {
  const out = new Map<string, Row>();
  if (!Array.isArray(rows)) return out;
  for (const r of rows) if (r && typeof r === 'object' && typeof (r as Row).id === 'string') out.set((r as Row).id as string, r as Row);
  return out;
}

/** A fresh six-character random tail for an id. */
const randomTail = () => Math.random().toString(36).slice(2, 8);

/** What the handler's read-first PATCH resolves to: the changes and the guard to send, or the refusal. */
export type PatchPlan = { patch: UpdatePatch; guard: Record<string, string> } | { status: 400 | 409; error: string };

/** Decide a PATCH that needs the task as it stands (done, partsTotal, partsDone, or a new repeat), from the row
 *  read first and the changes already parsed (`base`: title, due, a translated recurrence). Pure.
 *
 *  409 is a clash with the task as it stands; a body that is wrong whatever the task looks like was already a 400
 *  in parseUpdate. The order mirrors MCP's (mcp.ts planDone / planParts):
 *  - A new repeat is refused on a task in parts, a task waiting on its steps (`silent_parent`), and a step.
 *  - `done` is refused on a task waiting on its steps. A REPEAT is ticked for one day. A task in parts: done:true
 *    FILLS every part, as Done in the app's Focus does, and done:false is refused, because parts only go forward
 *    (the sync merge keeps the highest count, so a lowered one springs back). A one-off closes with
 *    done=is.false, so closing it twice writes nothing, or reopens.
 *  - `partsTotal` sets the count (progress carries over, a count at or below what is ticked finishes it), refused
 *    on a task waiting on its steps, a repeating one and a done one. null makes it one whole task again.
 *  - `partsDone` is ABSOLUTE and forward-only: lower is a 409, above the total a 400, equal writes nothing, and
 *    on a task already done it writes nothing either (as MCP says "Already done.").
 *  Every parts write is pinned to the stored counts (steps.ts partsGuard). */
export function planPatch(row: Row, body: UpdateBody, base: UpdatePatch, todayIso: string): PatchPlan {
  const parts = cleanSlices(row.slices);
  const hidden = row.silent_parent === true;
  const isStep = typeof row.parent_id === 'string' && row.parent_id !== '';
  // Judged on the shape AFTER this patch, so {done:true, repeat:null} closes the one-off it makes (as MCP does),
  // and the shared classifier decides what "repeats" means.
  const repeatsAfter = body.repeat !== undefined ? body.repeat !== null : body.due != null ? false : asRecurrence(row.recurrence) != null;
  const patch: UpdatePatch = { ...base };
  let guard: Record<string, string> = {};
  const applyParts = (change: PartsChange) => {
    patch.slices = change.slices;
    if (change.complete) patch.done = true;
    guard = { ...partsGuard(row.slices), done: 'is.false' };
  };

  if (body.repeat != null) {
    if (parts) return { status: 409, error: 'a task tracked in parts cannot repeat: send partsTotal: null first' };
    if (hidden) return { status: 409, error: 'that task is waiting on its steps, so it cannot repeat' };
    if (isStep) return { status: 409, error: 'that task is a step toward a bigger task, so it cannot repeat' };
  }

  if (body.done !== undefined) {
    if (hidden) return { status: 409, error: 'that task is waiting on its steps: tick its steps instead' };
    if (repeatsAfter) patch.completedDates = tickForDay(row.completed_dates, body.day ?? todayIso, body.done).dates;
    else if (parts) {
      if (!body.done) return { status: 409, error: 'parts only go forward: step one back in the app' };
      if (row.done !== true) applyParts(advanceParts(parts, parts.total));
    } else if (!(body.done && row.done === true)) {
      patch.done = body.done;
      if (body.done) guard = { done: 'is.false' };
    }
  }

  if (body.partsTotal === null) {
    if (parts) patch.slices = null;
  } else if (body.partsTotal !== undefined) {
    if (hidden) return { status: 409, error: 'that task is waiting on its steps, so it cannot be tracked in parts' };
    if (repeatsAfter) return { status: 409, error: 'a repeating task cannot be tracked in parts: send repeat: null first' };
    if (row.done === true) return { status: 409, error: 'that task is already done' };
    const change = setTotal(parts, body.partsTotal);
    if (needsWrite(change, false)) applyParts(change);
  }

  if (body.partsDone !== undefined) {
    if (repeatsAfter) return { status: 409, error: 'a repeating task is ticked by the day, not in parts' };
    if (!parts) return { status: 409, error: 'that task is not tracked in parts: send partsTotal first' };
    if (body.partsDone > parts.total) return { status: 400, error: `partsDone can be at most partsTotal (${parts.total})` };
    if (body.partsDone < parts.done) return { status: 409, error: 'parts only go forward: step one back in the app' };
    if (row.done !== true) {
      const change = advanceParts(parts, body.partsDone);
      if (needsWrite(change, false)) applyParts(change);
    }
  }

  return { patch, guard };
}

/** Whether a resolved patch changes anything, so a PATCH that resolves to nothing answers without writing. */
function patchWrites(p: UpdatePatch): boolean {
  return (
    typeof p.title === 'string' ||
    p.due !== undefined ||
    p.recurrence !== undefined ||
    p.completedDates !== undefined ||
    typeof p.done === 'boolean' ||
    p.slices !== undefined
  );
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

/** What an integrator needs to hear when the token is refused: the fix, not "upstream error". */
const TOKEN_EXPIRED = 'unauthorized: token expired or invalid. Re-copy it from DoubleDone Settings → AI agent access (MCP) → Copy my token';

/** A data call that came back not-ok. PostgREST's 401/403 means the token expired or was refused in the
 *  narrow window after verification, and that is the 401 the contract promises, never a 502 that reads as
 *  an outage. Everything else is the upstream 502. */
function upstream(res: Response): Response {
  if (res.status === 401 || res.status === 403) return json({ error: TOKEN_EXPIRED }, 401);
  return json({ error: 'upstream error' }, 502);
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
    if (!res.ok) return upstream(res);
    const rows = (await res.json()) as unknown;
    return json({ tasks: searchTasks(rows, q) });
  }

  if (upcoming !== null) {
    const { count, endIso } = upcomingWindow(upcoming, todayIso);
    const { url, init } = upcomingRequest(env, token, todayIso, endIso);
    const res = await fetch(url, init);
    if (!res.ok) return upstream(res);
    const rows = (await res.json()) as unknown;
    return json({ tasks: upcomingTasks(rows, todayIso, count) });
  }

  const { url, init } = listRequest(env, token, { today, todayIso });
  const res = await fetch(url, init);
  if (!res.ok) return upstream(res);
  const rows = (await res.json()) as unknown;
  return json({ tasks: Array.isArray(rows) ? rows.map((r) => toApiTask(r as Row)) : [] });
}

/** POST /tasks with `steps`: the big task and its linked steps in ONE insert, so it is atomic (steps.ts
 *  buildStepRows, the rows MCP add_steps writes). 201 `{ task, steps }`, the steps in the order given. */
async function createWithSteps(env: ApiEnv, token: string, sub: string, title: string, steps: StepSpec[], now: string): Promise<Response> {
  const nowMs = Date.parse(now);
  const ids = stepIds(newTaskId(nowMs, randomTail()), steps.length);
  const rows = buildStepRows({ userId: sub, nowMs, parent: { id: ids.parent, title }, stepIds: ids.steps, steps, withParent: true });
  const { url, init } = insertRowsRequest(env, token, rows);
  const res = await fetch(url, init);
  if (!res.ok) return upstream(res);
  const byId = rowsById(await res.json());
  const task = byId.get(ids.parent);
  if (!task) return json({ error: 'create failed' }, 502);
  return json({ task: toApiTask(task), steps: ids.steps.flatMap((sid) => (byId.has(sid) ? [toApiTask(byId.get(sid) as Row)] : [])) }, 201);
}

/** POST /tasks/{id}/steps: break a task already on the list into linked steps, as MCP add_steps does. Read it (404
 *  if missing, 409 if it is done, repeats, is tracked in parts or is already hidden), insert the steps, and only then
 *  hide it, by a write pinned to the task as it was read. If that write misses or fails, the steps just inserted are
 *  tombstoned again (steps beside a task that is not hidden would never close it) and the answer is a 409 or the
 *  upstream error, with nothing added; if even that fails, a 502 that says some steps may have landed. */
async function addStepsToTask(env: ApiEnv, token: string, sub: string, id: string, steps: StepSpec[], now: string): Promise<Response> {
  const st = getRequest(env, token, id);
  const sr = await fetch(st.url, st.init);
  if (!sr.ok) return upstream(sr);
  const srows = (await sr.json()) as unknown;
  const row = Array.isArray(srows) && srows[0] && typeof srows[0] === 'object' ? (srows[0] as Row) : null;
  if (!row) return json({ error: 'not found' }, 404);
  const refusal = stepsRefusal(row);
  if (refusal) return json({ error: STEPS_CONFLICTS[refusal] }, 409);
  const nowMs = Date.parse(now);
  const ids = stepIds(newTaskId(nowMs, randomTail()), steps.length);
  const title = typeof row.title === 'string' ? row.title : null;
  const rows = buildStepRows({ userId: sub, nowMs, parent: { id, title }, stepIds: ids.steps, steps, withParent: false });
  const ins = insertRowsRequest(env, token, rows);
  const res = await fetch(ins.url, ins.init);
  if (!res.ok) return upstream(res);
  const inserted = rowsById(await res.json());
  const flip = rowPatchRequest(env, token, id, { ...hidePatch(steps), updated_at: now }, hideGuard(row));
  let flipRes: Response | null = null;
  let hidden: Row | null = null;
  try {
    flipRes = await fetch(flip.url, flip.init);
    if (flipRes.ok) {
      const flipped = (await flipRes.json()) as unknown;
      hidden = Array.isArray(flipped) && flipped[0] && typeof flipped[0] === 'object' ? (flipped[0] as Row) : null;
    }
  } catch {
    flipRes = null;
  }
  if (hidden) {
    const out = ids.steps.flatMap((sid) => (inserted.has(sid) ? [toApiTask(inserted.get(sid) as Row)] : []));
    return json({ task: toApiTask(hidden), steps: out }, 201);
  }
  let undone = false;
  try {
    const undo = tombstoneRowsRequest(env, token, ids.steps, now);
    undone = (await fetch(undo.url, undo.init)).ok;
  } catch {
    undone = false;
  }
  if (!undone) return json({ error: 'the task changed just now, and some of its steps may have landed on their own: list your tasks and remove any you do not want' }, 502);
  if (flipRes && flipRes.ok) return json({ error: 'the task changed just now, so nothing was added: read it again and retry' }, 409);
  return flipRes ? upstream(flipRes) : json({ error: 'upstream error' }, 502);
}

/** Route + serve the `/api/v1/*` task surface. index.ts forwards every `/api/` request here. Everything
 *  inside answers calmly; whatever still throws (a fetch that rejects, a body that lies about its type) is
 *  a JSON 500 WITH CORS here, never a raw Cloudflare 1101 page, which also drops the CORS headers and reads
 *  as a network failure to a browser integrator. */
export async function handleApi(request: Request, env: ApiEnv, verifySub: SubVerifier = defaultVerifySub): Promise<Response> {
  try {
    return await handleApiInner(request, env, verifySub);
  } catch (e) {
    // Method, path and message only: never the body or the token. The calm 500 the integrator sees and the
    // line the operator needs (wrangler tail) both exist; a bare catch would have hidden the fault entirely.
    console.error('[api]', request.method, new URL(request.url).pathname, e instanceof Error ? e.message : String(e));
    return json({ error: 'something went wrong on our side. Try again in a moment.' }, 500);
  }
}

async function handleApiInner(request: Request, env: ApiEnv, verifySub: SubVerifier): Promise<Response> {
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
  if (!token) return json({ error: 'unauthorized: send a Bearer token (DoubleDone Settings → AI agent access (MCP) → Copy my token)' }, 401);
  // VERIFIED before any call. RLS already keeps the data honest, but a decode-only path answered an expired
  // or forged token with a 502 "upstream error" and let a hand-made sub reach the create path (2026-09-25
  // audit). Now an expired token is the 401 the contract promises, before Supabase is even asked.
  const sub = await verifySub(token, env.SUPABASE_URL);
  if (!sub) return json({ error: TOKEN_EXPIRED }, 401);

  // Collection: /tasks
  if (path === '/tasks') {
    if (request.method === 'GET') return handleListTasks(request, env, token);
    if (request.method === 'POST') {
      let raw: unknown;
      try {
        raw = await request.json();
      } catch {
        return json({ error: 'invalid JSON body' }, 400);
      }
      const parsed = parseCreate(raw);
      if ('error' in parsed) return json({ error: parsed.error }, 400);
      const now = new Date().toISOString();
      if (parsed.body.steps) return createWithSteps(env, token, sub, parsed.body.title, parsed.body.steps, now);
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
      const slices = parsed.body.partsTotal !== undefined ? { total: parsed.body.partsTotal, done: 0 } : null;
      const { url, init } = createRequest(env, token, { id, userId: sub, title: parsed.body.title, due: parsed.body.due, recurrence, slices, now });
      const res = await fetch(url, init);
      if (!res.ok) return upstream(res);
      const rows = (await res.json()) as unknown;
      const created = Array.isArray(rows) && rows[0] ? toApiTask(rows[0] as Row) : null;
      return created ? json({ task: created }, 201) : json({ error: 'create failed' }, 502);
    }
    return json({ error: 'method not allowed' }, 405);
  }

  // Steps for a task already on the list: /tasks/{id}/steps
  const stepsMatch = path.match(/^\/tasks\/([^/]+)\/steps$/);
  if (stepsMatch) {
    if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405);
    let id: string;
    try {
      id = decodeURIComponent(stepsMatch[1]);
    } catch {
      return json({ error: 'invalid task id' }, 400);
    }
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return json({ error: 'invalid JSON body' }, 400);
    }
    const parsed = parseStepsBody(raw);
    if ('error' in parsed) return json({ error: parsed.error }, 400);
    return addStepsToTask(env, token, sub, id, parsed.steps, new Date().toISOString());
  }

  // Item: /tasks/{id}
  const match = path.match(/^\/tasks\/([^/]+)$/);
  if (match) {
    // A percent-encoded id that does not decode used to throw here and surface as Cloudflare's raw
    // text 1101 page with no CORS headers (audit PR C). A bad id is a calm 400 like every other bad input.
    let id: string;
    try {
      id = decodeURIComponent(match[1]);
    } catch {
      return json({ error: 'invalid task id' }, 400);
    }
    if (request.method === 'GET') {
      const { url, init } = getRequest(env, token, id);
      const res = await fetch(url, init);
      if (!res.ok) return upstream(res);
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
      const b = parsed.body;
      const now = new Date().toISOString();
      // Translate a set-repeat through the shared cadence builder; a malformed repeat is a calm
      // 400, before any read. `repeat: null` (clear) stays null and reaches updateRequest as recurrence: null.
      let patch: UpdatePatch = { title: b.title, due: b.due };
      if (typeof b.repeat !== 'undefined') {
        if (b.repeat === null) patch.recurrence = null;
        else {
          const recurrence = buildRecurrence(b.repeat, now.slice(0, 10));
          if (!recurrence) {
            return json({ error: "couldn't read that repeat: use daily, weekly (with weekdays 0-6), or every_n_days (with days), or null to stop it" }, 400);
          }
          patch.recurrence = recurrence;
        }
      }
      // READ-FIRST whenever the answer depends on the task as it stands: a done-write (a repeating task is
      // ticked for today in completed_dates, the same field the app writes, and its series stays open; setting
      // done=true on a series row made the repeat vanish from every agent read, audit PR B), any parts change,
      // and a new repeat (refused on a shape that cannot repeat). Then ONE guarded PATCH, or none.
      let guard: Record<string, string> = {};
      let srow: Row | null = null;
      if (b.done !== undefined || b.partsTotal !== undefined || b.partsDone !== undefined || b.repeat != null) {
        const st = getRequest(env, token, id);
        const sr = await fetch(st.url, st.init);
        if (!sr.ok) return upstream(sr);
        const srows = (await sr.json()) as unknown;
        srow = Array.isArray(srows) && srows[0] && typeof srows[0] === 'object' ? (srows[0] as Row) : null;
        if (!srow) return json({ error: 'not found' }, 404);
        const plan = planPatch(srow, b, patch, todayIsoUtc());
        if ('error' in plan) return json({ error: plan.error }, plan.status);
        // Nothing to change (closing a task already done, a partsDone it already has): the task as it stands,
        // with no write, so a retry is harmless and never re-stamps completedAt.
        if (!patchWrites(plan.patch)) return json({ task: toApiTask(srow) });
        patch = plan.patch;
        guard = plan.guard;
      }
      const { url, init } = updateRequest(env, token, id, patch, now, guard);
      const res = await fetch(url, init);
      if (!res.ok) return upstream(res);
      const rows = (await res.json()) as unknown;
      const task = Array.isArray(rows) && rows[0] ? toApiTask(rows[0] as Row) : null;
      // A write that closed a STEP walks up to its big task, dated to this close, and the answer names every big
      // task that finished, topmost last. A case the walk leaves (it only finishes when certain) is the app's.
      if (task && patch.done === true && srow && typeof srow.parent_id === 'string' && srow.parent_id) {
        const parentTitle = typeof srow.parent_title === 'string' && srow.parent_title ? srow.parent_title : null;
        const walked = await planFinish(walkIo(env, token), { parentId: srow.parent_id, parentTitle, completedAt: now }, b.day ?? todayIsoUtc(), now);
        if (walked.finished.length > 0) return json({ task, finished: walked.finished.map((f) => toApiTask(f.row as Row)) });
      }
      if (task) return json({ task });
      // A guarded write that matched nothing after the read found the row: it changed in between (a tick on a
      // phone, a resize). A 409, so the integrator reads it again, rather than a 404 for a task that exists.
      if (Object.keys(guard).length > 0) return json({ error: 'the task changed just now: read it again and retry' }, 409);
      return json({ error: 'not found' }, 404);
    }
    if (request.method === 'DELETE') {
      const { url, init } = deleteRequest(env, token, id, new Date().toISOString());
      const res = await fetch(url, init);
      if (!res.ok) return upstream(res);
      return new Response(null, { status: 204, headers: API_CORS });
    }
    return json({ error: 'method not allowed' }, 405);
  }

  return json({ error: 'not found' }, 404);
}
