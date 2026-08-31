-- =============================================================================
-- 1041_practice_workbenches.sql
-- Shtiya Builder v3.0 — Practice-area workbench tables.
--
-- Five matter-scoped tables, each locked to a single data_class value.
-- All are intentionally read-blocked (has_data_class_grant stub returns false)
-- until the Legal Workspace stack (migrations 1060+) is deployed.
--
-- Builds on 1001 (users), 1002 (current_app_user_id, current_user_role_group),
-- 1004 (matters, is_matter_party, wall_blocks_user), 1007 (on_restricted_list).
--
-- NOTE: has_data_class_grant() is created as a stub in this file (returns false).
-- Full implementation in migration 1063 (matter_class_grants table required).
-- =============================================================================


-- ---------------------------------------------------------------------------
-- Section 0 — has_data_class_grant() stub
--
-- Defined ahead of the tables because every policy in Section 7 references it;
-- CREATE POLICY resolves the function at parse time, so it must already exist.
--
-- SECURITY DEFINER + SET search_path = '' per the standing rule. The stub body
-- touches no tables, so there is nothing to schema-qualify yet.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.has_data_class_grant(
  p_matter_id uuid,
  p_class     text
) RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = ''
AS $$
  -- Stub: returns false until migration 1063 creates the matter_class_grants table.
  -- The full implementation checks matter_parties.scope AND matter_class_grants.
  -- NOTE: workbench tables are intentionally read-blocked for all non-admin users
  -- until the Legal Workspace (migrations 1060+) is deployed.
  SELECT false;
$$;


-- ---------------------------------------------------------------------------
-- Section 1 — pi_medical_records (class_phi)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS pi_medical_records (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  matter_id     uuid NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  data_class    text NOT NULL DEFAULT 'class_phi'
                  CHECK (data_class = 'class_phi'),       -- I-L8
  provider_name text NOT NULL,
  record_date   date,
  storage_path  text NOT NULL,  -- encrypted at rest; path only in DB
  created_at    timestamptz NOT NULL DEFAULT now()
);


-- ---------------------------------------------------------------------------
-- Section 2 — pi_liens (class_phi)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS pi_liens (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  matter_id         uuid NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  data_class        text NOT NULL DEFAULT 'class_phi'
                      CHECK (data_class = 'class_phi'),   -- I-L8
  lienholder        text NOT NULL,
  lien_amount_cents bigint NOT NULL,
  lien_type         text NOT NULL
                      CHECK (lien_type IN ('medical','attorney','medicare','medicaid')),
  status            text NOT NULL DEFAULT 'asserted'
                      CHECK (status IN ('asserted','negotiating','resolved','waived')),
  created_at        timestamptz NOT NULL DEFAULT now()
);


-- ---------------------------------------------------------------------------
-- Section 3 — bk_schedules (class_insolvency)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS bk_schedules (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  matter_id     uuid NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  data_class    text NOT NULL DEFAULT 'class_insolvency'
                  CHECK (data_class = 'class_insolvency'), -- I-L8
  schedule_type text NOT NULL
                  CHECK (schedule_type IN ('A_B','C','D','E_F','G','H','I','J')),
  filed_version int  NOT NULL DEFAULT 1,
  storage_path  text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);


-- ---------------------------------------------------------------------------
-- Section 4 — corp_transaction_records (class_mnpi)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS corp_transaction_records (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  matter_id    uuid NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  data_class   text NOT NULL DEFAULT 'class_mnpi'
                 CHECK (data_class = 'class_mnpi'),        -- I-L8
  record_type  text NOT NULL
                 CHECK (record_type IN (
                   'term_sheet','loi','cap_table_snapshot',
                   'nda','due_diligence_summary','closing_memo'
                 )),
  storage_path text NOT NULL,
  -- MNPI cross-group predicate enforced at read time (I-L10, on_restricted_list())
  created_at   timestamptz NOT NULL DEFAULT now()
);


-- ---------------------------------------------------------------------------
-- Section 5 — family_asset_inventories (class_family)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS family_asset_inventories (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  matter_id             uuid NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  data_class            text NOT NULL DEFAULT 'class_family'
                          CHECK (data_class = 'class_family'), -- I-L8
  asset_type            text NOT NULL,
  description           text NOT NULL,
  estimated_value_cents bigint,
  -- minors_involved: triggers state-sealing rules in the API layer
  minors_involved       boolean NOT NULL DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now()
);


-- ---------------------------------------------------------------------------
-- Section 6 — Enable row level security
-- ---------------------------------------------------------------------------

ALTER TABLE pi_medical_records       ENABLE ROW LEVEL SECURITY;
ALTER TABLE pi_liens                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE bk_schedules             ENABLE ROW LEVEL SECURITY;
ALTER TABLE corp_transaction_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE family_asset_inventories ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- Section 7 — RLS policies
--
-- Postgres has no CREATE POLICY IF NOT EXISTS (through 17), so each policy is
-- preceded by DROP POLICY IF EXISTS to keep the migration re-runnable.
--
-- Every table here carries a direct matter_id FK and a data_class column, so
-- each policy needs three predicates — party, wall, class — plus the admin OR.
-- AND binds tighter than OR, so the predicate group is wrapped in its own
-- parentheses; without them the admin branch would swallow the whole chain.
--
-- All five read as zero rows for every non-admin caller until 1063 replaces the
-- has_data_class_grant() stub. That is intentional, not a defect.
-- ---------------------------------------------------------------------------

-- pi_medical_records: matter party + wall + PHI class grant
DROP POLICY IF EXISTS "pi_medical_records_read" ON pi_medical_records;
CREATE POLICY "pi_medical_records_read" ON pi_medical_records FOR SELECT
  USING (
    (                                                -- I-L11, I-L12
      public.is_matter_party(matter_id)
      AND NOT public.wall_blocks_user(matter_id)
      AND public.has_data_class_grant(matter_id, 'class_phi')  -- I-L8
    )
    OR public.current_user_role_group() = 'admin'
  );

-- pi_liens: matter party + wall + PHI class grant
DROP POLICY IF EXISTS "pi_liens_read" ON pi_liens;
CREATE POLICY "pi_liens_read" ON pi_liens FOR SELECT
  USING (
    (                                                -- I-L11, I-L12
      public.is_matter_party(matter_id)
      AND NOT public.wall_blocks_user(matter_id)
      AND public.has_data_class_grant(matter_id, 'class_phi')  -- I-L8
    )
    OR public.current_user_role_group() = 'admin'
  );

-- bk_schedules: matter party + wall + insolvency class grant
DROP POLICY IF EXISTS "bk_schedules_read" ON bk_schedules;
CREATE POLICY "bk_schedules_read" ON bk_schedules FOR SELECT
  USING (
    (                                                -- I-L11, I-L12
      public.is_matter_party(matter_id)
      AND NOT public.wall_blocks_user(matter_id)
      AND public.has_data_class_grant(matter_id, 'class_insolvency')  -- I-L8
    )
    OR public.current_user_role_group() = 'admin'
  );

-- corp_transaction_records: matter party + wall + MNPI class grant + restricted
-- list. The fourth predicate is the MNPI cross-group bar (I-L10) — a caller on
-- the restricted list is barred even with a valid class grant.
DROP POLICY IF EXISTS "corp_transaction_records_read" ON corp_transaction_records;
CREATE POLICY "corp_transaction_records_read" ON corp_transaction_records FOR SELECT
  USING (
    (                                                -- I-L11, I-L12
      public.is_matter_party(matter_id)
      AND NOT public.wall_blocks_user(matter_id)
      AND public.has_data_class_grant(matter_id, 'class_mnpi')   -- I-L8
      AND NOT public.on_restricted_list(matter_id)               -- I-L10
    )
    OR public.current_user_role_group() = 'admin'
  );

-- family_asset_inventories: matter party + wall + family class grant
DROP POLICY IF EXISTS "family_asset_inventories_read" ON family_asset_inventories;
CREATE POLICY "family_asset_inventories_read" ON family_asset_inventories FOR SELECT
  USING (
    (                                                -- I-L11, I-L12
      public.is_matter_party(matter_id)
      AND NOT public.wall_blocks_user(matter_id)
      AND public.has_data_class_grant(matter_id, 'class_family')  -- I-L8
    )
    OR public.current_user_role_group() = 'admin'
  );


-- ---------------------------------------------------------------------------
-- Section 8 — REVOKE
-- ---------------------------------------------------------------------------

REVOKE ALL ON pi_medical_records       FROM public;
REVOKE ALL ON pi_liens                 FROM public;
REVOKE ALL ON bk_schedules             FROM public;
REVOKE ALL ON corp_transaction_records FROM public;
REVOKE ALL ON family_asset_inventories FROM public;
