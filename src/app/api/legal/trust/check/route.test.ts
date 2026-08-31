import { NextRequest } from 'next/server';
import { makeSupabaseMock, jsonPostInit } from '@/test-utils/supabase-mock';

jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: jest.fn() }));
import { createAdminClient } from '@/lib/supabase/admin';
import { POST } from './route';

const mockCreate = createAdminClient as unknown as jest.Mock;

const AUTH_USER = { id: 'auth-uid-checker' };
const CHECKER   = { id: 'c0000000-0000-0000-0000-0000000000c1', identity_subject_id: 'subj-checker' };
const MAKER     = { id: 'b0000000-0000-0000-0000-0000000000b1', identity_subject_id: 'subj-maker' };

const proposal = {
  trust_account_id: '00000000-0000-0000-0000-000000000001',
  matter_id:        '00000000-0000-0000-0000-000000000002',
  client_user_id:   '00000000-0000-0000-0000-000000000003',
  debit_kind:       'client_disbursement',
  amount_cents:     10000,
  memo:             'settlement draw',
  payee_ref:        'ACME-001',
  invoice_id:       null,
  maker_id:         MAKER.id,
};

const validBody = {
  action: 'approve',
  proposal,
  checker_auth_ref: 'stepup-ref-123',
  checker_saw_detail: true,
};

function request(body: object, token = 'valid-token') {
  return new NextRequest('http://localhost/api/legal/trust/check', jsonPostInit(body, token) as never);
}

function baseMock(
  overrides: Record<string, unknown> = {},
  rpc: Record<string, unknown> = {},
  insertResult?: { data: unknown; error: unknown },
) {
  return makeSupabaseMock({
    user: AUTH_USER,
    tables: {
      // read order: resolveAppUser(checker), then the maker lookup
      users: [CHECKER, MAKER],
      matters: { firm_id: 'firm-1' },
      firm_members: { member_role: 'partner' },
      ...overrides,
    },
    rpc: { screened_from_matter_for: false, is_matter_party_for: true, ...rpc },
    ...(insertResult ? { insertResult } : {}),
  });
}

describe('POST /api/legal/trust/check', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 when unauthenticated', async () => {
    mockCreate.mockReturnValue(makeSupabaseMock({ user: null }));
    const res = await POST(request(validBody, ''));
    expect(res.status).toBe(401);
  });

  it('refuses when checker_saw_detail is not asserted (I-L1)', async () => {
    mockCreate.mockReturnValue(baseMock());
    const res = await POST(request({ ...validBody, checker_saw_detail: false }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('INVALID_REQUEST');
  });

  it('returns 422 when maker and checker are the same natural person (I-L1)', async () => {
    // Distinct users rows, one identity subject — two seats, one person.
    mockCreate.mockReturnValue(baseMock({
      users: [CHECKER, { ...MAKER, identity_subject_id: CHECKER.identity_subject_id }],
    }));
    const res = await POST(request(validBody));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe('DUAL_CONTROL_VIOLATION');
    expect(body.detail).toMatch(/same natural person/);
  });

  it('returns 422 when either signer is not identity-verified (I-L1)', async () => {
    mockCreate.mockReturnValue(baseMock({
      users: [CHECKER, { ...MAKER, identity_subject_id: null }],
    }));
    const res = await POST(request(validBody));
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe('DUAL_CONTROL_VIOLATION');
  });

  it('returns 403 when the checker holds a non-qualifying seat (I-L2)', async () => {
    mockCreate.mockReturnValue(baseMock({ firm_members: { member_role: 'paralegal' } }));
    const res = await POST(request(validBody));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('INSUFFICIENT_ROLE');
  });

  it('returns 403 when the checker has no seat at the matter\'s firm (I-L2)', async () => {
    mockCreate.mockReturnValue(baseMock({ firm_members: null }));
    const res = await POST(request(validBody));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('INSUFFICIENT_ROLE');
  });

  it('returns an existence-protected 404 when the checker is walled (I-L11)', async () => {
    mockCreate.mockReturnValue(baseMock({}, { screened_from_matter_for: true }));
    const res = await POST(request(validBody));
    expect(res.status).toBe(404);
    expect(Buffer.byteLength(await res.text())).toBe(512);
  });

  it('a rejection writes nothing to the ledger (I-L4)', async () => {
    const mock = baseMock();
    mockCreate.mockReturnValue(mock);
    const res = await POST(request({ ...validBody, action: 'reject' }));
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe('rejected');
    expect(mock.inserts).toHaveLength(0);
  });

  it('approval inserts one row with both column families consistent', async () => {
    const mock = baseMock();
    mockCreate.mockReturnValue(mock);
    const res = await POST(request(validBody));
    expect(res.status).toBe(201);
    expect((await res.json()).status).toBe('posted');

    expect(mock.inserts).toHaveLength(1);
    const row = mock.inserts[0]!.payload;
    expect(mock.inserts[0]!.table).toBe('trust_ledger');
    // NOT NULL family and guard-read family must carry the same numbers
    expect(row.usd_amount_cents).toBe(row.amount_cents);
    expect(row.client_user_id).toBe(row.client_id);
    expect(row.maker_id).toBe(MAKER.id);
    expect(row.checker_id).toBe(CHECKER.id);
    expect(row.maker_id).not.toBe(row.checker_id);
    expect(row.direction).toBe('debit');
    expect(row.entry_kind).toBe('client_disbursement');
    expect(row.checker_saw_detail).toBe(true);
    expect(row.checker_auth_ref).toBe('stepup-ref-123');
    expect(typeof row.checker_attested_at).toBe('string');
  });

  it('maps a DB dual-control rejection onto 422', async () => {
    const mock = baseMock({}, {}, {
      data: null,
      error: { message: 'DUAL_CONTROL_REQUIRED: fresh step-up attestation on reviewed detail required' },
    });
    mockCreate.mockReturnValue(mock);
    const res = await POST(request(validBody));
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe('DUAL_CONTROL_VIOLATION');
  });
});
