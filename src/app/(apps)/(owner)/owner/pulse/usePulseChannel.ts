'use client';

import { useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';

export interface DealRoomEvent {
  id: string;
  block_committee_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
}

/**
 * usePulseChannel
 *
 * Subscribes to INSERT events on the `deal_room_events` table for a specific
 * block committee via Supabase Realtime (postgres_changes). Calls `onEvent`
 * each time a new event row arrives so the caller can react — e.g. by calling
 * router.refresh() to re-fetch server-rendered data.
 *
 * The subscription is torn down automatically when the component unmounts or
 * when `committeeId` changes, preventing WebSocket leaks.
 *
 * @param committeeId  UUID of the block_committee to filter events by.
 * @param onEvent      Callback invoked with each new DealRoomEvent.
 */
export function usePulseChannel(
  committeeId: string,
  onEvent: (event: DealRoomEvent) => void,
) {
  // Keep the callback in a ref so the effect never needs to re-subscribe
  // when the caller's callback identity changes across renders.
  const onEventRef = useRef(onEvent);
  useEffect(() => {
    onEventRef.current = onEvent;
  });

  useEffect(() => {
    if (!committeeId) return;

    const supabase = createClient();

    const channel = supabase
      .channel(`pulse:block_committee:${committeeId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'deal_room_events',
          filter: `block_committee_id=eq.${committeeId}`,
        },
        (payload) => {
          onEventRef.current(payload.new as DealRoomEvent);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [committeeId]);
}
