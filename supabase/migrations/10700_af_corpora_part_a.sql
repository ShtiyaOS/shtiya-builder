-- =============================================================================
-- 1070_af_corpora_part_a.sql
-- Shtiya Builder v3.0 — Agent Factory, Part A:
-- pgvector, reference tables, corpus ENUMs, and the full authority_corpus /
-- tenant_corpus schemas that replace the 1057 stubs.
--
-- The 1057 stubs are dropped outright: the real schemas share almost no
-- columns with them (the stubs carried a `path` text column that the vault
-- model replaces with domain / sub_domain / jurisdiction_id).
--
-- KNOWN CONSEQUENCE — chain re-apply: 1058 issues column-level grants naming
-- authority_corpus.path and tenant_corpus.path. On a fresh `supabase db reset`
-- that is fine (1057 → 1058 → 1070, in order). On a re-apply of an already
-- migrated database, 1057's CREATE TABLE IF NOT EXISTS is skipped because the
-- 1070 tables exist, and 1058 then fails with `column "path" does not exist`.
-- Resolving it means amending 1058, which is outside this migration.
--
-- I-A4:  authority_corpus.owner_org_id is always NULL — structurally
--        unpoisonable by any customer.
-- I-A5:  tenant_corpus.owner_org_id is NOT NULL; there is no public tier.
-- I-A9:  authorisation predicates narrow rows before the ANN operator fires.
-- I-A10: embedding carries the same RLS as content; never granted in bulk.
-- I-A13: effective_from / effective_to / superseded_by are the currency model.
--
-- Part B adds the ingest guard, agents, sessions, credentials, RLS and grants.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- Section 1 — Extensions, and retire the 1057 stubs
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS unaccent;  -- required by normalize_label() in 1080

-- CASCADE also drops the 1057 policies and the 1058 column grants; Part B
-- re-issues the grants against the new column lists.
DROP TABLE IF EXISTS authority_corpus CASCADE;
DROP TABLE IF EXISTS tenant_corpus    CASCADE;


-- ---------------------------------------------------------------------------
-- Section 2 — Reference tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS vault_domains (
  domain      text PRIMARY KEY,
  description text NOT NULL
);
INSERT INTO vault_domains VALUES
  ('legal',                'Legal practice: transactional, litigation, compliance'),
  ('financial_regulatory', 'Banking, lending, consumer credit, securities'),
  ('construction',         'Building codes, standards, specifications'),
  ('design',               'Architecture, engineering, professional practice'),
  ('property_management',  'Landlord-tenant, rent regulation, housing codes'),
  ('brokerage',            'Agency, licensing, disclosure requirements'),
  ('general',              'Cross-domain platform documentation')
ON CONFLICT (domain) DO NOTHING;

-- Deliberately seeded empty: sub-domains are declared by the publishing
-- pipeline, not by this migration. Until a row exists, the composite FK on the
-- corpus tables admits nothing — which is the intended closed default.
CREATE TABLE IF NOT EXISTS vault_sub_domains (
  domain     text NOT NULL REFERENCES vault_domains(domain),
  sub_domain text NOT NULL,
  PRIMARY KEY (domain, sub_domain)
);

CREATE TABLE IF NOT EXISTS jurisdictions (
  id                 text PRIMARY KEY,
  state_code         text,
  county_name        text,
  municipality       text,
  jurisdiction_level text NOT NULL
    CHECK (jurisdiction_level IN ('federal','state','county','municipal')),
  active             boolean NOT NULL DEFAULT true
);
INSERT INTO jurisdictions (id, state_code, municipality, jurisdiction_level) VALUES
  ('US-Federal',    null, null,            'federal'),
  ('US-NY',         'NY', null,            'state'),
  ('US-NY-NYC',     'NY', 'New York City', 'municipal'),
  ('US-NY-Kings',   'NY', 'Brooklyn',      'county'),
  ('US-NY-Queens',  'NY', 'Queens',        'county'),
  ('US-NY-Bronx',   'NY', 'Bronx',         'county'),
  ('US-NY-New_York','NY', 'Manhattan',     'county'),
  ('US-NY-Richmond','NY', 'Staten Island', 'county'),
  ('US-CA',         'CA', null,            'state'),
  ('US-FL',         'FL', null,            'state'),
  ('US-TX',         'TX', null,            'state')
ON CONFLICT (id) DO NOTHING;


-- ---------------------------------------------------------------------------
-- Section 3 — ENUMs
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'corpus_trust') THEN
    CREATE TYPE corpus_trust AS ENUM ('authority','tenant');
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'vault_visibility') THEN
    CREATE TYPE vault_visibility AS ENUM
      ('public','verified_user','licensed_pro','attorney_only');
  END IF;
END;
$$;


-- ---------------------------------------------------------------------------
-- Section 4 — authority_corpus
-- ---------------------------------------------------------------------------

-- I-A4: owner_org_id is ALWAYS NULL — structurally unpoisonable by any customer.
-- I-A10: embedding column carries identical RLS to content (no embeddings-only export).
CREATE TABLE IF NOT EXISTS authority_corpus (
  id              uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
  document_title  text            NOT NULL,
  domain          text            NOT NULL REFERENCES vault_domains(domain),
  sub_domain      text            NOT NULL,
  jurisdiction_id text            NOT NULL REFERENCES jurisdictions(id),
  document_type   text            NOT NULL
    CHECK (document_type IN (
      'statute','regulation','local_rule','building_code',
      'form_template','court_rule','agency_guidance','ordinance',
      'official_interpretation','contractual_overlay'
    )),
  visibility      vault_visibility NOT NULL DEFAULT 'public',
  trust_class     corpus_trust     NOT NULL DEFAULT 'authority'
    CHECK (trust_class = 'authority'),
  owner_org_id    uuid,                            -- I-A4: ALWAYS NULL
  source_url      text            NOT NULL,
  source_hash     text            NOT NULL,
  publisher       text            NOT NULL,
  retrieved_at    timestamptz     NOT NULL,
  approved_by     text            NOT NULL,
  approved_at     timestamptz     NOT NULL,
  effective_from  date            NOT NULL,        -- I-A13: currency model
  effective_to    date,
  superseded_by   uuid            REFERENCES authority_corpus(id),
  verified_at     timestamptz     NOT NULL,
  reverify_due    timestamptz     NOT NULL,
  chunk_index     int             NOT NULL,
  content         text            NOT NULL,
  content_sha256  text            NOT NULL,
  embedding       vector(1536),                    -- I-A10: same RLS as content
  created_at      timestamptz     NOT NULL DEFAULT now(),
  CONSTRAINT authority_corpus_no_org CHECK (owner_org_id IS NULL),  -- I-A4
  FOREIGN KEY (domain, sub_domain) REFERENCES vault_sub_domains(domain, sub_domain),
  UNIQUE (source_hash, chunk_index)
);

-- Non-vector groundability index — authorisation + currency predicates
-- narrow rows BEFORE the ANN operator fires (I-A9)
CREATE INDEX IF NOT EXISTS ac_groundable ON authority_corpus
  (domain, sub_domain, jurisdiction_id, visibility)
  WHERE effective_to IS NULL AND superseded_by IS NULL;

-- Per-visibility partial HNSW indexes — I-A9: pre-filter before ANN.
-- Authorisation is baked into the index predicate, so an unauthorised tier is
-- not merely filtered out after ranking; it is not in the index being searched.
CREATE INDEX IF NOT EXISTS ac_vec_public   ON authority_corpus
  USING hnsw (embedding vector_cosine_ops)
  WHERE visibility = 'public'        AND superseded_by IS NULL;
CREATE INDEX IF NOT EXISTS ac_vec_verified ON authority_corpus
  USING hnsw (embedding vector_cosine_ops)
  WHERE visibility = 'verified_user' AND superseded_by IS NULL;
CREATE INDEX IF NOT EXISTS ac_vec_licensed ON authority_corpus
  USING hnsw (embedding vector_cosine_ops)
  WHERE visibility = 'licensed_pro'  AND superseded_by IS NULL;
CREATE INDEX IF NOT EXISTS ac_vec_attorney ON authority_corpus
  USING hnsw (embedding vector_cosine_ops)
  WHERE visibility = 'attorney_only' AND superseded_by IS NULL;

ALTER TABLE authority_corpus ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- Section 5 — tenant_corpus
-- ---------------------------------------------------------------------------

-- I-A5: owner_org_id is NOT NULL — no cross-tenant reads are possible.
-- No 'public' visibility tier exists for tenant corpus at all (I-A5).
CREATE TABLE IF NOT EXISTS tenant_corpus (
  id                 uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_org_id       uuid         NOT NULL REFERENCES firms(id) ON DELETE CASCADE,  -- I-A5
  uploaded_by        uuid         NOT NULL REFERENCES users(id),
  document_title     text         NOT NULL,
  domain             text         NOT NULL REFERENCES vault_domains(domain),
  sub_domain         text         NOT NULL,
  jurisdiction_id    text         REFERENCES jurisdictions(id),
  trust_class        corpus_trust NOT NULL DEFAULT 'tenant'
    CHECK (trust_class = 'tenant'),
  screen_state       text         NOT NULL DEFAULT 'pending'
    CHECK (screen_state IN ('pending','clear','quarantined','rejected')),
  screen_findings    jsonb        NOT NULL DEFAULT '[]'::jsonb,
  reviewed_by        uuid         REFERENCES users(id),
  reviewed_at        timestamptz,
  source_kind        text         NOT NULL
    CHECK (source_kind IN ('firm_playbook','template','ocr_extract','user_note')),
  source_document_id uuid         REFERENCES documents(id),
  chunk_index        int          NOT NULL,
  content            text         NOT NULL,
  content_sha256     text         NOT NULL,
  embedding          vector(1536),                -- I-A10: same RLS as content
  created_at         timestamptz  NOT NULL DEFAULT now(),
  FOREIGN KEY (domain, sub_domain) REFERENCES vault_sub_domains(domain, sub_domain)
);

CREATE INDEX IF NOT EXISTS tc_org ON tenant_corpus (owner_org_id, domain, sub_domain);
CREATE INDEX IF NOT EXISTS tc_vec ON tenant_corpus
  USING hnsw (embedding vector_cosine_ops)
  WHERE screen_state = 'clear';                    -- I-A9: pre-filter before ANN

ALTER TABLE tenant_corpus ENABLE ROW LEVEL SECURITY;
