// The one D1 entitlement store, shared by both billing sources. Stripe (web + Android) and Apple
// IAP (iOS) both write HERE, through the same upsert, so there is one row per user and one place
// premium is decided. "Stripe is the source of truth" is a business statement about which system
// owns pricing and refunds, not a module-ownership one: a RevenueCat handler reaching into
// stripe.ts for its writer would read as a bug forever, so the store lives on its own.
//
// Extracted from stripe.ts on 2026-07-18 when Apple IAP landed; the move is mechanical and
// stripe.test.ts proves the behaviour is unchanged.

import { type D1LikeDatabase } from './telemetry';

// The D1 shape is shared with telemetry; re-exported so callers (and tests) import it from here.
export type { D1LikeDatabase };

// Which billing system last wrote this entitlement. Drives the client's "Manage subscription"
// routing: an Apple subscription cannot be managed in Stripe's portal, and vice versa.
export type EntitlementSource = 'stripe' | 'apple';

export type Entitlement = {
  userId: string;
  premium: boolean;
  status: string;
  currentPeriodEnd: number | null;
  cancelAtPeriodEnd: boolean;
  customerId: string | null; // the Stripe customer id (Apple rows carry null: Apple has no portal)
  source: EntitlementSource;
};

/** Upsert an entitlement. `started_at` (tenure) is set once, on first premium grant, and preserved
 *  thereafter so a lapse never resets the loyalty clock. `source` records which biller wrote it. */
export async function writeEntitlement(db: D1LikeDatabase, ent: Entitlement, nowISO: string): Promise<void> {
  await db
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
         updated_at = ?9`,
    )
    .bind(ent.userId, ent.premium ? 1 : 0, ent.status, ent.currentPeriodEnd, ent.cancelAtPeriodEnd ? 1 : 0, ent.premium ? nowISO : null, ent.customerId, ent.source, nowISO)
    .run();
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
    source: row.source === 'stripe' || row.source === 'apple' ? row.source : null,
  };
}
