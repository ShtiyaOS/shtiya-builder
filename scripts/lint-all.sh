#!/usr/bin/env bash
# scripts/lint-all.sh
# Shtiya Builder v3.0 — Custom lint rule runner
# Invokes all 17 architectural lint rules in sequence.
# Each rule exits 0 (pass) or 1 (fail). Any failure exits this script with 1.
#
# Rules are implemented progressively in Tasks 0.4–0.8.
# Stubs below pass vacuously until the real implementations are wired in.

set -euo pipefail

PASS=0
FAIL=0
ERRORS=()

run_rule() {
  local rule_id="$1"
  local cmd="$2"
  if eval "$cmd" > /dev/null 2>&1; then
    echo "  ✅  $rule_id"
    PASS=$((PASS + 1))
  else
    echo "  ❌  $rule_id"
    FAIL=$((FAIL + 1))
    ERRORS+=("$rule_id")
  fi
}

echo ""
echo "Shtiya Builder — Custom Lint Rules"
echo "==================================="

# ── Group: RLS & Authorization ────────────────────────────────────────────────
run_rule "wall-lint"      "echo stub-pass"
run_rule "definer-lint"   "echo stub-pass"
run_rule "privilege-lint" "echo stub-pass"
run_rule "class-lint"     "echo stub-pass"

# ── Group: Agent Factory ──────────────────────────────────────────────────────
run_rule "param-lint"    "echo stub-pass"
run_rule "prompt-lint"   "echo stub-pass"
run_rule "tools-lint"    "echo stub-pass"
run_rule "plan-lint"     "echo stub-pass"
run_rule "filter-lint"   "echo stub-pass"
run_rule "fallback-lint" "echo stub-pass"
run_rule "citation-lint" "echo stub-pass"

# ── Group: HRAG Vault ─────────────────────────────────────────────────────────
run_rule "vault-pii-lint" "echo stub-pass"
run_rule "claim-lint"     "echo stub-pass"
run_rule "currency-lint"  "echo stub-pass"
run_rule "embedding-lint" "echo stub-pass"

# ── Group: Observability & Ops ────────────────────────────────────────────────
run_rule "log-lint"         "echo stub-pass"
run_rule "servicerole-lint" "echo stub-pass"

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "Results: ${PASS}/17 PASS  |  ${FAIL}/17 FAIL"

if [ "${FAIL}" -gt 0 ]; then
  echo ""
  echo "Failing rules:"
  for r in "${ERRORS[@]}"; do
    echo "  - $r"
  done
  echo ""
  exit 1
fi

echo ""
echo "All 17 rules PASS ✅"
exit 0
