/**
 * DEMO MODE — a deliberate, loudly-labelled relaxation of two gates.
 *
 * WHY THIS EXISTS
 *
 * The HRAG function layer is not deployed to this database. Measured against
 * the live project: resolve_scope_set(), subject_party_for(),
 * jurisdiction_of_subject(), org_root() and coverage_status() all return
 * "Could not find the function ... in the schema cache", and authority_corpus
 * and tenant_corpus hold zero rows.
 *
 * With the real pipeline that produces exactly one behaviour, for every user
 * and every question: buildScopeSet() cannot ask whether the caller is a party,
 * so it denies; the Co-Pilot answers "This matter or subject is not within your
 * current access scope." Then the Output Gate has no citations to validate, so
 * even a working scope set would end in no_authority_on_point. Both are the
 * CORRECT fail-closed behaviours — and both make the product impossible to show.
 *
 * WHAT IT CHANGES, AND WHAT IT DOES NOT
 *
 * Relaxed, and only when the underlying capability is genuinely ABSENT:
 *   1. buildScopeSet() falls back to a scope set covering the requested subject
 *      and nothing else, instead of denying.
 *   2. The Output Gate lets an uncited answer through gates 4 and 5, flagged
 *      `grounded: false` so the UI can say so on the user's screen.
 *
 * NOT relaxed, in demo mode or out of it:
 *   - The exfil strip (I-A16) and tool-shape strip (I-A3) run on every answer.
 *   - An explicitly DENIED scope set is still denied. Demo mode fills a hole
 *     where the check could not run; it never overrides a check that ran and
 *     said no.
 *   - Ethical-wall screening still runs — screened_from_matter_for() IS
 *     deployed, so a walled matter is refused in demo mode too.
 *
 * HOW IT IS CONTROLLED
 *
 * Off unless COPILOT_DEMO_MODE is exactly 'true'. It is read per call rather
 * than captured at module load so that flipping the env var takes effect on the
 * next request instead of the next deploy. Turn it off and the platform returns
 * to failing closed, which is what should ship.
 */
export function isDemoMode(): boolean {
  return process.env.COPILOT_DEMO_MODE === 'true';
}

/**
 * True when a PostgREST error means "this function is not deployed" rather than
 * "this function ran and refused".
 *
 * The distinction is the whole safety argument for demo mode. PGRST202 is
 * raised when no function matches the name and argument list; a function that
 * exists and denies returns a normal result or a different SQLSTATE. Falling
 * back on the first kind is filling a hole; falling back on the second would be
 * overriding an authorization decision, which this must never do.
 */
export function isMissingFunction(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === 'PGRST202') return true;
  return /Could not find the function/i.test(error.message ?? '');
}
