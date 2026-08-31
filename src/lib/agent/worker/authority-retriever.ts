import type { SupabaseClient } from '@supabase/supabase-js';
import type { WorkerTask } from '../supervisor';
import type { ValidCitation } from '../output-gate/index';
import { embedQuery } from './embed';

/**
 * Authority retrieval worker — public legal authority, across every tenant.
 *
 * WHY THIS ONE RUNS AS service_role (the I-A10 / I-H14 resolution)
 *
 * I-H14 wants retrieval to run as the caller. I-A10 revokes
 * SELECT (embedding) on the corpora from `authenticated` (1075 §2), because a
 * dense vector is a partial disclosure of the text it encodes. A session-scoped
 * connection therefore cannot perform a vector search on authority_corpus at
 * all — reading the operand raises "permission denied for table". 1084's header
 * records the collision and defers it to the Phase 3 route contracts; this is
 * that contract for the authority corpus.
 *
 * The two invariants are reconcilable here, and only here, because public legal
 * authority is not tenant data. There is no per-caller authorization decision
 * being bypassed: the statute either applies to the scope path or it does not.
 *
 * WHAT service_role DOES NOT BUY
 *
 * BYPASSRLS means ac_read_v2 does not run, so the tier check inside
 * vault_visible_to() does not run either. match_authority_by_paths() therefore
 * PINS visibility to 'public' in SQL (1090 §1) — the licensed_pro and
 * attorney_only tiers are gated on a credential this connection cannot see, so
 * serving them from here would hand every user the highest tier on the
 * platform. The pin lives in the function, not in this file, so it cannot be
 * dropped by editing a query builder.
 *
 * TRUST BOUNDARY
 *
 * task.target_paths reaches this function ALREADY VALIDATED: supervisorRoute()
 * discards the entire plan if any path falls outside scopeSet.allowedPaths
 * (I-H16), so a path arriving here is a member of the caller's closed set. This
 * worker re-checks nothing and repairs nothing — it is not the authorization
 * boundary, and pretending otherwise would put a second, weaker copy of that
 * decision one refactor away from disagreeing with the first.
 */

/** Rows returned by public.match_authority_by_paths(). */
interface AuthorityMatchRow {
  chunk_id:       string;
  path:           string;
  document_title: string | null;
  content:        string | null;
  authority_cls:  string | null;
  effective_from: string | null;
  similarity:     number | null;
}

/**
 * Retrieves citations from the authority corpus for one worker task.
 *
 * @param task     A plan task whose target_paths the supervisor has already
 *                 validated against the closed scope set.
 * @param supabase MUST be a service-role client (`createAdminClient()`).
 *                 A session client cannot execute the RPC: 1090 §3 revokes
 *                 EXECUTE from `authenticated`, and 1090 §5 asserts that
 *                 revocation, so passing one produces an empty result and a
 *                 logged error rather than a silent downgrade.
 *
 * Fails closed. Every failure path returns [], and an empty citation list
 * causes the Output Gate to refuse the answer (I-A11) rather than let the model
 * speak ungrounded.
 */
export async function retrieveAuthorityCitations(
  task: WorkerTask,
  supabase: SupabaseClient,
): Promise<ValidCitation[]> {
  if (!Array.isArray(task?.target_paths) || task.target_paths.length === 0) {
    return [];
  }

  const embedding = await embedQuery(task.query);
  if (embedding === null) return [];

  // -- I-A13: p_as_of is passed explicitly rather than left to the SQL default,
  // so that the currency window is decided by the request and is visible at the
  // call site instead of hiding in a function signature.
  const asOf = new Date().toISOString().slice(0, 10);

  const { data, error } = await supabase.rpc('match_authority_by_paths', {
    p_vault_paths:     task.target_paths,
    p_query_embedding: embedding,
    p_as_of:           asOf,
  });

  if (error) {
    console.error('[worker:authority] retrieval failed', {
      task_id: task.task_id,
      error:   error.message,
    });
    return [];
  }

  const rows = (data ?? []) as AuthorityMatchRow[];

  return rows
    .filter(row => typeof row?.chunk_id === 'string' && typeof row?.path === 'string')
    .map(row => ({
      chunk_id:   row.chunk_id,
      path:       row.path,
      // The instrument is what a reader cites. A chunk with no title is a
      // corpus defect, but it must not become a citation reading "undefined".
      instrument: row.document_title ?? row.path,
      // as_of carries the date the authority took effect, which is the date a
      // reader needs to know whether it governed at the time in question.
      as_of:      row.effective_from ?? asOf,
      text:       row.content ?? '',
    }));
}
