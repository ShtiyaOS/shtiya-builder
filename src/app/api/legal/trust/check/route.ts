import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  getAuthenticatedUser,
  resolveAppUser,
  requireMatterParty,
  requireWallClear,
} from '@/lib/api/guards';

/**
 * POST /api/legal/trust/check — the checker half of dual control.
 *
 * This is where the trust_ledger row is created. See the header of
 * ../disburse/route.ts for why it cannot be created any earlier: the
 * BEFORE INSERT guard requires maker, checker and a fresh step-up attestation
 * in the same tuple.
 *
 * Everything the proposal asserts is re-derived here from the database. The
 * proposal is client-supplied and is treated as such — it selects WHICH
 * disbursement is being approved, it never establishes that the disbursement
 * is permissible.
 */

const TRUST_DEBIT_KINDS = [
  'client_disbursement',
  'fee_earned_transfer',
  'court_filing_fee',
  'expert_fee',
  'arbitration_fee',
  'refund_to_client',
] as const;

type DebitKind = (typeof TRUST_DEBIT_KINDS)[number];

const ENTRY_KIND_FOR: Record<DebitKind, string> = {
  client_disbursement: 'client_disbursement',
  fee_earned_transfer: 'earned_fee_transfer',
  court_filing_fee:    'court_ordered_payment',
  expert_fee:          'client_disbursement',
  arbitration_fee:     'client_disbursement',
  refund_to_client:    'client_disbursement',
};

// -- I-L2: firm_members.member_role (the live column; there is no firm_role).
// CHECK admits partner | associate | of_counsel | paralegal | admin — a
// paralegal or an admin seat is not a control over client money.
const CHECKER_ROLES = ['partner', 'associate', 'of_counsel'] as const;

const TrustCheckSchema = z.object({
  action: z.enum(['approve', 'reject']),
  proposal: z.object({
    trust_account_id: z.string().uuid(),
    matter_id:        z.string().uuid(),
    client_user_id:   z.string().uuid(),
    debit_kind:       z.enum(TRUST_DEBIT_KINDS),
    amount_cents:     z.number().int().positive(),
    memo:             z.string().max(500).nullable().optional(),
    payee_ref:        z.string().max(200).nullable().optional(),
    invoice_id:       z.string().uuid().nullable().optional(),
    maker_id:         z.string().uuid(),
  }),
  // The checker's fresh step-up. checker_saw_detail must be asserted by the
  // client because only the client knows whether the payee detail was rendered;
  // the DB refuses the insert when it is false (I-L1).
  checker_auth_ref:   z.string().min(1),
  checker_saw_detail: z.literal(true),
});

/** Maps a Postgres guard exception onto the HTTP status it deserves. */
function mapGuardError(message: string): { error: string; status: number } {
  if (message.includes('DUAL_CONTROL_REQUIRED'))       return { error: 'DUAL_CONTROL_VIOLATION',  status: 422 };
  if (message.includes('ACCOUNT_FROZEN'))              return { error: 'ACCOUNT_FROZEN',          status: 403 };
  if (message.includes('DEPOSIT_DISPUTED_OR_ZERO'))    return { error: 'SOLVENCY_CHECK_FAILED',   status: 422 };
  if (message.includes('I-L6'))                        return { error: 'SOLVENCY_CHECK_FAILED',   status: 422 };
  if (message.includes('I-L4'))                        return { error: 'CONTRA_REQUIRES_TARGET',  status: 422 };
  if (message.includes('I-L3'))                        return { error: 'INVALID_DEBIT_KIND',      status: 400 };
  return { error: 'LEDGER_INSERT_FAILED', status: 500 };
}

export async function POST(req: NextRequest) {
  const requestId = crypto.randomUUID();
  const supabase  = createAdminClient();

  const authUser = await getAuthenticatedUser(req, supabase);
  if (!authUser) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 });
  }
  const parsed = TrustCheckSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'INVALID_REQUEST', detail: parsed.error.format() }, { status: 400 });
  }
  const { action, proposal, checker_auth_ref } = parsed.data;

  const checker = await resolveAppUser(authUser.id, supabase);
  if (!checker) return NextResponse.json({ error: 'USER_NOT_FOUND' }, { status: 403 });

  // Wall and party, for the CHECKER — a screened attorney cannot approve their
  // way back into a matter they are screened off (I-L11, I-L12).
  const wallBlock = await requireWallClear(checker.id, proposal.matter_id, requestId, supabase);
  if (wallBlock) return wallBlock;
  const partyBlock = await requireMatterParty(checker.id, proposal.matter_id, requestId, supabase);
  if (partyBlock) return partyBlock;

  // -- I-L1: dual control compares PEOPLE, not user rows. Two seats held by one
  // natural person are one signature. Checked here for a legible 422; the DB
  // refuses the insert independently.
  if (proposal.maker_id === checker.id) {
    return NextResponse.json({ error: 'DUAL_CONTROL_VIOLATION' }, { status: 422 });
  }
  const { data: maker } = await supabase
    .from('users').select('id, identity_subject_id').eq('id', proposal.maker_id).maybeSingle();
  if (!maker) return NextResponse.json({ error: 'MAKER_NOT_FOUND' }, { status: 422 });

  if (!maker.identity_subject_id || !checker.identity_subject_id) {
    return NextResponse.json(
      { error: 'DUAL_CONTROL_VIOLATION', detail: 'both signers must be identity-verified' },
      { status: 422 },
    );
  }
  if (maker.identity_subject_id === checker.identity_subject_id) {
    return NextResponse.json(
      { error: 'DUAL_CONTROL_VIOLATION', detail: 'maker and checker are the same natural person' },
      { status: 422 },                                                     // -- I-L1
    );
  }

  // -- I-L2: the checker must hold a qualifying seat AT THE MATTER'S FIRM.
  // A partner seat at some other firm is not a control over this account.
  const { data: matter } = await supabase
    .from('matters').select('firm_id').eq('id', proposal.matter_id).maybeSingle();
  if (!matter) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  const { data: membership } = await supabase
    .from('firm_members')
    .select('member_role')
    .eq('user_id', checker.id)
    .eq('firm_id', matter.firm_id)
    .maybeSingle();

  const role = (membership as { member_role: string } | null)?.member_role;
  if (!role || !CHECKER_ROLES.includes(role as (typeof CHECKER_ROLES)[number])) {
    return NextResponse.json({ error: 'INSUFFICIENT_ROLE' }, { status: 403 });  // -- I-L2
  }

  // A rejection writes nothing. There is no row yet, so there is nothing to
  // reverse — a contra entry (I-L4) corrects a POSTED entry, and using one to
  // record a refusal would put money movement in the ledger that never moved.
  if (action === 'reject') {
    return NextResponse.json(
      { status: 'rejected', ledger_entry_id: null },
      { status: 200, headers: { 'X-Request-Id': requestId } },
    );
  }

  // The single atomic insert. Both column families are populated: the guard
  // reads amount_cents/client_id while the NOT NULL columns are
  // usd_amount_cents/client_user_id, and letting them drift would mean the
  // guard checks one number and the ledger stores another.
  const { data: entry, error: insertErr } = await supabase
    .from('trust_ledger')
    .insert({
      trust_account_id:    proposal.trust_account_id,
      matter_id:           proposal.matter_id,
      maker_id:            proposal.maker_id,
      checker_id:          checker.id,
      client_user_id:      proposal.client_user_id,
      client_id:           proposal.client_user_id,
      debit_kind:          proposal.debit_kind,
      entry_kind:          ENTRY_KIND_FOR[proposal.debit_kind],
      usd_amount_cents:    proposal.amount_cents,
      amount_cents:        proposal.amount_cents,
      direction:           'debit',
      status:              'pending',   // dual control satisfied; the bank has not cleared it
      memo:                proposal.memo      ?? null,
      payee_ref:           proposal.payee_ref ?? null,
      invoice_id:          proposal.invoice_id ?? null,
      checker_auth_ref:    checker_auth_ref,
      checker_saw_detail:  true,
      checker_attested_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (insertErr || !entry) {
    const mapped = mapGuardError(insertErr?.message ?? '');
    return NextResponse.json(
      { error: mapped.error, detail: insertErr?.message ?? null },
      { status: mapped.status, headers: { 'X-Request-Id': requestId } },
    );
  }

  return NextResponse.json(
    { status: 'posted', ledger_entry_id: entry.id },
    { status: 201, headers: { 'X-Request-Id': requestId } },
  );
}
