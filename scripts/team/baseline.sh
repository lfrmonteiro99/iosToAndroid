#!/bin/bash
# baseline.sh — record what is ALREADY broken on `main`, so the reviewer can block
# on regressions instead of on inherited failures.
#
# WHY THIS EXISTS
#
# The pipeline was designed around "lint, tsc and jest must all pass". On this
# repository, at the time it was set up, they did not: `main` had 2 eslint errors
# and 103 of 180 tests failing across 24 of 30 suites. A strict gate against that
# baseline blocks EVERY pull request for failures the author did not cause — 42
# issues would each burn three implementation attempts and deliver nothing, and the
# log would look busy the whole time.
#
# So the gate is: **no NEW failures**. This file is the record of "old".
#
# It is deliberately a snapshot, not a policy. Once `main` is green, delete
# $STATE_DIR/baseline.json and the gate becomes strict again on its own — the
# review prompt says so when no baseline is present.
#
# Re-run this after any change to `main` that fixes a batch of tests, or the
# baseline goes stale and starts forgiving real regressions.
#
# Usage: baseline.sh [--show]
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"
ROLE="baseline"

BASELINE_FILE="$STATE_DIR/baseline.json"

if [ "${1:-}" = "--show" ]; then
  [ -f "$BASELINE_FILE" ] && cat "$BASELINE_FILE" || echo "(sem baseline — o portão está em modo estrito)"
  exit 0
fi

WT=""
cleanup() { [ -n "$WT" ] && wt_remove "$WT"; }
trap cleanup EXIT

log "a medir $BASE_BRANCH num worktree limpo..."
WT_OUT=$(wt_checkout "$BASE_BRANCH" "baseline") || { warn "checkout falhou"; exit 1; }
WT="$WT_OUT"
wt_prepare_node "$WT"

cd "$WT" || exit 1

# ── lint ───────────────────────────────────────────────────────────────────
LINT_OUT=$(npm run lint 2>&1 || true)
LINT_ERRORS=$(printf '%s' "$LINT_OUT" | grep -cE '^\s+[0-9]+:[0-9]+\s+error' || true)
LINT_WARNINGS=$(printf '%s' "$LINT_OUT" | grep -cE '^\s+[0-9]+:[0-9]+\s+warning' || true)
log "lint: $LINT_ERRORS erro(s), $LINT_WARNINGS aviso(s)"

# ── tsc ────────────────────────────────────────────────────────────────────
if npx tsc --noEmit >/dev/null 2>&1; then TSC_OK=true; else TSC_OK=false; fi
log "tsc: ok=$TSC_OK"

# ── jest ───────────────────────────────────────────────────────────────────
# --json into a file, not stdout: jest writes progress to stderr and the summary to
# stdout, and mixing them makes the JSON unparseable exactly when it matters.
JEST_JSON="/tmp/ios2a-baseline-jest.json"
rm -f "$JEST_JSON"
npx jest --json --outputFile="$JEST_JSON" >/dev/null 2>&1 || true

if [ ! -s "$JEST_JSON" ]; then
  warn "jest não produziu JSON — baseline não escrita (melhor sem baseline do que com uma errada)"
  exit 1
fi

FAILED_TESTS=$(jq -r '
  [ .testResults[].assertionResults[]? | select(.status == "failed")
    | ((.ancestorTitles // []) + [.title]) | join(" › ") ] | sort' "$JEST_JSON")
FAILED_SUITES=$(jq -r '
  [ .testResults[] | select(.status == "failed") | .name ] | sort' "$JEST_JSON")

jq -n \
  --argjson lint_errors "${LINT_ERRORS:-0}" \
  --argjson lint_warnings "${LINT_WARNINGS:-0}" \
  --argjson tsc_ok "$TSC_OK" \
  --argjson failed_tests "$FAILED_TESTS" \
  --argjson failed_suites "$FAILED_SUITES" \
  --arg sha "$(git rev-parse --short HEAD)" \
  --argjson totals "$(jq '{suites: .numTotalTestSuites, tests: .numTotalTests, failed_tests: .numFailedTests, failed_suites: .numFailedTestSuites}' "$JEST_JSON")" \
  '{sha: $sha, lint_errors: $lint_errors, lint_warnings: $lint_warnings,
    tsc_ok: $tsc_ok, totals: $totals,
    failed_suites: $failed_suites, failed_tests: $failed_tests}' \
  > "$BASELINE_FILE"

rm -f "$JEST_JSON"

log "baseline escrita em $BASELINE_FILE"
jq -r '"  sha=\(.sha)  lint_errors=\(.lint_errors)  tsc_ok=\(.tsc_ok)  testes a falhar=\(.totals.failed_tests)/\(.totals.tests) em \(.totals.failed_suites)/\(.totals.suites) suites"' "$BASELINE_FILE"

if [ "${LINT_ERRORS:-0}" = "0" ] && [ "$TSC_OK" = "true" ] \
   && [ "$(jq -r '.totals.failed_tests' "$BASELINE_FILE")" = "0" ]; then
  log "$BASE_BRANCH está VERDE — apaga $BASELINE_FILE para pôr o portão em modo estrito"
fi
