// A small, stateless MCP server for DoubleDone tasks, so an AI agent (Claude
// Desktop, the MCP Inspector, etc.) can add, list and complete the user's tasks.
// It speaks the MCP Streamable-HTTP transport in JSON mode (JSON-RPC 2.0 over a
// single POST). Auth is a bearer token the user pastes into their MCP client:
// their Supabase access token. Every tool call proxies to the Supabase REST API
// WITH that token, so row-level security scopes it to exactly their own rows; this
// server holds no elevated key. Discovery (initialize / tools/list) needs no auth.
//
// Pure helpers (the tool schemas, the JWT decode, the Supabase request builders,
// the JSON-RPC envelopes) are exported and unit-tested; handleMcp does the I/O.

export type McpEnv = { SUPABASE_URL?: string; SUPABASE_ANON_KEY?: string };

export const MCP_PROTOCOL_VERSION = '2025-06-18';
export const SERVER_INFO = { name: 'doubledone', version: '1.0.0' };

export const TOOLS = [
  {
    name: 'add_task',
    description: "Add a new task to the user's DoubleDone today list.",
    inputSchema: {
      type: 'object',
      properties: { title: { type: 'string', description: 'The task title.' } },
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
    name: 'complete_task',
    description: "Mark one of the user's tasks done, by the id from list_today.",
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'The task id from list_today.' } },
      required: ['id'],
      additionalProperties: false,
    },
  },
] as const;

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
  t: { id: string; userId: string; title: string; now: string },
): { url: string; init: RequestInit } {
  return {
    url: `${env.SUPABASE_URL}/rest/v1/tasks`,
    init: {
      method: 'POST',
      headers: supaHeaders(env, token, true),
      body: JSON.stringify({
        id: t.id,
        user_id: t.userId,
        title: t.title,
        done: false,
        created_at: t.now,
        updated_at: t.now,
      }),
    },
  };
}

export function listTodayRequest(env: McpEnv, token: string, todayIso: string): { url: string; init: RequestInit } {
  // One-off, open, not future-dated, not deleted, not recurring, and not a silent parent (a
  // decompose umbrella the app hides from Today). Recurrence's "due today" needs cadence
  // logic PostgREST can't do, so v1 lists one-offs. silent_parent=not.is.true keeps rows that
  // are false or null (a normal task), excluding only true (a silent parent).
  const q = new URLSearchParams({
    select: 'id,title',
    deleted_at: 'is.null',
    done: 'is.false',
    recurrence: 'is.null',
    silent_parent: 'not.is.true',
    or: `(due.is.null,due.lte.${todayIso})`,
    order: 'created_at.asc',
  });
  return { url: `${env.SUPABASE_URL}/rest/v1/tasks?${q.toString()}`, init: { method: 'GET', headers: supaHeaders(env, token, false) } };
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

// --- Tool execution (I/O) --------------------------------------------------

async function runTool(env: McpEnv, token: string, name: string, args: Record<string, unknown>): Promise<ToolResult> {
  const sub = decodeJwtSub(token);
  if (!sub) return toolText('Could not read your token. Re-copy it from DoubleDone Settings.', true);
  const now = new Date().toISOString();

  if (name === 'add_task') {
    const title = typeof args.title === 'string' ? args.title.trim() : '';
    if (!title) return toolText('A title is required.', true);
    const taskId = `mcp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const { url, init } = addTaskRequest(env, token, { id: taskId, userId: sub, title, now });
    const res = await fetch(url, init);
    // Don't echo the raw upstream HTTP status (minor backend-topology leak); give a plain line, like api.ts.
    return res.ok ? toolText(`Added "${title}" to today.`) : toolText('Could not add it just now. Try again.', true);
  }

  if (name === 'list_today') {
    const { url, init } = listTodayRequest(env, token, now.slice(0, 10));
    const res = await fetch(url, init);
    if (!res.ok) return toolText('Could not list tasks just now. Try again.', true);
    const rows = (await res.json()) as unknown;
    const tasks = Array.isArray(rows)
      ? rows.filter(
          (r): r is { id: string; title: string } =>
            r != null && typeof (r as { id?: unknown }).id === 'string' && typeof (r as { title?: unknown }).title === 'string',
        )
      : [];
    if (tasks.length === 0) return toolText('Nothing on today. Enjoy the quiet.');
    return toolText(tasks.map((t) => `• ${t.title}  [${t.id}]`).join('\n'));
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

  return toolText(`Unknown tool: ${name}`, true);
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

export async function handleMcp(request: Request, env: McpEnv): Promise<Response> {
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
    const auth = request.headers.get('Authorization') ?? '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    if (!token) {
      return mcpJson(
        rpcResult(id, toolText('Not connected. Paste your DoubleDone token into this MCP server (Settings → MCP access in the app).', true)),
      );
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
