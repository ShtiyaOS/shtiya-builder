import dynamic from 'next/dynamic';
import { MapPin } from 'lucide-react';

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

export default function OwnerPage() {
  return (
    <div className="space-y-4">
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

      {/* Map container — fixed height so Leaflet has a concrete dimension */}
      <div className="h-[calc(100vh-10rem)] min-h-96 w-full overflow-hidden rounded-lg border border-gray-200 shadow-sm">
        <BlockMap />
      </div>
    </div>
  );
}
