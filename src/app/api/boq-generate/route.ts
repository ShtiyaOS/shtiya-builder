import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateBoQ } from '@/lib/gemini/boq-generator';

export const runtime = 'nodejs';

/**
 * POST /api/boq-generate
 *
 * Fetches a vaulted PDF document from Supabase Storage and generates a
 * Bill of Quantities via Gemini. Only PDF documents (type='cad') are
 * supported — the caller should ensure the selected document is a PDF.
 *
 * Body: { document_id: string; property_id: string; context_text?: string }
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Request body must be JSON.' }, { status: 400 });
  }

  const { document_id, property_id, context_text } = body ?? {};
  if (!document_id || typeof document_id !== 'string') {
    return NextResponse.json({ error: 'document_id is required.' }, { status: 400 });
  }
  if (!property_id || typeof property_id !== 'string') {
    return NextResponse.json({ error: 'property_id is required.' }, { status: 400 });
  }

  // ── Fetch the document record ─────────────────────────────────────────────
  const { data: doc, error: docErr } = await supabase
    .from('documents')
    .select('id, bucket_path, type, property_id')
    .eq('id', document_id)
    .eq('type', 'cad')
    .single();

  if (docErr || !doc) {
    return NextResponse.json({ error: 'CAD document not found.' }, { status: 404 });
  }

  if (doc.property_id !== property_id) {
    return NextResponse.json({ error: 'Document does not belong to this property.' }, { status: 400 });
  }

  // Only PDFs can be sent to Gemini as inline data.
  const ext = doc.bucket_path.split('.').pop()?.toLowerCase();
  if (ext !== 'pdf') {
    return NextResponse.json(
      { error: `BoQ generation requires a PDF file. Provided file has extension ".${ext}".` },
      { status: 400 },
    );
  }

  // ── Download from Storage ─────────────────────────────────────────────────
  const { data: fileData, error: downloadErr } = await supabase.storage
    .from('cad-vault')
    .download(doc.bucket_path);

  if (downloadErr || !fileData) {
    return NextResponse.json(
      { error: `Could not retrieve file from storage: ${downloadErr?.message ?? 'unknown error'}` },
      { status: 500 },
    );
  }

  const MAX_GEMINI_BYTES = 20 * 1024 * 1024; // 20 MB inline limit
  if (fileData.size > MAX_GEMINI_BYTES) {
    return NextResponse.json(
      { error: 'File exceeds the 20 MB Gemini inline-data limit. Use a smaller or compressed PDF.' },
      { status: 400 },
    );
  }

  const arrayBuffer = await fileData.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString('base64');

  // ── Generate BoQ ──────────────────────────────────────────────────────────
  try {
    const boq = await generateBoQ(
      base64,
      'application/pdf',
      typeof context_text === 'string' ? context_text : undefined,
    );
    return NextResponse.json({ boq }, { status: 200 });
  } catch (err) {
    console.error('[boq-generate] Gemini error:', String(err));
    return NextResponse.json({ error: `BoQ generation failed: ${String(err)}` }, { status: 500 });
  }
}
