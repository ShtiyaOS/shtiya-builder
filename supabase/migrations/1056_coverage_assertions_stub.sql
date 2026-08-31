-- =============================================================================
-- 1056_coverage_assertions_stub.sql
-- Shtiya Builder v3.0 — Coverage assertions table (pre-HRAG stub).
--
-- Full HRAG schema lives in migrations 1080–1086. This stub installs
-- coverage_assertions so that:
--   (a) API code can reference the table before the full HRAG layer lands.
--   (b) The three-way grounding fallback gate (§I.N) can be wired early.
--   (c) The seed file (supabase/storage.sql / seed data) can populate the
--       initial 12 jurisdiction/instrument entries.
--
-- `satisfied` is false by default and updated by the HRAG ingestion pipeline
-- once migration 1080+ runs. Until then every assertion reads as unsatisfied,
-- which causes the API to return COVERAGE_INCOMPLETE rather than hallucinate.
--
-- Builds on 1001 (users), 1002 (current_app_user_id).
-- =============================================================================


-- ---------------------------------------------------------------------------
-- Section 1 — coverage_assertions
-- ---------------------------------------------------------------------------

-- Pre-HRAG stub. satisfied=false until the HRAG pipeline updates this table (1080+).
-- reverify_due: chunks past this date are ineligible for grounding (I-A13)
CREATE TABLE IF NOT EXISTS coverage_assertions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain         text NOT NULL
                   CHECK (domain IN ('law','standards','investor','classification')),
  jurisdiction   text NOT NULL,  -- e.g. 'US.NY', 'US.Federal', '*' for global
  instrument_set text NOT NULL,  -- e.g. 'CPLR', 'RPAPL', 'IBC.2021', 'FannieMae.SEL'
  -- satisfied: updated by HRAG ingestion pipeline (migrations 1080+)
  satisfied      boolean NOT NULL DEFAULT false,
  last_checked_at timestamptz,
  -- reverify_due: chunks past this date are ineligible for grounding (I-A13)
  reverify_due   timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);


-- ---------------------------------------------------------------------------
-- Section 2 — Enable row level security
-- ---------------------------------------------------------------------------

ALTER TABLE coverage_assertions ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- Section 3 — RLS policy
--
-- Postgres has no CREATE POLICY IF NOT EXISTS (through 17), so the policy is
-- preceded by DROP POLICY IF EXISTS to keep the migration re-runnable.
-- ---------------------------------------------------------------------------

-- coverage_assertions: readable by any authenticated session
-- Platform metadata only; no PII, no per-row scoping required.
DROP POLICY IF EXISTS "coverage_assertions_authenticated_read" ON coverage_assertions;
CREATE POLICY "coverage_assertions_authenticated_read" ON coverage_assertions FOR SELECT
  USING (public.current_app_user_id() IS NOT NULL);


-- ---------------------------------------------------------------------------
-- Section 4 — REVOKE
-- ---------------------------------------------------------------------------

REVOKE ALL ON coverage_assertions FROM public;
