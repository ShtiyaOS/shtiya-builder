import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

/**
 * POST /api/match
 *
 * Semantic similarity search using pgvector cosine distance.
 * Returns the top-5 most similar rows from a target table for a given
 * query text. Embeddings are generated via the Gemini Embedding API
 * and compared against stored `embedding vector(768)` columns.
 *
 * RLS is enforced by the user-scoped Supabase client — no cross-tenant
 * leakage is possible because the DB policies restrict which rows the
 * authenticated user may read.
 *
 * Body: {
 *   query:       string   — plain-text search phrase
 *   table:       'properties' | 'agreements' | 'documents'
 *   property_id?: string  — optional; restrict results to one property
 *   limit?:      number   — default 5, max 20
 * }
 *
 * Response: { results: Array<{ id, score, ...row_columns }> }
 */

const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? '';
const EMBEDDING_MODEL = 'models/text-embedding-004';
const EMBEDDING_DIMS = 768;
const ALLOWED_TABLES = ['properties', 'agreements', 'documents'] as const;
type AllowedTable = (typeof ALLOWED_TABLES)[number];

interface GeminiEmbedResponse {
  embedding: { values: number[] };
}

async function embedQuery(text: string): Promise<number[]> {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not configured.');

  const url = `https://generativelanguage.googleapis.com/v1beta/${EMBEDDING_MODEL}:embedContent?key=${GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      content: { parts: [{ text }] },
      taskType: 'RETRIEVAL_QUERY',
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini embed error ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = (await res.json()) as GeminiEmbedResponse;
  const values = data.embedding?.values;
  if (!Array.isArray(values) || values.length !== EMBEDDING_DIMS) {
    throw new Error(`Unexpected embedding dimensions: ${values?.length ?? 0}`);
  }
  return values;
}

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

  const { query, table, property_id, limit: rawLimit } = body ?? {};

  if (!query || typeof query !== 'string' || !query.trim()) {
    return NextResponse.json({ error: '`query` is required.' }, { status: 400 });
  }
  if (!table || !ALLOWED_TABLES.includes(table as AllowedTable)) {
    return NextResponse.json(
      { error: `\`table\` must be one of: ${ALLOWED_TABLES.join(', ')}` },
      { status: 400 },
    );
  }

  const limit = Math.min(
    typeof rawLimit === 'number' ? rawLimit : 5,
    20,
  );

  // ── Generate query embedding ──────────────────────────────────────────────
  let queryVector: number[];
  try {
    queryVector = await embedQuery(query.trim());
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }

  // ── Cosine similarity via pgvector <=> operator ───────────────────────────
  // We use Supabase's rpc() with a pre-defined function (defined in 0005_match_trigger.sql).
  // Fallback: use a raw .select() with the operator directly for simpler deployment.
  //
  // The query is expressed as a filter on the `embedding` column using the
  // pgvector cosine distance operator <=> through Supabase's PostgREST layer.
  // PostgREST exposes `order` with custom operators via the `cs` filter style.
  //
  // Because PostgREST doesn't directly support custom operator ordering,
  // we call a Postgres RPC function `match_<table>` created in the migration.
  // If that function doesn't exist yet (dev), we return an empty result set
  // with a hint rather than a 500.

  const vectorLiteral = `[${queryVector.join(',')}]`;

  let rpcName: string;
  switch (table as AllowedTable) {
    case 'properties':  rpcName = 'match_properties';  break;
    case 'agreements':  rpcName = 'match_agreements';  break;
    case 'documents':   rpcName = 'match_documents';   break;
  }

  const rpcParams: Record<string, unknown> = {
    query_embedding: vectorLiteral,
    match_count: limit,
  };
  if (typeof property_id === 'string' && property_id) {
    rpcParams.filter_property_id = property_id;
  }

  const { data: rows, error: rpcErr } = await supabase.rpc(rpcName, rpcParams);

  if (rpcErr) {
    // If the function doesn't exist (function not yet deployed), return empty.
    if (rpcErr.message.includes('does not exist') || rpcErr.code === '42883') {
      return NextResponse.json(
        {
          results: [],
          hint: `RPC function \`${rpcName}\` not yet deployed. Run migration 0005_match_trigger.sql first.`,
        },
        { status: 200 },
      );
    }
    return NextResponse.json({ error: rpcErr.message }, { status: 500 });
  }

  return NextResponse.json({ results: rows ?? [] }, { status: 200 });
}
