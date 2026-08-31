-- =============================================================================
-- 1065_lw_rls_and_grants_part_a.sql
-- Shtiya Builder v3.0 — Legal Workspace RLS hardening, Part A:
-- the tables and functions 0065 assumes, plus policy replacements on the
-- foundation and workbench tables.
--
-- The through-line is I-L12: `current_user_role_group() = 'admin'` is not an
-- access-control decision, it is a role label. Every admin branch on a
-- matter-scoped table is replaced with break_glass_active(), which is
-- time-boxed, dual-approved, and requires the holder to have been notified.
--
-- CORRECTIONS vs task spec (each verified against the live schema):
--   - representations has attorney_id and terminated_at. There is no
--     counsel_user_id and no status column, so may_read_privileged_v2 uses
--     r.attorney_id and r.terminated_at IS NULL.
--   - bk_schedules had no filed_at column and family_asset_inventories had no
--     sealed_at column; Section 7's policies require both. Section 0 adds them
--     as nullable timestamps. Without them those CREATE POLICY statements fail
--     with "column ... does not exist" and the pre-filing / sealing
--     distinctions the task is adding would have to be dropped entirely.
--   - is_matter_party has no facet overload; only (uuid) and (uuid,uuid).
--   - on_restricted_list has only the (uuid) overload.
--
-- Part B carries the gig/wall/copilot policies, the write-path REVOKEs, and
-- the service_role_routes inventory.
--
-- I-L8:  class grants gate the workbench tables.
-- I-L9:  privilege survives succession.
-- I-L10: MNPI restricted list bars corporate records.
-- I-L12: break glass replaces the admin bypass.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- Section 0 — Columns required by the Section 7 policies
--
-- filed_at: bankruptcy schedules are maximum-sensitivity pre-filing and become
--   court record after filing (see the 1041 header note). filed_version already
--   tracked the revision; filed_at records when it went on the docket.
-- sealed_at: family asset inventories under a state sealing order are readable
--   by nobody interactively (1041 noted sealing as an API-layer concern; this
--   moves the gate into RLS).
-- ---------------------------------------------------------------------------

ALTER TABLE bk_schedules
  ADD COLUMN IF NOT EXISTS filed_at timestamptz;

ALTER TABLE family_asset_inventories
  ADD COLUMN IF NOT EXISTS sealed_at timestamptz;


-- ---------------------------------------------------------------------------
-- Section 1 — corp_cap_tables
-- ---------------------------------------------------------------------------

-- I-L8, I-L10: cap tables are class_mnpi and additionally gated by the
-- restricted list.
CREATE TABLE IF NOT EXISTS corp_cap_tables (
  id         uuid       PRIMARY KEY DEFAULT gen_random_uuid(),
  matter_id  uuid       NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  entity_ref text       NOT NULL,
  as_of      date       NOT NULL,
  payload    jsonb      NOT NULL,
  class      data_class NOT NULL DEFAULT 'class_mnpi'
               CHECK (class = 'class_mnpi'),  -- I-L8
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE corp_cap_tables ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON corp_cap_tables FROM public;
GRANT SELECT ON corp_cap_tables TO authenticated, service_role;


-- ---------------------------------------------------------------------------
-- Section 2 — current_privilege_holder() + may_read_privileged_v2()
-- ---------------------------------------------------------------------------

-- Resolves the current holder of attorney-client privilege, accounting for
-- succession events (bankruptcy trustee, executor, surviving entity, etc.)
-- Live 1040 schema: privilege_successions has original_holder_id / successor_holder_id.
CREATE OR REPLACE FUNCTION public.current_privilege_holder(
  p_matter   uuid,
  p_original uuid
) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$  -- I-L9
  SELECT coalesce(
    (
      SELECT ps.successor_holder_id
      FROM public.privilege_successions ps
      WHERE ps.matter_id    = p_matter
        AND ps.effective_at <= now()
      ORDER BY ps.effective_at DESC
      LIMIT 1
    ),
    p_original
  );
$$;

-- Succession-aware privileged-read predicate.
-- Wall overrides every branch, including the holder's own counsel.
-- CORRECTION: representations exposes attorney_id / terminated_at, not
-- counsel_user_id / status.
CREATE OR REPLACE FUNCTION public.may_read_privileged_v2(
  p_matter   uuid,
  p_original uuid
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$  -- I-L9
  SELECT (
    public.current_privilege_holder(p_matter, p_original)
      = public.current_app_user_id()
    OR EXISTS (
      SELECT 1 FROM public.representations r
      WHERE r.matter_id     = p_matter
        AND r.client_id     = public.current_privilege_holder(p_matter, p_original)
        AND r.attorney_id   = public.current_app_user_id()
        AND r.terminated_at IS NULL
    )
    OR EXISTS (
      SELECT 1 FROM public.firm_members fm
      WHERE fm.firm_id     = (SELECT firm_id FROM public.matters WHERE id = p_matter)
        AND fm.user_id     = public.current_app_user_id()
        AND fm.member_role IN ('partner','associate')
    )
  )
  AND NOT public.screened_from_matter(p_matter);
$$;

GRANT EXECUTE ON FUNCTION public.current_privilege_holder(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.may_read_privileged_v2(uuid, uuid)   TO authenticated, service_role;


-- ---------------------------------------------------------------------------
-- Section 3 — matters
-- ---------------------------------------------------------------------------

-- The Phase 1 admin branch defeats I-L11/I-L12: an admin could read a walled
-- matter with no record and no notification. break_glass_active() is the
-- accountable substitute.
DROP POLICY IF EXISTS "matters_party_read" ON matters;
DROP POLICY IF EXISTS "matters_party_select_v2" ON matters;
CREATE POLICY "matters_party_select_v2" ON matters FOR SELECT  -- I-L12
  USING (
    public.is_matter_party(matters.id)
    OR public.break_glass_active(matters.id)
  );


-- ---------------------------------------------------------------------------
-- Section 4 — matter_parties
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "matter_parties_member_read" ON matter_parties;
DROP POLICY IF EXISTS "matter_parties_self_read" ON matter_parties;
DROP POLICY IF EXISTS "mp_select_v2" ON matter_parties;
CREATE POLICY "mp_select_v2" ON matter_parties FOR SELECT  -- I-L12
  USING (
    (
      user_id = public.current_app_user_id()
      AND NOT public.screened_from_matter(matter_id)
    )
    OR public.is_matter_party(matter_id)
    OR public.break_glass_active(matter_id)
  );


-- ---------------------------------------------------------------------------
-- Section 5 — trust_accounts
-- ---------------------------------------------------------------------------

-- No admin bypass: under the debit-block model an admin read is a credential leak.
DROP POLICY IF EXISTS "trust_accounts_firm_read" ON trust_accounts;
DROP POLICY IF EXISTS "trust_accounts_firm_read_v2" ON trust_accounts;
CREATE POLICY "trust_accounts_firm_read_v2" ON trust_accounts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.firm_members fm
      WHERE fm.firm_id = trust_accounts.firm_id
        AND fm.user_id = public.current_app_user_id()
    )
  );


-- ---------------------------------------------------------------------------
-- Section 6 — 1040 tables: admin bypass -> break glass
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "privilege_successions_party_read" ON privilege_successions;
CREATE POLICY "privilege_successions_party_read" ON privilege_successions FOR SELECT  -- I-L12
  USING (
    (
      public.is_matter_party(matter_id)
      AND NOT public.wall_blocks_user(matter_id)
    )
    OR public.break_glass_active(matter_id)
  );

DROP POLICY IF EXISTS "arbitration_cases_party_read" ON arbitration_cases;
CREATE POLICY "arbitration_cases_party_read" ON arbitration_cases FOR SELECT  -- I-L12
  USING (
    (
      public.is_matter_party(matter_id)
      AND NOT public.wall_blocks_user(matter_id)
    )
    OR public.break_glass_active(matter_id)
  );

-- arbitration_awards inherits its wall through case_id -> arbitration_cases.
DROP POLICY IF EXISTS "arbitration_awards_party_read" ON arbitration_awards;
CREATE POLICY "arbitration_awards_party_read" ON arbitration_awards FOR SELECT  -- I-L12
  USING (
    (
      (SELECT public.is_matter_party(ac.matter_id)
       FROM public.arbitration_cases ac WHERE ac.id = arbitration_awards.case_id)
      AND
      (SELECT NOT public.wall_blocks_user(ac.matter_id)
       FROM public.arbitration_cases ac WHERE ac.id = arbitration_awards.case_id)
    )
    OR (SELECT public.break_glass_active(ac.matter_id)
        FROM public.arbitration_cases ac WHERE ac.id = arbitration_awards.case_id)
  );


-- ---------------------------------------------------------------------------
-- Section 7 — Workbench tables: admin bypass -> break glass
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "pi_medical_records_read" ON pi_medical_records;
CREATE POLICY "pi_medical_records_read" ON pi_medical_records FOR SELECT  -- I-L8, I-L12
  USING (
    (
      public.is_matter_party(matter_id)
      AND NOT public.wall_blocks_user(matter_id)
      AND public.has_data_class_grant(matter_id, 'class_phi')
    )
    OR public.break_glass_active(matter_id)
  );

DROP POLICY IF EXISTS "pi_liens_read" ON pi_liens;
CREATE POLICY "pi_liens_read" ON pi_liens FOR SELECT  -- I-L8, I-L12
  USING (
    (
      public.is_matter_party(matter_id)
      AND NOT public.wall_blocks_user(matter_id)
      AND public.has_data_class_grant(matter_id, 'class_phi')
    )
    OR public.break_glass_active(matter_id)
  );

-- Pre-filing schedules need the class grant; once filed they are court record
-- and matter-party membership suffices.
DROP POLICY IF EXISTS "bk_schedules_read" ON bk_schedules;
CREATE POLICY "bk_schedules_read" ON bk_schedules FOR SELECT  -- I-L8, I-L12
  USING (
    (
      (
        (filed_at IS NULL
          AND public.is_matter_party(matter_id)
          AND NOT public.wall_blocks_user(matter_id)
          AND public.has_data_class_grant(matter_id, 'class_insolvency'))
        OR (filed_at IS NOT NULL
          AND public.is_matter_party(matter_id)
          AND NOT public.wall_blocks_user(matter_id))
      )
    )
    OR public.break_glass_active(matter_id)
  );

DROP POLICY IF EXISTS "corp_cap_tables_read" ON corp_cap_tables;
CREATE POLICY "corp_cap_tables_read" ON corp_cap_tables FOR SELECT  -- I-L8, I-L10, I-L12
  USING (
    (
      public.is_matter_party(matter_id)
      AND NOT public.wall_blocks_user(matter_id)
      AND public.has_data_class_grant(matter_id, 'class_mnpi')
      AND NOT public.on_restricted_list(matter_id)
    )
    OR public.break_glass_active(matter_id)
  );

DROP POLICY IF EXISTS "corp_transaction_records_read" ON corp_transaction_records;
CREATE POLICY "corp_transaction_records_read" ON corp_transaction_records FOR SELECT  -- I-L8, I-L10, I-L12
  USING (
    (
      public.is_matter_party(matter_id)
      AND NOT public.wall_blocks_user(matter_id)
      AND public.has_data_class_grant(matter_id, 'class_mnpi')
      AND NOT public.on_restricted_list(matter_id)
    )
    OR public.break_glass_active(matter_id)
  );

-- A sealing order closes the inventory to every interactive reader.
DROP POLICY IF EXISTS "family_asset_inventories_read" ON family_asset_inventories;
CREATE POLICY "family_asset_inventories_read" ON family_asset_inventories FOR SELECT  -- I-L8, I-L12
  USING (
    (
      public.is_matter_party(matter_id)
      AND NOT public.wall_blocks_user(matter_id)
      AND public.has_data_class_grant(matter_id, 'class_family')
      AND sealed_at IS NULL
    )
    OR public.break_glass_active(matter_id)
  );
