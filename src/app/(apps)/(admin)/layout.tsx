import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/rbac/current-user';
import { getAllowedApps } from '@/lib/rbac/roles';

/** Decided by the same map the middleware and left nav use. */
const APP_SEGMENT = 'office';

/**
 * Zero-Trust route-group guard for every `(admin)` page (e.g. `/office`).
 *
 * This is a second, server-rendered enforcement layer on top of the edge
 * `src/middleware.ts` RBAC check — it independently re-fetches `users.role`
 * so an admin-only page can never render for a non-admin session even if
 * the middleware matcher were disabled or bypassed.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const profile = await getCurrentProfile(user.id);

  if (!getAllowedApps(profile?.platform_role).includes(APP_SEGMENT)) {
    redirect('/unauthorized');
  }

  return <>{children}</>;
}
