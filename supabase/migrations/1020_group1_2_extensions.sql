-- =============================================================================
-- 1020_group1_2_extensions.sql
-- Shtiya Builder v3.0 — Group 1 & 2 extensions:
-- Property valuation and municipal records (Group 1), and investor
-- assemblage / deal diligence tables (Group 2).
--
-- Builds on 1001 (users, properties, documents), 1002 (current_app_user_id,
-- current_user_role_group, has_property_capacity), 1003 (institutions),
-- 1008 (deals, is_deal_member).
--
-- No new authorization tables here, so no billing-guard triggers.
--
-- Wall scope: no table in this migration has a direct `matter_id` column, so
-- wall-lint does not apply. Two tables do reach a matter indirectly, via
-- documents.matter_id — see the note on Section 4/5 policies below.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- Section 1 — avm_snapshots
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS avm_snapshots (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id     uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  source          text NOT NULL
                    CHECK (source IN ('zillow','corelogic','attom','internal','other')),
  estimated_value_cents bigint NOT NULL CHECK (estimated_value_cents > 0),
  currency        text NOT NULL DEFAULT 'USD',
  confidence_band text CHECK (confidence_band IN ('high','medium','low')),
  as_of_date      date NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);


-- ---------------------------------------------------------------------------
-- Section 2 — municipal_records
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS municipal_records (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id   uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  agency        text NOT NULL
                  CHECK (agency IN ('DOB','HPD','ECB','DOF','DEP','311','other')),
  record_type   text NOT NULL,
  record_ref    text NOT NULL,
  status        text NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open','resolved','appealed','dismissed')),
  issued_at     date,
  resolved_at   date,
  created_at    timestamptz NOT NULL DEFAULT now()
);


-- ---------------------------------------------------------------------------
-- Section 3 — assembly_intents
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS assembly_intents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_investor_id uuid NOT NULL REFERENCES users(id),
  target_property_ids uuid[] NOT NULL DEFAULT '{}',
  deal_id         uuid REFERENCES deals(id),
  status          text NOT NULL DEFAULT 'prospecting'
                    CHECK (status IN (
                      'prospecting','outreach','loi','under_contract','closed','dead'
                    )),
  created_at      timestamptz NOT NULL DEFAULT now()
);


-- ---------------------------------------------------------------------------
-- Section 4 — deal_documents
--
-- `deals` has no matter_id, so the deal side carries no wall relevance.
-- The document side does: documents.matter_id is populated for matter-scoped
-- documents. See the Section 8 policy note — the wall term is NOT applied
-- here, and the reason is not that it is unnecessary.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS deal_documents (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id     uuid NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  doc_role    text NOT NULL DEFAULT 'supporting'
                CHECK (doc_role IN (
                  'psa','loi','title_report','survey','inspection',
                  'appraisal','financing','closing','supporting'
                )),
  added_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (deal_id, document_id)
);


-- ---------------------------------------------------------------------------
-- Section 5 — title_diligence
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS title_diligence (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id          uuid NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  title_company_id uuid REFERENCES institutions(id),
  examiner_id      uuid REFERENCES users(id),
  status           text NOT NULL DEFAULT 'ordered'
                     CHECK (status IN (
                       'ordered','in_progress','clear','exception','insured'
                     )),
  ordered_at       timestamptz NOT NULL DEFAULT now(),
  cleared_at       timestamptz,
  report_doc_id    uuid REFERENCES documents(id)
);


-- ---------------------------------------------------------------------------
-- Section 6 — contract_assignments
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS contract_assignments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id         uuid NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  assignor_id     uuid NOT NULL REFERENCES users(id),
  assignee_id     uuid NOT NULL REFERENCES users(id),
  assignment_fee_cents bigint CHECK (assignment_fee_cents >= 0),
  currency        text NOT NULL DEFAULT 'USD',
  assigned_at     timestamptz NOT NULL DEFAULT now(),
  recorded_at     timestamptz
);


-- ---------------------------------------------------------------------------
-- Section 7 — Enable row level security
-- ---------------------------------------------------------------------------

ALTER TABLE avm_snapshots       ENABLE ROW LEVEL SECURITY;
ALTER TABLE municipal_records   ENABLE ROW LEVEL SECURITY;
ALTER TABLE assembly_intents    ENABLE ROW LEVEL SECURITY;
ALTER TABLE deal_documents      ENABLE ROW LEVEL SECURITY;
ALTER TABLE title_diligence     ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_assignments ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- Section 8 — RLS policies
--
-- Postgres has no CREATE POLICY IF NOT EXISTS (through 17), so each policy is
-- preceded by DROP POLICY IF EXISTS to keep the migration re-runnable.
--
-- WALL NOTE (deal_documents, title_diligence):
-- Both reach a matter indirectly through documents.matter_id, so under the
-- child-table wall rule they would each need:
--     AND (SELECT matter_id IS NULL OR NOT public.wall_blocks_user(matter_id)
--            FROM public.documents WHERE id = <fk_col>)
-- That pattern CANNOT be used here. `documents` has RLS enabled (1002 §3)
-- with no SELECT policy defined anywhere, so the subquery — evaluated as the
-- invoker, not as definer — returns zero rows for every caller, the scalar
-- subquery yields NULL, and the whole USING clause collapses to false. Adding
-- it would deny all reads rather than apply the wall.
-- Closing this properly needs a SECURITY DEFINER accessor (e.g.
-- document_matter_id(uuid)) or a documents SELECT policy; both are out of
-- scope for this migration. Tracked, not silently dropped.
-- ---------------------------------------------------------------------------

-- avm_snapshots: property capacity holders read
DROP POLICY IF EXISTS "avm_snapshots_property_read" ON avm_snapshots;
CREATE POLICY "avm_snapshots_property_read" ON avm_snapshots FOR SELECT
  USING (
    has_property_capacity(property_id, 'owner_occupant')
    OR has_property_capacity(property_id, 'owner_investor')
    OR has_property_capacity(property_id, 'owner_distressed')
    OR current_user_role_group() = 'admin'
  );

-- municipal_records: property capacity holders read
DROP POLICY IF EXISTS "municipal_records_property_read" ON municipal_records;
CREATE POLICY "municipal_records_property_read" ON municipal_records FOR SELECT
  USING (
    has_property_capacity(property_id, 'owner_occupant')
    OR has_property_capacity(property_id, 'owner_investor')
    OR has_property_capacity(property_id, 'owner_distressed')
    OR current_user_role_group() = 'admin'
  );

-- assembly_intents: lead investor reads own; deal members read if deal attached
DROP POLICY IF EXISTS "assembly_intents_investor_read" ON assembly_intents;
CREATE POLICY "assembly_intents_investor_read" ON assembly_intents FOR SELECT
  USING (
    lead_investor_id = public.current_app_user_id()
    OR (deal_id IS NOT NULL AND is_deal_member(deal_id))
    OR current_user_role_group() = 'admin'
  );

-- deal_documents: deal members read
DROP POLICY IF EXISTS "deal_documents_member_read" ON deal_documents;
CREATE POLICY "deal_documents_member_read" ON deal_documents FOR SELECT
  USING (
    is_deal_member(deal_id)
    OR current_user_role_group() = 'admin'
  );

-- title_diligence: deal members read
DROP POLICY IF EXISTS "title_diligence_member_read" ON title_diligence;
CREATE POLICY "title_diligence_member_read" ON title_diligence FOR SELECT
  USING (
    is_deal_member(deal_id)
    OR current_user_role_group() = 'admin'
  );

-- contract_assignments: assignor, assignee, or deal member reads
DROP POLICY IF EXISTS "contract_assignments_party_read" ON contract_assignments;
CREATE POLICY "contract_assignments_party_read" ON contract_assignments FOR SELECT
  USING (
    assignor_id = public.current_app_user_id()
    OR assignee_id = public.current_app_user_id()
    OR is_deal_member(deal_id)
    OR current_user_role_group() = 'admin'
  );
