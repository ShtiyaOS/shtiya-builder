-- =============================================================================
-- 0007_write_policies.sql
-- Shtiya Builder — Write (INSERT/UPDATE) RLS Policies
--
-- 0002_rls_policies.sql enabled RLS on all 11 tables but only defined SELECT
-- policies, plus two UPDATE policies (users_self_update, properties_owner_write).
-- Postgres RLS defaults to deny for any command with no matching policy, so
-- every other INSERT/UPDATE performed by the app's API routes (which all use
-- the anon-key, cookie-scoped client from src/lib/supabase/server.ts — never
-- a service-role client) currently affects zero rows under real RLS
-- enforcement, even though the route handlers themselves report success.
--
-- This migration adds the missing policies, mirroring the authorization each
-- route already enforces in application code. Added by T4.16 — End-to-End
-- Deal Lifecycle Integration Test — as a prerequisite for the app to actually
-- function against a real (RLS-enforced) Supabase project.
--
-- Divergences from app code (deliberately resolved toward the stricter/safer
-- option — the app performs no additional checks here, so RLS is the only
-- enforcement layer):
--   * block_committee_members INSERT — POST /api/block-committees only
--     requires "authenticated", no ownership/membership check. This policy
--     restricts inviting to the committee's creator, an existing member, or
--     an admin.
--   * block_committee_members UPDATE (sign) — PATCH /api/block-committees
--     filters only by block_committee_id + property_id, not user_id. This
--     policy is what actually prevents user A from signing on user B's
--     behalf.
--   * financial_ledgers UPDATE — mirrors the explicit lender/admin role gate
--     already enforced in POST /api/draws/approve. POST /api/escrow/release
--     has no equivalent app-level role check; this policy closes that gap
--     at the DB layer.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- BLOCK_COMMITTEES: UPDATE only. Flips status -> 'locked' from
-- PATCH /api/block-committees once target_member_count is reached.
-- No app route creates block_committees rows (grep-confirmed across
-- src/app/api) — no INSERT policy; rows are seeded directly via a
-- service-role client (ops tooling / test fixtures).
-- ---------------------------------------------------------------------------
create policy "block_committees_member_update" on block_committees for update
  using (
    created_by = auth.uid()
    or exists (
      select 1 from block_committee_members m
      where m.block_committee_id = block_committees.id and m.user_id = auth.uid()
    )
    or exists (select 1 from users u where u.id = auth.uid() and u.role = 'admin')
  )
  with check (
    created_by = auth.uid()
    or exists (
      select 1 from block_committee_members m
      where m.block_committee_id = block_committees.id and m.user_id = auth.uid()
    )
    or exists (select 1 from users u where u.id = auth.uid() and u.role = 'admin')
  );

-- ---------------------------------------------------------------------------
-- BLOCK_COMMITTEE_MEMBERS
--   INSERT (invite, POST /api/block-committees) — restricted to the
--   committee's creator, an existing member, or admin.
--   UPDATE (sign, PATCH /api/block-committees) — restricted to the row's own
--   user_id (or admin), since the route itself doesn't check this.
-- ---------------------------------------------------------------------------
create policy "block_committee_members_insert" on block_committee_members for insert
  with check (
    exists (
      select 1 from block_committees c
      where c.id = block_committee_members.block_committee_id and c.created_by = auth.uid()
    )
    or exists (
      select 1 from block_committee_members m
      where m.block_committee_id = block_committee_members.block_committee_id
        and m.user_id = auth.uid()
    )
    or exists (select 1 from users u where u.id = auth.uid() and u.role = 'admin')
  );

create policy "block_committee_members_self_sign" on block_committee_members for update
  using (
    user_id = auth.uid()
    or exists (select 1 from users u where u.id = auth.uid() and u.role = 'admin')
  )
  with check (
    user_id = auth.uid()
    or exists (select 1 from users u where u.id = auth.uid() and u.role = 'admin')
  );

-- ---------------------------------------------------------------------------
-- AGREEMENTS
--   INSERT: POST /api/agreements always seeds the calling user as parties[0]
--   ("Seed the initiating user as the first party"), so "caller is a listed
--   party of the row being inserted" is an exact, zero-cost mirror.
--   UPDATE: PATCH /api/agreements already 403s in app code if the caller
--   isn't a listed party — this mirrors that, plus the SELECT policy's
--   attorney/admin carve-out. Also covers the same route's document_id
--   linkage .update() (step 3), since the caller is always party 0 by then.
-- ---------------------------------------------------------------------------
create policy "agreements_party_insert" on agreements for insert
  with check (
    parties @> jsonb_build_array(jsonb_build_object('user_id', auth.uid()::text))
    or exists (select 1 from users u where u.id = auth.uid() and u.role in ('attorney', 'admin'))
  );

create policy "agreements_party_update" on agreements for update
  using (
    parties @> jsonb_build_array(jsonb_build_object('user_id', auth.uid()::text))
    or exists (select 1 from users u where u.id = auth.uid() and u.role in ('attorney', 'admin'))
  )
  with check (
    parties @> jsonb_build_array(jsonb_build_object('user_id', auth.uid()::text))
    or exists (select 1 from users u where u.id = auth.uid() and u.role in ('attorney', 'admin'))
  );

-- ---------------------------------------------------------------------------
-- FINANCIAL_LEDGERS: UPDATE only. No route inserts ledger rows (grep-
-- confirmed) — funding ledgers are seeded directly via a service-role
-- client. Mirrors the explicit role gate in POST /api/draws/approve
-- ('lender'/'admin' only); also applies to POST /api/escrow/release, which
-- has no equivalent app-level check today.
-- ---------------------------------------------------------------------------
create policy "financial_ledgers_lender_update" on financial_ledgers for update
  using (exists (select 1 from users u where u.id = auth.uid() and u.role in ('lender', 'admin')))
  with check (exists (select 1 from users u where u.id = auth.uid() and u.role in ('lender', 'admin')));

-- ---------------------------------------------------------------------------
-- DOCUMENTS: INSERT
--   documents_insert_own — milestone-upload, maintenance tickets/scope
--   drafts, the agreements PSA placeholder doc, cad-upload, and the generic
--   /api/documents route all set uploaded_by = auth.uid().
--   documents_insert_public_lead — POST /api/leads is intentionally public
--   (no auth), always sets uploaded_by = null, type = 'lead'. auth.uid() is
--   NULL for anonymous callers, so uploaded_by = auth.uid() can never match
--   — a narrow, dedicated policy is required instead of a blanket
--   with check (true).
-- ---------------------------------------------------------------------------
create policy "documents_insert_own" on documents for insert
  with check (uploaded_by = auth.uid());

create policy "documents_insert_public_lead" on documents for insert
  with check (uploaded_by is null and type = 'lead');

-- ---------------------------------------------------------------------------
-- VISION_INSPECTIONS: INSERT — only ever written by milestone-upload,
-- always contractor_id = auth.uid() (the authenticated uploader).
-- ---------------------------------------------------------------------------
create policy "vision_inspections_insert_own" on vision_inspections for insert
  with check (contractor_id = auth.uid());

-- ---------------------------------------------------------------------------
-- DEAL_ROOM_EVENTS: INSERT — split by which FK is populated, mirroring the
-- two call sites: PATCH /api/block-committees (block_committee_id, any
-- committee member) and POST /api/draws/approve (financial_ledger_id,
-- lender/admin only, per that route's own role gate).
-- ---------------------------------------------------------------------------
create policy "deal_room_events_insert_committee" on deal_room_events for insert
  with check (
    block_committee_id is not null
    and (
      exists (
        select 1 from block_committee_members m
        where m.block_committee_id = deal_room_events.block_committee_id and m.user_id = auth.uid()
      )
      or exists (select 1 from users u where u.id = auth.uid() and u.role = 'admin')
    )
  );

create policy "deal_room_events_insert_ledger" on deal_room_events for insert
  with check (
    financial_ledger_id is not null
    and exists (select 1 from users u where u.id = auth.uid() and u.role in ('lender', 'admin'))
  );
