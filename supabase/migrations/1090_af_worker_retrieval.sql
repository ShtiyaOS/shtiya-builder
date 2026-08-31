-- =============================================================================
-- 1090_af_worker_retrieval.sql
-- Shtiya Builder v3.0 — Phase 3 worker retrieval RPCs.
--
-- The supervisor (src/lib/agent/supervisor.ts) validates every task's
-- target_paths against the CLOSED scope set before dispatch (I-H16), then hands
-- the surviving paths to a worker. Neither existing retrieval function can take
-- that hand-off:
--
--   match_hrag_chunks(subject_kind, subject_id, scope_path, mode, …) takes ONE
--     path and re-derives resolve_scope_set() internally, which RAISES
--     SCOPE_DENIED under any connection whose current_app_user_id() is NULL.
--     A service_role caller therefore gets an exception, not a result set.
--
--   match_authority_chunks(agent_id, embedding) is filtered by a custom_agents
--     row's domain/sub_domain/jurisdiction, not by vault paths at all, and takes
--     no p_as_of (I-A13).
--
-- Two functions are added, deliberately asymmetric. The asymmetry is forced by
-- I-A10 and is documented rather than hidden.
--
-- THE I-A10 / I-H14 COLLISION, AND WHAT EACH FUNCTION DOES ABOUT IT
--
--   I-A10 revokes SELECT (embedding) on both corpora from `authenticated`
--   (1075 §2). I-H14 requires retrieval to run as the caller. Together they
--   mean: a session-scoped connection CANNOT perform a vector search on either
--   corpus, because reading the operand raises "permission denied for table".
--   1084's header records this and defers the resolution to "the Phase 3 route
--   contracts". This file is that resolution.
--
--   match_authority_by_paths — SECURITY INVOKER, granted to service_role ONLY.
--     Public legal authority is not tenant data, and the Phase 3 contract for
--     it is a service-role read (the worker's own docs carry the same note).
--     service_role can read `embedding`, so ANN is available here, and holds
--     BYPASSRLS, so ac_read_v2 does not run — which is why `visibility` is
--     PINNED to 'public' in the body below. That pin is not a default and not a
--     parameter: it is the only tier a caller-less connection is entitled to
--     serve, and making it a parameter would hand the tier choice to the
--     caller (I-A8).
--
--   match_tenant_by_paths — SECURITY INVOKER, granted to authenticated.
--     Tenant chunks are decided by tc_read_v2 + tc_wall_override, so this one
--     runs as the caller and touches NO embedding column. It is therefore a
--     RANKED FULL-TEXT search, not a vector search. Making it a vector search
--     would require SECURITY DEFINER and a hand-copied transcription of
--     tc_read_v2's three branches plus the RESTRICTIVE wall term — a copy that
--     can drift from the policy it mirrors, which is exactly the failure
--     definer-lint's INVOKER_ONLY_RPCS list exists to prevent. Recall is worse
--     than ANN would give; the alternative is a second, weaker copy of the
--     ethical wall, and that trade is not close.
--
-- Neither function takes a threshold, a count, an org, or a visibility
-- parameter (I-A8). p_vault_paths only ever NARROWS, and the supervisor has
-- already proved every element of it is a member of the caller's closed set.
-- =============================================================================

BEGIN;


-- ---------------------------------------------------------------------------
-- 1 — match_authority_by_paths()
--
-- SECURITY INVOKER and service_role-only. INVOKER is not decorative here: if
-- the grant is ever widened to `authenticated` by mistake, the function starts
-- enforcing ac_read_v2 and failing on the embedding read rather than silently
-- serving the whole public corpus to a session that RLS would have narrowed.
--
-- Path matching is SUBTREE containment (<@), not equality. A scope path is a
-- branch ('ROOT.Law.US.NY'); chunks are filed at leaves under it
-- ('ROOT.Law.US.NY.CPLR.3212'). Equality would match neither the branch nor the
-- leaf in practice and would make every retrieval return zero rows.
--
-- <=> is cosine DISTANCE; similarity = 1 - distance. Written as
-- OPERATOR(public.<=>) because operator lookup does not fall back to pg_catalog
-- under SET search_path = '' — see the 1072 header.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.match_authority_by_paths(
  p_vault_paths     ltree[],
  p_query_embedding vector(1536),
  p_as_of           date DEFAULT current_date
)
RETURNS TABLE (
  chunk_id       uuid,
  path           ltree,
  document_title text,
  content        text,
  authority_cls  public.authority_class,
  effective_from date,
  similarity     double precision
)
LANGUAGE sql STABLE SECURITY INVOKER   -- AF-12 / I-H14: never DEFINER
SET search_path = ''
AS $$
  SELECT
    r.id,
    r.path,
    r.document_title,
    r.content,
    r.authority_cls,
    r.effective_from,
    1 - (r.embedding OPERATOR(public.<=>) p_query_embedding) AS similarity
  FROM public.authority_corpus r
  WHERE
    -- SCOPE — the closed set, already validated caller-side (I-H15 / I-H16)
    EXISTS (
      SELECT 1 FROM unnest(p_vault_paths) sp(p)
      WHERE r.path OPERATOR(public.<@) sp.p
    )
    -- TIER — pinned, never a parameter (I-A8). BYPASSRLS means ac_read_v2's
    -- vault_visible_to() term does not run, so the tier is re-asserted here.
    AND r.visibility = 'public'::public.vault_visibility
    -- I-H1 / I-H2 — a chunk filed at an unregistered or retired node is not
    -- readable at all. Carried over from ac_read_v2 for the same reason.
    AND r.path IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.vault_nodes n
      WHERE n.path       OPERATOR(public.=) r.path
        AND n.kind       <> 'structural'
        AND n.retired_at IS NULL
    )
    -- CURRENCY (I-A13 / I-H5)
    AND (r.effective_from IS NULL OR r.effective_from <= p_as_of)
    AND (r.effective_to   IS NULL OR r.effective_to   >= p_as_of)
    AND r.superseded_by IS NULL
    AND r.reverify_due  > now()
    -- I-H7 — an unadopted model standard is a draft, not law
    AND (
      r.authority_cls <> 'model_standard'
      OR EXISTS (
        SELECT 1 FROM unnest(p_vault_paths) sp(p)
        WHERE public.standard_adopted(r.path, sp.p, p_as_of)
      )
    )
    -- SERVER-FIXED similarity bar (I-A8); the grounding bar is applied at the gate
    AND (1 - (r.embedding OPERATOR(public.<=>) p_query_embedding)) >= 0.72
  ORDER BY r.embedding OPERATOR(public.<=>) p_query_embedding
  LIMIT 24;  -- candidate set, NOT the answer set
$$;


-- ---------------------------------------------------------------------------
-- 2 — match_tenant_by_paths()
--
-- SECURITY INVOKER, and it stays that way. Every authorization decision here
-- belongs to tc_read_v2 (three branches) and tc_wall_override (RESTRICTIVE),
-- which run because RLS applies to the caller. Nothing in this body re-states
-- them; a second copy of a wall is a wall that can drift.
--
-- Full-text, not vector: see the header.
--
-- p_query is the planner's NATURAL-LANGUAGE task query, and that decides the
-- parser. websearch_to_tsquery() and plainto_tsquery() both AND every lexeme,
-- so "change order approval threshold" matches only a chunk carrying all four
-- words — measured: zero rows against a chunk that plainly answers the
-- question. The tsquery is therefore rebuilt with OR semantics and the ordering
-- left to ts_rank(), which already rewards a chunk matching more of the terms.
-- Recall belongs to the query; precision belongs to the Output Gate.
--
-- Rewriting through plainto_tsquery()::text is safe: its output is already
-- normalised lexemes and operators, so no fragment of p_query survives as
-- syntax. The regconfig is schema-qualified because SET search_path = ''
-- would otherwise leave 'english' unresolvable.
--
-- I-H12 — a topic reference brings a chunk into the answer without filing it
-- into the shared subtree, so topic_paths are matched as well as path. This
-- grants nothing: tc_read_v2 still decides whether the row is readable at all.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.match_tenant_by_paths(
  p_vault_paths ltree[],
  p_query       text
)
RETURNS TABLE (
  chunk_id       uuid,
  path           ltree,
  document_title text,
  content        text,
  authority_cls  public.authority_class,
  created_at     timestamptz,
  rank           double precision
)
LANGUAGE sql STABLE SECURITY INVOKER   -- AF-12 / I-H14: never DEFINER
SET search_path = ''
AS $$
  WITH q AS (
    -- AND -> OR. NULL when the query carries no lexemes at all (empty string,
    -- or nothing but stop words), which returns no rows rather than the whole
    -- subtree.
    SELECT NULLIF(
             replace(plainto_tsquery('pg_catalog.english', p_query)::text, '&', '|'),
             ''
           )::tsquery AS tsq
  )
  SELECT
    t.id,
    t.path,
    t.document_title,
    t.content,
    t.authority_cls,
    t.created_at,
    ts_rank(to_tsvector('pg_catalog.english', t.content), q.tsq)::double precision AS rank
  FROM public.tenant_corpus t, q
  WHERE q.tsq IS NOT NULL
    AND (
      EXISTS (
        SELECT 1 FROM unnest(p_vault_paths) sp(p)
        WHERE t.path OPERATOR(public.<@) sp.p
      )
      -- I-H12
      OR EXISTS (
        SELECT 1 FROM unnest(t.topic_paths) tp(p), unnest(p_vault_paths) sp(q2)
        WHERE tp.p OPERATOR(public.<@) sp.q2
      )
    )
    -- quarantined => unretrievable, restated because it is a retrieval
    -- property rather than a visibility one
    AND t.screen_state = 'clear'
    AND to_tsvector('pg_catalog.english', t.content) @@ q.tsq
  ORDER BY rank DESC
  LIMIT 12;
$$;


-- ---------------------------------------------------------------------------
-- 3 — Grants
--
-- CREATE FUNCTION grants EXECUTE to PUBLIC by default, so each REVOKE below is
-- load-bearing, not defensive decoration.
-- ---------------------------------------------------------------------------

-- Service-role only. `authenticated` must NOT hold this: the function serves
-- the public tier without consulting vault_visible_to(), which is safe only
-- because the connection that may call it is unreachable from a browser.
REVOKE EXECUTE ON FUNCTION public.match_authority_by_paths(ltree[], vector, date)
  FROM public, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.match_authority_by_paths(ltree[], vector, date)
  TO service_role;

-- Session-scoped. RLS decides what comes back, so a broad grant is correct.
REVOKE EXECUTE ON FUNCTION public.match_tenant_by_paths(ltree[], text)
  FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.match_tenant_by_paths(ltree[], text)
  TO authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 4 — Supporting index for the tenant full-text path
--
-- Without this the ranked search is a sequential scan over every tenant chunk
-- the path filter admits. CONCURRENTLY is not usable inside a transaction
-- block, and this migration is one; the corpus is small enough at this stage
-- that the exclusive lock is measured in milliseconds.
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS tc_content_fts
  ON public.tenant_corpus
  USING gin (to_tsvector('pg_catalog.english', content));


-- ---------------------------------------------------------------------------
-- 5 — Validation
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
    WHERE p.proname IN ('match_authority_by_paths', 'match_tenant_by_paths')
      AND ns.nspname = 'public'
      AND p.prosecdef
  ) THEN
    RAISE EXCEPTION
      'AF-12 VIOLATION: worker retrieval RPCs must be SECURITY INVOKER, not DEFINER';
  END IF;

  IF has_function_privilege(
       'authenticated',
       'public.match_authority_by_paths(ltree[], vector, date)',
       'EXECUTE') THEN
    RAISE EXCEPTION
      'I-A8 VIOLATION: match_authority_by_paths must not be executable by authenticated';
  END IF;
END;
$$;

COMMIT;
