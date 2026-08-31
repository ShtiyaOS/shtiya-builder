-- =============================================================================
-- 1002_foundation_part_b.sql
-- Shtiya Builder v3.0 — Migration 0001 Part B:
-- Auth helper functions, row-level security, and the discovery feed.
--
-- Builds on 1001_foundation_part_a.sql. No table DDL here — Part A owns all
-- of it. `assert_not_billing_actor()` / `trg_prb_billing_guard` are Part A's
-- and are not redefined.
--
-- Identity model: Part A's `users.id` is an independent surrogate key
-- (gen_random_uuid()); the Supabase auth principal lives in
-- `users.auth_user_id`. auth.uid() therefore matches `auth_user_id`, never
-- `id`, and every FK in Part A (`property_role_bindings.user_id`,
-- `disclosures.disclosed_by`, ...) points at `users.id`. All identity
-- resolution goes through current_app_user_id() below.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- Section 0 — current_app_user_id() — auth principal → application user id
--
-- SECURITY DEFINER is required, not stylistic: Section 3 enables RLS on
-- `users` and Section 4 defines no policy for it, so an inline
-- `SELECT id FROM users WHERE auth_user_id = auth.uid()` inside a policy
-- would be evaluated as the invoker and return zero rows. Mirrors the
-- existing house pattern in 0002_rls_policies.sql's current_user_role().
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION current_app_user_id()
RETURNS uuid LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = ''
AS $$
  SELECT id FROM public.users WHERE auth_user_id = auth.uid();
$$;


-- ---------------------------------------------------------------------------
-- Section 1 — current_user_role_group() — nav routing helper
-- ---------------------------------------------------------------------------

-- I-A7: nav routing ONLY — never used as a row-access predicate
-- Returns a coarse group name for UI nav routing. Must never gate data rows.
CREATE OR REPLACE FUNCTION current_user_role_group()
RETURNS text LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = ''
AS $$
  SELECT CASE (SELECT platform_role FROM public.users WHERE auth_user_id = auth.uid())
    WHEN 'owner_occupant'           THEN 'owner'
    WHEN 'owner_investor'           THEN 'owner'
    WHEN 'owner_distressed'         THEN 'owner'
    WHEN 'tenant_market'            THEN 'tenant'
    WHEN 'tenant_section8'          THEN 'tenant'
    WHEN 'tenant_commercial'        THEN 'tenant'
    WHEN 'lender_mortgage'          THEN 'lender'
    WHEN 'lender_bridge'            THEN 'lender'
    WHEN 'lender_mezzanine'         THEN 'lender'
    WHEN 'contractor_gc'            THEN 'contractor'
    WHEN 'contractor_sub'           THEN 'contractor'
    WHEN 'contractor_owner_builder' THEN 'contractor'
    WHEN 'architect_licensed'       THEN 'architect'
    WHEN 'architect_intern'         THEN 'architect'
    WHEN 'architect_owner_designer' THEN 'architect'
    WHEN 'property_manager'         THEN 'property_manager'
    WHEN 'asset_manager'            THEN 'property_manager'
    WHEN 'facility_manager'         THEN 'property_manager'
    WHEN 'attorney_re'              THEN 'attorney'
    WHEN 'attorney_liti'            THEN 'attorney'
    WHEN 'attorney_corp'            THEN 'attorney'
    WHEN 'broker_buyers'            THEN 'broker'
    WHEN 'broker_sellers'           THEN 'broker'
    WHEN 'broker_dual'              THEN 'broker'
    WHEN 'per_diem'                 THEN 'billing'
    WHEN 'process_server'           THEN 'billing'
    WHEN 'gig_worker'               THEN 'gig'
    ELSE 'unknown'
  END;
$$;


-- ---------------------------------------------------------------------------
-- Section 2 — has_property_capacity()
--
-- Part A's property_role_bindings is (id, property_id, user_id, capacity,
-- granted_at) — it has no `status` column, so no status predicate is applied.
-- A row's existence IS the grant; revocation is a DELETE.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION has_property_capacity(
  p_property_id uuid,
  p_capacity    text
) RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.property_role_bindings
    WHERE user_id     = public.current_app_user_id()
      AND property_id = p_property_id
      AND capacity    = p_capacity
  );
$$;


-- ---------------------------------------------------------------------------
-- Section 3 — Enable row level security
-- ---------------------------------------------------------------------------

ALTER TABLE users                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE properties             ENABLE ROW LEVEL SECURITY;
ALTER TABLE entitlements           ENABLE ROW LEVEL SECURITY;
ALTER TABLE agreements             ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents              ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_ledgers      ENABLE ROW LEVEL SECURITY;
ALTER TABLE escrow_intents         ENABLE ROW LEVEL SECURITY;
ALTER TABLE disclosures            ENABLE ROW LEVEL SECURITY;
ALTER TABLE property_role_bindings ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- Section 4 — RLS policies
--
-- Postgres has no CREATE POLICY IF NOT EXISTS (through 17), so each policy is
-- preceded by DROP POLICY IF EXISTS to keep the migration re-runnable.
-- ---------------------------------------------------------------------------

-- properties: owner reads own; admin reads all
DROP POLICY IF EXISTS "properties_owner_read" ON properties;
CREATE POLICY "properties_owner_read" ON properties FOR SELECT
  USING (
    has_property_capacity(id, 'owner_occupant')
    OR has_property_capacity(id, 'owner_investor')
    OR has_property_capacity(id, 'owner_distressed')
    OR current_user_role_group() = 'admin'
  );

-- property_role_bindings: user sees own rows + admin
DROP POLICY IF EXISTS "prb_self_read" ON property_role_bindings;
CREATE POLICY "prb_self_read" ON property_role_bindings FOR SELECT
  USING (user_id = current_app_user_id() OR current_user_role_group() = 'admin');

-- entitlements: user sees own
DROP POLICY IF EXISTS "entitlements_self_read" ON entitlements;
CREATE POLICY "entitlements_self_read" ON entitlements FOR SELECT
  USING (user_id = current_app_user_id() OR current_user_role_group() = 'admin');

-- financial_ledgers: party membership.
-- Part A has no `party_ids uuid[]`; the ledger is scoped by `property_id`, so
-- membership is the same ownership-capacity test used by properties above.
-- Checked directly against financial_ledgers.property_id rather than via a
-- subquery over `properties`, which would itself be filtered by properties' RLS.
DROP POLICY IF EXISTS "ledgers_party_read" ON financial_ledgers;
CREATE POLICY "ledgers_party_read" ON financial_ledgers FOR SELECT
  USING (
    has_property_capacity(property_id, 'owner_occupant')
    OR has_property_capacity(property_id, 'owner_investor')
    OR has_property_capacity(property_id, 'owner_distressed')
    OR current_user_role_group() = 'admin'
  );

-- disclosures: self-read.
-- Part A names the discloser column `disclosed_by`, not `user_id`.
DROP POLICY IF EXISTS "disclosures_self_read" ON disclosures;
CREATE POLICY "disclosures_self_read" ON disclosures FOR SELECT
  USING (disclosed_by = current_app_user_id() OR current_user_role_group() = 'admin');


-- ---------------------------------------------------------------------------
-- Section 5 — discovery_feed materialized view
-- ---------------------------------------------------------------------------

-- k-anonymity enforced in API layer: < 5 parcels → 0 rows returned
-- Refresh scheduled via pg_cron (every hour) — cron job added in 1055_platform_infra.sql
-- Part A's properties table has no `exposure_policy` column, so the simple
-- `status = 'active'` filter is used.
CREATE MATERIALIZED VIEW IF NOT EXISTS discovery_feed AS
  SELECT
    id,
    borough,
    NULL::text AS zoning_class,
    NULL::text AS avm_band
  FROM properties
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS discovery_feed_borough_idx ON discovery_feed(borough);
