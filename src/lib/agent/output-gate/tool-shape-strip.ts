import type { FallbackKey } from '../fallback-templates';

/**
 * -- I-A3: a tool-invocation shape must never appear in a prose response.
 *
 * Two reasons it matters. A model that emits a call shape in prose is a model
 * that has been talked into planning out loud, and prose that LOOKS like a tool
 * call is what a downstream parser may later execute.
 *
 * Removal is BALANCED, not prefix-based. Matching `{"tool":` and deleting just
 * that much leaves `"lookup"}` sitting in the answer — still tool residue, and
 * now non-empty, so the "the response was only a call shape" check never fires.
 * The whole object goes, or none of it.
 */

/** Markers that identify an object as a call shape once one is found. */
const OBJECT_MARKERS = [
  /"tool"\s*:/,
  /"function"\s*:/,
  /"name"\s*:[\s\S]*?"arguments"\s*:/,
];

/** Paired tag form used by several providers. */
const TAG_PAIR = /<tool_call>[\s\S]*?<\/tool_call>|<\/?tool_call>/g;

/**
 * Finds the object literal enclosing `index` and returns [start, end) of its
 * balanced braces, or null when the braces never close.
 */
function balancedObjectAround(text: string, index: number): [number, number] | null {
  let start = -1;
  let depth = 0;
  for (let pos = index; pos >= 0; pos--) {
    const ch = text[pos];
    if (ch === '}') depth++;
    else if (ch === '{') {
      if (depth === 0) { start = pos; break; }
      depth--;
    }
  }
  if (start === -1) return null;

  depth = 0;
  for (let pos = start; pos < text.length; pos++) {
    const ch = text[pos];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return [start, pos + 1];
    }
  }
  return null;
}

export interface ToolShapeResult {
  content:   string;
  triggered: boolean;
  fallback?: FallbackKey;
}

export function stripToolShapes(content: string): ToolShapeResult {
  let result = content;
  let triggered = false;

  if (TAG_PAIR.test(result)) {
    triggered = true;
    result = result.replace(new RegExp(TAG_PAIR.source, TAG_PAIR.flags), '');
  }
  TAG_PAIR.lastIndex = 0;

  // Repeat until no marker remains: one response may carry several call shapes.
  for (let guard = 0; guard < 32; guard++) {
    let removed = false;

    for (const marker of OBJECT_MARKERS) {
      const hit = marker.exec(result);
      if (!hit) continue;

      const span = balancedObjectAround(result, hit.index);
      if (!span) continue;

      result = result.slice(0, span[0]) + result.slice(span[1]);
      triggered = true;
      removed = true;
      break;
    }

    if (!removed) break;
  }

  const trimmed = result.trim();

  // Nothing left once the call shapes are gone means there was no prose answer
  // here — only a tool call wearing one.
  if (triggered && trimmed === '') {
    return { content: '', triggered: true, fallback: 'no_authority_on_point' };
  }

  return { content: trimmed, triggered };
}
