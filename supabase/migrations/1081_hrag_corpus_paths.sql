-- =============================================================================
-- 1081_hrag_corpus_paths.sql
-- Shtiya Builder v3.0 — HRAG Vault Network Part II:
-- ltree path columns + HRAG metadata on authority_corpus and tenant_corpus,
-- the corpus_publisher role, path guards, tenant subtree guard,
-- shared-branch write guard.
--
-- Path guards enforce I-H1 (registered path) and I-H2 (non-structural).
-- The tenant subtree guard enforces I-H11 (tenant content in its org subtree
-- only) and I-H12 (topic_paths reference, never contain).
-- The shared branch write guard enforces I-H21.
--
-- authority_corpus already carries (10700): embedding vector(1536), domain,
--   sub_domain, jurisdiction_id, visibility, trust_class, effective_from,
--   effective_to, superseded_by, reverify_due, document_title, content,
--   source_url, publisher, document_type, chunk_index, content_sha256.
-- tenant_corpus already carries (10700): embedding, domain, sub_domain,
--   owner_org_id, uploaded_by, screen_state, screen_findings, source_kind,
--   document_title, content, jurisdiction_id, trust_class.
--
-- The existing HNSW indexes (ac_vec_public / ac_vec_verified / ac_vec_licensed
-- / ac_vec_attorney and tc_vec, from 10700) remain. The per-branch partial
-- HNSW indexes added here serve I-A9: pre-filter, then ANN.
--
-- SCHEMA CORRECTIONS vs the task spec (each verified against the live schema):
--
--   - The corpus_publisher role does not exist in this cluster and is created
--     here. Without it guard_shared_branch_write() compares current_user to a
--     role name that names nothing, and authority_corpus becomes a table no
--     role on the system can write.
--
--   - That guard tests pg_has_role(), not current_user = 'corpus_publisher'.
--     The literal comparison also locks out the superuser running the
--     migrations, so any future seed of authority_corpus — including the
--     editorial pipeline's own — fails. pg_has_role() admits a superuser and a
--     session that has SET ROLE corpus_publisher, and still refuses
--     `authenticated` and `service_role`, which is the pair I-H21 is about.
--
--   - authenticated holds COLUMN-level SELECT on both corpora (10700 §12 names
--     every column except embedding, I-A10). A column-level grant does not
--     extend to columns added later, so every column added below is granted
--     explicitly in §6. Without that, match_hrag_chunks() — SECURITY INVOKER
--     by I-H14 — dies on `permission denied for column path` for every
--     authenticated caller. tenant_corpus INSERT/UPDATE need no such fixup:
--     those two are table-level grants and cover new columns already.
--
--   - tenant_corpus.subject_kind is the public.subject_kind ENUM declared in
--     1080, not text. See the 1080 header.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1 — The corpus_publisher role (I-H21)
--
-- NOLOGIN and NOINHERIT: it is a role to be assumed deliberately by the
-- editorial pipeline, not a privilege anyone carries by accident. Roles are
-- cluster-scoped and survive `supabase db reset`, so the create is guarded.
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'corpus_publisher') THEN
    CREATE ROLE corpus_publisher NOLOGIN NOINHERIT;
  END IF;
END $$;

-- `postgres` on Supabase is NOT a superuser (rolsuper = f; it carries BYPASSRLS
-- and little else), so pg_has_role() does not answer true for it by default and
-- membership has to be granted explicitly. Without this the guard in §5 closes
-- authority_corpus to the role that runs the migrations too, and no seed of the
-- authority corpus can ever be applied. postgres already holds BYPASSRLS and
-- full DML on the table, so the grant confers no reach it did not have.
GRANT corpus_publisher TO postgres;


-- ---------------------------------------------------------------------------
-- 2 — Extend authority_corpus
-- ---------------------------------------------------------------------------

ALTER TABLE public.authority_corpus
  ADD COLUMN IF NOT EXISTS path            ltree,
  ADD COLUMN IF NOT EXISTS authority_cls   public.authority_class NOT NULL DEFAULT 'enacted',
  ADD COLUMN IF NOT EXISTS practice_facets text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS issuing_body    text,
  ADD COLUMN IF NOT EXISTS edition_label   text;


-- ---------------------------------------------------------------------------
-- 3 — Extend tenant_corpus
-- ---------------------------------------------------------------------------

ALTER TABLE public.tenant_corpus
  ADD COLUMN IF NOT EXISTS path                 ltree,
  ADD COLUMN IF NOT EXISTS topic_paths          ltree[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS authority_cls        public.authority_class NOT NULL
                                                  DEFAULT 'tenant_document'
                                                  CHECK (authority_cls = 'tenant_document'),
  ADD COLUMN IF NOT EXISTS subject_kind         public.subject_kind,
  ADD COLUMN IF NOT EXISTS subject_id           uuid,
  ADD COLUMN IF NOT EXISTS raw_reference_sha256 text,
  ADD COLUMN IF NOT EXISTS md_working_sha256    text;


-- ---------------------------------------------------------------------------
-- 4 — Indexes
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS ac_path_gist  ON public.authority_corpus USING gist (path);
CREATE INDEX IF NOT EXISTS tc_path_gist  ON public.tenant_corpus    USING gist (path);
CREATE INDEX IF NOT EXISTS tc_topic_gist ON public.tenant_corpus    USING gist (topic_paths);
CREATE INDEX IF NOT EXISTS tc_subject    ON public.tenant_corpus (subject_kind, subject_id)
  WHERE subject_kind IS NOT NULL;

-- Per-domain-branch partial HNSW (I-A9). A single undivided HNSW over the whole
-- tree forces the path filter to run AFTER the ANN scan: recall collapses when
-- the branch is a small share of the corpus, and the surviving result count
-- leaks how much of the rest of the tree matched.

CREATE INDEX IF NOT EXISTS ac_vec_law ON public.authority_corpus
  USING hnsw (embedding vector_cosine_ops)
  WHERE path <@ 'ROOT.Law'::ltree       AND superseded_by IS NULL;

CREATE INDEX IF NOT EXISTS ac_vec_std ON public.authority_corpus
  USING hnsw (embedding vector_cosine_ops)
  WHERE path <@ 'ROOT.Standards'::ltree AND superseded_by IS NULL;

CREATE INDEX IF NOT EXISTS ac_vec_inv ON public.authority_corpus
  USING hnsw (embedding vector_cosine_ops)
  WHERE path <@ 'ROOT.Investor'::ltree  AND superseded_by IS NULL;


-- ---------------------------------------------------------------------------
-- 5 — Guards
-- ---------------------------------------------------------------------------

-- I-H1 / I-H2. Every chunk names a registered, live, non-structural node.
CREATE OR REPLACE FUNCTION public.guard_corpus_path()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE n public.vault_nodes;
BEGIN
  IF NEW.path IS NULL THEN
    RAISE EXCEPTION 'I-H1: every chunk carries a registered path'
      USING ERRCODE = '23502';
  END IF;

  SELECT v.* INTO n
  FROM public.vault_nodes v
  WHERE v.path OPERATOR(public.=) NEW.path;

  IF n.path IS NULL THEN
    RAISE EXCEPTION 'I-H1: % is not a registered vault node', NEW.path
      USING ERRCODE = '23503';
  END IF;

  IF n.kind = 'structural' THEN
    RAISE EXCEPTION
      'I-H2: % is a structural node; filing content there broadcasts it to every query in the system',
      NEW.path USING ERRCODE = '42501';
  END IF;

  IF n.retired_at IS NOT NULL THEN
    RAISE EXCEPTION 'I-H1: node % is retired', NEW.path
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ac_path_guard ON public.authority_corpus;
CREATE TRIGGER ac_path_guard
  BEFORE INSERT OR UPDATE ON public.authority_corpus
  FOR EACH ROW EXECUTE FUNCTION public.guard_corpus_path();

DROP TRIGGER IF EXISTS tc_path_guard ON public.tenant_corpus;
CREATE TRIGGER tc_path_guard
  BEFORE INSERT OR UPDATE ON public.tenant_corpus
  FOR EACH ROW EXECUTE FUNCTION public.guard_corpus_path();


-- I-H11 / I-H12. Tenant content is filed inside its own org subtree and
-- nowhere else; topic_paths point at shared vocabulary but never file into it.
CREATE OR REPLACE FUNCTION public.guard_tenant_subtree()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.path IS NOT NULL
     AND NOT (NEW.path OPERATOR(public.<@) public.org_root(NEW.owner_org_id)) THEN
    RAISE EXCEPTION 'I-H11: tenant content must be filed under % (attempted %)',
      public.org_root(NEW.owner_org_id), NEW.path
      USING ERRCODE = '42501';
  END IF;

  -- I-H12: topic_paths are references, never containment. A firm's playbook
  -- note may point at a classification or a standard; it may not become part
  -- of one, which is what filing it there would mean.
  IF EXISTS (
    SELECT 1 FROM unnest(NEW.topic_paths) t(p)
    WHERE NOT (
         t.p OPERATOR(public.<@) 'ROOT.Classification'::public.ltree
      OR t.p OPERATOR(public.<@) 'ROOT.Standards'::public.ltree
    )
  ) THEN
    RAISE EXCEPTION
      'I-H12: topic_paths may reference only Classification or Standards subtrees'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tc_subtree_guard ON public.tenant_corpus;
CREATE TRIGGER tc_subtree_guard
  BEFORE INSERT OR UPDATE ON public.tenant_corpus
  FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_subtree();


-- I-H21. Nothing on the tenant ingestion path may write a shared authority
-- branch. authority_corpus IS the shared branch store, so the gate is the
-- table. service_role holds INSERT/UPDATE here from 1075 for the ingestion and
-- screening pipeline; this trigger is what keeps that grant from also being a
-- licence to publish law. The grant stays — a privilege that is present and
-- refused at the row is auditable, where a revoked privilege only moves the
-- question to whoever next re-grants it.
-- SECURITY INVOKER, and that is the whole mechanism. Inside a SECURITY DEFINER
-- function current_user is the function OWNER, not the caller, so the DEFINER
-- form of this guard reports `postgres` for every writer alive and tests
-- nothing (measured: a service_role INSERT raised with current_user = postgres).
-- INVOKER makes current_user the role actually performing the write. The
-- function reads no table, so it needs no elevated rights to do its job.
CREATE OR REPLACE FUNCTION public.guard_shared_branch_write()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF NOT pg_catalog.pg_has_role(current_user, 'corpus_publisher', 'USAGE') THEN
    RAISE EXCEPTION
      'I-H21: ROOT.Law / ROOT.Standards / ROOT.Investor accept writes only from the corpus_publisher role (current_user = %)',
      current_user USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ac_publisher_only ON public.authority_corpus;
CREATE TRIGGER ac_publisher_only
  BEFORE INSERT OR UPDATE ON public.authority_corpus
  FOR EACH ROW EXECUTE FUNCTION public.guard_shared_branch_write();


-- ---------------------------------------------------------------------------
-- 6 — Grants
--
-- Column-level SELECT for every column added above, so that the 10700 §12
-- pattern — every column except embedding — still holds after this migration.
-- These are per-column grants, never `GRANT SELECT ON <corpus> TO
-- authenticated`: a whole-table grant would carry `embedding` with it and
-- hand back the partial plaintext a dense vector encodes (I-A10 / I-19).
-- ---------------------------------------------------------------------------

GRANT SELECT (path, authority_cls, practice_facets, issuing_body, edition_label)
  ON public.authority_corpus TO authenticated;

GRANT SELECT (path, topic_paths, authority_cls, subject_kind, subject_id,
              raw_reference_sha256, md_working_sha256)
  ON public.tenant_corpus TO authenticated;

-- The editorial pipeline. Nothing else on the platform assumes this role.
GRANT USAGE ON SCHEMA public TO corpus_publisher;
GRANT SELECT, INSERT, UPDATE ON public.authority_corpus    TO corpus_publisher;
GRANT SELECT, INSERT, UPDATE ON public.vault_nodes         TO corpus_publisher;
GRANT SELECT, INSERT, UPDATE ON public.authority_relations TO corpus_publisher;


-- ---------------------------------------------------------------------------
-- 7 — The publisher write path (I-H21)
--
-- corpus_publisher is an ordinary role: it holds no BYPASSRLS, so the grants
-- above are inert until a policy admits it. 1080's vn_no_interactive_write and
-- 1074's ac_no_interactive_insert are WITH CHECK (false), which closes the
-- table to every role that RLS applies to — including this one.
--
-- Without the policies below the only writer left is the superuser, and
-- pg_has_role() is true for a superuser unconditionally, so the guard trigger
-- would assert nothing about anybody. Admitting corpus_publisher as a real,
-- RLS-subject writer is what makes I-H21 a live constraint rather than a
-- comment: `authenticated` is refused by policy AND trigger, `service_role`
-- carries BYPASSRLS but is still refused by the trigger, and the publisher is
-- the one role that passes both.
--
-- These are PERMISSIVE and therefore OR with the existing false-valued
-- policies; they widen nothing else.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "vn_publisher_insert" ON public.vault_nodes;
CREATE POLICY "vn_publisher_insert" ON public.vault_nodes FOR INSERT
  WITH CHECK (pg_catalog.pg_has_role(current_user, 'corpus_publisher', 'USAGE'));

DROP POLICY IF EXISTS "vn_publisher_update" ON public.vault_nodes;
CREATE POLICY "vn_publisher_update" ON public.vault_nodes FOR UPDATE
  USING      (pg_catalog.pg_has_role(current_user, 'corpus_publisher', 'USAGE'))
  WITH CHECK (pg_catalog.pg_has_role(current_user, 'corpus_publisher', 'USAGE'));

DROP POLICY IF EXISTS "ar_publisher_insert" ON public.authority_relations;
CREATE POLICY "ar_publisher_insert" ON public.authority_relations FOR INSERT
  WITH CHECK (pg_catalog.pg_has_role(current_user, 'corpus_publisher', 'USAGE'));

DROP POLICY IF EXISTS "ar_publisher_update" ON public.authority_relations;
CREATE POLICY "ar_publisher_update" ON public.authority_relations FOR UPDATE
  USING      (pg_catalog.pg_has_role(current_user, 'corpus_publisher', 'USAGE'))
  WITH CHECK (pg_catalog.pg_has_role(current_user, 'corpus_publisher', 'USAGE'));

DROP POLICY IF EXISTS "ac_publisher_insert" ON public.authority_corpus;
CREATE POLICY "ac_publisher_insert" ON public.authority_corpus FOR INSERT
  WITH CHECK (pg_catalog.pg_has_role(current_user, 'corpus_publisher', 'USAGE'));

DROP POLICY IF EXISTS "ac_publisher_update" ON public.authority_corpus;
CREATE POLICY "ac_publisher_update" ON public.authority_corpus FOR UPDATE
  USING      (pg_catalog.pg_has_role(current_user, 'corpus_publisher', 'USAGE'))
  WITH CHECK (pg_catalog.pg_has_role(current_user, 'corpus_publisher', 'USAGE'));

COMMIT;
