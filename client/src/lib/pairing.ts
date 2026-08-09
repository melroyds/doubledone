// Ours, the pairing code: the pure half. Formatting, normalisation, validation, and the
// translation of a Postgres error into something this app is willing to say out loud. No
// Supabase import here, so all of it is testable without a database (the seam that calls the
// RPCs is ours-api.ts).
//
// Architecture: docs/shared-lists.md §2 · the SQL it must agree with: supabase/ours.sql

/** The code alphabet, byte-for-byte the one `create_pair_invite` generates from. No I, L, O, 0
 *  or 1: this code gets read aloud across a kitchen. */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 6;

/**
 * Strip a typed code back to bare characters and upper-case it.
 *
 * This MUST stay identical to the server's `upper(regexp_replace(code, '[^A-Za-z0-9]', '', 'g'))`,
 * or a perfectly-typed code hashes to something the database has never seen. That is why the
 * class is a whitelist rather than a "remove dashes and spaces" blacklist: a pasted non-breaking
 * hyphen or non-breaking space dies here too, and both are what a phone actually produces when a
 * code is copied out of a message.
 *
 * 0 and 1 are deliberately NOT removed. Someone who typed 0 for O should fail honestly rather
 * than have a character silently deleted and wonder why a code they can see on screen is wrong.
 */
export function normaliseCode(input: string): string {
  return input.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

/** Group a code for display, `K7MP4Q` becoming `K7M-P4Q`. Purely visual: what the user types
 *  back is normalised before it is ever compared, so the separator can never break a redemption. */
export function formatCode(code: string): string {
  const bare = normaliseCode(code);
  if (bare.length <= 3) return bare;
  return `${bare.slice(0, 3)}-${bare.slice(3, 6)}`;
}

/** Whether a typed code is long enough to try. Never a claim that it is correct. */
export function isCodeComplete(input: string): boolean {
  return normaliseCode(input).length === CODE_LENGTH;
}

/**
 * The characters a code can never contain, that a person is likely to type anyway. Used for a
 * gentle hint, never to auto-correct: silently rewriting what someone typed is how an app
 * teaches you not to trust your own eyes, and the server would reject it either way.
 */
export function ambiguousChars(input: string): string[] {
  const seen = new Set<string>();
  for (const ch of normaliseCode(input)) {
    if (!CODE_ALPHABET.includes(ch)) seen.add(ch);
  }
  return [...seen];
}

/** The self-chosen name, capped to what the column will accept. The server caps too; this exists
 *  so an honest person never meets the error. Empty is allowed: the server falls back for us. */
export const LABEL_MAX = 40;
export function capLabel(input: string): string {
  return input.trim().slice(0, LABEL_MAX).trim();
}

/**
 * What the list is called, capped to the same column width.
 *
 * Separate from capLabel despite the identical body, because the two are different ideas that will
 * drift: a label is who you are to one person, a name is what a household calls its list, and only
 * one of them is on both phones. Empty is the ordinary answer and must survive as empty: the seam
 * turns it into a null, which renders as the app's own word in whichever language each person is
 * reading. Storing the English 'Ours' would fix one household in one language forever.
 */
export const NAME_MAX = 40;
export function capName(input: string): string {
  return input.trim().slice(0, NAME_MAX).trim();
}

/**
 * A permissive shape check on the address an invite is bound to. Deliberately no stricter than
 * the server's "does it contain an @", because every clever email regex ever written rejects
 * somebody's real address, and being told your own email is invalid by a to-do app is a small
 * humiliation this product declines to hand out.
 */
export function looksLikeEmail(input: string): boolean {
  const v = input.trim();
  const at = v.indexOf('@');
  return at > 0 && at < v.length - 1 && !/\s/.test(v);
}

/** Normalise an address the same way the server does before it is hashed or compared. */
export function normaliseEmail(input: string): string {
  return input.trim().toLowerCase();
}

// --- turning Postgres into something we are willing to say -------------------------------

/** Every way pairing can fail, in terms the interface can speak. `invalid-code` covers wrong,
 *  expired, already-used, meant-for-someone-else and killed alike: the server deliberately
 *  cannot tell them apart, so neither can we, and a guesser learns nothing. */
export type PairFailure =
  | 'signed-out'
  | 'not-open'      // the build-time allowlist
  | 'already-paired'
  | 'list-full'
  | 'bad-email'
  | 'own-email'
  | 'invalid-code'
  | 'rate-limited'
  | 'too-many-lists'
  | 'not-yours'
  | 'offline'
  | 'unknown';

/**
 * Map a PostgREST error onto a failure this app can render.
 *
 * The message strings are a CONTRACT with supabase/ours.sql: both sides are ours, and the codes
 * alone are ambiguous (23505 is raised for both "already in a shared list" and "that list is
 * full", 42501 for both the allowlist and "not your list"). Anything unrecognised becomes
 * 'unknown' rather than leaking a database sentence into a calm surface.
 */
export function classifyPairError(error: { code?: string | null; message?: string | null } | null): PairFailure {
  if (!error) return 'unknown';
  const code = error.code ?? '';
  const message = (error.message ?? '').toLowerCase();

  // supabase-js reports a dead network as a TypeError with no PostgREST code.
  if (!code && /network|fetch|failed to fetch/.test(message)) return 'offline';

  if (code === '28000') return 'signed-out';
  if (code === '42501') return message.includes('not open') ? 'not-open' : 'not-yours';
  if (code === '23505') return message.includes('full') ? 'list-full' : 'already-paired';
  if (code === '54000') return message.includes('old lists') ? 'too-many-lists' : 'rate-limited';
  if (code === '22023') return message.includes('own address') ? 'own-email' : 'bad-email';
  return 'unknown';
}
