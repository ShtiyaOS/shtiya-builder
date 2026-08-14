-- =============================================================================
-- 0002_rls_policies.sql
-- Shtiya Builder — Row-Level Security Policies
-- Covers: RLS enable + all policies for all 11 tables (Plan.md §2.3)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Enable RLS on all 11 tables
-- ---------------------------------------------------------------------------
alter table users                  enable row level security;
alter table properties             enable row level security;
alter table block_committees       enable row level security;
alter table block_committee_members enable row level security;
alter table agreements             enable row level security;
alter table financial_ledgers      enable row level security;
alter table documents              enable row level security;
alter table violations             enable row level security;
alter table vision_inspections     enable row level security;
alter table deal_room_events       enable row level security;
alter table compliance_checks      enable row level security;

-- ---------------------------------------------------------------------------
-- Role-lookup helper (fixes "infinite recursion detected in policy for
-- relation users").
--
-- Every policy below needs to know the caller's role, and the obvious way
-- to ask ("exists (select 1 from users u where u.id = auth.uid() and
-- u.role = 'admin')") re-enters `users_self_select` for that inner SELECT,
-- which itself contains the same subquery — Postgres detects the cycle and
-- raises 42P17 before returning a single row, on every table, not just
-- `users` (any policy that queries `users` to check a role trips it).
--
-- SECURITY DEFINER makes this function run as its owner (the migration
-- role, which owns `users`) rather than the calling user, and table owners
-- bypass RLS on their own tables by default — so the SELECT inside this
-- function never re-triggers `users_self_select`, breaking the cycle.
-- ---------------------------------------------------------------------------
create or replace function public.current_user_role()
returns user_role
language sql
security definer
stable
set search_path = public
as $$
  select role from users where id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- block_committees <-> block_committee_members visibility helpers.
--
-- Same recursion class as current_user_role() above, but cross-table:
-- block_committees_member_access needs to check block_committee_members
-- membership, and block_committee_members_self needs to check
-- block_committees.created_by — each as a plain correlated subquery on the
-- OTHER table. That's enough to cycle: reading block_committees re-enters
-- block_committee_members' policy, which reads block_committees again, ad
-- infinitum (42P17), exactly like the single-table users case, just spread
-- across two tables instead of one. SECURITY DEFINER breaks it the same
-- way — these run as the (RLS-bypassing) owner, not the caller.
-- ---------------------------------------------------------------------------
create or replace function public.is_block_committee_creator(p_committee_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from block_committees c
    where c.id = p_committee_id and c.created_by = auth.uid()
  );
$$;

create or replace function public.is_block_committee_member(p_committee_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from block_committee_members m
    where m.block_committee_id = p_committee_id and m.user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- USERS: self-read/update; admin full access
-- ---------------------------------------------------------------------------
create policy "users_self_select" on users for select
  using (
    auth.uid() = id
    or current_user_role() = 'admin'
  );

create policy "users_self_update" on users for update
  using (auth.uid() = id);

-- ---------------------------------------------------------------------------
-- PROPERTIES: owner sees own; parties to an active agreement can see the
--             property; admin sees all; owner can write own properties.
-- ---------------------------------------------------------------------------
create policy "properties_owner_access" on properties for select
  using (
    owner_id = auth.uid()
    or current_user_role() = 'admin'
    or exists (
      select 1 from agreements a
      where a.property_id = properties.id
        and a.parties @> jsonb_build_array(jsonb_build_object('user_id', auth.uid()::text))
    )
  );

create policy "properties_owner_write" on properties for update
  using (owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- BLOCK COMMITTEES: visible to the creator, invited members, and admin
--
-- created_by = auth.uid() is required here, not just membership — without
-- it, a committee's own creator can't see the row until they're already a
-- member, which breaks self-enrollment: block_committee_members_insert
-- (0007) grants INSERT to "the committee's creator" via
-- `exists (select 1 from block_committees c where ... c.created_by =
-- auth.uid())`, but that subquery is itself filtered by *this* SELECT
-- policy — a creator invisible here sees zero rows and the INSERT is
-- rejected before the created_by check is even reached.
-- ---------------------------------------------------------------------------
create policy "block_committees_member_access" on block_committees for select
  using (
    created_by = auth.uid()
    or is_block_committee_member(id)
    or current_user_role() = 'admin'
  );

-- ---------------------------------------------------------------------------
-- BLOCK COMMITTEE MEMBERS: own rows, the committee's creator, fellow
-- members, and admin.
--
-- Narrowing this to "own rows only" breaks POST /api/block-committees'
-- invite flow: block_committee_members_insert (0007) lets a committee's
-- creator (or an existing member) invite anyone, but PostgREST's
-- `.insert().select()` also requires this SELECT policy to pass for the
-- RETURNING row — and the invited user_id is someone else's, not the
-- inviter's. Without the creator/member branches here, that RETURNING read
-- is denied and Postgres reports it as the same "new row violates RLS"
-- error as a WITH CHECK failure, even though the insert itself was
-- authorized. Mirrors block_committee_members_insert's visibility scope.
-- ---------------------------------------------------------------------------
create policy "block_committee_members_self" on block_committee_members for select
  using (
    user_id = auth.uid()
    or is_block_committee_creator(block_committee_id)
    or is_block_committee_member(block_committee_id)
    or current_user_role() = 'admin'
  );

-- ---------------------------------------------------------------------------
-- AGREEMENTS: visible only to listed parties, attorneys, and admin
-- ---------------------------------------------------------------------------
create policy "agreements_party_access" on agreements for select
  using (
    parties @> jsonb_build_array(jsonb_build_object('user_id', auth.uid()::text))
    or current_user_role() in ('attorney', 'admin')
  );

-- ---------------------------------------------------------------------------
-- FINANCIAL LEDGERS: parties to the linked agreement, lenders, and admin
--   T1.4 acceptance: a tenant-role user CANNOT see another tenant's ledger row.
-- ---------------------------------------------------------------------------
create policy "ledgers_party_access" on financial_ledgers for select
  using (
    exists (
      select 1 from agreements a
      where a.id = financial_ledgers.agreement_id
        and a.parties @> jsonb_build_array(jsonb_build_object('user_id', auth.uid()::text))
    )
    or current_user_role() in ('lender', 'admin')
  );

-- ---------------------------------------------------------------------------
-- DOCUMENTS: uploader, property owner, and admin
-- ---------------------------------------------------------------------------
create policy "documents_scoped_access" on documents for select
  using (
    uploaded_by = auth.uid()
    or exists (
      select 1 from properties p
      where p.id = documents.property_id and p.owner_id = auth.uid()
    )
    or current_user_role() = 'admin'
  );

-- ---------------------------------------------------------------------------
-- VIOLATIONS (Watchdog): property owner + investors watching that property + admin
-- ---------------------------------------------------------------------------
create policy "violations_owner_access" on violations for select
  using (
    exists (
      select 1 from properties p
      where p.id = violations.property_id and p.owner_id = auth.uid()
    )
    or current_user_role() in ('investor', 'admin')
  );

-- ---------------------------------------------------------------------------
-- VISION INSPECTIONS (Vision): contractor who submitted, property owner,
-- lender, admin.
--
-- lender is required, not just contractor/owner/admin — POST
-- /api/escrow/release (T3.7) runs its Vision gate check as the calling
-- lender's RLS-scoped client, not a service-role client. Without lender
-- here, that read silently returns zero rows for every lender, the route
-- treats "no inspection found" as "nothing to block", and a critical-
-- severity inspection's blocks_draw = true is never enforced.
-- ---------------------------------------------------------------------------
create policy "vision_inspections_scoped" on vision_inspections for select
  using (
    contractor_id = auth.uid()
    or exists (
      select 1 from properties p
      where p.id = vision_inspections.property_id and p.owner_id = auth.uid()
    )
    or current_user_role() in ('lender', 'admin')
  );

-- ---------------------------------------------------------------------------
-- DEAL ROOM EVENTS (Pulse): committee members and admin
-- ---------------------------------------------------------------------------
create policy "deal_room_events_member_access" on deal_room_events for select
  using (
    (deal_room_events.block_committee_id is not null
      and is_block_committee_member(deal_room_events.block_committee_id))
    or current_user_role() = 'admin'
  );

-- ---------------------------------------------------------------------------
-- COMPLIANCE CHECKS (Sentinel): contractor sees own record; admin sees all
-- ---------------------------------------------------------------------------
create policy "compliance_checks_scoped" on compliance_checks for select
  using (
    contractor_id = auth.uid()
    or current_user_role() = 'admin'
  );
