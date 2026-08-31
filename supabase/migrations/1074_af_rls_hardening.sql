-- Migration: 1074_af_rls_hardening.sql
-- Phase 2 · Task 2.12 — Agent Factory RLS hardening & search_path hardening
-- Invariants enforced: I-1, I-2, I-A1, I-A2, I-A4, I-A10, I-5
--
-- SCHEMA CORRECTIONS vs the task spec (each verified against the live schema):
--   - authority_corpus has NO org_id. It has owner_org_id, which I-A4 forces to
--     be always NULL: the authority corpus is platform-global and deliberately
--     unpoisonable by any customer. An org-scoped read policy is therefore not
--     just unbuildable, it contradicts I-A4. ac_read keeps the 1070 semantics:
--     vault_visible_to() plus the currency filters.
--   - vault_visible_to takes four arguments
--     (uuid, vault_visibility, text, text), not (uuid, vault_domain_id).
--   - wall_blocks_user takes one argument (uuid), not (uuid, uuid).
--   - tenant_corpus columns are owner_org_id and screen_state; there is no
--     org_id, no corpus_state, and no 'active' value. The retrievable state is
--     'clear' (CHECK: pending | clear | quarantined | rejected).
--   - An RLS policy cannot reference NEW.<col>: "missing FROM-clause entry for
--     table new". Bare column names in WITH CHECK already mean the new row.
--   - The current_setting('role') = 'service_role' escape hatch is omitted:
--     service_role holds BYPASSRLS, so it never evaluates these policies at
--     all (measured: service_role UPDATE 1, authenticated UPDATE 0). The
--     branch would be unreachable code that reads like a granted exception.
--   - ingestion_screen_findings keys on chunk_id (not corpus_id) and the org
--     lives on tenant_corpus.owner_org_id, so isf_read joins there.
--   - grounding_strikes keys on execution_id, not execution_log_id.
--   - as_own keeps its wall term from 1070. agent_sessions carries a direct
--     matter_id FK; dropping the term would leave wall-lint passing (it scans
--     migration text, and 1070 still contains the term) while the live policy
--     lost the protection.
--
-- 49 migrations total after this file (10 legacy + 39 v3: 1000–1074)

BEGIN;


-- ---------------------------------------------------------------------------
-- 1 — authority_corpus
-- ---------------------------------------------------------------------------

ALTER TABLE public.authority_corpus ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.authority_corpus FORCE  ROW LEVEL SECURITY;

-- I-A1: authority corpus readable only within the caller's credentialed
-- visibility tier, and only while current (I-A13).
DROP POLICY IF EXISTS "ac_read" ON public.authority_corpus;
CREATE POLICY "ac_read" ON public.authority_corpus FOR SELECT
  USING (
    public.vault_visible_to(
      public.current_app_user_id(), visibility, jurisdiction_id, domain)  -- I-A1
    AND (effective_to IS NULL OR effective_to >= current_date)
    AND superseded_by IS NULL
    AND reverify_due > now()
  );

-- I-A2: authority corpus write-path is service-role only
DROP POLICY IF EXISTS "ac_no_interactive_insert" ON public.authority_corpus;
CREATE POLICY "ac_no_interactive_insert" ON public.authority_corpus FOR INSERT
  WITH CHECK (false);  -- I-A2

DROP POLICY IF EXISTS "ac_no_interactive_update" ON public.authority_corpus;
CREATE POLICY "ac_no_interactive_update" ON public.authority_corpus FOR UPDATE
  USING (false);  -- I-A2


-- ---------------------------------------------------------------------------
-- 2 — tenant_corpus
-- ---------------------------------------------------------------------------

ALTER TABLE public.tenant_corpus ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_corpus FORCE  ROW LEVEL SECURITY;

-- I-A1: org membership, and only chunks that cleared screening are retrievable.
DROP POLICY IF EXISTS "tc_read" ON public.tenant_corpus;
CREATE POLICY "tc_read" ON public.tenant_corpus FOR SELECT
  USING (
    public.is_org_member_for(public.current_app_user_id(), owner_org_id)  -- I-A1
    AND screen_state = 'clear'
  );

-- I-A2: uploads land as 'pending' and name their uploader.
DROP POLICY IF EXISTS "tc_insert" ON public.tenant_corpus;
CREATE POLICY "tc_insert" ON public.tenant_corpus FOR INSERT
  WITH CHECK (
    public.is_org_member_for(public.current_app_user_id(), owner_org_id)  -- I-A2
    AND uploaded_by  = public.current_app_user_id()
    AND screen_state = 'pending'
  );

-- I-A4: promotion to the retrievable state is reserved for the screening
-- pipeline. Bare column names in WITH CHECK refer to the proposed new row.
DROP POLICY IF EXISTS "tc_no_state_selfpromote" ON public.tenant_corpus;
CREATE POLICY "tc_no_state_selfpromote" ON public.tenant_corpus FOR UPDATE
  USING (
    public.is_org_member_for(public.current_app_user_id(), owner_org_id)
  )
  WITH CHECK (
    public.is_org_member_for(public.current_app_user_id(), owner_org_id)
    AND screen_state <> 'clear'   -- I-A4: state promotion reserved for service-role
  );


-- ---------------------------------------------------------------------------
-- 3 — custom_agents
-- ---------------------------------------------------------------------------

ALTER TABLE public.custom_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_agents FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ca_read" ON public.custom_agents;
CREATE POLICY "ca_read" ON public.custom_agents FOR SELECT
  USING (public.is_org_member_for(public.current_app_user_id(), org_id));  -- I-A1

DROP POLICY IF EXISTS "ca_write" ON public.custom_agents;
CREATE POLICY "ca_write" ON public.custom_agents FOR INSERT
  WITH CHECK (
    public.is_org_member_for(public.current_app_user_id(), org_id)  -- I-A2
    AND created_by = public.current_app_user_id()
  );

DROP POLICY IF EXISTS "ca_update" ON public.custom_agents;
CREATE POLICY "ca_update" ON public.custom_agents FOR UPDATE
  USING      (public.is_org_member_for(public.current_app_user_id(), org_id))   -- I-A2
  WITH CHECK (public.is_org_member_for(public.current_app_user_id(), org_id));  -- I-A2


-- ---------------------------------------------------------------------------
-- 4 — agent_sessions
-- ---------------------------------------------------------------------------

ALTER TABLE public.agent_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_sessions FORCE  ROW LEVEL SECURITY;

-- I-A1 / I-5: own sessions only, and never one on a matter the caller is
-- walled from. agent_sessions carries a direct matter_id FK, so the wall term
-- is required by wall-lint and load-bearing at runtime.
DROP POLICY IF EXISTS "as_own" ON public.agent_sessions;
CREATE POLICY "as_own" ON public.agent_sessions FOR SELECT
  USING (
    user_id = public.current_app_user_id()                               -- I-A1
    AND (matter_id IS NULL OR NOT public.wall_blocks_user(matter_id))    -- I-5
  );

DROP POLICY IF EXISTS "as_own_insert" ON public.agent_sessions;
CREATE POLICY "as_own_insert" ON public.agent_sessions FOR INSERT
  WITH CHECK (
    user_id = public.current_app_user_id()                               -- I-A2
    AND (matter_id IS NULL OR NOT public.wall_blocks_user(matter_id))    -- I-5
  );

DROP POLICY IF EXISTS "as_own_update" ON public.agent_sessions;
CREATE POLICY "as_own_update" ON public.agent_sessions FOR UPDATE
  USING (
    user_id = public.current_app_user_id()
    AND (matter_id IS NULL OR NOT public.wall_blocks_user(matter_id))    -- I-5
  )
  WITH CHECK (
    user_id = public.current_app_user_id()                               -- I-A2
    AND (matter_id IS NULL OR NOT public.wall_blocks_user(matter_id))
  );


-- ---------------------------------------------------------------------------
-- 5 — professional_credentials
-- ---------------------------------------------------------------------------

ALTER TABLE public.professional_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.professional_credentials FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pc_self" ON public.professional_credentials;
CREATE POLICY "pc_self" ON public.professional_credentials FOR SELECT
  USING (user_id = public.current_app_user_id());  -- I-A1, I-A2

DROP POLICY IF EXISTS "pc_self_insert" ON public.professional_credentials;
CREATE POLICY "pc_self_insert" ON public.professional_credentials FOR INSERT
  WITH CHECK (user_id = public.current_app_user_id());  -- I-A2

DROP POLICY IF EXISTS "pc_self_update" ON public.professional_credentials;
CREATE POLICY "pc_self_update" ON public.professional_credentials FOR UPDATE
  USING      (user_id = public.current_app_user_id())
  WITH CHECK (user_id = public.current_app_user_id());  -- I-A2


-- ---------------------------------------------------------------------------
-- 6 — authority_publications
-- ---------------------------------------------------------------------------

ALTER TABLE public.authority_publications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.authority_publications FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ap_read" ON public.authority_publications;
CREATE POLICY "ap_read" ON public.authority_publications FOR SELECT
  USING (public.current_app_user_id() IS NOT NULL);  -- I-A1: authenticated read

DROP POLICY IF EXISTS "ap_no_interactive_insert" ON public.authority_publications;
CREATE POLICY "ap_no_interactive_insert" ON public.authority_publications FOR INSERT
  WITH CHECK (false);  -- I-A2


-- ---------------------------------------------------------------------------
-- 7 — ingestion_screen_findings
-- ---------------------------------------------------------------------------

ALTER TABLE public.ingestion_screen_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingestion_screen_findings FORCE  ROW LEVEL SECURITY;

-- Findings key on chunk_id. Only tenant chunks carry an org, so membership is
-- resolved through tenant_corpus.owner_org_id — authority_corpus has no org
-- by construction (I-A4).
DROP POLICY IF EXISTS "isf_read" ON public.ingestion_screen_findings;
CREATE POLICY "isf_read" ON public.ingestion_screen_findings FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.tenant_corpus tc
      WHERE tc.id = ingestion_screen_findings.chunk_id
        AND public.is_org_member_for(public.current_app_user_id(), tc.owner_org_id)
    )
  );  -- I-A1

DROP POLICY IF EXISTS "isf_no_interactive_insert" ON public.ingestion_screen_findings;
CREATE POLICY "isf_no_interactive_insert" ON public.ingestion_screen_findings FOR INSERT
  WITH CHECK (false);  -- I-A2


-- ---------------------------------------------------------------------------
-- 8 — grounding_eval_sets (policies stay as issued in 1073)
-- ---------------------------------------------------------------------------

ALTER TABLE public.grounding_eval_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grounding_eval_sets FORCE  ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- 9 — agent_execution_logs
-- ---------------------------------------------------------------------------

ALTER TABLE public.agent_execution_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_execution_logs FORCE  ROW LEVEL SECURITY;

-- I-A1 / I-5: org compliance record, minus anything on a walled matter.
DROP POLICY IF EXISTS "ael_org_read" ON public.agent_execution_logs;
CREATE POLICY "ael_org_read" ON public.agent_execution_logs FOR SELECT
  USING (
    public.is_org_member_for(public.current_app_user_id(), org_id)      -- I-A1
    AND (matter_id IS NULL OR NOT public.wall_blocks_user(matter_id))   -- I-5
  );


-- ---------------------------------------------------------------------------
-- 10 — grounding_strikes
-- ---------------------------------------------------------------------------

ALTER TABLE public.grounding_strikes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grounding_strikes FORCE  ROW LEVEL SECURITY;

-- I-A1 / I-5: reachable only through a parent log the caller may read.
DROP POLICY IF EXISTS "gs_org_read" ON public.grounding_strikes;
CREATE POLICY "gs_org_read" ON public.grounding_strikes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.agent_execution_logs ael
      WHERE ael.id = grounding_strikes.execution_id
        AND public.is_org_member_for(public.current_app_user_id(), ael.org_id)  -- I-A1
        AND (ael.matter_id IS NULL
             OR NOT public.wall_blocks_user(ael.matter_id))                     -- I-5
    )
  );

COMMIT;
