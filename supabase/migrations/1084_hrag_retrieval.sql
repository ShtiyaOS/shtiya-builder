-- =============================================================================
-- 1084_hrag_retrieval.sql
-- Shtiya Builder v3.0 — HRAG Vault Network Part V:
-- the *_for(p_user, …) party primitives, subject_party_for()/subject_party(),
-- jurisdiction_of_subject(), scope_templates, resolve_scope_set(),
-- match_hrag_chunks().
--
-- I-H14: match_hrag_chunks() is SECURITY INVOKER. RLS applies inside it. The
--        route passes only paths returned by resolve_scope_set(), and the
--        function re-derives that set itself, so a direct call with an
--        arbitrary path returns zero rows rather than another subtree.
-- I-H15: resolve_scope_set() returns a CLOSED, server-computed set. The planner
--        SELECTS FROM the set; it can never add to it.
-- HV-30: jurisdiction comes from the SUBJECT ROW, never from the NL query.
--
-- SCHEMA CORRECTIONS vs the task spec (each verified against the live schema):
--
--   - properties has no jurisdiction_id column. Both the Plan (§0084) and the
--     HRAG blueprint (IV.5) read one, and six of the nine subject kinds resolve
--     their jurisdiction through a property. §1 adds it, nullable, FK to
--     jurisdictions(id). Without the column jurisdiction_of_subject() returns
--     NULL for those six kinds, every jurisdiction-specific scope_template
--     stops matching, and HV-30 degrades from "the subject decides" to "nothing
--     decides" — safe, because it fails closed, but inert.
--
--   - The spec's subject_party_for(p_user, …) calls the SESSION-scoped
--     primitives (is_deal_member(p_id) and friends), which read
--     current_app_user_id() internally and ignore p_user entirely. That makes
--     the p_user argument decorative: revoke_disclosure() asks "is THIS session
--     user a party?" for every row it scans. §2 adds the explicit-subject
--     *_for variants the blueprint calls for (I-L14 / LW-37) — under
--     service_role current_app_user_id() is NULL, so a predicate that reads it
--     there asserts nothing at all.
--
--   - has_property_capacity(p_id, NULL) is not "any capacity" — the live
--     function compares capacity = p_capacity, and = NULL is never true, so the
--     spec's property branch denies every property subject. In
--     has_property_capacity_for() a NULL capacity means ANY capacity, which is
--     what the call site intends.
--
--   - tenancies has tenant_id/manager_id/property_id, not tenant_user_ids and
--     not engagement_id, so the tenancy branch reads the scalar columns and the
--     jurisdiction join goes straight to properties.
--
--   - agency_representations has agent_id/client_id/property_id, not
--     principal_user_id/listing_property_id.
--
--   - design_packages.property_id, not project_id. deals.property_id and
--     work_packages.property_id are direct FKs — there is no projects table.
--
--   - matters stores jurisdiction (text) and jurisdiction_county. There is no
--     venue column.
--
--   - is_matter_party_for is 2-param (uuid, uuid) here, not the 4-param form
--     the Plan shows.
--
--   - resolve_scope_set()'s spec body puts ORDER BY on the first arm of a
--     UNION ALL, which is a syntax error — an ORDER BY there binds to the whole
--     set operation. Each arm is parenthesised instead, which is what lets the
--     template arm keep its ordinal ordering.
--
--   - ltree operators and functions are schema-qualified throughout; see the
--     1080 header for why SET search_path = '' requires it.
--
-- KNOWN LIMITATION — match_hrag_chunks() cannot be executed by `authenticated`
--   as the platform stands, and neither can match_authority_chunks() from
--   1072. I-H14 requires SECURITY INVOKER, so the body runs with the caller's
--   privileges; I-A10 revokes SELECT (embedding) from authenticated, and 1076
--   §4 asserts that revocation so it cannot be undone without failing the
--   migration chain. Reading r.embedding therefore raises "permission denied
--   for table authority_corpus" (measured, on 1072's function, before this
--   migration existed). service_role can read the column but holds BYPASSRLS
--   and has a NULL current_app_user_id(), so it takes SCOPE_DENIED from
--   resolve_scope_set() instead. Resolving this is a policy decision between
--   I-A10 and I-H14 that belongs with the Phase 3 route contracts, not a
--   correction this migration can make on its own.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1 — properties.jurisdiction_id (HV-30 needs a subject-side source)
-- ---------------------------------------------------------------------------

ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS jurisdiction_id text REFERENCES public.jurisdictions(id);

CREATE INDEX IF NOT EXISTS properties_jurisdiction ON public.properties (jurisdiction_id)
  WHERE jurisdiction_id IS NOT NULL;

-- properties is read column-by-column by no one: authenticated holds a
-- table-level grant on it, so the new column needs no separate grant.


-- ---------------------------------------------------------------------------
-- 2 — Explicit-subject party primitives (I-L14 / LW-37)
--
-- Each mirrors its session-scoped sibling exactly, with the user supplied
-- rather than read from the session.
-- ---------------------------------------------------------------------------

-- NULL p_capacity means ANY capacity held on the property.
CREATE OR REPLACE FUNCTION public.has_property_capacity_for(
  p_user uuid, p_property_id uuid, p_capacity text
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.property_role_bindings b
    WHERE b.user_id     = p_user
      AND b.property_id = p_property_id
      AND (p_capacity IS NULL OR b.capacity = p_capacity)
  );
$$;

CREATE OR REPLACE FUNCTION public.is_deal_member_for(p_user uuid, p_deal_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.deal_memberships m
    WHERE m.deal_id = p_deal_id AND m.user_id = p_user
  );
$$;

CREATE OR REPLACE FUNCTION public.is_facility_party_for(p_user uuid, p_facility_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.facility_parties f
    WHERE f.facility_id = p_facility_id AND f.user_id = p_user
  );
$$;

CREATE OR REPLACE FUNCTION public.is_work_package_party_for(p_user uuid, p_work_package_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.wp_parties w
    WHERE w.work_package_id = p_work_package_id AND w.user_id = p_user
  );
$$;

CREATE OR REPLACE FUNCTION public.is_design_package_party_for(p_user uuid, p_design_package_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.dp_parties d
    WHERE d.design_package_id = p_design_package_id AND d.user_id = p_user
  );
$$;

-- A tenancy has two sides and both are parties to it.
CREATE OR REPLACE FUNCTION public.is_tenancy_party_for(p_user uuid, p_tenancy_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenancies t
    WHERE t.id = p_tenancy_id
      AND (t.tenant_id = p_user OR t.manager_id = p_user)
  );
$$;

-- An agency representation is the agent, the client, and the brokerage's
-- ACTIVE seats. An inactive seat is a person who used to work there.
CREATE OR REPLACE FUNCTION public.is_representation_party_for(p_user uuid, p_representation_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.agency_representations ar
    WHERE ar.id = p_representation_id
      AND (
        ar.agent_id  = p_user
        OR ar.client_id = p_user
        OR EXISTS (
          SELECT 1 FROM public.broker_seats bs
          WHERE bs.brokerage_id = ar.brokerage_id
            AND bs.user_id      = p_user
            AND bs.active
        )
      )
  );
$$;


-- ---------------------------------------------------------------------------
-- 3 — subject_party_for() / subject_party() — the universal dispatcher (§I.4)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.subject_party_for(
  p_user uuid,
  p_kind public.subject_kind,
  p_id   uuid
) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_user IS NULL OR p_id IS NULL THEN
    RETURN false;
  END IF;

  RETURN CASE p_kind
    WHEN 'property'       THEN public.has_property_capacity_for(p_user, p_id, NULL)
    WHEN 'deal'           THEN public.is_deal_member_for(p_user, p_id)
    WHEN 'facility'       THEN public.is_facility_party_for(p_user, p_id)
    WHEN 'matter'         THEN public.is_matter_party_for(p_user, p_id)
    WHEN 'work_package'   THEN public.is_work_package_party_for(p_user, p_id)
    WHEN 'design_package' THEN public.is_design_package_party_for(p_user, p_id)
    WHEN 'tenancy'        THEN public.is_tenancy_party_for(p_user, p_id)
    WHEN 'representation' THEN public.is_representation_party_for(p_user, p_id)
    WHEN 'org'            THEN public.is_org_member_for(p_user, p_id)
    ELSE false
  END;
END;
$$;

-- Note the arity: public.subject_party() with NO arguments already exists (it
-- returns the acting user id, from the Legal Workspace). This is an overload,
-- not a replacement.
CREATE OR REPLACE FUNCTION public.subject_party(p_kind public.subject_kind, p_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT public.subject_party_for(public.current_app_user_id(), p_kind, p_id);
$$;


-- ---------------------------------------------------------------------------
-- 4 — jurisdiction_of_subject() (HV-30)
--
-- The jurisdiction is read off the subject ROW — a property's record, a
-- matter's venue — and never off the natural-language query. A query that says
-- "under California law" changes nothing here, which is the point.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.jurisdiction_of_subject(
  p_kind public.subject_kind,
  p_id   uuid
) RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE j text;
BEGIN
  CASE p_kind
    WHEN 'property' THEN
      SELECT p.jurisdiction_id INTO j
      FROM public.properties p WHERE p.id = p_id;

    WHEN 'tenancy' THEN
      SELECT p.jurisdiction_id INTO j
      FROM public.tenancies t
      JOIN public.properties p ON p.id = t.property_id
      WHERE t.id = p_id;

    WHEN 'work_package' THEN
      SELECT p.jurisdiction_id INTO j
      FROM public.work_packages w
      JOIN public.properties p ON p.id = w.property_id
      WHERE w.id = p_id;

    WHEN 'design_package' THEN
      SELECT p.jurisdiction_id INTO j
      FROM public.design_packages d
      JOIN public.properties p ON p.id = d.property_id
      WHERE d.id = p_id;

    WHEN 'facility' THEN
      SELECT p.jurisdiction_id INTO j
      FROM public.facilities f
      JOIN public.properties p ON p.id = f.property_id
      WHERE f.id = p_id;

    WHEN 'deal' THEN
      SELECT p.jurisdiction_id INTO j
      FROM public.deals dl
      JOIN public.properties p ON p.id = dl.property_id
      WHERE dl.id = p_id;

    WHEN 'matter' THEN
      SELECT m.jurisdiction INTO j
      FROM public.matters m WHERE m.id = p_id;

    WHEN 'representation' THEN
      SELECT p.jurisdiction_id INTO j
      FROM public.agency_representations ar
      JOIN public.properties p ON p.id = ar.property_id
      WHERE ar.id = p_id;

    ELSE
      j := NULL;   -- 'org' has no jurisdiction of its own
  END CASE;

  RETURN j;
END;
$$;


-- ---------------------------------------------------------------------------
-- 5 — scope_templates (governed data — §II.7)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS scope_templates (
  id              uuid                PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_kind    public.subject_kind NOT NULL,
  jurisdiction_id text                REFERENCES public.jurisdictions(id),
  ordinal         int                 NOT NULL,
  scope_path      ltree               NOT NULL REFERENCES public.vault_nodes(path),
  mode            text                NOT NULL CHECK (mode IN ('lineage','subtree','node')),
  depth_cap       int                 NOT NULL DEFAULT 4,
  mandatory       boolean             NOT NULL DEFAULT false,   -- feeds coverage assertions
  reviewed_by     text                NOT NULL,
  UNIQUE (subject_kind, jurisdiction_id, ordinal)
);

ALTER TABLE scope_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "st_read"                 ON scope_templates;
DROP POLICY IF EXISTS "st_no_interactive_write" ON scope_templates;

CREATE POLICY "st_read" ON scope_templates FOR SELECT
  USING (public.current_app_user_id() IS NOT NULL);

CREATE POLICY "st_no_interactive_write" ON scope_templates FOR INSERT
  WITH CHECK (false);


-- ---------------------------------------------------------------------------
-- 6 — resolve_scope_set() (I-H15)
--
-- The closed set. Everything the planner may search, computed from rows, plus
-- the caller's own org subtree, which is always in scope in lineage mode.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.resolve_scope_set(
  p_kind  public.subject_kind,
  p_id    uuid,
  p_as_of date DEFAULT current_date
) RETURNS TABLE (scope_path ltree, mode text, depth_cap int, mandatory boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE j text;
BEGIN
  IF NOT public.subject_party(p_kind, p_id) THEN
    RAISE EXCEPTION 'SCOPE_DENIED' USING ERRCODE = '42501';
  END IF;

  j := public.jurisdiction_of_subject(p_kind, p_id);

  RETURN QUERY
    ( SELECT t.scope_path, t.mode, t.depth_cap, t.mandatory
        FROM public.scope_templates t
       WHERE t.subject_kind = p_kind
         AND (t.jurisdiction_id IS NULL OR t.jurisdiction_id = j)
       ORDER BY t.ordinal )
    UNION ALL
    ( SELECT public.org_root(fm.firm_id), 'lineage'::text, 8, false
        FROM public.firm_members fm
       WHERE fm.user_id = public.current_app_user_id() );
END;
$$;


-- ---------------------------------------------------------------------------
-- 7 — match_hrag_chunks() (I-H14)
--
-- SECURITY INVOKER, deliberately — see the KNOWN LIMITATION in the header.
-- It accepts a scope path the caller CANNOT WIDEN: the scope CTE re-derives
-- resolve_scope_set() inside the function and keeps only the row that matches
-- the requested path and mode, so a path outside the caller's set produces an
-- empty scope and the whole query returns nothing. Not an error, not a partial
-- answer, not a nearest match — repairing an out-of-set path is how steering
-- succeeds (HV-30).
--
-- Authority and tenant chunks are kept in separate CTEs and carry corpus and
-- authority_cls out with them: a sentence resting on an enacted statute and a
-- sentence resting on a firm's own playbook note must never be indistinguish-
-- able to the citation UI or the entailment checker (I-A4).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.match_hrag_chunks(
  p_subject_kind    public.subject_kind,
  p_subject_id      uuid,
  p_scope_path      ltree,
  p_mode            text,
  p_query_embedding vector(1536),
  p_as_of           date DEFAULT current_date
) RETURNS TABLE (
  chunk_id       uuid,
  corpus         public.corpus_trust,
  path           ltree,
  document_title text,
  content        text,
  authority_cls  public.authority_class,
  authority_rank int,
  effective_from date,
  source_url     text,
  publisher      text,
  similarity     double precision
)
LANGUAGE sql STABLE SECURITY INVOKER   -- I-H14: never DEFINER
SET search_path = ''
AS $$
  WITH scope AS (
    SELECT s.scope_path, s.mode, s.depth_cap
    FROM public.resolve_scope_set(p_subject_kind, p_subject_id, p_as_of) s
    WHERE s.scope_path OPERATOR(public.=) p_scope_path
      AND s.mode = p_mode
  ),
  floors AS (
    SELECT n.inheritance_floor
    FROM public.vault_nodes n
    WHERE n.path OPERATOR(public.=) p_scope_path
  ),
  authority (
    chunk_id, corpus, path, document_title, content,
    authority_cls, authority_rank, effective_from, source_url, publisher, similarity
  ) AS (
    SELECT
      r.id,
      'authority'::public.corpus_trust,
      r.path,
      r.document_title,
      r.content,
      r.authority_cls,
      public.authority_rank(r.authority_cls),
      r.effective_from,
      r.source_url,
      r.publisher,
      1 - (r.embedding OPERATOR(public.<=>) p_query_embedding)
    FROM public.authority_corpus r, scope s, floors f
    WHERE
      CASE s.mode
        WHEN 'lineage' THEN r.path OPERATOR(public.@>) s.scope_path
                        AND public.nlevel(r.path) >= f.inheritance_floor
        WHEN 'subtree' THEN r.path OPERATOR(public.<@) s.scope_path
                        AND public.nlevel(r.path) <= public.nlevel(s.scope_path) + s.depth_cap
        WHEN 'node'    THEN r.path OPERATOR(public.=) s.scope_path
      END
      -- AUTHORIZATION — pre-filter, before ANN (I-A9)
      AND public.vault_visible_to(
            public.current_app_user_id(), r.visibility, r.jurisdiction_id, r.domain)
      -- CURRENCY (I-A13 / I-H5)
      AND (r.effective_from IS NULL OR r.effective_from <= p_as_of)
      AND (r.effective_to   IS NULL OR r.effective_to   >= p_as_of)
      AND r.superseded_by IS NULL
      AND r.reverify_due  > now()
      -- I-H7: an unadopted model standard is a draft, not law
      AND (
        r.authority_cls <> 'model_standard'
        OR public.standard_adopted(r.path, s.scope_path, p_as_of)
      )
      AND (1 - (r.embedding OPERATOR(public.<=>) p_query_embedding)) >= 0.72  -- I-A8
  ),
  tenant (
    chunk_id, corpus, path, document_title, content,
    authority_cls, authority_rank, effective_from, source_url, publisher, similarity
  ) AS (
    SELECT
      t.id,
      'tenant'::public.corpus_trust,
      t.path,
      t.document_title,
      t.content,
      t.authority_cls,
      public.authority_rank(t.authority_cls),
      NULL::date,
      NULL::text,
      NULL::text,
      1 - (t.embedding OPERATOR(public.<=>) p_query_embedding)
    FROM public.tenant_corpus t, scope s
    WHERE (
        CASE s.mode
          WHEN 'lineage' THEN t.path OPERATOR(public.@>) s.scope_path
          WHEN 'subtree' THEN t.path OPERATOR(public.<@) s.scope_path
          WHEN 'node'    THEN t.path OPERATOR(public.=) s.scope_path
        END
        -- I-H12: a topic reference brings the chunk into the answer without
        -- filing it into the shared subtree.
        OR EXISTS (
          SELECT 1 FROM unnest(t.topic_paths) tp(p)
          WHERE tp.p OPERATOR(public.<@) s.scope_path
        )
      )
      AND t.screen_state = 'clear'
      AND (1 - (t.embedding OPERATOR(public.<=>) p_query_embedding)) >= 0.72
  )
  SELECT m.chunk_id, m.corpus, m.path, m.document_title, m.content,
         m.authority_cls, m.authority_rank, m.effective_from,
         m.source_url, m.publisher, m.similarity
  FROM (
    SELECT * FROM authority
    UNION ALL
    SELECT * FROM tenant
  ) m
  ORDER BY m.similarity DESC
  LIMIT 24;
$$;


-- ---------------------------------------------------------------------------
-- 8 — Grants
-- ---------------------------------------------------------------------------

REVOKE ALL ON public.scope_templates FROM public, anon;
GRANT SELECT ON public.scope_templates TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.has_property_capacity_for(uuid, uuid, text)      FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.is_deal_member_for(uuid, uuid)                   FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.is_facility_party_for(uuid, uuid)                FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.is_work_package_party_for(uuid, uuid)            FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.is_design_package_party_for(uuid, uuid)          FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.is_tenancy_party_for(uuid, uuid)                 FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.is_representation_party_for(uuid, uuid)          FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.subject_party_for(uuid, public.subject_kind, uuid) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.subject_party(public.subject_kind, uuid)         FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.jurisdiction_of_subject(public.subject_kind, uuid) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.resolve_scope_set(public.subject_kind, uuid, date) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.match_hrag_chunks(
  public.subject_kind, uuid, ltree, text, vector, date)                            FROM public, anon;

GRANT EXECUTE ON FUNCTION public.has_property_capacity_for(uuid, uuid, text)       TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_deal_member_for(uuid, uuid)                    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_facility_party_for(uuid, uuid)                 TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_work_package_party_for(uuid, uuid)             TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_design_package_party_for(uuid, uuid)           TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_tenancy_party_for(uuid, uuid)                  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_representation_party_for(uuid, uuid)           TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.subject_party_for(uuid, public.subject_kind, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.subject_party(public.subject_kind, uuid)          TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.jurisdiction_of_subject(public.subject_kind, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resolve_scope_set(public.subject_kind, uuid, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.match_hrag_chunks(
  public.subject_kind, uuid, ltree, text, vector, date)                            TO authenticated, service_role;

COMMIT;
