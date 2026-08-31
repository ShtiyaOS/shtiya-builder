import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { ShieldCheck, ShieldAlert, Eye, AlertTriangle, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';

// ── Mock data (dev fallback) ──────────────────────────────────────────────────
const MOCK_INSPECTION = {
  id: 'insp-mock-1',
  document_id: 'doc-mock-1',
  property_id: 'prop-mock-1',
  ai_summary:
    'The uploaded photo shows completed framing work on the second floor. Lumber appears properly nailed and braced. No visible safety hazards detected. Work aligns with the approved scope of work.',
  flagged_issues: [] as { issue: string; severity: string }[],
  confidence: 0.92,
  blocks_draw: false,
  created_at: new Date().toISOString(),
};

const MOCK_BLOCKED_INSPECTION = {
  id: 'insp-mock-2',
  document_id: 'doc-mock-2',
  property_id: 'prop-mock-1',
  ai_summary:
    'The video shows structural modifications that deviate from the approved scope. Missing safety harness visible on worker at height. Exposed electrical wiring near moisture-prone area detected.',
  flagged_issues: [
    { issue: 'Worker at height without harness — OSHA violation', severity: 'critical' },
    { issue: 'Exposed electrical wiring near potential moisture source', severity: 'high' },
    { issue: 'Structural modification appears to deviate from approved plans', severity: 'medium' },
  ],
  confidence: 0.87,
  blocks_draw: true,
  created_at: new Date().toISOString(),
};

// ── Severity badge ────────────────────────────────────────────────────────────
function SeverityBadge({ severity }: { severity: string }) {
  const styles: Record<string, string> = {
    low:      'bg-blue-50 text-blue-700',
    medium:   'bg-yellow-50 text-yellow-800',
    high:     'bg-orange-50 text-orange-800',
    critical: 'bg-red-100 text-red-800',
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${styles[severity] ?? 'bg-gray-100 text-gray-600'}`}>
      {severity}
    </span>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * Per-inspection report viewer — the target of the "View report" link from
 * `POST /api/escrow/release`'s result (`escrow/vision/page.tsx`) and any
 * other place that needs to show one `vision_inspections` row by id. Kept
 * separate from `contractor/vision/page.tsx` (T5.3's upload sandbox, which
 * shows the result of *your own just-completed* upload) — this route is the
 * durable, linkable, RLS-scoped view of any inspection you're allowed to see.
 */
export default async function VisionInspectionPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Use mock data in dev; real inspection when DB is live.
  type Inspection = typeof MOCK_INSPECTION & { flagged_issues: { issue: string; severity: string }[] };
  let inspection: Inspection | null = null;

  if (user) {
    const { data } = await supabase
      .from('vision_inspections')
      .select('*')
      .eq('id', id)
      .single();
    if (data) {
      inspection = data as Inspection;
    } else if (id !== 'mock-1' && id !== 'mock-2') {
      notFound();
    }
  }

  // Dev fallback
  if (!inspection) {
    inspection = (id === 'mock-2' ? MOCK_BLOCKED_INSPECTION : MOCK_INSPECTION) as Inspection;
  }

  const blocksDrawColor = inspection.blocks_draw
    ? 'border-red-200 bg-red-50'
    : 'border-green-200 bg-green-50';

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <Eye className="h-6 w-6 text-indigo-600" />
        <div>
          <h1 className="text-xl font-bold text-gray-900">Vision Inspection Report</h1>
          <p className="text-xs font-mono text-gray-400">ID: {inspection.id}</p>
        </div>
      </div>

      {/* ── Draw gate banner ─────────────────────────────────────────────── */}
      <div className={`flex items-start gap-3 rounded-xl border p-4 ${blocksDrawColor}`}>
        {inspection.blocks_draw ? (
          <ShieldAlert className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
        ) : (
          <ShieldCheck className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
        )}
        <div>
          <p className={`text-sm font-semibold ${inspection.blocks_draw ? 'text-red-800' : 'text-green-800'}`}>
            {inspection.blocks_draw
              ? 'Draw Release BLOCKED — critical or high-severity issues detected.'
              : 'Draw Release APPROVED — no blocking issues found.'}
          </p>
          <p className="mt-0.5 text-xs text-gray-500">
            AI confidence: {(inspection.confidence * 100).toFixed(0)}%
          </p>
        </div>
      </div>

      {/* ── AI summary ───────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-2 text-sm font-semibold text-gray-900">AI Summary</h2>
        <p className="text-sm text-gray-700 leading-relaxed">{inspection.ai_summary}</p>
      </div>

      {/* ── Flagged issues ───────────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-5 py-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">Flagged Issues</h2>
          <span className="text-xs text-gray-400">{inspection.flagged_issues.length} found</span>
        </div>
        {inspection.flagged_issues.length === 0 ? (
          <div className="flex items-center gap-2 px-5 py-6 text-sm text-green-700">
            <CheckCircle2 className="h-4 w-4" /> No issues detected.
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {inspection.flagged_issues.map((issue, i) => (
              <li key={i} className="flex items-start gap-3 px-5 py-4">
                <AlertTriangle className={`h-4 w-4 flex-shrink-0 mt-0.5 ${
                  issue.severity === 'critical' || issue.severity === 'high'
                    ? 'text-red-500'
                    : 'text-yellow-500'
                }`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-800">{issue.issue}</p>
                </div>
                <SeverityBadge severity={issue.severity} />
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── Back link ────────────────────────────────────────────────────── */}
      <Link href="/contractor" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-indigo-600">
        ← Back to milestone uploads
      </Link>
    </div>
  );
}
