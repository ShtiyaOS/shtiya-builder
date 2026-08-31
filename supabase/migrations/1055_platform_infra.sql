-- =============================================================================
-- 1055_platform_infra.sql
-- Shtiya Builder v3.0 — Platform infrastructure tables:
-- notifications, audit_log, wall_prior_access.
--
-- notifications: I-L11 existence-protected — a notification about a matter
--   the recipient cannot see must be indistinguishable from no notification.
--   The delivery service filters via subject_party() before writing; this
--   table never stores matter content in the clear.
--
-- audit_log: append-only. Corrections by new entry only. Admin-read only.
--
-- wall_prior_access: I-L15 — the screened user's prior-access history.
--   Readable by the screened user themselves and admin. Intentionally has
--   no wall_blocks_user() term — the wall must not block a user from reading
--   their own disclosure record (wall-lint exempt, see group-auth.ts).
--
-- Builds on 1001 (users), 1002 (current_app_user_id, current_user_role_group),
-- 1004 (matters, ethical_walls).
-- =============================================================================


-- ---------------------------------------------------------------------------
-- Section 1 — notifications
-- ---------------------------------------------------------------------------

-- I-L11: delivery service filters via subject_party() before writing —
-- a notification about an inaccessible matter must not exist here.
CREATE TABLE IF NOT EXISTS notifications (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notification_type text NOT NULL,
  -- payload stores a reference only (subject_kind + subject_id); never content
  subject_kind      text CHECK (subject_kind IN (
                      'property','deal','facility','matter',
                      'work_package','design_package','tenancy','gig'
                    )),
  subject_id        uuid,
  read_at           timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);


-- ---------------------------------------------------------------------------
-- Section 2 — audit_log
-- ---------------------------------------------------------------------------

-- Append-only. Records every state-changing action by actor, target, timestamp.
-- Corrections are by new entries only; no row is ever updated or deleted here.
CREATE TABLE IF NOT EXISTS audit_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    uuid REFERENCES users(id),
  actor_class text NOT NULL DEFAULT 'user'
                CHECK (actor_class IN ('user','service','billing','migration')),
  action      text NOT NULL,
  target_type text,
  target_id   uuid,
  -- diff_hash: SHA-256 of the before/after JSON diff; content never stored here
  diff_hash   text,
  ip_address  inet,
  created_at  timestamptz NOT NULL DEFAULT now()
);


-- ---------------------------------------------------------------------------
-- Section 3 — wall_prior_access
-- ---------------------------------------------------------------------------

-- I-L15: preserves screened user's access history for disclosure, not concealment.
-- This record is never used to reconstruct content; it is evidence of timing only.
CREATE TABLE IF NOT EXISTS wall_prior_access (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wall_id          uuid NOT NULL REFERENCES ethical_walls(id),
  screened_user_id uuid NOT NULL REFERENCES users(id),
  matter_id        uuid NOT NULL REFERENCES matters(id),  -- I-L15
  last_access_at   timestamptz NOT NULL,
  -- index_purged_at: when retrieval index rows were invalidated
  index_purged_at  timestamptz,
  -- session_fenced_at: when live sessions were epoch-closed
  session_fenced_at timestamptz,
  recorded_at      timestamptz NOT NULL DEFAULT now()
);


-- ---------------------------------------------------------------------------
-- Section 4 — Enable row level security
-- ---------------------------------------------------------------------------

ALTER TABLE notifications    ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log        ENABLE ROW LEVEL SECURITY;
ALTER TABLE wall_prior_access ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- Section 5 — RLS policies
--
-- Postgres has no CREATE POLICY IF NOT EXISTS (through 17), so each policy is
-- preceded by DROP POLICY IF EXISTS to keep the migration re-runnable.
-- ---------------------------------------------------------------------------

-- notifications: self-read only
-- I-L11: delivery service pre-filters; this policy is the last line of defence
DROP POLICY IF EXISTS "notifications_self_read" ON notifications;
CREATE POLICY "notifications_self_read" ON notifications FOR SELECT
  USING (user_id = public.current_app_user_id());

-- audit_log: admin-read only — no user may read another user's audit entries
DROP POLICY IF EXISTS "audit_log_admin_only" ON audit_log;
CREATE POLICY "audit_log_admin_only" ON audit_log FOR SELECT
  USING (public.current_user_role_group() = 'admin');

-- wall_prior_access: screened user reads their own record; admin reads all
-- NOTE: no wall_blocks_user() term — the screened user must not be blocked
-- from their own I-L15 disclosure record. wall-lint exempt (see group-auth.ts).
DROP POLICY IF EXISTS "wall_prior_access_read" ON wall_prior_access;
CREATE POLICY "wall_prior_access_read" ON wall_prior_access FOR SELECT
  USING (
    screened_user_id = public.current_app_user_id()  -- I-L15
    OR public.current_user_role_group() = 'admin'
  );


-- ---------------------------------------------------------------------------
-- Section 6 — REVOKE
-- ---------------------------------------------------------------------------

REVOKE ALL ON notifications    FROM public;
REVOKE ALL ON audit_log        FROM public;
REVOKE ALL ON wall_prior_access FROM public;
