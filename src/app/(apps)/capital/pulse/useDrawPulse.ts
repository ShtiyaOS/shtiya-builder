'use client';

import { useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';

export interface DrawPulseEvent {
  id: string;
  financial_ledger_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
}

/**
 * useDrawPulse
 *
 * Subscribes to INSERT events on `deal_room_events` filtered by
 * `financial_ledger_id` — the draw-scoped counterpart of usePulseChannel.
 * Calls `onEvent` whenever a new status-change event arrives so the caller
 * can call router.refresh() and reflect the new DB state within ~2 s.
 *
 * @param ledgerId  UUID of the financial_ledger row to watch.
 * @param onEvent   Callback invoked with each new DrawPulseEvent.
 */
export function useDrawPulse(
  ledgerId: string,
  onEvent: (event: DrawPulseEvent) => void,
) {
  const onEventRef = useRef(onEvent);
  useEffect(() => {
    onEventRef.current = onEvent;
  });

  useEffect(() => {
    if (!ledgerId) return;

    const supabase = createClient();

    const channel = supabase
      .channel(`pulse:draw:${ledgerId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'deal_room_events',
          filter: `financial_ledger_id=eq.${ledgerId}`,
        },
        (payload) => {
          onEventRef.current(payload.new as DrawPulseEvent);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [ledgerId]);
}
