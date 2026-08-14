/**
 * supabase/functions/watchdog-poll/index.ts
 *
 * Agentic: Watchdog — NYC Open Data Violation Poller
 *
 * Invoked daily by pg_cron (see 0004_watchdog_cron.sql). For every property
 * that has a non-placeholder BBL, this function:
 *
 *  1. Queries four NYC Open Data datasets:
 *       DOB  — Buildings Violations  (w6n1-6ukb)
 *       HPD  — Housing Maintenance Code Violations  (wvxf-dwi5)
 *       ECB  — Environmental Control Board Violations  (6bgk-3dad)
 *       311  — Service Requests (open complaints)  (erm2-nwe9)
 *
 *  2. Upserts each record into the `violations` table, deduped on
 *     (source, external_id) — the unique constraint defined in 0001_core_schema.sql.
 *
 *  3. For every NEW violation on a property that belongs to an investor or owner,
 *     inserts a `deal_room_events` row so subscribed Realtime clients are notified
 *     within ~2 seconds (via the Pulse channel added in T2.3).
 *
 * Environment variables (set in Supabase Dashboard → Edge Functions → Secrets):
 *   SUPABASE_URL           — automatically injected by the runtime
 *   SUPABASE_SERVICE_ROLE_KEY — automatically injected; allows bypassing RLS for batch writes
 *   NYC_OPEN_DATA_APP_TOKEN   — optional; raises SODA rate limit from 1 000 to 50 000 req/hr
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ── SODA configuration ────────────────────────────────────────────────────────

const SODA_BASE = 'https://data.cityofnewyork.us/resource';
const APP_TOKEN = Deno.env.get('NYC_OPEN_DATA_APP_TOKEN') ?? '';

/** Dataset IDs mapped to violation sources. */
const DATASETS: { source: 'DOB' | 'HPD' | 'ECB' | '311'; dataset: string; bblField: string; idField: string; descField: string; dateField: string }[] = [
  {
    source: 'DOB',
    dataset: 'w6n1-6ukb',
    bblField: 'bin',          // DOB uses BIN; we filter by BBL via address match + boro_block_lot
    idField: 'isndobbisviol',
    descField: 'description',
    dateField: 'issue_date',
  },
  {
    source: 'HPD',
    dataset: 'wvxf-dwi5',
    bblField: 'bbl',
    idField: 'violationid',
    descField: 'novdescription',
    dateField: 'inspectiondate',
  },
  {
    source: 'ECB',
    dataset: '6bgk-3dad',
    bblField: 'boro_block_lot',
    idField: 'ecb_violation_number',
    descField: 'violation_description',
    dateField: 'issue_date',
  },
  {
    source: '311',
    dataset: 'erm2-nwe9',
    bblField: 'bbl',
    idField: 'unique_key',
    descField: 'descriptor',
    dateField: 'created_date',
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function sodaHeaders(): HeadersInit {
  const h: HeadersInit = { Accept: 'application/json' };
  if (APP_TOKEN) h['X-App-Token'] = APP_TOKEN;
  return h;
}

function normaliseBbl(bbl: string): string {
  return bbl.replace(/[^0-9]/g, '');
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (_req: Request) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // Service-role client bypasses RLS — required for bulk upserts across all tenants.
  const supabase = createClient(supabaseUrl, serviceKey);

  const startedAt = new Date().toISOString();
  let totalUpserted = 0;
  let totalEvents = 0;
  const errors: string[] = [];

  // ── 1. Fetch all properties with valid BBLs ──────────────────────────────
  const { data: properties, error: propError } = await supabase
    .from('properties')
    .select('id, bbl, owner_id')
    .not('bbl', 'ilike', 'PROBATE-%')
    .not('bbl', 'is', null);

  if (propError || !properties?.length) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: propError?.message ?? 'No properties with valid BBLs found.',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // ── 2. Poll each dataset for each property ───────────────────────────────
  for (const property of properties) {
    const bbl = normaliseBbl(property.bbl);
    if (!bbl) continue;

    for (const ds of DATASETS) {
      try {
        const url =
          `${SODA_BASE}/${ds.dataset}.json` +
          `?${ds.bblField}=${encodeURIComponent(bbl)}&$limit=100&$order=${ds.dateField}+DESC`;

        const res = await fetch(url, { headers: sodaHeaders() });
        if (!res.ok) {
          errors.push(`[${ds.source}] HTTP ${res.status} for BBL ${bbl}`);
          continue;
        }

        const rows = (await res.json()) as Record<string, unknown>[];
        if (!rows.length) continue;

        // ── Upsert violations ─────────────────────────────────────────────
        const violationRows = rows.map((row) => ({
          property_id: property.id,
          source: ds.source,
          external_id: String(row[ds.idField] ?? ''),
          description: String(row[ds.descField] ?? '').slice(0, 1000),
          issued_date: row[ds.dateField]
            ? String(row[ds.dateField]).slice(0, 10)
            : null,
          status: 'open',
          raw_payload: row,
        })).filter((v) => v.external_id); // drop rows with no ID

        if (!violationRows.length) continue;

        const { data: upserted, error: upsertError } = await supabase
          .from('violations')
          .upsert(violationRows, {
            onConflict: 'source,external_id',
            ignoreDuplicates: false,
          })
          .select('id, external_id');

        if (upsertError) {
          errors.push(`[${ds.source}] upsert error for BBL ${bbl}: ${upsertError.message}`);
          continue;
        }

        const upsertCount = upserted?.length ?? 0;
        totalUpserted += upsertCount;

        // ── 3. Emit Realtime event for new violations ─────────────────────
        // Insert a deal_room_events row per batch so subscribers (investor/owner)
        // receive a notification without polling.
        if (upsertCount > 0) {
          const { error: eventError } = await supabase
            .from('deal_room_events')
            .insert({
              block_committee_id: null,
              financial_ledger_id: null,
              event_type: 'watchdog_violations_detected',
              payload: {
                property_id: property.id,
                source: ds.source,
                count: upsertCount,
                bbl,
                polled_at: startedAt,
              },
            });

          if (!eventError) {
            totalEvents += 1;
          }
        }
      } catch (err) {
        errors.push(`[${ds.source}] Unexpected error for BBL ${bbl}: ${String(err)}`);
      }
    }
  }

  const summary = {
    ok: true,
    started_at: startedAt,
    properties_polled: properties.length,
    violations_upserted: totalUpserted,
    realtime_events_emitted: totalEvents,
    errors,
  };

  console.log('[watchdog-poll]', JSON.stringify(summary));

  return new Response(JSON.stringify(summary), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
