import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { uploadMilestoneFile } from '@/lib/supabase/storage';
import { inspectMilestone } from '@/lib/gemini/vision';

export const runtime = 'nodejs';

/**
 * <!-- SECURITY NOTE -->
 * Filename hardening (T5.3, Vision AI Sandbox prompt-injection mitigation):
 * `sanitizeFilename()` below rejects the upload outright (HTTP 400) rather
 * than silently mangling it, using two independent checks —
 *   1. Character allowlist + 20%-drift rejection: strips everything outside
 *      `[a-zA-Z0-9.-]`; if that removes more than 20% of the original name
 *      (or empties it), the name was mostly disallowed characters — likely
 *      an attempt to smuggle control characters or prompt-breaking
 *      punctuation through — and the request is rejected instead of
 *      forwarding a truncated fragment.
 *   2. A literal reject on `\n`, `\r`, or the substring "ignore"
 *      (case-insensitive) — plain alphanumeric text like
 *      "IGNORE_PREVIOUS_INSTRUCTIONS.jpg" survives check #1 untouched
 *      (every character in it is allowlisted), so it needs its own check.
 * The sanitized name (never the original) is what gets forwarded to Gemini
 * — see the delimiter + reinforcement-instruction hardening in
 * src/lib/gemini/vision.ts, which treats it as inert data even so.
 */
const FILENAME_DISALLOWED = /[^a-zA-Z0-9.-]/g;
const FILENAME_DRIFT_LIMIT = 0.2; // reject if >20% of characters were stripped
const INJECTION_SIGNAL = /ignore/i;

function sanitizeFilename(name: string): { sanitized: string; error: string | null } {
  if (!name) return { sanitized: '', error: 'Filename is required.' };
  if (/[\n\r]/.test(name)) {
    return { sanitized: '', error: 'Filename contains control characters.' };
  }
  if (INJECTION_SIGNAL.test(name)) {
    return { sanitized: '', error: 'Filename contains disallowed text.' };
  }

  const sanitized = name.replace(FILENAME_DISALLOWED, '');
  const drift = 1 - sanitized.length / name.length;
  if (!sanitized || drift > FILENAME_DRIFT_LIMIT) {
    return { sanitized: '', error: 'Filename contains too many unsupported characters.' };
  }

  return { sanitized, error: null };
}

/**
 * POST /api/milestone-upload
 *
 * Accepts a single photo or video file (≤500 MB) in multipart/form-data.
 * Fields:
 *   file         — the media file
 *   property_id  — UUID of the related property
 *
 * Flow:
 *   1. Validate and sanitize the filename (see <!-- SECURITY NOTE --> above).
 *   2. Upload to Supabase Storage (milestones bucket).
 *   3. Insert a documents row (type='photo'|'video').
 *   4. If file is ≤ 20 MB, fire Gemini Vision analysis and write
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

  if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
    return NextResponse.json({ error: 'Only image/* and video/* files are accepted.' }, { status: 400 });
  }

  const { sanitized: sanitizedFilename, error: filenameError } = sanitizeFilename(file.name);
  if (filenameError) {
    return NextResponse.json({ error: `Invalid filename: ${filenameError}` }, { status: 400 });
  }

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

  // 4. Trigger Vision inspection for files ≤ 20 MB (Gemini inlineData limit).
  const VISION_MAX = 20 * 1024 * 1024;
  let inspectionId: string | null = null;
  if (file.size <= VISION_MAX) {
    // Fire-and-wait (sequential) so the vision result is available immediately.
    try {
      const arrayBuffer = await file.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString('base64');
      // Sanitized filename only — never the raw, attacker-controlled original.
      const inspection = await inspectMilestone(base64, file.type, undefined, sanitizedFilename);

      const { data: inspectionRow, error: inspectionError } = await supabase
        .from('vision_inspections')
        .insert({
          document_id: doc.id,
          property_id: propertyId,
          contractor_id: user.id,
          ai_summary: inspection.ai_summary,
          flagged_issues: inspection.flagged_issues,
          confidence: inspection.confidence,
          blocks_draw: inspection.blocks_draw,
        })
        .select('id')
        .single();

      if (inspectionError) {
        console.error('[milestone-upload] vision_inspections insert failed:', inspectionError.message);
      } else {
        inspectionId = inspectionRow?.id ?? null;
      }
    } catch (err) {
      // Vision is non-blocking — log and continue.
      console.error('[milestone-upload] Vision inspection failed:', String(err));
    }
  }

  return NextResponse.json({
    document_id: doc.id,
    inspection_id: inspectionId,
    public_url: uploadResult.publicUrl,
    media_type: uploadResult.mediaType,
    bucket_path: uploadResult.bucketPath,
  }, { status: 201 });
}
