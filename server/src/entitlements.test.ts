import { describe, expect, it } from 'vitest';

import { type D1LikeDatabase, type Entitlement, isEntitlementSource, readEntitlement, sourceOf, writeEntitlement } from './entitlements';
import { sqliteD1 } from './sqlite-d1.test-helper';

// The store of record, in REAL SQLite against the REAL schema.sql (see sqlite-d1.test-helper.ts).

const UID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const NOW = '2026-09-30T00:00:00.000Z';
const on = (source: Entitlement['source'], over: Partial<Entitlement> = {}): Entitlement => ({
  userId: UID, premium: true, status: 'active', currentPeriodEnd: 1_900_000_000, cancelAtPeriodEnd: false, customerId: source === 'stripe' ? 'cus_1' : null, source, ...over,
});
const off = (source: Entitlement['source'], status = 'expired'): Entitlement => ({
  userId: UID, premium: false, status, currentPeriodEnd: null, cancelAtPeriodEnd: false, customerId: null, source,
});

describe('writeEntitlement: the cross-store guard, in real SQLite', () => {
  it('a Google revoke never switches off a live Stripe subscriber (Refund-and-revoke on an old order)', async () => {
    const db = await sqliteD1();
    expect(await writeEntitlement(db, on('stripe'), NOW)).toBe(true);
    expect(await writeEntitlement(db, off('google'), NOW)).toBe(false); // kept
    expect(await readEntitlement(db, UID)).toMatchObject({ premium: true, status: 'active', source: 'stripe', customerId: 'cus_1' });
  });

  it('a late Stripe event never switches off a live Google subscriber', async () => {
    const db = await sqliteD1();
    await writeEntitlement(db, on('google'), NOW);
    expect(await writeEntitlement(db, off('stripe', 'canceled'), NOW)).toBe(false);
    expect(await readEntitlement(db, UID)).toMatchObject({ premium: true, source: 'google' });
  });

  it('an Apple lapse never switches off a live Google subscriber, nor Google an Apple one', async () => {
    const db = await sqliteD1();
    await writeEntitlement(db, on('google'), NOW);
    expect(await writeEntitlement(db, off('apple'), NOW)).toBe(false);
    const db2 = await sqliteD1();
    await writeEntitlement(db2, on('apple'), NOW);
    expect(await writeEntitlement(db2, off('google', 'on_hold'), NOW)).toBe(false);
    expect(await readEntitlement(db2, UID)).toMatchObject({ premium: true, source: 'apple' });
  });

  it('the store that sold it CAN still switch it off: a real lapse still lands', async () => {
    for (const source of ['stripe', 'apple', 'google'] as const) {
      const db = await sqliteD1();
      await writeEntitlement(db, on(source), NOW);
      expect(await writeEntitlement(db, off(source), NOW), source).toBe(true);
      expect((await readEntitlement(db, UID)).premium, source).toBe(false);
    }
  });

  it('a pre-2026-07 row with a null source is Stripe: Stripe may switch it off, another store may not', async () => {
    const db = await sqliteD1();
    await db.prepare("INSERT INTO entitlements (user_id, premium, status, source, updated_at) VALUES (?1, 1, 'active', NULL, ?2)").bind(UID, NOW).run();
    expect(await writeEntitlement(db, off('google'), NOW)).toBe(false);
    expect(await writeEntitlement(db, off('stripe', 'canceled'), NOW)).toBe(true);
    expect(await readEntitlement(db, UID)).toMatchObject({ premium: false, status: 'canceled', source: 'stripe' });
  });

  it('a grant from any store always lands and takes the source over, keeping the old Stripe customer', async () => {
    const db = await sqliteD1();
    await writeEntitlement(db, on('stripe'), NOW);
    expect(await writeEntitlement(db, on('google'), NOW)).toBe(true);
    expect(await readEntitlement(db, UID)).toMatchObject({ premium: true, source: 'google', customerId: 'cus_1' });
    // ...and from then on, the old Stripe subscription ending cannot take the Google one down.
    expect(await writeEntitlement(db, off('stripe', 'canceled'), NOW)).toBe(false);
  });

  it('a status write on a row that is NOT premium always lands, whoever writes it', async () => {
    const db = await sqliteD1();
    await writeEntitlement(db, off('stripe', 'canceled'), NOW);
    expect(await writeEntitlement(db, off('google', 'on_hold'), NOW)).toBe(true);
    expect(await readEntitlement(db, UID)).toMatchObject({ premium: false, status: 'on_hold', source: 'google' });
  });

  it('keeps tenure across stores: started_at is set once, on the first grant', async () => {
    const db = await sqliteD1();
    await writeEntitlement(db, on('stripe'), '2026-01-01T00:00:00.000Z');
    await writeEntitlement(db, on('google'), NOW);
    expect((await readEntitlement(db, UID)).since).toBe('2026-01-01T00:00:00.000Z');
  });

  it('a first-ever write of a revoke is simply inserted (nothing to protect)', async () => {
    const db = await sqliteD1();
    expect(await writeEntitlement(db, off('google'), NOW)).toBe(true);
    expect(await readEntitlement(db, UID)).toMatchObject({ premium: false, source: 'google' });
  });

  it('answers null when the driver reports no change count (the in-memory doubles)', async () => {
    const db: D1LikeDatabase = {
      prepare: () => {
        const s = { bind: () => s, run: async () => undefined, first: async () => null, all: async () => ({ results: [] }) };
        return s;
      },
    };
    expect(await writeEntitlement(db, on('google'), NOW)).toBeNull();
  });
});

describe('readEntitlement and the source helpers', () => {
  it('reads a google row back as google, and an unknown source as null (Stripe)', async () => {
    const db = await sqliteD1();
    await writeEntitlement(db, on('google'), NOW);
    expect((await readEntitlement(db, UID)).source).toBe('google');
    await db.prepare("UPDATE entitlements SET source = 'amazon' WHERE user_id = ?1").bind(UID).run();
    const view = await readEntitlement(db, UID);
    expect(view.source).toBeNull();
    expect(sourceOf(view)).toBe('stripe');
  });

  it('isEntitlementSource knows exactly the three', () => {
    expect(['stripe', 'apple', 'google'].every(isEntitlementSource)).toBe(true);
    expect(['', 'amazon', 'PLAY_STORE', null, undefined, 1].some(isEntitlementSource)).toBe(false);
  });
});
