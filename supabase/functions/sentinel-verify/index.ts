/**
 * supabase/functions/sentinel-verify/index.ts
 *
 * Agentic: Sentinel — Auto-Compliance Verification Bot
 *
 * Invoked monthly by pg_cron (see 0006_sentinel_cron.sql). For every
 * active contractor (users.role = 'contractor') it:
 *
 *  1. Fetches the most recent compliance_check row.
 *  2. Queries NYC Open Data contractor license registry to re-verify
 *     the license number is still active.
 *  3. Derives the new compliance status:
 *       'valid'         — license active, expiration > 60 days away
 *       'expiring_soon' — active, expiration within 60 days
 *       'lapsed'        — not found in registry OR expiration past
 *  4. Upserts a new compliance_checks row with the refreshed status.
 *
 * A 'lapsed' status is consumed by:
 *   - /api/draws/approve (T4.2) — blocks capital draw approval
 *   - /api/escrow/release (T3.7) — blocks Vision-gated escrow release
 *
 * Environment variables:
 *   SUPABASE_URL               — auto-injected
 *   SUPABASE_SERVICE_ROLE_KEY  — auto-injected; needed for cross-tenant reads/writes
 *   NYC_OPEN_DATA_APP_TOKEN    — optional; raises SODA rate limit
 *
 * NYC Open Data dataset:
 *   DOB Contractor License Registry  (ipu4-2q9a)
 *   Filtered by: license_type, license_number, license_status
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SODA_BASE = 'https://data.cityofnewyork.us/resource';
const APP_TOKEN = Deno.env.get('NYC_OPEN_DATA_APP_TOKEN') ?? '';
const EXPIRING_DAYS = 60;

// ── Helpers ───────────────────────────────────────────────────────────────────

function sodaHeaders(): HeadersInit {
  const h: HeadersInit = { Accept: 'application/json' };
  if (APP_TOKEN) h['X-App-Token'] = APP_TOKEN;
  return h;
}

function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

interface LicenseRow {
  license_status?: string;
  expiration_date?: string;
  license_number?: string;
}

async function verifyLicense(licenseNumber: string): Promise<{
  found: boolean;
  active: boolean;
  expirationDate: Date | null;
}> {
  const url =
    `${SODA_BASE}/ipu4-2q9a.json` +
    `?license_nbr=${encodeURIComponent(licenseNumber)}&$limit=5`;

  try {
    const res = await fetch(url, { headers: sodaHeaders() });
    if (!res.ok) return { found: false, active: false, expirationDate: null };

    const rows = (await res.json()) as LicenseRow[];
    if (!rows.length) return { found: false, active: false, expirationDate: null };

    // Use the first matching row (most recent, ordered by SODA default)
    const row = rows[0];
    const active = String(row.license_status ?? '').toUpperCase() === 'ACTIVE';
    const expiration = row.expiration_date ? new Date(row.expiration_date) : null;
    return { found: true, active, expirationDate: expiration };
  } catch {
    // Network error — treat as unknown rather than lapsed
    return { found: false, active: false, expirationDate: null };
  }
}

type ComplianceStatus = 'valid' | 'expiring_soon' | 'lapsed';

function deriveStatus(
  found: boolean,
  active: boolean,
  expiration: Date | null,
  now: Date,
): ComplianceStatus {
  if (!found || !active) return 'lapsed';
  if (!expiration) return 'valid'; // no expiry field = assume valid
  if (expiration < now) return 'lapsed';
  if (daysBetween(now, expiration) <= EXPIRING_DAYS) return 'expiring_soon';
  return 'valid';
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (_req: Request) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase    = createClient(supabaseUrl, serviceKey);

  const startedAt = new Date().toISOString();
  const now       = new Date();
  let processed   = 0;
  let changed     = 0;
  const errors: string[] = [];

  // ── 1. Fetch all contractors ──────────────────────────────────────────────
  const { data: contractors, error: cErr } = await supabase
    .from('users')
    .select('id')
    .eq('role', 'contractor');

  if (cErr || !contractors?.length) {
    return new Response(
      JSON.stringify({ ok: false, error: cErr?.message ?? 'No contractors found.' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }

  for (const contractor of contractors) {
    processed++;

    // ── 2. Fetch most recent compliance check ────────────────────────────
    const { data: latest } = await supabase
      .from('compliance_checks')
      .select('id, license_number, insurance_policy_number, expiration_date, status')
      .eq('contractor_id', contractor.id)
      .order('last_verified_at', { ascending: false })
      .limit(1)
      .single();

    const licenseNumber = latest?.license_number ?? null;

    let newStatus: ComplianceStatus = 'valid';

    if (!licenseNumber) {
      // No license on file — treat as lapsed
      newStatus = 'lapsed';
    } else {
      // ── 3. Verify against NYC Open Data ─────────────────────────────
      const { found, active, expirationDate } = await verifyLicense(licenseNumber);
      newStatus = deriveStatus(found, active, expirationDate, now);
    }

    // ── 4. Upsert compliance_checks row ──────────────────────────────────
    const { error: upsertErr } = await supabase
      .from('compliance_checks')
      .insert({
        contractor_id:            contractor.id,
        license_number:           licenseNumber,
        insurance_policy_number:  latest?.insurance_policy_number ?? null,
        expiration_date:          latest?.expiration_date ?? null,
        status:                   newStatus,
        last_verified_at:         now.toISOString(),
        source:                   'sentinel_cron',
      });

    if (upsertErr) {
      errors.push(`contractor ${contractor.id}: ${upsertErr.message}`);
    } else if (newStatus !== (latest?.status ?? 'valid')) {
      changed++;
    }
  }

  const summary = {
    ok: true,
    started_at: startedAt,
    contractors_processed: processed,
    status_changes: changed,
    errors,
  };

  console.log('[sentinel-verify]', JSON.stringify(summary));

  return new Response(JSON.stringify(summary), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
