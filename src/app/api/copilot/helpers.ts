import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  type UIMessage,
} from 'ai';
import type { SubjectKind } from '@/lib/agent/scope-set';
import type { FallbackKey } from '@/lib/agent/fallback-templates';
import type { GroundingOutcome } from '@/lib/agent/observation';

/**
 * Pure helpers for POST /api/copilot.
 *
 * They live beside route.ts rather than inside it so that every `return` in
 * route.ts is a RESPONSE. log-lint (I-A14) reads that file and requires an
 * emitObservation() call before each return in the same scope; a helper's
 * `return typeof value === 'string'` is not a turn ending and has nothing to
 * observe. Keeping them here makes the rule exactly true of the file it guards
 * instead of approximately true with exceptions.
 */

const SUBJECT_KINDS: SubjectKind[] = [
  'property', 'deal', 'facility', 'matter',
  'work_package', 'design_package', 'tenancy', 'representation', 'org',
];

export function isSubjectKind(value: unknown): value is SubjectKind {
  return typeof value === 'string' && (SUBJECT_KINDS as string[]).includes(value);
}

export interface PlainTurn {
  role:    'user' | 'assistant';
  content: string;
}

/** Flattens the AI SDK's UI-message shape into plain role/content turns. */
export function toPlainTurns(messages: UIMessage[]): PlainTurn[] {
  return (Array.isArray(messages) ? messages : [])
    .filter(m => m?.role === 'user' || m?.role === 'assistant')
    .map(m => ({
      role: m.role as 'user' | 'assistant',
      content: (m.parts ?? [])
        .filter((p): p is { type: 'text'; text: string } => p?.type === 'text')
        .map(p => p.text)
        .join(''),
    }));
}

/**
 * The gate reports WHY it is silent; agent_execution_logs records the same
 * thing in its own closed vocabulary (1073 §1). Mapping the two explicitly,
 * rather than storing the fallback key directly, keeps a newly added fallback
 * from silently widening what a CHECK constraint's value means.
 */
export function outcomeFor(fallback: FallbackKey | undefined): GroundingOutcome {
  if (fallback === 'scope_denied')          return 'blocked_wall';
  if (fallback === 'coverage_incomplete')   return 'coverage_incomplete';
  if (fallback === 'no_authority_on_point') return 'fallback_no_results';
  return 'answered';
}

export interface CitationSummary {
  chunk_id:   string;
  instrument: string;
  as_of:      string;
}

/**
 * One-shot text response in the UI-message stream protocol that
 * `DefaultChatTransport` on the client expects.
 *
 * Citations travel as a structured data part, never spliced into the prose.
 * The gate has already proved each one is live and in scope; the chunk TEXT is
 * deliberately left out, because the answer is what the reader reads and the
 * corpus is what the corpus policies protect.
 */
export function streamAnswer(
  text: string,
  citations: CitationSummary[],
  grounded = true,
): Response {
  const stream = createUIMessageStream({
    execute: ({ writer }) => {
      writer.write({ type: 'text-start', id: 'answer' });
      writer.write({ type: 'text-delta', id: 'answer', delta: text });
      writer.write({ type: 'text-end', id: 'answer' });

      if (citations.length > 0) {
        writer.write({ type: 'data-citations', data: citations } as never);
      }

      // An ungrounded answer must ARRIVE labelled. If the flag travelled only
      // in a log, the reader would see prose indistinguishable from a cited
      // answer, which is the failure I-A11 exists to prevent.
      if (!grounded) {
        writer.write({ type: 'data-grounding', data: { grounded: false } } as never);
      }
    },
  });

  return createUIMessageStreamResponse({ stream });
}
