-- =============================================================================
-- 1083_hrag_ingestion.sql
-- Shtiya Builder v3.0 — HRAG Vault Network Part IV:
-- sandbox_verdict ENUM, ingestion_profiles, document_ingestion_queue,
-- publisher_domains, ingestion_custody_log, guard_ingestion_target().
--
-- I-H3:  PII column names (name, address, ssn, email, phone) are deliberately
--        absent from every table here. A declared identity belongs inside
--        declared_metadata, where it is one opaque jsonb value that no index,
--        no log line and no error message spreads across the schema.
--        1086 §9 asserts the absence; vault-pii-lint asserts it in CI.
-- I-H18: sniffed_mime routes parsing. declared_mime is recorded and ignored —
--        a content type chosen by the uploader is a parser selector chosen by
--        the uploader.
-- I-H20: extracted_fields holds FIELDS ONLY. The agent extracts; deterministic
--        code compares. verification_status therefore has no 'verified' value:
--        consistency between a document and a declaration is not truth about
--        the world (§III.4).
-- I-H21: target_path must resolve inside the uploader's own org subtree.
--
-- SCHEMA CORRECTIONS vs the task spec (each verified against the live schema):
--
--   - subject_kind columns use the public.subject_kind ENUM declared in 1080.
--
--   - guard_ingestion_target() qualifies the ltree containment operator as
--     OPERATOR(public.<@); under SET search_path = '' the bare form does not
--     resolve. See the 1080 header.
-- =============================================================================

BEGIN;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sandbox_verdict') THEN
    CREATE TYPE public.sandbox_verdict AS ENUM (
      'pending',
      'static_rejected',
      'sandbox_failed',
      'reconstructed',
      'extracted',
      'fidelity_failed',
      'clean'
    );
  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- 1 — ingestion_profiles (governed data — §III.1)
--
-- A new role or document kind is a ROW and a review, not a migration. The
-- moment this is schema, every new counterparty type needs a deploy.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ingestion_profiles (
  id              uuid                PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_kind    public.subject_kind NOT NULL,
  doc_kind        text                NOT NULL,
  required_fields jsonb               NOT NULL,   -- { field: {type, format} }
  compare_fields  text[]              NOT NULL,   -- what the Stage-6 agent extracts
  match_policy    jsonb               NOT NULL,   -- { field: 'exact'|'normalized'|'fuzzy:0.9'|'advisory' }
  min_confidence  jsonb               NOT NULL,   -- { field: 0.80 }
  target_path_tpl text                NOT NULL,   -- must resolve under ROOT.Org.<own> (I-H21)
  max_bytes       bigint              NOT NULL DEFAULT 104857600,
  max_pages       int                 NOT NULL DEFAULT 1500,
  reviewed_by     text                NOT NULL,
  UNIQUE (subject_kind, doc_kind)
);


-- ---------------------------------------------------------------------------
-- 2 — document_ingestion_queue
--
-- NOTE: columns 'name', 'address', 'ssn', 'email' and 'phone' are deliberately
-- absent (I-H3 / vault-pii-lint / 1086 §9). Do not add them.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS document_ingestion_queue (
  id                  uuid                   PRIMARY KEY DEFAULT gen_random_uuid(),
  uploaded_by         uuid                   NOT NULL REFERENCES public.users(id),
  owner_org_id        uuid                   NOT NULL REFERENCES public.firms(id),
  subject_kind        public.subject_kind    NOT NULL,
  subject_id          uuid                   NOT NULL,
  profile_id          uuid                   NOT NULL REFERENCES public.ingestion_profiles(id),
  declared_metadata   jsonb                  NOT NULL,
  raw_sha256          text                   NOT NULL,
  raw_bytes           bigint                 NOT NULL,
  declared_mime       text,                  -- recorded, never used to route parsing (I-H18)
  sniffed_mime        text,                  -- server-determined; this one routes (I-H18)
  md_sha256           text,
  sandbox_status      public.sandbox_verdict NOT NULL DEFAULT 'pending',
  sandbox_job_id      text,
  static_findings     jsonb                  NOT NULL DEFAULT '[]'::jsonb,
  malware_scan_status text                   NOT NULL DEFAULT 'pending'
                        CHECK (malware_scan_status IN ('pending','clean','infected','error')),
  fidelity_report     jsonb,
  extracted_fields    jsonb,                 -- I-H20: fields only; the comparison is code
  verification_status text                   NOT NULL DEFAULT 'pending'
                        CHECK (verification_status IN (
                          'pending','consistent','mismatch','indeterminate','rejected'
                        )),
  -- 'verified' is deliberately NOT a value here (§III.4 — consistency ≠ truth)
  target_path         ltree,
  promoted_chunk_ids  uuid[]                 NOT NULL DEFAULT '{}',
  received_at         timestamptz            NOT NULL DEFAULT now(),  -- SERVER time
  client_declared_at  timestamptz,
  created_at          timestamptz            NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS diq_subject ON document_ingestion_queue (subject_kind, subject_id);
CREATE INDEX IF NOT EXISTS diq_open    ON document_ingestion_queue (sandbox_status)
  WHERE sandbox_status NOT IN ('clean','static_rejected');

-- The queue is the custody record for a file someone handed the platform.
-- Deleting a row deletes the evidence that the file was ever received.
CREATE OR REPLACE RULE diq_no_delete
  AS ON DELETE TO document_ingestion_queue DO INSTEAD NOTHING;


-- ---------------------------------------------------------------------------
-- 3 — guard_ingestion_target() (I-H21)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.guard_ingestion_target()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.target_path IS NOT NULL
     AND NOT (NEW.target_path OPERATOR(public.<@) public.org_root(NEW.owner_org_id)) THEN
    RAISE EXCEPTION 'I-H21: ingestion may promote only into % (attempted %)',
      public.org_root(NEW.owner_org_id), NEW.target_path
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_org_member_for(NEW.uploaded_by, NEW.owner_org_id) THEN
    RAISE EXCEPTION 'INGEST_ORG_MISMATCH: uploader is not a member of the owning org'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS diq_target_guard ON document_ingestion_queue;
CREATE TRIGGER diq_target_guard
  BEFORE INSERT OR UPDATE ON document_ingestion_queue
  FOR EACH ROW EXECUTE FUNCTION public.guard_ingestion_target();


-- ---------------------------------------------------------------------------
-- 4 — publisher_domains (SSRF allow-list, HV-21)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS publisher_domains (
  domain      text        PRIMARY KEY,
  publisher   text        NOT NULL,
  added_by    text        NOT NULL,
  reviewed_at timestamptz NOT NULL DEFAULT now()
);


-- ---------------------------------------------------------------------------
-- 5 — ingestion_custody_log (append-only stage verdict trail)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ingestion_custody_log (
  id       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_id uuid        NOT NULL REFERENCES document_ingestion_queue(id),
  stage    text        NOT NULL,
  verdict  text        NOT NULL,
  detail   jsonb       NOT NULL DEFAULT '{}'::jsonb,
  actor    text        NOT NULL,
  at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS icl_queue ON ingestion_custody_log (queue_id, at);

-- A custody trail that can be edited after the fact is a narrative.
CREATE OR REPLACE RULE icl_no_update
  AS ON UPDATE TO ingestion_custody_log DO INSTEAD NOTHING;
CREATE OR REPLACE RULE icl_no_delete
  AS ON DELETE TO ingestion_custody_log DO INSTEAD NOTHING;


-- ---------------------------------------------------------------------------
-- 6 — RLS
-- ---------------------------------------------------------------------------

ALTER TABLE ingestion_profiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_ingestion_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE publisher_domains        ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingestion_custody_log    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ip_read" ON ingestion_profiles;
CREATE POLICY "ip_read" ON ingestion_profiles FOR SELECT
  USING (public.current_app_user_id() IS NOT NULL);

DROP POLICY IF EXISTS "diq_read"           ON document_ingestion_queue;
DROP POLICY IF EXISTS "diq_insert"         ON document_ingestion_queue;
DROP POLICY IF EXISTS "diq_no_selfpromote" ON document_ingestion_queue;

CREATE POLICY "diq_read" ON document_ingestion_queue FOR SELECT
  USING (uploaded_by = public.current_app_user_id());

-- An upload lands pending on both axes. It cannot arrive already scanned.
CREATE POLICY "diq_insert" ON document_ingestion_queue FOR INSERT
  WITH CHECK (
    uploaded_by             = public.current_app_user_id()
    AND verification_status = 'pending'
    AND sandbox_status      = 'pending'
  );

-- …and it cannot promote itself out of pending afterwards either. Stage
-- verdicts are written by the pipeline under service_role, never by the
-- uploader.
CREATE POLICY "diq_no_selfpromote" ON document_ingestion_queue FOR UPDATE
  USING      (uploaded_by = public.current_app_user_id())
  WITH CHECK (
    uploaded_by             = public.current_app_user_id()
    AND verification_status = 'pending'
    AND sandbox_status      = 'pending'
  );

DROP POLICY IF EXISTS "pd_read"                 ON publisher_domains;
DROP POLICY IF EXISTS "pd_no_interactive_write" ON publisher_domains;
CREATE POLICY "pd_read" ON publisher_domains FOR SELECT
  USING (public.current_app_user_id() IS NOT NULL);
CREATE POLICY "pd_no_interactive_write" ON publisher_domains FOR INSERT
  WITH CHECK (false);

DROP POLICY IF EXISTS "icl_read" ON ingestion_custody_log;
CREATE POLICY "icl_read" ON ingestion_custody_log FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.document_ingestion_queue q
      WHERE q.id = queue_id
        AND q.uploaded_by = public.current_app_user_id()
    )
  );


-- ---------------------------------------------------------------------------
-- 7 — Grants
-- ---------------------------------------------------------------------------

REVOKE ALL ON public.ingestion_profiles        FROM public, anon;
REVOKE ALL ON public.document_ingestion_queue  FROM public, anon;
REVOKE ALL ON public.publisher_domains         FROM public, anon;
REVOKE ALL ON public.ingestion_custody_log     FROM public, anon;

GRANT SELECT                 ON public.ingestion_profiles       TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.document_ingestion_queue TO authenticated, service_role;
GRANT SELECT                 ON public.publisher_domains        TO authenticated, service_role;
GRANT SELECT                 ON public.ingestion_custody_log    TO authenticated, service_role;
GRANT INSERT                 ON public.ingestion_custody_log    TO service_role;

COMMIT;
