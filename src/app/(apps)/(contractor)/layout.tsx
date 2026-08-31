import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/rbac/current-user';
import { getAllowedApps } from '@/lib/rbac/roles';

/** Decided by the same map the middleware and left nav use. */
const APP_SEGMENT = 'contractor';

/**
 * Zero-Trust route-group guard for every `(contractor)` page (e.g.
 * `/contractor`, `/contractor/scope/new`, `/contractor/vision`).
 *
 * Second, server-rendered enforcement layer on top of the edge
 * `src/middleware.ts` RBAC check — independently re-fetches `users.role`
 * so these pages can never render for a disallowed session even if the
 * middleware matcher were disabled or bypassed.
 */
export default async function ContractorLayout({ children }: { children: React.ReactNode }) {
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
