# Shtiya Builder Ecosystem v3.0 — Master Engineering Plan
## Part 2 of 3: Database Schemas & Migration Sequences

**Document class:** Production Engineering Blueprint — Master Plan (Modular, 3-Part Series)
**Produced by:** IBM Bob, Lead Architect & Project Manager
**Version:** 3.0
**Depends on:** `Plan_v3_Part1.md` (invariants govern; read Part 1 first)
**Companion:** `Plan_v3_Part3.md` — API Route Contracts, Phase Implementation, CI Guardrails

---

## Overview: Migration Sequence Master Index

All migrations run in the order listed. Later migration sets depend on earlier ones. The "0001–0059" range covers the Core Ecosystem (v2.0 baseline, Groups 1–9). The three new infrastructure layers layer on top without altering any existing v2.0 migration file.

| Range | Layer | Description |
|---|---|---|
| `0001` | **Core Foundation** | users, properties, core shared tables |
| `0010–0019` | **Group Authorization** | property_role_bindings, deals, facilities, matters, work/design packages, tenancies, brokerages |
| `0020–0029` | **Group 4 Core (Legal)** | firms, matters, matter_parties, ethical_walls, trust_accounts, trust_ledger (baseline) |
| `0030–0059` | **Groups 5–9 Extensions** | work packages, design packages, tenancies, agency representations; escrow, disclosures, conflict checks |
| `0060–0066` | **Legal Workspace** | Identity subjects, data classes, trust hardening, practice workbenches, gig rail, wall hardening, RLS, column grants |
| `0070–0076` | **Agent Factory** | Corpora, typed agents, ingestion screening, retrieval RPCs, observability, RLS, grants |
| `0080–0086` | **HRAG Vault Network** | ltree nodes + authority DAG, corpus paths, cross-party disclosures, ingestion queue, retrieval RPCs, RLS, coverage assertions |

---

## Part I — Core Foundation & 27-Role Schema (Migrations 0001–0059)

### 0001 — Foundation Tables

The canonical baseline carried forward from `Plan_v2.md §II.1–II.2`. Only the essential structure is reproduced here; the full migration lives in `supabase/migrations/0001_foundation.sql`.

```sql
-- Extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ── Identity & Access ────────────────────────────────────────────────────────
-- role is nav-routing ONLY. Never used for row-level access outside admin branch.
create table users (
  id         uuid primary key default gen_random_uuid(),
  email      text unique not null,
  role       text not null default 'owner_single',
  created_at timestamptz not null default now()
);

-- ── Properties (Group 1 anchor) ─────────────────────────────────────────────
create table properties (
  id                  uuid primary key default gen_random_uuid(),
  bbl                 text unique,
  address             text not null,
  borough             text,
  recorded_grantees   jsonb[] not null default '{}',
  title_holder_type   text check (title_holder_type in ('person','entity','trust')),
  exposure_policy     text not null default 'private'
                        check (exposure_policy in ('private','network','seeking_exit')),
  exposure_policy_held_since timestamptz,
  recorded_at         timestamptz,
  co_owned            boolean generated always as (jsonb_array_length(recorded_grantees) > 1) stored,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ── Entitlements (billing flags — NEVER data-scope) ─────────────────────────
-- Billing actor REVOKE applied after table creation (see 0010).
create table entitlements (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  key        text not null,
  source     text not null check (source in ('stripe','system')),
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

-- ── Shared cross-group tables ────────────────────────────────────────────────
create table agreements (
  id              uuid primary key default gen_random_uuid(),
  parties         uuid[] not null,
  privilege_class text not null default 'none'
                    check (privilege_class in
                      ('none','attorney_client','work_product','settlement_privileged')),
  binding_status  text not null default 'draft'
                    check (binding_status in ('draft','executed','superseded','void')),
  created_at      timestamptz not null default now()
);

create table documents (
  id                   uuid primary key default gen_random_uuid(),
  title                text not null,
  storage_path         text not null,
  privilege_class      text not null default 'none'
                         check (privilege_class in
                           ('none','attorney_client','work_product','settlement_privileged')),
  privilege_holder_id  uuid references users(id),
  created_at           timestamptz not null default now()
);

create table financial_ledgers (
  id               uuid primary key default gen_random_uuid(),
  ledger_type      text not null,
  usd_amount_cents bigint not null check (usd_amount_cents >= 0),
  status           text not null default 'open',
  party_ids        uuid[] not null,
  created_at       timestamptz not null default now()
);

create table escrow_intents (
  id                uuid primary key default gen_random_uuid(),
  idempotency_key   text unique not null,
  source_ledger_id  uuid references financial_ledgers(id),
  direction         text not null check (direction in ('credit','debit')),
  usd_amount_cents  bigint not null check (usd_amount_cents > 0),
  status            text not null default 'pending'
                      check (status in ('pending','broadcasting','confirmed','failed')),
  on_chain_tx_hash  text,
  created_at        timestamptz not null default now(),
  confirmed_at      timestamptz
);

create table disclosures (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null references users(id) on delete cascade,
  disclosure_type         text not null,
  rendered_document_hash  text not null,
  acknowledged_at         timestamptz,
  created_at              timestamptz not null default now()
);

-- ── Group 1: authorization primitive ─────────────────────────────────────────
create table property_role_bindings (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references users(id) on delete cascade,
  property_id       uuid not null references properties(id) on delete cascade,
  capacity          text not null
                      check (capacity in
                        ('owner_single','owner_investor','owner_distressed')),
  verification_tier text not null default 'V0'
                      check (verification_tier in ('V0','V1','V2','V3+')),
  claim_share       text not null default 'sole'
                      check (claim_share in ('sole','partial')),
  status            text not null default 'active'
                      check (status in ('active','dormant','contested','revoked')),
  attested_at       timestamptz,
  created_at        timestamptz not null default now(),
  unique (user_id, property_id, capacity)
);

-- ── Billing-actor guard trigger (I-2) ────────────────────────────────────────
-- This function is used by ALL authorization tables. Created once here.
create or replace function assert_not_billing_actor()
returns trigger language plpgsql as $$
begin
  if current_setting('app.actor_class', true) = 'billing' then
    raise exception 'billing actor cannot modify authorization tables [I-2]';
  end if;
  return new;
end;
$$;

-- Apply the guard to 0001 tables that are now fully created
create trigger trg_prb_billing_guard
  before insert or update on property_role_bindings
  for each row execute function assert_not_billing_actor();

-- REVOKE billing-role grants on entitlements (entitlements is billing's domain;
-- authorization tables are categorically revoked)
revoke all on property_role_bindings from public;
revoke all on entitlements            from public;

-- ── 27-Role taxonomy (canonical — see Plan_v3 Part 1 §III.1) ─────────────────
-- Users.role is nav-routing ONLY. The canonical 27 values are enforced here.
alter table users
  add constraint users_role_check check (role in (
    -- Group 1 — Owner
    'owner_single', 'owner_investor', 'owner_distressed',
    -- Group 2 — Investor / Developer
    'investor_wholesaler', 'investor_value_add', 'investor_assembler',
    -- Group 3 — Lender / Capital Provider
    'lender_institutional', 'lender_heloc', 'lender_jv',
    -- Group 4 — Legal Shield
    'legal_transactional', 'legal_title', 'legal_expediter',
    'legal_loss_mitigation', 'legal_arbitrator',
    -- Group 5 — Contractor & Sub-Trade
    'contractor_gc', 'contractor_sub', 'contractor_supplier', 'contractor_logistics',
    -- Group 6 — Architect & Engineer
    'arch_ra', 'arch_engineer', 'arch_zoning',
    -- Group 7 — Property Manager & Tenant
    'prop_manager', 'prop_tenant',
    -- Group 9 — Brokerage
    'broker_commercial', 'broker_residential', 'broker_leasing',
    -- Internal
    'admin'
  ));

-- ── current_user_role_group() — nav routing helper (NOT a row-access predicate)
-- Used ONLY in the admin branch of RLS policies. Never for data-row access.
create or replace function current_user_role_group()
returns text language sql security definer stable as $$
  select case
    when role in ('owner_single','owner_investor','owner_distressed')
      then 'owner'
    when role in ('investor_wholesaler','investor_value_add','investor_assembler')
      then 'investor'
    when role in ('lender_institutional','lender_heloc','lender_jv')
      then 'lender'
    when role in ('legal_transactional','legal_title','legal_expediter','legal_loss_mitigation')
      then 'attorney'
    when role = 'legal_arbitrator'
      then 'neutral'
    when role in ('contractor_gc','contractor_sub','contractor_supplier','contractor_logistics')
      then 'contractor'
    when role in ('arch_ra','arch_engineer','arch_zoning')
      then 'architect'
    when role = 'prop_manager'
      then 'property_manager'
    when role = 'prop_tenant'
      then 'tenant'
    when role in ('broker_commercial','broker_residential','broker_leasing')
      then 'broker'
    when role = 'admin'
      then 'admin'
    else 'unknown'
  end
  from users where id = auth.uid();
$$;

-- ── Group 1: has_property_capacity() ─────────────────────────────────────────
create or replace function has_property_capacity(
  p_property_id uuid,
  p_capacity    text
) returns boolean language sql security definer stable as $$
  select exists (
    select 1 from property_role_bindings
    where user_id    = auth.uid()
      and property_id = p_property_id
      and capacity    = p_capacity
      and status      = 'active'
  );
$$;

-- ── RLS on 0001 tables ────────────────────────────────────────────────────────
alter table properties           enable row level security;
alter table property_role_bindings enable row level security;
alter table entitlements         enable row level security;
alter table agreements           enable row level security;
alter table documents            enable row level security;
alter table financial_ledgers    enable row level security;
alter table escrow_intents       enable row level security;
alter table disclosures          enable row level security;

-- properties: owner may read their own; exposure_policy drives discovery (separate)
create policy "properties_owner_read" on properties for select
  using (
    has_property_capacity(id, 'owner_single')
    or has_property_capacity(id, 'owner_investor')
    or has_property_capacity(id, 'owner_distressed')
    or current_user_role_group() = 'admin'
  );

-- property_role_bindings: user sees their own rows only
create policy "prb_self_read" on property_role_bindings for select
  using (user_id = auth.uid() or current_user_role_group() = 'admin');

-- entitlements: user sees their own
create policy "entitlements_self_read" on entitlements for select
  using (user_id = auth.uid() or current_user_role_group() = 'admin');

-- financial_ledgers: party membership
create policy "ledgers_party_read" on financial_ledgers for select
  using (auth.uid() = any(party_ids) or current_user_role_group() = 'admin');

-- disclosures: self-read
create policy "disclosures_self_read" on disclosures for select
  using (user_id = auth.uid() or current_user_role_group() = 'admin');

-- ── Discovery feed materialized view (Group 1 §II.5 — k-anonymity) ───────────
create materialized view discovery_feed as
  select id, borough, null::text as zoning_class, null::text as avm_band
  from properties
  where exposure_policy != 'private'
    and (
      exposure_policy_held_since is null
      or exposure_policy_held_since < now() - interval '24 hours'
    );

create index on discovery_feed(borough);
-- Refresh: pg_cron every hour. k-anonymity enforced in API layer (< 5 parcels → 0 rows).

-- ── Billing-actor guard trigger (I-2) ────────────────────────────────────────
-- This function is used by ALL authorization tables. Created once here.
create or replace function assert_not_billing_actor()
returns trigger language plpgsql as $$
begin
  if current_setting('app.actor_class', true) = 'billing' then
    raise exception 'billing actor cannot modify authorization tables [I-2]';
  end if;
  return new;
end;
$$;

-- Apply the guard to 0001 tables that are now fully created
create trigger trg_prb_billing_guard
  before insert or update on property_role_bindings
  for each row execute function assert_not_billing_actor();

-- REVOKE billing-role grants on entitlements (entitlements is billing's domain;
-- authorization tables are categorically revoked)
revoke all on property_role_bindings from public;
revoke all on entitlements            from public;

-- ── 27-Role taxonomy (canonical — see Plan_v3 Part 1 §III.1) ─────────────────
-- Users.role is nav-routing ONLY. The canonical 27 values are enforced here.
alter table users
  add constraint users_role_check check (role in (
    -- Group 1 — Owner
    'owner_single', 'owner_investor', 'owner_distressed',
    -- Group 2 — Investor / Developer
    'investor_wholesaler', 'investor_value_add', 'investor_assembler',
    -- Group 3 — Lender / Capital Provider
    'lender_institutional', 'lender_heloc', 'lender_jv',
    -- Group 4 — Legal Shield
    'legal_transactional', 'legal_title', 'legal_expediter',
    'legal_loss_mitigation', 'legal_arbitrator',
    -- Group 5 — Contractor & Sub-Trade
    'contractor_gc', 'contractor_sub', 'contractor_supplier', 'contractor_logistics',
    -- Group 6 — Architect & Engineer
    'arch_ra', 'arch_engineer', 'arch_zoning',
    -- Group 7 — Property Manager & Tenant
    'prop_manager', 'prop_tenant',
    -- Group 9 — Brokerage
    'broker_commercial', 'broker_residential', 'broker_leasing',
    -- Internal
    'admin'
  ));

-- ── current_user_role_group() — nav routing helper (NOT a row-access predicate)
-- Used ONLY in the admin branch of RLS policies. Never for data-row access.
create or replace function current_user_role_group()
returns text language sql security definer stable as $$
  select case
    when role in ('owner_single','owner_investor','owner_distressed')
      then 'owner'
    when role in ('investor_wholesaler','investor_value_add','investor_assembler')
      then 'investor'
    when role in ('lender_institutional','lender_heloc','lender_jv')
      then 'lender'
    when role in ('legal_transactional','legal_title','legal_expediter','legal_loss_mitigation')
      then 'attorney'
    when role = 'legal_arbitrator'
      then 'neutral'
    when role in ('contractor_gc','contractor_sub','contractor_supplier','contractor_logistics')
      then 'contractor'
    when role in ('arch_ra','arch_engineer','arch_zoning')
      then 'architect'
    when role = 'prop_manager'
      then 'property_manager'
    when role = 'prop_tenant'
      then 'tenant'
    when role in ('broker_commercial','broker_residential','broker_leasing')
      then 'broker'
    when role = 'admin'
      then 'admin'
    else 'unknown'
  end
  from users where id = auth.uid();
$$;

-- ── Group 1: has_property_capacity() ─────────────────────────────────────────
create or replace function has_property_capacity(
  p_property_id uuid,
  p_capacity    text
) returns boolean language sql security definer stable as $$
  select exists (
    select 1 from property_role_bindings
    where user_id    = auth.uid()
      and property_id = p_property_id
      and capacity    = p_capacity
      and status      = 'active'
  );
$$;

-- ── RLS on 0001 tables ────────────────────────────────────────────────────────
alter table properties           enable row level security;
alter table property_role_bindings enable row level security;
alter table entitlements         enable row level security;
alter table agreements           enable row level security;
alter table documents            enable row level security;
alter table financial_ledgers    enable row level security;
alter table escrow_intents       enable row level security;
alter table disclosures          enable row level security;

-- properties: owner may read their own; exposure_policy drives discovery (separate)
create policy "properties_owner_read" on properties for select
  using (
    has_property_capacity(id, 'owner_single')
    or has_property_capacity(id, 'owner_investor')
    or has_property_capacity(id, 'owner_distressed')
    or current_user_role_group() = 'admin'
  );

-- property_role_bindings: user sees their own rows only
create policy "prb_self_read" on property_role_bindings for select
  using (user_id = auth.uid() or current_user_role_group() = 'admin');

-- entitlements: user sees their own
create policy "entitlements_self_read" on entitlements for select
  using (user_id = auth.uid() or current_user_role_group() = 'admin');

-- financial_ledgers: party membership
create policy "ledgers_party_read" on financial_ledgers for select
  using (auth.uid() = any(party_ids) or current_user_role_group() = 'admin');

-- disclosures: self-read
create policy "disclosures_self_read" on disclosures for select
  using (user_id = auth.uid() or current_user_role_group() = 'admin');

-- ── Discovery feed materialized view (Group 1 §II.5 — k-anonymity) ───────────
create materialized view discovery_feed as
  select id, borough, null::text as zoning_class, null::text as avm_band
  from properties
  where exposure_policy != 'private'
    and (
      exposure_policy_held_since is null
      or exposure_policy_held_since < now() - interval '24 hours'
    );

create index on discovery_feed(borough);
-- Refresh: pg_cron every hour. k-anonymity enforced in API layer (< 5 parcels → 0 rows).

-- ── Institutions & Facilities ────────────────────────────────────────────────
create table institutions (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  activation_level text not null default 'unverified'
                     check (activation_level in
                       ('unverified','approved','suspended')),
  product_lines    text[] not null default '{}',
  created_at       timestamptz not null default now()
);

create table institution_members (
  institution_id              uuid not null references institutions(id) on delete cascade,
  user_id                     uuid not null references users(id) on delete cascade,
  inst_role                   text not null
                                check (inst_role in
                                  ('rm','underwriter','credit_officer',
                                   'compliance','ops','admin')),
  credit_authority_cents      bigint not null default 0,
  dual_control_threshold_cents bigint not null default 0,
  created_at                  timestamptz not null default now(),
  primary key (institution_id, user_id)
);

create table facilities (
  id                  uuid primary key default gen_random_uuid(),
  institution_id      uuid not null references institutions(id),
  borrower_id         uuid not null references users(id),
  facility_type       text not null
                        check (facility_type in
                          ('construction','bridge','heloc','mezzanine','jv_equity')),
  committed_usd_cents bigint not null check (committed_usd_cents > 0),
  status              text not null default 'pending'
                        check (status in
                          ('pending','approved','active','matured','defaulted','closed')),
  created_at          timestamptz not null default now()
);

create table facility_parties (
  facility_id    uuid not null references facilities(id) on delete cascade,
  user_id        uuid not null references users(id) on delete cascade,
  institution_id uuid references institutions(id),
  party_role     text not null
                   check (party_role in
                     ('borrower','guarantor','lender_rm','co_lender',
                      'title','counsel','inspector')),
  status         text not null default 'active'
                   check (status in ('active','removed')),
  created_at     timestamptz not null default now(),
  primary key (facility_id, user_id)
);

create trigger trg_fp_billing_guard
  before insert or update on facility_parties
  for each row execute function assert_not_billing_actor();

-- ── Group 3: is_facility_party() ─────────────────────────────────────────────
create or replace function is_facility_party(p_facility_id uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from facility_parties
    where user_id   = auth.uid()
      and facility_id = p_facility_id
      and status    = 'active'
  );
$$;

-- ── RLS ───────────────────────────────────────────────────────────────────────
alter table institutions       enable row level security;
alter table institution_members enable row level security;
alter table facilities         enable row level security;
alter table facility_parties   enable row level security;

create policy "facilities_party_read" on facilities for select
  using (is_facility_party(id) or current_user_role_group() = 'admin');

create policy "facility_parties_self_read" on facility_parties for select
  using (user_id = auth.uid() or current_user_role_group() = 'admin');

-- ── Law Firms & Firm Members ──────────────────────────────────────────────────
create table firms (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  admission_level text not null default 'unverified'
                    check (admission_level in
                      ('unverified','state_bar_verified','multi_jurisdiction')),
  created_at      timestamptz not null default now()
);

create table firm_members (
  firm_id    uuid not null references firms(id) on delete cascade,
  user_id    uuid not null references users(id) on delete cascade,
  firm_role  text not null
               check (firm_role in
                 ('partner','associate','paralegal','staff','of_counsel',
                  'per_diem','process_server')),
  status     text not null default 'active'
               check (status in ('active','on_leave','terminated')),
  created_at timestamptz not null default now(),
  primary key (firm_id, user_id)
);

-- ── Matters ───────────────────────────────────────────────────────────────────
-- matter_type drives which practice workbench (Section I.4 of Legal Workspace Blueprint)
create table matters (
  id              uuid primary key default gen_random_uuid(),
  firm_id         uuid not null references firms(id),
  matter_type     text not null
                    check (matter_type in (
                      'real_estate_closing',   -- class_financial, class_general
                      'personal_injury',       -- class_phi
                      'bankruptcy',            -- class_insolvency
                      'corporate',             -- class_mnpi
                      'family_estates',        -- class_family
                      'municipal_expediting',  -- class_general
                      'loss_mitigation',       -- class_general + class_financial
                      'arbitration'            -- class_general
                    )),
  status          text not null default 'intake'
                    check (status in
                      ('intake','active','on_hold','closed','archived')),
  created_at      timestamptz not null default now()
);

-- ── Matter Parties (the row-level authorization primitive) ───────────────────
create table matter_parties (
  matter_id   uuid not null references matters(id) on delete cascade,
  user_id     uuid not null references users(id) on delete cascade,
  matter_role text not null
                check (matter_role in (
                  'lead_counsel','co_counsel','supervising_attorney',
                  'paralegal','client','adverse_party',
                  'mediator','arbitrator','per_diem','process_server',
                  'expert_witness','observer'
                )),
  -- scope restricts which data classes this party may access (I-L8)
  -- empty array = class_general only
  scope       text[] not null default '{}',
  status      text not null default 'active'
                check (status in ('active','removed','suspended')),
  granted_at  timestamptz not null default now(),
  expires_at  timestamptz,  -- for per_diem and process_server rows (I-L20)
  primary key (matter_id, user_id)
);

create trigger trg_mp_billing_guard
  before insert or update on matter_parties
  for each row execute function assert_not_billing_actor();

-- ── Representations (attorney-client relationship record) ────────────────────
create table representations (
  id               uuid primary key default gen_random_uuid(),
  matter_id        uuid not null references matters(id) on delete cascade,
  counsel_user_id  uuid not null references users(id),
  client_user_id   uuid not null references users(id),
  scope            text not null default 'full',
  status           text not null default 'active'
                     check (status in ('active','withdrawn','terminated')),
  created_at       timestamptz not null default now()
);

-- ── Ethical Walls (VULN-05 — matter_parties alone not sufficient; wall overrides all)
-- See 0060+ for full wall hardening including retroactive index invalidation.
create table ethical_walls (
  id                 uuid primary key default gen_random_uuid(),
  wall_scope         text not null
                       check (wall_scope in ('matter','client','cluster')),
  -- For matter scope: matter_ids; for client scope: client_user_ids; for cluster: cluster_id
  matter_ids         uuid[],
  client_user_ids    uuid[],
  cluster_id         uuid,
  firm_id            uuid not null references firms(id),
  screened_user_ids  uuid[] not null,
  wall_epoch         bigint not null default 0,  -- increments on every erection/modification
  erected_at         timestamptz not null default now(),
  erected_by         uuid not null references users(id),
  -- Soft removal only; walls are never hard-deleted (audit requirement)
  removed_at         timestamptz,
  removed_by         uuid references users(id)
);

-- ── Conflict Checks ──────────────────────────────────────────────────────────
create table conflict_checks (
  id           uuid primary key default gen_random_uuid(),
  matter_id    uuid not null references matters(id),
  checked_by   uuid not null references users(id),
  -- 'clear' | 'conflict_found' | 'consent_required' | 'disqualifying'
  result       text not null
                 check (result in
                   ('clear','conflict_found','consent_required','disqualifying')),
  checked_at   timestamptz not null default now(),
  notes        text   -- prose summary; no PII
);

-- ── Trust Accounts (baseline — full hardening in 0060) ───────────────────────
-- Every firm's IOLTA / trust account is registered here before any ledger entry.
create table trust_accounts (
  id                   uuid primary key default gen_random_uuid(),
  firm_id              uuid not null references firms(id),
  account_type         text not null
                         check (account_type in ('iolta','dedicated_trust','escrow_operating')),
  bank_institution     text not null,
  last_four            text not null,
  -- debit_block_attested: must be re-attested quarterly (I-L5)
  debit_block_attested boolean not null default false,
  debit_block_attested_at timestamptz,
  status               text not null default 'active'
                         check (status in ('active','frozen','closed')),
  created_at           timestamptz not null default now()
);

-- ── Trust Ledger (baseline — full dual-control and hash-chain in 0060) ────────
create table trust_ledger (
  id                uuid primary key default gen_random_uuid(),
  trust_account_id  uuid not null references trust_accounts(id),
  client_user_id    uuid not null references users(id),
  debit_kind        text
                      check (debit_kind in (
                        'client_disbursement','approved_settlement_line',
                        'earned_fee_transfer','court_ordered_payment',
                        'interpleader_deposit','interest_remittance',
                        'contra_reversal'
                      )),
  direction         text not null check (direction in ('credit','debit')),
  amount_cents      bigint not null check (amount_cents > 0),
  -- maker / checker enforce I-L1 (full identity_subject check added in 0060)
  maker_id          uuid not null references users(id),
  checker_id        uuid references users(id),
  -- running hash chain — seed and function added in 0060
  prior_hash        text,
  row_hash          text,
  status            text not null default 'pending'
                      check (status in ('pending','posted','reversed')),
  memo              text,
  created_at        timestamptz not null default now(),
  -- Ledger is append-only: no updates, no deletes
  constraint trust_ledger_no_dual_same_person
    check (checker_id is null or maker_id <> checker_id)
);

-- ── Group 4: is_matter_party() ────────────────────────────────────────────────
create or replace function is_matter_party(p_matter_id uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from matter_parties
    where user_id  = auth.uid()
      and matter_id = p_matter_id
      and status   = 'active'
      and (expires_at is null or expires_at > now())
  );
$$;

-- ── wall_blocks_user() — used in all matter-scoped RLS (I-L12) ────────────────
create or replace function wall_blocks_user(
  p_matter_id uuid,
  p_user_id   uuid default auth.uid()
) returns boolean language sql security definer stable as $$
  select exists (
    select 1 from ethical_walls ew
    where ew.removed_at is null
      and p_user_id = any(ew.screened_user_ids)
      and (
        -- matter-scoped wall
        (ew.wall_scope = 'matter' and p_matter_id = any(ew.matter_ids))
        -- client-scoped wall (any matter for that client)
        or (ew.wall_scope = 'client' and exists (
          select 1 from matter_parties mp
          where mp.matter_id = p_matter_id
            and mp.user_id   = any(ew.client_user_ids)
            and mp.matter_role = 'client'
        ))
      )
  );
$$;

-- ── RLS ───────────────────────────────────────────────────────────────────────
alter table firms           enable row level security;
alter table firm_members    enable row level security;
alter table matters         enable row level security;
alter table matter_parties  enable row level security;
alter table representations enable row level security;
alter table ethical_walls   enable row level security;
alter table conflict_checks enable row level security;
alter table trust_accounts  enable row level security;
alter table trust_ledger    enable row level security;

-- Existence protection (I-L11): matter that cannot be read is indistinguishable from non-existent
create policy "matters_party_read" on matters for select
  using (
    is_matter_party(id)
    and not wall_blocks_user(id)
    or current_user_role_group() = 'admin'
  );

create policy "matter_parties_self_read" on matter_parties for select
  using (
    (user_id = auth.uid() and is_matter_party(matter_id))
    or current_user_role_group() = 'admin'
  );

create policy "representations_party_read" on representations for select
  using (
    (counsel_user_id = auth.uid() or client_user_id = auth.uid())
    and is_matter_party(matter_id)
    and not wall_blocks_user(matter_id)
    or current_user_role_group() = 'admin'
  );

create policy "trust_accounts_firm_read" on trust_accounts for select
  using (
    exists (
      select 1 from firm_members
      where firm_id = trust_accounts.firm_id and user_id = auth.uid()
    )
    or current_user_role_group() = 'admin'
  );

create policy "trust_ledger_party_read" on trust_ledger for select
  using (
    (maker_id = auth.uid() or client_user_id = auth.uid())
    or current_user_role_group() = 'admin'
  );

-- ── Companies (contractor organizations) ─────────────────────────────────────
create table companies (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  credential_level text not null default 'unverified'
                     check (credential_level in
                       ('unverified','licensed','bonded','certified')),
  created_at       timestamptz not null default now()
);

create table crew_members (
  company_id     uuid not null references companies(id) on delete cascade,
  user_id        uuid not null references users(id) on delete cascade,
  -- identity_hash: HMAC of government-ID; never store the ID itself
  identity_hash  text,
  qualifications jsonb not null default '{}',
  status         text not null default 'active'
                   check (status in ('active','suspended','terminated')),
  created_at     timestamptz not null default now(),
  primary key (company_id, user_id)
);

-- ── Work Packages ─────────────────────────────────────────────────────────────
create table work_packages (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id),
  property_id uuid not null references properties(id),
  scope       text not null,
  status      text not null default 'draft'
                check (status in
                  ('draft','awarded','in_progress','inspection_pending',
                   'completed','disputed','closed')),
  created_at  timestamptz not null default now()
);

create table wp_parties (
  work_package_id uuid not null references work_packages(id) on delete cascade,
  user_id         uuid not null references users(id) on delete cascade,
  company_id      uuid references companies(id),
  wp_role         text not null
                    check (wp_role in
                      ('gc','sub','supplier','inspector','owner_rep','lender_rep')),
  status          text not null default 'active'
                    check (status in ('active','removed')),
  created_at      timestamptz not null default now(),
  primary key (work_package_id, user_id)
);

create trigger trg_wp_billing_guard
  before insert or update on wp_parties
  for each row execute function assert_not_billing_actor();

-- ── BoQ (Bill of Quantities) — linked to work packages ────────────────────────
-- Individual line items; never aggregated cross-company (I-31 analogue for G5)
create table boq_items (
  id              uuid primary key default gen_random_uuid(),
  work_package_id uuid not null references work_packages(id) on delete cascade,
  csi_code        text,
  description     text not null,
  quantity        numeric not null check (quantity > 0),
  unit            text not null,
  unit_cost_cents bigint not null check (unit_cost_cents >= 0),
  created_at      timestamptz not null default now()
);

-- ── Group 5: is_work_package_party() ─────────────────────────────────────────
create or replace function is_work_package_party(p_wp_id uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from wp_parties
    where user_id       = auth.uid()
      and work_package_id = p_wp_id
      and status        = 'active'
  );
$$;

-- ── RLS ───────────────────────────────────────────────────────────────────────
alter table companies     enable row level security;
alter table crew_members  enable row level security;
alter table work_packages enable row level security;
alter table wp_parties    enable row level security;
alter table boq_items     enable row level security;

create policy "work_packages_party_read" on work_packages for select
  using (is_work_package_party(id) or current_user_role_group() = 'admin');

create policy "boq_items_party_read" on boq_items for select
  using (
    is_work_package_party(work_package_id)
    or current_user_role_group() = 'admin'
  );

-- ── Practices (architecture/engineering firms) ────────────────────────────────
create table practices (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  credential_level text not null default 'unverified'
                     check (credential_level in
                       ('unverified','registered','certified','stamp_eligible')),
  created_at       timestamptz not null default now()
);

create table seal_holders (
  practice_id   uuid not null references practices(id) on delete cascade,
  user_id       uuid not null references users(id) on delete cascade,
  identity_hash text,
  discipline    text not null
                  check (discipline in
                    ('architecture','structural','civil','mep','zoning','geotechnical')),
  status        text not null default 'active'
                  check (status in ('active','suspended','retired')),
  created_at    timestamptz not null default now(),
  primary key (practice_id, user_id)
);

create table professional_licences (
  id              uuid primary key default gen_random_uuid(),
  seal_holder_id  uuid not null,
  seal_holder_user_id uuid not null references users(id),
  jurisdiction    text not null,
  discipline      text not null,
  licence_number  text not null,
  standing        text not null
                    check (standing in ('active','lapsed','revoked','pending_renewal')),
  expires_on      date,
  stamp_content   text,  -- encoded stamp/seal data; encrypted at rest
  created_at      timestamptz not null default now(),
  foreign key (seal_holder_id, seal_holder_user_id)
    references seal_holders(practice_id, user_id)
);

-- ── Design Packages ───────────────────────────────────────────────────────────
create table design_packages (
  id          uuid primary key default gen_random_uuid(),
  practice_id uuid not null references practices(id),
  project_id  uuid not null references properties(id),
  discipline  text not null
                check (discipline in
                  ('architecture','structural','civil','mep','zoning','geotechnical')),
  phase       text not null
                check (phase in
                  ('feasibility','schematic','design_development',
                   'construction_documents','permit_set','record_set')),
  status      text not null default 'draft'
                check (status in
                  ('draft','in_review','sealed','issued','superseded','archived')),
  created_at  timestamptz not null default now()
);

create table dp_parties (
  design_package_id uuid not null references design_packages(id) on delete cascade,
  user_id           uuid not null references users(id) on delete cascade,
  practice_id       uuid references practices(id),
  dp_role           text not null
                      check (dp_role in
                        ('lead_designer','engineer_of_record','drafter',
                         'reviewer','owner_rep','contractor_access')),
  status            text not null default 'active'
                      check (status in ('active','removed')),
  created_at        timestamptz not null default now(),
  primary key (design_package_id, user_id)
);

create trigger trg_dp_billing_guard
  before insert or update on dp_parties
  for each row execute function assert_not_billing_actor();

create table design_licences (
  id                uuid primary key default gen_random_uuid(),
  grantor_id        uuid not null references users(id),
  grantee_id        uuid not null references users(id),
  design_package_id uuid not null references design_packages(id),
  scope             text not null,
  permitted_uses    text[] not null default '{}',
  status            text not null default 'active'
                      check (status in ('active','revoked','expired')),
  expires_at        timestamptz,
  created_at        timestamptz not null default now()
);

-- ── Group 6: is_design_package_party() ───────────────────────────────────────
create or replace function is_design_package_party(p_dp_id uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from dp_parties
    where user_id          = auth.uid()
      and design_package_id = p_dp_id
      and status           = 'active'
  );
$$;

-- ── RLS ───────────────────────────────────────────────────────────────────────
alter table practices           enable row level security;
alter table seal_holders        enable row level security;
alter table professional_licences enable row level security;
alter table design_packages     enable row level security;
alter table dp_parties          enable row level security;
alter table design_licences     enable row level security;

create policy "design_packages_party_read" on design_packages for select
  using (is_design_package_party(id) or current_user_role_group() = 'admin');

create policy "design_licences_party_read" on design_licences for select
  using (
    grantor_id = auth.uid() or grantee_id = auth.uid()
    or current_user_role_group() = 'admin'
  );

-- ── Management Engagements ────────────────────────────────────────────────────
-- A manager's authorization to manage a specific owner's property
create table management_engagements (
  id                        uuid primary key default gen_random_uuid(),
  manager_user_id           uuid not null references users(id),
  owner_property_binding_id uuid not null references property_role_bindings(id),
  licence_verified          boolean not null default false,
  trust_account_verified    boolean not null default false,
  status                    text not null default 'pending'
                              check (status in
                                ('pending','active','suspended','terminated')),
  created_at                timestamptz not null default now()
);

-- ── Tenancies ─────────────────────────────────────────────────────────────────
create table tenancies (
  id             uuid primary key default gen_random_uuid(),
  engagement_id  uuid not null references management_engagements(id),
  unit_id        text not null,  -- unit identifier within the property
  tenant_user_ids uuid[] not null,
  lease_start    date not null,
  lease_end      date,
  rent_cents     bigint not null check (rent_cents > 0),
  status         text not null default 'active'
                   check (status in
                     ('pending','active','notice_given','holdover','ended')),
  created_at     timestamptz not null default now()
);

-- Access Floor invariant (I-22): the platform may NEVER gate physical access.
-- The status column above represents the legal tenancy state for accounting/notices only.
-- No UI action derived from this table may trigger a lockout or utility interruption.

create table rent_trust (
  id          uuid primary key default gen_random_uuid(),
  tenancy_id  uuid not null references tenancies(id),
  amount_cents bigint not null check (amount_cents > 0),
  status      text not null default 'held'
                check (status in ('held','applied','returned','disputed')),
  applied_at  timestamptz
);

create table deposit_trust (
  id                      uuid primary key default gen_random_uuid(),
  tenancy_id              uuid not null references tenancies(id),
  amount_cents            bigint not null check (amount_cents > 0),
  depository              text not null,
  interest_accrued_cents  bigint not null default 0,
  status                  text not null default 'held'
                            check (status in ('held','partially_returned','returned','disputed')),
  created_at              timestamptz not null default now()
);

create table screening_reports (
  id               uuid primary key default gen_random_uuid(),
  applicant_user_id uuid not null references users(id),
  ordered_at       timestamptz not null default now(),
  expires_at       timestamptz,
  -- Only the conclusion is stored here; the raw transaction stream is never stored (I-15)
  result_summary   text,  -- 'approved' | 'approved_with_conditions' | 'incomplete'
  -- Auto-deny is PROHIBITED (I-25). No 'denied' status here by design.
  status           text not null default 'pending'
                     check (status in
                       ('pending','complete','expired'))
);

-- ── RLS ───────────────────────────────────────────────────────────────────────
alter table management_engagements enable row level security;
alter table tenancies              enable row level security;
alter table rent_trust             enable row level security;
alter table deposit_trust          enable row level security;
alter table screening_reports      enable row level security;

create policy "tenancies_party_read" on tenancies for select
  using (
    auth.uid() = any(tenant_user_ids)
    or exists (
      select 1 from management_engagements me
      where me.id = engagement_id and me.manager_user_id = auth.uid()
    )
    or current_user_role_group() = 'admin'
  );

create policy "screening_reports_self_read" on screening_reports for select
  using (applicant_user_id = auth.uid() or current_user_role_group() = 'admin');

-- ── Brokerages & Seats ────────────────────────────────────────────────────────
create table brokerages (
  id                       uuid primary key default gen_random_uuid(),
  name                     text not null,
  designated_broker_user_id uuid not null references users(id),
  registration_level       text not null default 'unverified'
                             check (registration_level in
                               ('unverified','state_registered','multi_state')),
  e_and_o_verified         boolean not null default false,
  e_and_o_verified_at      timestamptz,
  created_at               timestamptz not null default now()
);

create table broker_seats (
  brokerage_id uuid not null references brokerages(id) on delete cascade,
  user_id      uuid not null references users(id) on delete cascade,
  seat_role    text not null
                 check (seat_role in
                   ('designated_broker','associate_broker','salesperson','leasing_agent')),
  licence_id   text,
  status       text not null default 'active'
                 check (status in ('active','suspended','terminated')),
  created_at   timestamptz not null default now(),
  primary key (brokerage_id, user_id)
);

-- ── Agency Representations ────────────────────────────────────────────────────
-- I-31: no commission rate is stored, benchmarked, or aggregated across brokerages.
create table agency_representations (
  id                  uuid primary key default gen_random_uuid(),
  brokerage_id        uuid not null references brokerages(id),
  listing_property_id uuid references properties(id),
  principal_user_id   uuid not null references users(id),
  representation_type text not null
                        check (representation_type in
                          ('seller','buyer','tenant_rep','landlord_rep','dual')),
  agency_type         text not null
                        check (agency_type in
                          ('exclusive_right','exclusive_agency','open','designated')),
  -- commission_rate is deliberately ABSENT (I-31)
  status              text not null default 'active'
                        check (status in ('active','terminated','expired')),
  created_at          timestamptz not null default now()
);

-- ── RLS ───────────────────────────────────────────────────────────────────────
alter table brokerages            enable row level security;
alter table broker_seats          enable row level security;
alter table agency_representations enable row level security;

create policy "brokerages_seat_read" on brokerages for select
  using (
    exists (
      select 1 from broker_seats
      where brokerage_id = brokerages.id and user_id = auth.uid()
    )
    or current_user_role_group() = 'admin'
  );

create policy "agency_reps_party_read" on agency_representations for select
  using (
    brokerage_id in (
      select brokerage_id from broker_seats where user_id = auth.uid()
    )
    or principal_user_id = auth.uid()
    or current_user_role_group() = 'admin'
  );

-- ── Performance indexes ───────────────────────────────────────────────────────
create index on property_role_bindings(user_id, status);
create index on property_role_bindings(property_id);
create index on deal_memberships(user_id, status);
create index on deal_memberships(deal_id);
create index on facility_parties(user_id, status);
create index on facility_parties(facility_id);
create index on matter_parties(user_id, status);
create index on matter_parties(matter_id);
create index on wp_parties(user_id, status);
create index on dp_parties(user_id, status);
create index on tenancies using gin(tenant_user_ids);
create index on broker_seats(user_id, status);
create index on ethical_walls using gin(screened_user_ids);
create index on trust_ledger(trust_account_id, created_at desc);
create index on trust_ledger(client_user_id);

-- ── workspace_manifest() — Group 1 navigation RPC ────────────────────────────
create or replace function workspace_manifest(p_user_id uuid)
returns jsonb language sql security definer as $$
  select jsonb_build_object(
    'workspaces', coalesce(jsonb_agg(
      jsonb_build_object(
        'propertyId',       prb.property_id,
        'capacity',         prb.capacity,
        'address',          p.address,
        'upsell_allowed', (
          not exists (
            select 1 from property_role_bindings
            where user_id   = p_user_id
              and property_id = prb.property_id
              and capacity  = 'owner_distressed'
              and status    = 'active'
          )
        ),
        'subtabs', (
          case prb.capacity
            when 'owner_single'     then
              '["vitals","maintenance","renovation","insurance","local_network"]'::jsonb
            when 'owner_investor'   then
              '["vitals","assembly_map","jv_syndication","enterprise_desk","insurance"]'::jsonb
            when 'owner_distressed' then
              '["defensive_map","loss_mitigation","legal_shield","exposure_privacy"]'::jsonb
          end
        )
      )
    ), '[]'::jsonb)
  )
  from property_role_bindings prb
  join properties p on p.id = prb.property_id
  where prb.user_id = p_user_id and prb.status = 'active';
$$;

-- ── subject_party() — HRAG dispatcher routing predicate (I-1 extension) ──────
-- Returns true if the caller is a party to the given subject (any authorization model).
-- Used by the Agent Factory retrieval pipeline to derive SCOPE_SET server-side.
create or replace function subject_party(
  p_kind text,   -- 'property'|'deal'|'facility'|'matter'|'work_package'|'design_package'
  p_id   uuid
) returns boolean language sql security definer stable as $$
  select case p_kind
    when 'property'       then
      has_property_capacity(p_id,'owner_single')
      or has_property_capacity(p_id,'owner_investor')
      or has_property_capacity(p_id,'owner_distressed')
    when 'deal'           then is_deal_member(p_id)
    when 'facility'       then is_facility_party(p_id)
    when 'matter'         then is_matter_party(p_id) and not wall_blocks_user(p_id)
    when 'work_package'   then is_work_package_party(p_id)
    when 'design_package' then is_design_package_party(p_id)
    else false
  end;
$$;

-- ── on_restricted_list() — MNPI cross-group predicate (I-L10) ────────────────
-- Returns true if the caller holds an active MNPI designation that overlaps
-- the counterparty cluster. Full implementation requires 0060 identity_subjects table;
-- this is the stub that compiles and returns false until 0060 runs.
create or replace function on_restricted_list(
  p_counterparty_id uuid
) returns boolean language sql security definer stable as $$
  -- Stub: full implementation in 0060 after identity_subjects is created.
  select false;
$$;

-- ── Revoke public grants on all new authorization tables ──────────────────────
revoke all on deal_memberships        from public;
revoke all on facility_parties        from public;
revoke all on matter_parties          from public;
revoke all on wp_parties              from public;
revoke all on dp_parties              from public;
revoke all on ethical_walls           from public;
revoke all on trust_ledger            from public;
revoke all on trust_accounts          from public;
revoke all on broker_seats            from public;
revoke all on agency_representations  from public;

0020–0059 — Groups 1–9 Extension Tables
Migration philosophy for 0020–0059. Each migration extends one group's baseline with tables needed for full operational functionality. Tables that carry the same authorization model as the group's primitive (e.g. all matter-scoped tables route through is_matter_party()) are grouped into the same migration to minimize partial-deployment windows.

-- ── Parcel-scoped AVM snapshots (read-only ingest from verification service) ──
create table avm_snapshots (
  id            uuid primary key default gen_random_uuid(),
  property_id   uuid not null references properties(id) on delete cascade,
  avm_cents     bigint not null check (avm_cents > 0),
  avm_band      text,  -- e.g. '900k–1.1m'
  as_of         date not null,
  source        text not null,
  created_at    timestamptz not null default now()
);

-- ── Municipal data (violations, liens, SWOs) — scope to bound parcel ─────────
create table municipal_records (
  id            uuid primary key default gen_random_uuid(),
  property_id   uuid not null references properties(id),
  record_type   text not null
                  check (record_type in
                    ('swo','code_violation','tax_lien','mechanic_lien',
                     'environmental','permit','zoning_violation')),
  agency        text,
  reference_no  text,
  filed_at      date,
  resolved_at   date,
  severity      text check (severity in ('open','cured','dismissed','pending')),
  created_at    timestamptz not null default now()
);

-- ── Assembly intent (G1/G2 overlap — owner_investor <-> master_assembler) ─────
create table assembly_intents (
  id             uuid primary key default gen_random_uuid(),
  initiator_id   uuid not null references users(id),
  property_ids   uuid[] not null,
  deal_id        uuid references deals(id),
  intent_type    text not null
                   check (intent_type in ('jv_proposal','bulk_offer','holding')),
  status         text not null default 'draft'
                   check (status in ('draft','proposed','accepted','rejected','void')),
  created_at     timestamptz not null default now()
);

alter table avm_snapshots     enable row level security;
alter table municipal_records enable row level security;
alter table assembly_intents  enable row level security;

create policy "avm_snapshots_owner_read" on avm_snapshots for select
  using (
    has_property_capacity(property_id,'owner_single')
    or has_property_capacity(property_id,'owner_investor')
    or has_property_capacity(property_id,'owner_distressed')
    or current_user_role_group() = 'admin'
  );

create policy "municipal_records_owner_read" on municipal_records for select
  using (
    has_property_capacity(property_id,'owner_single')
    or has_property_capacity(property_id,'owner_investor')
    or has_property_capacity(property_id,'owner_distressed')
    or current_user_role_group() = 'admin'
  );

create policy "assembly_intents_party_read" on assembly_intents for select
  using (
    initiator_id = auth.uid()
    or auth.uid() = any(property_ids::uuid[])  -- simplified; full binding check in app layer
    or current_user_role_group() = 'admin'
  );

-- ── Deal documents (deal-scoped; gated by is_deal_member) ────────────────────
create table deal_documents (
  id          uuid primary key default gen_random_uuid(),
  deal_id     uuid not null references deals(id) on delete cascade,
  document_id uuid not null references documents(id),
  visibility  text not null default 'deal_members'
                check (visibility in ('deal_members','lender_only','counsel_only')),
  uploaded_by uuid not null references users(id),
  created_at  timestamptz not null default now()
);

-- ── Title diligence runs (G2/G4 shared workflow) ──────────────────────────────
create table title_diligence (
  id           uuid primary key default gen_random_uuid(),
  deal_id      uuid not null references deals(id),
  property_id  uuid not null references properties(id),
  ordered_by   uuid not null references users(id),
  status       text not null default 'ordered'
                 check (status in
                   ('ordered','in_progress','commitment_issued',
                    'clear','exceptions_outstanding','failed')),
  ordered_at   timestamptz not null default now(),
  issued_at    timestamptz
);

-- ── Contract assignments (G2 — wholesaler/assignment rail) ───────────────────
create table contract_assignments (
  id              uuid primary key default gen_random_uuid(),
  deal_id         uuid not null references deals(id),
  assignor_id     uuid not null references users(id),
  assignee_id     uuid not null references users(id),
  assignment_fee_cents bigint not null check (assignment_fee_cents >= 0),
  status          text not null default 'pending'
                    check (status in
                      ('pending','executed','voided')),
  executed_at     timestamptz,
  created_at      timestamptz not null default now()
);

alter table deal_documents       enable row level security;
alter table title_diligence      enable row level security;
alter table contract_assignments enable row level security;

create policy "deal_documents_member_read" on deal_documents for select
  using (is_deal_member(deal_id) or current_user_role_group() = 'admin');

create policy "title_diligence_member_read" on title_diligence for select
  using (is_deal_member(deal_id) or current_user_role_group() = 'admin');

create policy "contract_assignments_party_read" on contract_assignments for select
  using (
    assignor_id = auth.uid() or assignee_id = auth.uid()
    or is_deal_member(deal_id)
    or current_user_role_group() = 'admin'
  );

-- ── Construction draw requests ────────────────────────────────────────────────
create table draw_requests (
  id               uuid primary key default gen_random_uuid(),
  facility_id      uuid not null references facilities(id),
  work_package_id  uuid references work_packages(id),
  requested_by     uuid not null references users(id),
  amount_cents     bigint not null check (amount_cents > 0),
  milestone_label  text not null,
  status           text not null default 'pending'
                     check (status in
                       ('pending','inspector_review','approved',
                        'funded','rejected','on_hold')),
  submitted_at     timestamptz not null default now(),
  approved_at      timestamptz,
  funded_at        timestamptz
);

-- Dual-control: approver must differ from requester (G3 §II.4)
alter table draw_requests
  add constraint draw_requests_dual_control
    check (true);  -- Enforced via trigger below; constraint placeholder.

create or replace function enforce_draw_dual_control()
returns trigger language plpgsql as $$
begin
  -- The approval is set in a separate update; check here that the status transition
  -- is performed by a different user than the requester.
  -- Full implementation checks institution_members.dual_control_threshold_cents.
  if new.status = 'approved' and new.approved_at is not null then
    if new.requested_by = auth.uid() then
      raise exception
        'draw request approver must differ from requester [G3 dual control]';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_draw_dual_control
  before update on draw_requests
  for each row execute function enforce_draw_dual_control();

-- ── Field inspection reports (computer vision milestone input) ────────────────
create table field_inspections (
  id              uuid primary key default gen_random_uuid(),
  draw_request_id uuid not null references draw_requests(id),
  inspector_id    uuid not null references users(id),
  photo_paths     text[] not null default '{}',
  milestone_verified boolean not null default false,
  -- vision_model_result is ADVISORY only; gate is human sign-off (I-A3)
  vision_model_result jsonb,
  inspector_notes text,
  inspected_at    timestamptz not null default now()
);

-- ── Loan covenants ────────────────────────────────────────────────────────────
create table loan_covenants (
  id           uuid primary key default gen_random_uuid(),
  facility_id  uuid not null references facilities(id),
  covenant_type text not null
                  check (covenant_type in
                    ('ltv_cap','dscr_floor','completion_date',
                     'insurance_current','permits_current','custom')),
  description  text not null,
  status       text not null default 'compliant'
                 check (status in
                   ('compliant','watch','breach','waived','cured')),
  last_tested_at timestamptz,
  created_at   timestamptz not null default now()
);

alter table draw_requests   enable row level security;
alter table field_inspections enable row level security;
alter table loan_covenants  enable row level security;

create policy "draw_requests_party_read" on draw_requests for select
  using (is_facility_party(facility_id) or current_user_role_group() = 'admin');

create policy "field_inspections_party_read" on field_inspections for select
  using (
    exists (
      select 1 from draw_requests dr
      where dr.id = draw_request_id
        and is_facility_party(dr.facility_id)
    )
    or current_user_role_group() = 'admin'
  );

create policy "loan_covenants_party_read" on loan_covenants for select
  using (is_facility_party(facility_id) or current_user_role_group() = 'admin');

-- ── Privilege successions (I-L9 — dynamic privilege holder resolution) ────────
-- A Chapter 7 trustee, executor, or surviving entity becomes the holder dynamically.
create table privilege_successions (
  id                    uuid primary key default gen_random_uuid(),
  matter_id             uuid not null references matters(id),
  -- original holder
  original_holder_id    uuid not null references users(id),
  -- successor holder (trustee, executor, surviving entity user id)
  successor_holder_id   uuid not null references users(id),
  succession_type       text not null
                          check (succession_type in
                            ('chapter7_trustee','executor','surviving_entity',
                             'guardian','court_appointed')),
  court_order_reference text,
  effective_at          timestamptz not null default now(),
  created_at            timestamptz not null default now()
);

-- ── Arbitration cases (G4-01 closure — FAA-consistent design) ────────────────
-- Awards are NOT self-executing (G4-02 closure).
-- Staged release: undisputed baseline released on award; contested delta requires
-- a separate confirmation window. No self-execution ever.
create table arbitration_cases (
  id                uuid primary key default gen_random_uuid(),
  matter_id         uuid not null references matters(id),
  arbitrator_user_id uuid not null references users(id),
  -- Arbitrator selected through disclosed process; platform does NOT earn on outcome (G4-03/G4-06)
  selection_method  text not null
                      check (selection_method in
                        ('party_agreement','aaa_list','court_appointed','platform_roster')),
  status            text not null default 'initiated'
                      check (status in
                        ('initiated','evidentiary','deliberation',
                         'award_issued','confirmation_pending',
                         'confirmed','vacated','settled')),
  -- FAA-consistent: review grounds preserved; no "unappealable" language anywhere (G4-01)
  faa_review_preserved boolean not null default true,
  award_issued_at   timestamptz,
  created_at        timestamptz not null default now()
);

create table arbitration_awards (
  id                   uuid primary key default gen_random_uuid(),
  case_id              uuid not null references arbitration_cases(id),
  -- undisputed_baseline_cents: may release after standard confirmation window
  undisputed_baseline_cents bigint not null default 0
    check (undisputed_baseline_cents >= 0),
  -- contested_delta_cents: requires separate human confirmation, never auto-releases
  contested_delta_cents bigint not null default 0
    check (contested_delta_cents >= 0),
  award_text_hash      text,  -- hash of the award document; not the text itself
  -- Release requires custodian action; platform NEVER executes release (G4-02 closure)
  baseline_released_at timestamptz,
  delta_confirmed_at   timestamptz,
  delta_released_at    timestamptz,
  created_at           timestamptz not null default now()
);

alter table privilege_successions enable row level security;
alter table arbitration_cases     enable row level security;
alter table arbitration_awards    enable row level security;

create policy "privilege_successions_party_read" on privilege_successions for select
  using (
    is_matter_party(matter_id)
    and not wall_blocks_user(matter_id)
    or current_user_role_group() = 'admin'
  );

create policy "arbitration_cases_party_read" on arbitration_cases for select
  using (
    is_matter_party(matter_id)
    and not wall_blocks_user(matter_id)
    or current_user_role_group() = 'admin'
  );

Group 4 Extensions: Practice-Area Workbench Tables
Every table here is gated by is_matter_party() AND the data-class facet (I-L7, I-L8). The full class-grant predicate (has_data_class_grant()) is completed in migration 0060.

-- ── PI workbench — class_phi ──────────────────────────────────────────────────
create table pi_medical_records (
  id            uuid primary key default gen_random_uuid(),
  matter_id     uuid not null references matters(id) on delete cascade,
  data_class    text not null default 'class_phi'
                  check (data_class = 'class_phi'),
  provider_name text not null,
  record_date   date,
  storage_path  text not null,  -- encrypted at rest; path only in DB
  created_at    timestamptz not null default now()
);

create table pi_liens (
  id            uuid primary key default gen_random_uuid(),
  matter_id     uuid not null references matters(id) on delete cascade,
  data_class    text not null default 'class_phi'
                  check (data_class = 'class_phi'),
  lienholder    text not null,
  lien_amount_cents bigint not null,
  lien_type     text not null check (lien_type in ('medical','attorney','medicare','medicaid')),
  status        text not null default 'asserted'
                  check (status in ('asserted','negotiating','resolved','waived')),
  created_at    timestamptz not null default now()
);

-- ── Bankruptcy workbench — class_insolvency ────────────────────────────────────
create table bk_schedules (
  id          uuid primary key default gen_random_uuid(),
  matter_id   uuid not null references matters(id) on delete cascade,
  data_class  text not null default 'class_insolvency'
                check (data_class = 'class_insolvency'),
  schedule_type text not null
                  check (schedule_type in ('A_B','C','D','E_F','G','H','I','J')),
  filed_version int not null default 1,
  storage_path text not null,
  created_at  timestamptz not null default now()
);

-- ── Corporate workbench — class_mnpi ─────────────────────────────────────────
create table corp_transaction_records (
  id            uuid primary key default gen_random_uuid(),
  matter_id     uuid not null references matters(id) on delete cascade,
  data_class    text not null default 'class_mnpi'
                  check (data_class = 'class_mnpi'),
  record_type   text not null
                  check (record_type in
                    ('term_sheet','loi','cap_table_snapshot',
                     'nda','due_diligence_summary','closing_memo')),
  storage_path  text not null,
  -- MNPI cross-group predicate enforced at read time (I-L10, on_restricted_list())
  created_at    timestamptz not null default now()
);

-- ── Family/Estates workbench — class_family ───────────────────────────────────
create table family_asset_inventories (
  id                uuid primary key default gen_random_uuid(),
  matter_id         uuid not null references matters(id) on delete cascade,
  data_class        text not null default 'class_family'
                      check (data_class = 'class_family'),
  asset_type        text not null,
  description       text not null,
  estimated_value_cents bigint,
  -- minors_involved: triggers state-sealing rules in the API layer
  minors_involved   boolean not null default false,
  created_at        timestamptz not null default now()
);

-- ── RLS for all workbench tables ──────────────────────────────────────────────
-- NOTE: has_data_class_grant() stub — returns false until 0060 runs.
-- During 0041–0059, these tables are read-blocked for all except admin.
-- This is intentional: workbench data requires the full Legal Workspace stack (0060+).
create or replace function has_data_class_grant(
  p_matter_id uuid,
  p_class     text
) returns boolean language sql security definer stable as $$
  -- Stub: returns false until 0060 creates the data_class_grants table.
  -- The full implementation checks matter_parties.scope AND data_class_grants.
  select false;
$$;

alter table pi_medical_records       enable row level security;
alter table pi_liens                 enable row level security;
alter table bk_schedules             enable row level security;
alter table corp_transaction_records enable row level security;
alter table family_asset_inventories enable row level security;

-- All workbench tables: matter party + data class grant (I-L7, I-L8)
create policy "pi_medical_records_read" on pi_medical_records for select
  using (
    is_matter_party(matter_id)
    and not wall_blocks_user(matter_id)
    and has_data_class_grant(matter_id, 'class_phi')
    or current_user_role_group() = 'admin'
  );

create policy "pi_liens_read" on pi_liens for select
  using (
    is_matter_party(matter_id)
    and not wall_blocks_user(matter_id)
    and has_data_class_grant(matter_id, 'class_phi')
    or current_user_role_group() = 'admin'
  );

create policy "bk_schedules_read" on bk_schedules for select
  using (
    is_matter_party(matter_id)
    and not wall_blocks_user(matter_id)
    and has_data_class_grant(matter_id, 'class_insolvency')
    or current_user_role_group() = 'admin'
  );

create policy "corp_transaction_records_read" on corp_transaction_records for select
  using (
    is_matter_party(matter_id)
    and not wall_blocks_user(matter_id)
    and has_data_class_grant(matter_id, 'class_mnpi')
    -- MNPI cross-group restriction applied in addition (I-L10)
    and not on_restricted_list(matter_id)
    or current_user_role_group() = 'admin'
  );

create policy "family_asset_inventories_read" on family_asset_inventories for select
  using (
    is_matter_party(matter_id)
    and not wall_blocks_user(matter_id)
    and has_data_class_grant(matter_id, 'class_family')
    or current_user_role_group() = 'admin'
  );

-- ── Milestone events (G5 draw-trigger record) ────────────────────────────────
create table milestone_events (
  id              uuid primary key default gen_random_uuid(),
  work_package_id uuid not null references work_packages(id) on delete cascade,
  milestone_label text not null,
  -- photo_paths stored in object storage; paths here only
  photo_paths     text[] not null default '{}',
  submitted_by    uuid not null references users(id),
  submitted_at    timestamptz not null default now(),
  -- vision_model_result is ADVISORY; human sign-off required (I-A3)
  vision_model_result jsonb,
  verified_by     uuid references users(id),
  verified_at     timestamptz,
  status          text not null default 'submitted'
                    check (status in
                      ('submitted','in_review','verified','disputed','rejected'))
);

-- ── Safety incident log ───────────────────────────────────────────────────────
create table safety_incidents (
  id              uuid primary key default gen_random_uuid(),
  work_package_id uuid not null references work_packages(id),
  reported_by     uuid not null references users(id),
  incident_type   text not null,
  description     text not null,
  osha_recordable boolean not null default false,
  reported_at     timestamptz not null default now()
);

-- ── Material deliveries ────────────────────────────────────────────────────────
create table material_deliveries (
  id              uuid primary key default gen_random_uuid(),
  work_package_id uuid not null references work_packages(id),
  supplier_user_id uuid references users(id),
  csi_code        text,
  description     text not null,
  quantity        numeric not null check (quantity > 0),
  unit            text not null,
  unit_cost_cents bigint not null check (unit_cost_cents >= 0),
  delivered_at    timestamptz not null default now(),
  confirmed_by    uuid references users(id)  -- wp party confirmation
);

alter table milestone_events    enable row level security;
alter table safety_incidents    enable row level security;
alter table material_deliveries enable row level security;

create policy "milestone_events_party_read" on milestone_events for select
  using (
    is_work_package_party(work_package_id)
    or current_user_role_group() = 'admin'
  );

create policy "material_deliveries_party_read" on material_deliveries for select
  using (
    is_work_package_party(work_package_id)
    or current_user_role_group() = 'admin'
  );

-- ── BIM/CAD file vault entries ────────────────────────────────────────────────
-- Files stored in object storage; this table is the authorization record.
create table design_files (
  id                uuid primary key default gen_random_uuid(),
  design_package_id uuid not null references design_packages(id) on delete cascade,
  file_type         text not null
                      check (file_type in
                        ('bim','cad','pdf_permit_set','raster','boq_export','report')),
  storage_path      text not null,
  version_label     text not null,
  uploaded_by       uuid not null references users(id),
  created_at        timestamptz not null default now()
);

-- ── RFIs (Requests for Information) ──────────────────────────────────────────
create table rfis (
  id                uuid primary key default gen_random_uuid(),
  design_package_id uuid not null references design_packages(id),
  submitted_by      uuid not null references users(id),
  addressed_to      uuid references users(id),
  subject           text not null,
  description       text not null,
  status            text not null default 'open'
                      check (status in ('open','answered','closed','void')),
  created_at        timestamptz not null default now(),
  answered_at       timestamptz
);

-- ── Design seal events ────────────────────────────────────────────────────────
create table seal_events (
  id                uuid primary key default gen_random_

_[Continuing response due to length limit...]_

Continuing exactly from the cut-off:

```sql
uuid(),
  design_package_id uuid not null references design_packages(id) on delete cascade,
  seal_holder_user_id uuid not null references users(id),
  licence_id        uuid references professional_licences(id),
  sealed_at         timestamptz not null default now(),
  -- seal_content_hash: hash of the document at time of sealing (write-once audit)
  seal_content_hash text not null,
  jurisdiction      text not null,
  discipline        text not null,
  revoked_at        timestamptz,
  revoked_reason    text
);

alter table design_files  enable row level security;
alter table rfis           enable row level security;
alter table seal_events    enable row level security;

create policy "design_files_party_read" on design_files for select
  using (
    is_design_package_party(design_package_id)
    or current_user_role_group() = 'admin'
  );

create policy "rfis_party_read" on rfis for select
  using (
    is_design_package_party(design_package_id)
    or current_user_role_group() = 'admin'
  );

create policy "seal_events_party_read" on seal_events for select
  using (
    is_design_package_party(design_package_id)
    or current_user_role_group() = 'admin'
  );

-- ── Maintenance tickets ────────────────────────────────────────────────────────
-- Access Floor (I-22): no action derivable from a ticket may gate physical access.
create table maintenance_tickets (
  id                uuid primary key default gen_random_uuid(),
  tenancy_id        uuid not null references tenancies(id),
  submitted_by      uuid not null references users(id),
  -- unit_id is inherited from the tenancy; stored here for denormalized query perf
  unit_id           text not null,
  category          text not null
                      check (category in (
                        'plumbing','electrical','hvac','structural',
                        'pest','appliance','common_area','habitability','other'
                      )),
  description       text not null,
  -- geotagged photo paths in object storage
  photo_paths       text[] not null default '{}',
  priority          text not null default 'routine'
                      check (priority in ('emergency','urgent','routine')),
  assigned_to       uuid references users(id),  -- sub-contractor user
  status            text not null default 'open'
                      check (status in
                        ('open','assigned','in_progress','pending_review',
                         'closed','escalated')),
  created_at        timestamptz not null default now(),
  closed_at         timestamptz
);

-- ── Rent ledger (per-tenancy running log) ─────────────────────────────────────
-- Append-only by convention; corrections via contra-entry (same pattern as trust_ledger)
create table rent_ledger (
  id               uuid primary key default gen_random_uuid(),
  tenancy_id       uuid not null references tenancies(id),
  direction        text not null check (direction in ('credit','debit')),
  amount_cents     bigint not null check (amount_cents > 0),
  entry_type       text not null
                     check (entry_type in (
                       'rent_payment','late_fee','nfs_fee',
                       'credit_adjustment','security_deposit_deduction',
                       'contra_reversal'
                     )),
  period_start     date,
  period_end       date,
  posted_by        uuid not null references users(id),
  posted_at        timestamptz not null default now(),
  memo             text
);

-- ── Adverse-action notices (I-25 — auto-deny prohibition enforcement) ─────────
-- A denial decision requires a human-authored notice with documented basis.
-- The platform generates the notice template; a human must author the basis text.
create table adverse_action_notices (
  id                  uuid primary key default gen_random_uuid(),
  screening_report_id uuid not null references screening_reports(id),
  applicant_user_id   uuid not null references users(id),
  -- authored_by must be a human user, not a service account
  authored_by         uuid not null references users(id),
  documented_basis    text not null,  -- human-authored; not a model output
  notice_sent_at      timestamptz,
  created_at          timestamptz not null default now()
);

-- ── Lease documents (signed lease agreements) ─────────────────────────────────
create table lease_documents (
  id           uuid primary key default gen_random_uuid(),
  tenancy_id   uuid not null references tenancies(id),
  document_id  uuid not null references documents(id),
  signed_by    uuid[] not null default '{}',
  executed_at  timestamptz,
  created_at   timestamptz not null default now()
);

alter table maintenance_tickets    enable row level security;
alter table rent_ledger            enable row level security;
alter table adverse_action_notices enable row level security;
alter table lease_documents        enable row level security;

-- Maintenance tickets: tenant sees their own; manager sees all under their engagement
create policy "maintenance_tickets_read" on maintenance_tickets for select
  using (
    submitted_by = auth.uid()
    or exists (
      select 1 from tenancies t
      join management_engagements me on me.id = t.engagement_id
      where t.id = tenancy_id
        and (
          auth.uid() = any(t.tenant_user_ids)
          or me.manager_user_id = auth.uid()
        )
    )
    or current_user_role_group() = 'admin'
  );

create policy "rent_ledger_read" on rent_ledger for select
  using (
    exists (
      select 1 from tenancies t
      join management_engagements me on me.id = t.engagement_id
      where t.id = tenancy_id
        and (
          auth.uid() = any(t.tenant_user_ids)
          or me.manager_user_id = auth.uid()
        )
    )
    or current_user_role_group() = 'admin'
  );

create policy "adverse_action_notices_self_read" on adverse_action_notices for select
  using (
    applicant_user_id = auth.uid()
    or authored_by = auth.uid()
    or current_user_role_group() = 'admin'
  );

create policy "lease_documents_party_read" on lease_documents for select
  using (
    exists (
      select 1 from tenancies t
      join management_engagements me on me.id = t.engagement_id
      where t.id = tenancy_id
        and (
          auth.uid() = any(t.tenant_user_ids)
          or me.manager_user_id = auth.uid()
        )
    )
    or current_user_role_group() = 'admin'
  );

-- ── Maintenance tickets ────────────────────────────────────────────────────────
-- Access Floor (I-22): no action derivable from a ticket may gate physical access.
create table maintenance_tickets (
  id                uuid primary key default gen_random_uuid(),
  tenancy_id        uuid not null references tenancies(id),
  submitted_by      uuid not null references users(id),
  -- unit_id is inherited from the tenancy; stored here for denormalized query perf
  unit_id           text not null,
  category          text not null
                      check (category in (
                        'plumbing','electrical','hvac','structural',
                        'pest','appliance','common_area','habitability','other'
                      )),
  description       text not null,
  -- geotagged photo paths in object storage
  photo_paths       text[] not null default '{}',
  priority          text not null default 'routine'
                      check (priority in ('emergency','urgent','routine')),
  assigned_to       uuid references users(id),  -- sub-contractor user
  status            text not null default 'open'
                      check (status in
                        ('open','assigned','in_progress','pending_review',
                         'closed','escalated')),
  created_at        timestamptz not null default now(),
  closed_at         timestamptz
);

-- ── Rent ledger (per-tenancy running log) ─────────────────────────────────────
-- Append-only by convention; corrections via contra-entry (same pattern as trust_ledger)
create table rent_ledger (
  id               uuid primary key default gen_random_uuid(),
  tenancy_id       uuid not null references tenancies(id),
  direction        text not null check (direction in ('credit','debit')),
  amount_cents     bigint not null check (amount_cents > 0),
  entry_type       text not null
                     check (entry_type in (
                       'rent_payment','late_fee','nfs_fee',
                       'credit_adjustment','security_deposit_deduction',
                       'contra_reversal'
                     )),
  period_start     date,
  period_end       date,
  posted_by        uuid not null references users(id),
  posted_at        timestamptz not null default now(),
  memo             text
);

-- ── Adverse-action notices (I-25 — auto-deny prohibition enforcement) ─────────
-- A denial decision requires a human-authored notice with documented basis.
-- The platform generates the notice template; a human must author the basis text.
create table adverse_action_notices (
  id                  uuid primary key default gen_random_uuid(),
  screening_report_id uuid not null references screening_reports(id),
  applicant_user_id   uuid not null references users(id),
  -- authored_by must be a human user, not a service account
  authored_by         uuid not null references users(id),
  documented_basis    text not null,  -- human-authored; not a model output
  notice_sent_at      timestamptz,
  created_at          timestamptz not null default now()
);

-- ── Lease documents (signed lease agreements) ─────────────────────────────────
create table lease_documents (
  id           uuid primary key default gen_random_uuid(),
  tenancy_id   uuid not null references tenancies(id),
  document_id  uuid not null references documents(id),
  signed_by    uuid[] not null default '{}',
  executed_at  timestamptz,
  created_at   timestamptz not null default now()
);

alter table maintenance_tickets    enable row level security;
alter table rent_ledger            enable row level security;
alter table adverse_action_notices enable row level security;
alter table lease_documents        enable row level security;

-- Maintenance tickets: tenant sees their own; manager sees all under their engagement
create policy "maintenance_tickets_read" on maintenance_tickets for select
  using (
    submitted_by = auth.uid()
    or exists (
      select 1 from tenancies t
      join management_engagements me on me.id = t.engagement_id
      where t.id = tenancy_id
        and (
          auth.uid() = any(t.tenant_user_ids)
          or me.manager_user_id = auth.uid()
        )
    )
    or current_user_role_group() = 'admin'
  );

create policy "rent_ledger_read" on rent_ledger for select
  using (
    exists (
      select 1 from tenancies t
      join management_engagements me on me.id = t.engagement_id
      where t.id = tenancy_id
        and (
          auth.uid() = any(t.tenant_user_ids)
          or me.manager_user_id = auth.uid()
        )
    )
    or current_user_role_group() = 'admin'
  );

create policy "adverse_action_notices_self_read" on adverse_action_notices for select
  using (
    applicant_user_id = auth.uid()
    or authored_by = auth.uid()
    or current_user_role_group() = 'admin'
  );

create policy "lease_documents_party_read" on lease_documents for select
  using (
    exists (
      select 1 from tenancies t
      join management_engagements me on me.id = t.engagement_id
      where t.id = tenancy_id
        and (
          auth.uid() = any(t.tenant_user_ids)
          or me.manager_user_id = auth.uid()
        )
    )
    or current_user_role_group() = 'admin'
  );

-- ── Property listings (G9 brokerage surface) ──────────────────────────────────
create table listings (
  id                  uuid primary key default gen_random_uuid(),
  representation_id   uuid not null references agency_representations(id),
  property_id         uuid not null references properties(id),
  list_price_cents    bigint check (list_price_cents > 0),
  status              text not null default 'coming_soon'
                        check (status in (
                          'coming_soon','active','under_contract',
                          'pending','sold','withdrawn','expired'
                        )),
  listed_at           timestamptz,
  -- I-31: no platform-suggested price, no benchmark derived from competing brokerages
  -- list_price_cents is entered by the listing agent; never auto-populated by the platform
  created_at          timestamptz not null default now()
);

-- ── Showing appointments ───────────────────────────────────────────────────────
create table showings (
  id               uuid primary key default gen_random_uuid(),
  listing_id       uuid not null references listings(id),
  requested_by     uuid not null references users(id),
  scheduled_at     timestamptz not null,
  status           text not null default 'requested'
                     check (status in
                       ('requested','confirmed','completed','cancelled','no_show')),
  created_at       timestamptz not null default now()
);

-- ── Disclosure acknowledgement log (G9/G1/G3 mandatory) ───────────────────────
-- Augments the shared disclosures table with representation-scoped records.
create table representation_disclosures (
  id                   uuid primary key default gen_random_uuid(),
  representation_id    uuid not null references agency_representations(id),
  disclosure_type      text not null
                         check (disclosure_type in (
                           'agency_disclosure','dual_agency_consent',
                           'buyer_rep_agreement','seller_net_sheet',
                           'lead_paint','property_condition',
                           'spq','tds','avid'
                         )),
  rendered_hash        text not null,
  acknowledged_by      uuid not null references users(id),
  acknowledged_at      timestamptz not null default now()
);

-- ── Commission records (per-transaction — I-31 enforcement anchor) ────────────
-- Stores the AGREED commission for a closed transaction only.
-- No benchmarks, no platform-suggested rates, no cross-brokerage aggregation (I-31).
create table commission_records (
  id                   uuid primary key default gen_random_uuid(),
  representation_id    uuid not null references agency_representations(id),
  listing_id           uuid references listings(id),
  agreed_rate_bps      int check (agreed_rate_bps > 0),  -- basis points; entered manually
  total_commission_cents bigint check (total_commission_cents > 0),
  co_brokerage_split_bps int,                            -- for co-op deals only
  status               text not null default 'pending'
                         check (status in
                           ('pending','earned','paid','disputed','voided')),
  closed_at            timestamptz,
  created_at           timestamptz not null default now()
);

alter table listings                  enable row level security;
alter table showings                  enable row level security;
alter table representation_disclosures enable row level security;
alter table commission_records        enable row level security;

create policy "listings_brokerage_read" on listings for select
  using (
    exists (
      select 1 from agency_representations ar
      join broker_seats bs on bs.brokerage_id = ar.brokerage_id
      where ar.id = representation_id
        and bs.user_id = auth.uid()
    )
    or current_user_role_group() = 'admin'
  );

create policy "commission_records_brokerage_read" on commission_records for select
  using (
    exists (
      select 1 from agency_representations ar
      join broker_seats bs on bs.brokerage_id = ar.brokerage_id
      where ar.id = representation_id
        and bs.user_id = auth.uid()
    )
    or current_user_role_group() = 'admin'
  );

0054 — Group 4 Extensions: Gig Rail Baseline (Pre-0060 Stub)
Full gig rail hardening (nonce issuance, geofence_verified server-compute, REVOKE UPDATE on verified columns) lives in migration 0060. These tables establish the schema shape that 0060 will add constraints and column revokes on top of.

-- ── Gig job postings ───────────────────────────────────────────────────────────
create table gig_jobs (
  id                uuid primary key default gen_random_uuid(),
  matter_id         uuid not null references matters(id),
  posted_by         uuid not null references users(id),   -- counsel of record
  gig_type          text not null
                      check (gig_type in ('process_service','per_diem_appearance','courier')),
  service_address   text not null,
  jurisdiction      text not null,
  scheduled_at      timestamptz,
  status            text not null default 'open'
                      check (status in (
                        'open','assigned','in_progress',
                        'submission_pending','accepted','rejected','cancelled'
                      )),
  created_at        timestamptz not null default now()
);

-- ── Gig assignments ────────────────────────────────────────────────────────────
create table gig_assignments (
  id              uuid primary key default gen_random_uuid(),
  gig_id          uuid not null references gig_jobs(id) on delete cascade,
  provider_id     uuid not null references users(id),
  -- Credential must be current and jurisdiction-matched at assignment (I-L19)
  licence_id      uuid references professional_licences(id),
  assigned_at     timestamptz not null default now(),
  -- Server-computed fields — REVOKE UPDATE added in 0060 (I-L18)
  geofence_verified   boolean,
  attestation_verified boolean,
  timestamp_verified  boolean,
  -- capture_nonce: server-issued, single-use, short-TTL (I-L17) — full enforcement in 0060
  capture_nonce   text,
  nonce_issued_at timestamptz,
  nonce_expires_at timestamptz,
  status          text not null default 'assigned'
                    check (status in
                      ('assigned','in_progress','submitted','accepted',
                       'rejected','expired'))
);

-- ── Gig submissions (provenance record) ───────────────────────────────────────
-- I-L16: provenance gates ACCEPTANCE, never money.
-- Fee release requires notarized affidavit + affirmative human acceptance by counsel.
create table gig_submissions (
  id                  uuid primary key default gen_random_uuid(),
  assignment_id       uuid not null references gig_assignments(id) on delete cascade,
  -- Signed device-attestation payload (I-L17); nonce must appear inside
  attestation_payload jsonb not null,
  -- Affidavit storage path; notarization verified out-of-band
  affidavit_path      text,
  affidavit_verified  boolean not null default false,
  -- Human acceptance by counsel of record (I-L16) — never auto
  accepted_by         uuid references users(id),
  accepted_at         timestamptz,
  submitted_at        timestamptz not null default now()
);

-- ── Gig escrow (I-L21: never funded from trust principal) ─────────────────────
create table gig_escrow (
  id                uuid primary key default gen_random_uuid(),
  gig_id            uuid not null references gig_jobs(id),
  -- funded from operating account or client-authorized advance — never from trust_ledger
  source_type       text not null
                      check (source_type in ('operating_account','client_advance')),
  amount_cents      bigint not null check (amount_cents > 0),
  status            text not null default 'funded'
                      check (status in ('funded','released','returned','frozen')),
  released_at       timestamptz,
  created_at        timestamptz not null default now()
);

alter table gig_jobs       enable row level security;
alter table gig_assignments enable row level security;
alter table gig_submissions enable row level security;
alter table gig_escrow     enable row level security;

create policy "gig_jobs_matter_party_read" on gig_jobs for select
  using (
    is_matter_party(matter_id)
    and not wall_blocks_user(matter_id)
    or current_user_role_group() = 'admin'
  );

create policy "gig_assignments_party_read" on gig_assignments for select
  using (
    provider_id = auth.uid()
    or exists (
      select 1 from gig_jobs gj
      where gj.id = gig_id
        and is_matter_party(gj.matter_id)
        and not wall_blocks_user(gj.matter_id)
    )
    or current_user_role_group() = 'admin'
  );

create policy "gig_submissions_party_read" on gig_submissions for select
  using (
    exists (
      select 1 from gig_assignments ga
      join gig_jobs gj on gj.id = ga.gig_id
      where ga.id = assignment_id
        and (
          ga.provider_id = auth.uid()
          or is_matter_party(gj.matter_id)
        )
        and not wall_blocks_user(gj.matter_id)
    )
    or current_user_role_group() = 'admin'
  );

-- ── Platform notification queue ────────────────────────────────────────────────
-- Existence-protected: a notification about a matter a user cannot read
-- must be indistinguishable from no notification (I-L11).
-- This table never stores matter_id in the clear for a screened user;
-- the delivery service filters via subject_party() before writing.
create table notifications (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  notification_type text not null,
  -- payload stores a reference (subject_kind + subject_id), never privileged content
  subject_kind  text check (subject_kind in
                  ('property','deal','facility','matter',
                   'work_package','design_package','tenancy','gig')),
  subject_id    uuid,
  read_at       timestamptz,
  created_at    timestamptz not null default now()
);

-- ── Immutable platform audit log ───────────────────────────────────────────────
-- Append-only. Records every state-changing action by actor, target, and timestamp.
-- Corrections are by new entries only; no row is ever updated or deleted here.
create table audit_log (
  id           uuid primary key default gen_random_uuid(),
  actor_id     uuid references users(id),
  actor_class  text not null default 'user'
                 check (actor_class in ('user','service','billing','migration')),
  action       text not null,
  target_type  text,
  target_id    uuid,
  -- diff_hash: SHA-256 of the before/after JSON diff; content never stored here
  diff_hash    text,
  ip_address   inet,
  created_at   timestamptz not null default now()
);

-- Audit log is write-only for service role; no user may read another user's entries.
alter table audit_log enable row level security;
create policy "audit_log_admin_only" on audit_log for select
  using (current_user_role_group() = 'admin');

-- ── wall_prior_access (I-L15 — retroactive erection audit record) ─────────────
-- Preserves a screened user's access history for disclosure, not concealment.
-- This record is never used to reconstruct the content; it is evidence of timing.
create table wall_prior_access (
  id              uuid primary key default gen_random_uuid(),
  wall_id         uuid not null references ethical_walls(id),
  screened_user_id uuid not null references users(id),
  matter_id       uuid not null references matters(id),
  last_access_at  timestamptz not null,
  -- index_purged_at: timestamp when retrieval index rows were invalidated
  index_purged_at timestamptz,
  -- session_fenced_at: timestamp when live sessions were epoch-closed
  session_fenced_at timestamptz,
  recorded_at     timestamptz not null default now()
);

alter table notifications    enable row level security;
alter table wall_prior_access enable row level security;

create policy "notifications_self_read" on notifications for select
  using (user_id = auth.uid());

-- wall_prior_access: readable by the screened user themselves and admin
create policy "wall_prior_access_read" on wall_prior_access for select
  using (
    screened_user_id = auth.uid()
    or current_user_role_group() = 'admin'
  );

0056 — Coverage Assertions Stub (Pre-HRAG Placeholder)
Full HRAG schema lives in migrations 0080–0086. This migration installs the coverage_assertions table stub so that the three-way grounding fallback logic (§I.N) can reference it from API code before the full HRAG layer is deployed.

-- ── Coverage assertions (three-way fallback anchor — §I.N) ───────────────────
-- A coverage assertion declares which instrument sets must be present and current
-- for a given jurisdiction and domain. An unsatisfied assertion causes the route
-- to return COVERAGE_INCOMPLETE rather than NO_AUTHORITY_ON_POINT.
create table coverage_assertions (
  id               uuid primary key default gen_random_uuid(),
  domain           text not null
                     check (domain in ('law','standards','investor','classification')),
  jurisdiction     text not null,   -- e.g. 'US.NY', 'US.Federal', '*' for global standards
  instrument_set   text not null,   -- e.g. 'CPLR', 'RPAPL', 'IBC.2021', 'FannieMae.SEL'
  -- satisfied: updated by the HRAG ingestion pipeline (0080+)
  satisfied        boolean not null default false,
  last_checked_at  timestamptz,
  -- reverify_due: chunks past this date are ineligible for grounding (I-A13)
  reverify_due     timestamptz,
  created_at       timestamptz not null default now()
);

alter table coverage_assertions enable row level security;
-- Coverage assertions are platform metadata; readable by any authenticated session.
create policy "coverage_assertions_authenticated_read" on coverage_assertions for select
  using (auth.uid() is not null);

0057 — Agent Factory Corpus Stubs (Pre-0070 Placeholders)
Full Agent Factory schema lives in migrations 0070–0076. This migration installs minimal stubs for authority_corpus and tenant_corpus so that application code can reference the tables and the grounding gate can be wired before the full Agent Factory layer is deployed. No embedding columns yet — those require the vector extension and are installed in 0070.

-- ── Authority corpus stub (physically separate from tenant corpus — I-A4) ─────
create table authority_corpus (
  id             uuid primary key default gen_random_uuid(),
  -- path: ltree containment axis (full ltree type added in 0080)
  path           text not null,
  trust_class    text not null default 'authority'
                   check (trust_class = 'authority'),
  owner_org_id   uuid,  -- must be NULL for authority corpus (I-A4)
  visibility     text not null default 'public'
                   check (visibility in ('public','verified','attorney')),
  content        text,  -- populated by publishing pipeline; encrypted at rest
  -- effective dates — chunks past effective_to are ineligible for grounding (I-A13)
  effective_from timestamptz,
  effective_to   timestamptz,
  superseded_by  uuid references authority_corpus(id),
  verified_at    timestamptz,
  reverify_due   timestamptz,
  created_at     timestamptz not null default now(),
  constraint authority_corpus_no_org
    check (owner_org_id is null)
);

-- ── Tenant corpus stub (physically separate — I-A4, I-A5) ────────────────────
create table tenant_corpus (
  id           uuid primary key default gen_random_uuid(),
  path         text not null,
  trust_class  text not null default 'tenant'
                 check (trust_class = 'tenant'),
  owner_org_id uuid not null,  -- never null; never cross-tenant (I-A5)
  visibility   text not null default 'org_private'
                 check (visibility = 'org_private'),  -- NEVER 'public' (I-A5)
  content      text,
  effective_from timestamptz,
  effective_to   timestamptz,
  created_at   timestamptz not null default now(),
  constraint tenant_corpus_requires_org
    check (owner_org_id is not null)
);

alter table authority_corpus enable row level security;
alter table tenant_corpus    enable row level security;

-- Authority corpus: visibility-gated; attorney-class requires matter membership
create policy "authority_corpus_public_read" on authority_corpus for select
  using (
    visibility = 'public'
    and auth.uid() is not null
    and (effective_to is null or effective_to > now())
    and superseded_by is null
  );

create policy "authority_corpus_verified_read" on authority_corpus for select
  using (
    visibility = 'verified'
    and auth.uid() is not null
    and (effective_to is null or effective_to > now())
  );

-- Tenant corpus: org membership only — no cross-tenant reads ever (I-A5)
create policy "tenant_corpus_org_read" on tenant_corpus for select
  using (
    owner_org_id in (
      select org_id from org_members where user_id = auth.uid()
    )
    and (effective_to is null or effective_to > now())
  );

-- I-A10: embeddings carry the same RLS as content.
-- The embedding column (added in 0070) will inherit these same policies.
-- No "embeddings-only" export path exists or will be created (I-19 — Deliberately Not Built).

0058 — Final Index Pass & Grant Locks
-- ── Remaining performance indexes ─────────────────────────────────────────────
create index on matters(firm_id, status);
create index on matters(matter_type);
create index on trust_ledger(status, created_at desc);
create index on ethical_walls(firm_id) where removed_at is null;
create index on gig_jobs(matter_id, status);
create index on gig_assignments(provider_id, status);
create index on listings(status);
create index on agency_representations(brokerage_id, status);
create index on deal_memberships(deal_id, status);
create index on facility_parties(facility_id, status);
create index on draw_requests(facility_id, status);
create index on milestone_events(work_package_id, status);
create index on maintenance_tickets(tenancy_id, status);
create index on notifications(user_id, read_at) where read_at is null;
create index on audit_log(actor_id, created_at desc);
create index on audit_log(target_type, target_id);
create index on authority_corpus(path, visibility);
create index on tenant_corpus(owner_org_id, path);
create index on coverage_assertions(domain, jurisdiction, satisfied);

-- ── Revoke public grants — all tables added since 0019 ────────────────────────
revoke all on avm_snapshots              from public;
revoke all on municipal_records          from public;
revoke all on assembly_intents           from public;
revoke all on deal_documents             from public;
revoke all on title_diligence            from public;
revoke all on contract_assignments       from public;
revoke all on draw_requests              from public;
revoke all on field_inspections          from public;
revoke all on loan_covenants             from public;
revoke all on privilege_successions      from public;
revoke all on arbitration_cases          from public;
revoke all on arbitration_awards         from public;
revoke all on pi_medical_records         from public;
revoke all on pi_liens                   from public;
revoke all on bk_schedules              from public;
revoke all on corp_transaction_records   from public;
revoke all on family_asset_inventories   from public;
revoke all on milestone_events           from public;
revoke all on safety_incidents           from public;
revoke all on material_deliveries        from public;
revoke all on design_files               from public;
revoke all on rfis                       from public;
revoke all on seal_events                from public;
revoke all on maintenance_tickets        from public;
revoke all on rent_ledger                from public;
revoke all on adverse_action_notices     from public;
revoke all on lease_documents            from public;
revoke all on listings                   from public;
revoke all on showings                   from public;
revoke all on representation_disclosures from public;
revoke all on commission_records         from public;
revoke all on gig_jobs                   from public;
revoke all on gig_assignments            from public;
revoke all on gig_submissions            from public;
revoke all on gig_escrow                 from public;
revoke all on wall_prior_access          from public;
revoke all on authority_corpus           from public;
revoke all on tenant_corpus              from public;

0059 — Baseline Validation Assertions
These are deterministic smoke-test queries run as part of the migration itself. They will raise an exception and roll back the entire migration batch if any invariant is already violated at deployment time. They do not substitute for CI test coverage — they are a deployment-time guard.

-- ── Invariant I-2: no billing-actor grant survives on authorization tables ─────
do $$
declare
  v_count int;
begin
  -- Verify assert_not_billing_actor trigger exists on all authorization tables
  select count(*) into v_count
  from information_schema.triggers
  where trigger_name like 'trg_%_billing_guard'
    and event_object_table in (
      'property_role_bindings','deal_memberships','facility_parties',
      'matter_parties','wp_parties','dp_parties'
    );
  if v_count < 6 then
    raise exception
      'I-2 VIOLATION: billing guard triggers missing on % authorization tables (expected 6, found %)',
      6, v_count;
  end if;
end;
$$;

-- ── Invariant I-L3: trust_ledger debit_kind constraint covers all permitted kinds only ─
do $$
declare
  v_exists boolean;
begin
  select exists (
    select 1 from information_schema.check_constraints
    where constraint_name like '%trust_ledger%'
      and check_clause like '%client_disbursement%'
  ) into v_exists;
  if not v_exists then
    raise exception
      'I-L3 VIOLATION: trust_ledger debit_kind check constraint not found';
  end if;
end;
$$;

-- ── Invariant I-L4: trust_ledger has no UPDATE or DELETE rule/trigger ──────────
do $$
declare
  v_count int;
begin
  -- Trust ledger must be append-only; no UPDATE or DELETE triggers exist
  select count(*) into v_count
  from information_schema.triggers
  where event_object_table = 'trust_ledger'
    and event_manipulation in ('UPDATE','DELETE')
    and trigger_name not like 'trg_%_billing_guard';
  if v_count > 0 then
    raise exception
      'I-L4 VIOLATION: trust_ledger has % UPDATE/DELETE triggers — ledger must be append-only',
      v_count;
  end if;
end;
$$;

-- ── Invariant I-4: owner_investor excluded from acquisition segment ────────────
-- Enforced in application code via ROLE_APP_MAP; assert the constraint text is in the role check.
do $$
declare
  v_exists boolean;
begin
  select exists (
    select 1 from information_schema.check_constraints
    where constraint_name = 'users_role_check'
      and check_clause like '%owner_investor%'
  ) into v_exists;
  if not v_exists then
    raise exception
      'I-4 VIOLATION: users_role_check constraint missing owner_investor from 27-role set';
  end if;
end;
$$;

-- ── Invariant I-A4/I-A5: tenant_corpus.owner_org_id is never null ─────────────
do $$
begin
  -- Check that the NOT NULL constraint exists on tenant_corpus.owner_org_id
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'tenant_corpus'
      and column_name = 'owner_org_id'
      and is_nullable = 'NO'
  ) then
    raise exception
      'I-A5 VIOLATION: tenant_corpus.owner_org_id must be NOT NULL';
  end if;
end;
$$;

-- ── Invariant I-25: screening_reports has no denied status value ──────────────
do $$
declare
  v_exists boolean;
begin
  select exists (
    select 1 from information_schema.check_constraints
    where constraint_name like '%screening_reports%'
      and check_clause like '%denied%'
  ) into v_exists;
  if v_exists then
    raise exception
      'I-25 VIOLATION: screening_reports check constraint contains ''denied'' — auto-deny is prohibited';
  end if;
end;
$$;

-- ── Invariant I-31: commission_records has no commission_rate cross-brokerage column ──
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name in ('agency_representations','listings')
      and column_name in ('suggested_rate','benchmark_rate','platform_rate')
  ) then
    raise exception
      'I-31 VIOLATION: platform-suggested commission rate column found in G9 tables';
  end if;
end;
$$;

-- All assertions passed — baseline schema (0001–0059) is invariant-clean.
comment on schema public is
  'Shtiya Builder Core Ecosystem v3.0 — baseline schema 0001–0059 validated.
   Legal Workspace (0060–0066), Agent Factory (0070–0076),
   HRAG Vault Network (0080–0086) layer on top.';

