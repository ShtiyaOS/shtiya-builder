'use client';

import { Fragment, useState } from 'react';
import { ChevronDown, ChevronRight, Eye, ShieldAlert, ShieldCheck } from 'lucide-react';
import type { VisionInspectionRow } from './types';

interface VisionQueueProps {
  inspections: VisionInspectionRow[];
}

/** Vision agent panel — milestone-photo inspections and the escrow draw gate they set. */
export function VisionQueue({ inspections }: VisionQueueProps) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 border-b border-gray-100 px-5 py-3">
        <Eye className="h-4 w-4 text-indigo-600" />
        <h2 className="text-sm font-semibold text-gray-900">Vision · Inspection Queue</h2>
        <span className="ml-auto text-xs text-gray-400">{inspections.length} latest</span>
      </div>

      <div className="max-h-96 overflow-y-auto overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-gray-50">
            <tr className="border-b border-gray-100 text-xs text-gray-500 uppercase tracking-wide">
              <th className="px-4 py-2.5 text-left">Gate</th>
              <th className="px-4 py-2.5 text-left">Contractor</th>
              <th className="px-4 py-2.5 text-left">Property</th>
              <th className="px-4 py-2.5 text-left">Issues</th>
              <th className="px-4 py-2.5 text-left">Submitted</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {inspections.map((insp) => {
              const isOpen = expanded === insp.id;
              return (
                <Fragment key={insp.id}>
                  <tr
                    onClick={() => setExpanded(isOpen ? null : insp.id)}
                    className="cursor-pointer hover:bg-gray-50"
                  >
                    <td className="px-4 py-3">
                      {insp.blocks_draw ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-800">
                          <ShieldAlert className="h-3.5 w-3.5" /> Blocked
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-800">
                          <ShieldCheck className="h-3.5 w-3.5" /> Released
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{insp.contractor_name}</td>
                    <td className="px-4 py-3 text-gray-700">{insp.property_address ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                        {insp.flagged_issues.length > 0 ? (
                          isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />
                        ) : null}
                        {insp.flagged_issues.length} flagged
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {new Date(insp.created_at).toLocaleString()}
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="bg-gray-50/60">
                      <td colSpan={5} className="px-4 py-3">
                        {insp.ai_summary && (
                          <p className="mb-2 text-xs text-gray-600">{insp.ai_summary}</p>
                        )}
                        {insp.flagged_issues.length === 0 ? (
                          <p className="text-xs text-gray-400">No flagged issues.</p>
                        ) : (
                          <pre className="overflow-x-auto rounded-lg bg-gray-900 p-3 text-xs text-gray-100">
                            {JSON.stringify(insp.flagged_issues, null, 2)}
                          </pre>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {inspections.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-400">
                  No inspections submitted yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
