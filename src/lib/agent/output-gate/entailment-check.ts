import type { FallbackKey } from '../fallback-templates';
import type { ValidCitation } from './citation-check';

export interface EntailmentResult {
  content:        string;
  stripped_count: number;
  fallback?:      FallbackKey;
  /**
   * False when the classifier could not be reached, so nothing was actually
   * checked. The content passes through — destroying an answer because a
   * sidecar is down is its own failure — but the caller must be able to tell
   * "every sentence was entailed" from "no sentence was examined".
   */
  checked: boolean;
}

const ENTAILMENT_THRESHOLD = 0.7;
/** More than half the answer unsupported is not an answer with gaps. */
const STRIP_ESCALATION_RATIO = 0.5;

/**
 * -- I-A12: entailment is decided by a deterministic classifier, never by the
 * generative model. A model asked to grade its own output grades its own
 * fluency.
 */
export async function checkEntailment(
  content: string,
  citations: ValidCitation[],
): Promise<EntailmentResult> {
  const sentences = content
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(Boolean);

  if (sentences.length === 0) {
    return { content, stripped_count: 0, checked: false };
  }

  const endpoint = process.env.ENTAILMENT_ENDPOINT;
  if (!endpoint || citations.length === 0) {
    return { content, stripped_count: 0, checked: false };
  }

  const kept: string[] = [];
  let stripped = 0;
  let reachable = true;

  for (const sentence of sentences) {
    const scores = await Promise.all(citations.map(async citation => {
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ premise: citation.text, hypothesis: sentence }),
        });
        if (!res.ok) return null;
        const { score } = (await res.json()) as { score: number };
        return typeof score === 'number' ? score : null;
      } catch {
        return null;   // endpoint unreachable
      }
    }));

    if (scores.every(s => s === null)) {
      // Nothing was graded for this sentence. Keep it and remember why.
      reachable = false;
      kept.push(sentence);
      continue;
    }

    const maxScore = Math.max(...scores.map(s => s ?? 0));
    if (maxScore >= ENTAILMENT_THRESHOLD) kept.push(sentence);
    else stripped++;
  }

  if (stripped > sentences.length * STRIP_ESCALATION_RATIO) {
    return {
      content: '',
      stripped_count: stripped,
      fallback: 'no_authority_on_point',
      checked: reachable,
    };
  }

  return { content: kept.join(' '), stripped_count: stripped, checked: reachable };
}
