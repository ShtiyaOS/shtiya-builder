-- =============================================================================
-- 0008_milestones_bucket.sql
-- Shtiya Contractor — Milestone Storage bucket + access policy (T3.4)
--
-- src/lib/supabase/storage.ts's uploadMilestoneFile() uploads to a bucket
-- named `milestones` and its own comment says to create it manually via the
-- Supabase Dashboard — meaning a fresh project (including a fresh local
-- `supabase db reset` / CI run) has no such bucket, and every call to
-- POST /api/milestone-upload fails with "Bucket not found" before RLS is
-- even reached. This migration creates the bucket and the Storage RLS
-- policy required for the authenticated (anon-key, session-scoped) upload
-- POST /api/milestone-upload already performs.
--
-- Added by: T4.16 — End-to-End Deal Lifecycle Integration Test
-- (blocks the Contractor milestone upload hop without this).
-- =============================================================================

insert into storage.buckets (id, name, public)
values ('milestones', 'milestones', true)
on conflict (id) do nothing;

-- Mirrors the bucketPath convention in storage.ts:
--   `${propertyId}/${userId}/${timestamp}-${safeName}`
-- so a user may only upload into their own <userId> subfolder.
create policy "milestones_authenticated_upload" on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'milestones'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

-- Bucket is public (see insert above) so getPublicUrl() reads work without
-- an additional SELECT policy — public buckets serve objects over the
-- public URL regardless of storage.objects RLS.
