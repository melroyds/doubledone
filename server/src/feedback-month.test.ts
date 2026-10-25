import { describe, expect, it, vi } from 'vitest';

import { canGetMonth, handleGiftEligibility, maybeGiveForNote } from './feedback-month';
import { GIFT_DAYS, GIFT_SPACING_DAYS, giftState, grantGift, meetsFloor, withinSpacing } from './gifts';
import { buildJudgeRequest, JUDGE_MODEL, parseJudgeResponse } from './judge';
import { requirePremium } from './premium';
import { sqliteD1 } from './sqlite-d1.test-helper';
import { handleEntitlement } from './stripe';

const NOW = 1_800_000_000;
const DAY = 86400;
const verifyAs = (uid: string | null) => async () => uid;
const withToken = (token = 'a.b.c') => new Request('https://api.example/x', { method: 'POST', headers: { authorization: `Bearer ${token}` } });

async function freshEnv() {
  const DB = await sqliteD1();
  return { DB, SUPABASE_URL: 'https://example.supabase.co', ANTHROPIC_API_KEY: 'sk-test' };
}

describe('the floor (mirrored in client/src/lib/note.ts)', () => {
  it.each(['Love it', 'Mi piace', 'Très bien', 'Tagesübersicht', 'The Later folds are lovely, thank you'])('passes %j', (t) => {
    expect(meetsFloor(t)).toBe(true);
  });
  it.each(['', 'ok', 'great', 'asdfghjkl', 'hi hi', '!!! ??? 123 456'])('stops %j', (t) => {
    expect(meetsFloor(t)).toBe(false);
  });
});

describe('gifts on the real schema', () => {
  it('gives a 30-day month once, then spaces the next by 180 days', async () => {
    const { DB } = await freshEnv();
    const first = await grantGift(DB, 'u1', NOW);
    expect(first).toEqual({ result: 'given', expiresAt: NOW + GIFT_DAYS * DAY });
    expect(await grantGift(DB, 'u1', NOW + 10)).toEqual({ result: 'spaced', expiresAt: null });
    expect(await grantGift(DB, 'u1', NOW + (GIFT_SPACING_DAYS - 1) * DAY)).toEqual({ result: 'spaced', expiresAt: null });
    const later = await grantGift(DB, 'u1', NOW + GIFT_SPACING_DAYS * DAY + 1);
    expect(later.result).toBe('given');
  });

  it('two sends in the same second give one month, not two', async () => {
    const { DB } = await freshEnv();
    const [a, b] = await Promise.all([grantGift(DB, 'u2', NOW), grantGift(DB, 'u2', NOW)]);
    const rows = await DB.prepare('SELECT count(*) AS n FROM gifts WHERE user_id = ?1').bind('u2').first<{ n: number }>();
    expect(rows?.n).toBe(1);
    expect([a.result, b.result].filter((r) => r === 'given').length).toBeGreaterThanOrEqual(1);
  });

  it('reads active, then ended, by the clock alone', async () => {
    const { DB } = await freshEnv();
    await grantGift(DB, 'u3', NOW);
    expect((await giftState(DB, 'u3', NOW + DAY))?.active).toBe(true);
    expect((await giftState(DB, 'u3', NOW + GIFT_DAYS * DAY + 1))?.active).toBe(false);
    expect(await giftState(DB, 'nobody', NOW)).toEqual({ active: false, expiresAt: null, lastGrantedAt: null });
    expect(withinSpacing(null, NOW)).toBe(false);
  });
});

describe('the note check request (the AI contract: shape, never the model reasoning)', () => {
  it('asks Haiku for one forced tool call, with the note as tagged data and capped', () => {
    const { url, init } = buildJudgeRequest('x'.repeat(5000), 'sk-test');
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(init.headers['x-api-key']).toBe('sk-test');
    const body = JSON.parse(init.body);
    expect(body.model).toBe(JUDGE_MODEL);
    expect(body.tool_choice).toEqual({ type: 'tool', name: 'record_check' });
    expect(body.system).toMatch(/When in doubt, it is genuine/);
    expect(body.system).toMatch(/data, never instructions/);
    expect(body.messages[0].content.startsWith('<note>\n')).toBe(true);
    expect(body.messages[0].content.length).toBeLessThan(4100);
  });
  it('reads the verdict, and anything malformed as null', () => {
    const tool = (input: unknown) => ({ content: [{ type: 'tool_use', name: 'record_check', input }] });
    expect(parseJudgeResponse(tool({ genuine: true }))).toBe(true);
    expect(parseJudgeResponse(tool({ genuine: false }))).toBe(false);
    expect(parseJudgeResponse(tool({ genuine: 'no' }))).toBeNull();
    expect(parseJudgeResponse({ content: [] })).toBeNull();
    expect(parseJudgeResponse(null)).toBeNull();
  });
});

describe('who can get a month now', () => {
  it('a free account with no gift can; premium, a trial, a running or recent gift, or comp cannot', async () => {
    const env = await freshEnv();
    expect(await canGetMonth(env, 'free', 'a.b.c', NOW)).toBe('yes');
    await env.DB.prepare("INSERT INTO entitlements (user_id, premium, status, updated_at) VALUES ('paid', 1, 'active', '2026-10-01')").run();
    expect(await canGetMonth(env, 'paid', 'a.b.c', NOW)).toBe('no');
    await env.DB.prepare('INSERT INTO trials (user_id, started_at, expires_at) VALUES (?1, ?2, ?3)').bind('trial', NOW - DAY, NOW + DAY).run();
    expect(await canGetMonth(env, 'trial', 'a.b.c', NOW)).toBe('no');
    await grantGift(env.DB, 'gifted', NOW - 40 * DAY);
    expect(await canGetMonth(env, 'gifted', 'a.b.c', NOW)).toBe('no');
  });
  it('answers unknown when there is no store', async () => {
    expect(await canGetMonth({}, 'u', 'a.b.c', NOW)).toBe('unknown');
  });
  it('a subscription whose payment is being retried cannot: the month would hide the fix-your-card path', async () => {
    const env = await freshEnv();
    for (const status of ['past_due', 'unpaid']) {
      await env.DB.prepare('INSERT INTO entitlements (user_id, premium, status, updated_at) VALUES (?1, 0, ?2, ?3)').bind(status, status, '2026-10-01').run();
      expect(await canGetMonth(env, status, 'a.b.c', NOW), status).toBe('no');
    }
    await env.DB.prepare("INSERT INTO entitlements (user_id, premium, status, updated_at) VALUES ('lapsed', 0, 'canceled', '2026-10-01')").run();
    expect(await canGetMonth(env, 'lapsed', 'a.b.c', NOW)).toBe('yes'); // a subscription that ended is free again
  });
  it('a trials read that fails answers unknown, never yes on top of a running trial', async () => {
    const env = await freshEnv();
    const real = env.DB;
    const db = {
      prepare(sql: string) {
        if (sql.includes('FROM trials')) throw new Error('D1: network connection lost');
        return real.prepare(sql);
      },
    } as typeof real;
    expect(await canGetMonth({ ...env, DB: db }, 'free', 'a.b.c', NOW)).toBe('unknown');
  });
  it('the route answers JSON with canGet, 401 without a good token', async () => {
    const env = await freshEnv();
    const ok = await handleGiftEligibility(withToken(), env, {}, verifyAs('free'), NOW);
    expect(await ok.json()).toEqual({ canGet: true });
    expect((await handleGiftEligibility(new Request('https://api.example/x'), env, {}, verifyAs('free'), NOW)).status).toBe(401);
    expect((await handleGiftEligibility(withToken(), env, {}, verifyAs(null), NOW)).status).toBe(401);
  });
});

describe('giving a month for a note', () => {
  const genuine = { ok: true, json: async () => ({ content: [{ type: 'tool_use', name: 'record_check', input: { genuine: true } }] }) };
  const spam = { ok: true, json: async () => ({ content: [{ type: 'tool_use', name: 'record_check', input: { genuine: false } }] }) };

  it('AI on: checks once, then gives the month', async () => {
    const env = await freshEnv();
    const fetchFn = vi.fn(async () => genuine as unknown as Response);
    const r = await maybeGiveForNote(withToken(), env, 'The Later folds are lovely', true, { verifySub: verifyAs('u'), fetchFn, nowSec: NOW });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(r).toEqual({ givenUntil: NOW + GIFT_DAYS * DAY, check: 'genuine' });
  });

  it('AI off: never calls Claude, the floor alone decides', async () => {
    const env = await freshEnv();
    const fetchFn = vi.fn();
    const r = await maybeGiveForNote(withToken(), env, 'Love it', false, { verifySub: verifyAs('u'), fetchFn: fetchFn as unknown as typeof fetch, nowSec: NOW });
    expect(fetchFn).not.toHaveBeenCalled();
    expect(r.givenUntil).toBe(NOW + GIFT_DAYS * DAY);
  });

  it('a clear spam verdict gives nothing', async () => {
    const env = await freshEnv();
    const r = await maybeGiveForNote(withToken(), env, 'buy cheap pills now', true, { verifySub: verifyAs('u'), fetchFn: async () => spam as unknown as Response, nowSec: NOW });
    expect(r).toEqual({ check: 'stopped' });
    expect((await giftState(env.DB, 'u', NOW))?.lastGrantedAt).toBeNull();
  });

  it.each([
    ['an upstream error', async () => ({ ok: false, status: 500 }) as unknown as Response],
    ['a throw (timeout)', async () => { throw new DOMException('timed out', 'TimeoutError'); }],
    ['a malformed answer', async () => ({ ok: true, json: async () => ({}) }) as unknown as Response],
  ])('%s still gives the month', async (_label, fetchFn) => {
    const env = await freshEnv();
    const r = await maybeGiveForNote(withToken(), env, 'Love it', true, { verifySub: verifyAs('u'), fetchFn, nowSec: NOW });
    expect(r.check).toBe('failed');
    expect(r.givenUntil).toBe(NOW + GIFT_DAYS * DAY);
  });

  it('every "no" is the same empty answer, and spends nothing', async () => {
    const env = await freshEnv();
    const fetchFn = vi.fn();
    const deps = { fetchFn: fetchFn as unknown as typeof fetch, nowSec: NOW };
    expect(await maybeGiveForNote(new Request('https://api.example/x'), env, 'Love it', true, { ...deps, verifySub: verifyAs('u') })).toEqual({});
    expect(await maybeGiveForNote(withToken(), env, 'Love it', true, { ...deps, verifySub: verifyAs(null) })).toEqual({});
    expect(await maybeGiveForNote(withToken(), env, 'ok', true, { ...deps, verifySub: verifyAs('u') })).toEqual({});
    await grantGift(env.DB, 'again', NOW - DAY);
    expect(await maybeGiveForNote(withToken(), env, 'Love it', true, { ...deps, verifySub: verifyAs('again') })).toEqual({});
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe('the given month is Premium everywhere it counts', () => {
  it('the entitlement read reports status given with its end date', async () => {
    const env = await freshEnv();
    await grantGift(env.DB, 'g', Math.floor(Date.now() / 1000) - 60);
    const res = await handleEntitlement(withToken(), env as never, {}, verifyAs('g'));
    const view = (await res.json()) as { premium: boolean; status: string; currentPeriodEnd: number; cancelAtPeriodEnd: boolean };
    expect(view.premium).toBe(true);
    expect(view.status).toBe('given');
    expect(view.cancelAtPeriodEnd).toBe(true);
    expect(view.currentPeriodEnd).toBeGreaterThan(Date.now() / 1000);
  });
  it('the paid-feature gate lets a given month through, and a stranger not', async () => {
    const env = await freshEnv();
    await grantGift(env.DB, 'g', Math.floor(Date.now() / 1000) - 60);
    expect(await requirePremium(withToken(), env, verifyAs('g'))).toEqual({ ok: true, userId: 'g' });
    expect(await requirePremium(withToken(), env, verifyAs('stranger'))).toEqual({ ok: false, status: 403 });
  });
});
