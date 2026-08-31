-- =============================================================================
-- 1086_hrag_validation.sql
-- Shtiya Builder v3.0 — HRAG Vault Network Part VII: final validation.
--
-- Invariants verified: I-H1, I-H2, I-H3, I-H7, I-H8, I-H11, I-H13, I-H14,
--                      I-H15, I-H21, HV-30, §I.5 coverage.
--
-- Assertions only. No CREATE, ALTER, DROP, GRANT or REVOKE except the closing
-- schema COMMENT. Every block is silent on pass and raises on failure, so the
-- migration is the gate: a schema that has drifted off any of these cannot be
-- applied.
--
-- 59 migrations after this file — 10 legacy (0001–0010) + 49 v3.0
-- (1000–1086, four of them split <N>0/<N>5 pairs).
--
-- §11–§14 are additions to the task spec. Each pins a correction made earlier
-- in this phase that a later edit could silently undo without any other test
-- noticing — the failure modes are all quiet ones.
-- =============================================================================

BEGIN;

-- §1 — I-H1: the vault_nodes integrity trigger exists
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE event_object_schema = 'public'
      AND event_object_table  = 'vault_nodes'
      AND trigger_name        = 'vault_nodes_guard'
  ) THEN
    RAISE EXCEPTION 'I-H1 VIOLATION: vault_nodes_guard trigger missing on vault_nodes';
  END IF;
END $$;


-- §2 — I-H2 / I-H8: ROOT exists as structural; preemption is an edge, not a rank
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.vault_nodes
    WHERE path = 'ROOT'::ltree AND kind = 'structural'
  ) THEN
    RAISE EXCEPTION 'I-H2 VIOLATION: ROOT structural node missing from vault_nodes';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'public.authority_class'::regtype::oid
      AND enumlabel = 'preempted_by'
  ) THEN
    RAISE EXCEPTION
      'I-H8 VIOLATION: preempted_by must not be an authority_class value — '
      'preemption is a relation between instruments, not a rank a chunk carries';
  END IF;
END $$;


-- §3 — I-H3: normalize_label() exists and is IMMUTABLE
-- Not cosmetic: a label producer that is merely STABLE cannot be indexed on,
-- and two spellings of one authority silently become two subtrees.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname     = 'normalize_label'
      AND n.nspname     = 'public'
      AND p.provolatile = 'i'
  ) THEN
    RAISE EXCEPTION 'I-H3 VIOLATION: normalize_label() missing or not IMMUTABLE';
  END IF;
END $$;


-- §4 — I-H7: standard_adopted() exists
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'standard_adopted' AND n.nspname = 'public'
  ) THEN
    RAISE EXCEPTION 'I-H7 VIOLATION: standard_adopted() function missing';
  END IF;
END $$;


-- §5 — I-H11: the tenant subtree guard exists on tenant_corpus
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE event_object_schema = 'public'
      AND event_object_table  = 'tenant_corpus'
      AND trigger_name        = 'tc_subtree_guard'
  ) THEN
    RAISE EXCEPTION 'I-H11 VIOLATION: tc_subtree_guard trigger missing on tenant_corpus';
  END IF;
END $$;


-- §6 — I-H13: the disclosure guard exists
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE event_object_schema = 'public'
      AND event_object_table  = 'corpus_disclosures'
      AND trigger_name        = 'corpus_disclosures_guard'
  ) THEN
    RAISE EXCEPTION 'I-H13 VIOLATION: corpus_disclosures_guard trigger missing';
  END IF;
END $$;


-- §7 — I-H14 / I-H15: the retrieval functions exist with the right security mode
DO $$
DECLARE n int;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace ns ON ns.oid = p.pronamespace
    WHERE p.proname = 'match_hrag_chunks' AND ns.nspname = 'public'
  ) THEN
    RAISE EXCEPTION 'I-H14 VIOLATION: match_hrag_chunks() function missing';
  END IF;

  -- A DEFINER vector search runs as its owner, RLS does not apply, and every
  -- filter in it becomes a parameter the caller supplies.
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace ns ON ns.oid = p.pronamespace
    WHERE p.proname = 'match_hrag_chunks' AND ns.nspname = 'public' AND p.prosecdef
  ) THEN
    RAISE EXCEPTION 'I-H14 VIOLATION: match_hrag_chunks() must be SECURITY INVOKER, not DEFINER';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace ns ON ns.oid = p.pronamespace
    WHERE p.proname = 'resolve_scope_set' AND ns.nspname = 'public'
  ) THEN
    RAISE EXCEPTION 'I-H15 VIOLATION: resolve_scope_set() function missing';
  END IF;

  -- subject_party() is overloaded: the 0-arg Legal Workspace form plus the
  -- 2-arg HRAG form. Count the 2-arg one specifically.
  SELECT count(*) INTO n
  FROM pg_proc p
  JOIN pg_namespace ns ON ns.oid = p.pronamespace
  WHERE ns.nspname = 'public'
    AND (
      (p.proname = 'subject_party'     AND p.pronargs = 2)
      OR (p.proname = 'subject_party_for' AND p.pronargs = 3)
    );
  IF n < 2 THEN
    RAISE EXCEPTION
      'I-H14 VIOLATION: subject_party(subject_kind,uuid) or subject_party_for(uuid,subject_kind,uuid) missing (found %)', n;
  END IF;
END $$;


-- §8 — I-H21: the shared-branch write guard exists on authority_corpus
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE event_object_schema = 'public'
      AND event_object_table  = 'authority_corpus'
      AND trigger_name        = 'ac_publisher_only'
  ) THEN
    RAISE EXCEPTION 'I-H21 VIOLATION: ac_publisher_only trigger missing on authority_corpus';
  END IF;
END $$;


-- §9 — I-H3: no PII column names on the ingestion queue
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'document_ingestion_queue'
      AND column_name  IN ('name','address','ssn','email','phone')
  ) THEN
    RAISE EXCEPTION
      'I-H3 VIOLATION: document_ingestion_queue contains a forbidden PII column name — '
      'a declared identity belongs inside declared_metadata';
  END IF;
END $$;


-- §10 — §I.5: the composition-failure control exists
-- The TABLE is required; rows are not. An empty table says "no one has declared
-- what coverage means here yet", which is the true statement on a fresh
-- database. See 10855 §2.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'coverage_assertions'
  ) THEN
    RAISE EXCEPTION
      'COVERAGE VIOLATION: coverage_assertions table missing — §I.5 composition failure control absent';
  END IF;

  -- The stub shape (1056) keyed on text triples. If those columns are still
  -- here, 10850 did not run and every assertion can name a branch that does
  -- not exist.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'coverage_assertions'
      AND column_name  = 'required_path'
  ) THEN
    RAISE EXCEPTION
      'COVERAGE VIOLATION: coverage_assertions is still the 1056 text stub — required_path missing';
  END IF;
END $$;


-- §11 — I-H21: the guard must be SECURITY INVOKER
-- Inside a SECURITY DEFINER function current_user is the function OWNER, so the
-- DEFINER form of this guard reports the owner for every writer alive and
-- refuses or admits everybody together. Nothing else in the suite catches it:
-- the trigger still exists, still fires, and still raises — just never for the
-- role that actually performed the write.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'guard_shared_branch_write' AND n.nspname = 'public' AND p.prosecdef
  ) THEN
    RAISE EXCEPTION
      'I-H21 VIOLATION: guard_shared_branch_write() is SECURITY DEFINER — '
      'current_user would be the function owner, not the writer, and the check asserts nothing';
  END IF;
END $$;


-- §12 — I-H21: the corpus_publisher role exists
-- pg_has_role() raises rather than returning false when the role name is
-- unknown, so a missing role turns the guard from a gate into an outage.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'corpus_publisher') THEN
    RAISE EXCEPTION 'I-H21 VIOLATION: the corpus_publisher role does not exist';
  END IF;
END $$;


-- §13 — the wall override on tenant_corpus must be RESTRICTIVE
-- As PERMISSIVE it ORs with the three read branches instead of ANDing with
-- them, which turns an ethical wall into a fourth way in.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'tenant_corpus'
      AND pol.polname = 'tc_wall_override'
      AND pol.polpermissive = false
  ) THEN
    RAISE EXCEPTION
      'WALL VIOLATION: tc_wall_override missing or not RESTRICTIVE on tenant_corpus';
  END IF;
END $$;


-- §14 — HV-30: the subject side must be able to answer "which jurisdiction?"
-- Six of the nine subject kinds resolve jurisdiction through a property. With
-- no column to read, jurisdiction_of_subject() returns NULL for all six, every
-- jurisdiction-specific scope_template stops matching, and scope resolution
-- degrades silently to the jurisdiction-agnostic templates alone.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'properties'
      AND column_name  = 'jurisdiction_id'
  ) THEN
    RAISE EXCEPTION
      'HV-30 VIOLATION: properties.jurisdiction_id missing — jurisdiction_of_subject() cannot read the subject row';
  END IF;
END $$;


COMMENT ON SCHEMA public IS
  'Shtiya Builder Core Ecosystem v3.0 — schema 0001–1086 validated.
   Core (1000–1008, 1020–1059) + Legal Workspace (1060–1066) +
   Agent Factory (10700–1076) + HRAG Vault Network (1080–1086).
   59 migrations: 10 legacy + 49 v3.0.
   Next: Part 3 — API Route Contracts, Phase Implementation, CI Guardrails.';

COMMIT;
