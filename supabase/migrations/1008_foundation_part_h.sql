-- =============================================================================
-- 1008_foundation_part_h.sql
-- Shtiya Builder v3.0 — Migration 0001 Part H:
-- Deals and deal memberships.
--
-- Builds on 1001 (users, properties, assert_not_billing_actor) and
-- 1002 (current_app_user_id, current_user_role_group, has_property_capacity).
--
-- deal_memberships is the last authorization table in the foundation set
-- (I-2) and carries its billing-guard trigger in this same migration, as
-- privilege-lint requires.
--
-- Wall scope: neither table here is matter-scoped. `deals` reaches only
-- properties (which has no matter_id) and `deal_memberships` reaches only
-- deals, so there is no FK chain to `matters` and no wall term is required
-- in either policy. Should a matter_id ever be added to `deals`, both
-- policies must gain the wall check — wall-lint would catch `deals` itself
-- but NOT `deal_memberships`, whose wall-relevance would be inherited.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- Section 1 — deals
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS deals (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties(id),
  deal_type   text NOT NULL
                CHECK (deal_type IN (
                  'acquisition','disposition','refinance',
                  'jv_formation','assemblage','ground_lease'
                )),
  status      text NOT NULL DEFAULT 'prospecting'
                CHECK (status IN (
                  'prospecting','loi','under_contract',
                  'due_diligence','closing','closed','dead'
                )),
  created_by  uuid NOT NULL REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  closed_at   timestamptz
);


-- ---------------------------------------------------------------------------
-- Section 2 — deal_memberships (authorization table) + billing guard
--
-- Plain CREATE TRIGGER (never CREATE OR REPLACE TRIGGER) — privilege-lint
-- matches `create\s+trigger\s+trg_\w*_billing_guard`.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS deal_memberships (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id    uuid NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  member_role text NOT NULL
                CHECK (member_role IN (
                  'lead_buyer','co_buyer','seller_rep','buyer_rep',
                  'lender','title_agent','legal_counsel',
                  'wholesaler','jv_partner','observer'
                )),
  joined_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (deal_id, user_id, member_role)
);

-- I-2: billing actors must not appear in authorization tables
DROP TRIGGER IF EXISTS trg_dm_billing_guard ON deal_memberships;
CREATE TRIGGER trg_dm_billing_guard  -- I-2
  BEFORE INSERT OR UPDATE ON deal_memberships
  FOR EACH ROW EXECUTE FUNCTION assert_not_billing_actor();

REVOKE ALL ON deal_memberships FROM public;


-- ---------------------------------------------------------------------------
-- Section 3 — is_deal_member()
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION is_deal_member(p_deal_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.deal_memberships
    WHERE deal_id = p_deal_id
      AND user_id = public.current_app_user_id()
  );
$$;


-- ---------------------------------------------------------------------------
-- Section 4 — Enable row level security
-- ---------------------------------------------------------------------------

ALTER TABLE deals            ENABLE ROW LEVEL SECURITY;
ALTER TABLE deal_memberships ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- Section 5 — RLS policies
--
-- Postgres has no CREATE POLICY IF NOT EXISTS (through 17), so each policy is
-- preceded by DROP POLICY IF EXISTS to keep the migration re-runnable.
-- ---------------------------------------------------------------------------

-- deals: members of the deal may read it
DROP POLICY IF EXISTS "deals_member_read" ON deals;
CREATE POLICY "deals_member_read" ON deals FOR SELECT
  USING (
    is_deal_member(id)
    OR has_property_capacity(property_id, 'owner_occupant')
    OR has_property_capacity(property_id, 'owner_investor')
    OR has_property_capacity(property_id, 'owner_distressed')
    OR current_user_role_group() = 'admin'
  );

-- deal_memberships: deal members see the membership list
DROP POLICY IF EXISTS "deal_memberships_member_read" ON deal_memberships;
CREATE POLICY "deal_memberships_member_read" ON deal_memberships FOR SELECT
  USING (
    is_deal_member(deal_id)
    OR current_user_role_group() = 'admin'
  );
