import { type SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import { billedByStore, closeBilling, deleteAccount } from './account';
import { type Entitlement, FREE_ENTITLEMENT } from './entitlement';

// One shared order log, so "billing before the RPC" is asserted directly rather than inferred.
function harness(opts: {
  session?: { access_token: string } | null;
  getSessionThrows?: boolean;
  rpcError?: { message: string } | null;
  signOutThrows?: boolean;
  billing?: Response | (() => Promise<Response>);
}) {
  const order: string[] = [];
  const getSession = vi.fn(async () => {
    if (opts.getSessionThrows) throw new Error('storage');
    return { data: { session: opts.session === undefined ? { access_token: 'tok-1' } : opts.session } };
  });
  const rpc = vi.fn(async (name: string) => {
    order.push(`rpc:${name}`);
    return { error: opts.rpcError ?? null };
  });
  const signOut = vi.fn(async () => {
    order.push('signOut');
    if (opts.signOutThrows) throw new Error('offline');
    return { error: null };
  });
  const requests: { url: string; init?: RequestInit }[] = [];
  const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
    order.push(`fetch:${new URL(url).pathname}`);
    requests.push({ url, init });
    const b = opts.billing ?? json({ cancelled: 0 });
    return typeof b === 'function' ? b() : b;
  });
  const client = { rpc, auth: { getSession, signOut } } as unknown as SupabaseClient;
  return { client, rpc, signOut, fetchImpl: fetchImpl as unknown as typeof fetch, fetchMock: fetchImpl, requests, order };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('deleteAccount: billing first', () => {
  it('closes billing, THEN calls the delete_account RPC, then signs out', async () => {
    const h = harness({ billing: json({ cancelled: 1 }) });
    const res = await deleteAccount(h.client, h.fetchImpl);
    expect(res).toEqual({ ok: true });
    expect(h.order).toEqual(['fetch:/account/close-billing', 'rpc:delete_account', 'signOut']);
  });

  it("sends the user's own token to the close-billing route, as a POST", async () => {
    const h = harness({ session: { access_token: 'tok-abc' } });
    await deleteAccount(h.client, h.fetchImpl);
    const { init } = h.requests[0];
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer tok-abc');
  });

  it('deletes a free account too (the route answers cancelled: 0)', async () => {
    const h = harness({ billing: json({ cancelled: 0 }) });
    expect(await deleteAccount(h.client, h.fetchImpl)).toEqual({ ok: true });
    expect(h.rpc).toHaveBeenCalledWith('delete_account');
  });

  // Every way billing can fail to close: nothing is deleted and nobody is signed out.
  const billingFailures: [string, Response | (() => Promise<Response>)][] = [
    ['a 502 from Stripe', json({ error: 'close_billing_failed' }, 502)],
    ['a 503 not configured', json({ error: 'not_configured' }, 503)],
    ['a 404', new Response('not found', { status: 404 })],
    // The Worker before this route existed answers any unknown path with a plain-text 200. Reading that as
    // success would delete a paying account with billing still running, so it must read as failure.
    ["an old Worker's plain-text 200", new Response('doubledone-ai', { status: 200 })],
    ['a 200 without a count', json({ ok: true })],
    ['a network failure', async () => Promise.reject(new TypeError('Network request failed'))],
  ];
  for (const [label, billing] of billingFailures) {
    it(`deletes NOTHING when billing cannot be closed: ${label}`, async () => {
      const h = harness({ billing });
      expect(await deleteAccount(h.client, h.fetchImpl)).toEqual({ ok: false, error: 'billing' });
      expect(h.rpc).not.toHaveBeenCalled();
      expect(h.signOut).not.toHaveBeenCalled();
    });
  }

  it('asks for a fresh sign-in on a 401, deleting nothing', async () => {
    const h = harness({ billing: json({ error: 'sign_in_required' }, 401) });
    expect(await deleteAccount(h.client, h.fetchImpl)).toEqual({ ok: false, error: 'sign_in' });
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it('asks for sign-in, calling nothing, when there is no session or it cannot be read', async () => {
    for (const h of [harness({ session: null }), harness({ getSessionThrows: true })]) {
      expect(await deleteAccount(h.client, h.fetchImpl)).toEqual({ ok: false, error: 'sign_in' });
      expect(h.fetchMock).not.toHaveBeenCalled();
      expect(h.rpc).not.toHaveBeenCalled();
    }
  });

  it('says how many subscriptions were cancelled when the delete fails after billing closed', async () => {
    const h = harness({ billing: json({ cancelled: 1 }), rpcError: { message: 'boom' } });
    expect(await deleteAccount(h.client, h.fetchImpl)).toEqual({ ok: false, error: 'delete', cancelled: 1 });
  });

  it('reports a failed delete (billing already closed) and does NOT sign out', async () => {
    const h = harness({ rpcError: { message: 'boom' } });
    expect(await deleteAccount(h.client, h.fetchImpl)).toEqual({ ok: false, error: 'delete', cancelled: 0 });
    expect(h.signOut).not.toHaveBeenCalled();
  });

  it('still reports success when the sign-out after a real delete throws (the account is already gone)', async () => {
    const h = harness({ signOutThrows: true });
    expect(await deleteAccount(h.client, h.fetchImpl)).toEqual({ ok: true });
  });
});

describe('closeBilling', () => {
  it('returns the count on a 200 with a numeric cancelled', async () => {
    const f = vi.fn(async () => json({ cancelled: 2 })) as unknown as typeof fetch;
    expect(await closeBilling('t', f)).toEqual({ ok: true, cancelled: 2 });
  });

  it('never throws: a rejected fetch is a calm failure', async () => {
    const f = vi.fn(async () => Promise.reject(new Error('down'))) as unknown as typeof fetch;
    expect(await closeBilling('t', f)).toEqual({ ok: false, error: 'failed' });
  });
});

describe('billedByStore (the store line on the delete confirmation)', () => {
  const ent = (e: Partial<Entitlement>): Entitlement => ({ ...FREE_ENTITLEMENT, ...e });
  const cases: [string, Entitlement, 'apple' | 'google' | null][] = [
    ['an active Apple subscriber', ent({ premium: true, status: 'active', source: 'apple' }), 'apple'],
    ['an Apple subscriber in billing retry (BILLING_ISSUE keeps premium on)', ent({ premium: true, status: 'past_due', source: 'apple' }), 'apple'],
    ['an Apple subscriber with auto-renew off, still inside the period', ent({ premium: true, status: 'canceled', cancelAtPeriodEnd: true, source: 'apple' }), 'apple'],
    ['an expired Apple row (nothing bills any more)', ent({ premium: false, status: 'expired', source: 'apple' }), null],
    ['an active Google Play subscriber (deleting turns its renewal off)', ent({ premium: true, status: 'active', source: 'google' }), 'google'],
    ['a Google Play subscriber in its grace period', ent({ premium: true, status: 'past_due', source: 'google' }), 'google'],
    ['an expired Google Play row', ent({ premium: false, status: 'expired', source: 'google' }), null],
    ['a Stripe subscriber (the Worker cancels that one)', ent({ premium: true, status: 'active', source: 'stripe' }), null],
    ['an old Stripe row with no source', ent({ premium: true, status: 'active', source: null }), null],
    ['a free account', FREE_ENTITLEMENT, null],
  ];
  for (const [label, e, want] of cases) {
    it(`answers ${want ?? 'nothing'} for ${label}`, () => {
      expect(billedByStore(e)).toBe(want);
    });
  }
});

// The Play hint (the 2026-10-01 review): a webhook can lag a fresh Play purchase, and the server only asks
// RevenueCat about Play for someone it has a Play record of.
describe('closeBilling sends the Play hint only when asked', () => {
  const ok = () => vi.fn(async () => new Response(JSON.stringify({ cancelled: 0 }), { status: 200 })) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
  const bodyOf = (f: ReturnType<typeof vi.fn>) => (f.mock.calls[0] as unknown as [string, RequestInit])[1].body;

  it('sends an empty body by default, exactly as before', async () => {
    const f = ok();
    await closeBilling('t', f);
    expect(bodyOf(f)).toBe('{}');
  });

  it('sends maybePlay when the device may know of a Play subscription', async () => {
    const f = ok();
    await closeBilling('t', f, { maybePlay: true });
    expect(JSON.parse(String(bodyOf(f)))).toEqual({ maybePlay: true });
  });
});
