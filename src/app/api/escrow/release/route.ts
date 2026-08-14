import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { releaseFunds, getOnChainBalance } from '@/lib/web3/escrow-contract';

/**
 * POST /api/escrow/release
 *
 * Vision-gated draw release endpoint (Agentic: Vision).
 *
 * Flow:
 *   1. Validate the ledger exists and has status = 'held'.
 *   2. Query the latest vision_inspections row for the associated document.
 *   3. If blocks_draw = true → reject with HTTP 409 + human-readable reason.
 *   4. Cross-check on-chain balance ≥ ledger amount (optional, skipped if Web3 not configured).
 *   5. Call releaseFunds() on the contract.
 *   6. Update financial_ledgers.status = 'released' and web3_tx_hash.
 *
 * Body: {
 *   ledger_id:  string   — UUID of the financial_ledger row
 *   recipient:  string   — Ethereum address of the payee
 *   document_id?: string — UUID of the milestone document to Vision-gate against.
 *                          If omitted, latest document for the property is used.
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

  const { ledger_id, recipient, document_id } = body ?? {};

  if (!ledger_id || typeof ledger_id !== 'string') {
    return NextResponse.json({ error: 'ledger_id is required.' }, { status: 400 });
  }
  if (!recipient || typeof recipient !== 'string') {
    return NextResponse.json({ error: 'recipient (Ethereum address) is required.' }, { status: 400 });
  }

  // ── 1. Fetch the ledger ───────────────────────────────────────────────────
  const { data: ledger, error: ledgerError } = await supabase
    .from('financial_ledgers')
    .select('id, property_id, status, amount, web3_tx_hash')
    .eq('id', ledger_id)
    .single();

  if (ledgerError || !ledger) {
    return NextResponse.json({ error: 'Ledger not found.' }, { status: 404 });
  }
  if (ledger.status !== 'held') {
    return NextResponse.json(
      { error: `Cannot release: ledger status is "${ledger.status}", expected "held".` },
      { status: 409 },
    );
  }

  // ── 2. Vision gate ────────────────────────────────────────────────────────
  // Find the most recent vision_inspections row for this property (or specific doc).
  let inspectionQuery = supabase
    .from('vision_inspections')
    .select('id, blocks_draw, flagged_issues, ai_summary, confidence')
    .eq('property_id', ledger.property_id)
    .order('created_at', { ascending: false })
    .limit(1);

  if (document_id && typeof document_id === 'string') {
    inspectionQuery = supabase
      .from('vision_inspections')
      .select('id, blocks_draw, flagged_issues, ai_summary, confidence')
      .eq('document_id', document_id)
      .order('created_at', { ascending: false })
      .limit(1);
  }

  const { data: inspections } = await inspectionQuery;
  const inspection = inspections?.[0] ?? null;

  if (inspection?.blocks_draw) {
    type FlaggedIssue = { issue: string; severity: string };
    const blocking = ((inspection.flagged_issues ?? []) as FlaggedIssue[])
      .filter((i) => i.severity === 'high' || i.severity === 'critical')
      .map((i) => i.issue);

    return NextResponse.json(
      {
        error: 'Draw release blocked by Vision inspection.',
        reason: blocking.length
          ? `Blocking issues: ${blocking.join('; ')}`
          : 'High or critical severity issues were flagged during the Vision inspection.',
        inspection_id: inspection.id,
        blocks_draw: true,
      },
      { status: 409 },
    );
  }

  // ── 3. On-chain cross-check (optional — skipped if Web3 not configured) ──
  let txHash: string | null = null;
  const web3Configured =
    process.env.ESCROW_RPC_URL &&
    process.env.ESCROW_CONTRACT_ADDRESS &&
    process.env.ESCROW_PRIVATE_KEY;

  if (web3Configured) {
    try {
      const onChainBalance = await getOnChainBalance(ledger_id);
      const requiredWei = BigInt(Math.round(ledger.amount * 100));
      if (onChainBalance < requiredWei) {
        console.warn(
          `[escrow-release] On-chain balance (${onChainBalance}) < required (${requiredWei}) for ledger ${ledger_id}`,
        );
      }
      const releaseResult = await releaseFunds(ledger_id, recipient);
      txHash = releaseResult.txHash;
    } catch (err) {
      console.error('[escrow-release] Web3 release failed:', String(err));
      return NextResponse.json(
        { error: `On-chain release failed: ${String(err)}` },
        { status: 502 },
      );
    }
  } else {
    // Testnet / local dev — skip the on-chain call but still update DB.
    console.warn('[escrow-release] Web3 env vars not configured — skipping on-chain release.');
    txHash = `mock-tx-${Date.now()}`;
  }

  // ── 4. Update ledger to released ─────────────────────────────────────────
  // .select().single() is required here, not optional: without it,
  // PostgREST returns { error: null } even when RLS silently excludes the
  // row (0 rows affected) — this route would otherwise report HTTP 200 with
  // a fabricated tx hash while the ledger was never actually updated.
  // .single() forces a hard error (PGRST116) whenever the update doesn't
  // affect exactly one row.
  const { data: updatedLedger, error: updateError } = await supabase
    .from('financial_ledgers')
    .update({ status: 'released', web3_tx_hash: txHash })
    .eq('id', ledger_id)
    .select()
    .single();

  if (updateError || !updatedLedger) {
    const blockedByRls = updateError?.code === 'PGRST116';
    console.error(
      '[escrow-release] DB update failed:',
      updateError?.message ?? 'no matching row updated',
    );
    return NextResponse.json(
      {
        error: blockedByRls
          ? 'On-chain release succeeded but the ledger update was not permitted (or the ledger no longer matches) — release was NOT recorded.'
          : `On-chain release succeeded but DB update failed: ${updateError?.message}`,
      },
      { status: blockedByRls ? 403 : 500 },
    );
  }

  console.info(`[escrow-release] OK ledger=${ledger_id} tx=${txHash} recipient=${recipient}`);

  return NextResponse.json(
    {
      ledger_id,
      status: 'released',
      web3_tx_hash: txHash,
      vision_cleared: inspection !== null,
      inspection_id: inspection?.id ?? null,
    },
    { status: 200 },
  );
}
