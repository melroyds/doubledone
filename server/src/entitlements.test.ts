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

describe('writeEntitlement: only a real sale takes a premium row from another store (review 2026-09-30)', () => {
  it('keeps a foreign write that is premium ON but winding down (cancelled, cancelling, or in dunning)', async () => {
    for (const over of [
      { status: 'canceled', cancelAtPeriodEnd: true },
      { status: 'active', cancelAtPeriodEnd: true }, // a Stripe cancel_at update, a reconcile already set to end
      { status: 'past_due', cancelAtPeriodEnd: false }, // a billing issue
    ]) {
      const db = await sqliteD1();
      await writeEntitlement(db, on('google'), NOW);
      expect(await writeEntitlement(db, on('stripe', over), NOW), JSON.stringify(over)).toBe(false);
      expect((await readEntitlement(db, UID)).source).toBe('google');
    }
  });

  it('lets a foreign trialing sale take the row, and the same store always write its own wind-down', async () => {
    const db = await sqliteD1();
    await writeEntitlement(db, on('google'), NOW);
    expect(await writeEntitlement(db, on('stripe', { status: 'trialing' }), NOW)).toBe(true);
    expect(await writeEntitlement(db, on('stripe', { status: 'canceled', cancelAtPeriodEnd: true }), NOW)).toBe(true);
    expect(await readEntitlement(db, UID)).toMatchObject({ source: 'stripe', status: 'canceled', cancelAtPeriodEnd: true });
  });

  it('lets any write land on a row that is not premium (a lapsed Stripe row, an Apple cancel with access left)', async () => {
    const db = await sqliteD1();
    await writeEntitlement(db, off('stripe', 'canceled'), NOW);
    expect(await writeEntitlement(db, on('apple', { status: 'canceled', cancelAtPeriodEnd: true }), NOW)).toBe(true);
    expect(await readEntitlement(db, UID)).toMatchObject({ premium: true, source: 'apple' });
  });
});

// Device test 8d (2026-10-03): the sign-in reconcile restated a grace-period row as 'active' on every app
// start, which hid the "fix your payment" box. attachOnly writes only where there is no live Premium row.
describe('writeEntitlement attachOnly: the reconcile never restates a live row', () => {
  const g = (over: Partial<Parameters<typeof writeEntitlement>[1]> = {}) => ({
    userId: 'u1', customerId: null, source: 'google' as const, premium: true, status: 'active', currentPeriodEnd: 1_800_000_000, cancelAtPeriodEnd: false, ...over,
  });

  it('attaches when there is no row at all', async () => {
    const db = await sqliteD1();
    expect(await writeEntitlement(db, g(), 'now', { attachOnly: true })).toBe(true);
    expect((await readEntitlement(db, 'u1')).premium).toBe(true);
  });

  it('attaches over a lapsed row (premium off)', async () => {
    const db = await sqliteD1();
    await writeEntitlement(db, g({ premium: false, status: 'expired' }), 't1');
    expect(await writeEntitlement(db, g(), 't2', { attachOnly: true })).toBe(true);
    expect(await readEntitlement(db, 'u1')).toMatchObject({ premium: true, status: 'active' });
  });

  it('leaves a live grace-period row exactly as the webhook wrote it', async () => {
    const db = await sqliteD1();
    await writeEntitlement(db, g({ status: 'past_due', cancelAtPeriodEnd: true, currentPeriodEnd: 1_700_000_000 }), 't1');
    expect(await writeEntitlement(db, g({ status: 'active', currentPeriodEnd: 1_800_000_000 }), 't2', { attachOnly: true })).toBe(false);
    expect(await readEntitlement(db, 'u1')).toMatchObject({ premium: true, status: 'past_due', cancelAtPeriodEnd: true, currentPeriodEnd: 1_700_000_000 });
  });

  it('never takes a live row from another store either', async () => {
    const db = await sqliteD1();
    await writeEntitlement(db, g({ source: 'stripe', status: 'active' }), 't1');
    expect(await writeEntitlement(db, g({ source: 'google' }), 't2', { attachOnly: true })).toBe(false);
    expect((await readEntitlement(db, 'u1')).source).toBe('stripe');
  });

  it('leaves the webhook path exactly as it was (a same-store write still lands)', async () => {
    const db = await sqliteD1();
    await writeEntitlement(db, g({ status: 'active' }), 't1');
    expect(await writeEntitlement(db, g({ status: 'past_due' }), 't2')).toBe(true);
    expect((await readEntitlement(db, 'u1')).status).toBe('past_due');
  });
});

// 2026-10-04: the order and which-subscription guards, at the writer, in real SQLite.
describe('writeEntitlement: order and which-subscription guards', () => {
  const ent = (over: Partial<Parameters<typeof writeEntitlement>[1]> = {}) => ({
    userId: 'u1', customerId: null, source: 'google' as const, premium: true, status: 'active', currentPeriodEnd: 1_800_000_000, cancelAtPeriodEnd: false, eventMs: 100, txn: 'GPA.X', ...over,
  });

  it('never lets an older event overwrite a newer one', async () => {
    const db = await sqliteD1();
    await writeEntitlement(db, ent({ eventMs: 200 }), 't1');
    expect(await writeEntitlement(db, ent({ premium: false, status: 'expired', eventMs: 150 }), 't2')).toBe(false);
    expect((await readEntitlement(db, 'u1')).premium).toBe(true);
    expect(await writeEntitlement(db, ent({ premium: false, status: 'expired', eventMs: 250 }), 't3')).toBe(true);
    expect((await readEntitlement(db, 'u1')).premium).toBe(false);
  });

  it('refuses any non-sale write about a different subscription while the row is premium', async () => {
    const db = await sqliteD1();
    await writeEntitlement(db, ent({ txn: 'GPA.Y', eventMs: 100 }), 't1');
    for (const w of [
      ent({ txn: 'GPA.X', premium: false, status: 'canceled', cancelAtPeriodEnd: true, eventMs: 300 }),
      ent({ txn: 'GPA.X', premium: true, status: 'canceled', cancelAtPeriodEnd: true, eventMs: 300 }),
      ent({ txn: 'GPA.X', premium: true, status: 'past_due', eventMs: 300 }),
    ]) expect(await writeEntitlement(db, w, 't2')).toBe(false);
    expect(await readEntitlement(db, 'u1')).toMatchObject({ premium: true, status: 'active', cancelAtPeriodEnd: false });
  });

  it('lets a fresh sale of a different subscription through, and records it as the live one', async () => {
    const db = await sqliteD1();
    await writeEntitlement(db, ent({ txn: 'GPA.X', status: 'past_due', eventMs: 100 }), 't1');
    expect(await writeEntitlement(db, ent({ txn: 'GPA.Y', eventMs: 200 }), 't2')).toBe(true);
    // a revoke for X is now refused, and for Y it lands
    expect(await writeEntitlement(db, ent({ txn: 'GPA.X', premium: false, status: 'expired', eventMs: 300 }), 't3')).toBe(false);
    expect(await writeEntitlement(db, ent({ txn: 'GPA.Y', premium: false, status: 'expired', eventMs: 300 }), 't4')).toBe(true);
  });

  it('leaves Stripe writes, the reconcile and old rows exactly as before (no event time, no txn)', async () => {
    const db = await sqliteD1();
    await writeEntitlement(db, ent({ source: 'stripe', eventMs: null, txn: null }), 't1');
    expect(await writeEntitlement(db, ent({ source: 'stripe', premium: false, status: 'canceled', eventMs: null, txn: null }), 't2')).toBe(true);
    const db2 = await sqliteD1();
    await writeEntitlement(db2, ent({ eventMs: 500 }), 't1');
    // a Stripe write carries no event time: the order guard stands aside, and the stored time is kept
    expect(await writeEntitlement(db2, ent({ source: 'google', status: 'past_due', eventMs: null, txn: null }), 't2')).toBe(true);
    expect(await writeEntitlement(db2, ent({ premium: false, status: 'expired', eventMs: 400 }), 't3')).toBe(false);
  });
});

// 2026-11-01 (sweep #1): the Stripe twin of the rc_txn rule, at the writer, in real SQLite. The webhook writes the
// LIVE subscription (stripe.ts), so these writes are what Stripe says about a subscription NOW.
type RealDb = Awaited<ReturnType<typeof sqliteD1>>;
const stripeSubOf = (db: RealDb): string | null =>
  (db.raw.prepare('SELECT stripe_sub FROM entitlements WHERE user_id = ?').get(UID) as { stripe_sub: string | null } | undefined)?.stripe_sub ?? null;
const live = (over: Partial<Entitlement> = {}): Entitlement => on('stripe', { stripeSub: 'sub_new', ...over });

describe('writeEntitlement: the Stripe which-subscription guard', () => {
  it("an old subscription's ending never switches off a new paid one", async () => {
    const db = await sqliteD1();
    expect(await writeEntitlement(db, live(), NOW)).toBe(true);
    for (const status of ['incomplete_expired', 'canceled', 'past_due', 'unpaid', 'incomplete']) {
      expect(await writeEntitlement(db, live({ stripeSub: 'sub_old', premium: false, status }), NOW), status).toBe(false);
    }
    // nor the old one winding down with access left (set to cancel)
    expect(await writeEntitlement(db, live({ stripeSub: 'sub_old', cancelAtPeriodEnd: true }), NOW)).toBe(false);
    expect(await readEntitlement(db, UID)).toMatchObject({ premium: true, status: 'active', cancelAtPeriodEnd: false });
    expect(stripeSubOf(db)).toBe('sub_new');
  });

  it("the row's own subscription still ends it, and a fresh sale of another takes it over", async () => {
    const db = await sqliteD1();
    await writeEntitlement(db, live(), NOW);
    expect(await writeEntitlement(db, live({ premium: false, status: 'past_due' }), NOW)).toBe(true);
    expect(await readEntitlement(db, UID)).toMatchObject({ premium: false, status: 'past_due' });

    const db2 = await sqliteD1();
    await writeEntitlement(db2, live({ stripeSub: 'sub_old' }), NOW);
    expect(await writeEntitlement(db2, live({ status: 'trialing' }), NOW)).toBe(true); // the card-free month's checkout
    expect(stripeSubOf(db2)).toBe('sub_new');
    expect(await writeEntitlement(db2, live({ stripeSub: 'sub_old', premium: false, status: 'canceled' }), NOW)).toBe(false);
    expect(await readEntitlement(db2, UID)).toMatchObject({ premium: true, status: 'trialing' });
  });

  it('a Stripe subscription in dunning is not erased by another one ending, so the checkout guard still sees it', async () => {
    const db = await sqliteD1();
    await writeEntitlement(db, live({ premium: false, status: 'past_due' }), NOW);
    expect(await writeEntitlement(db, live({ stripeSub: 'sub_old', premium: false, status: 'canceled' }), NOW)).toBe(false);
    expect(await readEntitlement(db, UID)).toMatchObject({ premium: false, status: 'past_due', customerId: 'cus_1' });
    // a lapsed row (nothing alive) takes any write, as before
    const db2 = await sqliteD1();
    await writeEntitlement(db2, live({ premium: false, status: 'canceled' }), NOW);
    expect(await writeEntitlement(db2, live({ stripeSub: 'sub_old', premium: false, status: 'incomplete_expired' }), NOW)).toBe(true);
  });

  it('stands aside for a row from before the column, and the write that lands records its subscription', async () => {
    const db = await sqliteD1();
    await writeEntitlement(db, live({ stripeSub: null }), NOW);
    expect(stripeSubOf(db)).toBeNull();
    expect(await writeEntitlement(db, live({ stripeSub: 'sub_old', premium: false, status: 'canceled' }), NOW)).toBe(true);
    expect(stripeSubOf(db)).toBe('sub_old');
  });

  it('keeps the pair true: a premium write that names none clears it, a lapse that names none leaves it', async () => {
    const db = await sqliteD1();
    await writeEntitlement(db, live(), NOW);
    await writeEntitlement(db, on('google'), NOW); // a Google sale takes the row: no Stripe id is left to judge by
    expect(stripeSubOf(db)).toBeNull();
    const db2 = await sqliteD1();
    await writeEntitlement(db2, live({ premium: false, status: 'canceled' }), NOW);
    expect(await writeEntitlement(db2, off('google'), NOW)).toBe(true);
    expect(stripeSubOf(db2)).toBe('sub_new');
  });

  it('RevenueCat writes stand aside, and a live Apple or Google row still keeps a Stripe ending out', async () => {
    for (const source of ['apple', 'google'] as const) {
      const db = await sqliteD1();
      await writeEntitlement(db, on(source), NOW);
      expect(await writeEntitlement(db, live({ premium: false, status: 'canceled' }), NOW), source).toBe(false);
      expect(await readEntitlement(db, UID), source).toMatchObject({ premium: true, source });
      // ...and the store that sold it still ends it, with no Stripe id in the way
      expect(await writeEntitlement(db, off(source), NOW), source).toBe(true);
    }
  });

  it('the reconcile, attaching a store purchase over a lapsed Stripe row, clears the Stripe id', async () => {
    const db = await sqliteD1();
    await writeEntitlement(db, live({ premium: false, status: 'canceled' }), NOW);
    expect(await writeEntitlement(db, on('apple'), NOW, { attachOnly: true })).toBe(true);
    expect(stripeSubOf(db)).toBeNull();
  });
});

describe('the stripe_sub column is added at runtime where a database lacks it', () => {
  async function withoutColumn(): Promise<RealDb> {
    const db = await sqliteD1();
    db.raw.exec('ALTER TABLE entitlements DROP COLUMN stripe_sub');
    return db;
  }
  const columns = (db: RealDb) => (db.raw.prepare('PRAGMA table_info(entitlements)').all() as { name: string }[]).map((c) => c.name);

  it('adds it on the first write, and that write lands with it', async () => {
    const db = await withoutColumn();
    expect(columns(db)).not.toContain('stripe_sub');
    expect(await writeEntitlement(db, live(), NOW)).toBe(true);
    expect(columns(db)).toContain('stripe_sub');
    expect(stripeSubOf(db)).toBe('sub_new');
  });

  it('looks once per binding, not on every write', async () => {
    const db = await sqliteD1();
    let looks = 0;
    const counted: D1LikeDatabase = {
      prepare: (sql) => {
        if (sql.startsWith('PRAGMA table_info')) looks += 1;
        return db.prepare(sql);
      },
    };
    await writeEntitlement(counted, live(), NOW);
    await writeEntitlement(counted, live({ status: 'trialing' }), NOW);
    expect(looks).toBe(1);
  });

  it('tolerates another isolate adding it between the look and the ALTER', async () => {
    const db = await withoutColumn();
    const racing: D1LikeDatabase = {
      prepare: (sql) => {
        // the other isolate wins: the column appears just before our ALTER runs, which then fails as a duplicate
        if (sql.startsWith('ALTER TABLE entitlements ADD COLUMN stripe_sub')) db.raw.exec('ALTER TABLE entitlements ADD COLUMN stripe_sub text');
        return db.prepare(sql);
      },
    };
    expect(await writeEntitlement(racing, live(), NOW)).toBe(true);
    expect(stripeSubOf(db)).toBe('sub_new');
  });

  it('a column it cannot add fails the write loudly, and is tried again on the next write', async () => {
    const db = await withoutColumn();
    let refuse = true;
    const flaky: D1LikeDatabase = {
      prepare: (sql) => {
        if (refuse && sql.startsWith('ALTER TABLE')) throw new Error('d1 busy');
        return db.prepare(sql);
      },
    };
    await expect(writeEntitlement(flaky, live(), NOW)).rejects.toThrow();
    expect(await readEntitlement(db, UID)).toMatchObject({ premium: false, status: null }); // nothing half-written
    refuse = false;
    expect(await writeEntitlement(flaky, live(), NOW)).toBe(true);
    expect(columns(db)).toContain('stripe_sub');
  });

  it('alters nothing where the answer names no columns (a missing table, or a test double)', async () => {
    const seen: string[] = [];
    const double: D1LikeDatabase = {
      prepare: (sql) => {
        seen.push(sql.trim().split(/\s+/).slice(0, 2).join(' '));
        const s = { bind: () => s, run: async () => undefined, first: async () => null, all: async () => ({ results: [] }) };
        return s;
      },
    };
    expect(await writeEntitlement(double, live(), NOW)).toBeNull();
    expect(seen).toEqual(['PRAGMA table_info(entitlements)', 'INSERT INTO']);
  });
});
