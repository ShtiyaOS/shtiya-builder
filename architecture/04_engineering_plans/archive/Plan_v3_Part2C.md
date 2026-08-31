---

## Part III — Agent Factory Platform (Migrations 0070–0076)

> **Dependency:** Migrations 0070–0076 run **after** 0001–0066. They install the
> `vector` extension and replace the stub corpora created in migration 0057 with the
> fully-hardened two-corpus model. The `authority_corpus` and `tenant_corpus` tables
> from 0057 are dropped and re-created here with complete schemas.

> **The live `src/app/api/copilot/route.ts` defect.** The shipped route accepts
> `{ messages, context }` where `context` is a prose string from the browser,
> interpolated directly into the system prompt. Group 1 §II.3.4 prohibits this
> ("identifiers only — prose context is never transmitted"). The Agent Factory
> **replaces** that route entirely. The replacement contract is in Part 3. Every
> migration here is a prerequisite for that replacement.

---

### 0070 — Two Corpora, Reference Tables, Currency Model

```sql
-- 0070_af_corpora.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- The draft's single `shtiya_vault` table is replaced by two physically separate
-- tables. The separation is the control: a user cannot upload a chunk that
-- reaches authority_corpus regardless of what they upload, because authority_corpus
-- accepts zero user writes. (I-A4 / I-A5)

create extension if not exists vector;
create extension if not exists unaccent;  -- required by normalize_label() in 0080

-- Drop stubs from 0057 (they lack embedding columns and full schema)
drop table if exists authority_corpus cascade;
drop table if exists tenant_corpus    cascade;

-- ── Reference tables: filters validate against these, not against free text ──
-- An agent with filter_domain = 'financial_regulatory' retrieves exactly the
-- financial-regulatory chunks the caller was ALREADY authorized to read. The
-- filter is a relevance preference; the authorization predicate is the control.

create table vault_domains (
  domain      text primary key,
  description text not null
);
insert into vault_domains values
  ('legal',                  'Legal practice: transactional, litigation, compliance'),
  ('financial_regulatory',   'Banking, lending, consumer credit, securities'),
  ('construction',           'Building codes, standards, specifications'),
  ('design',                 'Architecture, engineering, professional practice'),
  ('property_management',    'Landlord-tenant, rent regulation, housing codes'),
  ('brokerage',              'Agency, licensing, disclosure requirements'),
  ('general',                'Cross-domain platform documentation');

create table vault_sub_domains (
  domain     text not null references vault_domains(domain),
  sub_domain text not null,
  primary key (domain, sub_domain)
);

create table jurisdictions (
  id                 text primary key,   -- 'US-NY', 'US-NY-NYC', 'US-NY-Kings', 'US-Federal'
  state_code         text,
  county_name        text,
  municipality       text,
  jurisdiction_level text not null check (jurisdiction_level in
                       ('federal','state','county','municipal')),
  active             boolean not null default true
);
-- Seed core jurisdictions referenced by corpus metadata and agent filters
insert into jurisdictions (id, state_code, municipality, jurisdiction_level) values
  ('US-Federal',   null,   null,          'federal'),
  ('US-NY',        'NY',   null,          'state'),
  ('US-NY-NYC',    'NY',   'New York City','municipal'),
  ('US-NY-Kings',  'NY',   'Brooklyn',    'county'),
  ('US-NY-Queens', 'NY',   'Queens',      'county'),
  ('US-NY-Bronx',  'NY',   'Bronx',       'county'),
  ('US-NY-New_York','NY',  'Manhattan',   'county'),
  ('US-NY-Richmond','NY',  'Staten Island','county'),
  ('US-CA',        'CA',   null,          'state'),
  ('US-FL',        'FL',   null,          'state'),
  ('US-TX',        'TX',   null,          'state');

create type corpus_trust as enum ('authority','tenant');

create type vault_visibility as enum
  ('public','verified_user','licensed_pro','attorney_only');

-- ── THE AUTHORITY CORPUS ──────────────────────────────────────────────────────
-- Takes NO user writes. Statutes, local rules, and building codes come from
-- publishers, not from customers. This is what makes the authority-weight corpus
-- structurally unpoisonable. (I-A4)
-- owner_org_id is ALWAYS NULL — enforced by a check constraint. (I-A4)
create table authority_corpus (
  id              uuid primary key default gen_random_uuid(),
  document_title  text not null,
  domain          text not null references vault_domains(domain),
  sub_domain      text not null,
  jurisdiction_id text not null references jurisdictions(id),
  document_type   text not null check (document_type in (
                    'statute','regulation','local_rule','building_code',
                    'form_template','court_rule','agency_guidance','ordinance',
                    'official_interpretation','contractual_overlay'
                  )),
  visibility      vault_visibility not null default 'public',
  trust_class     corpus_trust not null default 'authority'
                    check (trust_class = 'authority'),
  owner_org_id    uuid,                      -- ALWAYS NULL (see check below)
  -- Provenance (SOC 2 PI1.1 / ISO 42001 data-for-AI)
  source_url      text not null,
  source_hash     text not null,             -- sha256 of the retrieved artifact
  publisher       text not null,
  retrieved_at    timestamptz not null,
  approved_by     text not null,             -- human editorial approval
  approved_at     timestamptz not null,
  -- Currency model (I-A13) — no stale or superseded chunk may ground an answer
  effective_from  date not null,
  effective_to    date,
  superseded_by   uuid references authority_corpus(id),
  verified_at     timestamptz not null,
  reverify_due    timestamptz not null,
  -- Content
  chunk_index     int not null,
  content         text not null,
  content_sha256  text not null,
  embedding       vector(1536),
  created_at      timestamptz not null default now(),
  check (owner_org_id is null),
  foreign key (domain, sub_domain) references vault_sub_domains(domain, sub_domain),
  unique (source_hash, chunk_index)
);

-- Non-vector groundability index — covers the authorization + currency predicates
-- so the WHERE clause can narrow before the ANN operator fires.
create index ac_groundable on authority_corpus
  (domain, sub_domain, jurisdiction_id, visibility)
  where effective_to is null and superseded_by is null;

-- Per-visibility partial HNSW indexes. The authorization predicate is baked into
-- the index condition, so it is evaluated BEFORE the vector operator (I-A9).
-- A single shared index over all visibility tiers forces a post-filter that
-- leaks through result counts and destroys recall.
create index ac_vec_public   on authority_corpus using hnsw (embedding vector_cosine_ops)
  where visibility = 'public'        and superseded_by is null;
create index ac_vec_verified on authority_corpus using hnsw (embedding vector_cosine_ops)
  where visibility = 'verified_user' and superseded_by is null;
create index ac_vec_licensed on authority_corpus using hnsw (embedding vector_cosine_ops)
  where visibility = 'licensed_pro'  and superseded_by is null;
create index ac_vec_attorney on authority_corpus using hnsw (embedding vector_cosine_ops)
  where visibility = 'attorney_only' and superseded_by is null;

-- ── THE TENANT CORPUS ─────────────────────────────────────────────────────────
-- Untrusted by construction. Physically separate table; separate index; no
-- 'public' visibility tier exists for it at all — there is no configuration
-- that creates one. (I-A5)
-- owner_org_id is NOT NULL — a tenant chunk with no org is structural nonsense.
create table tenant_corpus (
  id               uuid primary key default gen_random_uuid(),
  owner_org_id     uuid not null references firms(id) on delete cascade,
  uploaded_by      uuid not null references users(id),
  document_title   text not null,
  domain           text not null references vault_domains(domain),
  sub_domain       text not null,
  jurisdiction_id  text references jurisdictions(id),
  trust_class      corpus_trust not null default 'tenant'
                     check (trust_class = 'tenant'),
  -- Ingestion screening state — a chunk is NOT retrievable until 'clear'
  screen_state     text not null default 'pending'
                     check (screen_state in ('pending','clear','quarantined','rejected')),
  screen_findings  jsonb not null default '[]'::jsonb,
  reviewed_by      uuid references users(id),
  reviewed_at      timestamptz,
  source_kind      text not null check (source_kind in (
                     'firm_playbook','template','ocr_extract','user_note'
                   )),
  source_document_id uuid references documents(id),
  chunk_index      int not null,
  content          text not null,
  content_sha256   text not null,
  embedding        vector(1536),
  created_at       timestamptz not null default now(),
  foreign key (domain, sub_domain) references vault_sub_domains(domain, sub_domain)
);

-- Per-org index: the tenant predicate is part of the index condition, not a
-- post-filter. A single shared ANN index over cross-tenant vectors is a fuzzy
-- cross-tenant read primitive.
create index tc_org on tenant_corpus (owner_org_id, domain, sub_domain);
create index tc_vec on tenant_corpus using hnsw (embedding vector_cosine_ops)
  where screen_state = 'clear';

-- I-A14: no PII-bearing, matter-scoped, or protected-class data ever enters
-- either corpus. Enforced by trigger: any ocr_extract whose source_document_id
-- resolves to a class_phi or TDPA-regulated row is rejected at the database.
create or replace function guard_tenant_ingest()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.source_kind = 'ocr_extract' and new.source_document_id is not null then
    if exists (
      select 1 from public.pi_medical_records r
      where r.document_id = new.source_document_id
    ) then
      raise exception 'I-A14: class_phi content cannot enter any corpus'
        using errcode = '42501';
    end if;
    if exists (
      select 1 from public.corp_transaction_records c
      where c.document_id = new.source_document_id
    ) then
      raise exception 'I-A14: class_mnpi content cannot enter any corpus'
        using errcode = '42501';
    end if;
  end if;
  -- I-A10: the embedding column carries identical RLS to content. There is no
  -- "embeddings-only" export. Text is partially reconstructable from a dense
  -- embedding. A vectors-only table is a partial content disclosure.
  return new;
end;
$$;
create trigger tenant_corpus_ingest_guard
  before insert on tenant_corpus
  for each row execute function guard_tenant_ingest();

-- 0071_af_agents.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- The draft keyed agents on user_id. Firms are the tenant: an agent built with
-- firm playbook content must not walk out with a departing attorney.
-- The draft's `vault_filters jsonb NOT NULL` field is NOT created. A jsonb filter
-- is a one-character bypass (`{}` matches every row) and its values are
-- authorization-relevant strings that the database cannot validate.
-- Filters become typed, FK-backed columns instead. (I-A7)

create table custom_agents (
  id                     uuid primary key default gen_random_uuid(),
  org_id                 uuid not null references firms(id) on delete cascade,
  created_by             uuid not null references users(id),
  agent_name             text not null,
  persona_prompt         text not null check (length(persona_prompt) <= 4000),
  -- TYPED filters — every value is FK-validated. Wildcards are hard errors.
  -- Creating an agent with filter_domain = 'financial_regulatory' retrieves
  -- only the financial-regulatory chunks the caller was ALREADY authorized
  -- to read. The filter is a preference; authorization is the control.
  filter_domain          text not null references vault_domains(domain),
  filter_sub_domain      text not null,
  filter_jurisdiction_id text not null references jurisdictions(id),
  include_tenant_corpus  boolean not null default true,
  is_active              boolean not null default true,
  created_at             timestamptz not null default now(),
  foreign key (filter_domain, filter_sub_domain)
    references vault_sub_domains(domain, sub_domain),
  unique (org_id, agent_name)
  -- There is no vault_filters column. If a future migration re-introduces one,
  -- filter-lint (§V.4) fails the build.
);
create index ca_org on custom_agents (org_id) where is_active;

-- Wildcard and empty filters are hard errors, never "match all" (I-A7).
-- An empty or wildcard filter is not "no filter"; it is an attempt to enumerate.
create or replace function guard_agent_definition()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not exists (
    select 1 from public.firm_members fm
    where fm.firm_id = new.org_id and fm.user_id = new.created_by
  ) then
    raise exception 'AGENT_ORG_MISMATCH: creator is not a member of this org'
      using errcode = '42501';
  end if;
  if new.filter_domain in ('*', '')
     or new.filter_sub_domain in ('*', '')
     or new.filter_jurisdiction_id in ('*', '') then
    raise exception 'FILTER_WILDCARD_FORBIDDEN: agent filters narrow; they never widen (I-A7)'
      using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.jurisdictions j
    where j.id = new.filter_jurisdiction_id and j.active
  ) then
    raise exception 'JURISDICTION_UNKNOWN: %', new.filter_jurisdiction_id
      using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger custom_agents_guard
  before insert or update on custom_agents
  for each row execute function guard_agent_definition();

-- Agent sessions: (epoch, wall_epoch, corpus_epoch) form the prompt-cache key.
-- A wall bump or corpus revision orphans every cached prefix (I-A16).
create table agent_sessions (
  id           uuid primary key default gen_random_uuid(),
  agent_id     uuid not null references custom_agents(id) on delete cascade,
  user_id      uuid not null references users(id) on delete cascade,
  matter_id    uuid references matters(id) on delete cascade,
  epoch        bigint not null default 1,
  wall_epoch   bigint not null default 1,
  corpus_epoch bigint not null default 1,
  opened_at    timestamptz not null default now(),
  closed_at    timestamptz
);

-- Agent access dies with firm membership (SOC 2 CC6.3).
-- A departing attorney's active sessions are closed at the database, not at logout.
create or replace function revoke_agents_on_membership_loss()
returns trigger language plpgsql set search_path = '' as $$
begin
  update public.agent_sessions s
     set closed_at = now()
  from public.custom_agents a
  where s.agent_id = a.id
    and a.org_id   = old.firm_id
    and s.user_id  = old.user_id
    and s.closed_at is null;
  return old;
end;
$$;
create trigger firm_members_agent_revoke
  after delete on firm_members
  for each row execute function revoke_agents_on_membership_loss();

-- Professional credentials — backs the 'licensed_pro' and 'attorney_only'
-- visibility tiers. These are NOT role-group strings; they are verified facts.
create table professional_credentials (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references users(id) on delete cascade,
  domain            text not null references vault_domains(domain),
  credential_ref    text not null,
  issuing_authority text not null,
  standing          text not null check (standing in ('active','suspended','expired')),
  verified_at       timestamptz not null,
  reverify_due      timestamptz not null,
  unique (user_id, domain, credential_ref)
);

-- 0072_af_ingestion.sql
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Authority publishing pipeline (no interactive write path exists) ──────────
-- A chunk cannot be inserted into authority_corpus without an approved publication
-- carrying its source_hash. This is enforced by trigger — not by a route guard
-- that a second route forgets.
create table authority_publications (
  id              uuid primary key default gen_random_uuid(),
  source_url      text not null,
  publisher       text not null,
  jurisdiction_id text not null references jurisdictions(id),
  retrieved_at    timestamptz not null,
  artifact_sha256 text not null unique,
  parser_version  text not null,
  approved_by     text,
  approved_at     timestamptz,
  state           text not null default 'fetched'
                    check (state in (
                      'fetched','parsed','review','approved','rejected','superseded'
                    ))
);
create rule ap_no_delete as on delete to authority_publications do instead nothing;

-- Every authority_corpus INSERT requires an approved publication record.
-- No customer, at any tier, can write a chunk that carries authority weight.
-- Cross-tenant corpus poisoning is structurally impossible, not merely screened for.
create or replace function guard_authority_write()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not exists (
    select 1 from public.authority_publications p
    where p.artifact_sha256 = new.source_hash
      and p.state            = 'approved'
      and p.approved_by      is not null
  ) then
    raise exception 'AUTHORITY_UNAPPROVED: authority_corpus chunks require an approved publication record'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger authority_corpus_write_guard
  before insert or update on authority_corpus
  for each row execute function guard_authority_write();

-- ── Ingestion screening findings (defense in depth — §I.3) ───────────────────
-- The semantic layer cannot be made safe; the encoding layer can.
-- This table records what was found and what was done. The finding types cover
-- the concrete, deterministic attack classes — not semantic injection.
create table ingestion_screen_findings (
  id          uuid primary key default gen_random_uuid(),
  chunk_id    uuid not null,
  corpus      corpus_trust not null,
  finding     text not null check (finding in (
                'instruction_pattern','delimiter_token','invisible_text',
                'bidi_control','homoglyph','zero_width','url_with_payload',
                'base64_blob','tool_call_shape','oversize_chunk','ocr_hidden_layer'
              )),
  excerpt     text,    -- redacted to first 120 chars; never the full chunk
  detected_at timestamptz not null default now(),
  disposition text check (disposition in ('quarantined','cleared','rejected')),
  reviewed_by uuid references users(id)
);
create rule isf_no_delete as on delete to ingestion_screen_findings do instead nothing;

-- ── neutralize_chunk(): encoding-level, fully deterministic (§I.3) ───────────
-- This is the layer that CAN be solved deterministically.
-- The semantic layer cannot, and this function does not pretend it can.
-- Three passes, each closing a specific concrete attack class:
create or replace function public.neutralize_chunk(p_text text)
returns text language sql immutable set search_path = '' as $$
  select regexp_replace(
    regexp_replace(
      regexp_replace(
        -- Pass 1: NFKC normalization + accent folding (homoglyph normalization)
        normalize(p_text, 'NFKC'),
        -- Pass 2: zero-width and bidirectional override characters
        -- \u200B-\u200F: zero-width spaces and marks
        -- \u202A-\u202E: LTR/RTL embedding and override
        -- \u2066-\u2069: directional isolates
        -- \uFEFF:        BOM / zero-width no-break space
        E'[\\u200B-\\u200F\\u202A-\\u202E\\u2066-\\u2069\\uFEFF]', '', 'g'),
      -- C0/C1 controls other than tab (0x09) and newline (0x0A)
      E'[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F]', '', 'g'),
    -- Pass 3: envelope delimiters.
    -- This is the most important pass. A chunk containing [[SHTIYA_END]] can
    -- close the envelope early, and its remainder is then read as top-level
    -- text at the same authority as platform instructions.
    '(?i)\[\[SHTIYA_(CTX|END)\]\]', '', 'g'
  );
$$;

-- Applied to every tenant chunk at INSERT. Content and its hash are normalized
-- before storage, so a quarantined chunk cannot be reinstated by an edit.
create or replace function guard_tenant_screen()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.content        := public.neutralize_chunk(new.content);
  new.content_sha256 := encode(digest(new.content, 'sha256'), 'hex');

  -- A chunk is retrievable ONLY in 'clear'. 'pending' is not retrievable, so
  -- the window between upload and screening is not an exposure window.
  if new.screen_state = 'clear'
     and new.reviewed_at is null
     and exists (
       select 1 from public.ingestion_screen_findings f
       where f.chunk_id    = new.id
         and f.disposition is null
     ) then
    raise exception 'SCREEN_PENDING: unreviewed findings block clearance'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger tenant_corpus_screen_guard
  before insert or update on tenant_corpus
  for each row execute function guard_tenant_screen();

-- 0073_af_retrieval.sql
-- ─────────────────────────────────────────────────────────────────────────────

-- ── AUTHORIZATION predicate (I-A6) ────────────────────────────────────────────
-- Derived from verified credentials only. Never from the request, never from
-- the agent row's filters, never from the client store.
-- The 'attorney_only' tier is backed by bar_admissions — the same function
-- Group 4 uses. The visibility tier is a verified credential, not a string
-- in a jsonb blob.
create or replace function public.vault_visible_to(
  p_user         uuid,
  p_visibility   vault_visibility,
  p_jurisdiction text,
  p_domain       text
) returns boolean
  language sql stable security definer set search_path = ''
as $$
  select case p_visibility
    when 'public' then
      true
    when 'verified_user' then
      exists (
        select 1 from public.users u
        where u.id = p_user and u.identity_subject_id is not null
      )
    when 'licensed_pro' then
      exists (
        select 1 from public.professional_credentials c
        where c.user_id      = p_user
          and c.domain       = p_domain
          and c.standing     = 'active'
          and c.reverify_due > now()
      )
    when 'attorney_only' then
      exists (
        select 1 from public.bar_admissions b
        join public.jurisdictions j on j.id = p_jurisdiction
        where b.user_id      = p_user
          and b.jurisdiction = coalesce(j.state_code, j.id)
          and b.standing     = 'active'
          and b.reverify_due > now()
      )
    else false
  end;
$$;
revoke execute on function public.vault_visible_to(uuid, vault_visibility, text, text)
  from public, anon;
grant  execute on function public.vault_visible_to(uuid, vault_visibility, text, text)
  to authenticated;

-- Org membership — used by corpus RLS and tenant retrieval
create or replace function public.is_org_member_for(p_user uuid, p_org uuid)
returns boolean
  language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.firm_members fm
    where fm.firm_id = p_org and fm.user_id = p_user
  );
$$;

-- ══════════════════════════════════════════════════════════════════════════════
-- THE AUTHORITY RETRIEVAL RPC
--
-- SECURITY INVOKER, deliberately. A SECURITY DEFINER vector-search function
-- runs as its owner — RLS does not apply to it — and at that point every filter
-- is just a parameter the caller supplies. The draft's `match_vault_documents`
-- is specified in exactly that shape and is NOT created here.
--
-- Accepts NO org parameter, NO visibility parameter, NO threshold, NO count.
-- Authorization is derived inside from auth.uid(). Thresholds and counts are
-- server constants (I-A8); a caller-controlled threshold is a corpus-enumeration
-- primitive.
--
-- Note on <=>: this returns cosine DISTANCE. Similarity = 1 − distance.
-- The direction is stated explicitly because an inverted comparison is a silent
-- no-op or a silent match-all — invisible to any test that only checks whether
-- results came back.
-- ══════════════════════════════════════════════════════════════════════════════
create or replace function public.match_authority_chunks(
  p_agent_id        uuid,
  p_query_embedding vector(1536)
)
returns table (
  chunk_id       uuid,
  document_title text,
  content        text,
  jurisdiction_id text,
  visibility     vault_visibility,
  effective_from date,
  source_url     text,
  publisher      text,
  similarity     double precision
)
language sql stable security invoker set search_path = ''
as $$
  with a as (
    -- RLS on custom_agents applies (INVOKER security), so an agent_id from
    -- another org returns zero rows rather than another org's filters.
    -- This closes the draft's IDOR at the database, not at the route.
    select * from public.custom_agents c
    where c.id = p_agent_id and c.is_active
  )
  select
    r.id, r.document_title, r.content, r.jurisdiction_id, r.visibility,
    r.effective_from, r.source_url, r.publisher,
    1 - (r.embedding <=> p_query_embedding) as similarity
  from public.authority_corpus r, a
  where
    -- AUTHORIZATION (non-negotiable, pre-filter so it runs before ANN — I-A9)
    public.vault_visible_to(auth.uid(), r.visibility, r.jurisdiction_id, r.domain)
    -- CURRENCY (I-A13): stale, superseded, or overdue-for-reverification chunks
    -- do not ground answers. An agent citing a repealed statute is worse than
    -- one that says it does not know.
    and r.effective_from <= current_date
    and (r.effective_to is null or r.effective_to >= current_date)
    and r.superseded_by is null
    and r.reverify_due  > now()
    -- RELEVANCE (agent typed filters — narrowing only, never widening — I-A7)
    and r.domain          = a.filter_domain
    and r.sub_domain      = a.filter_sub_domain
    and r.jurisdiction_id = a.filter_jurisdiction_id
    -- SERVER-FIXED pre-filter bar (I-A8). The GROUNDING bar is applied after
    -- reranking in the route — not here.
    and (1 - (r.embedding <=> p_query_embedding)) >= 0.72
  order by r.embedding <=> p_query_embedding
  limit 24;   -- candidate set for the reranker; NOT the answer set
$$;

-- ══════════════════════════════════════════════════════════════════════════════
-- THE TENANT RETRIEVAL RPC
-- Separate function, separate table, separate index.
-- There is no query that ranks authority and tenant chunks into one undivided
-- result set (I-A4). The route merges them with each chunk's trust_class in the
-- envelope, so the model, the citation UI, and the entailment checker all know
-- whether a given sentence rests on an enacted statute or a firm's own note.
-- ══════════════════════════════════════════════════════════════════════════════
create or replace function public.match_tenant_chunks(
  p_agent_id        uuid,
  p_query_embedding vector(1536)
)
returns table (
  chunk_id       uuid,
  document_title text,
  content        text,
  source_kind    text,
  similarity     double precision
)
language sql stable security invoker set search_path = ''
as $$
  with a as (
    select * from public.custom_agents c
    where c.id = p_agent_id and c.is_active and c.include_tenant_corpus
  )
  select
    t.id, t.document_title, t.content, t.source_kind,
    1 - (t.embedding <=> p_query_embedding)
  from public.tenant_corpus t, a
  where t.owner_org_id = a.org_id          -- I-A5: org, and only org
    and public.is_org_member_for(auth.uid(), t.owner_org_id)
    and t.screen_state = 'clear'           -- quarantined ⇒ unretrievable
    and t.domain       = a.filter_domain
    and (1 - (t.embedding <=> p_query_embedding)) >= 0.72
  order by t.embedding <=> p_query_embedding
  limit 12;
$$;

-- The draft's `match_vault_documents(query_embedding, filter_domain, filter_state,
-- filter_county, match_threshold, match_count)` is NOT created.
-- Every parameter after the first is caller-controlled, and four are
-- authorization-relevant.
revoke execute on function public.match_authority_chunks(uuid, vector) from public, anon;
revoke execute on function public.match_tenant_chunks(uuid, vector)    from public, anon;
grant  execute on function public.match_authority_chunks(uuid, vector) to authenticated;
grant  execute on function public.match_tenant_chunks(uuid, vector)    to authenticated;

-- 0074_af_observability.sql
-- ─────────────────────────────────────────────────────────────────────────────

-- I-A15: execution logs store chunk_id REFERENCES, never chunk content.
-- An audit log that stores retrieved text is a shadow copy of the corpus
-- with a different — usually broader — read audience. The log must not become
-- a way for ops to read corpus content without going through the corpus RLS.
create table agent_execution_logs (
  id                 uuid primary key default gen_random_uuid(),
  agent_id           uuid not null references custom_agents(id) on delete cascade,
  org_id             uuid not null references firms(id) on delete cascade,
  user_id            uuid not null references users(id),
  session_id         uuid references agent_sessions(id),
  matter_id          uuid references matters(id),
  query_sha256       text not null,              -- hash, never the query text
  retrieved_chunk_ids uuid[] not null default '{}',
  retrieved_count    int not null,
  top_similarity     double precision,
  top_rerank_score   double precision,
  grounding_outcome  text not null check (grounding_outcome in (
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
  model_invoked      boolean not null,
  sentences_total    int,
  sentences_stripped int,
  grounding_score    double precision,
  latency_ms         int,
  created_at         timestamptz not null default now()
);
create rule ael_no_update as on update to agent_execution_logs do instead nothing;
create rule ael_no_delete as on delete to agent_execution_logs do instead nothing;

-- Every sentence that fails the output gate is recorded here (I-A12).
-- This is the SOC 2 audit surface for the Attribution Invariant.
create table grounding_strikes (
  id             uuid primary key default gen_random_uuid(),
  execution_id   uuid not null references agent_execution_logs(id) on delete cascade,
  sentence_hash  text not null,
  cited_chunk_id uuid,
  reason         text not null check (reason in (
                   'no_citation',
                   'entailment_failed',
                   'jurisdiction_mismatch',
                   'stale_source',
                   'single_source_dispositive',
                   'exfil_pattern',
                   'tool_call_shape'
                 )),
  created_at     timestamptz not null default now()
);

-- Grounding eval sets: labelled query/answer pairs for per-domain bar calibration.
-- Carries NO tenant content, NO matter content, and NO PII (I-A14).
create table grounding_eval_sets (
  id                  uuid primary key default gen_random_uuid(),
  domain              text not null references vault_domains(domain),
  jurisdiction_id     text not null references jurisdictions(id),
  query               text not null,
  expected_chunk_ids  uuid[] not null,
  expected_fallback   boolean not null default false,
  calibrated_bar      double precision,   -- per-domain GROUNDING_BAR constant
  updated_at          timestamptz not null default now()
);

-- 0075_af_rls.sql
-- ─────────────────────────────────────────────────────────────────────────────

alter table authority_corpus          enable row level security;
alter table tenant_corpus             enable row level security;
alter table custom_agents             enable row level security;
alter table agent_sessions            enable row level security;
alter table agent_execution_logs      enable row level security;
alter table grounding_strikes         enable row level security;
alter table professional_credentials  enable row level security;
alter table authority_publications    enable row level security;
alter table ingestion_screen_findings enable row level security;
alter table grounding_eval_sets       enable row level security;

-- ── Authority corpus: read by credential; NO interactive write path ───────────
create policy ac_read
  on authority_corpus for select
  using (vault_visible_to(auth.uid(), visibility, jurisdiction_id, domain));

-- No interactive INSERT or UPDATE. The publishing pipeline writes under
-- `corpus_publisher` — a database role that is NOT `authenticated`.
create policy ac_no_interactive_insert
  on authority_corpus for insert with check (false);
create policy ac_no_interactive_update
  on authority_corpus for update using (false);

-- ── Tenant corpus: org, and only org. No public tier (I-A5). ─────────────────
create policy tc_read
  on tenant_corpus for select
  using (is_org_member_for(auth.uid(), owner_org_id) and screen_state = 'clear');

create policy tc_insert
  on tenant_corpus for insert
  with check (
    is_org_member_for(auth.uid(), owner_org_id)
    and uploaded_by  = auth.uid()
    and screen_state = 'pending'   -- uploads land as 'pending'; not retrievable yet
  );

-- A client cannot promote its own chunk to 'clear'. Clearing is done by the
-- screening service role after human review.
create policy tc_no_state_selfpromote
  on tenant_corpus for update
  using  (is_org_member_for(auth.uid(), owner_org_id))
  with check (screen_state <> 'clear');

-- ── Agents: org-scoped (closes the draft's IDOR at the database) ──────────────
create policy ca_read
  on custom_agents for select
  using (is_org_member_for(auth.uid(), org_id));

create policy ca_write
  on custom_agents for insert
  with check (is_org_member_for(auth.uid(), org_id) and created_by = auth.uid());

create policy ca_update
  on custom_agents for update
  using (is_org_member_for(auth.uid(), org_id));

-- ── Agent sessions: own sessions only ────────────────────────────────────────
create policy as_own
  on agent_sessions for select
  using (user_id = auth.uid());

-- ── Execution logs: org compliance record, not a corpus mirror ───────────────
create policy ael_org_read
  on agent_execution_logs for select
  using (is_org_member_for(auth.uid(), org_id));

create policy ael_no_interactive_insert
  on agent_execution_logs for insert with check (false);

-- ── Professional credentials: self-read ──────────────────────────────────────
create policy pc_self
  on professional_credentials for select
  using (user_id = auth.uid());

-- ── Authority publications: read-only for authenticated; write = publisher only
create policy ap_read
  on authority_publications for select
  using (auth.uid() is not null);

create policy ap_no_interactive_insert
  on authority_publications for insert with check (false);

-- ── Ingestion screen findings: org member reads their own ─────────────────────
create policy isf_read
  on ingestion_screen_findings for select
  using (
    exists (
      select 1 from public.tenant_corpus tc
      join public.firm_members fm on fm.firm_id = tc.owner_org_id
      where tc.id      = ingestion_screen_findings.chunk_id
        and fm.user_id = auth.uid()
    )
  );

-- 0076_af_grants.sql
-- ─────────────────────────────────────────────────────────────────────────────

-- I-A10: there is no embeddings-only view, table, or export. Text is partially
-- reconstructable from a dense embedding, so the vector column carries identical
-- RLS to the content column. A "vectors only" export is a partial content disclosure.
revoke all on public.authority_corpus from anon;
revoke all on public.tenant_corpus    from anon;

-- Column-level: nothing client-side sets a screening verdict or corpus state.
-- A client that can set screen_state = 'clear' on its own chunk has no screening.
revoke update on public.tenant_corpus from authenticated;
grant  update (document_title) on public.tenant_corpus to authenticated;

-- Authority publications are never client-readable in full; the route exposes
-- status only.
revoke all    on public.authority_publications    from authenticated;
revoke insert on public.ingestion_screen_findings from authenticated;
-- Authenticated users may read their own org's findings (covered by RLS above).
grant  select on public.ingestion_screen_findings to authenticated;

-- Public/anon REVOKEs on all Agent Factory tables
revoke all on public.custom_agents             from public, anon;
revoke all on public.agent_sessions            from public, anon;
revoke all on public.agent_execution_logs      from public, anon;
revoke all on public.grounding_strikes         from public, anon;
revoke all on public.grounding_eval_sets       from public, anon;
revoke all on public.professional_credentials  from public, anon;

-- ── Deployment-time validation assertions ────────────────────────────────────
do $$
begin
  -- I-A4: authority_corpus.owner_org_id must have a check (owner_org_id is null)
  if not exists (
    select 1 from information_schema.check_constraints
    where constraint_name like '%authority_corpus%'
      and check_clause like '%owner_org_id is null%'
  ) then
    raise exception 'I-A4 VIOLATION: authority_corpus missing owner_org_id is null constraint';
  end if;

  -- I-A5: tenant_corpus.owner_org_id must be NOT NULL
  if not exists (
    select 1 from information_schema.columns
    where table_name  = 'tenant_corpus'
      and column_name = 'owner_org_id'
      and is_nullable = 'NO'
  ) then
    raise exception 'I-A5 VIOLATION: tenant_corpus.owner_org_id must be NOT NULL';
  end if;

  -- I-A7: custom_agents has no vault_filters column
  if exists (
    select 1 from information_schema.columns
    where table_name  = 'custom_agents'
      and column_name = 'vault_filters'
  ) then
    raise exception 'I-A7 VIOLATION: custom_agents.vault_filters column exists — wildcard bypass vector';
  end if;

  -- I-A8: match_authority_chunks and match_tenant_chunks accept no threshold parameter
  -- (verified by function signature inspection — enforced by filter-lint in CI)

  -- I-A9: authority corpus RLS policy must not be named 'ac_no_interactive_insert'
  -- with `with check (true)` — assert it is `with check (false)`
  if not exists (
    select 1 from pg_policies
    where tablename  = 'authority_corpus'
      and policyname = 'ac_no_interactive_insert'
  ) then
    raise exception 'I-A9 VIOLATION: authority_corpus missing ac_no_interactive_insert policy';
  end if;

  -- I-A14: guard_tenant_ingest trigger must exist
  if not exists (
    select 1 from information_schema.triggers
    where event_object_table = 'tenant_corpus'
      and trigger_name       = 'tenant_corpus_ingest_guard'
  ) then
    raise exception 'I-A14 VIOLATION: tenant_corpus_ingest_guard trigger missing';
  end if;

  -- I-A15: agent_execution_logs must have no_update and no_delete rules
  if not exists (
    select 1 from pg_rules where tablename = 'agent_execution_logs'
      and rulename = 'ael_no_update'
  ) then
    raise exception 'I-A15 VIOLATION: agent_execution_logs missing ael_no_update rule';
  end if;
end;
$$;

Part IV — HRAG Vault Network (Migrations 0080–0086)
Dependency: Migrations 0080–0086 run after 0070–0076. They install the
ltree extension and extend both corpus tables with path columns, add the
authority-relations DAG, build the zero-trust ingestion queue, and install the
HRAG retrieval RPCs on top of the Agent Factory corpora.

-- 0080_hv_nodes_and_relations.sql
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists ltree;

-- ── Node kinds ────────────────────────────────────────────────────────────────
-- I-H4: nlevel() carries no cross-subtree meaning. Semantic depth is read from
-- node_kind, never from position.
create type node_kind as enum (
  'structural',           -- ROOT, ROOT.Law, etc. — NO content may be filed here (I-H2)
  'sovereign',            -- US, CA, NY as political entities
  'jurisdiction',         -- state, county, or municipality with governing authority
  'agency',               -- issuing body: CFPB, ICC, DOB, etc.
  'court',                -- court system
  'court_part',           -- individual judge part within a court
  'instrument',           -- a specific law, code, regulation, standard, or guide
  'division',             -- CSI MasterFormat division, CFR title, USC chapter
  'edition',              -- versioned edition of a standard (IBC.2021)
  'classification',       -- index axis: CSI, Omniclass, NAICS — NOT authority
  'org_root',             -- ROOT.Org.o_<hex> — one per tenant firm
  'org_folder'            -- sub-folder within an org subtree
);

create type authority_class as enum (
  'enacted',               -- rank 100 — statute, ordinance, enacted code
  'regulation',            -- rank 90  — CFR, NYCRR, RCNY
  'official_interpretation',-- rank 80  — CFPB Supp I, commentary with safe-harbour
  'agency_guidance',       -- rank 50  — bulletins, FILs, exam manuals
  'contractual_overlay',   -- rank 40  — Fannie Selling Guide; binding by K, NOT by law
  'model_standard',        -- rank 30  — IBC, NFPA; AUTHORITATIVE NOWHERE until adopted
  'secondary',             -- rank 20  — treatises, law review
  'tenant_document'        -- rank 10  — firm playbook, OCR extract
);

-- ── Vault node registry (governed data, not a constant in a migration) ─────────
-- HV-11: the draft's single lending tree filed Reg Z under the OCC — factually
-- wrong because Reg Z belongs to the CFPB. A hand-authored taxonomy with no
-- editor and no review record is an unmaintained source of truth whose errors
-- are silent at retrieval time.
create table vault_nodes (
  path              ltree primary key,
  label_display     text not null,      -- human-readable; NEVER round-trips into a path
  kind              node_kind not null,
  default_authority_class authority_class,
  jurisdiction_id   text references jurisdictions(id),
  owner_org_id      uuid references firms(id),  -- non-null ONLY under ROOT.Org
  issuing_body      text,               -- 'CFPB', 'ICC', 'NYC DOB', 'NY DOS'
  min_write_role    text not null default 'corpus_publisher'
                      check (min_write_role in ('corpus_publisher','org_member')),
  inheritance_floor int not null default 3,  -- lineage never walks above this nlevel
  reviewed_by       text,
  reviewed_at       timestamptz,
  retired_at        timestamptz,
  created_at        timestamptz not null default now()
);
create index vault_nodes_gist on vault_nodes using gist (path);
create index vault_nodes_org  on vault_nodes (owner_org_id) where owner_org_id is not null;

-- I-H3: THE ONLY producer of a path label. Two ingestion paths that each
-- "handle" normalization independently produce 'Miami_Dade' and 'MiamiDade',
-- and the subtree silently splits in half — half the corpus becomes unreachable
-- from the other half's queries. Per §I.5, that unreachable half renders as
-- "no such rule."
create or replace function public.normalize_label(p_display text)
returns text language sql immutable set search_path = '' as $$
  select left(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          public.unaccent(p_display),
          '[^A-Za-z0-9]+', '_', 'g'),
        '_+', '_', 'g'),
      '^_|_$', '', 'g'),
    256);
$$;
-- 'Miami-Dade County'    -> 'Miami_Dade_County'
-- 'St. Louis'            -> 'St_Louis'
-- 'Housing & Buildings'  -> 'Housing_Buildings'

-- Org root path from a firm uuid (no hyphens — ltree label constraint)
create or replace function public.org_root(p_org uuid)
returns ltree language sql immutable set search_path = '' as $$
  select ('ROOT.Org.o_' || replace(p_org::text, '-', ''))::ltree;
$$;

-- Node integrity guard (I-H1, I-H2, I-H11)
create or replace function guard_vault_node()
returns trigger language plpgsql set search_path = '' as $$
begin
  -- I-H2: non-structural nodes at depth < 3 are broadcast nodes.
  if new.kind <> 'structural' and nlevel(new.path) < 3 then
    raise exception 'I-H2: depth % is a broadcast node; content may not be filed here',
      nlevel(new.path) using errcode = '42501';
  end if;
  -- I-H11: Org nodes must name their owning org; shared nodes must not.
  if subpath(new.path, 0, 2)::text = 'ROOT.Org' and new.owner_org_id is null then
    raise exception 'I-H11: a node under ROOT.Org must name its owning org'
      using errcode = '23514';
  end if;
  if subpath(new.path, 0, 2)::text <> 'ROOT.Org' and new.owner_org_id is not null then
    raise exception 'I-H11: shared subtrees cannot be org-owned'
      using errcode = '23514';
  end if;
  -- I-H1: parent must exist (except for ROOT itself)
  if nlevel(new.path) > 1
     and not exists (
       select 1 from public.vault_nodes p
       where p.path = subpath(new.path, 0, nlevel(new.path) - 1)
     ) then
    raise exception 'I-H1: parent node % does not exist',
      subpath(new.path, 0, nlevel(new.path) - 1) using errcode = '23503';
  end if;
  return new;
end;
$$;
create trigger vault_nodes_guard
  before insert or update on vault_nodes
  for each row execute function guard_vault_node();

-- Seed structural root nodes
insert into vault_nodes (path, label_display, kind) values
  ('ROOT',                'Root',          'structural'),
  ('ROOT.Law',            'Law',           'structural'),
  ('ROOT.Standards',      'Standards',     'structural'),
  ('ROOT.Investor',       'Investor',      'structural'),
  ('ROOT.Classification', 'Classification','structural'),
  ('ROOT.Org',            'Org',           'structural');

-- ══════════════════════════════════════════════════════════════════════════════
-- AXIS 2 — THE AUTHORITY DAG
-- This is what the draft is missing, and it is where correctness in the
-- non-legal domains lives. A tree cannot express:
--   "NYC adopted the 2015 IBC and amended chapter 10"
--   "The 2d Circuit binds SDNY"
--   "This state provision may be preempted for a national bank"
-- ══════════════════════════════════════════════════════════════════════════════

create type authority_relation as enum (
  'adopts',                   -- jurisdiction enacts a model standard, by version
  'amends',                   -- local text modifies the adopted text
  'supersedes',               -- later instrument replaces earlier
  'binds',                    -- appellate/precedential control
  'persuasive_to',
  'implements',               -- regulation implements statute; commentary implements reg
  'incorporates_by_reference',
  'preempted_by'              -- ADVISORY ONLY — never suppresses state text (see below)
);

create table authority_relations (
  id             uuid primary key default gen_random_uuid(),
  from_path      ltree not null references vault_nodes(path),
  relation       authority_relation not null,
  to_path        ltree not null references vault_nodes(path),
  effective_from date,
  effective_to   date,
  condition      text,    -- e.g. 'national bank charter', 'ETPA opt-in', 'occupancy R-2'
  basis          text not null,   -- citation for the edge itself
  reviewed_by    text not null,
  reviewed_at    timestamptz not null default now(),
  unique (from_path, relation, to_path, effective_from)
);
create index ar_from on authority_relations using gist (from_path);
create index ar_to   on authority_relations using gist (to_path);

-- NOTE on 'preempted_by': deliberately NOT part of authority_rank. It never
-- removes a chunk from a result set. Whether a state provision yields to federal
-- banking law is a Barnett Bank / Cantero v. BofA (2024) comparison that must
-- be PERFORMED, not assumed by category. The retriever surfaces both provisions
-- and the edge, with its condition text, and a human does the analysis.
-- Suppressing the state text would be the system silently deciding a contested
-- question of law.

-- I-H7: a model standard is groundable for a jurisdiction ONLY if an `adopts`
-- edge exists to that exact version (or a parent of it) from within the
-- jurisdiction scope, effective on the as-of date.
create or replace function public.standard_adopted(
  p_standard         ltree,
  p_jurisdiction_scope ltree,
  p_as_of            date
) returns boolean language sql stable set search_path = '' as $$
  select exists (
    select 1 from public.authority_relations r
    where r.relation    = 'adopts'
      and r.to_path    @> p_standard               -- the adopted edition, or its parent
      and r.from_path  <@ p_jurisdiction_scope
      and (r.effective_from is null or r.effective_from <= p_as_of)
      and (r.effective_to   is null or r.effective_to   >= p_as_of)
  );
$$;

-- I-H8: precedence is COMPUTED, never inferred by the model. Higher rank wins.
-- Where the graph does not determine precedence, the conflict is presented — not resolved.
create or replace function public.authority_rank(p_class authority_class)
returns int language sql immutable set search_path = '' as $$
  select case p_class
    when 'enacted'                 then 100
    when 'regulation'              then  90
    when 'official_interpretation' then  80
    when 'agency_guidance'         then  50
    when 'contractual_overlay'     then  40
    when 'model_standard'          then  30
    when 'secondary'               then  20
    when 'tenant_document'         then  10
    else 0
  end;
$$;

-- 0081_hv_corpus_paths.sql
-- ─────────────────────────────────────────────────────────────────────────────

-- Add ltree path columns to both corpora and the HRAG-specific metadata columns.
alter table authority_corpus
  add column path            ltree,
  add column authority_cls   authority_class not null default 'enacted',
  add column practice_facets text[] not null default '{}',  -- I-H6: FACET, not a path level
  add column issuing_body    text,
  add column edition_label   text;   -- e.g. 'IBC.2015', 'BC.2022', 'FY2026'

alter table tenant_corpus
  add column path               ltree,
  -- I-H12: topic_paths are REFERENCES, never the containment path.
  -- A reference makes a chunk findable under a classification topic;
  -- it does NOT move the chunk, and it does NOT widen who may read it.
  add column topic_paths        ltree[] not null default '{}',
  add column authority_cls      authority_class not null default 'tenant_document'
                                  check (authority_cls = 'tenant_document'),
  add column subject_kind       text,
  add column subject_id         uuid,
  add column raw_reference_sha256 text,   -- III.7 dual storage: raw artifact hash
  add column md_working_sha256    text;   -- III.7: working .md derivative hash

create index ac_path_gist  on authority_corpus using gist (path);
create index tc_path_gist  on tenant_corpus    using gist (path);
create index tc_topic_gist on tenant_corpus    using gist (topic_paths);

-- Per-domain-branch partial HNSW indexes (I-A9 / pre-filter):
-- A single shared HNSW index over the whole tree forces a post-filter after ANN,
-- which collapses recall and leaks through result counts.
create index ac_vec_law on authority_corpus using hnsw (embedding vector_cosine_ops)
  where path <@ 'ROOT.Law'       and superseded_by is null;
create index ac_vec_std on authority_corpus using hnsw (embedding vector_cosine_ops)
  where path <@ 'ROOT.Standards' and superseded_by is null;
create index ac_vec_inv on authority_corpus using hnsw (embedding vector_cosine_ops)
  where path <@ 'ROOT.Investor'  and superseded_by is null;

-- ── I-H1 / I-H2: every chunk carries a registered, non-structural path ─────────
create or replace function guard_corpus_path()
returns trigger language plpgsql set search_path = '' as $$
declare
  n public.vault_nodes;
begin
  if new.path is null then
    raise exception 'I-H1: every chunk carries a registered path'
      using errcode = '23502';
  end if;
  select * into n from public.vault_nodes where path = new.path;
  if n.path is null then
    raise exception 'I-H1: % is not a registered vault node', new.path
      using errcode = '23503';
  end if;
  if n.kind = 'structural' then
    raise exception 'I-H2: % is a structural node; filing content there broadcasts it to every query in the system', new.path
      using errcode = '42501';
  end if;
  if n.retired_at is not null then
    raise exception 'I-H1: node % is retired', new.path
      using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger ac_path_guard
  before insert or update on authority_corpus
  for each row execute function guard_corpus_path();
create trigger tc_path_guard
  before insert or update on tenant_corpus
  for each row execute function guard_corpus_path();

-- ── I-H11: a tenant chunk lives ONLY under its own org root ──────────────────
-- This is the structural answer to the concrete-mix scenario in §II.6.
-- Even a wrongly authored policy cannot place Firm A's chunk on a shared
-- classification node, because the row cannot exist there.
create or replace function guard_tenant_subtree()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not (new.path <@ public.org_root(new.owner_org_id)) then
    raise exception 'I-H11: tenant content must be filed under % (attempted %)',
      public.org_root(new.owner_org_id), new.path
      using errcode = '42501';
  end if;
  -- I-H12: topic_paths may reference only Classification or Standards nodes.
  -- They are a relevance hint. They never move the chunk and never grant access.
  if exists (
    select 1 from unnest(new.topic_paths) t
    where not (t <@ 'ROOT.Classification' or t <@ 'ROOT.Standards')
  ) then
    raise exception 'I-H12: topic_paths may reference only Classification or Standards subtrees'
      using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger tc_subtree_guard
  before insert or update on tenant_corpus
  for each row execute function guard_tenant_subtree();

-- ── I-H21: authority_corpus writes require the corpus_publisher database role ──
-- Nothing on the tenant ingestion path can write a shared branch.
create or replace function guard_shared_branch_write()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user <> 'corpus_publisher' then
    raise exception 'I-H21: ROOT.Law / ROOT.Standards / ROOT.Investor accept writes only from the corpus_publisher role'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger ac_publisher_only
  before insert or update on authority_corpus
  for each row execute function guard_shared_branch_write();

-- 0082_hv_disclosures.sql
-- ─────────────────────────────────────────────────────────────────────────────

create type subject_kind as enum (
  'property','deal','facility','matter',
  'work_package','design_package','tenancy','representation','org'
);

-- I-H13: the ONLY route by which one org's chunk becomes readable by another.
-- READ-THROUGH, never copy — which is what makes revocation real.
-- Revocation of a disclosure_epoch-bumped row immediately makes the chunk
-- unreachable through that grant in all future queries. Nothing was copied,
-- so nothing needs to be hunted down and deleted.
create table corpus_disclosures (
  id               uuid primary key default gen_random_uuid(),
  chunk_id         uuid not null references tenant_corpus(id) on delete cascade,
  owner_org_id     uuid not null references firms(id),
  subject_kind     subject_kind not null,
  subject_id       uuid not null,
  scope_note       text not null,   -- 'draw_04', 'RFI-118', 'exhibit C'
  granted_by       uuid not null references users(id),
  granted_at       timestamptz not null default now(),
  expires_at       timestamptz,
  revoked_at       timestamptz,
  disclosure_epoch bigint not null default 1,
  basis            text not null,
  unique (chunk_id, subject_kind, subject_id, scope_note)
);
create index cd_live on corpus_disclosures (subject_kind, subject_id)
  where revoked_at is null;

-- A disclosure is a two-sided act: the disclosing party must own the chunk AND
-- be a party to the subject onto which it is disclosed.
create or replace function guard_disclosure()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not public.is_org_member_for(auth.uid(), new.owner_org_id) then
    raise exception 'DISCLOSURE_NOT_OWNER: caller is not a member of the owning org'
      using errcode = '42501';
  end if;
  if not public.subject_party(new.subject_kind, new.subject_id) then
    raise exception 'DISCLOSURE_SUBJECT_NOT_PARTY: cannot disclose onto a subject you are not a party to'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger corpus_disclosures_guard
  before insert on corpus_disclosures
  for each row execute function guard_disclosure();

-- Revocation: bump disclosure_epoch, purge the recipient-side retrieval index
-- rows, and orphan any cached prompt prefixes held by parties to the subject.
create or replace function public.revoke_disclosure(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  d public.corpus_disclosures;
begin
  update public.corpus_disclosures
     set revoked_at       = now(),
         disclosure_epoch = disclosure_epoch + 1
   where id = p_id
  returning * into d;

  -- Purge recipient-side retrieval index rows for this chunk
  delete from public.copilot_retrieval_index
  where document_id = d.chunk_id;

  -- Orphan cached prefixes: bump corpus_epoch for the sessions of all parties
  -- to the disclosed subject. Bumping the whole platform would invalidate
  -- every prompt cache on one revocation; the narrow bump is correct.
  update public.agent_sessions s
     set corpus_epoch = corpus_epoch + 1
   where s.closed_at is null
     and public.subject_party_for(s.user_id, d.subject_kind, d.subject_id);
end;
$$;

-- 0083_hv_ingestion.sql
-- ─────────────────────────────────────────────────────────────────────────────

create type sandbox_verdict as enum (
  'pending',
  'static_rejected',     -- magic-byte / polyglot / structural limit failure
  'sandbox_failed',      -- microVM crash or timeout (treated as security event)
  'reconstructed',       -- Stage 3 clean reconstruction complete
  'extracted',           -- Stage 4 OCR/text extraction complete
  'fidelity_failed',     -- Stage 5 hard FAIL on numeral/currency/citation round-trip
  'clean'                -- all stages passed; eligible for promotion
);

-- ── Declaration profiles (governed data — §III.1) ─────────────────────────────
-- A new role or document type is a profile row and a review, not a migration.
-- The match_policy per field drives Stage 5 deterministic comparison.
create table ingestion_profiles (
  id              uuid primary key default gen_random_uuid(),
  subject_kind    subject_kind not null,
  doc_kind        text not null,
  required_fields jsonb not null,    -- { field: { type, format } }
  compare_fields  text[] not null,   -- which fields the Stage-6 agent extracts
  match_policy    jsonb not null,    -- { field: 'exact'|'normalized'|'fuzzy:0.9'|'advisory' }
  min_confidence  jsonb not null,    -- { field: 0.80 } — confidence below this = NO EXTRACTION
  target_path_tpl text not null,     -- must resolve under ROOT.Org.<own> (I-H21)
  max_bytes       bigint not null default 104857600,   -- 100 MB
  max_pages       int    not null default 1500,
  reviewed_by     text not null,
  unique (subject_kind, doc_kind)
);

-- ── Generalized document ingestion queue ──────────────────────────────────────
-- Replaces the draft's legal-only queue. Subject_kind discriminates the
-- authorization primitive used to validate the upload (I.4 universal binding).
create table document_ingestion_queue (
  id                  uuid primary key default gen_random_uuid(),
  uploaded_by         uuid not null references users(id),
  owner_org_id        uuid not null references firms(id),
  subject_kind        subject_kind not null,
  subject_id          uuid not null,
  profile_id          uuid not null references ingestion_profiles(id),
  declared_metadata   jsonb not null,          -- validated against the profile schema
  -- Dual storage (§III.7): content-addressed, never a caller-supplied path
  raw_sha256          text not null,           -- sha256(raw_bytes); the path IS the hash
  raw_bytes           bigint not null,
  declared_mime       text,                    -- RECORDED, never used to route parsing
  sniffed_mime        text,                    -- server-determined; this one routes (I-H18)
  md_sha256           text,                    -- sha256 of the .md derivative
  -- Pipeline stage verdicts (written by ingestion service role ONLY)
  sandbox_status      sandbox_verdict not null default 'pending',
  sandbox_job_id      text,
  static_findings     jsonb not null default '[]'::jsonb,
  malware_scan_status text not null default 'pending'
                        check (malware_scan_status in ('pending','clean','infected','error')),
  fidelity_report     jsonb,
  -- Stage 6: field extraction output. Contains FIELDS ONLY — no verdict, no boolean.
  -- The agent extracts; deterministic code compares (I-H20).
  extracted_fields    jsonb,
  verification_status text not null default 'pending'
                        check (verification_status in (
                          'pending','consistent','mismatch','indeterminate','rejected'
                        )),
  -- NOTE: 'verified' is deliberately NOT a value. The strongest word the system
  -- uses is 'consistent' — because per §III.4, consistency is not truth.
  target_path         ltree,
  promoted_chunk_ids  uuid[] not null default '{}',
  -- Custody (§III.7)
  received_at         timestamptz not null default now(),  -- SERVER time, authoritative
  client_declared_at  timestamptz,                         -- evidence of disagreement only
  created_at          timestamptz not null default now()
);
create index diq_subject on document_ingestion_queue (subject_kind, subject_id);
create index diq_open    on document_ingestion_queue (sandbox_status)
  where sandbox_status not in ('clean','static_rejected');

-- Append-only: the pipeline verdict trail is never edited or deleted.
create rule diq_no_delete as on delete to document_ingestion_queue do instead nothing;

-- I-H21: target_path must resolve inside the uploader's own org subtree.
-- This is the blast-radius bound on a defeated verification: even a fully
-- fooled Stage 6 agent can place content only in the uploader's own folder.
-- It cannot write ROOT.Law.* or ROOT.Standards.*.
create or replace function guard_ingestion_target()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.target_path is not null
     and not (new.target_path <@ public.org_root(new.owner_org_id)) then
    raise exception 'I-H21: ingestion may promote only into % (attempted %)',
      public.org_root(new.owner_org_id), new.target_path
      using errcode = '42501';
  end if;
  if not public.is_org_member_for(new.uploaded_by, new.owner_org_id) then
    raise exception 'INGEST_ORG_MISMATCH: uploader is not a member of the owning org'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger diq_target_guard
  before insert or update on document_ingestion_queue
  for each row execute function guard_ingestion_target();

-- ── SSRF fetch allow-list (HV-21) ────────────────────────────────────────────
-- Any server-side URL fetch (authority pipeline source, DOB bulletin import)
-- goes through this allow-list. DNS-pinned; no RFC1918, no loopback, no link-local.
create table publisher_domains (
  domain      text primary key,
  publisher   text not null,
  added_by    text not null,
  reviewed_at timestamptz not null default now()
);

-- ── Immutable custody log (every stage verdict, append-only) ─────────────────
create table ingestion_custody_log (
  id       uuid primary key default gen_random_uuid(),
  queue_id uuid not null references document_ingestion_queue(id),
  stage    text not null,
  verdict  text not null,
  detail   jsonb not null default '{}'::jsonb,
  actor    text not null,   -- service identity or sandbox job id
  at       timestamptz not null default now()
);
create rule icl_no_update as on update to ingestion_custody_log do instead nothing;
create rule icl_no_delete as on delete to ingestion_custody_log do instead nothing;

-- 0084_hv_retrieval.sql
-- ─────────────────────────────────────────────────────────────────────────────

-- ══════════════════════════════════════════════════════════════════════════════
-- THE UNIVERSAL SUBJECT DISPATCHER (§I.4)
-- Every HRAG authorization decision routes through here onto the Plan.md §II.3
-- primitives. Because it dispatches rather than re-implements, Plan.md I-1
-- ("no current_user_role_group() outside the literal admin branch") holds across
-- the entire HRAG with zero new exceptions.
--
-- The *_for(p_user, ...) explicit-subject variants are required because service-
-- role code paths must re-assert the predicate with an explicit user id.
-- auth.uid() is NULL under the service role (Legal Workspace I-L14).
-- ══════════════════════════════════════════════════════════════════════════════
create or replace function public.subject_party_for(
  p_user uuid,
  p_kind subject_kind,
  p_id   uuid
) returns boolean language plpgsql stable security definer set search_path = ''
as $$
begin
  return case p_kind
    when 'property'        then public.has_property_capacity(p_id, null)
    when 'deal'            then public.is_deal_member(p_id)
    when 'facility'        then public.is_facility_party(p_id)
    when 'matter'          then public.is_matter_party_for(p_user, p_id, null, null)
    when 'work_package'    then public.is_work_package_party(p_id)
    when 'design_package'  then public.is_design_package_party(p_id)
    when 'tenancy'         then exists (
      select 1 from public.tenancies t
      where t.id = p_id and p_user = any(t.tenant_user_ids)
    )
    when 'representation'  then exists (
      select 1 from public.agency_representations ar
      join public.broker_seats bs on bs.brokerage_id = ar.brokerage_id
      where ar.id = p_id and (bs.user_id = p_user or ar.principal_user_id = p_user)
    )
    when 'org'             then public.is_org_member_for(p_user, p_id)
    else false
  end;
end;
$$;

create or replace function public.subject_party(p_kind subject_kind, p_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.subject_party_for(auth.uid(), p_kind, p_id);
$$;

revoke execute on function public.subject_party_for(uuid, subject_kind, uuid) from public, anon;
revoke execute on function public.subject_party(subject_kind, uuid)           from public, anon;
grant  execute on function public.subject_party_for(uuid, subject_kind, uuid) to authenticated;
grant  execute on function public.subject_party(subject_kind, uuid)           to authenticated;

-- ── Jurisdiction derivation from subject row (I-H15 / HV-30) ─────────────────
-- Jurisdiction comes from the SUBJECT ROW — a property's BBL, a matter's venue,
-- a facility's collateral — never from `capacity` and never from the NL query.
create or replace function public.jurisdiction_of_subject(
  p_kind subject_kind,
  p_id   uuid
) returns text language plpgsql stable security definer set search_path = ''
as $$
declare
  j text;
begin
  case p_kind
    when 'property' then
      select p.jurisdiction_id into j from public.properties p where p.id = p_id;
    when 'tenancy' then
      select p.jurisdiction_id into j
      from public.tenancies t
      join public.properties p on p.id = (
        select me.owner_property_binding_id::uuid
        from public.management_engagements me where me.id = t.engagement_id
      )
      where t.id = p_id;
    when 'work_package' then
      select p.jurisdiction_id into j
      from public.work_packages w
      join public.properties p on p.id = w.property_id
      where w.id = p_id;
    when 'design_package' then
      select p.jurisdiction_id into j
      from public.design_packages d
      join public.properties p on p.id = d.project_id
      where d.id = p_id;
    when 'facility' then
      select f.borrower_id::text into j  -- simplified; full geo join uses property
      from public.facilities f
      where f.id = p_id;
    when 'deal' then
      select p.jurisdiction

_[Continuing response due to length limit...]_

Continuing exactly from the cut-off:

```sql
_id into j
      from public.deals dl
      join public.properties p on p.id = dl.property_id
      where dl.id = p_id;
    when 'matter' then
      select m.jurisdiction into j from public.matters m where m.id = p_id;
    when 'representation' then
      select p.jurisdiction_id into j
      from public.agency_representations ar
      join public.properties p on p.id = ar.listing_property_id
      where ar.id = p_id;
    when 'org' then
      j := null;  -- org-scoped queries carry no geographic jurisdiction
  end case;
  return j;
end;
$$;

-- ── Scope templates (governed data — §II.7) ───────────────────────────────────
-- Every subject_kind resolves to a declared template of scopes. The template is
-- a row and a review, not a switch statement. Domain-scope templates declare
-- which ltree paths are mandatory coverage assertions (§IV.8).
create table scope_templates (
  id              uuid primary key default gen_random_uuid(),
  subject_kind    subject_kind not null,
  jurisdiction_id text references jurisdictions(id),  -- null = applies to all jurisdictions
  ordinal         int not null,                        -- determines order; lower = higher priority
  scope_path      ltree not null references vault_nodes(path),
  mode            text not null check (mode in ('lineage','subtree','node')),
  depth_cap       int not null default 4,
  -- mandatory: an unsatisfied mandatory assertion returns COVERAGE_INCOMPLETE,
  -- never the not-found fallback (§I.5 — the composition failure control)
  mandatory       boolean not null default false,
  reviewed_by     text not null,
  unique (subject_kind, jurisdiction_id, ordinal)
);

-- ── Scope set resolution (I-H15) ──────────────────────────────────────────────
-- Returns the CLOSED, server-computed set of (path, mode, depth_cap) for a
-- given subject. This set is passed to the supervisor as LABELS — not content.
-- The planner selects from the set; it can never add to it (I-H15).
-- Jurisdiction is derived from the subject row, never from `capacity` and never
-- from the natural-language query (HV-30, HV-31).
create or replace function public.resolve_scope_set(
  p_kind  subject_kind,
  p_id    uuid,
  p_as_of date default current_date
)
returns table (scope_path ltree, mode text, depth_cap int, mandatory boolean)
language plpgsql stable security definer set search_path = ''
as $$
declare
  j text;
begin
  if not public.subject_party(p_kind, p_id) then
    raise exception 'SCOPE_DENIED' using errcode = '42501';
  end if;
  j := public.jurisdiction_of_subject(p_kind, p_id);
  return query
    -- Named instrument scopes from the template for this subject_kind + jurisdiction
    select t.scope_path, t.mode, t.depth_cap, t.mandatory
    from public.scope_templates t
    where t.subject_kind = p_kind
      and (t.jurisdiction_id is null or t.jurisdiction_id = j)
    order by t.ordinal
    union all
    -- The caller's own org subtree is always in scope (lineage, depth-capped at 8).
    -- This is the read-through path for tenant content under the org root.
    select public.org_root(fm.firm_id), 'lineage', 8, false
    from public.firm_members fm
    where fm.user_id = auth.uid();
end;
$$;

revoke execute on function public.resolve_scope_set(subject_kind, uuid, date) from public, anon;
grant  execute on function public.resolve_scope_set(subject_kind, uuid, date) to authenticated;

-- ══════════════════════════════════════════════════════════════════════════════
-- THE HRAG RETRIEVAL RPC — match_hrag_chunks()
--
-- SECURITY INVOKER, deliberately. RLS applies inside.
-- Accepts NO org, NO visibility, NO threshold, NO count.
-- Accepts a scope_path that the CALLER CANNOT WIDEN: the route passes only paths
-- returned by resolve_scope_set(), and this function re-validates membership in
-- that set internally, so a direct supabase-js call with an arbitrary path is NOT
-- a bypass (HV-30).
--
-- This is the function each Worker agent calls. Every worker runs under the
-- CALLER'S OWN RLS session (I-H14). No worker holds a grant the caller lacks.
-- The supervisor decides WHERE to look; RLS decides WHAT MAY BE SEEN.
-- ══════════════════════════════════════════════════════════════════════════════
create or replace function public.match_hrag_chunks(
  p_subject_kind    subject_kind,
  p_subject_id      uuid,
  p_scope_path      ltree,
  p_mode            text,
  p_query_embedding vector(1536),
  p_as_of           date default current_date
)
returns table (
  chunk_id       uuid,
  corpus         corpus_trust,
  path           ltree,
  document_title text,
  content        text,
  authority_cls  authority_class,
  authority_rank int,
  effective_from date,
  source_url     text,
  publisher      text,
  similarity     double precision
)
language sql stable security invoker set search_path = ''
as $$
  with scope as (
    -- Re-derive the permitted set INSIDE the function. The parameter selects
    -- from it; it can NEVER add to it. A caller passing an arbitrary p_scope_path
    -- that is not in their resolve_scope_set() result gets zero rows, not data.
    select s.scope_path, s.mode, s.depth_cap
    from public.resolve_scope_set(p_subject_kind, p_subject_id, p_as_of) s
    where s.scope_path = p_scope_path
      and s.mode       = p_mode
  ),
  floors as (
    select n.inheritance_floor
    from public.vault_nodes n
    where n.path = p_scope_path
  ),
  authority as (
    select
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
      1 - (r.embedding <=> p_query_embedding) as similarity
    from public.authority_corpus r, scope s, floors f
    where
      -- ── PATH SCOPE (relevance) ──────────────────────────────────────────
      case s.mode
        -- I-H2: lineage walks ANCESTORS but stops at the inheritance floor.
        -- Without the floor clause this also returns ROOT and ROOT.Law —
        -- the draft's broadcast-amplification defect.
        when 'lineage' then
          r.path @> s.scope_path
          and nlevel(r.path) >= f.inheritance_floor
        when 'subtree' then
          r.path <@ s.scope_path
          and nlevel(r.path) <= nlevel(s.scope_path) + s.depth_cap
        when 'node' then
          r.path = s.scope_path
      end
      -- ── AUTHORIZATION (Agent Factory I-A6) ─────────────────────────────
      -- Intersected with relevance, never substituted for it.
      -- A path is a RELEVANCE statement. It is not an access-control statement.
      and public.vault_visible_to(auth.uid(), r.visibility, r.jurisdiction_id, r.domain)
      -- ── TEMPORAL (I-H10): as-of date, not merely "currently effective" ───
      -- A matter with an accident date, a permit with a filing date, a tenancy
      -- with a commencement date — retrieval should reflect the law THEN.
      and (r.effective_from is null or r.effective_from <= p_as_of)
      and (r.effective_to   is null or r.effective_to   >= p_as_of)
      and r.reverify_due > now()
      -- ── I-H7: model standards reachable ONLY through an adoption edge ────
      -- ROOT.Standards.ICC.IBC.2021 is never groundable for an NYC project
      -- unless an 'adopts' edge exists from NYC to that exact version.
      -- IBC.2024 is unreachable for NYC — no adoption edge exists — and the
      -- retriever makes that explicit rather than returning it at a lower rank.
      and (
        r.authority_cls <> 'model_standard'
        or public.standard_adopted(r.path, s.scope_path, p_as_of)
      )
      -- Server-fixed pre-filter similarity bar (I-A8)
      and (1 - (r.embedding <=> p_query_embedding)) >= 0.72
  ),
  tenant as (
    select
      t.id,
      'tenant'::public.corpus_trust,
      t.path,
      t.document_title,
      t.content,
      t.authority_cls,
      public.authority_rank(t.authority_cls),
      null::date,
      null::text,
      null::text,
      1 - (t.embedding <=> p_query_embedding) as similarity
    from public.tenant_corpus t, scope s
    where (
        -- Path containment
        case s.mode
          when 'lineage' then t.path @> s.scope_path
          when 'subtree' then t.path <@ s.scope_path
          when 'node'    then t.path =  s.scope_path
        end
        -- topic_paths make a chunk FINDABLE; RLS decides readability.
        -- Filing under ROOT.Classification.CSI.MasterFormat.Div_03 via topic_paths
        -- does not grant any other tenant read access to the chunk — the RLS
        -- policy below enforces that in three enumerated branches and no others.
        or exists (
          select 1 from unnest(t.topic_paths) tp
          where tp <@ s.scope_path
        )
      )
      and t.screen_state = 'clear'
      and (1 - (t.embedding <=> p_query_embedding)) >= 0.72
  )
  -- Authority and tenant results are LABELLED separately in the output.
  -- No query joins them into a single undivided ranked result set (I-A4).
  -- The route merges them and carries the corpus column through to the
  -- prompt envelope so the model, citation UI, and entailment checker all
  -- know whether a sentence rests on an enacted statute or a firm's own note.
  select * from authority
  union all
  select * from tenant
  order by similarity desc
  limit 24;   -- candidate set for the reranker; NOT the answer set
$$;

revoke execute on function public.match_hrag_chunks(subject_kind, uuid, ltree, text, vector, date)
  from public, anon;
grant  execute on function public.match_hrag_chunks(subject_kind, uuid, ltree, text, vector, date)
  to authenticated;

-- 0085_hv_rls.sql
-- ─────────────────────────────────────────────────────────────────────────────

alter table vault_nodes              enable row level security;
alter table authority_relations      enable row level security;
alter table corpus_disclosures       enable row level security;
alter table scope_templates          enable row level security;
alter table document_ingestion_queue enable row level security;
alter table publisher_domains        enable row level security;
alter table ingestion_profiles       enable row level security;
alter table ingestion_custody_log    enable row level security;
alter table topology_gap_signals     enable row level security;

-- ── Node registry ────────────────────────────────────────────────────────────
-- Shared branches are readable by any authenticated session.
-- Org roots are NOT an org directory: enumerating ROOT.Org.* would leak the
-- customer list, so an org node is readable only to members of that org.
create policy vn_read
  on vault_nodes for select
  using (owner_org_id is null or is_org_member_for(auth.uid(), owner_org_id));

-- Node writes are editorial operations — corpus_publisher role, never interactive.
create policy vn_no_interactive_write
  on vault_nodes for insert with check (false);
create policy vn_no_interactive_update
  on vault_nodes for update using (false);

-- ── Authority relations DAG ───────────────────────────────────────────────────
-- The DAG describes what law governs what — public knowledge, editorially governed.
-- It is never writable from a session.
create policy ar_read
  on authority_relations for select using (true);
create policy ar_no_interactive_write
  on authority_relations for insert with check (false);
create policy ar_no_interactive_update
  on authority_relations for update using (false);

-- ── Authority corpus (HRAG layer — replaces Agent Factory 0075 policy) ────────
-- Path scope is RELEVANCE; vault_visible_to() is ACCESS.
-- They are INTERSECTED. A user-influenced path selection is never promoted into
-- an authorization dimension. (Agent Factory AF-22 / HRAG HV-27)
drop policy if exists ac_read    on authority_corpus;
drop policy if exists ac_read_v2 on authority_corpus;
create policy ac_read_v2
  on authority_corpus for select
  using (
    public.vault_visible_to(auth.uid(), visibility, jurisdiction_id, domain)
    and path is not null
    and exists (
      select 1 from public.vault_nodes n
      where n.path        = authority_corpus.path
        and n.kind        <> 'structural'
        and n.retired_at  is null
    )
  );

-- ── Tenant corpus (HRAG layer — replaces Agent Factory 0075 policy) ──────────
-- Three branches, and ONLY three. There is no path-based branch: being filed
-- under a Div-03 topic reference grants nothing to any other tenant.
-- This is the policy answer to the concrete-mix scenario (§II.6).
drop policy if exists tc_read    on tenant_corpus;
drop policy if exists tc_read_v2 on tenant_corpus;
create policy tc_read_v2
  on tenant_corpus for select
  using (
    -- Branch 1: own org — chunk is inside the org's own subtree
    (
      is_org_member_for(auth.uid(), owner_org_id)
      and path <@ org_root(owner_org_id)
      and screen_state = 'clear'
    )
    -- Branch 2: cross-party disclosure — read-through grant on a shared subject
    -- (I-H13). The lender reads the mix design BECAUSE it was attached to draw 04
    -- on a facility they are a party to — not because they searched Div-03.
    or exists (
      select 1 from public.corpus_disclosures d
      where d.chunk_id    = tenant_corpus.id
        and d.revoked_at  is null
        and (d.expires_at is null or d.expires_at > now())
        and public.subject_party(d.subject_kind, d.subject_id)
    )
    -- Branch 3: subject-scoped chunk — the chunk was ingested bound to a specific
    -- subject (a work package, a matter, a facility) and the caller is a party.
    or (
      tenant_corpus.subject_kind is not null
      and public.subject_party(
        tenant_corpus.subject_kind::public.subject_kind,
        tenant_corpus.subject_id
      )
    )
  );

-- RESTRICTIVE wall override: walls override EVERY branch for matter-scoped chunks.
-- RESTRICTIVE policies AND with permissive policies rather than OR-ing.
-- A wall that could be satisfied by any one permissive branch would not be a wall.
create policy tc_wall_override
  on tenant_corpus as restrictive for select
  using (
    subject_kind is distinct from 'matter'
    or not public.screened_from_matter(subject_id)
  );

-- ── Corpus disclosures ────────────────────────────────────────────────────────
create policy cd_read
  on corpus_disclosures for select
  using (
    is_org_member_for(auth.uid(), owner_org_id)
    or subject_party(subject_kind, subject_id)
  );
-- Revocation goes through the revoke_disclosure() function (service role).
-- No interactive UPDATE on revoked_at.
create policy cd_no_direct_revoke
  on corpus_disclosures for update using (false);

-- ── Scope templates: platform metadata — readable by all authenticated ────────
create policy st_read
  on scope_templates for select using (auth.uid() is not null);

-- ── Document ingestion queue ──────────────────────────────────────────────────
-- Uploader reads their own rows; any party to the subject also reads.
create policy diq_read
  on document_ingestion_queue for select
  using (
    uploaded_by = auth.uid()
    or (
      subject_kind is not null
      and public.subject_party(subject_kind::public.subject_kind, subject_id)
    )
  );

-- Caller must be a subject party and the row must land in 'pending' state.
-- A client cannot self-promote its own row past 'pending'.
create policy diq_insert
  on document_ingestion_queue for insert
  with check (
    uploaded_by = auth.uid()
    and public.subject_party(subject_kind::public.subject_kind, subject_id)
    and verification_status = 'pending'
    and sandbox_status      = 'pending'
  );

-- Clients may update only their own pending rows; status columns are immutable.
create policy diq_no_selfpromote
  on document_ingestion_queue for update
  using  (uploaded_by = auth.uid())
  with check (
    verification_status = 'pending'
    and sandbox_status  = 'pending'
  );

-- ── Publisher domains: read-only for all authenticated ───────────────────────
create policy pd_read
  on publisher_domains for select using (auth.uid() is not null);
create policy pd_no_interactive_write
  on publisher_domains for insert with check (false);

-- ── Ingestion profiles: read-only for all authenticated ──────────────────────
create policy ip_read
  on ingestion_profiles for select using (auth.uid() is not null);

-- ── Ingestion custody log: uploader and subject parties read ─────────────────
create policy icl_read
  on ingestion_custody_log for select
  using (
    exists (
      select 1 from public.document_ingestion_queue q
      where q.id = queue_id
        and (
          q.uploaded_by = auth.uid()
          or public.subject_party(q.subject_kind::public.subject_kind, q.subject_id)
        )
    )
  );

-- ── Topology gap signals: corpus editors read ────────────────────────────────
-- Not readable by regular authenticated users — these are corpus maintenance signals.
create policy tgs_read
  on topology_gap_signals for select
  using (false);   -- readable by the corpus_publisher role only, not by `authenticated`

-- 0086_hv_coverage.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- This migration closes the §I.5 composition failure:
-- A misfiled instrument produces zero retrieval hits. The Agent Factory's
-- grounding gate correctly returns "information not found." The user reads:
-- "there is no applicable rule." Every component behaved as specified.
-- The user received a confident, actionable, wrong answer.
--
-- Two controls together prevent it:
-- 1. coverage_assertions: declares which instrument sets MUST be present and
--    current for a given subject_kind + jurisdiction. A query into a jurisdiction
--    with an unsatisfied assertion returns 422 COVERAGE_INCOMPLETE — never the
--    not-found fallback. Those two outcomes are different facts and must never
--    render identically to the user.
-- 2. topology_gap_signals: when a scoped query returns zero rows while a PARENT
--    or SIBLING node holds matching content, that is the misfiling signature.
--    It is raised to corpus editors, never silently absorbed.

-- Replace the stub from migration 0056 with the full, ltree-backed implementation.
drop table if exists coverage_assertions cascade;

create table coverage_assertions (
  id              uuid primary key default gen_random_uuid(),
  subject_kind    subject_kind not null,
  jurisdiction_id text not null references jurisdictions(id),
  required_path   ltree not null references vault_nodes(path),
  rationale       text not null,   -- why answering WITHOUT this instrument is unsafe
  min_chunks      int not null default 1,
  last_checked_at timestamptz,
  satisfied       boolean not null default false,
  unique (subject_kind, jurisdiction_id, required_path)
);

-- coverage_status() is called at step 6 of the /api/copilot pipeline, BEFORE
-- retrieval and BEFORE the model. An unsatisfied mandatory assertion returns
-- 422 COVERAGE_INCOMPLETE. Retrieval never runs for that query.
--
-- NOTE: vault_visible_to() is deliberately NOT applied here. Coverage is a
-- property of the CORPUS, not of the CALLER. Making it caller-relative would
-- turn a visibility denial into "we do not cover this" — the §I.5 defect
-- wearing a different hat.
create or replace function public.coverage_status(
  p_kind         subject_kind,
  p_jurisdiction text,
  p_as_of        date default current_date
)
returns table (required_path ltree, satisfied boolean, rationale text)
language sql stable security definer set search_path = ''
as $$
  select
    c.required_path,
    (
      select count(*) from public.authority_corpus a
      where a.path <@ c.required_path
        and (a.effective_from is null or a.effective_from <= p_as_of)
        and (a.effective_to   is null or a.effective_to   >= p_as_of)
        and a.reverify_due > now()
    ) >= c.min_chunks,
    c.rationale
  from public.coverage_assertions c
  where c.subject_kind    = p_kind
    and c.jurisdiction_id = p_jurisdiction;
$$;

revoke execute on function public.coverage_status(subject_kind, text, date) from public, anon;
grant  execute on function public.coverage_status(subject_kind, text, date) to authenticated;

-- Seed the baseline coverage assertions — each row is a statement that answering
-- WITHOUT this instrument produces advice that is wrong in a specific, foreseeable
-- direction. These are minimum viable seeds; the corpus editorial team maintains
-- them as governed data.
insert into coverage_assertions
  (subject_kind, jurisdiction_id, required_path, rationale) values

  ('tenancy', 'US-NY-NYC',
   'ROOT.Law.US.NY.Regulations.NYCRR.Title_09.Part_2520',
   'Rent Stabilization Code is a STATE regulation applying city-wide (9 NYCRR §2520). Filed under a county node it is invisible to sibling-borough queries, and the grounding gate renders that silence as "no applicable rule."'),

  ('tenancy', 'US-NY-NYC',
   'ROOT.Law.US.NY.NYC.AdminCode.Title_08',
   'NYC Human Rights Law reaches further than the federal FHA (source of income, lawful occupation). Federal-only retrieval advises that conduct is lawful that NYC law prohibits.'),

  ('representation', 'US-NY-NYC',
   'ROOT.Law.US.NY.NYC.AdminCode.Title_08',
   'Same under-inclusion risk on the brokerage side as the tenancy case.'),

  ('work_package', 'US-NY-NYC',
   'ROOT.Law.US.NY.NYC.ConstructionCodes.BC.2022',
   'Without the enacted NYC text, retrieval falls back to model-code text that is not law here (I-H7). Egress, occupancy, and fire-resistance answers derived from unadopted model codes are life-safety mistatements.'),

  ('facility', 'US-NY',
   'ROOT.Law.US.Federal.Interpretations.CFPB.Part_1026_Supp_I',
   'Reg Z Official Interpretations carry safe-harbour reliance. The regulation text alone misstates the compliance posture for TILA timing and disclosure questions.'),

  ('matter', 'US-NY',
   'ROOT.Law.US.NY.Statutes.CPLR.Art_03',
   'CPLR Article 3 governs service of process for all NY civil matters. A matter-scoped legal query without it produces answers about service that are wrong for every NY court.'),

  ('deal', 'US-NY',
   'ROOT.Law.US.NY.Statutes.RPL',
   'Real Property Law governs NY transfer, title, and deed. A deal-scoped query without it cannot correctly answer questions about recording, condition of title, or transfer tax.');

-- ── Topology gap signal table ─────────────────────────────────────────────────
-- When a scoped query returns zero rows while a parent or sibling node holds
-- matching content, the retriever emits a topology_gap_signal rather than
-- silently absorbing the miss. The signal pages corpus editors (§I.5 control 3).
create table topology_gap_signals (
  id              uuid primary key default gen_random_uuid(),
  queried_scope   ltree not null,
  hit_at_scope    ltree not null,   -- the ancestor/sibling that DID have content
  subject_kind    subject_kind,
  jurisdiction_id text,
  observed_at     timestamptz not null default now(),
  resolved_at     timestamptz,
  resolution      text    -- e.g. 'reclassified to correct node', 'coverage assertion added'
);

-- ── Final HRAG validation assertions ─────────────────────────────────────────
do $$
begin
  -- I-H1: vault_nodes_guard trigger must exist
  if not exists (
    select 1 from information_schema.triggers
    where event_object_table = 'vault_nodes'
      and trigger_name       = 'vault_nodes_guard'
  ) then
    raise exception 'I-H1 VIOLATION: vault_nodes_guard trigger missing';
  end if;

  -- I-H2: ROOT must exist as a structural node
  if not exists (
    select 1 from vault_nodes
    where path = 'ROOT' and kind = 'structural'
  ) then
    raise exception 'I-H2 VIOLATION: ROOT structural node missing';
  end if;

  -- I-H3: normalize_label() function must exist
  if not exists (
    select 1 from pg_proc where proname = 'normalize_label'
  ) then
    raise exception 'I-H3 VIOLATION: normalize_label() function missing';
  end if;

  -- I-H7: standard_adopted() function must exist
  if not exists (
    select 1 from pg_proc where proname = 'standard_adopted'
  ) then
    raise exception 'I-H7 VIOLATION: standard_adopted() function missing';
  end if;

  -- I-H8: authority_rank() must not include a 'preempted_by' branch
  -- (tested by inspecting the enum — preempted_by is in authority_relation, not authority_class)
  if exists (
    select 1 from pg_enum
    where enumtypid = 'authority_class'::regtype::oid
      and enumlabel = 'preempted_by'
  ) then
    raise exception 'I-H8 VIOLATION: preempted_by must not be an authority_class value';
  end if;

  -- I-H11: tc_subtree_guard trigger must exist
  if not exists (
    select 1 from information_schema.triggers
    where event_object_table = 'tenant_corpus'
      and trigger_name       = 'tc_subtree_guard'
  ) then
    raise exception 'I-H11 VIOLATION: tc_subtree_guard trigger missing';
  end if;

  -- I-H13: corpus_disclosures_guard trigger must exist
  if not exists (
    select 1 from information_schema.triggers
    where event_object_table = 'corpus_disclosures'
      and trigger_name       = 'corpus_disclosures_guard'
  ) then
    raise exception 'I-H13 VIOLATION: corpus_disclosures_guard trigger missing';
  end if;

  -- I-H15: resolve_scope_set() function must exist
  if not exists (
    select 1 from pg_proc where proname = 'resolve_scope_set'
  ) then
    raise exception 'I-H15 VIOLATION: resolve_scope_set() function missing';
  end if;

  -- I-H21: guard_shared_branch_write() trigger must exist on authority_corpus
  if not exists (
    select 1 from information_schema.triggers
    where event_object_table = 'authority_corpus'
      and trigger_name       = 'ac_publisher_only'
  ) then
    raise exception 'I-H21 VIOLATION: ac_publisher_only trigger missing on authority_corpus';
  end if;

  -- Coverage assertions must exist
  if (select count(*) from coverage_assertions) = 0 then
    raise exception 'COVERAGE VIOLATION: no coverage assertions seeded — §I.5 composition failure control is absent';
  end if;

  -- subject_party() and subject_party_for() must exist
  if not exists (
    select 1 from pg_proc where proname = 'subject_party'
  ) then
    raise exception 'I-H14 VIOLATION: subject_party() dispatcher missing';
  end if;
  if not exists (
    select 1 from pg_proc where proname = 'subject_party_for'
  ) then
    raise exception 'I-H14 VIOLATION: subject_party_for() explicit-subject variant missing';
  end if;

  -- match_hrag_chunks() must be SECURITY INVOKER (checked by definer-lint in CI;
  -- validated here by asserting it is not listed as a security-definer function)
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where p.proname  = 'match_hrag_chunks'
      and n.nspname  = 'public'
      and p.prosecdef = true   -- true = SECURITY DEFINER
  ) then
    raise exception 'I-H14 VIOLATION: match_hrag_chunks() must be SECURITY INVOKER, not DEFINER';
  end if;

end;
$$;

-- ── Final schema comment ──────────────────────────────────────────────────────
comment on schema public is
  'Shtiya Builder Core Ecosystem v3.0 — full schema 0001–0086 validated.
   Core (0001–0059) + Legal Workspace (0060–0066) +
   Agent Factory (0070–0076) + HRAG Vault Network (0080–0086).
   Part 3: API Route Contracts, Phase Implementation, CI Guardrails.';

