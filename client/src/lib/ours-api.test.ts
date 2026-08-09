import { describe, expect, it } from 'vitest';

import { createInvite, forgetPair, isOursOpen, joinPair, leavePair, loadMyPair, renamePair } from './ours-api';

// A mock client in the shape supabase-js presents, so the CONTRACT is pinned without a database:
// which RPC is called, with which argument names, and how each shape of reply is read.
type RpcReply = { data?: unknown; error?: unknown };
function mockClient(replies: Record<string, RpcReply>, tables: Record<string, RpcReply> = {}) {
  const calls: { fn: string; args: unknown }[] = [];
  const client = {
    rpc: async (fn: string, args: unknown) => {
      calls.push({ fn, args });
      return replies[fn] ?? { data: null, error: null };
    },
    from: (table: string) => ({
      select: async () => tables[table] ?? { data: [], error: null },
    }),
  };
  return { client: client as never, calls };
}

describe('isOursOpen', () => {
  it('is true only when the server says exactly true', async () => {
    expect(await isOursOpen(mockClient({ ours_is_open: { data: true, error: null } }).client)).toBe(true);
    expect(await isOursOpen(mockClient({ ours_is_open: { data: false, error: null } }).client)).toBe(false);
  });

  // The door is what this gates, so every ambiguous answer has to shut it. An open door onto a
  // refusal is worse than a door that is not there yet.
  it('fails CLOSED on an error, a null, or anything that is not a boolean true', async () => {
    expect(await isOursOpen(mockClient({ ours_is_open: { data: null, error: { message: 'nope' } } }).client)).toBe(false);
    expect(await isOursOpen(mockClient({ ours_is_open: { data: null, error: null } }).client)).toBe(false);
    expect(await isOursOpen(mockClient({ ours_is_open: { data: 'true', error: null } }).client)).toBe(false);
  });
});

describe('createInvite', () => {
  it('calls the right RPC with normalised arguments and returns the one-time code', async () => {
    const { client, calls } = mockClient({
      create_pair_invite: {
        data: [{ code: 'K7MP4Q', pair_id: 'p-1', expires_at: '2026-08-10T00:00:00Z' }],
        error: null,
      },
    });
    const res = await createInvite(client, '  Sam@Example.COM ', '  Melroy  ', '  The house  ');

    expect(calls[0].fn).toBe('create_pair_invite');
    // Normalised on the way out, so a stray capital or trailing space from a mobile keyboard can
    // never produce an invite bound to an address the invitee does not actually have.
    expect(calls[0].args).toEqual({
      p_invited_email: 'sam@example.com',
      p_my_label: 'Melroy',
      p_name: 'The house',
    });
    expect(res).toEqual({ ok: true, value: { code: 'K7MP4Q', pairId: 'p-1', expiresAt: '2026-08-10T00:00:00Z' } });
  });

  // A list nobody named must arrive as NULL, never as the English word. Null is what lets each
  // person read the list's name in their own language; 'Ours' on the wire would hand an Italian
  // partner an English name for their own home, permanently.
  it('sends an unnamed list as null rather than as a word in one language', async () => {
    const { client, calls } = mockClient({
      create_pair_invite: { data: [{ code: 'K7MP4Q', pair_id: 'p-1', expires_at: '2026-08-10T00:00:00Z' }], error: null },
    });
    await createInvite(client, 'sam@example.com', 'me');
    expect((calls[0].args as { p_name: string | null }).p_name).toBeNull();

    await createInvite(client, 'sam@example.com', 'me', '   ');
    expect((calls[1].args as { p_name: string | null }).p_name).toBeNull();
  });

  it('reports the build-time allowlist calmly rather than as a database sentence', async () => {
    const { client } = mockClient({
      create_pair_invite: { data: null, error: { code: '42501', message: 'ours is not open yet' } },
    });
    expect(await createInvite(client, 'sam@example.com', 'me')).toEqual({ ok: false, failure: 'not-open' });
  });

  it('reports an already-joined list as already-paired, not as a crash', async () => {
    const { client } = mockClient({
      create_pair_invite: { data: null, error: { code: '23505', message: 'already in a shared list' } },
    });
    expect(await createInvite(client, 'sam@example.com', 'me')).toEqual({ ok: false, failure: 'already-paired' });
  });

  it('treats an empty reply as unknown rather than pretending it minted a code', async () => {
    const { client } = mockClient({ create_pair_invite: { data: [], error: null } });
    expect(await createInvite(client, 'sam@example.com', 'me')).toEqual({ ok: false, failure: 'unknown' });
  });
});

describe('joinPair', () => {
  it('normalises the typed code exactly as the server does before hashing', async () => {
    const { client, calls } = mockClient({
      join_pair: { data: [{ pair_id: 'p-1', partner_label: 'Melroy', pair_name: 'The house' }], error: null },
    });
    const res = await joinPair(client, ' k7m-p4q ', 'Sam');

    expect(calls[0].fn).toBe('join_pair');
    expect(calls[0].args).toEqual({ p_code: 'K7MP4Q', p_my_label: 'Sam' });
    // The name comes back with the join, so the person who was handed a code sees what they have
    // walked into on the very first screen, rather than an unnamed list they have to ask about.
    expect(res).toEqual({ ok: true, value: { pairId: 'p-1', partnerLabel: 'Melroy', pairName: 'The house' } });
  });

  // THE ONE THAT MATTERS. A wrong, expired, used, meant-for-someone-else or killed code does not
  // raise: the server returns zero rows on that path deliberately, because raising would roll back
  // the transaction and take the rate-limit record with it, leaving the throttle recording nothing
  // but successes. If this seam read an empty array as anything other than a failure, every wrong
  // code would look like a successful pairing with an undefined pair.
  it('reads ZERO ROWS as an invalid code, because the server cannot raise on that path', async () => {
    const { client } = mockClient({ join_pair: { data: [], error: null } });
    expect(await joinPair(client, 'K7M-P4Q', 'Sam')).toEqual({ ok: false, failure: 'invalid-code' });
  });

  it('gives every rejected-code reason the SAME answer, so a guesser learns nothing', async () => {
    const { client } = mockClient({ join_pair: { data: null, error: null } });
    expect(await joinPair(client, 'ZZZ-ZZZ', 'Sam')).toEqual({ ok: false, failure: 'invalid-code' });
  });

  it('surfaces the wrong-guess throttle as its own calm failure', async () => {
    const { client } = mockClient({
      join_pair: { data: null, error: { code: '54000', message: 'too many attempts, try later' } },
    });
    expect(await joinPair(client, 'K7M-P4Q', 'Sam')).toEqual({ ok: false, failure: 'rate-limited' });
  });

  it('accepts a pairing whose partner has no label yet', async () => {
    const { client } = mockClient({ join_pair: { data: [{ pair_id: 'p-1', partner_label: null }], error: null } });
    expect(await joinPair(client, 'K7M-P4Q', 'Sam')).toEqual({
      ok: true,
      value: { pairId: 'p-1', partnerLabel: null, pairName: null },
    });
  });
});

describe('renamePair', () => {
  it('caps the name and passes the pair id', async () => {
    const { client, calls } = mockClient({ rename_pair: { error: null } });
    expect(await renamePair(client, 'p-1', '  The house  ')).toEqual({ ok: true, value: null });
    expect(calls[0]).toEqual({ fn: 'rename_pair', args: { p_pair: 'p-1', p_name: 'The house' } });
  });

  it('clears back to the app’s own word rather than storing a blank', async () => {
    const { client, calls } = mockClient({ rename_pair: { error: null } });
    await renamePair(client, 'p-1', '   ');
    expect((calls[0].args as { p_name: string | null }).p_name).toBeNull();
  });

  it('reports a frozen or someone else’s list as not-yours', async () => {
    const { client } = mockClient({ rename_pair: { error: { code: '42501', message: 'not your list' } } });
    expect(await renamePair(client, 'p-9', 'x')).toEqual({ ok: false, failure: 'not-yours' });
  });
});

describe('leavePair / forgetPair', () => {
  it('leave passes the pair id and reports success without a value', async () => {
    const { client, calls } = mockClient({ leave_pair: { error: null } });
    expect(await leavePair(client, 'p-1')).toEqual({ ok: true, value: null });
    expect(calls[0]).toEqual({ fn: 'leave_pair', args: { p_pair: 'p-1' } });
  });

  it('leave reports someone else’s list as not-yours', async () => {
    const { client } = mockClient({ leave_pair: { error: { code: '42501', message: 'not your list' } } });
    expect(await leavePair(client, 'p-9')).toEqual({ ok: false, failure: 'not-yours' });
  });

  it('forget calls its own RPC', async () => {
    const { client, calls } = mockClient({ forget_pair: { error: null } });
    expect(await forgetPair(client, 'p-1')).toEqual({ ok: true, value: null });
    expect(calls[0]).toEqual({ fn: 'forget_pair', args: { p_pair: 'p-1' } });
  });
});

describe('loadMyPair', () => {
  it('finds my label and my person’s from the one membership read', async () => {
    const { client } = mockClient(
      {},
      {
        pair_members: {
          data: [
            { pair_id: 'p-1', user_id: 'me', label: 'Melroy' },
            { pair_id: 'p-1', user_id: 'them', label: 'Sam' },
          ],
          error: null,
        },
        pairs: { data: [{ id: 'p-1', name: 'The house', closed_at: null, disabled_at: null }], error: null },
      },
    );
    expect(await loadMyPair(client, 'me')).toEqual({
      ok: true,
      value: {
        pairId: 'p-1',
        name: 'The house',
        myLabel: 'Melroy',
        partnerLabel: 'Sam',
        closedAt: null,
        disabledAt: null,
      },
    });
  });

  // A list nobody named is the ORDINARY case, and it must read as null and not as a blank string,
  // because null is the signal the screen uses to show the app's own word in the reader's language.
  it('reads an unnamed list as a null name, which is normal and not missing data', async () => {
    const { client } = mockClient(
      {},
      {
        pair_members: { data: [{ pair_id: 'p-1', user_id: 'me', label: 'Melroy' }], error: null },
        pairs: { data: [{ id: 'p-1', name: null, closed_at: null, disabled_at: null }], error: null },
      },
    );
    expect(await loadMyPair(client, 'me')).toMatchObject({ ok: true, value: { name: null } });
  });

  it('returns null when there is no pair at all, which is not an error', async () => {
    const { client } = mockClient({}, { pair_members: { data: [], error: null } });
    expect(await loadMyPair(client, 'me')).toEqual({ ok: true, value: null });
  });

  it('reports a partner-less pair as real, because an outstanding invite is a normal state', async () => {
    const { client } = mockClient(
      {},
      {
        pair_members: { data: [{ pair_id: 'p-1', user_id: 'me', label: 'Melroy' }], error: null },
        pairs: { data: [{ id: 'p-1', name: 'The house', closed_at: null, disabled_at: null }], error: null },
      },
    );
    const res = await loadMyPair(client, 'me');
    expect(res).toMatchObject({ ok: true, value: { pairId: 'p-1', partnerLabel: null } });
  });

  // "Gone" and "frozen" must never look the same to someone who has just been left, so the seam
  // hands the caller the freeze rather than swallowing it into null.
  it('still returns a FROZEN pair, with its closed time, rather than hiding it', async () => {
    const { client } = mockClient(
      {},
      {
        pair_members: { data: [{ pair_id: 'p-1', user_id: 'me', label: 'Melroy' }], error: null },
        pairs: { data: [{ id: 'p-1', closed_at: '2026-08-09T10:00:00Z', disabled_at: null }], error: null },
      },
    );
    expect(await loadMyPair(client, 'me')).toMatchObject({
      ok: true,
      value: { pairId: 'p-1', closedAt: '2026-08-09T10:00:00Z' },
    });
  });
});
