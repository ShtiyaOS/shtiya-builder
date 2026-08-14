'use client';

import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';

// ── Fix broken default marker icons in webpack / Next.js ──────────────────
// Leaflet resolves icon assets at runtime from a relative path that doesn't
// survive bundling. Override with the CDN-hosted PNGs so markers always render.
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// ── Mock property data (placeholder until Supabase rows are available) ─────
interface MockProperty {
  id: string;
  address: string;
  owner: string;
  status: 'invited' | 'signed' | 'declined' | 'active';
  lat: number;
  lng: number;
}

const MOCK_PROPERTIES: MockProperty[] = [
  {
    id: '1',
    address: '123 Lenox Ave, Harlem, NY 10026',
    owner: 'Marcus Johnson',
    status: 'active',
    lat: 40.8048,
    lng: -73.9514,
  },
  {
    id: '2',
    address: '456 Adam Clayton Powell Jr Blvd, NY 10027',
    owner: 'Diane Carter',
    status: 'invited',
    lat: 40.8079,
    lng: -73.9498,
  },
  {
    id: '3',
    address: '789 Malcolm X Blvd, Harlem, NY 10037',
    owner: 'Robert Williams',
    status: 'signed',
    lat: 40.8013,
    lng: -73.9446,
  },
  {
    id: '4',
    address: '321 W 125th St, New York, NY 10027',
    owner: 'Sandra Torres',
    status: 'declined',
    lat: 40.8089,
    lng: -73.9524,
  },
  {
    id: '5',
    address: '654 Frederick Douglass Blvd, NY 10030',
    owner: 'Anthony Lee',
    status: 'invited',
    lat: 40.8031,
    lng: -73.9527,
  },
];

const STATUS_COLOR: Record<MockProperty['status'], string> = {
  active: 'bg-green-100 text-green-800',
  signed: 'bg-indigo-100 text-indigo-800',
  invited: 'bg-yellow-100 text-yellow-800',
  declined: 'bg-red-100 text-red-800',
};

// Harlem, NYC — centre of the mock dataset
const DEFAULT_CENTER: [number, number] = [40.8048, -73.9514];
const DEFAULT_ZOOM = 15;

export default function BlockMap() {
  return (
    <MapContainer
      center={DEFAULT_CENTER}
      zoom={DEFAULT_ZOOM}
      scrollWheelZoom
      className="h-full w-full rounded-lg"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {MOCK_PROPERTIES.map((property) => (
        <Marker key={property.id} position={[property.lat, property.lng]}>
          <Popup minWidth={200}>
            <div className="space-y-1 text-sm">
              <p className="font-semibold text-gray-900">{property.address}</p>
              <p className="text-gray-600">
                <span className="font-medium">Owner:</span> {property.owner}
              </p>
              <p>
                <span className="font-medium text-gray-600">Status: </span>
                <span
                  className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_COLOR[property.status]}`}
                >
                  {property.status}
                </span>
              </p>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
