import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

/**
 * POST /api/leads
 *
 * Inbound lead intake for the Shtiya Marketing funnel (T4.14).
 *
 * Agentic: Match (T4.15) — after saving the lead, embeds the description
 * and queries match_properties() via pgvector to find the top-matching
 * property, writing it back to the lead record as `related_property_id`.
 *
 * The lead is stored as a `documents` row (type='lead') with the full
 * payload in bucket_path using the `meta:` encoding pattern, keeping the
 * schema change-free while the dedicated leads table is added in a future
 * migration.
 *
 * Body: {
 *   name:        string
 *   email:       string
 *   phone?:      string
 *   description: string  — plain-text lead description for Match embedding
 *   source?:     string  — e.g. 'website', 'referral', 'google_ads'
 *   budget_usd?: number
 * }
 *
 * Response: {
 *   lead_id:             string   — document.id of the stored lead
 *   related_property_id: string | null
 *   match_score:         number | null  — cosine distance (lower = more similar)
 * }
 */

const GEMINI_API_KEY  = process.env.GEMINI_API_KEY ?? '';
const EMBEDDING_MODEL = 'models/text-embedding-004';
const EMBEDDING_DIMS  = 768;

interface GeminiEmbedResponse {
  embedding: { values: number[] };
}

async function embedText(text: string): Promise<number[] | null> {
  if (!GEMINI_API_KEY) return null;
  try {
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
    if (!res.ok) return null;
    const data = (await res.json()) as GeminiEmbedResponse;
    const values = data.embedding?.values;
    if (!Array.isArray(values) || values.length !== EMBEDDING_DIMS) return null;
    return values;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  // Leads endpoint is public — no auth required (marketing funnel).
  // We still create a server client so RLS applies to any DB reads.

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Request body must be JSON.' }, { status: 400 });
  }

  const { name, email, phone, description, source, budget_usd } = body ?? {};

  if (!name || typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: '`name` is required.' }, { status: 400 });
  }
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return NextResponse.json({ error: '`email` must be a valid email address.' }, { status: 400 });
  }
  if (!description || typeof description !== 'string' || !description.trim()) {
    return NextResponse.json({ error: '`description` is required.' }, { status: 400 });
  }

  // ── 1. Store lead as a documents row ─────────────────────────────────────
  const leadPayload = {
    name: (name as string).trim(),
    email: (email as string).trim(),
    phone:       typeof phone === 'string' ? phone.trim() : null,
    description: (description as string).trim(),
    source:      typeof source === 'string' ? source : 'direct',
    budget_usd:  typeof budget_usd === 'number' ? budget_usd : null,
    submitted_at: new Date().toISOString(),
    related_property_id: null as string | null,
    match_score: null as number | null,
  };

  // ── 2. Agentic: Match — embed the description + find top property ─────────
  const embedding = await embedText(leadPayload.description);

  if (embedding) {
    const vectorLiteral = `[${embedding.join(',')}]`;
    try {
      // match_properties() runs SECURITY INVOKER, and this is a public,
      // unauthenticated funnel — auth.uid() is NULL for this request, so a
      // normal RLS-scoped client would always get zero rows from
      // properties_owner_access regardless of similarity. Use the
      // service-role admin client here specifically to bypass RLS for this
      // lookup; the lead itself is still stored via the regular RLS-scoped
      // client below (documents_insert_public_lead, added in 0007).
      const admin = createAdminClient();
      const { data: matchRows } = await admin.rpc('match_properties', {
        query_embedding: vectorLiteral,
        match_count: 1,
      });

      if (matchRows && (matchRows as { id: string; score: number }[]).length > 0) {
        const top = (matchRows as { id: string; score: number }[])[0];
        leadPayload.related_property_id = top.id;
        leadPayload.match_score = top.score;
      }
    } catch (err) {
      // Match enrichment is best-effort (e.g. SUPABASE_SERVICE_ROLE_KEY not
      // configured in this environment) — the lead is still saved below.
      console.error('[leads] Match lookup failed:', String(err));
    }
  }

  // ── 3. Persist the lead ───────────────────────────────────────────────────
  const encoded  = Buffer.from(JSON.stringify(leadPayload)).toString('base64');
  const leadPath = `meta:${encoded}`;

  const { data: doc, error: docErr } = await supabase
    .from('documents')
    .insert({
      property_id:  leadPayload.related_property_id ?? null,
      uploaded_by:  null, // anonymous — no auth session on public funnel
      type:         'lead',
      bucket_path:  leadPath,
    })
    .select('id')
    .single();

  if (docErr || !doc) {
    return NextResponse.json({ error: docErr?.message ?? 'Failed to store lead.' }, { status: 500 });
  }

  return NextResponse.json(
    {
      lead_id:             doc.id,
      related_property_id: leadPayload.related_property_id,
      match_score:         leadPayload.match_score,
    },
    { status: 201 },
  );
}
