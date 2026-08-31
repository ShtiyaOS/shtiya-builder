'use client';

import { useRef, useState } from 'react';
import { AlertTriangle, Film, Image as ImageIcon, Loader2, Upload } from 'lucide-react';

const ACCEPTED = 'image/*,video/*';
const MAX_FILE_BYTES = 500 * 1024 * 1024; // 500 MB — mirrors the server-side limit

export interface UploadedMilestone {
  documentId: string;
  inspectionId: string | null;
  mediaType: 'photo' | 'video';
  publicUrl: string | null;
}

interface MilestoneUploaderProps {
  onUploaded: (result: UploadedMilestone) => void;
}

/**
 * MilestoneUploader
 *
 * Drag-and-drop / click-to-browse uploader for the Vision AI Sandbox.
 * Restricted to image/* and video/* at the input level (and re-validated
 * server-side in POST /api/milestone-upload). Uses XMLHttpRequest instead of
 * fetch so upload progress can be tracked and shown as a progress bar —
 * fetch's request-body streaming progress isn't reliably available across
 * browsers yet.
 */
export function MilestoneUploader({ onUploaded }: MilestoneUploaderProps) {
  const [propertyId, setPropertyId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function pickFile(files: FileList | File[]) {
    const picked = Array.from(files)[0];
    if (!picked) return;
    if (!picked.type.startsWith('image/') && !picked.type.startsWith('video/')) {
      setError('Only image or video files are accepted.');
      return;
    }
    setError(null);
    setFile(picked);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length) pickFile(e.dataTransfer.files);
  }

  function handleUpload() {
    if (!file) return;
    if (!propertyId.trim()) {
      setError('Enter a Property ID before uploading.');
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError('File exceeds 500 MB limit.');
      return;
    }

    setError(null);
    setUploading(true);
    setProgress(0);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('property_id', propertyId.trim());

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/milestone-upload');

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
    };

    xhr.onload = () => {
      setUploading(false);
      let json: Record<string, unknown> = {};
      try {
        json = JSON.parse(xhr.responseText);
      } catch {
        // fall through to the generic error below
      }
      if (xhr.status < 200 || xhr.status >= 300) {
        setError(typeof json.error === 'string' ? json.error : 'Upload failed.');
        return;
      }
      onUploaded({
        documentId: json.document_id as string,
        inspectionId: (json.inspection_id as string | null) ?? null,
        mediaType: json.media_type as 'photo' | 'video',
        publicUrl: (json.public_url as string | null) ?? null,
      });
      setFile(null);
      setProgress(0);
    };

    xhr.onerror = () => {
      setUploading(false);
      setError('Network error during upload.');
    };

    xhr.send(formData);
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-4">
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Property ID</label>
        <input
          value={propertyId}
          onChange={(e) => setPropertyId(e.target.value)}
          placeholder="UUID"
          disabled={uploading}
          className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-gray-50"
        />
      </div>

      <div
        role="button"
        tabIndex={0}
        aria-label="Drop a milestone photo or video here, or click to select"
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragging(false); }}
        onDrop={handleDrop}
        onClick={() => !uploading && inputRef.current?.click()}
        onKeyDown={(e) => e.key === 'Enter' && !uploading && inputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed py-10 transition-colors ${
          isDragging ? 'border-indigo-400 bg-indigo-50' : 'border-gray-300 bg-white hover:border-indigo-400 hover:bg-indigo-50'
        } ${uploading ? 'pointer-events-none opacity-60' : ''}`}
      >
        {file ? (
          file.type.startsWith('video/') ? (
            <Film className="h-9 w-9 text-indigo-400" />
          ) : (
            <ImageIcon className="h-9 w-9 text-blue-400" />
          )
        ) : (
          <Upload className={`h-9 w-9 ${isDragging ? 'text-indigo-500' : 'text-gray-300'}`} />
        )}
        <p className="text-sm font-medium text-gray-600">
          {file ? file.name : 'Drop a photo / video or click to browse'}
        </p>
        <p className="text-xs text-gray-400">image/* · video/* · up to 500 MB</p>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED}
          className="sr-only"
          onChange={(e) => { if (e.target.files?.length) pickFile(e.target.files); e.target.value = ''; }}
        />
      </div>

      {uploading && (
        <div className="space-y-1">
          <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full bg-indigo-500 transition-all duration-150"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-gray-400">Uploading… {progress}%</p>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />{error}
        </div>
      )}

      <div className="flex justify-end">
        <button
          onClick={handleUpload}
          disabled={!file || uploading}
          className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50"
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          Upload & Inspect
        </button>
      </div>
    </div>
  );
}
