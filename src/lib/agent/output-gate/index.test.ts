import { runOutputGate } from './index';
import type { ScopeSet } from '../scope-set';
import type { ValidCitation } from './citation-check';
import { FALLBACK_TEMPLATES } from '../fallback-templates';

/**
 * Supabase stub for the gate: corpus lookups resolve to a live chunk unless
 * `liveChunk` says otherwise, and coverage_status is driven per test.
 */
function mockSupabase(options: { coverage?: Array<{ satisfied: boolean }>; liveChunk?: boolean } = {}) {
  const live = options.liveChunk ?? true;
  return {
    rpc: jest.fn(async (name: string) =>
      name === 'coverage_status'
        ? { data: options.coverage ?? [], error: null }
        : { data: null, error: null }),
    from: jest.fn(() => {
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      chain.select = jest.fn(self);
      chain.eq     = jest.fn(self);
      chain.is     = jest.fn(self);
      chain.gt     = jest.fn(self);
      chain.maybeSingle = jest.fn(async () => ({ data: live ? { id: 'chunk-1' } : null, error: null }));
      return chain;
    }),
  } as never;
}

const scopeSet: ScopeSet = {
  denied: false,
  allowedPaths: ['ROOT.Law.US.NY'],
  jurisdiction: 'US-NY',
  orgId: 'org-1',
  subjectKind: 'matter',
  subjectId: 'matter-1',
};

const citation: ValidCitation = {
  chunk_id: 'chunk-1',
  path: 'ROOT.Law.US.NY.CPLR',
  instrument: 'CPLR 3212',
  as_of: '2024-01-01',
  text: 'Summary judgment standard.',
};

function run(raw: { content: string; citations: ValidCitation[]; fallback?: 'no_authority_on_point' },
             supabase = mockSupabase(),
             scope: ScopeSet = scopeSet) {
  return runOutputGate({
    raw, agentType: 'legal_researcher', scopeSet: scope, requestId: 'req-1', supabase,
  });
}

describe('runOutputGate', () => {
  it('passes a clean, cited, in-jurisdiction response', async () => {
    const result = await run({ content: 'Summary judgment is governed by CPLR 3212.', citations: [citation] });
    expect(result.gates.citation_passed).toBe(true);
    expect(result.gates.jurisdiction_passed).toBe(true);
    expect(result.fallback).toBeUndefined();
    expect(result.content).toContain('CPLR 3212');
    expect(result.citations).toHaveLength(1);
  });

  it('returns no_authority_on_point when there are no citations and coverage is satisfied (I-A11)', async () => {
    const result = await run(
      { content: 'No answer available.', citations: [] },
      mockSupabase({ coverage: [{ satisfied: true }] }),
    );
    expect(result.fallback).toBe('no_authority_on_point');
    expect(result.content).toBe('');
  });

  it('returns coverage_incomplete when an assertion is unsatisfied', async () => {
    const result = await run(
      { content: 'No answer.', citations: [] },
      mockSupabase({ coverage: [{ satisfied: false }] }),
    );
    expect(result.fallback).toBe('coverage_incomplete');
  });

  it('distinguishes the two silences (FL-3)', async () => {
    expect(FALLBACK_TEMPLATES.no_authority_on_point)
      .not.toBe(FALLBACK_TEMPLATES.coverage_incomplete);
  });

  it('discards a citation whose path is outside the closed scope set (I-H15)', async () => {
    const foreign = { ...citation, path: 'ROOT.Org.o_deadbeef.Playbooks' };
    const result = await run({ content: 'Grounded on a chunk never in scope.', citations: [foreign] });
    expect(result.telemetry.citations_out_of_scope).toBe(1);
    expect(result.fallback).toBe('no_authority_on_point');
    expect(result.content).toBe('');
  });

  it('discards a citation whose chunk is superseded or unscreened', async () => {
    const result = await run(
      { content: 'Grounded on a dead chunk.', citations: [citation] },
      mockSupabase({ liveChunk: false }),
    );
    expect(result.telemetry.citations_not_live).toBe(1);
    expect(result.fallback).toBe('no_authority_on_point');
  });

  it('falls back rather than returning prose when the jurisdiction gate strips every citation (I-H22)', async () => {
    const california = { ...citation, path: 'ROOT.Law.US.CA.CCP' };
    const scope: ScopeSet = { ...scopeSet, allowedPaths: ['ROOT.Law.US'] };
    const result = await run({ content: 'California procedure says otherwise.', citations: [california] }, mockSupabase(), scope);
    expect(result.telemetry.jurisdiction_stripped).toBe(1);
    expect(result.gates.jurisdiction_passed).toBe(false);
    expect(result.fallback).toBe('no_authority_on_point');
    expect(result.content).toBe('');
    expect(result.citations).toHaveLength(0);
  });

  it('does not confuse a sibling state for the scoped one (I-H22)', async () => {
    const nevada = { ...citation, path: 'ROOT.Law.US.NV.Rules' };
    const scope: ScopeSet = { ...scopeSet, allowedPaths: ['ROOT.Law.US'] };
    const result = await run({ content: 'Nevada rule.', citations: [nevada] }, mockSupabase(), scope);
    expect(result.telemetry.jurisdiction_stripped).toBe(1);
  });

  it('keeps federal authority under a state-scoped subject', async () => {
    const federal = { ...citation, path: 'ROOT.Law.US.Federal.FAA' };
    const scope: ScopeSet = { ...scopeSet, allowedPaths: ['ROOT.Law.US'] };
    const result = await run({ content: 'The FAA governs.', citations: [federal] }, mockSupabase(), scope);
    expect(result.telemetry.jurisdiction_stripped).toBe(0);
    expect(result.citations).toHaveLength(1);
  });

  it('redacts an SSN (I-A16)', async () => {
    const result = await run({ content: 'The number 123-45-6789 appears here.', citations: [citation] });
    expect(result.content).not.toContain('123-45-6789');
    expect(result.content).toContain('[REDACTED]');
    expect(result.gates.exfil_strip_applied).toBe(true);
    expect(result.telemetry.exfil_matches).toBe(1);
  });

  it('redacts an email address, a phone number and a UUID reaching the client (I-A16)', async () => {
    const result = await run({
      content:
        'Write counsel@example.com or call 212-555-0147 about chunk ' +
        '3f2504e0-4f89-11d3-9a0c-0305e82c3301.',
      citations: [citation],
    });

    expect(result.content).not.toContain('counsel@example.com');
    expect(result.content).not.toContain('212-555-0147');
    expect(result.content).not.toContain('3f2504e0');
    expect(result.gates.exfil_strip_applied).toBe(true);
    expect(result.telemetry.exfil_matches).toBe(3);
  });

  it('strips a stray tool_code block before the response streams (I-A3)', async () => {
    const result = await run({
      content: 'CPLR 3212 governs. <tool_code>search("3212")</tool_code> The movant bears the burden.',
      citations: [citation],
    });

    expect(result.gates.tool_shape_strip_applied).toBe(true);
    expect(result.content).not.toContain('tool_code');
    expect(result.content).toContain('CPLR 3212 governs.');
  });

  it('redacts a raw vault storage path (I-A16)', async () => {
    const result = await run({ content: 'See /vault-raw/org-1/secret.pdf for detail.', citations: [citation] });
    expect(result.content).not.toContain('/vault-raw/');
    expect(result.gates.exfil_strip_applied).toBe(true);
  });

  it('strips a tool-call shape from prose (I-A3)', async () => {
    const result = await run({ content: 'Answer: {"tool": "lookup"} and then some prose.', citations: [citation] });
    expect(result.gates.tool_shape_strip_applied).toBe(true);
    expect(result.content).not.toContain('"tool"');
  });

  it('falls back when the response was ONLY a tool-call shape (I-A3)', async () => {
    const result = await run({ content: '{"tool": "lookup"}', citations: [citation] });
    expect(result.gates.tool_shape_strip_applied).toBe(true);
    expect(result.fallback).toBe('no_authority_on_point');
    expect(result.content).toBe('');
  });

  it('honours a supervisor-supplied fallback without inspecting content', async () => {
    const result = await run({ content: 'ignored', citations: [], fallback: 'no_authority_on_point' });
    expect(result.fallback).toBe('no_authority_on_point');
    expect(result.gates.citation_passed).toBe(false);
  });

  it('returns scope_denied for a denied scope set', async () => {
    const denied: ScopeSet = { ...scopeSet, denied: true, reason: 'walled', allowedPaths: [] };
    const result = await run({ content: 'should never surface', citations: [citation] }, mockSupabase(), denied);
    expect(result.fallback).toBe('scope_denied');
    expect(result.content).toBe('');
  });

  it('never returns empty content without a fallback key', async () => {
    const cases = [
      await run({ content: '', citations: [citation] }),
      await run({ content: '   ', citations: [citation] }),
      await run({ content: '{"function": "x"}', citations: [citation] }),
    ];
    for (const r of cases) {
      if (r.content.trim() === '') expect(r.fallback).toBeDefined();
    }
  });
});
