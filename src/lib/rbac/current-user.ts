import { createAdminClient } from '@/lib/supabase/admin';

export interface CurrentProfile {
  /** users.id — the SURROGATE key. Every *_for(p_user, …) primitive wants this. */
  id:            string;
  auth_user_id:  string;
  email:         string | null;
  full_name:     string | null;
  platform_role: string | null;
}

/**
 * Resolves the authenticated principal to their public.users row.
 *
 * THIS EXISTS BECAUSE THE SAME BUG WAS WRITTEN FOUR TIMES.
 *
 * The middleware, the apps layout, AppShell, and the copilot route each ran
 * their own version of `select('role').eq('id', user.id)`, and every one of
 * them was wrong in the same two ways:
 *
 *   - `users.role` DOES NOT EXIST. The column is `platform_role`. The old
 *     query errored, the role came back null, and the UI rendered "No apps
 *     available for your role" while the middleware sent the user to
 *     /unauthorized.
 *   - `users.id` IS NOT auth.uid(). It is a surrogate key; `auth_user_id`
 *     carries the link. Matching on id found nothing even after the column
 *     name was fixed.
 *
 * Reads on the SERVICE client, deliberately: the RLS policies on users are
 * written against the row's own id, so a session client cannot read the row
 * that tells it who it is. That is safe here and only here because the filter
 * is an auth.uid() the caller has already verified with getUser() — exactly one
 * row can match, the caller's own. Authorization decisions are made by the
 * callers from the returned role; this function makes none.
 *
 * @param authUserId A uid from supabase.auth.getUser(). NEVER a value taken
 *                   from a request body — getUser() validates the JWT against
 *                   the Auth server, getSession() does not.
 */
export async function getCurrentProfile(
  authUserId: string,
): Promise<CurrentProfile | null> {
  try {
    const { data, error } = await createAdminClient()
      .from('users')
      .select('id, auth_user_id, email, full_name, platform_role')
      .eq('auth_user_id', authUserId)
      .maybeSingle();

    if (error) {
      console.error('[rbac] profile lookup failed', { error: error.message });
      return null;
    }

    return (data as CurrentProfile | null) ?? null;
  } catch (err) {
    // A profile that cannot be read is a user with no role, which every caller
    // already treats as "no apps". It is never a reason to crash a layout.
    console.error('[rbac] profile lookup threw', { err });
    return null;
  }
}
