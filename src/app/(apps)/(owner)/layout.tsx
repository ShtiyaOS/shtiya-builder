import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

const ALLOWED_ROLES = new Set(['owner', 'investor', 'admin']);

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

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile?.role || !ALLOWED_ROLES.has(profile.role)) {
    redirect('/unauthorized');
  }

  return <>{children}</>;
}
