import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/rbac/current-user';
import { AppSwitcher } from './AppSwitcher';
import { LogOut, User } from 'lucide-react';

async function getProfile() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  // See src/lib/rbac/current-user.ts — users.role does not exist and users.id
  // is not auth.uid(). `role` is kept as the local name so the JSX below is
  // unchanged.
  const current = await getCurrentProfile(user.id);
  const profile = current
    ? { role: current.platform_role, full_name: current.full_name, email: current.email }
    : null;

  return { user, profile };
}

async function handleSignOut() {
  'use server';
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}

interface AppShellProps {
  children: React.ReactNode;
}

export async function AppShell({ children }: AppShellProps) {
  const data = await getProfile();

  // If there's no session, render children as-is (auth pages handle their own layout).
  if (!data) {
    return <>{children}</>;
  }

  const { profile } = data;
  const displayName = profile?.full_name ?? profile?.email ?? 'User';
  const role = profile?.role ?? null;

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      {/* ── Top navigation bar ─────────────────────────────────────────── */}
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white">
        <div className="mx-auto flex h-14 max-w-screen-2xl items-center gap-3 px-4 sm:px-6">
          {/* Brand */}
          <Link
            href="/"
            className="flex-shrink-0 text-base font-bold tracking-tight text-indigo-700 hover:text-indigo-600"
          >
            Shtiya
          </Link>

          {/* App switcher */}
          <div className="flex-shrink-0">
            <AppSwitcher role={role} />
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Role badge */}
          {role && (
            <span className="hidden rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium capitalize text-indigo-700 sm:inline-block">
              {role.replace('_', ' ')}
            </span>
          )}

          {/* Profile + sign-out */}
          <div className="flex items-center gap-1">
            <div className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-gray-700">
              <User className="h-4 w-4 text-gray-400" aria-hidden="true" />
              <span className="hidden max-w-[120px] truncate sm:inline">{displayName}</span>
            </div>

            <form action={handleSignOut}>
              <button
                type="submit"
                title="Sign out"
                className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">Sign out</span>
              </button>
            </form>
          </div>
        </div>
      </header>

      {/* ── Main content area ───────────────────────────────────────────── */}
      <main className="flex-1">
        <div className="mx-auto max-w-screen-2xl px-4 py-6 sm:px-6">
          {children}
        </div>
      </main>
    </div>
  );
}
