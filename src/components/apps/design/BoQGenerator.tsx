'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Wand2, Loader2, CheckCircle2, AlertCircle, ArrowRight } from 'lucide-react';
import type { BoQResult, BoQSection } from '@/lib/gemini/boq-generator';

interface DocOption {
  id: string;
  label: string;
  public_url: string | null;
}

interface BoQGeneratorProps {
  propertyId: string;
  docs: DocOption[];
}

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

export function BoQGenerator({ propertyId, docs }: BoQGeneratorProps) {
  const router = useRouter();
  const [selectedDocId, setSelectedDocId] = useState(docs[0]?.id ?? '');
  const [generating, setGenerating] = useState(false);
  const [handingOff, setHandingOff] = useState(false);
  const [boq, setBoq] = useState<BoQResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [handedOff, setHandedOff] = useState<string | null>(null); // document_id of saved scope draft

  async function handleGenerate() {
    if (!selectedDocId) return;
    setGenerating(true);
    setError(null);
    setBoq(null);
    setHandedOff(null);

    try {
      const res = await fetch('/api/boq-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document_id: selectedDocId, property_id: propertyId }),
      });
      const json = await res.json() as { boq?: BoQResult; error?: string };
      if (!res.ok) {
        setError(json.error ?? 'BoQ generation failed.');
      } else {
        setBoq(json.boq ?? null);
      }
    } catch {
      setError('Network error — please try again.');
    } finally {
      setGenerating(false);
    }
  }

  async function handleHandOff() {
    if (!boq) return;
    setHandingOff(true);
    setError(null);

    // Flatten BoQ into scope line items and save as a scope_draft documents row.
    const lineItems = boq.sections.flatMap((s: BoQSection) =>
      s.items.map((item) => ({
        trade: s.section_name,
        description: item.description,
        unit: item.unit,
        quantity: item.quantity,
        unit_cost_usd: item.unit_cost_usd,
      })),
    );

    try {
      const res = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          property_id: propertyId,
          type: 'scope_draft',
          metadata: {
            project_title: boq.project_title,
            notes: boq.assumptions,
            line_items: lineItems,
            source: 'boq_generator',
          },
        }),
      });
      const json = await res.json() as { document_id?: string; error?: string };
      if (!res.ok) {
        setError(json.error ?? 'Scope hand-off failed.');
      } else {
        setHandedOff(json.document_id ?? null);
        router.refresh();
      }
    } catch {
      setError('Network error during hand-off.');
    } finally {
      setHandingOff(false);
    }
  }

  if (docs.length === 0) {
    return (
      <p className="text-xs text-gray-400">
        Upload a PDF to the vault above to enable BoQ generation.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Doc selector + generate button ─────────────────────────────── */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-48">
          <label className="block text-xs font-medium text-gray-600 mb-1">PDF Document</label>
          <select
            value={selectedDocId}
            onChange={(e) => { setSelectedDocId(e.target.value); setBoq(null); }}
            className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            {docs.map((d) => (
              <option key={d.id} value={d.id}>{d.label}</option>
            ))}
          </select>
        </div>
        <button
          onClick={handleGenerate}
          disabled={!selectedDocId || generating}
          className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          {generating ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Generating…</>
          ) : (
            <><Wand2 className="h-4 w-4" /> Generate BoQ</>
          )}
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          <AlertCircle className="h-4 w-4 flex-shrink-0" /> {error}
        </div>
      )}

      {handedOff && (
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-800">
          <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
          Scope draft saved (ID: <span className="font-mono">{handedOff}</span>). Visible in Contractor app.
        </div>
      )}

      {/* ── BoQ result ─────────────────────────────────────────────────── */}
      {boq && (
        <div className="space-y-3">
          {boq.project_title && (
            <h3 className="text-sm font-semibold text-gray-900">{boq.project_title}</h3>
          )}

          {boq.sections.map((section) => {
            const sectionTotal = section.items.reduce(
              (sum, item) => sum + (item.quantity ?? 0) * (item.unit_cost_usd ?? 0),
              0,
            );
            return (
              <div key={section.section_name} className="rounded-lg border border-gray-100">
                <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-3 py-2">
                  <span className="text-xs font-semibold text-gray-700">{section.section_name}</span>
                  {sectionTotal > 0 && (
                    <span className="text-xs font-medium text-gray-500">{usd.format(sectionTotal)}</span>
                  )}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-100 text-gray-400 uppercase tracking-wide">
                        <th className="px-3 py-2 text-left">Description</th>
                        <th className="px-3 py-2 text-left w-16">Unit</th>
                        <th className="px-3 py-2 text-right w-16">Qty</th>
                        <th className="px-3 py-2 text-right w-24">Unit $</th>
                        <th className="px-3 py-2 text-right w-24">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {section.items.map((item, idx) => (
                        <tr key={idx}>
                          <td className="px-3 py-2 text-gray-700">{item.description}</td>
                          <td className="px-3 py-2 text-gray-500">{item.unit ?? '—'}</td>
                          <td className="px-3 py-2 text-right text-gray-600">{item.quantity ?? '—'}</td>
                          <td className="px-3 py-2 text-right text-gray-600">
                            {item.unit_cost_usd != null ? usd.format(item.unit_cost_usd) : '—'}
                          </td>
                          <td className="px-3 py-2 text-right font-medium text-gray-800">
                            {item.quantity && item.unit_cost_usd
                              ? usd.format(item.quantity * item.unit_cost_usd)
                              : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}

          {/* ── Totals + assumptions ─────────────────────────────────── */}
          <div className="flex items-start justify-between gap-4 flex-wrap">
            {boq.total_estimated_cost_usd != null && (
              <p className="text-sm font-bold text-gray-900">
                Total Estimated Cost: {usd.format(boq.total_estimated_cost_usd)}
              </p>
            )}
            {boq.assumptions && (
              <p className="text-xs text-gray-400 italic max-w-prose">{boq.assumptions}</p>
            )}
          </div>

          {/* ── Hand-off to contractor ───────────────────────────────── */}
          <div className="flex justify-end">
            <button
              onClick={handleHandOff}
              disabled={handingOff || !!handedOff}
              className="flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            >
              {handingOff ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>
              ) : (
                <><ArrowRight className="h-4 w-4" /> Hand off to Contractor</>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
