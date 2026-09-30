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
 * THE CROSS-STORE GUARD (Path A, 2026-09-30). One row holds one premium, whichever store sold it, and
 * with three stores an unconditional write lets any of them switch off another's live subscription: a
 * Refund-and-revoke on an old Google order would end a paying Stripe member's access, and a late Stripe
 * event would end a live Google one. So a write that turns premium OFF lands only when the row is not
 * premium, or when the row's own source is the one writing. A write that turns premium ON always lands
 * and takes the source over, because erring towards access is the safe way to be wrong about money
 * someone has paid. A pre-2026-07 row with a null source is Stripe's.
 *
 * Returns true when the row was written, false when the guard kept it, and null when the driver does
 * not report a change count (the in-memory test doubles), which callers treat as written.
 */
export async function writeEntitlement(db: D1LikeDatabase, ent: Entitlement, nowISO: string): Promise<boolean | null> {
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
       WHERE excluded.premium = 1 OR entitlements.premium = 0 OR COALESCE(entitlements.source, 'stripe') = excluded.source`,
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
