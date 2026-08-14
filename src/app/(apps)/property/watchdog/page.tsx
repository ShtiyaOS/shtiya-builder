import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { ShieldAlert, ArrowLeft } from 'lucide-react';
import {
  WatchdogClient,
  type Violation,
} from '@/components/apps/acquisition/WatchdogClient';

// ── Mock data (dev fallback) ──────────────────────────────────────────────────
const MOCK_VIOLATIONS: Violation[] = [
  {
    id: 'v-prop-1',
    property_id: 'prop-1',
    source: 'HPD',
    external_id: 'HPD-905442',
    description: 'Lack of heat — no heat or hot water supplied to apartments.',
    issued_date: '2024-10-18',
    status: 'open',
    address: '123 Lenox Ave, Harlem, NY 10026',
  },
  {
    id: 'v-prop-2',
    property_id: 'prop-1',
    source: 'DOB',
    external_id: 'DOB-2024-001234',
    description: 'Failure to maintain — exterior wall deterioration on 3rd floor.',
    issued_date: '2024-11-05',
    status: 'open',
    address: '123 Lenox Ave, Harlem, NY 10026',
  },
];

// ── Page ──────────────────────────────────────────────────────────────────────
export default async function PropertyWatchdogPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let violations: Violation[] = MOCK_VIOLATIONS;

  if (user) {
    // Fetch properties owned by the current user (owner/property_manager role).
    const { data: ownedProps } = await supabase
      .from('properties')
      .select('id, address')
      .eq('owner_id', user.id);

    const ownedIds = (ownedProps ?? []).map((p) => p.id);
    const addrMap: Record<string, string> = {};
    (ownedProps ?? []).forEach((p) => { addrMap[p.id] = p.address; });

    if (ownedIds.length > 0) {
      // RLS on violations already enforces visibility — owner filter here is
      // an additional, explicit restriction to show only the landlord's own portfolio.
      const { data: rows } = await supabase
        .from('violations')
        .select('id, property_id, source, external_id, description, issued_date, status')
        .in('property_id', ownedIds)
        .eq('status', 'open')
        .order('issued_date', { ascending: false })
        .limit(200);

      if (rows && rows.length > 0) {
        violations = rows.map((r) => ({
          id: r.id,
          property_id: r.property_id,
          source: r.source as Violation['source'],
          external_id: r.external_id,
          description: r.description ?? null,
          issued_date: r.issued_date ?? null,
          status: r.status ?? 'open',
          address: addrMap[r.property_id] ?? undefined,
        }));
      } else if (rows) {
        violations = [];
      }
    }
  }

  const openCount = violations.filter((v) => v.status === 'open').length;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link href="/property" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-indigo-600">
        <ArrowLeft className="h-4 w-4" /> Back to Property Portal
      </Link>

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <ShieldAlert className="h-6 w-6 text-red-500" />
          <div>
            <h1 className="text-xl font-bold text-gray-900">Portfolio Violation Watch</h1>
            <p className="mt-0.5 text-sm text-gray-500">
              Open NYC agency violations across your managed properties. Updated daily by the Watchdog poller.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 text-xs font-medium">
          <span className="rounded-full bg-red-50 px-3 py-1 text-red-700">
            {openCount} open violation{openCount !== 1 ? 's' : ''}
          </span>
          <span className="rounded-full bg-gray-100 px-3 py-1 text-gray-600">
            {violations.length} total
          </span>
        </div>
      </div>

      {/* ── Reuses WatchdogClient from T2.8 ──────────────────────────────── */}
      <WatchdogClient violations={violations} />
    </div>
  );
}
