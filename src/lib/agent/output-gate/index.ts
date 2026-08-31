import type { SupabaseClient } from '@supabase/supabase-js';
import type { ScopeSet } from '../scope-set';
import type { FallbackKey } from '../fallback-templates';
import type { AgentType } from '../prompts/index';
import type { ValidCitation } from './citation-check';
import { checkCitations }    from './citation-check';
import { checkEntailment }   from './entailment-check';
import { checkJurisdiction } from './jurisdiction-check';
import { stripExfil }        from './exfil-strip';
import { stripToolShapes }   from './tool-shape-strip';
import { isDemoMode }        from '../demo-mode';

export type { ValidCitation } from './citation-check';

export interface RawModelResponse {
  content:   string;
  citations: ValidCitation[];
  fallback?: FallbackKey;
}

export interface GateResult {
  content:   string;
  citations: ValidCitation[];
  fallback?: FallbackKey;
  /**
   * False when the answer survived only because demo mode let an UNCITED
   * response past the citation gate. The UI must say so on screen — an
   * ungrounded answer that looks identical to a grounded one is the exact
   * failure I-A11 exists to prevent. True on every normal path.
   */
  grounded: boolean;
  gates: {
    citation_passed:          boolean;
    entailment_passed:        boolean;
    jurisdiction_passed:      boolean;
    exfil_strip_applied:      boolean;
    tool_shape_strip_applied: boolean;
  };
  /** Counters for the observation record. Never rendered to the user. */
  telemetry: {
    citations_out_of_scope: number;
    citations_not_live:     number;
    sentences_stripped:     number;
    entailment_checked:     boolean;
    jurisdiction_stripped:  number;
    exfil_matches:          number;
  };
}

/**
 * -- I-A15: no raw model response ever reaches a client without passing here.
 *
 * Five gates, in this order, because each one's input is the previous one's
 * output: you cannot judge entailment against citations you have not validated,
 * and you cannot redact text you have already discarded.
 *
 * Every exit that carries no content carries a fallback KEY instead. There is
 * no path out of this function that returns empty content and no explanation —
 * that combination is what renders as a blank answer, which reads to a user as
 * "there is nothing to say" (I-A11).
 */
export async function runOutputGate(params: {
  raw:       RawModelResponse;
  agentType: AgentType;
  scopeSet:  ScopeSet;
  requestId: string;
  supabase:  SupabaseClient;
}): Promise<GateResult> {
  const { raw, scopeSet, supabase } = params;

  const gates = {
    citation_passed:          false,
    entailment_passed:        false,
    jurisdiction_passed:      false,
    exfil_strip_applied:      false,
    tool_shape_strip_applied: false,
  };

  const telemetry = {
    citations_out_of_scope: 0,
    citations_not_live:     0,
    sentences_stripped:     0,
    entailment_checked:     false,
    jurisdiction_stripped:  0,
    exfil_matches:          0,
  };

  // A denied scope never reaches a model, but if one does, it does not get an
  // answer here either.
  if (scopeSet.denied) {
    return { content: '', citations: [], fallback: 'scope_denied', gates, telemetry, grounded: true };
  }

  // The supervisor already decided it had nothing groundable to say.
  if (raw.fallback) {
    return { content: '', citations: [], fallback: raw.fallback, gates, telemetry, grounded: true };
  }

  // Gate 1 — Citation (I-A11, I-H15)
  const citationResult = await checkCitations(raw.citations, scopeSet, supabase);
  telemetry.citations_out_of_scope = citationResult.out_of_scope_count;
  telemetry.citations_not_live     = citationResult.not_live_count;

  // DEMO MODE. authority_corpus and tenant_corpus are empty in this database,
  // so there is nothing for any answer to cite and this gate refuses every turn.
  // Rather than skip the gate, the answer is routed PAST gate 1 only, carried
  // through gates 4 and 5 unchanged, and returned with grounded:false so the UI
  // states plainly that nothing backs it. Load the corpus and this branch stops
  // being reachable on its own.
  const demoUngrounded = !citationResult.passed && isDemoMode() && raw.content.trim() !== '';

  if (!citationResult.passed && !demoUngrounded) {
    return {
      content: '', citations: [],
      fallback: citationResult.fallback ?? 'no_authority_on_point',
      gates, telemetry, grounded: true,
    };
  }

  if (demoUngrounded) {
    console.warn('[output-gate] DEMO MODE: releasing an UNCITED answer (grounded=false)');

    // Gates 4 and 5 still run. They are the two that protect the reader rather
    // than the argument, and they are never relaxed.
    const exfil = stripExfil(raw.content);
    gates.exfil_strip_applied = exfil.triggered;
    telemetry.exfil_matches   = exfil.match_count;

    const tools = stripToolShapes(exfil.content);
    gates.tool_shape_strip_applied = tools.triggered;

    if (tools.fallback || tools.content.trim() === '') {
      return {
        content: '', citations: [],
        fallback: tools.fallback ?? 'no_authority_on_point',
        gates, telemetry, grounded: true,
      };
    }

    return { content: tools.content, citations: [], gates, telemetry, grounded: false };
  }
  gates.citation_passed = true;

  // Gate 2 — Entailment (I-A12)
  const entailmentResult = await checkEntailment(raw.content, citationResult.citations);
  telemetry.sentences_stripped = entailmentResult.stripped_count;
  telemetry.entailment_checked = entailmentResult.checked;

  if (entailmentResult.fallback) {
    return {
      content: '', citations: citationResult.citations,
      fallback: entailmentResult.fallback, gates, telemetry, grounded: true,
    };
  }
  gates.entailment_passed = true;
  let content = entailmentResult.content;

  // Gate 3 — Jurisdiction (I-H22)
  const jurisdictionResult = checkJurisdiction(citationResult.citations, scopeSet);
  const finalCitations = jurisdictionResult.citations;
  telemetry.jurisdiction_stripped = jurisdictionResult.stripped_count;
  gates.jurisdiction_passed = jurisdictionResult.stripped_count === 0;

  // If the jurisdiction gate removed every citation, whatever is left in the
  // prose is grounded on nothing. Returning it with an empty citation list
  // would present an ungrounded answer as a cited one (I-A11).
  if (finalCitations.length === 0) {
    return {
      content: '', citations: [],
      fallback: 'no_authority_on_point', gates, telemetry, grounded: true,
    };
  }

  // Gate 4 — Exfil strip (I-A16)
  const exfilResult = stripExfil(content);
  content = exfilResult.content;
  gates.exfil_strip_applied = exfilResult.triggered;
  telemetry.exfil_matches   = exfilResult.match_count;

  // Gate 5 — Tool-shape strip (I-A3)
  const toolResult = stripToolShapes(content);
  content = toolResult.content;
  gates.tool_shape_strip_applied = toolResult.triggered;
  if (toolResult.fallback) {
    return {
      content: '', citations: finalCitations,
      fallback: toolResult.fallback, gates, telemetry, grounded: true,
    };
  }

  // Last guard: anything that emptied the content owes the caller a reason.
  if (content.trim() === '') {
    return {
      content: '', citations: finalCitations,
      fallback: 'no_authority_on_point', gates, telemetry, grounded: true,
    };
  }

  return { content, citations: finalCitations, gates, telemetry, grounded: true };
}
