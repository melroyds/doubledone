// Premium without an account (2026-11-03). An iPhone may buy Premium signed out (App Review 5.1.1), and
// then it has no Supabase token, which every server-gated Premium route needed. Such a phone now proves its
// purchase with its RevenueCat anonymous App User ID in the X-Purchaser-Token header, and this decides,
// from our own records and RevenueCat's, whether to serve it. requirePremium (premium.ts) calls it only when
// the request carries no Authorization header at all: a bearer always decides.
//
// THE TRUST MODEL. The id is a bearer secret: 128 random bits that live on the device, in RevenueCat and in
// our owner-only rc_events log. Its strict form (purchaser.ts) only rules out an account's uuid. It does not
// prove a purchase, because RevenueCat MERGES an anonymous id into any account that has no anonymous alias
// yet, through a logIn anyone can call with the public SDK key, and a merged id then reads that account's
// subscriptions. So what ties an id to a purchase is our own webhook log:
//   - Production Premium is honoured for an id that rc_events saw BUY: an INITIAL_PURCHASE, RENEWAL or
//     UNCANCELLATION of app.doubledone.premium.*, production, resolved to no account. Or, for a reinstall
//     that restored an old purchase onto a fresh id, when RevenueCat's original id for it is such a buyer.
//   - An id that ever arrived beside an account (an rc_events row resolved it, or a delivery listed it among
//     an account's aliases, see refuseForAccount) is refused outright, and so is one the owner blocked.
//   - Sandbox Premium (App Review, TestFlight, our own builds) is honoured for any id inside a daily
//     allowance, because this path writes nothing durable and App Review buys signed out in sandbox.
//
// WHAT IT KEEPS, and nothing else: the latest answer under the scrambled id (store_premium_cache, gone
// within two hours of its check), counters (store_premium_counts: global per minute, per scrambled id per
// hour, sandbox per day), and the scrambled ids it refuses (store_premium_refused). Never the id itself, in
// D1 or in any log line. The id travels only in the RevenueCat request's path, which v1 requires.
//
// Every refusal is a status, never a throw: 403 checked and not Premium (or refused), 429 this one purchase
// is being used far too much this hour, 503 cannot decide just now (D1, RevenueCat, a cap, the sandbox
// allowance). Nothing is ever cached from an answer we could not read.

import { logAppEvent } from './events';
import type { PremiumResult } from './premium'; // type-only: erased at runtime, so no import cycle
import { isAnonPurchaser, PREMIUM_PRODUCT_PREFIX, PURCHASE_TYPES, purchaserHash, REFUSED_DDL } from './purchaser';
import { buildSubscriberRequest, originalAppUserId, premiumFromSubscriber, type SubscriberPremium } from './rc-v1';
import { RC_EVENTS_DDL } from './revenuecat';
import type { D1LikeDatabase, D1LikeStatement } from './telemetry';

/** Named so Cloudflare's log redaction covers it: a request header whose name contains "token" is logged as
 *  REDACTED. The same name as client/src/lib/ai.ts PURCHASER_HEADER. */
export const PURCHASER_HEADER = 'X-Purchaser-Token';

export const STORE_YES_TTL_MS = 3_600_000; // a yes is re-checked hourly, and never kept past the store's own expiry
export const STORE_NO_TTL_MS = 60_000; // a no is kept a minute: a re-subscribe unlocks within one
export const STORE_LOOKUPS_PER_MINUTE = 10; // RevenueCat asks for ids our webhook never saw buy (the fallback lane), global
export const STORE_KNOWN_LOOKUPS_PER_MINUTE = 60; // RevenueCat asks for ids it did see buy, global, so a flood never reaches them
export const STORE_SERVED_PER_HOUR = 60; // requests one purchase may make an hour, every answer counted
export const STORE_SANDBOX_PER_PURCHASER_PER_DAY = 40; // served sandbox requests per purchase per UTC day
export const STORE_SANDBOX_PER_DAY = 100; // served sandbox requests per UTC day across everyone: the cost wall
export const STORE_SANDBOX_GRACE_MS = 600_000; // a sandbox month may renew a little late (premiumFromSubscriber)
export const STORE_RC_TIMEOUT_MS = 4_000;

export type StoreEnv = { DB?: D1LikeDatabase; RC_SECRET_KEY?: string };
export type StoreCheck = (purchaser: string, env: StoreEnv, nowMs: number) => Promise<PremiumResult>;
export type StoreDeps = { doFetch?: typeof fetch; timeoutMs?: number };

/** The proof this request carries, or null. Only the exact anonymous form: anything else (a uuid, a duplicated
 *  header, which Fetch joins with ", ", a percent-encoded value, a trailing character) is no proof at all. */
export function purchaserFrom(request: Request): string | null {
  const v = request.headers.get(PURCHASER_HEADER);
  return isAnonPurchaser(v) ? v : null;
}

const minuteOf = (ms: number) => Math.floor(ms / 60_000);
const hourOf = (ms: number) => Math.floor(ms / 3_600_000);
const dayOf = (ms: number) => Math.floor(ms / 86_400_000);

const CACHE_DDL =
  'CREATE TABLE IF NOT EXISTS store_premium_cache (id_hash text primary key, premium integer not null, sandbox integer not null default 0, expires_at integer not null, checked_at integer not null) WITHOUT ROWID';
const CACHE_EXPIRY_INDEX = 'CREATE INDEX IF NOT EXISTS store_premium_cache_exp ON store_premium_cache (expires_at)';
const COUNTS_DDL =
  'CREATE TABLE IF NOT EXISTS store_premium_counts (kind text not null, slot integer not null, n integer not null, primary key (kind, slot)) WITHOUT ROWID';
const RC_EVENTS_APP_USER_INDEX = 'CREATE INDEX IF NOT EXISTS rc_events_app_user ON rc_events (app_user_id)';

const PURCHASE_ROW =
  `type IN (${PURCHASE_TYPES.map((t) => `'${t}'`).join(', ')}) AND product_id LIKE '${PREMIUM_PRODUCT_PREFIX}%'`;

// Everything the decision needs before RevenueCat, in one read (D1's primary is a long way from India):
//   refused   blocked, or listed among an account's aliases
//   resolved  a delivery for this very id resolved to an account
//   bought    the webhook saw it buy in production, resolved to no account
//   tested    the same, in sandbox
// and the cached answer, if any. ?1 is the raw id, only ever as a bound parameter, to match rc_events.app_user_id.
const STANDING = `SELECT
  EXISTS (SELECT 1 FROM store_premium_refused WHERE id_hash = ?2) AS refused,
  EXISTS (SELECT 1 FROM rc_events WHERE app_user_id = ?1 AND user_id IS NOT NULL) AS resolved,
  EXISTS (SELECT 1 FROM rc_events WHERE app_user_id = ?1 AND user_id IS NULL AND ${PURCHASE_ROW}
            AND outcome = 'unresolved-user' AND UPPER(environment) = 'PRODUCTION') AS bought,
  EXISTS (SELECT 1 FROM rc_events WHERE app_user_id = ?1 AND user_id IS NULL AND ${PURCHASE_ROW}
            AND outcome = 'sandbox' AND UPPER(environment) = 'SANDBOX') AS tested,
  c.premium AS premium, c.sandbox AS sandbox, c.expires_at AS expires_at
FROM (SELECT 1) AS one LEFT JOIN store_premium_cache AS c ON c.id_hash = ?2`;

// Never backwards: of two answers written close together (two misses either side of a refund), the one from
// the later check wins, so an older yes can never re-open what a newer no closed.
const WRITE =
  'INSERT INTO store_premium_cache (id_hash, premium, sandbox, expires_at, checked_at) VALUES (?1, ?2, ?3, ?4, ?5) ' +
  'ON CONFLICT(id_hash) DO UPDATE SET premium = excluded.premium, sandbox = excluded.sandbox, expires_at = excluded.expires_at, ' +
  'checked_at = excluded.checked_at WHERE excluded.checked_at >= store_premium_cache.checked_at';
const PEEK = 'SELECT n FROM store_premium_counts WHERE kind = ?1 AND slot = ?2';
const COUNT = 'INSERT INTO store_premium_counts (kind, slot, n) VALUES (?1, ?2, 1) ON CONFLICT(kind, slot) DO UPDATE SET n = n + 1 RETURNING n';

// The D1 bindings the tables are known to exist on, so the DDL runs once per binding, not per request.
const tablesReady = new WeakSet<object>();

/** Create what the check reads, once per binding. One round trip where the binding can batch (D1 can), and the
 *  rc_events index the review asked for is created here too, so the gate's read is indexed. Throws on a store
 *  error (the caller answers 503). */
async function ensureStoreTables(db: D1LikeDatabase): Promise<void> {
  if (tablesReady.has(db)) return;
  const sqls = [RC_EVENTS_DDL, RC_EVENTS_APP_USER_INDEX, REFUSED_DDL, CACHE_DDL, CACHE_EXPIRY_INDEX, COUNTS_DDL];
  const batch = (db as { batch?: (statements: D1LikeStatement[]) => Promise<unknown> }).batch;
  if (typeof batch === 'function') await batch.call(db, sqls.map((q) => db.prepare(q)));
  else for (const q of sqls) await db.prepare(q).run();
  tablesReady.add(db);
}

type Standing = {
  refused: boolean;
  resolved: boolean;
  bought: boolean;
  tested: boolean;
  cache: { premium: boolean; sandbox: boolean; expiresAt: number } | null;
};

async function standingOf(db: D1LikeDatabase, id: string, hash: string): Promise<Standing> {
  const r = await db.prepare(STANDING).bind(id, hash).first<Record<string, unknown>>();
  if (!r) throw new Error('no standing'); // a one-row SELECT always answers: anything else is a store fault
  return {
    refused: Number(r.refused) === 1,
    resolved: Number(r.resolved) === 1,
    bought: Number(r.bought) === 1,
    tested: Number(r.tested) === 1,
    cache: r.expires_at == null ? null : { premium: Number(r.premium) === 1, sandbox: Number(r.sandbox) === 1, expiresAt: Number(r.expires_at) },
  };
}

/** Add one to a counter and say whether it is now past `max`. A count that does not come back reads as past.
 *  Throws on a store error (the caller fails closed). */
async function bump(db: D1LikeDatabase, kind: string, slot: number, max: number): Promise<boolean> {
  const { results } = await db.prepare(COUNT).bind(kind, slot).all<{ n: unknown }>();
  const n = Number(results?.[0]?.n);
  return !Number.isFinite(n) || n > max;
}

/** bump, but read first, so a flood past the cap costs reads rather than writes. However many race, the
 *  upsert's count is atomic, so at most `max` pass in a slot. */
async function bumpUnlessFull(db: D1LikeDatabase, kind: string, slot: number, max: number): Promise<boolean> {
  const row = await db.prepare(PEEK).bind(kind, slot).first<{ n: unknown }>();
  if (row && Number(row.n) >= max) return true;
  return bump(db, kind, slot, max);
}

// What this isolate already knows for the rest of a minute: a lookup lane that is shut (its cap was reached,
// or RevenueCat answered 429), and which once-a-minute counters it has already written. Keyed by the D1
// binding, so tests stay apart. It can only refuse or skip a counter, never let anything through.
const minuteMemo = new WeakMap<object, Map<string, number>>();
function memo(db: object): Map<string, number> {
  let m = minuteMemo.get(db);
  if (!m) {
    m = new Map();
    minuteMemo.set(db, m);
  }
  return m;
}

/** A counter written at most once a minute per isolate, for refusals a flood could otherwise repeat. */
async function logOncePerMinute(env: StoreEnv, db: D1LikeDatabase, event: string, nowMs: number): Promise<void> {
  const key = `log:${event}`;
  const minute = minuteOf(nowMs);
  if (memo(db).get(key) === minute) return;
  memo(db).set(key, minute);
  await logAppEvent(env, event);
}

type Lane = 'known' | 'fallback';

/** Whether this minute's RevenueCat lookups for the lane are spent. Throws on a store error. */
async function overLookupCap(env: StoreEnv, db: D1LikeDatabase, lane: Lane, nowMs: number): Promise<boolean> {
  const minute = minuteOf(nowMs);
  const key = `lane:${lane}`;
  if (memo(db).get(key) === minute) return true;
  const full =
    lane === 'known'
      ? await bumpUnlessFull(db, 'lookup.known', minute, STORE_KNOWN_LOOKUPS_PER_MINUTE)
      : await bumpUnlessFull(db, 'lookup', minute, STORE_LOOKUPS_PER_MINUTE);
  if (!full) return false;
  memo(db).set(key, minute);
  await logAppEvent(env, lane === 'known' ? 'premium.store.capped.known' : 'premium.store.capped');
  return true;
}

/** Count one served request against this purchase's hour (and, for sandbox, its day and everyone's), then serve. */
async function serve(env: StoreEnv, db: D1LikeDatabase, hash: string, sandbox: boolean, nowMs: number): Promise<PremiumResult> {
  try {
    if (await bump(db, `served:${hash}`, hourOf(nowMs), STORE_SERVED_PER_HOUR)) {
      await logOncePerMinute(env, db, 'premium.store.overused', nowMs);
      return { ok: false, status: 429 };
    }
    if (sandbox) {
      const day = dayOf(nowMs);
      // Each purchase has its own allowance, so one tester can never spend App Review's. Over either limit is a
      // 503 (try again), never a 403: the person really did buy, and "Premium isn't active" would be false.
      const spent =
        (await bump(db, `sandbox:${hash}`, day, STORE_SANDBOX_PER_PURCHASER_PER_DAY)) || (await bump(db, 'sandbox', day, STORE_SANDBOX_PER_DAY));
      if (spent) {
        await logOncePerMinute(env, db, 'premium.store.sandbox.spent', nowMs);
        return { ok: false, status: 503 };
      }
    }
  } catch {
    return { ok: false, status: 503 }; // a counter we cannot write is a cap we cannot keep: fail closed
  }
  return { ok: true, userId: null, purchaser: hash };
}

/** For an id our webhook never saw buy: is RevenueCat's ORIGINAL id for this customer a buyer it did see? That is
 *  a reinstall or a new phone whose Restore aliased the fresh id onto the old purchase. Throws on a store error. */
async function vouchedByOriginal(db: D1LikeDatabase, secret: string, id: string, body: unknown): Promise<boolean> {
  const original = originalAppUserId(body);
  if (!isAnonPurchaser(original) || original === id) return false;
  const st = await standingOf(db, original, await purchaserHash(original, secret));
  return st.bought && !st.refused && !st.resolved;
}

/**
 * The store check. `id` is already in the strict anonymous form (purchaserFrom). In order:
 *  1. Refused ids (an account's, or blocked) answer 403 before anything else, a cached yes included.
 *  2. A live cached answer is used as it is: no RevenueCat call.
 *  3. Otherwise RevenueCat is asked, under a global cap per minute: 60 for ids our webhook saw buy, 10 for the
 *     rest, so a flood of made-up ids can slow only the rare reinstall case, never a known buyer.
 *  4. Its answer is cached (a yes for an hour at most and never past the store's expiry, a no for a minute) and
 *     the request is served, counted against the purchase's hour and, for sandbox, its day.
 * Never throws.
 */
export async function checkStorePremium(id: string, env: StoreEnv, nowMs: number, deps: StoreDeps = {}): Promise<PremiumResult> {
  if (!env.DB || !env.RC_SECRET_KEY) return { ok: false, status: 503 }; // cannot decide: fail closed
  const db = env.DB;
  const secret = env.RC_SECRET_KEY;

  let hash: string;
  let st: Standing;
  try {
    hash = await purchaserHash(id, secret);
    await ensureStoreTables(db);
    st = await standingOf(db, id, hash);
  } catch {
    return { ok: false, status: 503 }; // D1 down: fail closed
  }

  if (st.refused || st.resolved) {
    await logOncePerMinute(env, db, 'premium.store.refused', nowMs);
    return { ok: false, status: 403 };
  }

  if (st.cache && st.cache.expiresAt > nowMs) {
    if (!st.cache.premium) return { ok: false, status: 403 };
    return serve(env, db, hash, st.cache.sandbox, nowMs);
  }

  try {
    if (await overLookupCap(env, db, st.bought || st.tested ? 'known' : 'fallback', nowMs)) return { ok: false, status: 503 };
  } catch {
    return { ok: false, status: 503 };
  }

  // Counted together at the end: a miss writes a few, and they should not each wait on D1 in turn.
  const events = ['premium.store.lookup'];
  const finish = async (result: PremiumResult): Promise<PremiumResult> => {
    await Promise.all(events.map((e) => logAppEvent(env, e)));
    return result;
  };

  let body: unknown = null;
  let verdict: SubscriberPremium;
  try {
    const { url, init } = buildSubscriberRequest(id, secret); // no X-Platform: a lookup must not move last_seen
    const res = await (deps.doFetch ?? fetch)(url, { ...init, signal: AbortSignal.timeout(deps.timeoutMs ?? STORE_RC_TIMEOUT_MS) });
    if (res.status === 404) {
      verdict = { kind: 'inactive' }; // never heard of it, as the reconcile reads it
    } else if (!res.ok) {
      if (res.status === 429) {
        // RevenueCat is throttling our key, which the reconcile and account deletion share: stop asking for the minute.
        memo(db).set('lane:known', minuteOf(nowMs));
        memo(db).set('lane:fallback', minuteOf(nowMs));
        events.push('premium.store.throttled');
      } else {
        events.push('premium.store.error');
      }
      return finish({ ok: false, status: 503 });
    } else {
      if (res.status === 201) events.push('premium.store.unknown'); // RevenueCat just created this customer
      body = await res.json(); // a body that is not JSON throws: caught below
      verdict = premiumFromSubscriber(body, nowMs, { sandboxGraceMs: STORE_SANDBOX_GRACE_MS });
    }
  } catch {
    events.push('premium.store.error'); // a timeout, the network, an unreadable body
    return finish({ ok: false, status: 503 });
  }
  if (verdict.kind === 'malformed') {
    events.push('premium.store.error');
    return finish({ ok: false, status: 503 }); // "cannot read it" is never remembered as a no
  }

  const sandbox = verdict.kind === 'active' && verdict.sandbox;
  let yes = verdict.kind === 'active';
  let unproven = false;
  if (yes && !sandbox && !st.bought) {
    // Production Premium for an id our webhook never saw buy: only a reinstall of a buyer it did see may have it.
    try {
      if (!(await vouchedByOriginal(db, secret, id, body))) {
        yes = false;
        unproven = true;
      }
    } catch {
      return finish({ ok: false, status: 503 });
    }
  }

  const expiresAt = verdict.kind === 'active' && yes ? Math.min(nowMs + STORE_YES_TTL_MS, verdict.untilMs) : nowMs + STORE_NO_TTL_MS;
  // A sandbox yes that has just run out is not remembered as a no: its renewal may simply not have landed yet.
  const keepNo = !(st.cache && st.cache.premium && st.cache.sandbox);
  if (yes || keepNo) {
    try {
      await db.prepare(WRITE).bind(hash, yes ? 1 : 0, yes && sandbox ? 1 : 0, expiresAt, nowMs).run();
    } catch {
      // the verdict came from RevenueCat just now, so it stands, and only the cache is lost
    }
  }
  events.push(unproven ? 'premium.store.unproven' : !yes ? 'premium.store.no' : sandbox ? 'premium.store.sandbox' : 'premium.store.yes');
  if (!yes) return finish({ ok: false, status: 403 });
  return finish(await serve(env, db, hash, sandbox, nowMs));
}

/** The :00 tick (index.ts scheduled): answers past their expiry, and counters whose minute, hour or UTC day is
 *  over. So an answer is gone within two hours of its check, and a per-purchase count within two hours of its
 *  hour. Best effort, never throws, never creates a table (a missing one just has nothing to delete). */
export async function purgeStorePremium(db: D1LikeDatabase | undefined, nowMs: number): Promise<void> {
  if (!db) return;
  try {
    await db.prepare('DELETE FROM store_premium_cache WHERE expires_at < ?1').bind(nowMs).run();
  } catch {
    // best effort: the next tick tries again
  }
  try {
    await db
      .prepare(
        "DELETE FROM store_premium_counts WHERE (kind IN ('lookup', 'lookup.known') AND slot < ?1) OR (kind LIKE 'served:%' AND slot < ?2) " +
          "OR ((kind = 'sandbox' OR kind LIKE 'sandbox:%') AND slot < ?3)",
      )
      .bind(minuteOf(nowMs), hourOf(nowMs), dayOf(nowMs))
      .run();
  } catch {
    // best effort
  }
}
