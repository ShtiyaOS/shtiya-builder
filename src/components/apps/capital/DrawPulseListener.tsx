'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { Radio } from 'lucide-react';
import { useDrawPulse, type DrawPulseEvent } from '@/app/(apps)/capital/pulse/useDrawPulse';

interface DrawPulseListenerProps {
  ledgerId: string;
}

/**
 * DrawPulseListener
 *
 * Client island that mounts useDrawPulse for a specific ledger row and
 * calls router.refresh() on every incoming deal_room_events INSERT.
 * Renders a small live-indicator pill identical to PulseListener.
 */
export function DrawPulseListener({ ledgerId }: DrawPulseListenerProps) {
  const router = useRouter();
  const [lastEvent, setLastEvent] = useState<DrawPulseEvent | null>(null);
  const [pulse, setPulse] = useState(false);

  const handleEvent = useCallback(
    (event: DrawPulseEvent) => {
      setLastEvent(event);
      setPulse(true);
      setTimeout(() => setPulse(false), 1500);
      router.refresh();
    },
    [router],
  );

  useDrawPulse(ledgerId, handleEvent);

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
