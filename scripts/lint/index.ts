// scripts/lint/index.ts
// Shtiya Builder v3.0 — Custom Lint Rule Runner
// Usage:
//   npx ts-node scripts/lint/index.ts              (run all 17 rules)
//   npx ts-node scripts/lint/index.ts wall-lint    (run one rule)
//   npx ts-node scripts/lint/index.ts wall-lint definer-lint  (run two rules)

import { authRules }  from './rules/group-auth';
import { agentRules } from './rules/group-agent';
import { vaultRules } from './rules/group-vault';
import { opsRules }   from './rules/group-ops';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LintViolation {
  rule:    string;
  file:    string;
  line?:   number;
  message: string;
}

export interface LintResult {
  passed:     boolean;
  violations: LintViolation[];
}

export interface LintRule {
  id:    string;
  check: () => LintResult | Promise<LintResult>;
}

// ── Registry ──────────────────────────────────────────────────────────────────
// Canonical order matches Tasks.md §II.1 and scripts/lint-all.sh.

export const ALL_RULES: LintRule[] = [
  // Group: RLS & Authorization
  ...authRules,
  // Group: Agent Factory
  ...agentRules,
  // Group: HRAG Vault
  ...vaultRules,
  // Group: Observability & Ops
  ...opsRules,
];

// ── Runner ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const requested = process.argv.slice(2);
  const rules = requested.length > 0
    ? ALL_RULES.filter(r => requested.includes(r.id))
    : ALL_RULES;

  if (requested.length > 0 && rules.length === 0) {
    console.error(`No rules matched: ${requested.join(', ')}`);
    console.error(`Available: ${ALL_RULES.map(r => r.id).join(', ')}`);
    process.exit(1);
  }

  let passed = 0;
  let failed = 0;
  const allViolations: LintViolation[] = [];

  console.log('');
  console.log('Shtiya Builder — Custom Lint Rules');
  console.log('===================================');

  for (const rule of rules) {
    const result = await rule.check();
    if (result.passed) {
      console.log(`  ✅  ${rule.id}`);
      passed++;
    } else {
      console.log(`  ❌  ${rule.id}`);
      failed++;
      allViolations.push(...result.violations);
    }
  }

  console.log('');
  console.log(`Results: ${passed}/${rules.length} PASS  |  ${failed}/${rules.length} FAIL`);

  if (allViolations.length > 0) {
    console.log('');
    console.log('Violations:');
    for (const v of allViolations) {
      const loc = v.line != null ? `:${v.line}` : '';
      console.log(`  [${v.rule}] ${v.file}${loc} — ${v.message}`);
    }
    console.log('');
    process.exit(1);
  }

  if (failed > 0) {
    process.exit(1);
  }

  console.log('');
  console.log(`All ${rules.length} rules PASS ✅`);
  process.exit(0);
}

main().catch(err => {
  console.error('Lint runner crashed:', err);
  process.exit(2);
});
