import { DollarSign, Radio, UserPlus, Zap } from 'lucide-react';
import type { DealRoomEventRow } from './types';

const EVENT_ICON: Record<string, React.ReactNode> = {
  member_joined: <UserPlus className="h-3.5 w-3.5 text-indigo-600" />,
  bid_placed: <DollarSign className="h-3.5 w-3.5 text-green-600" />,
  draw_status_changed: <Zap className="h-3.5 w-3.5 text-yellow-600" />,
};

interface PulseFeedProps {
  events: DealRoomEventRow[];
}

/** Pulse agent panel — live deal-room activity across every block committee. */
export function PulseFeed({ events }: PulseFeedProps) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 border-b border-gray-100 px-5 py-3">
        <Radio className="h-4 w-4 text-indigo-600" />
        <h2 className="text-sm font-semibold text-gray-900">Pulse · Deal-Room Events</h2>
        <span className="ml-auto flex items-center gap-1 text-xs text-gray-400">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" /> live
        </span>
      </div>

      <ul className="max-h-96 divide-y divide-gray-100 overflow-y-auto">
        {events.map((e) => (
          <li key={e.id} className="flex items-start gap-3 px-5 py-3">
            <span className="mt-0.5 flex-shrink-0">
              {EVENT_ICON[e.event_type] ?? <Radio className="h-3.5 w-3.5 text-gray-400" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-gray-800">
                <span className="font-medium capitalize">{e.event_type.replace(/_/g, ' ')}</span>
                {e.committee_name && <span className="text-gray-500"> · {e.committee_name}</span>}
              </p>
              {Object.keys(e.payload ?? {}).length > 0 && (
                <pre className="mt-1 overflow-x-auto text-xs text-gray-400">
                  {JSON.stringify(e.payload)}
                </pre>
              )}
            </div>
            <span className="flex-shrink-0 text-xs text-gray-400">
              {new Date(e.created_at).toLocaleTimeString()}
            </span>
          </li>
        ))}
        {events.length === 0 && (
          <li className="px-5 py-8 text-center text-sm text-gray-400">No deal-room activity yet.</li>
        )}
      </ul>
    </div>
  );
}
