-- =============================================================================
-- 10855_hrag_rls_part_b.sql
-- Shtiya Builder v3.0 — HRAG Vault Network Part VI-B:
-- topology_gap_signals, the deferred coverage-assertion seeds, and the closing
-- assertion of the HRAG grant surface.
--
-- Pairs with 10850 — see that file's FILE NUMBERING note for why this is
-- 10855 and not a second 1085.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1 — topology_gap_signals
--
-- Emitted when a query resolves at a coarser node than it asked for: the
-- retrieval path wanted ROOT.Law.NY.Kings and the only hit was at ROOT.Law.NY.
-- That is not an error — the answer is still grounded — but it is the signal
-- that the tree is missing a level the work actually needs, and it is the only
-- evidence of that gap anyone ever gets. Reading it is an editorial act, not a
-- tenant-facing one, so no authenticated user sees these rows.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS topology_gap_signals (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  queried_scope   ltree       NOT NULL,
  hit_at_scope    ltree       NOT NULL,
  subject_kind    public.subject_kind,
  jurisdiction_id text,
  observed_at     timestamptz NOT NULL DEFAULT now(),
  resolved_at     timestamptz,
  resolution      text
);

CREATE INDEX IF NOT EXISTS tgs_open ON topology_gap_signals (queried_scope, observed_at)
  WHERE resolved_at IS NULL;

ALTER TABLE topology_gap_signals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tgs_read" ON topology_gap_signals;

-- Editorial only. service_role writes them and carries BYPASSRLS; the
-- publisher reads them through this policy. `authenticated` matches neither.
CREATE POLICY "tgs_read" ON topology_gap_signals FOR SELECT
  USING (pg_catalog.pg_has_role(current_user, 'corpus_publisher', 'USAGE'));

REVOKE ALL ON public.topology_gap_signals FROM public, anon, authenticated;
GRANT SELECT, INSERT ON public.topology_gap_signals TO service_role;
GRANT SELECT         ON public.topology_gap_signals TO corpus_publisher;


-- ---------------------------------------------------------------------------
-- 2 — Baseline coverage assertions: deliberately NOT seeded here
--
-- coverage_assertions.required_path is an FK onto vault_nodes(path), and the
-- only nodes that exist after 1080 are the six structural roots — which
-- required_path may not name anyway, because a structural node is a broadcast
-- node (I-H2). Every real assertion ('law/US.NY/RPAPL' and its siblings from
-- scripts/seed-coverage-assertions.sql) needs ROOT.Law.NY.RPAPL to be
-- registered first, and registering it is an editorial act performed by the
-- corpus_publisher pipeline against a reviewed source — not something a
-- migration can invent.
--
-- Seeding them here with placeholder paths would make coverage_status() return
-- `satisfied = false` for assertions nobody wrote, which reads as "the corpus
-- is missing NY foreclosure law" rather than "no one has declared what NY
-- foreclosure coverage means yet". The empty table says the second thing, which
-- is the true one. 1086 §10 therefore asserts the TABLE exists and does not
-- require rows.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.vault_nodes WHERE path OPERATOR(public.=) 'ROOT'::public.ltree) THEN
    RAISE EXCEPTION 'HRAG: structural roots missing — 1080 did not seed vault_nodes';
  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- 3 — Closing assertion of the HRAG grant surface
--
-- Every REVOKE below names only `public` and `anon`. They are no-ops today and
-- exist to stay that way: the assertion that no later edit quietly hands the
-- anonymous role a reader on the vault. The GRANTs restate what 1080–1084
-- already issued, so the whole read surface of the HRAG layer is visible in one
-- place rather than spread across five files.
-- ---------------------------------------------------------------------------

REVOKE ALL ON public.vault_nodes              FROM public, anon;
REVOKE ALL ON public.authority_relations      FROM public, anon;
REVOKE ALL ON public.scope_templates          FROM public, anon;
REVOKE ALL ON public.corpus_disclosures       FROM public, anon;
REVOKE ALL ON public.ingestion_profiles       FROM public, anon;
REVOKE ALL ON public.document_ingestion_queue FROM public, anon;
REVOKE ALL ON public.publisher_domains        FROM public, anon;
REVOKE ALL ON public.ingestion_custody_log    FROM public, anon;
REVOKE ALL ON public.coverage_assertions      FROM public, anon;

GRANT SELECT ON public.vault_nodes         TO authenticated, service_role;
GRANT SELECT ON public.authority_relations TO authenticated, service_role;
GRANT SELECT ON public.scope_templates     TO authenticated, service_role;
GRANT SELECT ON public.coverage_assertions TO authenticated, service_role;

COMMIT;
