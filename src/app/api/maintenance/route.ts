import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

/**
 * POST /api/maintenance
 *
 * Submits a maintenance ticket for a property.
 *
 * Flow:
 *   1. Insert a `documents` row (type='maintenance_ticket') with the ticket
 *      payload encoded into bucket_path (meta: prefix, same pattern as scope drafts).
 *   2. Insert a `documents` row (type='scope_draft') linked to the same property
 *      so the assigned trade appears in the Contractor app's pending work queue.
 *   3. Return both document IDs.
 *
 * Body: {
 *   property_id:   string
 *   trade:         string   — e.g. 'Plumbing', 'Electrical', 'HVAC'
 *   description:   string   — plain-text problem description
 *   urgency?:      'low' | 'normal' | 'urgent'   — default 'normal'
 * }
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

  const { property_id, trade, description, urgency = 'normal' } = body ?? {};

  if (!property_id || typeof property_id !== 'string') {
    return NextResponse.json({ error: 'property_id is required.' }, { status: 400 });
  }
  if (!trade || typeof trade !== 'string') {
    return NextResponse.json({ error: 'trade is required.' }, { status: 400 });
  }
  if (!description || typeof description !== 'string') {
    return NextResponse.json({ error: 'description is required.' }, { status: 400 });
  }

  const ticketMeta = {
    trade,
    description,
    urgency,
    submitted_by: user.id,
    submitted_at: new Date().toISOString(),
  };

  // ── 1. Insert maintenance_ticket document ─────────────────────────────────
  const encoded = Buffer.from(JSON.stringify(ticketMeta)).toString('base64');
  const ticketPath = `meta:${encoded}`;

  const { data: ticketDoc, error: ticketErr } = await supabase
    .from('documents')
    .insert({
      property_id,
      uploaded_by: user.id,
      type: 'maintenance_ticket',
      bucket_path: ticketPath,
    })
    .select('id')
    .single();

  if (ticketErr || !ticketDoc) {
    return NextResponse.json({ error: `Failed to create ticket: ${ticketErr?.message}` }, { status: 500 });
  }

  // ── 2. Auto-create scope_draft visible in Contractor app ──────────────────
  const scopeMeta = {
    project_title: `Maintenance: ${trade}`,
    notes: `Urgency: ${urgency}. Submitted by tenant/PM.`,
    source: 'maintenance_ticket',
    ticket_id: ticketDoc.id,
    line_items: [
      {
        trade,
        description,
        unit: null,
        quantity: null,
        unit_cost_usd: null,
      },
    ],
  };

  const scopeEncoded = Buffer.from(JSON.stringify(scopeMeta)).toString('base64');
  const scopePath = `meta:${scopeEncoded}`;

  const { data: scopeDoc, error: scopeErr } = await supabase
    .from('documents')
    .insert({
      property_id,
      uploaded_by: user.id,
      type: 'scope_draft',
      bucket_path: scopePath,
    })
    .select('id')
    .single();

  if (scopeErr || !scopeDoc) {
    // Scope creation is best-effort — ticket already saved, log and continue.
    console.warn('[maintenance] scope_draft insert failed:', scopeErr?.message);
  }

  return NextResponse.json(
    {
      ticket_document_id: ticketDoc.id,
      scope_document_id: scopeDoc?.id ?? null,
      trade,
      urgency,
    },
    { status: 201 },
  );
}
