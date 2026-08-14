import { createClient as createSupabaseJsClient, type SupabaseClient } from '@supabase/supabase-js';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set. tests/e2e requires NEXT_PUBLIC_SUPABASE_URL, ` +
        `NEXT_PUBLIC_SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY — see .env.example. ` +
        `Run \`supabase start\` locally and copy \`supabase status -o env\` into .env.local.`,
    );
  }
  return value;
}

const SUPABASE_URL = () => requireEnv('NEXT_PUBLIC_SUPABASE_URL');
const ANON_KEY = () => requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
const SERVICE_ROLE_KEY = () => requireEnv('SUPABASE_SERVICE_ROLE_KEY');

const NO_PERSIST = { auth: { persistSession: false, autoRefreshToken: false } } as const;

/** Bypasses RLS entirely — used only for test fixture setup/teardown. */
export function createServiceRoleClient(): SupabaseClient {
  return createSupabaseJsClient(SUPABASE_URL(), SERVICE_ROLE_KEY(), NO_PERSIST);
}

/** A plain anon-key client with no session — used for "anonymous caller" RLS assertions. */
export function createAnonClient(): SupabaseClient {
  return createSupabaseJsClient(SUPABASE_URL(), ANON_KEY(), NO_PERSIST);
}

export interface TestUser {
  id: string;
  email: string;
  role: string;
}

export interface SignedInUser {
  user: TestUser;
  client: SupabaseClient;
}

/**
 * Admin-creates an auth user (email pre-confirmed) and inserts the matching
 * public.users row with the requested role.
 *
 * No DB trigger inserts into public.users on signup in this codebase today
 * (confirmed: no `handle_new_user`-style trigger exists in any migration,
 * and the register page never inserts one client-side either) — so this is
 * done explicitly here rather than relied upon.
 *
 * Returns a real, session-bearing anon-key client so `supabase.auth.getUser()`
 * (called with no args by every route handler) resolves correctly and RLS
 * sees the right `auth.uid()`.
 */
export async function createSignedInUser(
  service: SupabaseClient,
  params: { email: string; password: string; role: string; fullName: string },
): Promise<SignedInUser> {
  const { email, password, role, fullName } = params;

  const { data: created, error: createErr } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createErr || !created.user) {
    throw new Error(`auth.admin.createUser(${email}) failed: ${createErr?.message}`);
  }

  const { error: profileErr } = await service
    .from('users')
    .insert({ id: created.user.id, email, role, full_name: fullName });
  if (profileErr) {
    throw new Error(`users insert failed for ${email}: ${profileErr.message}`);
  }

  const client = createSupabaseJsClient(SUPABASE_URL(), ANON_KEY(), NO_PERSIST);
  const { error: signInErr } = await client.auth.signInWithPassword({ email, password });
  if (signInErr) {
    throw new Error(`signInWithPassword(${email}) failed: ${signInErr.message}`);
  }

  return { user: { id: created.user.id, email, role }, client };
}

export async function deleteAuthUser(service: SupabaseClient, userId: string): Promise<void> {
  await service.auth.admin.deleteUser(userId);
}
