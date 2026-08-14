import { createClient } from '@/lib/supabase/server';
import { Wallet, ShieldCheck, ShieldAlert, ExternalLink } from 'lucide-react';
import Link from 'next/link';

// ── Mock data (dev fallback) ──────────────────────────────────────────────────
const MOCK_LEDGERS = [
  {
    id: 'led-1',
    property_id: 'prop-1',
    type: 'escrow_hold',
    amount: 120000,
    currency: 'USD',
    status: 'held',
    web3_tx_hash: '0xabc123def456abc123def456abc123def456abc123def456abc123def456abc1',
    created_at: new Date(Date.now() - 7 * 86400 * 1000).toISOString(),
    address: '123 Lenox Ave, Harlem, NY',
  },
  {
    id: 'led-2',
    property_id: 'prop-2',
    type: 'draw_release',
    amount: 45000,
    currency: 'USD',
    status: 'released',
    web3_tx_hash: '0xdef456abc123def456abc123def456abc123def456abc123def456abc123de45',
    created_at: new Date(Date.now() - 3 * 86400 * 1000).toISOString(),
    address: '456 Adam Clayton Powell Jr Blvd, NY',
  },
  {
    id: 'led-3',
    property_id: 'prop-1',
    type: 'escrow_hold',
    amount: 80000,
    currency: 'USD',
    status: 'pending',
    web3_tx_hash: null,
    created_at: new Date().toISOString(),
    address: '123 Lenox Ave, Harlem, NY',
  },
];

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending:  'bg-gray-100 text-gray-700',
    held:     'bg-yellow-100 text-yellow-800',
    released: 'bg-green-100 text-green-800',
    disputed: 'bg-red-100 text-red-700',
  };
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${styles[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {status}
    </span>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default async function EscrowPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  type LedgerRow = typeof MOCK_LEDGERS[number];
  let ledgers: LedgerRow[] = MOCK_LEDGERS;

  if (user) {
    const { data: rows } = await supabase
      .from('financial_ledgers')
      .select(`
        id, property_id, type, amount, currency, status, web3_tx_hash, created_at,
        properties ( address )
      `)
      .in('type', ['escrow_hold', 'draw_release'])
      .order('created_at', { ascending: false })
      .limit(100);

    if (rows && rows.length > 0) {
      ledgers = rows.map((r) => ({
        ...r,
        address: (r.properties as { address?: string } | null)?.address ?? '',
      }));
    }
  }

  const totalHeld = ledgers
    .filter((l) => l.status === 'held')
    .reduce((s, l) => s + (l.amount ?? 0), 0);

  const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Wallet className="h-6 w-6 text-indigo-600" />
          <div>
            <h1 className="text-xl font-bold text-gray-900">Shtiya Escrow</h1>
            <p className="mt-0.5 text-sm text-gray-500">
              Web3-backed escrow holds and draw releases.
            </p>
          </div>
        </div>
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-2 text-sm text-yellow-800">
          <span className="font-semibold">{usd.format(totalHeld)}</span>
          <span className="ml-1 text-yellow-600">currently held</span>
        </div>
      </div>

      {/* ── Ledger table ─────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-5 py-3">
          <h2 className="text-sm font-semibold text-gray-900">Escrow Ledger</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                <th className="px-4 py-2 text-left">Property</th>
                <th className="px-4 py-2 text-left">Type</th>
                <th className="px-4 py-2 text-right">Amount</th>
                <th className="px-4 py-2 text-center">Status</th>
                <th className="px-4 py-2 text-left">On-chain Tx</th>
                <th className="px-4 py-2 text-left">Vision</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {ledgers.map((row) => (
                <tr key={row.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-800 truncate max-w-[180px]">
                      {row.address || `Property ${row.property_id?.slice(0, 8)}`}
                    </p>
                    <p className="font-mono text-xs text-gray-400">{row.id.slice(0, 8)}…</p>
                  </td>
                  <td className="px-4 py-3 capitalize text-gray-600 text-xs">
                    {row.type.replace('_', ' ')}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-800">
                    {usd.format(row.amount)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <StatusBadge status={row.status} />
                  </td>
                  <td className="px-4 py-3">
                    {row.web3_tx_hash ? (
                      <div className="flex items-center gap-1">
                        <ShieldCheck className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
                        <a
                          href={`https://sepolia.etherscan.io/tx/${row.web3_tx_hash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-xs text-indigo-600 hover:underline truncate max-w-[100px]"
                        >
                          {row.web3_tx_hash.slice(0, 10)}…
                        </a>
                        <ExternalLink className="h-3 w-3 text-gray-400" />
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 text-xs text-gray-400">
                        <ShieldAlert className="h-3.5 w-3.5" /> Not on-chain
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {row.status === 'held' && (
                      <Link
                        href={`/escrow/vision?ledger_id=${row.id}`}
                        className="text-xs text-indigo-600 hover:underline"
                      >
                        Check Vision
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
