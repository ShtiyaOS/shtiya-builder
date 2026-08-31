-- =============================================================================
-- 1005_foundation_part_e.sql
-- Shtiya Builder v3.0 — Migration 0001 Part E:
-- Attorney trust accounts and the append-only trust ledger.
--
-- Builds on 1001 (users), 1002 (current_app_user_id, current_user_role_group),
-- 1003 (firms, firm_members), 1004 (matters, wall_blocks_user).
--
-- Invariant coverage in this migration is the BASELINE layer. The structural
-- constraints live here; the runtime guards that complete them are wired in
-- migration 1061, once identity_subjects exists:
--
--   I-L1  maker <> checker            baseline CHECK here; identity-subject
--                                     dual-control trigger in 1061
--   I-L3  debit_kind CHECK            complete here
--   I-L4  append-only ledger          structural here; UPDATE/DELETE-blocking
--                                     trigger in 1061
--   I-L5  quarterly re-attestation    column + comment here; scheduler in 1061
--   I-L6  per-client solvency         stub note here; balance enforcement in 1061
-- =============================================================================


-- ---------------------------------------------------------------------------
-- Section 1 — trust_accounts
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS trust_accounts (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id               uuid NOT NULL REFERENCES firms(id),
  account_name          text NOT NULL,
  bank_routing          text,
  bank_account_last4    text,
  -- I-L5: debit_block_attested must be re-attested at least quarterly
  debit_block_attested  boolean NOT NULL DEFAULT false,  -- I-L5
  attested_at           timestamptz,
  status                text NOT NULL DEFAULT 'open'
                          CHECK (status IN ('open','frozen','closed')),
  created_at            timestamptz NOT NULL DEFAULT now()
);


-- ---------------------------------------------------------------------------
-- Section 2 — trust_ledger
-- ---------------------------------------------------------------------------

-- I-L4: Ledger is append-only: no UPDATE, no DELETE permitted.
-- Enforcement: trust_ledger_append_only trigger added in migration 1061.
-- The constraint here is structural (no update/delete triggers wired yet).
--
-- I-L6: per-client solvency — a debit must never exceed the client's current
-- balance for the owning trust account. Not enforceable by a row-local CHECK
-- (it needs an aggregate over prior rows for client_user_id), so this migration
-- carries the stub note only; the balance guard lands in migration 1061.
CREATE TABLE IF NOT EXISTS trust_ledger (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trust_account_id uuid NOT NULL REFERENCES trust_accounts(id),
  matter_id        uuid REFERENCES matters(id),
  -- I-L1 baseline: maker and checker must differ. Full identity-subject
  -- dual-control check added in migration 1061 (after identity_subjects table exists).
  maker_id         uuid NOT NULL REFERENCES users(id),   -- I-L1
  checker_id       uuid NOT NULL REFERENCES users(id),   -- I-L1
  client_user_id   uuid NOT NULL REFERENCES users(id),   -- I-L6
  -- I-L3: debit_kind covers all permitted debit categories; no others allowed
  debit_kind       text NOT NULL                         -- I-L3
                     CHECK (debit_kind IN (
                       'client_disbursement',
                       'fee_earned_transfer',
                       'court_filing_fee',
                       'expert_fee',
                       'arbitration_fee',
                       'refund_to_client',
                       'deposit'               -- deposits are positive; others are debits
                     )),
  usd_amount_cents bigint NOT NULL CHECK (usd_amount_cents > 0),
  direction        text NOT NULL CHECK (direction IN ('credit','debit')),
  status           text NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','cleared','reversed','disputed')),
  memo             text,
  created_at       timestamptz NOT NULL DEFAULT now(),

  -- I-L1 baseline: makers and checkers must be different users.
  -- Full identity-subject check (different legal persons, not just different UUIDs)
  -- is enforced by the guard trigger added in migration 1061.
  CONSTRAINT trust_ledger_no_dual_same_person  -- I-L1
    CHECK (maker_id <> checker_id)
);


-- ---------------------------------------------------------------------------
-- Section 3 — Indexes on trust_ledger
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS trust_ledger_account_time_idx
  ON trust_ledger(trust_account_id, created_at DESC);

CREATE INDEX IF NOT EXISTS trust_ledger_client_idx
  ON trust_ledger(client_user_id);


-- ---------------------------------------------------------------------------
-- Section 4 — Enable row level security
-- ---------------------------------------------------------------------------

ALTER TABLE trust_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE trust_ledger   ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- Section 5 — RLS policies
--
-- Postgres has no CREATE POLICY IF NOT EXISTS (through 17), so each policy is
-- preceded by DROP POLICY IF EXISTS to keep the migration re-runnable.
-- ---------------------------------------------------------------------------

-- trust_accounts: firm members (partners/associates) can read their firm's accounts
DROP POLICY IF EXISTS "trust_accounts_firm_read" ON trust_accounts;
CREATE POLICY "trust_accounts_firm_read" ON trust_accounts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.firm_members
      WHERE firm_id = trust_accounts.firm_id
        AND user_id = public.current_app_user_id()
    )
    OR current_user_role_group() = 'admin'
  );

-- trust_ledger: the client, maker, or checker for a row may read it;
-- firm members of the associated trust account's firm may also read.
-- matter-scoped rows respect wall_blocks_user when matter_id is set.
DROP POLICY IF EXISTS "trust_ledger_party_read" ON trust_ledger;
CREATE POLICY "trust_ledger_party_read" ON trust_ledger FOR SELECT
  USING (
    (
      (
        client_user_id = public.current_app_user_id()
        OR maker_id    = public.current_app_user_id()
        OR checker_id  = public.current_app_user_id()
        OR EXISTS (
          SELECT 1 FROM public.trust_accounts ta
          JOIN public.firm_members fm ON fm.firm_id = ta.firm_id
          WHERE ta.id     = trust_ledger.trust_account_id
            AND fm.user_id = public.current_app_user_id()
        )
      )
      AND (matter_id IS NULL OR NOT public.wall_blocks_user(matter_id))
    )
    OR current_user_role_group() = 'admin'
  );


-- ---------------------------------------------------------------------------
-- Section 6 — REVOKE
-- ---------------------------------------------------------------------------

REVOKE ALL ON trust_accounts FROM public;
REVOKE ALL ON trust_ledger   FROM public;
