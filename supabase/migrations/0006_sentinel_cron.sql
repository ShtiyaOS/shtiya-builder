-- Migration: 0006_sentinel_cron
-- Phase: T4.12 — Agentic: Sentinel — Auto-Compliance Verification Bot
--
-- Schedules the `sentinel-verify` Supabase Edge Function to run monthly
-- (1st of each month at 03:00 UTC) via pg_cron.
-- The function re-verifies contractor license/insurance status against
-- NYC Open Data and updates compliance_checks accordingly. A 'lapsed'
-- result blocks:
--   - Capital draw approvals  (/api/draws/approve, T4.2)
--   - Escrow draw releases    (/api/escrow/release, T3.7)
--
-- Prerequisites:
--   - `pg_cron` extension enabled (installed in 0001_core_schema.sql).
--   - `sentinel-verify` Edge Function deployed to the project.
--   - app.supabase_functions_url and app.service_role_key DB settings configured.

-- ── Schedule monthly sentinel run ─────────────────────────────────────────────
-- Idempotent: unschedule first so re-running migration doesn't duplicate jobs.
select cron.unschedule('sentinel-monthly');

select cron.schedule(
  'sentinel-monthly',      -- unique job name
  '0 3 1 * *',             -- cron: 03:00 UTC on the 1st of every month
  $$
    select
      net.http_post(
        url     := current_setting('app.supabase_functions_url') || '/sentinel-verify',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || current_setting('app.service_role_key'),
          'Content-Type',  'application/json'
        ),
        body    := '{}'::jsonb
      )
  $$
);
