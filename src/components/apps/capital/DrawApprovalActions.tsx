'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, Unlock, AlertTriangle } from 'lucide-react';

interface DrawApprovalActionsProps {
  ledgerId: string;
  currentStatus: string;
  visionBlocks: boolean;
  complianceLapsed: boolean;
}

/**
 * DrawApprovalActions
 *
 * Client island that renders Hold / Release buttons for a capital draw.
 * Posts to /api/draws/approve and calls router.refresh() on success so
 * the parent Server Component re-fetches the updated ledger status.
 *
 * Both buttons are disabled (with a reason) when:
 *   - Vision AI has flagged blocking issues (`visionBlocks = true`)
 *   - Contractor compliance has lapsed (`complianceLapsed = true`)
 *   - The draw is already in a terminal state (`released`)
 */
export function DrawApprovalActions({
  ledgerId,
  currentStatus,
  visionBlocks,
  complianceLapsed,
}: DrawApprovalActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState<'hold' | 'release' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const blocked = visionBlocks || complianceLapsed;
  const isTerminal = currentStatus === 'released';

  async function handleAction(action: 'hold' | 'release') {
    setError(null);
    setLoading(action);

    try {
      const res = await fetch('/api/draws/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ledger_id: ledgerId, action }),
      });

      const json = (await res.json()) as { error?: string; reason?: string };

      if (!res.ok) {
        setError(json.reason ?? json.error ?? 'An unexpected error occurred.');
      } else {
        router.refresh();
      }
    } catch {
      setError('Network error — please try again.');
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="space-y-3">
      {/* ── Gate warnings ──────────────────────────────────────────────────── */}
      {(visionBlocks || complianceLapsed) && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700">
          <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <span>
            {visionBlocks && 'Vision AI has flagged blocking issues on the most recent inspection. '}
            {complianceLapsed && 'Contractor compliance has lapsed. '}
            Resolve before approving.
          </span>
        </div>
      )}

      {/* ── Action buttons ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        {/* Hold: pending → held */}
        <button
          onClick={() => handleAction('hold')}
          disabled={!!loading || blocked || isTerminal || currentStatus !== 'pending'}
          className="flex items-center gap-1.5 rounded-lg bg-yellow-500 px-4 py-2 text-sm font-medium text-white hover:bg-yellow-600 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-yellow-400"
        >
          <Lock className="h-4 w-4" />
          {loading === 'hold' ? 'Holding…' : 'Approve Hold'}
        </button>

        {/* Release: held → released */}
        <button
          onClick={() => handleAction('release')}
          disabled={!!loading || blocked || isTerminal || currentStatus !== 'held'}
          className="flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-green-500"
        >
          <Unlock className="h-4 w-4" />
          {loading === 'release' ? 'Releasing…' : 'Approve Release'}
        </button>
      </div>

      {/* ── Contextual hint ────────────────────────────────────────────────── */}
      {isTerminal && (
        <p className="text-xs text-gray-400">This draw has been released — no further actions available.</p>
      )}

      {/* ── API error ──────────────────────────────────────────────────────── */}
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
