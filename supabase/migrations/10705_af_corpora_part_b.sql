-- =============================================================================
-- 1070_af_corpora_part_b.sql
-- Shtiya Builder v3.0 — Agent Factory, Part B:
-- corpus ingest guard, custom agents, sessions, professional credentials,
-- the visibility predicates, RLS, and grants.
--
-- Section order differs from the task outline on purpose: vault_visible_to()
-- and is_org_member_for() are defined before the policies that call them, and
-- after professional_credentials, which vault_visible_to() reads.
--
-- CORRECTIONS vs the Plan draft (verified against the live schema):
--   - pi_medical_records and corp_transaction_records have no document_id
--     column (1041 stores storage_path). The ingest guard reaches them through
--     documents.matter_id instead — see the note on Section 6.
--   - firm_members exposes member_role, not firm_role.
--   - agent_sessions carries a direct matter_id FK, so wall-lint requires a
--     wall term in its SELECT policy. Added, and correct on the merits: a
--     screened user must not retain a live agent session on a walled matter.
--
-- I-A5:  tenant corpus is org-scoped and must be screened clear.
-- I-A6:  visibility tiers derive from verified credentials, not role strings.
-- I-A7:  agent filters are typed FK-backed columns; wildcards are hard errors.
-- I-A10: embedding is excluded from every column-level grant.
-- I-A14: PII-bearing / matter-scoped content never enters a corpus.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- Section 6 — guard_tenant_ingest()
--
-- The Plan matched pi_medical_records.document_id / corp_transaction_records
-- .document_id; neither column exists. This guard instead treats any document
-- belonging to a matter that holds PI lien or corporate-transaction records as
-- carrying that matter's class, and refuses it. That is a coarser test than
-- per-document classification — it rejects on matter scope, not on the
-- document's own class — and it is the strongest structural barrier available
-- until `documents` carries a data_class column.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.guard_tenant_ingest()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN  -- I-A14
  IF NEW.source_kind = 'ocr_extract' AND NEW.source_document_id IS NOT NULL THEN
    -- Block documents scoped to a matter carrying PI liens (class_phi surrogate)
    IF EXISTS (
      SELECT 1 FROM public.pi_liens l
      JOIN public.documents d ON d.matter_id = l.matter_id
      WHERE d.id = NEW.source_document_id
    ) THEN
      RAISE EXCEPTION 'I-A14: class_phi content cannot enter any corpus'
        USING ERRCODE = '42501';
    END IF;
    -- Block documents scoped to a matter carrying corporate transaction records
    IF EXISTS (
      SELECT 1 FROM public.corp_transaction_records c
      JOIN public.documents d ON d.matter_id = c.matter_id
      WHERE d.id = NEW.source_document_id
    ) THEN
      RAISE EXCEPTION 'I-A14: class_mnpi content cannot enter any corpus'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS tenant_corpus_ingest_guard ON tenant_corpus;
CREATE TRIGGER tenant_corpus_ingest_guard
  BEFORE INSERT ON tenant_corpus
  FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_ingest();


-- ---------------------------------------------------------------------------
-- Section 7 — custom_agents + guard
-- ---------------------------------------------------------------------------

-- I-A7: filters are typed FK-backed columns, never a jsonb blob.
-- A jsonb filter is a one-character bypass (`{}` matches every row).
CREATE TABLE IF NOT EXISTS custom_agents (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                 uuid        NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
  created_by             uuid        NOT NULL REFERENCES users(id),
  agent_name             text        NOT NULL,
  persona_prompt         text        NOT NULL CHECK (length(persona_prompt) <= 4000),
  -- TYPED filters — FK-validated; wildcards are hard errors (I-A7)
  filter_domain          text        NOT NULL REFERENCES vault_domains(domain),
  filter_sub_domain      text        NOT NULL,
  filter_jurisdiction_id text        NOT NULL REFERENCES jurisdictions(id),
  include_tenant_corpus  boolean     NOT NULL DEFAULT true,
  is_active              boolean     NOT NULL DEFAULT true,
  created_at             timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (filter_domain, filter_sub_domain)
    REFERENCES vault_sub_domains(domain, sub_domain),
  UNIQUE (org_id, agent_name)
  -- No vault_filters jsonb column — filter-lint fails the build if one appears
);
CREATE INDEX IF NOT EXISTS ca_org ON custom_agents (org_id) WHERE is_active;
ALTER TABLE custom_agents ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.guard_agent_definition()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN  -- I-A7
  -- Creator must be a member of the org (live column is member_role)
  IF NOT EXISTS (
    SELECT 1 FROM public.firm_members fm
    WHERE fm.firm_id = NEW.org_id AND fm.user_id = NEW.created_by
  ) THEN
    RAISE EXCEPTION 'AGENT_ORG_MISMATCH: creator is not a member of this org'
      USING ERRCODE = '42501';
  END IF;
  -- Wildcard and empty filters are hard errors — I-A7
  IF NEW.filter_domain IN ('*','')
     OR NEW.filter_sub_domain IN ('*','')
     OR NEW.filter_jurisdiction_id IN ('*','') THEN
    RAISE EXCEPTION 'FILTER_WILDCARD_FORBIDDEN: agent filters narrow; they never widen (I-A7)'
      USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.jurisdictions j
    WHERE j.id = NEW.filter_jurisdiction_id AND j.active
  ) THEN
    RAISE EXCEPTION 'JURISDICTION_UNKNOWN: %', NEW.filter_jurisdiction_id
      USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS custom_agents_guard ON custom_agents;
CREATE TRIGGER custom_agents_guard
  BEFORE INSERT OR UPDATE ON custom_agents
  FOR EACH ROW EXECUTE FUNCTION public.guard_agent_definition();


-- ---------------------------------------------------------------------------
-- Section 8 — agent_sessions + membership-revoke trigger
-- ---------------------------------------------------------------------------

-- (epoch, wall_epoch, corpus_epoch) form the prompt-cache key.
-- A wall bump or corpus revision orphans every cached prefix (I-A16).
CREATE TABLE IF NOT EXISTS agent_sessions (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id     uuid        NOT NULL REFERENCES custom_agents(id) ON DELETE CASCADE,
  user_id      uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  matter_id    uuid        REFERENCES matters(id) ON DELETE CASCADE,
  epoch        bigint      NOT NULL DEFAULT 1,
  wall_epoch   bigint      NOT NULL DEFAULT 1,   -- I-A16: wall bump orphans the cache
  corpus_epoch bigint      NOT NULL DEFAULT 1,
  opened_at    timestamptz NOT NULL DEFAULT now(),
  closed_at    timestamptz
);
ALTER TABLE agent_sessions ENABLE ROW LEVEL SECURITY;

-- SOC 2 CC6.3: agent access dies with firm membership — sessions closed at DB,
-- not at logout. A departing attorney cannot use cached sessions.
CREATE OR REPLACE FUNCTION public.revoke_agents_on_membership_loss()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.agent_sessions s
     SET closed_at = now()
  FROM public.custom_agents a
  WHERE s.agent_id  = a.id
    AND a.org_id    = OLD.firm_id
    AND s.user_id   = OLD.user_id
    AND s.closed_at IS NULL;
  RETURN OLD;
END;
$$;
DROP TRIGGER IF EXISTS firm_members_agent_revoke ON firm_members;
CREATE TRIGGER firm_members_agent_revoke
  AFTER DELETE ON firm_members
  FOR EACH ROW EXECUTE FUNCTION public.revoke_agents_on_membership_loss();


-- ---------------------------------------------------------------------------
-- Section 9 — professional_credentials
-- ---------------------------------------------------------------------------

-- Backs the 'licensed_pro' and 'attorney_only' visibility tiers.
-- These are verified facts, not role-group strings.
CREATE TABLE IF NOT EXISTS professional_credentials (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  domain            text        NOT NULL REFERENCES vault_domains(domain),
  credential_ref    text        NOT NULL,
  issuing_authority text        NOT NULL,
  standing          text        NOT NULL
    CHECK (standing IN ('active','suspended','expired')),
  verified_at       timestamptz NOT NULL,
  reverify_due      timestamptz NOT NULL,
  UNIQUE (user_id, domain, credential_ref)
);
ALTER TABLE professional_credentials ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- Section 10 — vault_visible_to() + is_org_member_for()
--
-- Defined here, after professional_credentials, and before the policies in
-- Section 11 that call them.
-- ---------------------------------------------------------------------------

-- I-A6: authorization derived from verified credentials only.
-- 'attorney_only' is backed by bar_admissions — a verified fact, not a role string.
CREATE OR REPLACE FUNCTION public.vault_visible_to(
  p_user         uuid,
  p_visibility   vault_visibility,
  p_jurisdiction text,
  p_domain       text
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$  -- I-A6
  SELECT CASE p_visibility
    WHEN 'public' THEN true
    WHEN 'verified_user' THEN
      EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = p_user AND u.identity_subject_id IS NOT NULL
      )
    WHEN 'licensed_pro' THEN
      EXISTS (
        SELECT 1 FROM public.professional_credentials c
        WHERE c.user_id      = p_user
          AND c.domain       = p_domain
          AND c.standing     = 'active'
          AND c.reverify_due > now()
      )
    WHEN 'attorney_only' THEN
      EXISTS (
        SELECT 1 FROM public.bar_admissions b
        JOIN public.jurisdictions j ON j.id = p_jurisdiction
        WHERE b.user_id      = p_user
          AND b.jurisdiction = coalesce(j.state_code, j.id)
          AND b.standing     = 'active'
          AND b.reverify_due > now()
      )
    ELSE false
  END;
$$;

REVOKE EXECUTE ON FUNCTION public.vault_visible_to(uuid, vault_visibility, text, text)
  FROM public;
GRANT  EXECUTE ON FUNCTION public.vault_visible_to(uuid, vault_visibility, text, text)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_org_member_for(p_user uuid, p_org uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.firm_members fm
    WHERE fm.firm_id = p_org AND fm.user_id = p_user
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_org_member_for(uuid, uuid) TO authenticated, service_role;


-- ---------------------------------------------------------------------------
-- Section 11 — RLS policies
-- ---------------------------------------------------------------------------

-- authority_corpus: read by credential; no interactive write path
DROP POLICY IF EXISTS "ac_read"                        ON authority_corpus;
DROP POLICY IF EXISTS "authority_corpus_public_read"   ON authority_corpus;
DROP POLICY IF EXISTS "authority_corpus_verified_read" ON authority_corpus;
CREATE POLICY "ac_read" ON authority_corpus FOR SELECT  -- I-A6, I-A13
  USING (
    public.vault_visible_to(
      public.current_app_user_id(), visibility, jurisdiction_id, domain
    )
    AND (effective_to IS NULL OR effective_to >= current_date)
    AND superseded_by IS NULL
    AND reverify_due > now()
  );
DROP POLICY IF EXISTS "ac_no_interactive_insert" ON authority_corpus;
CREATE POLICY "ac_no_interactive_insert" ON authority_corpus FOR INSERT
  WITH CHECK (false);
DROP POLICY IF EXISTS "ac_no_interactive_update" ON authority_corpus;
CREATE POLICY "ac_no_interactive_update" ON authority_corpus FOR UPDATE
  USING (false);

-- tenant_corpus: org membership only; must be 'clear' (I-A5)
DROP POLICY IF EXISTS "tc_read"                ON tenant_corpus;
DROP POLICY IF EXISTS "tenant_corpus_org_read" ON tenant_corpus;
CREATE POLICY "tc_read" ON tenant_corpus FOR SELECT  -- I-A5
  USING (
    public.is_org_member_for(public.current_app_user_id(), owner_org_id)
    AND screen_state = 'clear'
  );
DROP POLICY IF EXISTS "tc_insert" ON tenant_corpus;
CREATE POLICY "tc_insert" ON tenant_corpus FOR INSERT
  WITH CHECK (
    public.is_org_member_for(public.current_app_user_id(), owner_org_id)
    AND uploaded_by  = public.current_app_user_id()
    AND screen_state = 'pending'
  );
DROP POLICY IF EXISTS "tc_no_state_selfpromote" ON tenant_corpus;
CREATE POLICY "tc_no_state_selfpromote" ON tenant_corpus FOR UPDATE
  USING (public.is_org_member_for(public.current_app_user_id(), owner_org_id))
  WITH CHECK (screen_state <> 'clear');

-- custom_agents: org-scoped — closes the IDOR at the database
DROP POLICY IF EXISTS "ca_read" ON custom_agents;
CREATE POLICY "ca_read" ON custom_agents FOR SELECT
  USING (public.is_org_member_for(public.current_app_user_id(), org_id));
DROP POLICY IF EXISTS "ca_write" ON custom_agents;
CREATE POLICY "ca_write" ON custom_agents FOR INSERT
  WITH CHECK (
    public.is_org_member_for(public.current_app_user_id(), org_id)
    AND created_by = public.current_app_user_id()
  );
DROP POLICY IF EXISTS "ca_update" ON custom_agents;
CREATE POLICY "ca_update" ON custom_agents FOR UPDATE
  USING (public.is_org_member_for(public.current_app_user_id(), org_id));

-- agent_sessions: own sessions only, and never on a matter the user is walled from
DROP POLICY IF EXISTS "as_own" ON agent_sessions;
CREATE POLICY "as_own" ON agent_sessions FOR SELECT
  USING (
    user_id = public.current_app_user_id()
    AND (matter_id IS NULL OR NOT public.wall_blocks_user(matter_id))
  );

-- professional_credentials: self-read
DROP POLICY IF EXISTS "pc_self" ON professional_credentials;
CREATE POLICY "pc_self" ON professional_credentials FOR SELECT
  USING (user_id = public.current_app_user_id());


-- ---------------------------------------------------------------------------
-- Section 12 — Grants + REVOKE sweep
--
-- Re-issues the corpus grants that the Part A CASCADE dropped, against the new
-- column lists. I-A10: embedding appears in neither grant.
-- ---------------------------------------------------------------------------

REVOKE ALL ON public.authority_corpus FROM public, anon;
REVOKE ALL ON public.tenant_corpus    FROM public, anon;

GRANT SELECT (
  id, document_title, domain, sub_domain, jurisdiction_id, document_type,
  visibility, trust_class, source_url, publisher, retrieved_at,
  effective_from, effective_to, superseded_by, verified_at, reverify_due,
  chunk_index, content, content_sha256, created_at
) ON authority_corpus TO authenticated, service_role;  -- I-A10: no embedding

GRANT SELECT (
  id, owner_org_id, uploaded_by, document_title, domain, sub_domain,
  jurisdiction_id, trust_class, screen_state, source_kind,
  source_document_id, chunk_index, content, content_sha256, created_at
) ON tenant_corpus TO authenticated, service_role;  -- I-A10: no embedding

REVOKE ALL ON public.custom_agents            FROM public, anon;
REVOKE ALL ON public.agent_sessions           FROM public, anon;
REVOKE ALL ON public.professional_credentials FROM public, anon;
REVOKE ALL ON public.vault_domains            FROM public, anon;
REVOKE ALL ON public.vault_sub_domains        FROM public, anon;
REVOKE ALL ON public.jurisdictions            FROM public, anon;

GRANT SELECT ON public.vault_domains            TO authenticated, service_role;
GRANT SELECT ON public.vault_sub_domains        TO authenticated, service_role;
GRANT SELECT ON public.jurisdictions            TO authenticated, service_role;
GRANT SELECT ON public.custom_agents            TO authenticated, service_role;
GRANT SELECT ON public.agent_sessions           TO authenticated, service_role;
GRANT SELECT ON public.professional_credentials TO authenticated, service_role;
