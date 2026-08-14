import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Wrench, Clock, CheckCircle2 } from 'lucide-react';
import { MaintenanceForm } from '@/components/apps/property/MaintenanceForm';

// ── Mock fallback ─────────────────────────────────────────────────────────────
const MOCK_PROPERTY = { id: 'prop-1', address: '123 Lenox Ave, Harlem, NY 10026' };
const MOCK_TICKETS = [
  {
    id: 'doc-ticket-1',
    trade: 'Plumbing',
    description: 'Kitchen faucet leaking under the sink — water pooling in cabinet.',
    urgency: 'urgent',
    submitted_at: new Date(Date.now() - 2 * 86400 * 1000).toISOString(),
    status: 'open',
  },
];

const URGENCY_STYLE: Record<string, string> = {
  urgent: 'bg-red-100 text-red-700',
  normal: 'bg-yellow-100 text-yellow-800',
  low:    'bg-gray-100 text-gray-600',
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function MaintenancePage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  type PropData = typeof MOCK_PROPERTY;
  type TicketData = (typeof MOCK_TICKETS)[number];

  let property: PropData = MOCK_PROPERTY;
  let tickets: TicketData[] = MOCK_TICKETS;

  if (user) {
    const { data: prop } = await supabase
      .from('properties')
      .select('id, address')
      .eq('id', id)
      .single();

    if (!prop && id !== 'prop-1') notFound();
    if (prop) property = prop as PropData;

    // Fetch open maintenance tickets for this property
    const { data: docs } = await supabase
      .from('documents')
      .select('id, bucket_path, created_at')
      .eq('property_id', id)
      .eq('type', 'maintenance_ticket')
      .order('created_at', { ascending: false })
      .limit(50);

    if (docs && docs.length > 0) {
      tickets = docs.map((d) => {
        // Decode meta: bucket_path back to the ticket payload
        let meta: Record<string, unknown> = {};
        const bp = d.bucket_path as string;
        if (bp.startsWith('meta:')) {
          try {
            meta = JSON.parse(Buffer.from(bp.slice(5), 'base64').toString('utf-8')) as Record<string, unknown>;
          } catch { /* ignore */ }
        }
        return {
          id: d.id,
          trade: (meta.trade as string) ?? '—',
          description: (meta.description as string) ?? '—',
          urgency: (meta.urgency as string) ?? 'normal',
          submitted_at: d.created_at,
          status: 'open',
        };
      });
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link href="/property" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-indigo-600">
        <ArrowLeft className="h-4 w-4" /> Back to Property Portal
      </Link>

      <div>
        <h1 className="text-xl font-bold text-gray-900">Maintenance Tickets</h1>
        <p className="mt-0.5 text-sm text-gray-500">{property.address}</p>
      </div>

      {/* ── Submit new ticket ────────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <Wrench className="h-4 w-4 text-indigo-600" />
          <h2 className="text-sm font-semibold text-gray-900">Submit New Ticket</h2>
        </div>
        <MaintenanceForm propertyId={id} propertyAddress={property.address} />
      </div>

      {/* ── Existing tickets ─────────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-5 py-3">
          <h2 className="text-sm font-semibold text-gray-900">Open Tickets</h2>
        </div>

        {tickets.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-gray-400">
            <CheckCircle2 className="h-8 w-8 text-green-200" />
            <p>No open maintenance tickets.</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {tickets.map((ticket) => (
              <li key={ticket.id} className="flex items-start gap-3 px-5 py-4">
                <Clock className="h-4 w-4 flex-shrink-0 text-yellow-500 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-gray-800">{ticket.trade}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${
                      URGENCY_STYLE[ticket.urgency] ?? 'bg-gray-100 text-gray-600'
                    }`}>
                      {ticket.urgency}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600">{ticket.description}</p>
                  <p className="mt-1 text-xs text-gray-400">
                    Submitted {new Date(ticket.submitted_at).toLocaleDateString()}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
