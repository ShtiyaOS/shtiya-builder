-- =============================================================================
-- 1066_lw_validation.sql
-- Shtiya Builder v3.0 — Legal Workspace validation assertions.
--
-- Ten deterministic DO blocks. Each raises an exception if an invariant is
-- violated at deployment time, rolling back the migration entirely. Passing
-- migrations confirm the 1060–1065 schema is Legal Workspace invariant-clean.
--
-- These are deployment-time guards, not substitutes for CI test coverage.
--
-- Column and object names below were checked against the live schema:
--   - trust_accounts.debit_block_attested (boolean), not ..._attested_at
--   - gig_capture_nonces policy is gcn_no_interactive_insert, not
--     nonce_no_interactive_insert as the Plan draft called it
-- =============================================================================


-- ---------------------------------------------------------------------------
-- DO Block 1 — I-L1: trust_ledger_disbursement_guard_v2 trigger exists
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE event_object_table = 'trust_ledger'
      AND trigger_name       = 'trust_ledger_disbursement_guard_v2'
  ) THEN
    RAISE EXCEPTION
      'I-L1 VIOLATION: trust_ledger_disbursement_guard_v2 trigger missing — dual control not enforced';
  END IF;
END;
$$;


-- ---------------------------------------------------------------------------
-- DO Block 2 — I-L2: trust_client_balances has balance_cents >= 0 constraint
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name LIKE '%trust_client_balances%'
      AND check_clause     LIKE '%balance_cents%'
  ) THEN
    RAISE EXCEPTION
      'I-L2 VIOLATION: trust_client_balances missing balance_cents check constraint — per-client solvency not enforced';
  END IF;
END;
$$;


-- ---------------------------------------------------------------------------
-- DO Block 3 — I-L3: trust_entry_kind_ck exists and excludes platform_fee
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'trust_entry_kind_ck'
      AND check_clause     LIKE '%platform_fee%'
  ) THEN
    RAISE EXCEPTION
      'I-L3 VIOLATION: platform_fee found in trust_entry_kind_ck — prohibited trust entry kind';
  END IF;
  -- Also assert the constraint exists at all
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'trust_entry_kind_ck'
  ) THEN
    RAISE EXCEPTION
      'I-L3 VIOLATION: trust_entry_kind_ck constraint missing — entry_kind enumeration not enforced';
  END IF;
END;
$$;


-- ---------------------------------------------------------------------------
-- DO Block 4 — I-L4: trust_ledger_no_delete rule suppresses deletes
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_rules
    WHERE tablename = 'trust_ledger'
      AND rulename  = 'trust_ledger_no_delete'
  ) THEN
    RAISE EXCEPTION
      'I-L4 VIOLATION: trust_ledger_no_delete rule missing — ledger rows can be deleted';
  END IF;
END;
$$;


-- ---------------------------------------------------------------------------
-- DO Block 5 — I-L5: trust_accounts.debit_block_attested column exists
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name  = 'trust_accounts'
      AND column_name = 'debit_block_attested'
  ) THEN
    RAISE EXCEPTION
      'I-L5 VIOLATION: trust_accounts.debit_block_attested column missing — quarterly attestation not enforceable';
  END IF;
END;
$$;


-- ---------------------------------------------------------------------------
-- DO Block 6 — I-L8: data_class ENUM exists
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'data_class'
  ) THEN
    RAISE EXCEPTION
      'I-L8 VIOLATION: data_class enum type missing — class-scoped access control not enforceable';
  END IF;
END;
$$;


-- ---------------------------------------------------------------------------
-- DO Block 7 — I-L12: matters policy has no current_user_role_group admin branch
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'matters'
      AND qual      LIKE '%current_user_role_group%'
  ) THEN
    RAISE EXCEPTION
      'I-L12 VIOLATION: matters policy still contains current_user_role_group admin branch — replace with break_glass_active()';
  END IF;
END;
$$;


-- ---------------------------------------------------------------------------
-- DO Block 8 — I-L15: purge_walled_context() function exists
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'purge_walled_context'
  ) THEN
    RAISE EXCEPTION
      'I-L15 VIOLATION: purge_walled_context() missing — wall purge protocol not installed';
  END IF;
END;
$$;


-- ---------------------------------------------------------------------------
-- DO Block 9 — I-L17: gig_capture_nonces has no-interactive-insert policy
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename  = 'gig_capture_nonces'
      AND policyname = 'gcn_no_interactive_insert'
  ) THEN
    RAISE EXCEPTION
      'I-L17 VIOLATION: gcn_no_interactive_insert policy missing on gig_capture_nonces — interactive nonce minting not blocked';
  END IF;
END;
$$;


-- ---------------------------------------------------------------------------
-- DO Block 10 — I-L18 + I-L21: server-computed columns locked; trust not in gig funding
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  -- I-L18: authenticated must not hold table-level UPDATE on legal_service_attempts
  IF EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_name     = 'legal_service_attempts'
      AND grantee        = 'authenticated'
      AND privilege_type = 'UPDATE'
  ) THEN
    RAISE EXCEPTION
      'I-L18 VIOLATION: authenticated role retains table-level UPDATE on legal_service_attempts — verdict columns are writable';
  END IF;

  -- I-L21: trust must not appear in the gig funding_source check constraint
  IF EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name LIKE '%legal_gig_postings%'
      AND check_clause     LIKE '%trust%'
  ) THEN
    RAISE EXCEPTION
      'I-L21 VIOLATION: trust principal appears in legal_gig_postings funding_source constraint';
  END IF;
END;
$$;


-- ---------------------------------------------------------------------------
-- Schema comment — Legal Workspace validated
-- ---------------------------------------------------------------------------
COMMENT ON SCHEMA public IS
  'Shtiya Builder Core Ecosystem v3.0 — baseline schema 1001–1059 + Legal Workspace 1060–1066 validated.
   Agent Factory (1070–1076) and HRAG Vault Network (1080–1086) layer on top.';
