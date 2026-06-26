// DoubleDone AI backend (Cloudflare Worker).
// Holds the Anthropic key as a Worker secret and is the only thing that calls
// Claude. The app talks to this, never to Anthropic directly.

import { handleApi } from './api';
import { buildChartRequest, type ChartContext, CHART_MODEL, parseChartContext, parseChartResponse } from './chart';
import { buildClarifyRequest, CLARIFY_MODEL, parseClarifyResponse } from './clarify';
import { buildCombineRequest, COMBINE_MODEL, parseCombineResponse } from './combine';
import { buildDecomposeRequest, DECOMPOSE_MODEL, type DecomposeContext, parseDecomposeResponse } from './decompose';
import { buildFeedbackEmail, parseFeedback } from './feedback';
import { parseLanguage } from './lang';
import { buildLookbackSummaryRequest, LOOKBACK_SUMMARY_MODEL, parseLookbackSummaryResponse } from './lookbackSummary';
import { handleMcp } from './mcp';
import { buildOcrRequest, type ImageMediaType, OCR_MODEL, parseMediaType, parseOcrResponse } from './ocr';
import { buildPlanRequest, parsePlanResponse, PLAN_MODEL } from './plan';
import { requirePremium } from './premium';
import { deleteSub, parsePushSub, saveSub, sendDailyNudges } from './push';
import { dataUrl, IMAGE_MODEL, imagePrompt, parseImage, parseScene, SCENE_MODEL, sceneMessages } from './scrapbook';
import { buildSequenceRequest, parseEnergy, parseSequenceResponse, SEQUENCE_MODEL } from './sequence';
import { buildSplitRequest, parseSplitResponse, SPLIT_MODEL } from './split';
import { buildTinyRequest, parseTinyResponse, TINY_MODEL } from './tiny';
import { buildStrategiseRequest, parseStrategiseResponse, STRATEGISE_MODEL } from './strategise';
import { handleCheckout, handleEntitlement, handlePortal, handleWebhook } from './stripe';
import { type D1LikeDatabase, extractUsage, logAiCall, logOutcome } from './telemetry';
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

// R2 bucket binding (see wrangler.jsonc), typed locally so we do not depend on a
// specific @cloudflare/workers-types version. Holds the scrapbook keepsake images.
interface R2Binding {
  put(key: string, value: ArrayBuffer | Uint8Array, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
  get(key: string): Promise<{ body: ReadableStream; httpMetadata?: { contentType?: string } } | null>;
  delete(key: string): Promise<unknown>;
}

// Cloudflare Email Routing send_email binding (see wrangler.jsonc), typed locally so we
// do not depend on a specific @cloudflare/workers-types version.
interface SendEmailBinding {
  send(message: unknown): Promise<void>;
}

export interface Env {
  ANTHROPIC_API_KEY: string;
  COMP_EMAILS?: string; // comma-separated always-premium comp allowlist (owner + feedback grants). A Worker secret, NOT in source.
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
  // R2 bucket holding the scrapbook keepsake images (off the localStorage quota).
  SCRAPBOOKS?: R2Binding;
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
  // Web Push (Phase 2): the VAPID private key (the EC private JWK as a string) + the
  // contact subject. Worker secrets, never committed. Optional so the app/tests run
  // without push configured.
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
  // In-app feedback: the send_email binding + the verified destination it delivers to.
  // FEEDBACK_TO is a Worker secret (the support inbox's verified address), never committed.
  // Both optional so the app + tests run with feedback unconfigured.
  SEND_EMAIL?: SendEmailBinding;
  FEEDBACK_TO?: string;
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
const AI_ROUTES = new Set(['/chart', '/clarify', '/combine', '/decompose', '/plan', '/sequence', '/split', '/tiny', '/strategise', '/triage', '/scrapbook', '/ocr', '/lookback-summary']);
// Max request-body size (bytes) on the TEXT AI routes, so one giant payload cannot run up the Anthropic
// bill (the rate limiter bounds frequency, this bounds size). 100 KB is far above any real brain-dump or
// goal. /ocr is exempt below: it legitimately carries a photo.
const MAX_TEXT_AI_BODY = 100_000;

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

    // Defence-in-depth body ceiling for EVERY route. The per-route field caps are the real backstop, but a
    // declared Content-Length over ~2MB (a multi-megabyte JSON body that would be materialised in Worker
    // memory before any validation) is rejected here first. Content-Length can be absent or spoofed, so this
    // is a backstop, not the only check. ~1.9MB matches the existing /ocr budget.
    const declaredLen = Number(request.headers.get('Content-Length'));
    if (Number.isFinite(declaredLen) && declaredLen > 2_000_000) {
      return new Response('payload too large', { status: 413, headers: cors });
    }

    // MCP server: token-authed and not origin-gated (so browser-based MCP clients
    // like the Inspector reach it). It carries its own permissive CORS.
    if (pathname === '/mcp') {
      return handleMcp(request, env);
    }

    // Public REST API (token-authed, OpenAPI-described) over the user's tasks. Not
    // origin-gated: the bearer token is the auth, and handleApi carries its own CORS.
    if (pathname.startsWith('/api/')) {
      return handleApi(request, env);
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

    // Delete a user's own scrapbook images from R2 on account deletion. Keyed by the
    // unguessable UUIDs the client holds locally, so a caller can only purge images it
    // already knows the keys to (its own). Best-effort; an unknown key is a no-op.
    if (pathname === '/scrapbook/purge' && request.method === 'POST') {
      if (!env.SCRAPBOOKS) return Response.json({ ok: true, deleted: 0 }, { headers: cors });
      let keys: string[] = [];
      try {
        const body = (await request.json()) as { keys?: unknown };
        if (Array.isArray(body.keys)) {
          keys = body.keys.filter((k): k is string => typeof k === 'string' && k.length > 0).slice(0, 200);
        }
      } catch {
        return Response.json({ error: 'bad request' }, { status: 400, headers: cors });
      }
      let deleted = 0;
      for (const key of keys) {
        try {
          await env.SCRAPBOOKS.delete(key);
          deleted += 1;
        } catch {
          // best effort; keep going
        }
      }
      return Response.json({ ok: true, deleted }, { headers: cors });
    }
    // Public read for a scrapbook keepsake image stored in R2. Not origin-gated (the
    // <Image> tag loads it cross-origin), read-only, and the key is an unguessable
    // UUID. Long-cached and immutable.
    if (request.method === 'GET' && pathname.startsWith('/scrapbook-img/')) {
      if (!env.SCRAPBOOKS) return new Response('not found', { status: 404 });
      const key = decodeURIComponent(pathname.slice('/scrapbook-img/'.length));
      const obj = await env.SCRAPBOOKS.get(key);
      if (!obj) return new Response('not found', { status: 404 });
      return new Response(obj.body, {
        headers: {
          'content-type': obj.httpMetadata?.contentType ?? 'image/jpeg',
          'cache-control': 'public, max-age=31536000, immutable',
        },
      });
    }

    // Stripe Premium: create a Checkout session, and read the current entitlement.
    // Both are authed with the user's Supabase token (the user id rides into Stripe so
    // the webhook can attribute the subscription). No Anthropic cost, so not gated.
    if (pathname === '/checkout' && request.method === 'POST') {
      return handleCheckout(request, env, cors);
    }
    if (pathname === '/portal' && request.method === 'POST') {
      return handlePortal(request, env, cors);
    }
    if (pathname === '/entitlement' && request.method === 'GET') {
      return handleEntitlement(request, env, cors);
    }

    // Web Push (Phase 2 reminders): store / remove a browser subscription for the daily
    // nudge. Browser-only, so origin-gated; the daily cron sends to the stored subs.
    if (pathname === '/push/subscribe' && request.method === 'POST') {
      if (!isAllowedOrigin(origin)) {
        return Response.json({ error: 'forbidden origin' }, { status: 403, headers: cors });
      }
      let sub: ReturnType<typeof parsePushSub> = null;
      try {
        sub = parsePushSub(await request.json());
      } catch {
        return Response.json({ error: 'invalid body' }, { status: 400, headers: cors });
      }
      if (!sub) {
        return Response.json({ error: 'invalid subscription' }, { status: 400, headers: cors });
      }
      ctx.waitUntil(saveSub(env, sub));
      return Response.json({ ok: true }, { headers: cors });
    }
    if (pathname === '/push/unsubscribe' && request.method === 'POST') {
      if (!isAllowedOrigin(origin)) {
        return Response.json({ error: 'forbidden origin' }, { status: 403, headers: cors });
      }
      let endpoint = '';
      try {
        const body = (await request.json()) as { endpoint?: unknown };
        endpoint = typeof body.endpoint === 'string' ? body.endpoint : '';
      } catch {
        return Response.json({ error: 'invalid body' }, { status: 400, headers: cors });
      }
      if (!endpoint) {
        return Response.json({ error: 'endpoint required' }, { status: 400, headers: cors });
      }
      ctx.waitUntil(deleteSub(env, endpoint));
      return Response.json({ ok: true }, { headers: cors });
    }

    // Guard the paid AI routes before any upstream call. A browser request from a
    // disallowed origin is refused (cross-site abuse); native apps send no Origin
    // and pass here. A per-IP rate limit then caps scripted abuse against the
    // $25/mo Anthropic budget. Both run before the body is even read.
    if (request.method === 'POST' && (AI_ROUTES.has(pathname) || pathname === '/outcome' || pathname === '/feedback')) {
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
      // Size cap on the text routes (see MAX_TEXT_AI_BODY). Read a CLONE so the handler can still read the
      // body, and measure the real UTF-8 BYTE length: a content-length header can be absent or lie, and a
      // plain .length (UTF-16 code units) undercounts multibyte scripts (CJK, Cyrillic, emoji) by up to ~3x.
      // /ocr is exempt: it carries a real photo and enforces its own larger limit downstream.
      if (pathname !== '/ocr') {
        const probeBytes = new TextEncoder().encode(await request.clone().text()).length;
        if (probeBytes > MAX_TEXT_AI_BODY) {
          return Response.json({ error: 'request too large' }, { status: 413, headers: cors });
        }
      }
    }

    // The completion half of the moat flywheel: an anonymised ping that a
    // decomposition's step finished, linked only by its pseudonymous id (the same id
    // the /plan call stored on its ai_calls row). No identity, no task text, ever.
    if (pathname === '/outcome' && request.method === 'POST') {
      let corrId = '';
      let stepsTotal: number | null = null;
      let daysElapsed = 0;
      try {
        const body = (await request.json()) as { id?: unknown; steps_total?: unknown; days_elapsed?: unknown };
        corrId = typeof body.id === 'string' ? body.id : '';
        stepsTotal = typeof body.steps_total === 'number' ? Math.max(0, Math.floor(body.steps_total)) : null;
        daysElapsed = typeof body.days_elapsed === 'number' ? Math.max(0, Math.floor(body.days_elapsed)) : 0;
      } catch {
        return Response.json({ error: 'invalid body' }, { status: 400, headers: cors });
      }
      if (!corrId) {
        return Response.json({ error: 'id is required' }, { status: 400, headers: cors });
      }
      ctx.waitUntil(logOutcome(env, { corrId, stepsTotal, daysElapsed }));
      return Response.json({ ok: true }, { headers: cors });
    }

    // In-app feedback: the user's typed note in, an email to the support inbox out (via
    // the send_email binding). Awaited, not fire-and-forget, so the form can tell the user
    // it actually sent. Origin-gated + rate-limited by the guard above.
    if (pathname === '/feedback' && request.method === 'POST') {
      const parsed = parseFeedback(await request.json().catch(() => null));
      if (!parsed.ok) {
        return Response.json({ error: parsed.error }, { status: 400, headers: cors });
      }
      if (!env.SEND_EMAIL || !env.FEEDBACK_TO) {
        return Response.json({ error: 'feedback is not configured' }, { status: 503, headers: cors });
      }
      const from = 'feedback@doubledone.app';
      const raw = buildFeedbackEmail({
        from,
        to: env.FEEDBACK_TO,
        text: parsed.text,
        context: parsed.context,
        uuid: crypto.randomUUID(),
        date: new Date().toUTCString(),
      });
      try {
        const { EmailMessage } = (await import('cloudflare:email')) as {
          EmailMessage: new (from: string, to: string, raw: string) => unknown;
        };
        await env.SEND_EMAIL.send(new EmailMessage(from, env.FEEDBACK_TO, raw));
        return Response.json({ ok: true }, { headers: cors });
      } catch {
        return Response.json({ error: 'could not send just now' }, { status: 502, headers: cors });
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

    // OCR photo capture (PREMIUM): a photo of a list in, the task titles out, for the user to
    // review and edit in the brain-dump box before anything is committed. The FIRST costed route
    // behind requirePremium (the money gate): it cryptographically verifies the Supabase JWT and
    // reads the D1 entitlement, fail-closed. Validation (cheap, no AI) runs before the gate so a
    // bad body is a clean 400/413; the gate runs before any vision call so non-premium never spends.
    if (pathname === '/ocr' && request.method === 'POST') {
      let imageBase64 = '';
      let mediaType: ImageMediaType = 'image/jpeg';
      let language: string | undefined;
      try {
        const body = (await request.json()) as { image?: unknown; mediaType?: unknown; language?: unknown };
        imageBase64 = typeof body.image === 'string' ? body.image.trim() : '';
        mediaType = parseMediaType(body.mediaType);
        language = parseLanguage(body.language);
      } catch {
        return Response.json({ error: 'invalid body' }, { status: 400, headers: cors });
      }
      if (!imageBase64) {
        return Response.json({ error: 'image is required' }, { status: 400, headers: cors });
      }
      // ~1.9MB of base64 is roughly a 1.4MB image; the client downscales to ~1080px JPEG, far
      // under this. A server backstop so a huge upload cannot run up vision tokens against the cap.
      if (imageBase64.length > 1_900_000) {
        return Response.json({ error: 'image too large' }, { status: 413, headers: cors });
      }
      // The money gate: verify the token and the premium entitlement before spending any tokens.
      // CORS on ALL of 401 / 403 / 503 (a CORS-less error reads as a network failure in the browser).
      const gate = await requirePremium(request, env);
      if (!gate.ok) {
        return Response.json({ error: 'premium required' }, { status: gate.status, headers: cors });
      }
      if (!env.ANTHROPIC_API_KEY) {
        return Response.json({ error: 'server not configured' }, { status: 500, headers: cors });
      }

      const { url, init } = buildOcrRequest(imageBase64, mediaType, env.ANTHROPIC_API_KEY, language);
      const started = Date.now();
      const upstream = await fetch(url, init as RequestInit);
      if (!upstream.ok) {
        ctx.waitUntil(
          logAiCall(env, {
            endpoint: 'ocr', model: OCR_MODEL, input: { bytes: imageBase64.length }, output: null,
            inputTokens: null, outputTokens: null, latencyMs: Date.now() - started,
            ok: false, error: `upstream ${upstream.status}`,
          }),
        );
        return Response.json({ error: 'upstream error' }, { status: 502, headers: cors });
      }
      const raw = await upstream.json();
      const tasks = parseOcrResponse(raw);
      const usage = extractUsage(raw);
      // Privacy: log only the image SIZE and the task COUNT, never the image or the titles. The
      // image is never stored anywhere; OCR titles are raw transcription with low moat value and
      // higher sensitivity than typed text, so they stay out of the pseudonymous log.
      ctx.waitUntil(
        logAiCall(env, {
          endpoint: 'ocr', model: OCR_MODEL, input: { bytes: imageBase64.length }, output: { count: tasks.length },
          inputTokens: usage.input, outputTokens: usage.output, latencyMs: Date.now() - started, ok: true,
        }),
      );
      return Response.json({ tasks }, { headers: cors });
    }

    // Lookback weekly summary (PREMIUM): a finished week's titles in, one warm display-only paragraph
    // out. Behind requirePremium like /ocr: cheap validation first, then the money gate before any spend.
    if (pathname === '/lookback-summary' && request.method === 'POST') {
      let titles: string[] = [];
      let language: string | undefined;
      try {
        const body = (await request.json()) as { titles?: unknown; language?: unknown };
        titles = Array.isArray(body.titles)
          ? body.titles.filter((s): s is string => typeof s === 'string' && s.trim().length > 0).map((s) => s.trim())
          : [];
        language = parseLanguage(body.language);
      } catch {
        return Response.json({ error: 'invalid body' }, { status: 400, headers: cors });
      }
      if (titles.length === 0) {
        return Response.json({ error: 'titles are required' }, { status: 400, headers: cors });
      }
      const gate = await requirePremium(request, env);
      if (!gate.ok) {
        return Response.json({ error: 'premium required' }, { status: gate.status, headers: cors });
      }
      if (!env.ANTHROPIC_API_KEY) {
        return Response.json({ error: 'server not configured' }, { status: 500, headers: cors });
      }
      const { url, init } = buildLookbackSummaryRequest(titles, env.ANTHROPIC_API_KEY, language);
      const started = Date.now();
      const upstream = await fetch(url, init as RequestInit);
      if (!upstream.ok) {
        ctx.waitUntil(
          logAiCall(env, {
            endpoint: 'lookbackSummary', model: LOOKBACK_SUMMARY_MODEL, input: { count: titles.length }, output: null,
            inputTokens: null, outputTokens: null, latencyMs: Date.now() - started,
            ok: false, error: `upstream ${upstream.status}`,
          }),
        );
        return Response.json({ error: 'upstream error' }, { status: 502, headers: cors });
      }
      const raw = await upstream.json();
      const summary = parseLookbackSummaryResponse(raw);
      const usage = extractUsage(raw);
      // Privacy: log only the title COUNT and the summary LENGTH, never the titles or the paragraph.
      ctx.waitUntil(
        logAiCall(env, {
          endpoint: 'lookbackSummary', model: LOOKBACK_SUMMARY_MODEL, input: { count: titles.length }, output: { chars: summary.length },
          inputTokens: usage.input, outputTokens: usage.output, latencyMs: Date.now() - started, ok: true,
        }),
      );
      return Response.json({ summary }, { headers: cors });
    }

    // Chart a course (PREMIUM): a goal in, a calm ordered list of the next steps toward it out. Behind
    // requirePremium like /ocr: validate first, then the money gate before any (token-heavy Sonnet) spend.
    if (pathname === '/chart' && request.method === 'POST') {
      let goal = '';
      let context: ChartContext | undefined;
      let language: string | undefined;
      try {
        const body = (await request.json()) as { goal?: unknown; context?: unknown; language?: unknown };
        goal = typeof body.goal === 'string' ? body.goal.trim() : '';
        context = parseChartContext(body.context);
        language = parseLanguage(body.language);
      } catch {
        return Response.json({ error: 'invalid body' }, { status: 400, headers: cors });
      }
      if (!goal) {
        return Response.json({ error: 'goal is required' }, { status: 400, headers: cors });
      }
      const gate = await requirePremium(request, env);
      if (!gate.ok) {
        return Response.json({ error: 'premium required' }, { status: gate.status, headers: cors });
      }
      if (!env.ANTHROPIC_API_KEY) {
        return Response.json({ error: 'server not configured' }, { status: 500, headers: cors });
      }
      const { url, init } = buildChartRequest(goal, env.ANTHROPIC_API_KEY, context, language);
      const started = Date.now();
      const upstream = await fetch(url, init as RequestInit);
      if (!upstream.ok) {
        ctx.waitUntil(
          logAiCall(env, {
            endpoint: 'chart', model: CHART_MODEL, input: { goal }, output: null,
            inputTokens: null, outputTokens: null, latencyMs: Date.now() - started,
            ok: false, error: `upstream ${upstream.status}`,
          }),
        );
        return Response.json({ error: 'upstream error' }, { status: 502, headers: cors });
      }
      const raw = await upstream.json();
      const course = parseChartResponse(raw);
      const usage = extractUsage(raw);
      ctx.waitUntil(
        logAiCall(env, {
          endpoint: 'chart', model: CHART_MODEL, input: { goal }, output: course,
          inputTokens: usage.input, outputTokens: usage.output, latencyMs: Date.now() - started, ok: true,
        }),
      );
      return Response.json({ course }, { headers: cors });
    }

    // Plan my order (PREMIUM): today's tasks in, a calm suggested order out. Behind requirePremium like /ocr:
    // validate first, then the money gate before any spend. Orders in place, it never moves a task to a day.
    if (pathname === '/sequence' && request.method === 'POST') {
      let seqTasks: { id: string; title: string }[] = [];
      let energy: 'low' | 'medium' | 'good' | undefined;
      let language: string | undefined;
      try {
        const body = (await request.json()) as { tasks?: unknown; energy?: unknown; language?: unknown };
        seqTasks = Array.isArray(body.tasks)
          ? body.tasks
              .filter(
                (t): t is { id: string; title: string } =>
                  t != null && typeof (t as { id?: unknown }).id === 'string' && typeof (t as { title?: unknown }).title === 'string',
              )
              .map((t) => ({ id: t.id, title: t.title }))
          : [];
        energy = parseEnergy(body.energy);
        language = parseLanguage(body.language);
      } catch {
        return Response.json({ error: 'invalid body' }, { status: 400, headers: cors });
      }
      if (seqTasks.length === 0) {
        return Response.json({ error: 'tasks are required' }, { status: 400, headers: cors });
      }
      const gate = await requirePremium(request, env);
      if (!gate.ok) {
        return Response.json({ error: 'premium required' }, { status: gate.status, headers: cors });
      }
      if (!env.ANTHROPIC_API_KEY) {
        return Response.json({ error: 'server not configured' }, { status: 500, headers: cors });
      }
      const { url, init } = buildSequenceRequest(seqTasks, env.ANTHROPIC_API_KEY, energy, language);
      const started = Date.now();
      const upstream = await fetch(url, init as RequestInit);
      if (!upstream.ok) {
        ctx.waitUntil(
          logAiCall(env, {
            endpoint: 'sequence', model: SEQUENCE_MODEL, input: { count: seqTasks.length, energy: energy ?? null }, output: null,
            inputTokens: null, outputTokens: null, latencyMs: Date.now() - started,
            ok: false, error: `upstream ${upstream.status}`,
          }),
        );
        return Response.json({ error: 'upstream error' }, { status: 502, headers: cors });
      }
      const raw = await upstream.json();
      const order = parseSequenceResponse(raw);
      const usage = extractUsage(raw);
      ctx.waitUntil(
        logAiCall(env, {
          endpoint: 'sequence', model: SEQUENCE_MODEL, input: { count: seqTasks.length, energy: energy ?? null }, output: { order: order.length },
          inputTokens: usage.input, outputTokens: usage.output, latencyMs: Date.now() - started, ok: true,
        }),
      );
      return Response.json({ order }, { headers: cors });
    }

    // Break it down (phased): a dreaded task (+ answers) in, a roadmap of phases
    // plus phase-one's concrete steps out.
    if (pathname === '/plan' && request.method === 'POST') {
      let task = '';
      let context: DecomposeContext | undefined;
      let language: string | undefined;
      let corrId: string | undefined;
      try {
        const body = (await request.json()) as { task?: unknown; context?: unknown; language?: unknown; decompositionId?: unknown };
        task = typeof body.task === 'string' ? body.task.trim() : '';
        context = parseContext(body.context);
        language = parseLanguage(body.language);
        corrId = typeof body.decompositionId === 'string' ? body.decompositionId : undefined;
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
            ok: false, error: `upstream ${upstream.status}`, corrId,
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
          inputTokens: usage.input, outputTokens: usage.output, latencyMs: Date.now() - started, ok: true, corrId,
        }),
      );
      return Response.json({ plan }, { headers: cors });
    }

    // Strategise: an over-full day in, a calm re-spread plan out.
    if (pathname === '/strategise' && request.method === 'POST') {
      let tasks: { id: string; title: string; big?: boolean }[] = [];
      let language: string | undefined;
      try {
        const body = (await request.json()) as { tasks?: unknown; language?: unknown };
        language = parseLanguage(body.language);
        if (Array.isArray(body.tasks)) {
          tasks = body.tasks
            .filter(
              (t): t is { id: string; title: string; big?: boolean } =>
                t != null &&
                typeof (t as { id?: unknown }).id === 'string' &&
                typeof (t as { title?: unknown }).title === 'string',
            )
            .map((t) => ({ id: t.id, title: t.title, big: (t as { big?: unknown }).big === true }));
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

    // AI split: one run-on brain-dump (often dictated in a single breath, no
    // pauses) in, the separate tasks out. It ONLY splits; /triage then sorts the
    // lines. Cheap (Haiku), on the friction-free capture path.
    if (pathname === '/split' && request.method === 'POST') {
      let text = '';
      try {
        const body = (await request.json()) as { text?: unknown };
        text = typeof body.text === 'string' ? body.text.trim() : '';
      } catch {
        return Response.json({ error: 'invalid body' }, { status: 400, headers: cors });
      }
      if (!text) {
        return Response.json({ error: 'text is required' }, { status: 400, headers: cors });
      }
      if (!env.ANTHROPIC_API_KEY) {
        return Response.json({ error: 'server not configured' }, { status: 500, headers: cors });
      }

      const { url, init } = buildSplitRequest(text, env.ANTHROPIC_API_KEY);
      const started = Date.now();
      const upstream = await fetch(url, init as RequestInit);
      if (!upstream.ok) {
        ctx.waitUntil(
          logAiCall(env, {
            endpoint: 'split', model: SPLIT_MODEL, input: { text }, output: null,
            inputTokens: null, outputTokens: null, latencyMs: Date.now() - started,
            ok: false, error: `upstream ${upstream.status}`,
          }),
        );
        return Response.json({ error: 'upstream error' }, { status: 502, headers: cors });
      }
      const raw = await upstream.json();
      const items = parseSplitResponse(raw);
      const usage = extractUsage(raw);
      ctx.waitUntil(
        logAiCall(env, {
          endpoint: 'split', model: SPLIT_MODEL, input: { text }, output: { items },
          inputTokens: usage.input, outputTokens: usage.output, latencyMs: Date.now() - started, ok: true,
        }),
      );
      return Response.json({ items }, { headers: cors });
    }

    // AI "make it tiny": a dreaded task in, a 2-minute starter version out (the wall of
    // awful, shrunk). The real task is kept client-side as the silent parent.
    if (pathname === '/tiny' && request.method === 'POST') {
      let task = '';
      try {
        const body = (await request.json()) as { task?: unknown };
        task = typeof body.task === 'string' ? body.task.trim() : '';
      } catch {
        return Response.json({ error: 'invalid body' }, { status: 400, headers: cors });
      }
      if (!task) {
        return Response.json({ error: 'task is required' }, { status: 400, headers: cors });
      }
      if (!env.ANTHROPIC_API_KEY) {
        return Response.json({ error: 'server not configured' }, { status: 500, headers: cors });
      }

      const { url, init } = buildTinyRequest(task, env.ANTHROPIC_API_KEY);
      const started = Date.now();
      const upstream = await fetch(url, init as RequestInit);
      if (!upstream.ok) {
        ctx.waitUntil(
          logAiCall(env, {
            endpoint: 'tiny', model: TINY_MODEL, input: { task }, output: null,
            inputTokens: null, outputTokens: null, latencyMs: Date.now() - started,
            ok: false, error: `upstream ${upstream.status}`,
          }),
        );
        return Response.json({ error: 'upstream error' }, { status: 502, headers: cors });
      }
      const raw = await upstream.json();
      const tiny = parseTinyResponse(raw);
      const usage = extractUsage(raw);
      ctx.waitUntil(
        logAiCall(env, {
          endpoint: 'tiny', model: TINY_MODEL, input: { task }, output: { tiny },
          inputTokens: usage.input, outputTokens: usage.output, latencyMs: Date.now() - started, ok: true,
        }),
      );
      return Response.json({ tiny }, { headers: cors });
    }

    // Combine: several task titles in, one umbrella title out (the inverse of
    // Bite-the-Elephant). Cheap (Haiku); the client folds the tasks into the umbrella.
    if (pathname === '/combine' && request.method === 'POST') {
      let titles: string[] = [];
      let language: string | undefined;
      try {
        const body = (await request.json()) as { titles?: unknown; language?: unknown };
        language = parseLanguage(body.language);
        if (Array.isArray(body.titles)) {
          titles = body.titles
            .filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
            .map((t) => t.trim());
        }
      } catch {
        return Response.json({ error: 'invalid body' }, { status: 400, headers: cors });
      }
      if (titles.length < 2) {
        return Response.json({ error: 'at least two titles are required' }, { status: 400, headers: cors });
      }
      if (!env.ANTHROPIC_API_KEY) {
        return Response.json({ error: 'server not configured' }, { status: 500, headers: cors });
      }

      const { url, init } = buildCombineRequest(titles, env.ANTHROPIC_API_KEY, language);
      const started = Date.now();
      const upstream = await fetch(url, init as RequestInit);
      if (!upstream.ok) {
        ctx.waitUntil(
          logAiCall(env, {
            endpoint: 'combine', model: COMBINE_MODEL, input: { titles }, output: null,
            inputTokens: null, outputTokens: null, latencyMs: Date.now() - started,
            ok: false, error: `upstream ${upstream.status}`,
          }),
        );
        return Response.json({ error: 'upstream error' }, { status: 502, headers: cors });
      }
      const raw = await upstream.json();
      const title = parseCombineResponse(raw);
      const usage = extractUsage(raw);
      ctx.waitUntil(
        logAiCall(env, {
          endpoint: 'combine', model: COMBINE_MODEL, input: { titles }, output: { title },
          inputTokens: usage.input, outputTokens: usage.output, latencyMs: Date.now() - started, ok: true,
        }),
      );
      return Response.json({ title }, { headers: cors });
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
        // Persist the bytes to R2 and hand back a small URL, so the client stores an
        // ~80-char link instead of a ~500KB data-URL (the localStorage quota fix).
        // Falls back to the inline data-URL if R2 is unbound or hiccups.
        let image = dataUrl(base64);
        if (env.SCRAPBOOKS) {
          try {
            const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
            const key = `${crypto.randomUUID()}.jpg`;
            await env.SCRAPBOOKS.put(key, bytes, { httpMetadata: { contentType: 'image/jpeg' } });
            image = `${new URL(request.url).origin}/scrapbook-img/${key}`;
          } catch {
            // keep the data-URL fallback
          }
        }
        ctx.waitUntil(
          logAiCall(env, {
            endpoint: 'scrapbook', model: IMAGE_MODEL, input: { titles }, output: { caption: scene },
            inputTokens: null, outputTokens: null, latencyMs: Date.now() - started, ok: true,
          }),
        );
        return Response.json({ image, caption: scene }, { headers: cors });
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

  // Daily web-push nudge (Phase 2). A Cloudflare Cron Trigger fires hourly; this sends a
  // payloadless push to each subscription whose local hour matches now. See push.ts.
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(sendDailyNudges(env, Date.now()));
  },
} satisfies ExportedHandler<Env>;
