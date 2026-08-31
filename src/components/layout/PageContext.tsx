'use client';

import { usePageContext } from '@/hooks/usePageContext';
import type { SubjectKind } from '@/lib/agent/scope-set';

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
 * SUBJECT (added for the Co-Pilot's scope set)
 *
 * `description` is prose and stays in the browser — it renders in the empty
 * state hint and is never sent to the API, because prose describing a screen
 * arrives at the model indistinguishable from the user's own words (I-A6).
 *
 * `subjectKind` + `subjectId` are the structured reference that IS sent. The
 * server resolves them into a closed scope set. A page that declares no subject
 * leaves the Co-Pilot with nothing in scope, and it says so rather than
 * guessing:
 *
 *   <PageContext description="…" subjectKind="property" subjectId={id} />
 *
 * `subjectKind` must be one of the nine subject_kind enum values. There is no
 * 'user', 'client', 'firm', 'document', or 'trust_account' subject — those are
 * not resolvable scopes, and passing one would deny every request.
 *
 * See terminal-layout-plan.md T7.8 and src/hooks/usePageContext.ts.
 */
export function PageContext({
  description,
  subjectKind,
  subjectId,
}: {
  description:  string;
  subjectKind?: SubjectKind;
  subjectId?:   string | null;
}) {
  usePageContext(
    description,
    subjectKind && subjectId ? { kind: subjectKind, id: subjectId } : undefined,
  );
  return null;
}
