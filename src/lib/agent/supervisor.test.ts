import { makeSupabaseMock } from '@/test-utils/supabase-mock';
import { AGENT_PROMPTS } from './prompts/index';
import type { ScopeSet } from './scope-set';

// Prefixed `mock` so the jest.mock factory may close over it. The factory runs
// when supervisor.ts requires 'openai'; `mockCreate` is only dereferenced later,
// when the route actually constructs a client, by which point it is initialised.
const mockCreate = jest.fn();

// The supervisor now calls Gemini (this deployment has no OPENAI_API_KEY).
// `mockCreate` keeps its name and its OpenAI-shaped return value; the adapter
// below narrows that to the plain string callGemini() actually resolves to, so
// every existing planResponse()-based test keeps working unchanged.
jest.mock('./gemini-client', () => ({
  callGemini: async (...args: unknown[]) => {
    const completion = await mockCreate(...args);
    return completion?.choices?.[0]?.message?.content ?? null;
  },
}));

// The two retrieval workers, and the service-role client only one of them may
// be handed. Mocked here so that this suite tests DISPATCH — which worker runs,
// on which client — and leaves each worker's own query shape to its own suite.
const mockRetrieveAuthority = jest.fn();
const mockRetrieveTenant    = jest.fn();
const mockAdminClient       = { __kind: 'service-role' };
const mockCreateAdminClient = jest.fn(() => mockAdminClient);

jest.mock('./worker/authority-retriever', () => ({
  retrieveAuthorityCitations: (...args: unknown[]) => mockRetrieveAuthority(...args),
}));
jest.mock('./worker/tenant-retriever', () => ({
  retrieveTenantCitations: (...args: unknown[]) => mockRetrieveTenant(...args),
}));
jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => mockCreateAdminClient(),
}));

import { supervisorRoute } from './supervisor';

const CITATION = {
  chunk_id:   'chunk-1',
  path:       'ROOT.Org.o_abc.Matter.m_xyz.Pleadings',
  instrument: 'CPLR 3212',
  as_of:      '2020-01-01',
  text:       'Summary judgment standard.',
};

const IN_SCOPE  = 'ROOT.Org.o_abc.Matter.m_xyz';
const OUT_SCOPE = 'ROOT.Org.o_OTHER.Matter.m_evilpath';

const scopeSet: ScopeSet = {
  denied:       false,
  allowedPaths: [IN_SCOPE],
  jurisdiction: 'US-NY',
  orgId:        'org-1',
  subjectKind:  'matter',
  subjectId:    'matter-1',
};

function planResponse(tasks: unknown[]) {
  return { choices: [{ message: { content: JSON.stringify({ tasks }) } }] };
}

function task(overrides: Record<string, unknown> = {}) {
  return {
    task_id:      '11111111-1111-1111-1111-111111111111',
    task_kind:    'authority_retrieval',
    target_paths: [IN_SCOPE],
    query:        'summary judgment standard',
    ...overrides,
  };
}

function run(
  messages: Array<{ role: 'user' | 'assistant'; content: string }> = [{ role: 'user', content: 'hello' }],
  scope: ScopeSet = scopeSet,
  supabase = makeSupabaseMock(),
) {
  return {
    supabase,
    result: supervisorRoute({
      agentType: 'legal_researcher',
      scopeSet:  scope,
      messages,
      userId:    'user-1',
      requestId: 'req-1',
      supabase:  supabase as never,
    }),
  };
}

/** Scope-leak audit rows recorded by the Supabase mock. */
function leaks(supabase: ReturnType<typeof makeSupabaseMock>) {
  return supabase.inserts.filter(i => i.payload?.kind === 'scope_leak');
}

describe('supervisorRoute', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreate.mockReset();
    mockRetrieveAuthority.mockResolvedValue([]);
    mockRetrieveTenant.mockResolvedValue([]);
    mockCreateAdminClient.mockReturnValue(mockAdminClient);
  });

  it('dispatches workers for a plan whose paths are all in scope', async () => {
    mockCreate.mockResolvedValue(planResponse([task()]));

    const { supabase, result } = run();
    const r = await result;

    expect(r.fallback).toBeUndefined();
    expect(leaks(supabase)).toHaveLength(0);
  });

  it('discards the ENTIRE plan on an out-of-scope path and audits it (I-H16)', async () => {
    mockCreate.mockResolvedValue(planResponse([task({ target_paths: [OUT_SCOPE] })]));

    const { supabase, result } = run();
    const r = await result;

    expect(r.fallback).toBe('scope_denied');
    expect(r.citations).toEqual([]);
    expect(r.content).toBe('');

    const audited = leaks(supabase);
    expect(audited).toHaveLength(1);
    expect(audited[0]!.table).toBe('agent_observations');
    expect(audited[0]!.payload.payload).toEqual({ offendingPath: OUT_SCOPE });
    expect(audited[0]!.payload.user_id).toBe('user-1');
  });

  it('discards the whole plan even when only ONE task strays (no partial execution)', async () => {
    // The first task is perfectly legitimate. Executing it and dropping the
    // second would be partial acceptance of a steered plan.
    mockCreate.mockResolvedValue(planResponse([
      task({ task_id: '22222222-2222-2222-2222-222222222222' }),
      task({ task_id: '33333333-3333-3333-3333-333333333333', target_paths: [IN_SCOPE, OUT_SCOPE] }),
    ]));

    const { supabase, result } = run();
    const r = await result;

    expect(r.fallback).toBe('scope_denied');
    expect(leaks(supabase)).toHaveLength(1);
    expect(leaks(supabase)[0]!.payload.payload).toEqual({ offendingPath: OUT_SCOPE });
  });

  it('sends the agent prompt verbatim as the system role, and scope as JSON in the user role (I-A6)', async () => {
    mockCreate.mockResolvedValue(planResponse([task()]));

    await run().result;

    const sent = mockCreate.mock.calls[0]![0] as {
      systemPrompt: string;
      userContent:  string;
      json?:        boolean;
    };

    expect(sent.json).toBe(true);

    // The system instruction OPENS with the reviewed constant verbatim. What
    // follows is a static plan-shape directive carrying no request input, so
    // nothing the caller sent can reach the system role (I-A6).
    expect(sent.systemPrompt.startsWith(AGENT_PROMPTS['legal_researcher'])).toBe(true);
    const appended = sent.systemPrompt.slice(AGENT_PROMPTS['legal_researcher'].length);
    expect(appended).not.toContain('hello');
    expect(appended).not.toContain(IN_SCOPE);

    // The scope travels as structured JSON, not as prose appended to the turn.
    const decoded = JSON.parse(sent.userContent);
    expect(decoded.query).toBe('hello');
    expect(decoded.scope.allowedPaths).toEqual([IN_SCOPE]);
    expect(decoded.scope.jurisdiction).toBe('US-NY');
    expect(decoded.requestId).toBe('req-1');
  });

  it('returns no_authority_on_point and never calls the planner without a user turn', async () => {
    const { result } = run([{ role: 'assistant', content: 'Hello' }]);
    const r = await result;

    expect(r.fallback).toBe('no_authority_on_point');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('never calls the planner for a denied scope set', async () => {
    const denied: ScopeSet = { ...scopeSet, denied: true, reason: 'walled', allowedPaths: [] };
    const { result } = run([{ role: 'user', content: 'what is on this matter' }], denied);
    const r = await result;

    expect(r.fallback).toBe('scope_denied');
    // The question and the subject id must not leave the platform on behalf of
    // someone with no right to either.
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('treats an unparseable planner response as no plan, not as a permissive one', async () => {
    mockCreate.mockResolvedValue({ choices: [{ message: { content: 'not json at all' } }] });

    const { supabase, result } = run();
    const r = await result;

    expect(r.fallback).toBe('no_authority_on_point');
    expect(leaks(supabase)).toHaveLength(0);
  });

  it('discards a plan whose target_paths is malformed rather than repairing it', async () => {
    mockCreate.mockResolvedValue(planResponse([task({ target_paths: 'ROOT.Org.o_abc' })]));

    const r = await run().result;
    expect(r.fallback).toBe('no_authority_on_point');
  });

  it('discards a plan carrying an unknown task_kind', async () => {
    mockCreate.mockResolvedValue(planResponse([task({ task_kind: 'exfiltrate' })]));

    const r = await run().result;
    expect(r.fallback).toBe('no_authority_on_point');
  });

  it('produces no plan when the planner call throws', async () => {
    mockCreate.mockRejectedValue(new Error('upstream 503'));
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const r = await run().result;

    expect(r.fallback).toBe('no_authority_on_point');
    // An unreachable planner is a real operational event and must be visible.
    expect(errorSpy).toHaveBeenCalledWith(
      '[supervisor] planner call failed',
      expect.objectContaining({ requestId: 'req-1' }),
    );
    errorSpy.mockRestore();
  });

  it('answers with the SYNTHESIS output, not the planner instruction', async () => {
    // Two model passes now: plan, then synthesise. Returning the synthesis
    // task's query as the answer — which is what this used to do — hands the
    // user an instruction to answer instead of an answer.
    mockCreate
      .mockResolvedValueOnce(planResponse([
        task(),
        task({
          task_id:      '44444444-4444-4444-4444-444444444444',
          task_kind:    'synthesis',
          target_paths: [IN_SCOPE],
          query:        'compose the answer',
        }),
      ]))
      .mockResolvedValueOnce({
        choices: [{ message: { content: 'CPLR 3212 governs summary judgment.' } }],
      });

    const r = await run().result;

    expect(r.fallback).toBeUndefined();
    expect(r.content).toBe('CPLR 3212 governs summary judgment.');
    expect(r.content).not.toBe('compose the answer');
    expect(mockCreate).toHaveBeenCalledTimes(2);

    // The synthesis pass is prose, not JSON, and carries the citations in the
    // USER payload rather than in the system instruction (I-A6).
    const synth = mockCreate.mock.calls[1]![0] as { systemPrompt: string; userContent: string; json?: boolean };
    expect(synth.json).toBeUndefined();
    expect(synth.systemPrompt.startsWith(AGENT_PROMPTS['legal_researcher'])).toBe(true);
    expect(JSON.parse(synth.userContent).question).toBe('compose the answer');
  });

  it('falls back rather than answering when synthesis cannot be reached', async () => {
    mockCreate
      .mockResolvedValueOnce(planResponse([task()]))
      .mockResolvedValueOnce({ choices: [{ message: { content: null } }] });

    const r = await run().result;
    expect(r.fallback).toBe('no_authority_on_point');
    expect(r.content).toBe('');
  });
});

// ── Worker dispatch (Tasks 3.16 / 3.17) ──────────────────────────────────────

describe('supervisorRoute worker dispatch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreate.mockReset();
    mockRetrieveAuthority.mockResolvedValue([]);
    mockRetrieveTenant.mockResolvedValue([]);
    mockCreateAdminClient.mockReturnValue(mockAdminClient);
  });

  it('runs the authority worker on a SERVICE-ROLE client (I-A10)', async () => {
    mockCreate.mockResolvedValue(planResponse([task()]));

    await run().result;

    expect(mockRetrieveAuthority).toHaveBeenCalledTimes(1);
    const [dispatched, client] = mockRetrieveAuthority.mock.calls[0]!;
    expect((dispatched as { task_kind: string }).task_kind).toBe('authority_retrieval');
    expect(client).toBe(mockAdminClient);
  });

  it('runs the tenant worker on the CALLER\'S client so RLS decides (I-H14)', async () => {
    mockCreate.mockResolvedValue(planResponse([task({ task_kind: 'tenant_retrieval' })]));

    const { supabase } = run();
    await run(undefined, undefined, supabase).result;

    expect(mockRetrieveTenant).toHaveBeenCalled();
    const [, client] = mockRetrieveTenant.mock.calls[0]!;
    expect(client).toBe(supabase);
    expect(client).not.toBe(mockAdminClient);
    // The tenant half of a plan must never cause a service-role client to exist.
    expect(mockCreateAdminClient).not.toHaveBeenCalled();
  });

  it('never builds a service-role client for a plan with no authority task', async () => {
    mockCreate.mockResolvedValue(planResponse([task({ task_kind: 'tenant_retrieval' })]));

    await run().result;

    expect(mockCreateAdminClient).not.toHaveBeenCalled();
    expect(mockRetrieveAuthority).not.toHaveBeenCalled();
  });

  it('merges citations from both corpora', async () => {
    mockRetrieveAuthority.mockResolvedValue([CITATION]);
    mockRetrieveTenant.mockResolvedValue([{ ...CITATION, chunk_id: 'chunk-2' }]);
    mockCreate.mockResolvedValue(planResponse([
      task(),
      task({ task_id: '55555555-5555-5555-5555-555555555555', task_kind: 'tenant_retrieval' }),
    ]));

    const r = await run().result;

    expect(r.citations.map(c => c.chunk_id).sort()).toEqual(['chunk-1', 'chunk-2']);
  });

  it('dispatches no worker for a synthesis task', async () => {
    mockCreate.mockResolvedValue(planResponse([
      task({ task_kind: 'synthesis', query: 'compose the answer' }),
    ]));

    await run().result;

    expect(mockRetrieveAuthority).not.toHaveBeenCalled();
    expect(mockRetrieveTenant).not.toHaveBeenCalled();
  });

  it('degrades to no citations — never to a session client — when the service-role key is missing', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockCreateAdminClient.mockImplementation(() => {
      throw new Error('createAdminClient() requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to be set.');
    });
    mockCreate.mockResolvedValue(planResponse([task()]));

    const r = await run().result;

    expect(mockRetrieveAuthority).not.toHaveBeenCalled();
    expect(r.citations).toEqual([]);
    expect(errorSpy).toHaveBeenCalledWith(
      '[supervisor] service-role client unavailable',
      expect.objectContaining({ requestId: 'req-1' }),
    );
    errorSpy.mockRestore();
  });

  it('dispatches no worker at all once a plan is discarded for a scope leak', async () => {
    mockCreate.mockResolvedValue(planResponse([
      task(),
      task({ task_id: '66666666-6666-6666-6666-666666666666', target_paths: [OUT_SCOPE] }),
    ]));

    const r = await run().result;

    expect(r.fallback).toBe('scope_denied');
    expect(mockRetrieveAuthority).not.toHaveBeenCalled();
    expect(mockRetrieveTenant).not.toHaveBeenCalled();
  });
});
