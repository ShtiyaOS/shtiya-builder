'use client';

import { useState } from 'react';
import { CheckCircle2, XCircle, Loader2, Inbox } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ConnectionRequest {
  id: string;
  investor_id: string;
  investor_name: string | null;
  investor_email: string;
  message: string | null;
  requested_at: string;
  status: 'requested' | 'accepted' | 'declined';
}

// ── Single request row ─────────────────────────────────────────────────────────

function RequestRow({
  request,
  onResolved,
}: {
  request: ConnectionRequest;
  onResolved: (id: string, status: 'accepted' | 'declined') => void;
}) {
  const [loading, setLoading] = useState<'accepted' | 'declined' | null>(null);

  async function resolve(status: 'accepted' | 'declined') {
    setLoading(status);
    try {
      const res = await fetch('/api/connections', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connection_id: request.id, status }),
      });
      const json = await res.json();
      if (res.ok) {
        onResolved(request.id, status);
      } else {
        alert(json.error ?? 'Failed to update request.');
      }
    } finally {
      setLoading(null);
    }
  }

  const relativeTime = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  const diffMs = Date.now() - new Date(request.requested_at).getTime();
  const diffDays = Math.round(diffMs / 86_400_000);
  const timeLabel =
    diffDays === 0
      ? 'today'
      : relativeTime.format(-diffDays, 'day');

  return (
    <li className="flex items-start justify-between gap-4 py-3">
      <div className="flex items-start gap-3 min-w-0">
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold">
          {(request.investor_name ?? request.investor_email).slice(0, 2).toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">
            {request.investor_name ?? request.investor_email}
          </p>
          <p className="text-xs text-gray-400">{request.investor_email} · {timeLabel}</p>
          {request.message && (
            <p className="mt-1 text-xs text-gray-600 italic">&ldquo;{request.message}&rdquo;</p>
          )}
        </div>
      </div>

      {request.status === 'requested' ? (
        <div className="flex flex-shrink-0 gap-1.5">
          <button
            onClick={() => resolve('declined')}
            disabled={loading !== null}
            className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            {loading === 'declined' ? <Loader2 className="h-3 w-3 animate-spin" /> : <XCircle className="h-3 w-3" />}
            Decline
          </button>
          <button
            onClick={() => resolve('accepted')}
            disabled={loading !== null}
            className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {loading === 'accepted' ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
            Accept
          </button>
        </div>
      ) : (
        <span
          className={`flex-shrink-0 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
            request.status === 'accepted'
              ? 'bg-green-50 text-green-700'
              : 'bg-gray-100 text-gray-500'
          }`}
        >
          {request.status === 'accepted' ? (
            <><CheckCircle2 className="h-3.5 w-3.5" />Connected</>
          ) : (
            <><XCircle className="h-3.5 w-3.5" />Declined</>
          )}
        </span>
      )}
    </li>
  );
}

// ── Inbox panel ────────────────────────────────────────────────────────────────

export function ConnectionInbox({ initialRequests }: { initialRequests: ConnectionRequest[] }) {
  const [requests, setRequests] = useState<ConnectionRequest[]>(initialRequests);

  function handleResolved(id: string, status: 'accepted' | 'declined') {
    setRequests((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
  }

  const pending = requests.filter((r) => r.status === 'requested');
  const resolved = requests.filter((r) => r.status !== 'requested');

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-gray-100 px-5 py-3">
        <Inbox className="h-4 w-4 text-indigo-600" />
        <h2 className="text-sm font-semibold text-gray-900">Investor Requests</h2>
        {pending.length > 0 && (
          <span className="ml-auto rounded-full bg-indigo-600 px-2 py-0.5 text-xs font-bold text-white">
            {pending.length}
          </span>
        )}
      </div>

      {requests.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm text-gray-400">
          No connection requests yet.
        </div>
      ) : (
        <div className="divide-y divide-gray-100 px-5">
          {pending.length > 0 && (
            <>
              <p className="pt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
                Pending ({pending.length})
              </p>
              <ul className="divide-y divide-gray-100">
                {pending.map((r) => (
                  <RequestRow key={r.id} request={r} onResolved={handleResolved} />
                ))}
              </ul>
            </>
          )}
          {resolved.length > 0 && (
            <>
              <p className="pt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
                Recent ({resolved.length})
              </p>
              <ul className="divide-y divide-gray-100">
                {resolved.map((r) => (
                  <RequestRow key={r.id} request={r} onResolved={handleResolved} />
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
