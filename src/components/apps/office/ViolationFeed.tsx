import { ExternalLink, Siren } from 'lucide-react';
import type { ViolationRow } from './types';

/**
 * Deep-link targets for each `violation_source` — NYC Open Data dataset
 * landing pages (not a per-record deep link: the SODA column names differ
 * per dataset and aren't worth guessing wrong). `/d/<id>` always resolves
 * to the dataset's human-facing page regardless of its current URL slug.
 */
const SOURCE_LINK: Record<string, string> = {
  DOB: 'https://data.cityofnewyork.us/d/3h2n-5cm9',
  HPD: 'https://data.cityofnewyork.us/d/wvxf-dwi5',
  ECB: 'https://data.cityofnewyork.us/d/6bgk-3dad',
  '311': 'https://data.cityofnewyork.us/d/erm2-nwe9',
};

const SOURCE_BADGE: Record<string, string> = {
  DOB: 'bg-blue-100 text-blue-800',
  HPD: 'bg-purple-100 text-purple-800',
  ECB: 'bg-orange-100 text-orange-800',
  '311': 'bg-teal-100 text-teal-800',
};

interface ViolationFeedProps {
  violations: ViolationRow[];
}

/** Watchdog agent panel — latest NYC Open Data violations ingested per property. */
export function ViolationFeed({ violations }: ViolationFeedProps) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 border-b border-gray-100 px-5 py-3">
        <Siren className="h-4 w-4 text-red-500" />
        <h2 className="text-sm font-semibold text-gray-900">Watchdog · Violation Feed</h2>
        <span className="ml-auto text-xs text-gray-400">{violations.length} latest</span>
      </div>

      <div className="max-h-96 overflow-y-auto overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-gray-50">
            <tr className="border-b border-gray-100 text-xs text-gray-500 uppercase tracking-wide">
              <th className="px-4 py-2.5 text-left">Source</th>
              <th className="px-4 py-2.5 text-left">Address</th>
              <th className="px-4 py-2.5 text-left">Status</th>
              <th className="px-4 py-2.5 text-left">Issued</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {violations.map((v) => (
              <tr key={v.id}>
                <td className="px-4 py-3">
                  <a
                    href={SOURCE_LINK[v.source] ?? '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold hover:opacity-80 ${
                      SOURCE_BADGE[v.source] ?? 'bg-gray-100 text-gray-700'
                    }`}
                    title="View NYC Open Data dataset"
                  >
                    {v.source}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </td>
                <td className="px-4 py-3 text-gray-700">
                  {v.property_address ?? '—'}
                  <p className="font-mono text-xs text-gray-400">{v.external_id}</p>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${
                      v.status === 'open' ? 'bg-red-50 text-red-700' : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {v.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-gray-500">
                  {v.issued_date ? new Date(v.issued_date).toLocaleDateString() : '—'}
                </td>
              </tr>
            ))}
            {violations.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-400">
                  No violations recorded.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
