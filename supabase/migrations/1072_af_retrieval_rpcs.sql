-- =============================================================================
-- 1072_af_retrieval_rpcs.sql
-- Shtiya Builder v3.0 — Agent Factory retrieval RPCs.
--
-- Two separate SECURITY INVOKER functions, one per corpus. There is no query
-- that ranks authority and tenant chunks into a single undivided result set
-- (I-A4); the route merges them with trust_class in the envelope so the model,
-- the citation UI, and the entailment checker all know whether a sentence
-- rests on an enacted statute or on a firm's own playbook note.
--
-- Neither function takes an org, visibility, threshold, or count parameter.
-- Authorization is derived from the session; thresholds and counts are server
-- constants (I-A8). Caller-supplied values there are corpus-enumeration
-- primitives.
--
-- Builds on 1070 (authority_corpus, tenant_corpus, custom_agents,
-- vault_visible_to, is_org_member_for).
-- =============================================================================


-- ---------------------------------------------------------------------------
-- Section 1 — match_authority_chunks()
--
-- SECURITY INVOKER, deliberately.
-- A SECURITY DEFINER vector-search function runs as its owner — RLS does not
-- apply — and at that point every filter is just a parameter the caller
-- supplies. match_vault_documents(embedding, domain, state, county, threshold,
-- count) is NOT created: every parameter after the first is caller-controlled,
-- and four of them are authorization-relevant.
--
-- <=> returns cosine DISTANCE; similarity = 1 - distance. It is written as
-- OPERATOR(public.<=>) because operator lookup does not fall back to
-- pg_catalog under SET search_path = '' — the bare form fails with
-- "operator does not exist: public.vector <=> public.vector". The qualified
-- form still resolves to the same operator, so the HNSW index is used
-- (verified: Index Scan using ac_vec_public).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.match_authority_chunks(
  p_agent_id        uuid,
  p_query_embedding vector(1536)
)
RETURNS TABLE (
  chunk_id        uuid,
  document_title  text,
  content         text,
  jurisdiction_id text,
  visibility      vault_visibility,
  effective_from  date,
  source_url      text,
  publisher       text,
  similarity      double precision
)
LANGUAGE sql STABLE SECURITY INVOKER  -- AF-12: never DEFINER
SET search_path = ''
AS $$
  WITH a AS (
    -- RLS on custom_agents applies (INVOKER), so an agent_id from another org
    -- returns zero rows rather than another org's filters. Closes the IDOR.
    SELECT * FROM public.custom_agents c
    WHERE c.id = p_agent_id AND c.is_active
  )
  SELECT
    r.id, r.document_title, r.content, r.jurisdiction_id, r.visibility,
    r.effective_from, r.source_url, r.publisher,
    1 - (r.embedding OPERATOR(public.<=>) p_query_embedding) AS similarity
  FROM public.authority_corpus r, a
  WHERE
    -- AUTHORIZATION — pre-filter, runs before ANN (I-A9)
    public.vault_visible_to(
      public.current_app_user_id(), r.visibility, r.jurisdiction_id, r.domain)
    -- CURRENCY (I-A13): stale, superseded, or reverify-overdue chunks never ground answers
    AND r.effective_from <= current_date
    AND (r.effective_to IS NULL OR r.effective_to >= current_date)
    AND r.superseded_by IS NULL
    AND r.reverify_due  > now()
    -- RELEVANCE — typed agent filters, narrowing only (I-A7)
    AND r.domain          = a.filter_domain
    AND r.sub_domain      = a.filter_sub_domain
    AND r.jurisdiction_id = a.filter_jurisdiction_id
    -- SERVER-FIXED similarity bar (I-A8) — grounding bar applied at route, not here
    AND (1 - (r.embedding OPERATOR(public.<=>) p_query_embedding)) >= 0.72
  ORDER BY r.embedding OPERATOR(public.<=>) p_query_embedding
  LIMIT 24;  -- candidate set for reranker; NOT the answer set
$$;


-- ---------------------------------------------------------------------------
-- Section 2 — match_tenant_chunks()
--
-- Separate function, separate table, separate index (I-A4).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.match_tenant_chunks(
  p_agent_id        uuid,
  p_query_embedding vector(1536)
)
RETURNS TABLE (
  chunk_id       uuid,
  document_title text,
  content        text,
  source_kind    text,
  similarity     double precision
)
LANGUAGE sql STABLE SECURITY INVOKER  -- AF-12: never DEFINER
SET search_path = ''
AS $$
  WITH a AS (
    SELECT * FROM public.custom_agents c
    WHERE c.id = p_agent_id AND c.is_active AND c.include_tenant_corpus
  )
  SELECT
    t.id, t.document_title, t.content, t.source_kind,
    1 - (t.embedding OPERATOR(public.<=>) p_query_embedding) AS similarity
  FROM public.tenant_corpus t, a
  WHERE t.owner_org_id = a.org_id                         -- I-A5: org and only org
    AND public.is_org_member_for(
          public.current_app_user_id(), t.owner_org_id)   -- invoker is org member
    AND t.screen_state = 'clear'                          -- quarantined => unretrievable
    AND t.domain       = a.filter_domain                  -- I-A7: narrowing filter only
    AND (1 - (t.embedding OPERATOR(public.<=>) p_query_embedding)) >= 0.72 -- I-A8: server-fixed bar
  ORDER BY t.embedding OPERATOR(public.<=>) p_query_embedding
  LIMIT 12;
$$;


-- ---------------------------------------------------------------------------
-- Section 3 — Grants
-- ---------------------------------------------------------------------------

-- INVOKER functions: the caller's RLS applies, so these are safe to grant broadly.
-- No public/anon access — authenticated sessions only.
REVOKE EXECUTE ON FUNCTION public.match_authority_chunks(uuid, vector) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.match_tenant_chunks(uuid, vector)    FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.match_authority_chunks(uuid, vector) TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.match_tenant_chunks(uuid, vector)    TO authenticated, service_role;
