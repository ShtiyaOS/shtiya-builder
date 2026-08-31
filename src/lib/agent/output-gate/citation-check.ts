import type { SupabaseClient } from '@supabase/supabase-js';
import type { ScopeSet } from '../scope-set';
import type { FallbackKey } from '../fallback-templates';

export interface ValidCitation {
  chunk_id:   string;
  path:       string;
  instrument: string;
  as_of:      string;
  text:       string;
}

export interface CitationCheckResult {
  passed:    boolean;
  citations: ValidCitation[];
  fallback?: FallbackKey;
  /** Citations dropped because they named a path outside the closed scope set. */
  out_of_scope_count: number;
  /** Citations dropped because the chunk is superseded, stale, or unscreened. */
  not_live_count: number;
}

/** ltree containment, label-aware: `a` is `b` or a descendant of `b`. */
function isWithin(path: string, ancestor: string): boolean {
  return path === ancestor || path.startsWith(`${ancestor}.`);
}

/**
 * -- I-A11: every factual proposition must rest on a citation that is BOTH
 * live and in scope.
 *
 * Two separate questions, and the spec only asks the first. A chunk id can name
 * a perfectly current authority that sits in a subtree this caller's scope set
 * never included — the model can emit an id it saw in another conversation, or
 * simply guess one. Checking liveness alone would let that ground an answer, so
 * -- I-H15 is re-asserted here: the planner selects FROM the closed set, and a
 * citation outside it is discarded rather than repaired.
 */
export async function checkCitations(
  rawCitations: ValidCitation[],
  scopeSet: ScopeSet,
  supabase: SupabaseClient,
): Promise<CitationCheckResult> {
  const empty = async (): Promise<CitationCheckResult> => {
    // Which silence is this? Ask the coverage assertions before answering.
    const { data: coverageRows } = await supabase.rpc('coverage_status', {
      p_kind:         scopeSet.subjectKind,
      p_jurisdiction: scopeSet.jurisdiction ?? '',
      p_as_of:        new Date().toISOString().slice(0, 10),
    });

    const unsatisfied = ((coverageRows ?? []) as Array<{ satisfied: boolean }>)
      .some(r => r?.satisfied === false);

    return {
      passed: false,
      citations: [],
      fallback: unsatisfied ? 'coverage_incomplete' : 'no_authority_on_point',
      out_of_scope_count: 0,
      not_live_count: 0,
    };
  };

  if (rawCitations.length === 0) return empty();

  let outOfScope = 0;
  let notLive    = 0;
  const validCitations: ValidCitation[] = [];

  for (const citation of rawCitations) {
    // -- I-H15: in the closed set, or not at all.
    const inScope =
      typeof citation.path === 'string' &&
      scopeSet.allowedPaths.some(allowed => isWithin(citation.path, allowed));

    if (!inScope) { outOfScope++; continue; }

    const { data: ac } = await supabase
      .from('authority_corpus')
      .select('id')
      .eq('id', citation.chunk_id)
      .is('superseded_by', null)
      .gt('reverify_due', new Date().toISOString())
      .maybeSingle();

    let live = Boolean(ac);

    if (!live) {
      const { data: tc } = await supabase
        .from('tenant_corpus')
        .select('id')
        .eq('id', citation.chunk_id)
        .eq('screen_state', 'clear')
        .maybeSingle();
      live = Boolean(tc);
    }

    if (live) validCitations.push(citation);
    else notLive++;
  }

  if (validCitations.length === 0) {
    const result = await empty();
    return { ...result, out_of_scope_count: outOfScope, not_live_count: notLive };
  }

  return {
    passed: true,
    citations: validCitations,
    out_of_scope_count: outOfScope,
    not_live_count: notLive,
  };
}
