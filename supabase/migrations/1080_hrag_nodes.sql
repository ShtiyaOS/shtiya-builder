-- =============================================================================
-- 1080_hrag_nodes.sql
-- Shtiya Builder v3.0 — HRAG Vault Network Part I:
-- node_kind / authority_class / authority_relation / subject_kind ENUMs,
-- vault_nodes registry, authority_relations DAG,
-- normalize_label(), org_root(), guard_vault_node(),
-- standard_adopted(), authority_rank().
--
-- Depends on: 10700 (jurisdictions, vault_domains, unaccent), 1076 (applied).
--
-- I-H1:  every corpus path must be registered in vault_nodes before use.
-- I-H2:  structural nodes at depth < 3 are broadcast nodes; no content filed there.
-- I-H4:  nlevel() carries no cross-subtree meaning; depth is read from node_kind.
-- I-H7:  model standards are groundable only if an 'adopts' edge exists.
-- I-H8:  precedence is COMPUTED by authority_rank(), never inferred by the model.
-- I-H11: org nodes must name their owning org; shared nodes must not.
--
-- SCHEMA CORRECTIONS vs the task spec (each verified against the live schema):
--
--   - subject_kind is created HERE, not in 1082. tenant_corpus.subject_kind is
--     added in 1081 and the 10850 RLS policy passes that column straight into
--     subject_party(). Typing the column `text` and casting it in the policy
--     makes every malformed row an evaluation-time cast error inside an RLS
--     predicate — a read failure, not a filtered row. Declaring the enum before
--     its first column use removes the cast and the failure mode with it.
--
--   - ltree is not installed in this database (only unaccent and vector are).
--     It is installed here WITH SCHEMA public, matching where 10700 put
--     unaccent. Every function below runs under SET search_path = '', where
--     operator and function lookup does NOT fall back through public, so ltree
--     calls are written public.nlevel()/public.subpath() and ltree operators
--     as OPERATOR(public.<@) / OPERATOR(public.@>) — the same qualification
--     1072 already applies to OPERATOR(public.<=>) for pgvector. This
--     includes plain EQUALITY: ltree = ltree is extension-provided too, and
--     an unqualified `=` between two ltrees fails with "operator does not
--     exist: public.ltree = public.ltree" (measured, on the seed INSERT).
--     Type casts are qualified for the same reason: '...'::public.ltree.
--
--   - guard_vault_node() cannot use subpath(NEW.path, 0, 2) to test for the
--     ROOT.Org subtree. subpath() raises "invalid positions" whenever the path
--     is shorter than the requested slice, so the spec form errors on the
--     depth-1 'ROOT' seed row before any check runs. The containment operator
--     is total over every depth and is used instead.
--
--   - The same test must not fire on 'ROOT.Org' itself. That row is the
--     structural anchor of the org subtree, is depth 2, and legitimately has no
--     owner_org_id; the spec form would reject it and the seed block would
--     fail. I-H11 is therefore scoped to nodes STRICTLY BELOW ROOT.Org.
-- =============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS ltree    WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA public;  -- already in 10700; idempotent


-- ---------------------------------------------------------------------------
-- 1 — ENUMs (DO-guarded for idempotency)
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'node_kind') THEN
    CREATE TYPE public.node_kind AS ENUM (
      'structural',           -- ROOT, ROOT.Law, etc. — NO content filed here (I-H2)
      'sovereign',
      'jurisdiction',
      'agency',
      'court',
      'court_part',
      'instrument',
      'division',
      'edition',
      'classification',
      'org_root',
      'org_folder'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'authority_class') THEN
    CREATE TYPE public.authority_class AS ENUM (
      'enacted',                 -- rank 100
      'regulation',              -- rank  90
      'official_interpretation', -- rank  80
      'agency_guidance',         -- rank  50
      'contractual_overlay',     -- rank  40
      'model_standard',          -- rank  30
      'secondary',               -- rank  20
      'tenant_document'          -- rank  10
    );
  END IF;
END $$;

-- 'preempted_by' lives here and NOT in authority_class: preemption is an edge
-- between two instruments, not a rank a chunk carries. It is ADVISORY ONLY —
-- it never suppresses state text from a result set (I-H8). 1086 §2 asserts the
-- label has not migrated into authority_class.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'authority_relation') THEN
    CREATE TYPE public.authority_relation AS ENUM (
      'adopts',
      'amends',
      'supersedes',
      'binds',
      'persuasive_to',
      'implements',
      'incorporates_by_reference',
      'preempted_by'   -- ADVISORY ONLY — never suppresses state text
    );
  END IF;
END $$;

-- Declared here rather than in 1082 — see SCHEMA CORRECTIONS above.
-- The nine values are the nine ecosystem subject roots; subject_party_for()
-- in 1084 dispatches one party predicate per value.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'subject_kind') THEN
    CREATE TYPE public.subject_kind AS ENUM (
      'property', 'deal', 'facility', 'matter',
      'work_package', 'design_package', 'tenancy', 'representation', 'org'
    );
  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- 2 — vault_nodes (I-H1: canonical registry)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS vault_nodes (
  path                    ltree            PRIMARY KEY,
  label_display           text             NOT NULL,
  kind                    public.node_kind NOT NULL,
  default_authority_class public.authority_class,
  jurisdiction_id         text             REFERENCES public.jurisdictions(id),
  owner_org_id            uuid             REFERENCES public.firms(id),  -- non-null ONLY below ROOT.Org
  issuing_body            text,
  min_write_role          text             NOT NULL DEFAULT 'corpus_publisher'
                            CHECK (min_write_role IN ('corpus_publisher','org_member')),
  inheritance_floor       int              NOT NULL DEFAULT 3,
  reviewed_by             text,
  reviewed_at             timestamptz,
  retired_at              timestamptz,
  created_at              timestamptz      NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vault_nodes_gist ON vault_nodes USING gist (path);
CREATE INDEX IF NOT EXISTS vault_nodes_org  ON vault_nodes (owner_org_id)
  WHERE owner_org_id IS NOT NULL;


-- ---------------------------------------------------------------------------
-- 3 — authority_relations DAG
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS authority_relations (
  id             uuid                      PRIMARY KEY DEFAULT gen_random_uuid(),
  from_path      ltree                     NOT NULL REFERENCES public.vault_nodes(path),
  relation       public.authority_relation NOT NULL,
  to_path        ltree                     NOT NULL REFERENCES public.vault_nodes(path),
  effective_from date,
  effective_to   date,
  condition      text,
  basis          text                      NOT NULL,
  reviewed_by    text                      NOT NULL,
  reviewed_at    timestamptz               NOT NULL DEFAULT now(),
  UNIQUE (from_path, relation, to_path, effective_from)
);

CREATE INDEX IF NOT EXISTS ar_from ON authority_relations USING gist (from_path);
CREATE INDEX IF NOT EXISTS ar_to   ON authority_relations USING gist (to_path);


-- ---------------------------------------------------------------------------
-- 4 — Helper functions
-- ---------------------------------------------------------------------------

-- I-H3: THE ONLY producer of a path label. Centralised to prevent silent splits
-- — two spellings of one authority become two subtrees, and a query answered
-- from one of them is answered from half the corpus without saying so.
--
-- Declared IMMUTABLE because 1086 §3 requires it and because a label must hash
-- identically forever. unaccent() is only STABLE (its dictionary is a database
-- object), so the two-argument form is called with the dictionary pinned by
-- name: that is the documented way to make unaccent usable from an immutable
-- context, and it is what keeps this function safe to index on.
CREATE OR REPLACE FUNCTION public.normalize_label(p_display text)
RETURNS text LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT left(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          public.unaccent('public.unaccent'::regdictionary, p_display),
          '[^A-Za-z0-9]+', '_', 'g'),
        '_+', '_', 'g'),
      '^_|_$', '', 'g'),
    256);
$$;

-- Org root path from a firm uuid. Hyphens are stripped because an ltree label
-- admits only [A-Za-z0-9_]; the 'o_' prefix keeps the label from starting with
-- a digit, which reads as a malformed label to anyone scanning a path.
CREATE OR REPLACE FUNCTION public.org_root(p_org uuid)
RETURNS ltree LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT ('ROOT.Org.o_' || replace(p_org::text, '-', ''))::public.ltree;
$$;

-- I-H7: a model standard is groundable ONLY where a jurisdiction in scope has
-- an 'adopts' edge to it that is live on the as-of date. An unadopted model
-- code is a draft someone published, not law, and citing it as law is the
-- failure this predicate exists to prevent.
CREATE OR REPLACE FUNCTION public.standard_adopted(
  p_standard           ltree,
  p_jurisdiction_scope ltree,
  p_as_of              date
) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.authority_relations r
    WHERE r.relation  = 'adopts'
      AND r.to_path   OPERATOR(public.@>) p_standard
      AND r.from_path OPERATOR(public.<@) p_jurisdiction_scope
      AND (r.effective_from IS NULL OR r.effective_from <= p_as_of)
      AND (r.effective_to   IS NULL OR r.effective_to   >= p_as_of)
  );
$$;

-- I-H8: precedence is computed, never inferred by the model. A ranking the
-- model produces is a ranking the prompt can move.
CREATE OR REPLACE FUNCTION public.authority_rank(p_class public.authority_class)
RETURNS int LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT CASE p_class
    WHEN 'enacted'                  THEN 100
    WHEN 'regulation'               THEN  90
    WHEN 'official_interpretation'  THEN  80
    WHEN 'agency_guidance'          THEN  50
    WHEN 'contractual_overlay'      THEN  40
    WHEN 'model_standard'           THEN  30
    WHEN 'secondary'                THEN  20
    WHEN 'tenant_document'          THEN  10
    ELSE 0
  END;
$$;


-- ---------------------------------------------------------------------------
-- 5 — vault_nodes integrity guard (I-H1, I-H2, I-H11)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.guard_vault_node()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_depth     int;
  v_under_org boolean;
  v_parent    public.ltree;
BEGIN
  v_depth := public.nlevel(NEW.path);

  -- STRICTLY below ROOT.Org. 'ROOT.Org' itself is the structural anchor of the
  -- subtree and carries no owner — see the header note.
  v_under_org := v_depth > 2
             AND NEW.path OPERATOR(public.<@) 'ROOT.Org'::public.ltree;

  -- I-H2: a non-structural node above depth 3 is a broadcast node. Content
  -- filed there is returned to every query that touches the branch.
  IF NEW.kind <> 'structural' AND v_depth < 3 THEN
    RAISE EXCEPTION
      'I-H2: depth % is a broadcast node; content may not be filed here', v_depth
      USING ERRCODE = '42501';
  END IF;

  -- I-H11: org nodes must name their owning org; shared nodes must not.
  IF v_under_org AND NEW.owner_org_id IS NULL THEN
    RAISE EXCEPTION 'I-H11: a node under ROOT.Org must name its owning org'
      USING ERRCODE = '23514';
  END IF;
  IF NOT v_under_org AND NEW.owner_org_id IS NOT NULL THEN
    RAISE EXCEPTION 'I-H11: shared subtrees cannot be org-owned'
      USING ERRCODE = '23514';
  END IF;

  -- I-H1: the parent must already be registered (ROOT excepted). Without this
  -- a typo mid-path silently creates a second tree beside the real one.
  IF v_depth > 1 THEN
    v_parent := public.subpath(NEW.path, 0, v_depth - 1);
    IF NOT EXISTS (
      SELECT 1 FROM public.vault_nodes p WHERE p.path OPERATOR(public.=) v_parent
    ) THEN
      RAISE EXCEPTION 'I-H1: parent node % does not exist', v_parent
        USING ERRCODE = '23503';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS vault_nodes_guard ON vault_nodes;
CREATE TRIGGER vault_nodes_guard
  BEFORE INSERT OR UPDATE ON vault_nodes
  FOR EACH ROW EXECUTE FUNCTION public.guard_vault_node();


-- ---------------------------------------------------------------------------
-- 6 — Seed structural root nodes
--
-- Inserted before RLS is enabled below. These six are the only nodes this
-- migration creates: everything under them is editorial data registered by the
-- corpus_publisher pipeline, not schema.
-- ---------------------------------------------------------------------------

INSERT INTO vault_nodes (path, label_display, kind) VALUES
  ('ROOT',                'Root',           'structural'),
  ('ROOT.Law',            'Law',            'structural'),
  ('ROOT.Standards',      'Standards',      'structural'),
  ('ROOT.Investor',       'Investor',       'structural'),
  ('ROOT.Classification', 'Classification', 'structural'),
  ('ROOT.Org',            'Org',            'structural')
ON CONFLICT (path) DO NOTHING;


-- ---------------------------------------------------------------------------
-- 7 — RLS
-- ---------------------------------------------------------------------------

ALTER TABLE vault_nodes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE authority_relations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vn_read"                  ON vault_nodes;
DROP POLICY IF EXISTS "vn_no_interactive_write"  ON vault_nodes;
DROP POLICY IF EXISTS "vn_no_interactive_update" ON vault_nodes;

-- The shared skeleton is readable by everyone; an org's folders are readable
-- only by that org. The tree shape is itself information: a competitor able to
-- enumerate ROOT.Org learns the customer list.
CREATE POLICY "vn_read" ON vault_nodes FOR SELECT
  USING (
    owner_org_id IS NULL
    OR public.is_org_member_for(public.current_app_user_id(), owner_org_id)
  );

CREATE POLICY "vn_no_interactive_write"  ON vault_nodes FOR INSERT WITH CHECK (false);
CREATE POLICY "vn_no_interactive_update" ON vault_nodes FOR UPDATE USING (false);

DROP POLICY IF EXISTS "ar_read"                  ON authority_relations;
DROP POLICY IF EXISTS "ar_no_interactive_write"  ON authority_relations;
DROP POLICY IF EXISTS "ar_no_interactive_update" ON authority_relations;

-- Edges carry no tenant data — they relate published instruments to each other
-- — and standard_adopted() must be answerable for any caller.
CREATE POLICY "ar_read"                  ON authority_relations FOR SELECT USING (true);
CREATE POLICY "ar_no_interactive_write"  ON authority_relations FOR INSERT WITH CHECK (false);
CREATE POLICY "ar_no_interactive_update" ON authority_relations FOR UPDATE USING (false);


-- ---------------------------------------------------------------------------
-- 8 — Grants
-- ---------------------------------------------------------------------------

REVOKE ALL ON public.vault_nodes         FROM public, anon;
REVOKE ALL ON public.authority_relations FROM public, anon;

GRANT SELECT ON public.vault_nodes         TO authenticated, service_role;
GRANT SELECT ON public.authority_relations TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.normalize_label(text)                         FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.org_root(uuid)                                FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.standard_adopted(ltree, ltree, date)          FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.authority_rank(public.authority_class)        FROM public, anon;

GRANT EXECUTE ON FUNCTION public.normalize_label(text)                          TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.org_root(uuid)                                 TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.standard_adopted(ltree, ltree, date)           TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.authority_rank(public.authority_class)         TO authenticated, service_role;

COMMIT;
