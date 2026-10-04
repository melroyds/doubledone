import { describe, expect, it } from 'vitest';

import { handleScrapbookPurge, isScrapbookKey, type ScrapbookBucket, scrapbookOwner } from './scrapbook-purge';

const A = '0b9a7c3e-1f2d-4c5b-8a6e-9d0f1e2a3b4c.jpg';
const B = '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f.jpg';
const C = '2d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f6a.jpg';
const URL_ = 'https://example.supabase.co';
const cors = { 'access-control-allow-origin': 'https://doubledone.app' };

// A fake R2 holding objects with their owner tag (or none), recording what was deleted.
function bucket(objects: Record<string, string | undefined>) {
  const deleted: string[] = [];
  const store: Record<string, { customMetadata?: Record<string, string> }> = {};
  for (const [k, owner] of Object.entries(objects)) store[k] = owner ? { customMetadata: { owner } } : {};
  const b: ScrapbookBucket = {
    put: async () => undefined,
    head: async (k) => store[k] ?? null,
    delete: async (k) => {
      deleted.push(k);
      delete store[k];
    },
  };
  return { b, deleted };
}

// The verifier stub: 'good-alice' is Alice, 'good-bob' is Bob, anything else is forged or expired.
const verify = async (token: string) => (token === 'good-alice' ? 'alice' : token === 'good-bob' ? 'bob' : null);

function post(keys: unknown, token?: string): Request {
  return new Request('https://api.doubledone.app/scrapbook/purge', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ keys }),
  });
}

async function run(objects: Record<string, string | undefined>, keys: unknown, token?: string, enforce = 'on') {
  const { b, deleted } = bucket(objects);
  const res = await handleScrapbookPurge(post(keys, token), { SCRAPBOOKS: b, SUPABASE_URL: URL_, SCRAPBOOK_PURGE_ENFORCE: enforce }, cors, verify);
  return { status: res.status, body: (await res.json()) as { deleted: number; refused: number }, deleted };
}

describe('POST /scrapbook/purge: a tagged image only for its verified owner', () => {
  it('deletes the owner\'s own tagged images', async () => {
    const r = await run({ [A]: 'alice', [B]: 'alice' }, [A, B], 'good-alice');
    expect(r.body).toMatchObject({ deleted: 2, refused: 0 });
    expect(r.deleted).toEqual([A, B]);
  });

  it('refuses somebody else\'s tagged image, and still deletes the caller\'s own', async () => {
    const r = await run({ [A]: 'alice', [B]: 'bob' }, [A, B], 'good-alice');
    expect(r.body).toMatchObject({ deleted: 1, refused: 1 });
    expect(r.deleted).toEqual([A]);
  });

  it('refuses a tagged image with no token, and with a forged one', async () => {
    expect((await run({ [A]: 'alice' }, [A])).deleted).toEqual([]);
    const forged = await run({ [A]: 'alice' }, [A], 'forged');
    expect(forged.body).toMatchObject({ deleted: 0, refused: 1 });
    expect(forged.deleted).toEqual([]);
  });

  it('still deletes an untagged (older or anonymous) image by its key, token or not', async () => {
    // Older app builds send no token; their purge after an account deletion must still clean up.
    expect((await run({ [A]: undefined }, [A])).deleted).toEqual([A]);
    expect((await run({ [A]: undefined }, [A], 'good-bob')).deleted).toEqual([A]);
  });

  it('keeps the old rule until enforcement is switched on: a tagged image goes by its key alone', async () => {
    // Staged on purpose: store builds older than 2026-10-05 purge with no token after the account is gone.
    const off = await run({ [A]: 'alice' }, [A], undefined, '');
    expect(off.body).toMatchObject({ deleted: 1, refused: 0 });
    expect(off.deleted).toEqual([A]);
  });

  it('ignores anything that is not an upload key, and skips a key that is gone', async () => {
    const r = await run({ [A]: undefined }, [A, 'a.jpg', '../x', 7, null, C], 'good-alice');
    expect(r.body).toMatchObject({ deleted: 1, refused: 0 });
    expect(r.deleted).toEqual([A]);
  });

  it('answers a bad body with 400 and an unbound bucket with a no-op', async () => {
    const bad = new Request('https://api.doubledone.app/scrapbook/purge', { method: 'POST', body: 'not json' });
    expect((await handleScrapbookPurge(bad, { SCRAPBOOKS: bucket({}).b, SUPABASE_URL: URL_ }, cors, verify)).status).toBe(400);
    const none = await handleScrapbookPurge(post([A]), { SUPABASE_URL: URL_ }, cors, verify);
    expect(await none.json()).toEqual({ ok: true, deleted: 0, refused: 0 });
  });

  it('keeps going past a delete that throws', async () => {
    const { b } = bucket({ [A]: undefined, [B]: undefined });
    let calls = 0;
    const flaky: ScrapbookBucket = {
      ...b,
      delete: async (k) => {
        calls += 1;
        if (k === A) throw new Error('blip');
        return b.delete(k);
      },
    };
    const res = await handleScrapbookPurge(post([A, B]), { SCRAPBOOKS: flaky, SUPABASE_URL: URL_ }, cors, verify);
    expect(await res.json()).toMatchObject({ deleted: 1 });
    expect(calls).toBe(2);
  });
});

describe('scrapbookOwner (the tag written at upload)', () => {
  const req = (token?: string) =>
    new Request('https://api.doubledone.app/scrapbook', { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {} });

  it('is the verified id when signed in, and null otherwise', async () => {
    expect(await scrapbookOwner(req('good-alice'), URL_, verify)).toBe('alice');
    expect(await scrapbookOwner(req('forged'), URL_, verify)).toBeNull();
    expect(await scrapbookOwner(req(), URL_, verify)).toBeNull();
    expect(await scrapbookOwner(req('good-alice'), undefined, verify)).toBeNull();
  });

  it('never throws: a verifier failure just means no tag', async () => {
    const boom = async () => {
      throw new Error('jwks down');
    };
    expect(await scrapbookOwner(req('good-alice'), URL_, boom)).toBeNull();
  });

  it('recognises only the upload\'s own key shape', () => {
    expect(isScrapbookKey(A)).toBe(true);
    expect(isScrapbookKey('a.jpg')).toBe(false);
    expect(isScrapbookKey(`${A}/../b`)).toBe(false);
    expect(isScrapbookKey(A.toUpperCase())).toBe(false);
  });
});
