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
