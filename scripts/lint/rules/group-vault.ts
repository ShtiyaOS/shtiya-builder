// scripts/lint/rules/group-vault.ts
// HRAG Vault lint rules.
//
// Every rule vacuous-passes when all of its targets are absent — the v3.0
// migrations and Phase 3 ingestion sources these scan do not exist yet.

import * as fs   from 'fs';
import * as path from 'path';
import type { LintRule, LintResult, LintViolation } from '../index';

// ── Target paths ──────────────────────────────────────────────────────────────

const REPO_ROOT      = path.resolve(__dirname, '../../..');
const MIGRATIONS_DIR = path.join(REPO_ROOT, 'supabase', 'migrations');
const SRC_DIR        = path.join(REPO_ROOT, 'src');
const API_DIR        = path.join(SRC_DIR, 'app', 'api');
const TENANT_CORPUS_ROUTE = path.join(API_DIR, 'vault', 'tenant-corpus', 'route.ts');
const CORPUS_WRITER  = path.join(SRC_DIR, 'workers', 'ingest', 'corpus-writer.ts');

/** Legacy v1 migration basenames — excluded from all v3.0 lint checks. */
const LEGACY_FILES = new Set([
  '0001_core_schema.sql',
  '0002_rls_policies.sql',
  '0003_realtime_publication.sql',
  '0004_watchdog_cron.sql',
  '0005_match_trigger.sql',
  '0006_sentinel_cron.sql',
  '0007_write_policies.sql',
  '0008_milestones_bucket.sql',
  '0009_role_grants.sql',
  '0010_investor_connections.sql',
]);

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns all v3.0 migration files, sorted by filename (ascending). */
function getV3Migrations(): Array<{ file: string; content: string }> {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql') && !LEGACY_FILES.has(f))
    .sort()
    .map(f => ({
      file: path.join(MIGRATIONS_DIR, f),
      content: fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8'),
    }));
}

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

/**
 * Slices the balanced open/close pair starting at the first `open` at or after
 * `openIndex`. Returns '' when no pair is found.
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

// ── vault-pii-lint (I-H3, I-H18) ─────────────────────────────────────────────

/** Column names that must never appear in the ingestion queue DDL. */
const PII_COLUMNS = ['name', 'address', 'ssn', 'email', 'phone'];

export const vaultPiiLint: LintRule = {
  id: 'vault-pii-lint',
  check: (): LintResult => {
    const migrations = getV3Migrations();
    const routeExists = fs.existsSync(TENANT_CORPUS_ROUTE);
    if (migrations.length === 0 && !routeExists) return { passed: true, violations: [] };

    const violations: LintViolation[] = [];

    // Sub-check A: hrag_ingestion_queue DDL must carry no PII-like columns.
    for (const migration of migrations) {
      const re = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:\w+\.)?hrag_ingestion_queue\s*\(/gi;
      let m: RegExpExecArray | null;
      while ((m = re.exec(migration.content)) !== null) {
        const body = balancedSlice(migration.content, m.index, '(', ')');
        for (const col of PII_COLUMNS) {
          // A column definition starts a line (modulo whitespace) with the name.
          if (new RegExp(`(?:^|,)\\s*${col}\\s+\\w`, 'im').test(body)) {
            violations.push({
              rule: 'vault-pii-lint',
              file: rel(migration.file),
              line: lineOf(migration.content, m.index),
              message: `hrag_ingestion_queue DDL contains PII-like column '${col}' — remove it (I-H3)`,
            });
          }
        }
      }
    }

    // Sub-check B: no DB insert before the MicroVM proof is verified.
    if (routeExists) {
      const content = read(TENANT_CORPUS_ROUTE);
      const insertRe = /\.insert\s*\(/g;
      const proofIndex = content.search(/verifyMicrovmProof/);
      let m: RegExpExecArray | null;
      while ((m = insertRe.exec(content)) !== null) {
        if (proofIndex === -1 || proofIndex > m.index) {
          violations.push({
            rule: 'vault-pii-lint',
            file: rel(TENANT_CORPUS_ROUTE),
            line: lineOf(content, m.index),
            message:
              `vault/tenant-corpus/route.ts performs DB insert before ` +
              `MicroVM proof validation (I-H3)`,
          });
        }
      }
    }

    return { passed: violations.length === 0, violations };
  },
};

// ── claim-lint (I-H22) ───────────────────────────────────────────────────────

export const claimLint: LintRule = {
  id: 'claim-lint',
  check: (): LintResult => {
    const migrations = getV3Migrations();
    const writerExists = fs.existsSync(CORPUS_WRITER);
    if (migrations.length === 0 && !writerExists) return { passed: true, violations: [] };

    const violations: LintViolation[] = [];

    // Sub-check A: every INSERT INTO authority_corpus must supply a jurisdiction.
    for (const migration of migrations) {
      const re = /insert\s+into\s+(?:\w+\.)?authority_corpus\b/gi;
      let m: RegExpExecArray | null;
      while ((m = re.exec(migration.content)) !== null) {
        // The statement runs to the next semicolon.
        const end = migration.content.indexOf(';', m.index);
        const stmt = migration.content.slice(m.index, end === -1 ? undefined : end);
        const hasJurisdiction =
          /\bjurisdiction\b/i.test(stmt) && !/\bjurisdiction\b\s*=?\s*null/i.test(stmt);
        if (!hasJurisdiction) {
          violations.push({
            rule: 'claim-lint',
            file: rel(migration.file),
            line: lineOf(migration.content, m.index),
            message: `INSERT INTO authority_corpus missing jurisdiction value (I-H22)`,
          });
        }
      }
    }

    // Sub-check B: the ingestion writer must not insert without a jurisdiction.
    if (writerExists) {
      const content = read(CORPUS_WRITER);
      const re = /authority_corpus/gi;
      let m: RegExpExecArray | null;
      while ((m = re.exec(content)) !== null) {
        const insertIndex = content.indexOf('.insert(', m.index);
        if (insertIndex === -1) continue;
        // Only treat it as this table's insert if nothing else intervenes.
        const between = content.slice(m.index, insertIndex);
        if (/from\s*\(/i.test(between) && between.length > 200) continue;
        const args = balancedSlice(content, insertIndex, '(', ')');
        if (!/\bjurisdiction\b/.test(args)) {
          violations.push({
            rule: 'claim-lint',
            file: rel(CORPUS_WRITER),
            line: lineOf(content, insertIndex),
            message:
              `corpus-writer.ts inserts into authority_corpus without ` +
              `jurisdiction field (I-H22)`,
          });
        }
      }
    }

    return { passed: violations.length === 0, violations };
  },
};

// ── currency-lint (I-A13, I-H5) ──────────────────────────────────────────────
// RETRIEVAL_RPC_NAMES: functions whose SQL bodies must contain an effective_to
// predicate (I-A13 / I-H5 currency model).
//
// match_authority_chunks   ✅ has effective_from / effective_to / superseded_by
// match_hrag_chunks        ✅ will carry effective_to when created in 1082
// match_tenant_chunks      ❌ EXCLUDED — tenant_corpus has no effective_to column;
//                             playbook currency is governed by screen_state, not dates.
//                             Requiring effective_to on this function produces a false
//                             positive on every chain apply.
// match_af_chunks          ❌ REMOVED — this function was never created; it was a
//                             Tasks.md planning stub. The real functions are
//                             match_authority_chunks / match_tenant_chunks.

const RETRIEVAL_RPC_CALL = /\.rpc\(\s*['"](match_(?:authority|hrag)_chunks)['"]/g;
const RETRIEVAL_RPC_NAMES = ['match_authority_chunks', 'match_hrag_chunks'];
const EFFECTIVE_TO_FILTER =
  /effective_to[\s\S]{0,80}p_as_of|effective_to\s*>\s*|effective_to\s+is\s+null/i;

export const currencyLint: LintRule = {
  id: 'currency-lint',
  check: (): LintResult => {
    const migrations = getV3Migrations();
    const srcExists = fs.existsSync(SRC_DIR);
    if (!srcExists && migrations.length === 0) return { passed: true, violations: [] };

    const violations: LintViolation[] = [];

    // Sub-check A: every retrieval RPC call site must pass p_as_of.
    if (srcExists) {
      for (const file of walkDir(SRC_DIR)) {
        if (!file.endsWith('.ts')) continue;
        const content = read(file);
        RETRIEVAL_RPC_CALL.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = RETRIEVAL_RPC_CALL.exec(content)) !== null) {
          const rpcName = m[1] ?? 'match_*_chunks';
          const args = balancedSlice(content, m.index, '(', ')');
          if (!/p_as_of/.test(args)) {
            violations.push({
              rule: 'currency-lint',
              file: rel(file),
              line: lineOf(content, m.index),
              message: `RPC call to ${rpcName} missing p_as_of parameter (I-A13)`,
            });
          }
        }
      }
    }

    // Sub-check B: every retrieval RPC definition must filter on effective_to.
    for (const migration of migrations) {
      for (const rpc of RETRIEVAL_RPC_NAMES) {
        const defRe = new RegExp(
          `create\\s+(?:or\\s+replace\\s+)?function\\s+(?:\\w+\\.)?${rpc}\\s*\\(`,
          'gi',
        );
        let m: RegExpExecArray | null;
        while ((m = defRe.exec(migration.content)) !== null) {
          // Function body runs to the end of the $$-quoted block.
          const bodyStart = migration.content.indexOf('$$', m.index);
          const bodyEnd =
            bodyStart === -1 ? -1 : migration.content.indexOf('$$', bodyStart + 2);
          const body =
            bodyStart === -1
              ? migration.content.slice(m.index)
              : migration.content.slice(bodyStart, bodyEnd === -1 ? undefined : bodyEnd + 2);
          if (!EFFECTIVE_TO_FILTER.test(body)) {
            violations.push({
              rule: 'currency-lint',
              file: rel(migration.file),
              line: lineOf(migration.content, m.index),
              message: `${rpc} definition missing effective_to date filter (I-H5)`,
            });
          }
        }
      }
    }

    return { passed: violations.length === 0, violations };
  },
};

// ── embedding-lint (I-A10, I-19) ─────────────────────────────────────────────

/** A full-table (no column list) SELECT grant on a corpus table to authenticated. */
const FULL_TABLE_GRANT =
  /grant\s+select\s+on\s+(?:table\s+)?(?:\w+\.)?((?:authority|tenant)_corpus)\s+to\s+authenticated/gi;

export const embeddingLint: LintRule = {
  id: 'embedding-lint',
  check: (): LintResult => {
    const migrations = getV3Migrations();
    const apiExists = fs.existsSync(API_DIR);
    if (!apiExists && migrations.length === 0) return { passed: true, violations: [] };

    const violations: LintViolation[] = [];

    // Sub-check A: no API route may return an embedding vector to the client.
    if (apiExists) {
      for (const file of walkDir(API_DIR)) {
        if (!file.endsWith('.ts')) continue;
        const content = read(file);
        const re = /NextResponse\.json\s*\(/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(content)) !== null) {
          const args = balancedSlice(content, m.index, '(', ')');
          // Flag an `embedding` key whose value is anything but undefined.
          const embeddingKey = /\bembedding\w*\s*:\s*(\w+)?/.exec(args);
          if (embeddingKey && embeddingKey[1] !== 'undefined') {
            violations.push({
              rule: 'embedding-lint',
              file: rel(file),
              line: lineOf(content, m.index),
              message: `API route returns raw embedding vector to client (I-A10/I-19)`,
            });
          }
        }
      }
    }

    // Sub-check B: no full-table SELECT grant on a corpus table.
    for (const migration of migrations) {
      FULL_TABLE_GRANT.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = FULL_TABLE_GRANT.exec(migration.content)) !== null) {
        const table = m[1] ?? 'corpus';
        violations.push({
          rule: 'embedding-lint',
          file: rel(migration.file),
          line: lineOf(migration.content, m.index),
          message: `full-table SELECT grant on ${table} exposes embedding column (I-A10)`,
        });
      }
    }

    return { passed: violations.length === 0, violations };
  },
};

export const vaultRules: LintRule[] = [
  vaultPiiLint,
  claimLint,
  currencyLint,
  embeddingLint,
];
