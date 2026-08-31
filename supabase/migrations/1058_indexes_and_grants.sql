-- =============================================================================
-- 1058_indexes_and_grants.sql
-- Shtiya Builder v3.0 — Final index pass and grant locks.
--
-- The v3 equivalent of 0009_role_grants.sql. Postgres checks object-level
-- privileges BEFORE row-level security, so without this migration every RLS
-- policy written in 1001–1057 is unreachable: an authenticated request fails
-- at the grant check before any policy is evaluated.
--
-- Section 2 indexes cover the predicates the RLS helper functions and the
-- common list views actually filter on.
--
-- I-A10: authority_corpus and tenant_corpus receive COLUMN-LEVEL grants, never
--   a blanket table grant. The embedding column added in 1070 must not become
--   readable by a future widening of this grant. embedding-lint enforces the
--   same rule statically.
--
-- Builds on every v3 migration from 1001 through 1057.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- Section 1 — Schema usage grant
-- ---------------------------------------------------------------------------

-- Required before any table grant; without this Postgres blocks access to
-- the schema itself. Mirrors 0009_role_grants.sql §1.
GRANT USAGE ON SCHEMA public TO authenticated, service_role;


-- ---------------------------------------------------------------------------
-- Section 2 — Performance indexes
--
-- Every index uses IF NOT EXISTS so this migration is re-runnable.
-- ---------------------------------------------------------------------------

-- matters
CREATE INDEX IF NOT EXISTS idx_matters_firm_status    ON matters(firm_id, status);
CREATE INDEX IF NOT EXISTS idx_matters_type           ON matters(matter_type);

-- trust_ledger
CREATE INDEX IF NOT EXISTS idx_trust_ledger_status    ON trust_ledger(status, created_at DESC);

-- ethical_walls (partial — active walls only)
CREATE INDEX IF NOT EXISTS idx_ethical_walls_firm     ON ethical_walls(firm_id) WHERE removed_at IS NULL;

-- gig rail
CREATE INDEX IF NOT EXISTS idx_gig_jobs_matter_status ON gig_jobs(matter_id, status);
CREATE INDEX IF NOT EXISTS idx_gig_assign_provider    ON gig_assignments(provider_id, status);

-- brokerage
CREATE INDEX IF NOT EXISTS idx_listings_status        ON listings(status);
CREATE INDEX IF NOT EXISTS idx_agency_rep_brokerage   ON agency_representations(brokerage_id, status);

-- authorization tables (query hot-paths for is_*_party functions)
-- SCHEMA CORRECTION: neither table has a `status` column. is_deal_member()
-- filters (deal_id, user_id) and is_facility_party() filters
-- (facility_id, user_id) — those are the actual hot-path predicates.
CREATE INDEX IF NOT EXISTS idx_deal_mbrs_deal_user    ON deal_memberships(deal_id, user_id);
CREATE INDEX IF NOT EXISTS idx_fac_parties_fac_user   ON facility_parties(facility_id, user_id);

-- construction / property management
CREATE INDEX IF NOT EXISTS idx_draw_req_fac_status    ON draw_requests(facility_id, status);
CREATE INDEX IF NOT EXISTS idx_milestone_wp_status    ON milestone_events(work_package_id, status);
CREATE INDEX IF NOT EXISTS idx_maint_tick_ten_status  ON maintenance_tickets(tenancy_id, status);

-- platform infra
CREATE INDEX IF NOT EXISTS idx_notif_user_unread      ON notifications(user_id, read_at) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_audit_actor_time       ON audit_log(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_target           ON audit_log(target_type, target_id);

-- corpus: stub path-based indexes, guarded against the 1070 full schema.
-- Migration 1070 drops and recreates both corpus tables without a `path` column
-- (replaced by domain/sub_domain/jurisdiction_id). On chain re-apply these
-- indexes would fail with "column path does not exist".
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'authority_corpus' AND column_name = 'path'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_auth_corpus_path_vis
      ON authority_corpus(path, visibility);
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tenant_corpus' AND column_name = 'path'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_tenant_corpus_org_path
      ON tenant_corpus(owner_org_id, path);
  END IF;
END;
$$;

-- coverage assertions
CREATE INDEX IF NOT EXISTS idx_cov_assert_lookup      ON coverage_assertions(domain, jurisdiction, satisfied);


-- ---------------------------------------------------------------------------
-- Section 3 — GRANT SELECT to authenticated / service_role
--
-- service_role carries BYPASSRLS but still needs the base object grant to
-- touch these tables at all (same rationale as 0009 §2).
-- ---------------------------------------------------------------------------

-- v3 foundation tables (1001–1008)
-- entitlements and property_role_bindings included: both carry self-read
-- policies using current_app_user_id() that are unreachable without SELECT.
GRANT SELECT ON
  users, properties, documents, agreements,
  financial_ledgers, disclosures, escrow_intents,
  entitlements, property_role_bindings
TO authenticated, service_role;

-- institutions / facilities / firms (1003)
GRANT SELECT ON
  institutions, institution_members,
  facilities, facility_parties,
  firms, firm_members
TO authenticated, service_role;

-- matters / legal (1004)
GRANT SELECT ON
  matters, matter_parties, representations,
  ethical_walls, conflict_checks
TO authenticated, service_role;

-- trust (1005)
GRANT SELECT ON
  trust_accounts, trust_ledger
TO authenticated, service_role;

-- construction / design (1006)
GRANT SELECT ON
  companies, crew_members,
  work_packages, wp_parties, boq_items,
  practices, seal_holders, professional_licences,
  design_packages, dp_parties, design_licences
TO authenticated, service_role;

-- property management / brokerage (1007)
GRANT SELECT ON
  management_engagements, tenancies,
  rent_trust, deposit_trust, screening_reports,
  brokerages, broker_seats, agency_representations
TO authenticated, service_role;

-- deals (1008)
GRANT SELECT ON
  deals, deal_memberships
TO authenticated, service_role;

-- Group 1/2 extensions (1020)
GRANT SELECT ON
  avm_snapshots, municipal_records, assembly_intents,
  deal_documents, title_diligence, contract_assignments
TO authenticated, service_role;

-- Group 3 extensions (1030)
GRANT SELECT ON
  draw_requests, field_inspections, loan_covenants
TO authenticated, service_role;

-- Group 4 extensions (1040/1041)
GRANT SELECT ON
  privilege_successions, arbitration_cases, arbitration_awards,
  pi_medical_records, pi_liens, bk_schedules,
  corp_transaction_records, family_asset_inventories
TO authenticated, service_role;

-- Groups 5/6 extensions (1050)
GRANT SELECT ON
  milestone_events, safety_incidents, material_deliveries,
  design_files, rfis, seal_events
TO authenticated, service_role;

-- Group 7 extensions (1051) — tenancies already granted above; listed for clarity
GRANT SELECT ON
  maintenance_tickets, rent_ledger,
  adverse_action_notices, lease_documents
TO authenticated, service_role;

-- Group 9 extensions (1052)
-- listings granted here; also needed by the showings subquery
GRANT SELECT ON
  listings, showings,
  representation_disclosures, commission_records
TO authenticated, service_role;

-- Gig rail (1054)
-- gig_assignments granted here; needed by the gig_submissions provider EXISTS subquery
GRANT SELECT ON
  gig_jobs, gig_assignments, gig_submissions, gig_escrow
TO authenticated, service_role;

-- Platform infra (1055)
GRANT SELECT ON
  notifications, audit_log, wall_prior_access
TO authenticated, service_role;

-- Coverage assertions (1056) — broad read is intentional; platform metadata
GRANT SELECT ON coverage_assertions TO authenticated, service_role;


-- ---------------------------------------------------------------------------
-- Section 3b — Column-level grants (authority_corpus / tenant_corpus)
--
-- I-A10: embeddings inherit the same RLS as content.
-- Blanket SELECT would expose the embedding column once 1070 adds it.
-- Grant explicit column list excluding `embedding` (not yet present but
-- excluding it now prevents a future accidental blanket grant from leaking it).
-- ---------------------------------------------------------------------------

-- Corpus column grants: guarded — if the 1070 schema is already in place the
-- stub `path` column does not exist and these grants would fail.
-- 1070 Part B re-issues the full column-level grants against the new column list.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'authority_corpus' AND column_name = 'path'
  ) THEN
    EXECUTE $g$
      GRANT SELECT (
        id, path, trust_class, owner_org_id, visibility, content,
        effective_from, effective_to, superseded_by,
        verified_at, reverify_due, created_at
      ) ON authority_corpus TO authenticated, service_role
    $g$;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tenant_corpus' AND column_name = 'path'
  ) THEN
    EXECUTE $g$
      GRANT SELECT (
        id, path, trust_class, owner_org_id, visibility, content,
        effective_from, effective_to, created_at
      ) ON tenant_corpus TO authenticated, service_role
    $g$;
  END IF;
END;
$$;


-- ---------------------------------------------------------------------------
-- Section 4 — GRANT EXECUTE on SECURITY DEFINER functions
--
-- These functions are called from within RLS policies evaluated as the
-- invoker — without EXECUTE grants the policies fail for non-superuser roles.
-- ---------------------------------------------------------------------------

GRANT EXECUTE ON FUNCTION public.current_app_user_id()            TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_user_role_group()         TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_property_capacity(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_facility_party(uuid)           TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_matter_party(uuid)             TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.wall_blocks_user(uuid)            TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_work_package_party(uuid)       TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_design_package_party(uuid)     TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_deal_member(uuid)              TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_data_class_grant(uuid, text)  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.on_restricted_list(uuid)          TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.document_matter_id(uuid)          TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.representation_brokerage_id(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.gig_matter_id(uuid)               TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.assignment_gig_id(uuid)           TO authenticated, service_role;


-- ---------------------------------------------------------------------------
-- Section 5 — Idempotent REVOKE audit pass
--
-- Every table below already carries a REVOKE ALL ... FROM public in its own
-- migration. Re-revoking is a no-op in Postgres, so this block changes nothing
-- on a clean apply; it exists so that a future migration that accidentally
-- grants public access is corrected the next time this file runs.
--
-- Grants to `authenticated` / `service_role` above are unaffected: those are
-- explicit grantees, and revoking from PUBLIC does not touch them.
-- ---------------------------------------------------------------------------

-- 1001
REVOKE ALL ON entitlements             FROM public;
REVOKE ALL ON property_role_bindings   FROM public;
-- 1003
REVOKE ALL ON facility_parties         FROM public;
-- 1004
REVOKE ALL ON matter_parties           FROM public;
-- 1005
REVOKE ALL ON trust_accounts           FROM public;
REVOKE ALL ON trust_ledger             FROM public;
-- 1006
REVOKE ALL ON wp_parties               FROM public;
REVOKE ALL ON dp_parties               FROM public;
-- 1007
REVOKE ALL ON management_engagements   FROM public;
REVOKE ALL ON tenancies                FROM public;
REVOKE ALL ON rent_trust               FROM public;
REVOKE ALL ON deposit_trust            FROM public;
REVOKE ALL ON screening_reports        FROM public;
REVOKE ALL ON brokerages               FROM public;
REVOKE ALL ON broker_seats             FROM public;
REVOKE ALL ON agency_representations   FROM public;
-- 1008
REVOKE ALL ON deal_memberships         FROM public;
-- 1040
REVOKE ALL ON privilege_successions    FROM public;
REVOKE ALL ON arbitration_cases        FROM public;
REVOKE ALL ON arbitration_awards       FROM public;
-- 1041
REVOKE ALL ON pi_medical_records       FROM public;
REVOKE ALL ON pi_liens                 FROM public;
REVOKE ALL ON bk_schedules             FROM public;
REVOKE ALL ON corp_transaction_records FROM public;
REVOKE ALL ON family_asset_inventories FROM public;
-- 1050
REVOKE ALL ON milestone_events         FROM public;
REVOKE ALL ON safety_incidents         FROM public;
REVOKE ALL ON material_deliveries      FROM public;
REVOKE ALL ON design_files             FROM public;
REVOKE ALL ON rfis                     FROM public;
REVOKE ALL ON seal_events              FROM public;
-- 1051
REVOKE ALL ON maintenance_tickets      FROM public;
REVOKE ALL ON rent_ledger              FROM public;
REVOKE ALL ON adverse_action_notices   FROM public;
REVOKE ALL ON lease_documents          FROM public;
-- 1052
REVOKE ALL ON listings                 FROM public;
REVOKE ALL ON showings                 FROM public;
REVOKE ALL ON representation_disclosures FROM public;
REVOKE ALL ON commission_records       FROM public;
-- 1054
REVOKE ALL ON gig_jobs                 FROM public;
REVOKE ALL ON gig_assignments          FROM public;
REVOKE ALL ON gig_submissions          FROM public;
REVOKE ALL ON gig_escrow               FROM public;
-- 1055
REVOKE ALL ON notifications            FROM public;
REVOKE ALL ON audit_log                FROM public;
REVOKE ALL ON wall_prior_access        FROM public;
-- 1056
REVOKE ALL ON coverage_assertions      FROM public;
-- 1057
REVOKE ALL ON authority_corpus         FROM public;
REVOKE ALL ON tenant_corpus            FROM public;
