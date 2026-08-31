import type { SupabaseClient } from '@supabase/supabase-js';

export type SubjectKind =
  | 'property' | 'deal' | 'facility' | 'matter'
  | 'work_package' | 'design_package' | 'tenancy' | 'representation' | 'org';

export type ScopeDenialReason =
  | 'not_a_party'
  | 'walled'
  | 'no_scope'
  /**
   * resolve_scope_set() refused even though the explicit party check passed.
   * That combination means the client carried no session — see the note below.
   */
  | 'sessionless_client';

export interface ScopeSet {
  denied:       boolean;
  reason?:      ScopeDenialReason;
  allowedPaths: string[];        // ltree path strings from resolve_scope_set()
  jurisdiction: string | null;
  orgId:        string | null;
  subjectKind:  SubjectKind;
  subjectId:    string;
}

/**
 * -- I-A8 / I-H15: the scope set is ALWAYS server-computed and CLOSED. The
 * planner selects from it; it can never add to it.
 *
 * THE CLIENT PASSED HERE MUST CARRY THE CALLER'S SESSION.
 * resolve_scope_set() re-derives the party check internally from
 * current_app_user_id(), which reads auth.uid(). On a service-role client
 * auth.uid() is NULL, so the function raises SCOPE_DENIED for every subject
 * alive — measured: a sessionless connection got SCOPE_DENIED where
 * subject_party_for(user, kind, id) answered normally.
 *
 * Rather than silently reporting that as "you are not a party", this function
 * runs the explicit-user check FIRST. If the caller genuinely is a party and
 * resolve_scope_set still refuses, the result is reported as
 * 'sessionless_client' — a wiring fault, not an authorization outcome.
 */
export async function buildScopeSet(params: {
  userId:      string;   // users.id (surrogate key, NOT auth.uid())
  subjectKind: SubjectKind;
  subjectId:   string;
  supabase:    SupabaseClient;
}): Promise<ScopeSet> {
  const { userId, subjectKind, subjectId, supabase } = params;

  const deny = (reason: ScopeDenialReason): ScopeSet => ({
    denied: true, reason, allowedPaths: [], jurisdiction: null, orgId: null,
    subjectKind, subjectId,
  });

  // Ethical wall, explicit-subject form (I-L11, I-L12, I-L14). Fails closed.
  if (subjectKind === 'matter') {
    const { data: walled, error } = await supabase.rpc('screened_from_matter_for', {
      p_user:   userId,
      p_matter: subjectId,
    });
    if (error || walled === true) return deny('walled');
  }

  // The authorization decision, asked about THIS user and not about the session.
  const { data: isParty, error: partyErr } = await supabase.rpc('subject_party_for', {
    p_user: userId,
    p_kind: subjectKind,
    p_id:   subjectId,
  });
  if (partyErr || isParty !== true) return deny('not_a_party');

  // The closed set itself (I-H15).
  const { data: scopeRows, error: scopeErr } = await supabase.rpc('resolve_scope_set', {
    p_kind:  subjectKind,
    p_id:    subjectId,
    p_as_of: new Date().toISOString().slice(0, 10),
  });

  if (scopeErr) {
    // The party check above already passed, so a refusal here is not about this
    // user's rights — it is a client with no session.
    return deny(
      /SCOPE_DENIED/.test(scopeErr.message ?? '') ? 'sessionless_client' : 'no_scope',
    );
  }

  const allowedPaths = ((scopeRows ?? []) as Array<{ scope_path: string }>)
    .map(r => r.scope_path)
    .filter((p): p is string => typeof p === 'string' && p.length > 0);

  if (allowedPaths.length === 0) return deny('no_scope');

  const { data: fm } = await supabase
    .from('firm_members').select('firm_id').eq('user_id', userId).limit(1).maybeSingle();

  // HV-30: jurisdiction comes off the SUBJECT ROW, never off the query.
  const { data: jurisdiction } = await supabase.rpc('jurisdiction_of_subject', {
    p_kind: subjectKind,
    p_id:   subjectId,
  });

  return {
    denied:       false,
    allowedPaths,
    jurisdiction: (jurisdiction as string | null) ?? null,
    orgId:        (fm as { firm_id: string } | null)?.firm_id ?? null,
    subjectKind,
    subjectId,
  };
}
