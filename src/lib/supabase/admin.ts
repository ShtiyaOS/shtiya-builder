import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';

/**
 * Service-role Supabase client — bypasses Row-Level Security entirely.
 *
 * Use ONLY for server-side operations that must deliberately run outside a
 * specific caller's RLS context — e.g. the public lead funnel's semantic
 * property-match lookup (POST /api/leads), which has no authenticated user
 * to scope RLS to (auth.uid() is NULL for that request), so a normal
 * anon-key/session client can never see any `properties` rows there,
 * regardless of embedding similarity.
 *
 * Never import this from a 'use client' component and never send
 * SUPABASE_SERVICE_ROLE_KEY to the browser — it must stay a server-only env
 * var (no NEXT_PUBLIC_ prefix).
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      'createAdminClient() requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to be set.',
    );
  }

  return createClient<Database>(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
