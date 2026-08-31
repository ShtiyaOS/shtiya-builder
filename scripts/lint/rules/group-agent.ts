// scripts/lint/rules/group-agent.ts
// Agent Factory lint rules.
//
// Every rule vacuous-passes when its target file/directory is absent — the
// Phase 3 sources these scan do not all exist yet. That is correct behavior,
// not a bug: the rules activate as the files they guard get written.

import * as fs   from 'fs';
import * as path from 'path';
import type { LintRule, LintResult, LintViolation } from '../index';

// ── Target paths ──────────────────────────────────────────────────────────────

const SRC_DIR         = path.resolve(__dirname, '../../../src');
const API_DIR         = path.join(SRC_DIR, 'app', 'api');
const COPILOT_DIR     = path.join(API_DIR, 'copilot');
const TOOLS_DIR       = path.join(SRC_DIR, 'lib', 'agent', 'tools');
const SUPERVISOR_FILE = path.join(SRC_DIR, 'lib', 'agent', 'supervisor.ts');
const FALLBACK_FILE   = path.join(SRC_DIR, 'lib', 'agent', 'fallback-templates.ts');

// ── Helpers ───────────────────────────────────────────────────────────────────

/** All .ts / .tsx files under `dir`, recursively. Returns [] if dir is absent. */
function walkDir(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkDir(full));
    } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
      out.push(full);
    }
  }
  return out.sort();
}

/** Reads a file as utf8, returning '' if it cannot be read. */
function read(file: string): string {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return '';
  }
}

/** 1-indexed line number of a character offset. */
function lineOf(content: string, index: number): number {
  return content.slice(0, index).split('\n').length;
}

/** Path relative to the repo root, for readable violation messages. */
function rel(file: string): string {
  return path.relative(path.resolve(__dirname, '../../..'), file);
}

/**
 * Slices the balanced (...) argument list that starts at the '(' at or after
 * `openIndex`. Returns '' when no balanced pair is found.
 */
function balancedSlice(content: string, openIndex: number, open: string, close: string): string {
  const start = content.indexOf(open, openIndex);
  if (start === -1) return '';
  let depth = 0;
  for (let pos = start; pos < content.length; pos++) {
    const ch = content[pos];
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return content.slice(start, pos + 1);
    }
  }
  return content.slice(start);
}

/**
 * Slices the innermost { ... } object literal enclosing `index`.
 * Returns '' when no enclosing braces are found.
 */
function enclosingObject(content: string, index: number): string {
  let depth = 0;
  let start = -1;
  for (let pos = index; pos >= 0; pos--) {
    const ch = content[pos];
    if (ch === '}') depth++;
    else if (ch === '{') {
      if (depth === 0) { start = pos; break; }
      depth--;
    }
  }
  if (start === -1) return '';
  return balancedSlice(content, start, '{', '}');
}

/** Call-site markers for the AI SDK / OpenAI patterns used in this project. */
const LLM_CALL_RE = /\b(?:openai|createOpenAI|generateText|streamText)\b/;

// ── param-lint (I-A6) ─────────────────────────────────────────────────────────

/** Pattern 1: template literal directly in a system-role message (messages array style). */
const SYSTEM_TEMPLATE_LITERAL = /role\s*:\s*['"]system['"]\s*,\s*content\s*:\s*`/g;
/** Pattern 2: interpolation in a system-role message's content (messages array style). */
const SYSTEM_INTERPOLATION = /role\s*:\s*['"]system['"]\s*(?:,|\n)[^}]*content\s*:\s*[^'"]*\$\{/gs;
/**
 * Pattern 4: AI SDK v5+ top-level `system:` param whose value is a template
 * literal — catches `system: \`...${variable}...\`` (the live I-A6 defect pattern).
 */
const SYSTEM_SDK_TEMPLATE = /\bsystem\s*:\s*`[^`]*\$\{/g;
/**
 * Pattern 5: AI SDK v5+ top-level `system:` param whose value is a local
 * variable that was itself built from request input.  Detects the two-step
 * pattern: `const systemPrompt = \`...\`` followed by `system: systemPrompt`.
 * We flag any `system:` assignment whose RHS is an identifier (not a string
 * literal imported from the prompts module).
 */
const SYSTEM_SDK_VARIABLE = /\bsystem\s*:\s*(?!['"`])(\w+)/g;
/** Pattern 3: a `context:` field in a request body object literal. */
const CONTEXT_FIELD = /\{\s*[^}]*\bcontext\b\s*:/g;

export const paramLint: LintRule = {
  id: 'param-lint',
  check: (): LintResult => {
    if (!fs.existsSync(SRC_DIR)) return { passed: true, violations: [] };

    const violations: LintViolation[] = [];
    const flag = (file: string, content: string, index: number) =>
      violations.push({
        rule: 'param-lint',
        file: rel(file),
        line: lineOf(content, index),
        message:
          `system prompt interpolates dynamic content or uses forbidden ` +
          `'context' field (I-A6)`,
      });

    for (const file of walkDir(SRC_DIR)) {
      const content = read(file);

      if (LLM_CALL_RE.test(content)) {
        // Patterns 1 & 2: messages-array style with role: 'system'
        for (const re of [SYSTEM_TEMPLATE_LITERAL, SYSTEM_INTERPOLATION]) {
          re.lastIndex = 0;
          let m: RegExpExecArray | null;
          while ((m = re.exec(content)) !== null) flag(file, content, m.index);
        }

        // Pattern 4: AI SDK v5+ top-level `system: \`...${...}\`` template literal
        SYSTEM_SDK_TEMPLATE.lastIndex = 0;
        let m4: RegExpExecArray | null;
        while ((m4 = SYSTEM_SDK_TEMPLATE.exec(content)) !== null) {
          flag(file, content, m4.index);
        }

        // Pattern 5: AI SDK v5+ top-level `system: someVariable` where the
        // variable is not a string literal from the prompts module.
        // We check: variable exists in scope AND was assigned from a template
        // literal containing ${ (i.e. built from request input).
        SYSTEM_SDK_VARIABLE.lastIndex = 0;
        let m5: RegExpExecArray | null;
        while ((m5 = SYSTEM_SDK_VARIABLE.exec(content)) !== null) {
          const varName = m5[1];
          if (!varName) continue;
          // Ignore if the variable is imported from the prompts module
          if (new RegExp(`import[^;]+${varName}[^;]+lib/agent/prompts`).test(content)) continue;
          // Flag if the same file builds this variable as a template literal
          if (new RegExp(`(?:const|let)\\s+${varName}\\s*=\\s*\`[^;]*\\$\\{`).test(content)) {
            flag(file, content, m5.index);
          }
        }
      }

      // Pattern 3: `context:` field in a request body — scoped to files that
      // reference /api/copilot to avoid false positives on unrelated objects.
      const isApiRoute = file.startsWith(API_DIR + path.sep);
      if (isApiRoute && /\/api\/copilot/.test(content)) {
        CONTEXT_FIELD.lastIndex = 0;
        let m3: RegExpExecArray | null;
        while ((m3 = CONTEXT_FIELD.exec(content)) !== null) flag(file, content, m3.index);
      }
    }

    return { passed: violations.length === 0, violations };
  },
};

// ── prompt-lint (I-A1) ────────────────────────────────────────────────────────

/** An import whose specifier resolves into src/lib/agent/prompts/. */
const PROMPTS_IMPORT = /from\s+['"][^'"]*lib\/agent\/prompts[^'"]*['"]/;
/** A system-role message in a messages array. */
const SYSTEM_MESSAGE = /role\s*:\s*['"]system['"]/;

export const promptLint: LintRule = {
  id: 'prompt-lint',
  check: (): LintResult => {
    if (!fs.existsSync(API_DIR)) return { passed: true, violations: [] };

    const violations: LintViolation[] = [];

    for (const file of walkDir(API_DIR)) {
      if (!file.endsWith('.ts')) continue;
      const content = read(file);

      if (!LLM_CALL_RE.test(content)) continue;
      // Detect either messages-array style (role: 'system') or AI SDK v5+
      // top-level system: param style — both are LLM system prompt entry points.
      const hasSystemPrompt = SYSTEM_MESSAGE.test(content) || /\bsystem\s*:/.test(content);
      if (!hasSystemPrompt) continue;
      if (PROMPTS_IMPORT.test(content)) continue;

      violations.push({
        rule: 'prompt-lint',
        file: rel(file),
        message:
          `LLM call has system message but no import ` +
          `from src/lib/agent/prompts/ (I-A1)`,
      });
    }

    return { passed: violations.length === 0, violations };
  },
};

// ── tools-lint (I-A3) ─────────────────────────────────────────────────────────

const STATE_MUTATION = /\.(?:insert|update|delete)\s*\(/;

export const toolsLint: LintRule = {
  id: 'tools-lint',
  check: (): LintResult => {
    if (!fs.existsSync(TOOLS_DIR)) return { passed: true, violations: [] };

    const violations: LintViolation[] = [];

    for (const file of walkDir(TOOLS_DIR)) {
      if (!file.endsWith('.ts')) continue;
      const content = read(file);

      // Split into export blocks: each runs from one `export` keyword to the
      // next (or to end of file).
      const blocks = content.split(/(?=^export\s+(?:const|function|async\s+function)\s)/m);

      for (const block of blocks) {
        if (!/^export\s+(?:const|function|async\s+function)\s/m.test(block)) continue;
        if (!STATE_MUTATION.test(block)) continue;
        if (/requires_human_gate/.test(block)) continue;

        violations.push({
          rule: 'tools-lint',
          file: rel(file),
          line: lineOf(content, content.indexOf(block)),
          message:
            `exported tool modifies state but is missing ` +
            `requires_human_gate: true annotation (I-A3)`,
        });
      }
    }

    return { passed: violations.length === 0, violations };
  },
};

// ── plan-lint (I-H16) ─────────────────────────────────────────────────────────

const PLAN_LOOP        = /for.*task.*of.*plan|plan\.tasks\.(?:forEach|map|flatMap|for)/;
const ALLOWED_PATHS    = /scopeSet\.allowedPaths|allowedPaths\.includes/;
const SCOPE_DISCARD    = /scope_denied|return.*scope/;

export const planLint: LintRule = {
  id: 'plan-lint',
  check: (): LintResult => {
    if (!fs.existsSync(SUPERVISOR_FILE)) return { passed: true, violations: [] };

    const content = read(SUPERVISOR_FILE);
    const complete =
      PLAN_LOOP.test(content) && ALLOWED_PATHS.test(content) && SCOPE_DISCARD.test(content);

    if (complete) return { passed: true, violations: [] };

    return {
      passed: false,
      violations: [
        {
          rule: 'plan-lint',
          file: rel(SUPERVISOR_FILE),
          message:
            `missing pre-dispatch scopeSet.allowedPaths validation loop ` +
            `(I-H16). Required: loop over plan.tasks, allowedPaths check, ` +
            `and scope_denied discard path.`,
        },
      ],
    };
  },
};

// ── filter-lint (I-A9) ────────────────────────────────────────────────────────

const RETRIEVAL_RPC = /\.rpc\(\s*['"](match_(?:hrag|tenant|af)_chunks)['"]/g;

export const filterLint: LintRule = {
  id: 'filter-lint',
  check: (): LintResult => {
    if (!fs.existsSync(SRC_DIR)) return { passed: true, violations: [] };

    const violations: LintViolation[] = [];

    for (const file of walkDir(SRC_DIR)) {
      if (!file.endsWith('.ts')) continue;
      const content = read(file);

      RETRIEVAL_RPC.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = RETRIEVAL_RPC.exec(content)) !== null) {
        const rpcName = m[1] ?? 'match_*_chunks';
        // Scan the full balanced argument list of this .rpc( ... ) call.
        const args = balancedSlice(content, m.index, '(', ')');
        if (!/p_vault_paths/.test(args)) {
          violations.push({
            rule: 'filter-lint',
            file: rel(file),
            line: lineOf(content, m.index),
            message:
              `RPC call to ${rpcName} missing p_vault_paths ` +
              `pre-filter argument (I-A9)`,
          });
        }
      }
    }

    return { passed: violations.length === 0, violations };
  },
};

// ── fallback-lint (I-A11, FL-1 … FL-4) ───────────────────────────────────────

const REQUIRED_FALLBACK_KEYS = [
  'no_authority_on_point',
  'coverage_incomplete',
  'scope_denied',
];

export const fallbackLint: LintRule = {
  id: 'fallback-lint',
  check: (): LintResult => {
    if (!fs.existsSync(FALLBACK_FILE)) return { passed: true, violations: [] };

    const content = read(FALLBACK_FILE);
    const violations: LintViolation[] = [];
    const push = (msg: string) =>
      violations.push({ rule: 'fallback-lint', file: rel(FALLBACK_FILE), message: msg });

    // Isolate the FALLBACK_TEMPLATES object literal.
    const declIndex = content.search(/FALLBACK_TEMPLATES\s*(?::[^=]*)?=/);
    const objectText = declIndex === -1 ? '' : balancedSlice(content, declIndex, '{', '}');

    // FL-1: all three keys present.
    const missing = REQUIRED_FALLBACK_KEYS.filter(
      k => !new RegExp(`['"]?${k}['"]?\\s*:`).test(objectText),
    );
    if (declIndex === -1) {
      push(`FL-1: FALLBACK_TEMPLATES export not found in ${rel(FALLBACK_FILE)}`);
    } else if (missing.length > 0) {
      push(`FL-1: FALLBACK_TEMPLATES is missing required key(s): ${missing.join(', ')}`);
    }

    // Collect the three key → value strings for FL-2 / FL-3.
    const values = new Map<string, string>();
    for (const key of REQUIRED_FALLBACK_KEYS) {
      const m = new RegExp(`['"]?${key}['"]?\\s*:\\s*(['"\`])([\\s\\S]*?)\\1`).exec(objectText);
      if (m && m[2] !== undefined) values.set(key, m[2]);
    }

    // FL-2: no empty string values.
    for (const [key, value] of values) {
      if (value.trim() === '') {
        push(`FL-2: FALLBACK_TEMPLATES.${key} is an empty string`);
      }
    }

    // FL-3: all values unique.
    const seen = new Map<string, string>();
    for (const [key, value] of values) {
      const prior = seen.get(value);
      if (prior !== undefined) {
        push(`FL-3: FALLBACK_TEMPLATES.${key} duplicates .${prior}`);
      } else {
        seen.set(value, key);
      }
    }

    // FL-4: no call site hands a null/undefined fallback to a response.
    for (const file of walkDir(API_DIR)) {
      if (!file.endsWith('.ts')) continue;
      const routeContent = read(file);
      const re = /fallback\s*:\s*(undefined|null)\b/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(routeContent)) !== null) {
        push(
          `FL-4: ${rel(file)}:${lineOf(routeContent, m.index)} sets ` +
          `fallback: ${m[1]} where a fallback key is expected`,
        );
      }
    }

    return { passed: violations.length === 0, violations };
  },
};

// ── citation-lint (I-A11, I-A12) ─────────────────────────────────────────────

const EMPTY_CITATIONS = /citations\s*:\s*\[\s*\]/g;

export const citationLint: LintRule = {
  id: 'citation-lint',
  check: (): LintResult => {
    if (!fs.existsSync(COPILOT_DIR)) return { passed: true, violations: [] };

    const violations: LintViolation[] = [];

    for (const file of walkDir(COPILOT_DIR)) {
      if (!file.endsWith('.ts')) continue;
      const content = read(file);

      EMPTY_CITATIONS.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = EMPTY_CITATIONS.exec(content)) !== null) {
        // Check the enclosing response object literal for a fallback field.
        const obj = enclosingObject(content, m.index);
        if (!/fallback\s*:/.test(obj)) {
          violations.push({
            rule: 'citation-lint',
            file: rel(file),
            line: lineOf(content, m.index),
            message:
              `response has empty citations array but no fallback ` +
              `field set (I-A11)`,
          });
        }
      }
    }

    return { passed: violations.length === 0, violations };
  },
};

export const agentRules: LintRule[] = [
  paramLint,
  promptLint,
  toolsLint,
  planLint,
  filterLint,
  fallbackLint,
  citationLint,
];
