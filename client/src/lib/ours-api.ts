import { type SupabaseClient } from '@supabase/supabase-js';

import { capLabel, classifyPairError, normaliseCode, normaliseEmail, type PairFailure } from './pairing';

// Ours: the seam that talks to the pairing RPCs. A seam, not logic (it touches Supabase), so the
// pure decisions live in pairing.ts and the CONTRACT here, which RPC is called with what, and how
// each shape of reply is read, is unit-tested against a mock client exactly like account.ts.
//
// Every function returns a discriminated result rather than throwing, and a failure is always one
// of pairing.ts's calm names. No PostgREST message ever escapes this file.

export type PairOk<T> = { ok: true; value: T };
export type PairErr = { ok: false; failure: PairFailure };
export type PairResult<T> = PairOk<T> | PairErr;

export type Invite = { code: string; pairId: string; expiresAt: string };
export type Joined = { pairId: string; partnerLabel: string | null };

/** Who is in a pair, from the current user's point of view. `partnerLabel` is null while an invite
 *  is outstanding and nobody has joined yet, which is a real and expected state, not an error. */
export type MyPair = {
  pairId: string;
  myLabel: string | null;
  partnerLabel: string | null;
  closedAt: string | null;
  disabledAt: string | null;
};

function fail(error: unknown): PairErr {
  return { ok: false, failure: classifyPairError(error as { code?: string; message?: string } | null) };
}

/**
 * Mint an invite. The code is generated server-side and returned exactly once: it is never stored
 * anywhere we can read it again, so the caller must show it to the user immediately.
 *
 * Calling this while you are the SOLE member of a live pair deliberately re-mints rather than
 * failing, which is how a mistyped invitee address is recovered (the address is stored hashed, so
 * nobody can look up what was actually typed). Once someone has joined, it refuses.
 */
export async function createInvite(
  client: SupabaseClient,
  invitedEmail: string,
  myLabel: string,
): Promise<PairResult<Invite>> {
  const { data, error } = await client.rpc('create_pair_invite', {
    p_invited_email: normaliseEmail(invitedEmail),
    p_my_label: capLabel(myLabel),
  });
  if (error) return fail(error);
  // RETURNS TABLE arrives as an array of rows.
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.code) return { ok: false, failure: 'unknown' };
  return { ok: true, value: { code: row.code, pairId: row.pair_id, expiresAt: row.expires_at } };
}

/**
 * Redeem one.
 *
 * THE SUBTLE PART: a wrong, expired, already-used, meant-for-someone-else or killed code does not
 * raise. The server returns ZERO ROWS on that path deliberately, because raising would roll back
 * the transaction and take the rate-limit record with it, leaving the throttle recording nothing
 * but successes. So an empty reply is the failure, and it is reported as one calm 'invalid-code'
 * for every one of those reasons, which is also what stops a guesser learning anything.
 */
export async function joinPair(client: SupabaseClient, code: string, myLabel: string): Promise<PairResult<Joined>> {
  const { data, error } = await client.rpc('join_pair', {
    p_code: normaliseCode(code),
    p_my_label: capLabel(myLabel),
  });
  if (error) return fail(error);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.pair_id) return { ok: false, failure: 'invalid-code' };
  return { ok: true, value: { pairId: row.pair_id, partnerLabel: row.partner_label ?? null } };
}

/** Leave: the list freezes for both people. Reads stay, writes stop, zero rows move, nothing is
 *  copied and nothing is destroyed. Outstanding invites die in the same statement. */
export async function leavePair(client: SupabaseClient, pairId: string): Promise<PairResult<null>> {
  const { error } = await client.rpc('leave_pair', { p_pair: pairId });
  if (error) return fail(error);
  return { ok: true, value: null };
}

/** Remove a frozen list from your side. Destructive and deliberately so: these are your own rows
 *  and you asked. The caller owes this an undo rather than a confirm dialog. */
export async function forgetPair(client: SupabaseClient, pairId: string): Promise<PairResult<null>> {
  const { error } = await client.rpc('forget_pair', { p_pair: pairId });
  if (error) return fail(error);
  return { ok: true, value: null };
}

/**
 * The current pair, or null when there is none.
 *
 * Two plain reads rather than a PostgREST embed: row-level security already scopes both to pairs
 * this user belongs to, and the membership read returns BOTH members' rows, so one query yields
 * my label and my person's together. A frozen pair is still returned; the caller decides what a
 * frozen list looks like, because "gone" and "frozen" must never look the same to a person who
 * has just been left.
 */
export async function loadMyPair(client: SupabaseClient, userId: string): Promise<PairResult<MyPair | null>> {
  const members = await client.from('pair_members').select('pair_id, user_id, label');
  if (members.error) return fail(members.error);
  const rows = (members.data ?? []) as { pair_id: string; user_id: string; label: string | null }[];
  const mine = rows.find((r) => r.user_id === userId);
  if (!mine) return { ok: true, value: null };

  const pairs = await client.from('pairs').select('id, closed_at, disabled_at');
  if (pairs.error) return fail(pairs.error);
  const pair = ((pairs.data ?? []) as { id: string; closed_at: string | null; disabled_at: string | null }[]).find(
    (p) => p.id === mine.pair_id,
  );

  return {
    ok: true,
    value: {
      pairId: mine.pair_id,
      myLabel: mine.label,
      partnerLabel: rows.find((r) => r.pair_id === mine.pair_id && r.user_id !== userId)?.label ?? null,
      closedAt: pair?.closed_at ?? null,
      disabledAt: pair?.disabled_at ?? null,
    },
  };
}
