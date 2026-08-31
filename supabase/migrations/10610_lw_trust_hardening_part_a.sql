-- =============================================================================
-- 1061_lw_trust_hardening_part_a.sql
-- Shtiya Builder v3.0 — Trust hardening Part A:
-- Schema additions, new tables, and column-level guards.
--
-- SCHEMA NOTE: trust_accounts.attested_at maps to the Plan's
-- debit_block_attested_at. trust_ledger additive columns (client_id,
-- amount_cents, entry_kind) are added here; the Phase 1 columns
-- (client_user_id, usd_amount_cents, debit_kind) are preserved.
--
-- CORRECTION vs task spec: ADD CONSTRAINT IF NOT EXISTS is not valid
-- PostgreSQL syntax (verified: "syntax error at or near NOT"). Both the payee
-- FK and the entry_kind CHECK use DO-block guards instead, following the
-- precedent already set in 1004 §10.
--
-- Part B (1061_lw_trust_hardening_part_b.sql) adds the disbursement
-- dual-control trigger, hash-chain seal, immutability guard, and
-- reconciliation helper.
--
-- I-L1: dual control enforced on natural persons via identity_subjects.
-- I-L2: per-client solvency — balance_cents >= 0 is the anti-commingling control.
-- I-L3: entry_kind enumeration IS the control on permitted operations.
-- I-L5: debit-block attestation must be current; reattestation due in 90 days.
-- I-L6: earned-fee transfer requires a delivered, undisputed invoice.
--
-- Builds on 1005 (trust_accounts, trust_ledger), 1060 (identity_subjects).
-- =============================================================================


-- ---------------------------------------------------------------------------
-- Section 1 — trust_accounts additive columns
-- ---------------------------------------------------------------------------

-- I-L5 additions: reattestation schedule, freeze state, operating account ref,
-- IOLTA payee FK, bond/E&O expiry.
ALTER TABLE trust_accounts
  ADD COLUMN IF NOT EXISTS debit_block_reattest_due  timestamptz,
  ADD COLUMN IF NOT EXISTS operating_account_ref     text,
  ADD COLUMN IF NOT EXISTS interest_program_payee_id uuid,
  ADD COLUMN IF NOT EXISTS bond_expires_at           timestamptz,
  ADD COLUMN IF NOT EXISTS eo_expires_at             timestamptz,
  ADD COLUMN IF NOT EXISTS frozen_at                 timestamptz,
  ADD COLUMN IF NOT EXISTS frozen_reason             text;


-- ---------------------------------------------------------------------------
-- Section 2 — guard_trust_account_status() + trigger
-- ---------------------------------------------------------------------------

-- I-L5: when debit_block_attested flips true, compute the reattestation due date.
CREATE OR REPLACE FUNCTION public.guard_trust_account_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- attested_at is the Phase 1 column name (Plan calls it debit_block_attested_at)
  IF NEW.debit_block_attested = true AND NEW.attested_at IS NOT NULL THEN
    NEW.debit_block_reattest_due := NEW.attested_at + INTERVAL '90 days';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trust_account_attest_guard ON trust_accounts;
CREATE TRIGGER trust_account_attest_guard
  BEFORE INSERT OR UPDATE ON trust_accounts
  FOR EACH ROW EXECUTE FUNCTION public.guard_trust_account_status();


-- ---------------------------------------------------------------------------
-- Section 3 — bar_foundation_payees
-- ---------------------------------------------------------------------------

-- IOLTA: interest remittance may ONLY go to a registered bar foundation payee.
CREATE TABLE IF NOT EXISTS bar_foundation_payees (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  jurisdiction text NOT NULL,
  program_name text NOT NULL,
  payee_ref    text NOT NULL,
  verified_at  timestamptz NOT NULL,
  UNIQUE (jurisdiction, payee_ref)
);

-- ADD CONSTRAINT has no IF NOT EXISTS form; guard with a DO block (cf. 1004 §10).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema    = 'public'
      AND table_name      = 'trust_accounts'
      AND constraint_name = 'trust_accounts_payee_fk'
  ) THEN
    ALTER TABLE trust_accounts
      ADD CONSTRAINT trust_accounts_payee_fk
      FOREIGN KEY (interest_program_payee_id) REFERENCES bar_foundation_payees(id);
  END IF;
END;
$$;


-- ---------------------------------------------------------------------------
-- Section 4 — trust_client_balances (per-client sub-ledger)
-- ---------------------------------------------------------------------------

-- I-L2: per-client solvency. balance_cents >= 0 is the anti-commingling control.
-- A debit that would take a client's balance negative raises 23514 at the DB level.
CREATE TABLE IF NOT EXISTS trust_client_balances (
  trust_account_id uuid   NOT NULL REFERENCES trust_accounts(id),
  matter_id        uuid   NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  client_id        uuid   NOT NULL REFERENCES users(id),
  balance_cents    bigint NOT NULL DEFAULT 0 CHECK (balance_cents >= 0),  -- I-L2
  updated_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (trust_account_id, matter_id, client_id)
);


-- ---------------------------------------------------------------------------
-- Section 5 — trust_ledger additive columns + entry_kind constraint
-- ---------------------------------------------------------------------------

-- Additive columns for the hardening layer.
-- client_user_id / usd_amount_cents / debit_kind preserved from Phase 1.
ALTER TABLE trust_ledger
  ADD COLUMN IF NOT EXISTS client_id           uuid REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS amount_cents        bigint,
  ADD COLUMN IF NOT EXISTS entry_kind          text,
  ADD COLUMN IF NOT EXISTS invoice_id          uuid,
  ADD COLUMN IF NOT EXISTS reversal_of         uuid REFERENCES trust_ledger(id),
  ADD COLUMN IF NOT EXISTS payee_ref           text,
  ADD COLUMN IF NOT EXISTS maker_auth_ref      text,
  ADD COLUMN IF NOT EXISTS checker_auth_ref    text,
  ADD COLUMN IF NOT EXISTS checker_attested_at timestamptz,
  ADD COLUMN IF NOT EXISTS checker_saw_detail  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS seq                 bigint,
  ADD COLUMN IF NOT EXISTS prev_hash           text,
  ADD COLUMN IF NOT EXISTS row_hash            text;

-- I-L3: entry_kind enumeration IS the control. Platform fees are deliberately absent.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema    = 'public'
      AND table_name      = 'trust_ledger'
      AND constraint_name = 'trust_entry_kind_ck'
  ) THEN
    ALTER TABLE trust_ledger
      ADD CONSTRAINT trust_entry_kind_ck CHECK (entry_kind IN (
        'client_deposit', 'client_disbursement', 'approved_settlement_line',
        'earned_fee_transfer', 'court_ordered_payment', 'interpleader_deposit',
        'interest_remittance', 'contra_reversal'
      ));
  END IF;
END;
$$;


-- ---------------------------------------------------------------------------
-- Section 6 — apply_trust_balance() + trigger (I-L2)
-- ---------------------------------------------------------------------------

-- I-L2: every INSERT on trust_ledger updates the per-client sub-ledger.
-- FOR UPDATE serialises concurrent disbursements against the same sub-ledger row.
-- The check (balance_cents >= 0) raises 23514 on overdraw — that IS the control.
CREATE OR REPLACE FUNCTION public.apply_trust_balance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  delta bigint;
BEGIN
  IF NEW.client_id IS NULL THEN
    RAISE EXCEPTION 'I-L2: every trust entry names a client' USING ERRCODE = '23514';
  END IF;
  delta := CASE
    WHEN NEW.direction = 'credit' THEN  NEW.amount_cents
    ELSE                               -NEW.amount_cents
  END;

  INSERT INTO public.trust_client_balances
    (trust_account_id, matter_id, client_id, balance_cents)
  VALUES
    (NEW.trust_account_id, NEW.matter_id, NEW.client_id, 0)
  ON CONFLICT DO NOTHING;

  PERFORM 1 FROM public.trust_client_balances
  WHERE trust_account_id = NEW.trust_account_id
    AND matter_id         = NEW.matter_id
    AND client_id         = NEW.client_id
  FOR UPDATE;

  UPDATE public.trust_client_balances
     SET balance_cents = balance_cents + delta,
         updated_at    = now()
   WHERE trust_account_id = NEW.trust_account_id
     AND matter_id         = NEW.matter_id
     AND client_id         = NEW.client_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trust_ledger_balance_apply ON trust_ledger;
CREATE TRIGGER trust_ledger_balance_apply
  AFTER INSERT ON trust_ledger
  FOR EACH ROW EXECUTE FUNCTION public.apply_trust_balance();


-- ---------------------------------------------------------------------------
-- Section 7 — legal_invoices (I-L6)
-- ---------------------------------------------------------------------------

-- I-L6: earned-fee transfer guard requires a delivered invoice.
CREATE TABLE IF NOT EXISTS legal_invoices (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  matter_id             uuid NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  client_id             uuid NOT NULL REFERENCES users(id),
  amount_cents          bigint NOT NULL CHECK (amount_cents > 0),
  issued_at             timestamptz NOT NULL DEFAULT now(),
  delivered_at          timestamptz,
  notice_period_ends_at timestamptz,
  disputed_at           timestamptz,
  voided_at             timestamptz
);


-- ---------------------------------------------------------------------------
-- Section 8 — RLS, REVOKE, GRANT
-- ---------------------------------------------------------------------------

ALTER TABLE bar_foundation_payees   ENABLE ROW LEVEL SECURITY;
ALTER TABLE trust_client_balances   ENABLE ROW LEVEL SECURITY;
ALTER TABLE legal_invoices          ENABLE ROW LEVEL SECURITY;

-- bar_foundation_payees: public platform metadata — any authenticated session
DROP POLICY IF EXISTS "bar_foundation_payees_read" ON bar_foundation_payees;
CREATE POLICY "bar_foundation_payees_read" ON bar_foundation_payees FOR SELECT
  USING (public.current_app_user_id() IS NOT NULL);

-- trust_client_balances: firm members of the owning trust account.
-- CORRECTION vs task spec: this table carries a direct matter_id FK, so
-- wall-lint requires a wall term — and correctly so. Without it a screened
-- firm member could read the per-client balance of a walled matter, which
-- discloses both the matter's existence and its financial position
-- (I-L11 / I-L12).
DROP POLICY IF EXISTS "trust_client_balances_firm_read" ON trust_client_balances;
CREATE POLICY "trust_client_balances_firm_read" ON trust_client_balances FOR SELECT
  USING (
    (                                                -- I-L11, I-L12
      EXISTS (
        SELECT 1 FROM public.trust_accounts ta
        JOIN public.firm_members fm ON fm.firm_id = ta.firm_id
        WHERE ta.id     = trust_client_balances.trust_account_id
          AND fm.user_id = public.current_app_user_id()
      )
      AND NOT public.wall_blocks_user(matter_id)
    )
    OR public.current_user_role_group() = 'admin'
  );

-- legal_invoices: client or firm member of the matter's trust account
DROP POLICY IF EXISTS "legal_invoices_party_read" ON legal_invoices;
CREATE POLICY "legal_invoices_party_read" ON legal_invoices FOR SELECT
  USING (
    client_id = public.current_app_user_id()
    OR (
      public.is_matter_party(matter_id)
      AND NOT public.wall_blocks_user(matter_id)
    )
    OR public.current_user_role_group() = 'admin'
  );

REVOKE ALL ON bar_foundation_payees FROM public;
REVOKE ALL ON trust_client_balances FROM public;
REVOKE ALL ON legal_invoices        FROM public;

GRANT SELECT ON bar_foundation_payees TO authenticated, service_role;
GRANT SELECT ON trust_client_balances TO authenticated, service_role;
GRANT SELECT ON legal_invoices        TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.guard_trust_account_status() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.apply_trust_balance()        TO authenticated, service_role;
