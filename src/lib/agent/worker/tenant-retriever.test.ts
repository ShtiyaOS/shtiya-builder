import * as fs   from 'fs';
import * as path from 'path';
import { retrieveTenantCitations } from './tenant-retriever';
import type { WorkerTask } from '../supervisor';

function mockSupabase(result: { data?: unknown; error?: { message: string } } = {}) {
  return {
    rpc: jest.fn(async () => ({
      data:  result.data ?? [],
      error: result.error ?? null,
    })),
  } as never;
}

const task: WorkerTask = {
  task_id:      'task-2',
  task_kind:    'tenant_retrieval',
  target_paths: ['ROOT.Org.o_acme.Playbooks'],
  query:        'change order approval threshold',
};

const row = {
  chunk_id:       'chunk-9',
  path:           'ROOT.Org.o_acme.Playbooks.ChangeOrders',
  document_title: 'Change Order Policy',
  content:        'Change orders above $10,000 require principal sign-off.',
  authority_cls:  'firm_policy',
  created_at:     '2025-04-02T14:11:00.000Z',
  rank:           0.41,
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('retrieveTenantCitations', () => {
  it('queries the tenant corpus through match_tenant_by_paths', async () => {
    const supabase = mockSupabase({ data: [row] });
    await retrieveTenantCitations(task, supabase);

    const rpc = (supabase as unknown as { rpc: jest.Mock }).rpc;
    expect(rpc).toHaveBeenCalledTimes(1);

    const [name, args] = rpc.mock.calls[0] as [string, Record<string, unknown>];
    expect(name).toBe('match_tenant_by_paths');
    expect(args.p_vault_paths).toEqual(['ROOT.Org.o_acme.Playbooks']);
    expect(args.p_query).toBe('change order approval threshold');
  });

  it('sends no org, threshold, or count parameter (I-A8)', async () => {
    const supabase = mockSupabase({ data: [row] });
    await retrieveTenantCitations(task, supabase);

    const args = (supabase as unknown as { rpc: jest.Mock }).rpc.mock.calls[0][1];
    expect(Object.keys(args).sort()).toEqual(['p_query', 'p_vault_paths']);
  });

  it('uses only the client it was given — never a service-role escalation (I-H14)', async () => {
    const supabase = mockSupabase({ data: [row] });
    await retrieveTenantCitations(task, supabase);

    // The RPC ran on the injected session client and nowhere else.
    expect((supabase as unknown as { rpc: jest.Mock }).rpc).toHaveBeenCalledTimes(1);

    // And the module cannot reach for one: nothing here imports the admin
    // client or reads the service-role key. A test that only asserted on the
    // mock would pass even if the module built its own privileged client.
    const source = fs.readFileSync(path.join(__dirname, 'tenant-retriever.ts'), 'utf8');
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toMatch(/createAdminClient/);
    expect(code).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
    expect(code).not.toMatch(/service_role/);
  });

  it('returns rows in the ValidCitation shape, dating them from created_at', async () => {
    const supabase = mockSupabase({ data: [row] });
    const citations = await retrieveTenantCitations(task, supabase);

    expect(citations).toEqual([
      {
        chunk_id:   'chunk-9',
        path:       'ROOT.Org.o_acme.Playbooks.ChangeOrders',
        instrument: 'Change Order Policy',
        as_of:      '2025-04-02',
        text:       'Change orders above $10,000 require principal sign-off.',
      },
    ]);
  });

  it('never emits an "undefined" instrument for an untitled chunk', async () => {
    const supabase = mockSupabase({ data: [{ ...row, document_title: null }] });
    const [citation] = await retrieveTenantCitations(task, supabase);

    expect(citation?.instrument).toBe('ROOT.Org.o_acme.Playbooks.ChangeOrders');
  });

  it('drops malformed rows', async () => {
    const supabase = mockSupabase({ data: [row, {}, { chunk_id: 42, path: 'x' }] });
    const citations = await retrieveTenantCitations(task, supabase);

    expect(citations).toHaveLength(1);
  });

  it('retrieves nothing when the task carries no target paths', async () => {
    const supabase = mockSupabase({ data: [row] });
    const citations = await retrieveTenantCitations({ ...task, target_paths: [] }, supabase);

    expect(citations).toEqual([]);
    expect((supabase as unknown as { rpc: jest.Mock }).rpc).not.toHaveBeenCalled();
  });

  it('retrieves nothing for a blank query rather than matching the whole subtree', async () => {
    const supabase = mockSupabase({ data: [row] });
    const citations = await retrieveTenantCitations({ ...task, query: '   ' }, supabase);

    expect(citations).toEqual([]);
    expect((supabase as unknown as { rpc: jest.Mock }).rpc).not.toHaveBeenCalled();
  });

  it('fails closed on an RPC error', async () => {
    const supabase = mockSupabase({ error: { message: 'permission denied for table tenant_corpus' } });
    await expect(retrieveTenantCitations(task, supabase)).resolves.toEqual([]);
  });

  it('returns nothing when RLS filters every row away', async () => {
    const supabase = mockSupabase({ data: [] });
    await expect(retrieveTenantCitations(task, supabase)).resolves.toEqual([]);
  });
});
