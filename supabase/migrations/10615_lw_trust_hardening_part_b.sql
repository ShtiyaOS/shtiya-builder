-- =============================================================================
-- 1061_lw_trust_hardening_part_b.sql
-- Shtiya Builder v3.0 — Trust hardening Part B:
-- Dual-control disbursement guard, earned-fee transfer guard, interest
-- routing guard, append-only rules, hash-chain seal, immutability guard,
-- and three-way reconciliation helper.
--
-- Depends on Part A for: trust_client_balances, legal_invoices,
-- bar_foundation_payees, and the trust_ledger additive columns
-- (entry_kind, amount_cents, client_id, payee_ref, etc.).
--
-- CORRECTIONS vs the Plan source (each verified against a live database):
--   - acct.debit_block_attested_at -> acct.attested_at (1005 column name).
--   - fm.firm_role -> fm.member_role (1003 column name); the 'partner' value
--     is unchanged and is valid for member_role.
--   - All guards are SECURITY DEFINER. The Plan declares them with
--     `set search_path = ''` but no SECURITY DEFINER, so they would run as the
--     invoker and read public.users — which has RLS enabled and NO policy.
--     Verified: as `authenticated`, the identity-subject lookup returns NULL,
--     so every disbursement would fail DUAL_CONTROL_REQUIRED regardless of
--     how well-formed it was.
--   - digest() is called as public.digest(). Under `search_path = ''` the
--     unqualified form fails with "function digest(unknown, unknown) does not
--     exist" — pgcrypto installs into public (1001).
--
-- KNOWN CONFLICT — 1059 DO Block 3 (I-L4) asserts trust_ledger has zero
-- UPDATE/DELETE triggers. trust_ledger_immutable below is a BEFORE UPDATE
-- trigger, so re-running 1059 after this migration raises
-- "I-L4 VIOLATION: trust_ledger has 1 UPDATE/DELETE triggers". A fresh
-- `supabase db reset` is unaffected (1059 runs before 1061). See the task
-- notes; resolving it requires amending 1059, which is outside this sprint.
--
-- I-L1: unconditional dual control — identity-subject comparison, not user-id.
-- I-L3: contra_reversal must name reversal_of; earned_fee must land in
--        operating account only.
-- I-L4: append-only via rule + immutability guard.
-- I-L5: debit-block attestation staleness check blocks all disbursements.
-- I-L6: earned-fee transfer requires delivered invoice within notice period.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- Section 1 — Retire any Phase 1 disbursement guard stub
--
-- Phase 1 (1005) installed no disbursement guard trigger, and 1059 block 3
-- checked for the ABSENCE of UPDATE/DELETE triggers. This DROP is a no-op on a
-- clean database and a safety net on a re-apply.
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS trust_ledger_disbursement_guard ON trust_ledger;


-- ---------------------------------------------------------------------------
-- Section 2 — guard_trust_disbursement_v2() (I-L1 / I-L5)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.guard_trust_disbursement_v2()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  acct            public.trust_accounts;
  esc_threshold   bigint := 1000000;        -- $10,000 → escalation tier
  maker_subject   uuid;
  checker_subject uuid;
  window_start    timestamptz := now() - interval '24 hours';
  window_total    bigint;
BEGIN
  -- Only applies to disbursements
  IF NEW.direction <> 'debit' THEN RETURN NEW; END IF;

  SELECT * INTO acct FROM public.trust_accounts
  WHERE id = NEW.trust_account_id;

  -- Account-level blocks
  IF acct.frozen_at IS NOT NULL THEN
    RAISE EXCEPTION 'ACCOUNT_FROZEN: %', acct.frozen_reason USING ERRCODE = '42501';
  END IF;
  IF acct.bond_expires_at IS NOT NULL AND acct.bond_expires_at < now() THEN
    RAISE EXCEPTION 'ACCOUNT_FROZEN: bond lapsed' USING ERRCODE = '42501';
  END IF;
  IF acct.eo_expires_at IS NOT NULL AND acct.eo_expires_at < now() THEN
    RAISE EXCEPTION 'ACCOUNT_FROZEN: E&O lapsed' USING ERRCODE = '42501';
  END IF;
  -- I-L5: debit-block attestation must be current (attested_at per 1005)
  IF acct.attested_at IS NULL
     OR acct.debit_block_reattest_due IS NULL
     OR acct.debit_block_reattest_due < now() THEN
    RAISE EXCEPTION 'ACCOUNT_FROZEN: ACH debit-block attestation absent or stale'
      USING ERRCODE = '42501';
  END IF;

  -- Contra-reversals must name the row they reverse (I-L4)
  IF NEW.entry_kind = 'contra_reversal' THEN
    IF NEW.reversal_of IS NULL THEN
      RAISE EXCEPTION 'I-L4: a contra entry must name the row it reverses'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  -- Unconditional dual control: both maker and checker required, always
  IF NEW.maker_id IS NULL OR NEW.checker_id IS NULL THEN
    RAISE EXCEPTION 'DUAL_CONTROL_REQUIRED: maker and checker are both mandatory'
      USING ERRCODE = '42501';
  END IF;

  -- Identity-subject comparison: compare PEOPLE, not user rows
  SELECT identity_subject_id INTO maker_subject
  FROM public.users WHERE id = NEW.maker_id;
  SELECT identity_subject_id INTO checker_subject
  FROM public.users WHERE id = NEW.checker_id;

  IF maker_subject IS NULL OR checker_subject IS NULL THEN
    RAISE EXCEPTION 'DUAL_CONTROL_REQUIRED: both signers must be identity-verified'
      USING ERRCODE = '42501';
  END IF;
  IF maker_subject = checker_subject THEN
    RAISE EXCEPTION 'DUAL_CONTROL_REQUIRED: maker and checker are the same natural person'
      USING ERRCODE = '42501';
  END IF;

  -- A checker who never loaded the payee detail is not a control (I-L1)
  IF NOT NEW.checker_saw_detail
     OR NEW.checker_auth_ref IS NULL
     OR NEW.checker_attested_at IS NULL
     OR NEW.checker_attested_at < now() - interval '15 minutes' THEN
    RAISE EXCEPTION 'DUAL_CONTROL_REQUIRED: fresh step-up attestation on reviewed detail required'
      USING ERRCODE = '42501';
  END IF;

  -- Escalation tier: responsible attorney + out-of-band confirmation
  IF NEW.amount_cents >= esc_threshold THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.firm_members fm
      JOIN public.matters m ON m.firm_id = fm.firm_id
      WHERE m.id = NEW.matter_id
        AND fm.user_id     = NEW.checker_id
        AND fm.member_role = 'partner'  -- responsible attorney seat (1003 column)
    ) THEN
      RAISE EXCEPTION 'DUAL_CONTROL_REQUIRED: escalation tier requires responsible attorney as checker'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Anti-structuring: rolling 24h aggregate per (matter, client) also escalates
  SELECT coalesce(sum(amount_cents), 0) INTO window_total
  FROM public.trust_ledger
  WHERE matter_id   = NEW.matter_id
    AND client_id   = NEW.client_id
    AND direction   = 'debit'
    AND created_at >= window_start;

  IF window_total + NEW.amount_cents >= esc_threshold THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.firm_members fm
      JOIN public.matters m ON m.firm_id = fm.firm_id
      WHERE m.id = NEW.matter_id
        AND fm.user_id     = NEW.checker_id
        AND fm.member_role = 'partner'
    ) THEN
      RAISE EXCEPTION 'DUAL_CONTROL_REQUIRED: 24h aggregate crosses escalation tier'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Frozen disputed deposits block all disbursements for that matter
  IF EXISTS (
    SELECT 1 FROM public.trust_client_balances tcb
    WHERE tcb.trust_account_id = NEW.trust_account_id
      AND tcb.matter_id        = NEW.matter_id
      AND tcb.client_id        = NEW.client_id
      AND tcb.balance_cents    = 0
  ) AND NEW.entry_kind NOT IN ('contra_reversal','interpleader_deposit') THEN
    RAISE EXCEPTION 'DEPOSIT_DISPUTED_OR_ZERO' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trust_ledger_disbursement_guard_v2 ON trust_ledger;
CREATE TRIGGER trust_ledger_disbursement_guard_v2
  BEFORE INSERT ON trust_ledger
  FOR EACH ROW EXECUTE FUNCTION public.guard_trust_disbursement_v2();


-- ---------------------------------------------------------------------------
-- Section 3 — guard_earned_fee_transfer() (I-L6 / I-L3)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.guard_earned_fee_transfer()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  inv   public.legal_invoices;
  drawn bigint;
BEGIN
  IF NEW.entry_kind <> 'earned_fee_transfer' THEN RETURN NEW; END IF;

  IF NEW.invoice_id IS NULL THEN
    RAISE EXCEPTION 'I-L6: earned-fee transfer requires an invoice'
      USING ERRCODE = '42501';
  END IF;
  SELECT * INTO inv FROM public.legal_invoices WHERE id = NEW.invoice_id;

  IF inv.matter_id <> NEW.matter_id OR inv.client_id <> NEW.client_id THEN
    RAISE EXCEPTION 'I-L6: invoice does not belong to this matter/client'
      USING ERRCODE = '42501';
  END IF;
  IF inv.delivered_at IS NULL
     OR inv.notice_period_ends_at > now()
     OR inv.disputed_at IS NOT NULL
     OR inv.voided_at IS NOT NULL THEN
    RAISE EXCEPTION 'I-L6: invoice undelivered, within notice period, disputed, or void'
      USING ERRCODE = '42501';
  END IF;
  -- Must land in the firm operating account, never another trust account (I-L3)
  IF NEW.payee_ref IS DISTINCT FROM (
    SELECT operating_account_ref FROM public.trust_accounts
    WHERE id = NEW.trust_account_id
  ) THEN
    RAISE EXCEPTION 'I-L3: earned fees must transfer to the firm operating account only'
      USING ERRCODE = '42501';
  END IF;
  -- Cannot exceed the invoice remainder
  SELECT coalesce(sum(amount_cents), 0) INTO drawn
  FROM public.trust_ledger
  WHERE invoice_id  = NEW.invoice_id
    AND entry_kind  = 'earned_fee_transfer';
  IF drawn + NEW.amount_cents > inv.amount_cents THEN
    RAISE EXCEPTION 'I-L6: transfer exceeds invoice remainder' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trust_ledger_fee_guard ON trust_ledger;
CREATE TRIGGER trust_ledger_fee_guard
  BEFORE INSERT ON trust_ledger
  FOR EACH ROW EXECUTE FUNCTION public.guard_earned_fee_transfer();


-- ---------------------------------------------------------------------------
-- Section 4 — guard_interest_remittance() (IOLTA)
-- ---------------------------------------------------------------------------

-- IOLTA interest belongs to the state bar foundation — not the firm, not the client.
CREATE OR REPLACE FUNCTION public.guard_interest_remittance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.entry_kind <> 'interest_remittance' THEN RETURN NEW; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.bar_foundation_payees p
    JOIN public.trust_accounts a ON a.interest_program_payee_id = p.id
    WHERE a.id = NEW.trust_account_id
      AND p.payee_ref = NEW.payee_ref
  ) THEN
    RAISE EXCEPTION 'IOLTA: interest remits only to the registered bar foundation payee'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trust_ledger_interest_guard ON trust_ledger;
CREATE TRIGGER trust_ledger_interest_guard
  BEFORE INSERT ON trust_ledger
  FOR EACH ROW EXECUTE FUNCTION public.guard_interest_remittance();


-- ---------------------------------------------------------------------------
-- Section 5 — Append-only rule + hash-chain seal + immutability guard (I-L4)
--
-- Trigger firing order on trust_ledger is alphabetical by trigger name, so the
-- BEFORE INSERT order is: disbursement_guard_v2 → fee_guard → interest_guard →
-- seal. The seal runs last, hashing a row every guard has already accepted.
-- ---------------------------------------------------------------------------

-- The ledger is corrected by contra-entry, never by UPDATE or DELETE.
CREATE OR REPLACE RULE trust_ledger_no_delete
  AS ON DELETE TO trust_ledger DO INSTEAD NOTHING;

-- seal_trust_row(): compute seq and SHA-256 hash chain on every INSERT.
-- digest() must be schema-qualified: search_path is '' and pgcrypto lives in
-- the extensions schema on this cluster (OI-1). Use extensions.digest().
CREATE OR REPLACE FUNCTION public.seal_trust_row()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  prev record;
BEGIN
  SELECT seq, row_hash INTO prev
  FROM public.trust_ledger
  WHERE trust_account_id = NEW.trust_account_id
  ORDER BY seq DESC NULLS LAST
  LIMIT 1;

  NEW.seq       := coalesce(prev.seq, 0) + 1;
  NEW.prev_hash := prev.row_hash;
  NEW.row_hash  := encode(
    extensions.digest(
      coalesce(NEW.prev_hash, '') ||
      NEW.id::text                ||
      NEW.trust_account_id::text  ||
      NEW.matter_id::text         ||
      coalesce(NEW.client_id::text, '') ||
      NEW.direction               ||
      NEW.amount_cents::text      ||
      coalesce(NEW.payee_ref, '') ||
      coalesce(NEW.entry_kind, '') ||
      NEW.seq::text,
      'sha256'
    ),
    'hex'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trust_ledger_seal ON trust_ledger;
CREATE TRIGGER trust_ledger_seal
  BEFORE INSERT ON trust_ledger
  FOR EACH ROW EXECUTE FUNCTION public.seal_trust_row();

-- Financial fields are immutable after write. Correction is by contra-entry.
CREATE OR REPLACE FUNCTION public.guard_trust_immutable()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF (
    OLD.amount_cents, OLD.direction, OLD.payee_ref,
    OLD.client_id, OLD.matter_id, OLD.entry_kind, OLD.row_hash
  ) IS DISTINCT FROM (
    NEW.amount_cents, NEW.direction, NEW.payee_ref,
    NEW.client_id, NEW.matter_id, NEW.entry_kind, NEW.row_hash
  ) THEN
    RAISE EXCEPTION 'I-L4: trust entries are corrected by contra-entry, never edited'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trust_ledger_immutable ON trust_ledger;
CREATE TRIGGER trust_ledger_immutable
  BEFORE UPDATE ON trust_ledger
  FOR EACH ROW EXECUTE FUNCTION public.guard_trust_immutable();


-- ---------------------------------------------------------------------------
-- Section 6 — assert_three_way() reconciliation helper
-- ---------------------------------------------------------------------------

-- Three-way reconciliation: bank ↔ ledger ↔ file (sum of per-client sub-ledger).
CREATE OR REPLACE FUNCTION public.assert_three_way(p_account uuid, p_as_of date)
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(SUM(balance_cents), 0)
  FROM public.trust_client_balances
  WHERE trust_account_id = p_account;
$$;

GRANT EXECUTE ON FUNCTION public.assert_three_way(uuid, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.guard_trust_disbursement_v2() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.guard_earned_fee_transfer()   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.guard_interest_remittance()   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.seal_trust_row()              TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.guard_trust_immutable()       TO authenticated, service_role;
