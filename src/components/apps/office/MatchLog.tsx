import { Target } from 'lucide-react';
import type { MatchedLeadRow } from './types';

interface MatchLogProps {
  leads: MatchedLeadRow[];
}

/** Match agent panel — inbound Marketing leads and the property they were auto-routed to. */
export function MatchLog({ leads }: MatchLogProps) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 border-b border-gray-100 px-5 py-3">
        <Target className="h-4 w-4 text-indigo-600" />
        <h2 className="text-sm font-semibold text-gray-900">Match · Lead Routing</h2>
        <span className="ml-auto text-xs text-gray-400">{leads.length} latest</span>
      </div>

      <div className="max-h-96 overflow-y-auto overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-gray-50">
            <tr className="border-b border-gray-100 text-xs text-gray-500 uppercase tracking-wide">
              <th className="px-4 py-2.5 text-left">Lead</th>
              <th className="px-4 py-2.5 text-left">Matched Property</th>
              <th className="px-4 py-2.5 text-left">Score</th>
              <th className="px-4 py-2.5 text-left">Submitted</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {leads.map((l) => (
              <tr key={l.id}>
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-800">{l.name}</p>
                  <p className="text-xs text-gray-400">{l.email}</p>
                </td>
                <td className="px-4 py-3 text-gray-700">
                  {l.related_property_address ? (
                    l.related_property_address
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-500">
                      Unmatched
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-gray-500">
                  {l.match_score !== null ? l.match_score.toFixed(3) : '—'}
                </td>
                <td className="px-4 py-3 text-xs text-gray-500">
                  {new Date(l.submitted_at).toLocaleString()}
                </td>
              </tr>
            ))}
            {leads.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-400">
                  No leads submitted yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
