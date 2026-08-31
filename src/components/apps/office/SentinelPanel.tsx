import { Clock, ShieldAlert, ShieldCheck } from 'lucide-react';
import type { ComplianceCheckRow } from './types';

type StatusStyle = { icon: React.ReactNode; pill: string; row: string };

const STATUS_STYLE_MAP: Record<string, StatusStyle> = {
  valid: {
    icon: <ShieldCheck className="h-3.5 w-3.5 text-green-600" />,
    pill: 'bg-green-100 text-green-800',
    row: '',
  },
  expiring_soon: {
    icon: <Clock className="h-3.5 w-3.5 text-yellow-500" />,
    pill: 'bg-yellow-100 text-yellow-800',
    row: 'bg-yellow-50/40',
  },
  lapsed: {
    icon: <ShieldAlert className="h-3.5 w-3.5 text-red-600" />,
    pill: 'bg-red-100 text-red-800',
    row: 'bg-red-50/40',
  },
};

// Definite default — never accessed via index so it is always StatusStyle, not StatusStyle | undefined.
const STATUS_STYLE_DEFAULT: StatusStyle = STATUS_STYLE_MAP['valid'] ?? {
  icon: <ShieldCheck className="h-3.5 w-3.5 text-green-600" />,
  pill: 'bg-green-100 text-green-800',
  row: '',
};

const VERIFICATION_WINDOW_DAYS = 30;

/** Days remaining until Sentinel's next automatic re-verification is due (negative = overdue). */
function daysUntilNextVerification(lastVerifiedAt: string | null): number | null {
  if (!lastVerifiedAt) return null;
  const nextDue = new Date(lastVerifiedAt).getTime() + VERIFICATION_WINDOW_DAYS * 86400 * 1000;
  return Math.ceil((nextDue - Date.now()) / (86400 * 1000));
}

interface SentinelPanelProps {
  checks: ComplianceCheckRow[];
}

/** Sentinel agent panel — contractor license/insurance compliance status. */
export function SentinelPanel({ checks }: SentinelPanelProps) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 border-b border-gray-100 px-5 py-3">
        <ShieldCheck className="h-4 w-4 text-indigo-600" />
        <h2 className="text-sm font-semibold text-gray-900">Sentinel · Compliance Registry</h2>
        <span className="ml-auto text-xs text-gray-400">{checks.length} contractors</span>
      </div>

      <div className="max-h-96 overflow-y-auto overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-gray-50">
            <tr className="border-b border-gray-100 text-xs text-gray-500 uppercase tracking-wide">
              <th className="px-4 py-2.5 text-left">Contractor</th>
              <th className="px-4 py-2.5 text-left">Status</th>
              <th className="px-4 py-2.5 text-left">Next Verification</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {checks.map((c) => {
              const s: StatusStyle = STATUS_STYLE_MAP[c.status] ?? STATUS_STYLE_DEFAULT;
              const daysLeft = daysUntilNextVerification(c.last_verified_at);
              return (
                <tr key={c.id} className={s.row}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-800">{c.contractor_name}</p>
                    <p className="font-mono text-xs text-gray-400">{c.license_number ?? 'no license #'}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${s.pill}`}>
                      {s.icon}
                      {c.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {daysLeft === null
                      ? 'never verified'
                      : daysLeft < 0
                        ? `${Math.abs(daysLeft)}d overdue`
                        : `in ${daysLeft}d`}
                  </td>
                </tr>
              );
            })}
            {checks.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-sm text-gray-400">
                  No compliance records yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
