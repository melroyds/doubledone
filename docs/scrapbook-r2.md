# Scrapbook image persistence to R2 (staged plan)

**Status: executed, in two halves.** The R2 half (upload on generation, serve by URL)
went live in a joint session on 2026-06-20 and was verified against the live Worker.
The sync half (the Supabase `scrapbooks` table, keepsakes following the account) shipped
on 2026-07-12, once R2 had made a keepsake row cheap enough to sync. The plan below is
preserved as written; the as-built deltas are at the end.

## Why

Scrapbook images are base64 in `localStorage` today: device-local, lost on a cache
clear or reinstall, no cross-device sync, and ~500 KB each risks the storage quota.
Now that the scrapbook is a **paid** feature, a user losing their keepsake is a trust
break. Move the bytes to Cloudflare R2 (Worker uploads on generation, serves by URL)
and sync the metadata via a Supabase `scrapbooks` table.

## Steps (in order, each verifiable)

### 1. R2 bucket (Cloudflare, Melroy's account)
```
npx wrangler r2 bucket create doubledone-scrapbooks
```
Add the binding to `server/wrangler.jsonc`:
```jsonc
"r2_buckets": [{ "binding": "SCRAPBOOKS", "bucket_name": "doubledone-scrapbooks" }]
```
Decision to make together: **serve via a Worker route** (`GET /scrapbook-img/:key`
streams from R2; keeps everything on the `doubledone-ai` Worker, no public bucket
domain) vs an R2 public bucket URL. Recommend the Worker route, it keeps one origin
and lets us add a cache header + (later) a signed-URL check.

### 2. Worker `/scrapbook` change (`server/src`)
After the flux image is generated (currently returned as base64), instead:
- `key = ${userOrPseudId}/${weekStart}-${shortHash}.png`
- `await env.SCRAPBOOKS.put(key, bytes, { httpMetadata: { contentType: 'image/png' } })`
- return `{ imageUrl: \`${origin}/scrapbook-img/${key}\`, caption }` instead of `{ image, caption }`
- add `GET /scrapbook-img/:key` → `env.SCRAPBOOKS.get(key)` → stream with a long
  `cache-control`. Contract-test the request/key shaping (no live R2 in CI).

### 3. Supabase `scrapbooks` table (Melroy's Supabase)
Add to `supabase/schema.sql` and run in the SQL editor:
```sql
create table if not exists public.scrapbooks (
  user_id    uuid not null references auth.users(id) on delete cascade,
  week_start text not null,            -- 'YYYY-MM-DD' (Sunday)
  image_url  text not null,
  caption    text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, week_start)
);
alter table public.scrapbooks enable row level security;
create policy "own scrapbooks" on public.scrapbooks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

### 4. Client (`client/src`)
- `lib/scrapbook.ts`: the `Scrapbook` type's `image` becomes a URL string (keep
  reading old base64 data-URIs too, so existing local scrapbooks still render, the
  `<Image source={{ uri }}>` handles both `https://` and `data:`).
- On generate: store `imageUrl`, not base64. `storage.ts` scrapbook blob shrinks to
  metadata + URL (quota risk gone).
- Sync: push/pull `scrapbooks` rows on sign-in/open, last-write-wins by `created_at`,
  the same shape as the tasks sync engine; unit-test the pure merge.

### 5. Deploy + verify (live, together)
- `npm run deploy --workspace server` (Melroy's per-instance OK).
- Generate a scrapbook on a finished week → confirm the image uploads to R2, the URL
  is stored, it renders from the URL, **survives a cache clear**, and appears on a
  second signed-in device.

## Backward compatibility
Existing device-local base64 scrapbooks keep rendering (the `<Image>` reads `data:`
URIs). They are not back-filled to R2; only new ones go to R2. No data loss, no
migration of old blobs needed.

## As built (deltas from the plan)

What actually shipped, where it differs from the steps above. Full reasoning in the
decision-log (2026-06-20 "built and live" and the 2026-07-12 scrapbook entries).

- **The R2 half (live 2026-06-20).** The Worker `put`s the generated jpeg under a
  random UUID key (`<uuid>.jpg`), not the planned `user/week-hash.png`, and returns
  `/scrapbook-img/<key>`. The route serves long-cached immutable bytes and falls back
  to the inline data-URL if R2 is unbound or errors. No client change was needed for
  this half; the stored image string just shrank ~5000x.
- **CORS on the image route (added 2026-07-12).** `GET /scrapbook-img/:key` now sends
  `access-control-allow-origin: *`, because the web share path `fetch()`es the image to
  composite the shareable keepsake page (the caption baked into the pixels); without it
  that cross-origin fetch failed and web sharing of R2 keepsakes silently degraded.
  Safe to open: public read-only bytes behind an unguessable key, already loadable
  cross-origin by any `<img>` tag.
- **The sync half (live 2026-07-12).** The `scrapbooks` table exists on live (real
  schema in `supabase/schema.sql`: `user_id` + `week_start` primary key, RLS all four
  ways). Two deltas from the step-3 sketch: the image column is `image`, and
  `created_at` is CLIENT-written, the last-write-wins truth for a remade week (the same
  no-`now()` rule as `tasks.updated_at`), not a `default now()`. The merge is a pure
  per-week LWW by `createdAt` (newer replaces everywhere, ties quiescent, capped at the
  newest weeks), and `syncScrapbooks` rides best-effort behind the task sync at both
  call sites, internally caught so its failure can never mark task sync failed.
- **Only R2-URL keepsakes sync.** Legacy `data:` keepsakes predate persistence and stay
  on the device that made them (syncing them would bloat every pull); they keep
  rendering locally, as the backward-compatibility section promised. Every consumer of
  `Scrapbook.image` must accept both shapes, the rule the 2026-07-12 native-share fix
  established.
- **Deletion.** Account deletion purges the R2 objects the deleting device knows about
  (`/scrapbook/purge`); table rows die by cascade. An object known only to another
  device can orphan behind its unguessable key, accepted and parked (2026-07-12).
