'use client';

import { usePageContext } from '@/hooks/usePageContext';

/**
 * PageContext — a minimal 'use client' wrapper around `usePageContext`.
 *
 * Server Component pages cannot call hooks directly. This component exists
 * solely to bridge that boundary: a server page renders `<PageContext>`
 * as a null-output child, and the hook runs client-side inside it, pushing
 * the description string into `useTerminalStore` so the Co-Pilot (Right
 * Pane) always knows what the user is looking at.
 *
 * Usage (inside a Server Component page):
 *   <PageContext description="Capital Dashboard — draw approval queue" />
 *
 * See terminal-layout-plan.md T7.8 and src/hooks/usePageContext.ts.
 */
export function PageContext({ description }: { description: string }) {
  usePageContext(description);
  return null;
}
