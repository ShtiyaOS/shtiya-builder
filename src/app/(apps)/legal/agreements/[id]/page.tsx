'use client';

import { useState } from 'react';
import { FileText, Loader2, PlusCircle } from 'lucide-react';
import { SignatureFlow, type Party } from '@/components/apps/legal/SignatureFlow';

const AGREEMENT_TYPES = [
  { value: 'psa',               label: 'Purchase & Sale Agreement (PSA)' },
  { value: 'jv',                label: 'Joint Venture Agreement (JV)' },
  { value: 'lease',             label: 'Lease Agreement' },
  { value: 'arbitration_clause', label: 'Binding Arbitration Clause' },
] as const;

type AgreementType = typeof AGREEMENT_TYPES[number]['value'];

interface Agreement {
  id: string;
  type: string;
  status: string;
  parties: Party[];
  binding_arbitration: boolean;
  property_id: string | null;
  document_id: string | null;
}

export default function AgreementGeneratorPage() {
  const [agreementType, setAgreementType] = useState<AgreementType>('psa');
  const [propertyId, setPropertyId] = useState('');
  const [arbitration, setArbitration] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agreement, setAgreement] = useState<Agreement | null>(null);
  const [template, setTemplate] = useState<string>('');
  // In a real app we'd get currentUserId from the server; using a placeholder
  // that the SignatureFlow component handles gracefully.
  const [currentUserId] = useState('current-user-placeholder');

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setAgreement(null);
    try {
      const res = await fetch('/api/agreements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: agreementType,
          property_id: propertyId.trim() || null,
          binding_arbitration: arbitration,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'Failed to create agreement.');
      } else {
        setAgreement(json.agreement);
        setTemplate(json.template ?? '');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <FileText className="h-6 w-6 text-indigo-600" />
        <div>
          <h1 className="text-xl font-bold text-gray-900">Agreement Generator</h1>
          <p className="text-sm text-gray-500">
            Create a PSA, JV, Lease, or Arbitration Clause and collect e-signatures.
          </p>
        </div>
      </div>

      {/* ── Generator form ──────────────────────────────────────────────── */}
      {!agreement && (
        <form onSubmit={handleCreate} className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Agreement Type</label>
            <select
              value={agreementType}
              onChange={(e) => setAgreementType(e.target.value as AgreementType)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              {AGREEMENT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Property ID <span className="text-gray-400">(optional)</span>
            </label>
            <input
              type="text"
              value={propertyId}
              onChange={(e) => setPropertyId(e.target.value)}
              placeholder="UUID of the related property"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={arbitration}
              onChange={(e) => setArbitration(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-sm text-gray-700">Include binding arbitration clause</span>
          </label>

          {error && (
            <p className="rounded-md bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlusCircle className="h-4 w-4" />}
            Generate Agreement
          </button>
        </form>
      )}

      {/* ── Agreement card ───────────────────────────────────────────────── */}
      {agreement && (
        <div className="space-y-5">
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">
                {AGREEMENT_TYPES.find((t) => t.value === agreement.type)?.label ?? agreement.type}
              </h2>
              <button
                onClick={() => setAgreement(null)}
                className="text-xs text-indigo-600 hover:text-indigo-500"
              >
                Create another
              </button>
            </div>
            <p className="text-xs font-mono text-gray-400">ID: {agreement.id}</p>
            {agreement.binding_arbitration && (
              <p className="text-xs text-green-700 bg-green-50 rounded px-2 py-1 inline-block">
                ✓ Binding arbitration clause included
              </p>
            )}
          </div>

          {/* Template preview */}
          {template && (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-5">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Document Preview
              </h3>
              <pre className="whitespace-pre-wrap text-xs text-gray-700 leading-relaxed font-mono">
                {template}
              </pre>
            </div>
          )}

          {/* Signature flow */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold text-gray-900">E-Signatures</h2>
            <SignatureFlow
              agreementId={agreement.id}
              parties={agreement.parties}
              status={agreement.status}
              currentUserId={currentUserId}
            />
          </div>
        </div>
      )}
    </div>
  );
}
