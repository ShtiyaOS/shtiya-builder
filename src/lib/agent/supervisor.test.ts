import { makeSupabaseMock } from '@/test-utils/supabase-mock';
import { AGENT_PROMPTS } from './prompts/index';
import type { ScopeSet } from './scope-set';

// Prefixed `mock` so the jest.mock factory may close over it. The factory runs
// when supervisor.ts requires 'openai'; `mockCreate` is only dereferenced later,
// when the route actually constructs a client, by which point it is initialised.
const mockCreate = jest.fn();

jest.mock('openai', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    chat: { completions: { create: mockCreate } },
  })),
}));

import { supervisorRoute } from './supervisor';

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

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gpt-4o',
        response_format: { type: 'json_object' },
        messages: expect.arrayContaining([
          expect.objectContaining({
            role:    'system',
            content: AGENT_PROMPTS['legal_researcher'],
          }),
        ]),
      }),
    );

    // The scope travels as structured JSON, not as prose appended to the turn.
    const sent = mockCreate.mock.calls[0]![0] as {
      messages: Array<{ role: string; content: string }>;
    };
    const userMessage = sent.messages.find(m => m.role === 'user')!;
    const decoded = JSON.parse(userMessage.content);
    expect(decoded.query).toBe('hello');
    expect(decoded.scope.allowedPaths).toEqual([IN_SCOPE]);
    expect(decoded.scope.jurisdiction).toBe('US-NY');
    expect(decoded.requestId).toBe('req-1');

    // The system message is the constant itself — not a copy built around it.
    const systemMessage = sent.messages.find(m => m.role === 'system')!;
    expect(systemMessage.content).toBe(AGENT_PROMPTS['legal_researcher']);
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

  it('carries the synthesis query through when the plan is fully in scope', async () => {
    mockCreate.mockResolvedValue(planResponse([
      task(),
      task({
        task_id:      '44444444-4444-4444-4444-444444444444',
        task_kind:    'synthesis',
        target_paths: [IN_SCOPE],
        query:        'compose the answer',
      }),
    ]));

    const r = await run().result;
    expect(r.fallback).toBeUndefined();
    expect(r.content).toBe('compose the answer');
    // Workers are stubs until Task 3.16, so nothing is grounded yet.
    expect(r.citations).toEqual([]);
  });
});
