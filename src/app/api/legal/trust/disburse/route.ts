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
 * POST /api/legal/trust/disburse — propose a trust disbursement.
 *
 * WHY THIS ROUTE WRITES NOTHING TO trust_ledger
 * ---------------------------------------------
 * The task spec has this route insert a maker-only row with status 'pending'
 * and lets /check fill in the checker. The live schema does not permit that,
 * and the reason is the invariant, not an oversight:
 *
 *   - trust_ledger.checker_id is NOT NULL, and CHECK trust_ledger_no_dual_same_person
 *     requires maker_id <> checker_id.
 *   - trigger trust_ledger_disbursement_guard_v2 is BEFORE INSERT and demands,
 *     at insert time: both ids present, both identity-verified, distinct natural
 *     persons, checker_saw_detail = true, checker_auth_ref present, and
 *     checker_attested_at within the last 15 minutes.
 *
 * So the ledger row comes into existence at the moment of checker approval and
 * not before. A half-signed trust entry is not a state this ledger has. This
 * route therefore performs every pre-flight check and returns a validated
 * PROPOSAL; /check re-derives all of it independently and performs the single
 * atomic insert.
 *
 * The proposal is a UX convenience, not a credential: /check trusts none of it
 * and re-runs every check from the database. Persisting proposals (so that
 * REJECTED ones are auditable too) needs a table that does not exist yet — see
 * the report accompanying this change.
 */

// -- I-L3: closed enum, and it is the DB's closed enum. CHECK
// trust_ledger_debit_kind_check admits seven values; 'deposit' is the credit
// direction and is excluded here because this route only ever debits.
const TRUST_DEBIT_KINDS = [
  'client_disbursement',
  'fee_earned_transfer',
  'court_filing_fee',
  'expert_fee',
  'arbitration_fee',
  'refund_to_client',
] as const;

type DebitKind = (typeof TRUST_DEBIT_KINDS)[number];

/** debit_kind (payment instrument) → entry_kind (ledger classification). */
export const ENTRY_KIND_FOR: Record<DebitKind, string> = {
  client_disbursement: 'client_disbursement',
  fee_earned_transfer: 'earned_fee_transfer',
  court_filing_fee:    'court_ordered_payment',
  expert_fee:          'client_disbursement',
  arbitration_fee:     'client_disbursement',
  refund_to_client:    'client_disbursement',
};

const TrustDisburseSchema = z.object({
  trust_account_id: z.string().uuid(),
  matter_id:        z.string().uuid(),
  client_user_id:   z.string().uuid(),
  debit_kind:       z.enum(TRUST_DEBIT_KINDS),   // -- I-L3
  amount_cents:     z.number().int().positive(),
  memo:             z.string().max(500).optional(),
  payee_ref:        z.string().max(200).optional(),
  invoice_id:       z.string().uuid().optional(),
});

export async function POST(req: NextRequest) {
  const requestId = crypto.randomUUID();
  const supabase  = createAdminClient();

  // 1 — Auth
  const authUser = await getAuthenticatedUser(req, supabase);
  if (!authUser) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

  // 2 — Parse
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 });
  }
  const parsed = TrustDisburseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'INVALID_DEBIT_KIND', detail: parsed.error.format() },
      { status: 400 },                                                    // -- I-L3
    );
  }
  const {
    trust_account_id, matter_id, client_user_id,
    debit_kind, amount_cents, memo, payee_ref, invoice_id,
  } = parsed.data;

  // An earned-fee transfer without an invoice is refused by
  // guard_earned_fee_transfer at insert; refuse it here with a legible error.
  if (debit_kind === 'fee_earned_transfer' && !invoice_id) {
    return NextResponse.json({ error: 'INVOICE_REQUIRED' }, { status: 400 });  // -- I-L6
  }

  // 3 — users.id, never auth.uid()
  const caller = await resolveAppUser(authUser.id, supabase);
  if (!caller) return NextResponse.json({ error: 'USER_NOT_FOUND' }, { status: 403 });

  // 4 — Wall, existence-protected (I-L11, I-L12). Before the party check, so a
  // screened caller cannot tell a wall from a matter that was never created.
  const wallBlock = await requireWallClear(caller.id, matter_id, requestId, supabase);
  if (wallBlock) return wallBlock;

  // 5 — Matter party, also existence-protected
  const partyBlock = await requireMatterParty(caller.id, matter_id, requestId, supabase);
  if (partyBlock) return partyBlock;

  // 6 — Account standing and debit-block attestation (I-L5)
  const { data: acct } = await supabase
    .from('trust_accounts')
    .select('id, firm_id, debit_block_attested, attested_at, debit_block_reattest_due, frozen_at, frozen_reason, bond_expires_at, eo_expires_at')
    .eq('id', trust_account_id)
    .maybeSingle();

  if (!acct) return NextResponse.json({ error: 'TRUST_ACCOUNT_NOT_FOUND' }, { status: 404 });

  // The trust account must belong to the matter's firm. Without this a party to
  // matter M can name any trust account id and have every later check pass.
  const { data: matter } = await supabase
    .from('matters').select('firm_id').eq('id', matter_id).maybeSingle();
  if (!matter || matter.firm_id !== acct.firm_id) {
    return NextResponse.json({ error: 'TRUST_ACCOUNT_MATTER_MISMATCH' }, { status: 403 });
  }

  if (acct.frozen_at) {
    return NextResponse.json(
      { error: 'ACCOUNT_FROZEN', detail: acct.frozen_reason ?? null }, { status: 403 });
  }
  const now = Date.now();
  if (acct.bond_expires_at && new Date(acct.bond_expires_at).getTime() < now) {
    return NextResponse.json({ error: 'ACCOUNT_FROZEN', detail: 'bond lapsed' }, { status: 403 });
  }
  if (acct.eo_expires_at && new Date(acct.eo_expires_at).getTime() < now) {
    return NextResponse.json({ error: 'ACCOUNT_FROZEN', detail: 'E&O lapsed' }, { status: 403 });
  }

  // -- I-L5. The live columns are attested_at + debit_block_reattest_due; there
  // is no debit_block_attested_at, and the re-attestation deadline is stored,
  // not a 90-day window computed in the route.
  if (!acct.debit_block_attested || !acct.attested_at) {
    return NextResponse.json({ error: 'DEBIT_BLOCK_NOT_ATTESTED' }, { status: 403 });
  }
  if (!acct.debit_block_reattest_due ||
      new Date(acct.debit_block_reattest_due).getTime() < now) {
    return NextResponse.json(
      { error: 'DEBIT_BLOCK_NOT_ATTESTED', detail: 'attestation expired' }, { status: 403 });
  }

  // 7 — Per-client solvency (I-L6). There is no per_client_solvency_check RPC;
  // the maintained projection is trust_client_balances, which is what the
  // disbursement guard itself reads.
  const { data: balance } = await supabase
    .from('trust_client_balances')
    .select('balance_cents')
    .eq('trust_account_id', trust_account_id)
    .eq('matter_id', matter_id)
    .eq('client_id', client_user_id)
    .maybeSingle();

  const available = Number(balance?.balance_cents ?? 0);
  if (available < amount_cents) {
    return NextResponse.json(
      { error: 'SOLVENCY_CHECK_FAILED', detail: 'insufficient client balance' },
      { status: 422 },                                                     // -- I-L6
    );
  }

  // 8 — Validated proposal. No ledger row: see the header.
  return NextResponse.json(
    {
      status: 'proposed',
      proposal: {
        trust_account_id,
        matter_id,
        client_user_id,
        debit_kind,
        entry_kind: ENTRY_KIND_FOR[debit_kind],
        amount_cents,
        memo:       memo ?? null,
        payee_ref:  payee_ref ?? null,
        invoice_id: invoice_id ?? null,
        maker_id:   caller.id,
      },
      next: 'POST /api/legal/trust/check with this proposal and a fresh checker attestation',
    },
    { status: 202, headers: { 'X-Request-Id': requestId } },
  );
}
