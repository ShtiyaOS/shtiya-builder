import { createHash } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AgentType } from './prompts/index';

/**
 * -- I-A14 / I-A15: every agent turn leaves a record, and no turn may return to
 * a client without one. log-lint enforces the second half structurally — a
 * `return` in the copilot route that is not preceded by an emitObservation()
 * call in the same scope is a lint violation, not a code-review note.
 *
 * -- I-A14 also decides what MAY be recorded. The query is hashed, never
 * stored: an observability table that accumulates verbatim legal questions is a
 * second copy of the matter file, held outside the RLS that protects the first.
 * Answer text and citation text never appear here at all; chunk IDs do, because
 * they are the audit trail and are already protected by the corpus policies.
 */

/**
 * The closed set from agent_execution_logs.grounding_outcome's CHECK constraint
 * (1073 §1). It is closed on purpose: a value like 'answered_no_citation' would
 * describe a state the platform is not permitted to reach, so needing one would
 * mean a design defect rather than a missing enum member.
 */
export type GroundingOutcome =
  | 'answered'
  | 'fallback_no_results'
  | 'fallback_below_bar'
  | 'fallback_jurisdiction_mismatch'
  | 'fallback_stale_corpus'
  | 'degraded_no_reranker'
  | 'blocked_account_class'
  | 'blocked_wall'
  | 'coverage_incomplete';

export interface ObservationRecord {
  requestId:  string;
  userId:     string | null;
  agentType:  AgentType | null;
  outcome:    GroundingOutcome;
  /** Whether a model was actually invoked for this turn. */
  modelInvoked: boolean;
  /** Hashed before it is recorded; the raw string never leaves this function. */
  query?:     string;
  chunkIds?:  string[];
  sentencesTotal?:    number;
  sentencesStripped?: number;
  latencyMs?: number;
  /** Present only for a turn that ran against a registered custom agent. */
  agentId?:   string | null;
  orgId?:     string | null;
  matterId?:  string | null;
  /**
   * Service-role client for the durable sink. Omit it and the observation is
   * emitted to the structured log only — see the KNOWN GAP below.
   */
  supabase?:  SupabaseClient;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/**
 * Records one agent turn.
 *
 * NEVER THROWS, and never rejects. An observation is a side effect of answering;
 * a failure to record must not become a failure to answer, and must not turn a
 * successful turn into a 500 at the very last statement of the route.
 *
 * KNOWN GAP — the durable sink is conditional.
 *   agent_execution_logs requires NOT NULL agent_id (FK custom_agents) and
 *   org_id (FK firms). The copilot route answers as one of the ten built-in
 *   agent types, which are prompt constants rather than custom_agents rows, and
 *   a user with no firm_members row has no org. Neither FK can be satisfied for
 *   those turns, so the insert is attempted only when both are present and the
 *   structured console line is the surviving record otherwise. Closing this
 *   needs a schema decision — either a nullable agent_id with a discriminator,
 *   or a separate observations table — and that is not a decision this function
 *   can make by loosening a constraint at the call site.
 */
export async function emitObservation(record: ObservationRecord): Promise<void> {
  const {
    requestId, userId, agentType, outcome, modelInvoked, query, chunkIds,
    sentencesTotal, sentencesStripped, latencyMs, agentId, orgId, matterId,
    supabase,
  } = record;

  const queryHash = typeof query === 'string' ? sha256(query) : null;

  // The structured line. Greppable by requestId, and carrying no query text,
  // no answer text and no PII (I-A14).
  console.info('[observation]', JSON.stringify({
    request_id:         requestId,
    user_id:            userId,
    agent_type:         agentType,
    grounding_outcome:  outcome,
    model_invoked:      modelInvoked,
    query_sha256:       queryHash,
    retrieved_count:    chunkIds?.length ?? 0,
    sentences_total:    sentencesTotal ?? null,
    sentences_stripped: sentencesStripped ?? null,
    latency_ms:         latencyMs ?? null,
  }));

  if (!supabase || !agentId || !orgId || !userId || !queryHash) return;

  try {
    const { error } = await supabase.from('agent_execution_logs').insert({
      agent_id:            agentId,
      org_id:              orgId,
      user_id:             userId,
      matter_id:           matterId ?? null,
      query_sha256:        queryHash,
      retrieved_chunk_ids: chunkIds ?? [],
      retrieved_count:     chunkIds?.length ?? 0,
      grounding_outcome:   outcome,
      model_invoked:       modelInvoked,
      sentences_total:     sentencesTotal ?? null,
      sentences_stripped:  sentencesStripped ?? null,
      latency_ms:          latencyMs ?? null,
    });

    if (error) {
      console.error('[observation] durable insert failed', {
        requestId, error: error.message,
      });
    }
  } catch (err) {
    console.error('[observation] durable insert threw', { requestId, err });
  }
}
