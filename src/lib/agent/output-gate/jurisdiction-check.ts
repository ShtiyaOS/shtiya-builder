import type { ScopeSet } from '../scope-set';
import type { ValidCitation } from './citation-check';

/**
 * Branches whose authority applies regardless of the subject's state:
 * federal law, and adopted model standards that carry no state label.
 */
const UNIVERSAL_ROOTS = [
  'ROOT.Law.US.Federal',
  'ROOT.Law.Federal',
  'ROOT.Standards',
  'ROOT.Investor',
];

export interface JurisdictionCheckResult {
  citations:      ValidCitation[];
  stripped_count: number;
}

/** 'US-NY' and 'US.NY' both denote the label sequence ['US','NY']. */
function jurisdictionLabels(jurisdiction: string): string[] {
  return jurisdiction.split(/[.\-_]/).filter(Boolean);
}

function labels(path: string): string[] {
  return path.split('.').filter(Boolean);
}

/** True when `needle` occurs as a CONTIGUOUS run of whole labels in `hay`. */
function containsLabelRun(hay: string[], needle: string[]): boolean {
  if (needle.length === 0) return false;
  for (let i = 0; i + needle.length <= hay.length; i++) {
    let hit = true;
    for (let j = 0; j < needle.length; j++) {
      if (hay[i + j] !== needle[j]) { hit = false; break; }
    }
    if (hit) return true;
  }
  return false;
}

function isWithinAny(path: string, roots: string[]): boolean {
  return roots.some(root => path === root || path.startsWith(`${root}.`));
}

/**
 * -- I-H22: a citation from jurisdiction A may not ground a claim about
 * jurisdiction B. New York procedure cited under a California matter is not a
 * weaker answer, it is a wrong one.
 *
 * Comparison is by LABEL, not by substring. `path.includes('US.N')` matches
 * 'ROOT.Law.US.NV' as readily as 'ROOT.Law.US.NY', and `includes('federal')`
 * matches any node with that word anywhere in it — a substring test on an ltree
 * path is not a jurisdiction test.
 */
export function checkJurisdiction(
  citations: ValidCitation[],
  scopeSet: ScopeSet,
): JurisdictionCheckResult {
  if (!scopeSet.jurisdiction) return { citations, stripped_count: 0 };

  const wanted = jurisdictionLabels(scopeSet.jurisdiction);
  const valid: ValidCitation[] = [];
  let stripped = 0;

  for (const citation of citations) {
    const path = citation.path;
    if (typeof path !== 'string' || path.length === 0) { stripped++; continue; }

    const universal   = isWithinAny(path, UNIVERSAL_ROOTS);
    const matchesScope = containsLabelRun(labels(path), wanted);

    if (universal || matchesScope) valid.push(citation);
    else stripped++;
  }

  return { citations: valid, stripped_count: stripped };
}
