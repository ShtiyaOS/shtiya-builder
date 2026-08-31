import { stripToolShapes } from './tool-shape-strip';

/**
 * -- I-A3, Gate 5. Two distinct harms, and the tests separate them:
 * a model narrating its plumbing in prose, and prose that a downstream parser
 * could mistake for an instruction.
 */
describe('stripToolShapes — tag forms', () => {
  it.each([
    ['<tool_code>search("cplr 3212")</tool_code>', 'tool_code'],
    ['<tool_call>{"name":"lookup"}</tool_call>',   'tool_call'],
    ['<tool_use id="x">payload</tool_use>',        'tool_use'],
    ['<function_calls><invoke name="q"></invoke></function_calls>', 'function_calls'],
  ])('removes %s', block => {
    const result = stripToolShapes(`The rule is stated below. ${block} That is the standard.`);

    expect(result.triggered).toBe(true);
    expect(result.content).not.toMatch(/</);
    expect(result.content).toContain('The rule is stated below.');
    expect(result.content).toContain('That is the standard.');
  });

  it('removes an orphaned closing tag, not only a matched pair', () => {
    const result = stripToolShapes('Summary judgment is governed by CPLR 3212.</tool_code>');

    expect(result.triggered).toBe(true);
    expect(result.content).toBe('Summary judgment is governed by CPLR 3212.');
  });

  it('removes an orphaned opening tag', () => {
    const result = stripToolShapes('<tool_code> The answer follows.');

    expect(result.triggered).toBe(true);
    expect(result.content).toBe('The answer follows.');
  });

  it('falls back when the whole response was a tag block', () => {
    const result = stripToolShapes('<tool_code>search("x")</tool_code>');

    expect(result.triggered).toBe(true);
    expect(result.content).toBe('');
    expect(result.fallback).toBe('no_authority_on_point');
  });
});

describe('stripToolShapes — JSON object forms', () => {
  it('removes a whole call object, leaving no residue behind', () => {
    const result = stripToolShapes('Answer: {"tool": "lookup", "args": {"q": "3212"}} and then prose.');

    expect(result.triggered).toBe(true);
    expect(result.content).not.toContain('"tool"');
    expect(result.content).not.toContain('"lookup"');
    // The half-object bug: matching the marker and deleting only that much
    // leaves `"lookup"}` in the answer AND leaves the content non-empty, so the
    // "response was only a call shape" check never fires.
    expect(result.content).not.toContain('}');
    expect(result.content).toContain('Answer:');
    expect(result.content).toContain('and then prose.');
  });

  it('removes the name/arguments form', () => {
    const result = stripToolShapes('Prose. {"name": "search", "arguments": {"q": "x"}} More prose.');

    expect(result.triggered).toBe(true);
    expect(result.content).not.toContain('arguments');
  });

  it('removes several call shapes in one response', () => {
    const result = stripToolShapes('A {"tool":"one"} B {"function":"two"} C');

    expect(result.content).not.toContain('"tool"');
    expect(result.content).not.toContain('"function"');
    expect(result.content).toContain('A');
    expect(result.content).toContain('B');
    expect(result.content).toContain('C');
  });

  it('falls back when the response was only a call object', () => {
    const result = stripToolShapes('{"function": "lookup", "arguments": {}}');

    expect(result.triggered).toBe(true);
    expect(result.content).toBe('');
    expect(result.fallback).toBe('no_authority_on_point');
  });

  it('removes a mixed tag-and-object response entirely', () => {
    const result = stripToolShapes('<tool_code>{"tool": "lookup"}</tool_code>');

    expect(result.content).toBe('');
    expect(result.fallback).toBe('no_authority_on_point');
  });
});

describe('stripToolShapes — clean content', () => {
  it('passes prose through untouched', () => {
    const clean = 'CPLR 3212 governs summary judgment. The movant bears the initial burden.';
    const result = stripToolShapes(clean);

    expect(result.content).toBe(clean);
    expect(result.triggered).toBe(false);
    expect(result.fallback).toBeUndefined();
  });

  it('does not treat ordinary prose punctuation as a call shape', () => {
    const clean = 'The court held (at 3212(b)) that the burden shifts; see also Zuckerman.';
    expect(stripToolShapes(clean).content).toBe(clean);
  });

  it('leaves a JSON object that is not a call shape alone', () => {
    const clean = 'The schedule reads {"deadline": "2026-01-15"} in the stipulation.';
    const result = stripToolShapes(clean);

    expect(result.triggered).toBe(false);
    expect(result.content).toBe(clean);
  });
});
