import { expect } from 'vitest';

/**
 * Asserts res.status === expected. On mismatch, reads and includes the
 * actual response body in the failure message — a bare `expect(res.status)
 * .toBe(x)` only shows the two numbers, which is nearly useless for
 * debugging a 500 (the whole point of the error body). Returns the parsed
 * JSON body so callers can chain further assertions on it.
 */
// Response body shape varies per route; callers destructure whatever fields they need.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function expectStatus(res: Response, expected: number): Promise<any> {
  if (res.status !== expected) {
    let body: unknown;
    try {
      body = await res.clone().json();
    } catch {
      body = await res
        .clone()
        .text()
        .catch(() => '<unreadable body>');
    }
    throw new Error(
      `Expected HTTP ${expected}, got ${res.status}.\nResponse body: ${JSON.stringify(body, null, 2)}`,
    );
  }
  return res.json();
}

/**
 * Asserts a Supabase `{ data, error }` result has no error and, if
 * expectEmpty is true, that data is an empty array. A bare
 * `expect(data).toEqual([])` on an errored query sees `data === null` and
 * reports a useless "null !== []" — this surfaces the actual Postgres/
 * PostgREST error instead.
 */
export function expectRlsResult(
  result: { data: unknown; error: { message: string; code?: string } | null },
  expectEmpty: boolean,
): void {
  if (result.error) {
    throw new Error(`Query failed: ${JSON.stringify(result.error, null, 2)}`);
  }
  if (expectEmpty) {
    expect(result.data).toEqual([]);
  }
}
