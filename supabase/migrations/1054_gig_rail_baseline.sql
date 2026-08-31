-- =============================================================================
-- 1054_gig_rail_baseline.sql
-- Shtiya Builder v3.0 — Gig Rail baseline tables.
--
-- Pre-0060 stub. Full hardening (nonce enforcement, REVOKE UPDATE on verified
-- columns, I-L17/I-L18) is applied in migration 1064.
--
-- gig_jobs carries a direct matter_id FK and is detected by wall-lint.
-- gig_assignments, gig_submissions, and gig_escrow inherit wall-scope through
-- the FK chain to gig_jobs; scalar-subquery wall patterns applied manually
-- (wall-lint blind spot).
--
-- DEFINER ACCESSORS (Section 6):
--   gig_matter_id(gig_id)           — reads gig_jobs.matter_id as DEFINER
--   assignment_gig_id(assignment_id) — reads gig_assignments.gig_id as DEFINER
--
-- These are required because gig_assignments and gig_submissions policies
-- contain a provider self-read branch alongside the matter-party branch. The
-- wall term must reach gig_jobs.matter_id without routing through the
-- invoker-filtered gig_jobs table — otherwise the scalar subquery returns NULL
-- for a provider who is not a matter party, collapsing TRUE AND NULL → denied
-- and blocking the provider from reading their own assignment and submission.
-- Same pattern as document_matter_id() (1021) and representation_brokerage_id() (1052).
--
-- I-L16: provenance gates acceptance, never money. Fee release requires
--        notarized affidavit + human acceptance by counsel of record.
-- I-L17: capture_nonce column stub — enforcement in migration 1064.
-- I-L18: geofence_verified / attestation_verified / timestamp_verified are
--        server-computed; REVOKE UPDATE applied in migration 1064.
-- I-L21: gig_escrow never funded from trust_ledger.
--
-- Builds on 1001 (users), 1002 (current_app_user_id, current_user_role_group),
-- 1004 (matters, is_matter_party, wall_blocks_user),
-- 1006 (professional_licences).
-- =============================================================================


-- ---------------------------------------------------------------------------
-- Section 1 — gig_jobs
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS gig_jobs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  matter_id       uuid NOT NULL REFERENCES matters(id),
  posted_by       uuid NOT NULL REFERENCES users(id),   -- counsel of record
  gig_type        text NOT NULL
                    CHECK (gig_type IN (
                      'process_service','per_diem_appearance','courier'
                    )),
  service_address text NOT NULL,
  jurisdiction    text NOT NULL,
  scheduled_at    timestamptz,
  status          text NOT NULL DEFAULT 'open'
                    CHECK (status IN (
                      'open','assigned','in_progress',
                      'submission_pending','accepted','rejected','cancelled'
                    )),
  created_at      timestamptz NOT NULL DEFAULT now()
);


-- ---------------------------------------------------------------------------
-- Section 2 — gig_assignments
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS gig_assignments (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gig_id               uuid NOT NULL REFERENCES gig_jobs(id) ON DELETE CASCADE,
  provider_id          uuid NOT NULL REFERENCES users(id),
  -- Credential must be current and jurisdiction-matched at assignment (I-L19)
  licence_id           uuid REFERENCES professional_licences(id),
  assigned_at          timestamptz NOT NULL DEFAULT now(),
  -- Server-computed fields — REVOKE UPDATE added in migration 1064 (I-L18)
  geofence_verified    boolean,                          -- I-L18: server-computed only
  attestation_verified boolean,                          -- I-L18: server-computed only
  timestamp_verified   boolean,                          -- I-L18: server-computed only
  -- capture_nonce: server-issued, single-use, short-TTL (I-L17) — enforcement in 1064
  capture_nonce        text,                             -- I-L17: stub; enforced in 1064
  nonce_issued_at      timestamptz,
  nonce_expires_at     timestamptz,
  status               text NOT NULL DEFAULT 'assigned'
                         CHECK (status IN (
                           'assigned','in_progress','submitted',
                           'accepted','rejected','expired'
                         ))
);


-- ---------------------------------------------------------------------------
-- Section 3 — gig_submissions
-- ---------------------------------------------------------------------------

-- I-L16: provenance gates acceptance, never money.
-- Fee release requires notarized affidavit + affirmative human acceptance by counsel.
CREATE TABLE IF NOT EXISTS gig_submissions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id       uuid NOT NULL REFERENCES gig_assignments(id) ON DELETE CASCADE,
  -- Signed device-attestation payload (I-L17); nonce must appear inside
  attestation_payload jsonb NOT NULL,
  affidavit_path      text,
  affidavit_verified  boolean NOT NULL DEFAULT false,
  -- Human acceptance by counsel of record (I-L16) — never auto
  accepted_by         uuid REFERENCES users(id),
  accepted_at         timestamptz,
  submitted_at        timestamptz NOT NULL DEFAULT now()
);


-- ---------------------------------------------------------------------------
-- Section 4 — gig_escrow
-- ---------------------------------------------------------------------------

-- I-L21: never funded from trust_ledger (trust principal).
-- Source must be operating_account or client-authorized advance.
CREATE TABLE IF NOT EXISTS gig_escrow (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gig_id       uuid NOT NULL REFERENCES gig_jobs(id),
  -- funded from operating account or client-authorized advance — never from trust_ledger
  source_type  text NOT NULL
                 CHECK (source_type IN ('operating_account','client_advance')), -- I-L21
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  status       text NOT NULL DEFAULT 'funded'
                 CHECK (status IN ('funded','released','returned','frozen')),
  released_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);


-- ---------------------------------------------------------------------------
-- Section 5 — Enable row level security
-- ---------------------------------------------------------------------------

ALTER TABLE gig_jobs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE gig_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE gig_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE gig_escrow      ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- Section 6 — DEFINER accessors
--
-- gig_matter_id(): reads gig_jobs.matter_id as DEFINER, bypassing
-- gig_jobs_matter_party_read. Required so that the wall term in
-- gig_assignments and gig_submissions policies does not route through the
-- invoker-filtered gig_jobs table — which would return NULL for a provider
-- who is not a matter party, silently blocking their self-read branch.
--
-- assignment_gig_id(): reads gig_assignments.gig_id as DEFINER. Required
-- by gig_submissions so the two-hop chain (assignment → gig → matter_id)
-- is fully DEFINER-routed without touching RLS-filtered tables.
--
-- Same pattern as document_matter_id() (1021) and representation_brokerage_id() (1052).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.gig_matter_id(p_gig_id uuid)
RETURNS uuid LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = ''
AS $$
  SELECT matter_id FROM public.gig_jobs WHERE id = p_gig_id;
$$;

CREATE OR REPLACE FUNCTION public.assignment_gig_id(p_assignment_id uuid)
RETURNS uuid LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = ''
AS $$
  SELECT gig_id FROM public.gig_assignments WHERE id = p_assignment_id;
$$;


-- ---------------------------------------------------------------------------
-- Section 7 — RLS policies
--
-- Postgres has no CREATE POLICY IF NOT EXISTS (through 17), so each policy is
-- preceded by DROP POLICY IF EXISTS to keep the migration re-runnable.
--
-- Only gig_jobs carries a direct matter_id FK. The other three inherit
-- wall-scope through the FK chain and apply the wall term via the DEFINER
-- accessors above (not via invoker-filtered FROM public.gig_jobs subqueries).
-- ---------------------------------------------------------------------------

-- gig_jobs: matter party read; direct matter_id FK — wall-lint checks this
DROP POLICY IF EXISTS "gig_jobs_matter_party_read" ON gig_jobs;
CREATE POLICY "gig_jobs_matter_party_read" ON gig_jobs FOR SELECT  -- I-L11, I-L12
  USING (
    (
      public.is_matter_party(matter_id)
      AND NOT public.wall_blocks_user(matter_id)
    )
    OR public.current_user_role_group() = 'admin'
  );

-- gig_assignments: provider self-read or matter party; wall via gig_matter_id()
-- The wall term uses gig_matter_id() (DEFINER) so it does not route through the
-- invoker-filtered gig_jobs table. Without the accessor, a non-party provider
-- gets NULL from the subquery and TRUE AND NULL → denied.
DROP POLICY IF EXISTS "gig_assignments_party_read" ON gig_assignments;
CREATE POLICY "gig_assignments_party_read" ON gig_assignments FOR SELECT  -- I-L11
  USING (
    (
      (
        provider_id = public.current_app_user_id()
        OR public.is_matter_party(public.gig_matter_id(gig_id))
      )
      AND NOT public.wall_blocks_user(public.gig_matter_id(gig_id))
    )
    OR public.current_user_role_group() = 'admin'
  );

-- gig_submissions: provider self-read or matter party; wall via accessor chain
-- assignment_gig_id() + gig_matter_id() give a fully DEFINER-routed path to
-- matter_id without touching any invoker-filtered table.
DROP POLICY IF EXISTS "gig_submissions_party_read" ON gig_submissions;
CREATE POLICY "gig_submissions_party_read" ON gig_submissions FOR SELECT  -- I-L11
  USING (
    (
      (
        EXISTS (
          SELECT 1 FROM public.gig_assignments ga
          WHERE ga.id        = gig_submissions.assignment_id
            AND ga.provider_id = public.current_app_user_id()
        )
        OR public.is_matter_party(
             public.gig_matter_id(
               public.assignment_gig_id(assignment_id)))
      )
      AND NOT public.wall_blocks_user(
                public.gig_matter_id(
                  public.assignment_gig_id(assignment_id)))
    )
    OR public.current_user_role_group() = 'admin'
  );

-- gig_escrow: matter party only (no provider branch — escrow is not a
-- provider-facing object). Wall via gig_matter_id() for consistency.
DROP POLICY IF EXISTS "gig_escrow_party_read" ON gig_escrow;
CREATE POLICY "gig_escrow_party_read" ON gig_escrow FOR SELECT  -- I-L11, I-L21
  USING (
    (
      public.is_matter_party(public.gig_matter_id(gig_id))
      AND NOT public.wall_blocks_user(public.gig_matter_id(gig_id))
    )
    OR public.current_user_role_group() = 'admin'
  );


-- ---------------------------------------------------------------------------
-- Section 8 — REVOKE
-- ---------------------------------------------------------------------------

REVOKE ALL ON gig_jobs        FROM public;
REVOKE ALL ON gig_assignments FROM public;
REVOKE ALL ON gig_submissions FROM public;
REVOKE ALL ON gig_escrow      FROM public;
