/**
 * src/lib/tracerfy/client.ts
 *
 * Thin wrapper around the Tracerfy / DataSkip REST API for owner skip-tracing.
 *
 * Features:
 *  - Exponential backoff retry (up to MAX_RETRIES attempts) on HTTP 429
 *    (rate-limit) responses, with jitter to spread concurrent request bursts.
 *  - Immediate throw on all other non-2xx responses so callers can distinguish
 *    rate-limit retries from hard errors (bad auth, 404, etc.).
 *  - Fully typed return value so callers never have to guess the shape.
 *
 * Env vars required:
 *   TRACERFY_API_KEY   — bearer token issued by Tracerfy / DataSkip
 *   TRACERFY_BASE_URL  — optional override (default: https://api.dataskip.com/v1)
 */

// ── Configuration ─────────────────────────────────────────────────────────────

const BASE_URL =
  process.env.TRACERFY_BASE_URL ?? 'https://api.dataskip.com/v1';

const MAX_RETRIES = 3;
// Base wait in ms before the first retry; doubles each attempt.
const BASE_BACKOFF_MS = 1_000;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SkipTraceContact {
  phones: string[];
  emails: string[];
  /** Raw API response body, preserved for debugging / future enrichment. */
  raw: Record<string, unknown>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Promisified sleep. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculates the next backoff duration with ±25 % jitter to avoid
 * thundering-herd when multiple requests hit the rate limit together.
 */
function backoffMs(attempt: number): number {
  const base = BASE_BACKOFF_MS * Math.pow(2, attempt);
  const jitter = base * 0.25 * (Math.random() * 2 - 1); // ±25%
  return Math.round(base + jitter);
}

/**
 * Safely extracts an array of strings from an unknown API response value.
 * Handles: string[], string (single), undefined/null.
 */
function toStringArray(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string');
  if (typeof value === 'string') return [value];
  return [];
}

// ── Core function ─────────────────────────────────────────────────────────────

/**
 * skipTraceOwner
 *
 * Looks up contact information (phones, emails) for a property owner by name
 * and address. Retries up to MAX_RETRIES times on HTTP 429 with exponential
 * backoff + jitter.
 *
 * @param name     Full name of the property owner or executor.
 * @param address  Property or mailing address to assist with identity resolution.
 * @returns        SkipTraceContact with phones, emails, and the raw API body.
 * @throws         Error with an HTTP-status prefix on non-429 failure responses.
 */
export async function skipTraceOwner(
  name: string,
  address: string,
): Promise<SkipTraceContact> {
  const apiKey = process.env.TRACERFY_API_KEY;
  if (!apiKey) {
    throw new Error('TRACERFY_API_KEY is not configured.');
  }

  const url = `${BASE_URL}/search`;
  const payload = JSON.stringify({ name, address });

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    // Wait before retries (not before the first attempt).
    if (attempt > 0) {
      const wait = backoffMs(attempt - 1);
      console.warn(
        `[tracerfy] Rate-limited. Retry ${attempt}/${MAX_RETRIES} in ${wait} ms ` +
          `(name="${name}", address="${address}")`,
      );
      await sleep(wait);
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: payload,
      });
    } catch (networkErr) {
      // Network failure (DNS, timeout, etc.) — not a rate-limit, throw immediately.
      throw new Error(`[tracerfy] Network error: ${String(networkErr)}`);
    }

    // ── Rate-limit: back off and retry ────────────────────────────────────
    if (response.status === 429) {
      // Honour the Retry-After header if present (overrides our backoff).
      const retryAfter = response.headers.get('Retry-After');
      if (retryAfter && attempt < MAX_RETRIES) {
        const waitSeconds = parseFloat(retryAfter);
        if (!isNaN(waitSeconds)) {
          await sleep(waitSeconds * 1_000);
          continue;
        }
      }
      lastError = new Error(`[tracerfy] HTTP 429 rate-limited after ${attempt + 1} attempt(s).`);
      continue; // will hit the backoff sleep at the top of the next iteration
    }

    // ── Hard error: throw immediately, no retry ───────────────────────────
    if (!response.ok) {
      let detail = '';
      try {
        const text = await response.text();
        detail = text.slice(0, 300);
      } catch {
        /* ignore */
      }
      throw new Error(
        `[tracerfy] HTTP ${response.status} ${response.statusText}${detail ? ': ' + detail : ''}`,
      );
    }

    // ── Success ───────────────────────────────────────────────────────────
    let body: Record<string, unknown>;
    try {
      body = (await response.json()) as Record<string, unknown>;
    } catch {
      throw new Error('[tracerfy] Response was not valid JSON.');
    }

    // Normalise phones and emails from whatever shape the API returns.
    // DataSkip typically returns { results: [{ phones: [...], emails: [...] }] }
    const firstResult =
      Array.isArray(body.results) && body.results.length > 0
        ? (body.results[0] as Record<string, unknown>)
        : body;

    return {
      phones: toStringArray(firstResult.phones ?? firstResult.phone_numbers),
      emails: toStringArray(firstResult.emails ?? firstResult.email_addresses),
      raw: body,
    };
  }

  // Exhausted all retries.
  throw lastError ?? new Error('[tracerfy] Skip-trace failed after maximum retries.');
}
