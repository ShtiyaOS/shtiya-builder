-- =============================================================================
-- 1007_foundation_part_g.sql
-- Shtiya Builder v3.0 — Migration 0001 Part G:
-- Property management engagements, tenancies and their trusts, brokerages,
-- and the cross-workspace helper functions.
--
-- Builds on 1001 (users, properties), 1002 (current_app_user_id,
-- current_user_role_group, has_property_capacity), 1003 (institutions,
-- institution_members, firms, firm_members), 1005 (trust_accounts),
-- 1006 (companies, crew_members).
--
-- broker_seats is an authorization table (I-2) and carries its billing-guard
-- trigger in this same migration, as privilege-lint requires.
--
-- Two deliberate absences are load-bearing and must not be "fixed" later:
--   I-25  screening_reports has no 'denied' outcome — automated denial is
--         prohibited; adverse action requires human review.
--   I-31  agency_representations has no commission_rate — no benchmark rate,
--         no platform-suggested rate, no cross-brokerage aggregation.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- Section 1 — management_engagements
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS management_engagements (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id    uuid NOT NULL REFERENCES properties(id),
  manager_id     uuid NOT NULL REFERENCES users(id),
  engagement_type text NOT NULL DEFAULT 'full_service'
                    CHECK (engagement_type IN (
                      'full_service','leasing_only','maintenance_only'
                    )),
  status         text NOT NULL DEFAULT 'active'
                   CHECK (status IN ('active','suspended','terminated')),
  started_at     timestamptz NOT NULL DEFAULT now(),
  ended_at       timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);


-- ---------------------------------------------------------------------------
-- Section 2 — tenancies
-- ---------------------------------------------------------------------------

-- I-22: Access Floor — status column is legal state only;
-- never gates physical access to the unit.
CREATE TABLE IF NOT EXISTS tenancies (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id   uuid NOT NULL REFERENCES properties(id),
  tenant_id     uuid NOT NULL REFERENCES users(id),
  manager_id    uuid REFERENCES users(id),
  unit_ref      text,
  -- I-22: status is a legal state only; physical-access decisions are made by humans
  status        text NOT NULL DEFAULT 'pending'  -- I-22
                  CHECK (status IN (
                    'pending','active','notice_given','holdover','terminated'
                  )),
  lease_start   date,
  lease_end     date,
  rent_cents    bigint CHECK (rent_cents > 0),
  currency      text NOT NULL DEFAULT 'USD',
  created_at    timestamptz NOT NULL DEFAULT now()
);


-- ---------------------------------------------------------------------------
-- Section 3 — rent_trust + deposit_trust
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS rent_trust (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenancy_id   uuid NOT NULL REFERENCES tenancies(id) ON DELETE CASCADE,
  trust_account_id uuid NOT NULL REFERENCES trust_accounts(id),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS deposit_trust (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenancy_id       uuid NOT NULL REFERENCES tenancies(id) ON DELETE CASCADE,
  trust_account_id uuid NOT NULL REFERENCES trust_accounts(id),
  deposit_cents    bigint NOT NULL CHECK (deposit_cents > 0),
  returned_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);


-- ---------------------------------------------------------------------------
-- Section 4 — screening_reports
-- ---------------------------------------------------------------------------

-- I-25: 'denied' status deliberately absent — auto-deny prohibited.
-- Adverse action notices require human review (see adverse_action_notices in 1051).
CREATE TABLE IF NOT EXISTS screening_reports (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenancy_id  uuid NOT NULL REFERENCES tenancies(id) ON DELETE CASCADE,
  screened_by uuid NOT NULL REFERENCES users(id),
  -- I-25: no 'denied' value — automated denial is prohibited
  outcome     text NOT NULL  -- I-25
                CHECK (outcome IN (
                  'approved','approved_with_conditions','further_review_required'
                )),
  report_ref  text,
  screened_at timestamptz NOT NULL DEFAULT now()
);


-- ---------------------------------------------------------------------------
-- Section 5 — brokerages + broker_seats (authorization table) + billing guard
--
-- Plain CREATE TRIGGER (never CREATE OR REPLACE TRIGGER) — privilege-lint
-- matches `create\s+trigger\s+trg_\w*_billing_guard`.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS brokerages (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text NOT NULL,
  license_no     text,
  brokerage_type text NOT NULL
                   CHECK (brokerage_type IN (
                     'residential','commercial','leasing','dual'
                   )),
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS broker_seats (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brokerage_id uuid NOT NULL REFERENCES brokerages(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seat_type    text NOT NULL DEFAULT 'associate'
                 CHECK (seat_type IN (
                   'principal_broker','associate','transaction_coordinator'
                 )),
  licensed_state text NOT NULL,
  active       boolean NOT NULL DEFAULT true,
  joined_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brokerage_id, user_id)
);

-- I-2: billing actors must not appear in authorization tables
DROP TRIGGER IF EXISTS trg_bs_billing_guard ON broker_seats;
CREATE TRIGGER trg_bs_billing_guard  -- I-2
  BEFORE INSERT OR UPDATE ON broker_seats
  FOR EACH ROW EXECUTE FUNCTION assert_not_billing_actor();

REVOKE ALL ON broker_seats FROM public;


-- ---------------------------------------------------------------------------
-- Section 6 — agency_representations
-- ---------------------------------------------------------------------------

-- I-31: commission_rate deliberately absent — no benchmark rate,
-- no platform-suggested rate, no cross-brokerage aggregation.
CREATE TABLE IF NOT EXISTS agency_representations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brokerage_id uuid NOT NULL REFERENCES brokerages(id),
  agent_id     uuid NOT NULL REFERENCES users(id),
  client_id    uuid NOT NULL REFERENCES users(id),
  property_id  uuid REFERENCES properties(id),
  rep_type     text NOT NULL
                 CHECK (rep_type IN (
                   'buyer','seller','landlord','tenant','dual'
                 )),
  -- I-31: no commission_rate column here or anywhere on this platform
  status       text NOT NULL DEFAULT 'active'
                 CHECK (status IN ('active','terminated','completed')),
  started_at   timestamptz NOT NULL DEFAULT now(),
  ended_at     timestamptz
);


-- ---------------------------------------------------------------------------
-- Section 7 — Enable row level security
-- ---------------------------------------------------------------------------

ALTER TABLE management_engagements ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenancies               ENABLE ROW LEVEL SECURITY;
ALTER TABLE rent_trust              ENABLE ROW LEVEL SECURITY;
ALTER TABLE deposit_trust           ENABLE ROW LEVEL SECURITY;
ALTER TABLE screening_reports       ENABLE ROW LEVEL SECURITY;
ALTER TABLE brokerages              ENABLE ROW LEVEL SECURITY;
ALTER TABLE broker_seats            ENABLE ROW LEVEL SECURITY;
ALTER TABLE agency_representations  ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- Section 8 — RLS policies
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "management_engagements_party_read" ON management_engagements;
CREATE POLICY "management_engagements_party_read" ON management_engagements FOR SELECT
  USING (
    manager_id = public.current_app_user_id()
    OR has_property_capacity(property_id, 'owner_occupant')
    OR has_property_capacity(property_id, 'owner_investor')
    OR has_property_capacity(property_id, 'owner_distressed')
    OR current_user_role_group() = 'admin'
  );

DROP POLICY IF EXISTS "tenancies_party_read" ON tenancies;
CREATE POLICY "tenancies_party_read" ON tenancies FOR SELECT
  USING (
    tenant_id  = public.current_app_user_id()
    OR manager_id = public.current_app_user_id()
    OR has_property_capacity(property_id, 'owner_occupant')
    OR has_property_capacity(property_id, 'owner_investor')
    OR has_property_capacity(property_id, 'owner_distressed')
    OR current_user_role_group() = 'admin'
  );

DROP POLICY IF EXISTS "rent_trust_party_read" ON rent_trust;
CREATE POLICY "rent_trust_party_read" ON rent_trust FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.tenancies t
      WHERE t.id = rent_trust.tenancy_id
        AND (
          t.tenant_id  = public.current_app_user_id()
          OR t.manager_id = public.current_app_user_id()
        )
    )
    OR current_user_role_group() = 'admin'
  );

DROP POLICY IF EXISTS "deposit_trust_party_read" ON deposit_trust;
CREATE POLICY "deposit_trust_party_read" ON deposit_trust FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.tenancies t
      WHERE t.id = deposit_trust.tenancy_id
        AND (
          t.tenant_id  = public.current_app_user_id()
          OR t.manager_id = public.current_app_user_id()
        )
    )
    OR current_user_role_group() = 'admin'
  );

DROP POLICY IF EXISTS "screening_reports_party_read" ON screening_reports;
CREATE POLICY "screening_reports_party_read" ON screening_reports FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.tenancies t
      WHERE t.id = screening_reports.tenancy_id
        AND (
          t.tenant_id  = public.current_app_user_id()
          OR t.manager_id = public.current_app_user_id()
        )
    )
    OR screened_by = public.current_app_user_id()
    OR current_user_role_group() = 'admin'
  );

DROP POLICY IF EXISTS "brokerages_seat_read" ON brokerages;
CREATE POLICY "brokerages_seat_read" ON brokerages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.broker_seats
      WHERE brokerage_id = brokerages.id
        AND user_id      = public.current_app_user_id()
        AND active       = true
    )
    OR current_user_role_group() = 'admin'
  );

DROP POLICY IF EXISTS "broker_seats_self_read" ON broker_seats;
CREATE POLICY "broker_seats_self_read" ON broker_seats FOR SELECT
  USING (user_id = public.current_app_user_id() OR current_user_role_group() = 'admin');

DROP POLICY IF EXISTS "agency_representations_party_read" ON agency_representations;
CREATE POLICY "agency_representations_party_read" ON agency_representations FOR SELECT
  USING (
    agent_id  = public.current_app_user_id()
    OR client_id = public.current_app_user_id()
    OR (
      property_id IS NOT NULL
      AND (
        has_property_capacity(property_id, 'owner_occupant')
        OR has_property_capacity(property_id, 'owner_investor')
        OR has_property_capacity(property_id, 'owner_distressed')
      )
    )
    OR current_user_role_group() = 'admin'
  );


-- ---------------------------------------------------------------------------
-- Section 9 — REVOKE
-- ---------------------------------------------------------------------------

REVOKE ALL ON management_engagements FROM public;
REVOKE ALL ON tenancies               FROM public;
REVOKE ALL ON rent_trust              FROM public;
REVOKE ALL ON deposit_trust           FROM public;
REVOKE ALL ON screening_reports       FROM public;
REVOKE ALL ON brokerages              FROM public;
REVOKE ALL ON agency_representations  FROM public;


-- ---------------------------------------------------------------------------
-- Section 10 — Cross-workspace helper functions
-- ---------------------------------------------------------------------------

-- workspace_manifest: returns the set of workspaces the current user belongs to.
-- Used by the API layer to build the nav workspace list.
-- I-A7: nav routing ONLY — not a data-access predicate.
CREATE OR REPLACE FUNCTION workspace_manifest()
RETURNS TABLE (
  workspace_type text,
  workspace_id   uuid,
  workspace_name text,
  user_role      text
) LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = ''
AS $$
  SELECT 'firm'::text,       f.id, f.name,   fm.member_role
    FROM public.firms f
    JOIN public.firm_members fm ON fm.firm_id = f.id
   WHERE fm.user_id = public.current_app_user_id()
  UNION ALL
  SELECT 'institution'::text, i.id, i.name,  im.member_role
    FROM public.institutions i
    JOIN public.institution_members im ON im.institution_id = i.id
   WHERE im.user_id = public.current_app_user_id()
  UNION ALL
  SELECT 'company'::text,    c.id, c.name,   cm.crew_role
    FROM public.companies c
    JOIN public.crew_members cm ON cm.company_id = c.id
   WHERE cm.user_id = public.current_app_user_id()
  UNION ALL
  SELECT 'brokerage'::text,  b.id, b.name,   bs.seat_type
    FROM public.brokerages b
    JOIN public.broker_seats bs ON bs.brokerage_id = b.id
   WHERE bs.user_id = public.current_app_user_id()
     AND bs.active = true;
$$;

-- subject_party: returns the current user's application user id.
-- Thin wrapper used by the notification delivery service to locate the
-- correct users.id for auth.uid().
CREATE OR REPLACE FUNCTION subject_party()
RETURNS uuid LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = ''
AS $$
  SELECT public.current_app_user_id();
$$;

-- on_restricted_list: stub returning false.
-- Full implementation in migration 1063 (after identity_subjects exists).
-- Used by corp_transaction_records RLS in migration 1041 (I-L10).
CREATE OR REPLACE FUNCTION on_restricted_list(p_counterparty_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = ''
AS $$
  -- Stub: full implementation in migration 1063 (I-L10)
  SELECT false;
$$;
