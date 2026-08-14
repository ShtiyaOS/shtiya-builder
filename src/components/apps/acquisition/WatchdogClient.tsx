'use client';

import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, Filter } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────
export interface Violation {
  id: string;
  property_id: string;
  source: 'DOB' | 'HPD' | 'ECB' | '311';
  external_id: string;
  description: string | null;
  issued_date: string | null;
  status: string;
  address?: string;
}

interface WatchdogClientProps {
  violations: Violation[];
}

// ── Source badge colours ──────────────────────────────────────────────────────
const SOURCE_STYLE: Record<string, string> = {
  DOB: 'bg-red-100 text-red-800',
  HPD: 'bg-orange-100 text-orange-800',
  ECB: 'bg-yellow-100 text-yellow-800',
  '311': 'bg-blue-100 text-blue-800',
};

const ALL_SOURCES = ['DOB', 'HPD', 'ECB', '311'] as const;

// ── Status icon ───────────────────────────────────────────────────────────────
function StatusIcon({ status }: { status: string }) {
  if (status === 'closed' || status === 'resolved') {
    return <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-green-500" />;
  }
  if (status === 'open') {
    return <AlertTriangle className="h-4 w-4 flex-shrink-0 text-red-500" />;
  }
  return <Clock className="h-4 w-4 flex-shrink-0 text-yellow-500" />;
}

// ── Client component ──────────────────────────────────────────────────────────
export function WatchdogClient({ violations }: WatchdogClientProps) {
  const [activeSource, setActiveSource] = useState<string>('ALL');

  const filtered =
    activeSource === 'ALL'
      ? violations
      : violations.filter((v) => v.source === activeSource);

  const countBySource = (src: string) =>
    violations.filter((v) => v.source === src).length;

  return (
    <div className="space-y-4">
      {/* ── Filter bar ────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <Filter className="h-4 w-4 text-gray-400" aria-hidden="true" />
        <button
          onClick={() => setActiveSource('ALL')}
          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
            activeSource === 'ALL'
              ? 'bg-indigo-600 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          All ({violations.length})
        </button>
        {ALL_SOURCES.map((src) => (
          <button
            key={src}
            onClick={() => setActiveSource(src)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              activeSource === src
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {src} ({countBySource(src)})
          </button>
        ))}
      </div>

      {/* ── Violations list ───────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 py-14 text-center">
          <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-green-400" />
          <p className="text-sm font-medium text-gray-600">
            No {activeSource === 'ALL' ? '' : activeSource + ' '}violations found.
          </p>
          <p className="mt-1 text-xs text-gray-400">
            {activeSource === 'ALL'
              ? 'The Watchdog poller will surface new violations here as they appear.'
              : `Switch to "All" to see violations from other sources.`}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <ul className="divide-y divide-gray-100">
            {filtered.map((v) => (
              <li key={v.id} className="flex items-start gap-3 px-5 py-4">
                <StatusIcon status={v.status} />
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                        SOURCE_STYLE[v.source] ?? 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {v.source}
                    </span>
                    <span className="font-mono text-xs text-gray-400">#{v.external_id}</span>
                    {v.issued_date && (
                      <span className="text-xs text-gray-400">
                        {new Date(v.issued_date).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-gray-800 leading-snug">
                    {v.description ?? 'No description available.'}
                  </p>
                  {v.address && (
                    <p className="mt-0.5 text-xs text-gray-500">{v.address}</p>
                  )}
                </div>
                <span
                  className={`mt-0.5 flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                    v.status === 'open'
                      ? 'bg-red-50 text-red-700'
                      : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {v.status}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
