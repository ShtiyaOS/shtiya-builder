import type { SupabaseClient } from '@supabase/supabase-js';
import type { WorkerTask } from '../supervisor';
import type { ValidCitation } from '../output-gate/index';

/**
 * Tenant retrieval worker — the caller's own org material, and only theirs.
 *
 * WHY THIS ONE NEVER TOUCHES service_role
 *
 * Every authorization decision about a tenant chunk lives in two policies:
 * tc_read_v2 (owning org / cross-party disclosure / subject membership) and
 * tc_wall_override, which is RESTRICTIVE so that a screened user is screened
 * however they arrived (10850 §2). Those policies only run if the connection is
 * the caller's. A service-role client would bypass both, and the only way to
 * put them back would be to transcribe them into a query here — a second copy
 * of an ethical wall, free to drift from the one the database enforces. That is
 * the failure definer-lint's INVOKER_ONLY_RPCS list exists to prevent, and it
 * is not worth better recall.
 *
 * WHY IT IS FULL-TEXT AND NOT VECTOR
 *
 * Directly downstream of the same I-A10 revocation the authority worker routes
 * around: `authenticated` holds no SELECT (embedding) on tenant_corpus, so a
 * session-scoped connection cannot read the operand a cosine comparison needs.
 * The authority worker escapes this by running as service_role, which is
 * defensible for public statute and indefensible for a firm's own file. So this
 * worker ranks with websearch_to_tsquery/ts_rank instead (1090 §2).
 *
 * The asymmetry is real and is a recall cost, not a correctness one: a tenant
 * chunk that a vector search would have surfaced and full-text misses simply
 * does not become a citation, and an answer with fewer citations is refused by
 * the Output Gate rather than fabricated. Closing it requires either relaxing
 * I-A10 for this column or a SECURITY DEFINER function carrying a hand-copy of
 * both policies. Both are policy decisions, not implementation details.
 *
 * TRUST BOUNDARY
 *
 * As with the authority worker, task.target_paths arrives already validated
 * against the closed scope set by supervisorRoute() (I-H16). RLS is the second,
 * independent check — it is not this file's job to be the first.
 */

/** Rows returned by public.match_tenant_by_paths(). */
interface TenantMatchRow {
  chunk_id:       string;
  path:           string;
  document_title: string | null;
  content:        string | null;
  authority_cls:  string | null;
  created_at:     string | null;
  rank:           number | null;
}

/**
 * Retrieves citations from the tenant corpus for one worker task.
 *
 * @param task     A plan task whose target_paths the supervisor has already
 *                 validated against the closed scope set.
 * @param supabase MUST be the session-scoped client (`@/lib/supabase/server`).
 *                 RLS is the authorization boundary for this corpus; a
 *                 service-role client here would silently return other
 *                 tenants' rows.
 *
 * Fails closed: every failure path returns [], and the Output Gate refuses an
 * uncited answer (I-A11).
 */
export async function retrieveTenantCitations(
  task: WorkerTask,
  supabase: SupabaseClient,
): Promise<ValidCitation[]> {
  if (!Array.isArray(task?.target_paths) || task.target_paths.length === 0) {
    return [];
  }

  const query = typeof task.query === 'string' ? task.query.trim() : '';
  if (query === '') return [];

  const { data, error } = await supabase.rpc('match_tenant_by_paths', {
    p_vault_paths: task.target_paths,
    p_query:       query,
  });

  if (error) {
    console.error('[worker:tenant] retrieval failed', {
      task_id: task.task_id,
      error:   error.message,
    });
    return [];
  }

  const rows = (data ?? []) as TenantMatchRow[];

  return rows
    .filter(row => typeof row?.chunk_id === 'string' && typeof row?.path === 'string')
    .map(row => ({
      chunk_id:   row.chunk_id,
      path:       row.path,
      instrument: row.document_title ?? row.path,
      // tenant_corpus has no effective_from — playbook currency is governed by
      // screen_state, not by dates (see the currency-lint exclusion note). The
      // creation date is the only honest "as of" available for these chunks.
      as_of:      (row.created_at ?? '').slice(0, 10),
      text:       row.content ?? '',
    }));
}
