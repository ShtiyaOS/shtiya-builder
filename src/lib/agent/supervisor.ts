import OpenAI from 'openai';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ScopeSet } from './scope-set';
import type { FallbackKey } from './fallback-templates';
import type { AgentType } from './prompts/index';
import { AGENT_PROMPTS } from './prompts/index';
import type { ValidCitation } from './output-gate/index';

/**
 * The supervisor: turns one user turn into a PLAN, then refuses to execute any
 * part of that plan that reaches outside the closed scope set.
 *
 * The planner is a model, so the plan is untrusted input. Everything below
 * treats it that way — a plan is a REQUEST to search particular subtrees, and
 * this file is what decides whether that request is honoured.
 *
 * NOTE ON TEMPLATE LITERALS: this file contains no backtick anywhere, in code
 * or in comment, on purpose. param-lint's I-A6 patterns all key on a template
 * literal reaching a system prompt, and the cheapest way to keep that
 * impossible is to have no template literals in the file at all.
 */

const SUPERVISOR_MODEL = 'gpt-4o';

const TASK_KINDS = ['authority_retrieval', 'tenant_retrieval', 'synthesis'] as const;
export type TaskKind = (typeof TASK_KINDS)[number];

export interface WorkerTask {
  task_id:      string;        // UUID
  task_kind:    TaskKind;
  target_paths: string[];      // ltree scope paths — validated against scopeSet.allowedPaths
  query:        string;
}

export interface SupervisorPlan {
  tasks: WorkerTask[];
}

export interface SupervisorRouteResult {
  content:   string;
  citations: ValidCitation[];
  fallback?: FallbackKey;
}

/**
 * A plan is only a plan if every field is the shape we expect.
 *
 * Fail CLOSED and fail WHOLE: a malformed task does not get quietly dropped
 * from an otherwise-valid plan, because dropping is a repair, and repairing a
 * planner's output is how a malformed target_paths becomes an unchecked one.
 * Any malformation discards the entire plan.
 */
function isWorkerTask(value: unknown): value is WorkerTask {
  if (typeof value !== 'object' || value === null) return false;
  const t = value as Record<string, unknown>;

  if (typeof t.task_id !== 'string' || t.task_id.length === 0) return false;
  if (typeof t.query !== 'string') return false;
  if (!TASK_KINDS.includes(t.task_kind as TaskKind)) return false;
  if (!Array.isArray(t.target_paths)) return false;
  if (!t.target_paths.every(p => typeof p === 'string' && p.length > 0)) return false;

  return true;
}

function parsePlan(raw: string | null | undefined): SupervisorPlan {
  if (typeof raw !== 'string' || raw.length === 0) return { tasks: [] };

  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return { tasks: [] };

    const tasks = (parsed as Record<string, unknown>).tasks;
    if (!Array.isArray(tasks)) return { tasks: [] };
    if (!tasks.every(isWorkerTask)) return { tasks: [] };

    return { tasks: tasks as WorkerTask[] };
  } catch {
    return { tasks: [] };
  }
}

/**
 * -- I-A6: the system prompt is a static compile-time constant selected from
 * AGENT_PROMPTS[agentType]. It is never built, concatenated or interpolated.
 *
 * -- I-A6: the scope set travels as a STRUCTURED JSON FIELD inside the user
 * message, never as prose. Prose context is indistinguishable from the user's
 * own words once it is in the transcript, which is exactly the injection the
 * live copilot route still carries and that Task 3.18 closes.
 */
async function callSupervisorLLM(params: {
  agentType:    AgentType;
  scopeSet:     ScopeSet;
  lastUserTurn: string;
  requestId:    string;
}): Promise<SupervisorPlan> {
  const { agentType, scopeSet, lastUserTurn, requestId } = params;

  const userContent = JSON.stringify({
    query: lastUserTurn,
    scope: {
      allowedPaths: scopeSet.allowedPaths,
      jurisdiction: scopeSet.jurisdiction,
      subjectKind:  scopeSet.subjectKind,
      subjectId:    scopeSet.subjectId,
    },
    requestId,
  });

  // Constructed per call, not at module load: the key is read when it is used,
  // and nothing is instantiated merely by importing this module.
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  try {
    const completion = await client.chat.completions.create({
      model: SUPERVISOR_MODEL,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: AGENT_PROMPTS[agentType] },
        { role: 'user',   content: userContent },
      ],
    });

    const choice = completion?.choices?.[0];
    return parsePlan(choice?.message?.content ?? null);
  } catch (err) {
    // A planner that cannot be reached produces no plan. It does not produce a
    // permissive one.
    console.error('[supervisor] planner call failed', { requestId, err });
    return { tasks: [] };
  }
}

/**
 * Records an attempt to plan against a path outside the caller's closed scope
 * set. This is a security event, so it must never be the reason a request
 * fails — the plan is already discarded by the time this runs, and whether the
 * audit row lands does not change that decision.
 *
 * KNOWN GAP: agent_observations does not exist in the schema yet. The live
 * database has agent_execution_logs (a per-execution grounding record with
 * NOT NULL agent_id/org_id FKs and a closed grounding_outcome CHECK) and
 * agent_sessions, neither of which is a generic observation sink. Until the
 * table is added, every insert here throws and is swallowed, so the console
 * line below is the ONLY surviving trace of a scope leak — it is written to be
 * greppable for that reason. See the report accompanying Task 3.15.
 */
export async function logScopeLeak(params: {
  requestId:     string;
  userId:        string;
  offendingPath: string;
  supabase:      SupabaseClient;
}): Promise<void> {
  const { requestId, userId, offendingPath, supabase } = params;

  try {
    const { error } = await supabase.from('agent_observations').insert({
      request_id: requestId,
      user_id:    userId,
      kind:       'scope_leak',
      payload:    { offendingPath },
      created_at: new Date().toISOString(),
    });

    if (error) {
      console.error('[supervisor] SCOPE_LEAK audit insert failed', {
        requestId, userId, offendingPath, error: error.message,
      });
    }
  } catch (err) {
    console.error('[supervisor] SCOPE_LEAK audit insert threw', {
      requestId, userId, offendingPath, err,
    });
  }
}

export async function supervisorRoute(params: {
  agentType: AgentType;
  scopeSet:  ScopeSet;
  messages:  Array<{ role: 'user' | 'assistant'; content: string }>;
  userId:    string;
  requestId: string;
  supabase:  SupabaseClient;
}): Promise<SupervisorRouteResult> {
  const { agentType, scopeSet, messages, userId, requestId, supabase } = params;

  // A denied scope never reaches a planner. Calling the model first and
  // checking afterwards would send the subject id and the user's question to a
  // third party on behalf of someone with no right to either.
  if (scopeSet.denied) {
    return { content: '', citations: [], fallback: 'scope_denied' };
  }

  // 1 — the turn being answered
  const userTurns = messages.filter(m => m.role === 'user');
  const lastUserTurn = userTurns.length > 0 ? userTurns[userTurns.length - 1]?.content : undefined;

  if (typeof lastUserTurn !== 'string' || lastUserTurn.trim() === '') {
    return { content: '', citations: [], fallback: 'no_authority_on_point' };
  }

  // 2 — plan
  const plan = await callSupervisorLLM({ agentType, scopeSet, lastUserTurn, requestId });

  // 3 — Plan validation. -- I-H16 / plan-lint
  //
  // The first out-of-scope path discards the ENTIRE plan. There is no partial
  // execution and no nearest-match repair: honouring the in-scope half of a
  // steered plan is still honouring a steered plan, and repairing an out-of-set
  // path is precisely how steering succeeds (HV-30).
  for (const task of plan.tasks) {
    for (const path of task.target_paths) {
      if (!scopeSet.allowedPaths.includes(path)) {
        await logScopeLeak({ requestId, userId, offendingPath: path, supabase });
        return { fallback: 'scope_denied', citations: [], content: '' };
      }
    }
  }

  // An empty plan means the planner returned nothing parseable. Reporting that
  // as an empty answer would read as "there is nothing to say" (I-A11).
  if (plan.tasks.length === 0) {
    return { content: '', citations: [], fallback: 'no_authority_on_point' };
  }

  // 4 — Worker dispatch. The retrieval workers land in Task 3.16; until then
  // these stubs return no citations, so a synthesis string produced here is
  // ungrounded and the Output Gate will refuse it. That is the correct interim
  // behaviour, not a gap to paper over.
  const retrievalTasks = plan.tasks.filter(t => t.task_kind !== 'synthesis');
  const workerResults = await Promise.all(
    retrievalTasks.map(_task => Promise.resolve([] as ValidCitation[])),
  );
  const allCitations = workerResults.flat();

  // 5
  return {
    content:   plan.tasks.find(t => t.task_kind === 'synthesis')?.query ?? '',
    citations: allCitations,
  };
}
