'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Eye, Loader2, ShieldAlert, ShieldCheck } from 'lucide-react';

interface FlaggedIssue {
  issue: string;
  severity: string;
}

interface Inspection {
  id: string;
  ai_summary: string | null;
  flagged_issues: FlaggedIssue[];
  confidence: number | null;
  blocks_draw: boolean | null;
  created_at: string;
}

const POLL_INTERVAL_MS = 3000;
const MAX_POLLS = 40; // ~2 minutes — covers the (unlikely) row-not-committed-yet race

function SeverityBadge({ severity }: { severity: string }) {
  const styles: Record<string, string> = {
    low: 'bg-blue-50 text-blue-700',
    medium: 'bg-yellow-50 text-yellow-800',
    high: 'bg-orange-50 text-orange-800',
    critical: 'bg-red-100 text-red-800',
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${styles[severity] ?? 'bg-gray-100 text-gray-600'}`}>
      {severity}
    </span>
  );
}

interface InspectionResultProps {
  /** null = no Vision inspection was run for this upload (e.g. file > 20 MB). */
  inspectionId: string | null;
}

/**
 * InspectionResult
 *
 * Polls `GET /api/vision-inspections?id=<inspectionId>` every 3 seconds
 * until a row comes back with a non-null `blocks_draw` (the column is
 * `not null`, so in practice the very first successful poll already has a
 * final result — the loop exists for the race where the row briefly isn't
 * visible yet, and stops itself after MAX_POLLS either way).
 */
export function InspectionResult({ inspectionId }: InspectionResultProps) {
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [polling, setPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollCountRef = useRef(0);

  useEffect(() => {
    setInspection(null);
    setError(null);
    pollCountRef.current = 0;

    if (!inspectionId) return;

    setPolling(true);
    let cancelled = false;

    async function poll() {
      pollCountRef.current += 1;
      try {
        const res = await fetch(`/api/vision-inspections?id=${encodeURIComponent(inspectionId!)}`);
        const json = await res.json();
        if (cancelled) return;

        if (res.ok) {
          const row = json as Inspection;
          if (row.blocks_draw !== null) {
            setInspection(row);
            setPolling(false);
            return;
          }
        }
      } catch {
        // network hiccup — keep polling until MAX_POLLS
      }

      if (!cancelled) {
        if (pollCountRef.current >= MAX_POLLS) {
          setPolling(false);
          setError('Inspection is taking longer than expected. Refresh to check again.');
          return;
        }
        timer = setTimeout(poll, POLL_INTERVAL_MS);
      }
    }

    let timer = setTimeout(poll, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [inspectionId]);

  if (!inspectionId) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 p-5 text-sm text-gray-500">
        <Eye className="h-5 w-5 flex-shrink-0 text-gray-400" />
        No Vision inspection was run for this file (skipped for files over 20 MB).
      </div>
    );
  }

  if (polling && !inspection) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-5 text-sm text-gray-600 shadow-sm">
        <Loader2 className="h-5 w-5 flex-shrink-0 animate-spin text-indigo-500" />
        Running Gemini Vision inspection…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-yellow-200 bg-yellow-50 p-5 text-sm text-yellow-800">
        <AlertTriangle className="h-5 w-5 flex-shrink-0" />
        {error}
      </div>
    );
  }

  if (!inspection) return null;

  const blocksDraw = Boolean(inspection.blocks_draw);

  return (
    <div className="space-y-4">
      {/* ── Draw gate banner (full-width) ───────────────────────────────── */}
      <div
        className={`flex items-center gap-3 rounded-xl border p-4 ${
          blocksDraw ? 'border-red-200 bg-red-50' : 'border-green-200 bg-green-50'
        }`}
      >
        {blocksDraw ? (
          <ShieldAlert className="h-6 w-6 flex-shrink-0 text-red-600" />
        ) : (
          <ShieldCheck className="h-6 w-6 flex-shrink-0 text-green-600" />
        )}
        <div>
          <p className={`text-sm font-bold ${blocksDraw ? 'text-red-800' : 'text-green-800'}`}>
            {blocksDraw ? 'Draw Release BLOCKED' : 'Draw Release APPROVED'}
          </p>
          <p className="text-xs text-gray-500">
            {inspection.confidence !== null && `AI confidence: ${(inspection.confidence * 100).toFixed(0)}%`}
          </p>
        </div>
      </div>

      {/* ── AI summary ───────────────────────────────────────────────────── */}
      {inspection.ai_summary && (
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h3 className="mb-2 text-sm font-semibold text-gray-900">AI Summary</h3>
          <p className="text-sm leading-relaxed text-gray-700">{inspection.ai_summary}</p>
        </div>
      )}

      {/* ── Flagged issues ───────────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
          <h3 className="text-sm font-semibold text-gray-900">Flagged Issues</h3>
          <span className="text-xs text-gray-400">{inspection.flagged_issues.length} found</span>
        </div>
        {inspection.flagged_issues.length === 0 ? (
          <div className="flex items-center gap-2 px-5 py-6 text-sm text-green-700">
            <ShieldCheck className="h-4 w-4" /> No issues detected.
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {inspection.flagged_issues.map((fi, i) => (
              <li key={i} className="flex items-start gap-3 px-5 py-4">
                <AlertTriangle
                  className={`mt-0.5 h-4 w-4 flex-shrink-0 ${
                    fi.severity === 'critical' || fi.severity === 'high' ? 'text-red-500' : 'text-yellow-500'
                  }`}
                />
                <p className="flex-1 text-sm text-gray-800">{fi.issue}</p>
                <SeverityBadge severity={fi.severity} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
