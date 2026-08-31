-- Migration: 1075_af_grants.sql
-- Phase 2 · Task 2.13 — Agent Factory grant stack
-- Invariants supported: I-A1, I-A2, I-A10, I-A15, I-19
--
-- Postgres checks object privileges BEFORE row-level security, so every policy
-- written in 1070–1074 is unreachable without this file. Grants are the coarse
-- gate that lets a role touch the table at all; the policies are the fine one.
--
-- SCHEMA CORRECTIONS vs the task spec (each verified against the live schema):
--   - No sequence grants. All ten AF primary keys are `uuid DEFAULT
--     gen_random_uuid()`; `SELECT … FROM pg_class WHERE relkind='S'` returns
--     zero rows for schema public. agent_sessions_id_seq et al. do not exist.
--   - The retrieval RPCs take (uuid, vector), not
--     (vector, int, float, uuid, uuid). 1072 fixed the count and threshold as
--     server constants (I-A8), so there is no int/float parameter to grant on.
--   - No table-wide SELECT on authority_corpus or tenant_corpus. Their read
--     grant is COLUMN-LEVEL and excludes `embedding` (I-A10 / I-19); 1070 §12
--     issues it and embedding-lint fails the build on any widening. Section 2
--     re-asserts the exclusion rather than re-listing twenty columns.
--   - professional_credentials is SELECT-only for authenticated. See §3: the
--     spec's INSERT/UPDATE is a live privilege escalation, not a write path.
--   - service_role needs TABLE-level SELECT on both corpora even though
--     authenticated does not. match_authority_chunks() is SECURITY INVOKER
--     (AF-12) and reads r.embedding in its WHERE and ORDER BY, so the caller
--     needs SELECT on that column. Without §5 the RPC raises
--     "permission denied for table authority_corpus" for every caller alive —
--     measured before this migration, for both authenticated and service_role.
--     The corollary is deliberate: authenticated holds EXECUTE (§7) but is
--     stopped at the embedding column, so retrieval runs service-side only,
--     which is what I-A7 and servicerole-lint already require of the routes.
--   - No UPDATE/DELETE where a rewrite rule discards it. ael_no_update,
--     ael_no_delete (I-A15), ap_no_delete and isf_no_delete are DO INSTEAD
--     NOTHING; granting through them would read as a permission that exists.
--
-- 50 migrations total after this file (10 legacy + 40 v3: 1000–1075)

BEGIN;


-- ---------------------------------------------------------------------------
-- 1 — authenticated · read surface
--
-- Every policy behind these is a SELECT policy from 1070–1074. The grant only
-- opens the table; ac_read/tc_read/ca_read/as_own/pc_self/ap_read/isf_read/
-- ael_org_read/gs_org_read decide the rows.
-- ---------------------------------------------------------------------------

GRANT SELECT ON public.custom_agents             TO authenticated;  -- ca_read
GRANT SELECT ON public.agent_sessions            TO authenticated;  -- as_own
GRANT SELECT ON public.professional_credentials  TO authenticated;  -- pc_self
GRANT SELECT ON public.authority_publications    TO authenticated;  -- ap_read
GRANT SELECT ON public.ingestion_screen_findings TO authenticated;  -- isf_read
GRANT SELECT ON public.grounding_eval_sets       TO authenticated;
GRANT SELECT ON public.agent_execution_logs      TO authenticated;  -- ael_org_read
GRANT SELECT ON public.grounding_strikes         TO authenticated;  -- gs_org_read


-- ---------------------------------------------------------------------------
-- 2 — I-A10 / I-19 · the corpora are read column-by-column, never whole
--
-- Text is partially reconstructable from a dense embedding, so a vector is a
-- partial disclosure of the chunk it encodes. authority_corpus and tenant_corpus
-- therefore carry a column-level SELECT grant (1070 §12) that names every column
-- except `embedding`. The REVOKEs below are no-ops today and exist to stay that
-- way: they are the assertion that no future edit of this file quietly widens
-- the grant back to the whole row.
-- ---------------------------------------------------------------------------

REVOKE SELECT (embedding) ON public.authority_corpus FROM authenticated;  -- I-A10
REVOKE SELECT (embedding) ON public.tenant_corpus    FROM authenticated;  -- I-A10


-- ---------------------------------------------------------------------------
-- 3 — authenticated · write surface
--
-- Three tables, and only three. Each has an INSERT policy whose WITH CHECK
-- constrains what the new row may claim, not merely who owns it.
--
-- professional_credentials is NOT here, against the task spec. pc_self_insert
-- checks user_id = current_app_user_id() and nothing else, while
-- vault_visible_to() grants the 'licensed_pro' tier of the authority corpus to
-- anyone holding a row with standing = 'active' and reverify_due in the future.
-- With INSERT granted, a tenant_market user self-issues that row and the gate
-- opens — measured: vault_visible_to(…,'licensed_pro','US-NY','legal') went
-- f → t on a credential the user wrote for themselves. A credential you can
-- write yourself is not a credential, so issuance belongs to the verification
-- pipeline in §5 (I-A1).
-- ---------------------------------------------------------------------------

-- tc_insert pins screen_state='pending' and uploaded_by=self; a CHECK pins
-- trust_class='tenant'; tc_no_state_selfpromote keeps the new row off 'clear',
-- so an upload cannot promote itself into retrieval (I-A2, I-A4).
GRANT INSERT, UPDATE ON public.tenant_corpus  TO authenticated;

-- ca_write/ca_update pin org membership and created_by. Every filter column is
-- FK-constrained and narrowing only (I-A7), and retrieval still applies
-- vault_visible_to() per row, so a hand-built agent cannot out-reach its author.
GRANT INSERT, UPDATE ON public.custom_agents  TO authenticated;

-- as_own_insert/as_own_update pin user_id=self and carry the wall term (I-5).
GRANT INSERT, UPDATE ON public.agent_sessions TO authenticated;


-- ---------------------------------------------------------------------------
-- 4 — authenticated · drop the default-privilege residue
--
-- Supabase's ALTER DEFAULT PRIVILEGES hands authenticated Dxtm — TRUNCATE,
-- REFERENCES, TRIGGER, MAINTAIN — on every table postgres creates in public.
-- TRUNCATE is not row-level-security checked and FORCE RLS does not change
-- that, so an inherited TRUNCATE would empty a corpus that no policy lets the
-- same role read one row of. Nothing in the app uses any of the four.
-- ---------------------------------------------------------------------------

REVOKE TRUNCATE, REFERENCES, TRIGGER ON
  public.authority_corpus, public.tenant_corpus, public.custom_agents,
  public.agent_sessions, public.professional_credentials,
  public.authority_publications, public.ingestion_screen_findings,
  public.grounding_eval_sets, public.agent_execution_logs,
  public.grounding_strikes
FROM authenticated;

-- MAINTAIN is PG17+. Guarded so the file still applies to a PG15/16 project.
DO $$
BEGIN
  IF current_setting('server_version_num')::int >= 170000 THEN
    EXECUTE $g$
      REVOKE MAINTAIN ON
        public.authority_corpus, public.tenant_corpus, public.custom_agents,
        public.agent_sessions, public.professional_credentials,
        public.authority_publications, public.ingestion_screen_findings,
        public.grounding_eval_sets, public.agent_execution_logs,
        public.grounding_strikes
      FROM authenticated
    $g$;
  END IF;
END;
$$;


-- ---------------------------------------------------------------------------
-- 5 — service_role · the pipelines
--
-- service_role holds BYPASSRLS, which exempts it from policies but not from
-- object privileges: before this section it could not INSERT a single row into
-- authority_corpus. Ingestion, screening, credential verification and the
-- retrieval RPCs all run here.
-- ---------------------------------------------------------------------------

-- Table-level, so `embedding` is included — the RPCs and the embedder need it.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.authority_corpus         TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_corpus            TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.custom_agents            TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_sessions           TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.grounding_eval_sets      TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.grounding_strikes        TO service_role;

-- I-A1: issuance and revocation of credentials is the verifier's, not the holder's.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.professional_credentials TO service_role;

-- ap_no_delete / isf_no_delete are DO INSTEAD NOTHING: no DELETE granted.
GRANT SELECT, INSERT, UPDATE ON public.authority_publications    TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.ingestion_screen_findings TO service_role;

-- I-A15: agent_execution_logs is append-only by rule (ael_no_update,
-- ael_no_delete). SELECT and INSERT are the whole of its write surface.
GRANT SELECT, INSERT ON public.agent_execution_logs TO service_role;


-- ---------------------------------------------------------------------------
-- 6 — Sequences
--
-- None. Every AF primary key is uuid DEFAULT gen_random_uuid(), and schema
-- public owns no sequence of any kind, so INSERT needs no USAGE grant here.
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- 7 — Retrieval RPCs
--
-- Re-issued from 1072 so the AF execute surface is auditable in one file.
-- Signatures verified against pg_get_function_identity_arguments().
-- ---------------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.match_authority_chunks(uuid, vector) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.match_tenant_chunks(uuid, vector)    FROM public, anon;

GRANT EXECUTE ON FUNCTION public.match_authority_chunks(uuid, vector)
  TO authenticated, service_role;  -- I-A1: retrieval access gate
GRANT EXECUTE ON FUNCTION public.match_tenant_chunks(uuid, vector)
  TO authenticated, service_role;  -- I-A1

COMMIT;
