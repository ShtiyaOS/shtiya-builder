import { createClient } from '@/lib/supabase/server';
import { ShieldAlert } from 'lucide-react';
import {
  WatchdogClient,
  type Violation,
} from '@/components/apps/acquisition/WatchdogClient';

// ── Mock data — used in dev before the Watchdog poller has run ────────────────
const MOCK_VIOLATIONS: Violation[] = [
  {
    id: 'v1',
    property_id: 'prop-1',
    source: 'DOB',
    external_id: 'DOB-2024-001234',
    description: 'Failure to maintain — exterior wall deterioration observed on 3rd floor.',
    issued_date: '2024-11-05',
    status: 'open',
    address: '123 Lenox Ave, New York, NY 10026',
  },
  {
    id: 'v2',
    property_id: 'prop-2',
    source: 'HPD',
    external_id: 'HPD-905442',
    description: 'Lack of heat — no heat or hot water supplied to apartments.',
    issued_date: '2024-10-18',
    status: 'open',
    address: '456 Adam Clayton Powell Jr Blvd, NY 10027',
  },
  {
    id: 'v3',
    property_id: 'prop-1',
    source: 'ECB',
    external_id: 'ECB-35011882Y',
    description: 'Work without permit — illegal construction on 2nd floor rear.',
    issued_date: '2024-09-30',
    status: 'open',
    address: '123 Lenox Ave, New York, NY 10026',
  },
  {
    id: 'v4',
    property_id: 'prop-3',
    source: '311',
    external_id: '311-20241102-001',
    description: 'Noise complaint — construction noise outside permitted hours.',
    issued_date: '2024-11-02',
    status: 'open',
    address: '789 Malcolm X Blvd, New York, NY 10037',
  },
  {
    id: 'v5',
    property_id: 'prop-2',
    source: 'HPD',
    external_id: 'HPD-899001',
    description: 'Infestation of mice — rodent activity in basement and first floor.',
    issued_date: '2024-08-14',
    status: 'closed',
    address: '456 Adam Clayton Powell Jr Blvd, NY 10027',
  },
];

// ── Page ──────────────────────────────────────────────────────────────────────
export default async function WatchdogPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let violations: Violation[] = MOCK_VIOLATIONS;

  if (user) {
    // RLS on the violations table restricts results to properties the current
    // user has visibility into (owner_id = auth.uid() or role in ('investor','admin')).
    // No additional filter is needed here — the DB enforces the boundary.
    const { data: rows } = await supabase
      .from('violations')
      .select(
        `
        id,
        property_id,
        source,
        external_id,
        description,
        issued_date,
        status,
        properties ( address )
        `,
      )
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
        address: (r.properties as { address?: string } | null)?.address,
      }));
    }
  }

  const openCount = violations.filter((v) => v.status === 'open').length;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* ── Page header ───────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <ShieldAlert className="h-6 w-6 text-red-500" />
          <div>
            <h1 className="text-xl font-bold text-gray-900">Watchdog — Violation Alerts</h1>
            <p className="mt-0.5 text-sm text-gray-500">
              Open NYC agency violations across your tracked properties.
              Updated daily by the Watchdog poller.
            </p>
          </div>
        </div>

        {/* Summary chips */}
        <div className="flex flex-wrap gap-2 text-xs font-medium">
          <span className="rounded-full bg-red-50 px-3 py-1 text-red-700">
            {openCount} open violation{openCount !== 1 ? 's' : ''}
          </span>
          <span className="rounded-full bg-gray-100 px-3 py-1 text-gray-600">
            {violations.length} total
          </span>
        </div>
      </div>

      {/* ── Client island: filter + list ──────────────────────────────────── */}
      <WatchdogClient violations={violations} />
    </div>
  );
}
