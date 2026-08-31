import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthenticatedUser, resolveAppUser, getCallerOrgId } from '@/lib/api/guards';
import {
  verifyMicrovmProof, proofIncludesPiiScan, proofSteps,
  assertPathWithinOrg, sniffMime, sha256,
} from '@/lib/vault/microvm';

/**
 * POST /api/vault/tenant-corpus — queue a tenant document for ingestion.
 *
 * ORDER IS THE INVARIANT. Nothing reaches the database until the MicroVM proof
 * has verified and the PII-scan attestation is present (I-H3, I-H6);
 * vault-pii-lint enforces that this file contains no `.insert(` reachable
 * before verifyMicrovmProof.
 *
 * -- I-H18: declared_mime is recorded and ignored. sniffed_mime is computed here
 * from the leading bytes and is what routes parsing downstream.
 *
 * The row lands in document_ingestion_queue, whose NOT NULL set includes
 * profile_id and declared_metadata — the spec's insert omits both and cannot be
 * applied. profile_id is resolved from ingestion_profiles by
 * (subject_kind, doc_kind): declaration profiles are governed DATA (§III.1), so
 * an unsupported document kind is a missing ROW, and this route says so rather
 * than inventing a default.
 */

const MAX_FILE_BYTES = 20 * 1024 * 1024;   // 20 MB

const SUBJECT_KINDS = [
  'property', 'deal', 'facility', 'matter',
  'work_package', 'design_package', 'tenancy', 'representation', 'org',
] as const;

const FieldsSchema = z.object({
  provider:     z.string().min(1),
  path:         z.string().min(1),
  doc_kind:     z.string().min(1),
  subject_kind: z.enum(SUBJECT_KINDS).default('org'),
  subject_id:   z.string().uuid().optional(),
  declared_metadata: z.record(z.unknown()).default({}),
});

export async function POST(req: NextRequest) {
  const requestId = crypto.randomUUID();
  const supabase  = createAdminClient();

  const authUser = await getAuthenticatedUser(req, supabase);
  if (!authUser) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

  const caller = await resolveAppUser(authUser.id, supabase);
  if (!caller) return NextResponse.json({ error: 'USER_NOT_FOUND' }, { status: 403 });

  const orgId = await getCallerOrgId(caller.id, supabase);
  if (!orgId) return NextResponse.json({ error: 'NO_ORG_MEMBERSHIP' }, { status: 403 });  // -- I-A5

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'INVALID_MULTIPART' }, { status: 400 });
  }

  const file  = formData.get('file');
  const proof = formData.get('proof');

  if (!(file instanceof File) || typeof proof !== 'string' || proof.length === 0) {
    return NextResponse.json({ error: 'MISSING_FIELDS' }, { status: 400 });
  }

  let declaredMetadata: unknown = {};
  const rawMetadata = formData.get('declared_metadata');
  if (typeof rawMetadata === 'string' && rawMetadata.length > 0) {
    try {
      declaredMetadata = JSON.parse(rawMetadata);
    } catch {
      return NextResponse.json({ error: 'INVALID_DECLARED_METADATA' }, { status: 400 });
    }
  }

  const fields = FieldsSchema.safeParse({
    provider:     formData.get('provider'),
    path:         formData.get('path'),
    doc_kind:     formData.get('doc_kind'),
    subject_kind: formData.get('subject_kind') ?? undefined,
    subject_id:   formData.get('subject_id') ?? undefined,
    declared_metadata: declaredMetadata,
  });
  if (!fields.success) {
    return NextResponse.json({ error: 'MISSING_FIELDS', detail: fields.error.format() }, { status: 400 });
  }
  const { provider, path, doc_kind, subject_kind } = fields.data;
  const subjectId = fields.data.subject_id ?? orgId;

  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: 'FILE_TOO_LARGE' }, { status: 413 });
  }

  const fileBuffer = await file.arrayBuffer();
  const fileHash   = await sha256(fileBuffer);

  // ---- Everything below the line is a check. The DB write comes last. ----

  // -- I-H6: the sandbox proof must verify against THESE bytes.
  const proofValid = await verifyMicrovmProof({ proof, provider, fileHash });
  if (!proofValid) {
    return NextResponse.json({ error: 'MICROVM_PROOF_INVALID' }, { status: 422 });
  }

  // -- I-H3
  if (!proofIncludesPiiScan(proof)) {
    return NextResponse.json({ error: 'PII_SCAN_NOT_ATTESTED' }, { status: 422 });
  }

  // -- I-H21: the target must resolve inside the caller's own org subtree.
  // guard_ingestion_target re-checks this with ltree containment; this is the
  // legible error, not the enforcement.
  if (!(await assertPathWithinOrg({ path, orgId }))) {
    return NextResponse.json({ error: 'PATH_OUT_OF_SCOPE' }, { status: 403 });
  }

  // The uploader must be a party to the subject they are filing against.
  if (subject_kind !== 'org' || subjectId !== orgId) {
    const { data: isParty } = await supabase.rpc('subject_party_for', {
      p_user: caller.id,
      p_kind: subject_kind,
      p_id:   subjectId,
    });
    if (isParty !== true) {
      return NextResponse.json({ error: 'SUBJECT_NOT_PARTY' }, { status: 403 });
    }
  }

  // Declaration profiles are governed data, not schema (§III.1).
  const { data: profile } = await supabase
    .from('ingestion_profiles')
    .select('id, max_bytes')
    .eq('subject_kind', subject_kind)
    .eq('doc_kind', doc_kind)
    .maybeSingle();

  if (!profile) {
    return NextResponse.json(
      { error: 'NO_INGESTION_PROFILE', detail: `no profile for (${subject_kind}, ${doc_kind})` },
      { status: 422 },
    );
  }
  if (profile.max_bytes != null && file.size > Number(profile.max_bytes)) {
    return NextResponse.json({ error: 'FILE_TOO_LARGE' }, { status: 413 });
  }

  const { data: ingest, error: ingestErr } = await supabase
    .from('document_ingestion_queue')
    .insert({
      uploaded_by:         caller.id,
      owner_org_id:        orgId,
      subject_kind,
      subject_id:          subjectId,
      profile_id:          profile.id,
      declared_metadata:   fields.data.declared_metadata,
      raw_sha256:          fileHash,
      raw_bytes:           file.size,
      declared_mime:       file.type || null,        // -- I-H18: recorded, never routed on
      sniffed_mime:        sniffMime(fileBuffer),    // -- I-H18: this one routes
      static_findings:     proofSteps(proof),
      target_path:         path,
      sandbox_status:      'pending',
      verification_status: 'pending',
    })
    .select('id')
    .single();

  if (ingestErr || !ingest) {
    return NextResponse.json(
      { error: 'INGEST_FAILED', detail: ingestErr?.message ?? null }, { status: 500 });
  }

  return NextResponse.json(
    { ingest_id: ingest.id, status: 'queued', path, sniffed_mime: sniffMime(fileBuffer) },
    { status: 202, headers: { 'X-Request-Id': requestId } },
  );
}
