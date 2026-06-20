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
