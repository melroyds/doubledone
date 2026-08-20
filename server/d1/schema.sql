-- D1 telemetry store for the moat (pseudonymous AI-call log). Moved here from a
-- Supabase `ai_calls` table whose insert used the public anon key (anyone could
-- write). D1 is bound only to the Worker, so there is no public write path at
-- all. Same shape and posture as before: NO user_id, no IP, never tied to an
-- account; it retains the task TEXT the user typed and the returned JSON, for
-- product improvement, which is disclosed in-product (privacy policy).
--
-- Apply to the remote DB once (idempotent):
--   npm exec -w server -- wrangler d1 execute doubledone-telemetry --remote --file d1/schema.sql

create table if not exists ai_calls (
  id integer primary key autoincrement,
  endpoint text not null,          -- 'clarify' | 'decompose' | 'plan' | 'strategise' | 'triage' | 'scrapbook'
  model text not null,             -- the model id used
  input text,                      -- JSON: the request input (task text / tasks / lines / titles)
  output text,                     -- JSON: the parsed returned value (steps / plan / items / caption)
  input_tokens integer,
  output_tokens integer,
  latency_ms integer,
  ok integer not null default 1,   -- 0/1
  error text,
  corr_id text,                    -- pseudonymous decomposition id; joins to outcomes.corr_id (the flywheel link)
  created_at text not null default (datetime('now'))
);
-- For a DB created before corr_id existed (errors harmlessly if already present):
--   ALTER TABLE ai_calls ADD COLUMN corr_id text;

-- outcomes: the completion half of the moat flywheel. Anonymously links a
-- decomposition (by its pseudonymous corr_id, the same id stamped on the offered
-- ai_calls row) to whether/when its steps got finished. NO user_id, no task text,
-- no IP: just the id, the step total, and the whole days from offer to a step
-- finishing. Worker-bound, written only by /outcome, so there is no public write path.
create table if not exists outcomes (
  id integer primary key autoincrement,
  corr_id text not null,           -- the decomposition's pseudonymous id (joins ai_calls.corr_id)
  steps_total integer,             -- how many steps the decomposition had (the denominator)
  days_elapsed integer,            -- whole days from the decomposition being offered to this step finishing
  created_at text not null default (datetime('now'))
);
create index if not exists outcomes_corr on outcomes (corr_id);

-- Premium entitlements, written ONLY by the verified Stripe webhook AND the verified RevenueCat
-- webhook (Apple IAP). One row per user, one place premium is decided, whichever store sold it.
-- Separate from ai_calls (which is pseudonymous): this legitimately holds a user id because it
-- gates a paid feature for that specific user. The client reads its own row via an authed Worker
-- endpoint, never directly.
create table if not exists entitlements (
  user_id text primary key,             -- Supabase auth uid (the JWT sub)
  premium integer not null default 0,   -- 0/1
  status text,                          -- subscription status (active, canceled, past_due, expired, ...)
  current_period_end integer,           -- epoch seconds, when the paid period ends
  cancel_at_period_end integer not null default 0,  -- 0/1, scheduled to cancel at the period end
  started_at text,                      -- ISO, first premium grant (the tenure clock)
  stripe_customer_id text,              -- cus_..., needed to open the billing portal (Stripe rows only)
  source text,                          -- 'stripe' | 'apple' | null; null = a pre-2026-07 row, always Stripe
  updated_at text not null default (datetime('now'))
);
-- For a DB created before these columns existed, add them once (errors harmlessly if
-- already present):
--   ALTER TABLE entitlements ADD COLUMN stripe_customer_id text;
--   ALTER TABLE entitlements ADD COLUMN cancel_at_period_end integer not null default 0;
--   ALTER TABLE entitlements ADD COLUMN source text;   -- null = stripe (every pre-2026-07 row)

-- Web Push subscriptions (Phase 2 of reminders): the browser's PushSubscription plus the
-- user's preferred LOCAL nudge hour and tz offset, so a daily "your today is here" nudge
-- can reach the web app (PC + phone) while it is closed. Worker-bound, written only by
-- /push/subscribe. NO user_id and NO task content: just a push endpoint and a time. The
-- daily cron reads this to fire each sub at its local hour. Apply once (idempotent):
--   npm exec -w server -- wrangler d1 execute doubledone-telemetry --remote --file d1/schema.sql
create table if not exists push_subs (
  endpoint text primary key,            -- the PushSubscription endpoint (unique per browser)
  p256dh text not null,                 -- subscription public key (stored for future payload encryption)
  auth text not null,                   -- subscription auth secret
  hour integer not null default 9,      -- preferred LOCAL hour for the daily nudge (0-23)
  tz_offset integer not null default 0, -- minutes from UTC (Date.getTimezoneOffset; positive = behind UTC)
  created_at text not null default (datetime('now'))
);

-- The app-event beacon: pseudonymous usage counts for features that never touch the
-- Worker on their own (Settle first: the breathing room is pure client, so unlike the
-- AI features it would otherwise be invisible to the Analytics Centre). The STRICTEST
-- shape in this file: an event name and a timestamp, nothing else -- no user_id, no
-- IP, no free text -- and the /event route only stores names on a closed allowlist
-- (server/src/events.ts), dropping everything else unwritten. The timestamp is
-- DAY-COARSE on purpose (date, not datetime): settle.left is not collected AND
-- settle.guide fires mid-session, so second-precision rows could still pair into
-- rough durations at low traffic (the adversarial review's catch, 2026-08-01);
-- a bare date closes that channel structurally, and the Analytics Centre only ever
-- reads day windows anyway. "Time is not a score" holds here too. Apply once
-- (idempotent):
--   npm exec -w server -- wrangler d1 execute doubledone-telemetry --remote --file d1/schema.sql
create table if not exists app_events (
  id integer primary key autoincrement,
  event text not null,             -- one of the closed allowlist, e.g. 'settle.opened'
  created_at text not null default (date('now'))
);
create index if not exists app_events_event on app_events (event, created_at);

-- Stripe webhook idempotency: the set of event ids already applied to entitlements, so an at-least-once
-- redelivery (Stripe retries, occasional duplicates) is a no-op. Written ONLY by the verified webhook
-- handler, which fails OPEN if this table is absent (the entitlement write is an idempotent upsert), so
-- the Worker can deploy before this is applied. Apply once (idempotent):
--   npm exec -w server -- wrangler d1 execute doubledone-telemetry --remote --file d1/schema.sql
create table if not exists processed_events (
  event_id text primary key,            -- Stripe event id (evt_...)
  created_at text not null default (datetime('now'))
);

-- Card-free "Try Premium" trial: a one-time 30-day Premium grant per ACCOUNT, no card, no Stripe. Write-once on
-- the user_id primary key, so one account gets one trial EVER (active or expired both block a re-trial). The
-- entitlement read checks expires_at against the clock, so it reverts to free on its own with no cron. Gated on
-- a synced (email) account, because an anonymous user has no identity to enforce one-per-person against. Apply
-- once (idempotent):
--   npm exec -w server -- wrangler d1 execute doubledone-telemetry --remote --file d1/schema.sql
create table if not exists trials (
  user_id text primary key,             -- the verified Supabase auth uid (JWT sub)
  started_at integer not null,          -- epoch seconds the trial began
  expires_at integer not null           -- epoch seconds the trial ends (Premium until then)
);

-- Scrapbook abuse backstop: a per-IP rolling-24h count of image generations, so a scripted caller cannot mint
-- unlimited keepsakes off one IP and drain the shared Workers AI budget. NO user_id, no task content: just the
-- client IP and a timestamp. Written ONLY by the /scrapbook route, which fails OPEN if this table is absent (so
-- the Worker can deploy before it is applied). The legitimate per-user cadence stays the client's job + the
-- paywall; this is only the raw-abuse ceiling. Apply once (idempotent):
--   npm exec -w server -- wrangler d1 execute doubledone-telemetry --remote --file d1/schema.sql
create table if not exists scrapbook_log (
  id integer primary key autoincrement,
  ip text not null,                     -- CF-Connecting-IP of the caller (the rate-limit key)
  created_at integer not null           -- epoch ms the keepsake was generated
);
create index if not exists scrapbook_log_ip on scrapbook_log (ip, created_at);

-- Control-centre alert dedup (see server/src/monitor.ts): the last-sent time per alarm
-- KIND, so the hourly health sweep does not re-send the same alarm every tick. NO user
-- data of any kind: just a kind label and a timestamp. Worker-bound, written only by the
-- monitor (which also CREATEs it defensively, so the sweep works before this is applied).
-- Apply once (idempotent):
--   npm exec -w server -- wrangler d1 execute doubledone-telemetry --remote --file d1/schema.sql
create table if not exists alerts_sent (
  kind text not null,             -- 'spend' | 'error' | 'scrapbook-budget' | 'scrapbook-abuse' | 'volume' | 'digest'
  created_at integer not null     -- epoch ms the alert was sent
);
create index if not exists alerts_sent_kind on alerts_sent (kind, created_at);

-- MCP OAuth grant custody: the bridge between a workers-oauth-provider grant and the
-- user's own Supabase session. Holds the ROTATING Supabase refresh token AES-GCM-
-- encrypted with the MCP_GRANT_KEY Worker secret (never plaintext, never in KV), plus a
-- short-lived cached access token so most MCP calls skip the refresh round-trip. The
-- server still holds NO elevated key: every task call uses the user's own session under
-- RLS, exactly like the legacy pasted-token path. Revocation: the IMMEDIATE user-side kill
-- switch is POST /mcp/disconnect (Disconnect AI connectors in Settings), which DELETES the
-- user's rows here so the very next getAccessToken returns null with no wait -- unlike
-- signing out everywhere, which only revokes the Supabase refresh family and so leaves the
-- ~1h cached access_token alive. A re-authorization also deletes the superseded row (and the
-- provider revokes its grant). Apply once (idempotent):
--   npm exec -w server -- wrangler d1 execute doubledone-telemetry --remote --file d1/schema.sql
create table if not exists mcp_grants (
  grant_id text primary key,            -- the workers-oauth-provider grant id (from props)
  user_id text not null,                -- Supabase auth uid, for support/revocation lookups
  email text not null,                  -- the verified sign-in email (shown on consent, support)
  refresh_enc text not null,            -- AES-GCM({iv,ct} base64) of the CURRENT Supabase refresh token
  access_token text,                    -- cached Supabase access token (short-lived, plaintext JWT)
  access_exp integer,                   -- epoch seconds the cached access token expires
  created_at integer not null,          -- epoch ms
  updated_at integer not null,          -- epoch ms (bumped on every rotation)
  revoked_at integer                    -- epoch ms; set = the grant is dead regardless of provider state
);
create index if not exists mcp_grants_user on mcp_grants (user_id);

-- The RevenueCat DELIVERY LOG: one append-only row per webhook received, INCLUDING the ones we
-- deliberately ignore. The entitlements table above is one row per user, last-write-wins, so it can
-- say what somebody's access is NOW and nothing whatever about how it got that way.
--
-- That gap cost a full day on 2026-08-19. A customer asked why Apple had billed them, and answering
-- "was that a trial or a real charge, and was it even production" required two third-party
-- dashboards, because entitlementFromRcEvent reads past `period_type` and `environment` and no
-- history is kept anywhere. Worse, the anonymous purchaser (App Review 5.1.1(v) forces that path)
-- resolves to no Supabase id, so their events are dropped at the door and left no trace at all: a
-- paying customer who existed nowhere in our own data.
--
-- A NAMED ALLOWLIST of columns, never a payload dump. No country, no `subscriber_attributes` (which
-- can carry $email / $displayName), no IP, no raw body. Same pseudonymous posture as the rest of
-- this database. Also self-creating at the call site (the scrapbook_log lesson: 14 generations once
-- vanished because the table postdated the code), so deploy order never matters. Apply once
-- (idempotent):
--   npm exec -w server -- wrangler d1 execute doubledone-telemetry --remote --file d1/schema.sql
create table if not exists rc_events (
  id integer primary key autoincrement,
  event_id text unique,                 -- RevenueCat's own event id; UNIQUE makes a re-delivery a no-op
  type text not null,                   -- INITIAL_PURCHASE | RENEWAL | CANCELLATION | EXPIRATION | TRANSFER | ...
  period_type text,                     -- TRIAL | NORMAL | INTRO | PROMOTIONAL. THE field this table exists for.
  environment text,                     -- SANDBOX | PRODUCTION. The other one.
  store text,                           -- APP_STORE | PLAY_STORE | ...
  product_id text,
  app_user_id text,                     -- as sent, so an $RCAnonymousID is preserved rather than erased
  original_transaction_id text,
  user_id text,                         -- the RESOLVED Supabase uid, or null when it could not be resolved
  price real,
  price_in_purchased_currency real,
  currency text,
  is_trial_conversion integer,          -- 1 | 0 | null; null means "not stated", which is not "no"
  applied integer not null default 0,   -- 1 only when writeEntitlement actually ran
  outcome text not null,                -- WHY: applied | duplicate | transfer | unresolved-user | ...
  event_timestamp_ms integer,
  created_at text not null default (datetime('now'))
);
create index if not exists rc_events_env on rc_events (environment, type);
create index if not exists rc_events_user on rc_events (user_id);
