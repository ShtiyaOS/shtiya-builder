import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getAllowedApps } from '@/lib/rbac/roles';

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

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  const allowedApps = getAllowedApps(profile?.role);
  const destination = allowedApps[0] ?? '/login';

  redirect(`/${destination}`);
}
