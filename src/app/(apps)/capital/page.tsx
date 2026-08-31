import { createClient } from '@/lib/supabase/server';
import { TrendingUp } from 'lucide-react';
import Link from 'next/link';
import { PageContext } from '@/components/layout/PageContext';

// ── Mock data (dev fallback) ──────────────────────────────────────────────────
const MOCK_DEALS = [
  {
    id: 'led-a1',
    property_id: 'prop-1',
    address: '123 Lenox Ave, Harlem, NY 10026',
    amount: 320000,
    type: 'escrow_hold',
    status: 'pending',
    agreement_type: 'psa',
    borrower: 'Marcus Johnson',
    created_at: new Date(Date.now() - 2 * 86400 * 1000).toISOString(),
  },
  {
    id: 'led-a2',
    property_id: 'prop-2',
    address: '456 Adam Clayton Powell Jr Blvd, NY 10027',
    amount: 185000,
    type: 'draw_release',
    status: 'pending',
    agreement_type: 'jv',
    borrower: 'Diane Carter',
    created_at: new Date(Date.now() - 5 * 86400 * 1000).toISOString(),
  },
  {
    id: 'led-a3',
    property_id: 'prop-3',
    address: '789 Malcolm X Blvd, Harlem, NY 10037',
    amount: 92500,
    type: 'material_invoice',
    status: 'pending',
    agreement_type: 'psa',
    borrower: 'Robert Williams',
    created_at: new Date(Date.now() - 1 * 86400 * 1000).toISOString(),
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

function TypeBadge({ type }: { type: string }) {
  const styles: Record<string, string> = {
    escrow_hold:      'bg-yellow-100 text-yellow-800',
    draw_release:     'bg-indigo-100 text-indigo-700',
    material_invoice: 'bg-blue-100 text-blue-700',
    tax_debt:         'bg-red-100 text-red-700',
  };
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${styles[type] ?? 'bg-gray-100 text-gray-600'}`}>
      {type.replace(/_/g, ' ')}
    </span>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default async function CapitalPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  type DealRow = typeof MOCK_DEALS[number];
  let deals: DealRow[] = MOCK_DEALS;

  if (user) {
    // RLS restricts to ledgers the lender/admin can see.
    const { data: rows } = await supabase
      .from('financial_ledgers')
      .select(`
        id, property_id, type, amount, status, created_at,
        properties ( address ),
        agreements ( type, parties )
      `)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(100);

    if (rows && rows.length > 0) {
      deals = rows.map((r) => {
        const parties = (r.agreements as { parties?: { user_id: string; role: string }[] } | null)
          ?.parties ?? [];
        const borrower = parties.find((p) => p.role === 'owner' || p.role === 'investor');
        return {
          id: r.id,
          property_id: r.property_id,
          address: (r.properties as { address?: string } | null)?.address ?? '',
          amount: r.amount,
          type: r.type,
          status: r.status,
          agreement_type: (r.agreements as { type?: string } | null)?.type ?? '—',
          borrower: borrower ? `User ${borrower.user_id.slice(0, 8)}` : '—',
          created_at: r.created_at,
        };
      });
    }
  }

  const totalPending = deals.reduce((s, d) => s + d.amount, 0);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageContext description="Capital Dashboard — lender draw approval queue and escrow ledger with live Pulse status updates" />

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <TrendingUp className="h-6 w-6 text-indigo-600" />
          <div>
            <h1 className="text-xl font-bold text-gray-900">Lender Underwriting</h1>
            <p className="mt-0.5 text-sm text-gray-500">
              Deals pending underwriting review.
            </p>
          </div>
        </div>
        <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm">
          <span className="font-semibold text-indigo-800">{usd.format(totalPending)}</span>
          <span className="ml-1 text-indigo-500">pending</span>
        </div>
      </div>

      {/* ── Deals table ──────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
              <th className="px-4 py-3 text-left">Property</th>
              <th className="px-4 py-3 text-left">Borrower</th>
              <th className="px-4 py-3 text-left">Agreement</th>
              <th className="px-4 py-3 text-left">Type</th>
              <th className="px-4 py-3 text-right">Amount</th>
              <th className="px-4 py-3 text-left">Submitted</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {deals.map((deal) => (
              <tr key={deal.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-800 max-w-[200px] truncate">{deal.address}</p>
                  <p className="font-mono text-xs text-gray-400">{deal.property_id.slice(0, 8)}…</p>
                </td>
                <td className="px-4 py-3 text-gray-700">{deal.borrower}</td>
                <td className="px-4 py-3 capitalize text-gray-600 text-xs">
                  {deal.agreement_type}
                </td>
                <td className="px-4 py-3">
                  <TypeBadge type={deal.type} />
                </td>
                <td className="px-4 py-3 text-right font-semibold text-gray-800">
                  {usd.format(deal.amount)}
                </td>
                <td className="px-4 py-3 text-xs text-gray-400">
                  {new Date(deal.created_at).toLocaleDateString()}
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/capital/draws/${deal.id}`}
                    className="text-xs font-medium text-indigo-600 hover:underline"
                  >
                    Review →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {deals.length === 0 && (
          <p className="px-6 py-10 text-center text-sm text-gray-400">
            No deals pending underwriting.
          </p>
        )}
      </div>
    </div>
  );
}
