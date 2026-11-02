import type { Session, User } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { decideZone, forgetZone, keepZoneCurrent, storedZone, tokenForAssistant, tokenZone, validZone, type ZoneAuth } from './account-zone';

const MELB = 'Australia/Melbourne';
const AKL = 'Pacific/Auckland';

const b64u = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');

/** A Supabase-shaped access token whose claims carry `tz` in user_metadata (or none). `tag` tells two apart. */
function tokenWith(tz: string | null | undefined, tag = 'old'): string {
  return `${b64u({ alg: 'ES256' })}.${b64u({ sub: 'u1', tag, user_metadata: tz ? { tz } : {} })}.sig`;
}

/** A user record as Supabase returns it, with the zone (if any) in user_metadata. */
function userWith(tz: unknown): User {
  return { id: 'u1', user_metadata: tz === undefined || tz === null ? {} : { tz } } as unknown as User;
}

/** A session as supabase-js holds it: this device's copy of the account, and its access token. */
function sessionWith(tz: unknown, token = tokenWith(typeof tz === 'string' ? tz : null)): Session {
  return { access_token: token, user: userWith(tz) } as unknown as Session;
}

/**
 * A fake supabase.auth: the session it starts with, what updateUser answers, what refreshSession hands back, and
 * what getUser says the account keeps on the server now (`server`; undefined means the same as the session's copy,
 * 'error' an error answer, 'throw' a network failure).
 */
function fakeAuth(o: {
  session: Session | null;
  update?: { error: unknown } | 'throw';
  refreshed?: Session | null;
  slow?: boolean;
  server?: string | null | 'error' | 'throw';
}) {
  const calls: string[] = [];
  const auth: ZoneAuth = {
    getSession: vi.fn(async () => {
      calls.push('get');
      return { data: { session: o.session } };
    }),
    getUser: vi.fn(async () => {
      calls.push('user');
      if (o.server === 'throw') throw new Error('offline');
      if (o.server === 'error') return { data: { user: null }, error: new Error('nope') };
      return { data: { user: userWith(o.server === undefined ? storedZone(o.session) : o.server) }, error: null };
    }),
    updateUser: vi.fn(async (a: { data: { tz: string | null } }) => {
      calls.push(`update:${String(a.data.tz)}`);
      if (o.slow) await new Promise(() => undefined); // never answers
      if (o.update === 'throw') throw new Error('offline');
      return o.update ?? { error: null };
    }),
    refreshSession: vi.fn(async () => {
      calls.push('refresh');
      return { data: { session: o.refreshed === undefined ? o.session : o.refreshed } };
    }),
  };
  return { auth, calls };
}

/**
 * One account on the server, and devices that each hold their own copy of it, as supabase-js does: updateUser
 * writes the server and swaps that device's copy (session.user) but keeps its token, refreshSession takes a new
 * copy and a new token carrying the claim, and getUser reads the server.
 */
function account(tz: string | null) {
  const server = { tz };
  function device() {
    let session = sessionWith(server.tz);
    const calls: string[] = [];
    const auth: ZoneAuth = {
      getSession: async () => {
        calls.push('get');
        return { data: { session } };
      },
      getUser: async () => {
        calls.push('user');
        return { data: { user: userWith(server.tz) }, error: null };
      },
      refreshSession: async () => {
        calls.push('refresh');
        session = sessionWith(server.tz, tokenWith(server.tz, 'fresh'));
        return { data: { session } };
      },
      updateUser: async (a) => {
        calls.push(`update:${String(a.data.tz)}`);
        server.tz = a.data.tz;
        session = { ...session, user: userWith(server.tz) };
        return { error: null };
      },
    };
    return { auth, calls, session: () => session };
  }
  return { server, device };
}

describe('validZone (the shape the Worker accepts)', () => {
  it('takes tz database names', () => {
    for (const z of [MELB, 'America/Argentina/Buenos_Aires', 'Etc/GMT-14', 'UTC', 'America/Port-au-Prince']) expect(validZone(z)).toBe(z);
  });
  it("refuses what the Worker would refuse, such as Android's rare GMT+11:00", () => {
    for (const z of ['GMT+11:00', '', ' Australia/Melbourne', 'A'.repeat(65), null, undefined, 42]) expect(validZone(z)).toBeNull();
  });
});

describe('storedZone', () => {
  it("reads user_metadata.tz, and nothing else counts", () => {
    expect(storedZone(sessionWith(MELB))).toBe(MELB);
    expect(storedZone(sessionWith(undefined))).toBeNull();
    expect(storedZone(sessionWith(''))).toBeNull();
    expect(storedZone(sessionWith(7))).toBeNull();
    expect(storedZone(null)).toBeNull();
  });
});

describe('tokenZone (the zone a copied token carries)', () => {
  it("reads user_metadata.tz from the token's own claims", () => {
    expect(tokenZone(tokenWith(MELB))).toBe(MELB);
    expect(tokenZone(tokenWith(null))).toBeNull();
  });
  it('keeps reading when other claims hold letters past ASCII, in either base64 alphabet', () => {
    const payload = Buffer.from(JSON.stringify({ email: 'zoë@exämple.com', name: '山田', user_metadata: { tz: AKL } }));
    expect(tokenZone(`h.${payload.toString('base64url')}.s`)).toBe(AKL);
    expect(tokenZone(`h.${payload.toString('base64')}.s`)).toBe(AKL);
  });
  it('is null for anything that is not a token with the claim', () => {
    for (const t of ['token-old', '', 'a..b', 'h.!!!.s', `h.${b64u({ user_metadata: null })}.s`, `h.${b64u({ user_metadata: { tz: 5 } })}.s`, `h.${Buffer.from('[1').toString('base64url')}.s`, null, undefined]) {
      expect(tokenZone(t), String(t)).toBeNull();
    }
  });
});

describe('decideZone (connect creates, refresh only keeps current)', () => {
  const table: [Parameters<typeof decideZone>[0], { signedIn: boolean; stored: string | null; device: unknown }, string | null][] = [
    // connect: write when signed in, the device zone is valid, and it differs
    ['connect', { signedIn: true, stored: null, device: MELB }, MELB],
    ['connect', { signedIn: true, stored: AKL, device: MELB }, MELB],
    ['connect', { signedIn: true, stored: MELB, device: MELB }, null],
    ['connect', { signedIn: false, stored: null, device: MELB }, null],
    ['connect', { signedIn: true, stored: null, device: null }, null],
    ['connect', { signedIn: true, stored: null, device: 'GMT+11:00' }, null],
    // refresh: write ONLY when a zone is already kept and differs; never create one
    ['refresh', { signedIn: true, stored: null, device: MELB }, null],
    ['refresh', { signedIn: true, stored: AKL, device: MELB }, MELB],
    ['refresh', { signedIn: true, stored: MELB, device: MELB }, null],
    ['refresh', { signedIn: false, stored: AKL, device: MELB }, null],
    ['refresh', { signedIn: true, stored: AKL, device: 'GMT+11:00' }, null],
  ];
  for (const [reason, s, want] of table) {
    it(`${reason}, stored ${String(s.stored)}, device ${String(s.device)}, signed ${s.signedIn ? 'in' : 'out'} -> ${String(want)}`, () => {
      expect(decideZone(reason, s)).toBe(want);
    });
  }
});

describe('keepZoneCurrent (Today)', () => {
  it('never creates a zone for an account that keeps none, and makes no network call', async () => {
    const { auth, calls } = fakeAuth({ session: sessionWith(undefined) });
    await keepZoneCurrent(auth, MELB);
    expect(calls).toEqual(['get']);
  });
  it('asks the account before it writes, then follows the device to a new zone and refreshes so the next token carries it', async () => {
    const { auth, calls } = fakeAuth({ session: sessionWith(AKL), server: AKL });
    await keepZoneCurrent(auth, MELB);
    expect(calls).toEqual(['get', 'user', `update:${MELB}`, 'refresh']);
  });
  it("writes nothing when the account keeps no zone any more, though this device's old copy still holds one (Disconnect on another device)", async () => {
    const { auth, calls } = fakeAuth({ session: sessionWith(AKL), server: null });
    await keepZoneCurrent(auth, MELB);
    expect(calls).toEqual(['get', 'user']);
  });
  it('writes nothing when the account already keeps this zone (another device wrote it since)', async () => {
    const { auth, calls } = fakeAuth({ session: sessionWith(AKL), server: MELB });
    await keepZoneCurrent(auth, MELB);
    expect(calls).toEqual(['get', 'user']);
  });
  it('writes nothing when the account cannot be asked (an error answer, or the network)', async () => {
    for (const server of ['error', 'throw'] as const) {
      const { auth, calls } = fakeAuth({ session: sessionWith(AKL), server });
      await expect(keepZoneCurrent(auth, MELB)).resolves.toBeUndefined();
      expect(calls, server).toEqual(['get', 'user']);
    }
  });
  it("makes no network call when this device's copy shows nothing changed, or when signed out", async () => {
    let f = fakeAuth({ session: sessionWith(MELB) });
    await keepZoneCurrent(f.auth, MELB);
    expect(f.calls).toEqual(['get']);
    f = fakeAuth({ session: null });
    await keepZoneCurrent(f.auth, MELB);
    expect(f.calls).toEqual(['get']);
  });
  it('never throws, and skips the refresh when the write fails', async () => {
    let f = fakeAuth({ session: sessionWith(AKL), update: 'throw' });
    await expect(keepZoneCurrent(f.auth, MELB)).resolves.toBeUndefined();
    expect(f.calls).toEqual(['get', 'user', `update:${MELB}`]);
    f = fakeAuth({ session: sessionWith(AKL), update: { error: new Error('nope') } });
    await keepZoneCurrent(f.auth, MELB);
    expect(f.calls).toEqual(['get', 'user', `update:${MELB}`]);
    const broken = { ...f.auth, getSession: async () => Promise.reject(new Error('storage')) } as ZoneAuth;
    await expect(keepZoneCurrent(broken, MELB)).resolves.toBeUndefined();
  });
});

describe('two devices on one account (the review find on #24)', () => {
  it('a second device holding an old copy never writes back a zone that Disconnect cleared on the first', async () => {
    const acct = account(MELB);
    const phone = acct.device();
    const laptop = acct.device(); // signed in while the zone was kept, so its copy holds it
    // Disconnect on the phone: the Worker clears the zone, then the app clears it as well.
    acct.server.tz = null;
    await forgetZone(phone.auth);
    expect(acct.server.tz).toBeNull();
    // The laptop, still holding the old copy, opens Today in another zone: it asks, and writes nothing.
    await keepZoneCurrent(laptop.auth, AKL);
    expect(laptop.calls).toEqual(['get', 'user']);
    expect(acct.server.tz).toBeNull();
    // The phone's own copy no longer holds the zone, so its Today makes no network call at all.
    await keepZoneCurrent(phone.auth, AKL);
    expect(phone.calls).toEqual(['update:null', 'get']);
    expect(acct.server.tz).toBeNull();
  });
  it('the app clears the zone even when the Worker could not, and no device brings it back', async () => {
    const acct = account(MELB);
    const phone = acct.device();
    const laptop = acct.device();
    await forgetZone(phone.auth); // the Worker's clear missed: the app's is the one that lands
    expect(acct.server.tz).toBeNull();
    await keepZoneCurrent(laptop.auth, AKL);
    await keepZoneCurrent(phone.auth, AKL);
    expect(acct.server.tz).toBeNull();
  });
  it('a device that moves zone still keeps a connected account current', async () => {
    const acct = account(MELB);
    const phone = acct.device();
    await keepZoneCurrent(phone.auth, AKL);
    expect(acct.server.tz).toBe(AKL);
    expect(tokenZone(phone.session().access_token)).toBe(AKL);
  });
});

describe('tokenForAssistant (Copy my token)', () => {
  afterEach(() => vi.useRealTimers());

  it('keeps the zone first, then hands over the refreshed token, which carries it', async () => {
    const fresh = tokenWith(MELB, 'fresh');
    const { auth, calls } = fakeAuth({ session: sessionWith(undefined), refreshed: sessionWith(MELB, fresh) });
    expect(await tokenForAssistant(auth, MELB)).toBe(fresh);
    expect(calls).toEqual(['get', `update:${MELB}`, 'refresh']);
  });
  it('hands the token straight over with no network when it already carries the zone, or the device has none', async () => {
    let f = fakeAuth({ session: sessionWith(MELB) });
    expect(await tokenForAssistant(f.auth, MELB)).toBe(tokenWith(MELB));
    expect(f.calls).toEqual(['get']);
    f = fakeAuth({ session: sessionWith(undefined) });
    expect(await tokenForAssistant(f.auth, null)).toBe(tokenWith(null));
    expect(await tokenForAssistant(f.auth, 'GMT+11:00')).toBe(tokenWith(null));
    expect(f.calls).toEqual(['get', 'get']);
  });
  it('catches up a token that lacks the zone the account already keeps (a refresh failed after the write): a refresh, never a second write', async () => {
    const fresh = tokenWith(MELB, 'fresh');
    const { auth, calls } = fakeAuth({ session: sessionWith(MELB, tokenWith(null)), refreshed: sessionWith(MELB, fresh) });
    expect(await tokenForAssistant(auth, MELB)).toBe(fresh);
    expect(calls).toEqual(['get', 'refresh']);
  });
  it('keeps the zone again when this device cleared it but the token still carries it (Disconnect, then Copy my token)', async () => {
    const fresh = tokenWith(MELB, 'fresh');
    const { auth, calls } = fakeAuth({ session: sessionWith(undefined, tokenWith(MELB)), refreshed: sessionWith(MELB, fresh) });
    expect(await tokenForAssistant(auth, MELB)).toBe(fresh);
    expect(calls).toEqual(['get', `update:${MELB}`, 'refresh']);
  });
  it('a failed write or refresh still hands over the token it started with, calmly', async () => {
    let f = fakeAuth({ session: sessionWith(undefined), update: 'throw' });
    expect(await tokenForAssistant(f.auth, MELB)).toBe(tokenWith(null));
    f = fakeAuth({ session: sessionWith(undefined), refreshed: null });
    expect(await tokenForAssistant(f.auth, MELB)).toBe(tokenWith(null));
    f = fakeAuth({ session: sessionWith(MELB, tokenWith(null)), refreshed: null });
    expect(await tokenForAssistant(f.auth, MELB)).toBe(tokenWith(null));
  });
  it('gives up waiting after the limit and copies the token it has', async () => {
    vi.useFakeTimers();
    const { auth } = fakeAuth({ session: sessionWith(undefined), slow: true });
    const p = tokenForAssistant(auth, MELB, 3000);
    await vi.advanceTimersByTimeAsync(3000);
    expect(await p).toBe(tokenWith(null));
  });
  it('is null when signed out or the session cannot be read, as before', async () => {
    expect(await tokenForAssistant(fakeAuth({ session: null }).auth, MELB)).toBeNull();
    const broken = { ...fakeAuth({ session: null }).auth, getSession: async () => Promise.reject(new Error('storage')) } as ZoneAuth;
    expect(await tokenForAssistant(broken, MELB)).toBeNull();
  });
});

describe('forgetZone (after Disconnect AI connectors)', () => {
  it("clears the zone from here every time, with no refresh: idempotent after the Worker's clear, and the cover when it missed", async () => {
    for (const refreshed of [sessionWith(undefined), sessionWith(MELB)]) {
      const { auth, calls } = fakeAuth({ session: sessionWith(MELB), refreshed });
      await forgetZone(auth);
      expect(calls).toEqual(['update:null']);
    }
  });
  it('never throws', async () => {
    let f = fakeAuth({ session: sessionWith(MELB), update: 'throw' });
    await expect(forgetZone(f.auth)).resolves.toBeUndefined();
    f = fakeAuth({ session: sessionWith(MELB), update: { error: new Error('nope') } });
    await expect(forgetZone(f.auth)).resolves.toBeUndefined();
  });
});
