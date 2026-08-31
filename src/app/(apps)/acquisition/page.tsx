'use client';

import { useEffect, useState } from 'react';
import { Building2, UserPlus, Loader2, CheckCircle2, Clock, XCircle } from 'lucide-react';
import { usePageContext } from '@/hooks/usePageContext';

// ── Types ─────────────────────────────────────────────────────────────────────

interface DiscoveryProperty {
  id: string;
  address: string;
  bbl: string;
  owner_id: string;
  connection_status: 'none' | 'requested' | 'accepted' | 'declined' | 'withdrawn';
  connection_id: string | null;
}

interface ConnectionResponse {
  id: string;
  status: string;
  requested_at: string;
  error?: string;
}

// ── Connect button ─────────────────────────────────────────────────────────────

function ConnectButton({
  property,
  onStatusChange,
}: {
  property: DiscoveryProperty;
  onStatusChange: (propertyId: string, status: DiscoveryProperty['connection_status'], connectionId: string | null) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [showMessage, setShowMessage] = useState(false);

  async function sendRequest() {
    setLoading(true);
    try {
      const res = await fetch('/api/connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner_id: property.owner_id, message: message.trim() || undefined }),
      });
      const json: ConnectionResponse = await res.json();
      if (res.ok) {
        onStatusChange(property.id, 'requested', json.id);
        setShowMessage(false);
        setMessage('');
      } else {
        alert(json.error ?? 'Failed to send request.');
      }
    } finally {
      setLoading(false);
    }
  }

  async function withdraw() {
    if (!property.connection_id) return;
    setLoading(true);
    try {
      const res = await fetch('/api/connections', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connection_id: property.connection_id, status: 'withdrawn' }),
      });
      const json: ConnectionResponse = await res.json();
      if (res.ok) {
        onStatusChange(property.id, 'withdrawn', null);
      } else {
        alert(json.error ?? 'Failed to withdraw request.');
      }
    } finally {
      setLoading(false);
    }
  }

  if (property.connection_status === 'accepted') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Connected
      </span>
    );
  }

  if (property.connection_status === 'requested') {
    return (
      <button
        onClick={withdraw}
        disabled={loading}
        className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50"
      >
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Clock className="h-3.5 w-3.5" />}
        Pending · Withdraw
      </button>
    );
  }

  if (property.connection_status === 'declined') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-500">
        <XCircle className="h-3.5 w-3.5" />
        Declined
      </span>
    );
  }

  // none or withdrawn — show Connect button
  return (
    <div className="flex flex-col items-end gap-1">
      {showMessage ? (
        <div className="flex w-full flex-col gap-1.5">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Optional intro message…"
            rows={2}
            className="w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-xs focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <div className="flex justify-end gap-1.5">
            <button
              onClick={() => { setShowMessage(false); setMessage(''); }}
              className="rounded-md border border-gray-300 px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={sendRequest}
              disabled={loading}
              className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              Send Request
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowMessage(true)}
          className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100"
        >
          <UserPlus className="h-3.5 w-3.5" />
          Connect
        </button>
      )}
    </div>
  );
}

// ── Property card ─────────────────────────────────────────────────────────────

function PropertyCard({
  property,
  onStatusChange,
}: {
  property: DiscoveryProperty;
  onStatusChange: (propertyId: string, status: DiscoveryProperty['connection_status'], connectionId: string | null) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3 min-w-0">
        <Building2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-gray-400" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-gray-900">{property.address}</p>
          <p className="mt-0.5 font-mono text-xs text-gray-400">BBL: {property.bbl}</p>
        </div>
      </div>
      <div className="flex-shrink-0">
        <ConnectButton property={property} onStatusChange={onStatusChange} />
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AcquisitionPage() {
  usePageContext(
    'Owner Discovery Feed — property cards for investor outreach, connection request status per owner',
  );

  const [properties, setProperties] = useState<DiscoveryProperty[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetch('/api/connections/discovery')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setProperties(data);
        else setError(data.error ?? 'Failed to load properties.');
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  function handleStatusChange(
    propertyId: string,
    status: DiscoveryProperty['connection_status'],
    connectionId: string | null,
  ) {
    setProperties((prev) =>
      prev.map((p) =>
        p.id === propertyId ? { ...p, connection_status: status, connection_id: connectionId } : p,
      ),
    );
  }

  const filtered = properties.filter(
    (p) =>
      p.address.toLowerCase().includes(search.toLowerCase()) ||
      p.bbl.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Building2 className="h-6 w-6 text-indigo-600" />
        <div>
          <h1 className="text-xl font-bold text-gray-900">Owner Discovery</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Browse owner properties and send connection requests. Full property data unlocks after the owner accepts.
          </p>
        </div>
      </div>

      {/* Search */}
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by address or BBL…"
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      />

      {/* Content */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : error ? (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg bg-gray-50 px-4 py-8 text-center text-sm text-gray-500">
          {search ? 'No properties match your search.' : 'No properties found.'}
        </div>
      ) : (
        <ul className="space-y-3">
          {filtered.map((property) => (
            <li key={property.id}>
              <PropertyCard property={property} onStatusChange={handleStatusChange} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
