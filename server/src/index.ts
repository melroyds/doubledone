// DoubleDone AI backend (Cloudflare Worker).
// Holds the Anthropic key as a Worker secret and is the only thing that calls
// Claude. The app talks to this, never to Anthropic directly.

import { buildClarifyRequest, CLARIFY_MODEL, parseClarifyResponse } from './clarify';
import { buildDecomposeRequest, DECOMPOSE_MODEL, type DecomposeContext, parseDecomposeResponse } from './decompose';
import { parseLanguage } from './lang';
import { handleMcp } from './mcp';
import { buildPlanRequest, parsePlanResponse, PLAN_MODEL } from './plan';
import { dataUrl, IMAGE_MODEL, imagePrompt, parseImage, parseScene, SCENE_MODEL, sceneMessages } from './scrapbook';
import { buildStrategiseRequest, parseStrategiseResponse, STRATEGISE_MODEL } from './strategise';
import { handleCheckout, handleEntitlement, handleWebhook } from './stripe';
import { type D1LikeDatabase, extractUsage, logAiCall } from './telemetry';
import { buildTriageRequest, parseTriageResponse, TRIAGE_MODEL } from './triage';

// Cloudflare per-IP rate limiter binding (see wrangler.jsonc). Typed locally so we
// do not depend on a specific @cloudflare/workers-types version.
interface RateLimitBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

// Workers AI binding (see wrangler.jsonc), typed locally so we do not depend on a
// specific @cloudflare/workers-types version. `run` returns the model's output.
interface AiBinding {
  run(model: string, input: Record<string, unknown>): Promise<unknown>;
}

export interface Env {
  ANTHROPIC_API_KEY: string;
  // Supabase project URL + public anon key. Used by the MCP server to proxy a
  // user's tasks (with the user's own bearer token) under row-level security. The
  // anon key is public/safe; both are Worker secrets (see CLAUDE.md), never committed.
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  // Per-IP rate limiter guarding the paid AI routes. Optional so tests / local
  // dev (no binding) simply skip the check.
  AI_LIMITER?: RateLimitBinding;
  // Workers AI, for the scrapbook image pipeline. Optional so tests inject a mock.
  AI?: AiBinding;
  // D1 store (Worker-bound): the moat's telemetry (pseudonymous) plus the
  // entitlements table (user-keyed) the Stripe webhook writes.
  DB?: D1LikeDatabase;
  // Stripe (test mode) for Premium. Secret key + webhook signing secret are Worker
  // secrets; the price id is a non-secret var (wrangler.jsonc). Optional so the app
  // and tests run with billing unconfigured.
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_PRICE_ID?: string;
  APP_URL?: string;
}

// The app's own origins. A browser request from anywhere else is refused before
// any paid Claude call, and cross-origin reads are blocked by omitting the
// Allow-Origin header. Native apps send no Origin and pass the origin check; the
// rate limiter is what caps them (and any script).
const ALLOWED_ORIGINS = [
  'https://doubledone.app',
  'https://www.doubledone.app',
  'https://doubledone.pages.dev',
  'http://localhost:8081',
  'http://localhost:19006',
];
const AI_ROUTES = new Set(['/clarify', '/decompose', '/plan', '/strategise', '/triage', '/scrapbook']);

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  return ALLOWED_ORIGINS.includes(origin) || origin.endsWith('.doubledone.pages.dev');
}

function corsFor(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type, authorization',
    Vary: 'Origin',
  };
  if (isAllowedOrigin(origin)) headers['Access-Control-Allow-Origin'] = origin as string;
  return headers;
}

/** Sanitise the optional decompose context (the qualifying answers) from a body. */
function parseContext(raw: unknown): DecomposeContext | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const c = raw as Record<string, unknown>;
  const out: DecomposeContext = {};
  if (typeof c.dueDate === 'string') out.dueDate = c.dueDate;
  else if (c.dueDate === null) out.dueDate = null;
  if (c.spread === 'gradual' || c.spread === 'sameday') out.spread = c.spread;
  if (typeof c.question === 'string') out.question = c.question;
  if (typeof c.answer === 'string') out.answer = c.answer;
  return out;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const { pathname } = new URL(request.url);
    const origin = request.headers.get('Origin');
    const cors = corsFor(origin);

    // MCP server: token-authed and not origin-gated (so browser-based MCP clients
    // like the Inspector reach it). It carries its own permissive CORS.
    if (pathname === '/mcp') {
      return handleMcp(request, env);
    }

    // Stripe webhook: Stripe calls it server-to-server (no Origin). The signature is
    // the auth, and the raw body is needed to verify it, so it runs before anything else.
    if (pathname === '/stripe-webhook' && request.method === 'POST') {
      return handleWebhook(request, env, new Date().toISOString());
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    if (pathname === '/health') {
      // Reports whether the key is wired, never the key itself.
      return Response.json({ ok: true, hasKey: Boolean(env.ANTHROPIC_API_KEY) }, { headers: cors });
    }

    // Stripe Premium: create a Checkout session, and read the current entitlement.
    // Both are authed with the user's Supabase token (the user id rides into Stripe so
    // the webhook can attribute the subscription). No Anthropic cost, so not gated.
    if (pathname === '/checkout' && request.method === 'POST') {
      return handleCheckout(request, env, cors);
    }
    if (pathname === '/entitlement' && request.method === 'GET') {
      return handleEntitlement(request, env, cors);
    }

    // Guard the paid AI routes before any upstream call. A browser request from a
    // disallowed origin is refused (cross-site abuse); native apps send no Origin
    // and pass here. A per-IP rate limit then caps scripted abuse against the
    // $25/mo Anthropic budget. Both run before the body is even read.
    if (request.method === 'POST' && AI_ROUTES.has(pathname)) {
      if (origin !== null && !isAllowedOrigin(origin)) {
        return Response.json({ error: 'forbidden origin' }, { status: 403, headers: cors });
      }
      if (env.AI_LIMITER) {
        const ip = request.headers.get('CF-Connecting-IP') ?? 'anon';
        const { success } = await env.AI_LIMITER.limit({ key: ip });
        if (!success) {
          return Response.json({ error: 'rate limited, try again shortly' }, { status: 429, headers: cors });
        }
      }
    }

    // Break it down, call 1: a dreaded task in, three qualifying questions out.
    if (pathname === '/clarify' && request.method === 'POST') {
      let task = '';
      let language: string | undefined;
      try {
        const body = (await request.json()) as { task?: unknown; language?: unknown };
        task = typeof body.task === 'string' ? body.task.trim() : '';
        language = parseLanguage(body.language);
      } catch {
        return Response.json({ error: 'invalid body' }, { status: 400, headers: cors });
      }
      if (!task) {
        return Response.json({ error: 'task is required' }, { status: 400, headers: cors });
      }
      if (!env.ANTHROPIC_API_KEY) {
        return Response.json({ error: 'server not configured' }, { status: 500, headers: cors });
      }

      const { url, init } = buildClarifyRequest(task, env.ANTHROPIC_API_KEY, language);
      const started = Date.now();
      const upstream = await fetch(url, init as RequestInit);
      if (!upstream.ok) {
        ctx.waitUntil(
          logAiCall(env, {
            endpoint: 'clarify', model: CLARIFY_MODEL, input: { task }, output: null,
            inputTokens: null, outputTokens: null, latencyMs: Date.now() - started,
            ok: false, error: `upstream ${upstream.status}`,
          }),
        );
        return Response.json({ error: 'upstream error' }, { status: 502, headers: cors });
      }
      const raw = await upstream.json();
      const questions = parseClarifyResponse(raw);
      const usage = extractUsage(raw);
      ctx.waitUntil(
        logAiCall(env, {
          endpoint: 'clarify', model: CLARIFY_MODEL, input: { task }, output: { questions },
          inputTokens: usage.input, outputTokens: usage.output, latencyMs: Date.now() - started, ok: true,
        }),
      );
      return Response.json({ questions }, { headers: cors });
    }

    // Break it down, call 2: a dreaded task (+ the qualifying answers) in, atomic
    // time-boxed steps out.
    if (pathname === '/decompose' && request.method === 'POST') {
      let task = '';
      let context: DecomposeContext | undefined;
      let language: string | undefined;
      try {
        const body = (await request.json()) as { task?: unknown; context?: unknown; language?: unknown };
        task = typeof body.task === 'string' ? body.task.trim() : '';
        context = parseContext(body.context);
        language = parseLanguage(body.language);
      } catch {
        return Response.json({ error: 'invalid body' }, { status: 400, headers: cors });
      }
      if (!task) {
        return Response.json({ error: 'task is required' }, { status: 400, headers: cors });
      }
      if (!env.ANTHROPIC_API_KEY) {
        return Response.json({ error: 'server not configured' }, { status: 500, headers: cors });
      }

      const { url, init } = buildDecomposeRequest(task, env.ANTHROPIC_API_KEY, context, language);
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
        return Response.json({ error: 'upstream error' }, { status: 502, headers: cors });
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
      return Response.json({ steps }, { headers: cors });
    }

    // Break it down (phased): a dreaded task (+ answers) in, a roadmap of phases
    // plus phase-one's concrete steps out.
    if (pathname === '/plan' && request.method === 'POST') {
      let task = '';
      let context: DecomposeContext | undefined;
      let language: string | undefined;
      try {
        const body = (await request.json()) as { task?: unknown; context?: unknown; language?: unknown };
        task = typeof body.task === 'string' ? body.task.trim() : '';
        context = parseContext(body.context);
        language = parseLanguage(body.language);
      } catch {
        return Response.json({ error: 'invalid body' }, { status: 400, headers: cors });
      }
      if (!task) {
        return Response.json({ error: 'task is required' }, { status: 400, headers: cors });
      }
      if (!env.ANTHROPIC_API_KEY) {
        return Response.json({ error: 'server not configured' }, { status: 500, headers: cors });
      }

      const { url, init } = buildPlanRequest(task, env.ANTHROPIC_API_KEY, context, language);
      const started = Date.now();
      const upstream = await fetch(url, init as RequestInit);
      if (!upstream.ok) {
        ctx.waitUntil(
          logAiCall(env, {
            endpoint: 'plan', model: PLAN_MODEL, input: { task }, output: null,
            inputTokens: null, outputTokens: null, latencyMs: Date.now() - started,
            ok: false, error: `upstream ${upstream.status}`,
          }),
        );
        return Response.json({ error: 'upstream error' }, { status: 502, headers: cors });
      }
      const raw = await upstream.json();
      const plan = parsePlanResponse(raw);
      const usage = extractUsage(raw);
      ctx.waitUntil(
        logAiCall(env, {
          endpoint: 'plan', model: PLAN_MODEL, input: { task }, output: plan,
          inputTokens: usage.input, outputTokens: usage.output, latencyMs: Date.now() - started, ok: true,
        }),
      );
      return Response.json({ plan }, { headers: cors });
    }

    // Strategise: an over-full day in, a calm re-spread plan out.
    if (pathname === '/strategise' && request.method === 'POST') {
      let tasks: { id: string; title: string }[] = [];
      let language: string | undefined;
      try {
        const body = (await request.json()) as { tasks?: unknown; language?: unknown };
        language = parseLanguage(body.language);
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
        return Response.json({ error: 'invalid body' }, { status: 400, headers: cors });
      }
      if (tasks.length === 0) {
        return Response.json({ error: 'tasks are required' }, { status: 400, headers: cors });
      }
      if (!env.ANTHROPIC_API_KEY) {
        return Response.json({ error: 'server not configured' }, { status: 500, headers: cors });
      }

      const { url, init } = buildStrategiseRequest(tasks, env.ANTHROPIC_API_KEY, language);
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
        return Response.json({ error: 'upstream error' }, { status: 502, headers: cors });
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
      return Response.json({ plan }, { headers: cors });
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
        return Response.json({ error: 'invalid body' }, { status: 400, headers: cors });
      }
      if (lines.length === 0) {
        return Response.json({ error: 'lines are required' }, { status: 400, headers: cors });
      }
      if (!env.ANTHROPIC_API_KEY) {
        return Response.json({ error: 'server not configured' }, { status: 500, headers: cors });
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
        return Response.json({ error: 'upstream error' }, { status: 502, headers: cors });
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
      return Response.json({ items }, { headers: cors });
    }

    // AI scrapbook: a finished week's task titles in, a calm Dusk keepsake image
    // out. A two-step Workers AI pipeline (distil an abstract scene, then render
    // it). No Anthropic call, so it runs off the Workers AI free tier, never the
    // $25/mo budget. The image comes back base64 in JSON, ready for the client.
    if (pathname === '/scrapbook' && request.method === 'POST') {
      let titles: string[] = [];
      try {
        const body = (await request.json()) as { titles?: unknown };
        if (Array.isArray(body.titles)) {
          titles = body.titles
            .filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
            .map((t) => t.trim());
        }
      } catch {
        return Response.json({ error: 'invalid body' }, { status: 400, headers: cors });
      }
      if (titles.length === 0) {
        return Response.json({ error: 'titles are required' }, { status: 400, headers: cors });
      }
      if (!env.AI) {
        return Response.json({ error: 'server not configured' }, { status: 500, headers: cors });
      }

      const started = Date.now();
      try {
        const sceneRes = await env.AI.run(SCENE_MODEL, {
          messages: sceneMessages(titles),
          temperature: 0.7,
          max_tokens: 60,
        });
        const scene = parseScene(sceneRes);
        const imageRes = await env.AI.run(IMAGE_MODEL, { prompt: imagePrompt(scene), steps: 4 });
        const base64 = parseImage(imageRes);
        if (!base64) throw new Error('no image returned');
        ctx.waitUntil(
          logAiCall(env, {
            endpoint: 'scrapbook', model: IMAGE_MODEL, input: { titles }, output: { caption: scene },
            inputTokens: null, outputTokens: null, latencyMs: Date.now() - started, ok: true,
          }),
        );
        return Response.json({ image: dataUrl(base64), caption: scene }, { headers: cors });
      } catch (e) {
        ctx.waitUntil(
          logAiCall(env, {
            endpoint: 'scrapbook', model: IMAGE_MODEL, input: { titles }, output: null,
            inputTokens: null, outputTokens: null, latencyMs: Date.now() - started,
            ok: false, error: e instanceof Error ? e.message : 'scrapbook error',
          }),
        );
        return Response.json({ error: 'could not make a scrapbook just now' }, { status: 502, headers: cors });
      }
    }

    return new Response('doubledone-ai', { status: 200, headers: cors });
  },
} satisfies ExportedHandler<Env>;
