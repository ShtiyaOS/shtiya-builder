import type { SupabaseClient } from '@supabase/supabase-js';
import type { ScopeSet } from './scope-set';
import type { FallbackKey } from './fallback-templates';
import type { AgentType } from './prompts/index';
import { AGENT_PROMPTS } from './prompts/index';
import type { ValidCitation } from './output-gate/index';
import { createAdminClient } from '@/lib/supabase/admin';
import { retrieveAuthorityCitations } from './worker/authority-retriever';
import { retrieveTenantCitations } from './worker/tenant-retriever';
import { callGemini } from './gemini-client';

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

/**
 * Appended to the agent's reviewed prompt to describe the PLAN SHAPE the
 * planner must emit. It is a static constant carrying no request input, so
 * -- I-A6 holds: nothing the caller sends reaches the system instruction.
 *
 * It is a separate constant rather than part of each of the ten prompts
 * because the plan schema is a property of the supervisor, not of any one
 * agent's duties.
 */
const PLANNER_DIRECTIVE = [
  '',
  '---',
  'PLANNING MODE. Reply with a JSON object and nothing else:',
  '{"tasks":[{"task_id":"<uuid>","task_kind":"authority_retrieval|tenant_retrieval|synthesis",',
  '"target_paths":["<one of the scope.allowedPaths given to you, copied EXACTLY>"],',
  '"query":"<what to search for, or for synthesis the question to answer>"}]}',
  'You MUST copy target_paths verbatim from scope.allowedPaths. Never invent,',
  'extend, or guess a path: a plan containing any path not in that list is',
  'discarded in full and the user gets no answer. Always include exactly one',
  'synthesis task last, whose query restates the user question.',
].join('\n');

/**
 * Appended for the SYNTHESIS pass. Also static, also carrying no request input.
 *
 * -- I-A11 is stated to the model as well as enforced after it. The Output Gate
 * is the thing that actually holds the line, but a model told to ground its
 * answer produces less for the gate to strip.
 */
const SYNTHESIS_DIRECTIVE = [
  '',
  '---',
  'ANSWERING MODE. Answer the question in the user payload.',
  'Ground every factual claim in the supplied citations and refer to them by',
  'their instrument name. If the citations do not support an answer, say so',
  'plainly rather than filling the gap from memory.',
  'Write prose for a professional reader. Never emit JSON, XML, tool-call',
  'syntax, email addresses, phone numbers, or internal identifiers.',
].join('\n');

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

  // callGemini() is written not to throw, but the try/catch stays: a planner
  // that fails in an unforeseen way must still produce NO plan rather than an
  // exception that escapes to the route. Fail closed includes failing closed on
  // surprises.
  let raw: string | null = null;
  try {
    raw = await callGemini({
      systemPrompt: AGENT_PROMPTS[agentType] + PLANNER_DIRECTIVE,
      userContent,
      json: true,
    });
  } catch (err) {
    console.error('[supervisor] planner call failed', { requestId, err });
    return { tasks: [] };
  }

  if (raw === null) {
    // A planner that cannot be reached produces no plan. It does not produce a
    // permissive one.
    console.error('[supervisor] planner call failed', { requestId });
    return { tasks: [] };
  }

  return parsePlan(raw);
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

  // 4 — Worker dispatch.
  //
  // Two clients, on purpose, and the choice is per-corpus rather than per-call:
  //
  //   authority_retrieval runs on a SERVICE-ROLE client. Public legal authority
  //   is not tenant data, and I-A10 makes a vector search impossible on a
  //   session connection — see the header of worker/authority-retriever.ts for
  //   the full I-A10 / I-H14 argument. The tier is pinned to 'public' inside
  //   the SQL function, not here.
  //
  //   tenant_retrieval runs on the CALLER'S client. tc_read_v2 and the
  //   RESTRICTIVE tc_wall_override are the authorization boundary for that
  //   corpus, and they only run when the connection is the caller's.
  //
  // The service-role client is constructed lazily, so a plan with no authority
  // task never instantiates one and a missing service-role key is an error only
  // for the requests that actually need it.
  const authorityTasks = plan.tasks.filter(t => t.task_kind === 'authority_retrieval');
  const tenantTasks    = plan.tasks.filter(t => t.task_kind === 'tenant_retrieval');

  let adminClient: SupabaseClient | null = null;
  if (authorityTasks.length > 0) {
    try {
      adminClient = createAdminClient() as unknown as SupabaseClient;
    } catch (err) {
      // No service-role key configured. The authority half of the plan simply
      // yields nothing; the Output Gate then refuses an uncited answer rather
      // than this function inventing one.
      console.error('[supervisor] service-role client unavailable', { requestId, err });
    }
  }

  const workerResults = await Promise.all([
    ...authorityTasks.map(task =>
      adminClient === null
        ? Promise.resolve([] as ValidCitation[])
        : retrieveAuthorityCitations(task, adminClient)),
    ...tenantTasks.map(task => retrieveTenantCitations(task, supabase)),
  ]);
  const allCitations = workerResults.flat();

  // 5 — Synthesis.
  //
  // Until now this returned the planner's synthesis QUERY as the answer, which
  // is an instruction to answer, not an answer. That made the whole pipeline
  // incapable of producing content no matter how well retrieval went. The
  // second model pass below is what turns validated citations into prose.
  //
  // -- I-A6 again: the citations travel as a STRUCTURED JSON payload in the
  // user turn. They are not pasted into the system instruction, and the system
  // instruction remains the reviewed constant plus a static directive.
  const synthesisTask = plan.tasks.find(t => t.task_kind === 'synthesis');
  const question = synthesisTask?.query ?? lastUserTurn;

  const answer = await callGemini({
    systemPrompt: AGENT_PROMPTS[agentType] + SYNTHESIS_DIRECTIVE,
    userContent: JSON.stringify({
      question,
      jurisdiction: scopeSet.jurisdiction,
      citations: allCitations.map(c => ({
        instrument: c.instrument,
        as_of:      c.as_of,
        text:       c.text,
      })),
    }),
  });

  if (answer === null) {
    // The model could not be reached. That is silence, and silence gets a
    // fallback key rather than an empty bubble (I-A11).
    return { content: '', citations: [], fallback: 'no_authority_on_point' };
  }

  // The reviewed prompts instruct the model, in their own words, to "respond:
  // no_authority_on_point" when it cannot ground a claim. That is a KEY, not an
  // answer — passing it through as prose shows the reader a raw enum value
  // where the fallback template belongs, and FL-3 exists precisely so those
  // templates say different things. Measured: a live turn returned the bare
  // string 'no_authority_on_point' to the client.
  const declared = asFallbackKey(answer);
  if (declared) {
    return { content: '', citations: [], fallback: declared };
  }

  return { content: answer, citations: allCitations };
}

/**
 * Recognises a response that is a fallback KEY rather than an answer.
 *
 * Deliberately narrow. It fires only when the key is essentially the WHOLE
 * response — a genuine answer that happens to discuss one of these terms at
 * length must not be swallowed, because turning a real answer into a refusal is
 * the more damaging error of the two.
 */
function asFallbackKey(text: string): FallbackKey | null {
  const keys: FallbackKey[] = ['no_authority_on_point', 'coverage_incomplete', 'scope_denied'];

  // Strip quotes, list bullets, trailing punctuation and any leading label the
  // model may have added ("Response:", "Answer -", and so on).
  const cleaned = text
    .trim()
    .replace(/^[\s>*\-#"']+/, '')
    .replace(/^[A-Za-z ]{0,12}[:\-—]\s*/, '')
    .replace(/["'.\s]+$/, '')
    .toLowerCase();

  for (const key of keys) {
    if (cleaned === key) return key;
  }

  // A very short response that is nothing but a key plus a few filler words.
  if (cleaned.length <= 60) {
    for (const key of keys) {
      if (new RegExp('(^|\\W)' + key + '($|\\W)').test(cleaned)) return key;
    }
  }

  return null;
}
