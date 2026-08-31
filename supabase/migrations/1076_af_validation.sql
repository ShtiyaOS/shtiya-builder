-- Migration: 1076_af_validation.sql
-- Phase 2 · Task 2.14 — Agent Factory invariant validation DO-blocks
-- Invariants verified: I-A2, I-A4, I-A5, I-A10, AF-12, AF-13, I-A15
--
-- Assertions only: no CREATE, ALTER, DROP, GRANT or REVOKE. Every block is
-- silent on pass and raises on failure, so the migration is the gate — a
-- schema that has drifted off any of these invariants cannot be applied.
--
-- Privilege assertions use has_table_privilege()/has_column_privilege() rather
-- than the information_schema grant views. Two reasons, both load-bearing:
-- information_schema.role_table_grants is filtered to roles enabled for the
-- session running it, so it can come back empty — and silently pass — under a
-- role that is not a member of `authenticated`; and it reports table-level
-- grants only, so a column-level INSERT would slip past it. has_*_privilege()
-- answers the question the invariant actually asks: can this role do this?
--
-- SCHEMA CORRECTIONS vs the task spec (each verified against the live schema):
--   - ingestion_screen_findings has no `screen_outcome` column and there is no
--     screen_outcome_enum / screen_state_enum type. The disqualifying column is
--     `disposition` text CHECK (quarantined|cleared|rejected), NULL until
--     reviewed. tenant_corpus.screen_state is likewise text, not an enum
--     (pending|clear|quarantined|rejected). §3 uses both live names, and scopes
--     the join with isf.corpus = 'tenant' because findings key on chunk_id
--     across both corpora.
--   - neutralize_chunk is SECURITY INVOKER, not DEFINER. Asserting DEFINER
--     would fail this migration against a correct schema: the function is pure
--     text rewriting and needs no elevated rights, so INVOKER is the safer of
--     the two. AF-13 is a conditional — a DEFINER function must pin its
--     search_path — so §6 asserts it over every DEFINER function in public
--     instead of over one function that is not one.
--   - proconfig stores an empty search_path as the 14-character string
--     `search_path=""`, so `proconfig @> ARRAY['search_path=']` never matches
--     and would report a false violation.
--   - proargtypes::regtype[] is zero-indexed, so comparing it to a literal
--     ARRAY[...] fails on array bounds even when the types match.
--     oidvectortypes() is compared instead.
--   - pg_rewrite.ev_action does not equal '<>' for DO INSTEAD NOTHING on
--     PG17, so §7 tests is_instead together with pg_get_ruledef().
--
-- 51 migrations total after this file (10 legacy + 41 v3: 1000–1076)

BEGIN;


-- ---------------------------------------------------------------------------
-- §1 — I-A2: the authority write path is service-role only
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['authority_corpus','authority_publications'] LOOP
    -- I-A2: no INSERT for authenticated, at table OR column level
    IF EXISTS (
      SELECT 1 FROM pg_attribute a
      WHERE a.attrelid = ('public.' || t)::regclass
        AND a.attnum > 0 AND NOT a.attisdropped
        AND has_column_privilege('authenticated', a.attrelid, a.attnum, 'INSERT')
    ) THEN
      RAISE EXCEPTION
        'I-A2 VIOLATION: authenticated holds INSERT on public.% (table- or column-level)', t;
    END IF;
  END LOOP;
END $$;


-- ---------------------------------------------------------------------------
-- §2 — I-A4: the authority corpus is platform-global and unpoisonable
--
-- The data check alone is vacuous on a fresh database, so the constraint that
-- keeps it true is asserted first. Together they cover both a fresh reset and
-- a push onto a populated project.
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  -- I-A4: the CHECK that makes owner_org_id unwritable must still exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.authority_corpus'::regclass
      AND contype  = 'c'
      AND conname  = 'authority_corpus_no_org'
  ) THEN
    RAISE EXCEPTION
      'I-A4 VIOLATION: authority_corpus_no_org CHECK (owner_org_id IS NULL) is missing';
  END IF;

  -- I-A4: and no row has slipped past it
  IF EXISTS (
    SELECT 1 FROM public.authority_corpus WHERE owner_org_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION
      'I-A4 VIOLATION: authority_corpus row found with non-NULL owner_org_id';
  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- §3 — I-A5: a rejected chunk is never reachable through retrieval
--
-- match_tenant_chunks() only reads screen_state = 'clear', so a chunk whose
-- screening ended in 'rejected' while its corpus row still reads 'clear' is
-- retrievable content that failed its own screen.
--
-- 'quarantined' is deliberately not asserted here: guard_tenant_screen() only
-- blocks clearance on findings still awaiting review (disposition IS NULL), so
-- a remediated chunk may legitimately carry a historical quarantined finding.
-- 'rejected' is terminal and has no such reading.
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  -- I-A5: no rejected finding may sit under a chunk that is live for retrieval
  IF EXISTS (
    SELECT 1
    FROM public.ingestion_screen_findings isf
    JOIN public.tenant_corpus tc ON tc.id = isf.chunk_id
    WHERE isf.corpus      = 'tenant'          -- findings span both corpora
      AND isf.disposition = 'rejected'        -- live column name
      AND tc.screen_state = 'clear'           -- the only retrievable state
  ) THEN
    RAISE EXCEPTION
      'I-A5 VIOLATION: rejected finding attached to a clear-state tenant_corpus chunk';
  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- §4 — I-A10: embeddings are not client-readable
--
-- Text is partially reconstructable from a dense vector, so a readable
-- embedding is a partial disclosure of the chunk it encodes.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['authority_corpus','tenant_corpus'] LOOP
    -- I-A10: authenticated must not be able to read the embedding column
    IF has_column_privilege('authenticated', ('public.' || t)::regclass, 'embedding', 'SELECT') THEN
      RAISE EXCEPTION
        'I-A10 VIOLATION: authenticated has SELECT on public.%.embedding', t;
    END IF;
  END LOOP;
END $$;


-- ---------------------------------------------------------------------------
-- §5 — AF-12: retrieval RPCs are SECURITY INVOKER
--
-- A DEFINER vector search runs as its owner, RLS does not apply, and every
-- filter in the body degrades to a caller-supplied parameter.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  r record;
  n int;
BEGIN
  -- AF-12: both RPCs must exist, with the (uuid, vector) signature 1072 defines
  SELECT count(*) INTO n
  FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace
    AND p.proname IN ('match_authority_chunks','match_tenant_chunks')
    AND oidvectortypes(p.proargtypes) = 'uuid, vector';
  IF n < 2 THEN
    RAISE EXCEPTION
      'AF-12 VIOLATION: expected 2 retrieval RPCs with signature (uuid, vector), found %', n;
  END IF;

  -- AF-12: neither may be SECURITY DEFINER
  FOR r IN
    SELECT p.proname FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.proname IN ('match_authority_chunks','match_tenant_chunks')
      AND p.prosecdef
  LOOP
    RAISE EXCEPTION
      'AF-12 VIOLATION: retrieval RPC %() is SECURITY DEFINER (must be INVOKER)', r.proname;
  END LOOP;
END $$;


-- ---------------------------------------------------------------------------
-- §6 — AF-13: every SECURITY DEFINER function pins its search_path
--
-- An unpinned DEFINER function resolves unqualified names through the caller's
-- search_path while running with the owner's rights.
--
-- The three legacy exemptions below predate v3 and live in 0002/0005/0007,
-- outside the v3 migration set definer-lint scans — which is why the lint is
-- green while they are not. They are excluded so this file gates new drift
-- rather than failing on inherited debt; trigger_embed_row() is the one worth
-- fixing first, being SECURITY DEFINER with no search_path at all and a
-- service-role bearer token in its body.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_bad text;
BEGIN
  SELECT string_agg(p.proname || '(' || oidvectortypes(p.proargtypes) || ')', ', ' ORDER BY p.proname)
    INTO v_bad
  FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace
    AND p.prosecdef                                                    -- AF-13
    AND NOT coalesce(p.proconfig @> ARRAY['search_path=""'], false)    -- stored form
    AND p.proname NOT IN (
      'is_block_committee_creator',  -- 0002_rls_policies.sql   (search_path=public)
      'is_block_committee_member',   -- 0007_write_policies.sql (search_path=public)
      'trigger_embed_row'            -- 0005_match_trigger.sql  (no search_path)
    );

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION
      'AF-13 VIOLATION: SECURITY DEFINER function(s) without a locked search_path: %', v_bad;
  END IF;

  -- AF-13: neutralize_chunk is INVOKER by design, but still pins search_path
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.proname = 'neutralize_chunk'
      AND p.proconfig @> ARRAY['search_path=""']
  ) THEN
    RAISE EXCEPTION
      'AF-13 VIOLATION: neutralize_chunk is missing or does not pin search_path';
  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- §7 — I-A15: agent_execution_logs is append-only
--
-- Enforced by rewrite rules rather than triggers: a rule discards the statement
-- during rewrite, so it holds for service_role and BYPASSRLS callers too.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  spec record;
BEGIN
  FOR spec IN
    SELECT * FROM (VALUES ('ael_no_update','2'::"char"), ('ael_no_delete','4'::"char"))
      AS v(rulename, ev_type)
  LOOP
    -- I-A15: rule present, INSTEAD, and discarding (DO INSTEAD NOTHING)
    IF NOT EXISTS (
      SELECT 1 FROM pg_rewrite r
      WHERE r.ev_class  = 'public.agent_execution_logs'::regclass
        AND r.rulename  = spec.rulename
        AND r.ev_type   = spec.ev_type
        AND r.is_instead
        AND pg_get_ruledef(r.oid) ~* 'DO INSTEAD NOTHING'
    ) THEN
      RAISE EXCEPTION
        'I-A15 VIOLATION: rule % missing or not DO INSTEAD NOTHING on agent_execution_logs',
        spec.rulename;
    END IF;
  END LOOP;
END $$;


-- ---------------------------------------------------------------------------
-- §8 — I-A2: credentials are issued, never self-asserted
--
-- vault_visible_to() opens the licensed_pro tier of the authority corpus to
-- anyone holding a professional_credentials row with standing = 'active' and
-- reverify_due in the future, and pc_self_insert constrains only whose row it
-- is — not what it claims. A write grant here is a read grant on gated
-- authority content. Measured f → t during Task 2.13 before the grant was
-- withheld; this block is what keeps it withheld.
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  -- I-A2: no INSERT and no UPDATE for authenticated, table OR column level
  IF EXISTS (
    SELECT 1 FROM pg_attribute a, unnest(ARRAY['INSERT','UPDATE']) AS p(priv)
    WHERE a.attrelid = 'public.professional_credentials'::regclass
      AND a.attnum > 0 AND NOT a.attisdropped
      AND has_column_privilege('authenticated', a.attrelid, a.attnum, p.priv)
  ) THEN
    RAISE EXCEPTION
      'I-A2 VIOLATION: authenticated has INSERT or UPDATE on professional_credentials '
      '(self-issued credential opens the vault_visible_to licensed_pro tier)';
  END IF;
END $$;

COMMIT;
