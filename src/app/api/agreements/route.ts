import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// ── Agreement templates ───────────────────────────────────────────────────────
// Plain-text template content keyed by agreement_type. Full PDF rendering
// (via Storage) is wired in T3.4; for now a bucket_path placeholder is stored.
const TEMPLATES: Record<string, string> = {
  psa: `PURCHASE AND SALE AGREEMENT

This Purchase and Sale Agreement ("Agreement") is entered into as of {date} by and between the parties listed herein.

1. PROPERTY. Seller agrees to sell and Buyer agrees to purchase the property located at {property_address}.
2. PURCHASE PRICE. The total purchase price shall be mutually agreed upon by the parties.
3. BINDING ARBITRATION. Any disputes arising from this Agreement shall be resolved by binding arbitration.
4. CLOSING. Closing shall occur within 30 days of execution of this Agreement.

IN WITNESS WHEREOF, the parties have executed this Agreement as of the date first written above.`,

  jv: `JOINT VENTURE AGREEMENT

This Joint Venture Agreement ("Agreement") is entered into as of {date} by and among the parties listed herein.

1. PURPOSE. The parties agree to jointly develop and manage the property at {property_address}.
2. CONTRIBUTIONS. Each party's contributions shall be as set forth in Schedule A.
3. PROFIT SHARING. Net profits and losses shall be allocated proportionally to contributions.
4. BINDING ARBITRATION. Any disputes arising from this Agreement shall be resolved by binding arbitration.
5. TERM. This Agreement commences on execution and continues until the joint venture purpose is fulfilled.

IN WITNESS WHEREOF, the parties have executed this Agreement.`,

  lease: `LEASE AGREEMENT

This Lease Agreement ("Lease") is entered into as of {date}.

1. PREMISES. Landlord leases to Tenant the property at {property_address}.
2. TERM. The lease term commences on the start date and continues for the agreed period.
3. RENT. Monthly rent shall be as agreed by the parties.
4. BINDING ARBITRATION. Disputes shall be resolved by binding arbitration.`,

  arbitration_clause: `BINDING ARBITRATION CLAUSE

The parties agree that any dispute, claim, or controversy arising out of or relating to this Agreement shall be settled by binding arbitration administered under the rules of the American Arbitration Association.`,
};

/**
 * POST /api/agreements
 *
 * Creates a new agreement row, inserts a placeholder documents row, and
 * links them via agreements.document_id.
 *
 * Body: {
 *   type:                'psa' | 'jv' | 'lease' | 'arbitration_clause'
 *   property_id?:        string   — optional UUID
 *   binding_arbitration?: boolean — defaults to true
 *   parties?:            { user_id: string; role: string }[]
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

  const {
    type,
    property_id = null,
    binding_arbitration = true,
    parties = [],
  } = body ?? {};

  if (!type || !['psa', 'jv', 'lease', 'arbitration_clause'].includes(type as string)) {
    return NextResponse.json(
      { error: 'type must be one of: psa, jv, lease, arbitration_clause' },
      { status: 400 },
    );
  }

  // Seed the initiating user as the first party.
  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  const initialParty = { user_id: user.id, role: profile?.role ?? 'owner', signed_at: null };
  const partiesList = [
    initialParty,
    ...((parties as { user_id: string; role: string }[]).filter(
      (p) => p.user_id !== user.id,
    ).map((p) => ({ ...p, signed_at: null }))),
  ];

  // 1. Insert the agreement row (document_id is null until step 3).
  const { data: agreement, error: agreeError } = await supabase
    .from('agreements')
    .insert({
      type,
      property_id: property_id ?? null,
      parties: partiesList,
      binding_arbitration,
      status: 'draft',
    })
    .select()
    .single();

  if (agreeError || !agreement) {
    return NextResponse.json({ error: agreeError?.message ?? 'Insert failed' }, { status: 500 });
  }

  // 2. Insert a placeholder documents row (bucket_path filled by T3.4 Storage).
  const templateText = TEMPLATES[type as string] ?? '';
  const bucketPath = `agreements/${agreement.id}/${type}-${Date.now()}.txt`;

  const { data: doc, error: docError } = await supabase
    .from('documents')
    .insert({
      property_id: property_id ?? null,
      uploaded_by: user.id,
      type: `agreement_${type}`,
      bucket_path: bucketPath,
    })
    .select('id')
    .single();

  if (docError || !doc) {
    // Non-fatal — agreement was created; document linkage can be retried.
    console.error(`[agreements] document insert failed: ${docError?.message}`);
    return NextResponse.json({ agreement, document_id: null, template: templateText }, { status: 201 });
  }

  // 3. Link the document back to the agreement.
  await supabase
    .from('agreements')
    .update({ document_id: doc.id })
    .eq('id', agreement.id);

  return NextResponse.json(
    { agreement: { ...agreement, document_id: doc.id }, template: templateText },
    { status: 201 },
  );
}

/**
 * PATCH /api/agreements
 *
 * Appends a signed_at timestamp to the matching party entry in
 * agreements.parties. Advances status:
 *   draft → pending_signature  (on first signature, if not already)
 *   pending_signature → executed  (when ALL parties have signed)
 *
 * Body: { agreement_id: string; party_user_id?: string }
 * party_user_id defaults to the authenticated user's id.
 */
export async function PATCH(request: NextRequest) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Request body must be JSON.' }, { status: 400 });
  }

  const { agreement_id, party_user_id } = body ?? {};
  if (!agreement_id || typeof agreement_id !== 'string') {
    return NextResponse.json({ error: 'agreement_id is required.' }, { status: 400 });
  }

  const signingUserId = (party_user_id as string | undefined) ?? user.id;

  const { data: agreement, error: fetchError } = await supabase
    .from('agreements')
    .select('id, parties, status')
    .eq('id', agreement_id)
    .single();

  if (fetchError || !agreement) {
    return NextResponse.json({ error: 'Agreement not found.' }, { status: 404 });
  }

  if (agreement.status === 'executed') {
    return NextResponse.json({ error: 'Agreement is already fully executed.' }, { status: 409 });
  }

  type Party = { user_id: string; role: string; signed_at: string | null };
  const parties = (agreement.parties ?? []) as Party[];
  const partyIndex = parties.findIndex((p) => p.user_id === signingUserId);

  if (partyIndex === -1) {
    return NextResponse.json({ error: 'User is not a listed party on this agreement.' }, { status: 403 });
  }
  if (parties[partyIndex].signed_at) {
    return NextResponse.json({ error: 'This party has already signed.' }, { status: 409 });
  }

  // Stamp the party's signed_at.
  const updatedParties = parties.map((p, i) =>
    i === partyIndex ? { ...p, signed_at: new Date().toISOString() } : p,
  );

  // Determine new status.
  const allSigned = updatedParties.every((p) => p.signed_at !== null);
  const newStatus = allSigned
    ? 'executed'
    : agreement.status === 'draft'
      ? 'pending_signature'
      : agreement.status;

  const { data: updated, error: updateError } = await supabase
    .from('agreements')
    .update({ parties: updatedParties, status: newStatus })
    .eq('id', agreement_id)
    .select()
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ agreement: updated, status: newStatus }, { status: 200 });
}
