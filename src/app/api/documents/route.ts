import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

/**
 * POST /api/documents
 *
 * Inserts a documents row. Used by the voice-scope page (scope_draft) and
 * any other feature that needs to register a file reference without going
 * through the milestone upload flow (T3.4).
 *
 * Body (JSON): {
 *   property_id?:  string
 *   type:          string   (e.g. 'scope_draft', 'cad', 'probate_petition')
 *   bucket_path?:  string   (defaults to a placeholder)
 *   metadata?:     object   (stored in metadata JSONB — not a schema column yet,
 *                            stored as bucket_path JSON-encoded prefix as a workaround)
 * }
 *
 * For scope drafts the full JSON payload is serialised into a path-like string
 * until a dedicated metadata column is added to documents.
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

  const { property_id = null, type, bucket_path, metadata } = body ?? {};

  if (!type || typeof type !== 'string') {
    return NextResponse.json({ error: 'type is required.' }, { status: 400 });
  }

  // For scope drafts: encode the metadata JSON into the bucket_path field
  // (documents.bucket_path is NOT NULL, so we must provide something).
  let resolvedPath = typeof bucket_path === 'string'
    ? bucket_path
    : `drafts/${user.id}/${type}-${Date.now()}.json`;

  if (metadata && !bucket_path) {
    // Embed a base64 snapshot so the data survives without a real Storage upload.
    const encoded = Buffer.from(JSON.stringify(metadata)).toString('base64');
    resolvedPath = `meta:${encoded}`;
  }

  const { data: doc, error: docError } = await supabase
    .from('documents')
    .insert({
      property_id: property_id ?? null,
      uploaded_by: user.id,
      type,
      bucket_path: resolvedPath,
    })
    .select()
    .single();

  if (docError || !doc) {
    return NextResponse.json({ error: docError?.message ?? 'Insert failed.' }, { status: 500 });
  }

  return NextResponse.json({ document: doc }, { status: 201 });
}
