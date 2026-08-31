-- =============================================================================
-- 1060_lw_identity_and_classes.sql
-- Shtiya Builder v3.0 — Legal Workspace part 1:
-- Identity subjects, the data_class type system, and matter class grants.
--
-- First Phase 2 migration. Installs the identity verification layer and the
-- data-class types that every later Legal Workspace migration depends on.
--
-- SCHEMA CORRECTIONS vs task spec (each verified against the live schema):
--   - matter_parties had no `status` / `expires_at` columns. Section 0b adds
--     them; is_matter_party() cannot compile without them (LANGUAGE sql bodies
--     are validated at CREATE time).
--   - matter_parties has `party_role`, not `matter_role`, and its CHECK has no
--     'lead_counsel'/'supervising_attorney'. The counsel-of-record test in
--     Section 6 gates on party_role IN ('attorney','co_counsel') instead; the
--     party_role CHECK is left untouched.
--   - Section 8 uses CREATE OR REPLACE, not DROP FUNCTION. Dropping
--     is_matter_party(uuid) fails: 24 references across six migrations, and
--     policies on matters / matter_parties / representations / conflict_checks
--     / documents depend on it. CASCADE would delete those policies outright.
--   - The replacement keeps the original parameter name `p_matter_id`;
--     CREATE OR REPLACE cannot rename an input parameter.
--   - CREATE TYPE has no IF NOT EXISTS. Both ENUMs are guarded by a DO block so
--     the migration chain stays re-runnable end to end.
--
-- has_data_class_grant() is deliberately left as the 1041 stub (returns false).
-- matter_class_grants is created here, but wiring the accessor to it changes
-- read behaviour on all five 1041 workbench tables — that belongs to 1063.
--
-- I-L1:  dual control compares natural persons, not user rows.
-- I-L8:  class_general by default; any other class is an explicit, logged act.
-- I-L14: is_matter_party_for() is the explicit-subject variant for
--        service-role paths, which must never rely on auth.uid.
--
-- Builds on 1001 (users), 1002 (current_app_user_id, current_user_role_group),
-- 1004 (matters, matter_parties, wall_blocks_user).
-- =============================================================================


-- ---------------------------------------------------------------------------
-- Section 0 — screened_from_matter stubs (forward dependency)
--
-- Full implementation lands in 1062 (wall-hardening), which adds cluster-scope
-- and client-scope wall evaluation. These stubs handle the matter-scope case
-- only — which is all that exists in the Phase 1 ethical_walls schema.
--
-- screened_from_matter_for() takes an explicit p_user parameter and queries
-- ethical_walls directly. It MUST NOT delegate to wall_blocks_user(), which
-- hardcodes current_app_user_id() — a session-dependent function. Delegating
-- would cause screened_from_matter_for(Bob, M) to answer differently depending
-- on who is calling, making the explicit-subject variant (I-L14) incorrect on
-- any service-role path with no session principal.
-- ---------------------------------------------------------------------------

-- Stub: parameterised matter-scope wall check.
-- Full cluster/client scope added in migration 1062 (wall-hardening).
CREATE OR REPLACE FUNCTION public.screened_from_matter_for(p_user uuid, p_matter uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.ethical_walls
    WHERE matter_id        = p_matter
      AND screened_user_id = p_user
      AND removed_at       IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.screened_from_matter(p_matter uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.screened_from_matter_for(public.current_app_user_id(), p_matter);
$$;


-- ---------------------------------------------------------------------------
-- Section 0b — matter_parties: status + expires_at
--
-- Required by Sections 6 and 8. `status` defaults to 'active' so every existing
-- party row keeps its current access; `expires_at` NULL means no expiry.
-- The party_role CHECK is intentionally NOT modified.
-- ---------------------------------------------------------------------------

ALTER TABLE matter_parties
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','inactive','withdrawn')),
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

CREATE INDEX IF NOT EXISTS mp_active_lookup
  ON matter_parties(user_id, matter_id)
  WHERE status = 'active';


-- ---------------------------------------------------------------------------
-- Section 1 — identity_subjects
-- ---------------------------------------------------------------------------

-- I-L1: dual control compares natural persons, not user rows.
CREATE TABLE IF NOT EXISTS identity_subjects (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  verification_ref text        NOT NULL,   -- IDV vendor case reference; never PII
  verified_at      timestamptz NOT NULL,
  reverify_due     timestamptz NOT NULL,
  liveness_passed  boolean     NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now()
);


-- ---------------------------------------------------------------------------
-- Section 2 — users.identity_subject_id
-- ---------------------------------------------------------------------------

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS identity_subject_id uuid REFERENCES identity_subjects(id);

CREATE INDEX IF NOT EXISTS users_identity_subject
  ON users(identity_subject_id)
  WHERE identity_subject_id IS NOT NULL;


-- ---------------------------------------------------------------------------
-- Section 3 — data_class ENUM
--
-- CREATE TYPE has no IF NOT EXISTS; the DO guard keeps this re-runnable.
-- ---------------------------------------------------------------------------

-- I-L8: the closed set of data classes. A class not listed cannot appear on any row.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'data_class') THEN
    CREATE TYPE data_class AS ENUM (
      'class_general',       -- calendaring, docketing, status, non-substantive notes
      'class_financial',     -- trust, invoices, settlement statements
      'class_phi',           -- medical records / bills / liens; 42 CFR Pt.2 standard
      'class_mnpi',          -- cap tables, transaction records; restricted-list enforced
      'class_insolvency',    -- schedules, SOFA, means test; pre-filing = maximum sensitivity
      'class_family',        -- asset division, support, minors; sealing rules apply
      'class_tdpa_regulated' -- biometric / smart-access evidence ingested into a matter
    );
  END IF;
END;
$$;


-- ---------------------------------------------------------------------------
-- Section 4 — matter_practice ENUM + columns on matters
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'matter_practice') THEN
    CREATE TYPE matter_practice AS ENUM
      ('proptech','personal_injury','bankruptcy','corporate','family_estates');
  END IF;
END;
$$;

ALTER TABLE matters
  ADD COLUMN IF NOT EXISTS practice_area       matter_practice,
  ADD COLUMN IF NOT EXISTS jurisdiction        text,
  ADD COLUMN IF NOT EXISTS jurisdiction_county text;


-- ---------------------------------------------------------------------------
-- Section 5 — matter_class_grants
-- ---------------------------------------------------------------------------

-- I-L8: being on the matter grants class_general only.
-- Opening any other class is an explicit act with a permanent record.
CREATE TABLE IF NOT EXISTS matter_class_grants (
  id         uuid       PRIMARY KEY DEFAULT gen_random_uuid(),
  matter_id  uuid       NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  user_id    uuid       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  class      data_class NOT NULL,
  granted_by uuid       NOT NULL REFERENCES users(id),
  basis      text       NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  UNIQUE (matter_id, user_id, class)
);

CREATE INDEX IF NOT EXISTS mcg_lookup
  ON matter_class_grants(user_id, matter_id, class)
  WHERE revoked_at IS NULL;


-- ---------------------------------------------------------------------------
-- Section 6 — guard_class_grant() + trigger
--
-- Counsel-of-record is identified by party_role IN ('attorney','co_counsel');
-- matter_parties carries no separate matter_role column.
-- ---------------------------------------------------------------------------

-- I-L8: self-granting is prohibited; only counsel of record may grant a class.
CREATE OR REPLACE FUNCTION public.guard_class_grant()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.granted_by = NEW.user_id THEN
    RAISE EXCEPTION 'I-L8: a class grant cannot be self-issued (matter %)', NEW.matter_id
      USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.matter_parties mp
    WHERE mp.matter_id  = NEW.matter_id
      AND mp.user_id    = NEW.granted_by
      AND mp.party_role IN ('attorney','co_counsel')
      AND mp.status     = 'active'
  ) THEN
    RAISE EXCEPTION 'I-L8: only counsel of record may grant a data class'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS matter_class_grants_guard ON matter_class_grants;
CREATE TRIGGER matter_class_grants_guard
  BEFORE INSERT OR UPDATE ON matter_class_grants
  FOR EACH ROW EXECUTE FUNCTION public.guard_class_grant();


-- ---------------------------------------------------------------------------
-- Section 7 — matter_class_grant_log
--
-- CREATE OR REPLACE RULE keeps the append-only rules re-runnable.
-- ---------------------------------------------------------------------------

-- Append-only audit log of every class-grant decision (SOC 2 CC6.2/CC6.3).
-- Rules enforce append-only; corrections via new entry only.
CREATE TABLE IF NOT EXISTS matter_class_grant_log (
  id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grant_id uuid NOT NULL,
  action   text NOT NULL CHECK (action IN ('granted','revoked','expired')),
  actor_id uuid REFERENCES users(id),
  at       timestamptz NOT NULL DEFAULT now(),
  detail   jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE OR REPLACE RULE mcgl_no_update AS ON UPDATE TO matter_class_grant_log DO INSTEAD NOTHING;
CREATE OR REPLACE RULE mcgl_no_delete AS ON DELETE TO matter_class_grant_log DO INSTEAD NOTHING;


-- ---------------------------------------------------------------------------
-- Section 8 — Harden is_matter_party() and add is_matter_party_for()
--
-- CREATE OR REPLACE, never DROP: policies across six migrations depend on this
-- function, and DROP ... CASCADE would delete them. The parameter keeps its
-- original name (p_matter_id) because REPLACE cannot rename one.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_matter_party(p_matter_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.matter_parties mp
    WHERE mp.matter_id  = p_matter_id
      AND mp.user_id    = public.current_app_user_id()
      AND mp.status     = 'active'
      AND (mp.expires_at IS NULL OR mp.expires_at > now())
  )
  AND NOT public.screened_from_matter(p_matter_id);
$$;

-- I-L14: explicit-subject variant — service-role paths call this, never auth.uid
CREATE OR REPLACE FUNCTION public.is_matter_party_for(
  p_user   uuid,
  p_matter uuid
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.matter_parties mp
    WHERE mp.matter_id  = p_matter
      AND mp.user_id    = p_user
      AND mp.status     = 'active'
      AND (mp.expires_at IS NULL OR mp.expires_at > now())
  )
  AND NOT public.screened_from_matter_for(p_user, p_matter);
$$;


-- ---------------------------------------------------------------------------
-- Section 9 — Enable row level security
-- ---------------------------------------------------------------------------

ALTER TABLE identity_subjects      ENABLE ROW LEVEL SECURITY;
ALTER TABLE matter_class_grants    ENABLE ROW LEVEL SECURITY;
ALTER TABLE matter_class_grant_log ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- Section 10 — RLS policies
-- ---------------------------------------------------------------------------

-- identity_subjects: self-read + admin
DROP POLICY IF EXISTS "identity_subjects_self_read" ON identity_subjects;
CREATE POLICY "identity_subjects_self_read" ON identity_subjects FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.identity_subject_id = identity_subjects.id
        AND u.id = public.current_app_user_id()
    )
    OR public.current_user_role_group() = 'admin'
  );

-- matter_class_grants: matter party may read grants for their own matter
DROP POLICY IF EXISTS "matter_class_grants_party_read" ON matter_class_grants;
CREATE POLICY "matter_class_grants_party_read" ON matter_class_grants FOR SELECT  -- I-L8
  USING (
    (
      public.is_matter_party(matter_id)
      AND NOT public.wall_blocks_user(matter_id)
    )
    OR public.current_user_role_group() = 'admin'
  );

-- matter_class_grant_log: admin-only (SOC 2 audit record)
DROP POLICY IF EXISTS "matter_class_grant_log_admin_read" ON matter_class_grant_log;
CREATE POLICY "matter_class_grant_log_admin_read" ON matter_class_grant_log FOR SELECT
  USING (public.current_user_role_group() = 'admin');


-- ---------------------------------------------------------------------------
-- Section 11 — REVOKE
-- ---------------------------------------------------------------------------

REVOKE ALL ON identity_subjects      FROM public;
REVOKE ALL ON matter_class_grants    FROM public;
REVOKE ALL ON matter_class_grant_log FROM public;


-- ---------------------------------------------------------------------------
-- Section 12 — GRANT SELECT / EXECUTE to authenticated, service_role
-- ---------------------------------------------------------------------------

GRANT SELECT ON identity_subjects      TO authenticated, service_role;
GRANT SELECT ON matter_class_grants    TO authenticated, service_role;
GRANT SELECT ON matter_class_grant_log TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.screened_from_matter_for(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.screened_from_matter(uuid)           TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_matter_party(uuid)                TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_matter_party_for(uuid, uuid)      TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.guard_class_grant()                  TO authenticated, service_role;
