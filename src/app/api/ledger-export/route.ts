import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

/**
 * GET /api/ledger-export
 *
 * Exports all `financial_ledgers` rows the authenticated user has RLS
 * visibility into as a UTF-8 CSV file. The download is scoped to the user's
 * organization (if set) or their individual RLS boundary.
 *
 * Query params:
 *   type?    — filter by ledger_type (e.g. 'rent_payment', 'escrow_hold')
 *   status?  — filter by ledger_status (e.g. 'released', 'pending')
 *
 * CSV columns: id, property_id, address, agreement_id, type, amount, currency,
 *              status, web3_tx_hash, created_at
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const typeFilter   = url.searchParams.get('type');
  const statusFilter = url.searchParams.get('status');

  // ── Query ledgers with property address join ──────────────────────────────
  let query = supabase
    .from('financial_ledgers')
    .select('id, property_id, agreement_id, type, amount, currency, status, web3_tx_hash, created_at, properties ( address )')
    .order('created_at', { ascending: false })
    .limit(10000);

  if (typeFilter)   query = query.eq('type', typeFilter);
  if (statusFilter) query = query.eq('status', statusFilter);

  const { data: rows, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // ── Build CSV ─────────────────────────────────────────────────────────────
  const CSV_COLS = ['id', 'property_id', 'address', 'agreement_id', 'type', 'amount', 'currency', 'status', 'web3_tx_hash', 'created_at'];

  function escapeCsv(val: unknown): string {
    const s = val == null ? '' : String(val);
    // Wrap in quotes if contains comma, newline, or double-quote.
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  }

  const lines: string[] = [CSV_COLS.join(',')];

  for (const row of rows ?? []) {
    const address = (row.properties as { address?: string } | null)?.address ?? '';
    lines.push([
      row.id,
      row.property_id,
      address,
      row.agreement_id ?? '',
      row.type,
      row.amount,
      row.currency,
      row.status,
      row.web3_tx_hash ?? '',
      row.created_at,
    ].map(escapeCsv).join(','));
  }

  const csv = lines.join('\r\n');
  const filename = `shtiya-ledger-${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
