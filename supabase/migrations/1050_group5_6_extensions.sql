-- =============================================================================
-- 1050_group5_6_extensions.sql
-- Shtiya Builder v3.0 — Group 5 (Construction) and Group 6 (Architecture/Design)
-- extension tables.
--
-- Group 5 tables scope through work_package_id → is_work_package_party().
-- Group 6 tables scope through design_package_id → is_design_package_party().
-- None of these tables carry a direct matter_id FK; wall-lint will not check
-- them automatically. However, work_packages and design_packages both carry a
-- nullable matter_id, and 1006 already applies the inherited wall to every
-- child of those parents (wp_parties, boq_items, dp_parties, design_licences)
-- with explicit I-L11 comments. All six tables here are children of those same
-- parents and must carry the same scalar-subquery wall term (wall-lint blind
-- spot — applied manually, same pattern as boq_items/design_licences in 1006).
--
-- Builds on 1001 (users), 1002 (current_user_role_group),
-- 1006 (work_packages, is_work_package_party, design_packages,
--       is_design_package_party, professional_licences).
-- =============================================================================


-- ---------------------------------------------------------------------------
-- Section 1 — milestone_events
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS milestone_events (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_package_id     uuid NOT NULL REFERENCES work_packages(id) ON DELETE CASCADE,
  milestone_label     text NOT NULL,
  photo_paths         text[] NOT NULL DEFAULT '{}',
  submitted_by        uuid NOT NULL REFERENCES users(id),
  submitted_at        timestamptz NOT NULL DEFAULT now(),
  -- vision_model_result is ADVISORY; human sign-off required before draw approved (I-A3)
  vision_model_result jsonb,                                         -- I-A3: ADVISORY only
  verified_by         uuid REFERENCES users(id),
  verified_at         timestamptz,
  status              text NOT NULL DEFAULT 'submitted'
                        CHECK (status IN (
                          'submitted','in_review','verified','disputed','rejected'
                        ))
);


-- ---------------------------------------------------------------------------
-- Section 2 — safety_incidents
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS safety_incidents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_package_id uuid NOT NULL REFERENCES work_packages(id),
  reported_by     uuid NOT NULL REFERENCES users(id),
  incident_type   text NOT NULL,
  description     text NOT NULL,
  osha_recordable boolean NOT NULL DEFAULT false,
  reported_at     timestamptz NOT NULL DEFAULT now()
);


-- ---------------------------------------------------------------------------
-- Section 3 — material_deliveries
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS material_deliveries (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_package_id  uuid NOT NULL REFERENCES work_packages(id),
  supplier_user_id uuid REFERENCES users(id),
  csi_code         text,
  description      text NOT NULL,
  quantity         numeric NOT NULL CHECK (quantity > 0),
  unit             text NOT NULL,
  unit_cost_cents  bigint NOT NULL CHECK (unit_cost_cents >= 0),
  delivered_at     timestamptz NOT NULL DEFAULT now(),
  confirmed_by     uuid REFERENCES users(id)
);


-- ---------------------------------------------------------------------------
-- Section 4 — design_files
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS design_files (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  design_package_id uuid NOT NULL REFERENCES design_packages(id) ON DELETE CASCADE,
  file_type         text NOT NULL
                      CHECK (file_type IN (
                        'bim','cad','pdf_permit_set','raster','boq_export','report'
                      )),
  storage_path      text NOT NULL,
  version_label     text NOT NULL,
  uploaded_by       uuid NOT NULL REFERENCES users(id),
  created_at        timestamptz NOT NULL DEFAULT now()
);


-- ---------------------------------------------------------------------------
-- Section 5 — rfis
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS rfis (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  design_package_id uuid NOT NULL REFERENCES design_packages(id),
  submitted_by      uuid NOT NULL REFERENCES users(id),
  addressed_to      uuid REFERENCES users(id),
  subject           text NOT NULL,
  description       text NOT NULL,
  status            text NOT NULL DEFAULT 'open'
                      CHECK (status IN ('open','answered','closed','void')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  answered_at       timestamptz
);


-- ---------------------------------------------------------------------------
-- Section 6 — seal_events
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS seal_events (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  design_package_id   uuid NOT NULL REFERENCES design_packages(id) ON DELETE CASCADE,
  seal_holder_user_id uuid NOT NULL REFERENCES users(id),
  licence_id          uuid REFERENCES professional_licences(id),
  sealed_at           timestamptz NOT NULL DEFAULT now(),
  -- seal_content_hash: hash of the document at time of sealing (write-once audit)
  seal_content_hash   text NOT NULL,
  jurisdiction        text NOT NULL,
  discipline          text NOT NULL,
  revoked_at          timestamptz,
  revoked_reason      text
);


-- ---------------------------------------------------------------------------
-- Section 7 — Enable row level security
-- ---------------------------------------------------------------------------

ALTER TABLE milestone_events    ENABLE ROW LEVEL SECURITY;
ALTER TABLE safety_incidents    ENABLE ROW LEVEL SECURITY;
ALTER TABLE material_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE design_files        ENABLE ROW LEVEL SECURITY;
ALTER TABLE rfis                ENABLE ROW LEVEL SECURITY;
ALTER TABLE seal_events         ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- Section 8 — RLS policies
--
-- Postgres has no CREATE POLICY IF NOT EXISTS (through 17), so each policy is
-- preceded by DROP POLICY IF EXISTS to keep the migration re-runnable.
--
-- Group 5 scopes through is_work_package_party(work_package_id); Group 6
-- through is_design_package_party(design_package_id).
--
-- Wall term: work_packages and design_packages carry a nullable matter_id.
-- 1006 established that every child of a walled parent must be invisible to
-- the screened party (boq_items, design_licences — I-L11). The same scalar
-- subquery is applied here for consistency. When matter_id IS NULL on the
-- parent the subquery returns true (non-matter-scoped packages are unaffected).
-- ---------------------------------------------------------------------------

-- milestone_events: wp party read; inherited wall from work_packages.matter_id
DROP POLICY IF EXISTS "milestone_events_party_read" ON milestone_events;
CREATE POLICY "milestone_events_party_read" ON milestone_events FOR SELECT  -- I-L11
  USING (
    (
      public.is_work_package_party(work_package_id)
      AND (
        SELECT matter_id IS NULL
          OR NOT public.wall_blocks_user(matter_id)
        FROM public.work_packages
        WHERE id = milestone_events.work_package_id
      )
    )
    OR public.current_user_role_group() = 'admin'
  );

-- safety_incidents: wp party read; inherited wall from work_packages.matter_id
DROP POLICY IF EXISTS "safety_incidents_party_read" ON safety_incidents;
CREATE POLICY "safety_incidents_party_read" ON safety_incidents FOR SELECT  -- I-L11
  USING (
    (
      (
        public.is_work_package_party(work_package_id)
        OR reported_by = public.current_app_user_id()
      )
      AND (
        SELECT matter_id IS NULL
          OR NOT public.wall_blocks_user(matter_id)
        FROM public.work_packages
        WHERE id = safety_incidents.work_package_id
      )
    )
    OR public.current_user_role_group() = 'admin'
  );

-- material_deliveries: wp party read; inherited wall from work_packages.matter_id
DROP POLICY IF EXISTS "material_deliveries_party_read" ON material_deliveries;
CREATE POLICY "material_deliveries_party_read" ON material_deliveries FOR SELECT  -- I-L11
  USING (
    (
      public.is_work_package_party(work_package_id)
      AND (
        SELECT matter_id IS NULL
          OR NOT public.wall_blocks_user(matter_id)
        FROM public.work_packages
        WHERE id = material_deliveries.work_package_id
      )
    )
    OR public.current_user_role_group() = 'admin'
  );

-- design_files: dp party read; inherited wall from design_packages.matter_id
-- I-L11: BIM/CAD files of a walled design_package must be invisible to the screened party.
DROP POLICY IF EXISTS "design_files_party_read" ON design_files;
CREATE POLICY "design_files_party_read" ON design_files FOR SELECT  -- I-L11
  USING (
    (
      public.is_design_package_party(design_package_id)
      AND (
        SELECT matter_id IS NULL
          OR NOT public.wall_blocks_user(matter_id)
        FROM public.design_packages
        WHERE id = design_files.design_package_id
      )
    )
    OR public.current_user_role_group() = 'admin'
  );

-- rfis: dp party read; inherited wall from design_packages.matter_id
DROP POLICY IF EXISTS "rfis_party_read" ON rfis;
CREATE POLICY "rfis_party_read" ON rfis FOR SELECT  -- I-L11
  USING (
    (
      public.is_design_package_party(design_package_id)
      AND (
        SELECT matter_id IS NULL
          OR NOT public.wall_blocks_user(matter_id)
        FROM public.design_packages
        WHERE id = rfis.design_package_id
      )
    )
    OR public.current_user_role_group() = 'admin'
  );

-- seal_events: dp party read; inherited wall from design_packages.matter_id
-- I-L11: seal records of a walled design_package must be invisible to the screened party.
DROP POLICY IF EXISTS "seal_events_party_read" ON seal_events;
CREATE POLICY "seal_events_party_read" ON seal_events FOR SELECT  -- I-L11
  USING (
    (
      public.is_design_package_party(design_package_id)
      AND (
        SELECT matter_id IS NULL
          OR NOT public.wall_blocks_user(matter_id)
        FROM public.design_packages
        WHERE id = seal_events.design_package_id
      )
    )
    OR public.current_user_role_group() = 'admin'
  );


-- ---------------------------------------------------------------------------
-- Section 9 — REVOKE
-- ---------------------------------------------------------------------------

REVOKE ALL ON milestone_events    FROM public;
REVOKE ALL ON safety_incidents    FROM public;
REVOKE ALL ON material_deliveries FROM public;
REVOKE ALL ON design_files        FROM public;
REVOKE ALL ON rfis                FROM public;
REVOKE ALL ON seal_events         FROM public;
