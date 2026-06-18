// DoubleDone AI backend (Cloudflare Worker).
// Holds the Anthropic key as a Worker secret and is the only thing that calls
// Claude. The app talks to this, never to Anthropic directly.

import { buildDecomposeRequest, DECOMPOSE_MODEL, parseDecomposeResponse } from './decompose';
import { buildStrategiseRequest, parseStrategiseResponse, STRATEGISE_MODEL } from './strategise';
import { extractUsage, logAiCall } from './telemetry';
import { buildTriageRequest, parseTriageResponse, TRIAGE_MODEL } from './triage';

export interface Env {
  ANTHROPIC_API_KEY: string;
  // Pseudonymous AI-call telemetry (the moat). Optional: if unset, the Worker
  // simply skips logging. The anon key is public/safe; both are set as Worker
  // secrets (see CLAUDE.md), never committed.
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
}

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
};

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    if (pathname === '/health') {
      // Reports whether the key is wired, never the key itself.
      return Response.json({ ok: true, hasKey: Boolean(env.ANTHROPIC_API_KEY) }, { headers: CORS });
    }

    // Bite the Elephant: a dreaded task in, atomic time-boxed steps out.
    if (pathname === '/decompose' && request.method === 'POST') {
      let task = '';
      try {
        const body = (await request.json()) as { task?: unknown };
        task = typeof body.task === 'string' ? body.task.trim() : '';
      } catch {
        return Response.json({ error: 'invalid body' }, { status: 400, headers: CORS });
      }
      if (!task) {
        return Response.json({ error: 'task is required' }, { status: 400, headers: CORS });
      }
      if (!env.ANTHROPIC_API_KEY) {
        return Response.json({ error: 'server not configured' }, { status: 500, headers: CORS });
      }

      const { url, init } = buildDecomposeRequest(task, env.ANTHROPIC_API_KEY);
      const started = Date.now();
      const upstream = await fetch(url, init as RequestInit);
      if (!upstream.ok) {
        ctx.waitUntil(
          logAiCall(env, {
            endpoint: 'decompose', model: DECOMPOSE_MODEL, input: { task }, output: null,
            inputTokens: null, outputTokens: null, latencyMs: Date.now() - started,
            ok: false, error: `upstream ${upstream.status}`,
          }),
        );
        return Response.json({ error: 'upstream error' }, { status: 502, headers: CORS });
      }
      const raw = await upstream.json();
      const steps = parseDecomposeResponse(raw);
      const usage = extractUsage(raw);
      ctx.waitUntil(
        logAiCall(env, {
          endpoint: 'decompose', model: DECOMPOSE_MODEL, input: { task }, output: { steps },
          inputTokens: usage.input, outputTokens: usage.output, latencyMs: Date.now() - started, ok: true,
        }),
      );
      return Response.json({ steps }, { headers: CORS });
    }

    // Strategise: an over-full day in, a calm re-spread plan out.
    if (pathname === '/strategise' && request.method === 'POST') {
      let tasks: { id: string; title: string }[] = [];
      try {
        const body = (await request.json()) as { tasks?: unknown };
        if (Array.isArray(body.tasks)) {
          tasks = body.tasks
            .filter(
              (t): t is { id: string; title: string } =>
                t != null &&
                typeof (t as { id?: unknown }).id === 'string' &&
                typeof (t as { title?: unknown }).title === 'string',
            )
            .map((t) => ({ id: t.id, title: t.title }));
        }
      } catch {
        return Response.json({ error: 'invalid body' }, { status: 400, headers: CORS });
      }
      if (tasks.length === 0) {
        return Response.json({ error: 'tasks are required' }, { status: 400, headers: CORS });
      }
      if (!env.ANTHROPIC_API_KEY) {
        return Response.json({ error: 'server not configured' }, { status: 500, headers: CORS });
      }

      const { url, init } = buildStrategiseRequest(tasks, env.ANTHROPIC_API_KEY);
      const started = Date.now();
      const upstream = await fetch(url, init as RequestInit);
      if (!upstream.ok) {
        ctx.waitUntil(
          logAiCall(env, {
            endpoint: 'strategise', model: STRATEGISE_MODEL, input: { tasks }, output: null,
            inputTokens: null, outputTokens: null, latencyMs: Date.now() - started,
            ok: false, error: `upstream ${upstream.status}`,
          }),
        );
        return Response.json({ error: 'upstream error' }, { status: 502, headers: CORS });
      }
      const raw = await upstream.json();
      const plan = parseStrategiseResponse(raw);
      const usage = extractUsage(raw);
      ctx.waitUntil(
        logAiCall(env, {
          endpoint: 'strategise', model: STRATEGISE_MODEL, input: { tasks }, output: { plan },
          inputTokens: usage.input, outputTokens: usage.output, latencyMs: Date.now() - started, ok: true,
        }),
      );
      return Response.json({ plan }, { headers: CORS });
    }

    // AI triage: a brain-dump of lines in, each sorted into today / later / decompose.
    if (pathname === '/triage' && request.method === 'POST') {
      let lines: string[] = [];
      try {
        const body = (await request.json()) as { lines?: unknown };
        if (Array.isArray(body.lines)) {
          lines = body.lines.filter((l): l is string => typeof l === 'string' && l.trim().length > 0);
        }
      } catch {
        return Response.json({ error: 'invalid body' }, { status: 400, headers: CORS });
      }
      if (lines.length === 0) {
        return Response.json({ error: 'lines are required' }, { status: 400, headers: CORS });
      }
      if (!env.ANTHROPIC_API_KEY) {
        return Response.json({ error: 'server not configured' }, { status: 500, headers: CORS });
      }

      const { url, init } = buildTriageRequest(lines, env.ANTHROPIC_API_KEY);
      const started = Date.now();
      const upstream = await fetch(url, init as RequestInit);
      if (!upstream.ok) {
        ctx.waitUntil(
          logAiCall(env, {
            endpoint: 'triage', model: TRIAGE_MODEL, input: { lines }, output: null,
            inputTokens: null, outputTokens: null, latencyMs: Date.now() - started,
            ok: false, error: `upstream ${upstream.status}`,
          }),
        );
        return Response.json({ error: 'upstream error' }, { status: 502, headers: CORS });
      }
      const raw = await upstream.json();
      const items = parseTriageResponse(raw);
      const usage = extractUsage(raw);
      ctx.waitUntil(
        logAiCall(env, {
          endpoint: 'triage', model: TRIAGE_MODEL, input: { lines }, output: { items },
          inputTokens: usage.input, outputTokens: usage.output, latencyMs: Date.now() - started, ok: true,
        }),
      );
      return Response.json({ items }, { headers: CORS });
    }

    return new Response('doubledone-ai', { status: 200, headers: CORS });
  },
} satisfies ExportedHandler<Env>;
