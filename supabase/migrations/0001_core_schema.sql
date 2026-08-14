-- =============================================================================
-- 0001_core_schema.sql
-- Shtiya Builder — Master Schema Migration
-- Covers: Extensions, ENUMs, and all 11 core tables (Plan.md §2.1 & §2.2)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Extensions (Plan.md §2.1)
-- ---------------------------------------------------------------------------
create extension if not exists "uuid-ossp";
create extension if not exists "vector";        -- Agentic: Match (pgvector)
create extension if not exists "pg_cron";        -- Agentic: Watchdog / Sentinel schedulers

-- ---------------------------------------------------------------------------
-- ENUMs (Plan.md §2.1)
-- ---------------------------------------------------------------------------
create type user_role as enum (
  'owner', 'investor', 'attorney', 'lender', 'contractor',
  'architect', 'property_manager', 'tenant', 'admin', 'marketer'
);

create type agreement_type as enum ('psa', 'jv', 'lease', 'arbitration_clause');
create type agreement_status as enum ('draft', 'pending_signature', 'executed', 'terminated');
create type ledger_type as enum ('escrow_hold', 'tax_debt', 'material_invoice', 'draw_release', 'rent_payment');
create type ledger_status as enum ('pending', 'held', 'released', 'disputed');
create type violation_source as enum ('DOB', 'HPD', 'ECB', '311');       -- Watchdog
create type compliance_status as enum ('valid', 'expiring_soon', 'lapsed');  -- Sentinel

-- ---------------------------------------------------------------------------
-- Table 1: USERS
-- ---------------------------------------------------------------------------
create table users (
  id              uuid primary key default gen_random_uuid()
                    references auth.users(id) on delete cascade,
  email           text unique not null,
  full_name       text,
  phone           text,
  role            user_role not null default 'owner',
  organization_id uuid,                 -- multi-tenant boundary
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Table 2: PROPERTIES
-- ---------------------------------------------------------------------------
create table properties (
  id         uuid primary key default gen_random_uuid(),
  bbl        text unique not null,             -- NYC Borough-Block-Lot
  parcel_id  text,
  address    text not null,
  lat        double precision,
  lng        double precision,
  owner_id   uuid references users(id),
  status     text not null default 'active',
  metadata   jsonb default '{}'::jsonb,
  embedding  vector(768),                -- Agentic: Match — semantic comp search
  created_at timestamptz not null default now()
);

create index on properties using ivfflat (embedding vector_cosine_ops);

-- ---------------------------------------------------------------------------
-- Table 3: BLOCK COMMITTEES  (Shtiya Owner)
-- ---------------------------------------------------------------------------
create table block_committees (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  status              text not null default 'forming', -- forming | locked | rezoning_filed
  projected_value     numeric(14,2),
  target_member_count int not null,
  created_by          uuid references users(id),
  created_at          timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Table 4: BLOCK COMMITTEE MEMBERS  (Shtiya Owner)
-- ---------------------------------------------------------------------------
create table block_committee_members (
  block_committee_id uuid references block_committees(id) on delete cascade,
  property_id        uuid references properties(id) on delete cascade,
  user_id            uuid references users(id),
  signed_at          timestamptz,
  status             text not null default 'invited', -- invited | signed | declined
  primary key (block_committee_id, property_id)
);

-- ---------------------------------------------------------------------------
-- Table 5: AGREEMENTS  (Shtiya Legal)
-- ---------------------------------------------------------------------------
create table agreements (
  id                  uuid primary key default gen_random_uuid(),
  type                agreement_type not null,
  property_id         uuid references properties(id),
  parties             jsonb not null default '[]'::jsonb,   -- [{user_id, role, signed_at}]
  binding_arbitration boolean not null default true,
  status              agreement_status not null default 'draft',
  document_id         uuid,                              -- fk added after documents table
  embedding           vector(768),                        -- Agentic: Match
  created_at          timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Table 6: FINANCIAL LEDGERS  (Shtiya Escrow / Capital / Property)
-- ---------------------------------------------------------------------------
create table financial_ledgers (
  id           uuid primary key default gen_random_uuid(),
  property_id  uuid references properties(id),
  agreement_id uuid references agreements(id),
  type         ledger_type not null,
  amount       numeric(14,2) not null,
  currency     text not null default 'USD',
  status       ledger_status not null default 'pending',
  web3_tx_hash text,                              -- on-chain escrow reference
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Table 7: DOCUMENTS  (shared bucket references)
-- ---------------------------------------------------------------------------
create table documents (
  id          uuid primary key default gen_random_uuid(),
  property_id uuid references properties(id),
  uploaded_by uuid references users(id),
  type        text not null,                             -- cad, photo, probate_petition, psa, w9...
  bucket_path text not null,
  embedding   vector(768),                               -- Agentic: Match
  created_at  timestamptz not null default now()
);

-- Back-fill the deferred FK on agreements → documents
alter table agreements add constraint fk_agreements_document
  foreign key (document_id) references documents(id);

-- ---------------------------------------------------------------------------
-- Table 8: VIOLATIONS  (Agentic: Watchdog)
-- ---------------------------------------------------------------------------
create table violations (
  id          uuid primary key default gen_random_uuid(),
  property_id uuid references properties(id) on delete cascade,
  source      violation_source not null,
  external_id text not null,
  description text,
  issued_date date,
  status      text default 'open',
  raw_payload jsonb,
  created_at  timestamptz not null default now(),
  unique (source, external_id)
);

-- ---------------------------------------------------------------------------
-- Table 9: VISION INSPECTIONS  (Agentic: Vision)
-- ---------------------------------------------------------------------------
create table vision_inspections (
  id             uuid primary key default gen_random_uuid(),
  document_id    uuid references documents(id),
  property_id    uuid references properties(id),
  contractor_id  uuid references users(id),
  ai_summary     text,
  flagged_issues jsonb default '[]'::jsonb,
  confidence     numeric(4,3),
  blocks_draw    boolean not null default false,
  created_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Table 10: DEAL ROOM EVENTS  (Agentic: Pulse)
-- ---------------------------------------------------------------------------
create table deal_room_events (
  id                  uuid primary key default gen_random_uuid(),
  block_committee_id  uuid references block_committees(id),
  financial_ledger_id uuid references financial_ledgers(id),
  event_type          text not null,                        -- member_joined, bid_placed, draw_status_changed
  payload             jsonb default '{}'::jsonb,
  created_at          timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Table 11: COMPLIANCE CHECKS  (Agentic: Sentinel)
-- ---------------------------------------------------------------------------
create table compliance_checks (
  id                      uuid primary key default gen_random_uuid(),
  contractor_id           uuid references users(id),
  license_number          text,
  insurance_policy_number text,
  expiration_date         date,
  status                  compliance_status not null default 'valid',
  last_verified_at        timestamptz default now(),
  source                  text default 'nyc_open_data'
);
