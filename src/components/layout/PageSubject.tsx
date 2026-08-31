'use client';

import { usePageContext } from '@/hooks/usePageContext';
import type { SubjectKind } from '@/lib/agent/scope-set';

/**
 * Declares what the current screen is ABOUT, for the Co-Pilot.
 *
 * Most pages in this app are Server Components, and the registry that feeds the
 * Co-Pilot is a client store. Rather than convert a page to a client component
 * just to call a hook, drop this marker into its JSX:
 *
 *   <PageSubject kind="property" id={property.id} description="1140 Bedford Ave" />
 *
 * It renders nothing. It registers the subject on mount and clears it on
 * unmount, so a subject can never outlive the page that declared it — which is
 * what stops the Co-Pilot answering about the last screen after you navigate.
 *
 * The `kind` must be one of the nine values in the subject_kind enum. There is
 * no 'user', 'client', 'firm', 'document', or 'trust_account' subject: those are
 * not resolvable scopes, and passing one would deny every request.
 */
export function PageSubject({
  kind,
  id,
  description,
}: {
  kind: SubjectKind;
  id: string | null | undefined;
  description: string;
}) {
  usePageContext(description, id ? { kind, id } : undefined);
  return null;
}
