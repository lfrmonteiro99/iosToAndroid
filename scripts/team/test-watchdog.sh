#!/bin/bash
# Testa o watchdog contra as falhas REAIS de 2026-08-21, ponta a ponta (corre o
# script de verdade, com gh e motores stubbed).
set -uo pipefail

TEAM_DIR="$HOME/Documentos/iosToAndroid/scripts/team"
FAILED=0
pass() { echo "  ✅ $1"; }
fail() { echo "  ❌ $1"; FAILED=1; }

new_sandbox() {
  SB=$(mktemp -d /tmp/wd-test-XXXXXX)
  export TEAM_VERDICT_DIR="$SB/verdicts" TEAM_STATE_DIR="$SB/state" \
         TEAM_WT_ROOT="$SB/wt" TEAM_LOG_DIR="$SB/logs" TEAM_LOCK_PREFIX="$SB/lock"
  mkdir -p "$TEAM_VERDICT_DIR" "$TEAM_STATE_DIR" "$TEAM_WT_ROOT" "$TEAM_LOG_DIR"
  H="$TEAM_STATE_DIR/health"; IN="$TEAM_STATE_DIR/inflight"; mkdir -p "$H" "$IN"
  # stub do gh: sem PRs, salvo quando o teste escrever GH_PRS
  mkdir -p "$SB/bin"
  cat > "$SB/bin/gh" <<'STUB'
#!/bin/bash
[ -f "$GH_PRS_FILE" ] && cat "$GH_PRS_FILE" || true
exit 0
STUB
  chmod +x "$SB/bin/gh"
  export GH_PRS_FILE="$SB/no-prs"
  export PATH="$SB/bin:$PATH"
  # sem motores por omissão só nos testes que o pedem
  unset TEAM_CLAUDE_BIN TEAM_HERMES_BIN
}
wd() { bash "$TEAM_DIR/watchdog.sh" "$@" 2>&1; }

echo "TESTE 1: tag-fantasma (nome envenenado por \$(captura)) — a avaria das 11:08"
new_sandbox
printf '99999 impl1\n' > "$IN/implement-[orchestrator] 12:12 #475: rejeicoes... 475"
printf '%s impl2\n' "$$" > "$IN/implement-475"
OUT=$(wd);
[ ! -e "$IN/implement-[orchestrator] 12:12 #475: rejeicoes... 475" ] && pass "tag impossível removida" || fail "tag impossível sobreviveu"
[ -f "$IN/implement-475" ] && pass "tag válida e viva preservada" || fail "REMOVEU uma tag viva"
echo "$OUT" | grep -q "inflavam o orçamento" && pass "detecção reportada" || fail "não reportou"
rm -rf "$SB"

echo "TESTE 2: PID morto"
new_sandbox
printf '999999 impl1\n' > "$IN/implement-500"
wd >/dev/null
[ ! -f "$IN/implement-500" ] && pass "tag com PID morto removida" || fail "tag morta sobreviveu"
rm -rf "$SB"

echo "TESTE 3: arranque não é avaria (sem marcadores nenhuns)"
new_sandbox
OUT=$(wd)
echo "$OUT" | grep -qE "nenhum agente ARRANCOU|nada a aterrar" && fail "disparou no arranque" || pass "silencioso no arranque"
[ ! -f "$H/ALERT" ] && pass "sem alerta no arranque" || fail "levantou alerta no arranque"
rm -rf "$SB"

echo "TESTE 4: motor nenhum resolve — a avaria da noite"
new_sandbox
export TEAM_CLAUDE_BIN=/nao/existe TEAM_HERMES_BIN=/nao/existe
OUT=$(wd)
echo "$OUT" | grep -q "NENHUM motor resolve" && pass "detectou ausência de motores" || fail "não detectou"
[ -f "$H/ALERT" ] && pass "alerta escrito ($(cut -c1-40 < "$H/ALERT")...)" || fail "não escreveu alerta"
unset TEAM_CLAUDE_BIN TEAM_HERMES_BIN
rm -rf "$SB"

echo "TESTE 5: zero entregas com agentes a correr → alerta"
new_sandbox
NOW=$(date +%s)
echo $((NOW - 7200)) > "$H/started"
echo $((NOW - 60))   > "$H/agent-ran"     # agentes correm
echo $((NOW - 7200)) > "$H/pr-created"    # mas nada aterra
echo $((NOW - 7200)) > "$H/merge"
OUT=$(wd)
echo "$OUT" | grep -q "nada a aterrar\|não há PR nem merge" && pass "detectou entrega parada" || fail "não detectou"
[ -f "$H/ALERT" ] && pass "alerta escrito" || fail "sem alerta"
rm -rf "$SB"

echo "TESTE 6: nem um agente arranca → limpa adiamentos em massa (a noite)"
new_sandbox
NOW=$(date +%s); mkdir -p "$TEAM_STATE_DIR/deferred" "$TEAM_STATE_DIR/noverdict"
echo $((NOW - 7200)) > "$H/started"; echo $((NOW - 7200)) > "$H/agent-ran"
echo $((NOW - 7200)) > "$H/pr-created"; echo $((NOW - 7200)) > "$H/merge"
for i in $(seq 200 264); do echo $((NOW + 600)) > "$TEAM_STATE_DIR/deferred/$i"; echo 3 > "$TEAM_STATE_DIR/noverdict/$i"; done
B=$(ls "$TEAM_STATE_DIR/deferred" | wc -l)
OUT=$(wd)
A=$(ls "$TEAM_STATE_DIR/deferred" | wc -l)
echo "$OUT" | grep -q "adiados de uma vez" && pass "detectou parqueamento em massa ($B issues)" || fail "não detectou"
[ "$A" = "0" ] && pass "adiamentos limpos ($B → $A)" || fail "não limpou ($B → $A)"
# segunda passagem imediata NÃO deve repetir (ledger)
for i in 300 301; do echo $((NOW + 600)) > "$TEAM_STATE_DIR/deferred/$i"; done
wd >/dev/null
[ "$(ls "$TEAM_STATE_DIR/deferred" | wc -l)" = "2" ] && pass "ledger impede repetição imediata" || fail "repetiu a limpeza"
rm -rf "$SB"

echo "TESTE 7: PR encalhado (o #520, 12h aberto) → desencalha uma vez só"
new_sandbox
NOW=$(date +%s); OLD=$(date -u -d '3 hours ago' +%Y-%m-%dT%H:%M:%SZ)
echo $((NOW - 7200)) > "$H/started"; echo $((NOW - 60)) > "$H/agent-ran"
echo $((NOW - 60)) > "$H/pr-created"
printf '520 abc123 %s\n' "$OLD" > "$SB/prs"; export GH_PRS_FILE="$SB/prs"
printf '520 abc123\n999 zzz\n' > "$TEAM_STATE_DIR/reviewed-shas"
OUT=$(wd)
echo "$OUT" | grep -q "PR #520 encalhado" && pass "detectou o encalhe" || fail "não detectou"
grep -q "^520 abc123$" "$TEAM_STATE_DIR/reviewed-shas" && fail "não desencalhou" || pass "sha removida — volta à fila"
grep -q "^999 zzz$" "$TEAM_STATE_DIR/reviewed-shas" && pass "não mexeu nas outras shas" || fail "estragou a lista"
# repõe a sha e corre outra vez: o ledger tem de recusar e ALERTAR em vez de repetir
printf '520 abc123\n999 zzz\n' > "$TEAM_STATE_DIR/reviewed-shas"
rm -f "$TEAM_STATE_DIR/health/ledger/w4-poll"
OUT=$(wd)
if grep -q "^520 abc123$" "$TEAM_STATE_DIR/reviewed-shas"; then
  pass "ledger recusou repetir na mesma sha"
  grep -q "MESMA sha" "$H/ALERT" 2>/dev/null && pass "alertou em vez de entrar em ciclo" || fail "não alertou"
else
  fail "desencalhou a mesma sha duas vezes — é o caminho para 184 reviews do mesmo commit"
fi
rm -rf "$SB"

echo "TESTE 8: --report não repara, só relata"
new_sandbox
printf '99999 impl1\n' > "$IN/implement-bad-tag"
OUT=$(wd --report)
[ -f "$IN/implement-bad-tag" ] && pass "--report não apagou nada" || fail "--report reparou (não devia)"
echo "$OUT" | grep -q "saúde da pipeline" && pass "sumário impresso" || fail "sem sumário"
echo "$OUT" | grep -q "agentes vivos" && pass "métricas presentes" || fail "sem métricas"
rm -rf "$SB"

echo
[ "$FAILED" = "0" ] && echo "TODOS OS TESTES PASSARAM" || echo "HÁ TESTES A FALHAR"
exit "$FAILED"
