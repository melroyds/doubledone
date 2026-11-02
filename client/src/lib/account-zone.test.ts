import type { Session } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { decideZone, forgetZone, keepZoneCurrent, storedZone, tokenForAssistant, validZone, type ZoneAuth } from './account-zone';

const MELB = 'Australia/Melbourne';
const AKL = 'Pacific/Auckland';

/** A session as supabase-js holds it, with the zone (if any) in user_metadata. */
function sessionWith(tz: unknown, token = 'token-old'): Session {
  return { access_token: token, user: { id: 'u1', user_metadata: tz === undefined ? {} : { tz } } } as unknown as Session;
}

/** A fake supabase.auth: the session it starts with, what updateUser answers, and what refreshSession hands back. */
function fakeAuth(o: { session: Session | null; update?: { error: unknown } | 'throw'; refreshed?: Session | null; slow?: boolean }) {
  const calls: string[] = [];
  const auth: ZoneAuth = {
    getSession: vi.fn(async () => {
      calls.push('get');
      return { data: { session: o.session } };
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
  it('never creates a zone for an account that keeps none, and makes no write', async () => {
    const { auth, calls } = fakeAuth({ session: sessionWith(undefined) });
    await keepZoneCurrent(auth, MELB);
    expect(calls).toEqual(['get']);
  });
  it('follows the device to a new zone, then refreshes so the next token carries it', async () => {
    const { auth, calls } = fakeAuth({ session: sessionWith(AKL) });
    await keepZoneCurrent(auth, MELB);
    expect(calls).toEqual(['get', `update:${MELB}`, 'refresh']);
  });
  it('makes no network call when nothing changed, or when signed out', async () => {
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
    expect(f.calls).toEqual(['get', `update:${MELB}`]);
    f = fakeAuth({ session: sessionWith(AKL), update: { error: new Error('nope') } });
    await keepZoneCurrent(f.auth, MELB);
    expect(f.calls).toEqual(['get', `update:${MELB}`]);
    const broken = { ...f.auth, getSession: async () => Promise.reject(new Error('storage')) } as ZoneAuth;
    await expect(keepZoneCurrent(broken, MELB)).resolves.toBeUndefined();
  });
});

describe('tokenForAssistant (Copy my token)', () => {
  afterEach(() => vi.useRealTimers());

  it('keeps the zone first, then hands over the refreshed token, which carries it', async () => {
    const { auth, calls } = fakeAuth({ session: sessionWith(undefined), refreshed: sessionWith(MELB, 'token-fresh') });
    expect(await tokenForAssistant(auth, MELB)).toBe('token-fresh');
    expect(calls).toEqual(['get', `update:${MELB}`, 'refresh']);
  });
  it('hands the token straight over with no network when the zone is already kept, or the device has none', async () => {
    let f = fakeAuth({ session: sessionWith(MELB) });
    expect(await tokenForAssistant(f.auth, MELB)).toBe('token-old');
    expect(f.calls).toEqual(['get']);
    f = fakeAuth({ session: sessionWith(undefined) });
    expect(await tokenForAssistant(f.auth, null)).toBe('token-old');
    expect(await tokenForAssistant(f.auth, 'GMT+11:00')).toBe('token-old');
    expect(f.calls).toEqual(['get', 'get']);
  });
  it('a failed write or refresh still hands over the token it started with, calmly', async () => {
    let f = fakeAuth({ session: sessionWith(undefined), update: 'throw' });
    expect(await tokenForAssistant(f.auth, MELB)).toBe('token-old');
    f = fakeAuth({ session: sessionWith(undefined), refreshed: null });
    expect(await tokenForAssistant(f.auth, MELB)).toBe('token-old');
  });
  it('gives up waiting after the limit and copies the token it has', async () => {
    vi.useFakeTimers();
    const { auth } = fakeAuth({ session: sessionWith(undefined), slow: true });
    const p = tokenForAssistant(auth, MELB, 3000);
    await vi.advanceTimersByTimeAsync(3000);
    expect(await p).toBe('token-old');
  });
  it('is null when signed out or the session cannot be read, as before', async () => {
    expect(await tokenForAssistant(fakeAuth({ session: null }).auth, MELB)).toBeNull();
    const broken = { ...fakeAuth({ session: null }).auth, getSession: async () => Promise.reject(new Error('storage')) } as ZoneAuth;
    expect(await tokenForAssistant(broken, MELB)).toBeNull();
  });
});

describe('forgetZone (after Disconnect AI connectors)', () => {
  it('refreshes, and writes nothing when the Worker already cleared the zone', async () => {
    const { auth, calls } = fakeAuth({ session: sessionWith(MELB), refreshed: sessionWith(undefined) });
    await forgetZone(auth);
    expect(calls).toEqual(['refresh']);
  });
  it("clears it from here when the account still keeps one (the Worker's clear missed)", async () => {
    const { auth, calls } = fakeAuth({ session: sessionWith(MELB), refreshed: sessionWith(MELB) });
    await forgetZone(auth);
    expect(calls).toEqual(['refresh', 'update:null']);
  });
  it('never throws', async () => {
    const { auth } = fakeAuth({ session: sessionWith(MELB), refreshed: sessionWith(MELB), update: 'throw' });
    await expect(forgetZone(auth)).resolves.toBeUndefined();
  });
});
