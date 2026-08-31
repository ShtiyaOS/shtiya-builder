import { NextRequest } from 'next/server';
import { makeSupabaseMock, jsonPostInit } from '@/test-utils/supabase-mock';

jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: jest.fn() }));
import { createAdminClient } from '@/lib/supabase/admin';
import { POST } from './route';

const mockCreate = createAdminClient as unknown as jest.Mock;

const AUTH_USER = { id: 'auth-uid-1' };
const CALLER    = { id: 'a0000000-0000-0000-0000-000000000001', identity_subject_id: 'subj-a' };
const ACCOUNT   = {
  id: '00000000-0000-0000-0000-000000000001',
  firm_id: 'firm-1',
  debit_block_attested: true,
  attested_at: '2026-08-01T00:00:00Z',
  debit_block_reattest_due: '2099-01-01T00:00:00Z',
  frozen_at: null, frozen_reason: null, bond_expires_at: null, eo_expires_at: null,
};
const MATTER = { firm_id: 'firm-1' };

const validBody = {
  trust_account_id: '00000000-0000-0000-0000-000000000001',
  matter_id:        '00000000-0000-0000-0000-000000000002',
  client_user_id:   '00000000-0000-0000-0000-000000000003',
  debit_kind:       'client_disbursement',
  amount_cents:     10000,
};

function request(body: object, token = 'valid-token') {
  return new NextRequest('http://localhost/api/legal/trust/disburse', jsonPostInit(body, token) as never);
}

/** Happy-path mock; `overrides` replaces individual table rows. */
function baseMock(overrides: Record<string, unknown> = {}, rpc: Record<string, unknown> = {}) {
  return makeSupabaseMock({
    user: AUTH_USER,
    tables: {
      users: [CALLER],
      trust_accounts: ACCOUNT,
      matters: MATTER,
      trust_client_balances: { balance_cents: 50000 },
      ...overrides,
    },
    rpc: { screened_from_matter_for: false, is_matter_party_for: true, ...rpc },
  });
}

describe('POST /api/legal/trust/disburse', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 when unauthenticated', async () => {
    mockCreate.mockReturnValue(makeSupabaseMock({ user: null }));
    const res = await POST(request(validBody, ''));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('UNAUTHENTICATED');
  });

  it('rejects a debit_kind outside the closed enum (I-L3)', async () => {
    mockCreate.mockReturnValue(baseMock());
    const res = await POST(request({ ...validBody, debit_kind: 'disbursement' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('INVALID_DEBIT_KIND');
  });

  it('returns an existence-protected 404 for a walled matter (I-L11)', async () => {
    mockCreate.mockReturnValue(baseMock({}, { screened_from_matter_for: true }));
    const res = await POST(request(validBody));
    expect(res.status).toBe(404);
    const text = await res.text();
    expect(Buffer.byteLength(text)).toBe(512);
    expect(JSON.parse(text).error).toBe('NOT_FOUND');
  });

  it('a non-party gets a response byte-identical to the walled one (I-L11)', async () => {
    mockCreate.mockReturnValue(baseMock({}, { is_matter_party_for: false }));
    const nonParty = await POST(request(validBody));
    mockCreate.mockReturnValue(baseMock({}, { screened_from_matter_for: true }));
    const walled = await POST(request(validBody));

    expect(nonParty.status).toBe(walled.status);
    const [a, b] = [await nonParty.text(), await walled.text()];
    expect(a).toBe(b);
    expect(Buffer.byteLength(a)).toBe(Buffer.byteLength(b));
  });

  it('returns 403 when the debit-block attestation has expired (I-L5)', async () => {
    mockCreate.mockReturnValue(baseMock({
      trust_accounts: { ...ACCOUNT, debit_block_reattest_due: '2020-01-01T00:00:00Z' },
    }));
    const res = await POST(request(validBody));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('DEBIT_BLOCK_NOT_ATTESTED');
  });

  it('returns 403 when the trust account belongs to another firm', async () => {
    mockCreate.mockReturnValue(baseMock({ matters: { firm_id: 'firm-OTHER' } }));
    const res = await POST(request(validBody));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('TRUST_ACCOUNT_MATTER_MISMATCH');
  });

  it('returns 422 when the client balance cannot cover the debit (I-L6)', async () => {
    mockCreate.mockReturnValue(baseMock({ trust_client_balances: { balance_cents: 999 } }));
    const res = await POST(request(validBody));
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe('SOLVENCY_CHECK_FAILED');
  });

  it('requires an invoice for an earned-fee transfer (I-L6)', async () => {
    mockCreate.mockReturnValue(baseMock());
    const res = await POST(request({ ...validBody, debit_kind: 'fee_earned_transfer' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('INVOICE_REQUIRED');
  });

  it('returns a validated proposal and writes no ledger row', async () => {
    const mock = baseMock();
    mockCreate.mockReturnValue(mock);
    const res = await POST(request(validBody));
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.status).toBe('proposed');
    expect(body.proposal.maker_id).toBe(CALLER.id);
    expect(body.proposal.entry_kind).toBe('client_disbursement');
    // The ledger row is created by /check, never here.
    expect(mock.inserts).toHaveLength(0);
  });
});
