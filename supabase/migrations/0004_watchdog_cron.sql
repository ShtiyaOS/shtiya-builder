-- Migration: 0004_watchdog_cron
-- Phase: T2.7 — Agentic: Watchdog — NYC Open Data Violation Poller
--
-- Schedules the `watchdog-poll` Supabase Edge Function to run daily at 02:00 UTC
-- via pg_cron. Also adds `violations` and `financial_ledgers` to the Realtime
-- publication so investor/owner clients receive live alerts.
--
-- Prerequisites:
--   - `pg_cron` extension must be enabled (installed in 0001_core_schema.sql).
--   - `watchdog-poll` Edge Function must be deployed to the project.
--
-- The pg_cron job calls the Edge Function via the internal project URL. The
-- SUPABASE_URL and service-role key are injected automatically by the runtime.
--
-- Job name: `watchdog-daily` (idempotent: safe to re-run this migration).

-- ── Add violations and financial_ledgers to Realtime ─────────────────────────
-- Allows the front-end Watchdog dashboard (T2.8) and Capital draw status views
-- to receive live violation and ledger change events.
alter publication supabase_realtime add table violations;
alter publication supabase_realtime add table financial_ledgers;

-- ── Schedule the daily watchdog poll ─────────────────────────────────────────
-- Deletes any existing job with the same name first so re-running this
-- migration does not create duplicate schedules.
select cron.unschedule('watchdog-daily');

select cron.schedule(
  'watchdog-daily',        -- job name (must be unique)
  '0 2 * * *',             -- cron expression: every day at 02:00 UTC
  $$
    select
      net.http_post(
        url    := current_setting('app.supabase_functions_url') || '/watchdog-poll',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || current_setting('app.service_role_key'),
          'Content-Type',  'application/json'
        ),
        body   := '{}'::jsonb
      )
  $$
);
