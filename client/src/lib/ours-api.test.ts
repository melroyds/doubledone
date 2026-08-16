import { describe, expect, it } from 'vitest';

import {
  createInvite,
  forgetPair,
  inviteToResume,
  isOursOpen,
  joinPair,
  leavePair,
  loadMyPair,
  loadMyPairs,
  renamePair,
  renameSelf,
  resumePair,
} from './ours-api';

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
        hasPartner: true,
        closedAt: null,
        disabledAt: null,
        joinedAt: null, // present but unknown: this membership row predates the column being read
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


// Multiple memberships are a DESIGNED state, not an exotic one: leaving freezes a pair without
// deleting the row, and the abuse ceiling permits 25 of them. The first version picked
// rows.find(r => r.user_id === userId) on an unordered read, which in practice yields the oldest,
// which is the frozen one. The screen could then show "this list is closed" while the live list the
// partner was actively using was unreachable, and leave, forget and the whole Phase 3 task sync all
// pointed at the wrong list.
describe('loadMyPairs picks the right membership out of several', () => {
  function withMemberships(members: unknown[], pairs: unknown[]) {
    return mockClient({}, { pair_members: { data: members, error: null }, pairs: { data: pairs, error: null } }).client;
  }

  it('returns the LIVE list even when a frozen membership is listed first', async () => {
    const client = withMemberships(
      [
        { pair_id: 'old', user_id: 'me', label: 'M', joined_at: '2026-01-01T00:00:00Z' },
        { pair_id: 'now', user_id: 'me', label: 'M', joined_at: '2026-06-01T00:00:00Z' },
        { pair_id: 'now', user_id: 'them', label: 'Sam' },
      ],
      [
        { id: 'old', name: 'the house', closed_at: '2026-05-01T00:00:00Z', disabled_at: null },
        { id: 'now', name: 'the shop', closed_at: null, disabled_at: null },
      ],
    );

    const res = await loadMyPairs(client, 'me');
    expect(res.ok && res.value.live?.pairId).toBe('now');
    expect(res.ok && res.value.frozen.map((p) => p.pairId)).toEqual(['old']);
    // loadMyPair, which the screen still uses, must agree.
    expect((await loadMyPair(client, 'me')) as never).toMatchObject({ value: { pairId: 'now' } });
  });

  // "You can still read everything here" is promised in five languages, so a frozen list is
  // RETURNED rather than filtered. Filtering would break that promise the moment someone starts a
  // second list, which is exactly when they would go looking for the old one.
  it('keeps frozen lists, newest first, rather than hiding them', async () => {
    const client = withMemberships(
      [
        { pair_id: 'a', user_id: 'me', label: 'M', joined_at: '2025-01-01T00:00:00Z' },
        { pair_id: 'b', user_id: 'me', label: 'M', joined_at: '2026-01-01T00:00:00Z' },
      ],
      [
        { id: 'a', name: null, closed_at: '2025-06-01T00:00:00Z', disabled_at: null },
        { id: 'b', name: null, closed_at: '2026-06-01T00:00:00Z', disabled_at: null },
      ],
    );

    const res = await loadMyPairs(client, 'me');
    expect(res.ok && res.value.live).toBeNull();
    expect(res.ok && res.value.frozen.map((p) => p.pairId)).toEqual(['b', 'a']);
  });

  // The kill switch is is_pair_writable's business too, so a disabled pair is not live either.
  it('treats a killed pair as frozen, not as live', async () => {
    const client = withMemberships(
      [{ pair_id: 'k', user_id: 'me', label: 'M', joined_at: '2026-01-01T00:00:00Z' }],
      [{ id: 'k', name: null, closed_at: null, disabled_at: '2026-07-01T00:00:00Z' }],
    );
    const res = await loadMyPairs(client, 'me');
    expect(res.ok && res.value.live).toBeNull();
    expect(res.ok && res.value.frozen[0].pairId).toBe('k');
  });

  it('a user whose ONLY list is frozen still gets it from loadMyPair', async () => {
    const client = withMemberships(
      [{ pair_id: 'f', user_id: 'me', label: 'M', joined_at: '2026-01-01T00:00:00Z' }],
      [{ id: 'f', name: 'the house', closed_at: '2026-05-01T00:00:00Z', disabled_at: null }],
    );
    expect((await loadMyPair(client, 'me')) as never).toMatchObject({ value: { pairId: 'f' } });
  });

  it('returns nothing at all for an account with no memberships', async () => {
    const client = withMemberships([], []);
    const res = await loadMyPairs(client, 'me');
    expect(res.ok && res.value).toEqual({ live: null, frozen: [] });
  });
});


// Phase 5. Waking a frozen list is the pairing handshake again, and never unilateral: one member
// mints, the other redeems, and only the redeem clears closed_at.
describe('inviteToResume', () => {
  it('passes only the pair id, because the address is the server’s to know', async () => {
    const { client, calls } = mockClient({
      invite_to_resume: { data: [{ code: 'K7MP4Q', expires_at: '2026-08-10T00:00:00Z' }], error: null },
    });
    const res = await inviteToResume(client, 'p-1');

    expect(calls[0]).toEqual({ fn: 'invite_to_resume', args: { p_pair: 'p-1' } });
    // No email anywhere in the call. Both people are already members, so the server binds the code
    // to the other member itself, which removes the sharpest edge in the original flow.
    expect(JSON.stringify(calls[0].args)).not.toContain('@');
    expect(res).toEqual({ ok: true, value: { code: 'K7MP4Q', expiresAt: '2026-08-10T00:00:00Z' } });
  });

  it('reports a list with nobody left to wake it with, rather than calling it full', async () => {
    const { client } = mockClient({
      invite_to_resume: { data: null, error: { code: '42501', message: 'nobody left to resume with' } },
    });
    expect(await inviteToResume(client, 'p-1')).toEqual({ ok: false, failure: 'partner-gone' });
  });

  it('treats an empty reply as unknown rather than pretending it minted a code', async () => {
    const { client } = mockClient({ invite_to_resume: { data: [], error: null } });
    expect(await inviteToResume(client, 'p-1')).toEqual({ ok: false, failure: 'unknown' });
  });
});

describe('resumePair', () => {
  it('normalises the typed code exactly as the server does before hashing', async () => {
    const { client, calls } = mockClient({
      resume_pair: { data: [{ pair_id: 'p-1', partner_label: 'Sam', pair_name: 'the house' }], error: null },
    });
    const res = await resumePair(client, ' k7m-p4q ');

    expect(calls[0]).toEqual({ fn: 'resume_pair', args: { p_code: 'K7MP4Q' } });
    expect(res).toEqual({ ok: true, value: { pairId: 'p-1', partnerLabel: 'Sam', pairName: 'the house' } });
  });

  // Same reason as joinPair: the server cannot raise on the one path a guesser can reach, because
  // a raise rolls back the transaction and takes the rate-limit record with it.
  it('reads ZERO ROWS as an invalid code', async () => {
    const { client } = mockClient({ resume_pair: { data: [], error: null } });
    expect(await resumePair(client, 'K7M-P4Q')).toEqual({ ok: false, failure: 'invalid-code' });
  });

  // The server has an idempotent branch ABOVE its cap check precisely so this does not answer a
  // person who has just got their list back with "you already have a shared list, you can leave it".
  it('succeeds again on a retry rather than reporting an already-paired list', async () => {
    const { client } = mockClient({
      resume_pair: { data: [{ pair_id: 'p-1', partner_label: 'Sam', pair_name: null }], error: null },
    });
    expect(await resumePair(client, 'K7M-P4Q')).toMatchObject({ ok: true, value: { pairId: 'p-1' } });
  });

  it('reports a list the other person already woke as its own calm state', async () => {
    const { client } = mockClient({
      resume_pair: { data: null, error: { code: '42501', message: 'that list is already live' } },
    });
    expect(await resumePair(client, 'K7M-P4Q')).toEqual({ ok: false, failure: 'already-live' });
  });
});


// Nothing else in the system would ever run the retention sweep: there is no cron, pg_cron is not
// enabled, and the Worker's hourly job holds only the anon key while service_role is a standing
// never. Without a call site the thirty-day promise is a function nobody invokes.
describe('the retention sweep rides on the membership read', () => {
  function withPairs(members: unknown[], pairs: unknown[]) {
    return mockClient({}, { pair_members: { data: members, error: null }, pairs: { data: pairs, error: null } });
  }

  it('asks for every list, frozen ones included', async () => {
    const { client, calls } = withPairs(
      [
        { pair_id: 'live', user_id: 'me', label: 'M', joined_at: '2026-06-01T00:00:00Z' },
        { pair_id: 'old', user_id: 'me', label: 'M', joined_at: '2026-01-01T00:00:00Z' },
      ],
      [
        { id: 'live', name: null, closed_at: null, disabled_at: null },
        { id: 'old', name: null, closed_at: '2026-05-01T00:00:00Z', disabled_at: null },
      ],
    );
    await loadMyPairs(client, 'me');

    const swept = calls.filter((c) => c.fn === 'sweep_shared_tombstones').map((c) => (c.args as { p_pair: string }).p_pair);
    // Frozen lists are included ON PURPOSE: they are the ones sitting longest, and exactly the ones
    // somebody might want to stop carrying the words of.
    expect(swept.sort()).toEqual(['live', 'old']);
  });

  it('asks for nothing when there is no list', async () => {
    const { client, calls } = withPairs([], []);
    await loadMyPairs(client, 'me');
    expect(calls.filter((c) => c.fn === 'sweep_shared_tombstones')).toHaveLength(0);
  });

  // A redaction sweep must never be the reason somebody cannot see their shared list.
  it('still returns the lists when the sweep itself fails', async () => {
    const { client } = mockClient(
      { sweep_shared_tombstones: { data: null, error: { code: '42501', message: 'not your list' } } },
      {
        pair_members: { data: [{ pair_id: 'p-1', user_id: 'me', label: 'M', joined_at: '2026-01-01T00:00:00Z' }], error: null },
        pairs: { data: [{ id: 'p-1', name: null, closed_at: null, disabled_at: null }], error: null },
      },
    );
    const res = await loadMyPairs(client, 'me');
    expect(res.ok && res.value.live?.pairId).toBe('p-1');
  });

  it('does not make the caller wait for it', async () => {
    // Not awaited, so the read resolves whatever the sweep is doing. A hung sweep must not hold a
    // person's list hostage.
    const { client } = mockClient(
      { sweep_shared_tombstones: { data: null, error: null } },
      {
        pair_members: { data: [{ pair_id: 'p-1', user_id: 'me', label: 'M' }], error: null },
        pairs: { data: [{ id: 'p-1', name: null, closed_at: null, disabled_at: null }], error: null },
      },
    );
    await expect(loadMyPairs(client, 'me')).resolves.toMatchObject({ ok: true });
  });
});

describe('renameSelf', () => {
  it('calls the right RPC with the capped label', async () => {
    const { client, calls } = mockClient({ rename_self: { error: null } });
    expect(await renameSelf(client, 'p-1', '  Melroy  ')).toEqual({ ok: true, value: null });
    // TypeScript cannot check PostgREST argument names, so a typo in p_pair or p_label would surface
    // only as a runtime PGRST202 that classifies to 'unknown' and renders "that didn't work".
    expect(calls[0]).toEqual({ fn: 'rename_self', args: { p_pair: 'p-1', p_label: 'Melroy' } });
  });

  // An empty name is refused WITHOUT a round trip. Storing it is not an option: the label is what
  // the other person has to call you by, and a null one used to make the screen think nobody was
  // there at all.
  it('refuses an empty name without asking the server', async () => {
    const { client, calls } = mockClient({ rename_self: { error: null } });
    expect(await renameSelf(client, 'p-1', '   ')).toEqual({ ok: false, failure: 'bad-name' });
    expect(calls).toHaveLength(0);
  });

  it('reports a frozen or someone else’s list as not-yours', async () => {
    const { client } = mockClient({ rename_self: { error: { code: '42501', message: 'not your list' } } });
    expect(await renameSelf(client, 'p-9', 'Sam')).toEqual({ ok: false, failure: 'not-yours' });
  });
});

// The state hasPartner exists for, and the one nothing else pins: a member who is THERE but has no
// name. Keying "is somebody here" on the label rendered "waiting for someone to join" over a list
// two people were actively using.
describe('a member with no label is still a member', () => {
  it('reports hasPartner true and partnerLabel null together', async () => {
    const { client } = mockClient(
      {},
      {
        pair_members: {
          data: [
            { pair_id: 'p-1', user_id: 'me', label: 'Melroy', joined_at: '2026-01-01T00:00:00Z' },
            { pair_id: 'p-1', user_id: 'them', label: null },
          ],
          error: null,
        },
        pairs: { data: [{ id: 'p-1', name: null, closed_at: null, disabled_at: null }], error: null },
      },
    );
    expect(await loadMyPair(client, 'me')).toMatchObject({
      ok: true,
      value: { hasPartner: true, partnerLabel: null },
    });
  });

  it('reports hasPartner false when nobody has joined at all', async () => {
    const { client } = mockClient(
      {},
      {
        pair_members: { data: [{ pair_id: 'p-1', user_id: 'me', label: 'Melroy' }], error: null },
        pairs: { data: [{ id: 'p-1', name: null, closed_at: null, disabled_at: null }], error: null },
      },
    );
    expect(await loadMyPair(client, 'me')).toMatchObject({ ok: true, value: { hasPartner: false } });
  });
});
