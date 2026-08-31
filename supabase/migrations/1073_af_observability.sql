-- =============================================================================
-- 1073_af_observability.sql
-- Shtiya Builder v3.0 — Agent Factory: Observability tables.
--
-- Three tables:
--   agent_execution_logs  — append-only, per-request grounding audit (I-A15)
--   grounding_strikes     — per-sentence attribution failures (I-A12)
--   grounding_eval_sets   — labelled eval pairs for per-domain bar calibration
--
-- I-A15: execution logs store chunk_id REFERENCES, never chunk content.
--        An audit log storing retrieved text is a shadow corpus with a broader
--        read audience. The log must not become a way for ops to read corpus
--        content without traversing corpus RLS.
--
-- Depends on: 1070_af_corpora_part_a (vault_domains, jurisdictions,
--             custom_agents), 1070_af_corpora_part_b (agent_sessions),
--             1001 (users), 1003 (firms), 1004 (matters).
-- =============================================================================


-- ---------------------------------------------------------------------------
-- Section 1 — agent_execution_logs
-- ---------------------------------------------------------------------------

-- I-A15: grounding_outcome values are the complete closed set. Adding
-- 'answered_no_citation' or 'answered_ambiguous' here would indicate a
-- design defect, not an operational state.
CREATE TABLE IF NOT EXISTS agent_execution_logs (
  id                  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id            uuid          NOT NULL REFERENCES custom_agents(id)  ON DELETE CASCADE,
  org_id              uuid          NOT NULL REFERENCES firms(id)           ON DELETE CASCADE,
  user_id             uuid          NOT NULL REFERENCES users(id),
  session_id          uuid          REFERENCES agent_sessions(id),
  matter_id           uuid          REFERENCES matters(id),
  query_sha256        text          NOT NULL,              -- hash, never the query text (I-A15)
  retrieved_chunk_ids uuid[]        NOT NULL DEFAULT '{}',
  retrieved_count     int           NOT NULL,
  top_similarity      double precision,
  top_rerank_score    double precision,
  grounding_outcome   text          NOT NULL CHECK (grounding_outcome IN (
                        'answered',
                        'fallback_no_results',
                        'fallback_below_bar',
                        'fallback_jurisdiction_mismatch',
                        'fallback_stale_corpus',
                        'degraded_no_reranker',
                        'blocked_account_class',
                        'blocked_wall',
                        'coverage_incomplete'
                      )),
  model_invoked       boolean       NOT NULL,
  sentences_total     int,
  sentences_stripped  int,
  grounding_score     double precision,
  latency_ms          int,
  created_at          timestamptz   NOT NULL DEFAULT now()
);

-- I-A15: append-only enforcement via RULE (not trigger — rules rewrite the
-- query before execution, so there is no trigger-level path around them).
-- OR REPLACE makes the statement idempotent.
CREATE OR REPLACE RULE ael_no_update
  AS ON UPDATE TO agent_execution_logs DO INSTEAD NOTHING;  -- I-A15
CREATE OR REPLACE RULE ael_no_delete
  AS ON DELETE TO agent_execution_logs DO INSTEAD NOTHING;  -- I-A15


-- ---------------------------------------------------------------------------
-- Section 2 — grounding_strikes
-- ---------------------------------------------------------------------------

-- I-A12: every sentence that fails the output gate is recorded here.
-- This is the SOC 2 audit surface for the Attribution Invariant.
-- cited_chunk_id is nullable: strikes of kind 'no_citation' have no chunk.
CREATE TABLE IF NOT EXISTS grounding_strikes (
  id             uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id   uuid          NOT NULL REFERENCES agent_execution_logs(id) ON DELETE CASCADE,
  sentence_hash  text          NOT NULL,
  cited_chunk_id uuid,         -- nullable: no chunk for no_citation strikes (I-A12)
  reason         text          NOT NULL CHECK (reason IN (
                   'no_citation',
                   'entailment_failed',
                   'jurisdiction_mismatch',
                   'stale_source',
                   'single_source_dispositive',
                   'exfil_pattern',
                   'tool_call_shape'
                 )),
  created_at     timestamptz   NOT NULL DEFAULT now()
);


-- ---------------------------------------------------------------------------
-- Section 3 — grounding_eval_sets
-- ---------------------------------------------------------------------------

-- Grounding eval sets: labelled query/answer pairs for per-domain bar
-- calibration. Carries NO tenant content, NO matter content, NO PII (I-A14).
-- calibrated_bar is the per-domain GROUNDING_BAR constant derived from
-- offline evals; NULL until the domain has been calibrated.
CREATE TABLE IF NOT EXISTS grounding_eval_sets (
  id                 uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  domain             text          NOT NULL REFERENCES vault_domains(domain),
  jurisdiction_id    text          NOT NULL REFERENCES jurisdictions(id),
  query              text          NOT NULL,
  expected_chunk_ids uuid[]        NOT NULL,
  expected_fallback  boolean       NOT NULL DEFAULT false,
  calibrated_bar     double precision,    -- per-domain GROUNDING_BAR (I-A14)
  updated_at         timestamptz   NOT NULL DEFAULT now()
);


-- ---------------------------------------------------------------------------
-- Section 4 — Row Level Security
-- ---------------------------------------------------------------------------

ALTER TABLE agent_execution_logs  ENABLE ROW LEVEL SECURITY;
ALTER TABLE grounding_strikes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE grounding_eval_sets    ENABLE ROW LEVEL SECURITY;

-- ── agent_execution_logs ────────────────────────────────────────────────────
-- Org compliance record: all org members may read (for audits/compliance),
-- but no interactive insert path exists (the route writes via service_role).
--
-- CORRECTION vs task spec: this table carries a direct matter_id FK, so
-- wall-lint requires a wall term in its SELECT policy — and it is correct on
-- the merits. Without it a screened org member could learn that a walled
-- matter exists, and that queries were run against it, from the audit log.
DROP POLICY IF EXISTS "ael_org_read"               ON agent_execution_logs;
DROP POLICY IF EXISTS "ael_no_interactive_insert"  ON agent_execution_logs;

CREATE POLICY "ael_org_read"
  ON agent_execution_logs FOR SELECT
  USING (
    org_id IN (
      SELECT fm.firm_id
      FROM public.firm_members fm
      WHERE fm.user_id = public.current_app_user_id()
    )
    AND (matter_id IS NULL OR NOT public.wall_blocks_user(matter_id))
  );

CREATE POLICY "ael_no_interactive_insert"
  ON agent_execution_logs FOR INSERT
  WITH CHECK (false);  -- all writes via service_role only

-- ── grounding_strikes ───────────────────────────────────────────────────────
-- Readable by org members via the parent execution log's org_id.
-- No interactive insert (same as ael above).
DROP POLICY IF EXISTS "gs_org_read"              ON grounding_strikes;
DROP POLICY IF EXISTS "gs_no_interactive_insert" ON grounding_strikes;

CREATE POLICY "gs_org_read"
  ON grounding_strikes FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.agent_execution_logs ael
      JOIN public.firm_members fm ON fm.firm_id = ael.org_id
      WHERE ael.id     = grounding_strikes.execution_id
        AND fm.user_id = public.current_app_user_id()
        AND (ael.matter_id IS NULL OR NOT public.wall_blocks_user(ael.matter_id))
    )
  );

CREATE POLICY "gs_no_interactive_insert"
  ON grounding_strikes FOR INSERT
  WITH CHECK (false);

-- ── grounding_eval_sets ─────────────────────────────────────────────────────
-- Read-only for all authenticated users (calibration data is non-sensitive).
-- Write path is internal / service_role only.
DROP POLICY IF EXISTS "ges_authenticated_read"    ON grounding_eval_sets;
DROP POLICY IF EXISTS "ges_no_interactive_insert" ON grounding_eval_sets;

CREATE POLICY "ges_authenticated_read"
  ON grounding_eval_sets FOR SELECT
  USING (public.current_app_user_id() IS NOT NULL);

CREATE POLICY "ges_no_interactive_insert"
  ON grounding_eval_sets FOR INSERT
  WITH CHECK (false);


-- ---------------------------------------------------------------------------
-- Section 5 — Indexes
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS ael_agent_idx
  ON agent_execution_logs(agent_id);

CREATE INDEX IF NOT EXISTS ael_org_created_idx
  ON agent_execution_logs(org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ael_user_created_idx
  ON agent_execution_logs(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ael_matter_idx
  ON agent_execution_logs(matter_id)
  WHERE matter_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ael_outcome_idx
  ON agent_execution_logs(grounding_outcome, created_at DESC);

CREATE INDEX IF NOT EXISTS gs_execution_idx
  ON grounding_strikes(execution_id);

CREATE INDEX IF NOT EXISTS gs_reason_idx
  ON grounding_strikes(reason, created_at DESC);

CREATE INDEX IF NOT EXISTS ges_domain_jurisdiction_idx
  ON grounding_eval_sets(domain, jurisdiction_id);


-- ---------------------------------------------------------------------------
-- Section 6 — Privilege revocations
-- ---------------------------------------------------------------------------

REVOKE ALL ON public.agent_execution_logs FROM public, anon;
REVOKE ALL ON public.grounding_strikes     FROM public, anon;
REVOKE ALL ON public.grounding_eval_sets   FROM public, anon;

GRANT SELECT ON public.agent_execution_logs TO authenticated, service_role;
GRANT SELECT ON public.grounding_strikes    TO authenticated, service_role;
GRANT SELECT ON public.grounding_eval_sets  TO authenticated, service_role;

-- service_role writes execution logs and strikes (the copilot route never
-- uses authenticated for inserts into these audit tables).
GRANT INSERT ON public.agent_execution_logs TO service_role;
GRANT INSERT ON public.grounding_strikes    TO service_role;
GRANT INSERT ON public.grounding_eval_sets  TO service_role;
