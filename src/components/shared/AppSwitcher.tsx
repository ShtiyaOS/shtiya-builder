'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutGrid, X } from 'lucide-react';
import { getAllowedApps } from '@/lib/rbac/roles';

/** Human-readable label and icon letter for each app segment. */
const APP_META: Record<string, { label: string; initial: string }> = {
  owner:       { label: 'Shtiya Owner',       initial: 'OW' },
  acquisition: { label: 'Shtiya Acquisition', initial: 'AQ' },
  legal:       { label: 'Shtiya Legal',       initial: 'LG' },
  capital:     { label: 'Shtiya Capital',     initial: 'CP' },
  design:      { label: 'Shtiya Design',      initial: 'DS' },
  contractor:  { label: 'Shtiya Contractor',  initial: 'CN' },
  property:    { label: 'Shtiya Property',    initial: 'PR' },
  escrow:      { label: 'Shtiya Escrow',      initial: 'ES' },
  office:      { label: 'Shtiya Office',      initial: 'OF' },
  marketing:   { label: 'Shtiya Marketing',   initial: 'MK' },
};

interface AppSwitcherProps {
  role: string | null;
}

export function AppSwitcher({ role }: AppSwitcherProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  const allowedApps = getAllowedApps(role);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="App switcher"
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
      >
        <LayoutGrid className="h-4 w-4" />
        <span className="hidden sm:inline">Apps</span>
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-20"
            aria-hidden="true"
            onClick={() => setOpen(false)}
          />

          {/* Dropdown panel */}
          <div className="absolute left-0 z-30 mt-2 w-72 rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Your Apps
              </span>
              <button
                onClick={() => setOpen(false)}
                className="rounded p-0.5 text-gray-400 hover:text-gray-600"
                aria-label="Close app switcher"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              {allowedApps.map((app) => {
                const meta = APP_META[app] ?? { label: app, initial: app.slice(0, 2).toUpperCase() };
                const href = `/${app}`;
                const isActive = pathname.startsWith(href);

                return (
                  <Link
                    key={app}
                    href={href}
                    onClick={() => setOpen(false)}
                    className={`flex items-center gap-2 rounded-md px-2.5 py-2 text-sm transition-colors ${
                      isActive
                        ? 'bg-indigo-50 text-indigo-700 font-medium'
                        : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <span
                      className={`flex h-6 w-8 flex-shrink-0 items-center justify-center rounded text-[10px] font-bold ${
                        isActive ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-600'
                      }`}
                    >
                      {meta.initial}
                    </span>
                    <span className="truncate">{meta.label}</span>
                  </Link>
                );
              })}
            </div>

            {allowedApps.length === 0 && (
              <p className="py-3 text-center text-xs text-gray-500">
                No apps available for your role.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
