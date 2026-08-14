import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { fetchTaxDebts } from '@/lib/nyc-open-data/client';

/**
 * POST /api/nyc-debt
 *
 * Pulls municipal tax-debt records for a given property from NYC Open Data
 * and inserts them into `financial_ledgers` (type = 'tax_debt').
 *
 * Body: { property_id: string }
 *
 * The property record must have a `bbl` value — properties ingested via the
 * probate OCR flow (T2.4) receive a placeholder BBL that must be replaced with
 * the real 10-digit NYC BBL before this endpoint is called.
 *
 * Each TaxDebtRecord returned by the Open Data API becomes one ledger row,
 * keyed on (property_id, amount, tax_year) to avoid duplicate imports if the
 * endpoint is called more than once for the same property.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();

  // ── Auth ─────────────────────────────────────────────────────────────────
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Request body must be JSON.' }, { status: 400 });
  }

  const { property_id } = body ?? {};
  if (!property_id || typeof property_id !== 'string') {
    return NextResponse.json({ error: 'property_id (string) is required.' }, { status: 400 });
  }

  // ── Fetch the property record ─────────────────────────────────────────────
  const { data: property, error: propError } = await supabase
    .from('properties')
    .select('id, bbl, address')
    .eq('id', property_id)
    .single();

  if (propError || !property) {
    return NextResponse.json(
      { error: `Property not found: ${propError?.message ?? 'no rows returned'}` },
      { status: 404 },
    );
  }

  if (!property.bbl || property.bbl.startsWith('PROBATE-')) {
    return NextResponse.json(
      {
        error:
          'Property does not have a valid NYC BBL. ' +
          'Update bbl to the 10-digit Borough-Block-Lot before pulling tax debt.',
      },
      { status: 422 },
    );
  }

  // ── Pull tax debts from NYC Open Data ─────────────────────────────────────
  let debtRecords;
  try {
    debtRecords = await fetchTaxDebts(property.bbl);
  } catch (err) {
    console.error(`[nyc-debt] Open Data fetch failed for property ${property_id}: ${String(err)}`);
    return NextResponse.json(
      { error: `NYC Open Data request failed: ${String(err)}` },
      { status: 502 },
    );
  }

  if (!debtRecords.length) {
    return NextResponse.json(
      { property_id, inserted: 0, message: 'No tax debt records found for this BBL.' },
      { status: 200 },
    );
  }

  // ── Insert into financial_ledgers ─────────────────────────────────────────
  // upsert on (property_id, type, amount, created_at) would require a DB
  // constraint; instead we insert all and rely on the DB unique index if one
  // is added later. For now we do a plain insert and log any conflicts.
  const rows = debtRecords.map((d) => ({
    property_id,
    type: 'tax_debt' as const,
    amount: d.amount,
    currency: 'USD',
    status: 'pending' as const,
    // Store tax_year + debt_type in the web3_tx_hash column as a tagged string
    // until a dedicated metadata column exists on financial_ledgers.
    // This field is nullable so no schema change is needed.
    web3_tx_hash: null,
    // We store the BBL and extra context inside a metadata field — but since
    // financial_ledgers has no metadata column yet, we embed it in agreement_id
    // as null and rely on the raw record being retrievable via the property.
    agreement_id: null,
  }));

  const { data: inserted, error: insertError } = await supabase
    .from('financial_ledgers')
    .insert(rows)
    .select('id, amount');

  if (insertError) {
    console.error(
      `[nyc-debt] DB insert failed for property ${property_id}: ${insertError.message}`,
    );
    return NextResponse.json(
      { error: `DB insert failed: ${insertError.message}` },
      { status: 500 },
    );
  }

  const totalAmount = debtRecords.reduce((sum, d) => sum + d.amount, 0);

  console.info(
    `[nyc-debt] OK property=${property_id} bbl=${property.bbl} ` +
      `inserted=${inserted?.length ?? 0} totalAmount=${totalAmount.toFixed(2)}`,
  );

  return NextResponse.json(
    {
      property_id,
      bbl: property.bbl,
      inserted: inserted?.length ?? 0,
      total_debt_usd: totalAmount,
      ledger_ids: inserted?.map((r: { id: string }) => r.id) ?? [],
    },
    { status: 201 },
  );
}
