// Server-side AI-call telemetry: the moat's front door. Every AI call the Worker
// makes (clarify / decompose / plan / strategise / triage / scrapbook) is recorded
// with its input, returned value, model, token usage and latency, so what we offer
// can be tuned on what actually gets used, and the spend watched.
//
// Stored in a Cloudflare D1 database BOUND TO THE WORKER, so there is no public
// write path. (It previously used a Supabase `ai_calls` table written with the
// public anon key, which meant anyone holding that key could insert rows; D1 closes
// that.) Pseudonymous BY DESIGN: no user_id, no IP, no account identity is ever
// written. Writing is fire-and-forget via ctx.waitUntil so it never delays or
// breaks a user request.
//
// Note: this DOES retain the task text the user typed (the AI input) and the
// returned JSON, pseudonymously, for product improvement. That is disclosed
// in-product (the privacy policy).

// Minimal D1 shapes, typed locally so we do not depend on a specific
// @cloudflare/workers-types version.
export interface D1LikeStatement {
  bind(...values: unknown[]): D1LikeStatement;
  run(): Promise<unknown>;
}
export interface D1LikeDatabase {
  prepare(query: string): D1LikeStatement;
}

export type TelemetryEnv = { DB?: D1LikeDatabase };

export type AiCallLog = {
  endpoint: 'decompose' | 'strategise' | 'triage' | 'clarify' | 'plan' | 'scrapbook';
  model: string;
  input: unknown;
  output: unknown;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number;
  ok: boolean;
  error?: string | null;
};

/** Pull Anthropic token usage out of a Messages API response, defensively. */
export function extractUsage(raw: unknown): { input: number | null; output: number | null } {
  const usage = (raw as { usage?: { input_tokens?: unknown; output_tokens?: unknown } } | null)?.usage;
  return {
    input: typeof usage?.input_tokens === 'number' ? usage.input_tokens : null,
    output: typeof usage?.output_tokens === 'number' ? usage.output_tokens : null,
  };
}

/**
 * The INSERT statement and the ordered bind params for one AI call. Pure and
 * unit-tested (the params are the contract surface). input/output are JSON-encoded
 * to TEXT; ok is 0/1 for SQLite.
 */
export function aiCallStatement(log: AiCallLog): { sql: string; params: unknown[] } {
  const sql =
    'INSERT INTO ai_calls (endpoint, model, input, output, input_tokens, output_tokens, latency_ms, ok, error) ' +
    'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)';
  const params = [
    log.endpoint,
    log.model,
    log.input == null ? null : JSON.stringify(log.input),
    log.output == null ? null : JSON.stringify(log.output),
    log.inputTokens,
    log.outputTokens,
    log.latencyMs,
    log.ok ? 1 : 0,
    log.error ?? null,
  ];
  return { sql, params };
}

/** Fire-and-forget D1 insert. Never throws: telemetry must never break a user
 *  request. Skips cleanly when no D1 binding is present (tests / local dev). */
export async function logAiCall(env: TelemetryEnv, log: AiCallLog): Promise<void> {
  if (!env.DB) return;
  try {
    const { sql, params } = aiCallStatement(log);
    await env.DB.prepare(sql)
      .bind(...params)
      .run();
  } catch {
    // best effort, swallow
  }
}
