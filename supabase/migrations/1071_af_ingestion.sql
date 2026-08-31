-- =============================================================================
-- 1071_af_ingestion.sql
-- Shtiya Builder v3.0 — Agent Factory ingestion pipeline:
-- authority publication gating, encoding-layer chunk neutralisation, and the
-- tenant screening record.
--
-- The authority corpus has no interactive write path. Every chunk INSERT
-- requires an approved authority_publications record matching its source_hash,
-- so corpus poisoning is structurally impossible regardless of what any route
-- does (I-A4).
--
-- CORRECTIONS vs task spec (each verified against a live database):
--   - normalize() takes its form as a bare keyword, not a string literal:
--     normalize(p_text, NFKC). The quoted form fails with
--     "syntax error at or near 'NFKC'".
--   - The C0 control class starts at U+0001, not U+0000. U&'\0000' is rejected
--     with "invalid Unicode escape value", and Postgres text cannot contain a
--     NUL byte in the first place, so there is nothing to strip there.
--   - digest() is schema-qualified as extensions.digest(); pgcrypto installs into
--     the extensions schema on this cluster (OI-1), not public.
--
-- I-A4:  no chunk enters authority_corpus without an approved publication.
-- I-A14: encoding-level findings are recorded and content is neutralised.
--        This is the layer that CAN be solved deterministically. The semantic
--        layer cannot be, and nothing here pretends otherwise.
--
-- Builds on 1070 (authority_corpus, tenant_corpus, corpus_trust, jurisdictions).
-- =============================================================================


-- ---------------------------------------------------------------------------
-- Section 1 — authority_publications (append-only)
-- ---------------------------------------------------------------------------

-- I-A4: no chunk enters authority_corpus without an approved publication record.
CREATE TABLE IF NOT EXISTS authority_publications (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  source_url      text        NOT NULL,
  publisher       text        NOT NULL,
  jurisdiction_id text        NOT NULL REFERENCES jurisdictions(id),
  retrieved_at    timestamptz NOT NULL,
  artifact_sha256 text        NOT NULL UNIQUE,
  parser_version  text        NOT NULL,
  approved_by     text,
  approved_at     timestamptz,
  state           text        NOT NULL DEFAULT 'fetched'
    CHECK (state IN ('fetched','parsed','review','approved','rejected','superseded'))
);
-- Append-only: corrections require a new publication record, not an edit.
CREATE OR REPLACE RULE ap_no_delete
  AS ON DELETE TO authority_publications DO INSTEAD NOTHING;

ALTER TABLE authority_publications ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- Section 2 — guard_authority_write()
-- ---------------------------------------------------------------------------

-- Every authority_corpus INSERT requires an approved publication record.
-- No customer, at any tier, can write a chunk carrying authority weight.
CREATE OR REPLACE FUNCTION public.guard_authority_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN  -- I-A4
  IF NOT EXISTS (
    SELECT 1 FROM public.authority_publications p
    WHERE p.artifact_sha256 = NEW.source_hash
      AND p.state           = 'approved'
      AND p.approved_by     IS NOT NULL
  ) THEN
    RAISE EXCEPTION
      'AUTHORITY_UNAPPROVED: authority_corpus chunks require an approved publication record'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS authority_corpus_write_guard ON authority_corpus;
CREATE TRIGGER authority_corpus_write_guard
  BEFORE INSERT OR UPDATE ON authority_corpus
  FOR EACH ROW EXECUTE FUNCTION public.guard_authority_write();


-- ---------------------------------------------------------------------------
-- Section 3 — ingestion_screen_findings (append-only)
-- ---------------------------------------------------------------------------

-- I-A14: records what encoding-level findings were detected and what was done.
-- Covers concrete, deterministic attack classes — not semantic injection.
CREATE TABLE IF NOT EXISTS ingestion_screen_findings (
  id          uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  chunk_id    uuid         NOT NULL,
  corpus      corpus_trust NOT NULL,
  finding     text         NOT NULL
    CHECK (finding IN (
      'instruction_pattern','delimiter_token','invisible_text',
      'bidi_control','homoglyph','zero_width','url_with_payload',
      'base64_blob','tool_call_shape','oversize_chunk','ocr_hidden_layer'
    )),
  excerpt     text,       -- redacted to first 120 chars; never the full chunk
  detected_at timestamptz  NOT NULL DEFAULT now(),
  disposition text
    CHECK (disposition IN ('quarantined','cleared','rejected')),
  reviewed_by uuid         REFERENCES users(id)
);
-- Append-only: findings are never deleted.
CREATE OR REPLACE RULE isf_no_delete
  AS ON DELETE TO ingestion_screen_findings DO INSTEAD NOTHING;

ALTER TABLE ingestion_screen_findings ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- Section 4 — neutralize_chunk()
-- ---------------------------------------------------------------------------

-- Encoding-level sanitisation: fully deterministic, three passes.
-- This is the layer that CAN be solved deterministically.
-- The semantic layer cannot be made safe and this function does not pretend otherwise.
CREATE OR REPLACE FUNCTION public.neutralize_chunk(p_text text)
RETURNS text LANGUAGE sql IMMUTABLE
SET search_path = ''
AS $$
  SELECT regexp_replace(
    regexp_replace(
      regexp_replace(
        -- Pass 1: NFKC normalization (homoglyph / compatibility folding).
        -- The form is a bare keyword, not a quoted literal.
        normalize(p_text, NFKC),
        -- Pass 2a: zero-width and bidirectional override characters
        -- U+200B-U+200F: zero-width spaces/marks
        -- U+202A-U+202E: LTR/RTL embedding and override
        -- U+2066-U+2069: directional isolates
        -- U+FEFF: BOM / zero-width no-break space
        U&'[\200B-\200F\202A-\202E\2066-\2069\FEFF]',
        '', 'g'),
      -- Pass 2b: C0/C1 controls except tab (U+0009) and newline (U+000A).
      -- Starts at U+0001: U+0000 cannot appear in a Postgres text value and
      -- U&'\0000' is not a legal escape.
      U&'[\0001-\0008\000B\000C\000E-\001F\007F]',
      '', 'g'),
    -- Pass 3: envelope delimiters — the most important pass.
    -- [[SHTIYA_END]] inside a chunk closes the envelope early, promoting
    -- the remainder to top-level authority equal to platform instructions.
    '(?i)\[\[SHTIYA_(CTX|END)\]\]',
    '', 'g'
  );
$$;

GRANT EXECUTE ON FUNCTION public.neutralize_chunk(text) TO authenticated, service_role;


-- ---------------------------------------------------------------------------
-- Section 5 — guard_tenant_screen()
-- ---------------------------------------------------------------------------

-- Applied to every tenant chunk at INSERT or UPDATE.
-- Normalises content before storage: a quarantined chunk cannot be reinstated
-- by an edit because the hash is recomputed over the normalised form.
CREATE OR REPLACE FUNCTION public.guard_tenant_screen()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN  -- I-A14
  NEW.content        := public.neutralize_chunk(NEW.content);
  -- pgcrypto installs into the extensions schema on this cluster;
  -- qualify as extensions.digest() under SET search_path = '' (OI-1 fix)
  NEW.content_sha256 := encode(extensions.digest(NEW.content, 'sha256'), 'hex');

  -- A chunk is retrievable ONLY in 'clear'. 'pending' is the upload default
  -- and is NOT retrievable, so the upload → screening window is not an exposure.
  IF NEW.screen_state = 'clear'
     AND NEW.reviewed_at IS NULL
     AND EXISTS (
       SELECT 1 FROM public.ingestion_screen_findings f
       WHERE f.chunk_id    = NEW.id
         AND f.disposition IS NULL
     ) THEN
    RAISE EXCEPTION 'SCREEN_PENDING: unreviewed findings block clearance'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS tenant_corpus_screen_guard ON tenant_corpus;
CREATE TRIGGER tenant_corpus_screen_guard
  BEFORE INSERT OR UPDATE ON tenant_corpus
  FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_screen();


-- ---------------------------------------------------------------------------
-- Section 6 — RLS policies
-- ---------------------------------------------------------------------------

-- authority_publications: any authenticated user may read status;
-- no interactive INSERT (publishing pipeline only)
DROP POLICY IF EXISTS "ap_read"                  ON authority_publications;
DROP POLICY IF EXISTS "ap_no_interactive_insert" ON authority_publications;
CREATE POLICY "ap_read" ON authority_publications FOR SELECT
  USING (public.current_app_user_id() IS NOT NULL);
CREATE POLICY "ap_no_interactive_insert" ON authority_publications FOR INSERT
  WITH CHECK (false);

-- ingestion_screen_findings: org member reads findings for their own chunks
DROP POLICY IF EXISTS "isf_read" ON ingestion_screen_findings;
CREATE POLICY "isf_read" ON ingestion_screen_findings FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.tenant_corpus tc
      JOIN public.firm_members fm ON fm.firm_id = tc.owner_org_id
      WHERE tc.id      = ingestion_screen_findings.chunk_id
        AND fm.user_id = public.current_app_user_id()
    )
  );


-- ---------------------------------------------------------------------------
-- Section 7 — Grants
-- ---------------------------------------------------------------------------

REVOKE ALL ON public.authority_publications    FROM public, anon;
REVOKE ALL ON public.ingestion_screen_findings FROM public, anon;

-- authority_publications: authenticated reads status; no interactive write
GRANT SELECT  ON public.authority_publications    TO authenticated, service_role;
REVOKE INSERT ON public.authority_publications    FROM authenticated;

-- ingestion_screen_findings: org members read their org's findings;
-- INSERT is service-role only (screening pipeline)
GRANT  SELECT ON public.ingestion_screen_findings TO authenticated, service_role;
REVOKE INSERT ON public.ingestion_screen_findings FROM authenticated;
