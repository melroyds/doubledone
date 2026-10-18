// A small, stateless MCP server for DoubleDone tasks, so an AI agent (Claude
// Desktop, ChatGPT, the MCP Inspector, etc.) can capture, look ahead over, manage
// and break down the user's tasks. It speaks the MCP Streamable-HTTP transport in
// JSON mode (JSON-RPC 2.0 over a single POST). Auth is a bearer token the user
// pastes into their MCP client: their Supabase access token, VERIFIED (verify.ts)
// before any tool runs. Every DATA tool call proxies to the Supabase REST API WITH
// that token, so row-level security scopes it to exactly their own rows; this
// server holds no elevated key. Inside this handler discovery (initialize /
// tools/list) needs no auth, but the ROUTE in index.ts answers 401 to any request
// with no bearer at all (that 401 is what starts the OAuth flow), so a client must
// send the header even to discover.
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
// and adds nothing; the human says yes; the agent then calls add_steps with the steps
// they agreed, which writes them LINKED, exactly as the app's Break it down does (the
// big task hidden behind them, closing itself when the last one is ticked). No tool
// shames a backlog, punishes an old task, or deletes anything for real (delete is a
// soft tombstone, exactly like the app).
//
// A task tracked in parts (the app's "Track in steps", the `slices` column) moves forward
// one part per tick, as one tap in the app does, and never goes back: the sync merge keeps
// the highest count it has seen, so a lowered one would spring straight back. Ticking a
// step walks up to its big task and finishes it when the answer is certain, and leaves
// every other case to the app's own repair. The parts arithmetic, the step rows and the
// finish walk live in steps.ts, shared with the REST API.
//
// Pure helpers (the tool schemas, the JWT decode, the Supabase request builders, the
// row->list mappers, the OpenAI deep-research shapers) are exported and unit-tested;
// handleMcp does the I/O.

import { asRecurrence, buildRecurrence, isDueOn, isValidIsoDay, recurringDueToday, tickForDay, type Recurrence, type RepeatSpec } from './cadence';
import {
  buildDecomposeRequest,
  DECOMPOSE_MODEL,
  type DecomposeContext,
  parseDecomposeResponse,
  type Step,
} from './decompose';
import {
  advanceParts,
  buildStepRows,
  clearParts,
  cleanSlices,
  hideGuard,
  hidePatch,
  insertedRowsFilter,
  MAX_PARTS,
  MAX_STEP_MINUTES,
  MAX_STEPS,
  MAX_TITLE_CHARS,
  MIN_PARTS,
  MIN_STEPS,
  needsWrite,
  parseSteps,
  partsGuard,
  partsPatch,
  type PartsChange,
  planFinish,
  setTotal,
  type Slices,
  stepIds,
  type StepSpec,
  stepsRefusal,
  type WalkIo,
  type WalkOutcome,
  type WalkRow,
  walkChildrenQuery,
  walkParentQuery,
  wholeIn,
} from './steps';
import { logAiCall, type TelemetryEnv } from './telemetry';
import { defaultVerifySub, type SubVerifier } from './verify';

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
  // The same per-IP limiter the app's AI routes use, applied to break_down on the pasted-token path (one
  // device per IP there; the OAuth path's callers are shared connector hosts, so it stays on the verified
  // per-user cap alone). Optional so tests inject a stub.
  AI_LIMITER?: { limit(options: { key: string }): Promise<{ success: boolean }> };
};

export const MCP_PROTOCOL_VERSION = '2025-06-18';
export const SERVER_INFO = { name: 'doubledone', version: '1.1.0' };

// The `repeat` object schema shared by add_task and update_task (JSON Schema). Kept as one
// const so the two tools describe recurrence identically to an agent. Mirrors RepeatSpec /
// the client's CaptureSchedule vocabulary.
const REPEAT_SCHEMA = {
  type: 'object',
  description: 'Make the task repeat. Mutually exclusive with `due`.',
  properties: {
    kind: { type: 'string', enum: ['daily', 'weekly', 'every_n_days', 'monthly'], description: 'How it repeats.' },
    weekdays: {
      type: 'array',
      items: { type: 'integer', minimum: 0, maximum: 6 },
      description: 'For weekly: the days, 0=Sun .. 6=Sat. Required when kind is weekly.',
    },
    days: { type: 'integer', minimum: 1, description: 'For every_n_days: the interval in days. Required when kind is every_n_days.' },
    day: {
      type: 'integer',
      minimum: 1,
      maximum: 31,
      description:
        'For monthly: the day of the month, 1-31. Optional; defaults to the day the task is created on. A month with no such day uses its last day (the 31st is the 28th in February), so a monthly task is never skipped.',
    },
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
      "Add a task to the user's DoubleDone. By default it lands on today. Optionally schedule it for a future day (`due`) OR make it repeat (`repeat`), never both, and optionally track it in `parts`. The reply ends with the new task's id in square brackets.",
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'The task title.' },
        due: { type: 'string', description: "Optional 'YYYY-MM-DD' for a one-off on a future day. Mutually exclusive with `repeat`." },
        repeat: REPEAT_SCHEMA,
        parts: {
          type: 'integer',
          minimum: MIN_PARTS,
          maximum: MAX_PARTS,
          description:
            "Optional: track it in parts, the app's 'Track in steps' (e.g. 10 for a ten-episode series). Each complete_task ticks one part, and it is done when every part is. For one thing done in several goes. Not with `repeat`. For a task made of DIFFERENT steps, use add_steps instead.",
        },
      },
      required: ['title'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_today',
    description:
      "List the user's open tasks for today: one-offs undated or due today or earlier, plus any repeating task due today not yet ticked or skipped, marked '(repeats)'. A task tracked in parts shows its progress, marked e.g. '(3/10 parts)'. A step of a bigger task is marked '(toward \"X\")', or '(a step)' when the big task's name is not known: ticking the last step closes X. The big task itself is not listed while it waits on its steps. Today is the UTC calendar day for now, so early in an Australian morning it can still be yesterday's. Returns each task's id for complete_task.",
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'list_upcoming',
    description:
      "Look ahead: the user's future-dated tasks and the next occurrence of each repeating task, within a window (default 7 days). A task tracked in parts shows its progress, e.g. '(3/10 parts)', and a step of a bigger task is marked '(toward \"X\")' or '(a step)'. Read-only.",
    inputSchema: {
      type: 'object',
      properties: { days: { type: 'integer', minimum: 1, maximum: 30, description: 'How many days ahead to look (1-30, default 7).' } },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'complete_task',
    description:
      "Tick one of the user's tasks, by the id from list_today. A one-off closes. A REPEATING task (marked '(repeats)' in list_today) is ticked for ONE day and comes back on its next day; completing never closes a repeat (to stop one, update_task with repeat: null). A task TRACKED IN PARTS (marked e.g. '(3/10 parts)') moves forward ONE part, as one tap in the app does. Pass `count` to tick more, and the remaining count finishes it. A STEP (marked '(toward \"X\")') closes, and when it is the last open step, \"X\" closes as done too and the reply says so. The big task itself is not listed and can't be ticked directly: tick its steps. The day defaults to the UTC calendar day; pass `day` with the user's local date when you know it.",
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The task id from list_today.' },
        day: { type: 'string', description: "Optional 'YYYY-MM-DD': the day to tick a repeating task for (the user's local date). Defaults to the UTC day. Ignored for a one-off." },
        count: {
          type: 'integer',
          minimum: 1,
          maximum: MAX_PARTS,
          description: 'For a task tracked in parts: how many parts to tick (default 1). Ignored for other tasks.',
        },
      },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'update_task',
    description:
      "Change one of the user's tasks: its title, its `due` day, its `repeat`, its `parts`, or `done`. Setting `due` clears any repeat and vice versa. Pass null to clear a field. `done: true` ticks it exactly as complete_task does (a repeating task is ticked for one day, never closed; a task tracked in parts moves forward ONE part; the last step of a bigger task closes the big task too); `done: false` reopens a one-off or a step (never the big task it closed), or un-ticks a day on a repeat on the server only (a device that already synced the tick brings it back). Parts only go forward, so `done: false` on a task tracked in parts is refused. Change `parts` or `done`, one at a time. The day defaults to the UTC calendar day; pass `day` with the user's local date when you know it. At least one change is required.",
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The task id (from list_today or list_upcoming).' },
        title: { type: 'string', description: 'A new title.' },
        due: { type: ['string', 'null'], description: "'YYYY-MM-DD' to schedule it, or null to clear the date. Clears any repeat." },
        repeat: { anyOf: [REPEAT_SCHEMA, { type: 'null' }], description: 'A repeat object to make it recur, or null to stop it recurring. Clears any due date.' },
        parts: {
          type: ['integer', 'null'],
          minimum: MIN_PARTS,
          maximum: MAX_PARTS,
          description:
            'Track this one-off in parts (2-50). Progress so far carries over, and a count at or below the parts already done finishes it. null makes it one whole task again. Not for a repeating task, or one waiting on its steps.',
        },
        done: { type: 'boolean', description: 'true ticks it (a repeating task is ticked for one day, never closed; a task tracked in parts moves forward one part); false reopens a one-off, or un-ticks a day on a repeat (server only: a device that already synced the tick brings it back). false is refused on a task tracked in parts.' },
        day: { type: 'string', description: "Optional 'YYYY-MM-DD' for `done` on a repeating task: the day to tick or un-tick (the user's local date). Defaults to the UTC day." },
      },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'delete_task',
    description:
      "Remove one of the user's tasks. It is tombstoned (recoverable), never hard-deleted. A task waiting on its steps (one broken down with add_steps) is not removed on its own: remove its steps first, and the app brings it back to the list.",
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
      "Break a dreaded or vague task into small, ordered, time-boxed steps. This ONLY proposes the steps and adds nothing. Show them to the user, let them change any, and once they say yes call add_steps with the steps they agreed (not add_task), so the steps stay linked and the big task closes itself when the last one is done. Costs a little AI time, so use it when a task genuinely needs breaking down.",
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
    // It changes nothing of the user's: the one write it makes is the anonymous AI-call log.
    annotations: { readOnlyHint: true },
  },
  {
    name: 'add_steps',
    description:
      "Break one of the user's tasks into linked steps, the way the app's \"Break it down\" does. The big task is tucked away out of the list, and its steps go on today, or on the days you give them. When the user ticks the LAST step, here or in the app, the big task closes itself as done. Call this ONLY after the user has said yes to these exact steps: steps from break_down as they edited them, or steps they dictated. Pass `task_id` to break down a task already on their list, or `title` to create the big task together with its steps. Use 2 to 20 steps, in the order they will be done. Do NOT also call add_task for these steps. Not for a repeating task, or for one tracked in parts.",
    inputSchema: {
      type: 'object',
      properties: {
        task_id: {
          type: 'string',
          description: 'The id of a task already on the list (from list_today, list_upcoming or search) to break down. Give this OR `title`.',
        },
        title: { type: 'string', description: 'The big task to create together with its steps, when it is not on the list yet. Give this OR `task_id`.' },
        steps: {
          type: 'array',
          minItems: MIN_STEPS,
          maxItems: MAX_STEPS,
          description: 'The steps the user agreed, in the order they will be done.',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string', description: 'The step, e.g. "Bag up the rubbish".' },
              minutes: {
                type: 'integer',
                minimum: 1,
                maximum: MAX_STEP_MINUTES,
                description: "Optional estimate in minutes, shown after the title as '(5 min)'.",
              },
              due: { type: 'string', description: "Optional 'YYYY-MM-DD' for a step on a later day. Without it the step is on today." },
            },
            required: ['title'],
            additionalProperties: false,
          },
        },
      },
      required: ['steps'],
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
    annotations: { readOnlyHint: true },
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
    annotations: { readOnlyHint: true },
  },
] as const;
// The writers carry no annotations on purpose: the protocol's defaults (readOnlyHint false, destructiveHint true)
// are already the cautious signal, and an explicit false would add nothing.

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

/** The `sub` (user uuid) from a Supabase access-token JWT, or null, WITHOUT checking the signature.
 *  Never use this to decide who is asking: handleMcp verifies the token (verify.ts) before any tool
 *  runs and hands the trusted sub down. This stays for the email helper below and for tests. */
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
  t: { id: string; userId: string; title: string; now: string; due?: string | null; recurrence?: Recurrence | null; slices?: Slices | null },
): { url: string; init: RequestInit } {
  // due, recurrence and slices are OPTIONAL and additive: an add with none is byte-for-byte the
  // original row. When present they are written into the same columns the app / sync use, so
  // an agent-made dated, repeating or in-parts task is indistinguishable from an app-made one.
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
  if (t.slices != null) row.slices = t.slices;
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
  // slices comes back so a task tracked in parts can show its progress, and parent_id /
  // parent_title so a step can name the big task it closes.
  const q = new URLSearchParams({
    select: 'id,title,recurrence,completed_dates,skipped_dates,due,slices,parent_id,parent_title',
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
 *  can't express). Order is preserved (the query sorts by created_at). A one-off tracked in
 *  parts carries its cleaned counts so the line can show them, and a step carries the title
 *  of the big task it closes. Pure + unit-tested. */
export function listTodayFromRows(rows: unknown, todayIso: string): ListEntry[] {
  if (!Array.isArray(rows)) return [];
  const out: ListEntry[] = [];
  for (const r of rows) {
    if (r == null || typeof r !== 'object') continue;
    const row = r as ListRow;
    if (typeof row.id !== 'string' || typeof row.title !== 'string') continue;
    if (row.recurrence == null) {
      out.push({ id: row.id, title: row.title, ...partsOf(row.slices), ...towardOf(row) }); // an open one-off, already scoped by the SQL
    } else if (recurringDueToday(row.recurrence, row.completed_dates, row.skipped_dates, todayIso)) {
      out.push({ id: row.id, title: row.title, repeats: true, ...towardOf(row) }); // so the model knows a tick is for today only
    }
  }
  return out;
}

/** One row as the list reads return it. */
type ListRow = {
  id?: unknown;
  title?: unknown;
  recurrence?: unknown;
  completed_dates?: unknown;
  skipped_dates?: unknown;
  due?: unknown;
  slices?: unknown;
  parent_id?: unknown;
  parent_title?: unknown;
};

/** One line of list_today: the task, and the markers its line carries. `toward` is the big task's title for a step,
 *  or null for a step whose big task's title is not known (rows from builds before 2026-10-04 never sent it). */
export type ListEntry = { id: string; title: string; repeats?: true; parts?: Slices; toward?: string | null };

/** `{ parts }` for a stored value that is well-formed parts, else nothing, so a whole task's entry keeps its
 *  old shape. Only one-offs call it: a repeat is ticked by the day, so parts on one would mislead the model. */
function partsOf(slices: unknown): { parts?: Slices } {
  const parts = cleanSlices(slices);
  return parts ? { parts } : {};
}

/** `{ toward }` for a step of a bigger task, else nothing. A step of a breakdown and a made-tiny task's pebble both
 *  carry `parent_id`, and nothing on the row tells them apart without reading the parent, so the one wording,
 *  "toward", is true of both. */
function towardOf(row: ListRow): { toward?: string | null } {
  if (typeof row.parent_id !== 'string' || !row.parent_id) return {};
  return { toward: typeof row.parent_title === 'string' && row.parent_title ? row.parent_title : null };
}

/** The progress marker on a list line, e.g. "  (3/10 parts)", or nothing for a whole task. */
function partsMark(parts?: Slices): string {
  return parts ? `  (${parts.done}/${parts.total} parts)` : '';
}

/** The step marker on a list line, `  (toward "Clear the garage")`, or `  (a step)` when the big task's title is
 *  not known, or nothing for a task that is not a step. */
function towardMark(toward?: string | null): string {
  if (toward === undefined) return '';
  return toward === null ? '  (a step)' : `  (toward "${toward}")`;
}

/** The one read a done-write, a parts change or a breakdown needs first: whether the row repeats and which days are
 *  ticked, whether it is done, its stored parts, whether it is hidden behind its steps, and whether it is itself a
 *  step (and of which big task, so a tick can walk up to it). */
export function taskStateRequest(env: McpEnv, token: string, id: string): { url: string; init: RequestInit } {
  const q = new URLSearchParams({
    select: 'id,title,done,recurrence,completed_dates,slices,silent_parent,parent_id,parent_title',
    id: `eq.${id}`,
    deleted_at: 'is.null',
    limit: '1',
  });
  return { url: `${env.SUPABASE_URL}/rest/v1/tasks?${q.toString()}`, init: { method: 'GET', headers: supaHeaders(env, token, false) } };
}

/** ONE PATCH of a row by id, the write behind every read-first change (a tick, a close, a reopen, a parts change,
 *  and any field change riding with them). Always `deleted_at=is.null`, so a tombstone is never revived, plus
 *  whatever the plan pins: `done=is.false` so a second close never re-stamps completed_at (which would move the
 *  task in the Lookback), and the stored parts (steps.ts partsGuard) so a concurrent tick or resize is never
 *  reverted. The body carries updated_at; the caller stamps it. */
export function patchRowRequest(
  env: McpEnv,
  token: string,
  id: string,
  body: Record<string, unknown>,
  guard: Record<string, string> = {},
): { url: string; init: RequestInit } {
  const q = new URLSearchParams({ id: `eq.${id}`, deleted_at: 'is.null', ...guard });
  return {
    url: `${env.SUPABASE_URL}/rest/v1/tasks?${q.toString()}`,
    init: { method: 'PATCH', headers: supaHeaders(env, token, true), body: JSON.stringify(body) },
  };
}

/** The columns a change of title / due / recurrence sets. A due<->repeat switch is explicit: setting `due` also
 *  nulls `recurrence`, and setting `recurrence` also nulls `due`, so a task is never both at once. Only the keys
 *  present in `fields` are set (a PATCH), so an unspecified field is untouched. */
export function fieldPatch(fields: { title?: string; due?: string | null; recurrence?: Recurrence | null }): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (fields.title !== undefined) patch.title = fields.title;
  if (fields.due !== undefined) {
    patch.due = fields.due; // string schedules it, null clears it
    if (fields.due != null) patch.recurrence = null; // scheduling a one-off day stops any repeat
  }
  if (fields.recurrence !== undefined) {
    patch.recurrence = fields.recurrence; // an object makes it repeat, null stops it
    if (fields.recurrence != null) patch.due = null; // a repeat has no single due day
  }
  return patch;
}

/** PATCH a task's mutable fields (title / due / recurrence, see fieldPatch), ALWAYS bumping updated_at so the
 *  change wins last-write-wins sync (schema.sql: there is deliberately no now() trigger; the writer is
 *  authoritative). The plain path, with no read first: a change that needs the row (parts, done, a new repeat)
 *  goes through patchRowRequest instead. Never on a tombstone (`deleted_at=is.null`), as every other write here:
 *  a removed task renamed by an agent used to answer "Updated." for a task nobody could see. */
export function updateTaskRequest(
  env: McpEnv,
  token: string,
  id: string,
  fields: { title?: string; due?: string | null; recurrence?: Recurrence | null },
  now: string,
): { url: string; init: RequestInit } {
  const q = new URLSearchParams({ id: `eq.${id}`, deleted_at: 'is.null' });
  const patch: Record<string, unknown> = { updated_at: now, ...fieldPatch(fields) };
  return {
    url: `${env.SUPABASE_URL}/rest/v1/tasks?${q.toString()}`,
    init: { method: 'PATCH', headers: supaHeaders(env, token, true), body: JSON.stringify(patch) },
  };
}

/** SOFT-delete: set the deleted_at tombstone (and bump updated_at), exactly like the app. The
 *  client hides tombstoned rows and the tombstone syncs; nothing is ever hard-deleted here. Only a
 *  live row (`deleted_at=is.null`): a second removal must not move the first one's time, which the
 *  app reads for its undo window and to match a Combine's folded tasks. `guard` pins it further to
 *  the row as read (delete_task: still not waiting on its steps). */
export function deleteTaskRequest(
  env: McpEnv,
  token: string,
  id: string,
  now: string,
  guard: Record<string, string> = {},
): { url: string; init: RequestInit } {
  const q = new URLSearchParams({ id: `eq.${id}`, deleted_at: 'is.null', ...guard });
  return {
    url: `${env.SUPABASE_URL}/rest/v1/tasks?${q.toString()}`,
    init: {
      method: 'PATCH',
      headers: supaHeaders(env, token, true),
      body: JSON.stringify({ deleted_at: now, updated_at: now }),
    },
  };
}

// --- add_steps and the finish walk (the rows and rules are steps.ts; these only address them) -----------------

/** GET tasks with the given filters (the walk's reads, steps.ts walkParentQuery / walkChildrenQuery). */
export function readRowsRequest(env: McpEnv, token: string, query: Record<string, string>): { url: string; init: RequestInit } {
  return {
    url: `${env.SUPABASE_URL}/rest/v1/tasks?${new URLSearchParams(query).toString()}`,
    init: { method: 'GET', headers: supaHeaders(env, token, false) },
  };
}

/** ONE POST of several rows, so the insert is atomic (steps.ts buildStepRows gives them one key set). */
export function insertRowsRequest(env: McpEnv, token: string, rows: Record<string, unknown>[]): { url: string; init: RequestInit } {
  return {
    url: `${env.SUPABASE_URL}/rest/v1/tasks`,
    init: { method: 'POST', headers: supaHeaders(env, token, true), body: JSON.stringify(rows) },
  };
}

/** Tombstone exactly the rows a breakdown inserted, when the write that hides their big task missed. */
export function tombstoneRowsRequest(env: McpEnv, token: string, ids: string[], now: string): { url: string; init: RequestInit } {
  return {
    url: `${env.SUPABASE_URL}/rest/v1/tasks?${new URLSearchParams(insertedRowsFilter(ids)).toString()}`,
    init: { method: 'PATCH', headers: supaHeaders(env, token, true), body: JSON.stringify({ deleted_at: now, updated_at: now }) },
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
    select: 'id,title,recurrence,completed_dates,skipped_dates,due,slices,parent_id,parent_title',
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
 *  on (a repeat that's done for its next hit shows the one after). A one-off tracked in parts
 *  carries its cleaned counts, and a step its big task's title, as in list_today. Pure +
 *  unit-tested; the tool formats and caps the output. */
export function listUpcomingFromRows(rows: unknown, todayIso: string, count: number): (ListEntry & { when: string })[] {
  if (!Array.isArray(rows)) return [];
  const out: (ListEntry & { when: string })[] = [];
  for (const r of rows) {
    if (r == null || typeof r !== 'object') continue;
    const row = r as ListRow;
    if (typeof row.id !== 'string' || typeof row.title !== 'string') continue;
    if (row.recurrence == null) {
      // A future one-off. Trust the SQL window, but keep the day so we can sort/format uniformly.
      if (typeof row.due === 'string') out.push({ id: row.id, title: row.title, when: row.due, ...partsOf(row.slices), ...towardOf(row) });
    } else {
      const next = nextOccurrence(row.recurrence, row.completed_dates, row.skipped_dates, todayIso, count);
      if (next) out.push({ id: row.id, title: row.title, when: next, ...towardOf(row) });
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

/** Fetch a single task by id, for the deep-research `fetch` call: open, done or waiting on its steps, with its parts.
 *  A removed task is a miss (fetchNotFoundDoc), as "deleted since search" always meant; without the filter it came
 *  back labelled "on today". */
export function fetchTaskRequest(env: McpEnv, token: string, id: string): { url: string; init: RequestInit } {
  const q = new URLSearchParams({
    select: 'id,title,done,recurrence,due,completed_dates,skipped_dates,slices,silent_parent',
    id: `eq.${id}`,
    deleted_at: 'is.null',
    limit: '1',
  });
  return { url: `${env.SUPABASE_URL}/rest/v1/tasks?${q.toString()}`, init: { method: 'GET', headers: supaHeaders(env, token, false) } };
}

/** The OpenAI deep-research `fetch` document for one row, or null if the row is missing/invalid.
 *  `text` is a short human line: the title, then a status (describeStatus) that folds in due/repeat/done,
 *  a task waiting on its steps, and a task's parts. Pure + unit-tested (the shape is the contract). */
export function fetchResultFrom(rows: unknown, id: string, todayIso: string): { id: string; title: string; text: string; url: string } | null {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const row = rows[0] as StatusRow & { id?: unknown; title?: unknown };
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

/** The columns fetch's status line reads. */
type StatusRow = { done?: unknown; recurrence?: unknown; due?: unknown; slices?: unknown; silent_parent?: unknown };

/** A short, calm status line for a task, e.g. "done", "on today", "due 2026-07-10", "repeats", "waiting on its
 *  steps", or "on today, 3 of 10 parts done". Used by fetch's `text`. No shame, no raw fields. A task waiting on its
 *  steps (a broken-down or made-tiny task) is on no list, so "on today" was wrong for it; it is neither ticked nor
 *  scheduled, it waits. Parts ride after the day, the way the app shows "3 / 10" on the row. */
function describeStatus(row: StatusRow, todayIso: string): string {
  if (row.done === true) return 'done';
  if (row.silent_parent === true) return 'waiting on its steps';
  if (row.recurrence != null) return 'repeats';
  const when = typeof row.due === 'string' && row.due > todayIso ? `due ${row.due}` : 'on today';
  const parts = cleanSlices(row.slices);
  return parts ? `${when}, ${parts.done} of ${parts.total} parts done` : when;
}

// --- break_down: the AI proposer (the only token spender), rate-limited per user -----------

// Per-user hourly cap on break_down, enforced in OAUTH_KV. Keys are namespaced so they can't
// collide with the OAuth provider's own keys or the session stash. A fixed-window counter (one
// key per user per UTC hour) is enough here: it's a budget guardrail, not a precise limiter.
const BREAKDOWN_KEY_PREFIX = 'mcp:bd:';
export const BREAKDOWN_HOURLY_CAP = 20;
/** The longest task or context break_down will send to the model. A title is a sentence; a few thousand
 *  characters is already a brief, and past that it is somebody feeding the spender. */
export const BREAKDOWN_MAX_CHARS = 2000;

/** The KV key for a user's break_down count in the current UTC hour. Exported for the test. */
export function breakdownRateKey(sub: string, nowMs: number): string {
  const hourBucket = Math.floor(nowMs / 3_600_000);
  return `${BREAKDOWN_KEY_PREFIX}${sub}:${hourBucket}`;
}

/** Increment the user's hourly break_down counter and report whether they are now OVER the cap.
 *  Unbound KV (local dev) allows; a KV ERROR now refuses (fails closed): this is the only per-user wall in
 *  front of the token spender on the OAuth path, and a guardrail that opens when its store hiccups is not
 *  one. Never throws. */
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
    return true; // fail CLOSED on a KV hiccup: no spend without a working cap
  }
}

/** Render the proposed steps as a calm, readable list plus the propose-then-accept reminder. */
export function formatBreakdown(steps: Step[]): string {
  const lines = steps.map((s) => {
    const mins = Number.isFinite(s.minutes) && s.minutes > 0 ? ` (${s.minutes} min)` : '';
    return `• ${s.title}${mins}`;
  });
  return `${lines.join('\n')}\n\nNothing's been added yet. Say the word and I'll add these as linked steps.`;
}

/** What the person needs to hear when their token is refused: not "try again", which sends them to retry
 *  what only a fresh token can fix. Shared by the verify step and the upstream 401/403 path. */
export const TOKEN_EXPIRED =
  'Your DoubleDone token has expired or is not valid. Re-copy it from Settings → AI agent access (MCP) and paste it again.';

/** A data call that came back not-ok. PostgREST's 401/403 means the token expired or was refused in the
 *  narrow window after verification: say so. Anything else is the calm transient line the caller passes. */
function upstreamFailure(res: Response, fallback: string): ToolResult {
  if (res.status === 401 || res.status === 403) return toolText(TOKEN_EXPIRED, true);
  return toolText(fallback, true);
}

/** One row as a done-write or a parts change reads it first (taskStateRequest). Every field is unknown until
 *  checked: devices write these columns and sync passes them through. */
export type TaskState = {
  id?: unknown;
  title?: unknown;
  done?: unknown;
  recurrence?: unknown;
  completed_dates?: unknown;
  slices?: unknown;
  silent_parent?: unknown;
  parent_id?: unknown;
  parent_title?: unknown;
};

/** What a done-write or a parts change will do, decided from the row as read. `refuse` (an isError sentence) and
 *  `say` (a calm sentence) write nothing. `write` is one guarded PATCH (patchRowRequest): `body` is the columns
 *  it sets before updated_at, `reply` is said when it lands, and `miss` is said when the guard matches no row.
 *  `closes` marks a write that finishes the task, so a step walks up to its big task once it lands, and `lead` is
 *  the reply's opening when the walk has something to add (the one-off's "Marked it done." without its "Nice."). */
export type WritePlan =
  | { kind: 'refuse'; text: string }
  | { kind: 'say'; text: string }
  | { kind: 'write'; body: Record<string, unknown>; guard: Record<string, string>; reply: string; miss: string; closes?: true; lead?: string };

const NO_MATCH = 'No matching task found.';
// A guarded write that matched nothing after the read found the row: it changed in between (a tick on a phone,
// a resize), so the read is stale and one more call reads it fresh.
const CHANGED_TRY = 'It changed just now. Try again.';
const CHANGED_CHECK = 'It changed just now. Check list_today.';

/** The task's title in quotes for a reply, or `fallback` when the row has none. */
function quoted(row: TaskState, fallback: string): string {
  return typeof row.title === 'string' && row.title ? `"${row.title}"` : fallback;
}

/** A task hidden behind its steps (a broken-down or made-tiny task, `silent_parent`) is never ticked directly: the
 *  app closes it, or brings it back, when its steps are done. Neutral on purpose, because the two kinds look the
 *  same from here. */
function waitingOnSteps(row: TaskState): string {
  return `${quoted(row, 'That task')} is waiting on its steps. Tick those, and it closes or comes back by itself.`;
}

/** Why delete_task refuses a task hidden behind its steps: removed alone, it would leave its steps on the list with
 *  nothing left for them to close, and it is not on any list for the agent to see what went. Removing the steps
 *  instead brings it back (the app's repair, on its next open), and then it can be removed as any task is. */
function waitingToRemove(row: TaskState): string {
  return `${quoted(row, 'That task')} is waiting on its steps, so it can't be removed on its own. Remove its steps first (list_today and list_upcoming mark them toward it), and the app brings it back on its next open.`;
}

/** The reply to a parts tick: how many it ticked, and what is left or that it is done. */
function partsTickReply(row: TaskState, before: Slices, change: PartsChange): string {
  const n = change.slices.done - before.done;
  const of = typeof row.title === 'string' && row.title ? ` of "${row.title}"` : '';
  const { total, done } = change.slices;
  if (change.complete) {
    // n is 0 only for a row a merge left at "5 of 5" but open: this tick is what closes it.
    if (n === 0) return `Every part${of} was already ticked, so it's marked done now. Nice.`;
    return `Ticked ${n === 1 ? 'the last part' : `the last ${n} parts`}${of}, so it's done: all ${total}. Nice.`;
  }
  return `Ticked ${n === 1 ? 'one part' : `${n} parts`}${of}: ${done} of ${total} done. Pass count to complete_task to tick more, and ${total - done} finishes it.`;
}

/** The done-write, decided READ-FIRST, in the one order both done paths share (complete_task and update_task
 *  `done`, so the same call on the same row writes the same bytes):
 *  1. A task hidden behind its steps is refused.
 *  2. A REPEAT is ticked (or un-ticked) for one day in completed_dates, and its `done` is never touched: setting
 *     done=true on the series row made a repeat vanish from every agent read (audit PR B).
 *  3. A task already done says so and writes nothing. Before the parts branch, or a row an old flaw left done at
 *     2 of 5 would meet the done=is.false guard and loop on "try again" for good.
 *  4. A task in PARTS moves forward `count` parts, pinned to the stored counts. Never back: `done: false` is
 *     refused, because the sync merge keeps the highest count and would bring it straight back.
 *  5. A one-off closes with done=is.false, so a second close never re-stamps completed_at; or reopens.
 *  `repeats` is the task's shape AFTER any field change riding with it (update_task), else as stored. */
export function planDone(row: TaskState, on: boolean, o: { count: number; day: string; now: string; repeats: boolean }): WritePlan {
  if (row.silent_parent === true) return { kind: 'refuse', text: waitingOnSteps(row) };
  if (o.repeats) {
    const tick = tickForDay(row.completed_dates, o.day, on);
    // The day is NAMED in every answer: the default is the UTC day, which for an Australian morning is
    // yesterday's date, and an agent that sees the date can pass `day` next time.
    if (tick.already) {
      return { kind: 'say', text: on ? `Already ticked for ${o.day}. It repeats, so it will be back on its next day.` : `${o.day} was not ticked, so nothing to undo.` };
    }
    // An un-tick holds on the server only: the app keeps ticks on purpose (a device merge unions them and
    // pushes the union back), so a phone that already synced the tick brings it back on its next open.
    const reply = on
      ? `Ticked for ${o.day}. It repeats, so it will be back on its next day.`
      : `Un-ticked ${o.day} on the server. A device that already synced the tick will bring it back on its next open, because ticks are kept on purpose.`;
    return { kind: 'write', body: { completed_dates: tick.dates }, guard: {}, reply, miss: NO_MATCH };
  }
  const parts = cleanSlices(row.slices);
  if (!on) {
    if (parts) return { kind: 'refuse', text: 'Parts only go forward from here. Step one back in the app.' };
    return { kind: 'write', body: { done: false, completed_at: null }, guard: {}, reply: 'Reopened.', miss: NO_MATCH };
  }
  if (row.done === true) return { kind: 'say', text: 'Already done.' };
  if (parts) {
    const change = advanceParts(parts, parts.done + o.count);
    return {
      kind: 'write',
      body: partsPatch(change, o.now),
      guard: { ...partsGuard(row.slices), done: 'is.false' },
      reply: partsTickReply(row, parts, change),
      miss: CHANGED_TRY,
      ...(change.complete ? { closes: true as const } : {}),
    };
  }
  return {
    kind: 'write',
    body: { done: true, completed_at: o.now },
    guard: { done: 'is.false' },
    reply: 'Marked it done. Nice.',
    miss: CHANGED_CHECK,
    closes: true,
    lead: 'Marked it done.',
  };
}

/** update_task `parts`, decided READ-FIRST: a number tracks the task in that many parts (the app's setSliceTotal:
 *  progress carries over, and a count at or below what is ticked finishes it), null makes it one whole task
 *  again (the done flag left alone). Refused on a task hidden behind its steps, a repeating one (judged on its
 *  shape after the change) and a done one. */
export function planParts(row: TaskState, parts: number | null, o: { now: string; repeats: boolean }): WritePlan {
  const name = quoted(row, 'That task');
  if (parts === null) {
    const cleared = clearParts(row.slices);
    if (!cleared) return { kind: 'say', text: "It wasn't tracked in parts." };
    return { kind: 'write', body: cleared, guard: {}, reply: `${name} is one whole task again.`, miss: NO_MATCH };
  }
  if (row.silent_parent === true) return { kind: 'refuse', text: `${name} is waiting on its steps, so it can't be tracked in parts. Tick its steps instead.` };
  if (o.repeats) return { kind: 'refuse', text: "A repeating task can't be tracked in parts. Stop it repeating first (repeat: null), then set parts." };
  if (row.done === true) return { kind: 'refuse', text: 'That one is already done, so there are no parts left to track.' };
  const change = setTotal(cleanSlices(row.slices), parts);
  const { total, done } = change.slices;
  if (!needsWrite(change, false)) return { kind: 'say', text: `It's already tracked in ${total} parts, ${done} done.` };
  return {
    kind: 'write',
    body: partsPatch(change, o.now),
    guard: { ...partsGuard(row.slices), done: 'is.false' },
    reply: change.complete
      ? `${name} is now in ${total} parts, and all ${total} are ticked, so it's done. Nice.`
      : `${name} is now tracked in ${total} parts, ${done} done.`,
    miss: CHANGED_TRY,
    ...(change.complete ? { closes: true as const } : {}),
  };
}

/** The walk's half of a step's reply, after its own ("Marked it done."), or '' when there is nothing to add. It names
 *  only what landed: a big task the walk finished, its next level's count, or that the app sorts the rest out on
 *  its next open (it may finish it or bring it back, so the reply says neither). `fallback` is the step's own record
 *  of its big task's title, for a walk that could not read it. */
export function walkReply(o: WalkOutcome, fallback: string | null): string {
  const quote = (title: string | null, unnamed: string) => (title ? `"${title}"` : unnamed);
  const stop = o.stop;
  const below = o.finished.length > 0;
  let after = '';
  if (stop.kind === 'waiting') after = ` ${stop.done} of ${stop.of} steps toward ${quote(stop.title, 'the big task')} done.`;
  if (stop.kind === 'app') {
    // Above a task the walk finished, an unnamed level is "the rest", never "the big task" it just closed.
    const who = quote(stop.title ?? (below ? null : fallback), below ? 'The rest' : 'The big task');
    after = ` ${who} will sort itself out next time DoubleDone opens.`;
  }
  if (!below) return after;
  const top = o.finished[o.finished.length - 1];
  const closed = ` That was the last step, so ${quote(top.title, 'the big task')} is done too.`;
  return stop.kind === 'gone' ? `${closed} That's the whole thing.` : `${closed}${after}`;
}

/** The walk, over this surface's own reads and writes. Every fetch is caught: the step's own write has landed by
 *  the time this runs, so a throw here must end the walk calmly (as `app`), never turn the tick into an error the
 *  agent retries. */
function walkIo(env: McpEnv, token: string): WalkIo {
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
        const w = patchRowRequest(env, token, id, body, guard);
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

/** Read the row a done-write or a parts change is decided on. */
async function readTaskState(env: McpEnv, token: string, id: string, transient: string): Promise<{ row: TaskState } | { fail: ToolResult }> {
  const st = taskStateRequest(env, token, id);
  const sr = await fetch(st.url, st.init);
  if (!sr.ok) return { fail: upstreamFailure(sr, transient) };
  const rows = (await sr.json()) as unknown;
  const row = Array.isArray(rows) && rows[0] && typeof rows[0] === 'object' ? (rows[0] as TaskState) : null;
  return row ? { row } : { fail: toolText(NO_MATCH, true) };
}

/** Carry out a plan as ONE PATCH, with any field change riding in the same write (`fields`, from fieldPatch). A
 *  `say` plan still lands the field change. No plan at all is a plain field change. When the write closes a STEP
 *  (the row read first has a `parent_id`), the finish walk runs once it has landed, dated to this close, and the
 *  reply adds what the walk did (walkReply). */
async function applyPlan(
  env: McpEnv,
  token: string,
  id: string,
  plan: WritePlan | null,
  fields: Record<string, unknown>,
  o: { now: string; day: string; transient: string; row: TaskState },
): Promise<ToolResult> {
  if (plan?.kind === 'refuse') return toolText(plan.text, true);
  const hasFields = Object.keys(fields).length > 0;
  if (plan?.kind === 'say' && !hasFields) return toolText(plan.text);
  const write = plan?.kind === 'write' ? plan : null;
  const w = patchRowRequest(env, token, id, { ...fields, ...write?.body, updated_at: o.now }, write?.guard);
  const res = await fetch(w.url, w.init);
  if (!res.ok) return upstreamFailure(res, o.transient);
  const rows = (await res.json()) as unknown;
  if (!Array.isArray(rows) || rows.length === 0) return toolText(write?.miss ?? NO_MATCH, true);
  if (!write) return toolText(plan?.kind === 'say' ? `Updated. ${plan.text}` : 'Updated.');
  const parentId = typeof o.row.parent_id === 'string' && o.row.parent_id ? o.row.parent_id : null;
  if (!write.closes || !parentId) return toolText(write.reply);
  const parentTitle = typeof o.row.parent_title === 'string' && o.row.parent_title ? o.row.parent_title : null;
  const outcome = await planFinish(walkIo(env, token), { parentId, parentTitle, completedAt: o.now }, o.day, o.now);
  const more = walkReply(outcome, parentTitle);
  return toolText(more ? `${write.lead ?? write.reply}${more}` : write.reply);
}

/** Why add_steps refused a task already on the list (steps.ts stepsRefusal), in one plain sentence each. "Waiting on
 *  its steps" is neutral on purpose: a made-tiny task is hidden the same way as a breakdown. */
const STEPS_REFUSALS: Record<'done' | 'repeats' | 'parts' | 'hidden', string> = {
  done: 'That one is already done.',
  repeats: "A repeating task can't be broken into steps. Add them as their own tasks, or stop it repeating first.",
  parts: 'That task is tracked in parts. Make it one whole task first (update_task parts: null), then break it down.',
  hidden: 'That task is already waiting on its steps. They are on the list.',
};

/** add_steps' reply: what it broke down and where the steps went, then one line per step with its id, so the agent
 *  can tick them. The big task's id is not shown: it is not on the list, and it closes by its steps. */
function stepsAddedReply(bigTitle: string | null, steps: StepSpec[], rows: Record<string, unknown>[]): string {
  const onToday = steps.every((s) => s.due === null) ? ' on today' : '';
  const what = bigTitle ? `"${bigTitle}"` : 'it';
  const head = `Broke ${what} into ${steps.length} steps${onToday}. It's tucked away now, and it closes itself when the last step is ticked.`;
  const lines = rows.map((r, i) => `• ${String(r.title)}${steps[i].due ? `  (on ${steps[i].due})` : ''}  [${String(r.id)}]`);
  return [head, ...lines].join('\n');
}

/** add_steps: write a breakdown the user said yes to, exactly as the app's Break it down does (steps.ts
 *  buildStepRows). With `title`, the big task and its steps are ONE insert, so it is atomic. With `task_id`, the task
 *  is read and refused if it cannot be broken down, its steps are inserted, and only then is it hidden, by a write
 *  pinned to the task as it was read. If that write misses (a phone changed the task in between) or fails, the steps
 *  just inserted are tombstoned again, because steps beside a task that is not hidden would never close it, and the
 *  reply says nothing was added, or, if even that write fails, that some steps may have landed. */
async function runAddSteps(env: McpEnv, token: string, sub: string, args: Record<string, unknown>, now: string): Promise<ToolResult> {
  const hasId = args.task_id !== undefined && args.task_id !== null;
  const hasTitle = args.title !== undefined && args.title !== null;
  if (hasId === hasTitle) {
    return toolText('Pass task_id to break down a task already on the list, or title to make the big task with its steps. One of them, not both.', true);
  }
  const parsed = parseSteps(args.steps);
  if ('error' in parsed) return toolText(parsed.tooFew ? `${parsed.error} Use add_task or update_task instead.` : parsed.error, true);
  const steps = parsed.steps;
  const nowMs = Date.parse(now);
  const ids = stepIds(`mcp-${nowMs.toString(36)}-${Math.random().toString(36).slice(2, 8)}`, steps.length);
  const transient = 'Could not add the steps just now. Try again.';

  if (hasTitle) {
    const title = typeof args.title === 'string' ? args.title.trim() : '';
    if (!title) return toolText('A title is required.', true);
    if (title.length > MAX_TITLE_CHARS) return toolText(`That title is too long. Keep it to ${MAX_TITLE_CHARS} characters.`, true);
    const rows = buildStepRows({ userId: sub, nowMs, parent: { id: ids.parent, title }, stepIds: ids.steps, steps, withParent: true });
    const ins = insertRowsRequest(env, token, rows);
    const res = await fetch(ins.url, ins.init);
    if (!res.ok) return upstreamFailure(res, transient);
    return toolText(stepsAddedReply(title, steps, rows.slice(1)));
  }

  const taskId = typeof args.task_id === 'string' ? args.task_id.trim() : '';
  if (!taskId) return toolText('A task id is required (use list_today first).', true);
  const read = await readTaskState(env, token, taskId, transient);
  if ('fail' in read) return read.fail;
  const row = read.row;
  const refusal = stepsRefusal(row);
  if (refusal) return toolText(STEPS_REFUSALS[refusal], true);
  const title = typeof row.title === 'string' ? row.title : null;
  const rows = buildStepRows({ userId: sub, nowMs, parent: { id: taskId, title }, stepIds: ids.steps, steps, withParent: false });
  const ins = insertRowsRequest(env, token, rows);
  const res = await fetch(ins.url, ins.init);
  if (!res.ok) return upstreamFailure(res, transient);
  // Hidden only now its steps exist: a hidden task with no children is one the app's repair never touches, so it
  // would stay out of sight for good.
  const flip = patchRowRequest(env, token, taskId, { ...hidePatch(steps), updated_at: now }, hideGuard(row));
  let flipRes: Response | null = null;
  let landed = false;
  try {
    flipRes = await fetch(flip.url, flip.init);
    if (flipRes.ok) {
      const flipped = (await flipRes.json()) as unknown;
      landed = Array.isArray(flipped) && flipped.length > 0;
    }
  } catch {
    flipRes = null;
  }
  if (landed) return toolText(stepsAddedReply(title, steps, rows));
  let undone = false;
  try {
    const undo = tombstoneRowsRequest(env, token, ids.steps, now);
    undone = (await fetch(undo.url, undo.init)).ok;
  } catch {
    undone = false;
  }
  if (!undone) return toolText('Some steps may have landed on their own. Check list_today.', true);
  if (flipRes && flipRes.ok) return toolText('That task changed just now, so nothing was added. Try again.', true);
  return flipRes ? upstreamFailure(flipRes, 'Could not break it down just now, so nothing was added. Try again.') : toolText('Could not break it down just now, so nothing was added. Try again.', true);
}

/** The optional `day` an agent names for a tick: a real calendar day, else null (a refusal); absent means
 *  the server's UTC day. */
function readDay(args: Record<string, unknown>, fallback: string): string | null {
  if (args.day === undefined) return fallback;
  return typeof args.day === 'string' && isValidIsoDay(args.day) ? args.day : null;
}

// --- Tool execution (I/O) --------------------------------------------------

// The token has been VERIFIED by handleMcp before this runs; `sub` is the trusted user id from that check.
// `ip` is set only on the pasted-token path (see McpEnv.AI_LIMITER).
async function runTool(env: McpEnv, token: string, sub: string, name: string, args: Record<string, unknown>, ip?: string): Promise<ToolResult> {
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
      if (!recurrence) return toolText("I couldn't read that repeat. Use daily, weekly (with weekdays 0-6), every_n_days (with days), or monthly (with an optional day 1-31).", true);
    }
    // parts: a one-off only, as the app's capture offers it (a repeat is ticked by the day, not in parts).
    let slices: Slices | undefined;
    if (args.parts != null) {
      if (hasRepeat) return toolText("A repeating task can't be tracked in parts. Pick one.", true);
      const total = wholeIn(args.parts, MIN_PARTS, MAX_PARTS);
      if (total === null) return toolText(`\`parts\` needs to be a whole number from ${MIN_PARTS} to ${MAX_PARTS}.`, true);
      slices = { total, done: 0 };
    }
    const taskId = `mcp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const { url, init } = addTaskRequest(env, token, { id: taskId, userId: sub, title, now, due, recurrence, slices });
    const res = await fetch(url, init);
    // Don't echo the raw upstream HTTP status (minor backend-topology leak); give a plain line, like api.ts.
    if (!res.ok) return upstreamFailure(res, 'Could not add it just now. Try again.');
    const when = due ? ` for ${due}` : recurrence ? ', repeating' : ' to today';
    const inParts = slices ? `, in ${slices.total} parts` : '';
    // The id rides every reply, so the agent can tick or change what it just added without a list call first.
    return toolText(`Added "${title}"${when}${inParts}. [${taskId}]`);
  }

  if (name === 'list_today') {
    const { url, init } = listTodayRequest(env, token, todayIso);
    const res = await fetch(url, init);
    if (!res.ok) return upstreamFailure(res, 'Could not list tasks just now. Try again.');
    const rows = (await res.json()) as unknown;
    const tasks = listTodayFromRows(rows, todayIso);
    if (tasks.length === 0) return toolText('Nothing on today. Enjoy the quiet.');
    return toolText(tasks.map((t) => `• ${t.title}${t.repeats ? '  (repeats)' : ''}${partsMark(t.parts)}${towardMark(t.toward)}  [${t.id}]`).join('\n'));
  }

  if (name === 'list_upcoming') {
    const { count, endIso } = upcomingWindow(args.days, todayIso);
    const { url, init } = listUpcomingRequest(env, token, todayIso, endIso);
    const res = await fetch(url, init);
    if (!res.ok) return upstreamFailure(res, 'Could not look ahead just now. Try again.');
    const rows = (await res.json()) as unknown;
    const items = listUpcomingFromRows(rows, todayIso, count);
    if (items.length === 0) return toolText(`Nothing scheduled in the next ${count} day${count === 1 ? '' : 's'}.`);
    // Cap the printed list so a big backlog can't produce a wall of text.
    const shown = items.slice(0, 40);
    const body = shown.map((t) => `• ${t.title}${partsMark(t.parts)}${towardMark(t.toward)} — ${t.when}  [${t.id}]`).join('\n');
    const more = items.length > shown.length ? `\n…and ${items.length - shown.length} more.` : '';
    return toolText(body + more);
  }

  if (name === 'complete_task') {
    const taskId = typeof args.id === 'string' ? args.id.trim() : '';
    if (!taskId) return toolText('A task id is required (use list_today first).', true);
    const day = readDay(args, todayIso);
    if (day === null) return toolText("`day` needs to look like 'YYYY-MM-DD'.", true);
    // +1 by default, as one tap in the app is: an over-tick that reaches a device can never be lowered (the
    // merge keeps the highest count), while an under-tick costs one more call. Checked even where it is then
    // ignored (a one-off, a repeat), like `day`, so a bad value is never silently dropped.
    let count = 1;
    if (args.count !== undefined) {
      const c = wholeIn(args.count, 1, MAX_PARTS);
      if (c === null) return toolText(`\`count\` needs to be a whole number from 1 to ${MAX_PARTS}.`, true);
      count = c;
    }
    const transient = 'Could not complete it just now. Try again.';
    const read = await readTaskState(env, token, taskId, transient);
    if ('fail' in read) return read.fail;
    // The shared classifier, so the tick and list_today agree by construction on what "repeats" means.
    const plan = planDone(read.row, true, { count, day, now, repeats: asRecurrence(read.row.recurrence) != null });
    return applyPlan(env, token, taskId, plan, {}, { now, day, transient, row: read.row });
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
        if (!recurrence) return toolText("I couldn't read that repeat. Use daily, weekly (with weekdays 0-6), every_n_days (with days), or monthly (with an optional day 1-31), or null to stop it.", true);
        fields.recurrence = recurrence;
      }
    }
    let done: boolean | undefined;
    if (args.done !== undefined) {
      if (typeof args.done !== 'boolean') return toolText('`done` needs to be true or false.', true);
      done = args.done;
    }
    let parts: number | null | undefined;
    if (args.parts !== undefined) {
      parts = args.parts === null ? null : wholeIn(args.parts, MIN_PARTS, MAX_PARTS);
      if (parts === null && args.parts !== null) {
        return toolText(`\`parts\` needs to be a whole number from ${MIN_PARTS} to ${MAX_PARTS}, or null to make it one whole task.`, true);
      }
    }
    // One change of shape at a time: parts with done, or parts with a new repeat, asks for two shapes at once.
    if (parts !== undefined && done !== undefined) return toolText('Change parts or done, one at a time.', true);
    if (parts !== undefined && fields.recurrence != null) {
      return toolText("A task tracked in parts can't repeat. Change parts or the repeat, one at a time.", true);
    }
    const day = readDay(args, todayIso);
    if (day === null) return toolText("`day` needs to look like 'YYYY-MM-DD'.", true);
    // At least one mutable field is required (updated_at alone is not a user-meaningful change).
    const noFields = fields.title === undefined && fields.due === undefined && fields.recurrence === undefined;
    if (noFields && done === undefined && parts === undefined) {
      return toolText('Tell me what to change: a title, a due date, a repeat, parts, or done.', true);
    }
    // A plain field change needs no read. Parts, done and a new repeat are decided on the row as it stands, so
    // they read first, and then everything lands in ONE PATCH.
    if (parts === undefined && done === undefined && fields.recurrence == null) {
      const { url, init } = updateTaskRequest(env, token, taskId, fields, now);
      const res = await fetch(url, init);
      if (!res.ok) return upstreamFailure(res, 'Could not update it just now. Try again.');
      const rows = (await res.json()) as unknown;
      if (!Array.isArray(rows) || rows.length === 0) return toolText('No matching task found.', true);
      return toolText('Updated.');
    }
    const transient =
      done === true ? 'Could not complete it just now. Try again.' : done === false ? 'Could not reopen it just now. Try again.' : 'Could not update it just now. Try again.';
    const read = await readTaskState(env, token, taskId, transient);
    if ('fail' in read) return read.fail;
    const row = read.row;
    if (fields.recurrence != null) {
      // A repeat is ticked by the day, so it can't sit on a task counted in parts, a task waiting on its steps, or
      // a step itself (each closes by being done once).
      if (cleanSlices(row.slices)) {
        return toolText("A task tracked in parts can't repeat. Make it one whole task first (parts: null), then set the repeat.", true);
      }
      if (row.silent_parent === true) return toolText(`${quoted(row, 'That task')} is waiting on its steps, so it can't repeat. Tick its steps instead.`, true);
      if (typeof row.parent_id === 'string' && row.parent_id) return toolText("That one is a step toward a bigger task, so it can't repeat.", true);
    }
    // Judged on the shape AFTER this change, so { repeat: null, done: true } closes the one-off it makes.
    const repeats = fields.recurrence !== undefined ? fields.recurrence !== null : fields.due != null ? false : asRecurrence(row.recurrence) != null;
    const plan =
      parts !== undefined
        ? planParts(row, parts, { now, repeats })
        : done !== undefined
          ? planDone(row, done, { count: 1, day, now, repeats })
          : null;
    return applyPlan(env, token, taskId, plan, fieldPatch(fields), { now, day, transient, row });
  }

  if (name === 'delete_task') {
    const taskId = typeof args.id === 'string' ? args.id.trim() : '';
    if (!taskId) return toolText('A task id is required.', true);
    const transient = 'Could not remove it just now. Try again.';
    // Read first, because a task waiting on its steps is refused (waitingToRemove). A step is removed alone, with no
    // walk, the same as the app's Remove: the repair sorts its big task out on the next open.
    const read = await readTaskState(env, token, taskId, transient);
    if ('fail' in read) return read.fail;
    if (read.row.silent_parent === true) return toolText(waitingToRemove(read.row), true);
    const { url, init } = deleteTaskRequest(env, token, taskId, now, { silent_parent: 'not.is.true' });
    const res = await fetch(url, init);
    if (!res.ok) return upstreamFailure(res, transient);
    const rows = (await res.json()) as unknown;
    // Read a moment ago, so a miss now means it changed in between (removed, or broken down, elsewhere).
    return Array.isArray(rows) && rows.length > 0 ? toolText('Removed.') : toolText(CHANGED_CHECK, true);
  }

  if (name === 'add_steps') return runAddSteps(env, token, sub, args, now);

  if (name === 'break_down') {
    const task = typeof args.task === 'string' ? args.task.trim() : '';
    if (!task) return toolText('Tell me the task to break down.', true);
    if (!env.ANTHROPIC_API_KEY) return toolText('Breaking down is unavailable right now.', true);
    // COST GUARDS, all BEFORE any spend. Size first (a prompt is paid by the token), then the per-IP wall
    // on the pasted-token path, then the per-user hourly cap. Every refusal is isError so an agent loop
    // stops rather than reading a calm sentence as success and calling again.
    if (task.length > BREAKDOWN_MAX_CHARS) {
      return toolText(`That's more than I can take in one go. Keep the task under ${BREAKDOWN_MAX_CHARS} characters.`, true);
    }
    if (typeof args.context === 'string' && args.context.length > BREAKDOWN_MAX_CHARS) {
      return toolText(`That's a lot of context. Keep it under ${BREAKDOWN_MAX_CHARS} characters.`, true);
    }
    if (ip && env.AI_LIMITER) {
      const { success } = await env.AI_LIMITER.limit({ key: ip });
      if (!success) return toolText("Let's pause breaking things down for a bit. Try again shortly.", true);
    }
    if (await overBreakdownCap(env, sub, Date.now())) {
      return toolText("Let's pause breaking things down for a bit. Try again shortly.", true);
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
    // The offered half of the moat: the steps in full, as the app's own /decompose logs them, so an agent's offer
    // can be read beside the app's. (Nothing ties an agent-written step back to this offer yet: the completion half
    // waits on the parked decomposition columns, decision log 2026-10-18.)
    await logAiCall(env, {
      endpoint: 'decompose',
      model: DECOMPOSE_MODEL,
      input: { task, via: 'mcp' },
      output: { steps },
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


// --- The HTTP handler ------------------------------------------------------

// Token-authed, not origin-gated, so a browser-based MCP client (the Inspector)
// can reach it. The token is the auth.
const MCP_CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, authorization, mcp-protocol-version, mcp-session-id',
  // A BROWSER MCP client (claude.ai web) cannot read a response header unless it is exposed.
  // The Streamable-HTTP session id rides Mcp-Session-Id; without this, claude.ai web completes
  // the handshake (all 200s) but can never capture the session, so it re-handshakes forever and
  // shows the connector as "Connect" (never connected). Non-browser clients (Cowork, ChatGPT,
  // Claude Desktop) are not CORS-bound and worked without it, which is why only web broke.
  'Access-Control-Expose-Headers': 'Mcp-Session-Id',
};

function mcpJson(payload: unknown, extraHeaders?: Record<string, string>): Response {
  return new Response(JSON.stringify(payload), {
    headers: { 'content-type': 'application/json', ...MCP_CORS, ...extraHeaders },
  });
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

export async function handleMcp(
  request: Request,
  env: McpEnv,
  source: McpTokenSource = { kind: 'header' },
  verifySub: SubVerifier = defaultVerifySub,
): Promise<Response> {
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
    // Assign a Streamable-HTTP session id so a browser client (claude.ai web) can hold the
    // session and mark the connector connected. We stay STATELESS: the id is not stored and
    // subsequent requests are still authorised solely by the bearer token, so we accept any
    // Mcp-Session-Id the client echoes back (and clients that ignore it keep working).
    return mcpJson(rpcResult(id, initializeResult(typeof pv === 'string' ? pv : undefined)), {
      'Mcp-Session-Id': crypto.randomUUID(),
    });
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
          rpcResult(id, toolText('Not connected. Paste your DoubleDone token into this MCP server (Settings → AI agent access (MCP) in the app).', true)),
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
    // VERIFY before dispatch, on BOTH paths. The pasted-token path used to decode the sub and trust it, so any
    // three-segment string reached the tools and the AI spender (2026-09-25 audit). A refused token on the
    // header path is a plain sentence the person can act on. On the OAuth path the token came from OUR custody
    // (minted by Supabase on a refresh we made moments ago), so a null here is far likelier a JWKS blip on a
    // cold isolate than a bad token: answer the calm transient line, never the 401 challenge, because the
    // challenge tells the connector to drop a live grant and march the person back through OTP sign-in. A
    // genuinely dead grant still gets the challenge, from custody's own refresh-rejection path above.
    const sub = await verifySub(token, env.SUPABASE_URL);
    if (!sub) {
      if (source.kind === 'header') return mcpJson(rpcResult(id, toolText(TOKEN_EXPIRED, true)));
      return mcpJson(rpcResult(id, toolText('Something went wrong reaching DoubleDone. Try again.', true)));
    }
    // The limiter key gets its own prefix (the /event precedent): Claude Desktop and the app behind one
    // address should not share a single window.
    const ip = source.kind === 'header' ? `mcp:${request.headers.get('CF-Connecting-IP') ?? 'anon'}` : undefined;
    const p = (body.params ?? {}) as { name?: unknown; arguments?: unknown };
    const name = typeof p.name === 'string' ? p.name : '';
    const args = (p.arguments && typeof p.arguments === 'object' ? p.arguments : {}) as Record<string, unknown>;
    try {
      return mcpJson(rpcResult(id, await runTool(env, token, sub, name, args, ip)));
    } catch {
      return mcpJson(rpcResult(id, toolText('Something went wrong reaching DoubleDone. Try again.', true)));
    }
  }

  return mcpJson(rpcError(id, -32601, `method not found: ${method}`));
}
