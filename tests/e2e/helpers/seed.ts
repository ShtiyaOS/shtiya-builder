import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createServiceRoleClient,
  createSignedInUser,
  deleteAuthUser,
  type SignedInUser,
} from './supabase-test-client';

export type LifecycleRole =
  | 'ownerA'
  | 'ownerB'
  | 'attorney'
  | 'investor'
  | 'lender'
  | 'contractor'
  | 'tenant'
  | 'admin';

const ROLE_SPECS: Record<LifecycleRole, { role: string; fullName: string }> = {
  ownerA: { role: 'owner', fullName: 'E2E Owner A' },
  ownerB: { role: 'owner', fullName: 'E2E Owner B (neighbor)' },
  attorney: { role: 'attorney', fullName: 'E2E Attorney' },
  investor: { role: 'investor', fullName: 'E2E Investor' },
  lender: { role: 'lender', fullName: 'E2E Lender' },
  contractor: { role: 'contractor', fullName: 'E2E Contractor' },
  tenant: { role: 'tenant', fullName: 'E2E Tenant' },
  admin: { role: 'admin', fullName: 'E2E Admin' },
};

export interface LifecycleFixture {
  service: SupabaseClient;
  runId: string;
  users: Record<LifecycleRole, SignedInUser>;
  ids: {
    propertyA: string;
    propertyB: string;
    committee: string;
  };
  cleanup(): Promise<void>;
}

/**
 * Seeds everything the deal-lifecycle test needs that has no corresponding
 * "create" API route (properties, block_committees, per-role users) —
 * confirmed by grep that no route inserts block_committees or
 * financial_ledgers rows. financial_ledgers is intentionally NOT seeded
 * here since each describe block seeds the specific ledger row(s) it needs.
 *
 * `runId` suffixes every unique field (bbl, email) so reruns against a
 * non-ephemeral DB never collide with a previous run's leftover rows.
 */
export async function seedLifecycle(): Promise<LifecycleFixture> {
  const service = createServiceRoleClient();
  const runId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  const users = {} as Record<LifecycleRole, SignedInUser>;
  for (const key of Object.keys(ROLE_SPECS) as LifecycleRole[]) {
    const spec = ROLE_SPECS[key];
    users[key] = await createSignedInUser(service, {
      email: `e2e.${key}.${runId}@shtiya.test`,
      password: 'Test-Passw0rd!',
      role: spec.role,
      fullName: spec.fullName,
    });
  }

  const { data: propertyA, error: propAErr } = await service
    .from('properties')
    .insert({
      bbl: `E2E-${runId}-A`,
      address: '1 Test Ave, Brooklyn NY',
      owner_id: users.ownerA.user.id,
    })
    .select('id')
    .single();
  if (propAErr || !propertyA) throw new Error(`seed propertyA failed: ${propAErr?.message}`);

  const { data: propertyB, error: propBErr } = await service
    .from('properties')
    .insert({
      bbl: `E2E-${runId}-B`,
      address: '2 Test Ave, Brooklyn NY',
      owner_id: users.ownerB.user.id,
    })
    .select('id')
    .single();
  if (propBErr || !propertyB) throw new Error(`seed propertyB failed: ${propBErr?.message}`);

  const { data: committee, error: committeeErr } = await service
    .from('block_committees')
    .insert({
      name: `E2E Block Committee ${runId}`,
      target_member_count: 2,
      created_by: users.ownerA.user.id,
    })
    .select('id')
    .single();
  if (committeeErr || !committee) throw new Error(`seed committee failed: ${committeeErr?.message}`);

  return {
    service,
    runId,
    users,
    ids: { propertyA: propertyA.id, propertyB: propertyB.id, committee: committee.id },

    async cleanup() {
      // Best-effort, FK-safe reverse order. Errors are swallowed so one
      // failed delete (e.g. a row this run never created) doesn't abort
      // the rest of teardown.
      const ids = [propertyA.id, propertyB.id];
      const safely = async (fn: () => unknown) => {
        try {
          await fn();
        } catch {
          /* best-effort cleanup */
        }
      };

      await safely(() => service.from('deal_room_events').delete().eq('block_committee_id', committee.id));
      await safely(async () => {
        const { data } = await service.from('financial_ledgers').select('id').in('property_id', ids);
        const ledgerIds = (data ?? []).map((r) => r.id);
        if (ledgerIds.length) {
          await service.from('deal_room_events').delete().in('financial_ledger_id', ledgerIds);
        }
      });
      await safely(() => service.from('vision_inspections').delete().in('property_id', ids));
      await safely(() => service.from('financial_ledgers').delete().in('property_id', ids));
      // agreements MUST be deleted before documents, not after — agreements
      // rows carry a document_id FK into documents (fk_agreements_document,
      // 0001), pointing at the PSA placeholder doc POST /api/agreements
      // creates for each deal. Deleting documents first (the previous
      // order) makes that batch DELETE violate the FK; since it's wrapped
      // in safely(), the failure was silent, leaving every run's
      // property-scoped documents — and the users referenced by their
      // uploaded_by FK — permanently orphaned instead of cleaned up.
      await safely(() => service.from('agreements').delete().in('property_id', ids));
      await safely(() => service.from('documents').delete().in('property_id', ids));
      // The anonymous lead document has property_id = null and can't be
      // scoped by property — scope by run instead via the email in its
      // (base64-encoded) payload isn't queryable, so leads created by this
      // run are left for manual/periodic cleanup; they're inert test data.
      await safely(() => service.from('block_committee_members').delete().eq('block_committee_id', committee.id));
      await safely(() => service.from('block_committees').delete().eq('id', committee.id));
      await safely(() => service.from('properties').delete().in('id', ids));

      for (const u of Object.values(users)) {
        await safely(() => service.from('users').delete().eq('id', u.user.id));
        await safely(() => deleteAuthUser(service, u.user.id));
      }
    },
  };
}
