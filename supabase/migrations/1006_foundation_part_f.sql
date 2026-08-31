-- =============================================================================
-- 1006_foundation_part_f.sql
-- Shtiya Builder v3.0 — Migration 0001 Part F:
-- Contractor companies + work packages, and architectural practices +
-- design packages.
--
-- Builds on 1001 (users, properties, assert_not_billing_actor),
-- 1002 (current_app_user_id, current_user_role_group), 1004 (matters,
-- wall_blocks_user).
--
-- wp_parties and dp_parties are authorization tables (I-2): each carries its
-- billing-guard trigger in this same migration, as privilege-lint requires.
-- Work packages and design packages may be matter-scoped, so their SELECT
-- policies apply wall_blocks_user() whenever matter_id is set (I-L12).
-- =============================================================================


-- ---------------------------------------------------------------------------
-- Section 1 — companies + crew_members
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS companies (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  company_type text NOT NULL
                 CHECK (company_type IN (
                   'general_contractor','subcontractor','supplier',
                   'logistics','owner_builder'
                 )),
  license_no   text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS crew_members (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  crew_role  text NOT NULL DEFAULT 'worker'
               CHECK (crew_role IN ('foreman','worker','supervisor','owner')),
  joined_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, user_id)
);


-- ---------------------------------------------------------------------------
-- Section 2 — work_packages + wp_parties (authorization table) + billing guard
--
-- Plain CREATE TRIGGER (never CREATE OR REPLACE TRIGGER) — privilege-lint
-- matches `create\s+trigger\s+trg_\w*_billing_guard`.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS work_packages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties(id),
  company_id  uuid REFERENCES companies(id),
  matter_id   uuid REFERENCES matters(id),
  scope       text NOT NULL,
  status      text NOT NULL DEFAULT 'draft'
                CHECK (status IN (
                  'draft','awarded','active','on_hold','completed','cancelled'
                )),
  start_date  date,
  end_date    date,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wp_parties (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_package_id  uuid NOT NULL REFERENCES work_packages(id) ON DELETE CASCADE,
  user_id          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  party_role       text NOT NULL
                     CHECK (party_role IN (
                       'owner_rep','gc','subcontractor','inspector','supplier'
                     )),
  joined_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (work_package_id, user_id, party_role)
);

-- I-2: billing actors must not appear in authorization tables
DROP TRIGGER IF EXISTS trg_wp_billing_guard ON wp_parties;
CREATE TRIGGER trg_wp_billing_guard  -- I-2
  BEFORE INSERT OR UPDATE ON wp_parties
  FOR EACH ROW EXECUTE FUNCTION assert_not_billing_actor();

REVOKE ALL ON wp_parties FROM public;


-- ---------------------------------------------------------------------------
-- Section 3 — boq_items
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS boq_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_package_id uuid NOT NULL REFERENCES work_packages(id) ON DELETE CASCADE,
  description     text NOT NULL,
  quantity        numeric NOT NULL CHECK (quantity > 0),
  unit            text NOT NULL,
  unit_cost_cents bigint NOT NULL CHECK (unit_cost_cents >= 0),
  created_at      timestamptz NOT NULL DEFAULT now()
);


-- ---------------------------------------------------------------------------
-- Section 4 — is_work_package_party()
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION is_work_package_party(p_work_package_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.wp_parties
    WHERE work_package_id = p_work_package_id
      AND user_id         = public.current_app_user_id()
  );
$$;


-- ---------------------------------------------------------------------------
-- Section 5 — practices + seal_holders + professional_licences
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS practices (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  practice_type text NOT NULL
                  CHECK (practice_type IN (
                    'architecture','engineering','landscape','interior_design'
                  )),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS seal_holders (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  licence_no  text NOT NULL,
  state       text NOT NULL,
  expires_at  timestamptz NOT NULL,
  UNIQUE (practice_id, user_id)
);

CREATE TABLE IF NOT EXISTS professional_licences (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  licence_type text NOT NULL
                 CHECK (licence_type IN (
                   'ra','pe','landscape_architect','interior_designer'
                 )),
  licence_no   text NOT NULL,
  issuing_state text NOT NULL,
  issued_at    timestamptz,
  expires_at   timestamptz NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);


-- ---------------------------------------------------------------------------
-- Section 6 — design_packages + dp_parties (authorization table) + billing guard
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS design_packages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties(id),
  practice_id uuid REFERENCES practices(id),
  matter_id   uuid REFERENCES matters(id),
  phase       text NOT NULL DEFAULT 'schematic'
                CHECK (phase IN (
                  'schematic','design_development','construction_docs',
                  'permit','construction_admin','closeout'
                )),
  status      text NOT NULL DEFAULT 'active'
                CHECK (status IN ('active','on_hold','completed','cancelled')),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dp_parties (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  design_package_id uuid NOT NULL REFERENCES design_packages(id) ON DELETE CASCADE,
  user_id           uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  party_role        text NOT NULL
                      CHECK (party_role IN (
                        'lead_architect','engineer','owner_rep',
                        'contractor_liaison','code_consultant'
                      )),
  joined_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (design_package_id, user_id, party_role)
);

-- I-2: billing actors must not appear in authorization tables
DROP TRIGGER IF EXISTS trg_dp_billing_guard ON dp_parties;
CREATE TRIGGER trg_dp_billing_guard  -- I-2
  BEFORE INSERT OR UPDATE ON dp_parties
  FOR EACH ROW EXECUTE FUNCTION assert_not_billing_actor();

REVOKE ALL ON dp_parties FROM public;


-- ---------------------------------------------------------------------------
-- Section 7 — design_licences
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS design_licences (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  design_package_id uuid NOT NULL REFERENCES design_packages(id) ON DELETE CASCADE,
  seal_holder_id    uuid NOT NULL REFERENCES seal_holders(id),
  sheet_refs        text[],
  sealed_at         timestamptz NOT NULL DEFAULT now()
);


-- ---------------------------------------------------------------------------
-- Section 8 — is_design_package_party()
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION is_design_package_party(p_design_package_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.dp_parties
    WHERE design_package_id = p_design_package_id
      AND user_id           = public.current_app_user_id()
  );
$$;


-- ---------------------------------------------------------------------------
-- Section 9 — Enable row level security
-- ---------------------------------------------------------------------------

ALTER TABLE companies            ENABLE ROW LEVEL SECURITY;
ALTER TABLE crew_members         ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_packages        ENABLE ROW LEVEL SECURITY;
ALTER TABLE wp_parties           ENABLE ROW LEVEL SECURITY;
ALTER TABLE boq_items            ENABLE ROW LEVEL SECURITY;
ALTER TABLE practices            ENABLE ROW LEVEL SECURITY;
ALTER TABLE seal_holders         ENABLE ROW LEVEL SECURITY;
ALTER TABLE professional_licences ENABLE ROW LEVEL SECURITY;
ALTER TABLE design_packages      ENABLE ROW LEVEL SECURITY;
ALTER TABLE dp_parties           ENABLE ROW LEVEL SECURITY;
ALTER TABLE design_licences      ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- Section 10 — RLS policies
--
-- Postgres has no CREATE POLICY IF NOT EXISTS (through 17), so each policy is
-- preceded by DROP POLICY IF EXISTS to keep the migration re-runnable.
-- ---------------------------------------------------------------------------

-- companies: crew members read their own company
DROP POLICY IF EXISTS "companies_crew_read" ON companies;
CREATE POLICY "companies_crew_read" ON companies FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.crew_members
      WHERE company_id = companies.id
        AND user_id    = public.current_app_user_id()
    )
    OR current_user_role_group() = 'admin'
  );

DROP POLICY IF EXISTS "crew_members_self_read" ON crew_members;
CREATE POLICY "crew_members_self_read" ON crew_members FOR SELECT
  USING (user_id = public.current_app_user_id() OR current_user_role_group() = 'admin');

-- work_packages: wp_parties members; wall applies if matter_id set
DROP POLICY IF EXISTS "work_packages_party_read" ON work_packages;
CREATE POLICY "work_packages_party_read" ON work_packages FOR SELECT
  USING (
    (
      is_work_package_party(id)
      AND (matter_id IS NULL OR NOT public.wall_blocks_user(matter_id))
    )
    OR current_user_role_group() = 'admin'
  );

DROP POLICY IF EXISTS "wp_parties_self_read" ON wp_parties;
CREATE POLICY "wp_parties_self_read" ON wp_parties FOR SELECT
  USING (
    (
      is_work_package_party(work_package_id)
      AND (
        SELECT matter_id IS NULL
          OR NOT public.wall_blocks_user(matter_id)
        FROM public.work_packages
        WHERE id = wp_parties.work_package_id
      )
    )
    OR current_user_role_group() = 'admin'
  );

-- boq_items: work package party may read; wall applies if the package is matter-scoped.
-- I-L11: child rows of a walled work_package must be invisible to the screened party —
-- the parent is invisible so its cost line items must be too.
DROP POLICY IF EXISTS "boq_items_party_read" ON boq_items;
CREATE POLICY "boq_items_party_read" ON boq_items FOR SELECT  -- I-L11
  USING (
    (
      is_work_package_party(work_package_id)
      AND (
        SELECT matter_id IS NULL
          OR NOT public.wall_blocks_user(matter_id)
        FROM public.work_packages
        WHERE id = boq_items.work_package_id
      )
    )
    OR current_user_role_group() = 'admin'
  );

DROP POLICY IF EXISTS "practices_member_read" ON practices;
CREATE POLICY "practices_member_read" ON practices FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.seal_holders
      WHERE practice_id = practices.id
        AND user_id     = public.current_app_user_id()
    )
    OR current_user_role_group() = 'admin'
  );

DROP POLICY IF EXISTS "seal_holders_self_read" ON seal_holders;
CREATE POLICY "seal_holders_self_read" ON seal_holders FOR SELECT
  USING (user_id = public.current_app_user_id() OR current_user_role_group() = 'admin');

DROP POLICY IF EXISTS "professional_licences_self_read" ON professional_licences;
CREATE POLICY "professional_licences_self_read" ON professional_licences FOR SELECT
  USING (user_id = public.current_app_user_id() OR current_user_role_group() = 'admin');

-- design_packages: dp_parties members; wall applies if matter_id set
DROP POLICY IF EXISTS "design_packages_party_read" ON design_packages;
CREATE POLICY "design_packages_party_read" ON design_packages FOR SELECT
  USING (
    (
      is_design_package_party(id)
      AND (matter_id IS NULL OR NOT public.wall_blocks_user(matter_id))
    )
    OR current_user_role_group() = 'admin'
  );

DROP POLICY IF EXISTS "dp_parties_self_read" ON dp_parties;
CREATE POLICY "dp_parties_self_read" ON dp_parties FOR SELECT
  USING (
    (
      is_design_package_party(design_package_id)
      AND (
        SELECT matter_id IS NULL
          OR NOT public.wall_blocks_user(matter_id)
        FROM public.design_packages
        WHERE id = dp_parties.design_package_id
      )
    )
    OR current_user_role_group() = 'admin'
  );

-- design_licences: design package party may read; wall applies if the package is matter-scoped.
-- I-L11: seal records of a walled design_package must be invisible to the screened party.
DROP POLICY IF EXISTS "design_licences_party_read" ON design_licences;
CREATE POLICY "design_licences_party_read" ON design_licences FOR SELECT  -- I-L11
  USING (
    (
      is_design_package_party(design_package_id)
      AND (
        SELECT matter_id IS NULL
          OR NOT public.wall_blocks_user(matter_id)
        FROM public.design_packages
        WHERE id = design_licences.design_package_id
      )
    )
    OR current_user_role_group() = 'admin'
  );
