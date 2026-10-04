// Who may delete a scrapbook keepsake image from R2 (2026-10-05).
//
// Until now POST /scrapbook/purge deleted any key it was given, with no sign-in. Keys are unguessable
// UUIDs, but every image is also publicly READABLE at /scrapbook-img/<key> (the <Image> tag loads it
// cross-origin), so anyone who ever saw an image's address could delete it. Now:
//
//   - On upload, a signed-in person's image is tagged with their VERIFIED user id (R2 customMetadata
//     `owner`). Anonymous keepsakes (free, no account) stay untagged, as every image before this did.
//   - On purge, ONCE ENFORCED (the Worker var SCRAPBOOK_PURGE_ENFORCE = "on"), a tagged image is
//     deleted only for its verified owner; an untagged one keeps the old rule (the key is the
//     capability). A foreign tagged key is refused, never an error, and reported as `refused`.
//
// Why enforcement is staged, OFF by default (the 2026-10-05 review): store builds older than this
// change purge with NO token, after the account is gone. With the refusal on, an account deleted from
// such a phone would leave its tagged keepsakes in R2 for good (their keys are wiped right after), and
// a momentary verifier blip would do the same. Turning a minor theoretical hole (an unguessable key is
// the only way in) into a real erasure gap is the wrong trade, so the tags and the tokens ship now and
// the refusal is one var away, for when updated builds are out (BUILD-PLAN Backlog has the trigger).
//
// The app captures its token BEFORE deleting the account (deleteAccount signs out at the end), and a
// deleted user's access token still verifies until it expires: verify.ts checks the signature, the
// issuer and the expiry, never whether the account still exists. That is what lets the purge that
// follows a deletion prove who is asking.

import { bearer } from './stripe';
import { defaultVerifySub, type SubVerifier } from './verify';

export interface ScrapbookBucket {
  put(
    key: string,
    value: ArrayBuffer | Uint8Array,
    options?: { httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string> },
  ): Promise<unknown>;
  head(key: string): Promise<{ customMetadata?: Record<string, string> } | null>;
  delete(key: string): Promise<unknown>;
}

// The only shape the upload ever writes: `${crypto.randomUUID()}.jpg`. Anything else is not ours to delete.
const KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/;
const MAX_KEYS = 200;

export function isScrapbookKey(value: unknown): value is string {
  return typeof value === 'string' && KEY.test(value);
}

/** The verified user id behind a request's bearer, or null (no token, a forged or expired one, or the
 *  verifier unavailable). Never throws: a keepsake for someone signed out is still a keepsake. */
export async function scrapbookOwner(
  request: Request,
  supabaseUrl: string | undefined,
  verifySub: SubVerifier = defaultVerifySub,
): Promise<string | null> {
  const token = bearer(request);
  if (!token || !supabaseUrl) return null;
  try {
    return await verifySub(token, supabaseUrl);
  } catch {
    return null;
  }
}

/** POST /scrapbook/purge {keys}: delete the caller's own images. Best-effort per key, so one failure never
 *  stops the rest; an unknown key is skipped. Returns { ok, deleted, refused }. */
export async function handleScrapbookPurge(
  request: Request,
  env: { SCRAPBOOKS?: ScrapbookBucket; SUPABASE_URL?: string; SCRAPBOOK_PURGE_ENFORCE?: string },
  cors: Record<string, string>,
  verifySub: SubVerifier = defaultVerifySub,
): Promise<Response> {
  if (!env.SCRAPBOOKS) return Response.json({ ok: true, deleted: 0, refused: 0 }, { headers: cors });
  let keys: string[] = [];
  try {
    const body = (await request.json()) as { keys?: unknown };
    if (Array.isArray(body.keys)) keys = body.keys.filter(isScrapbookKey).slice(0, MAX_KEYS);
  } catch {
    return Response.json({ error: 'bad request' }, { status: 400, headers: cors });
  }
  const enforce = env.SCRAPBOOK_PURGE_ENFORCE === 'on';
  // Only an enforcing Worker needs to know who is asking, so an unenforced purge never waits on JWKS.
  const caller = enforce && keys.length > 0 ? await scrapbookOwner(request, env.SUPABASE_URL, verifySub) : null;
  let deleted = 0;
  let refused = 0;
  for (const key of keys) {
    try {
      const object = await env.SCRAPBOOKS.head(key);
      if (!object) continue;
      const owner = object.customMetadata?.owner;
      if (enforce && owner && owner !== caller) {
        refused += 1;
        continue;
      }
      await env.SCRAPBOOKS.delete(key);
      deleted += 1;
    } catch {
      // best effort; keep going
    }
  }
  return Response.json({ ok: true, deleted, refused }, { headers: cors });
}
