import Link from 'next/link';
import type { User } from '@supabase/supabase-js';
import {
  Map,
  FileSearch,
  Scale,
  Landmark,
  Ruler,
  HardHat,
  Building2,
  ShieldCheck,
  Briefcase,
  Megaphone,
} from 'lucide-react';
import { getAllowedApps } from '@/lib/rbac/roles';
import { SignOutButton } from './SignOutButton';

/** Functional (not brand) label + icon for each app segment, keyed to ROLE_APP_MAP. */
const NAV_META: Record<string, { label: string; icon: typeof Map }> = {
  owner:       { label: 'Block Assembly',  icon: Map },
  acquisition: { label: 'Acquisition',     icon: FileSearch },
  legal:       { label: 'Legal',           icon: Scale },
  capital:     { label: 'Capital',         icon: Landmark },
  design:      { label: 'Design',          icon: Ruler },
  contractor:  { label: 'Contractor',      icon: HardHat },
  property:    { label: 'Property',        icon: Building2 },
  escrow:      { label: 'Escrow',          icon: ShieldCheck },
  office:      { label: 'Command Center',  icon: Briefcase },
  marketing:   { label: 'Marketing',       icon: Megaphone },
};

interface LeftSidebarProps {
  currentPath: string;
  user: User | null;
  role: string | null;
}

/**
 * LeftSidebar — the terminal shell's Left Pane.
 *
 * Pure React Server Component: no `usePathname`, no `'use client'`. Active
 * link state is derived entirely from the `currentPath` prop the layout
 * passes down (sourced from the `x-next-pathname` header), and role is
 * passed down too rather than re-fetched here. The only client boundary is
 * the `SignOutButton` sub-component at the bottom.
 */
export function LeftSidebar({ currentPath, user, role }: LeftSidebarProps) {
  const allowedApps = getAllowedApps(role);

  return (
    <div className="flex h-full flex-col bg-slate-900 text-slate-50">
      {/* ── Wordmark ─────────────────────────────────────────────────── */}
      <div className="flex h-14 flex-shrink-0 items-center border-b border-slate-800 px-4">
        <span className="text-sm font-bold tracking-wide text-white">Shtiya Builder</span>
      </div>

      {/* ── Nav ──────────────────────────────────────────────────────── */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-3">
        {allowedApps.map((app) => {
          const meta = NAV_META[app] ?? { label: app, icon: Briefcase };
          const Icon = meta.icon;
          const href = `/${app}`;
          const isActive = currentPath.startsWith(href);

          return (
            <Link
              key={app}
              href={href}
              prefetch={true}
              className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${
                isActive
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Icon className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
              <span className="truncate">{meta.label}</span>
            </Link>
          );
        })}

        {allowedApps.length === 0 && (
          <p className="px-3 py-2 text-xs text-slate-500">No apps available for your role.</p>
        )}
      </nav>

      {/* ── User + sign-out ─────────────────────────────────────────────── */}
      <div className="flex-shrink-0 border-t border-slate-800 p-2">
        {user && (
          <p className="truncate px-3 pb-1 text-xs text-slate-500">{user.email}</p>
        )}
        <SignOutButton />
      </div>
    </div>
  );
}
