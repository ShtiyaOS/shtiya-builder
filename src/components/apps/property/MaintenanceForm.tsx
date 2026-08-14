'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Wrench, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

const TRADES = ['Plumbing', 'Electrical', 'HVAC', 'Carpentry', 'Roofing', 'Pest Control', 'General'] as const;
const URGENCIES = ['low', 'normal', 'urgent'] as const;

interface MaintenanceFormProps {
  propertyId: string;
  propertyAddress: string;
}

export function MaintenanceForm({ propertyId, propertyAddress }: MaintenanceFormProps) {
  const router = useRouter();
  const [trade, setTrade] = useState<string>('Plumbing');
  const [description, setDescription] = useState('');
  const [urgency, setUrgency] = useState<string>('normal');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ticket_document_id: string; scope_document_id: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim()) return;
    setSubmitting(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch('/api/maintenance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ property_id: propertyId, trade, description: description.trim(), urgency }),
      });
      const json = await res.json() as {
        ticket_document_id?: string;
        scope_document_id?: string | null;
        error?: string;
      };
      if (!res.ok) {
        setError(json.error ?? 'Submission failed.');
      } else {
        setResult({ ticket_document_id: json.ticket_document_id!, scope_document_id: json.scope_document_id ?? null });
        setDescription('');
        router.refresh();
      }
    } catch {
      setError('Network error — please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <p className="text-xs text-gray-500 mb-3">Property: <span className="font-medium text-gray-700">{propertyAddress}</span></p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Trade / Category</label>
          <select
            value={trade}
            onChange={(e) => setTrade(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            {TRADES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Urgency</label>
          <select
            value={urgency}
            onChange={(e) => setUrgency(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            {URGENCIES.map((u) => (
              <option key={u} value={u} className="capitalize">{u.charAt(0).toUpperCase() + u.slice(1)}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Problem Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          required
          placeholder="Describe the issue in detail — location, when it started, what you've observed…"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </div>

      {result && (
        <div className="flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2.5 text-xs text-green-800">
          <CheckCircle2 className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Ticket submitted successfully.</p>
            <p className="mt-0.5 text-green-700">Ticket ID: <span className="font-mono">{result.ticket_document_id}</span></p>
            {result.scope_document_id && (
              <p className="mt-0.5 text-green-700">Contractor scope draft created: <span className="font-mono">{result.scope_document_id}</span></p>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          <AlertCircle className="h-4 w-4 flex-shrink-0" /> {error}
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={submitting || !description.trim()}
          className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wrench className="h-4 w-4" />}
          Submit Ticket
        </button>
      </div>
    </form>
  );
}
