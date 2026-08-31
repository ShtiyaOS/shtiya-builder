-- =============================================================================
-- 1059_baseline_validation.sql
-- Shtiya Builder v3.0 — Phase 1 baseline invariant assertions.
--
-- Seven deterministic DO blocks. Each raises an exception if an invariant is
-- already violated at deployment time, rolling back the migration. Passing
-- migrations confirm the 1001–1058 schema is invariant-clean.
--
-- These are deployment-time guards, not substitutes for CI test coverage.
--
-- CORRECTION vs Plan: I-2 block checks 7 authorization tables (the Plan
-- listed 6, omitting broker_seats which carries trg_bs_billing_guard in 1007).
--
-- CORRECTION vs task spec: I-2 counts DISTINCT event_object_table, not raw
-- rows. Every guard is declared BEFORE INSERT OR UPDATE, and
-- information_schema.triggers emits one row per event_manipulation — so
-- count(*) returns 14 for 7 triggers. A `count(*) < 7` test would still pass
-- with three of the seven guards dropped, which defeats the assertion.
-- Counting distinct tables measures exactly what the message claims.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- DO Block 1 — I-2: billing guard triggers on all 7 authorization tables
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_count int;
BEGIN
  -- DISTINCT event_object_table: one row per (trigger, event) pair otherwise.
  SELECT count(DISTINCT event_object_table) INTO v_count
  FROM information_schema.triggers
  WHERE trigger_name LIKE 'trg_%_billing_guard'
    AND event_object_table IN (
      'property_role_bindings', 'deal_memberships', 'facility_parties',
      'matter_parties', 'wp_parties', 'dp_parties', 'broker_seats'
    );
  IF v_count < 7 THEN
    RAISE EXCEPTION
      'I-2 VIOLATION: billing guard triggers missing — expected 7, found %',
      v_count;
  END IF;
END;
$$;


-- ---------------------------------------------------------------------------
-- DO Block 2 — I-L3: trust_ledger.debit_kind covers all permitted values
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name LIKE '%trust_ledger%'
      AND check_clause LIKE '%client_disbursement%'
  ) INTO v_exists;
  IF NOT v_exists THEN
    RAISE EXCEPTION
      'I-L3 VIOLATION: trust_ledger debit_kind check constraint not found';
  END IF;
END;
$$;


-- ---------------------------------------------------------------------------
-- DO Block 3 — I-L4: trust_ledger has no UPDATE or DELETE trigger
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_count int;
BEGIN
  SELECT count(*) INTO v_count
  FROM information_schema.triggers
  WHERE event_object_table = 'trust_ledger'
    AND event_manipulation IN ('UPDATE', 'DELETE')
    AND trigger_name NOT LIKE 'trg_%_billing_guard'
    AND trigger_name <> 'trust_ledger_immutable';  -- I-L4 append-only trigger added in 1061
  IF v_count > 0 THEN
    RAISE EXCEPTION
      'I-L4 VIOLATION: trust_ledger has % UPDATE/DELETE triggers — ledger must be append-only',
      v_count;
  END IF;
END;
$$;


-- ---------------------------------------------------------------------------
-- DO Block 4 — I-4: users_role_check constraint contains owner_investor
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'users_role_check'
      AND check_clause LIKE '%owner_investor%'
  ) INTO v_exists;
  IF NOT v_exists THEN
    RAISE EXCEPTION
      'I-4 VIOLATION: users_role_check constraint missing owner_investor from 27-role set';
  END IF;
END;
$$;


-- ---------------------------------------------------------------------------
-- DO Block 5 — I-A5: tenant_corpus.owner_org_id is NOT NULL
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name  = 'tenant_corpus'
      AND column_name = 'owner_org_id'
      AND is_nullable = 'NO'
  ) THEN
    RAISE EXCEPTION
      'I-A5 VIOLATION: tenant_corpus.owner_org_id must be NOT NULL';
  END IF;
END;
$$;


-- ---------------------------------------------------------------------------
-- DO Block 6 — I-25: screening_reports has no `denied` status value
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name LIKE '%screening_reports%'
      AND check_clause LIKE '%denied%'
  ) INTO v_exists;
  IF v_exists THEN
    RAISE EXCEPTION
      'I-25 VIOLATION: screening_reports check constraint contains ''denied'' — auto-deny is prohibited';
  END IF;
END;
$$;


-- ---------------------------------------------------------------------------
-- DO Block 7 — I-31: no platform-suggested commission rate column in G9 tables
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name  IN ('agency_representations', 'listings', 'commission_records')
      AND column_name IN ('suggested_rate', 'benchmark_rate', 'platform_rate')
  ) THEN
    RAISE EXCEPTION
      'I-31 VIOLATION: platform-suggested commission rate column found in G9 tables';
  END IF;
END;
$$;


-- ---------------------------------------------------------------------------
-- Schema comment
-- ---------------------------------------------------------------------------

-- All 7 assertions passed — baseline schema 1001–1059 is invariant-clean.
COMMENT ON SCHEMA public IS
  'Shtiya Builder Core Ecosystem v3.0 — baseline schema 1001–1059 validated.
   Legal Workspace (1060–1066), Agent Factory (1070–1076),
   HRAG Vault Network (1080–1086) layer on top.';
