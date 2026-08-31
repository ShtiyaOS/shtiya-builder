// scripts/lint/rules/group-auth.ts
// RLS & Authorization lint rules.
// wall-lint and definer-lint are implemented here.
// privilege-lint and class-lint implemented in Task 0.6.

import * as fs   from 'fs';
import * as path from 'path';
import type { LintRule, LintResult, LintViolation } from '../index';

// ── Helpers ───────────────────────────────────────────────────────────────────

const MIGRATIONS_DIR = path.resolve(__dirname, '../../../supabase/migrations');

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

// ── wall-lint ─────────────────────────────────────────────────────────────────

/**
 * Extracts table names whose CREATE TABLE DDL contains a matter_id UUID FK
 * referencing the matters table.
 */
function getMatterScopedTables(content: string): string[] {
  const tables: string[] = [];
  // Match CREATE TABLE [IF NOT EXISTS] [schema.]name ( ...
  // (?:\w+\.)? handles optional schema prefix (e.g. public.matter_files).
  // Capture group 1 is the unqualified table name only.
  const createTableRe =
    /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:\w+\.)?(\w+)\s*\(/gi;
  let match: RegExpExecArray | null;
  while ((match = createTableRe.exec(content)) !== null) {
    const tableName = match[1];
    // Find the table body — scan forward for the balanced closing )
    const bodyStart = match.index + match[0].length;
    let depth = 1;
    let pos = bodyStart;
    while (pos < content.length && depth > 0) {
      if (content[pos] === '(') depth++;
      else if (content[pos] === ')') depth--;
      pos++;
    }
    const body = content.slice(bodyStart, pos);
    // Check if body contains a matter_id uuid ... references matters
    if (/matter_id\s+uuid.*references\s+(?:\w+\.)?matters/i.test(body)) {
      if (tableName) tables.push(tableName);
    }
  }
  return tables;
}

/**
 * Tables with a direct matter_id FK that are intentionally exempt from the
 * wall_blocks_user() requirement. Each entry must have a documented reason.
 *
 * wall_prior_access — I-L15 disclosure record. The screened user must be able
 *   to read their own prior-access log; the wall term would block the very user
 *   the disclosure is meant to inform. Access is already scoped to
 *   screened_user_id = current_app_user_id() which is narrower than any wall.
 */
const WALL_LINT_EXEMPT = new Set<string>([
  'wall_prior_access',
]);

export const wallLint: LintRule = {
  id: 'wall-lint',
  check: (): LintResult => {
    const migrations = getV3Migrations();
    if (migrations.length === 0) return { passed: true, violations: [] };

    const violations: LintViolation[] = [];

    // Build a map: tableName → array of migration contents from that file onward
    // (a policy may appear in a later migration than the table definition)
    const allContents = migrations.map(m => m.content).join('\n');

    for (const migration of migrations) {
      const tables = getMatterScopedTables(migration.content);
      for (const table of tables) {
        // Tables in WALL_LINT_EXEMPT carry a matter_id FK but intentionally
        // do not use wall_blocks_user() — see the exemption set for rationale.
        if (WALL_LINT_EXEMPT.has(table)) continue;
        // Search all migration content for a SELECT policy on this table (with
        // or without schema prefix) that includes wall_blocks_user.
        // (?:\w+\.)? handles optional schema prefix in the ON clause.
        const policyRe = new RegExp(
          `create\\s+policy[^;]+on\\s+(?:\\w+\\.)?${table}\\s+for\\s+select[^;]*wall_blocks_user`,
          'i',
        );
        if (!policyRe.test(allContents)) {
          violations.push({
            rule: 'wall-lint',
            file: migration.file,
            message:
              `table \`${table}\` has a matter_id FK but no SELECT policy ` +
              `containing wall_blocks_user() was found in any v3.0 migration`,
          });
        }
      }
    }

    return { passed: violations.length === 0, violations };
  },
};

// ── definer-lint ──────────────────────────────────────────────────────────────

/** Retrieval RPCs that must be SECURITY INVOKER (never DEFINER). */
const INVOKER_ONLY_RPCS = new Set([
  'match_hrag_chunks',
  'match_authority_chunks',
  'match_tenant_chunks',
  // match_af_chunks removed — Tasks.md planning stub that was never created;
  // the real functions are match_authority_chunks and match_tenant_chunks.
]);

export const definerLint: LintRule = {
  id: 'definer-lint',
  check: (): LintResult => {
    const migrations = getV3Migrations();
    if (migrations.length === 0) return { passed: true, violations: [] };

    const violations: LintViolation[] = [];

    for (const migration of migrations) {
      const content = migration.content;

      // Split on CREATE [OR REPLACE] FUNCTION to get individual function texts.
      const blocks = content.split(/(?=create\s+(?:or\s+replace\s+)?function\s)/i);

      for (const block of blocks) {
        if (!/create\s+(?:or\s+replace\s+)?function\s/i.test(block)) continue;

        // Extract function name
        const nameMatch = /create\s+(?:or\s+replace\s+)?function\s+(?:\w+\.)?(\w+)\s*\(/i.exec(block);
        if (!nameMatch) continue;
        const fnName = nameMatch[1] ?? '';

        const isDefiner = /security\s+definer/i.test(block);
        const isInvoker = /security\s+invoker/i.test(block);

        // Rule A: retrieval RPCs must NOT be SECURITY DEFINER
        if (INVOKER_ONLY_RPCS.has(fnName) && isDefiner) {
          violations.push({
            rule: 'definer-lint',
            file: migration.file,
            message:
              `retrieval RPC \`${fnName}\` is SECURITY DEFINER — ` +
              `it must be SECURITY INVOKER (AF-12 / I-H14)`,
          });
        }

        // Rule B: all SECURITY DEFINER functions must set search_path = ''
        // Accepts: SET search_path = '';  or  SET search_path = ''  (EOL/EOF)
        // Rejects: SET search_path = public  (v1 pattern, not compliant)
        if (isDefiner && !isInvoker) {
          if (!/set\s+search_path\s*=\s*''[\s;]/i.test(block) &&
              !/set\s+search_path\s*=\s*''$/im.test(block)) {
            violations.push({
              rule: 'definer-lint',
              file: migration.file,
              message:
                `SECURITY DEFINER function \`${fnName}\` is missing ` +
                `\`SET search_path = ''\` (AF-13). ` +
                `\`SET search_path = public\` is not compliant.`,
            });
          }
        }
      }
    }

    return { passed: violations.length === 0, violations };
  },
};

// ── Shared table-detection helpers ───────────────────────────────────────────

/**
 * True if `content` contains a CREATE TABLE DDL for `table`, with or without a
 * schema prefix (`create table public.foo (` and `create table foo (` both match).
 */
function tableExistsInFile(content: string, table: string): boolean {
  const re = new RegExp(
    `create\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?(?:\\w+\\.)?${table}\\s*\\(`,
    'i',
  );
  return re.test(content);
}

/**
 * Extracts the names of tables whose CREATE TABLE body satisfies `bodyTest`,
 * using the same balanced-paren body scan as getMatterScopedTables().
 * `bodyTest` must be non-global — a /g/ regex would carry lastIndex between calls.
 */
function getTablesWithBody(content: string, bodyTest: RegExp): string[] {
  const tables: string[] = [];
  const createTableRe = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:\w+\.)?(\w+)\s*\(/gi;
  let match: RegExpExecArray | null;
  while ((match = createTableRe.exec(content)) !== null) {
    const tableName = match[1];
    // Find the table body — scan forward for the closing );
    const bodyStart = match.index + match[0].length;
    let depth = 1;
    let pos = bodyStart;
    while (pos < content.length && depth > 0) {
      if (content[pos] === '(') depth++;
      else if (content[pos] === ')') depth--;
      pos++;
    }
    const body = content.slice(bodyStart, pos);
    if (tableName && bodyTest.test(body)) tables.push(tableName);
  }
  return tables;
}

// ── privilege-lint ────────────────────────────────────────────────────────────

/**
 * Authorization tables (closed set — I-2). Each must carry a
 * `trg_%_billing_guard` trigger in the same migration that creates it.
 */
const AUTHORIZATION_TABLES = [
  'property_role_bindings',
  'deal_memberships',
  'facility_parties',
  'matter_parties',
  'wp_parties',
  'dp_parties',
  'broker_seats',
];

export const privilegeLint: LintRule = {
  id: 'privilege-lint',
  check: (): LintResult => {
    const migrations = getV3Migrations();
    if (migrations.length === 0) return { passed: true, violations: [] };

    const violations: LintViolation[] = [];

    for (const migration of migrations) {
      const content = migration.content;

      for (const table of AUTHORIZATION_TABLES) {
        // Only tables actually created in this file are in scope. A table not
        // created in any v3.0 file simply hasn't been written yet.
        if (!tableExistsInFile(content, table)) continue;

        // The guard trigger must live in the same file as the CREATE TABLE.
        // Name matches the glob trg_%_billing_guard; the ON clause may carry
        // a schema prefix. [^;]* keeps the match inside one statement.
        const triggerRe = new RegExp(
          `create\\s+trigger\\s+trg_\\w*_billing_guard[^;]*?\\bon\\s+(?:\\w+\\.)?${table}\\b`,
          'i',
        );
        if (!triggerRe.test(content)) {
          violations.push({
            rule: 'privilege-lint',
            file: migration.file,
            message:
              `authorization table \`${table}\` in ${migration.file} is missing ` +
              `its billing guard trigger (expected: CREATE TRIGGER ` +
              `trg_%_billing_guard ... ON ${table}) [I-2]`,
          });
        }
      }
    }

    return { passed: violations.length === 0, violations };
  },
};

// ── class-lint ────────────────────────────────────────────────────────────────

/** Matches a data_class column typed as either `text` or the `data_class` enum. */
const DATA_CLASS_COLUMN = /data_class\s+(?:text|data_class)/i;

export const classLint: LintRule = {
  id: 'class-lint',
  check: (): LintResult => {
    const migrations = getV3Migrations();
    if (migrations.length === 0) return { passed: true, violations: [] };

    const violations: LintViolation[] = [];

    // A policy may appear in a later migration than the table definition.
    const allContents = migrations.map(m => m.content).join('\n');

    for (const migration of migrations) {
      const tables = getTablesWithBody(migration.content, DATA_CLASS_COLUMN);

      for (const table of tables) {
        const policyRe = new RegExp(
          `create\\s+policy[^;]+on\\s+(?:\\w+\\.)?${table}\\s+for\\s+select[^;]*has_data_class_grant`,
          'i',
        );
        if (!policyRe.test(allContents)) {
          violations.push({
            rule: 'class-lint',
            file: migration.file,
            message:
              `table \`${table}\` has a data_class column but no SELECT policy ` +
              `containing has_data_class_grant() was found in any v3.0 migration [I-L8]`,
          });
        }
      }
    }

    return { passed: violations.length === 0, violations };
  },
};

export const authRules: LintRule[] = [
  wallLint,
  definerLint,
  privilegeLint,
  classLint,
];
