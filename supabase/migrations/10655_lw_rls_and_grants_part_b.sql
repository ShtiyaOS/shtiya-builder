-- =============================================================================
-- 1065_lw_rls_and_grants_part_b.sql
-- Shtiya Builder v3.0 — Legal Workspace RLS hardening, Part B:
-- gig / wall / copilot policies, interactive write-path REVOKEs, the public
-- REVOKE sweep, and the service_role_routes inventory.
--
-- Depends on Part A for corp_cap_tables, current_privilege_holder(),
-- may_read_privileged_v2(), and the filed_at / sealed_at columns.
--
-- I-L18: verification verdicts are server-computed. Section 10 revokes every
-- interactive write path that a trigger alone cannot defend, re-granting only
-- review_flags on legal_service_attempts.
--
-- NOTE on the copilot privilege filter: the Plan gates copilot_retrieval_index
-- on documents.privilege_holder_id, which does not exist. The privilege branch
-- is therefore omitted (not silently passed through a broken column) until
-- documents carries a privilege holder. may_read_class() still applies.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- Section 8 — Gig table policies
-- ---------------------------------------------------------------------------

-- gig_provider_credentials: self-read, plus counsel verifying an assignee
DROP POLICY IF EXISTS "gpc_self_read" ON gig_provider_credentials;
CREATE POLICY "gpc_self_read" ON gig_provider_credentials FOR SELECT  -- I-L19
  USING (
    user_id = public.current_app_user_id()
    OR EXISTS (
      SELECT 1 FROM public.legal_gig_postings gp
      WHERE gp.assigned_to_user_id = gig_provider_credentials.user_id
        AND public.is_matter_party(gp.matter_id)
    )
  );

-- legal_gig_postings: assignee, matter party, or an eligible provider browsing open work
DROP POLICY IF EXISTS "lgp_party_read" ON legal_gig_postings;
CREATE POLICY "lgp_party_read" ON legal_gig_postings FOR SELECT  -- I-L12
  USING (
    assigned_to_user_id = public.current_app_user_id()
    OR (public.is_matter_party(matter_id) AND NOT public.wall_blocks_user(matter_id))
    OR (state = 'open'
        AND public.gig_provider_eligible(
              public.current_app_user_id(), gig_type, service_jurisdiction))
    OR public.break_glass_active(matter_id)
  );

DROP POLICY IF EXISTS "lgp_insert" ON legal_gig_postings;
CREATE POLICY "lgp_insert" ON legal_gig_postings FOR INSERT
  WITH CHECK (
    public.is_matter_party(matter_id)
    AND NOT public.wall_blocks_user(matter_id)
  );

-- gig_capture_nonces: self-read; issuance is server-side only (I-L17)
DROP POLICY IF EXISTS "gcn_self_read" ON gig_capture_nonces;
CREATE POLICY "gcn_self_read" ON gig_capture_nonces FOR SELECT  -- I-L17
  USING (issued_to = public.current_app_user_id());

DROP POLICY IF EXISTS "gcn_no_interactive_insert" ON gig_capture_nonces;
CREATE POLICY "gcn_no_interactive_insert" ON gig_capture_nonces FOR INSERT
  WITH CHECK (false);

-- legal_service_attempts: submitter or matter party; verdicts are not writable
DROP POLICY IF EXISTS "lsa_party_read" ON legal_service_attempts;
CREATE POLICY "lsa_party_read" ON legal_service_attempts FOR SELECT  -- I-L18
  USING (
    submitted_by = public.current_app_user_id()
    OR (
      public.is_matter_party((SELECT matter_id FROM public.legal_gig_postings WHERE id = gig_id))
      AND NOT public.wall_blocks_user((SELECT matter_id FROM public.legal_gig_postings WHERE id = gig_id))
    )
  );

DROP POLICY IF EXISTS "lsa_no_update" ON legal_service_attempts;
CREATE POLICY "lsa_no_update" ON legal_service_attempts FOR UPDATE  -- I-L18
  WITH CHECK (false);

DROP POLICY IF EXISTS "lsa_insert" ON legal_service_attempts;
CREATE POLICY "lsa_insert" ON legal_service_attempts FOR INSERT
  WITH CHECK (
    submitted_by = public.current_app_user_id()
    AND EXISTS (
      SELECT 1 FROM public.legal_gig_postings g
      WHERE g.id = gig_id
        AND g.assigned_to_user_id = public.current_app_user_id()
    )
  );

-- legal_service_affidavits: assignee, matter party, or break glass
DROP POLICY IF EXISTS "lsaf_party_read" ON legal_service_affidavits;
CREATE POLICY "lsaf_party_read" ON legal_service_affidavits FOR SELECT  -- I-L16
  USING (
    EXISTS (
      SELECT 1 FROM public.legal_gig_postings g
      WHERE g.id = gig_id
        AND (
          g.assigned_to_user_id = public.current_app_user_id()
          OR (public.is_matter_party(g.matter_id) AND NOT public.wall_blocks_user(g.matter_id))
          OR public.break_glass_active(g.matter_id)
        )
    )
  );

-- gig_releases: settlement is service-role only; parties may read the record
DROP POLICY IF EXISTS "gr_no_read" ON gig_releases;
DROP POLICY IF EXISTS "releases_no_interactive_insert" ON gig_releases;
CREATE POLICY "releases_no_interactive_insert" ON gig_releases FOR INSERT
  WITH CHECK (false);

DROP POLICY IF EXISTS "releases_read" ON gig_releases;
CREATE POLICY "releases_read" ON gig_releases FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.legal_gig_postings g
      WHERE g.id = gig_id
        AND (
          g.assigned_to_user_id = public.current_app_user_id()
          OR (public.is_matter_party(g.matter_id) AND NOT public.wall_blocks_user(g.matter_id))
          OR public.break_glass_active(g.matter_id)
        )
    )
  );

DROP POLICY IF EXISTS "pda_party_read" ON per_diem_assignments;
CREATE POLICY "pda_party_read" ON per_diem_assignments FOR SELECT  -- I-L20
  USING (
    attorney_id = public.current_app_user_id()
    OR (public.is_matter_party(matter_id) AND NOT public.wall_blocks_user(matter_id))
    OR public.break_glass_active(matter_id)
  );


-- ---------------------------------------------------------------------------
-- Section 9 — Wall + copilot policies
-- ---------------------------------------------------------------------------

-- ethical_walls: the screened member sees their own record (I-L15 disclosure);
-- firm partners and associates administer.
DROP POLICY IF EXISTS "ethical_walls_self_read" ON ethical_walls;
CREATE POLICY "ethical_walls_self_read" ON ethical_walls FOR SELECT  -- I-L12
  USING (
    public.current_app_user_id() = ANY(screened_user_ids)
    OR EXISTS (
      SELECT 1 FROM public.firm_members fm
      WHERE fm.firm_id     = ethical_walls.firm_id
        AND fm.user_id     = public.current_app_user_id()
        AND fm.member_role IN ('partner','associate')
    )
  );

-- Only a partner may erect a wall, and never one that screens themselves.
DROP POLICY IF EXISTS "wall_no_self_insert" ON ethical_walls;
CREATE POLICY "wall_no_self_insert" ON ethical_walls FOR INSERT  -- I-L12
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.firm_members fm
      WHERE fm.firm_id     = ethical_walls.firm_id
        AND fm.user_id     = public.current_app_user_id()
        AND fm.member_role = 'partner'
    )
    AND NOT (public.current_app_user_id() = ANY(screened_user_ids))
  );

-- copilot_retrieval_index: matter party + class grant. The privilege_class
-- filter is deferred — documents carries no privilege_holder_id yet.
DROP POLICY IF EXISTS "cri_matter_party_read" ON copilot_retrieval_index;
CREATE POLICY "cri_matter_party_read" ON copilot_retrieval_index FOR SELECT  -- I-L12, I-L15
  USING (
    (
      public.is_matter_party(matter_id)
      AND NOT public.wall_blocks_user(matter_id)
      AND public.may_read_class(matter_id, class)
    )
    OR public.break_glass_active(matter_id)
  );

DROP POLICY IF EXISTS "cri_no_interactive_insert" ON copilot_retrieval_index;
CREATE POLICY "cri_no_interactive_insert" ON copilot_retrieval_index FOR INSERT
  WITH CHECK (false);

-- copilot_transcripts: own transcripts only, and only while still a party
DROP POLICY IF EXISTS "ct_own_read" ON copilot_transcripts;
CREATE POLICY "ct_own_read" ON copilot_transcripts FOR SELECT  -- I-L15
  USING (
    user_id = public.current_app_user_id()
    AND public.is_matter_party(matter_id)
    AND NOT public.wall_blocks_user(matter_id)
  );

DROP POLICY IF EXISTS "ct_no_cross_matter" ON copilot_transcripts;
CREATE POLICY "ct_no_cross_matter" ON copilot_transcripts FOR INSERT
  WITH CHECK (
    user_id = public.current_app_user_id()
    AND public.is_matter_party(matter_id)
    AND NOT public.wall_blocks_user(matter_id)
  );

-- break_glass_grants: holder, approver, and matter parties (the point is that
-- break glass is visible to the people whose matter was opened).
DROP POLICY IF EXISTS "bgg_party_read" ON break_glass_grants;
CREATE POLICY "bgg_party_read" ON break_glass_grants FOR SELECT  -- I-L12
  USING (
    (
      (admin_id = public.current_app_user_id() OR approved_by = public.current_app_user_id())
      AND NOT public.wall_blocks_user(matter_id)
    )
    OR public.is_matter_party(matter_id)
  );

DROP POLICY IF EXISTS "bgg_no_interactive_insert" ON break_glass_grants;
CREATE POLICY "bgg_no_interactive_insert" ON break_glass_grants FOR INSERT
  WITH CHECK (false);


-- ---------------------------------------------------------------------------
-- Section 10 — Interactive write-path REVOKEs
--
-- I-L18: a trigger can reject a bad write, but only a missing grant makes the
-- write path unreachable. review_flags is the one column an interactive
-- reviewer may set.
-- ---------------------------------------------------------------------------

REVOKE UPDATE                ON public.legal_service_attempts FROM authenticated;
GRANT  UPDATE (review_flags) ON public.legal_service_attempts TO   authenticated;

REVOKE INSERT, UPDATE ON public.gig_releases            FROM authenticated;
REVOKE INSERT, UPDATE ON public.trust_ledger            FROM authenticated;
REVOKE UPDATE         ON public.trust_client_balances   FROM authenticated;
REVOKE INSERT         ON public.gig_capture_nonces      FROM authenticated;
REVOKE ALL            ON public.identity_subjects       FROM authenticated;
REVOKE ALL            ON public.bar_foundation_payees   FROM authenticated;
REVOKE INSERT, UPDATE ON public.matter_class_grants     FROM authenticated;
REVOKE ALL            ON public.break_glass_grants      FROM authenticated;
REVOKE ALL            ON public.copilot_retrieval_index FROM authenticated;


-- ---------------------------------------------------------------------------
-- Section 11 — REVOKE ALL FROM public sweep
-- ---------------------------------------------------------------------------

REVOKE ALL ON public.identity_subjects          FROM public;
REVOKE ALL ON public.matter_class_grants        FROM public;
REVOKE ALL ON public.matter_class_grant_log     FROM public;
REVOKE ALL ON public.trust_client_balances      FROM public;
REVOKE ALL ON public.bar_foundation_payees      FROM public;
REVOKE ALL ON public.legal_invoices             FROM public;
REVOKE ALL ON public.pi_medical_records         FROM public;
REVOKE ALL ON public.pi_liens                   FROM public;
REVOKE ALL ON public.bk_schedules               FROM public;
REVOKE ALL ON public.corp_cap_tables            FROM public;
REVOKE ALL ON public.corp_transaction_records   FROM public;
REVOKE ALL ON public.mnpi_designations          FROM public;
REVOKE ALL ON public.family_asset_inventories   FROM public;
REVOKE ALL ON public.privilege_successions      FROM public;
REVOKE ALL ON public.matter_adverse_parties     FROM public;
REVOKE ALL ON public.bar_admissions             FROM public;
REVOKE ALL ON public.gig_provider_credentials   FROM public;
REVOKE ALL ON public.legal_gig_postings         FROM public;
REVOKE ALL ON public.gig_capture_nonces         FROM public;
REVOKE ALL ON public.legal_service_attempts     FROM public;
REVOKE ALL ON public.legal_service_affidavits   FROM public;
REVOKE ALL ON public.gig_releases               FROM public;
REVOKE ALL ON public.per_diem_assignments       FROM public;
REVOKE ALL ON public.ethical_walls              FROM public;
REVOKE ALL ON public.wall_lift_events           FROM public;
REVOKE ALL ON public.wall_prior_access          FROM public;
REVOKE ALL ON public.copilot_retrieval_index    FROM public;
REVOKE ALL ON public.copilot_transcripts        FROM public;
REVOKE ALL ON public.break_glass_grants         FROM public;


-- ---------------------------------------------------------------------------
-- Section 12 — service_role_routes inventory
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS service_role_routes (
  route            text        PRIMARY KEY,
  justification    text        NOT NULL,
  predicate_called text        NOT NULL,
  reviewed_at      timestamptz NOT NULL,
  reviewed_by      text        NOT NULL
);

INSERT INTO service_role_routes VALUES
  ('/api/legal/trust/disbursements',
   'Composes maker/checker pair under constrained identity; writes to trust_ledger',
   'is_matter_party_for', now(), 'security-review-1065'),
  ('/api/legal/trust/class-grants',
   'Issues matter_class_grants rows; guard_class_grant trigger enforces issuer role',
   'is_matter_party_for', now(), 'security-review-1065'),
  ('/api/legal/gigs/nonces',
   'Server-issues capture nonces; bound to (gig_id, user_id, device_id) — I-L17',
   'is_matter_party_for', now(), 'security-review-1065'),
  ('/api/legal/gigs/attempts/verify',
   'Writes server-computed attestation_verified / geofence_verified / timestamp_skew_s',
   'is_matter_party_for', now(), 'security-review-1065'),
  ('/api/legal/gigs/release',
   'Escrow settlement; guard_gig_release trigger enforces staged preconditions',
   'is_matter_party_for', now(), 'security-review-1065'),
  ('/api/legal/walls',
   'Synchronous purge across retrieval index, transcripts, and provider-side caches',
   'screened_from_matter_for', now(), 'security-review-1065'),
  ('/api/legal/walls/break-glass',
   'Time-boxed dual-approved admin access; holder_notified_at required before grant activates',
   'break_glass_active', now(), 'security-review-1065'),
  ('/api/legal/matters/conflict-check',
   'Runs conflict screen before matter row exists; result written to conflict_checks',
   'is_matter_party_for', now(), 'security-review-1065')
ON CONFLICT (route) DO NOTHING;

REVOKE ALL ON service_role_routes FROM public;
GRANT SELECT ON service_role_routes TO authenticated, service_role;
