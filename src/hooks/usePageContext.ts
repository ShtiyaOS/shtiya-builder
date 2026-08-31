'use client';

import { useLayoutEffect } from 'react';
import { useTerminalStore } from '@/store/terminalStore';

/**
 * usePageContext — broadcasts a page's semantic context into the terminal
 * shell's Context Registry (`useTerminalStore`) on mount, so the Co-Pilot
 * (Right Pane) always knows what the user is looking at.
 *
 * `useLayoutEffect` (not `useEffect`) so the context is set before the
 * browser paints — if the user immediately opens the Co-Pilot and sends a
 * message, `prepareSendMessagesRequest` never reads a stale/empty string.
 *
 * The cleanup clears the registry on unmount so a page's context can never
 * outlive the page itself. React runs an unmounting component's cleanup
 * before the incoming component's layout effect, so navigating between two
 * context-broadcasting pages still ends with the *new* page's context set,
 * not an empty string.
 *
 * See terminal-layout-plan.md T7.8.
 */
export function usePageContext(description: string) {
  const setContext = useTerminalStore((s) => s.setContext);

  useLayoutEffect(() => {
    setContext(description);
    return () => setContext('');
  }, [description, setContext]);
}
