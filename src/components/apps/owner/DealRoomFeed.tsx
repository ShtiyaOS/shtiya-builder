'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Radio } from 'lucide-react';
import { EventCard } from './EventCard';
import { usePulseChannel, type DealRoomEvent } from '@/app/(apps)/(owner)/owner/pulse/usePulseChannel';

const EVENTS_CAP = 200;
const NEW_BADGE_MS = 1000; // how long an event keeps its fade-in "just arrived" state

interface DealRoomFeedProps {
  committeeId: string;
  initialEvents: DealRoomEvent[];
}

/**
 * DealRoomFeed
 *
 * Live activity feed for one block committee's deal room. Seeds from the
 * server-fetched `initialEvents`, then layers `usePulseChannel` (existing
 * Realtime hook, already scoped to this `committeeId` via a
 * `block_committee_id=eq.<id>` postgres_changes filter) on top — new events
 * prepend to the top with a brief fade-in and the list is capped at 200 to
 * bound memory growth in a long-running session.
 */
export function DealRoomFeed({ committeeId, initialEvents }: DealRoomFeedProps) {
  const [events, setEvents] = useState<DealRoomEvent[]>(initialEvents);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const clearTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const handleEvent = useCallback((event: DealRoomEvent) => {
    setEvents((prev) => [event, ...prev].slice(0, EVENTS_CAP));

    setNewIds((prev) => {
      const next = new Set(prev);
      next.add(event.id);
      return next;
    });
    const timer = setTimeout(() => {
      setNewIds((prev) => {
        const next = new Set(prev);
        next.delete(event.id);
        return next;
      });
      clearTimersRef.current.delete(event.id);
    }, NEW_BADGE_MS);
    clearTimersRef.current.set(event.id, timer);
  }, []);

  usePulseChannel(committeeId, handleEvent);

  useEffect(() => {
    const timers = clearTimersRef.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
    };
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5 text-xs text-gray-400">
        <Radio className="h-3.5 w-3.5 text-indigo-400" />
        Live · {events.length} event{events.length === 1 ? '' : 's'}
      </div>

      {events.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-5 py-10 text-center text-sm text-gray-500">
          No events yet for this committee.
        </div>
      ) : (
        <ul className="space-y-2">
          {events.map((event) => (
            <EventCard key={event.id} event={event} isNew={newIds.has(event.id)} />
          ))}
        </ul>
      )}
    </div>
  );
}
