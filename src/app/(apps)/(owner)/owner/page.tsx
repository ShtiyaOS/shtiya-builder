import dynamic from 'next/dynamic';
import { MapPin } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { ConnectionInbox, type ConnectionRequest } from '@/components/apps/owner/ConnectionInbox';
import { PageContext } from '@/components/layout/PageContext';

// Leaflet accesses `window` and `document` at import time — it cannot run on
// the server. We defer the entire component to the client with ssr: false.
const BlockMap = dynamic(() => import('@/components/apps/owner/BlockMap'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center rounded-lg bg-gray-100 text-sm text-gray-500">
      Loading map…
    </div>
  ),
});

export default async function OwnerPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let connectionRequests: ConnectionRequest[] = [];

  if (user) {
    // Fetch incoming investor connection requests addressed to this owner,
    // joining investor profile for display name/email. Limit to last 20 so
    // the panel stays compact; owners with many requests can later paginate.
    const { data: rows } = await supabase
      .from('investor_owner_connections')
      .select(`
        id,
        investor_id,
        message,
        requested_at,
        status,
        investors:users!investor_owner_connections_investor_id_fkey (
          full_name,
          email
        )
      `)
      .eq('owner_id', user.id)
      .in('status', ['requested', 'accepted', 'declined'])
      .order('requested_at', { ascending: false })
      .limit(20);

    connectionRequests = (rows ?? []).map((r) => {
      const inv = r.investors as { full_name?: string | null; email?: string } | null;
      return {
        id: r.id,
        investor_id: r.investor_id,
        investor_name: inv?.full_name ?? null,
        investor_email: inv?.email ?? '',
        message: r.message ?? null,
        requested_at: r.requested_at,
        status: r.status as ConnectionRequest['status'],
      };
    });
  }

  return (
    <div className="space-y-6">
      <PageContext description="Block Assembly Map — GIS parcel map with block committee status, owner connection inbox with pending investor requests" />

      {/* Page header */}
      <div className="flex items-center gap-2">
        <MapPin className="h-5 w-5 text-indigo-600" />
        <div>
          <h1 className="text-xl font-bold text-gray-900">Block Assembly Map</h1>
          <p className="text-sm text-gray-500">
            Click any parcel marker to view owner details and committee status.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Map — takes 2/3 width on desktop */}
        <div className="lg:col-span-2">
          <div className="h-[calc(100vh-14rem)] min-h-96 w-full overflow-hidden rounded-lg border border-gray-200 shadow-sm">
            <BlockMap />
          </div>
        </div>

        {/* Connection inbox — takes 1/3 width on desktop */}
        <div className="lg:col-span-1">
          <ConnectionInbox initialRequests={connectionRequests} />
        </div>
      </div>
    </div>
  );
}
