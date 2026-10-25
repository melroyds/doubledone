// "A month on us" (decision log 2026-10-25), the server half. Two jobs:
//   1. GET /gift/eligibility answers "can this account get a month now?", the one answer every offer surface in the
//      app is gated on, so nobody is ever shown a promise that is then not kept.
//   2. After POST /feedback has emailed a note, maybeGiveForNote gives the month when the sender can get one, the
//      note meets the floor, and (with AI on) Claude does not call it spam. It never changes what the sender sees
//      beyond C1 or C2, and the route answers the same way whatever the check said.
// Who is asking is settled by VERIFYING the bearer (it grants Premium), never by decoding it.

import { isCompEmail } from './comp';
import { giftState, grantGift, meetsFloor, withinSpacing } from './gifts';
import { buildJudgeRequest, JUDGE_MODEL, parseJudgeResponse } from './judge';
import { decodeJwtEmail } from './mcp';
import { bearer, type D1LikeDatabase, readEntitlement } from './stripe';
import { defaultVerifySub, type SubVerifier } from './verify';

export type GiftEnv = { DB?: D1LikeDatabase; SUPABASE_URL?: string; COMP_EMAILS?: string; ANTHROPIC_API_KEY?: string };

export type Eligibility = 'yes' | 'no' | 'unknown';

/** Can this verified account get a month now? 'no' for anyone Premium from any source (paid, comp, the card-free
 *  month, a month already running), anyone whose subscription payment is being retried, or anyone given one in the
 *  last 180 days; 'unknown' when a store cannot be read, never a yes. */
export async function canGetMonth(env: GiftEnv, userId: string, token: string, nowSec: number): Promise<Eligibility> {
  if (!env.DB) return 'unknown';
  if (isCompEmail(decodeJwtEmail(token), env.COMP_EMAILS)) return 'no';
  try {
    const ent = await readEntitlement(env.DB, userId);
    // A payment being retried reads premium false at Stripe. A month given then would hide the fix-your-card path
    // for its whole run while the retries ran out (the handoff's F3: a retried payment gets C2, no month).
    if (ent.premium || ent.status === 'past_due' || ent.status === 'unpaid') return 'no';
    // The trial is read here, not through activeTrial, which reads a store error as "no trial": right for a
    // Premium gate, wrong for a gift, where it would answer yes on top of a running card-free month.
    const trial = await env.DB.prepare('SELECT expires_at FROM trials WHERE user_id = ?1').bind(userId).first<{ expires_at: number }>();
    if (typeof trial?.expires_at === 'number' && trial.expires_at > nowSec) return 'no';
  } catch {
    return 'unknown';
  }
  const gift = await giftState(env.DB, userId, nowSec);
  if (!gift) return 'unknown';
  return gift.active || withinSpacing(gift.lastGrantedAt, nowSec) ? 'no' : 'yes';
}

/** GET /gift/eligibility: { canGet } for a verified caller. 401 without a good token, 503 when it cannot tell (the
 *  app reads both as "no offer"). Answers in JSON with a `canGet` boolean, so a client can tell it apart from the
 *  Worker's catch-all 200 on an older deploy. */
export async function handleGiftEligibility(
  request: Request,
  env: GiftEnv,
  cors: Record<string, string>,
  verifySub: SubVerifier = defaultVerifySub,
  nowSec: number = Math.floor(Date.now() / 1000),
): Promise<Response> {
  const json = (body: unknown, status: number) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...cors } });
  const token = bearer(request);
  if (!token) return json({ error: 'sign_in_required' }, 401);
  const userId = await verifySub(token, env.SUPABASE_URL ?? '');
  if (!userId) return json({ error: 'sign_in_required' }, 401);
  const answer = await canGetMonth(env, userId, token, nowSec);
  if (answer === 'unknown') return json({ error: 'unavailable' }, 503);
  return json({ canGet: answer === 'yes' }, 200);
}

export type NoteCheck = 'genuine' | 'stopped' | 'failed' | 'skipped';
export type GiveResult = { givenUntil?: number; check?: NoteCheck };

export type GiveDeps = {
  verifySub?: SubVerifier;
  fetchFn?: typeof fetch;
  nowSec?: number;
  /** Records the AI call for the spend monitor. Called with the note's length only, never its text. */
  logCheck?: (entry: { ok: boolean; latencyMs: number; error?: string; raw?: unknown }) => void;
};

const CHECK_TIMEOUT_MS = 8000;

/**
 * Give a month for this note when it should be given. Never throws, and returns {} for every "no" (no token, a bad
 * token, not eligible, below the floor, a store error), so the caller's reply never depends on why. With AI on and
 * a key, Claude checks the note once: only a clear "spam" verdict stops it, and a timeout or an error passes.
 */
export async function maybeGiveForNote(
  request: Request,
  env: GiftEnv,
  text: string,
  aiAllowed: boolean,
  deps: GiveDeps = {},
): Promise<GiveResult> {
  try {
    const token = bearer(request);
    if (!token || !env.DB) return {};
    const userId = await (deps.verifySub ?? defaultVerifySub)(token, env.SUPABASE_URL ?? '');
    if (!userId) return {};
    const nowSec = deps.nowSec ?? Math.floor(Date.now() / 1000);
    if ((await canGetMonth(env, userId, token, nowSec)) !== 'yes') return {};
    if (!meetsFloor(text)) return {};
    let check: NoteCheck = 'skipped';
    if (aiAllowed && env.ANTHROPIC_API_KEY) {
      const started = Date.now();
      try {
        const { url, init } = buildJudgeRequest(text, env.ANTHROPIC_API_KEY);
        const res = await (deps.fetchFn ?? fetch)(url, { ...(init as RequestInit), signal: AbortSignal.timeout(CHECK_TIMEOUT_MS) });
        if (!res.ok) {
          check = 'failed';
          deps.logCheck?.({ ok: false, latencyMs: Date.now() - started, error: `upstream ${res.status}` });
        } else {
          const raw = await res.json();
          const verdict = parseJudgeResponse(raw);
          check = verdict === false ? 'stopped' : verdict === true ? 'genuine' : 'failed';
          deps.logCheck?.({ ok: true, latencyMs: Date.now() - started, raw });
        }
      } catch (e) {
        check = 'failed';
        deps.logCheck?.({ ok: false, latencyMs: Date.now() - started, error: e instanceof Error ? e.name : 'error' });
      }
    }
    if (check === 'stopped') return { check };
    const grant = await grantGift(env.DB, userId, nowSec);
    return grant.result === 'given' && grant.expiresAt != null ? { givenUntil: grant.expiresAt, check } : { check };
  } catch {
    return {};
  }
}

export { JUDGE_MODEL };
