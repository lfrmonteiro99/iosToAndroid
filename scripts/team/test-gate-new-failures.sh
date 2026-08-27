#!/bin/bash
# Testa o PORTÃO independente do review.sh contra a avaria real de 2026-08-26:
# quatro PRs (#950, #951, #952, #944) integraram em dev com a shard 4 vermelha
# no GitHub, cada um legitimamente pela regra escrita — o portão media a
# CONTAGEM de testes a falhar contra a contagem da baseline, e a contagem nunca
# subiu.
#
# O portão é extraído por `sed` em vez de sourcing o review.sh inteiro: esse
# script tem efeitos no topo (locks, estado, gh) e não é sourceable. O que se
# testa aqui é a função de decisão, com lint/tsc/jest stubbed.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FAILED=0
pass() { echo "  ✅ $1"; }
fail() { echo "  ❌ $1"; FAILED=1; }

SB=$(mktemp -d /tmp/gate-test-XXXXXX)
trap 'rm -rf "$SB"' EXIT
export STATE_DIR="$SB/state"; mkdir -p "$STATE_DIR"
BASELINE_FILE="$STATE_DIR/baseline.json"
PR=999
WT="$SB/wt"; mkdir -p "$WT"

log()  { :; }
warn() { :; }
test_cmd() { echo "stub-jest"; }
# Cópia verbatim do lib.sh: o portão lê a baseline através dela, e stubá-la de
# outra forma testaria uma leitura que não é a real.
jqv() {
  local file="$1" filter="$2" fallback="${3:-}"
  local out
  out=$(jq -r "$filter" "$file" 2>/dev/null) || out=""
  [ "$out" = "null" ] && out=""
  printf '%s' "${out:-$fallback}"
}

# Stubs: os resultados de lint/tsc/jest vêm de variáveis, não de correr nada.
STUB_LINT=0
STUB_TSC=0
STUB_FAILING=""
npm() { return "$STUB_LINT"; }
npx() { return "$STUB_TSC"; }
# `$(test_cmd) -- --json --outputFile=...` chega aqui como `stub-jest ...`;
# escrevemos o JSON que o jest escreveria.
stub-jest() {
  local out=""
  for a in "$@"; do case "$a" in --outputFile=*) out="${a#--outputFile=}" ;; esac; done
  [ -n "$out" ] || return 0
  if [ "$STUB_FAILING" = "__NO_JSON__" ]; then return 1; fi
  python3 - "$out" <<'PY'
import json, os, sys
names = [n for n in os.environ.get('STUB_FAILING', '').split('\n') if n.strip()]
results = [{
  "name": f"/repo/{n.split(' › ')[0]}.test.tsx",
  "status": "failed" if names else "passed",
  "assertionResults": [
    {"status": "failed", "ancestorTitles": n.split(" › ")[:-1], "title": n.split(" › ")[-1]}
  ],
} for n in names]
json.dump({"numTotalTestSuites": 10, "numTotalTests": 100,
           "numFailedTests": len(names), "numFailedTestSuites": len(results),
           "testResults": results}, open(sys.argv[1], "w"))
PY
}
export -f stub-jest 2>/dev/null || true

# A função sob teste, extraída do script real para não duplicar a lógica aqui.
eval "$(sed -n '/^GATE_FAILING=""/,/^gate_independent() {$/p' "$SCRIPT_DIR/review.sh" | sed '$d')"
eval "$(sed -n '/^gate_independent() {/,/^}$/p' "$SCRIPT_DIR/review.sh")"

write_baseline() {  # $1 = failing test identities, one per line ("" = green)
  python3 - "$BASELINE_FILE" <<'PY'
import json, os, sys
names = [n for n in os.environ.get('BL', '').split('\n') if n.strip()]
json.dump({"sha": "abc1234", "lint_errors": 0, "lint_warnings": 3, "tsc_ok": True,
           "totals": {"suites": 10, "tests": 100,
                      "failed_tests": len(names), "failed_suites": len(names)},
           "failed_suites": sorted(names), "failed_tests": sorted(names)},
          open(sys.argv[1], "w"))
PY
}

run_gate() { STUB_FAILING="$1" BL="" gate_independent "$WT"; }

echo "PORTÃO: falhas novas vs baseline"

# ── A avaria de 2026-08-26 ─────────────────────────────────────────────────
BL="SomeOld › known failure" write_baseline
if STUB_FAILING="ConversationScreen — failed send preserves text and draft (#930) › keeps the typed message and the saved draft when the send is not confirmed" \
   gate_independent "$WT"; then
  fail "uma falha NOVA passou o portão porque a contagem não subiu (a avaria de 26/08)"
else
  pass "bloqueia uma falha nova quando a baseline tem outra, com a mesma contagem"
fi

# ── O caso geral: arranja um, parte outro ──────────────────────────────────
BL="A › one" write_baseline
if STUB_FAILING="B › two" gate_independent "$WT"; then
  fail "um PR que arranja um teste e parte outro passou (contagem igual)"
else
  pass "bloqueia arranjar-um-partir-outro, que a contagem não distingue"
fi

# ── O que NÃO deve bloquear ────────────────────────────────────────────────
BL="A › one" write_baseline
if STUB_FAILING="A › one" gate_independent "$WT"; then
  pass "deixa passar uma falha que a baseline já tinha (regressão, não perfeição)"
else
  fail "bloqueou uma falha pré-existente — isso pararia toda a fila"
fi

BL="A › one
B › two" write_baseline
if STUB_FAILING="A › one" gate_independent "$WT"; then
  pass "deixa passar um PR que ARRANJA uma das falhas da baseline"
else
  fail "bloqueou um PR que melhorou o estado"
fi

BL="A › one" write_baseline
if STUB_FAILING="" gate_independent "$WT"; then
  pass "deixa passar um PR que deixa a suite verde"
else
  fail "bloqueou um PR que pôs tudo verde"
fi

# ── Sem baseline: estrito ─────────────────────────────────────────────────
rm -f "$BASELINE_FILE"
if STUB_FAILING="A › one" gate_independent "$WT"; then
  fail "sem baseline, uma falha passou — o modo estrito exige os três verdes"
else
  pass "sem baseline é estrito: qualquer falha bloqueia"
fi
if STUB_FAILING="" gate_independent "$WT"; then
  pass "sem baseline, tudo verde passa"
else
  fail "sem baseline e tudo verde, bloqueou"
fi

# ── lint/tsc continuam a contar ───────────────────────────────────────────
BL="A › one" write_baseline
STUB_TSC=1
if STUB_FAILING="A › one" gate_independent "$WT"; then
  fail "tsc a falhar contra uma baseline com tsc_ok passou"
else
  pass "tsc limpo na baseline e agora a falhar bloqueia"
fi
STUB_TSC=0
STUB_LINT=1
if STUB_FAILING="A › one" gate_independent "$WT"; then
  fail "lint a falhar contra uma baseline com 0 erros passou"
else
  pass "lint limpo na baseline e agora a falhar bloqueia"
fi
STUB_LINT=0

# ── Jest sem JSON: ignorância não autoriza merge ──────────────────────────
BL="A › one" write_baseline
if STUB_FAILING="__NO_JSON__" gate_independent "$WT"; then
  fail "o jest não produziu JSON e o portão autorizou — merge por ignorância"
else
  pass "jest sem JSON é REPROVADO, não zero falhas"
fi

echo
echo "BASELINE: encolhe sozinha depois do merge"

# A segunda metade da avaria: o portão bloqueia falhas novas, mas uma baseline
# velha continua a perdoar um RE-partir de um teste já arranjado. Ninguém
# re-corria a baseline.sh à mão.
BL="A › one
B › two" write_baseline
GATE_FAILING="A › one" prune_baseline_after_merge
if [ "$(jq -r '.failed_tests | join(",")' "$BASELINE_FILE")" = "A › one" ]; then
  pass "retira da baseline a falha que já passa, mantém a que ainda falha"
else
  fail "não podou a baseline: $(jq -c '.failed_tests' "$BASELINE_FILE")"
fi
if [ "$(jq -r '.totals.failed_tests' "$BASELINE_FILE")" = "1" ]; then
  pass "actualiza a contagem, para não ficar a discordar da lista"
else
  fail "a contagem ficou dessincronizada da lista"
fi

BL="A › one" write_baseline
GATE_FAILING="" prune_baseline_after_merge
if [ ! -f "$BASELINE_FILE" ]; then
  pass "baseline vazia é APAGADA, e o portão volta ao modo estrito"
else
  fail "deixou uma baseline vazia — o portão fica preso em modo regressão"
fi

BL="A › one" write_baseline
GATE_FAILING="A › one" prune_baseline_after_merge
if [ "$(jq -r '.failed_tests | join(",")' "$BASELINE_FILE" 2>/dev/null)" = "A › one" ]; then
  pass "não mexe numa baseline cujas falhas continuam todas a falhar"
else
  fail "removeu uma falha que ainda falha"
fi

# O orçamento só pode descer. Uma falha nova NÃO entra na baseline pela poda —
# se entrasse, o portão passaria a perdoá-la a partir do merge seguinte.
BL="A › one" write_baseline
GATE_FAILING="A › one
C › new" prune_baseline_after_merge
if [ "$(jq -r '.failed_tests | join(",")' "$BASELINE_FILE")" = "A › one" ]; then
  pass "uma falha nova não é adoptada pela baseline — o orçamento só desce"
else
  fail "a poda ALARGOU a baseline: $(jq -c '.failed_tests' "$BASELINE_FILE")"
fi

rm -f "$BASELINE_FILE"
if GATE_FAILING="A › one" prune_baseline_after_merge; then
  pass "sem baseline, a poda é um no-op silencioso"
else
  fail "a poda falhou sem baseline"
fi

echo
[ "$FAILED" = "0" ] && echo "TODOS OS TESTES PASSARAM" || echo "HÁ TESTES A FALHAR"
exit "$FAILED"
