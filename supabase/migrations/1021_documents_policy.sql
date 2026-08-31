-- =============================================================================
-- 1021_documents_policy.sql
-- Shtiya Builder v3.0 — Documents table: SELECT policy, matter accessor,
-- and wall-check fix for deal_documents / title_diligence.
--
-- Root cause: `documents` has had RLS enabled (1002 §3) with zero policies
-- since migration 1002 — it has been deny-all since then. Three consumers
-- are blocked on this:
--
--   1. Task 0.9's src/lib/storage.ts writes to `documents` but nothing can
--      read back through it.
--   2. Migration 1004 §10 wired the documents.matter_id FK but the column
--      remains unreadable.
--   3. deal_documents and title_diligence (1020) need to check
--      documents.matter_id to apply the inherited wall, but a subquery
--      into a deny-all table always returns NULL.
--
-- Fix: a SECURITY DEFINER accessor + a documents SELECT policy + patched
-- deal_documents / title_diligence policies with the wall term wired.
--
-- Pattern precedent: current_app_user_id() in 1002 uses the same SECURITY
-- DEFINER / SET search_path approach to bypass the no-policy problem on
-- `users` when called from within a policy USING clause.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- Section 1 — document_matter_id() accessor
--
-- A narrow SECURITY DEFINER function that reads documents.matter_id for a
-- given document UUID. Running as definer bypasses both the missing-grant
-- problem and the empty-policy problem on `documents`.
--
-- Used in deal_documents and title_diligence policies to apply the
-- child-table wall rule (I-L11) via the inherited FK chain:
--   deal_documents.document_id → documents.matter_id → matters
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION document_matter_id(p_document_id uuid)
RETURNS uuid LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = ''
AS $$
  SELECT matter_id FROM public.documents WHERE id = p_document_id;
$$;


-- ---------------------------------------------------------------------------
-- Section 2 — documents SELECT policy
--
-- documents has RLS enabled since 1002 but no policy has been defined.
-- This migration adds the baseline read policy.
--
-- Access rules:
--   - The document owner (owner_id) may always read their own documents.
--   - Any user with property capacity on documents.property_id may read.
--   - Any matter party (via matter_id FK) may read, unless walled.
--   - Platform admin reads all.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "documents_owner_read" ON documents;
CREATE POLICY "documents_owner_read" ON documents FOR SELECT
  USING (
    owner_id = public.current_app_user_id()
    OR (
      property_id IS NOT NULL
      AND (
        public.has_property_capacity(property_id, 'owner_occupant')
        OR public.has_property_capacity(property_id, 'owner_investor')
        OR public.has_property_capacity(property_id, 'owner_distressed')
      )
    )
    OR (
      matter_id IS NOT NULL
      AND public.is_matter_party(matter_id)
      AND NOT public.wall_blocks_user(matter_id)
    )
    OR current_user_role_group() = 'admin'
  );


-- ---------------------------------------------------------------------------
-- Section 3 — Patch deal_documents_member_read with the wall term
--
-- Now that document_matter_id() exists and documents has a policy, the
-- child-table wall rule (I-L11) can be enforced. A screened party must not
-- read a deal_documents row that points at a walled matter's document.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "deal_documents_member_read" ON deal_documents;
CREATE POLICY "deal_documents_member_read" ON deal_documents FOR SELECT  -- I-L11
  USING (
    (
      is_deal_member(deal_id)
      AND (
        document_matter_id(document_id) IS NULL
        OR NOT public.wall_blocks_user(document_matter_id(document_id))
      )
    )
    OR current_user_role_group() = 'admin'
  );


-- ---------------------------------------------------------------------------
-- Section 4 — Patch title_diligence_member_read with the wall term
--
-- Same fix for title_diligence.report_doc_id (nullable). When null the
-- wall term short-circuits to true (no matter attachment = no wall risk).
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "title_diligence_member_read" ON title_diligence;
CREATE POLICY "title_diligence_member_read" ON title_diligence FOR SELECT  -- I-L11
  USING (
    (
      is_deal_member(deal_id)
      AND (
        report_doc_id IS NULL
        OR document_matter_id(report_doc_id) IS NULL
        OR NOT public.wall_blocks_user(document_matter_id(report_doc_id))
      )
    )
    OR current_user_role_group() = 'admin'
  );
