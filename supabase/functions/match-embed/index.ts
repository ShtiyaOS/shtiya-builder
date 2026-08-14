/**
 * supabase/functions/match-embed/index.ts
 *
 * Agentic: Match — pgvector Embedding Pipeline
 *
 * Called via HTTP POST from Postgres triggers on `properties`, `agreements`,
 * and `documents` INSERT/UPDATE events (configured in 0005_match_trigger.sql).
 *
 * For each incoming row it:
 *   1. Builds a plain-text representation of the record.
 *   2. Calls the Gemini Embedding API (models/text-embedding-004, 768 dims).
 *   3. Writes the resulting vector back to the source table's `embedding` column
 *      using the service-role client (bypasses RLS).
 *
 * Environment variables (set in Supabase Dashboard → Edge Functions → Secrets):
 *   SUPABASE_URL               — auto-injected by runtime
 *   SUPABASE_SERVICE_ROLE_KEY  — auto-injected; needed for UPDATE across tenants
 *   GEMINI_API_KEY             — Gemini API key for embedding generation
 *
 * Request body (sent by the pg_net HTTP trigger):
 *   {
 *     table:  'properties' | 'agreements' | 'documents'
 *     id:     string   — UUID of the row to embed
 *   }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ── Gemini embedding config ───────────────────────────────────────────────────

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') ?? '';
const EMBEDDING_MODEL = 'models/text-embedding-004';
const EMBEDDING_DIMS = 768;

interface EmbedResponse {
  embedding: { values: number[] };
}

async function embedText(text: string): Promise<number[]> {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not configured.');

  const url = `https://generativelanguage.googleapis.com/v1beta/${EMBEDDING_MODEL}:embedContent?key=${GEMINI_API_KEY}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      content: { parts: [{ text }] },
      taskType: 'RETRIEVAL_DOCUMENT',
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini embed API error ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = (await res.json()) as EmbedResponse;
  const values = data.embedding?.values;
  if (!Array.isArray(values) || values.length !== EMBEDDING_DIMS) {
    throw new Error(`Unexpected embedding dimensions: ${values?.length ?? 0}`);
  }
  return values;
}

// ── Text builders — one per table ─────────────────────────────────────────────

type SupabaseRow = Record<string, unknown>;

function textForProperty(row: SupabaseRow): string {
  return [
    row.address ? `Address: ${row.address}` : '',
    row.bbl ? `BBL: ${row.bbl}` : '',
    row.status ? `Status: ${row.status}` : '',
    row.metadata
      ? `Metadata: ${JSON.stringify(row.metadata).slice(0, 500)}`
      : '',
  ]
    .filter(Boolean)
    .join('. ');
}

function textForAgreement(row: SupabaseRow): string {
  return [
    row.type ? `Agreement type: ${row.type}` : '',
    row.status ? `Status: ${row.status}` : '',
    row.parties
      ? `Parties: ${JSON.stringify(row.parties).slice(0, 300)}`
      : '',
    row.binding_arbitration !== undefined
      ? `Binding arbitration: ${row.binding_arbitration}`
      : '',
  ]
    .filter(Boolean)
    .join('. ');
}

function textForDocument(row: SupabaseRow): string {
  return [
    row.type ? `Document type: ${row.type}` : '',
    row.bucket_path
      ? `File: ${String(row.bucket_path).split('/').pop() ?? ''}`
      : '',
  ]
    .filter(Boolean)
    .join('. ');
}

function buildText(table: string, row: SupabaseRow): string {
  switch (table) {
    case 'properties':
      return textForProperty(row);
    case 'agreements':
      return textForAgreement(row);
    case 'documents':
      return textForDocument(row);
    default:
      return JSON.stringify(row).slice(0, 500);
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  let body: { table?: string; id?: string };
  try {
    body = (await req.json()) as { table?: string; id?: string };
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { table, id } = body;
  if (!table || !id) {
    return new Response(
      JSON.stringify({ error: '`table` and `id` are required.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const allowedTables = ['properties', 'agreements', 'documents'];
  if (!allowedTables.includes(table)) {
    return new Response(
      JSON.stringify({ error: `Unsupported table: ${table}` }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceKey);

  // ── Fetch the row ─────────────────────────────────────────────────────────
  const { data: row, error: fetchErr } = await supabase
    .from(table)
    .select('*')
    .eq('id', id)
    .single();

  if (fetchErr || !row) {
    return new Response(
      JSON.stringify({ error: `Row not found: ${fetchErr?.message ?? 'unknown'}` }),
      { status: 404, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // ── Build text + generate embedding ───────────────────────────────────────
  const text = buildText(table, row as SupabaseRow);
  if (!text.trim()) {
    return new Response(
      JSON.stringify({ ok: true, skipped: true, reason: 'No text to embed.' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }

  let embedding: number[];
  try {
    embedding = await embedText(text);
  } catch (err) {
    console.error('[match-embed] Gemini error:', String(err));
    return new Response(
      JSON.stringify({ error: `Embedding failed: ${String(err)}` }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // ── Write embedding back to source table ──────────────────────────────────
  const { error: updateErr } = await supabase
    .from(table)
    .update({ embedding: JSON.stringify(embedding) })
    .eq('id', id);

  if (updateErr) {
    return new Response(
      JSON.stringify({ error: `Failed to write embedding: ${updateErr.message}` }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }

  console.log(`[match-embed] Embedded ${table}/${id} (${embedding.length} dims)`);

  return new Response(
    JSON.stringify({ ok: true, table, id, dims: embedding.length }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
});
