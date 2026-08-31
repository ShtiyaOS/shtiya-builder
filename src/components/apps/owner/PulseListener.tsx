'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { Radio } from 'lucide-react';
import { usePulseChannel, type DealRoomEvent } from '@/app/(apps)/(owner)/owner/pulse/usePulseChannel';

interface PulseListenerProps {
  committeeId: string;
}

/**
 * PulseListener
 *
 * Invisible-by-default client component that mounts the usePulseChannel hook
 * and calls router.refresh() whenever a new deal_room_event is received for
 * this committee. Next.js router.refresh() re-runs the Server Component data
 * fetch without a full navigation, so the member roster and progress bar
 * update live within ~2 seconds of a peer signing.
 *
 * Also renders a small status pill so the user knows the live channel is open.
 */
export function PulseListener({ committeeId }: PulseListenerProps) {
  const router = useRouter();
  const [lastEvent, setLastEvent] = useState<DealRoomEvent | null>(null);
  const [pulse, setPulse] = useState(false);

  const handleEvent = useCallback(
    (event: DealRoomEvent) => {
      setLastEvent(event);

      // Flash the indicator briefly.
      setPulse(true);
      setTimeout(() => setPulse(false), 1500);

      // Re-run the Server Component data fetch to reflect the new DB state.
      router.refresh();
    },
    [router],
  );

  usePulseChannel(committeeId, handleEvent);

  return (
    <div className="flex items-center gap-1.5 text-xs text-gray-400">
      <Radio
        className={`h-3.5 w-3.5 transition-colors duration-300 ${
          pulse ? 'text-indigo-500' : 'text-gray-300'
        }`}
        aria-hidden="true"
      />
      <span>
        {lastEvent
          ? `Live · last update ${new Date(lastEvent.created_at).toLocaleTimeString()}`
          : 'Live · waiting for events'}
      </span>
    </div>
  );
}
