-- =============================================================================
-- 1040_group4_extensions.sql
-- Shtiya Builder v3.0 — Group 4 extensions:
-- Privilege successions (I-L9), arbitration cases (G4-01), arbitration awards (G4-02).
--
-- All three tables are matter-scoped. privilege_successions and arbitration_cases
-- carry a direct matter_id FK and are detected by wall-lint automatically.
-- arbitration_awards is wall-scoped through case_id → arbitration_cases.matter_id
-- (wall-lint blind spot — scalar subquery wall pattern applied manually).
--
-- No authorization tables (billing-guard triggers not required here).
--
-- Builds on 1001 (users), 1002 (current_app_user_id, current_user_role_group),
-- 1004 (matters, is_matter_party, wall_blocks_user).
-- =============================================================================


-- ---------------------------------------------------------------------------
-- Section 1 — privilege_successions
--
-- I-L9: privilege survives the original holder. When a trustee, executor,
-- surviving entity, guardian, or court appointee takes over, the successor
-- holds the privilege — the matter's wall and party gates still govern reads.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS privilege_successions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  matter_id             uuid NOT NULL REFERENCES matters(id),
  original_holder_id    uuid NOT NULL REFERENCES users(id),
  successor_holder_id   uuid NOT NULL REFERENCES users(id),
  succession_type       text NOT NULL
                          CHECK (succession_type IN (
                            'chapter7_trustee','executor','surviving_entity',
                            'guardian','court_appointed'
                          )),
  court_order_reference text,
  effective_at          timestamptz NOT NULL DEFAULT now(),
  created_at            timestamptz NOT NULL DEFAULT now()
);


-- ---------------------------------------------------------------------------
-- Section 2 — arbitration_cases
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS arbitration_cases (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  matter_id            uuid NOT NULL REFERENCES matters(id),
  arbitrator_user_id   uuid NOT NULL REFERENCES users(id),
  -- Arbitrator selected through disclosed process; platform does NOT earn on outcome (G4-03/G4-06)
  selection_method     text NOT NULL
                         CHECK (selection_method IN (
                           'party_agreement','aaa_list','court_appointed','platform_roster'
                         )),
  status               text NOT NULL DEFAULT 'initiated'
                         CHECK (status IN (
                           'initiated','evidentiary','deliberation',
                           'award_issued','confirmation_pending',
                           'confirmed','vacated','settled'
                         )),
  -- G4-01: FAA-consistent; faa_review_preserved must be true
  faa_review_preserved boolean NOT NULL DEFAULT true,
  award_issued_at      timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now()
);


-- ---------------------------------------------------------------------------
-- Section 3 — arbitration_awards
--
-- The award splits into an undisputed baseline and a contested delta so the
-- two can move on different release tracks (G4-02).
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS arbitration_awards (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id                   uuid NOT NULL REFERENCES arbitration_cases(id),
  -- undisputed_baseline_cents: may release after standard confirmation window
  undisputed_baseline_cents bigint NOT NULL DEFAULT 0
    CHECK (undisputed_baseline_cents >= 0),
  -- contested_delta_cents: requires separate human confirmation, never auto-releases
  contested_delta_cents     bigint NOT NULL DEFAULT 0
    CHECK (contested_delta_cents >= 0),
  award_text_hash           text,   -- hash of the award document; not the text itself
  -- G4-02: no self-execution; staged release requires custodian action
  baseline_released_at      timestamptz,
  delta_confirmed_at        timestamptz,
  delta_released_at         timestamptz,
  created_at                timestamptz NOT NULL DEFAULT now()
);


-- ---------------------------------------------------------------------------
-- Section 4 — Enable row level security
-- ---------------------------------------------------------------------------

ALTER TABLE privilege_successions ENABLE ROW LEVEL SECURITY;
ALTER TABLE arbitration_cases     ENABLE ROW LEVEL SECURITY;
ALTER TABLE arbitration_awards    ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- Section 5 — RLS policies
--
-- Postgres has no CREATE POLICY IF NOT EXISTS (through 17), so each policy is
-- preceded by DROP POLICY IF EXISTS to keep the migration re-runnable.
--
-- AND binds tighter than OR in Postgres, so the party+wall pair is wrapped in
-- its own parentheses before the admin branch is OR'd on — otherwise the wall
-- term would silently bind to only part of the predicate.
-- ---------------------------------------------------------------------------

-- privilege_successions: matter parties read; wall overrides party membership
DROP POLICY IF EXISTS "privilege_successions_party_read" ON privilege_successions;
CREATE POLICY "privilege_successions_party_read" ON privilege_successions FOR SELECT
  USING (
    (                                                          -- I-L11, I-L12
      public.is_matter_party(matter_id)
      AND NOT public.wall_blocks_user(matter_id)
    )
    OR public.current_user_role_group() = 'admin'
  );

-- arbitration_cases: matter parties read; wall overrides party membership
DROP POLICY IF EXISTS "arbitration_cases_party_read" ON arbitration_cases;
CREATE POLICY "arbitration_cases_party_read" ON arbitration_cases FOR SELECT
  USING (
    (                                                          -- I-L11, I-L12
      public.is_matter_party(matter_id)
      AND NOT public.wall_blocks_user(matter_id)
    )
    OR public.current_user_role_group() = 'admin'
  );

-- arbitration_awards: no direct matter_id, so wall-lint does not see this
-- table. The wall is reached manually through case_id → arbitration_cases.
-- Two separate scalar subqueries are used because a subquery alias cannot be
-- referenced from elsewhere in the same USING clause. Both resolve to zero
-- rows (NULL → denied, fail-closed) when the case row is itself unreadable.
DROP POLICY IF EXISTS "arbitration_awards_party_read" ON arbitration_awards;
CREATE POLICY "arbitration_awards_party_read" ON arbitration_awards FOR SELECT
  USING (
    (                                                          -- I-L11, I-L12
      (
        SELECT public.is_matter_party(ac.matter_id)
        FROM public.arbitration_cases ac
        WHERE ac.id = arbitration_awards.case_id
      )
      AND (
        SELECT NOT public.wall_blocks_user(ac.matter_id)
        FROM public.arbitration_cases ac
        WHERE ac.id = arbitration_awards.case_id
      )
    )
    OR public.current_user_role_group() = 'admin'
  );


-- ---------------------------------------------------------------------------
-- Section 6 — REVOKE
-- ---------------------------------------------------------------------------

REVOKE ALL ON privilege_successions FROM public;
REVOKE ALL ON arbitration_cases     FROM public;
REVOKE ALL ON arbitration_awards    FROM public;
