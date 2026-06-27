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

-- Premium entitlements, written ONLY by the verified Stripe webhook. Separate from
-- ai_calls (which is pseudonymous): this legitimately holds a user id because it
-- gates a paid feature for that specific user. The client reads its own row via an
-- authed Worker endpoint, never directly.
create table if not exists entitlements (
  user_id text primary key,             -- Supabase auth uid (the JWT sub)
  premium integer not null default 0,   -- 0/1
  status text,                          -- Stripe subscription status (active, canceled, ...)
  current_period_end integer,           -- epoch seconds, when the paid period ends
  cancel_at_period_end integer not null default 0,  -- 0/1, scheduled to cancel at the period end
  started_at text,                      -- ISO, first premium grant (the tenure clock)
  stripe_customer_id text,              -- cus_..., needed to open the billing portal (cancel/manage)
  updated_at text not null default (datetime('now'))
);
-- For a DB created before these columns existed, add them once (errors harmlessly if
-- already present):
--   ALTER TABLE entitlements ADD COLUMN stripe_customer_id text;
--   ALTER TABLE entitlements ADD COLUMN cancel_at_period_end integer not null default 0;

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
