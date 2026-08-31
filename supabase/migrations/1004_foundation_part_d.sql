-- =============================================================================
-- 1004_foundation_part_d.sql
-- Shtiya Builder v3.0 — Migration 0001 Part D:
-- Matters, matter parties, representations, ethical walls, conflict checks.
--
-- Builds on 1001 (users, documents, assert_not_billing_actor),
-- 1002 (current_app_user_id, current_user_role_group), 1003 (firms,
-- firm_members).
--
-- Access model for matter-scoped data is two gates, both of which must pass:
--   outer gate — wall_blocks_user() must be false (I-L12)
--   inner gate — is_matter_party() must be true
-- A denied matter is byte-identical to a non-existent one: zero rows, never
-- an error (I-L11).
-- =============================================================================


-- ---------------------------------------------------------------------------
-- Section 1 — matters
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS matters (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id      uuid NOT NULL REFERENCES firms(id),
  matter_type  text NOT NULL CHECK (matter_type IN (
    'real_estate_transactional',   -- data_class: class_re_txn
    'real_estate_litigation',      -- data_class: class_re_liti
    'title',                       -- data_class: class_title
    'loss_mitigation',             -- data_class: class_loss_mit
    'arbitration',                 -- data_class: class_arbitration
    'personal_injury',             -- data_class: class_phi
    'bankruptcy',                  -- data_class: class_insolvency
    'corporate'                    -- data_class: class_mnpi
  )),
  status       text NOT NULL DEFAULT 'open'
                 CHECK (status IN ('open','closed','stayed','archived')),
  opened_at    timestamptz NOT NULL DEFAULT now(),
  closed_at    timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);


-- ---------------------------------------------------------------------------
-- Section 2 — matter_parties (authorization table) + billing guard
--
-- `assert_not_billing_actor()` is defined in Part A and reads NEW.user_id;
-- matter_parties supplies that column, so the shared guard applies as-is.
-- Plain CREATE TRIGGER (never CREATE OR REPLACE TRIGGER) — privilege-lint
-- matches `create\s+trigger\s+trg_\w*_billing_guard`.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS matter_parties (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  matter_id  uuid NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  party_role text NOT NULL CHECK (party_role IN (
    'attorney','client','adverse_party','witness',
    'expert','arbitrator','mediator','co_counsel'
  )),
  joined_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (matter_id, user_id, party_role)
);

-- I-2: billing actors must not appear in authorization tables
DROP TRIGGER IF EXISTS trg_mp_billing_guard ON matter_parties;
CREATE TRIGGER trg_mp_billing_guard  -- I-2
  BEFORE INSERT OR UPDATE ON matter_parties
  FOR EACH ROW EXECUTE FUNCTION assert_not_billing_actor();

REVOKE ALL ON matter_parties FROM public;


-- ---------------------------------------------------------------------------
-- Section 3 — representations
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS representations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  matter_id     uuid NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  attorney_id   uuid NOT NULL REFERENCES users(id),
  client_id     uuid NOT NULL REFERENCES users(id),
  scope         text NOT NULL DEFAULT 'full'
                  CHECK (scope IN ('full','limited','pro_hac_vice')),
  engagement_letter_doc_id uuid REFERENCES documents(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  terminated_at timestamptz,
  UNIQUE (matter_id, attorney_id, client_id)
);


-- ---------------------------------------------------------------------------
-- Section 4 — ethical_walls
-- ---------------------------------------------------------------------------

-- wall_epoch increments on every erection/modification (I-L12)
CREATE TABLE IF NOT EXISTS ethical_walls (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id          uuid NOT NULL REFERENCES firms(id),
  matter_id        uuid NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  screened_user_id uuid NOT NULL REFERENCES users(id),
  erected_by       uuid NOT NULL REFERENCES users(id),
  wall_epoch       integer NOT NULL DEFAULT 1,  -- I-L12: increments on every modification
  erected_at       timestamptz NOT NULL DEFAULT now(),
  removed_at       timestamptz,
  removal_reason   text,
  UNIQUE (matter_id, screened_user_id)
    DEFERRABLE INITIALLY DEFERRED  -- permits epoch-bump updates within a transaction
);


-- ---------------------------------------------------------------------------
-- Section 5 — conflict_checks
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS conflict_checks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  matter_id       uuid NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  checked_by      uuid NOT NULL REFERENCES users(id),
  outcome         text NOT NULL CHECK (outcome IN ('clear','conflict_found','waived')),
  checked_at      timestamptz NOT NULL DEFAULT now(),
  waiver_doc_id   uuid REFERENCES documents(id)
);


-- ---------------------------------------------------------------------------
-- Section 6 — is_matter_party()
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION is_matter_party(p_matter_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.matter_parties
    WHERE matter_id = p_matter_id
      AND user_id   = public.current_app_user_id()
  );
$$;


-- ---------------------------------------------------------------------------
-- Section 7 — wall_blocks_user()
-- ---------------------------------------------------------------------------

-- I-L12: wall overrides all other access — a screened user cannot read any
-- matter row even if they hold a matter_parties record. The wall is the
-- outermost gate; party membership is the innermost gate. Both must pass.
CREATE OR REPLACE FUNCTION wall_blocks_user(p_matter_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.ethical_walls
    WHERE matter_id        = p_matter_id
      AND screened_user_id = public.current_app_user_id()
      AND removed_at       IS NULL
  );
$$;


-- ---------------------------------------------------------------------------
-- Section 8 — Enable row level security
-- ---------------------------------------------------------------------------

ALTER TABLE matters         ENABLE ROW LEVEL SECURITY;
ALTER TABLE matter_parties  ENABLE ROW LEVEL SECURITY;
ALTER TABLE representations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ethical_walls   ENABLE ROW LEVEL SECURITY;
ALTER TABLE conflict_checks ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- Section 9 — RLS policies
--
-- Postgres has no CREATE POLICY IF NOT EXISTS (through 17), so each policy is
-- preceded by DROP POLICY IF EXISTS to keep the migration re-runnable.
-- ---------------------------------------------------------------------------

-- matters: party membership + wall check
-- I-L11: a denied matter is byte-identical to a non-existent matter —
--        both return zero rows, never an error.
-- I-L12: wall_blocks_user() is checked first; it overrides party membership.
DROP POLICY IF EXISTS "matters_party_read" ON matters;
CREATE POLICY "matters_party_read" ON matters FOR SELECT  -- I-L11, I-L12
  USING (
    is_matter_party(id)
    AND NOT wall_blocks_user(id)
    OR current_user_role_group() = 'admin'
  );

-- matter_parties: members of the matter see the party list; wall applies
DROP POLICY IF EXISTS "matter_parties_member_read" ON matter_parties;
CREATE POLICY "matter_parties_member_read" ON matter_parties FOR SELECT
  USING (
    (is_matter_party(matter_id) AND NOT wall_blocks_user(matter_id))
    OR current_user_role_group() = 'admin'
  );

-- representations: parties to the matter can see representations
DROP POLICY IF EXISTS "representations_party_read" ON representations;
CREATE POLICY "representations_party_read" ON representations FOR SELECT
  USING (
    (is_matter_party(matter_id) AND NOT wall_blocks_user(matter_id))
    OR current_user_role_group() = 'admin'
  );

-- ethical_walls: firm partners/admins and platform admins only.
--
-- I-L11: a denied matter is byte-identical to a non-existent matter.
-- I-L12: the screened user cannot read any row that exposes matter_id.
-- A self-read branch (screened_user_id = current_app_user_id()) would let the
-- screened party learn the matter UUID via ethical_walls.matter_id, which is
-- exactly the existence-disclosure I-L11 prohibits. Screened users are notified
-- of screening through out-of-band channels only.
DROP POLICY IF EXISTS "ethical_walls_self_read" ON ethical_walls;
CREATE POLICY "ethical_walls_self_read" ON ethical_walls FOR SELECT  -- I-L11, I-L12
  USING (
    (
      NOT wall_blocks_user(matter_id)
      AND EXISTS (
        SELECT 1 FROM public.firm_members
        WHERE firm_id   = ethical_walls.firm_id
          AND user_id   = public.current_app_user_id()
          AND member_role IN ('partner','admin')
      )
    )
    OR current_user_role_group() = 'admin'
  );

-- conflict_checks: matter parties can read
DROP POLICY IF EXISTS "conflict_checks_party_read" ON conflict_checks;
CREATE POLICY "conflict_checks_party_read" ON conflict_checks FOR SELECT
  USING (
    (is_matter_party(matter_id) AND NOT wall_blocks_user(matter_id))
    OR current_user_role_group() = 'admin'
  );


-- ---------------------------------------------------------------------------
-- Section 10 — Wire documents.matter_id FK
--
-- Part A declared `documents.matter_id uuid` with a comment: "FK added after
-- matters table exists (Part D)". Now that matters is created above, add the
-- constraint. IF NOT EXISTS is not valid for ADD CONSTRAINT — guard with a
-- DO block instead.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema    = 'public'
      AND table_name      = 'documents'
      AND constraint_name = 'documents_matter_id_fkey'
  ) THEN
    ALTER TABLE documents
      ADD CONSTRAINT documents_matter_id_fkey
      FOREIGN KEY (matter_id) REFERENCES matters(id);
  END IF;
END $$;
