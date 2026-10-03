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
};

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
 * What it does NOT solve: two genuinely live stores for one person resolve to whichever SOLD last. The
 * durable answer is a row per (user, store) with premium = any live one, parked in the Backlog.
 *
 * NOT guarded yet: an old EXPIRATION retried after a RENEWAL landed. Comparing its expiry with the row's
 * period would also keep a real EARLY revoke (a refund), so it needs the event's own timestamp against
 * the renewal's. Parked in the Backlog with that design.
 *
 * Returns true when the row was written, false when the guard kept it, and null when the driver does
 * not report a change count (the in-memory test doubles), which callers treat as written.
 */
/**
 * `attachOnly` (the sign-in reconcile, revenuecat-api.ts): write ONLY where the account has no Premium row
 * yet, or a lapsed one. It never restates a live Premium row, because RevenueCat's subscriber view cannot
 * say "payment failing": a subscription in Google's grace period reads there as plainly active, and the
 * reconcile used to overwrite the webhook's `past_due` with `active` on every app start, hiding the "fix
 * your payment" box (found in device test 8d, 2026-10-03). The webhook is the source of truth for a live
 * subscription's state; the reconcile only fills in a purchase the webhook never delivered. Checked inside
 * the same statement, so a webhook landing mid-reconcile can never be overwritten either.
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
      `INSERT INTO entitlements (user_id, premium, status, current_period_end, cancel_at_period_end, started_at, stripe_customer_id, source, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
       ON CONFLICT(user_id) DO UPDATE SET
         premium = ?2,
         status = ?3,
         current_period_end = COALESCE(?4, entitlements.current_period_end),
         cancel_at_period_end = ?5,
         started_at = COALESCE(entitlements.started_at, ?6),
         stripe_customer_id = COALESCE(?7, entitlements.stripe_customer_id),
         source = ?8,
         updated_at = ?9
       ${guard}`,
    )
    .bind(ent.userId, ent.premium ? 1 : 0, ent.status, ent.currentPeriodEnd, ent.cancelAtPeriodEnd ? 1 : 0, ent.premium ? nowISO : null, ent.customerId, ent.source, nowISO)
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
