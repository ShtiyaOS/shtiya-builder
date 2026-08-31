import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getAllowedApps } from '@/lib/rbac/roles';
import { getCurrentProfile } from '@/lib/rbac/current-user';

/**
 * Root page — session-aware router.
 *
 * Authenticated users are sent to the first app their role allows.
 * Unauthenticated users are sent to /login.
 * Never renders any HTML — pure server-side redirect.
 */
export default async function RootPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // See src/lib/rbac/current-user.ts. The old query read users.role — a column
  // that does not exist — keyed on users.id, which is not auth.uid().
  const profile = await getCurrentProfile(user.id);
  const allowedApps = getAllowedApps(profile?.platform_role);

  // getAllowedApps returns BARE SEGMENTS ('owner'), so the leading slash is
  // added here. The previous fallback put a already-rooted '/login' through the
  // same interpolation and produced '//login' — which a browser reads as the
  // protocol-relative URL http://login/, not a path on this host, and which
  // therefore 404s instead of reaching the login page.
  const segment = allowedApps[0];

  redirect(segment ? '/' + segment : '/unauthorized');
}
