import { describe, expect, it } from 'vitest';

import {
  checkoutSessionForm,
  type D1LikeDatabase,
  entitlementFromEvent,
  parseSigHeader,
  readEntitlement,
  signPayload,
  verifyWebhook,
  writeEntitlement,
} from './stripe';

const env = { STRIPE_PRICE_ID: 'price_123', APP_URL: 'https://doubledone.app' };

describe('checkoutSessionForm', () => {
  it('builds a subscription checkout carrying the user id on session and subscription', () => {
    const f = checkoutSessionForm(env, 'user-1', 'a@b.co');
    expect(f.get('mode')).toBe('subscription');
    expect(f.get('line_items[0][price]')).toBe('price_123');
    expect(f.get('client_reference_id')).toBe('user-1');
    expect(f.get('metadata[user_id]')).toBe('user-1');
    expect(f.get('subscription_data[metadata][user_id]')).toBe('user-1');
    expect(f.get('success_url')).toBe('https://doubledone.app/premium?status=success');
    expect(f.get('customer_email')).toBe('a@b.co');
  });
});

describe('webhook signature', () => {
  it('parses a Stripe-Signature header', () => {
    expect(parseSigHeader('t=123,v1=abc,v1=def')).toEqual({ t: '123', v1: ['abc', 'def'] });
  });

  it('verifies a correctly signed payload and rejects tampering / staleness', async () => {
    const body = JSON.stringify({ hello: 'world' });
    const secret = 'test-signing-secret';
    const now = 1_750_000_000;
    const header = await signPayload(body, secret, now);

    expect(await verifyWebhook(body, header, secret, 300, now)).toBe(true);
    expect(await verifyWebhook(body + ' ', header, secret, 300, now)).toBe(false); // tampered body
    expect(await verifyWebhook(body, header, 'a-different-secret', 300, now)).toBe(false); // wrong secret
    expect(await verifyWebhook(body, header, secret, 300, now + 1000)).toBe(false); // outside tolerance
    expect(await verifyWebhook(body, 'garbage', secret, 300, now)).toBe(false);
  });
});

describe('entitlementFromEvent', () => {
  it('grants premium on a paid checkout session, capturing the customer id', () => {
    const ent = entitlementFromEvent({
      type: 'checkout.session.completed',
      data: { object: { client_reference_id: 'u1', payment_status: 'paid', status: 'complete', customer: 'cus_1' } },
    });
    expect(ent).toEqual({ userId: 'u1', premium: true, status: 'active', currentPeriodEnd: null, cancelAtPeriodEnd: false, customerId: 'cus_1' });
  });

  it('tracks subscription status changes by metadata user id', () => {
    const active = entitlementFromEvent({
      type: 'customer.subscription.updated',
      data: { object: { metadata: { user_id: 'u2' }, status: 'active', current_period_end: 1_760_000_000 } },
    });
    expect(active).toMatchObject({ userId: 'u2', premium: true, currentPeriodEnd: 1_760_000_000 });

    const canceled = entitlementFromEvent({
      type: 'customer.subscription.deleted',
      data: { object: { metadata: { user_id: 'u2' }, status: 'canceled' } },
    });
    expect(canceled).toMatchObject({ userId: 'u2', premium: false, status: 'canceled' });
  });

  it('reads cancel_at_period_end and the dahlia items period', () => {
    const ent = entitlementFromEvent({
      type: 'customer.subscription.updated',
      data: { object: { metadata: { user_id: 'u3' }, status: 'active', cancel_at_period_end: true, items: { data: [{ current_period_end: 1_765_000_000 }] } } },
    });
    expect(ent).toMatchObject({ userId: 'u3', premium: true, cancelAtPeriodEnd: true, currentPeriodEnd: 1_765_000_000 });
  });

  it('ignores unrelated events and events with no user id', () => {
    expect(entitlementFromEvent({ type: 'invoice.paid', data: { object: {} } })).toBeNull();
    expect(entitlementFromEvent({ type: 'checkout.session.completed', data: { object: { payment_status: 'paid' } } })).toBeNull();
  });
});

// Minimal in-memory D1 that honours the upsert's COALESCE(started_at) tenure rule.
function fakeDb(): D1LikeDatabase & { rows: Map<string, Record<string, unknown>> } {
  const rows = new Map<string, Record<string, unknown>>();
  return {
    rows,
    prepare(_sql: string) {
      let args: unknown[] = [];
      const stmt = {
        bind(...a: unknown[]) {
          args = a;
          return stmt;
        },
        async run() {
          const [userId, premium, status, cpe, cancelAtEnd, startedAt, customerId, updatedAt] = args as [
            string,
            number,
            string,
            number | null,
            number,
            string | null,
            string | null,
            string,
          ];
          const existing = rows.get(userId);
          rows.set(userId, {
            user_id: userId,
            premium,
            status,
            current_period_end: cpe ?? (existing?.current_period_end as number | null) ?? null, // COALESCE(new, existing)
            cancel_at_period_end: cancelAtEnd,
            started_at: (existing?.started_at as string | null) ?? startedAt, // COALESCE(existing, new)
            stripe_customer_id: customerId ?? (existing?.stripe_customer_id as string | null) ?? null,
            updated_at: updatedAt,
          });
        },
        async first<T>() {
          const r = rows.get(args[0] as string);
          return (r ?? null) as T | null;
        },
      };
      return stmt;
    },
  };
}

describe('entitlement store', () => {
  it('writes premium then reads it back, preserving the tenure start and customer across a cancel', async () => {
    const db = fakeDb();
    await writeEntitlement(db, { userId: 'u1', premium: true, status: 'active', currentPeriodEnd: 123, cancelAtPeriodEnd: false, customerId: 'cus_1' }, '2026-06-20T00:00:00Z');
    let view = await readEntitlement(db, 'u1');
    expect(view).toEqual({ premium: true, status: 'active', since: '2026-06-20T00:00:00Z', currentPeriodEnd: 123, cancelAtPeriodEnd: false, customerId: 'cus_1' });

    // a cancel-at-period-end keeps premium active but flags the pending cancel, and must
    // NOT reset the tenure clock or lose the customer (a null customer must not clobber it)
    await writeEntitlement(db, { userId: 'u1', premium: true, status: 'active', currentPeriodEnd: 123, cancelAtPeriodEnd: true, customerId: null }, '2026-09-01T00:00:00Z');
    view = await readEntitlement(db, 'u1');
    expect(view.cancelAtPeriodEnd).toBe(true);
    expect(view.since).toBe('2026-06-20T00:00:00Z');
    expect(view.customerId).toBe('cus_1'); // preserved by COALESCE
  });

  it('reports not-premium for an unknown user', async () => {
    expect(await readEntitlement(fakeDb(), 'nobody')).toEqual({ premium: false, status: null, since: null, currentPeriodEnd: null, cancelAtPeriodEnd: false, customerId: null });
  });
});
