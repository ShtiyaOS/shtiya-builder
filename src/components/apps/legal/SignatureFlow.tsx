'use client';

import { useState } from 'react';
import { PenLine, Loader2, CheckCircle2, Clock, User } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────
export interface Party {
  user_id: string;
  role: string;
  signed_at: string | null;
}

interface SignatureFlowProps {
  agreementId: string;
  parties: Party[];
  status: string;
  currentUserId: string;
}

const STATUS_LABEL: Record<string, { label: string; classes: string }> = {
  draft:              { label: 'Draft',              classes: 'bg-gray-100 text-gray-700' },
  pending_signature:  { label: 'Pending Signature',  classes: 'bg-yellow-100 text-yellow-800' },
  executed:           { label: 'Executed',           classes: 'bg-green-100 text-green-800' },
  terminated:         { label: 'Terminated',         classes: 'bg-red-100 text-red-700' },
};

// ── Component ─────────────────────────────────────────────────────────────────
export function SignatureFlow({
  agreementId,
  parties: initialParties,
  status: initialStatus,
  currentUserId,
}: SignatureFlowProps) {
  const [parties, setParties] = useState<Party[]>(initialParties);
  const [status, setStatus] = useState(initialStatus);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentParty = parties.find((p) => p.user_id === currentUserId);
  const alreadySigned = !!currentParty?.signed_at;
  const canSign = !!currentParty && !alreadySigned && status !== 'executed' && status !== 'terminated';

  async function handleSign() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/agreements', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agreement_id: agreementId, party_user_id: currentUserId }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'Failed to sign.');
      } else {
        setParties(json.agreement.parties);
        setStatus(json.status);
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  const statusMeta = STATUS_LABEL[status] ?? { label: status, classes: 'bg-gray-100 text-gray-700' };

  return (
    <div className="space-y-4">
      {/* ── Status pill ─────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-gray-600">Status:</span>
        <span className={`rounded-full px-3 py-0.5 text-xs font-semibold ${statusMeta.classes}`}>
          {statusMeta.label}
        </span>
      </div>

      {/* ── Party list ──────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-5 py-3">
          <h3 className="text-sm font-semibold text-gray-900">Parties</h3>
        </div>
        <ul className="divide-y divide-gray-100">
          {parties.map((party) => (
            <li key={party.user_id} className="flex items-center gap-3 px-5 py-3">
              {party.signed_at ? (
                <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-green-500" />
              ) : (
                <Clock className="h-4 w-4 flex-shrink-0 text-yellow-500" />
              )}
              <User className="h-4 w-4 text-gray-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">
                  {party.user_id === currentUserId ? 'You' : `User ${party.user_id.slice(0, 8)}…`}
                  <span className="ml-1.5 text-xs capitalize text-gray-400">({party.role})</span>
                </p>
                {party.signed_at && (
                  <p className="text-xs text-gray-400">
                    Signed {new Date(party.signed_at).toLocaleString()}
                  </p>
                )}
              </div>
              {party.signed_at ? (
                <span className="text-xs font-medium text-green-600">Signed ✓</span>
              ) : (
                <span className="text-xs text-gray-400">Awaiting</span>
              )}
            </li>
          ))}
        </ul>
      </div>

      {/* ── Sign button ─────────────────────────────────────────────────── */}
      {error && (
        <p className="rounded-md bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>
      )}

      {status === 'executed' ? (
        <div className="flex items-center gap-2 rounded-lg bg-green-50 px-4 py-3 text-sm font-medium text-green-800">
          <CheckCircle2 className="h-4 w-4" />
          All parties have signed — this agreement is fully executed.
        </div>
      ) : (
        canSign && (
          <button
            onClick={handleSign}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <PenLine className="h-4 w-4" />
            )}
            Sign Agreement
          </button>
        )
      )}

      {!canSign && !alreadySigned && status !== 'executed' && (
        <p className="text-xs text-gray-400">
          You are not listed as a signing party on this agreement.
        </p>
      )}
    </div>
  );
}
