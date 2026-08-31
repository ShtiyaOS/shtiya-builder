-- =============================================================================
-- 1051_group7_extensions.sql
-- Shtiya Builder v3.0 — Group 7 (Property Management) extension tables.
--
-- SCHEMA CORRECTION vs Plan draft: tenancies has tenant_id (uuid) and
-- manager_id (uuid). There is no tenant_user_ids[] column and no engagement_id
-- FK. All tenancy-scoped policies use the EXISTS subquery pattern established
-- in 1007: t.tenant_id = current_app_user_id() OR t.manager_id = ...
-- Plan draft used auth.uid() and a management_engagements join — both wrong.
--
-- Builds on 1001 (users, documents), 1002 (current_app_user_id,
-- current_user_role_group), 1007 (tenancies, screening_reports).
--
-- I-22: maintenance_tickets must never gate physical access to the unit.
-- I-25: adverse_action_notices.documented_basis must be human-authored.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- Section 1 — maintenance_tickets
-- ---------------------------------------------------------------------------

-- I-22: Access Floor — no action from this table may gate physical access to the unit.
CREATE TABLE IF NOT EXISTS maintenance_tickets (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenancy_id   uuid NOT NULL REFERENCES tenancies(id),
  submitted_by uuid NOT NULL REFERENCES users(id),
  -- unit_id denormalized from tenancy for query performance
  unit_id      text NOT NULL,
  category     text NOT NULL
                 CHECK (category IN (
                   'plumbing','electrical','hvac','structural',
                   'pest','appliance','common_area','habitability','other'
                 )),
  description  text NOT NULL,
  photo_paths  text[] NOT NULL DEFAULT '{}',
  priority     text NOT NULL DEFAULT 'routine'
                 CHECK (priority IN ('emergency','urgent','routine')),
  assigned_to  uuid REFERENCES users(id),
  status       text NOT NULL DEFAULT 'open'
                 CHECK (status IN (
                   'open','assigned','in_progress','pending_review',
                   'closed','escalated'
                 )),
  created_at   timestamptz NOT NULL DEFAULT now(),
  closed_at    timestamptz
);


-- ---------------------------------------------------------------------------
-- Section 2 — rent_ledger
-- ---------------------------------------------------------------------------

-- Append-only by convention; corrections via contra-entry (same pattern as trust_ledger)
CREATE TABLE IF NOT EXISTS rent_ledger (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenancy_id   uuid NOT NULL REFERENCES tenancies(id),
  direction    text NOT NULL CHECK (direction IN ('credit','debit')),
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  entry_type   text NOT NULL
                 CHECK (entry_type IN (
                   'rent_payment','late_fee','nsf_fee',
                   'credit_adjustment','security_deposit_deduction',
                   'contra_reversal'
                 )),
  period_start date,
  period_end   date,
  posted_by    uuid NOT NULL REFERENCES users(id),
  posted_at    timestamptz NOT NULL DEFAULT now(),
  memo         text
);


-- ---------------------------------------------------------------------------
-- Section 3 — adverse_action_notices
-- ---------------------------------------------------------------------------

-- I-25: documented_basis must be human-authored; not a model output.
-- Denial requires human review; auto-deny prohibited (I-25).
CREATE TABLE IF NOT EXISTS adverse_action_notices (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  screening_report_id uuid NOT NULL REFERENCES screening_reports(id),
  applicant_user_id   uuid NOT NULL REFERENCES users(id),
  -- authored_by must be a human user, not a service account
  authored_by         uuid NOT NULL REFERENCES users(id),
  documented_basis    text NOT NULL,  -- I-25: human-authored; not a model output
  notice_sent_at      timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now()
);


-- ---------------------------------------------------------------------------
-- Section 4 — lease_documents
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS lease_documents (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenancy_id  uuid NOT NULL REFERENCES tenancies(id),
  document_id uuid NOT NULL REFERENCES documents(id),
  signed_by   uuid[] NOT NULL DEFAULT '{}',
  executed_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);


-- ---------------------------------------------------------------------------
-- Section 5 — Enable row level security
-- ---------------------------------------------------------------------------

ALTER TABLE maintenance_tickets    ENABLE ROW LEVEL SECURITY;
ALTER TABLE rent_ledger            ENABLE ROW LEVEL SECURITY;
ALTER TABLE adverse_action_notices ENABLE ROW LEVEL SECURITY;
ALTER TABLE lease_documents        ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- Section 6 — RLS policies
--
-- Postgres has no CREATE POLICY IF NOT EXISTS (through 17), so each policy is
-- preceded by DROP POLICY IF EXISTS to keep the migration re-runnable.
--
-- Tenancy-scoped tables use the EXISTS subquery from 1007 (rent_trust,
-- deposit_trust, screening_reports): tenant or manager of the tenancy.
--
-- lease_documents references documents(id) — documents has RLS and no public
-- grants (1001/1021), so the document row is separately access-controlled.
-- The policy here gates the join row via the tenancy party check.
-- ---------------------------------------------------------------------------

-- maintenance_tickets: tenant or manager read
DROP POLICY IF EXISTS "maintenance_tickets_read" ON maintenance_tickets;
CREATE POLICY "maintenance_tickets_read" ON maintenance_tickets FOR SELECT
  USING (
    submitted_by = public.current_app_user_id()
    OR EXISTS (
      SELECT 1 FROM public.tenancies t
      WHERE t.id = maintenance_tickets.tenancy_id
        AND (
          t.tenant_id  = public.current_app_user_id()
          OR t.manager_id = public.current_app_user_id()
        )
    )
    OR public.current_user_role_group() = 'admin'
  );

-- rent_ledger: tenant or manager read
DROP POLICY IF EXISTS "rent_ledger_read" ON rent_ledger;
CREATE POLICY "rent_ledger_read" ON rent_ledger FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.tenancies t
      WHERE t.id = rent_ledger.tenancy_id
        AND (
          t.tenant_id  = public.current_app_user_id()
          OR t.manager_id = public.current_app_user_id()
        )
    )
    OR public.current_user_role_group() = 'admin'
  );

-- adverse_action_notices: applicant or author read
DROP POLICY IF EXISTS "adverse_action_notices_self_read" ON adverse_action_notices;
CREATE POLICY "adverse_action_notices_self_read" ON adverse_action_notices FOR SELECT
  USING (
    applicant_user_id = public.current_app_user_id()
    OR authored_by    = public.current_app_user_id()
    OR public.current_user_role_group() = 'admin'
  );

-- lease_documents: tenant or manager read (document row separately gated by documents RLS)
DROP POLICY IF EXISTS "lease_documents_party_read" ON lease_documents;
CREATE POLICY "lease_documents_party_read" ON lease_documents FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.tenancies t
      WHERE t.id = lease_documents.tenancy_id
        AND (
          t.tenant_id  = public.current_app_user_id()
          OR t.manager_id = public.current_app_user_id()
        )
    )
    OR public.current_user_role_group() = 'admin'
  );


-- ---------------------------------------------------------------------------
-- Section 7 — REVOKE
-- ---------------------------------------------------------------------------

REVOKE ALL ON maintenance_tickets    FROM public;
REVOKE ALL ON rent_ledger            FROM public;
REVOKE ALL ON adverse_action_notices FROM public;
REVOKE ALL ON lease_documents        FROM public;
