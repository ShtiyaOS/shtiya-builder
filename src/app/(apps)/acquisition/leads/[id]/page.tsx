'use client';

import { useCallback, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  Upload,
  FileText,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertTriangle,
  X,
  DollarSign,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────
interface FileEntry {
  file: File;
  id: string;
  status: 'queued' | 'uploading' | 'ok' | 'error';
  propertyId?: string | null;
  documentId?: string | null;
  reason?: string;
}

interface ApiFileResult {
  status: 'ok' | 'error';
  fileName: string;
  propertyId?: string | null;
  documentId?: string | null;
  reason?: string;
}

interface ApiResponse {
  processed: number;
  succeeded: number;
  failed: number;
  results: ApiFileResult[];
  error?: string;
}

const MAX_FILES = 50;
const ACCEPTED_MIME = 'application/pdf';

// ── Status icon ───────────────────────────────────────────────────────────────
function FileStatusIcon({ status }: { status: FileEntry['status'] }) {
  switch (status) {
    case 'ok':
      return <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-green-600" />;
    case 'error':
      return <XCircle className="h-4 w-4 flex-shrink-0 text-red-500" />;
    case 'uploading':
      return <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin text-indigo-500" />;
    default:
      return <FileText className="h-4 w-4 flex-shrink-0 text-gray-400" />;
  }
}

// ── Municipal debt types ──────────────────────────────────────────────────────
interface DebtResult {
  inserted: number;
  total_debt_usd: number;
  bbl: string;
  message?: string;
  error?: string;
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function AcquisitionLeadPage() {
  const params = useParams<{ id: string }>();
  const leadId = params.id;

  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [summary, setSummary] = useState<ApiResponse | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Municipal debt state ───────────────────────────────────────────────────
  const [debtPropertyId, setDebtPropertyId] = useState('');
  const [debtLoading, setDebtLoading] = useState(false);
  const [debtResult, setDebtResult] = useState<DebtResult | null>(null);

  // ── Add files to the queue ────────────────────────────────────────────────
  const addFiles = useCallback((incoming: FileList | File[]) => {
    const pdfs = Array.from(incoming).filter((f) => f.type === ACCEPTED_MIME);
    if (!pdfs.length) return;

    setEntries((prev) => {
      const remaining = MAX_FILES - prev.length;
      const toAdd = pdfs.slice(0, remaining).map(
        (file): FileEntry => ({
          file,
          id: `${file.name}-${file.size}-${Date.now()}-${Math.random()}`,
          status: 'queued',
        }),
      );
      return [...prev, ...toAdd];
    });
  }, []);

  // ── Drag handlers ─────────────────────────────────────────────────────────
  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(true);
  }
  function handleDragLeave(e: React.DragEvent) {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragging(false);
  }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  }

  // ── File input change ─────────────────────────────────────────────────────
  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files?.length) {
      addFiles(e.target.files);
      // Reset input so the same file can be re-added if removed then re-chosen
      e.target.value = '';
    }
  }

  // ── Remove a queued file ──────────────────────────────────────────────────
  function removeEntry(id: string) {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }

  // ── Upload batch ──────────────────────────────────────────────────────────
  async function handleUpload() {
    const queued = entries.filter((e) => e.status === 'queued');
    if (!queued.length) return;

    setUploading(true);
    setSummary(null);

    // Mark all queued entries as uploading
    setEntries((prev) =>
      prev.map((e) => (e.status === 'queued' ? { ...e, status: 'uploading' } : e)),
    );

    const formData = new FormData();
    queued.forEach((entry) => formData.append('files', entry.file));
    // Forward the lead ID so the server can link documents to this lead.
    formData.append('lead_id', leadId);

    try {
      const res = await fetch('/api/webhooks/gemini', {
        method: 'POST',
        body: formData,
      });

      const json: ApiResponse = await res.json();

      if (!res.ok && json.error) {
        // Whole-batch rejection (auth, bad request, etc.)
        setEntries((prev) =>
          prev.map((e) =>
            e.status === 'uploading' ? { ...e, status: 'error', reason: json.error } : e,
          ),
        );
        setSummary({ ...json, processed: 0, succeeded: 0, failed: queued.length, results: [] });
      } else {
        // Map per-file results back onto the entries list by filename
        const resultMap = new Map<string, ApiFileResult>(
          json.results.map((r) => [r.fileName, r]),
        );
        setEntries((prev) =>
          prev.map((e) => {
            if (e.status !== 'uploading') return e;
            const result = resultMap.get(e.file.name);
            if (!result) return { ...e, status: 'error', reason: 'No result returned by server.' };
            return {
              ...e,
              status: result.status === 'ok' ? 'ok' : 'error',
              propertyId: result.propertyId,
              documentId: result.documentId,
              reason: result.reason,
            };
          }),
        );
        setSummary(json);
      }
    } catch (err) {
      const reason = `Network error: ${String(err)}`;
      setEntries((prev) =>
        prev.map((e) => (e.status === 'uploading' ? { ...e, status: 'error', reason } : e)),
      );
      setSummary({ processed: 0, succeeded: 0, failed: queued.length, results: [] });
    } finally {
      setUploading(false);
    }
  }

  // ── Pull municipal debt ────────────────────────────────────────────────────
  async function handleDebtPull() {
    if (!debtPropertyId.trim()) return;
    setDebtLoading(true);
    setDebtResult(null);
    try {
      const res = await fetch('/api/nyc-debt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ property_id: debtPropertyId.trim() }),
      });
      const json: DebtResult = await res.json();
      setDebtResult(json);
    } catch (err) {
      setDebtResult({ inserted: 0, total_debt_usd: 0, bbl: '', error: String(err) });
    } finally {
      setDebtLoading(false);
    }
  }

  const queuedCount = entries.filter((e) => e.status === 'queued').length;
  const atLimit = entries.length >= MAX_FILES;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* ── Page header ───────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">Probate Lead — Document Ingestion</h1>
        <p className="mt-1 text-sm text-gray-500">
          Lead ID: <span className="font-mono text-gray-700">{leadId}</span>
        </p>
        <p className="mt-1 text-sm text-gray-500">
          Upload up to {MAX_FILES} probate PDF files. Gemini OCR will extract seller, executor, and
          property data and insert it into the database.
        </p>
      </div>

      {/* ── Drop zone ─────────────────────────────────────────────────────── */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Drop PDFs here or click to select files"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !atLimit && fileInputRef.current?.click()}
        onKeyDown={(e) => e.key === 'Enter' && !atLimit && fileInputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-12 transition-colors ${
          isDragging
            ? 'border-indigo-400 bg-indigo-50'
            : atLimit
              ? 'cursor-not-allowed border-gray-200 bg-gray-50 opacity-60'
              : 'border-gray-300 bg-white hover:border-indigo-400 hover:bg-indigo-50'
        }`}
      >
        <Upload
          className={`h-10 w-10 ${isDragging ? 'text-indigo-500' : 'text-gray-300'}`}
          aria-hidden="true"
        />
        <div className="text-center">
          <p className="text-sm font-medium text-gray-700">
            {atLimit ? `Maximum of ${MAX_FILES} files reached` : 'Drop PDFs here or click to browse'}
          </p>
          <p className="mt-0.5 text-xs text-gray-400">PDF only · up to {MAX_FILES} files per batch</p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          multiple
          className="sr-only"
          onChange={handleInputChange}
          disabled={atLimit || uploading}
          aria-hidden="true"
        />
      </div>

      {/* ── Summary banner ────────────────────────────────────────────────── */}
      {summary && (
        <div
          className={`flex items-start gap-3 rounded-lg px-4 py-3 text-sm ${
            summary.failed === 0
              ? 'bg-green-50 text-green-800'
              : summary.succeeded === 0
                ? 'bg-red-50 text-red-700'
                : 'bg-yellow-50 text-yellow-800'
          }`}
        >
          {summary.failed === 0 ? (
            <CheckCircle2 className="h-4 w-4 flex-shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          )}
          <span>
            Processed <strong>{summary.processed}</strong> file
            {summary.processed !== 1 ? 's' : ''} —{' '}
            <strong>{summary.succeeded}</strong> succeeded,{' '}
            <strong>{summary.failed}</strong> failed.
          </span>
        </div>
      )}

      {/* ── File queue ────────────────────────────────────────────────────── */}
      {entries.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
            <h2 className="text-sm font-semibold text-gray-900">
              Queue ({entries.length} / {MAX_FILES})
            </h2>
            {queuedCount > 0 && !uploading && (
              <button
                onClick={() => setEntries((prev) => prev.filter((e) => e.status !== 'queued'))}
                className="text-xs text-gray-400 hover:text-red-500"
              >
                Clear queued
              </button>
            )}
          </div>

          <ul className="max-h-80 divide-y divide-gray-100 overflow-y-auto">
            {entries.map((entry) => (
              <li key={entry.id} className="flex items-start gap-3 px-5 py-3">
                <FileStatusIcon status={entry.status} />
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-medium text-gray-800">{entry.file.name}</p>
                  <p className="text-xs text-gray-400">
                    {(entry.file.size / 1024).toFixed(1)} KB
                    {entry.status === 'ok' && entry.propertyId && (
                      <> · Property ID: <span className="font-mono">{entry.propertyId}</span></>
                    )}
                    {entry.status === 'error' && entry.reason && (
                      <> · <span className="text-red-500">{entry.reason}</span></>
                    )}
                  </p>
                </div>
                {entry.status === 'queued' && !uploading && (
                  <button
                    onClick={() => removeEntry(entry.id)}
                    className="flex-shrink-0 rounded p-0.5 text-gray-300 hover:text-red-400"
                    aria-label={`Remove ${entry.file.name}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Action bar ────────────────────────────────────────────────────── */}
      {entries.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-gray-400">
            {queuedCount > 0
              ? `${queuedCount} file${queuedCount !== 1 ? 's' : ''} ready to upload`
              : 'All files processed.'}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => {
                setEntries([]);
                setSummary(null);
              }}
              disabled={uploading}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Clear all
            </button>
            <button
              onClick={handleUpload}
              disabled={uploading || queuedCount === 0}
              className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50"
            >
              {uploading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Processing…
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  Run OCR ({queuedCount})
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ── Municipal Debt Pull ────────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <DollarSign className="h-5 w-5 text-indigo-600" />
          <h2 className="text-sm font-semibold text-gray-900">Municipal Debt Pull</h2>
        </div>
        <p className="mb-4 text-xs text-gray-500">
          Enter a Property ID (with a valid NYC BBL) to fetch outstanding tax liens
          and arrears from NYC Open Data and insert them into the financial ledger.
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={debtPropertyId}
            onChange={(e) => setDebtPropertyId(e.target.value)}
            placeholder="Property UUID"
            className="flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <button
            onClick={handleDebtPull}
            disabled={debtLoading || !debtPropertyId.trim()}
            className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50"
          >
            {debtLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <DollarSign className="h-4 w-4" />
            )}
            Pull Debt
          </button>
        </div>

        {debtResult && (
          <div
            className={`mt-3 rounded-md px-4 py-3 text-sm ${
              debtResult.error
                ? 'bg-red-50 text-red-700'
                : debtResult.inserted === 0
                  ? 'bg-yellow-50 text-yellow-800'
                  : 'bg-green-50 text-green-800'
            }`}
          >
            {debtResult.error ? (
              <span>{debtResult.error}</span>
            ) : debtResult.inserted === 0 ? (
              <span>{debtResult.message ?? 'No tax debt records found for this BBL.'}</span>
            ) : (
              <span>
                Inserted <strong>{debtResult.inserted}</strong> ledger row
                {debtResult.inserted !== 1 ? 's' : ''} · Total outstanding:{' '}
                <strong>
                  {new Intl.NumberFormat('en-US', {
                    style: 'currency',
                    currency: 'USD',
                    maximumFractionDigits: 0,
                  }).format(debtResult.total_debt_usd)}
                </strong>{' '}
                (BBL: <span className="font-mono">{debtResult.bbl}</span>)
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
