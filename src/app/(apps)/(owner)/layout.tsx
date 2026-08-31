import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/rbac/current-user';
import { getAllowedApps } from '@/lib/rbac/roles';

/**
 * The app segment this route group owns. Membership is decided by the SAME map
 * the middleware and the left nav use, rather than by a private role list.
 *
 * The old private list held v1 role names ('owner', 'investor', 'admin') and
 * was checked against a `users.role` column that no longer exists, so it
 * refused every user — including the ones the nav was linking here.
 */
const APP_SEGMENT = 'owner';

/**
 * Zero-Trust route-group guard for every `(owner)` page (e.g. `/owner`,
 * `/owner/block/:id`, `/owner/deal-room`).
 *
 * Second, server-rendered enforcement layer on top of the edge
 * `src/middleware.ts` RBAC check — independently re-fetches `users.role`
 * so these pages can never render for a disallowed session even if the
 * middleware matcher were disabled or bypassed.
 */
export default async function OwnerLayout({ children }: { children: React.ReactNode }) {
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
