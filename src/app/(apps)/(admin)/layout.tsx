import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

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

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin') {
    redirect('/unauthorized');
  }

  return <>{children}</>;
}
