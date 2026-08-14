import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

/**
 * POST /api/cad-upload
 *
 * Accepts a single CAD/BIM file in multipart/form-data.
 * Allowed extensions: .dwg, .rvt, .ifc, .pdf
 * Fields:
 *   file         — the CAD/BIM file
 *   property_id  — UUID of the related property
 *
 * Flow:
 *   1. Validate file extension and size (≤ 500 MB).
 *   2. Upload to Supabase Storage (cad-vault bucket).
 *   3. Insert a documents row (type='cad').
 */

const CAD_BUCKET = 'cad-vault';
const MAX_BYTES = 500 * 1024 * 1024; // 500 MB

const ALLOWED_EXTENSIONS = new Set(['.dwg', '.rvt', '.ifc', '.pdf']);

function getExtension(filename: string): string {
  const idx = filename.lastIndexOf('.');
  return idx >= 0 ? filename.slice(idx).toLowerCase() : '';
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Expected multipart/form-data.' }, { status: 400 });
  }

  const file = formData.get('file') as File | null;
  const propertyId = (formData.get('property_id') as string | null) ?? '';

  if (!file) return NextResponse.json({ error: 'No file provided.' }, { status: 400 });
  if (!propertyId) return NextResponse.json({ error: 'property_id is required.' }, { status: 400 });

  const ext = getExtension(file.name);
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return NextResponse.json(
      { error: `Unsupported file type "${ext}". Allowed: .dwg, .rvt, .ifc, .pdf` },
      { status: 400 },
    );
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File exceeds 500 MB limit.' }, { status: 400 });
  }

  // ── Upload to Storage ─────────────────────────────────────────────────────
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const bucketPath = `${propertyId}/${user.id}/${Date.now()}-${safeName}`;
  const arrayBuffer = await file.arrayBuffer();

  const { error: uploadError } = await supabase.storage
    .from(CAD_BUCKET)
    .upload(bucketPath, Buffer.from(arrayBuffer), {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    });

  if (uploadError) {
    return NextResponse.json({ error: `Storage upload failed: ${uploadError.message}` }, { status: 500 });
  }

  const { data: urlData } = supabase.storage.from(CAD_BUCKET).getPublicUrl(bucketPath);

  // ── Insert documents row ─────────────────────────────────────────────────
  const { data: doc, error: docError } = await supabase
    .from('documents')
    .insert({
      property_id: propertyId,
      uploaded_by: user.id,
      type: 'cad',
      bucket_path: bucketPath,
    })
    .select('id')
    .single();

  if (docError || !doc) {
    console.error('[cad-upload] documents insert failed:', docError?.message);
    return NextResponse.json(
      { error: 'Storage succeeded but document record failed.' },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      document_id: doc.id,
      bucket_path: bucketPath,
      public_url: urlData?.publicUrl ?? null,
    },
    { status: 201 },
  );
}
