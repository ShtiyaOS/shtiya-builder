/**
 * -- I-A16: no org-private identifier or PII may transit through model output.
 *
 * Deliberately over-inclusive. A redaction gate that errs toward redacting is
 * recoverable — the reader asks again; one that errs toward passing is not.
 * The bare nine-digit pattern in particular will catch things that are not
 * routing numbers, and that is the intended trade.
 */
const PII_PATTERNS: Array<{ label: string; re: RegExp }> = [
  { label: 'ssn',           re: /\b\d{3}-\d{2}-\d{4}\b/g },
  { label: 'ein',           re: /\b\d{2}-\d{7}\b/g },
  { label: 'aba_routing',   re: /\b\d{9}\b/g },
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
