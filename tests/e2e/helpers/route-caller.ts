import { vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';
// This import resolves to the vi.mock('@/lib/supabase/server', ...) stub
// registered in vitest.setup.ts, NOT the real implementation — so route
// handlers never touch next/headers' cookies() (which requires a live
// Next.js request scope we don't have when importing handlers directly).
import { createClient as mockedCreateClient } from '@/lib/supabase/server';

/**
 * Makes every subsequent `createClient()` call inside an imported route
 * handler resolve to `client` — i.e. "act as this signed-in user" (or the
 * service-role client, or an anon/unauthenticated client) for the next
 * handler invocation(s).
 *
 * Route handlers all call `const supabase = await createClient()` once per
 * request, so re-calling `actAs()` immediately before each `await handler(...)`
 * is sufficient even though the mock is shared/module-level.
 */
export function actAs(client: SupabaseClient): void {
  vi.mocked(mockedCreateClient).mockResolvedValue(client as never);
}

/**
 * Builds a JSON NextRequest for POST/PATCH route handlers.
 * NextRequest has no server-context dependency — it's just a Fetch API
 * Request subclass — so it's safe to construct directly in a Node process.
 */
export function jsonRequest(url: string, method: 'POST' | 'PATCH', body: unknown): NextRequest {
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/**
 * Builds a multipart/form-data NextRequest (used by /api/milestone-upload).
 * Content-Type (with boundary) is set automatically by the Request
 * constructor when body is a FormData instance — do not set it manually.
 */
export function formRequest(url: string, form: FormData): NextRequest {
  return new NextRequest(`http://localhost${url}`, { method: 'POST', body: form });
}
