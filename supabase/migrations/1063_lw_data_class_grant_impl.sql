-- =============================================================================
-- 1063_lw_data_class_grant_impl.sql
-- Shtiya Builder v3.0 — Legal Workspace part 4:
-- MNPI designations, and the full implementations of has_data_class_grant()
-- and on_restricted_list() that replace the 1041 / 1007 stubs.
--
-- Until this migration, has_data_class_grant() returned false unconditionally,
-- so all five 1041 workbench tables were read-blocked for every non-admin.
-- This file wires them to matter_class_grants (created in 1060).
--
-- CORRECTIONS vs task spec (verified against a live database):
--   - on_restricted_list keeps the 1007 parameter name p_counterparty_id.
--     The task specified p_matter_id, but CREATE OR REPLACE cannot rename a
--     parameter, and the DROP+CREATE alternative breaks chain re-runnability:
--     1007 re-declares this function with the original name, so on a re-apply
--     it fails with "cannot change name of input parameter p_matter_id"
--     (measured). Keeping the name means no policy has to be dropped either,
--     so corp_transaction_records is never transiently unprotected.
--     The parameter carries a matter_id despite its name — see Section 2.
--
-- I-L8:  a class grant is explicit, revocable, and expiring.
-- I-L10: an active MNPI designation bars the holder from the matter's
--        corporate transaction records.
--
-- Builds on 1004 (matters), 1007 (on_restricted_list stub), 1041
-- (has_data_class_grant stub, corp_transaction_records), 1060
-- (matter_class_grants, data_class).
-- =============================================================================


-- ---------------------------------------------------------------------------
-- Section 1 — mnpi_designations
-- ---------------------------------------------------------------------------

-- I-L10: subject_cluster names the deal/issuer cluster the holder is walled to.
CREATE TABLE IF NOT EXISTS mnpi_designations (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  matter_id       uuid        NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  user_id         uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject_cluster text[]      NOT NULL,                      -- I-L10
  designated_at   timestamptz NOT NULL DEFAULT now(),
  released_at     timestamptz,
  UNIQUE (matter_id, user_id)
);
CREATE INDEX IF NOT EXISTS mnpi_active ON mnpi_designations (user_id) WHERE released_at IS NULL;
ALTER TABLE mnpi_designations ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- Section 2 — on_restricted_list(uuid) full implementation
--
-- NAMING: the parameter is p_counterparty_id for compatibility with the 1007
-- declaration, but it receives a MATTER id — the sole caller is the 1041
-- corp_transaction_records_read policy, which passes matter_id. Renaming it
-- would require DROP + CREATE (the policy depends on the function) and would
-- make 1007 fail on any chain re-apply.
-- ---------------------------------------------------------------------------

-- Full implementation: checks whether the calling user holds an active MNPI
-- designation on the given matter. Called by corp_transaction_records RLS
-- (1041) as on_restricted_list(matter_id).
CREATE OR REPLACE FUNCTION public.on_restricted_list(p_counterparty_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$  -- I-L10
  SELECT EXISTS (
    SELECT 1 FROM public.mnpi_designations d
    WHERE d.user_id    = public.current_app_user_id()
      AND d.released_at IS NULL
      -- Any active designation on this matter restricts the calling user.
      -- The subject_cluster is a non-empty array; its presence is the bar.
      -- p_counterparty_id carries the matter id (see the naming note above).
      AND d.matter_id  = p_counterparty_id
  );
$$;


-- ---------------------------------------------------------------------------
-- Section 3 — has_data_class_grant(uuid, text) full implementation
--
-- Signature is unchanged from the 1041 stub, so CREATE OR REPLACE is valid.
-- matter_class_grants.class is the data_class ENUM; the text parameter must be
-- cast, and under SET search_path = '' the type name must be schema-qualified.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.has_data_class_grant(
  p_matter_id uuid,
  p_class     text
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$  -- I-L8
  SELECT EXISTS (
    SELECT 1 FROM public.matter_class_grants g
    WHERE g.matter_id  = p_matter_id
      AND g.user_id    = public.current_app_user_id()
      AND g.class      = p_class::public.data_class
      AND g.revoked_at IS NULL
      AND (g.expires_at IS NULL OR g.expires_at > now())
  );
$$;


-- ---------------------------------------------------------------------------
-- Section 4 — Re-issue corp_transaction_records_read
--
-- Body is identical to 1041; re-issued so the policy is rebuilt against the
-- live implementations. Both predicates are now real, not stubs.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "corp_transaction_records_read" ON corp_transaction_records;
CREATE POLICY "corp_transaction_records_read" ON corp_transaction_records FOR SELECT
  USING (
    (                                                      -- I-L11, I-L12
      public.is_matter_party(matter_id)
      AND NOT public.wall_blocks_user(matter_id)
      AND public.has_data_class_grant(matter_id, 'class_mnpi')   -- I-L8
      AND NOT public.on_restricted_list(matter_id)               -- I-L10
    )
    OR public.current_user_role_group() = 'admin'
  );


-- ---------------------------------------------------------------------------
-- Section 5 — RLS on mnpi_designations
-- ---------------------------------------------------------------------------

-- Counsel-of-record on the matter reads; the designated user reads their own
-- designations; admin reads all.
DROP POLICY IF EXISTS "mnpi_party_read" ON mnpi_designations;
CREATE POLICY "mnpi_party_read" ON mnpi_designations FOR SELECT  -- I-L10
  USING (
    (
      (
        public.is_matter_party(matter_id)
        OR user_id = public.current_app_user_id()
      )
      AND NOT public.wall_blocks_user(matter_id)
    )
    OR public.current_user_role_group() = 'admin'
  );

-- Designations are created only via the constrained service route.
DROP POLICY IF EXISTS "mnpi_no_direct_insert" ON mnpi_designations;
CREATE POLICY "mnpi_no_direct_insert" ON mnpi_designations FOR INSERT
  WITH CHECK (false);


-- ---------------------------------------------------------------------------
-- Section 6 — Grants
--
-- EXECUTE grants are re-issued defensively; CREATE OR REPLACE preserves the
-- existing ACL, so these are no-ops on a clean chain.
-- ---------------------------------------------------------------------------

REVOKE ALL ON public.mnpi_designations FROM public;
GRANT SELECT ON public.mnpi_designations TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_data_class_grant(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.on_restricted_list(uuid)         TO authenticated, service_role;
