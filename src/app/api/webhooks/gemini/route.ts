import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { extractProbateData } from '@/lib/gemini/ocr';

// Next.js 14 App Router: disable the built-in body parser so we can read
// the raw multipart/form-data ourselves via request.formData().
export const runtime = 'nodejs';

const MAX_FILES = 50;
const MAX_FILE_SIZE_MB = 20;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

// ── Result types ──────────────────────────────────────────────────────────────

interface SuccessResult {
  status: 'ok';
  fileName: string;
  propertyId: string | null;
  documentId: string | null;
}

interface FailureResult {
  status: 'error';
  fileName: string;
  reason: string;
}

type FileResult = SuccessResult | FailureResult;

// ── POST handler ──────────────────────────────────────────────────────────────

/**
 * POST /api/webhooks/gemini
 *
 * Accepts multipart/form-data with up to 50 PDF files under the field name
 * "files". For each file:
 *   1. Converts the PDF bytes to base64.
 *   2. Calls extractProbateData() to run Gemini OCR.
 *   3. Upserts a row into `properties` (keyed on address).
 *   4. Inserts a row into `documents` linking back to the property.
 *
 * Files that fail OCR are caught and included in the `errors` array of the
 * response — they are never silently dropped.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();

  // Auth check
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Parse multipart body
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: 'Failed to parse multipart form data. Ensure Content-Type is multipart/form-data.' },
      { status: 400 },
    );
  }

  const files = formData.getAll('files') as File[];

  if (!files.length) {
    return NextResponse.json(
      { error: 'No files received. Send PDFs under the "files" field.' },
      { status: 400 },
    );
  }

  if (files.length > MAX_FILES) {
    return NextResponse.json(
      { error: `Batch limited to ${MAX_FILES} files. Received ${files.length}.` },
      { status: 400 },
    );
  }

  // Process each file independently so one failure never aborts the whole batch
  const results: FileResult[] = await Promise.all(
    files.map(async (file): Promise<FileResult> => {
      const fileName = file.name;

      // ── Size guard ────────────────────────────────────────────────────────
      if (file.size > MAX_FILE_SIZE_BYTES) {
        const reason = `File exceeds ${MAX_FILE_SIZE_MB} MB limit (${(file.size / 1024 / 1024).toFixed(1)} MB).`;
        console.error(`[gemini-ocr] SKIPPED "${fileName}": ${reason}`);
        return { status: 'error', fileName, reason };
      }

      // ── Base64 conversion ─────────────────────────────────────────────────
      let base64Pdf: string;
      try {
        const arrayBuffer = await file.arrayBuffer();
        base64Pdf = Buffer.from(arrayBuffer).toString('base64');
      } catch (err) {
        const reason = `Failed to read file bytes: ${String(err)}`;
        console.error(`[gemini-ocr] SKIPPED "${fileName}": ${reason}`);
        return { status: 'error', fileName, reason };
      }

      // ── Gemini OCR ────────────────────────────────────────────────────────
      let extracted;
      try {
        extracted = await extractProbateData(base64Pdf, fileName);
      } catch (err) {
        const reason = `OCR extraction failed: ${String(err)}`;
        console.error(`[gemini-ocr] FAILED "${fileName}": ${reason}`);
        return { status: 'error', fileName, reason };
      }

      // ── Persist to Supabase ───────────────────────────────────────────────
      // 1. Upsert into `properties` (address is our dedup key in the absence of BBL)
      let propertyId: string | null = null;
      if (extracted.property_address) {
        const { data: propertyRow, error: propertyError } = await supabase
          .from('properties')
          .upsert(
            {
              address: extracted.property_address,
              // BBL is unknown from a probate doc; placeholder so the NOT NULL
              // constraint is satisfied. Will be enriched by T2.5/T2.6.
              bbl: `PROBATE-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              metadata: {
                source: 'probate_ocr',
                deceased_name: extracted.deceased_name,
                executor_name: extracted.executor_name,
                executor_mailing_address: extracted.executor_mailing_address,
                estimated_value: extracted.estimated_value,
                case_number: extracted.case_number,
              },
            },
            { onConflict: 'address', ignoreDuplicates: false },
          )
          .select('id')
          .single();

        if (propertyError) {
          const reason = `DB upsert to properties failed: ${propertyError.message}`;
          console.error(`[gemini-ocr] DB ERROR "${fileName}": ${reason}`);
          return { status: 'error', fileName, reason };
        }
        propertyId = propertyRow?.id ?? null;
      }

      // 2. Insert into `documents`
      let documentId: string | null = null;
      const { data: docRow, error: docError } = await supabase
        .from('documents')
        .insert({
          property_id: propertyId,
          uploaded_by: user.id,
          type: 'probate_petition',
          // bucket_path will be populated when Supabase Storage is wired up (T3.4).
          // Using a placeholder path so the NOT NULL constraint is satisfied.
          bucket_path: `probate/${user.id}/${Date.now()}-${fileName}`,
        })
        .select('id')
        .single();

      if (docError) {
        // Non-fatal: property was created; just log the document failure.
        console.error(
          `[gemini-ocr] WARNING: document row creation failed for "${fileName}": ${docError.message}`,
        );
      } else {
        documentId = docRow?.id ?? null;
      }

      console.info(
        `[gemini-ocr] OK "${fileName}" → property=${propertyId ?? 'none'} document=${documentId ?? 'none'}`,
      );
      return { status: 'ok', fileName, propertyId, documentId };
    }),
  );

  const successes = results.filter((r): r is SuccessResult => r.status === 'ok');
  const errors = results.filter((r): r is FailureResult => r.status === 'error');

  return NextResponse.json(
    {
      processed: results.length,
      succeeded: successes.length,
      failed: errors.length,
      results,
    },
    { status: errors.length === results.length ? 422 : 200 },
  );
}
