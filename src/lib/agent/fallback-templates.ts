/**
 * The three things the platform says when it cannot ground an answer.
 *
 * Each says something DIFFERENT, and the difference is the point (fallback-lint
 * FL-3). "We looked and found nothing on point", "we have not finished indexing
 * this jurisdiction so we cannot tell you whether anything exists", and "this is
 * not yours to see" are three distinct epistemic states. Collapsing them into
 * one polite refusal tells the reader that no authority exists when the truth
 * may be that the corpus was never loaded.
 *
 * Written as single double-quoted literals rather than joined arrays so that
 * fallback-lint's FL-2 (non-empty) and FL-3 (pairwise-distinct) value checks can
 * actually read them — its extractor matches `key: "…"` and skips a key whose
 * value is an array expression.
 */
export const FALLBACK_TEMPLATES = {
  no_authority_on_point:
    "The available legal corpus does not contain a directly applicable authority for this question in the current jurisdiction. You should consult primary sources or qualified counsel before relying on any position.",

  coverage_incomplete:
    "The instrument set for this jurisdiction is not yet fully indexed. The platform cannot confirm whether an applicable authority exists. Check coverage status or consult primary sources directly.",

  scope_denied:
    "This matter or subject is not within your current access scope. If you believe this is an error, contact the matter's counsel of record.",
} as const satisfies Record<string, string>;

// -- fallback-lint FL-3, enforced at import time as well as in CI: two
// fallbacks that read identically are one fallback wearing two names.
const templateValues = Object.values(FALLBACK_TEMPLATES);
if (new Set(templateValues).size !== templateValues.length) {
  throw new Error('fallback-lint: duplicate fallback template detected');
}

export type FallbackKey = keyof typeof FALLBACK_TEMPLATES;

export function fallbackText(key: FallbackKey): string {
  return FALLBACK_TEMPLATES[key];
}
