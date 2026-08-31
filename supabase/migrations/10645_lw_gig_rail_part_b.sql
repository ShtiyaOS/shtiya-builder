-- =============================================================================
-- 1064_lw_gig_rail_part_b.sql
-- Shtiya Builder v3.0 — Legal Workspace gig rail, Part B:
-- capture nonces, service attempts, affidavits, staged releases, per-diem
-- assignments, RLS, column-level REVOKEs and grants.
--
-- Depends on Part A for: legal_gig_postings, gig_provider_eligible(),
-- bar_admissions, matter_adverse_parties, and the gig_type/gig_state ENUMs.
--
-- CORRECTION vs task spec: Section 12 REVOKEs UPDATE on timestamp_verified,
-- which does not exist on legal_service_attempts — that column belongs to the
-- 1054 gig_assignments table. This rail represents timestamp verification as
-- timestamp_skew_s, which is equally server-computed, so the REVOKE covers
-- attestation_verified, geofence_verified and timestamp_skew_s. Revoking a
-- non-existent column raises "column ... does not exist" and would abort.
--
-- I-L16: provenance gates acceptance; fee release needs a notarized affidavit
--        plus affirmative acceptance by a matter party.
-- I-L17: capture nonce is server-issued, single-use, short-TTL, and bound to
--        (gig, provider).
-- I-L18: verification verdicts are server-computed; clients cannot write them.
-- I-L19: provider credential is re-checked at release, not only at assignment.
-- I-L20: per-diem appearance requires active bar admission + cleared conflict.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- Section 7 — gig_capture_nonces
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS gig_capture_nonces (
  nonce       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  gig_id      uuid        NOT NULL REFERENCES legal_gig_postings(id) ON DELETE CASCADE,
  issued_to   uuid        NOT NULL REFERENCES users(id),
  device_id   text        NOT NULL,
  issued_at   timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,                      -- I-L17
  consumed_at timestamptz,
  consumed_by uuid        REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS nonce_live ON gig_capture_nonces (gig_id, issued_to)
  WHERE consumed_at IS NULL;
ALTER TABLE gig_capture_nonces ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- Section 8 — legal_service_attempts + guard
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS legal_service_attempts (
  id                   uuid             PRIMARY KEY DEFAULT gen_random_uuid(),
  gig_id               uuid             NOT NULL REFERENCES legal_gig_postings(id) ON DELETE CASCADE,
  attempt_index        int              NOT NULL,
  submitted_by         uuid             NOT NULL REFERENCES users(id),
  nonce                uuid             NOT NULL REFERENCES gig_capture_nonces(nonce),
  storage_path         text             NOT NULL,
  reported_lat         double precision,
  reported_lng         double precision,
  reported_accuracy_m  double precision,
  client_captured_at   timestamptz,
  attestation_token    text             NOT NULL,
  perceptual_hash      text             NOT NULL,
  received_at          timestamptz      NOT NULL DEFAULT now(),
  -- Server-computed — I-L18: clients get no UPDATE on these columns (see Section 12)
  attestation_verified boolean,                       -- I-L18
  attestation_verdict  jsonb,
  attestation_key_id   text,
  geofence_verified    boolean,                       -- I-L18
  geofence_distance_m  double precision,
  timestamp_skew_s     int,                           -- I-L18
  duplicate_of         uuid             REFERENCES legal_service_attempts(id),
  review_flags         text[]           NOT NULL DEFAULT '{}',
  verified_at          timestamptz,
  UNIQUE (gig_id, attempt_index),
  UNIQUE (gig_id, perceptual_hash)
);
ALTER TABLE legal_service_attempts ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.guard_attempt_submission()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  n public.gig_capture_nonces;
  g public.legal_gig_postings;
BEGIN  -- I-L17
  SELECT * INTO n FROM public.gig_capture_nonces
  WHERE nonce = NEW.nonce FOR UPDATE;

  IF n.nonce IS NULL            THEN RAISE EXCEPTION 'NONCE_INVALID'   USING ERRCODE = '42501'; END IF;
  IF n.consumed_at IS NOT NULL  THEN RAISE EXCEPTION 'NONCE_REPLAY: nonce already consumed' USING ERRCODE = '42501'; END IF;
  IF n.expires_at < now()       THEN RAISE EXCEPTION 'NONCE_EXPIRED'   USING ERRCODE = '42501'; END IF;
  IF n.gig_id <> NEW.gig_id OR n.issued_to <> NEW.submitted_by THEN
    RAISE EXCEPTION 'NONCE_BINDING_MISMATCH' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO g FROM public.legal_gig_postings WHERE id = NEW.gig_id;
  IF g.assigned_to_user_id IS DISTINCT FROM NEW.submitted_by THEN
    RAISE EXCEPTION 'NOT_ASSIGNED' USING ERRCODE = '42501';
  END IF;
  IF NEW.attempt_index > g.max_attempts THEN
    RAISE EXCEPTION 'ATTEMPT_LIMIT_EXCEEDED' USING ERRCODE = '42501';
  END IF;

  UPDATE public.gig_capture_nonces
     SET consumed_at = now(), consumed_by = NEW.submitted_by
   WHERE nonce = NEW.nonce;

  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS attempt_submission_guard ON legal_service_attempts;
CREATE TRIGGER attempt_submission_guard
  BEFORE INSERT ON legal_service_attempts
  FOR EACH ROW EXECUTE FUNCTION public.guard_attempt_submission();


-- ---------------------------------------------------------------------------
-- Section 9 — legal_service_affidavits + gig_releases + guard
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS legal_service_affidavits (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  gig_id              uuid        NOT NULL REFERENCES legal_gig_postings(id) ON DELETE CASCADE,
  attempt_id          uuid        REFERENCES legal_service_attempts(id),
  cplr_subdivision    text,
  served_person       text,
  notary_act_ref      text        NOT NULL,              -- I-L16
  notary_verified_at  timestamptz NOT NULL,
  document_id         uuid        NOT NULL REFERENCES documents(id),
  filed_with_court_at timestamptz,
  court_index_ref     text,
  accepted_by         uuid        REFERENCES users(id),
  accepted_at         timestamptz,
  traverse_filed_at   timestamptz,
  traverse_outcome    text
    CHECK (traverse_outcome IN ('sustained','denied','withdrawn')),
  created_at          timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE legal_service_affidavits ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS gig_releases (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  gig_id       uuid        NOT NULL REFERENCES legal_gig_postings(id),
  tranche      text        NOT NULL
    CHECK (tranche IN ('attempt','service','reserve','clawback')),
  amount_cents bigint      NOT NULL,
  basis        text        NOT NULL,
  executed_by  text        NOT NULL DEFAULT 'escrow_service_role',
  executed_at  timestamptz NOT NULL DEFAULT now(),
  intent_id    uuid        REFERENCES escrow_intents(id),
  UNIQUE (gig_id, tranche, intent_id)
);
ALTER TABLE gig_releases ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.guard_gig_release()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  g public.legal_gig_postings;
  a public.legal_service_affidavits;
BEGIN  -- I-L16
  SELECT * INTO g FROM public.legal_gig_postings WHERE id = NEW.gig_id FOR UPDATE;

  IF NEW.tranche = 'attempt' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.legal_service_attempts t
      WHERE t.gig_id              = NEW.gig_id
        AND t.verified_at         IS NOT NULL
        AND t.attestation_verified = true
        AND t.geofence_verified    = true
        AND t.duplicate_of         IS NULL
    ) THEN
      RAISE EXCEPTION 'PROVENANCE_UNVERIFIED: no verified attempt on record'
        USING ERRCODE = '42501';
    END IF;

  ELSIF NEW.tranche IN ('service','reserve') THEN
    SELECT * INTO a FROM public.legal_service_affidavits
    WHERE gig_id = NEW.gig_id ORDER BY created_at DESC LIMIT 1;

    IF a.id IS NULL OR a.notary_verified_at IS NULL THEN
      RAISE EXCEPTION 'AFFIDAVIT_REQUIRED: notarized affidavit absent'
        USING ERRCODE = '42501';
    END IF;
    IF a.accepted_by IS NULL THEN
      RAISE EXCEPTION 'ACCEPTANCE_REQUIRED: counsel of record has not accepted'
        USING ERRCODE = '42501';
    END IF;
    -- I-L16: counsel-of-record check via is_matter_party_for(uuid, uuid) — 2 params only
    IF NOT public.is_matter_party_for(a.accepted_by, g.matter_id) THEN
      RAISE EXCEPTION 'ACCEPTANCE_INVALID: acceptor is not a matter party'
        USING ERRCODE = '42501';
    END IF;
    -- I-L19: credential re-checked at release, not only at assignment
    IF NOT public.gig_provider_eligible(
      g.assigned_to_user_id, g.gig_type, g.service_jurisdiction
    ) THEN
      RAISE EXCEPTION 'PROVIDER_NOT_ELIGIBLE: credential lapsed before release'
        USING ERRCODE = '42501';
    END IF;

    IF NEW.tranche = 'reserve' THEN
      IF a.filed_with_court_at IS NULL THEN
        RAISE EXCEPTION 'RESERVE_HELD: affidavit not yet filed with court'
          USING ERRCODE = '42501';
      END IF;
      IF a.traverse_filed_at IS NOT NULL AND a.traverse_outcome IS NULL THEN
        RAISE EXCEPTION 'RESERVE_HELD: traverse challenge pending'
          USING ERRCODE = '42501';
      END IF;
      IF a.traverse_outcome = 'sustained' THEN
        RAISE EXCEPTION 'RESERVE_FORFEIT: traverse sustained — clawback path only'
          USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS gig_release_guard ON gig_releases;
CREATE TRIGGER gig_release_guard
  BEFORE INSERT ON gig_releases
  FOR EACH ROW EXECUTE FUNCTION public.guard_gig_release();


-- ---------------------------------------------------------------------------
-- Section 10 — per_diem_assignments + guard
--
-- matter_party_id references matter_parties(id) — the PK — not matter_id.
-- The conflict screen reads conflict_checks.outcome (1004 column name).
-- The narrow party row uses party_role; matter_parties has no `scope` column.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS per_diem_assignments (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  gig_id            uuid        NOT NULL REFERENCES legal_gig_postings(id) ON DELETE CASCADE,
  matter_id         uuid        NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  attorney_id       uuid        NOT NULL REFERENCES users(id),
  calendar_item     text        NOT NULL,
  hearing_at        timestamptz NOT NULL,
  conflict_check_id uuid        NOT NULL REFERENCES conflict_checks(id),
  matter_party_id   uuid        REFERENCES matter_parties(id),
  created_at        timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE per_diem_assignments ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.guard_per_diem()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  j text;
BEGIN  -- I-L20
  SELECT jurisdiction INTO j FROM public.matters WHERE id = NEW.matter_id;

  IF NOT EXISTS (
    SELECT 1 FROM public.bar_admissions b
    WHERE b.user_id      = NEW.attorney_id
      AND b.jurisdiction = j
      AND b.standing     = 'active'
      AND b.reverify_due > now()
  ) THEN
    RAISE EXCEPTION 'BAR_NOT_ACTIVE: per diem attorney not admitted in %', j
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.conflict_checks c
    WHERE c.id        = NEW.conflict_check_id
      AND c.matter_id = NEW.matter_id
      AND c.outcome   = 'clear'              -- live column is 'outcome', not 'result'
  ) THEN
    RAISE EXCEPTION 'CONFLICT_HIT: per diem assignment requires a cleared conflict screen'
      USING ERRCODE = '42501';
  END IF;

  -- Insert a narrow, expiring matter_parties row (appearance scope only).
  -- Live schema has party_role (not matter_role); there is no scope column.
  INSERT INTO public.matter_parties (matter_id, user_id, party_role, expires_at, status)
  VALUES (NEW.matter_id, NEW.attorney_id, 'attorney',
          NEW.hearing_at + INTERVAL '24 hours', 'active');

  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS per_diem_guard ON per_diem_assignments;
CREATE TRIGGER per_diem_guard
  BEFORE INSERT ON per_diem_assignments
  FOR EACH ROW EXECUTE FUNCTION public.guard_per_diem();


-- ---------------------------------------------------------------------------
-- Section 11 — RLS policies
--
-- legal_service_attempts and legal_service_affidavits carry no direct
-- matter_id, so wall-lint does not check them; the inherited wall is applied
-- manually through legal_gig_postings.matter_id.
-- ---------------------------------------------------------------------------

-- matter_adverse_parties: matter party read + wall
DROP POLICY IF EXISTS "map_party_read" ON matter_adverse_parties;
CREATE POLICY "map_party_read" ON matter_adverse_parties FOR SELECT  -- I-L13
  USING (
    public.is_matter_party(matter_id)
    AND NOT public.wall_blocks_user(matter_id)
  );

-- bar_admissions: self-read + admin
DROP POLICY IF EXISTS "ba_self_read" ON bar_admissions;
CREATE POLICY "ba_self_read" ON bar_admissions FOR SELECT  -- I-L20
  USING (user_id = public.current_app_user_id()
    OR public.current_user_role_group() = 'admin');

-- gig_provider_credentials: self-read + admin
DROP POLICY IF EXISTS "gpc_self_read" ON gig_provider_credentials;
CREATE POLICY "gpc_self_read" ON gig_provider_credentials FOR SELECT  -- I-L19
  USING (user_id = public.current_app_user_id()
    OR public.current_user_role_group() = 'admin');

-- legal_gig_postings: matter party + wall
DROP POLICY IF EXISTS "lgp_party_read" ON legal_gig_postings;
CREATE POLICY "lgp_party_read" ON legal_gig_postings FOR SELECT  -- I-L12
  USING (
    public.is_matter_party(matter_id)
    AND NOT public.wall_blocks_user(matter_id)
  );

-- gig_capture_nonces: issued_to self-read only
DROP POLICY IF EXISTS "gcn_self_read" ON gig_capture_nonces;
CREATE POLICY "gcn_self_read" ON gig_capture_nonces FOR SELECT  -- I-L17
  USING (issued_to = public.current_app_user_id());

-- legal_service_attempts: submitter, or matter party (wall via legal_gig_postings)
DROP POLICY IF EXISTS "lsa_party_read" ON legal_service_attempts;
CREATE POLICY "lsa_party_read" ON legal_service_attempts FOR SELECT  -- I-L18
  USING (
    submitted_by = public.current_app_user_id()
    OR (
      public.is_matter_party((
        SELECT matter_id FROM public.legal_gig_postings WHERE id = gig_id
      ))
      AND NOT public.wall_blocks_user((
        SELECT matter_id FROM public.legal_gig_postings WHERE id = gig_id
      ))
    )
  );

-- legal_service_affidavits: matter party + wall (matter via legal_gig_postings)
DROP POLICY IF EXISTS "lsaf_party_read" ON legal_service_affidavits;
CREATE POLICY "lsaf_party_read" ON legal_service_affidavits FOR SELECT  -- I-L16
  USING (
    public.is_matter_party((
      SELECT matter_id FROM public.legal_gig_postings WHERE id = gig_id
    ))
    AND NOT public.wall_blocks_user((
      SELECT matter_id FROM public.legal_gig_postings WHERE id = gig_id
    ))
  );

-- gig_releases: service-role only (no interactive read)
DROP POLICY IF EXISTS "gr_no_read" ON gig_releases;
CREATE POLICY "gr_no_read" ON gig_releases FOR SELECT
  USING (public.current_user_role_group() = 'admin');

-- per_diem_assignments: matter party + wall
DROP POLICY IF EXISTS "pda_party_read" ON per_diem_assignments;
CREATE POLICY "pda_party_read" ON per_diem_assignments FOR SELECT  -- I-L20
  USING (
    public.is_matter_party(matter_id)
    AND NOT public.wall_blocks_user(matter_id)
  );


-- ---------------------------------------------------------------------------
-- Section 12 — REVOKE server-computed columns
--
-- I-L18: verification verdicts are computed server-side. No client or
-- authenticated user may UPDATE them. `timestamp_verified` from the task spec
-- belongs to 1054's gig_assignments; this rail's timestamp verification field
-- is timestamp_skew_s, covered here instead.
-- ---------------------------------------------------------------------------

REVOKE UPDATE (geofence_verified, attestation_verified, timestamp_skew_s)
  ON public.legal_service_attempts FROM public;
REVOKE UPDATE (geofence_verified, attestation_verified, timestamp_skew_s)
  ON public.legal_service_attempts FROM authenticated;


-- ---------------------------------------------------------------------------
-- Section 13 — Grants
-- ---------------------------------------------------------------------------

GRANT SELECT ON public.matter_adverse_parties     TO authenticated, service_role;
GRANT SELECT ON public.bar_admissions             TO authenticated, service_role;
GRANT SELECT ON public.gig_provider_credentials   TO authenticated, service_role;
GRANT SELECT ON public.legal_gig_postings         TO authenticated, service_role;
GRANT SELECT ON public.gig_capture_nonces         TO authenticated, service_role;
GRANT SELECT ON public.legal_service_attempts     TO authenticated, service_role;
GRANT SELECT ON public.legal_service_affidavits   TO authenticated, service_role;
GRANT SELECT ON public.gig_releases               TO service_role;
GRANT SELECT ON public.per_diem_assignments       TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.gig_provider_eligible(uuid, gig_type, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.wall_blocks_user(uuid)               TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.screened_from_matter_for(uuid, uuid) TO authenticated, service_role;
