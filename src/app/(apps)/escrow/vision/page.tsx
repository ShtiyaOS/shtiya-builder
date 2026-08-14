'use client';

import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { ShieldCheck, ShieldAlert, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import Link from 'next/link';

interface ReleaseResult {
  status?: string;
  web3_tx_hash?: string;
  vision_cleared?: boolean;
  inspection_id?: string;
  error?: string;
  reason?: string;
  blocks_draw?: boolean;
}

export default function EscrowVisionPage() {
  const searchParams = useSearchParams();
  const ledgerId = searchParams.get('ledger_id') ?? '';

  const [recipient, setRecipient] = useState('');
  const [documentId, setDocumentId] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ReleaseResult | null>(null);

  async function handleRelease() {
    if (!ledgerId || !recipient.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch('/api/escrow/release', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ledger_id: ledgerId,
          recipient: recipient.trim(),
          document_id: documentId.trim() || undefined,
        }),
      });
      const json: ReleaseResult = await res.json();
      setResult(json);
    } catch {
      setResult({ error: 'Network error. Please try again.' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <ShieldCheck className="h-6 w-6 text-indigo-600" />
        <div>
          <h1 className="text-xl font-bold text-gray-900">Vision-Gated Draw Release</h1>
          <p className="text-sm text-gray-500">
            Releases an escrow hold only when all Vision inspections pass.
          </p>
        </div>
      </div>

      {/* ── Release form ─────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Ledger ID</label>
          <p className="rounded-md bg-gray-50 px-3 py-2 font-mono text-xs text-gray-700">
            {ledgerId || '— not provided —'}
          </p>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Recipient Ethereum Address
          </label>
          <input
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            placeholder="0x…"
            className="w-full rounded-md border border-gray-300 px-3 py-1.5 font-mono text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Document ID <span className="text-gray-400">(optional — gates against specific milestone)</span>
          </label>
          <input
            value={documentId}
            onChange={(e) => setDocumentId(e.target.value)}
            placeholder="UUID"
            className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        <button
          onClick={handleRelease}
          disabled={loading || !ledgerId || !recipient.trim()}
          className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ShieldCheck className="h-4 w-4" />
          )}
          Attempt Release
        </button>
      </div>

      {/* ── Result ───────────────────────────────────────────────────────── */}
      {result && (
        <div
          className={`rounded-xl border p-5 space-y-3 ${
            result.blocks_draw || result.error
              ? 'border-red-200 bg-red-50'
              : 'border-green-200 bg-green-50'
          }`}
        >
          <div className="flex items-center gap-2">
            {result.blocks_draw || result.error ? (
              <ShieldAlert className="h-5 w-5 text-red-600" />
            ) : (
              <CheckCircle2 className="h-5 w-5 text-green-600" />
            )}
            <span className={`text-sm font-semibold ${result.blocks_draw || result.error ? 'text-red-800' : 'text-green-800'}`}>
              {result.blocks_draw
                ? 'Release Blocked by Vision'
                : result.error
                  ? 'Release Failed'
                  : 'Release Successful'}
            </span>
          </div>

          {result.error && (
            <p className="text-sm text-red-700">{result.error}</p>
          )}
          {result.reason && (
            <div className="flex items-start gap-2 text-sm text-red-700">
              <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <span>{result.reason}</span>
            </div>
          )}
          {result.web3_tx_hash && (
            <p className="text-xs text-gray-600">
              Tx Hash:{' '}
              <a
                href={`https://sepolia.etherscan.io/tx/${result.web3_tx_hash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-indigo-600 hover:underline"
              >
                {result.web3_tx_hash.slice(0, 18)}…
              </a>
            </p>
          )}
          {result.inspection_id && (
            <p className="text-xs text-gray-500">
              Vision Inspection:{' '}
              <Link href={`/contractor/vision/${result.inspection_id}`} className="text-indigo-600 hover:underline">
                View report
              </Link>
            </p>
          )}
        </div>
      )}

      <Link href="/escrow" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-indigo-600">
        ← Back to Escrow
      </Link>
    </div>
  );
}
