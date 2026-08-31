-- =============================================================================
-- storage.sql — Shtiya Builder v3.0: Object Storage Bucket Definitions
--
-- Three physically separate private buckets. No cross-bucket RLS policies.
-- The legacy `milestones` bucket is created in 0008_milestones_bucket.sql
-- and is NOT redefined here.
--
-- Buckets are created idempotently (ON CONFLICT DO NOTHING).
-- Storage RLS policies for each bucket are applied in the Phase 1 migrations
-- that create the corresponding tables (documents, tenant_corpus, gig_assignments).
-- =============================================================================

-- documents bucket: property/deal/matter attached PDFs and images
-- 50 MB limit. Private (public = false). No unauthenticated reads.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documents',
  'documents',
  false,
  52428800,
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp'
  ]
)
on conflict (id) do nothing;

-- vault-raw bucket: tenant corpus raw ingest (encrypted at rest by platform)
-- 20 MB limit. Private. Only service-role writes permitted; no anon reads.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'vault-raw',
  'vault-raw',
  false,
  20971520,
  array[
    'application/pdf',
    'text/plain',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do nothing;

-- gig-affidavits bucket: gig worker signed affidavit PDFs and photos
-- 10 MB limit. Private. Authenticated gig workers write; matter parties read.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'gig-affidavits',
  'gig-affidavits',
  false,
  10485760,
  array[
    'application/pdf',
    'image/jpeg',
    'image/png'
  ]
)
on conflict (id) do nothing;
