-- =============================================================================
-- 1064_lw_gig_rail_part_a.sql
-- Shtiya Builder v3.0 — Legal Workspace gig rail, Part A:
-- adverse parties, cluster-scope wall wiring, bar admissions, gig ENUMs,
-- provider credentials, and the gig posting table with its guards.
--
-- This is the Legal Workspace rail. The Phase 1 tables from 1054 (gig_jobs,
-- gig_assignments, gig_submissions, gig_escrow) are left untouched and run in
-- parallel as the baseline.
--
-- Part B (1064_lw_gig_rail_part_b.sql) adds nonces, attempts, affidavits,
-- releases, per-diem assignments, RLS and grants.
--
-- Section 2 retires the cluster-scope `SELECT 1 WHERE false` stubs that 1062
-- left in wall_blocks_user() and screened_from_matter_for(), now that
-- matter_adverse_parties exists. Both use CREATE OR REPLACE — dependent
-- policies must not be cascade-dropped.
--
-- I-L12: the wall is the outermost gate.
-- I-L13: cluster scope keys off adverse-party identity clusters.
-- I-L19: provider credential must be current and jurisdiction-matched.
-- I-L20: per-diem appearance requires active bar admission (Part B).
-- I-L21: gig escrow is never funded from trust principal.
--
-- Builds on 1004 (matters, representations), 1060 (identity_subject_id,
-- matters.jurisdiction), 1062 (ethical_walls multi-scope).
-- =============================================================================


-- ---------------------------------------------------------------------------
-- Section 1 — matter_adverse_parties
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS matter_adverse_parties (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  matter_id        uuid        NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  party_kind       text        NOT NULL
    CHECK (party_kind IN (
      'individual','entity','insurer','medical_provider',
      'creditor','trustee','government','estate'
    )),
  display_name     text        NOT NULL,
  identity_cluster text[]      NOT NULL DEFAULT '{}',  -- I-L13: cluster-scope wall key
  added_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS map_cluster
  ON matter_adverse_parties USING gin (identity_cluster);
ALTER TABLE matter_adverse_parties ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- Section 2 — Wire the cluster-scope wall predicates
--
-- 1062 stubbed cluster scope as `SELECT 1 WHERE false` because
-- matter_adverse_parties did not exist. It does now: an active cluster wall
-- blocks a matter whose adverse parties overlap the wall's subject_cluster.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.wall_blocks_user(p_matter_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$  -- I-L12, I-L13
  SELECT EXISTS (
    SELECT 1 FROM public.ethical_walls w
    WHERE w.lifted_at IS NULL
      AND public.current_app_user_id() = ANY(w.screened_user_ids)
      AND (
        (w.scope_kind = 'matter' AND p_matter_id = ANY(w.matter_ids))
        OR (w.scope_kind = 'client' AND EXISTS (
              SELECT 1 FROM public.representations r
              WHERE r.matter_id = p_matter_id
                AND r.client_id = w.subject_client_id
        ))
        OR (w.scope_kind = 'cluster' AND EXISTS (
              SELECT 1 FROM public.matter_adverse_parties ap
              WHERE ap.matter_id        = p_matter_id
                AND ap.identity_cluster && w.subject_cluster
        ))
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.screened_from_matter_for(p_user uuid, p_matter uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$  -- I-L12, I-L13, I-L14
  SELECT EXISTS (
    SELECT 1 FROM public.ethical_walls w
    WHERE w.lifted_at IS NULL
      AND p_user = ANY(w.screened_user_ids)
      AND (
        (w.scope_kind = 'matter' AND p_matter = ANY(w.matter_ids))
        OR (w.scope_kind = 'client' AND EXISTS (
              SELECT 1 FROM public.representations r
              WHERE r.matter_id = p_matter
                AND r.client_id = w.subject_client_id
        ))
        OR (w.scope_kind = 'cluster' AND EXISTS (
              SELECT 1 FROM public.matter_adverse_parties ap
              WHERE ap.matter_id        = p_matter
                AND ap.identity_cluster && w.subject_cluster
        ))
      )
  );
$$;


-- ---------------------------------------------------------------------------
-- Section 3 — bar_admissions
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS bar_admissions (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  jurisdiction text        NOT NULL,
  standing     text        NOT NULL                       -- I-L20
    CHECK (standing IN ('active','inactive','suspended','disbarred')),
  bar_number   text        NOT NULL,
  reverify_due timestamptz NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, jurisdiction)
);
ALTER TABLE bar_admissions ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- Section 4 — gig_type / gig_state ENUMs
--
-- CREATE TYPE has no IF NOT EXISTS; DO guards keep the chain re-runnable.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'gig_type') THEN
    CREATE TYPE gig_type AS ENUM (
      'process_server','per_diem','mobile_notary','title_abstractor','court_runner'
    );
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'gig_state') THEN
    CREATE TYPE gig_state AS ENUM (
      'draft','open','assigned','attempt_submitted','attempt_verified',
      'affidavit_submitted','accepted','service_released','reserve_released',
      'disputed','traverse_sustained','cancelled','expired'
    );
  END IF;
END;
$$;


-- ---------------------------------------------------------------------------
-- Section 5 — gig_provider_credentials
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS gig_provider_credentials (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  gig_type          gig_type    NOT NULL,
  issuing_authority text        NOT NULL,
  jurisdiction      text        NOT NULL,
  licence_number    text        NOT NULL,
  bond_ref          text,
  bond_expires_at   timestamptz,
  issued_on         date        NOT NULL,
  expires_on        date        NOT NULL,
  standing          text        NOT NULL
    CHECK (standing IN ('active','suspended','revoked','expired')),
  verified_at       timestamptz NOT NULL,
  reverify_due      timestamptz NOT NULL,
  UNIQUE (user_id, gig_type, jurisdiction)
);
ALTER TABLE gig_provider_credentials ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.gig_provider_eligible(
  p_user uuid, p_type gig_type, p_jurisdiction text
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$  -- I-L19
  SELECT EXISTS (
    SELECT 1 FROM public.gig_provider_credentials c
    WHERE c.user_id      = p_user
      AND c.gig_type     = p_type
      AND c.jurisdiction = p_jurisdiction
      AND c.standing     = 'active'
      AND c.expires_on   > current_date
      AND c.reverify_due > now()
      AND (c.bond_expires_at IS NULL OR c.bond_expires_at > now())
  );
$$;


-- ---------------------------------------------------------------------------
-- Section 6 — legal_gig_postings + guards
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS legal_gig_postings (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  matter_id            uuid        NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  posted_by_user_id    uuid        NOT NULL REFERENCES users(id),
  gig_type             gig_type    NOT NULL,
  service_jurisdiction text        NOT NULL,
  service_geofence     jsonb       NOT NULL,
  attempt_fee_cents    bigint      NOT NULL CHECK (attempt_fee_cents > 0),
  max_attempts         int         NOT NULL DEFAULT 3 CHECK (max_attempts BETWEEN 1 AND 6),
  service_fee_cents    bigint      NOT NULL CHECK (service_fee_cents > 0),
  reserve_bps          int         NOT NULL DEFAULT 1500 CHECK (reserve_bps BETWEEN 0 AND 5000),
  escrow_intent_id     uuid        REFERENCES escrow_intents(id),
  funding_source       text        NOT NULL
    CHECK (funding_source IN ('operating','client_advance')),  -- I-L21
  state                gig_state   NOT NULL DEFAULT 'draft',
  assigned_to_user_id  uuid        REFERENCES users(id),
  assigned_at          timestamptz,
  amounts_frozen_at    timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE legal_gig_postings ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.guard_gig_funding()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN  -- I-L21
  IF TG_OP = 'UPDATE'
     AND OLD.amounts_frozen_at IS NOT NULL
     AND (OLD.attempt_fee_cents, OLD.service_fee_cents,
          OLD.reserve_bps, OLD.service_geofence::text)
       IS DISTINCT FROM
         (NEW.attempt_fee_cents, NEW.service_fee_cents,
          NEW.reserve_bps, NEW.service_geofence::text)
  THEN
    RAISE EXCEPTION 'GIG_TERMS_FROZEN: re-post the gig to change terms after assignment'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS gig_funding_guard ON legal_gig_postings;
CREATE TRIGGER gig_funding_guard
  BEFORE INSERT OR UPDATE ON legal_gig_postings
  FOR EACH ROW EXECUTE FUNCTION public.guard_gig_funding();

CREATE OR REPLACE FUNCTION public.guard_gig_assignment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  poster_subject   uuid;
  assignee_subject uuid;
BEGIN
  IF NEW.assigned_to_user_id IS NULL THEN RETURN NEW; END IF;
  IF NOT public.gig_provider_eligible(
    NEW.assigned_to_user_id, NEW.gig_type, NEW.service_jurisdiction
  ) THEN
    RAISE EXCEPTION 'PROVIDER_NOT_ELIGIBLE: credential absent, expired, or wrong jurisdiction'
      USING ERRCODE = '42501';
  END IF;
  SELECT identity_subject_id INTO poster_subject
  FROM public.users WHERE id = NEW.posted_by_user_id;
  SELECT identity_subject_id INTO assignee_subject
  FROM public.users WHERE id = NEW.assigned_to_user_id;
  IF poster_subject IS NOT NULL AND poster_subject = assignee_subject THEN
    RAISE EXCEPTION 'SELF_DEALING: poster and provider are the same natural person'
      USING ERRCODE = '42501';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.firm_members a
    JOIN public.firm_members b ON a.firm_id = b.firm_id
    WHERE a.user_id = NEW.posted_by_user_id
      AND b.user_id = NEW.assigned_to_user_id
  ) THEN
    RAISE EXCEPTION 'SELF_DEALING: provider shares a firm seat with the poster'
      USING ERRCODE = '42501';
  END IF;
  NEW.amounts_frozen_at := coalesce(NEW.amounts_frozen_at, now());
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS gig_assignment_guard ON legal_gig_postings;
CREATE TRIGGER gig_assignment_guard
  BEFORE UPDATE ON legal_gig_postings
  FOR EACH ROW EXECUTE FUNCTION public.guard_gig_assignment();
