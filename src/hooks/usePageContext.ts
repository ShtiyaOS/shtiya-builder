'use client';

import { useLayoutEffect } from 'react';
import { useTerminalStore, type TerminalSubject } from '@/store/terminalStore';

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
 *
 * The optional `subject` is what actually reaches the Co-Pilot's API route: a
 * structured {kind, id} reference the server turns into a closed scope set. The
 * `description` never leaves the browser. A page that passes no subject leaves
 * the Co-Pilot with nothing in scope, and it answers with the scope_denied
 * fallback rather than guessing what the screen is about.
 */
export function usePageContext(description: string, subject?: TerminalSubject) {
  const setContext = useTerminalStore((s) => s.setContext);
  const setSubject = useTerminalStore((s) => s.setSubject);

  // Destructured so the effect depends on the two primitives rather than on a
  // fresh object literal, which most callers will pass inline and which would
  // otherwise re-run the effect on every render.
  const subjectKind = subject?.kind;
  const subjectId   = subject?.id;

  useLayoutEffect(() => {
    setContext(description);
    setSubject(subjectKind && subjectId ? { kind: subjectKind, id: subjectId } : null);
    return () => {
      setContext('');
      setSubject(null);
    };
  }, [description, subjectKind, subjectId, setContext, setSubject]);
}
