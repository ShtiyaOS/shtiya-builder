-- =============================================================================
-- 1062_lw_wall_hardening.sql
-- Shtiya Builder v3.0 — Legal Workspace part 3: ethical-wall hardening.
--
-- Migrates ethical_walls from single-matter scalars to multi-scope arrays
-- (matter / client / cluster), replaces the wall predicates with scope-aware
-- versions, and adds the copilot retrieval/transcript surface that a wall
-- bump must orphan.
--
-- CORRECTIONS vs task spec (each verified against a live database):
--   - wall_blocks_user(uuid) uses CREATE OR REPLACE, not DROP FUNCTION.
--     53 references across the chain; DROP fails with "cannot drop function
--     ... because other objects depend on it" naming policies on matters,
--     matter_parties, representations and more. The parameter name is
--     unchanged (p_matter_id), so REPLACE is valid.
--   - representations has `client_id`, not `client_user_id` (1004).
--   - may_read_class(uuid, data_class) did not exist in any migration — it is
--     only in the Plan. Section 0 creates it, because Section 10's
--     cri_matter_party_read policy calls it. Its delegation to
--     has_data_class_grant needs an explicit ::text cast: that function takes
--     (uuid, text) and enum->text is not an implicit coercion, so the
--     uncast call fails with "function ... (uuid, data_class) does not exist".
--   - break_glass_grants carries a direct matter_id FK, so wall-lint requires
--     a wall term in its SELECT policy. Added — a screened holder must not
--     learn a walled matter's existence through the grants table.
--   - The scalar unique object on ethical_walls is a CONSTRAINT named
--     ethical_walls_matter_id_screened_user_id_key, not an index named
--     ethical_walls_matter_id_screened_user_ids_idx. It is intentionally
--     retained (the scalar columns stay), so the spec's DROP INDEX is kept
--     only as a documented no-op.
--
-- Builds on 1004 (ethical_walls, representations), 1060 (data_class,
-- screened_from_matter*, matter_class_grants), 1041 (has_data_class_grant).
-- =============================================================================


-- ---------------------------------------------------------------------------
-- Section 0 — may_read_class() (dependency of Section 10)
-- ---------------------------------------------------------------------------

-- class_general is implied by matter party membership; every other class
-- requires an explicit grant. has_data_class_grant takes text, so cast.
CREATE OR REPLACE FUNCTION public.may_read_class(p_matter uuid, p_class data_class)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_class = 'class_general' THEN public.is_matter_party(p_matter)
    ELSE public.has_data_class_grant(p_matter, p_class::text)
  END;
$$;


-- ---------------------------------------------------------------------------
-- Section 1 — Migrate ethical_walls to the multi-scope schema
-- ---------------------------------------------------------------------------

-- Step 1: add new columns
ALTER TABLE ethical_walls
  ADD COLUMN IF NOT EXISTS matter_ids         uuid[]    NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS screened_user_ids  uuid[]    NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS scope_kind         text      NOT NULL DEFAULT 'matter'
    CHECK (scope_kind IN ('matter','client','cluster')),
  ADD COLUMN IF NOT EXISTS subject_client_id  uuid      REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS subject_cluster    text[]    NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS purge_ack_at       timestamptz,
  ADD COLUMN IF NOT EXISTS lifted_at          timestamptz,
  ADD COLUMN IF NOT EXISTS lifted_by          uuid      REFERENCES users(id);

-- wall_epoch is integer in 1004; widen to bigint for epoch-bump scale.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ethical_walls' AND column_name = 'wall_epoch'
      AND data_type = 'integer'
  ) THEN
    ALTER TABLE ethical_walls ALTER COLUMN wall_epoch TYPE bigint;
  END IF;
END;
$$;

-- Step 2: backfill arrays from the scalar columns (existing rows only)
UPDATE ethical_walls
   SET matter_ids        = ARRAY[matter_id],
       screened_user_ids = ARRAY[screened_user_id]
 WHERE array_length(matter_ids, 1) IS NULL
    OR matter_ids = '{}';

-- Step 3: scope constraint (added after backfill so existing rows satisfy it)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'ethical_walls' AND constraint_name = 'wall_scope_ck'
  ) THEN
    ALTER TABLE ethical_walls ADD CONSTRAINT wall_scope_ck CHECK (
      (scope_kind = 'matter'  AND array_length(matter_ids, 1) > 0)
      OR (scope_kind = 'client'  AND subject_client_id IS NOT NULL)
      OR (scope_kind = 'cluster' AND array_length(subject_cluster, 1) > 0)
    );
  END IF;
END;
$$;

-- Step 4: matter-scope uniqueness on the array columns.
-- No-op DROP retained from the spec: the scalar uniqueness is a CONSTRAINT
-- (ethical_walls_matter_id_screened_user_id_key), not this index name, and it
-- is deliberately kept because the scalar columns are kept.
DROP INDEX IF EXISTS ethical_walls_matter_id_screened_user_ids_idx;
CREATE UNIQUE INDEX IF NOT EXISTS wall_matter_uniq
  ON ethical_walls (matter_ids, screened_user_ids)
  WHERE scope_kind = 'matter';


-- ---------------------------------------------------------------------------
-- Section 2 — wall_blocks_user() replacement
--
-- CREATE OR REPLACE, never DROP: 53 references, many of them RLS policies.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.wall_blocks_user(p_matter_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$  -- I-L12
  SELECT EXISTS (
    SELECT 1 FROM public.ethical_walls w
    WHERE w.lifted_at IS NULL
      AND public.current_app_user_id() = ANY(w.screened_user_ids)
      AND (
        (w.scope_kind = 'matter'  AND p_matter_id = ANY(w.matter_ids))
        OR (w.scope_kind = 'client' AND EXISTS (
              SELECT 1 FROM public.representations r
              WHERE r.matter_id = p_matter_id
                AND r.client_id = w.subject_client_id
        ))
        OR (w.scope_kind = 'cluster' AND EXISTS (
              -- matter_adverse_parties does not exist until migration 1064.
              -- Cluster-scope wall evaluation is a stub until that table lands.
              SELECT 1 WHERE false
        ))
      )
  );
$$;


-- ---------------------------------------------------------------------------
-- Section 3 — screened_from_matter_for() replacement
-- ---------------------------------------------------------------------------

-- Replaces the 1060 stub with the cluster/client-aware version.
-- CREATE OR REPLACE (not DROP); dependent policies must not be cascade-dropped.
CREATE OR REPLACE FUNCTION public.screened_from_matter_for(p_user uuid, p_matter uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$  -- I-L12, I-L14
  SELECT EXISTS (
    SELECT 1 FROM public.ethical_walls w
    WHERE w.lifted_at IS NULL
      AND p_user = ANY(w.screened_user_ids)
      AND (
        (w.scope_kind = 'matter'  AND p_matter = ANY(w.matter_ids))
        OR (w.scope_kind = 'client' AND EXISTS (
              SELECT 1 FROM public.representations r
              WHERE r.matter_id = p_matter
                AND r.client_id = w.subject_client_id
        ))
        OR (w.scope_kind = 'cluster' AND EXISTS (
              -- Cluster-scope stub; full implementation after matter_adverse_parties (1064)
              SELECT 1 WHERE false
        ))
      )
  );
$$;
-- screened_from_matter() delegates to screened_from_matter_for(); no change needed.


-- ---------------------------------------------------------------------------
-- Section 4 — wall_lift_events (append-only)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS wall_lift_events (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  wall_id               uuid        NOT NULL REFERENCES ethical_walls(id),
  lifted_by             uuid        NOT NULL REFERENCES users(id),
  basis                 text        NOT NULL,
  client_consent_doc_id uuid        REFERENCES documents(id),
  at                    timestamptz NOT NULL DEFAULT now()
);
CREATE OR REPLACE RULE wall_lift_no_update AS ON UPDATE TO wall_lift_events DO INSTEAD NOTHING;
CREATE OR REPLACE RULE wall_lift_no_delete AS ON DELETE TO wall_lift_events DO INSTEAD NOTHING;


-- ---------------------------------------------------------------------------
-- Section 5 — guard_wall_lift() trigger
--
-- Plan draft used fm.firm_role and auth.uid; 1003's column is member_role and
-- identity resolution goes through current_app_user_id().
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.guard_wall_lift()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN  -- I-L12
  IF OLD.lifted_at IS NULL AND NEW.lifted_at IS NOT NULL THEN
    -- Must be a firm partner/responsible attorney, NOT the screened member.
    IF NOT EXISTS (
      SELECT 1 FROM public.firm_members fm
      WHERE fm.firm_id     = NEW.firm_id
        AND fm.user_id     = public.current_app_user_id()
        AND fm.member_role = 'partner'
    ) THEN
      RAISE EXCEPTION 'WALL_LIFT_UNAUTHORIZED: responsible attorney only'
        USING ERRCODE = '42501';
    END IF;
    IF public.current_app_user_id() = ANY(NEW.screened_user_ids) THEN
      RAISE EXCEPTION 'WALL_LIFT_UNAUTHORIZED: a screened member cannot lift their own screen'
        USING ERRCODE = '42501';
    END IF;
    NEW.wall_epoch := OLD.wall_epoch + 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ethical_walls_lift_guard ON ethical_walls;
CREATE TRIGGER ethical_walls_lift_guard
  BEFORE UPDATE ON ethical_walls
  FOR EACH ROW EXECUTE FUNCTION public.guard_wall_lift();


-- ---------------------------------------------------------------------------
-- Section 6 — copilot_retrieval_index
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS copilot_retrieval_index (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  matter_id       uuid        NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  document_id     uuid        REFERENCES documents(id) ON DELETE CASCADE,
  class           data_class  NOT NULL,
  privilege_class text        NOT NULL DEFAULT 'none'
    CHECK (privilege_class IN ('none','attorney_client','work_product','settlement_privileged')),
  chunk           text        NOT NULL,
  -- embedding column deferred to migration 1070 (pgvector); placeholder commented out
  -- embedding    vector(1536),
  wall_epoch      bigint      NOT NULL DEFAULT 1,  -- I-A16, I-L15: stale after wall bump
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cri_matter ON copilot_retrieval_index (matter_id);
-- ANN search must be PRE-filtered by matter_id to avoid membership leakage.


-- ---------------------------------------------------------------------------
-- Section 7 — copilot_transcripts
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS copilot_transcripts (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  matter_id    uuid        NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  user_id      uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  epoch        bigint      NOT NULL,
  wall_epoch   bigint      NOT NULL DEFAULT 1,  -- I-L15: orphaned on wall bump
  role         text        NOT NULL CHECK (role IN ('user','assistant')),
  content      text        NOT NULL,
  cited_chunks uuid[]      NOT NULL DEFAULT '{}',
  created_at   timestamptz NOT NULL DEFAULT now()
);


-- ---------------------------------------------------------------------------
-- Section 8 — purge_walled_context()
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.purge_walled_context(p_wall uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$  -- I-L15
DECLARE
  w public.ethical_walls;
BEGIN
  SELECT * INTO w FROM public.ethical_walls WHERE id = p_wall;

  -- Delete transcripts for screened users across walled matters
  DELETE FROM public.copilot_transcripts ct
  WHERE ct.user_id = ANY(w.screened_user_ids)
    AND (
      (w.scope_kind = 'matter' AND ct.matter_id = ANY(w.matter_ids))
      OR (w.scope_kind <> 'matter' AND ct.matter_id IN (
          SELECT m.id FROM public.matters m
          WHERE m.firm_id = w.firm_id
            AND (
              (w.scope_kind = 'client' AND EXISTS (
                SELECT 1 FROM public.representations r
                WHERE r.matter_id = m.id
                  AND r.client_id = w.subject_client_id
              ))
              OR (w.scope_kind = 'cluster' AND false)  -- stub; cluster full in 1064
            )
      ))
    );

  -- Bump wall_epoch on retrieval index rows to orphan provider-side context caches
  IF w.scope_kind = 'matter' THEN
    UPDATE public.copilot_retrieval_index
       SET wall_epoch = wall_epoch + 1
     WHERE matter_id = ANY(w.matter_ids);
  END IF;

  -- Mark wall as purge-acknowledged. Only now is it considered "erected" (I-L15).
  UPDATE public.ethical_walls
     SET purge_ack_at = now()
   WHERE id = p_wall;
END;
$$;


-- ---------------------------------------------------------------------------
-- Section 9 — break_glass_grants
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS break_glass_grants (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  matter_id           uuid        NOT NULL REFERENCES matters(id),
  admin_id            uuid        NOT NULL REFERENCES users(id),
  basis               text        NOT NULL,
  approved_by         uuid        NOT NULL REFERENCES users(id),
  opened_at           timestamptz NOT NULL DEFAULT now(),
  expires_at          timestamptz NOT NULL,
  holder_notified_at  timestamptz,
  CHECK (approved_by <> admin_id)  -- dual approval; admin cannot self-approve
);
CREATE OR REPLACE RULE bgg_no_delete AS ON DELETE TO break_glass_grants DO INSTEAD NOTHING;

CREATE OR REPLACE FUNCTION public.break_glass_active(p_matter uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$  -- I-L12, I-L14
  SELECT EXISTS (
    SELECT 1 FROM public.break_glass_grants b
    WHERE b.matter_id          = p_matter
      AND b.admin_id           = public.current_app_user_id()
      AND b.expires_at         > now()
      AND b.holder_notified_at IS NOT NULL  -- notification is not optional
  );
$$;

GRANT EXECUTE ON FUNCTION public.break_glass_active(uuid) TO authenticated, service_role;


-- ---------------------------------------------------------------------------
-- Section 10 — RLS on new tables
-- ---------------------------------------------------------------------------

ALTER TABLE wall_lift_events         ENABLE ROW LEVEL SECURITY;
ALTER TABLE copilot_retrieval_index  ENABLE ROW LEVEL SECURITY;
ALTER TABLE copilot_transcripts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE break_glass_grants       ENABLE ROW LEVEL SECURITY;

-- wall_lift_events: firm partners on the firm, or platform admin
DROP POLICY IF EXISTS "wle_firm_read" ON wall_lift_events;
CREATE POLICY "wle_firm_read" ON wall_lift_events FOR SELECT  -- I-L12
  USING (
    EXISTS (
      SELECT 1 FROM public.ethical_walls w
      JOIN public.firm_members fm ON fm.firm_id = w.firm_id
      WHERE w.id         = wall_lift_events.wall_id
        AND fm.user_id   = public.current_app_user_id()
        AND fm.member_role = 'partner'
    )
    OR public.current_user_role_group() = 'admin'
  );

-- copilot_retrieval_index: matter party + not screened + class grant
DROP POLICY IF EXISTS "cri_matter_party_read" ON copilot_retrieval_index;
CREATE POLICY "cri_matter_party_read" ON copilot_retrieval_index FOR SELECT  -- I-L12, I-L15
  USING (
    public.is_matter_party(matter_id)
    AND NOT public.wall_blocks_user(matter_id)
    AND public.may_read_class(matter_id, class)
  );

-- copilot_transcripts: own transcripts + not screened
DROP POLICY IF EXISTS "ct_own_read" ON copilot_transcripts;
CREATE POLICY "ct_own_read" ON copilot_transcripts FOR SELECT  -- I-L15
  USING (
    user_id = public.current_app_user_id()
    AND NOT public.wall_blocks_user(matter_id)
  );

-- break_glass_grants: admin reads own grants; approver reads grants they approved.
-- CORRECTION: wall term added — this table has a direct matter_id FK, and a
-- screened holder must not learn a walled matter's existence through it.
DROP POLICY IF EXISTS "bgg_party_read" ON break_glass_grants;
CREATE POLICY "bgg_party_read" ON break_glass_grants FOR SELECT  -- I-L12
  USING (
    (
      (
        admin_id    = public.current_app_user_id()
        OR approved_by = public.current_app_user_id()
      )
      AND NOT public.wall_blocks_user(matter_id)
    )
  );


-- ---------------------------------------------------------------------------
-- Section 11 — Grants
-- ---------------------------------------------------------------------------

GRANT SELECT ON public.wall_lift_events        TO authenticated, service_role;
GRANT SELECT ON public.copilot_retrieval_index TO authenticated, service_role;
GRANT SELECT ON public.copilot_transcripts     TO authenticated, service_role;
GRANT SELECT ON public.break_glass_grants      TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.wall_blocks_user(uuid)               TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.screened_from_matter_for(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.screened_from_matter(uuid)           TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.may_read_class(uuid, data_class)     TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.purge_walled_context(uuid)           TO service_role;
