import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { Building2, Wrench, DollarSign, PlusCircle } from 'lucide-react';

// ── Mock data (dev fallback) ──────────────────────────────────────────────────
const MOCK_PROPERTIES = [
  {
    id: 'prop-1',
    address: '123 Lenox Ave, Harlem, NY 10026',
    rent_status: 'current',
    open_tickets: 1,
  },
  {
    id: 'prop-2',
    address: '456 Malcolm X Blvd, NY 10037',
    rent_status: 'overdue',
    open_tickets: 0,
  },
];

const MOCK_LEDGER = [
  {
    id: 'led-rent-1',
    property_id: 'prop-1',
    address: '123 Lenox Ave, Harlem, NY 10026',
    type: 'rent_payment',
    amount: 2800,
    status: 'released',
    created_at: new Date(Date.now() - 5 * 86400 * 1000).toISOString(),
  },
  {
    id: 'led-rent-2',
    property_id: 'prop-2',
    address: '456 Malcolm X Blvd, NY 10037',
    type: 'rent_payment',
    amount: 3200,
    status: 'pending',
    created_at: new Date(Date.now() - 35 * 86400 * 1000).toISOString(),
  },
];

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

const STATUS_STYLE: Record<string, string> = {
  released: 'bg-green-100 text-green-800',
  pending:  'bg-yellow-100 text-yellow-800',
  held:     'bg-blue-100 text-blue-800',
  disputed: 'bg-red-100 text-red-800',
};

export default async function PropertyPortalPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  type PropRow = (typeof MOCK_PROPERTIES)[number];
  type LedgerRow = (typeof MOCK_LEDGER)[number];

  let properties: PropRow[] = MOCK_PROPERTIES;
  let ledger: LedgerRow[] = MOCK_LEDGER;

  if (user) {
    // Properties the user can see via RLS (owner_id, agreement parties, admin)
    const { data: props } = await supabase
      .from('properties')
      .select('id, address')
      .order('created_at', { ascending: false })
      .limit(50);

    if (props && props.length > 0) {
      const propIds = props.map((p) => p.id);

      // Open maintenance tickets (scope_draft documents linked to these properties)
      const { data: tickets } = await supabase
        .from('documents')
        .select('property_id')
        .in('property_id', propIds)
        .eq('type', 'maintenance_ticket');

      const ticketCount: Record<string, number> = {};
      (tickets ?? []).forEach((t) => {
        const pid = t.property_id as string;
        ticketCount[pid] = (ticketCount[pid] ?? 0) + 1;
      });

      properties = props.map((p) => ({
        id: p.id,
        address: p.address,
        rent_status: 'current',
        open_tickets: ticketCount[p.id] ?? 0,
      }));

      // Recent rent payment ledger entries
      const { data: ledgerRows } = await supabase
        .from('financial_ledgers')
        .select('id, property_id, type, amount, status, created_at, properties ( address )')
        .in('property_id', propIds)
        .eq('type', 'rent_payment')
        .order('created_at', { ascending: false })
        .limit(20);

      if (ledgerRows && ledgerRows.length > 0) {
        ledger = ledgerRows.map((r) => ({
          id: r.id,
          property_id: r.property_id,
          address: (r.properties as { address?: string } | null)?.address ?? '',
          type: r.type,
          amount: r.amount,
          status: r.status,
          created_at: r.created_at,
        }));
      }
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Shtiya Property</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Landlord &amp; tenant portal — maintenance, rent ledger, and violation watch
          </p>
        </div>
        <Link
          href="/property/watchdog"
          className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100"
        >
          <Building2 className="h-4 w-4" /> Watchdog Alerts
        </Link>
      </div>

      {/* ── Property cards ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {properties.map((prop) => (
          <div key={prop.id} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-gray-800">{prop.address}</p>
                <p className="font-mono text-xs text-gray-400">{prop.id}</p>
              </div>
              <span className={`flex-shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${
                prop.rent_status === 'overdue'
                  ? 'bg-red-100 text-red-700'
                  : 'bg-green-100 text-green-700'
              }`}>
                Rent {prop.rent_status}
              </span>
            </div>

            <div className="flex items-center gap-4 text-xs text-gray-500">
              <span className="flex items-center gap-1">
                <Wrench className="h-3.5 w-3.5" />
                {prop.open_tickets} open ticket{prop.open_tickets !== 1 ? 's' : ''}
              </span>
            </div>

            <Link
              href={`/property/maintenance/${prop.id}`}
              className="flex items-center justify-center gap-1.5 rounded-md border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100"
            >
              <PlusCircle className="h-3.5 w-3.5" /> Submit Maintenance Ticket
            </Link>
          </div>
        ))}
      </div>

      {/* ── Rent payment ledger ───────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-gray-100 px-5 py-3">
          <DollarSign className="h-4 w-4 text-gray-400" />
          <h2 className="text-sm font-semibold text-gray-900">Rent Payment Ledger</h2>
        </div>

        {ledger.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-gray-400">No rent payments recorded yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {ledger.map((entry) => (
              <li key={entry.id} className="flex items-center gap-4 px-5 py-3.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-800">{entry.address}</p>
                  <p className="text-xs text-gray-400">
                    {new Date(entry.created_at).toLocaleDateString()}
                  </p>
                </div>
                <span className="font-semibold text-sm text-gray-900">{usd.format(entry.amount)}</span>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${
                  STATUS_STYLE[entry.status] ?? 'bg-gray-100 text-gray-600'
                }`}>
                  {entry.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
