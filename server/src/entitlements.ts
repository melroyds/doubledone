// The one D1 entitlement store, shared by every billing source. Stripe (web), Apple IAP (iOS) and
// Google Play Billing (Android, Path A) all write HERE, through the same upsert, so there is one row
// per user and one place premium is decided. "Stripe is the source of truth" is a business statement about which system
// owns pricing and refunds, not a module-ownership one: a RevenueCat handler reaching into
// stripe.ts for its writer would read as a bug forever, so the store lives on its own.
//
// Extracted from stripe.ts on 2026-07-18 when Apple IAP landed; the move is mechanical and
// stripe.test.ts proves the behaviour is unchanged.

import { type D1LikeDatabase } from './telemetry';

// The D1 shape is shared with telemetry; re-exported so callers (and tests) import it from here.
export type { D1LikeDatabase };

// Which billing system last wrote this entitlement. Drives the client's "Manage subscription"
// routing: an Apple subscription cannot be managed in Stripe's portal, a Google one only in Play.
export type EntitlementSource = 'stripe' | 'apple' | 'google';

/** The sources this column may hold, as a guard for anything read back out of it. */
export function isEntitlementSource(v: unknown): v is EntitlementSource {
  return v === 'stripe' || v === 'apple' || v === 'google';
}

export type Entitlement = {
  userId: string;
  premium: boolean;
  status: string;
  currentPeriodEnd: number | null;
  cancelAtPeriodEnd: boolean;
  customerId: string | null; // the Stripe customer id (Apple rows carry null: Apple has no portal)
  source: EntitlementSource;
  // RevenueCat writes only (2026-10-04). `eventMs` is the event's event_timestamp_ms, which RevenueCat keeps
  // the same across retries; `txn` is the store subscription's original_transaction_id. Absent (null) on
  // Stripe writes and on the reconcile, which then leave both columns as they were.
  eventMs?: number | null;
  txn?: string | null;
  // Stripe writes only (2026-11-01): the id of the Stripe subscription (sub_...) whose LIVE state this write
  // carries, read from Stripe by id at delivery time. Absent (null) on RevenueCat writes, the reconcile, and a
  // checkout that names no subscription.
  stripeSub?: string | null;
};

// The two RevenueCat rules (2026-10-04), appended to the guard below. Each stands aside when the incoming
// write or the stored row lacks the value, so Stripe writes and rows from before these columns behave as before.
const STORE_ORDER_GUARD = `AND (
           excluded.rc_event_ms IS NULL OR entitlements.rc_event_ms IS NULL
           OR excluded.rc_event_ms >= entitlements.rc_event_ms
           OR (entitlements.premium = 0
               AND excluded.rc_txn IS NOT NULL AND entitlements.rc_txn IS NOT NULL AND excluded.rc_txn <> entitlements.rc_txn
               AND excluded.premium = 1 AND excluded.status IN ('active', 'trialing') AND excluded.cancel_at_period_end = 0)
         )
       AND NOT (
           entitlements.premium = 1
           AND excluded.rc_txn IS NOT NULL AND entitlements.rc_txn IS NOT NULL AND excluded.rc_txn <> entitlements.rc_txn
           AND NOT (excluded.premium = 1 AND excluded.status IN ('active', 'trialing') AND excluded.cancel_at_period_end = 0)
         )`;

// The Stripe twin of the rc_txn rule (2026-11-01), appended after it. While the row's subscription is alive, a
// non-sale about a DIFFERENT Stripe subscription writes nothing. Alive means premium, or a Stripe row in dunning:
// Stripe maps past_due and unpaid to premium off while the subscription retries the card, and the checkout guard
// reads that state to refuse a second subscription, so an old subscription's ending must not erase it. Stands aside
// when either side names no subscription (RevenueCat writes, the reconcile, rows from before the column), and for
// the one recorded subscription the caller has shown Stripe holds as ended (?14, `endedSub`: the self-heal).
const STRIPE_SUBSCRIPTION_GUARD = `AND NOT (
           excluded.stripe_sub IS NOT NULL AND entitlements.stripe_sub IS NOT NULL AND excluded.stripe_sub <> entitlements.stripe_sub
           AND entitlements.stripe_sub IS NOT ?14
           AND (entitlements.premium = 1
                OR (COALESCE(entitlements.source, 'stripe') = 'stripe' AND COALESCE(entitlements.status, '') IN ('past_due', 'unpaid')))
           AND NOT (excluded.premium = 1 AND excluded.status IN ('active', 'trialing') AND excluded.cancel_at_period_end = 0)
         )`;

// The D1 bindings `stripe_sub` is known to exist on (the breakdown_counts pattern), so it is looked for once per
// binding, not on every write.
const stripeSubReady = new WeakSet<object>();

/** Whether entitlements has `stripe_sub`, or null when the answer names no columns at all (no such table, or a
 *  test double that is not a database): then nothing is altered and the write itself has the last word. */
async function hasStripeSubColumn(db: D1LikeDatabase): Promise<boolean | null> {
  const { results } = await db.prepare('PRAGMA table_info(entitlements)').all<{ name?: unknown }>();
  const names = (Array.isArray(results) ? results : []).map((c) => c?.name).filter((n): n is string => typeof n === 'string');
  return names.length === 0 ? null : names.includes('stripe_sub');
}

/**
 * Add entitlements.stripe_sub where it is missing, once per binding, so the Worker deploy that first writes it
 * never waits on a schema apply (the scrapbook_log lesson, which is why the tables here are created at runtime too).
 * PRAGMA first, and the ALTER only for a table that is there without it. Another isolate can add it between the
 * two: the ALTER then fails as a duplicate column, and a second look settles it. Never throws. A column it cannot
 * confirm is looked for again on the next write, and meanwhile the write fails loudly, so the webhook answers 500
 * and the store retries.
 */
async function ensureEntitlementColumns(db: D1LikeDatabase): Promise<void> {
  if (stripeSubReady.has(db)) return;
  try {
    const has = await hasStripeSubColumn(db);
    if (has === null) return;
    if (!has) {
      try {
        await db.prepare('ALTER TABLE entitlements ADD COLUMN stripe_sub text').run();
      } catch {
        if ((await hasStripeSubColumn(db)) !== true) return; // not a race lost to another isolate: leave it unmarked
      }
    }
    stripeSubReady.add(db);
  } catch {
    // a store hiccup: unmarked, so the next write looks again
  }
}

/**
 * Upsert an entitlement. `started_at` (tenure) is set once, on first premium grant, and preserved
 * thereafter so a lapse never resets the loyalty clock. `source` records which biller wrote it.
 *
 * THE CROSS-STORE GUARD (Path A, 2026-09-30, tightened by review the same day). One row holds one
 * premium, whichever store last SOLD it, and with three stores an unconditional write let any of them
 * switch off another's live subscription (a Refund-and-revoke on an old Google order ending a paying
 * Stripe member's access). So, while the row is premium, a write from a DIFFERENT store lands only if it
 * is a real sale: premium on, status active or trialing, and renewing. A store winding down (a cancel
 * with access left, a billing issue, a Stripe cancel_at update, a reconcile of a subscription already
 * set to end) cannot take the row over, so its later expiry cannot end what another store still sells.
 * The row's own store may always write, and a row that is not premium takes any write. A pre-2026-07 row
 * with a null source is Stripe's.
 *
 * THE ORDER AND WHICH-SUBSCRIPTION GUARDS (2026-10-04, parked "before Play production", found overdue the
 * day after Play went live, then corrected by an adversarial review the same day). RevenueCat delivers
 * at-least-once, out of order, and retries for about two and a half hours, keeping the event's own
 * event_timestamp_ms. The row remembers the time of the last RevenueCat event it applied (`rc_event_ms`)
 * and the store subscription behind it (`rc_txn`, the original_transaction_id).
 * - ORDER: an event OLDER than the last one applied writes nothing, so a retried EXPIRATION can no longer
 *   switch off a payer whose RENEWAL already landed. One exception: a fresh sale of a DIFFERENT
 *   subscription landing on a row that is OFF, so a delayed new purchase is never refused because an old,
 *   dead subscription's refund happened to be stamped later. (On a LIVE row there is no exception: a
 *   retried old sale must not take a live subscription over.)
 * - WHICH SUBSCRIPTION: while the row is premium, a non-sale about a DIFFERENT subscription writes nothing,
 *   so a refund settling hours later for an old subscription (a real Play refund did exactly that on
 *   2026-10-03) can no longer switch off a new one bought since.
 * - KEEPING THE PAIR TRUE: any write that names a subscription records it. A premium write that names none
 *   (Stripe, the reconcile) clears it, and the reconcile clears the clock too, so the guards stand aside
 *   until RevenueCat next names the live subscription. Without that, a reconcile after a lapse left the old
 *   subscription's id in place and every cancel, expiry and refund of the real one was refused, which would
 *   have kept Premium on for ever.
 *
 * THE STRIPE WHICH-SUBSCRIPTION GUARD (2026-11-01, sweep #1). The Stripe webhook now writes the LIVE
 * subscription, read by id when the event arrives (stripe.ts), which settles the ORDER of one subscription's
 * events: a retried past_due that lands after the card was fixed writes what Stripe says now, active. What a live
 * read cannot settle is WHICH subscription the row is about. The row records it (`stripe_sub`), and while that
 * subscription is alive (premium, or a Stripe row in dunning), a non-sale about a different one writes nothing,
 * so an old subscription's incomplete_expired can no longer switch off a new paid one. The pair is kept true the
 * RevenueCat way: a write that names a subscription records it, a premium write that names none clears it, and a
 * non-premium write that names none leaves it. `stripe_sub` is added at runtime where missing
 * (ensureEntitlementColumns), so no deploy waits on an ALTER.
 *
 * The guard trusts the recorded id, and an id can go stale: a Worker from before the column (a rollback, a deploy
 * from a branch without it, a D1 restore) writes a new subscription's state and leaves the old id behind, and that
 * id would then refuse the real subscription's past_due and ending for ever, keeping Premium on for a non-payer.
 * So the webhook checks a refused write's recorded subscription against Stripe (stripe.ts healStaleSubscription),
 * and when Stripe holds it as ended, writes again with `endedSub` naming it: the guard then stands aside for that
 * one id only, in the same statement, so a row that moved on meanwhile is still protected.
 *
 * `ifSubUnknown` (a purchase grant written from a checkout session's own copy while Stripe cannot be read): the
 * session is the oldest news there is about its subscription, so it lands only where the row does not already
 * name that subscription. Anything recorded about it (an earlier grant, its live state, its ending) is as new or
 * newer, and an ending must never be undone by a session retried after it.
 *
 * `attachOnly` (the sign-in reconcile, revenuecat-api.ts): write ONLY where the account has no Premium row
 * yet, or a lapsed one. It never restates a live Premium row, because RevenueCat's subscriber view cannot
 * say "payment failing": a subscription in Google's grace period reads there as plainly active, and the
 * reconcile used to overwrite the webhook's `past_due` with `active` on every app start, hiding the "fix
 * your payment" box (device test 8d, 2026-10-03). Checked inside the same statement, so a webhook landing
 * mid-reconcile can never be overwritten either.
 *
 * What it does NOT solve: two genuinely live stores for one person resolve to whichever SOLD last. The
 * durable answer is a row per (user, store) with premium = any live one, parked in the Backlog.
 *
 * Returns true when the row was written, false when a guard kept it, and null when the driver does not
 * report a change count (the in-memory test doubles), which callers treat as written.
 */
export async function writeEntitlement(
  db: D1LikeDatabase,
  ent: Entitlement,
  nowISO: string,
  opts: { attachOnly?: boolean; endedSub?: string; ifSubUnknown?: boolean } = {},
): Promise<boolean | null> {
  await ensureEntitlementColumns(db);
  const guard = opts.attachOnly
    ? `WHERE entitlements.premium = 0`
    : `WHERE (
           entitlements.premium = 0
           OR COALESCE(entitlements.source, 'stripe') = excluded.source
           OR (excluded.premium = 1 AND excluded.status IN ('active', 'trialing') AND excluded.cancel_at_period_end = 0)
         )`;
  const subUnknown = opts.ifSubUnknown ? `AND (entitlements.stripe_sub IS NULL OR entitlements.stripe_sub <> excluded.stripe_sub)` : '';
  const res = await db
    .prepare(
      `INSERT INTO entitlements (user_id, premium, status, current_period_end, cancel_at_period_end, started_at, stripe_customer_id, source, updated_at, rc_event_ms, rc_txn, stripe_sub)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?13)
       -- ?12: 1 for the attach-only reconcile, which clears the RevenueCat pair. ?13: the Stripe subscription, or null.
       -- ?14: the recorded Stripe subscription the caller showed has ended (the self-heal), or null
       ON CONFLICT(user_id) DO UPDATE SET
         premium = ?2,
         status = ?3,
         current_period_end = COALESCE(?4, entitlements.current_period_end),
         cancel_at_period_end = ?5,
         started_at = COALESCE(entitlements.started_at, ?6),
         stripe_customer_id = COALESCE(?7, entitlements.stripe_customer_id),
         source = ?8,
         updated_at = ?9,
         rc_event_ms = CASE WHEN ?12 = 1 THEN NULL ELSE COALESCE(?10, entitlements.rc_event_ms) END,
         rc_txn = CASE WHEN ?12 = 1 THEN NULL WHEN ?11 IS NOT NULL THEN ?11 WHEN ?2 = 1 THEN NULL ELSE entitlements.rc_txn END,
         stripe_sub = CASE WHEN ?13 IS NOT NULL THEN ?13 WHEN ?2 = 1 THEN NULL ELSE entitlements.stripe_sub END
       ${guard}
       ${STORE_ORDER_GUARD}
       ${STRIPE_SUBSCRIPTION_GUARD}
       ${subUnknown}`,
    )
    .bind(
      ent.userId,
      ent.premium ? 1 : 0,
      ent.status,
      ent.currentPeriodEnd,
      ent.cancelAtPeriodEnd ? 1 : 0,
      ent.premium ? nowISO : null,
      ent.customerId,
      ent.source,
      nowISO,
      opts.attachOnly ? null : (ent.eventMs ?? null),
      opts.attachOnly ? null : (ent.txn ?? null),
      opts.attachOnly ? 1 : 0,
      opts.attachOnly ? null : (ent.stripeSub ?? null),
      opts.endedSub ?? null,
    )
    .run();
  const changes = (res as { meta?: { changes?: unknown } } | null | undefined)?.meta?.changes;
  return typeof changes === 'number' ? changes > 0 : null;
}

export type EntitlementView = {
  premium: boolean;
  status: string | null;
  since: string | null;
  currentPeriodEnd: number | null;
  cancelAtPeriodEnd: boolean;
  customerId: string | null;
  source: EntitlementSource | null; // null = a pre-2026-07 row, which is always Stripe
};

/** The row's store, with a pre-2026-07 null read as the Stripe it always was. */
export function sourceOf(view: Pick<EntitlementView, 'source'>): EntitlementSource {
  return view.source ?? 'stripe';
}

export async function readEntitlement(db: D1LikeDatabase, userId: string): Promise<EntitlementView> {
  const row = await db
    .prepare('SELECT premium, status, started_at, current_period_end, cancel_at_period_end, stripe_customer_id, source FROM entitlements WHERE user_id = ?1')
    .bind(userId)
    .first<{
      premium: number;
      status: string | null;
      started_at: string | null;
      current_period_end: number | null;
      cancel_at_period_end: number | null;
      stripe_customer_id: string | null;
      source: string | null;
    }>();
  if (!row) return { premium: false, status: null, since: null, currentPeriodEnd: null, cancelAtPeriodEnd: false, customerId: null, source: null };
  return {
    premium: row.premium === 1,
    status: row.status,
    since: row.started_at,
    currentPeriodEnd: row.current_period_end,
    cancelAtPeriodEnd: row.cancel_at_period_end === 1,
    customerId: row.stripe_customer_id,
    source: isEntitlementSource(row.source) ? row.source : null,
  };
}
