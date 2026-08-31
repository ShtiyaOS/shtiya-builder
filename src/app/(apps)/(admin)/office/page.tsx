import Link from 'next/link';
import { Download } from 'lucide-react';
import { PageContext } from '@/components/layout/PageContext';
import { createAdminClient } from '@/lib/supabase/admin';
import { AgentCommandCenter } from '@/components/apps/office/AgentCommandCenter';
import type {
  ComplianceCheckRow,
  DealRoomEventRow,
  MatchedLeadRow,
  ViolationRow,
  VisionInspectionRow,
} from '@/components/apps/office/types';

const PANEL_ROW_LIMIT = 50;
const COMPLIANCE_ROW_LIMIT = 200;
const EVENTS_ROW_LIMIT = 100;

/**
 * Decodes a `documents` lead row's `bucket_path` — leads are stored as
 * `meta:<base64 JSON>` (see POST /api/leads) rather than a dedicated table.
 * Returns null for anything that isn't the expected shape so a malformed or
 * unrelated `documents` row never throws during the page render.
 */
function decodeLeadPayload(bucketPath: string): {
  name?: string;
  email?: string;
  description?: string;
  source?: string;
  submitted_at?: string;
  match_score?: number | null;
} | null {
  if (!bucketPath.startsWith('meta:')) return null;
  try {
    return JSON.parse(Buffer.from(bucketPath.slice(5), 'base64').toString('utf-8'));
  } catch {
    return null;
  }
}

/**
 * Agent Observability Command Center (T5.2).
 *
 * Pre-fetches the latest rows from all 5 agents' tables via the service-role
 * client — appropriate here because `(admin)/layout.tsx` has already gated
 * this route to admins only, so there's no per-caller RLS boundary left to
 * respect; a single unscoped fetch avoids 5 separate RLS-scoped round trips.
 */
export default async function OfficePage() {
  const admin = createAdminClient();

  const [violationsRes, inspectionsRes, complianceRes, eventsRes, leadsRes] = await Promise.all([
    admin
      .from('violations')
      .select('id, property_id, source, external_id, description, issued_date, status, created_at, properties(address)')
      .order('created_at', { ascending: false })
      .limit(PANEL_ROW_LIMIT),
    admin
      .from('vision_inspections')
      .select(
        'id, document_id, property_id, contractor_id, ai_summary, flagged_issues, confidence, blocks_draw, created_at, users(full_name, email), properties(address)',
      )
      .order('created_at', { ascending: false })
      .limit(PANEL_ROW_LIMIT),
    admin
      .from('compliance_checks')
      .select(
        'id, contractor_id, license_number, insurance_policy_number, expiration_date, status, last_verified_at, source, users(full_name, email)',
      )
      .order('status', { ascending: false })
      .order('expiration_date', { ascending: true })
      .limit(COMPLIANCE_ROW_LIMIT),
    admin
      .from('deal_room_events')
      .select('id, block_committee_id, financial_ledger_id, event_type, payload, created_at, block_committees(name)')
      .order('created_at', { ascending: false })
      .limit(EVENTS_ROW_LIMIT),
    admin
      .from('documents')
      .select('id, property_id, bucket_path, created_at, properties(address)')
      .eq('type', 'lead')
      .order('created_at', { ascending: false })
      .limit(PANEL_ROW_LIMIT),
  ]);

  const violations: ViolationRow[] = (violationsRes.data ?? []).map((r) => {
    const property = r.properties as { address?: string } | null;
    return {
      id: r.id,
      property_id: r.property_id,
      property_address: property?.address ?? null,
      source: r.source,
      external_id: r.external_id,
      description: r.description,
      issued_date: r.issued_date,
      status: r.status,
      created_at: r.created_at,
    };
  });

  const inspections: VisionInspectionRow[] = (inspectionsRes.data ?? []).map((r) => {
    const contractor = r.users as { full_name?: string; email?: string } | null;
    const property = r.properties as { address?: string } | null;
    return {
      id: r.id,
      document_id: r.document_id,
      property_id: r.property_id,
      property_address: property?.address ?? null,
      contractor_id: r.contractor_id,
      contractor_name:
        contractor?.full_name ?? contractor?.email ?? (r.contractor_id ? `Contractor ${(r.contractor_id as string).slice(0, 8)}` : 'Unknown'),
      ai_summary: r.ai_summary,
      flagged_issues: Array.isArray(r.flagged_issues) ? r.flagged_issues : [],
      confidence: r.confidence,
      blocks_draw: r.blocks_draw,
      created_at: r.created_at,
    };
  });

  const compliance: ComplianceCheckRow[] = (complianceRes.data ?? []).map((r) => {
    const contractor = r.users as { full_name?: string; email?: string } | null;
    return {
      id: r.id,
      contractor_id: r.contractor_id,
      contractor_name:
        contractor?.full_name ?? contractor?.email ?? (r.contractor_id ? `Contractor ${(r.contractor_id as string).slice(0, 8)}` : 'Unknown'),
      license_number: r.license_number,
      insurance_policy_number: r.insurance_policy_number,
      expiration_date: r.expiration_date,
      status: r.status,
      last_verified_at: r.last_verified_at,
      source: r.source,
    };
  });

  const events: DealRoomEventRow[] = (eventsRes.data ?? []).map((r) => {
    const committee = r.block_committees as { name?: string } | null;
    return {
      id: r.id,
      block_committee_id: r.block_committee_id,
      committee_name: committee?.name ?? null,
      financial_ledger_id: r.financial_ledger_id,
      event_type: r.event_type,
      payload: r.payload ?? {},
      created_at: r.created_at,
    };
  });

  const leads: MatchedLeadRow[] = (leadsRes.data ?? [])
    .map((r) => {
      const meta = decodeLeadPayload(r.bucket_path);
      if (!meta) return null;
      const property = r.properties as { address?: string } | null;
      return {
        id: r.id,
        name: meta.name ?? 'Unknown',
        email: meta.email ?? '—',
        description: meta.description ?? '',
        source: meta.source ?? 'direct',
        submitted_at: meta.submitted_at ?? r.created_at,
        related_property_id: r.property_id,
        related_property_address: property?.address ?? null,
        match_score: meta.match_score ?? null,
        created_at: r.created_at,
      } satisfies MatchedLeadRow;
    })
    .filter((l): l is MatchedLeadRow => l !== null);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageContext description="Agent Command Center — live feeds: Watchdog violations, Vision inspection queue, Sentinel compliance checks, Pulse deal-room events, Match lead-routing" />

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Shtiya Office</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Agent Observability Command Center · Bookkeeping · Payroll ledger export
          </p>
        </div>
        <Link
          href="/api/ledger-export"
          target="_blank"
          className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 shadow-sm"
        >
          <Download className="h-4 w-4" /> Export Ledger CSV
        </Link>
      </div>

      <AgentCommandCenter
        initialViolations={violations}
        initialInspections={inspections}
        initialCompliance={compliance}
        initialEvents={events}
        initialLeads={leads}
      />
    </div>
  );
}
