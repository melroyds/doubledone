# Scrapbook image persistence to R2 (staged plan)

**Status: designed and ready, NOT yet executed.** This is the one backlog item that
cannot be blind-built: it spans an R2 bucket, a Supabase migration, and a Worker
deploy (all on Melroy's accounts), and it must be verified live, not shipped untested.
Run it as one ~25-minute joint session and verify the round-trip on a real device.

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
