import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, Clock, AlertTriangle, ShieldAlert, ShieldCheck } from 'lucide-react';
import { DrawApprovalActions } from '@/components/apps/capital/DrawApprovalActions';
import { DrawPulseListener } from '@/components/apps/capital/DrawPulseListener';

// ── Mock data (dev fallback) ──────────────────────────────────────────────────
const MOCK_DRAW = {
  id: 'led-a1',
  property_id: 'prop-1',
  address: '123 Lenox Ave, Harlem, NY 10026',
  amount: 320000,
  type: 'escrow_hold',
  status: 'pending',
  web3_tx_hash: null as string | null,
  created_at: new Date(Date.now() - 2 * 86400 * 1000).toISOString(),
  agreement_type: 'psa',
  borrower: 'Marcus Johnson',
  vision_blocks_draw: false,
  vision_summary: null as string | null,
  compliance_status: 'valid' as string,
};

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function DrawDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  type DrawData = typeof MOCK_DRAW;
  let draw: DrawData = MOCK_DRAW;

  if (user) {
    const { data: ledger } = await supabase
      .from('financial_ledgers')
      .select(`
        id, property_id, type, amount, status, web3_tx_hash, created_at,
        properties ( address ),
        agreements ( type, parties )
      `)
      .eq('id', id)
      .single();

    if (!ledger && id !== 'led-a1') notFound();

    if (ledger) {
      // Latest vision inspection for this property
      const { data: inspection } = await supabase
        .from('vision_inspections')
        .select('blocks_draw, ai_summary')
        .eq('property_id', ledger.property_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      // Contractor compliance
      const { data: contractorDoc } = await supabase
        .from('documents')
        .select('uploaded_by')
        .eq('property_id', ledger.property_id)
        .in('type', ['photo', 'video'])
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      let complianceStatus = 'unknown';
      if (contractorDoc?.uploaded_by) {
        const { data: comp } = await supabase
          .from('compliance_checks')
          .select('status')
          .eq('contractor_id', contractorDoc.uploaded_by)
          .order('last_verified_at', { ascending: false })
          .limit(1)
          .single();
        complianceStatus = comp?.status ?? 'unknown';
      }

      const parties = (ledger.agreements as { parties?: { user_id: string; role: string }[] } | null)?.parties ?? [];
      const borrower = parties.find((p) => p.role === 'owner' || p.role === 'investor');

      draw = {
        id: ledger.id,
        property_id: ledger.property_id,
        address: (ledger.properties as { address?: string } | null)?.address ?? '',
        amount: ledger.amount,
        type: ledger.type,
        status: ledger.status,
        web3_tx_hash: ledger.web3_tx_hash ?? null,
        created_at: ledger.created_at,
        agreement_type: (ledger.agreements as { type?: string } | null)?.type ?? '—',
        borrower: borrower ? `User ${borrower.user_id.slice(0, 8)}` : '—',
        vision_blocks_draw: inspection?.blocks_draw ?? false,
        vision_summary: inspection?.ai_summary ?? null,
        compliance_status: complianceStatus,
      };
    }
  }

  const statusColors: Record<string, string> = {
    pending: 'bg-gray-100 text-gray-700',
    held: 'bg-yellow-100 text-yellow-800',
    released: 'bg-green-100 text-green-800',
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link href="/capital" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-indigo-600">
        <ArrowLeft className="h-4 w-4" /> Back to underwriting
      </Link>

      {/* ── Summary card ─────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-lg font-bold text-gray-900">{draw.address || 'Draw Detail'}</h1>
            <p className="font-mono text-xs text-gray-400 mt-0.5">Ledger ID: {draw.id}</p>
          </div>
          <span className={`rounded-full px-3 py-0.5 text-xs font-semibold capitalize ${statusColors[draw.status] ?? 'bg-gray-100 text-gray-600'}`}>
            {draw.status}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><p className="text-xs text-gray-400">Amount</p><p className="font-bold text-gray-900">{usd.format(draw.amount)}</p></div>
          <div><p className="text-xs text-gray-400">Type</p><p className="capitalize text-gray-700">{draw.type.replace(/_/g, ' ')}</p></div>
          <div><p className="text-xs text-gray-400">Agreement</p><p className="capitalize text-gray-700">{draw.agreement_type}</p></div>
          <div><p className="text-xs text-gray-400">Borrower</p><p className="text-gray-700">{draw.borrower}</p></div>
          <div><p className="text-xs text-gray-400">Submitted</p><p className="text-gray-700">{new Date(draw.created_at).toLocaleDateString()}</p></div>
          <div>
            <p className="text-xs text-gray-400">On-chain Tx</p>
            {draw.web3_tx_hash ? (
              <a href={`https://sepolia.etherscan.io/tx/${draw.web3_tx_hash}`} target="_blank" rel="noopener noreferrer"
                className="font-mono text-xs text-indigo-600 hover:underline truncate block max-w-[120px]">
                {draw.web3_tx_hash.slice(0, 12)}…
              </a>
            ) : <p className="text-xs text-gray-400">—</p>}
          </div>
        </div>
      </div>

      {/* ── Vision gate status ───────────────────────────────────────────── */}
      <div className={`flex items-start gap-3 rounded-xl border p-4 ${draw.vision_blocks_draw ? 'border-red-200 bg-red-50' : 'border-green-200 bg-green-50'}`}>
        {draw.vision_blocks_draw
          ? <ShieldAlert className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
          : <ShieldCheck className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />}
        <div>
          <p className={`text-sm font-semibold ${draw.vision_blocks_draw ? 'text-red-800' : 'text-green-800'}`}>
            Vision: {draw.vision_blocks_draw ? 'Blocking issues detected' : 'No blocking issues'}
          </p>
          {draw.vision_summary && <p className="mt-1 text-xs text-gray-600">{draw.vision_summary}</p>}
        </div>
      </div>

      {/* ── Compliance status ────────────────────────────────────────────── */}
      <div className={`flex items-center gap-2 rounded-lg border px-4 py-3 text-sm ${draw.compliance_status === 'lapsed' ? 'border-red-200 bg-red-50 text-red-700' : draw.compliance_status === 'expiring_soon' ? 'border-yellow-200 bg-yellow-50 text-yellow-800' : 'border-green-200 bg-green-50 text-green-800'}`}>
        {draw.compliance_status === 'lapsed' ? <AlertTriangle className="h-4 w-4 flex-shrink-0" /> : draw.compliance_status === 'expiring_soon' ? <Clock className="h-4 w-4 flex-shrink-0" /> : <CheckCircle2 className="h-4 w-4 flex-shrink-0" />}
        Contractor compliance: <span className="font-semibold capitalize ml-1">{draw.compliance_status}</span>
      </div>

      {/* ── Approval actions (client island) ────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-900">Approval Actions</h2>
          <DrawPulseListener ledgerId={draw.id} />
        </div>
        <DrawApprovalActions
          ledgerId={draw.id}
          currentStatus={draw.status}
          visionBlocks={draw.vision_blocks_draw}
          complianceLapsed={draw.compliance_status === 'lapsed'}
        />
      </div>
    </div>
  );
}
