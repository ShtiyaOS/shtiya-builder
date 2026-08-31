-- =============================================================================
-- 1030_group3_extensions.sql
-- Shtiya Builder v3.0 — Group 3 extensions:
-- Construction draw requests, field inspections, and loan covenants on
-- lending facilities.
--
-- Builds on 1001 (users, properties), 1002 (current_app_user_id,
-- current_user_role_group), 1003 (facilities, is_facility_party).
--
-- No new authorization tables here, so no billing-guard triggers. The one
-- trigger in this file enforces draw dual control (G3 §II.4).
--
-- Wall scope: all three tables scope through facility_id, and `facilities`
-- has no matter_id — verified against 1003, not assumed. field_inspections
-- reaches facilities via draw_requests, and that chain likewise never
-- touches `matters`, so the child-table wall rule does not apply and no
-- wall term is required in any policy here.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- Section 1 — draw_requests
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS draw_requests (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id    uuid NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  requested_by   uuid NOT NULL REFERENCES users(id),
  reviewed_by    uuid REFERENCES users(id),
  amount_cents   bigint NOT NULL CHECK (amount_cents > 0),
  currency       text NOT NULL DEFAULT 'USD',
  status         text NOT NULL DEFAULT 'pending'
                   CHECK (status IN (
                     'pending','under_review','approved',
                     'disbursed','rejected','cancelled'
                   )),
  submitted_at   timestamptz NOT NULL DEFAULT now(),
  reviewed_at    timestamptz,
  memo           text
);


-- ---------------------------------------------------------------------------
-- Section 2 — enforce_draw_dual_control() + trigger
--
-- Plain CREATE TRIGGER (never CREATE OR REPLACE TRIGGER), per the standing
-- trigger rule.
-- ---------------------------------------------------------------------------

-- G3 §II.4 dual control: reviewer must differ from requestor
CREATE OR REPLACE FUNCTION enforce_draw_dual_control()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Enforces on every INSERT/UPDATE where reviewed_by is non-null.
  -- This catches both the initial review assignment AND subsequent edits that
  -- attempt to change reviewed_by to the requestor on an already-reviewed row.
  IF NEW.reviewed_by IS NOT NULL AND NEW.reviewed_by = NEW.requested_by THEN
    RAISE EXCEPTION
      'draw request % dual-control violation: reviewer must differ from requestor (G3 §II.4)',
      NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_draw_dual_control ON draw_requests;
CREATE TRIGGER trg_draw_dual_control
  BEFORE INSERT OR UPDATE ON draw_requests
  FOR EACH ROW EXECUTE FUNCTION enforce_draw_dual_control();


-- ---------------------------------------------------------------------------
-- Section 3 — field_inspections
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS field_inspections (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  draw_request_id uuid NOT NULL REFERENCES draw_requests(id) ON DELETE CASCADE,
  inspector_id    uuid NOT NULL REFERENCES users(id),
  -- ADVISORY only; human sign-off required before draw is approved (I-A3)
  vision_model_result jsonb,    -- I-A3: ADVISORY only; human sign-off required
  human_approved  boolean NOT NULL DEFAULT false,
  inspected_at    timestamptz NOT NULL DEFAULT now(),
  notes           text
);


-- ---------------------------------------------------------------------------
-- Section 4 — loan_covenants
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS loan_covenants (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id    uuid NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  covenant_type  text NOT NULL
                   CHECK (covenant_type IN (
                     'ltv_cap','dscr_floor','completion_date',
                     'insurance_minimum','other'
                   )),
  threshold      text NOT NULL,  -- human-readable threshold description
  status         text NOT NULL DEFAULT 'compliant'
                   CHECK (status IN ('compliant','in_breach','waived','cured')),
  checked_at     timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);


-- ---------------------------------------------------------------------------
-- Section 5 — Enable row level security
-- ---------------------------------------------------------------------------

ALTER TABLE draw_requests    ENABLE ROW LEVEL SECURITY;
ALTER TABLE field_inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE loan_covenants   ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- Section 6 — RLS policies
--
-- Postgres has no CREATE POLICY IF NOT EXISTS (through 17), so each policy is
-- preceded by DROP POLICY IF EXISTS to keep the migration re-runnable.
-- ---------------------------------------------------------------------------

-- draw_requests: facility parties read
DROP POLICY IF EXISTS "draw_requests_party_read" ON draw_requests;
CREATE POLICY "draw_requests_party_read" ON draw_requests FOR SELECT
  USING (
    is_facility_party(facility_id)
    OR requested_by = public.current_app_user_id()
    OR current_user_role_group() = 'admin'
  );

-- field_inspections: facility parties read (via draw_request → facility)
DROP POLICY IF EXISTS "field_inspections_party_read" ON field_inspections;
CREATE POLICY "field_inspections_party_read" ON field_inspections FOR SELECT
  USING (
    (
      SELECT public.is_facility_party(dr.facility_id)
      FROM public.draw_requests dr
      WHERE dr.id = field_inspections.draw_request_id
    )
    OR inspector_id = public.current_app_user_id()
    OR current_user_role_group() = 'admin'
  );

-- loan_covenants: facility parties read
DROP POLICY IF EXISTS "loan_covenants_party_read" ON loan_covenants;
CREATE POLICY "loan_covenants_party_read" ON loan_covenants FOR SELECT
  USING (
    is_facility_party(facility_id)
    OR current_user_role_group() = 'admin'
  );
