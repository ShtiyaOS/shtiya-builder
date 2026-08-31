-- =============================================================================
-- 1057_corpus_stubs.sql
-- Shtiya Builder v3.0 — Agent Factory corpus stub tables (pre-1070 placeholders).
--
-- Full Agent Factory schema lives in migrations 1070–1076. These stubs allow
-- application code to reference authority_corpus and tenant_corpus before
-- the full AF layer is deployed. No embedding columns yet — those require the
-- vector extension and are added in migration 1070.
--
-- SCHEMA CORRECTION vs Plan draft:
--   - auth.uid calls replaced throughout with current_app_user_id().
--   - org_members does not exist in the v3 schema. tenant_corpus_org_read
--     uses institution_members as the stub org-membership gate. This policy
--     will be superseded by the full HRAG tenant corpus RLS in migration 1080.
--
-- I-A4: authority_corpus.owner_org_id must always be NULL.
--       Enforced by constraint authority_corpus_no_org.
-- I-A5: tenant_corpus.owner_org_id must never be NULL; visibility is always
--       'org_private'. Enforced by constraint tenant_corpus_requires_org.
-- I-A10: embedding columns (added in 1070) inherit these same RLS policies.
-- I-19:  No embeddings-only export path exists or will be created.
--
-- Builds on 1001 (users), 1002 (current_app_user_id),
-- 1003 (institution_members).
-- =============================================================================


-- ---------------------------------------------------------------------------
-- Section 1 — authority_corpus
-- ---------------------------------------------------------------------------

-- I-A4: owner_org_id must be NULL — authority corpus is platform-global.
-- constraint authority_corpus_no_org enforces this at the DB level.
CREATE TABLE IF NOT EXISTS authority_corpus (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- path: ltree containment axis (full ltree type added in migration 1080)
  path           text NOT NULL,
  trust_class    text NOT NULL DEFAULT 'authority'
                   CHECK (trust_class = 'authority'),
  owner_org_id   uuid,              -- I-A4: must be NULL; constraint below enforces
  visibility     text NOT NULL DEFAULT 'public'
                   CHECK (visibility IN ('public','verified','attorney')),
  content        text,              -- populated by publishing pipeline; encrypted at rest
  -- effective dates — chunks past effective_to are ineligible for grounding (I-A13)
  effective_from timestamptz,
  effective_to   timestamptz,
  superseded_by  uuid REFERENCES authority_corpus(id),
  verified_at    timestamptz,
  reverify_due   timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  -- I-A4: authority corpus is platform-global; never org-scoped
  CONSTRAINT authority_corpus_no_org CHECK (owner_org_id IS NULL)
);


-- ---------------------------------------------------------------------------
-- Section 2 — tenant_corpus
-- ---------------------------------------------------------------------------

-- I-A5: owner_org_id is mandatory and immutable (never cross-tenant).
-- constraint tenant_corpus_requires_org enforces NOT NULL at the DB level.
-- visibility is locked to 'org_private' — no public tenant content ever (I-A5).
CREATE TABLE IF NOT EXISTS tenant_corpus (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- path: ltree containment axis (full ltree type added in migration 1080)
  path           text NOT NULL,
  trust_class    text NOT NULL DEFAULT 'tenant'
                   CHECK (trust_class = 'tenant'),
  owner_org_id   uuid NOT NULL,     -- I-A5: never null; never cross-tenant
  visibility     text NOT NULL DEFAULT 'org_private'
                   CHECK (visibility = 'org_private'),  -- I-A5: NEVER 'public'
  content        text,
  effective_from timestamptz,
  effective_to   timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  -- I-A5: tenant corpus always belongs to an org
  CONSTRAINT tenant_corpus_requires_org CHECK (owner_org_id IS NOT NULL)
);


-- ---------------------------------------------------------------------------
-- Section 3 — Enable row level security
-- ---------------------------------------------------------------------------

ALTER TABLE authority_corpus ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_corpus    ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- Section 4 — RLS policies
--
-- Postgres has no CREATE POLICY IF NOT EXISTS (through 17), so each policy is
-- preceded by DROP POLICY IF EXISTS to keep the migration re-runnable.
--
-- The two authority_corpus policies are PERMISSIVE and therefore OR together;
-- a row with visibility = 'attorney' matches neither and stays invisible until
-- the attorney-class gate lands in migration 1070.
-- ---------------------------------------------------------------------------

-- Stub policies: only applied when the 1057 schema is still in place.
-- Migration 1070 drops and recreates both tables with a full schema and
-- vault_visibility ENUM ('public','verified_user','licensed_pro','attorney_only').
-- On a chain re-apply, CREATE TABLE IF NOT EXISTS is skipped (tables exist from
-- 1070), so executing these policies against the 1070 schema would fail:
--   • visibility = 'verified' is not a valid vault_visibility value
--   • tenant_corpus no longer has effective_to
-- Guard: only issue policies when the stub column list is still in place.
DO $$
BEGIN
  -- The stub authority_corpus has a text `visibility` column with no type name.
  -- The 1070 corpus has vault_visibility (an enum). We detect the stub by
  -- checking whether the column data_type is 'text' (stub) vs 'USER-DEFINED' (1070).
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'authority_corpus'
      AND column_name = 'visibility'
      AND data_type = 'text'
  ) THEN
    DROP POLICY IF EXISTS "authority_corpus_public_read"   ON authority_corpus;
    DROP POLICY IF EXISTS "authority_corpus_verified_read" ON authority_corpus;
    DROP POLICY IF EXISTS "tenant_corpus_org_read"         ON tenant_corpus;

    EXECUTE $pol$
      CREATE POLICY "authority_corpus_public_read" ON authority_corpus FOR SELECT
        USING (
          visibility = 'public'
          AND public.current_app_user_id() IS NOT NULL
          AND (effective_to IS NULL OR effective_to > now())
          AND superseded_by IS NULL
        )
    $pol$;

    EXECUTE $pol$
      CREATE POLICY "authority_corpus_verified_read" ON authority_corpus FOR SELECT
        USING (
          visibility = 'verified'
          AND public.current_app_user_id() IS NOT NULL
          AND (effective_to IS NULL OR effective_to > now())
          AND superseded_by IS NULL
        )
    $pol$;

    EXECUTE $pol$
      CREATE POLICY "tenant_corpus_org_read" ON tenant_corpus FOR SELECT
        USING (
          EXISTS (
            SELECT 1 FROM public.institution_members im
            WHERE im.institution_id = tenant_corpus.owner_org_id
              AND im.user_id        = public.current_app_user_id()
          )
          AND (effective_to IS NULL OR effective_to > now())
        )
    $pol$;
  END IF;
END;
$$;


-- ---------------------------------------------------------------------------
-- Section 5 — REVOKE
-- ---------------------------------------------------------------------------

-- I-19: no embeddings-only export path exists or will be created.
-- I-A10: embedding columns (added in 1070) inherit these same RLS policies.
REVOKE ALL ON authority_corpus FROM public;
REVOKE ALL ON tenant_corpus    FROM public;
