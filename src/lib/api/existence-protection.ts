import { NextResponse } from 'next/server';

/**
 * I-L11: a walled or denied matter must be indistinguishable from one that was
 * never created. Same status, same body length, same header set.
 *
 * The padding is what makes that true. A bare {"error":"NOT_FOUND"} and a bare
 * {"error":"NOT_A_MATTER_PARTY"} differ in Content-Length, and a length
 * difference is a read: it tells the caller the matter exists and they are
 * screened off it, which is the fact the wall is there to withhold.
 *
 * Trailing whitespace is legal JSON, so the padded body still parses.
 */
const PADDED_BODY_BYTES = 512;

export function existenceProtectedNotFound(requestId: string): NextResponse {
  const body = JSON.stringify({ error: 'NOT_FOUND' });
  const pad  = ' '.repeat(Math.max(0, PADDED_BODY_BYTES - body.length));  // -- I-L11

  return new NextResponse(body + pad, {
    status: 404,
    headers: {
      'Content-Type': 'application/json',
      'X-Request-Id': requestId,
    },
  });
}
