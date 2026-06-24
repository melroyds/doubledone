# Security Policy

DoubleDone is a calm, ADHD-friendly to-do app. It is anonymous and local-first by default, and
its security posture follows from that: collect as little as possible, and scope what is
collected to its owner by architecture rather than by promise.

## Reporting a vulnerability

Please **do not** open a public issue for a security problem. Email **support@doubledone.app**
with the details, and a proof-of-concept if you have one. You will get an acknowledgement within
72 hours, and we ask for reasonable time to fix before any public disclosure.

## How the app protects data

- **Anonymous and local-first.** The app is fully usable with no account. Tasks live on the
  device (AsyncStorage). Nothing is uploaded unless you choose to sign in.
- **Opt-in sync, scoped by row-level security.** Sign-in is passwordless (email OTP). Once
  signed in, tasks sync to Supabase Postgres where **row-level security** scopes every row to
  its owner. A user's token can only ever read or write that user's own rows.
- **The AI key never reaches the client.** Every Claude call goes through a Cloudflare Worker
  that holds the Anthropic key as a Worker secret. The app talks to the Worker, never to the
  model provider, so the key cannot leak from a client bundle.
- **The integration surfaces hold no elevated key.** The public REST API and the MCP server
  authenticate with the *user's own* token and proxy each call under that user's row-level
  security. They carry only the public anon key, never the Supabase service-role key, so neither
  can ever reach another account's data.
- **Telemetry is pseudonymous and one-way.** The completion-outcome data that improves the
  decomposition model lives in Cloudflare D1 with **no user id and no task text**, and there is
  **no public write path** to it. The Worker writes, nothing else can.
- **Web push carries no content.** The daily reminder is payloadless: the message lives in the
  service worker. The server stores only a subscription, a preferred hour, and a timezone
  offset, never task text.
- **Right to erasure.** Deleting your account removes your synced rows, wipes the local store on
  the originating device, and purges any generated keepsake images from object storage.

## Secrets discipline (this repo)

- A pre-commit **secret scan + gitleaks** blocks hardcoded credentials before they enter history
  (`.githooks/pre-commit`), and CI re-runs the scan on every push as a backstop
  (`.github/workflows/ci.yml`).
- Real secrets live in a secret manager (Cloudflare Worker secrets) or a gitignored `.env`,
  never in the repo. `.env.example` lists every key by name with no value.
- The Supabase **service-role key is never used** by the app or its backends. Only the
  publishable anon key ships, and it is safe by design because row-level security does the
  authorising.

## If a secret is ever committed

1. **Revoke and rotate it immediately.** Assume it is compromised the moment it is pushed.
2. **Purge it from history** (`git filter-repo` or BFG) and force-push.
3. **Add a detection rule** (a gitleaks pattern) so it cannot recur.
