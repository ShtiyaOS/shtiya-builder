/**
 * src/lib/nyc-open-data/client.ts
 *
 * NYC Open Data SODA API client for pulling municipal tax-debt and violation
 * records against a given property (identified by its BBL — Borough-Block-Lot).
 *
 * Datasets used:
 *   Tax liens / property tax arrears:
 *     https://data.cityofnewyork.us/resource/3qem-6v3v.json  (DOF Tax Lien Sale list)
 *
 *   NYC property tax debt detail (rolling):
 *     https://data.cityofnewyork.us/resource/9rrd-3h26.json  (Quarterly tax data)
 *
 * Env vars:
 *   NYC_OPEN_DATA_APP_TOKEN — optional SODA app token for higher rate limits.
 *                             Requests still work without one (throttled at 1 000/hr).
 *
 * All fetch calls set a 10-second timeout so a slow SODA endpoint never hangs
 * the calling API route.
 */

// ── SODA API base ─────────────────────────────────────────────────────────────

const SODA_BASE = 'https://data.cityofnewyork.us/resource';
const APP_TOKEN = process.env.NYC_OPEN_DATA_APP_TOKEN ?? '';
const TIMEOUT_MS = 10_000;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TaxDebtRecord {
  /** Borough-Block-Lot as stored in NYC Open Data (may use different separators). */
  bbl: string;
  /** Human-readable address as returned by the dataset. */
  address: string;
  /** Outstanding tax debt or lien amount in USD. */
  amount: number;
  /** Tax year or period the debt relates to. */
  tax_year: string | null;
  /** Type of debt: 'tax_lien' | 'arrear' */
  debt_type: 'tax_lien' | 'arrear';
  /** Raw row from the Open Data API, preserved for future enrichment. */
  raw: Record<string, unknown>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build common SODA request headers including the optional app token. */
function sodaHeaders(): HeadersInit {
  const h: HeadersInit = { Accept: 'application/json' };
  if (APP_TOKEN) h['X-App-Token'] = APP_TOKEN;
  return h;
}

/** Normalise a BBL string to the bare 10-digit form (no dashes/slashes). */
function normaliseBbl(bbl: string): string {
  return bbl.replace(/[^0-9]/g, '');
}

/**
 * Safely parse a numeric string from SODA; returns 0 on failure so callers
 * always get a number and can filter out zero-amount rows if desired.
 */
function parseAmount(value: unknown): number {
  const n = parseFloat(String(value ?? '0'));
  return isNaN(n) ? 0 : n;
}

/** fetch() with an AbortController-based timeout. */
async function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * fetchTaxDebts
 *
 * Queries two NYC Open Data datasets for outstanding tax liens and arrears
 * against the given BBL. Returns an array of TaxDebtRecord objects (may be
 * empty if no debts are found). Throws on HTTP or network errors.
 *
 * @param bbl  NYC Borough-Block-Lot identifier (any separator format is accepted).
 */
export async function fetchTaxDebts(bbl: string): Promise<TaxDebtRecord[]> {
  const normalised = normaliseBbl(bbl);
  if (!normalised || normalised.length < 7) {
    throw new Error(`Invalid BBL: "${bbl}" — must be a 10-digit NYC Borough-Block-Lot.`);
  }

  const results: TaxDebtRecord[] = [];

  // ── 1. Tax Lien Sale list (3qem-6v3v) ──────────────────────────────────────
  // The dataset column is `bbl` as a plain string.
  const lienUrl =
    `${SODA_BASE}/3qem-6v3v.json` +
    `?bbl=${encodeURIComponent(normalised)}&$limit=50`;

  const lienRes = await fetchWithTimeout(lienUrl, { headers: sodaHeaders() });
  if (!lienRes.ok) {
    throw new Error(
      `[nyc-open-data] Tax lien dataset fetch failed: HTTP ${lienRes.status} ${lienRes.statusText}`,
    );
  }
  const lienRows = (await lienRes.json()) as Record<string, unknown>[];

  for (const row of lienRows) {
    results.push({
      bbl: normalised,
      address: String(row.address ?? row.situs_address ?? ''),
      amount: parseAmount(row.total_open_liens ?? row.amount ?? row.lien_amount),
      tax_year: row.tax_year ? String(row.tax_year) : null,
      debt_type: 'tax_lien',
      raw: row,
    });
  }

  // ── 2. Quarterly property tax data (9rrd-3h26) ─────────────────────────────
  // The dataset uses `parid` which is the 10-digit BBL.
  const taxUrl =
    `${SODA_BASE}/9rrd-3h26.json` +
    `?parid=${encodeURIComponent(normalised)}&$limit=50`;

  const taxRes = await fetchWithTimeout(taxUrl, { headers: sodaHeaders() });
  if (!taxRes.ok) {
    // Non-fatal: log and continue — lien data is still useful on its own.
    console.warn(
      `[nyc-open-data] Quarterly tax dataset fetch failed: HTTP ${taxRes.status} — skipping.`,
    );
  } else {
    const taxRows = (await taxRes.json()) as Record<string, unknown>[];
    for (const row of taxRows) {
      const amount = parseAmount(row.total_charges ?? row.billed_amount);
      if (amount <= 0) continue; // skip rows with no outstanding charge
      results.push({
        bbl: normalised,
        address: String(row.address ?? ''),
        amount,
        tax_year: row.fiscal_year ? String(row.fiscal_year) : null,
        debt_type: 'arrear',
        raw: row,
      });
    }
  }

  return results;
}
