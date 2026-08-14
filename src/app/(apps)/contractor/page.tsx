'use client';

import { useCallback, useRef, useState } from 'react';
import { Upload, Film, Image as ImageIcon, Loader2, CheckCircle2, X, AlertTriangle } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────
interface UploadEntry {
  id: string;
  file: File;
  status: 'queued' | 'uploading' | 'ok' | 'error';
  documentId?: string;
  publicUrl?: string;
  reason?: string;
}

const MAX_FILE_BYTES = 500 * 1024 * 1024; // 500 MB
const ACCEPTED = 'image/*,video/*';

function mediaIcon(file: File) {
  return file.type.startsWith('video/')
    ? <Film className="h-4 w-4 flex-shrink-0 text-indigo-400" />
    : <ImageIcon className="h-4 w-4 flex-shrink-0 text-blue-400" />;
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function ContractorPage() {
  const [propertyId, setPropertyId] = useState('');
  const [entries, setEntries] = useState<UploadEntry[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((files: FileList | File[]) => {
    const valid = Array.from(files).filter(
      (f) => f.type.startsWith('image/') || f.type.startsWith('video/'),
    );
    setEntries((prev) => [
      ...prev,
      ...valid.map((file): UploadEntry => ({
        id: crypto.randomUUID(),
        file,
        status: 'queued',
      })),
    ]);
  }, []);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  }

  async function handleUpload() {
    if (!propertyId.trim()) { setError('Enter a Property ID before uploading.'); return; }
    const queued = entries.filter((e) => e.status === 'queued');
    if (!queued.length) return;
    setUploading(true);
    setError(null);

    setEntries((prev) => prev.map((e) =>
      e.status === 'queued' ? { ...e, status: 'uploading' } : e,
    ));

    for (const entry of queued) {
      if (entry.file.size > MAX_FILE_BYTES) {
        setEntries((prev) => prev.map((e) =>
          e.id === entry.id
            ? { ...e, status: 'error', reason: 'Exceeds 500 MB limit.' }
            : e,
        ));
        continue;
      }

      const fd = new FormData();
      fd.append('file', entry.file);
      fd.append('property_id', propertyId.trim());

      try {
        const res = await fetch('/api/milestone-upload', { method: 'POST', body: fd });
        const json = await res.json();
        if (!res.ok) {
          setEntries((prev) => prev.map((e) =>
            e.id === entry.id ? { ...e, status: 'error', reason: json.error ?? 'Upload failed.' } : e,
          ));
        } else {
          setEntries((prev) => prev.map((e) =>
            e.id === entry.id
              ? { ...e, status: 'ok', documentId: json.document_id, publicUrl: json.public_url }
              : e,
          ));
        }
      } catch {
        setEntries((prev) => prev.map((e) =>
          e.id === entry.id ? { ...e, status: 'error', reason: 'Network error.' } : e,
        ));
      }
    }
    setUploading(false);
  }

  const queuedCount = entries.filter((e) => e.status === 'queued').length;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">Milestone Photo / Video Upload</h1>
        <p className="mt-1 text-sm text-gray-500">
          Upload milestone photos or videos (≤ 500 MB each). Each file is stored in
          Supabase Storage and logged in the documents table.
        </p>
      </div>

      {/* ── Property ID + drop zone ──────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Property ID</label>
          <input
            value={propertyId}
            onChange={(e) => setPropertyId(e.target.value)}
            placeholder="UUID"
            className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        <div
          role="button"
          tabIndex={0}
          aria-label="Drop images or videos here or click to select"
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragging(false); }}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed py-10 transition-colors ${
            isDragging ? 'border-indigo-400 bg-indigo-50' : 'border-gray-300 bg-white hover:border-indigo-400 hover:bg-indigo-50'
          }`}
        >
          <Upload className={`h-9 w-9 ${isDragging ? 'text-indigo-500' : 'text-gray-300'}`} />
          <p className="text-sm font-medium text-gray-600">
            Drop photos / videos or click to browse
          </p>
          <p className="text-xs text-gray-400">image/* · video/* · up to 500 MB per file</p>
          <input ref={inputRef} type="file" accept={ACCEPTED} multiple className="sr-only"
            onChange={(e) => { if (e.target.files?.length) addFiles(e.target.files); e.target.value = ''; }} />
        </div>
      </div>

      {/* ── Error ─────────────────────────────────────────────────────────── */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />{error}
        </div>
      )}

      {/* ── Queue ─────────────────────────────────────────────────────────── */}
      {entries.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
            <h2 className="text-sm font-semibold text-gray-900">Upload Queue ({entries.length})</h2>
            {!uploading && (
              <button onClick={() => setEntries([])} className="text-xs text-gray-400 hover:text-red-500">
                Clear all
              </button>
            )}
          </div>
          <ul className="max-h-72 divide-y divide-gray-100 overflow-y-auto">
            {entries.map((entry) => (
              <li key={entry.id} className="flex items-center gap-3 px-5 py-3">
                {entry.status === 'ok' ? (
                  <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                ) : entry.status === 'error' ? (
                  <AlertTriangle className="h-4 w-4 text-red-500 flex-shrink-0" />
                ) : entry.status === 'uploading' ? (
                  <Loader2 className="h-4 w-4 text-indigo-500 animate-spin flex-shrink-0" />
                ) : (
                  mediaIcon(entry.file)
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{entry.file.name}</p>
                  <p className="text-xs text-gray-400">
                    {(entry.file.size / 1024 / 1024).toFixed(1)} MB
                    {entry.status === 'error' && entry.reason && (
                      <> · <span className="text-red-500">{entry.reason}</span></>
                    )}
                    {entry.status === 'ok' && entry.documentId && (
                      <> · doc <span className="font-mono">{entry.documentId.slice(0, 8)}</span></>
                    )}
                  </p>
                </div>
                {entry.status === 'queued' && !uploading && (
                  <button onClick={() => setEntries((prev) => prev.filter((e) => e.id !== entry.id))}
                    className="text-gray-300 hover:text-red-400">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Upload button ─────────────────────────────────────────────────── */}
      {entries.length > 0 && (
        <div className="flex justify-end">
          <button
            onClick={handleUpload}
            disabled={uploading || queuedCount === 0}
            className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Upload {queuedCount > 0 ? `(${queuedCount})` : ''}
          </button>
        </div>
      )}
    </div>
  );
}
