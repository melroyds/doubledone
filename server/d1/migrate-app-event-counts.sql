-- One-off (2026-10-04): fold the old one-row-per-event app_events table into the daily
-- counters (app_event_counts), then drop it. Why: decision-log 2026-10-04, telemetry review.
--
-- ORDER, which matters:
--   1. Apply d1/schema.sql (creates app_event_counts; additive, idempotent).
--   2. Deploy the Worker FROM MAIN (or from premium only after main is merged into it: check that
--      `git diff --stat main premium -- server` is empty) and note the version id it prints. From
--      then on nothing writes app_events, so its rows are final.
--   3. Run THIS FILE:
--        npm exec -w server -- wrangler d1 execute doubledone-telemetry --remote --file d1/migrate-app-event-counts.sql
--      It ADDS the old rows onto any counts the new Worker already wrote. A second run is a no-op:
--      the guard below sees the old table's earliest day already present in the counters.
--   4. Check, under live traffic. This must return 0 (every old day and name is covered):
--        SELECT COUNT(*) FROM (SELECT substr(created_at, 1, 10) AS d, event AS e, COUNT(*) AS c FROM app_events
--          WHERE true GROUP BY 1, 2) o LEFT JOIN app_event_counts k ON k.day = o.d AND k.event = o.e
--          WHERE k.n IS NULL OR k.n < o.c
--      Then note both totals: SELECT COUNT(*) FROM app_events, and SELECT SUM(n) FROM app_event_counts.
--   5. THE DROP GATE. Only once BOTH hold, which can take a day at this traffic:
--        (a) SELECT COUNT(*) FROM app_events is UNCHANGED from step 4 (the old Worker is not serving), and
--        (b) SELECT SUM(n) FROM app_event_counts has GROWN past step 4 (the new Worker is counting).
--      then: DROP TABLE app_events
--      If (a) fails, the old Worker is still live somewhere: STOP, do not drop, find out why.
--
-- created_at was always written as date('now'), a bare UTC date; substr() keeps it a day even if
-- an odd row ever carried a time. WHERE NOT EXISTS is the re-run guard; GROUP BY needs every source
-- row before it emits, so the guard is decided before the first counter is touched. The upsert's
-- ON is unambiguous because the SELECT has a WHERE.
INSERT INTO app_event_counts (day, event, n)
  SELECT substr(created_at, 1, 10), event, COUNT(*) FROM app_events
  WHERE NOT EXISTS (
    SELECT 1 FROM app_event_counts WHERE day <= (SELECT MIN(substr(created_at, 1, 10)) FROM app_events)
  )
  GROUP BY substr(created_at, 1, 10), event
  ON CONFLICT (day, event) DO UPDATE SET n = n + excluded.n;
