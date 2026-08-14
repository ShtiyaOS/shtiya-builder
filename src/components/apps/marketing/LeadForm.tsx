'use client';

import { useState } from 'react';
import { Send, Loader2, CheckCircle2, AlertCircle, Building2 } from 'lucide-react';

interface LeadFormProps {
  onSuccess?: (leadId: string, relatedPropertyId: string | null) => void;
}

export function LeadForm({ onSuccess }: LeadFormProps) {
  const [name, setName]             = useState('');
  const [email, setEmail]           = useState('');
  const [phone, setPhone]           = useState('');
  const [description, setDescription] = useState('');
  const [budgetUsd, setBudgetUsd]   = useState('');
  const [source, setSource]         = useState('website');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{
    lead_id: string;
    related_property_id: string | null;
    match_score: number | null;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim() || undefined,
          description: description.trim(),
          source,
          budget_usd: budgetUsd ? parseFloat(budgetUsd) : undefined,
        }),
      });
      const json = await res.json() as {
        lead_id?: string;
        related_property_id?: string | null;
        match_score?: number | null;
        error?: string;
      };
      if (!res.ok) {
        setError(json.error ?? 'Submission failed.');
      } else {
        setResult({
          lead_id: json.lead_id!,
          related_property_id: json.related_property_id ?? null,
          match_score: json.match_score ?? null,
        });
        onSuccess?.(json.lead_id!, json.related_property_id ?? null);
        // Reset form
        setName(''); setEmail(''); setPhone('');
        setDescription(''); setBudgetUsd('');
      }
    } catch {
      setError('Network error — please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Full Name *</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="Jane Smith"
            className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Email *</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="jane@example.com"
            className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Phone</label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+1 (212) 555-0100"
            className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Budget (USD)</label>
          <input
            type="number"
            value={budgetUsd}
            onChange={(e) => setBudgetUsd(e.target.value)}
            min={0}
            placeholder="500000"
            className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Lead Source</label>
        <select
          value={source}
          onChange={(e) => setSource(e.target.value)}
          className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:w-48"
        >
          {['website', 'referral', 'google_ads', 'social_media', 'direct', 'other'].map((s) => (
            <option key={s} value={s} className="capitalize">{s.replace('_', ' ')}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">
          Property Interest / Description *
          <span className="ml-1 text-gray-400">(used for AI property matching)</span>
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
          rows={4}
          placeholder="e.g. Looking for a vacant corner lot in Harlem for ground-up development, 5,000–8,000 SF, mixed-use zoning…"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          <AlertCircle className="h-4 w-4 flex-shrink-0" /> {error}
        </div>
      )}

      {result && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-xs text-green-800 space-y-1">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
            <span className="font-semibold">Lead submitted! ID: <span className="font-mono">{result.lead_id}</span></span>
          </div>
          {result.related_property_id && (
            <div className="flex items-center gap-1.5 pl-6 text-green-700">
              <Building2 className="h-3.5 w-3.5" />
              Auto-matched to property{' '}
              <span className="font-mono">{result.related_property_id.slice(0, 8)}…</span>
              {result.match_score != null && (
                <span className="text-green-600">(similarity {(1 - result.match_score).toFixed(3)})</span>
              )}
            </div>
          )}
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={submitting || !name.trim() || !email.trim() || !description.trim()}
          className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Submit Lead
        </button>
      </div>
    </form>
  );
}
