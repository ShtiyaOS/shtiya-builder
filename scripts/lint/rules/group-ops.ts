// scripts/lint/rules/group-ops.ts
// Observability & Ops lint rules.
//
// Both rules vacuous-pass when their target file/directory is absent.

import * as fs   from 'fs';
import * as path from 'path';
import type { LintRule, LintResult, LintViolation } from '../index';

// ── Target paths ──────────────────────────────────────────────────────────────

const REPO_ROOT    = path.resolve(__dirname, '../../..');
const SRC_DIR      = path.join(REPO_ROOT, 'src');
const API_DIR      = path.join(SRC_DIR, 'app', 'api');
const COPILOT_ROUTE = path.join(API_DIR, 'copilot', 'route.ts');

// ── Helpers ───────────────────────────────────────────────────────────────────

/** All .ts / .tsx files under `dir`, recursively. Returns [] if dir is absent. */
function walkDir(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkDir(full));
    else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) out.push(full);
  }
  return out.sort();
}

function read(file: string): string {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return '';
  }
}

function lineOf(content: string, index: number): number {
  return content.slice(0, index).split('\n').length;
}

function rel(file: string): string {
  return path.relative(REPO_ROOT, file);
}

// ── log-lint (I-A14) ─────────────────────────────────────────────────────────

export const logLint: LintRule = {
  id: 'log-lint',
  check: (): LintResult => {
    if (!fs.existsSync(COPILOT_ROUTE)) return { passed: true, violations: [] };

    const content = read(COPILOT_ROUTE);
    const violations: LintViolation[] = [];

    const returnRe = /\breturn\s/g;
    let m: RegExpExecArray | null;
    while ((m = returnRe.exec(content)) !== null) {
      // Scan backwards to the enclosing scope boundary: the nearest preceding
      // unmatched `{` (i.e. the opening brace of the block this return sits in).
      let depth = 0;
      let scopeStart = 0;
      for (let pos = m.index; pos >= 0; pos--) {
        const ch = content[pos];
        if (ch === '}') depth++;
        else if (ch === '{') {
          if (depth === 0) { scopeStart = pos; break; }
          depth--;
        }
      }
      const scope = content.slice(scopeStart, m.index);
      if (!/emitObservation/.test(scope)) {
        violations.push({
          rule: 'log-lint',
          file: rel(COPILOT_ROUTE),
          line: lineOf(content, m.index),
          message:
            `return statement not preceded by emitObservation() in same scope (I-A14)`,
        });
      }
    }

    return { passed: violations.length === 0, violations };
  },
};

// ── servicerole-lint (I-A7) ──────────────────────────────────────────────────

/** Corpus RPCs and authorization tables that must never be read with the anon key. */
const SENSITIVE_ACCESS = [
  /\.rpc\(\s*['"]match_hrag_chunks['"]/,
  /\.rpc\(\s*['"]match_authority_chunks['"]/,
  /\.rpc\(\s*['"]match_tenant_chunks['"]/,
  // match_af_chunks removed — was a Tasks.md stub; actual RPCs are match_authority_chunks
  // and match_tenant_chunks (created in 1072).
  /\.from\(\s*['"]matter_parties['"]/,
  /\.from\(\s*['"]trust_ledger['"]/,
  /\.from\(\s*['"]ethical_walls['"]/,
  /\.from\(\s*['"]property_role_bindings['"]/,
];

export const serviceroleLint: LintRule = {
  id: 'servicerole-lint',
  check: (): LintResult => {
    if (!fs.existsSync(API_DIR)) return { passed: true, violations: [] };

    const violations: LintViolation[] = [];

    for (const file of walkDir(API_DIR)) {
      if (!file.endsWith('.ts')) continue;
      const content = read(file);

      const touchesSensitive = SENSITIVE_ACCESS.some(re => re.test(content));
      if (!touchesSensitive) continue;

      if (/NEXT_PUBLIC_SUPABASE_ANON_KEY/.test(content)) {
        violations.push({
          rule: 'servicerole-lint',
          file: rel(file),
          message:
            `sensitive corpus/auth table access uses anon key instead of ` +
            `service role (I-A7)`,
        });
      }
    }

    return { passed: violations.length === 0, violations };
  },
};

export const opsRules: LintRule[] = [
  logLint,
  serviceroleLint,
];
