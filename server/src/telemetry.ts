// Server-side AI-call telemetry: the moat's front door. Every Claude call the
// Worker makes (decompose / strategise / triage) is recorded with its input,
// returned JSON, model, token usage and latency, so the decompositions and plans
// we offer can be tuned on what actually gets used, and the spend watched.
//
// Pseudonymous BY DESIGN: no user_id, no IP, no account identity is ever written.
// The store is a Supabase `ai_calls` table with insert-only RLS (the Worker writes
// with the public anon key; nothing can read it back through the API). Writing is
// fire-and-forget via ctx.waitUntil so it never delays or breaks a user request.
//
// Note: this DOES retain the task text the user typed (the AI input) and the
// returned JSON, pseudonymously, for product improvement. That is a deliberate
// shift from "the Worker does not store it" and must be disclosed in-product
// before any public launch (see BUILD-PLAN Privacy and Security).

export type TelemetryEnv = { SUPABASE_URL?: string; SUPABASE_ANON_KEY?: string };

export type AiCallLog = {
  endpoint: 'decompose' | 'strategise' | 'triage';
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
 * Build the Supabase REST insert for one AI call, or null when telemetry is
 * unconfigured (no Supabase env) so the Worker simply skips logging. Pure and
 * unit-tested; the request is the contract surface.
 */
export function buildAiCallInsert(env: TelemetryEnv, log: AiCallLog): { url: string; init: RequestInit } | null {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return null;
  const row = {
    endpoint: log.endpoint,
    model: log.model,
    input: log.input,
    output: log.output,
    input_tokens: log.inputTokens,
    output_tokens: log.outputTokens,
    latency_ms: log.latencyMs,
    ok: log.ok,
    error: log.error ?? null,
  };
  return {
    url: `${env.SUPABASE_URL}/rest/v1/ai_calls`,
    init: {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        apikey: env.SUPABASE_ANON_KEY,
        authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
        prefer: 'return=minimal',
      },
      body: JSON.stringify(row),
    },
  };
}

/** Fire-and-forget insert. Never throws: telemetry must never break a user request. */
export async function logAiCall(env: TelemetryEnv, log: AiCallLog): Promise<void> {
  const req = buildAiCallInsert(env, log);
  if (!req) return;
  try {
    await fetch(req.url, req.init);
  } catch {
    // best effort, swallow
  }
}
