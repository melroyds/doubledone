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
export async function writeEntitlement(db: D1LikeDatabase, ent: Entitlement, nowISO: string, opts: { attachOnly?: boolean } = {}): Promise<boolean | null> {
  const guard = opts.attachOnly
    ? `WHERE entitlements.premium = 0`
    : `WHERE (
           entitlements.premium = 0
           OR COALESCE(entitlements.source, 'stripe') = excluded.source
           OR (excluded.premium = 1 AND excluded.status IN ('active', 'trialing') AND excluded.cancel_at_period_end = 0)
         )`;
  const res = await db
    .prepare(
      `INSERT INTO entitlements (user_id, premium, status, current_period_end, cancel_at_period_end, started_at, stripe_customer_id, source, updated_at, rc_event_ms, rc_txn)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
       -- ?12: 1 for the attach-only reconcile, which clears the RevenueCat pair
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
         rc_txn = CASE WHEN ?12 = 1 THEN NULL WHEN ?11 IS NOT NULL THEN ?11 WHEN ?2 = 1 THEN NULL ELSE entitlements.rc_txn END
       ${guard}
       ${STORE_ORDER_GUARD}`,
    )
    .bind(ent.userId, ent.premium ? 1 : 0, ent.status, ent.currentPeriodEnd, ent.cancelAtPeriodEnd ? 1 : 0, ent.premium ? nowISO : null, ent.customerId, ent.source, nowISO, opts.attachOnly ? null : (ent.eventMs ?? null), opts.attachOnly ? null : (ent.txn ?? null), opts.attachOnly ? 1 : 0)
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
