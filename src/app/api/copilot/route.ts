import { NextResponse, type NextRequest } from 'next/server';
import type { UIMessage } from 'ai';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { buildScopeSet } from '@/lib/agent/scope-set';
import { resolveAgentType } from '@/lib/agent/type-resolver';
import { supervisorRoute } from '@/lib/agent/supervisor';
import { runOutputGate } from '@/lib/agent/output-gate/index';
import { fallbackText } from '@/lib/agent/fallback-templates';
import { emitObservation } from '@/lib/agent/observation';
import { isSubjectKind, toPlainTurns, outcomeFor, streamAnswer } from './helpers';

export const runtime = 'nodejs';

/**
 * POST /api/copilot
 *
 * Streaming backend for the terminal shell's Right Pane (`RightSidebar`).
 *
 * WHAT CHANGED IN TASK 3.18, AND WHY
 *
 * This route used to build a system prompt by interpolating a client-supplied
 * `context` string and hand it straight to `streamText`. That is three separate
 * violations at once, and the custom lint rules named all three:
 *
 *   param-lint (I-A6)  — a template literal carrying request input into the
 *     system role. Once prose from the client sits in the system prompt, the
 *     client is writing the agent's instructions.
 *   prompt-lint (I-A1) — a system prompt that was not one of the ten reviewed
 *     constants in src/lib/agent/prompts/.
 *   log-lint (I-A14)   — two return paths that left no observation behind.
 *
 * The replacement is the supervisor/worker/gate pipeline. This file no longer
 * calls a model at all. It resolves WHO is asking and WHAT they may read, hands
 * both to the supervisor, and passes everything the supervisor returns through
 * the Output Gate before a single byte reaches the client (I-A15).
 *
 * THE CLIENT NO LONGER SENDS PROSE CONTEXT
 *
 * The body is `{ messages, subject: { kind, id } }`. The subject is a
 * structured reference the SERVER resolves into a closed scope set; the old
 * free-text `context` field is gone, and a request carrying no subject gets the
 * scope_denied fallback rather than an unscoped answer. That is a real
 * behaviour change: a page must call `usePageContext(description, subject)`
 * before the Co-Pilot has anything it is entitled to answer from.
 *
 * EVERY RETURN BELOW IS A RESPONSE, AND EVERY RESPONSE IS OBSERVED (I-A14).
 * Pure helpers live in ./helpers.ts precisely so that stays true here.
 */

interface CopilotRequestBody {
  messages: UIMessage[];
  subject?: { kind?: string; id?: string };
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  const requestId = crypto.randomUUID();
  const supabase  = await createClient();

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    await emitObservation({
      requestId, userId: null, agentType: null,
      outcome: 'blocked_account_class', modelInvoked: false,
    });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // auth.uid() is NOT users.id. The users table carries its own surrogate key
  // and links to the auth user through auth_user_id (I-L14 relies on the
  // distinction: every *_for(p_user, …) primitive takes the surrogate). Passing
  // the auth uid straight through makes resolveAgentType() and
  // subject_party_for() both miss, and every request answers scope_denied.
  // Resolved on the SERVICE client, not the session client. This is an identity
  // lookup — "which users row is this authenticated principal?" — and the RLS
  // policies on users are written against that row's own id, so a session
  // client cannot read the row that tells it what its id is. It is keyed by the
  // verified auth.uid() from getUser() and returns exactly one row, so it
  // widens nothing: every authorization decision downstream still runs on the
  // session client.
  const { data: appUser } = await createAdminClient()
    .from('users').select('id').eq('auth_user_id', user.id).maybeSingle();

  const appUserId = (appUser as { id: string } | null)?.id ?? null;

  if (!appUserId) {
    await emitObservation({
      requestId, userId: null, agentType: null,
      outcome: 'blocked_account_class', modelInvoked: false,
    });
    return streamAnswer(fallbackText('scope_denied'), []);
  }

  const body  = (await request.json()) as CopilotRequestBody;
  const turns = toPlainTurns(body?.messages ?? []);
  const lastUserTurn = turns.filter(t => t.role === 'user').slice(-1)[0]?.content ?? '';

  // -- I-A8 / I-H15: the subject is a REFERENCE. The scope set derived from it
  // is computed server-side by resolve_scope_set(); nothing the client sends
  // widens it, and the planner may only select from what comes back.
  const subjectKind = body?.subject?.kind;
  const subjectId   = body?.subject?.id;

  if (!isSubjectKind(subjectKind) || typeof subjectId !== 'string' || subjectId === '') {
    // No subject means no scope set, and an agent with no scope has nothing it
    // is entitled to answer from. Saying so is the honest outcome; answering
    // anyway is exactly the behaviour this refactor removes.
    await emitObservation({
      requestId, userId: appUserId, agentType: null,
      outcome: 'blocked_wall', modelInvoked: false, query: lastUserTurn,
    });
    return streamAnswer(fallbackText('scope_denied'), []);
  }

  const scopeSet = await buildScopeSet({
    userId: appUserId, subjectKind, subjectId, supabase,
  });

  // -- I-A1: the agent type comes from the caller's platform_role and their
  // capacity on this subject, never from the request. resolveAgentType()
  // returns null rather than a default when neither resolves.
  // Also on the service client, and for the same reason as the identity lookup
  // above: this reads users.platform_role, which the session client cannot see.
  // Note this is NOT an authorization decision — the scope set already made
  // that, on the session client, before this line runs. resolveAgentType only
  // chooses WHICH reviewed prompt a permitted caller gets, and it refuses
  // (returns null) rather than defaulting when the role does not map.
  const agentType = await resolveAgentType({
    userId: appUserId, scopeSet, requestedType: undefined,
    supabase: createAdminClient() as never,
  });

  const matterId = scopeSet.subjectKind === 'matter' ? scopeSet.subjectId : null;

  if (scopeSet.denied || agentType === null) {
    await emitObservation({
      requestId, userId: appUserId, agentType,
      outcome: 'blocked_wall', modelInvoked: false, query: lastUserTurn,
      orgId: scopeSet.orgId, matterId,
    });
    return streamAnswer(fallbackText('scope_denied'), []);
  }

  // Plan, validate the plan against the closed scope set (I-H16), dispatch the
  // retrieval workers.
  const raw = await supervisorRoute({
    agentType, scopeSet, messages: turns, userId: appUserId, requestId, supabase,
  });

  // -- I-A15: no raw model response reaches a client without passing here.
  const gated = await runOutputGate({
    raw, agentType, scopeSet, requestId, supabase,
  });

  // -- FL-1 … FL-4: a silent turn is answered with the template that says WHICH
  // silence this is. The three templates read differently on purpose — "we
  // looked and found nothing", "we have not finished indexing this
  // jurisdiction", and "this is not yours to see" are three different facts.
  const answer = gated.fallback ? fallbackText(gated.fallback) : gated.content;
  const shownCitations = gated.fallback
    ? []
    : gated.citations.map(c => ({
        chunk_id:   c.chunk_id,
        instrument: c.instrument,
        as_of:      c.as_of,
      }));

  await emitObservation({
    requestId,
    userId:    appUserId,
    agentType,
    outcome:   outcomeFor(gated.fallback),
    modelInvoked: true,
    query:     lastUserTurn,
    chunkIds:  gated.citations.map(c => c.chunk_id),
    sentencesStripped: gated.telemetry.sentences_stripped,
    latencyMs: Date.now() - startedAt,
    orgId:     scopeSet.orgId,
    matterId,
  });

  return streamAnswer(answer, shownCitations, gated.grounded);
}
