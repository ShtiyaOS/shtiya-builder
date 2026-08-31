-- =============================================================================
-- 10850_hrag_rls_part_a.sql
-- Shtiya Builder v3.0 — HRAG Vault Network Part VI-A:
-- HRAG-aware RLS on authority_corpus and tenant_corpus, the RESTRICTIVE wall
-- override on matter-scoped tenant chunks, the recipient-side widening of
-- cd_read, and the ltree-backed coverage_assertions that replaces the 1056 stub.
--
-- FILE NUMBERING: this pair is 10850/10855, not 1085/1085. Two files cannot
-- share a numeric version — supabase_migrations.schema_migrations has version
-- as its PRIMARY KEY, and the second file of a same-numbered pair aborts the
-- whole reset with "duplicate key value violates unique constraint
-- schema_migrations_pkey". The <N>0/<N>5 form keeps a split migration adjacent
-- and correctly ordered under the CLI's filename sort while still being two
-- distinct versions. The 1061/1064/1065/1070 pairs were renamed the same way.
--
-- SCHEMA CORRECTIONS vs the task spec (each verified against the live schema):
--
--   - ac_read_v2 keeps the currency terms the 1074 ac_read carried
--     (effective_to, superseded_by, reverify_due). The spec's replacement drops
--     them, which quietly widens a direct SELECT on authority_corpus to
--     superseded and reverify-overdue text. match_hrag_chunks() filtering them
--     is not a substitute: RLS is what answers for every OTHER reader of the
--     table (I-A13 / I-H5).
--
--   - cd_read is widened here to the recipient side. tc_read_v2's disclosure
--     branch is a subquery over corpus_disclosures, and a subquery inside an
--     RLS policy is itself subject to the referenced table's RLS. With the
--     owner-only cd_read from 1082 still in force, a recipient reads no
--     disclosure row, the branch is always false, and I-H13 read-through never
--     fires for anyone. This is the migration where subject_party() finally
--     exists to express it.
--
--   - tenant_corpus.subject_kind is already the public.subject_kind ENUM
--     (1080/1081), so neither policy casts it.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1 — authority_corpus (the HRAG layer replaces the 1074 policy)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "ac_read"    ON public.authority_corpus;
DROP POLICY IF EXISTS "ac_read_v2" ON public.authority_corpus;

-- I-A9: the path scope and the access decision are one predicate, evaluated
-- before the ANN scan. A chunk filed at an unregistered or retired node is not
-- readable at all — I-H1 is a read invariant, not only a write invariant.
CREATE POLICY "ac_read_v2" ON public.authority_corpus FOR SELECT
  USING (
    public.vault_visible_to(
      public.current_app_user_id(), visibility, jurisdiction_id, domain)   -- I-A1
    -- CURRENCY (I-A13 / I-H5) — carried forward from 1074's ac_read
    AND (effective_to IS NULL OR effective_to >= current_date)
    AND superseded_by IS NULL
    AND reverify_due  > now()
    -- I-H1 / I-H2
    AND path IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.vault_nodes n
      WHERE n.path       OPERATOR(public.=) authority_corpus.path
        AND n.kind       <> 'structural'
        AND n.retired_at IS NULL
    )
  );


-- ---------------------------------------------------------------------------
-- 2 — tenant_corpus (the HRAG layer replaces the 1074 policy)
--
-- Three branches and ONLY three. Filing a chunk under a shared topic path
-- grants nothing to any other tenant: topic_paths are referenced by branch
-- membership in match_hrag_chunks(), never by this policy. That is the answer
-- to the concrete-mix scenario (§II.6) — two firms can both point at
-- ROOT.Standards.ACI318 and neither reads the other's note.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "tc_read"    ON public.tenant_corpus;
DROP POLICY IF EXISTS "tc_read_v2" ON public.tenant_corpus;

CREATE POLICY "tc_read_v2" ON public.tenant_corpus FOR SELECT
  USING (
    -- Branch 1: the owning org, for a chunk inside that org's own subtree
    (
      public.is_org_member_for(public.current_app_user_id(), owner_org_id)
      AND (path IS NULL OR path OPERATOR(public.<@) public.org_root(owner_org_id))
      AND screen_state = 'clear'
    )
    -- Branch 2: cross-party disclosure — READ-THROUGH, never a copy (I-H13)
    OR EXISTS (
      SELECT 1 FROM public.corpus_disclosures d
      WHERE d.chunk_id    = tenant_corpus.id
        AND d.revoked_at  IS NULL
        AND (d.expires_at IS NULL OR d.expires_at > now())
        AND public.subject_party(d.subject_kind, d.subject_id)
    )
    -- Branch 3: the chunk is scoped to a subject the caller is a party to
    OR (
      subject_kind IS NOT NULL
      AND subject_id IS NOT NULL
      AND public.subject_party(subject_kind, subject_id)
    )
  );

-- RESTRICTIVE, so it ANDs with every branch above rather than adding a fourth.
-- A screened user is screened from a matter's chunks however they arrived —
-- through their own org, through a disclosure, or through subject membership.
-- A wall that only overrides one of three routes is not a wall.
DROP POLICY IF EXISTS "tc_wall_override" ON public.tenant_corpus;
CREATE POLICY "tc_wall_override" ON public.tenant_corpus AS RESTRICTIVE FOR SELECT
  USING (
    subject_kind IS DISTINCT FROM 'matter'::public.subject_kind
    OR NOT public.screened_from_matter(subject_id)
  );


-- ---------------------------------------------------------------------------
-- 3 — corpus_disclosures: the recipient side (I-H13)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "cd_read"    ON public.corpus_disclosures;
DROP POLICY IF EXISTS "cd_read_v2" ON public.corpus_disclosures;

CREATE POLICY "cd_read_v2" ON public.corpus_disclosures FOR SELECT
  USING (
    public.is_org_member_for(public.current_app_user_id(), owner_org_id)
    OR public.subject_party(subject_kind, subject_id)
  );


-- ---------------------------------------------------------------------------
-- 4 — coverage_assertions (drops the 1056 stub)
--
-- The stub keyed on (domain, jurisdiction, instrument_set) text triples. The
-- real thing keys on a registered ltree node, so an assertion cannot name a
-- branch that does not exist.
--
-- NOTE: scripts/seed-coverage-assertions.sql targets the STUB shape and must
-- not be run against a database that has applied this migration.
-- ---------------------------------------------------------------------------

DROP TABLE IF EXISTS coverage_assertions CASCADE;

CREATE TABLE coverage_assertions (
  id              uuid                PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_kind    public.subject_kind NOT NULL,
  jurisdiction_id text                NOT NULL REFERENCES public.jurisdictions(id),
  required_path   ltree               NOT NULL REFERENCES public.vault_nodes(path),
  rationale       text                NOT NULL,
  min_chunks      int                 NOT NULL DEFAULT 1,
  last_checked_at timestamptz,
  satisfied       boolean             NOT NULL DEFAULT false,
  UNIQUE (subject_kind, jurisdiction_id, required_path)
);

ALTER TABLE coverage_assertions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ca_read"                 ON coverage_assertions;
DROP POLICY IF EXISTS "ca_no_interactive_write" ON coverage_assertions;

CREATE POLICY "ca_read" ON coverage_assertions FOR SELECT
  USING (public.current_app_user_id() IS NOT NULL);

CREATE POLICY "ca_no_interactive_write" ON coverage_assertions FOR INSERT
  WITH CHECK (false);


-- ---------------------------------------------------------------------------
-- 5 — coverage_status() — the §I.5 pre-flight check
--
-- Each assertion names a minimum viable instrument without which answering
-- that subject+jurisdiction question produces advice wrong in a KNOWN
-- direction. Answering anyway, from the part of the corpus that is present, is
-- the composition failure this exists to catch — the answer looks complete
-- because nothing in it is false.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.coverage_status(
  p_kind         public.subject_kind,
  p_jurisdiction text,
  p_as_of        date DEFAULT current_date
) RETURNS TABLE (required_path ltree, satisfied boolean, rationale text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT
    c.required_path,
    (
      SELECT count(*) FROM public.authority_corpus a
      WHERE a.path OPERATOR(public.<@) c.required_path
        AND (a.effective_from IS NULL OR a.effective_from <= p_as_of)
        AND (a.effective_to   IS NULL OR a.effective_to   >= p_as_of)
        AND a.superseded_by IS NULL
        AND a.reverify_due  > now()
    ) >= c.min_chunks,
    c.rationale
  FROM public.coverage_assertions c
  WHERE c.subject_kind    = p_kind
    AND c.jurisdiction_id = p_jurisdiction;
$$;


-- ---------------------------------------------------------------------------
-- 6 — Grants
-- ---------------------------------------------------------------------------

REVOKE ALL   ON public.coverage_assertions FROM public, anon;
GRANT SELECT ON public.coverage_assertions TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.coverage_assertions TO corpus_publisher;

REVOKE EXECUTE ON FUNCTION public.coverage_status(public.subject_kind, text, date) FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.coverage_status(public.subject_kind, text, date) TO authenticated, service_role;

COMMIT;
