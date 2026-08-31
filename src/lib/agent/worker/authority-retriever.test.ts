import { retrieveAuthorityCitations } from './authority-retriever';
import { embedQuery } from './embed';
import type { WorkerTask } from '../supervisor';

jest.mock('./embed', () => ({ embedQuery: jest.fn() }));

const mockEmbedQuery = embedQuery as jest.MockedFunction<typeof embedQuery>;

/** A 1536-dimension stand-in; only its identity matters to these tests. */
const VECTOR = Array.from({ length: 1536 }, () => 0.01);

function mockSupabase(result: { data?: unknown; error?: { message: string } } = {}) {
  return {
    rpc: jest.fn(async () => ({
      data:  result.data ?? [],
      error: result.error ?? null,
    })),
  } as never;
}

const task: WorkerTask = {
  task_id:      'task-1',
  task_kind:    'authority_retrieval',
  target_paths: ['ROOT.Law.US.NY', 'ROOT.Law.US.Federal'],
  query:        'summary judgment standard',
};

const row = {
  chunk_id:       'chunk-1',
  path:           'ROOT.Law.US.NY.CPLR.3212',
  document_title: 'CPLR 3212',
  content:        'Summary judgment standard.',
  authority_cls:  'enacted',
  effective_from: '2020-01-01',
  similarity:     0.88,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockEmbedQuery.mockResolvedValue(VECTOR);
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('retrieveAuthorityCitations', () => {
  it('calls match_authority_by_paths with the task paths as the pre-filter (I-A9)', async () => {
    const supabase = mockSupabase({ data: [row] });
    await retrieveAuthorityCitations(task, supabase);

    const rpc = (supabase as unknown as { rpc: jest.Mock }).rpc;
    expect(rpc).toHaveBeenCalledTimes(1);

    const [name, args] = rpc.mock.calls[0] as [string, Record<string, unknown>];
    expect(name).toBe('match_authority_by_paths');
    expect(args.p_vault_paths).toEqual(['ROOT.Law.US.NY', 'ROOT.Law.US.Federal']);
    expect(args.p_query_embedding).toBe(VECTOR);
  });

  it('passes p_as_of so the currency window is decided at the call site (I-A13)', async () => {
    const supabase = mockSupabase({ data: [row] });
    await retrieveAuthorityCitations(task, supabase);

    const args = (supabase as unknown as { rpc: jest.Mock }).rpc.mock.calls[0][1];
    expect(args.p_as_of).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('sends no visibility, threshold, org, or count parameter (I-A8)', async () => {
    const supabase = mockSupabase({ data: [row] });
    await retrieveAuthorityCitations(task, supabase);

    const args = (supabase as unknown as { rpc: jest.Mock }).rpc.mock.calls[0][1];
    expect(Object.keys(args).sort())
      .toEqual(['p_as_of', 'p_query_embedding', 'p_vault_paths']);
  });

  it('returns rows in the ValidCitation shape', async () => {
    const supabase = mockSupabase({ data: [row] });
    const citations = await retrieveAuthorityCitations(task, supabase);

    expect(citations).toEqual([
      {
        chunk_id:   'chunk-1',
        path:       'ROOT.Law.US.NY.CPLR.3212',
        instrument: 'CPLR 3212',
        as_of:      '2020-01-01',
        text:       'Summary judgment standard.',
      },
    ]);
  });

  it('never emits an "undefined" instrument for an untitled chunk', async () => {
    const supabase = mockSupabase({ data: [{ ...row, document_title: null }] });
    const [citation] = await retrieveAuthorityCitations(task, supabase);

    expect(citation?.instrument).toBe('ROOT.Law.US.NY.CPLR.3212');
  });

  it('drops malformed rows rather than emitting a citation with no chunk id', async () => {
    const supabase = mockSupabase({ data: [row, { path: 'ROOT.Law.US.NY' }, { chunk_id: 'x' }] });
    const citations = await retrieveAuthorityCitations(task, supabase);

    expect(citations).toHaveLength(1);
    expect(citations[0]?.chunk_id).toBe('chunk-1');
  });

  it('retrieves nothing when the task carries no target paths', async () => {
    const supabase = mockSupabase({ data: [row] });
    const citations = await retrieveAuthorityCitations({ ...task, target_paths: [] }, supabase);

    expect(citations).toEqual([]);
    expect((supabase as unknown as { rpc: jest.Mock }).rpc).not.toHaveBeenCalled();
  });

  it('does not query at all when the query cannot be embedded', async () => {
    mockEmbedQuery.mockResolvedValue(null);
    const supabase = mockSupabase({ data: [row] });

    const citations = await retrieveAuthorityCitations(task, supabase);

    expect(citations).toEqual([]);
    expect((supabase as unknown as { rpc: jest.Mock }).rpc).not.toHaveBeenCalled();
  });

  it('fails closed on an RPC error — including the permission denial a session client gets', async () => {
    const supabase = mockSupabase({
      error: { message: 'permission denied for function match_authority_by_paths' },
    });

    await expect(retrieveAuthorityCitations(task, supabase)).resolves.toEqual([]);
  });

  it('fails closed when the RPC returns null', async () => {
    const supabase = mockSupabase({ data: null });
    await expect(retrieveAuthorityCitations(task, supabase)).resolves.toEqual([]);
  });
});
