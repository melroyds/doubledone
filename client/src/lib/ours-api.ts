import { type SupabaseClient } from '@supabase/supabase-js';

import { capLabel, capName, classifyPairError, normaliseCode, normaliseEmail, type PairFailure } from './pairing';

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
export type ResumeInvite = { code: string; expiresAt: string };
export type Joined = { pairId: string; partnerLabel: string | null; pairName: string | null };

/** Who is in a pair, from the current user's point of view. `partnerLabel` is null while an invite
 *  is outstanding and nobody has joined yet, which is a real and expected state, not an error.
 *
 *  `name` is null for most lists and that is the NORMAL state, not a missing value: it means "the
 *  app's own word for this", which each reader then sees in their own language. Only a household
 *  that deliberately named their list stores a string, and then both people see that string. */
export type MyPair = {
  pairId: string;
  name: string | null;
  myLabel: string | null;
  partnerLabel: string | null;
  closedAt: string | null;
  disabledAt: string | null;
  /**
   * Whether a second person is IN this list, which is not the same question as whether they have a
   * name yet, and the difference is a real bug the design work surfaced.
   *
   * `partnerLabel` was doing both jobs. The server coalesces an empty label to a word, so today a
   * member always has one, but nothing GUARANTEES that: a null label is legal in the column, and a
   * screen that keys on the label reads "waiting for someone to join" over a list two people are
   * actively using. Derived from whether a membership row exists, which is the actual question.
   */
  hasPartner: boolean;
  /** When YOU joined. Used to rank memberships, and by the design's "kept with Sam, since June". */
  joinedAt?: string | null;
};

function fail(error: unknown): PairErr {
  return { ok: false, failure: classifyPairError(error as { code?: string; message?: string } | null) };
}

/**
 * Whether Ours is open to THIS account yet (the build-time allowlist).
 *
 * Answers about the caller only, never about an address someone types, so it cannot be used to
 * probe who else is testing. Any failure answers false: a door that stays shut when the network is
 * confused is a smaller harm than one that opens onto an error.
 */
export async function isOursOpen(client: SupabaseClient): Promise<boolean> {
  const { data, error } = await client.rpc('ours_is_open');
  if (error) return false;
  return data === true;
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
  name = '',
): Promise<PairResult<Invite>> {
  const { data, error } = await client.rpc('create_pair_invite', {
    p_invited_email: normaliseEmail(invitedEmail),
    p_my_label: capLabel(myLabel),
    // Empty travels as null, never as the English word: a null name renders as whatever the app
    // calls a shared list in the READER's language, so an Italian partner is not handed 'Ours'.
    p_name: capName(name) || null,
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
  return {
    ok: true,
    value: { pairId: row.pair_id, partnerLabel: row.partner_label ?? null, pairName: row.pair_name ?? null },
  };
}

/**
 * Change the name YOUR PERSON sees you by, on a live list.
 *
 * An empty name is refused rather than cleared, unlike a list's name. A list with no name falls back
 * to the app's own word in each reader's language; a PERSON with no name leaves the other side with
 * nothing to call you, and it is indistinguishable from your not being there at all.
 */
export async function renameSelf(client: SupabaseClient, pairId: string, label: string): Promise<PairResult<null>> {
  const trimmed = capLabel(label);
  if (!trimmed) return { ok: false, failure: 'bad-name' }; // never make the round trip to be told
  const { error } = await client.rpc('rename_self', { p_pair: pairId, p_label: trimmed });
  if (error) return fail(error);
  return { ok: true, value: null };
}

/** Rename a live list. A shared object, so either person may do it and both see it next read. An
 *  empty name clears it back to the app's own word rather than storing a blank. */
export async function renamePair(client: SupabaseClient, pairId: string, name: string): Promise<PairResult<null>> {
  const { error } = await client.rpc('rename_pair', { p_pair: pairId, p_name: capName(name) || null });
  if (error) return fail(error);
  return { ok: true, value: null };
}

/**
 * Mint a code that WAKES a frozen list, for the other member to redeem.
 *
 * The address is not asked for and not passed: both people are already members, so the server binds
 * the code to the other member's own address. Nothing is disclosed (you are never shown it, they
 * are never shown one) and it removes the sharpest edge in the original flow, where a mistyped
 * address gave an unrecoverable dead end.
 *
 * Minting is HALF of a handshake and changes nothing on its own. `closed_at` clears only when the
 * other person redeems, which is what keeps leaving a door the other person cannot drag you back
 * through.
 */
export async function inviteToResume(client: SupabaseClient, pairId: string): Promise<PairResult<ResumeInvite>> {
  const { data, error } = await client.rpc('invite_to_resume', { p_pair: pairId });
  if (error) return fail(error);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.code) return { ok: false, failure: 'unknown' };
  return { ok: true, value: { code: row.code, expiresAt: row.expires_at } };
}

/**
 * Redeem one. The other half.
 *
 * ZERO ROWS is the failure, exactly as `joinPair`: the server deliberately does not raise on the
 * one path a guesser can reach, because raising would roll back the transaction and take the
 * rate-limit record with it, leaving the throttle recording nothing but successes.
 *
 * Succeeding TWICE is fine and returns the same row: the server has an idempotent branch above its
 * cap check, so a double tap or a lost response does not answer a person who has just got their
 * list back with "you already have a shared list, you can leave it".
 */
export async function resumePair(client: SupabaseClient, code: string): Promise<PairResult<Joined>> {
  const { data, error } = await client.rpc('resume_pair', { p_code: normaliseCode(code) });
  if (error) return fail(error);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.pair_id) return { ok: false, failure: 'invalid-code' };
  return {
    ok: true,
    value: { pairId: row.pair_id, partnerLabel: row.partner_label ?? null, pairName: row.pair_name ?? null },
  };
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
  const all = await loadMyPairs(client, userId);
  if (!all.ok) return all;
  return { ok: true, value: all.value.live ?? all.value.frozen[0] ?? null };
}

/**
 * Ask the server to blank the words of anything removed more than thirty days ago, on one list.
 *
 * WHY THIS HAS A CALLER AT ALL. Nothing else would ever run it: there is no cron, `pg_cron` is not
 * enabled, and the Worker's hourly job holds only the anon key while `service_role` is a standing
 * never. Without a call site the thirty-day promise would be a function nobody invokes, which is a
 * worse position than not having promised it.
 *
 * BEST EFFORT, ALWAYS. It returns void and swallows everything, because a redaction sweep must
 * never be the reason a person cannot see their shared list. The server refuses it on a killed pair
 * by predicate rather than by raising, so a refusal is a zero and not an error, and a frozen list IS
 * swept deliberately: those are the ones that have been sitting longest.
 *
 * The COPY this obliges, and it is not optional: removed items keep their words for **at least**
 * thirty days and are blanked the next time either person opens the list. Never "within thirty
 * days". Coverage here is "either of you opens the app", not a guarantee about elapsed time, and
 * that sentence is what Google reads during review.
 */
export async function sweepTombstones(client: SupabaseClient, pairId: string): Promise<void> {
  try {
    await client.rpc('sweep_shared_tombstones', { p_pair: pairId });
  } catch {
    // Deliberately silent. See above.
  }
}

/** Every list you are in: the one live one, and any frozen ones, newest first. */
export type MyPairs = { live: MyPair | null; frozen: MyPair[] };

/**
 * All of a user's memberships, sorted.
 *
 * MULTIPLE MEMBERSHIPS ARE A DESIGNED STATE, not an exotic one: leaving freezes a pair without
 * deleting the row, and the abuse ceiling permits 25 of them. The first version picked
 * `rows.find(r => r.user_id === userId)` on an unordered PostgREST read, which in practice yields
 * the OLDEST, which is the frozen one, so the screen could show "this list is closed" while the
 * live list the partner was actively using was unreachable, and every subsequent call (leave,
 * forget, and in Phase 3 the whole task sync and the cache prune) pointed at the wrong list.
 *
 * A live pair wins; newest `joined_at` breaks a tie. Frozen ones are RETURNED rather than filtered,
 * because "you can still read everything here" is a promise the app makes in five languages and a
 * filter would quietly break it the moment someone starts a second list.
 */
export async function loadMyPairs(client: SupabaseClient, userId: string): Promise<PairResult<MyPairs>> {
  const members = await client.from('pair_members').select('pair_id, user_id, label, joined_at');
  if (members.error) return fail(members.error);
  const rows = (members.data ?? []) as {
    pair_id: string;
    user_id: string;
    label: string | null;
    joined_at?: string | null;
  }[];
  const mine = rows.filter((r) => r.user_id === userId);
  if (mine.length === 0) return { ok: true, value: { live: null, frozen: [] } };

  // Both reads happen before anything is chosen: liveness lives on `pairs`, not on the membership.
  const pairs = await client.from('pairs').select('id, name, closed_at, disabled_at');
  if (pairs.error) return fail(pairs.error);
  const byId = new Map(
    ((pairs.data ?? []) as { id: string; name: string | null; closed_at: string | null; disabled_at: string | null }[]).map(
      (p) => [p.id, p],
    ),
  );

  const built: MyPair[] = mine.map((m) => {
    const p = byId.get(m.pair_id);
    return {
      pairId: m.pair_id,
      name: p?.name ?? null,
      myLabel: m.label,
      partnerLabel: rows.find((r) => r.pair_id === m.pair_id && r.user_id !== userId)?.label ?? null,
      hasPartner: rows.some((r) => r.pair_id === m.pair_id && r.user_id !== userId),
      closedAt: p?.closed_at ?? null,
      disabledAt: p?.disabled_at ?? null,
      joinedAt: m.joined_at ?? null,
    };
  });

  const newestFirst = (a: MyPair, b: MyPair) => Date.parse(b.joinedAt ?? '') - Date.parse(a.joinedAt ?? '') || 0;
  const isLive = (p: MyPair) => !p.closedAt && !p.disabledAt;
  const live = built.filter(isLive).sort(newestFirst)[0] ?? null;
  const frozen = built.filter((p) => !isLive(p)).sort(newestFirst);

  // The retention sweep rides here because this read already enumerates EVERY pair, live and
  // frozen, on every open of Ours, and nothing else in the system ever would (no cron, no elevated
  // key). Fire-and-forget: not awaited, so it can never delay the list appearing, and each call is
  // an indexed UPDATE that matches nothing on all but a handful of days in a list's life.
  //
  // Frozen lists are included ON PURPOSE. They are the ones that have been sitting longest, and
  // they are exactly the lists somebody might want to stop carrying the words of.
  for (const pair of [...(live ? [live] : []), ...frozen]) void sweepTombstones(client, pair.pairId);

  return { ok: true, value: { live, frozen } };
}
