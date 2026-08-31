-- =============================================================================
-- 1082_hrag_disclosures.sql
-- Shtiya Builder v3.0 — HRAG Vault Network Part III:
-- corpus_disclosures, guard_disclosure(), revoke_disclosure().
--
-- I-H13: the ONLY route by which one org's chunk becomes readable by another.
-- READ-THROUGH, never copy — revocation is real precisely because nothing was
-- ever copied. There is no second row to hunt down and no cache that outlives
-- the grant except the two this migration purges by hand.
--
-- SCHEMA CORRECTIONS vs the task spec (each verified against the live schema):
--
--   - subject_kind is declared in 1080, not here. tenant_corpus.subject_kind
--     (1081) is already typed with it. See the 1080 header.
--
--   - guard_disclosure() in the spec runs the same is_org_member_for() test
--     twice and cites a subject_party() in "1065a" that does not exist there.
--     The second test is the one the blueprint actually specifies: a disclosure
--     is a two-sided act, so the grantor must also be a party to the SUBJECT
--     they are disclosing onto. Without it a firm can publish any chunk it owns
--     onto any subject id it can guess, and I-H13 stops being a grant and
--     becomes an open channel. The check is written against subject_party(),
--     which 1084 creates — a plpgsql body resolves its calls at execution time,
--     so the forward reference is legal and nothing inserts a disclosure in the
--     window between the two migrations.
--
--   - The spec grants INSERT on corpus_disclosures to authenticated but writes
--     no INSERT policy. With RLS enabled and no permissive policy for the
--     command, every authenticated insert is refused — the grant is dead. §4
--     adds cd_insert, whose WITH CHECK constrains what the new row may CLAIM
--     (its org, its grantor) and not merely who is writing it.
--
--   - guard_disclosure() also pins owner_org_id to the chunk's real owner.
--     The column is caller-supplied; a member of org A who names org A as the
--     owner of org B's chunk would otherwise pass the membership test and
--     disclose a chunk they never owned.
--
--   - revoke_disclosure() bumps corpus_epoch for the sessions of the parties to
--     the disclosed SUBJECT, not for the owning org's members. The owner's
--     sessions were never the ones holding the disclosed prefix; the recipients'
--     were, and they are the caches the revocation has to orphan. Bumping every
--     open session instead would invalidate the whole platform's prompt cache
--     on one revocation.
--
--   - cd_read is owner-only in this migration and is widened to the recipient
--     side in 10850, once subject_party() exists. An RLS policy resolves its
--     function calls at CREATE POLICY time, unlike a plpgsql body, so it cannot
--     forward-reference the way the trigger above can. The widening is not
--     cosmetic: tc_read_v2's disclosure branch is a subquery over this table
--     and therefore runs under THIS policy, so a recipient who cannot read the
--     disclosure row cannot read the chunk it grants.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1 — corpus_disclosures (I-H13)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS corpus_disclosures (
  id               uuid                PRIMARY KEY DEFAULT gen_random_uuid(),
  chunk_id         uuid                NOT NULL REFERENCES public.tenant_corpus(id) ON DELETE CASCADE,
  owner_org_id     uuid                NOT NULL REFERENCES public.firms(id),
  subject_kind     public.subject_kind NOT NULL,
  subject_id       uuid                NOT NULL,
  scope_note       text                NOT NULL,   -- 'draw_04', 'RFI-118', 'exhibit C'
  granted_by       uuid                NOT NULL REFERENCES public.users(id),
  granted_at       timestamptz         NOT NULL DEFAULT now(),
  expires_at       timestamptz,
  revoked_at       timestamptz,
  disclosure_epoch bigint              NOT NULL DEFAULT 1,
  basis            text                NOT NULL,
  UNIQUE (chunk_id, subject_kind, subject_id, scope_note)
);

CREATE INDEX IF NOT EXISTS cd_live ON corpus_disclosures (subject_kind, subject_id)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS cd_chunk ON corpus_disclosures (chunk_id)
  WHERE revoked_at IS NULL;


-- ---------------------------------------------------------------------------
-- 2 — guard_disclosure()
--
-- Only someone who can already read the chunk may disclose it, and only onto a
-- subject they are themselves a party to.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.guard_disclosure()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_actor      uuid := public.current_app_user_id();
  v_chunk_org  uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'DISCLOSURE_NO_ACTOR: a disclosure must name the person making it'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.granted_by <> v_actor THEN
    RAISE EXCEPTION 'DISCLOSURE_GRANTOR_MISMATCH: granted_by must be the acting user'
      USING ERRCODE = '42501';
  END IF;

  -- The claimed owner must be the chunk's real owner. Read as DEFINER so the
  -- answer is the stored one and not whatever RLS lets the caller see.
  SELECT tc.owner_org_id INTO v_chunk_org
  FROM public.tenant_corpus tc
  WHERE tc.id = NEW.chunk_id;

  IF v_chunk_org IS NULL THEN
    RAISE EXCEPTION 'DISCLOSURE_NO_CHUNK: chunk % does not exist', NEW.chunk_id
      USING ERRCODE = '23503';
  END IF;

  IF v_chunk_org <> NEW.owner_org_id THEN
    RAISE EXCEPTION 'DISCLOSURE_NOT_OWNER: chunk % is not owned by the named org', NEW.chunk_id
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_org_member_for(v_actor, NEW.owner_org_id) THEN
    RAISE EXCEPTION 'DISCLOSURE_NOT_OWNER: caller is not a member of the owning org'
      USING ERRCODE = '42501';
  END IF;

  -- Two-sided: the grantor must be a party to the subject as well.
  -- subject_party() is created in 1084; a plpgsql body resolves at call time.
  IF NOT public.subject_party(NEW.subject_kind, NEW.subject_id) THEN
    RAISE EXCEPTION
      'DISCLOSURE_SUBJECT_NOT_PARTY: cannot disclose onto a subject you are not a party to'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS corpus_disclosures_guard ON corpus_disclosures;
CREATE TRIGGER corpus_disclosures_guard
  BEFORE INSERT ON corpus_disclosures
  FOR EACH ROW EXECUTE FUNCTION public.guard_disclosure();


-- ---------------------------------------------------------------------------
-- 3 — revoke_disclosure()
--
-- Revocation is real because nothing was copied. What it still has to do is
-- purge the recipient-side retrieval index and orphan the cached prefixes,
-- exactly as the Legal Workspace wall purge does (I-L15).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.revoke_disclosure(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE d public.corpus_disclosures;
BEGIN
  UPDATE public.corpus_disclosures
     SET revoked_at       = now(),
         disclosure_epoch = disclosure_epoch + 1
   WHERE id = p_id
     AND revoked_at IS NULL
   RETURNING * INTO d;

  -- A silent no-op here reads as a successful revocation to every caller.
  IF NOT FOUND THEN
    RAISE EXCEPTION 'DISCLOSURE_NOT_REVOCABLE: % is not an open disclosure', p_id
      USING ERRCODE = '02000';
  END IF;

  -- Purge recipient-side retrieval index rows for this chunk.
  DELETE FROM public.copilot_retrieval_index
  WHERE document_id = d.chunk_id;

  -- Orphan the cached prefixes that could have held it: the sessions of the
  -- parties to the disclosed subject.
  UPDATE public.agent_sessions s
     SET corpus_epoch = corpus_epoch + 1
   WHERE s.closed_at IS NULL
     AND public.subject_party_for(s.user_id, d.subject_kind, d.subject_id);
END;
$$;


-- ---------------------------------------------------------------------------
-- 4 — RLS
-- ---------------------------------------------------------------------------

ALTER TABLE corpus_disclosures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cd_read"             ON corpus_disclosures;
DROP POLICY IF EXISTS "cd_insert"           ON corpus_disclosures;
DROP POLICY IF EXISTS "cd_no_direct_revoke" ON corpus_disclosures;

-- Owner side only; 10850 adds the recipient branch — see the header.
CREATE POLICY "cd_read" ON corpus_disclosures FOR SELECT
  USING (
    public.is_org_member_for(public.current_app_user_id(), owner_org_id)
  );

CREATE POLICY "cd_insert" ON corpus_disclosures FOR INSERT
  WITH CHECK (
    public.is_org_member_for(public.current_app_user_id(), owner_org_id)
    AND granted_by  = public.current_app_user_id()
    AND revoked_at IS NULL
  );

-- Revocation runs only through revoke_disclosure(), which also purges the
-- recipient-side index. A direct UPDATE would set revoked_at and leave the
-- copies in place, which is the one outcome the design does not admit.
CREATE POLICY "cd_no_direct_revoke" ON corpus_disclosures FOR UPDATE
  USING (false);


-- ---------------------------------------------------------------------------
-- 5 — Grants
-- ---------------------------------------------------------------------------

REVOKE ALL ON public.corpus_disclosures FROM public, anon;

GRANT SELECT, INSERT ON public.corpus_disclosures TO authenticated;
GRANT SELECT, INSERT ON public.corpus_disclosures TO service_role;

REVOKE EXECUTE ON FUNCTION public.revoke_disclosure(uuid) FROM public, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.revoke_disclosure(uuid) TO service_role;

COMMIT;
