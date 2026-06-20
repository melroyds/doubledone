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
  created_at text not null default (datetime('now'))
);

-- Premium entitlements, written ONLY by the verified Stripe webhook. Separate from
-- ai_calls (which is pseudonymous): this legitimately holds a user id because it
-- gates a paid feature for that specific user. The client reads its own row via an
-- authed Worker endpoint, never directly.
create table if not exists entitlements (
  user_id text primary key,             -- Supabase auth uid (the JWT sub)
  premium integer not null default 0,   -- 0/1
  status text,                          -- Stripe subscription status (active, canceled, ...)
  current_period_end integer,           -- epoch seconds, when the paid period ends
  started_at text,                      -- ISO, first premium grant (the tenure clock)
  stripe_customer_id text,              -- cus_..., needed to open the billing portal (cancel/manage)
  updated_at text not null default (datetime('now'))
);
-- For a DB created before stripe_customer_id existed, add it once (errors harmlessly
-- if already present): ALTER TABLE entitlements ADD COLUMN stripe_customer_id text;
