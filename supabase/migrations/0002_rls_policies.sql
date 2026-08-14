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
-- USERS: self-read/update; admin full access
-- ---------------------------------------------------------------------------
create policy "users_self_select" on users for select
  using (
    auth.uid() = id
    or exists (
      select 1 from users u where u.id = auth.uid() and u.role = 'admin'
    )
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
    or exists (select 1 from users u where u.id = auth.uid() and u.role = 'admin')
    or exists (
      select 1 from agreements a
      where a.property_id = properties.id
        and a.parties @> jsonb_build_array(jsonb_build_object('user_id', auth.uid()::text))
    )
  );

create policy "properties_owner_write" on properties for update
  using (owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- BLOCK COMMITTEES: visible to invited members + admin
-- ---------------------------------------------------------------------------
create policy "block_committees_member_access" on block_committees for select
  using (
    exists (
      select 1 from block_committee_members m
      where m.block_committee_id = block_committees.id
        and m.user_id = auth.uid()
    )
    or exists (select 1 from users u where u.id = auth.uid() and u.role = 'admin')
  );

-- ---------------------------------------------------------------------------
-- BLOCK COMMITTEE MEMBERS: member sees own rows; admin sees all
-- ---------------------------------------------------------------------------
create policy "block_committee_members_self" on block_committee_members for select
  using (
    user_id = auth.uid()
    or exists (select 1 from users u where u.id = auth.uid() and u.role = 'admin')
  );

-- ---------------------------------------------------------------------------
-- AGREEMENTS: visible only to listed parties, attorneys, and admin
-- ---------------------------------------------------------------------------
create policy "agreements_party_access" on agreements for select
  using (
    parties @> jsonb_build_array(jsonb_build_object('user_id', auth.uid()::text))
    or exists (
      select 1 from users u
      where u.id = auth.uid() and u.role in ('attorney', 'admin')
    )
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
    or exists (
      select 1 from users u
      where u.id = auth.uid() and u.role in ('lender', 'admin')
    )
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
    or exists (select 1 from users u where u.id = auth.uid() and u.role = 'admin')
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
    or exists (
      select 1 from users u
      where u.id = auth.uid() and u.role in ('investor', 'admin')
    )
  );

-- ---------------------------------------------------------------------------
-- VISION INSPECTIONS (Vision): contractor who submitted, property owner, admin
-- ---------------------------------------------------------------------------
create policy "vision_inspections_scoped" on vision_inspections for select
  using (
    contractor_id = auth.uid()
    or exists (
      select 1 from properties p
      where p.id = vision_inspections.property_id and p.owner_id = auth.uid()
    )
    or exists (select 1 from users u where u.id = auth.uid() and u.role = 'admin')
  );

-- ---------------------------------------------------------------------------
-- DEAL ROOM EVENTS (Pulse): committee members and admin
-- ---------------------------------------------------------------------------
create policy "deal_room_events_member_access" on deal_room_events for select
  using (
    exists (
      select 1 from block_committee_members m
      where m.block_committee_id = deal_room_events.block_committee_id
        and m.user_id = auth.uid()
    )
    or exists (select 1 from users u where u.id = auth.uid() and u.role = 'admin')
  );

-- ---------------------------------------------------------------------------
-- COMPLIANCE CHECKS (Sentinel): contractor sees own record; admin sees all
-- ---------------------------------------------------------------------------
create policy "compliance_checks_scoped" on compliance_checks for select
  using (
    contractor_id = auth.uid()
    or exists (select 1 from users u where u.id = auth.uid() and u.role = 'admin')
  );
