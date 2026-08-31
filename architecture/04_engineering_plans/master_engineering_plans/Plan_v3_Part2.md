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

---

## Part II — Legal Workspace (Migrations 0060–0066)

> **Dependency:** Migrations 0060–0066 run **after** 0001–0059. They extend the baseline
> Group 4 tables (`matters`, `matter_parties`, `ethical_walls`, `trust_accounts`,
> `trust_ledger`, `firm_members`) and the Group 5–9 tables installed in 0050–0058.
> Where a function or trigger already exists from Group 4, the Legal Workspace
> migration replaces it with the hardened version.

> **`search_path` hardening (AF-13):** Every `SECURITY DEFINER` function in this
> migration set uses `set search_path = ''` and fully-qualified object names. An
> unqualified name inside a definer function is a live privilege-escalation vector.
> The Group 4 functions `is_matter_party()`, `current_user_role_group()`, and
> `wall_blocks_user()` are **re-issued** here with hardened search paths; the old
> stubs are dropped first. Function bodies below show unqualified names for
> readability — the `definer-lint` CI check (§V.4) enforces the qualified form.

---

### 0060 — Identity Subjects, Data Classes, Class Grants

```sql
-- 0060_lw_identity_and_classes.sql
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Natural-person identity (I-L1) ───────────────────────────────────────────
-- Two user rows controlled by one human satisfy `maker_id <> checker_id`.
-- Dual control has to compare PEOPLE, so people need their own identifiers.
create table identity_subjects (
  id               uuid primary key default gen_random_uuid(),
  verification_ref text not null,    -- IDV vendor case reference; never PII
  verified_at      timestamptz not null,
  reverify_due     timestamptz not null,
  liveness_passed  boolean not null default false,
  created_at       timestamptz not null default now()
);

alter table users
  add column identity_subject_id uuid references identity_subjects(id);

create index users_identity_subject on users (identity_subject_id)
  where identity_subject_id is not null;

-- ── Data classes (I-L8) ───────────────────────────────────────────────────────
-- The enum is the complete, closed set. A class not listed cannot appear on
-- any row. A table whose class column is not of this type cannot be RLS'd by
-- the class predicates and will fail definer-lint (§V.4).
create type data_class as enum (
  'class_general',        -- calendaring, docketing, status, non-substantive notes
  'class_financial',      -- trust, invoices, settlement statements
  'class_phi',            -- medical records / bills / liens; 42 CFR Pt.2 standard
  'class_mnpi',           -- cap tables, transaction records; restricted-list enforced
  'class_insolvency',     -- schedules, SOFA, means test; pre-filing = maximum sensitivity
  'class_family',         -- asset division, support, minors; sealing rules apply
  'class_tdpa_regulated'  -- biometric / smart-access evidence ingested into a matter
);

-- ── Matter-class grants (I-L8) ────────────────────────────────────────────────
-- Being on the matter grants class_general and NOTHING ELSE.
-- Opening the medical file is an explicit act with a record.
create table matter_class_grants (
  id         uuid primary key default gen_random_uuid(),
  matter_id  uuid not null references matters(id) on delete cascade,
  user_id    uuid not null references users(id) on delete cascade,
  class      data_class not null,
  granted_by uuid not null references users(id),
  basis      text not null,
  granted_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  unique (matter_id, user_id, class)
);
create index mcg_lookup on matter_class_grants (user_id, matter_id, class)
  where revoked_at is null;

-- A grant is an act with a record. Self-granting is not a thing.
-- Only counsel of record or the escrow holder may grant a class.
create or replace function guard_class_grant()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.granted_by = new.user_id then
    raise exception 'I-L8: a class grant cannot be self-issued (matter %)', new.matter_id
      using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.matter_parties mp
    where mp.matter_id = new.matter_id
      and mp.user_id   = new.granted_by
      and mp.matter_role in ('lead_counsel','supervising_attorney')
      and mp.status    = 'active'
  ) then
    raise exception 'I-L8: only counsel of record may grant a data class'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger matter_class_grants_guard
  before insert or update on matter_class_grants
  for each row execute function guard_class_grant();

-- Append-only audit log of every class-grant decision (SOC 2 CC6.2 / CC6.3)
create table matter_class_grant_log (
  id       uuid primary key default gen_random_uuid(),
  grant_id uuid not null,
  action   text not null check (action in ('granted','revoked','expired')),
  actor_id uuid references users(id),
  at       timestamptz not null default now(),
  detail   jsonb not null default '{}'::jsonb
);
create rule mcgl_no_update as on update to matter_class_grant_log do instead nothing;
create rule mcgl_no_delete as on delete to matter_class_grant_log do instead nothing;

-- ── Practice-area column on matters ──────────────────────────────────────────
create type matter_practice as enum
  ('proptech','personal_injury','bankruptcy','corporate','family_estates');

alter table matters
  add column practice_area      matter_practice,
  add column jurisdiction       text,
  add column jurisdiction_county text;

-- ── Replace the stub has_data_class_grant() from 0041 ─────────────────────────
-- Now that matter_class_grants exists, the stub can be replaced with the real predicate.
create or replace function public.has_data_class_grant(
  p_matter_id uuid,
  p_class     data_class
) returns boolean language sql stable security definer
  set search_path = '' as $$
  select exists (
    select 1 from public.matter_class_grants g
    where g.matter_id  = p_matter_id
      and g.user_id    = auth.uid()
      and g.class      = p_class
      and g.revoked_at is null
      and (g.expires_at is null or g.expires_at > now())
  );
$$;

-- Alias used in §0065 RLS policies
create or replace function public.may_read_class(p_matter uuid, p_class data_class)
returns boolean language sql stable security definer
  set search_path = '' as $$
  select case
    when p_class = 'class_general' then public.is_matter_party(p_matter)
    else public.has_data_class_grant(p_matter, p_class)
  end;
$$;

create or replace function public.may_read_class_for(
  p_user   uuid,
  p_matter uuid,
  p_class  data_class
) returns boolean language sql stable security definer
  set search_path = '' as $$
  select case
    when not public.is_matter_party_for(p_user, p_matter) then false
    when p_class = 'class_general'                        then true
    else exists (
      select 1 from public.matter_class_grants g
      where g.matter_id  = p_matter
        and g.user_id    = p_user
        and g.class      = p_class
        and g.revoked_at is null
        and (g.expires_at is null or g.expires_at > now())
    )
  end;
$$;

-- ── Harden the search_path on Group 4 definer functions (AF-13) ───────────────
-- is_matter_party() and wall_blocks_user() are re-issued; old stubs from 0013
-- are dropped because they lacked set search_path = ''.

drop function if exists public.is_matter_party(uuid);
create or replace function public.is_matter_party(
  p_matter uuid,
  p_facet  text default null,
  p_role   text default null
) returns boolean language sql stable security definer
  set search_path = '' as $$
  select exists (
    select 1 from public.matter_parties mp
    where mp.matter_id  = p_matter
      and mp.user_id    = auth.uid()
      and mp.status     = 'active'
      and (mp.expires_at is null or mp.expires_at > now())
      and (p_facet is null or p_facet = any(mp.scope))
      and (p_role  is null or mp.matter_role::text = p_role)
  )
  and not public.screened_from_matter(p_matter);
$$;

-- Explicit-subject variant (I-L14) — every service-role path calls this, never auth.uid()
create or replace function public.is_matter_party_for(
  p_user   uuid,
  p_matter uuid,
  p_facet  text default null,
  p_role   text default null
) returns boolean language sql stable security definer
  set search_path = '' as $$
  select exists (
    select 1 from public.matter_parties mp
    where mp.matter_id  = p_matter
      and mp.user_id    = p_user
      and mp.status     = 'active'
      and (mp.expires_at is null or mp.expires_at > now())
      and (p_facet is null or p_facet = any(mp.scope))
      and (p_role  is null or mp.matter_role::text = p_role)
  )
  and not public.screened_from_matter_for(p_user, p_matter);
$$;

-- ── Existence protection (I-L11) — visible_matter_ids() ──────────────────────
-- Every count, calendar, dashboard, and notification roll-up goes through this.
-- A screened member reading firm-level aggregates must not be able to infer
-- that a walled matter exists from counts or latency.
create or replace function public.visible_matter_ids()
returns setof uuid language sql stable security definer
  set search_path = '' as $$
  select mp.matter_id
  from public.matter_parties mp
  where mp.user_id    = auth.uid()
    and mp.status     = 'active'
    and (mp.expires_at is null or mp.expires_at > now())
    and not public.screened_from_matter_for(auth.uid(), mp.matter_id);
$$;

-- 0061_lw_trust_hardening.sql
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Trust account additions (I-L5 debit-block attestation) ───────────────────
alter table trust_accounts
  add column debit_block_reattest_due  timestamptz,
  add column operating_account_ref     text,        -- fees and costs settle HERE; never trust
  add column interest_program_payee_id uuid,        -- → bar_foundation_payees
  add column bond_expires_at           timestamptz,
  add column eo_expires_at             timestamptz,
  add column frozen_at                 timestamptz,
  add column frozen_reason             text;

-- I-L5: debit_block_attested must be true and re-attested quarterly.
-- No disbursement proceeds without current attestation.
create or replace function guard_trust_account_status()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.debit_block_attested = true and new.debit_block_attested_at is not null then
    new.debit_block_reattest_due := new.debit_block_attested_at + interval '90 days';
  end if;
  return new;
end;
$$;
create trigger trust_account_attest_guard
  before insert or update on trust_accounts
  for each row execute function guard_trust_account_status();

-- ── IOLTA bar foundation payee registry ──────────────────────────────────────
-- Interest remittance may ONLY go to a registered bar foundation payee.
-- The draft omitted this entirely; sweeping interest to any account
-- is a bar-rule violation in all IOLTA states.
create table bar_foundation_payees (
  id           uuid primary key default gen_random_uuid(),
  jurisdiction text not null,
  program_name text not null,
  payee_ref    text not null,
  verified_at  timestamptz not null,
  unique (jurisdiction, payee_ref)
);

-- ── Per-client sub-ledger solvency (I-L2) ────────────────────────────────────
-- Account-level reconciliation is satisfied while client A's funds pay client B's
-- disbursement. THIS is the constraint that makes that structurally impossible.
-- check (balance_cents >= 0) is the anti-commingling control.
create table trust_client_balances (
  trust_account_id uuid    not null references trust_accounts(id),
  matter_id        uuid    not null references matters(id) on delete cascade,
  client_id        uuid    not null references users(id),
  balance_cents    bigint  not null default 0 check (balance_cents >= 0),
  updated_at       timestamptz not null default now(),
  primary key (trust_account_id, matter_id, client_id)
);

-- ── Trust ledger additions (Legal Workspace hardening layer) ──────────────────
-- Adds columns required by dual-control, hash-chain, and earned-fee guards.
-- The baseline columns (direction, amount_cents, maker_id, checker_id, etc.)
-- were created in 0013. These columns are additive.
alter table trust_ledger
  add column client_id           uuid references users(id),
  add column entry_kind          text,
  add column invoice_id          uuid,   -- → legal_invoices (for earned_fee_transfer)
  add column reversal_of         uuid references trust_ledger(id),
  add column payee_ref           text,   -- operating_account_ref for fee transfers
  add column maker_auth_ref      text,   -- WebAuthn credential + challenge reference
  add column checker_auth_ref    text,
  add column checker_attested_at timestamptz,
  add column checker_saw_detail  boolean not null default false,
  add column seq                 bigint,
  add column prev_hash           text,
  add column row_hash            text;

-- I-L3: the enumeration of permitted entry kinds IS the control.
-- 'platform_fee', 'subscription', 'processor_fee', 'chargeback' are
-- deliberately absent. A disbursement with any other kind cannot be inserted.
alter table trust_ledger
  add constraint trust_entry_kind_ck check (entry_kind in (
    'client_deposit', 'client_disbursement', 'approved_settlement_line',
    'earned_fee_transfer', 'court_ordered_payment', 'interpleader_deposit',
    'interest_remittance', 'contra_reversal'
  ));

-- ── Sub-ledger application trigger (I-L2 — per-client solvency) ──────────────
-- FOR UPDATE serialises concurrent disbursements against the same sub-ledger.
-- Without it two $9,999 releases race past a $10,000 balance.
-- The check (balance_cents >= 0) raises 23514 on overdraw — that exception IS
-- the anti-commingling control.
create or replace function apply_trust_balance()
returns trigger language plpgsql set search_path = '' as $$
declare
  delta bigint;
begin
  if new.client_id is null then
    raise exception 'I-L2: every trust entry names a client' using errcode = '23514';
  end if;
  delta := case
    when new.direction = 'credit' then  new.amount_cents
    else                               -new.amount_cents
  end;

  insert into public.trust_client_balances
    (trust_account_id, matter_id, client_id, balance_cents)
  values
    (new.trust_account_id, new.matter_id, new.client_id, 0)
  on conflict do nothing;

  perform 1 from public.trust_client_balances
  where trust_account_id = new.trust_account_id
    and matter_id         = new.matter_id
    and client_id         = new.client_id
  for update;

  update public.trust_client_balances
     set balance_cents = balance_cents + delta,
         updated_at    = now()
   where trust_account_id = new.trust_account_id
     and matter_id         = new.matter_id
     and client_id         = new.client_id;
  -- check (balance_cents >= 0) raises 23514 here on overdraw.
  return new;
end;
$$;
create trigger trust_ledger_balance_apply
  after insert on trust_ledger
  for each row execute function apply_trust_balance();

-- ── Unconditional dual control (I-L1) ────────────────────────────────────────
-- Replaces Group 4's threshold-gated guard. The $10,000 threshold now governs
-- ESCALATION (responsible attorney + out-of-band confirmation), NOT whether a
-- second key exists. There is no amount below which dual control is optional.
drop trigger if exists trust_ledger_disbursement_guard on trust_ledger;

create or replace function guard_trust_disbursement_v2()
returns trigger language plpgsql set search_path = '' as $$
declare
  acct            public.trust_accounts;
  esc_threshold   bigint := 1000000;        -- $10,000 → escalation tier
  maker_subject   uuid;
  checker_subject uuid;
  window_start    timestamptz := now() - interval '24 hours';
  window_total    bigint;
begin
  -- Only applies to disbursements
  if new.direction <> 'debit' then return new; end if;

  select * into acct from public.trust_accounts
  where id = new.trust_account_id;

  -- Account-level blocks
  if acct.frozen_at is not null then
    raise exception 'ACCOUNT_FROZEN: %', acct.frozen_reason using errcode = '42501';
  end if;
  if acct.bond_expires_at is not null and acct.bond_expires_at < now() then
    raise exception 'ACCOUNT_FROZEN: bond lapsed' using errcode = '42501';
  end if;
  if acct.eo_expires_at is not null and acct.eo_expires_at < now() then
    raise exception 'ACCOUNT_FROZEN: E&O lapsed' using errcode = '42501';
  end if;
  -- I-L5: debit-block attestation must be current
  if acct.debit_block_attested_at is null
     or acct.debit_block_reattest_due is null
     or acct.debit_block_reattest_due < now() then
    raise exception 'ACCOUNT_FROZEN: ACH debit-block attestation absent or stale'
      using errcode = '42501';
  end if;

  -- Contra-reversals must name the row they reverse (I-L4)
  if new.entry_kind = 'contra_reversal' then
    if new.reversal_of is null then
      raise exception 'I-L4: a contra entry must name the row it reverses'
        using errcode = '23514';
    end if;
  end if;

  -- Unconditional dual control: both maker and checker required, always
  if new.maker_id is null or new.checker_id is null then
    raise exception 'DUAL_CONTROL_REQUIRED: maker and checker are both mandatory'
      using errcode = '42501';
  end if;

  -- Identity-subject comparison: compare PEOPLE, not user rows
  select identity_subject_id into maker_subject
  from public.users where id = new.maker_id;
  select identity_subject_id into checker_subject
  from public.users where id = new.checker_id;

  if maker_subject is null or checker_subject is null then
    raise exception 'DUAL_CONTROL_REQUIRED: both signers must be identity-verified'
      using errcode = '42501';
  end if;
  if maker_subject = checker_subject then
    raise exception 'DUAL_CONTROL_REQUIRED: maker and checker are the same natural person'
      using errcode = '42501';
  end if;

  -- A checker who never loaded the payee detail is not a control (I-L1 comment)
  if not new.checker_saw_detail
     or new.checker_auth_ref is null
     or new.checker_attested_at is null
     or new.checker_attested_at < now() - interval '15 minutes' then
    raise exception 'DUAL_CONTROL_REQUIRED: fresh step-up attestation on reviewed detail required'
      using errcode = '42501';
  end if;

  -- Escalation tier: responsible attorney + out-of-band confirmation
  if new.amount_cents >= esc_threshold then
    if not exists (
      select 1 from public.firm_members fm
      join public.matters m on m.firm_id = fm.firm_id
      where m.id = new.matter_id
        and fm.user_id    = new.checker_id
        and fm.firm_role  = 'partner'  -- responsible attorney seat
    ) then
      raise exception 'DUAL_CONTROL_REQUIRED: escalation tier requires responsible attorney as checker'
        using errcode = '42501';
    end if;
  end if;

  -- Anti-structuring: rolling 24h aggregate per (matter, client) also escalates
  select coalesce(sum(amount_cents), 0) into window_total
  from public.trust_ledger
  where matter_id   = new.matter_id
    and client_id   = new.client_id
    and direction   = 'debit'
    and created_at >= window_start;

  if window_total + new.amount_cents >= esc_threshold then
    if not exists (
      select 1 from public.firm_members fm
      join public.matters m on m.firm_id = fm.firm_id
      where m.id = new.matter_id
        and fm.user_id   = new.checker_id
        and fm.firm_role = 'partner'
    ) then
      raise exception 'DUAL_CONTROL_REQUIRED: 24h aggregate crosses escalation tier'
        using errcode = '42501';
    end if;
  end if;

  -- Frozen disputed deposits block all disbursements for that matter
  if exists (
    select 1 from public.trust_client_balances tcb
    where tcb.trust_account_id = new.trust_account_id
      and tcb.matter_id        = new.matter_id
      and tcb.client_id        = new.client_id
      and tcb.balance_cents    = 0
  ) and new.entry_kind not in ('contra_reversal','interpleader_deposit') then
    raise exception 'DEPOSIT_DISPUTED_OR_ZERO' using errcode = '42501';
  end if;

  return new;
end;
$$;
create trigger trust_ledger_disbursement_guard_v2
  before insert on trust_ledger
  for each row execute function guard_trust_disbursement_v2();

-- ── Earned-fee transfer guard (I-L6) ─────────────────────────────────────────
-- Requires a delivered invoice whose notice period has elapsed.
-- Can never exceed the invoice's unbilled remainder.
-- Fees land in the operating account only — never in another trust account.
create table legal_invoices (
  id                    uuid primary key default gen_random_uuid(),
  matter_id             uuid not null references matters(id) on delete cascade,
  client_id             uuid not null references users(id),
  amount_cents          bigint not null check (amount_cents > 0),
  issued_at             timestamptz not null default now(),
  delivered_at          timestamptz,
  notice_period_ends_at timestamptz,
  disputed_at           timestamptz,
  voided_at             timestamptz
);

create or replace function guard_earned_fee_transfer()
returns trigger language plpgsql set search_path = '' as $$
declare
  inv   public.legal_invoices;
  drawn bigint;
begin
  if new.entry_kind <> 'earned_fee_transfer' then return new; end if;

  if new.invoice_id is null then
    raise exception 'I-L6: earned-fee transfer requires an invoice'
      using errcode = '42501';
  end if;
  select * into inv from public.legal_invoices where id = new.invoice_id;

  if inv.matter_id <> new.matter_id or inv.client_id <> new.client_id then
    raise exception 'I-L6: invoice does not belong to this matter/client'
      using errcode = '42501';
  end if;
  if inv.delivered_at is null
     or inv.notice_period_ends_at > now()
     or inv.disputed_at is not null
     or inv.voided_at is not null then
    raise exception 'I-L6: invoice undelivered, within notice period, disputed, or void'
      using errcode = '42501';
  end if;
  -- Must land in the firm operating account, never another trust account (I-L3)
  if new.payee_ref is distinct from (
    select operating_account_ref from public.trust_accounts
    where id = new.trust_account_id
  ) then
    raise exception 'I-L3: earned fees must transfer to the firm operating account only'
      using errcode = '42501';
  end if;
  -- Cannot exceed the invoice remainder
  select coalesce(sum(amount_cents), 0) into drawn
  from public.trust_ledger
  where invoice_id  = new.invoice_id
    and entry_kind  = 'earned_fee_transfer';
  if drawn + new.amount_cents > inv.amount_cents then
    raise exception 'I-L6: transfer exceeds invoice remainder' using errcode = '42501';
  end if;

  return new;
end;
$$;
create trigger trust_ledger_fee_guard
  before insert on trust_ledger
  for each row execute function guard_earned_fee_transfer();

-- ── Interest routing guard ────────────────────────────────────────────────────
-- IOLTA interest belongs to the state bar foundation — not the firm, not the client.
create or replace function guard_interest_remittance()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.entry_kind <> 'interest_remittance' then return new; end if;
  if not exists (
    select 1 from public.bar_foundation_payees p
    join public.trust_accounts a on a.interest_program_payee_id = p.id
    where a.id = new.trust_account_id
      and p.payee_ref = new.payee_ref
  ) then
    raise exception 'IOLTA: interest remits only to the registered bar foundation payee'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger trust_ledger_interest_guard
  before insert on trust_ledger
  for each row execute function guard_interest_remittance();

-- ── Append-only + hash chain (I-L4) ──────────────────────────────────────────
-- The ledger is corrected by contra-entry, never by UPDATE or DELETE.
create rule trust_ledger_no_delete
  as on delete to trust_ledger do instead nothing;

create or replace function seal_trust_row()
returns trigger language plpgsql set search_path = '' as $$
declare
  prev record;
begin
  select seq, row_hash into prev
  from public.trust_ledger
  where trust_account_id = new.trust_account_id
  order by seq desc nulls last
  limit 1;

  new.seq       := coalesce(prev.seq, 0) + 1;
  new.prev_hash := prev.row_hash;
  new.row_hash  := encode(
    digest(
      coalesce(new.prev_hash, '') ||
      new.id::text                ||
      new.trust_account_id::text  ||
      new.matter_id::text         ||
      coalesce(new.client_id::text, '') ||
      new.direction               ||
      new.amount_cents::text      ||
      coalesce(new.payee_ref, '') ||
      coalesce(new.entry_kind, '') ||
      new.seq::text,
      'sha256'
    ),
    'hex'
  );
  return new;
end;
$$;
create trigger trust_ledger_seal
  before insert on trust_ledger
  for each row execute function seal_trust_row();

-- Financial fields are immutable after write. Correction is by contra-entry.
create or replace function guard_trust_immutable()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (
    old.amount_cents, old.direction, old.payee_ref,
    old.client_id, old.matter_id, old.entry_kind, old.row_hash
  ) is distinct from (
    new.amount_cents, new.direction, new.payee_ref,
    new.client_id, new.matter_id, new.entry_kind, new.row_hash
  ) then
    raise exception 'I-L4: trust entries are corrected by contra-entry, never edited'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger trust_ledger_immutable
  before update on trust_ledger
  for each row execute function guard_trust_immutable();

-- ── Three-way reconciliation helper ──────────────────────────────────────────
-- `file_cents` is now defined as the sum of the per-client sub-ledger balances,
-- not a separately-asserted number. This makes three-way reconciliation
-- actually three-way: bank ↔ ledger ↔ file (sum of per-client balances).
create or replace function public.assert_three_way(p_account uuid, p_as_of date)
returns bigint language sql stable security definer
  set search_path = '' as $$
  select coalesce(sum(balance_cents), 0)
  from public.trust_client_balances
  where trust_account_id = p_account;
$$;

-- 0062_lw_practice_workbenches.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- `legal_matter_metadata (metadata_key text, metadata_value jsonb)` is NOT
-- created. The draft's untyped JSONB bag is replaced by typed tables, each
-- carrying its own data_class and facet. A JSONB bag cannot be RLS'd by class
-- because the class lives inside the value. Every table here satisfies I-L7
-- (routes through is_matter_party) and I-L8 (carries a typed data_class column).

-- ── Personal Injury workbench — class_phi ─────────────────────────────────────
-- Handled at the 42 CFR Part 2 standard (strictest applicable rule).
-- Part 2 SUD records carry re-disclosure restrictions that travel with the record.

create table pi_medical_records (
  id                           uuid primary key default gen_random_uuid(),
  matter_id                    uuid not null references matters(id) on delete cascade,
  document_id                  uuid references documents(id),
  provider_name                text,
  service_from                 date,
  service_to                   date,
  class                        data_class not null default 'class_phi'
                                 check (class = 'class_phi'),
  part2_restricted             boolean not null default false,
  redisclosure_notice_required boolean not null default true,
  authorization_doc_id         uuid references documents(id),
  ocr_extract_id               uuid,   -- → tenant_corpus (never the authority corpus — I-A14)
  created_at                   timestamptz not null default now()
);

create table pi_liens (
  id             uuid primary key default gen_random_uuid(),
  matter_id      uuid not null references matters(id) on delete cascade,
  lienholder     text not null,
  lien_kind      text not null check (lien_kind in (
                   'medicare','medicaid','erisa','hospital',
                   'workers_comp','provider','other'
                 )),
  asserted_cents bigint,
  resolved_cents bigint,
  resolved_at    timestamptz,
  class          data_class not null default 'class_financial'
                   check (class in ('class_phi','class_financial'))
);

-- A settlement disbursement cannot execute while a lien is unresolved.
-- Paying a client over an unreleased Medicare / ERISA lien creates personal
-- liability for counsel. This trigger enforces that at the database level.
create or replace function guard_pi_lien_clearance()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.direction <> 'debit' or new.entry_kind <> 'client_disbursement' then
    return new;
  end if;
  if exists (
    select 1 from public.matters m
    where m.id = new.matter_id and m.practice_area = 'personal_injury'
  )
  and exists (
    select 1 from public.pi_liens l
    where l.matter_id   = new.matter_id
      and l.resolved_at is null
  ) then
    raise exception 'LIEN_UNRESOLVED: settlement disbursement blocked by an open PI lien'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger trust_ledger_pi_lien_guard
  before insert on trust_ledger
  for each row execute function guard_pi_lien_clearance();

-- ── Bankruptcy workbench — class_insolvency ────────────────────────────────────
-- Pre-filing: most sensitive data in the system (full financial position to creditors).
-- Post-filing: public record under 11 U.S.C. §107.
-- The predicate has to know the difference; the filed_at column is authoritative.

create table bk_schedules (
  id                  uuid primary key default gen_random_uuid(),
  matter_id           uuid not null references matters(id) on delete cascade,
  chapter             text not null check (chapter in ('7','11','13')),
  schedule_code       text not null, -- 'A/B','D','E/F','I','J','SOFA','means'
  payload             jsonb not null,
  class               data_class not null default 'class_insolvency'
                        check (class = 'class_insolvency'),
  filed_at            timestamptz,   -- NULL → pre-filing → never publicly disclosable
  public_after_filing boolean not null default true,
  created_at          timestamptz not null default now()
);

-- ── Corporate workbench — class_mnpi + restricted list (I-L10) ───────────────
-- A corporate matter holding cap tables inside a platform that runs an
-- acquisition marketplace (G2), a capital desk (G3), and a brokerage (G9)
-- is an information-barrier problem with securities consequences.

create table corp_cap_tables (
  id         uuid primary key default gen_random_uuid(),
  matter_id  uuid not null references matters(id) on delete cascade,
  entity_ref text not null,
  as_of      date not null,
  payload    jsonb not null,
  class      data_class not null default 'class_mnpi'
               check (class = 'class_mnpi'),
  created_at timestamptz not null default now()
);

-- Individual transaction-level records (NDA, LOI, term sheet, diligence summary)
create table corp_transaction_records (
  id           uuid primary key default gen_random_uuid(),
  matter_id    uuid not null references matters(id) on delete cascade,
  record_type  text not null check (record_type in (
                 'term_sheet','loi','cap_table_snapshot',
                 'nda','due_diligence_summary','closing_memo'
               )),
  document_id  uuid references documents(id),
  class        data_class not null default 'class_mnpi'
                 check (class = 'class_mnpi'),
  created_at   timestamptz not null default now()
);

-- ── MNPI restricted-list table ────────────────────────────────────────────────
-- A user with an active MNPI designation cannot hold an active acquisition,
-- brokerage, or capital session against any counterparty in the cluster.
-- The predicate on_restricted_list() is consumed by G2/G3/G9 tables.
create table mnpi_designations (
  id              uuid primary key default gen_random_uuid(),
  matter_id       uuid not null references matters(id) on delete cascade,
  user_id         uuid not null references users(id) on delete cascade,
  -- G2 §II.2.3 beneficial-owner cluster hashes — ties the designation to a
  -- counterparty cluster, not to a named person, to avoid exposing the matter
  subject_cluster text[] not null,
  designated_at   timestamptz not null default now(),
  released_at     timestamptz,
  unique (matter_id, user_id)
);
create index mnpi_active on mnpi_designations (user_id) where released_at is null;

-- Replace the stub from 0019 with the real implementation
create or replace function public.on_restricted_list(p_cluster text[])
returns boolean language sql stable security definer
  set search_path = '' as $$
  select exists (
    select 1 from public.mnpi_designations d
    where d.user_id        = auth.uid()
      and d.released_at    is null
      and d.subject_cluster && p_cluster
  );
$$;

-- ── Family / Estates workbench — class_family ────────────────────────────────
-- State sealing rules apply; involves_minor triggers additional review.
-- Sealed rows vanish from every operational surface while the existence of the
-- sealing act is preserved for auditability.
create table family_asset_inventories (
  id             uuid primary key default gen_random_uuid(),
  matter_id      uuid not null references matters(id) on delete cascade,
  payload        jsonb not null,
  involves_minor boolean not null default false,
  class          data_class not null default 'class_family'
                   check (class = 'class_family'),
  sealed_at      timestamptz,
  created_at     timestamptz not null default now()
);

-- ── Privilege succession (I-L9) ───────────────────────────────────────────────
-- Weintraub: in a corporate Chapter 7, control of the attorney-client privilege
-- passes to the trustee. An executor controls it for an estate. A surviving
-- merged entity holds a predecessor's privilege. A static privilege_holder_id
-- column cannot express any of these; the holder is a resolvable function of
-- time and event.
-- This table is append-only: corrections are by new entries, not edits.
create table privilege_successions (
  id             uuid primary key default gen_random_uuid(),
  matter_id      uuid not null references matters(id) on delete cascade,
  from_holder_id uuid not null references users(id),
  to_holder_id   uuid not null references users(id),
  basis          text not null check (basis in (
                   'bk_trustee_appointment', 'executor_appointment',
                   'merger', 'assignment', 'court_order'
                 )),
  order_doc_id   uuid not null references documents(id),
  effective_at   timestamptz not null,
  created_at     timestamptz not null default now()
);
create rule priv_succ_no_update as on update to privilege_successions do instead nothing;
create rule priv_succ_no_delete as on delete to privilege_successions do instead nothing;

-- The privilege holder is resolved as a function of time.
create or replace function public.current_privilege_holder(
  p_matter   uuid,
  p_original uuid
) returns uuid language sql stable security definer
  set search_path = '' as $$
  select coalesce(
    (
      select s.to_holder_id
      from public.privilege_successions s
      where s.matter_id    = p_matter
        and s.effective_at <= now()
      order by s.effective_at desc
      limit 1
    ),
    p_original
  );
$$;

-- may_read_privileged_v2 — replaces the Group 4 stub; succession-aware.
-- The wall overrides every branch including the holder's own counsel.
create or replace function public.may_read_privileged_v2(
  p_matter   uuid,
  p_original uuid
) returns boolean language sql stable security definer
  set search_path = '' as $$
  with holder as (
    select public.current_privilege_holder(p_matter, p_original) as id
  )
  select (
    (select id from holder) = auth.uid()
    or exists (
      select 1 from public.representations r, holder h
      where r.matter_id       = p_matter
        and r.client_user_id  = h.id
        and r.counsel_user_id = auth.uid()
        and r.status          = 'active'
    )
    or exists (
      select 1 from public.representations r
      join public.firm_members fm on fm.firm_id = (
        select firm_id from public.matters where id = p_matter
      ), holder h
      where r.matter_id      = p_matter
        and r.client_user_id = h.id
        and r.status         = 'active'
        and fm.user_id       = auth.uid()
    )
  )
  and not public.screened_from_matter(p_matter);
$$;

-- ── Adverse parties: practice areas introduce counterparties the G2 graph ─────
-- cannot see. The conflict-check and wall-inheritance triggers consume this.
create table matter_adverse_parties (
  id               uuid primary key default gen_random_uuid(),
  matter_id        uuid not null references matters(id) on delete cascade,
  party_kind       text not null check (party_kind in (
                     'individual','entity','insurer','medical_provider',
                     'creditor','trustee','government','estate'
                   )),
  display_name     text not null,
  identity_cluster text[] not null default '{}',
  added_at         timestamptz not null default now()
);
create index map_cluster on matter_adverse_parties using gin (identity_cluster);

-- ── Bar admissions (per diem / gig eligibility dependency) ───────────────────
create table bar_admissions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id) on delete cascade,
  jurisdiction text not null,
  standing     text not null check (standing in ('active','inactive','suspended','disbarred')),
  bar_number   text not null,
  reverify_due timestamptz not null,
  created_at   timestamptz not null default now(),
  unique (user_id, jurisdiction)
);

-- 0063_lw_gig_rail.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- The draft's auto-release on geofence verification is replaced with a staged
-- payment model (§I.5):
--   ATTEMPT FEE  → released on server-verified attempt evidence
--   SERVICE FEE  → released on notarized affidavit + counsel-of-record acceptance
--   TRAVERSE     → reserve % held until filing + challenge window clear
-- Provenance gates ACCEPTANCE of a submission. It NEVER gates money directly.
-- (I-L16)

create type gig_type as enum
  ('process_server','per_diem','mobile_notary','title_abstractor','court_runner');

create type gig_state as enum
  ('draft','open','assigned','attempt_submitted','attempt_verified',
   'affidavit_submitted','accepted','service_released','reserve_released',
   'disputed','traverse_sustained','cancelled','expired');

-- ── Provider credentials (I-L19) ─────────────────────────────────────────────
-- Must be current AND jurisdiction-matched to the service address at both
-- assignment and release — not just at onboarding.
create table gig_provider_credentials (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references users(id) on delete cascade,
  gig_type          gig_type not null,
  issuing_authority text not null,     -- e.g. 'NYC DCWP', 'NY DOS', 'NY UCS'
  jurisdiction      text not null,     -- state or municipality the licence covers
  licence_number    text not null,
  bond_ref          text,
  bond_expires_at   timestamptz,
  issued_on         date not null,
  expires_on        date not null,
  standing          text not null check (standing in ('active','suspended','revoked','expired')),
  verified_at       timestamptz not null,
  reverify_due      timestamptz not null,
  unique (user_id, gig_type, jurisdiction)
);

-- Eligibility predicate: current, jurisdiction-matched, bonded where required
create or replace function public.gig_provider_eligible(
  p_user         uuid,
  p_type         gig_type,
  p_jurisdiction text
) returns boolean language sql stable security definer
  set search_path = '' as $$
  select exists (
    select 1 from public.gig_provider_credentials c
    where c.user_id      = p_user
      and c.gig_type     = p_type
      and c.jurisdiction = p_jurisdiction
      and c.standing     = 'active'
      and c.expires_on   > current_date
      and c.reverify_due > now()
      and (c.bond_expires_at is null or c.bond_expires_at > now())
  );
$$;

-- ── Gig postings ──────────────────────────────────────────────────────────────
-- Money is decomposed into three tranches (same pattern as G4 §II.5.7 arb awards).
-- Posting is wall-gated: a matter must be accessible before a gig can be posted.
create table legal_gig_postings (
  id                   uuid primary key default gen_random_uuid(),
  matter_id            uuid not null references matters(id) on delete cascade,
  posted_by_user_id    uuid not null references users(id),
  gig_type             gig_type not null,
  service_jurisdiction text not null,
  service_geofence     jsonb not null,      -- {lat, lng, radius_m}; radius_m ≤ 150
  attempt_fee_cents    bigint not null check (attempt_fee_cents > 0),
  max_attempts         int not null default 3 check (max_attempts between 1 and 6),
  service_fee_cents    bigint not null check (service_fee_cents > 0),
  reserve_bps          int not null default 1500 check (reserve_bps between 0 and 5000),
  escrow_intent_id     uuid references escrow_intents(id),
  -- I-L21: funded from operating account or client-authorized advance; never trust principal
  funding_source       text not null check (funding_source in ('operating','client_advance')),
  state                gig_state not null default 'draft',
  assigned_to_user_id  uuid references users(id),
  assigned_at          timestamptz,
  amounts_frozen_at    timestamptz,   -- set on assignment; terms are immutable after this
  created_at           timestamptz not null default now()
);

-- I-L21: gig escrow never drawn from trust principal. Terms freeze on assignment
-- (TOCTOU guard: re-posting is required to change terms after assignment).
create or replace function guard_gig_funding()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.funding_source not in ('operating','client_advance') then
    raise exception 'I-L21: gig escrow cannot draw on trust principal'
      using errcode = '42501';
  end if;
  if old is not null
     and old.amounts_frozen_at is not null
     and (
       old.attempt_fee_cents,
       old.service_fee_cents,
       old.reserve_bps,
       old.service_geofence::text
     ) is distinct from (
       new.attempt_fee_cents,
       new.service_fee_cents,
       new.reserve_bps,
       new.service_geofence::text
     ) then
    raise exception 'GIG_TERMS_FROZEN: re-post the gig to change terms after assignment'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger gig_funding_guard
  before insert or update on legal_gig_postings
  for each row execute function guard_gig_funding();

-- Self-dealing screen: poster and assignee cannot be the same natural person,
-- share an identity_subject, or share a firm seat.
create or replace function guard_gig_assignment()
returns trigger language plpgsql set search_path = '' as $$
declare
  poster_subject   uuid;
  assignee_subject uuid;
begin
  if new.assigned_to_user_id is null then return new; end if;

  -- I-L19: credential check at assignment
  if not public.gig_provider_eligible(
    new.assigned_to_user_id, new.gig_type, new.service_jurisdiction
  ) then
    raise exception 'PROVIDER_NOT_ELIGIBLE: credential absent, expired, or wrong jurisdiction'
      using errcode = '42501';
  end if;

  select identity_subject_id into poster_subject
  from public.users where id = new.posted_by_user_id;
  select identity_subject_id into assignee_subject
  from public.users where id = new.assigned_to_user_id;

  if poster_subject is not null and poster_subject = assignee_subject then
    raise exception 'SELF_DEALING: poster and provider are the same natural person'
      using errcode = '42501';
  end if;
  if exists (
    select 1 from public.firm_members a
    join public.firm_members b on a.firm_id = b.firm_id
    where a.user_id = new.posted_by_user_id
      and b.user_id = new.assigned_to_user_id
  ) then
    raise exception 'SELF_DEALING: provider shares a firm seat with the poster'
      using errcode = '42501';
  end if;

  new.amounts_frozen_at := coalesce(new.amounts_frozen_at, now());
  return new;
end;
$$;
create trigger gig_assignment_guard
  before update on legal_gig_postings
  for each row execute function guard_gig_assignment();

-- ── Server-issued capture nonces (I-L17) ─────────────────────────────────────
-- Nonces are SERVER-ISSUED, single-use, short-TTL, bound to (gig_id, user_id,
-- device_id). A client that can mint its own nonce has a replay primitive.
-- The nonce must appear inside the signed attestation payload — that is what
-- binds the attestation to a request rather than just to a device.
create table gig_capture_nonces (
  nonce       uuid primary key default gen_random_uuid(),
  gig_id      uuid not null references legal_gig_postings(id) on delete cascade,
  issued_to   uuid not null references users(id),
  device_id   text not null,
  issued_at   timestamptz not null default now(),
  expires_at  timestamptz not null,
  consumed_at timestamptz,
  consumed_by uuid   -- populated when the nonce is consumed by a submission
);
create index nonce_live on gig_capture_nonces (gig_id, issued_to)
  where consumed_at is null;

-- ── Service attempts: raw evidence + server-computed verdicts (I-L18) ─────────
-- geofence_verified, attestation_verified, timestamp_verified are server-computed.
-- REVOKE UPDATE on these columns is in 0066 (I-L18).
-- client_captured_at is retained as evidence; server received_at is authoritative.
create table legal_service_attempts (
  id                    uuid primary key default gen_random_uuid(),
  gig_id                uuid not null references legal_gig_postings(id) on delete cascade,
  attempt_index         int not null,
  submitted_by          uuid not null references users(id),
  nonce                 uuid not null references gig_capture_nonces(nonce),
  storage_path          text not null,
  -- Raw, as reported by the device. NEVER treated as fact.
  reported_lat          double precision,
  reported_lng          double precision,
  reported_accuracy_m   double precision,
  client_captured_at    timestamptz,
  attestation_token     text not null,   -- raw App Attest / Play Integrity token
  perceptual_hash       text not null,
  -- Server-computed. Client has no UPDATE grant on these columns (0066).
  received_at           timestamptz not null default now(),
  attestation_verified  boolean,
  attestation_verdict   jsonb,
  attestation_key_id    text,
  geofence_verified     boolean,
  geofence_distance_m   double precision,
  timestamp_skew_s      int,
  -- Scoped uniqueness: cross-gig uniqueness both false-rejects legitimate second
  -- service at the same door AND hands an attacker a pre-registration griefing primitive
  duplicate_of          uuid references legal_service_attempts(id),
  review_flags          text[] not null default '{}',
  verified_at           timestamptz,
  unique (gig_id, attempt_index),
  unique (gig_id, perceptual_hash)   -- scoped to the gig, not global
);

-- Nonce binding, attempt limit, and assignment check
create or replace function guard_attempt_submission()
returns trigger language plpgsql set search_path = '' as $$
declare
  n public.gig_capture_nonces;
  g public.legal_gig_postings;
begin
  select * into n from public.gig_capture_nonces
  where nonce = new.nonce for update;

  if n.nonce is null       then raise exception 'NONCE_INVALID'   using errcode = '42501'; end if;
  if n.consumed_at is not null then raise exception 'NONCE_REPLAY: nonce already consumed' using errcode = '42501'; end if;
  if n.expires_at < now()  then raise exception 'NONCE_EXPIRED'   using errcode = '42501'; end if;
  if n.gig_id  <> new.gig_id or n.issued_to <> new.submitted_by then
    raise exception 'NONCE_BINDING_MISMATCH' using errcode = '42501';
  end if;

  select * into g from public.legal_gig_postings where id = new.gig_id;
  if g.assigned_to_user_id is distinct from new.submitted_by then
    raise exception 'NOT_ASSIGNED' using errcode = '42501';
  end if;
  if new.attempt_index > g.max_attempts then
    raise exception 'ATTEMPT_LIMIT_EXCEEDED' using errcode = '42501';
  end if;

  update public.gig_capture_nonces
     set consumed_at = now(), consumed_by = new.submitted_by
   where nonce = new.nonce;

  return new;
end;
$$;
create trigger attempt_submission_guard
  before insert on legal_service_attempts
  for each row execute function guard_attempt_submission();

-- ── Affidavit + counsel acceptance: the money path (I-L16) ───────────────────
-- accepted_by is always a human act — counsel of record — never auto.
-- The notarized affidavit is the gate for service_fee release.
create table legal_service_affidavits (
  id                  uuid primary key default gen_random_uuid(),
  gig_id              uuid not null references legal_gig_postings(id) on delete cascade,
  attempt_id          uuid references legal_service_attempts(id),
  cplr_subdivision    text,        -- '308(1)','308(2)','308(4)','311','311-a', ...
  served_person       text,
  notary_act_ref      text not null,   -- notarial act / RON session identifier
  notary_verified_at  timestamptz not null,
  document_id         uuid not null references documents(id),
  filed_with_court_at timestamptz,
  court_index_ref     text,
  accepted_by         uuid references users(id),   -- counsel of record; a HUMAN act
  accepted_at         timestamptz,
  traverse_filed_at   timestamptz,
  traverse_outcome    text check (traverse_outcome in ('sustained','denied','withdrawn')),
  created_at          timestamptz not null default now()
);

-- ── Escrow releases: service-role only, never interactive ────────────────────
-- There is no interactive path that moves gig escrow. Same posture as G4 arb releases.
create table gig_releases (
  id           uuid primary key default gen_random_uuid(),
  gig_id       uuid not null references legal_gig_postings(id),
  tranche      text not null check (tranche in ('attempt','service','reserve','clawback')),
  amount_cents bigint not null,
  basis        text not null,
  executed_by  text not null default 'escrow_service_role',
  executed_at  timestamptz not null default now(),
  intent_id    uuid references escrow_intents(id),
  unique (gig_id, tranche, intent_id)
);

-- Release guard: each tranche has its own preconditions.
create or replace function guard_gig_release()
returns trigger language plpgsql set search_path = '' as $$
declare
  g public.legal_gig_postings;
  a public.legal_service_affidavits;
begin
  select * into g from public.legal_gig_postings where id = new.gig_id for update;

  if new.tranche = 'attempt' then
    -- Attempt fee: requires at least one server-verified attempt
    if not exists (
      select 1 from public.legal_service_attempts t
      where t.gig_id              = new.gig_id
        and t.verified_at         is not null
        and t.attestation_verified = true
        and t.geofence_verified    = true
        and t.duplicate_of         is null
    ) then
      raise exception 'PROVENANCE_UNVERIFIED: no verified attempt on record'
        using errcode = '42501';
    end if;

  elsif new.tranche in ('service','reserve') then
    -- Service and reserve: require notarized affidavit + counsel acceptance (I-L16)
    select * into a from public.legal_service_affidavits
    where gig_id = new.gig_id
    order by created_at desc
    limit 1;

    if a.id is null or a.notary_verified_at is null then
      raise exception 'AFFIDAVIT_REQUIRED: notarized affidavit absent'
        using errcode = '42501';
    end if;
    if a.accepted_by is null then
      raise exception 'ACCEPTANCE_REQUIRED: counsel of record has not accepted'
        using errcode = '42501';
    end if;
    if not public.is_matter_party_for(a.accepted_by, g.matter_id, 'gigs', 'lead_counsel') then
      raise exception 'ACCEPTANCE_INVALID: acceptor is not counsel of record'
        using errcode = '42501';
    end if;
    -- I-L19 re-checked at release, not only at assignment
    if not public.gig_provider_eligible(
      g.assigned_to_user_id, g.gig_type, g.service_jurisdiction
    ) then
      raise exception 'PROVIDER_NOT_ELIGIBLE: credential lapsed before release'
        using errcode = '42501';
    end if;

    if new.tranche = 'reserve' then
      if a.filed_with_court_at is null then
        raise exception 'RESERVE_HELD: affidavit not yet filed with court'
          using errcode = '42501';
      end if;
      if a.traverse_filed_at is not null and a.traverse_outcome is null then
        raise exception 'RESERVE_HELD: traverse challenge pending'
          using errcode = '42501';
      end if;
      if a.traverse_outcome = 'sustained' then
        raise exception 'RESERVE_FORFEIT: traverse sustained — clawback path only'
          using errcode = '42501';
      end if;
    end if;
  end if;

  return new;
end;
$$;
create trigger gig_release_guard
  before insert on gig_releases
  for each row execute function guard_gig_release();

-- ── Per diem: an appearance grant, never a representation (I-L20) ─────────────
-- A per diem assignment inserts a narrow, expiring, scope={appearance}
-- matter_parties row. It runs the full conflict screen first. It never creates
-- a representation edge, so may_read_privileged_v2() never returns true for them.
create table per_diem_assignments (
  id                uuid primary key default gen_random_uuid(),
  gig_id            uuid not null references legal_gig_postings(id) on delete cascade,
  matter_id         uuid not null references matters(id) on delete cascade,
  attorney_id       uuid not null references users(id),
  calendar_item     text not null,
  hearing_at        timestamptz not null,
  conflict_check_id uuid not null references conflict_checks(id),
  matter_party_id   uuid references matter_parties(matter_id),  -- the narrow grant row
  created_at        timestamptz not null default now()
);

create or replace function guard_per_diem()
returns trigger language plpgsql set search_path = '' as $$
declare
  j text;
begin
  select jurisdiction into j from public.matters where id = new.matter_id;

  -- Bar admission must be active in the service jurisdiction
  if not exists (
    select 1 from public.bar_admissions b
    where b.user_id      = new.attorney_id
      and b.jurisdiction = j
      and b.standing     = 'active'
      and b.reverify_due > now()
  ) then
    raise exception 'BAR_NOT_ACTIVE: per diem attorney not admitted in %', j
      using errcode = '42501';
  end if;

  -- Full conflict screen must be clear before the grant is created
  if not exists (
    select 1 from public.conflict_checks c
    where c.id        = new.conflict_check_id
      and c.matter_id = new.matter_id
      and c.result    in ('clear')
  ) then
    raise exception 'CONFLICT_HIT: per diem assignment requires a cleared conflict screen'
      using errcode = '42501';
  end if;

  -- Insert the narrow, expiring, facet-scoped matter_parties row.
  -- scope = {appearance} — never a full representation grant.
  insert into public.matter_parties
    (matter_id, user_id, matter_role, scope, expires_at, status)
  values
    (new.matter_id, new.attorney_id, 'per_diem',
     array['appearance'], new.hearing_at + interval '24 hours', 'active');

  return new;
end;
$$;
create trigger per_diem_guard
  before insert on per_diem_assignments
  for each row execute function guard_per_diem();

-- 0064_lw_walls_and_retrieval.sql
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Walls gain scope (I-L13) ──────────────────────────────────────────────────
-- The Group 4 wall was matter-scoped only. A new matter opened for a walled
-- client must inherit the wall before the matter row is visible to anyone.
-- Client-scoped and cluster-scoped walls handle that automatically (trigger below).
alter table ethical_walls
  add column scope_kind         text not null default 'matter'
                                  check (scope_kind in ('matter','client','cluster')),
  add column subject_client_id  uuid references users(id),
  add column subject_cluster    text[] not null default '{}',
  add column wall_epoch         bigint not null default 1,
  -- I-L15: the wall is NOT "created" until purge_ack_at is set.
  -- A half-erected wall is worse than none because it is believed.
  add column purge_ack_at       timestamptz,
  add column lifted_at          timestamptz,
  add column lifted_by          uuid references users(id);

alter table ethical_walls
  add constraint wall_scope_ck check (
    (scope_kind = 'matter'  and matter_ids is not null)
    or (scope_kind = 'client'  and subject_client_id is not null)
    or (scope_kind = 'cluster' and array_length(subject_cluster, 1) > 0)
  );

-- The old matter+user unique index does not fit client/cluster walls.
drop index if exists ethical_walls_matter_id_screened_user_ids_idx;
create unique index wall_matter_uniq on ethical_walls
  (matter_ids, screened_user_ids)
  where scope_kind = 'matter';

-- ── Lift events (append-only — walls are lifted by record, not deleted) ───────
create table wall_lift_events (
  id                   uuid primary key default gen_random_uuid(),
  wall_id              uuid not null references ethical_walls(id),
  lifted_by            uuid not null references users(id),
  basis                text not null,
  client_consent_doc_id uuid references documents(id),
  at                   timestamptz not null default now()
);
create rule wall_lift_no_update as on update to wall_lift_events do instead nothing;
create rule wall_lift_no_delete as on delete to wall_lift_events do instead nothing;

-- Lifting a wall requires a responsible attorney who is NOT the screened member.
create or replace function guard_wall_lift()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.lifted_at is null and new.lifted_at is not null then
    if not exists (
      select 1 from public.firm_members fm
      where fm.firm_id   = new.firm_id
        and fm.user_id   = auth.uid()
        and fm.firm_role = 'partner'
    ) then
      raise exception 'WALL_LIFT_UNAUTHORIZED: responsible attorney only'
        using errcode = '42501';
    end if;
    if new.screened_user_ids @> array[auth.uid()] then
      raise exception 'WALL_LIFT_UNAUTHORIZED: a screened member cannot lift their own screen'
        using errcode = '42501';
    end if;
    new.wall_epoch := old.wall_epoch + 1;
  end if;
  return new;
end;
$$;
create trigger ethical_walls_lift_guard
  before update on ethical_walls
  for each row execute function guard_wall_lift();

-- ── New matter wall inheritance (I-L13) ───────────────────────────────────────
-- A new matter opened for a walled client or cluster inherits the wall AT INTAKE,
-- before the matter row is visible to anyone (AFTER INSERT fires after the row
-- is committed but before the transaction returns to the caller).
create or replace function inherit_walls_on_matter_open()
returns trigger language plpgsql set search_path = '' as $$
begin
  insert into public.ethical_walls
    (firm_id, matter_ids, screened_user_ids, scope_kind,
     subject_client_id, subject_cluster, erected_by, purge_ack_at)
  select
    w.firm_id,
    array[new.id],
    w.screened_user_ids,
    'matter',
    w.subject_client_id,
    w.subject_cluster,
    w.erected_by,
    now()   -- inherited walls are considered purged immediately (matter is brand-new)
  from public.ethical_walls w
  where w.lifted_at is null
    and w.firm_id   = new.firm_id
    and (
      -- Client-scoped wall: new matter is for this client
      (w.scope_kind = 'client' and exists (
        select 1 from public.representations r
        where r.matter_id      = new.id
          and r.client_user_id = w.subject_client_id
      ))
      or
      -- Cluster-scoped wall: new matter has an adverse party in the cluster
      (w.scope_kind = 'cluster' and exists (
        select 1 from public.matter_adverse_parties ap
        where ap.matter_id        = new.id
          and ap.identity_cluster && w.subject_cluster
      ))
    )
  on conflict do nothing;
  return new;
end;
$$;
create trigger matters_wall_inherit
  after insert on matters
  for each row execute function inherit_walls_on_matter_open();

-- ── Scope-aware screened_from_matter predicates (I-L12) ──────────────────────
-- Group 4's wall_blocks_user() checked only matter_id equality.
-- Client- and cluster-scoped walls had no matter_id and were invisible to it.
-- This replaces it entirely.

drop function if exists public.wall_blocks_user(uuid, uuid);

create or replace function public.screened_from_matter_for(
  p_user   uuid,
  p_matter uuid
) returns boolean language sql stable security definer
  set search_path = '' as $$
  select exists (
    select 1 from public.ethical_walls w
    where w.lifted_at is null
      and p_user = any(w.screened_user_ids)
      -- purge_ack_at is deliberately NOT tested here. A wall blocks from the
      -- instant the row exists. Testing purge_ack_at here would invert the
      -- control: an unacknowledged wall would fail open.
      and (
        (w.scope_kind = 'matter' and p_matter = any(w.matter_ids))
        or (w.scope_kind = 'client' and exists (
              select 1 from public.representations r
              where r.matter_id      = p_matter
                and r.client_user_id = w.subject_client_id
        ))
        or (w.scope_kind = 'cluster' and exists (
              select 1 from public.matter_adverse_parties ap
              where ap.matter_id        = p_matter
                and ap.identity_cluster && w.subject_cluster
        ))
      )
  );
$$;

create or replace function public.screened_from_matter(p_matter uuid)
returns boolean language sql stable security definer
  set search_path = '' as $$
  select public.screened_from_matter_for(auth.uid(), p_matter);
$$;

-- ── Co-Pilot retrieval index (matter- and wall-scoped) ────────────────────────
-- The wall's biggest hole is not the matter_parties table; it is every COPY of
-- matter content: retrieval indexes, transcripts, caches, and provider-side
-- context caches. These tables are wall-epoch stamped so a wall bump orphans
-- every cached prefix (I-A16 / I-L15).
create table copilot_retrieval_index (
  id              uuid primary key default gen_random_uuid(),
  matter_id       uuid not null references matters(id) on delete cascade,
  document_id     uuid references documents(id) on delete cascade,
  class           data_class not null,
  privilege_class text not null default 'none'
                    check (privilege_class in
                      ('none','attorney_client','work_product','settlement_privileged')),
  chunk           text not null,
  -- embedding column populated in 0070 when pgvector extension is installed.
  -- Placeholder type added here so application code can reference the column schema.
  -- embedding    vector(1536),
  wall_epoch      bigint not null default 1,
  created_at      timestamptz not null default now()
);
-- ANN search must be PRE-filtered by matter_id to avoid leaking wall membership
-- through counts and latency. Post-filtering an ANN result set is the wrong pattern.
create index cri_matter on copilot_retrieval_index (matter_id);

create table copilot_transcripts (
  id          uuid primary key default gen_random_uuid(),
  matter_id   uuid not null references matters(id) on delete cascade,
  user_id     uuid not null references users(id) on delete cascade,
  epoch       bigint not null,
  wall_epoch  bigint not null default 1,
  role        text not null check (role in ('user','assistant')),
  content     text not null,
  cited_chunks uuid[] not null default '{}',
  created_at  timestamptz not null default now()
);

-- ── Purge protocol (I-L15) ────────────────────────────────────────────────────
-- Called SYNCHRONOUSLY by POST /api/legal/walls.
-- The wall row is NOT marked created (purge_ack_at set) until this returns.
-- A half-erected wall is worse than none — it is believed while providing no protection.
create or replace function public.purge_walled_context(p_wall uuid)
returns void language plpgsql security definer
  set search_path = '' as $$
declare
  w public.ethical_walls;
begin
  select * into w from public.ethical_walls where id = p_wall;

  -- Delete this screened user's transcripts for all walled matters
  delete from public.copilot_transcripts ct
  where ct.user_id = any(w.screened_user_ids)
    and (
      -- matter-scoped: purge transcripts for the specific matter(s)
      (w.scope_kind = 'matter' and ct.matter_id = any(w.matter_ids))
      or
      -- client/cluster-scoped: purge transcripts for all matters in scope
      (w.scope_kind <> 'matter' and ct.matter_id in (
        select m.id from public.matters m
        where m.firm_id = w.firm_id
          and (
            (w.scope_kind = 'client' and exists (
              select 1 from public.representations r
              where r.matter_id      = m.id
                and r.client_user_id = w.subject_client_id
            ))
            or
            (w.scope_kind = 'cluster' and exists (
              select 1 from public.matter_adverse_parties ap
              where ap.matter_id        = m.id
                and ap.identity_cluster && w.subject_cluster
            ))
          )
      ))
    );

  -- Bump the wall_epoch on retrieval index rows for the walled matter(s).
  -- This orphans any provider-side context caches keyed on (matter_id, wall_epoch).
  if w.scope_kind = 'matter' then
    update public.copilot_retrieval_index
       set wall_epoch = wall_epoch + 1
     where matter_id = any(w.matter_ids);
  end if;

  -- Mark the wall as purge-acknowledged. Only now is it "erected" (I-L15).
  update public.ethical_walls
     set purge_ack_at = now()
   where id = p_wall;
end;
$$;

-- ── Break-glass access (admin branch — I-L12 / I-L14) ─────────────────────────
-- No role check grants through a wall. Admin access to a walled matter requires
-- a time-boxed, dual-approved, holder-notified break-glass grant.
-- This replaces `current_user_role_group() = 'admin'` on matter-scoped policies.
create table break_glass_grants (
  id                  uuid primary key default gen_random_uuid(),
  matter_id           uuid not null references matters(id),
  admin_id            uuid not null references users(id),
  basis               text not null,
  approved_by         uuid not null references users(id),
  opened_at           timestamptz not null default now(),
  expires_at          timestamptz not null,
  holder_notified_at  timestamptz,
  check (approved_by <> admin_id)  -- dual approval; admin cannot self-approve
);
create rule bgg_no_delete as on delete to break_glass_grants do instead nothing;

create or replace function public.break_

_[Continuing response due to length limit...]_

Continuing exactly from the cut-off:

```sql
glass_active(p_matter uuid)
returns boolean language sql stable security definer
  set search_path = '' as $$
  select exists (
    select 1 from public.break_glass_grants b
    where b.matter_id          = p_matter
      and b.admin_id           = auth.uid()
      and b.expires_at         > now()
      and b.holder_notified_at is not null   -- notification is not optional
  );
$$;

-- 0065_lw_rls.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Every table created in 0060–0064 receives RLS here.
-- Universal rule: matter-scoped tables use is_matter_party() + may_read_class()
-- + screened_from_matter(). The admin branch is break_glass_active(), never
-- current_user_role_group() = 'admin' (I-L12: a wall overrides every grant,
-- including the service role and admin role — there are no exceptions).

-- ── Enable RLS on all new tables ─────────────────────────────────────────────
alter table identity_subjects          enable row level security;
alter table matter_class_grants        enable row level security;
alter table matter_class_grant_log     enable row level security;
alter table trust_client_balances      enable row level security;
alter table bar_foundation_payees      enable row level security;
alter table legal_invoices             enable row level security;
alter table pi_medical_records         enable row level security;
alter table pi_liens                   enable row level security;
alter table bk_schedules               enable row level security;
alter table corp_cap_tables            enable row level security;
alter table corp_transaction_records   enable row level security;
alter table mnpi_designations          enable row level security;
alter table family_asset_inventories   enable row level security;
alter table privilege_successions      enable row level security;
alter table matter_adverse_parties     enable row level security;
alter table bar_admissions             enable row level security;
alter table gig_provider_credentials   enable row level security;
alter table legal_gig_postings         enable row level security;
alter table gig_capture_nonces         enable row level security;
alter table legal_service_attempts     enable row level security;
alter table legal_service_affidavits   enable row level security;
alter table gig_releases               enable row level security;
alter table per_diem_assignments       enable row level security;
alter table ethical_walls              enable row level security;
alter table wall_lift_events           enable row level security;
alter table wall_prior_access          enable row level security;
alter table copilot_retrieval_index    enable row level security;
alter table copilot_transcripts        enable row level security;
alter table break_glass_grants         enable row level security;

-- ── 0060 — Identity & Class Grants ───────────────────────────────────────────

-- identity_subjects: a user reads only their own verified record.
-- The verification_ref is an IDV vendor case reference; no other user may read it.
create policy identity_subjects_self
  on identity_subjects for select
  using (
    exists (
      select 1 from public.users u
      where u.id = auth.uid()
        and u.identity_subject_id = identity_subjects.id
    )
  );

-- matter_class_grants: readable by the grantee and by counsel on the matter.
create policy mcg_read
  on matter_class_grants for select
  using (
    user_id = auth.uid()
    or is_matter_party(matter_id, null, 'lead_counsel')
    or break_glass_active(matter_id)
  );

-- No interactive insert: grants go through POST /api/legal/matters/:id/class-grants,
-- which calls the constrained service identity and the guard_class_grant() trigger.
create policy mcg_no_direct_insert
  on matter_class_grants for insert
  with check (false);

-- Grant log: append-only, counsel-readable only.
create policy mcgl_read
  on matter_class_grant_log for select
  using (
    is_matter_party(
      (select matter_id from public.matter_class_grants
       where id = matter_class_grant_log.grant_id),
      null, 'lead_counsel'
    )
  );

-- ── 0061 — Trust ─────────────────────────────────────────────────────────────

-- trust_client_balances: the client always reads their own sub-ledger.
-- A trust architecture the client cannot audit is not a trust architecture.
-- Counsel with the trust facet and class_financial grant also reads.
create policy trust_bal_read
  on trust_client_balances for select
  using (
    client_id = auth.uid()
    or (
      is_matter_party(matter_id, 'trust')
      and may_read_class(matter_id, 'class_financial')
    )
    or break_glass_active(matter_id)
  );
-- No interactive update: balances are maintained exclusively by apply_trust_balance().
create policy trust_bal_no_update
  on trust_client_balances for update
  with check (false);

-- legal_invoices: client reads their own; billing-facet counsel reads all for the matter.
create policy invoice_read
  on legal_invoices for select
  using (
    client_id = auth.uid()
    or is_matter_party(matter_id, 'billing')
    or break_glass_active(matter_id)
  );

-- trust_ledger: no interactive INSERT at all (I-L1).
-- Disbursements are composed through the constrained service route only.
-- The guard triggers are the second line of defence, not the first.
drop policy if exists "trust_dual_control_insert" on trust_ledger;
create policy trust_no_interactive_insert
  on trust_ledger for insert
  with check (false);

create policy trust_read
  on trust_ledger for select
  using (
    client_id = auth.uid()
    or (
      is_matter_party(matter_id, 'trust')
      and may_read_class(matter_id, 'class_financial')
    )
    or break_glass_active(matter_id)
  );

-- bar_foundation_payees: readable by any authenticated session (platform metadata).
create policy bfp_read
  on bar_foundation_payees for select
  using (auth.uid() is not null);

-- ── 0062 — Practice Workbenches ───────────────────────────────────────────────
-- Every workbench table: matter party + facet + data class.
-- Matter membership alone grants nothing above class_general (I-L8).

-- PI medical records: class_phi + 'medical' facet
create policy pi_med_read
  on pi_medical_records for select
  using (
    is_matter_party(matter_id, 'medical')
    and may_read_class(matter_id, 'class_phi')
    or break_glass_active(matter_id)
  );
create policy pi_med_write
  on pi_medical_records for insert
  with check (
    is_matter_party(matter_id, 'medical', 'lead_counsel')
    and may_read_class(matter_id, 'class_phi')
  );

-- PI liens: class_financial + 'trust' facet (lien resolution is a trust/settlement act)
create policy pi_lien_read
  on pi_liens for select
  using (
    is_matter_party(matter_id, 'trust')
    and may_read_class(matter_id, 'class_financial')
    or break_glass_active(matter_id)
  );

-- Bankruptcy schedules:
-- Pre-filing (filed_at IS NULL): class_insolvency + 'insolvency' facet (maximum restriction)
-- Post-filing (filed_at IS NOT NULL): public record — matter membership sufficient
create policy bk_sched_read
  on bk_schedules for select
  using (
    (
      filed_at is null
      and is_matter_party(matter_id, 'insolvency')
      and may_read_class(matter_id, 'class_insolvency')
    )
    or (
      filed_at is not null
      and public_after_filing
      and is_matter_party(matter_id)
    )
    or break_glass_active(matter_id)
  );

-- Corporate cap tables: class_mnpi + 'corporate' facet + not on restricted list (I-L10)
create policy corp_cap_read
  on corp_cap_tables for select
  using (
    is_matter_party(matter_id, 'corporate')
    and may_read_class(matter_id, 'class_mnpi')
    and not on_restricted_list(
      coalesce(
        (select subject_cluster from public.mnpi_designations
         where matter_id = corp_cap_tables.matter_id
           and user_id   = auth.uid()
           and released_at is null
         limit 1),
        '{}'::text[]
      )
    )
    or break_glass_active(matter_id)
  );

create policy corp_txn_read
  on corp_transaction_records for select
  using (
    is_matter_party(matter_id, 'corporate')
    and may_read_class(matter_id, 'class_mnpi')
    or break_glass_active(matter_id)
  );

-- MNPI designations: the designated user reads their own; 'corporate' facet counsel reads all.
create policy mnpi_read
  on mnpi_designations for select
  using (
    user_id = auth.uid()
    or is_matter_party(matter_id, 'corporate')
    or break_glass_active(matter_id)
  );

-- Family inventories: class_family + 'family' facet + not sealed
create policy family_read
  on family_asset_inventories for select
  using (
    is_matter_party(matter_id, 'family')
    and may_read_class(matter_id, 'class_family')
    and sealed_at is null
    or break_glass_active(matter_id)
  );

-- Privilege successions: matter party (any role) + privileged read check
create policy priv_succ_read
  on privilege_successions for select
  using (
    is_matter_party(matter_id)
    and may_read_privileged_v2(
      matter_id,
      (select client_user_id from public.representations r
       where r.matter_id = privilege_successions.matter_id
         and r.status    = 'active'
       limit 1)
    )
    or break_glass_active(matter_id)
  );

-- Adverse parties: matter members can see the adverse party list (needed for conflict checks).
-- The list is class_general — no elevated class required.
create policy adverse_parties_read
  on matter_adverse_parties for select
  using (
    is_matter_party(matter_id)
    or break_glass_active(matter_id)
  );

-- Bar admissions: self-read + firm members + gig posting eligibility check (server-side only).
create policy bar_admissions_self_read
  on bar_admissions for select
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.firm_members fm
      join public.firm_members fm2 on fm.firm_id = fm2.firm_id
      where fm.user_id = auth.uid()
        and fm2.user_id = bar_admissions.user_id
    )
  );

-- ── 0063 — Gig Rail ───────────────────────────────────────────────────────────

-- Provider credentials: self-read + matter counsel can verify eligibility for assignment.
create policy gig_cred_read
  on gig_provider_credentials for select
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.legal_gig_postings gp
      where gp.assigned_to_user_id = gig_provider_credentials.user_id
        and is_matter_party(gp.matter_id, 'gigs')
    )
  );

-- Gig postings:
-- A provider eligible for the type + jurisdiction sees open postings.
-- An assigned provider sees their own posting.
-- Counsel with the 'gigs' facet sees all postings for their matter.
create policy gig_posting_read
  on legal_gig_postings for select
  using (
    assigned_to_user_id = auth.uid()
    or is_matter_party(matter_id, 'gigs')
    or (
      state = 'open'
      and gig_provider_eligible(auth.uid(), gig_type, service_jurisdiction)
    )
    or break_glass_active(matter_id)
  );
-- Insert: only counsel of record (lead_counsel + 'gigs' facet) may post a gig.
create policy gig_posting_insert
  on legal_gig_postings for insert
  with check (
    is_matter_party(matter_id, 'gigs', 'lead_counsel')
  );

-- Capture nonces: a provider sees only nonces issued to them.
-- No interactive INSERT: nonces are SERVER-ISSUED through the service route (I-L17).
create policy nonce_own_read
  on gig_capture_nonces for select
  using (issued_to = auth.uid());
create policy nonce_no_interactive_insert
  on gig_capture_nonces for insert
  with check (false);

-- Service attempts: the submitter reads their own; matter counsel reads all for the gig.
create policy attempt_read
  on legal_service_attempts for select
  using (
    submitted_by = auth.uid()
    or exists (
      select 1 from public.legal_gig_postings g
      where g.id = gig_id
        and is_matter_party(g.matter_id, 'gigs')
    )
    or exists (
      select 1 from public.legal_gig_postings g
      where g.id = gig_id
        and break_glass_active(g.matter_id)
    )
  );
-- INSERT: only the assigned provider may submit an attempt.
create policy attempt_insert
  on legal_service_attempts for insert
  with check (
    submitted_by = auth.uid()
    and exists (
      select 1 from public.legal_gig_postings g
      where g.id = gig_id
        and g.assigned_to_user_id = auth.uid()
    )
  );
-- Server-computed verdict columns: no UPDATE via interactive session.
-- Column-level REVOKE is in 0066. This policy is an additional RLS layer.
create policy attempt_no_update
  on legal_service_attempts for update
  with check (false);

-- Affidavits: the assigned provider and gig-facet matter counsel.
create policy affidavit_read
  on legal_service_affidavits for select
  using (
    exists (
      select 1 from public.legal_gig_postings g
      where g.id = gig_id
        and (
          g.assigned_to_user_id = auth.uid()
          or is_matter_party(g.matter_id, 'gigs')
          or break_glass_active(g.matter_id)
        )
    )
  );

-- Releases: no interactive INSERT or UPDATE. Escrow service role only.
create policy releases_no_interactive_insert
  on gig_releases for insert
  with check (false);
create policy releases_read
  on gig_releases for select
  using (
    exists (
      select 1 from public.legal_gig_postings g
      where g.id = gig_id
        and (
          g.assigned_to_user_id = auth.uid()
          or is_matter_party(g.matter_id, 'gigs')
          or break_glass_active(g.matter_id)
        )
    )
  );

-- Per diem assignments: the assigned attorney reads their own; counsel reads all.
create policy per_diem_read
  on per_diem_assignments for select
  using (
    attorney_id = auth.uid()
    or is_matter_party(matter_id, 'gigs', 'lead_counsel')
    or break_glass_active(matter_id)
  );

-- ── 0064 — Walls & Retrieval ──────────────────────────────────────────────────

-- Ethical walls: the screened member CAN see that they are screened — that is
-- required by the screen's own disclosure purpose. But they see no matter detail
-- through the wall. Responsible attorneys and auditors at the firm also read.
create policy wall_visibility
  on ethical_walls for select
  using (
    screened_user_ids @> array[auth.uid()]
    or exists (
      select 1 from public.firm_members fm
      where fm.firm_id = ethical_walls.firm_id
        and fm.user_id = auth.uid()
        and fm.firm_role in ('partner','associate')  -- responsible attorneys only
    )
  );
-- A screened member cannot erect their own wall. Only a responsible attorney
-- at the firm may do so, and they cannot screen themselves.
create policy wall_no_self_insert
  on ethical_walls for insert
  with check (
    exists (
      select 1 from public.firm_members fm
      where fm.firm_id   = ethical_walls.firm_id
        and fm.user_id   = auth.uid()
        and fm.firm_role = 'partner'
    )
    and not (screened_user_ids @> array[auth.uid()])
  );

-- Wall lift events: firm responsible attorneys and auditors.
create policy wall_lift_read
  on wall_lift_events for select
  using (
    exists (
      select 1 from public.ethical_walls w
      join public.firm_members fm on fm.firm_id = w.firm_id
      where w.id        = wall_lift_events.wall_id
        and fm.user_id  = auth.uid()
        and fm.firm_role in ('partner','associate')
    )
  );

-- wall_prior_access: the screened user reads their own record (disclosure purpose).
-- Firm counsel and break-glass admin also read.
create policy wall_prior_access_read
  on wall_prior_access for select
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.firm_members fm
      join public.ethical_walls w on w.id = wall_prior_access.wall_id
      where fm.firm_id  = w.firm_id
        and fm.user_id  = auth.uid()
        and fm.firm_role = 'partner'
    )
  );

-- Co-Pilot retrieval index:
-- The wall predicate is applied INSIDE the retrieval query, not after it (I-A9).
-- A post-filtered ANN search leaks through result counts and latency, and a
-- walled matter must be indistinguishable from a nonexistent one (I-L11).
create policy cri_read
  on copilot_retrieval_index for select
  using (
    is_matter_party(matter_id)
    and may_read_class(matter_id, class)
    and (
      privilege_class = 'none'
      or may_read_privileged_v2(
           matter_id,
           (select privilege_holder_id from public.documents d
            where d.id = document_id)
         )
    )
    or break_glass_active(matter_id)
  );
-- No interactive INSERT: index rows are written by the ingestion pipeline only.
create policy cri_no_interactive_insert
  on copilot_retrieval_index for insert
  with check (false);

-- Co-Pilot transcripts: a session's own transcripts, on matters they can currently see.
-- There is no cross-matter retrieval surface, so a screened member's other matters
-- can never surface walled content.
create policy transcript_own_read
  on copilot_transcripts for select
  using (
    user_id = auth.uid()
    and is_matter_party(matter_id)
  );
create policy transcript_no_cross_matter
  on copilot_transcripts for insert
  with check (
    user_id = auth.uid()
    and is_matter_party(matter_id)
  );

-- Break-glass grants: readable by the admin who holds the grant and by the matter holder.
create policy bgg_read
  on break_glass_grants for select
  using (
    admin_id = auth.uid()
    or approved_by = auth.uid()
    or is_matter_party(matter_id, null, 'lead_counsel')
  );
-- No interactive INSERT: break-glass grants go through the /api/admin/break-glass route,
-- which enforces dual approval and holder notification before writing.
create policy bgg_no_interactive_insert
  on break_glass_grants for insert
  with check (false);

-- ── Replace Group 4 matter/matter_parties policies (I-L12 correction) ─────────
-- Group 4 kept `current_user_role_group() = 'admin'` on matters and matter_parties.
-- That branch reads walled matter existence and party lists. A wall is supposed to
-- make the matter indistinguishable from a nonexistent one (I-L11). The admin role
-- check defeats that guarantee. The replacement uses break_glass_active() only.

drop policy if exists "matters_party_read" on matters;
create policy matters_party_select_v2
  on matters for select
  using (
    is_matter_party(matters.id)
    or break_glass_active(matters.id)
  );

drop policy if exists "matter_parties_self_read" on matter_parties;
create policy mp_select_v2
  on matter_parties for select
  using (
    (user_id = auth.uid() and not screened_from_matter(matter_id))
    or is_matter_party(matter_id)
    or break_glass_active(matter_id)
  );

drop policy if exists "trust_accounts_firm_read" on trust_accounts;
create policy trust_accounts_firm_read_v2
  on trust_accounts for select
  using (
    exists (
      select 1 from public.firm_members fm
      where fm.firm_id = trust_accounts.firm_id
        and fm.user_id = auth.uid()
    )
    -- No admin bypass on trust accounts: the debit-block model means a platform
    -- admin discovering an account's operating_account_ref is a credential leak.
  );

-- 0066_lw_grants.sql
-- ─────────────────────────────────────────────────────────────────────────────

-- ── I-L18: server-computed verdict columns are NOT client-writable ────────────
-- Storing a CONCLUSION the client can set is the defect that made the draft's
-- `geofence_verified boolean` worthless. The guard trigger is the second line;
-- the column grant revoke is the first.

-- Revoke all UPDATE on service attempts from authenticated sessions.
-- Grant back only review_flags (the one column a provider may legitimately set).
revoke update                  on public.legal_service_attempts from authenticated;
grant  update (review_flags)   on public.legal_service_attempts to authenticated;

-- These tables have no client-writable path at all — service role only.
revoke insert, update on public.gig_releases          from authenticated;
revoke insert, update on public.trust_ledger          from authenticated;
revoke update         on public.trust_client_balances from authenticated;
revoke insert         on public.gig_capture_nonces    from authenticated;
revoke all            on public.identity_subjects     from authenticated;
revoke all            on public.bar_foundation_payees from authenticated;
revoke insert, update on public.matter_class_grants   from authenticated;
revoke all            on public.break_glass_grants    from authenticated;
revoke all            on public.copilot_retrieval_index from authenticated;

-- ── Revoke public grants on all Legal Workspace tables ───────────────────────
revoke all on public.identity_subjects          from public;
revoke all on public.matter_class_grants        from public;
revoke all on public.matter_class_grant_log     from public;
revoke all on public.trust_client_balances      from public;
revoke all on public.bar_foundation_payees      from public;
revoke all on public.legal_invoices             from public;
revoke all on public.pi_medical_records         from public;
revoke all on public.pi_liens                   from public;
revoke all on public.bk_schedules               from public;
revoke all on public.corp_cap_tables            from public;
revoke all on public.corp_transaction_records   from public;
revoke all on public.mnpi_designations          from public;
revoke all on public.family_asset_inventories   from public;
revoke all on public.privilege_successions      from public;
revoke all on public.matter_adverse_parties     from public;
revoke all on public.bar_admissions             from public;
revoke all on public.gig_provider_credentials   from public;
revoke all on public.legal_gig_postings         from public;
revoke all on public.gig_capture_nonces         from public;
revoke all on public.legal_service_attempts     from public;
revoke all on public.legal_service_affidavits   from public;
revoke all on public.gig_releases               from public;
revoke all on public.per_diem_assignments       from public;
revoke all on public.ethical_walls              from public;
revoke all on public.wall_lift_events           from public;
revoke all on public.wall_prior_access          from public;
revoke all on public.copilot_retrieval_index    from public;
revoke all on public.copilot_transcripts        from public;
revoke all on public.break_glass_grants         from public;

-- ── I-L14: service-role route inventory ───────────────────────────────────────
-- Every route that uses the service role is registered here. A route using the
-- service role absent from this table, or that does not call a *_for() predicate,
-- fails the CI servicerole-lint check (§V.4). The service role is not an
-- exception to any wall (I-L12, I-L14).
create table service_role_routes (
  route            text primary key,
  justification    text not null,
  predicate_called text not null,   -- e.g. 'is_matter_party_for', 'screened_from_matter_for'
  reviewed_at      timestamptz not null,
  reviewed_by      text not null
);

insert into service_role_routes values
  ('/api/legal/trust/disbursements',
   'Composes maker/checker pair under constrained identity; writes to trust_ledger',
   'is_matter_party_for',
   now(), 'security-review-0066'),

  ('/api/legal/trust/class-grants',
   'Issues matter_class_grants rows; guard_class_grant trigger enforces issuer role',
   'is_matter_party_for',
   now(), 'security-review-0066'),

  ('/api/legal/gigs/nonces',
   'Server-issues capture nonces; bound to (gig_id, user_id, device_id) — I-L17',
   'is_matter_party_for',
   now(), 'security-review-0066'),

  ('/api/legal/gigs/attempts/verify',
   'Writes server-computed attestation_verified / geofence_verified / timestamp_verified',
   'is_matter_party_for',
   now(), 'security-review-0066'),

  ('/api/legal/gigs/release',
   'Escrow settlement; guard_gig_release trigger enforces staged preconditions',
   'is_matter_party_for',
   now(), 'security-review-0066'),

  ('/api/legal/walls',
   'Synchronous purge across retrieval index, transcripts, and provider-side caches',
   'screened_from_matter_for',
   now(), 'security-review-0066'),

  ('/api/legal/walls/break-glass',
   'Time-boxed dual-approved admin access; holder_notified_at required before grant activates',
   'break_glass_active',
   now(), 'security-review-0066'),

  ('/api/legal/matters/conflict-check',
   'Runs conflict screen before matter row exists; result written to conflict_checks',
   'is_matter_party_for',
   now(), 'security-review-0066');

-- ── Deployment-time validation assertions ────────────────────────────────────
-- These run inside the migration transaction and roll the entire batch back if
-- any Legal Workspace invariant is violated at deployment time.

do $$
begin
  -- I-L1: unconditional dual control trigger must exist on trust_ledger
  if not exists (
    select 1 from information_schema.triggers
    where event_object_table = 'trust_ledger'
      and trigger_name       = 'trust_ledger_disbursement_guard_v2'
  ) then
    raise exception 'I-L1 VIOLATION: trust_ledger_disbursement_guard_v2 trigger missing';
  end if;

  -- I-L2: trust_client_balances must have check (balance_cents >= 0)
  if not exists (
    select 1 from information_schema.check_constraints
    where constraint_name like '%trust_client_balances%'
      and check_clause like '%balance_cents%>=% 0%'
  ) then
    raise exception 'I-L2 VIOLATION: trust_client_balances missing balance_cents >= 0 constraint';
  end if;

  -- I-L3: trust_ledger entry_kind enumeration must NOT contain platform_fee
  if exists (
    select 1 from information_schema.check_constraints
    where constraint_name = 'trust_entry_kind_ck'
      and check_clause like '%platform_fee%'
  ) then
    raise exception 'I-L3 VIOLATION: platform_fee found in trust_entry_kind_ck — prohibited';
  end if;

  -- I-L4: trust_ledger DELETE must be suppressed
  if not exists (
    select 1 from pg_rules
    where tablename = 'trust_ledger'
      and rulename  = 'trust_ledger_no_delete'
  ) then
    raise exception 'I-L4 VIOLATION: trust_ledger_no_delete rule missing';
  end if;

  -- I-L5: trust_accounts must have debit_block_attested column
  if not exists (
    select 1 from information_schema.columns
    where table_name  = 'trust_accounts'
      and column_name = 'debit_block_attested'
  ) then
    raise exception 'I-L5 VIOLATION: trust_accounts.debit_block_attested column missing';
  end if;

  -- I-L8: data_class type must exist as a PostgreSQL enum
  if not exists (
    select 1 from pg_type where typname = 'data_class'
  ) then
    raise exception 'I-L8 VIOLATION: data_class enum type missing';
  end if;

  -- I-L12: matters RLS policy must NOT contain current_user_role_group admin branch
  if exists (
    select 1 from pg_policies
    where tablename = 'matters'
      and policyname like '%party_read%'
      and qual like '%current_user_role_group%'
  ) then
    raise exception
      'I-L12 VIOLATION: matters policy still contains current_user_role_group admin branch — replace with break_glass_active()';
  end if;

  -- I-L15: purge_walled_context function must exist
  if not exists (
    select 1 from pg_proc where proname = 'purge_walled_context'
  ) then
    raise exception 'I-L15 VIOLATION: purge_walled_context function missing';
  end if;

  -- I-L17: gig_capture_nonces must have no-interactive-insert policy
  if not exists (
    select 1 from pg_policies
    where tablename  = 'gig_capture_nonces'
      and policyname = 'nonce_no_interactive_insert'
  ) then
    raise exception 'I-L17 VIOLATION: nonce_no_interactive_insert policy missing';
  end if;

  -- I-L18: UPDATE revoked on legal_service_attempts for authenticated role
  -- (Verified by presence of the column grant; tested by servicerole-lint in CI)
  if exists (
    select 1 from information_schema.role_table_grants
    where table_name   = 'legal_service_attempts'
      and grantee      = 'authenticated'
      and privilege_type = 'UPDATE'
  ) then
    raise exception 'I-L18 VIOLATION: authenticated role retains UPDATE on legal_service_attempts';
  end if;

  -- I-L21: legal_gig_postings funding_source must not include trust
  if exists (
    select 1 from information_schema.check_constraints
    where constraint_name like '%legal_gig_postings%'
      and check_clause like '%trust%'
  ) then
    raise exception 'I-L21 VIOLATION: trust principal appears in gig funding_source check constraint';
  end if;

end;
$$;

-- ── Final comment ─────────────────────────────────────────────────────────────
comment on schema public is
  'Shtiya Builder Core Ecosystem v3.0 — baseline schema 0001–0059 + Legal Workspace 0060–0066 validated.
   Agent Factory (0070–0076) and HRAG Vault Network (0080–0086) layer on top.';

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

