import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { uploadMilestoneFile } from '@/lib/supabase/storage';
import { inspectMilestone } from '@/lib/gemini/vision';

export const runtime = 'nodejs';

/**
 * POST /api/milestone-upload
 *
 * Accepts a single photo or video file (≤500 MB) in multipart/form-data.
 * Fields:
 *   file         — the media file
 *   property_id  — UUID of the related property
 *
 * Flow:
 *   1. Upload to Supabase Storage (milestones bucket).
 *   2. Insert a documents row (type='photo'|'video').
 *   3. If file is ≤ 20 MB, fire Gemini Vision analysis and write
 *      a vision_inspections row (non-blocking — errors are logged, not surfaced).
 */
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

  const MAX_BYTES = 500 * 1024 * 1024;
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File exceeds 500 MB limit.' }, { status: 400 });
  }

  // 1. Upload to Storage
  let uploadResult;
  try {
    uploadResult = await uploadMilestoneFile(file, propertyId, user.id);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }

  // 2. Insert documents row
  const { data: doc, error: docError } = await supabase
    .from('documents')
    .insert({
      property_id: propertyId,
      uploaded_by: user.id,
      type: uploadResult.mediaType,
      bucket_path: uploadResult.bucketPath,
    })
    .select('id')
    .single();

  if (docError || !doc) {
    console.error('[milestone-upload] documents insert failed:', docError?.message);
    return NextResponse.json({ error: 'Storage succeeded but document record failed.' }, { status: 500 });
  }

  // 3. Trigger Vision inspection for files ≤ 20 MB (Gemini inlineData limit).
  const VISION_MAX = 20 * 1024 * 1024;
  if (file.size <= VISION_MAX) {
    // Fire-and-wait (sequential) so the vision result is available immediately.
    try {
      const arrayBuffer = await file.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString('base64');
      const inspection = await inspectMilestone(base64, file.type);

      await supabase.from('vision_inspections').insert({
        document_id: doc.id,
        property_id: propertyId,
        contractor_id: user.id,
        ai_summary: inspection.ai_summary,
        flagged_issues: inspection.flagged_issues,
        confidence: inspection.confidence,
        blocks_draw: inspection.blocks_draw,
      });
    } catch (err) {
      // Vision is non-blocking — log and continue.
      console.error('[milestone-upload] Vision inspection failed:', String(err));
    }
  }

  return NextResponse.json({
    document_id: doc.id,
    public_url: uploadResult.publicUrl,
    media_type: uploadResult.mediaType,
    bucket_path: uploadResult.bucketPath,
  }, { status: 201 });
}
