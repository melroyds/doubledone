-- 2026-11-03: drop the old Supabase AI-call table. Applied by Melroy in the Supabase SQL editor the same day.
-- Telemetry moved to Cloudflare D1 on 2026-06-20 and nothing has written here since. The table held the text of AI
-- calls made before then, and the privacy policy now promises that text goes after 90 days. Irreversible.
drop table if exists public.ai_calls;
