'use client';

import { useRef, useState } from 'react';
import {
  Mic, MicOff, Loader2, Save, Trash2, PlusCircle, CheckCircle2,
} from 'lucide-react';
import type { ScopeLineItem, ScopeResult } from '@/lib/gemini/voice-scope';

// ── Types ─────────────────────────────────────────────────────────────────────
type EditableItem = ScopeLineItem & { id: string };

function newItem(): EditableItem {
  return {
    id: crypto.randomUUID(),
    trade: '',
    description: '',
    unit: null,
    quantity: null,
    unit_cost_usd: null,
  };
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function NewScopePage() {
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [propertyId, setPropertyId] = useState('');
  const [projectTitle, setProjectTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<EditableItem[]>([newItem()]);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // ── Recording ──────────────────────────────────────────────────────────────
  async function startRecording() {
    setError(null);
    setSaved(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Prefer webm/opus (Chrome); fall back to whatever the browser supports.
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : '';
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.start(250);
      mediaRecorderRef.current = recorder;
      setRecording(true);
    } catch {
      setError('Microphone access denied. Please allow microphone permissions.');
    }
  }

  async function stopRecordingAndTranscribe() {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;
    setRecording(false);
    setTranscribing(true);

    await new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
      recorder.stop();
      recorder.stream.getTracks().forEach((t) => t.stop());
    });

    const blob = new Blob(chunksRef.current, {
      type: recorder.mimeType || 'audio/webm',
    });

    const formData = new FormData();
    formData.append('audio', blob, 'recording.webm');
    if (propertyId.trim()) formData.append('property_id', propertyId.trim());

    try {
      const res = await fetch('/api/voice-scope', { method: 'POST', body: formData });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'Transcription failed.');
      } else {
        const scope: ScopeResult = json.scope;
        if (scope.project_title) setProjectTitle(scope.project_title);
        if (scope.notes) setNotes(scope.notes);
        if (scope.line_items?.length) {
          setItems(scope.line_items.map((li) => ({ ...li, id: crypto.randomUUID() })));
        }
      }
    } catch {
      setError('Network error during transcription.');
    } finally {
      setTranscribing(false);
    }
  }

  // ── Editable line items ────────────────────────────────────────────────────
  function updateItem(id: string, field: keyof ScopeLineItem, value: string) {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        if (field === 'quantity' || field === 'unit_cost_usd') {
          const n = parseFloat(value);
          return { ...item, [field]: isNaN(n) ? null : n };
        }
        return { ...item, [field]: value || null };
      }),
    );
  }

  // ── Save scope draft ───────────────────────────────────────────────────────
  async function handleSave() {
    setSaving(true);
    setError(null);
    // Scope drafts are stored as a documents row (type='scope_draft') with the
    // JSON payload embedded in the metadata field via the /api/documents route.
    try {
      const res = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          property_id: propertyId.trim() || null,
          type: 'scope_draft',
          metadata: { project_title: projectTitle, notes, line_items: items },
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'Save failed.');
      } else {
        setSaved(true);
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  const totalCost = items.reduce(
    (sum, item) => sum + (item.quantity ?? 0) * (item.unit_cost_usd ?? 0),
    0,
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">Voice-to-Scope Estimator</h1>
        <p className="mt-1 text-sm text-gray-500">
          Record your scope description — Gemini AI will transcribe and structure it into a
          line-item estimate.
        </p>
      </div>

      {/* ── Property + record controls ───────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-4">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-48">
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Property ID <span className="text-gray-400">(optional)</span>
            </label>
            <input
              value={propertyId}
              onChange={(e) => setPropertyId(e.target.value)}
              placeholder="UUID"
              className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <div className="flex gap-2">
            {!recording ? (
              <button
                onClick={startRecording}
                disabled={transcribing}
                className="inline-flex items-center gap-2 rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50"
              >
                <Mic className="h-4 w-4" /> Start Recording
              </button>
            ) : (
              <button
                onClick={stopRecordingAndTranscribe}
                className="inline-flex items-center gap-2 rounded-md bg-gray-700 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-600 animate-pulse"
              >
                <MicOff className="h-4 w-4" /> Stop & Transcribe
              </button>
            )}
            {transcribing && (
              <div className="flex items-center gap-2 text-sm text-indigo-600">
                <Loader2 className="h-4 w-4 animate-spin" /> Transcribing…
              </div>
            )}
          </div>
        </div>
        {error && <p className="rounded-md bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}
        {saved && (
          <div className="flex items-center gap-2 rounded-md bg-green-50 px-4 py-2 text-sm text-green-700">
            <CheckCircle2 className="h-4 w-4" /> Scope draft saved successfully.
          </div>
        )}
      </div>

      {/* ── Project title + notes ─────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Project Title</label>
          <input
            value={projectTitle}
            onChange={(e) => setProjectTitle(e.target.value)}
            placeholder="e.g. 3rd Floor Bathroom Renovation"
            className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Additional notes or caveats…"
            className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      </div>

      {/* ── Line items table ─────────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
          <h2 className="text-sm font-semibold text-gray-900">Scope Line Items</h2>
          <button
            onClick={() => setItems((prev) => [...prev, newItem()])}
            className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-500"
          >
            <PlusCircle className="h-3.5 w-3.5" /> Add row
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                <th className="px-4 py-2 text-left">Trade</th>
                <th className="px-4 py-2 text-left">Description</th>
                <th className="px-4 py-2 text-left w-16">Unit</th>
                <th className="px-4 py-2 text-right w-20">Qty</th>
                <th className="px-4 py-2 text-right w-24">Unit Cost</th>
                <th className="px-4 py-2 text-right w-24">Total</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-2">
                    <input value={item.trade} onChange={(e) => updateItem(item.id, 'trade', e.target.value)}
                      className="w-full rounded border border-gray-200 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400" />
                  </td>
                  <td className="px-4 py-2">
                    <input value={item.description} onChange={(e) => updateItem(item.id, 'description', e.target.value)}
                      className="w-full rounded border border-gray-200 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400" />
                  </td>
                  <td className="px-4 py-2">
                    <input value={item.unit ?? ''} onChange={(e) => updateItem(item.id, 'unit', e.target.value)}
                      className="w-full rounded border border-gray-200 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400" />
                  </td>
                  <td className="px-4 py-2">
                    <input type="number" value={item.quantity ?? ''} onChange={(e) => updateItem(item.id, 'quantity', e.target.value)}
                      className="w-full rounded border border-gray-200 px-2 py-1 text-xs text-right focus:outline-none focus:ring-1 focus:ring-indigo-400" />
                  </td>
                  <td className="px-4 py-2">
                    <input type="number" value={item.unit_cost_usd ?? ''} onChange={(e) => updateItem(item.id, 'unit_cost_usd', e.target.value)}
                      className="w-full rounded border border-gray-200 px-2 py-1 text-xs text-right focus:outline-none focus:ring-1 focus:ring-indigo-400" />
                  </td>
                  <td className="px-4 py-2 text-right text-xs text-gray-600">
                    {item.quantity && item.unit_cost_usd
                      ? `$${(item.quantity * item.unit_cost_usd).toLocaleString()}`
                      : '—'}
                  </td>
                  <td className="px-2 py-2">
                    <button onClick={() => setItems((prev) => prev.filter((i) => i.id !== item.id))}
                      className="text-gray-300 hover:text-red-400">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-gray-200 bg-gray-50">
                <td colSpan={5} className="px-4 py-2 text-right text-xs font-semibold text-gray-600">
                  Estimated Total
                </td>
                <td className="px-4 py-2 text-right text-sm font-bold text-gray-900">
                  ${totalCost.toLocaleString()}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* ── Save button ──────────────────────────────────────────────────── */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving || items.every((i) => !i.trade && !i.description)}
          className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save Scope Draft
        </button>
      </div>
    </div>
  );
}
