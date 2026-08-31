-- =============================================================================
-- 1003_foundation_part_c.sql
-- Shtiya Builder v3.0 — Migration 0001 Part C:
-- Institutions, lending facilities, firms, and their authorization tables.
--
-- Builds on 1001_foundation_part_a.sql (users, properties,
-- assert_not_billing_actor) and 1002_foundation_part_b.sql
-- (current_app_user_id, current_user_role_group).
--
-- A "facility" here is a lending/credit facility — a line of credit,
-- construction loan, or equity commitment — not a physical building.
--
-- Identity: auth.uid() matches users.auth_user_id, never users.id. Every
-- user_id FK in this file points at users.id, so all comparisons go through
-- current_app_user_id() (Part B), never auth.uid() directly.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- Section 1 — institutions
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS institutions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  institution_type text NOT NULL
                    CHECK (institution_type IN (
                      'bank','credit_union','mortgage_company',
                      'insurance_company','title_company','other'
                    )),
  created_at      timestamptz NOT NULL DEFAULT now()
);


-- ---------------------------------------------------------------------------
-- Section 2 — institution_members
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS institution_members (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  member_role    text NOT NULL DEFAULT 'member'
                   CHECK (member_role IN ('member','officer','admin')),
  joined_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (institution_id, user_id)
);


-- ---------------------------------------------------------------------------
-- Section 3 — facilities
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS facilities (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id   uuid NOT NULL REFERENCES institutions(id),
  property_id      uuid NOT NULL REFERENCES properties(id),
  facility_type    text NOT NULL
                     CHECK (facility_type IN (
                       'mortgage','heloc','construction_loan',
                       'bridge_loan','mezzanine','jv_equity'
                     )),
  committed_cents  bigint NOT NULL CHECK (committed_cents > 0),
  currency         text NOT NULL DEFAULT 'USD',
  status           text NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','active','closed','defaulted')),
  originated_at    timestamptz,
  maturity_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);


-- ---------------------------------------------------------------------------
-- Section 4 — facility_parties (authorization table) + billing guard
--
-- `assert_not_billing_actor()` is defined in Part A and reads NEW.user_id;
-- facility_parties supplies that column, so the shared guard applies as-is.
-- The trigger is registered here, in the same migration that creates the
-- table, as privilege-lint (I-2) requires.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS facility_parties (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id uuid NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  party_role  text NOT NULL
                CHECK (party_role IN ('borrower','guarantor','lender_rep','servicer')),
  joined_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (facility_id, user_id, party_role)
);

-- I-2: billing actors must not appear in authorization tables
DROP TRIGGER IF EXISTS trg_fp_billing_guard ON facility_parties;
CREATE TRIGGER trg_fp_billing_guard  -- I-2
  BEFORE INSERT OR UPDATE ON facility_parties
  FOR EACH ROW EXECUTE FUNCTION assert_not_billing_actor();

REVOKE ALL ON facility_parties FROM public;


-- ---------------------------------------------------------------------------
-- Section 5 — is_facility_party()
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION is_facility_party(p_facility_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.facility_parties
    WHERE facility_id = p_facility_id
      AND user_id     = public.current_app_user_id()
  );
$$;


-- ---------------------------------------------------------------------------
-- Section 6 — firms and firm_members
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS firms (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  firm_type   text NOT NULL
                CHECK (firm_type IN ('law_firm','title_agency','arbitration_firm','other')),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS firm_members (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id     uuid NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  member_role text NOT NULL DEFAULT 'associate'
                CHECK (member_role IN ('partner','associate','of_counsel','paralegal','admin')),
  joined_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (firm_id, user_id)
);


-- ---------------------------------------------------------------------------
-- Section 7 — Enable row level security
-- ---------------------------------------------------------------------------

ALTER TABLE institutions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE institution_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE facilities          ENABLE ROW LEVEL SECURITY;
ALTER TABLE facility_parties    ENABLE ROW LEVEL SECURITY;
ALTER TABLE firms               ENABLE ROW LEVEL SECURITY;
ALTER TABLE firm_members        ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- Section 8 — RLS policies
--
-- Postgres has no CREATE POLICY IF NOT EXISTS (through 17), so each policy is
-- preceded by DROP POLICY IF EXISTS to keep the migration re-runnable.
-- ---------------------------------------------------------------------------

-- institutions: institution members can read their own institution
DROP POLICY IF EXISTS "institutions_member_read" ON institutions;
CREATE POLICY "institutions_member_read" ON institutions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM institution_members
      WHERE institution_id = institutions.id
        AND user_id = current_app_user_id()
    )
    OR current_user_role_group() = 'admin'
  );

-- institution_members: member sees own rows in their institutions
DROP POLICY IF EXISTS "institution_members_self_read" ON institution_members;
CREATE POLICY "institution_members_self_read" ON institution_members FOR SELECT
  USING (user_id = current_app_user_id() OR current_user_role_group() = 'admin');

-- facilities: facility parties can read
DROP POLICY IF EXISTS "facilities_party_read" ON facilities;
CREATE POLICY "facilities_party_read" ON facilities FOR SELECT
  USING (is_facility_party(id) OR current_user_role_group() = 'admin');

-- facility_parties: self-read
DROP POLICY IF EXISTS "facility_parties_self_read" ON facility_parties;
CREATE POLICY "facility_parties_self_read" ON facility_parties FOR SELECT
  USING (user_id = current_app_user_id() OR current_user_role_group() = 'admin');

-- firms: firm members can read their own firm
DROP POLICY IF EXISTS "firms_member_read" ON firms;
CREATE POLICY "firms_member_read" ON firms FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM firm_members
      WHERE firm_id = firms.id
        AND user_id = current_app_user_id()
    )
    OR current_user_role_group() = 'admin'
  );

-- firm_members: self-read
DROP POLICY IF EXISTS "firm_members_self_read" ON firm_members;
CREATE POLICY "firm_members_self_read" ON firm_members FOR SELECT
  USING (user_id = current_app_user_id() OR current_user_role_group() = 'admin');
