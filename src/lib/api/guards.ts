import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { existenceProtectedNotFound } from './existence-protection';

/**
 * Shared route guards.
 *
 * Every guard here takes the caller's `users.id` EXPLICITLY and calls a
 * `*_for(p_user, …)` database predicate. That is not a style choice.
 *
 * These routes run on the service-role client, where auth.uid() is NULL and so
 * current_app_user_id() is NULL too. A session-scoped predicate — the bare
 * wall_blocks_user(matter) / is_facility_party(facility) forms — therefore
 * evaluates against nobody and returns false for every caller alive.
 * Measured against a live wall: wall_blocks_user() returned FALSE while
 * screened_from_matter_for(user, matter) returned TRUE for the same screened
 * user. A guard built on the session-scoped form is not a weak guard, it is an
 * absent one (I-L14 / LW-37).
 */

export interface AppUser {
  id: string;
  identity_subject_id: string | null;
}

/**
 * Extract the caller's authenticated Supabase auth user from the bearer token.
 * Returns null (not a 401) when missing or invalid — the caller decides the
 * response, because some routes must answer 404 rather than 401.
 *
 * Takes the client rather than building its own: one client per request keeps
 * the request's auth context, connection and mocking surface in one place.
 */
export async function getAuthenticatedUser(req: NextRequest, supabase: SupabaseClient) {
  const authHeader = req.headers.get('authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

/**
 * Resolve the platform `users` row for an authenticated auth user.
 *
 * Every downstream predicate keys on users.id, never on auth.uid(): they are
 * different identifiers and the FKs point at the former.
 */
export async function resolveAppUser(
  authUserId: string,
  supabase: SupabaseClient,
): Promise<AppUser | null> {
  const { data } = await supabase
    .from('users')
    .select('id, identity_subject_id')
    .eq('auth_user_id', authUserId)
    .maybeSingle();
  return (data as AppUser | null) ?? null;
}

/** Require an authenticated caller. Returns a 401 response, or null when authenticated. */
export async function requireAuth(req: NextRequest, supabase: SupabaseClient) {
  const user = await getAuthenticatedUser(req, supabase);
  if (!user) {
    return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  }
  return null;
}

/** Resolve the caller's org membership. Returns null when they hold no firm seat. */
export async function getCallerOrgId(
  userId: string,
  supabase: SupabaseClient,
): Promise<string | null> {
  const { data } = await supabase
    .from('firm_members')
    .select('firm_id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();
  return (data as { firm_id: string } | null)?.firm_id ?? null;
}

/**
 * Ethical wall check, existence-protected. -- I-L11, I-L12
 *
 * Uses screened_from_matter_for(p_user, p_matter), NOT wall_blocks_user(matter):
 * see the note at the top of this file. Fails CLOSED — an RPC error is treated
 * as walled, because a wall check that cannot answer must not answer "clear".
 */
export async function requireWallClear(
  userId: string,
  matterId: string,
  requestId: string,
  supabase: SupabaseClient,
) {
  const { data, error } = await supabase.rpc('screened_from_matter_for', {
    p_user:   userId,
    p_matter: matterId,
  });
  if (error || data === true) {
    return existenceProtectedNotFound(requestId);  // -- I-L11: walled reads as non-existent
  }
  return null;
}

/**
 * Matter party check. -- I-L11
 *
 * Existence-protected as well: "you are not a party to this matter" confirms
 * the matter exists, which is the same read the wall withholds.
 */
export async function requireMatterParty(
  userId: string,
  matterId: string,
  requestId: string,
  supabase: SupabaseClient,
) {
  const { data, error } = await supabase.rpc('is_matter_party_for', {
    p_user:   userId,
    p_matter: matterId,
  });
  if (error || !data) {
    return existenceProtectedNotFound(requestId);
  }
  return null;
}

/** Facility party check. Explicit-subject form, for the same reason as the wall. */
export async function requireFacilityParty(
  userId: string,
  facilityId: string,
  supabase: SupabaseClient,
) {
  const { data, error } = await supabase.rpc('is_facility_party_for', {
    p_user:        userId,
    p_facility_id: facilityId,
  });
  if (error || !data) {
    return NextResponse.json({ error: 'NOT_A_FACILITY_PARTY' }, { status: 403 });
  }
  return null;
}
