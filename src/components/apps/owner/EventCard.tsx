import { DollarSign, Radio, UserPlus, Zap } from 'lucide-react';
import type { DealRoomEvent } from '@/app/(apps)/(owner)/owner/pulse/usePulseChannel';

const EVENT_STYLE: Record<string, { icon: React.ReactNode; label: string }> = {
  member_joined: {
    icon: <UserPlus className="h-4 w-4 text-indigo-600" />,
    label: 'Member joined',
  },
  bid_placed: {
    icon: <DollarSign className="h-4 w-4 text-green-600" />,
    label: 'Bid placed',
  },
  draw_status_changed: {
    icon: <Zap className="h-4 w-4 text-yellow-600" />,
    label: 'Draw status changed',
  },
};

interface EventCardProps {
  event: DealRoomEvent;
  /** True for events that just arrived over Realtime — plays a brief fade-in. */
  isNew?: boolean;
}

/** Renders a single `deal_room_events` row: type badge, payload summary, timestamp. */
export function EventCard({ event, isNew }: EventCardProps) {
  const style = EVENT_STYLE[event.event_type] ?? {
    icon: <Radio className="h-4 w-4 text-gray-400" />,
    label: event.event_type.replace(/_/g, ' '),
  };
  const hasPayload = event.payload && Object.keys(event.payload).length > 0;

  return (
    <li
      className={`flex items-start gap-3 rounded-lg border border-gray-100 bg-white px-4 py-3 shadow-sm ${
        isNew ? 'animate-fade-in-event' : ''
      }`}
    >
      <span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gray-50">
        {style.icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium capitalize text-gray-900">{style.label}</p>
        {hasPayload && (
          <pre className="mt-1 overflow-x-auto rounded-md bg-gray-50 px-2 py-1.5 text-xs text-gray-500">
            {JSON.stringify(event.payload, null, 2)}
          </pre>
        )}
      </div>
      <span className="flex-shrink-0 text-xs text-gray-400">
        {new Date(event.created_at).toLocaleTimeString()}
      </span>
    </li>
  );
}
