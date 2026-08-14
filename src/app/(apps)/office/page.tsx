import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { ShieldCheck, ShieldAlert, Clock, Download, Users } from 'lucide-react';

// ── Mock data (dev fallback) ──────────────────────────────────────────────────
const MOCK_CHECKS = [
  {
    id: 'cc-1',
    contractor_id: 'user-c1',
    contractor_name: 'Rivera Contracting LLC',
    license_number: 'GC-204891',
    insurance_policy_number: 'INS-9944221',
    expiration_date: '2025-06-30',
    status: 'valid',
    last_verified_at: new Date(Date.now() - 10 * 86400 * 1000).toISOString(),
    source: 'nyc_open_data',
  },
  {
    id: 'cc-2',
    contractor_id: 'user-c2',
    contractor_name: 'BuildRight Group Inc.',
    license_number: 'GC-118734',
    insurance_policy_number: 'INS-7732910',
    expiration_date: '2024-12-01',
    status: 'expiring_soon',
    last_verified_at: new Date(Date.now() - 5 * 86400 * 1000).toISOString(),
    source: 'nyc_open_data',
  },
  {
    id: 'cc-3',
    contractor_id: 'user-c3',
    contractor_name: 'Apex Plumbing & Heat',
    license_number: 'MP-033412',
    insurance_policy_number: null,
    expiration_date: '2024-09-15',
    status: 'lapsed',
    last_verified_at: new Date(Date.now() - 30 * 86400 * 1000).toISOString(),
    source: 'nyc_open_data',
  },
];

const STATUS_STYLE: Record<string, { icon: React.ReactNode; pill: string }> = {
  valid:          {
    icon: <ShieldCheck className="h-4 w-4 text-green-600 flex-shrink-0" />,
    pill: 'bg-green-100 text-green-800',
  },
  expiring_soon:  {
    icon: <Clock className="h-4 w-4 text-yellow-500 flex-shrink-0" />,
    pill: 'bg-yellow-100 text-yellow-800',
  },
  lapsed:         {
    icon: <ShieldAlert className="h-4 w-4 text-red-600 flex-shrink-0" />,
    pill: 'bg-red-100 text-red-800',
  },
};

export default async function OfficePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  type CheckRow = (typeof MOCK_CHECKS)[number];
  let checks: CheckRow[] = MOCK_CHECKS;

  if (user) {
    const { data: rows } = await supabase
      .from('compliance_checks')
      .select(`
        id,
        contractor_id,
        license_number,
        insurance_policy_number,
        expiration_date,
        status,
        last_verified_at,
        source,
        users ( full_name, email )
      `)
      .order('status', { ascending: false }) // lapsed first
      .order('expiration_date', { ascending: true })
      .limit(200);

    if (rows && rows.length > 0) {
      checks = rows.map((r) => {
        const u = r.users as { full_name?: string; email?: string } | null;
        return {
          id: r.id,
          contractor_id: r.contractor_id,
          contractor_name: u?.full_name ?? u?.email ?? `Contractor ${(r.contractor_id as string).slice(0, 8)}`,
          license_number: r.license_number ?? null,
          insurance_policy_number: r.insurance_policy_number ?? null,
          expiration_date: r.expiration_date ?? null,
          status: r.status as string,
          last_verified_at: r.last_verified_at,
          source: r.source ?? 'nyc_open_data',
        };
      }) as CheckRow[];
    }
  }

  const lapsedCount   = checks.filter((c) => c.status === 'lapsed').length;
  const expiringSoon  = checks.filter((c) => c.status === 'expiring_soon').length;
  const validCount    = checks.filter((c) => c.status === 'valid').length;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Shtiya Office</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Contractor compliance auditing · Bookkeeping · Payroll ledger export
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

      {/* ── Summary chips ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-2.5">
          <ShieldCheck className="h-4 w-4 text-green-600" />
          <div>
            <p className="text-xs text-green-600 font-medium">Valid</p>
            <p className="text-lg font-bold text-green-700 leading-none">{validCount}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-2.5">
          <Clock className="h-4 w-4 text-yellow-600" />
          <div>
            <p className="text-xs text-yellow-600 font-medium">Expiring Soon</p>
            <p className="text-lg font-bold text-yellow-700 leading-none">{expiringSoon}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5">
          <ShieldAlert className="h-4 w-4 text-red-600" />
          <div>
            <p className="text-xs text-red-600 font-medium">Lapsed</p>
            <p className="text-lg font-bold text-red-700 leading-none">{lapsedCount}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5">
          <Users className="h-4 w-4 text-gray-500" />
          <div>
            <p className="text-xs text-gray-500 font-medium">Total Contractors</p>
            <p className="text-lg font-bold text-gray-700 leading-none">{checks.length}</p>
          </div>
        </div>
      </div>

      {/* ── Sentinel notice ───────────────────────────────────────────────── */}
      <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-5 py-3 text-sm text-indigo-700">
        <span className="font-semibold">Sentinel</span> auto-verification runs monthly via pg_cron.
        Lapsed records block escrow draw releases and capital draw approvals automatically.
      </div>

      {/* ── Compliance table ──────────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-gray-100 px-5 py-3">
          <h2 className="text-sm font-semibold text-gray-900">Contractor Compliance Registry</h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                <th className="px-4 py-2.5 text-left">Contractor</th>
                <th className="px-4 py-2.5 text-left">License #</th>
                <th className="px-4 py-2.5 text-left">Insurance #</th>
                <th className="px-4 py-2.5 text-left">Expires</th>
                <th className="px-4 py-2.5 text-left">Status</th>
                <th className="px-4 py-2.5 text-left">Last Verified</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {checks.map((c) => {
                const s = STATUS_STYLE[c.status] ?? STATUS_STYLE.valid;
                return (
                  <tr key={c.id} className={c.status === 'lapsed' ? 'bg-red-50/40' : c.status === 'expiring_soon' ? 'bg-yellow-50/40' : ''}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-800">{c.contractor_name}</p>
                      <p className="font-mono text-xs text-gray-400">{c.contractor_id.slice(0, 8)}…</p>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-700">{c.license_number ?? '—'}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-700">{c.insurance_policy_number ?? '—'}</td>
                    <td className="px-4 py-3 text-xs text-gray-700">
                      {c.expiration_date
                        ? new Date(c.expiration_date).toLocaleDateString()
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {s.icon}
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${s.pill}`}>
                          {c.status.replace('_', ' ')}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {c.last_verified_at
                        ? new Date(c.last_verified_at).toLocaleDateString()
                        : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
