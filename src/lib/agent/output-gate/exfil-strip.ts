/**
 * -- I-A16: no org-private identifier or PII may transit through model output.
 *
 * Deliberately over-inclusive. A redaction gate that errs toward redacting is
 * recoverable — the reader asks again; one that errs toward passing is not.
 * The bare nine-digit pattern in particular will catch things that are not
 * routing numbers, and that is the intended trade.
 */
/**
 * ORDER IS LOAD-BEARING. Each pass rewrites the text the next pass sees, so a
 * broad pattern placed above a narrow one swallows the narrow one's match and
 * mislabels it. Structured identifiers (email, UUID) come first because they
 * are the only patterns that can CONTAIN a digit run one of the numeric
 * patterns would otherwise claim; the numeric patterns then run
 * longest-to-shortest.
 */
const PII_PATTERNS: Array<{ label: string; re: RegExp }> = [
  // Structured identifiers.
  { label: 'email', re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g },
  /**
   * Every org-private surrogate key on this platform is a UUID: chunk ids,
   * matter ids, user ids, storage object ids. A UUID in PROSE is an internal
   * handle that escaped, and it is never something a reader needs — the
   * citation list carries chunk ids in a structured field that does not pass
   * through this gate.
   */
  { label: 'uuid', re: /\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/g },

  // Formatted numeric identifiers, before the bare digit runs that would eat them.
  { label: 'ssn',   re: /\b\d{3}-\d{2}-\d{4}\b/g },
  { label: 'ein',   re: /\b\d{2}-\d{7}\b/g },
  /**
   * Punctuated and spaced phone forms, with an optional country code:
   * (212) 555-0147 · 212-555-0147 · 212.555.0147 · +1 212 555 0147.
   * The lookarounds keep it off longer digit runs, which belong to the bare
   * patterns below and carry different labels.
   */
  { label: 'phone', re: /(?<![\d-])(?:\+?\d{1,3}[\s.-])?(?:\(\d{3}\)|\d{3})[\s.-]\d{3}[\s.-]\d{4}(?!\d)/g },

  // Bare digit runs, longest first.
  { label: 'phone_bare',  re: /\b\d{10,11}\b/g },
  { label: 'aba_routing', re: /\b\d{9}\b/g },

  // Storage locations.
  { label: 'vault_raw_path', re: /\/vault-raw\/[^\s"']+/g },
  { label: 'document_path',  re: /\/documents\/[^\s"']+/g },
];

export interface ExfilStripResult {
  content:     string;
  triggered:   boolean;
  match_count: number;
  /** Which pattern families fired — for the observation record, never for the user. */
  labels: string[];
}

export function stripExfil(content: string): ExfilStripResult {
  let result = content;
  let totalMatches = 0;
  const labels: string[] = [];

  for (const { label, re } of PII_PATTERNS) {
    // A fresh regex per pass: the module-level literals carry /g, and sharing
    // lastIndex across calls makes the result depend on call order.
    const pattern = new RegExp(re.source, re.flags);
    const matches = result.match(pattern);
    if (matches && matches.length > 0) {
      totalMatches += matches.length;
      labels.push(label);
      result = result.replace(new RegExp(re.source, re.flags), '[REDACTED]');
    }
  }

  return {
    content:     result,
    triggered:   totalMatches > 0,
    match_count: totalMatches,
    labels,
  };
}
