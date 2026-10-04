# Security policy

DoubleDone is a calm, ADHD-friendly to-do app, live on the web at doubledone.app, on the App Store and
on Google Play, with paying subscribers. It is anonymous and local-first by default, and its security
posture follows from that: collect as little as possible, and scope what is collected to its owner by
architecture rather than by promise.

## Reporting a vulnerability

Please **do not** open a public issue for a security problem. Email **support@doubledone.app** with the
details, and a proof of concept if you have one. You will get an acknowledgement within 72 hours, and we
ask for reasonable time to fix before any public disclosure.

Useful things to include: which surface is affected (the apps, doubledone.app, or the API at
api.doubledone.app, which serves the AI routes, the REST API, the MCP server and the billing webhooks),
the steps to reproduce, and what an attacker could reach.

While you look, please:

- use only your own account and your own data, never someone else's
- skip volume or denial-of-service testing, because the AI routes spend a real, capped budget
- report issues in Supabase, Cloudflare, Stripe, Apple, Google, RevenueCat or Anthropic to them directly

Fixes land on `main`, which is what doubledone.app serves, and reach the store apps in the next release.
Only the current release is supported.

## The security model in brief

### Local-first, anonymous by default

- The daily loop works fully with no account: capture, Today, the Calendar, routines and Settle. Tasks,
  routines and settings then live only on the device (AsyncStorage, which is localStorage on the web).
  An account comes in for sync, shared lists, buying Premium on Android, the Premium features that run
  on the server, and connecting an AI assistant. The Supabase client is not even created when sync is
  not configured ([`client/src/lib/supabase.ts`](client/src/lib/supabase.ts)).
- With no account, a few things can still leave the device:
  - the text you send when you tap an AI feature (a photo scan is Premium and needs an account, so a
    photo never leaves a signed-out device)
  - a feature-usage count, from a fixed list of 20 event names, with no task text, ids or user id. A few
    carry one small detail, such as which knock of Hold me to it worked, and the Worker folds it into the
    name ([`client/src/lib/telemetry.ts`](client/src/lib/telemetry.ts),
    [`server/src/events.ts`](server/src/events.ts))
  - a completion count when you finish steps from a broken-down task: a random id, a step total and a
    number of days ([`client/src/lib/outcome.ts`](client/src/lib/outcome.ts))
  - a web push subscription, if you turn on the daily reminder in a browser
  - feedback you choose to send
  - on iOS and Android, the RevenueCat SDK, which starts when the app opens
- AI can be switched off entirely in Settings, and the app then runs with no generative AI at all.

### Sync, scoped by row-level security

- Sign-in is passwordless: Supabase Auth sends a 6-digit code to your email. There are no passwords to
  steal or reuse.
- Once signed in, tasks and scrapbook keepsake records sync to Supabase Postgres. Every row carries its
  owner, and row-level security allows select, insert, update and delete only where
  `auth.uid() = user_id` ([`supabase/schema.sql`](supabase/schema.sql)).
- **Shared lists (Ours)** are the one place two people see the same rows. They live in their own tables
  ([`supabase/ours.sql`](supabase/ours.sql)), so the policies on personal tasks are never touched:
  - a list holds exactly two people, and row-level security lets only its members read or write its rows
  - joining goes through security-definer functions, never a direct insert. An invite code is stored
    only as a SHA-256 hash, is bound to a hash of the invited email address, lasts 24 hours, and a
    joiner gets 10 wrong guesses an hour
  - the server stamps who created a row and owns its tombstone, so a client cannot forge either
  - nothing records who ticked or removed something. There is no column for it
- Every security-definer function in `supabase/` pins an empty `search_path` and is revoked from the
  anonymous role.

### Verified tokens, and no service-role key

- Every Worker route that acts for a signed-in user verifies the bearer token cryptographically before
  it touches data, money or the AI budget: the billing routes, the free trial, the Apple purchase
  reconcile, the Premium AI routes, the REST API, the MCP tools and the connector kill switch
  ([`server/src/verify.ts`](server/src/verify.ts)). It checks the signature against
  Supabase's published keys (JWKS), allows only ES256 and RS256 (which blocks `alg: none` and the HS256
  key-confusion trick), checks the issuer and expiry, and requires a user id. Any failure is a refusal.
- Decoding a token without checking its signature is never used to decide who is asking.
- The REST API and the MCP server act only with the user's own token, proxying each call to Supabase
  under that user's row-level security. The Supabase **service-role key is not used** anywhere in the
  client or the Worker. Account deletion runs as the user, through a `delete_account()` function that
  can only ever delete `auth.uid()`.

### Secrets live only in the Worker

- Every Claude call goes through a Cloudflare Worker that holds `ANTHROPIC_API_KEY` as a Worker secret.
  The apps talk to the Worker, never to the model provider, so the key cannot leak from a client bundle.
- The Stripe secret key, the webhook secrets, the RevenueCat secret key, the OAuth custody key and the web
  push private key are Worker secrets too, set with `npx wrangler secret put` and never committed.
- What ships inside the apps is public by design: the Supabase URL and its publishable anon key (row-level
  security does the authorising), the RevenueCat public SDK keys, and the web push public key.

### Connecting an AI assistant (MCP and REST)

- **OAuth 2.1** is how connector apps such as claude.ai and ChatGPT connect
  ([`server/src/oauth.ts`](server/src/oauth.ts)). S256 PKCE is required, plain PKCE and the implicit flow
  are refused, and sign-in is an email code. The email step answers identically whether or not an account
  exists, so it cannot be used to check who has one, and it is rate limited per IP.
- The user's Supabase refresh token is held AES-GCM-256 encrypted in D1 under a Worker secret
  ([`server/src/mcp-grants.ts`](server/src/mcp-grants.ts)). A short-lived access token (about an hour)
  is cached alongside it, unencrypted. **Disconnect AI connectors** in Settings deletes that custody at once, so the
  next call is refused.
- **A pasted token is your own Supabase access token**, valid for about an hour. Treat it like a
  password: whoever holds it can act as you, inside your own rows, until it expires.
- The MCP `break_down` tool is propose-only (it adds nothing without your yes), and is capped at 20 an
  hour per user, failing closed if the counter cannot be read.

### Money

- Card details never reach DoubleDone. Stripe (web), Apple (iOS) and Google Play (Android) take payment.
- The Stripe webhook is accepted only with a valid HMAC-SHA256 signature inside a five-minute window,
  and a repeat delivery of the same event is skipped by its id
  ([`server/src/stripe.ts`](server/src/stripe.ts)).
- The RevenueCat webhook (Apple and Google Play) needs a shared secret, compared in constant time, plus
  an optional HMAC signature. Sandbox (test) purchases are refused rather than written to real
  entitlements, apart from a short named list of test accounts
  ([`server/src/revenuecat.ts`](server/src/revenuecat.ts)).
- Entitlement writes are guarded so one store can never switch off another store's live subscription,
  and an older RevenueCat event that arrives late cannot undo a newer one
  ([`server/src/entitlements.ts`](server/src/entitlements.ts)).
- Premium AI routes fail closed: if the entitlement cannot be read, the answer is a refusal, never free
  access ([`server/src/premium.ts`](server/src/premium.ts)).
- Deleting an account cancels any chargeable Stripe subscription, and turns off a Google Play renewal,
  **before** anything is deleted. If billing cannot be closed, nothing is deleted. Apple does not let a
  server cancel a subscription, so the app tells Apple subscribers to cancel in their Apple settings.

### Abuse and cost limits

- Browser calls to the app's own routes (the AI routes, the usage counts, feedback, checkout, the billing
  portal, the entitlement read, account billing close, web push and the connector kill switch) must come
  from doubledone.app, its Cloudflare Pages previews, or a local dev server
  ([`server/src/index.ts`](server/src/index.ts)). The native apps send no Origin and are not affected.
  The REST API and the MCP server are meant to be reached from anywhere, so the token is their guard.
- Rate limits ([`server/wrangler.jsonc`](server/wrangler.jsonc)): 30 a minute per IP on the AI routes
  (the usage beacon has its own allowance), 5 a minute per IP on the OAuth email step, and 5 a minute
  per user on account billing close and purchase reconcile.
- Size caps: 100 KB on text AI requests, about 1.9 MB for a scanned photo, and any request that declares
  more than 2 MB is refused before it is read.
- Every Claude call sets a token ceiling, and every one except the weekly reflection forces a structured
  answer (the reflection is a short free-text paragraph). The language field accepts only a fixed list,
  so it cannot carry instructions ([`server/src/lang.ts`](server/src/lang.ts)).
- Scrapbook images are limited to 20 per IP in any 24 hours, and the IP rows behind that count are
  purged once they are 24 hours old.
- An hourly monitor emails the owner when spend, errors or volume cross a threshold. The alerts carry
  counts and error messages only, never task text, IP addresses or user ids
  ([`server/src/monitor.ts`](server/src/monitor.ts)).

### On the web

- doubledone.app sends HSTS for one year, subdomains included, so api.doubledone.app is covered too
  once a browser has visited doubledone.app ([`client/public/_headers`](client/public/_headers)). Preload is left off on purpose, because it is
  effectively irreversible.
- The daily web reminder is payloadless. The words live in the service worker, and the server stores only
  the subscription, a preferred hour and a timezone offset.
- Keepsake images live in R2 under random UUID keys and are served read-only with no listing route. The
  image route is CORS-open by design (the web share path fetches the image to build the shareable page),
  so the unguessable key, not the origin, is what guards an image.

## Privacy posture

The full, plain-English policy is at [doubledone.app/privacy](https://doubledone.app/privacy)
([`client/public/privacy.html`](client/public/privacy.html)). In brief:

- **No ads, no advertising identifiers, no cross-app tracking, and no selling or sharing data.**
- **Telemetry lives in Cloudflare D1, with no public write path.** Only the Worker can write to it
  ([`server/d1/schema.sql`](server/d1/schema.sql)):
  - the AI-call log keeps the text sent to most AI features, with no user id, account or IP address, so
    it is pseudonymous. A few keep only counts. A scanned photo is never stored, only its size and the
    number of titles found. The weekly reflection keeps only how many titles it read and how long its
    paragraph was. The energy pick and the suggested order keep a task count and the settings chosen,
    never the titles
  - completion outcomes hold a random id, a step count and a number of days
  - feature usage is a daily counter per event name, stored without even a row id, so not even the order
    of events survives
- **An older telemetry table is still defined in Supabase.** [`supabase/schema.sql`](supabase/schema.sql)
  keeps the `ai_calls` table from before telemetry moved to D1. Nothing in the app or the Worker writes to
  it now. Its policy accepts inserts and there is no read policy, so no row can be read back through the
  API.
- **Some server records are tied to an account, because they have to be:** subscription status, the free
  trial, the RevenueCat delivery log, and an AI connector's encrypted custody.
- **"Where you left off"** notes sync to your own row, and nothing else sees them. They are never sent to
  an AI feature, never returned by the REST API or the MCP tools, and never put on a shared list.
- **Deleting your account** removes the account and, with it, your synced tasks, keepsake records and
  shared-list memberships. Keepsake images are purged from storage and the local store on that device is
  wiped. Words you added to a shared list stay with the other person, no longer linked to your account.
  Some records are kept: billing records (for tax and refunds), the pseudonymous AI-call log, which was
  never linked to you, the record that you used the free trial, and the stored connection of any AI
  connector you never disconnected (your email address and its sign-in keys, the long-lived one encrypted). To remove that last
  one, use Disconnect AI connectors before you delete the account.

## Secrets discipline in this repo

The repo is public, so this matters more than usual.

- **The pre-commit Inspector** ([`.githooks/pre-commit`](.githooks/pre-commit)) runs lint (when code is
  staged), the typecheck and the tests, then an always-on, blocking secret scan of every added line: known key formats (Google,
  OpenAI-style, GitHub, Slack, AWS, PEM private keys, Shopify) and hard-coded values assigned to
  password, secret, token or key names. Then `gitleaks protect --staged` runs, if gitleaks is installed.
  Turn the hooks on once per clone with `npm run setup`. Never bypass them with `--no-verify`.
- **CI** ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs `gitleaks detect` over the full
  history, with redacted output, on every push to `main` and every pull request into it.
- `.env`, every `.env.*` except `.env.example`, `.dev.vars` and `.wrangler/` are gitignored. Worker
  secrets live only in Cloudflare.

## If a secret is ever committed

1. **Revoke and rotate it immediately.** In a public repo, assume it was copied the moment it was pushed.
2. **Purge it from history** (`git filter-repo` or BFG) and force-push.
3. **Add a detection rule** (a gitleaks pattern, or a format in the Inspector's scan) so it cannot recur.
