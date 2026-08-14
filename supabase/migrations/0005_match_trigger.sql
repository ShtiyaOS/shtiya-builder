-- Migration: 0005_match_trigger
-- Phase: T4.6 — Agentic: Match — pgvector Embedding Pipeline
--
-- 1. Adds `properties`, `agreements`, and `documents` to the Supabase Realtime
--    publication (required for the match-embed trigger notifications).
--
-- 2. Creates a Postgres function + trigger on each of the three tables that
--    fires AFTER INSERT OR UPDATE and calls the `match-embed` Edge Function
--    via pg_net (net.http_post). The embedding is written back by the function
--    within ~60 seconds.
--
-- Prerequisites:
--   - `pg_net` extension must be enabled (Supabase enables this by default on
--     Pro tier projects via the Supabase Dashboard → Database → Extensions).
--   - `match-embed` Edge Function must be deployed to the project.
--   - app.supabase_functions_url and app.service_role_key must be configured
--     as database settings (same pattern as 0004_watchdog_cron.sql).

-- ── Add tables to Realtime publication ───────────────────────────────────────
-- Safe to re-run (Postgres silently ignores duplicates).
alter publication supabase_realtime add table properties;
alter publication supabase_realtime add table agreements;
alter publication supabase_realtime add table documents;

-- ── Embedding trigger function ────────────────────────────────────────────────
-- Single function shared by all three tables. Uses TG_TABLE_NAME to route.
create or replace function trigger_embed_row()
returns trigger
language plpgsql
security definer
as $$
begin
  -- app.supabase_functions_url / app.service_role_key are project-level DB
  -- settings configured via the Dashboard (see 0004_watchdog_cron.sql) —
  -- they don't exist on a fresh local/CI database. current_setting()'s
  -- second arg (missing_ok) makes that return NULL instead of raising
  -- "unrecognized configuration parameter", which would otherwise fail
  -- every INSERT/UPDATE on properties/agreements/documents outright. Skip
  -- the notify silently when unconfigured — local/test envs seed
  -- embeddings directly instead of relying on the Edge Function round trip.
  if current_setting('app.supabase_functions_url', true) is null then
    return NEW;
  end if;

  -- Fire-and-forget: pg_net sends the HTTP request asynchronously.
  -- The Edge Function writes the embedding back within ~60 s.
  perform net.http_post(
    url     := current_setting('app.supabase_functions_url') || '/match-embed',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.service_role_key'),
      'Content-Type',  'application/json'
    ),
    body    := jsonb_build_object(
      'table', TG_TABLE_NAME,
      'id',    NEW.id::text
    )
  );
  return NEW;
end;
$$;

-- ── Attach trigger to each table ─────────────────────────────────────────────
-- Drop first so re-running the migration is idempotent.

drop trigger if exists embed_on_upsert on properties;
create trigger embed_on_upsert
  after insert or update of address, bbl, status, metadata
  on properties
  for each row
  execute function trigger_embed_row();

drop trigger if exists embed_on_upsert on agreements;
create trigger embed_on_upsert
  after insert or update of type, status, parties
  on agreements
  for each row
  execute function trigger_embed_row();

drop trigger if exists embed_on_upsert on documents;
create trigger embed_on_upsert
  after insert or update of type, bucket_path
  on documents
  for each row
  execute function trigger_embed_row();

-- ── Semantic search RPC functions (T4.7) ─────────────────────────────────────
-- Called by /api/match route via supabase.rpc('match_<table>', {...}).
-- Each function accepts a query embedding vector and returns the top-N most
-- similar rows by cosine distance, respecting the caller's RLS context.
--
-- filter_property_id is optional — pass NULL to search across all rows
-- the caller has visibility into.

create or replace function match_properties(
  query_embedding  vector(768),
  match_count      int     default 5,
  filter_property_id uuid  default null
)
returns table (
  id         uuid,
  address    text,
  bbl        text,
  status     text,
  score      float
)
language sql stable
as $$
  select
    p.id,
    p.address,
    p.bbl,
    p.status,
    (p.embedding <=> query_embedding)::float as score
  from properties p
  where
    p.embedding is not null
    and (filter_property_id is null or p.id = filter_property_id)
  order by p.embedding <=> query_embedding
  limit match_count;
$$;

create or replace function match_agreements(
  query_embedding    vector(768),
  match_count        int     default 5,
  filter_property_id uuid    default null
)
returns table (
  id          uuid,
  type        text,
  status      text,
  property_id uuid,
  score       float
)
language sql stable
as $$
  select
    a.id,
    a.type::text,
    a.status::text,
    a.property_id,
    (a.embedding <=> query_embedding)::float as score
  from agreements a
  where
    a.embedding is not null
    and (filter_property_id is null or a.property_id = filter_property_id)
  order by a.embedding <=> query_embedding
  limit match_count;
$$;

create or replace function match_documents(
  query_embedding    vector(768),
  match_count        int     default 5,
  filter_property_id uuid    default null
)
returns table (
  id          uuid,
  type        text,
  bucket_path text,
  property_id uuid,
  score       float
)
language sql stable
as $$
  select
    d.id,
    d.type,
    d.bucket_path,
    d.property_id,
    (d.embedding <=> query_embedding)::float as score
  from documents d
  where
    d.embedding is not null
    and (filter_property_id is null or d.property_id = filter_property_id)
  order by d.embedding <=> query_embedding
  limit match_count;
$$;
