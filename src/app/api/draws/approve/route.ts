import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getOnChainBalance } from '@/lib/web3/escrow-contract';

/**
 * POST /api/draws/approve
 *
 * Approves a draw by advancing financial_ledgers.status:
 *   pending → held      (lender approves the hold)
 *   held    → released  (lender approves the release, Vision-gate skipped here —
 *                        use /api/escrow/release for Vision-gated releases)
 *
 * Also checks compliance_checks for the property's contractor — blocks if lapsed.
 * Emits a deal_room_events row for the Pulse live channel (T4.3).
 *
 * Body: { ledger_id: string; action: 'hold' | 'release'; recipient?: string }
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Only lenders and admins may approve draws.
  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || !['lender', 'admin'].includes(profile.role)) {
    return NextResponse.json({ error: 'Only lenders and admins may approve draws.' }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Request body must be JSON.' }, { status: 400 });
  }

  const { ledger_id, action } = body ?? {};
  if (!ledger_id || typeof ledger_id !== 'string') {
    return NextResponse.json({ error: 'ledger_id is required.' }, { status: 400 });
  }
  if (action !== 'hold' && action !== 'release') {
    return NextResponse.json({ error: 'action must be "hold" or "release".' }, { status: 400 });
  }

  // ── Fetch the ledger ──────────────────────────────────────────────────────
  const { data: ledger, error: ledgerErr } = await supabase
    .from('financial_ledgers')
    .select('id, property_id, status, amount, web3_tx_hash')
    .eq('id', ledger_id)
    .single();

  if (ledgerErr || !ledger) {
    return NextResponse.json({ error: 'Ledger not found.' }, { status: 404 });
  }

  const expectedStatus = action === 'hold' ? 'pending' : 'held';
  if (ledger.status !== expectedStatus) {
    return NextResponse.json(
      { error: `Cannot ${action}: ledger status is "${ledger.status}", expected "${expectedStatus}".` },
      { status: 409 },
    );
  }

  // ── Sentinel compliance gate ──────────────────────────────────────────────
  // Find the contractor for this property via documents and check compliance.
  const { data: contractorDoc } = await supabase
    .from('documents')
    .select('uploaded_by')
    .eq('property_id', ledger.property_id)
    .in('type', ['photo', 'video', 'scope_draft'])
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (contractorDoc?.uploaded_by) {
    const { data: compliance } = await supabase
      .from('compliance_checks')
      .select('status')
      .eq('contractor_id', contractorDoc.uploaded_by)
      .order('last_verified_at', { ascending: false })
      .limit(1)
      .single();

    if (compliance?.status === 'lapsed') {
      return NextResponse.json(
        {
          error: 'Draw blocked: contractor compliance has lapsed.',
          reason: 'Sentinel verification found an expired license or insurance. Re-verify to unblock.',
          compliance_status: 'lapsed',
        },
        { status: 409 },
      );
    }
  }

  // ── On-chain cross-check for releases ────────────────────────────────────
  if (action === 'release' && ledger.web3_tx_hash && process.env.ESCROW_RPC_URL) {
    try {
      const onChain = await getOnChainBalance(ledger_id);
      if (onChain === 0n) {
        return NextResponse.json(
          { error: 'On-chain balance is zero — funds may have already been released.' },
          { status: 409 },
        );
      }
    } catch (err) {
      console.warn('[draws/approve] On-chain balance check failed:', String(err));
      // Non-fatal — proceed with DB-only release if Web3 is unavailable.
    }
  }

  // ── Advance the status ────────────────────────────────────────────────────
  const newStatus = action === 'hold' ? 'held' : 'released';

  // .select().single() (already present) forces a hard PGRST116 error when
  // the update affects 0 rows (e.g. RLS-blocked) instead of a silent
  // success — distinguish that case from a genuine server error below.
  const { data: updated, error: updateErr } = await supabase
    .from('financial_ledgers')
    .update({ status: newStatus })
    .eq('id', ledger_id)
    .select()
    .single();

  if (updateErr || !updated) {
    const blockedByRls = updateErr?.code === 'PGRST116';
    return NextResponse.json(
      { error: blockedByRls ? 'Ledger update was not permitted (or no longer matches).' : updateErr?.message },
      { status: blockedByRls ? 403 : 500 },
    );
  }

  // ── Emit Pulse event ──────────────────────────────────────────────────────
  await supabase.from('deal_room_events').insert({
    financial_ledger_id: ledger_id,
    event_type: 'draw_status_changed',
    payload: {
      ledger_id,
      previous_status: ledger.status,
      new_status: newStatus,
      approved_by: user.id,
    },
  });

  return NextResponse.json({ ledger: updated, status: newStatus }, { status: 200 });
}
