-- =============================================================================
-- 0009_role_grants.sql
-- Shtiya Builder — Base table privilege grants for anon/authenticated/service_role
--
-- 0002_rls_policies.sql and 0007_write_policies.sql define RLS policies that
-- *restrict* which rows a query returns/affects, but Postgres checks the
-- coarser object-level GRANT privileges first — before RLS is ever
-- consulted. This project's default ACL for role `postgres` in schema
-- `public` (set up by the Supabase local/hosted template) only grants
-- TRUNCATE/REFERENCES/TRIGGER/MAINTAIN to anon/authenticated/service_role,
-- deliberately omitting SELECT/INSERT/UPDATE/DELETE so each project must
-- grant those explicitly per table. No prior migration ever did, so every
-- request from the anon-key or service-role Supabase client — regardless of
-- how permissive its RLS policy is — fails at the privilege check.
-- =============================================================================

grant usage on schema public to anon, authenticated, service_role;

-- service_role already carries BYPASSRLS, but still needs the base object
-- grant to be allowed to touch these tables at all.
grant select, insert, update, delete on
  users, properties, block_committees, block_committee_members,
  agreements, financial_ledgers, documents, violations,
  vision_inspections, deal_room_events, compliance_checks
to authenticated, service_role;

-- anon is intentionally narrower: only the two flows that run without a
-- session need it.
--   * POST /api/leads (public lead intake) inserts a `documents` row with
--     uploaded_by = null, type = 'lead' — gated by the
--     documents_insert_public_lead policy (0007).
--   * match_properties() (T4.14 "fix verification" test / semantic search)
--     is a plain `language sql` function (not SECURITY DEFINER), so it
--     runs as the caller — anon needs SELECT on `properties` for the RLS
--     policy (0002 properties_owner_access) to have rows to filter down to
--     zero, rather than failing on the grant check before RLS even runs.
--
-- `agreements` is required too, even though anon never queries it
-- directly: RLS policies nest. documents_scoped_access (0002) subqueries
-- `properties` to check ownership, which re-enters properties'_own_ RLS
-- policy (properties_owner_access) — and that policy's third branch
-- subqueries `agreements`. Postgres checks the base object grant for every
-- relation touched by this expansion, not just the one in the original
-- query, so anon needs SELECT on `agreements` purely to satisfy that
-- nested policy evaluation.
grant select, insert on documents to anon;
grant select on properties to anon;
grant select on agreements to anon;

grant usage, select on all sequences in schema public to authenticated, service_role;
