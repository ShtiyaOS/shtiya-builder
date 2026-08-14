'use client';

import { useRef, useState } from 'react';
import { Upload, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

const ALLOWED = '.dwg,.rvt,.ifc,.pdf';
const MAX_MB = 500;

interface CadUploadFormProps {
  propertyId: string;
}

export function CadUploadForm({ propertyId }: CadUploadFormProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ document_id: string; public_url: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setResult(null);
    setError(null);
  }

  async function handleUpload() {
    if (!file) return;
    if (file.size > MAX_MB * 1024 * 1024) {
      setError(`File exceeds ${MAX_MB} MB limit.`);
      return;
    }

    setUploading(true);
    setError(null);
    setResult(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('property_id', propertyId);

    try {
      const res = await fetch('/api/cad-upload', { method: 'POST', body: formData });
      const json = await res.json() as { document_id?: string; public_url?: string | null; error?: string };
      if (!res.ok) {
        setError(json.error ?? 'Upload failed.');
      } else {
        setResult({ document_id: json.document_id!, public_url: json.public_url ?? null });
        setFile(null);
        if (inputRef.current) inputRef.current.value = '';
      }
    } catch {
      setError('Network error — please try again.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-64">
          <label className="block text-xs font-medium text-gray-600 mb-1">
            File <span className="text-gray-400">(.dwg, .rvt, .ifc, .pdf — max {MAX_MB} MB)</span>
          </label>
          <input
            ref={inputRef}
            type="file"
            accept={ALLOWED}
            onChange={handleFileChange}
            className="block w-full text-sm text-gray-700 file:mr-3 file:rounded file:border-0 file:bg-indigo-50 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-indigo-700 hover:file:bg-indigo-100"
          />
        </div>
        <button
          onClick={handleUpload}
          disabled={!file || uploading}
          className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          {uploading ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Uploading…</>
          ) : (
            <><Upload className="h-4 w-4" /> Upload</>
          )}
        </button>
      </div>

      {result && (
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-800">
          <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
          File vaulted successfully. Document ID: <span className="font-mono">{result.document_id}</span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          <AlertCircle className="h-4 w-4 flex-shrink-0" /> {error}
        </div>
      )}
    </div>
  );
}
