import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/rbac/current-user';
import { LeftSidebar } from '@/components/layout/LeftSidebar';
import { RightSidebar } from '@/components/layout/RightSidebar';

/**
 * Root layout for every `(apps)` route — the "Bloomberg Terminal" three-pane
 * shell. Mounted once for the whole `(apps)` route group and never remounts
 * across navigation: Left Pane (role-scoped directory), Center Pane (the
 * dynamic arena — `children`), and Right Pane (Agentic Co-Pilot) all live
 * here. See terminal-layout-plan.md T7.7.
 *
 * `currentPath` comes from the `x-next-pathname` header injected by
 * `src/middleware.ts`, so `LeftSidebar` can compute active-link state
 * without `usePathname` and stay a pure Server Component.
 *
 * This replaces the previous top-nav wrapper layout; the nested `(admin)`,
 * `(owner)`, `(contractor)` route-group layouts already return
 * `<>{children}</>` and own no chrome, so they need no change here.
 */
export default async function AppsLayout({ children }: { children: React.ReactNode }) {
  const headersList = await headers();
  const currentPath = headersList.get('x-next-pathname') ?? '';

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let role: string | null = null;
  if (user) {
    const profile = await getCurrentProfile(user.id);
    role = profile?.platform_role ?? null;
  }

  // No session — render children as-is (auth pages own their own layout).
  if (!user) {
    return <>{children}</>;
  }

  return (
    <div className="grid h-screen w-full grid-cols-[250px_1fr_350px] overflow-hidden bg-slate-950 text-slate-50">
      <aside className="min-h-0 overflow-hidden border-r border-slate-800">
        <LeftSidebar currentPath={currentPath} user={user} role={role} />
      </aside>

      <main className="flex min-h-0 min-w-0 flex-col overflow-y-auto bg-slate-950">
        {children}
      </main>

      <aside className="min-h-0 overflow-hidden border-l border-slate-800">
        <RightSidebar />
      </aside>
    </div>
  );
}
