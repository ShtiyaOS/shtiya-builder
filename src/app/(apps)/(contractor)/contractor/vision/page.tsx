'use client';

import { useState } from 'react';
import { Eye } from 'lucide-react';
import { MilestoneUploader, type UploadedMilestone } from '@/components/apps/contractor/vision/MilestoneUploader';
import { InspectionResult } from '@/components/apps/contractor/vision/InspectionResult';
import { usePageContext } from '@/hooks/usePageContext';

/**
 * Vision AI Sandbox (T5.3) — the hands-on demo page: upload a milestone
 * photo/video, watch Gemini Vision inspect it, and see the escrow draw gate
 * it produces. See `<!-- SECURITY NOTE -->` in
 * `src/app/api/milestone-upload/route.ts` and `src/lib/gemini/vision.ts`
 * for the prompt-injection hardening this page's uploads run through.
 */
export default function ContractorVisionPage() {
  usePageContext(
    'Vision AI Sandbox — milestone photo upload with real-time Gemini inspection analysis and escrow draw gate',
  );

  const [lastUpload, setLastUpload] = useState<UploadedMilestone | null>(null);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <Eye className="h-6 w-6 text-indigo-600" />
        <div>
          <h1 className="text-xl font-bold text-gray-900">Vision AI Sandbox</h1>
          <p className="text-sm text-gray-500">
            Upload a milestone photo or video for an automated AI site inspection.
          </p>
        </div>
      </div>

      {/* ── Uploader ─────────────────────────────────────────────────────── */}
      <MilestoneUploader onUploaded={setLastUpload} />

      {/* ── Result ───────────────────────────────────────────────────────── */}
      {lastUpload && (
        <div className="space-y-2">
          <p className="font-mono text-xs text-gray-400">
            document {lastUpload.documentId.slice(0, 8)}…
            {lastUpload.inspectionId && ` · inspection ${lastUpload.inspectionId.slice(0, 8)}…`}
          </p>
          <InspectionResult inspectionId={lastUpload.inspectionId} />
        </div>
      )}
    </div>
  );
}
