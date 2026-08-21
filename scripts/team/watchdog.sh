#!/bin/bash
# watchdog.sh — detecta que a pipeline não está a produzir, e repara o que sabe reparar.
#
# PORQUE EXISTE, E POR QUE MEDE O QUE MEDE
#
# A 2026-08-21 esta pipeline correu duas vezes sem entregar nada, e nas duas o
# log parecia saudável:
#
#   * 02:46→10:35 — 383 ciclos, 1069 despachos, ZERO agentes a arrancar. O
#     `command -v claude` falhava (PATH da sessão sem ~/.local/bin) e a condição
#     de um `if` que não entra não imprime nada. Do lado de fora: "sem veredicto,
#     issue adiado", 1069 vezes, e 64 issues parqueados.
#   * 11:08→12:16 — uma hora sem UMA review, com dois PRs à espera. O `log`
#     escrevia para stdout, envenenou um `$(...)`, e o registo de agentes ficou
#     com tags impossíveis de matar. Contavam como agentes "a aquecer", o
#     orçamento de memória deu-se por esgotado, e recusou tudo.
#
# A lição não é "faltava um monitor". É que um monitor de ACTIVIDADE teria dito
# "saudável" nos dois casos: havia ciclos, havia despachos, havia limpeza de
# worktrees. Só os RESULTADOS distinguem — um agente que arrancou, um veredicto
# lido, um PR aberto, um merge aterrado — e é só isso que o health_stamp marca.
#
# REGRA DE OURO DAS REPARAÇÕES: nenhuma pode ser capaz de correr em ciclo.
# Desencalhar um PR repetidamente é como se produzem 184 reviews do mesmo commit
# (aconteceu no projecto irmão). Todas passam pelo ledger_once.
#
# Usage: watchdog.sh [--report]
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"
ROLE="watchdog"

REPORT_ONLY=0
[ "${1:-}" = "--report" ] && REPORT_ONLY=1

ALERT_FILE="$HEALTH_DIR/ALERT"
REVIEWED_STATE="$STATE_DIR/reviewed-shas"

# Sem entregas durante isto, com agentes a correr, é avaria. Uma implementação
# leva ~25min e uma review ~6min, portanto uma hora é folgado: não dispara em
# trabalho lento, dispara em trabalho que não existe.
W_DELIVERY_S="${TEAM_HEALTH_DELIVERY_S:-3600}"
# Sem um único agente a ARRANCAR durante isto é avaria de motor, não de fila.
W_AGENT_S="${TEAM_HEALTH_AGENT_S:-1200}"
# PR aberto e sem toque durante isto, com a sha já marcada como revista, está
# encalhado (o pick_pr só volta a olhar se a sha se mover).
W_STRANDED_S="${TEAM_HEALTH_STRANDED_S:-3600}"
W_DEFER_MANY="${TEAM_HEALTH_DEFER_MANY:-15}"

FINDINGS=""
ACTIONS=""
finding() { FINDINGS="$FINDINGS
  - $1"; log "DETECTADO: $1"; }
action()  { ACTIONS="$ACTIONS
  - $1"; log "REPARADO: $1"; }

alert_raise() {
  printf '%s\n' "$(date '+%F %T') $1" > "$ALERT_FILE" 2>/dev/null || true
  log "ALERTA: $1"
}
alert_clear() { rm -f "$ALERT_FILE" 2>/dev/null || true; }

# ── W1. Tags-fantasma no registo de agentes vivos ──────────────────────────
#
# A que custou a hora. Duas classes:
#   * nome impossível — uma tag tem de ser `<role>-<numero>`; qualquer outra coisa
#     veio de um `$(...)` envenenado e NUNCA vai corresponder a um processo;
#   * PID morto — o processo foi-se sem passar pelo trap (SIGKILL, OOM).
#
# Ambas contam para o inflight_young_count, logo ambas roubam memória a agentes
# que existem de verdade. Isto corre em todos os ciclos e não custa nada.
w1_purge_ghosts() {
  local f tag pid n=0
  for f in "$INFLIGHT_DIR"/*; do
    [ -e "$f" ] || continue
    tag=$(basename "$f")
    case "$tag" in
      implement-*|review-*|curator-*)
        case "${tag##*-}" in
          ''|*[!0-9]*) [ "$REPORT_ONLY" = "1" ] || rm -f "$f"; n=$((n+1)); continue ;;
        esac ;;
      *) [ "$REPORT_ONLY" = "1" ] || rm -f "$f"; n=$((n+1)); continue ;;
    esac
    pid=$(awk '{print $1; exit}' "$f" 2>/dev/null || echo "")
    case "$pid" in
      ''|*[!0-9]*) [ "$REPORT_ONLY" = "1" ] || rm -f "$f"; n=$((n+1)); continue ;;
    esac
    if ! kill -0 "$pid" 2>/dev/null; then
      [ "$REPORT_ONLY" = "1" ] || rm -f "$f"
      n=$((n+1))
    fi
  done
  if [ "$n" -gt 0 ]; then
    finding "$n tag(s) de agente inválidas ou mortas no registo — inflavam o orçamento de memória"
    [ "$REPORT_ONLY" = "1" ] || action "$n tag(s) removidas do registo"
  fi
}

# ── W2. Nenhum motor utilizável ────────────────────────────────────────────
#
# A avaria da noite. Nada aqui dentro a repara — se o binário não existe, não
# existe — mas o silêncio é que era o problema, e um ALERTA no --status é a
# diferença entre perder dez minutos e perder oito horas.
w2_engines() {
  local c h
  c=$(claude_bin 2>/dev/null || true)
  h=$(hermes_bin 2>/dev/null || true)
  if [ -z "$c" ] && [ -z "$h" ]; then
    finding "NENHUM motor resolve (claude e hermes ausentes) — nenhum agente pode correr"
    alert_raise "sem motores: nem claude nem hermes resolvem. Define TEAM_CLAUDE_BIN/TEAM_HERMES_BIN."
    return 1
  fi
  if [ "$(health_count engine-missing)" -gt 0 ]; then
    finding "o run-agent não encontrou o binário do claude $(health_count engine-missing)x (PATH dos filhos)"
    if [ -n "$c" ]; then
      # Reparável: o binário existe, só não está no PATH de quem corre. Fixa-o
      # para os filhos futuros em vez de esperar que o PATH se conserte.
      if [ "$REPORT_ONLY" = "0" ]; then
        echo "$c" > "$HEALTH_DIR/claude-bin.resolved"
        action "caminho do claude fixado em $c (os roles resolvem por caminho, não por PATH)"
      fi
    fi
    [ "$REPORT_ONLY" = "1" ] || health_reset engine-missing
  fi
  return 0
}

# ── W3. Zero entregas ──────────────────────────────────────────────────────
#
# O guarda-chuva, e o único que teria apanhado AS DUAS avarias de hoje. Divide o
# diagnóstico em dois porque as reparações são diferentes:
#
#   * nem um agente ARRANCOU -> avaria de motor/orçamento (a noite, e a hora);
#   * agentes arrancam mas nada aterra -> avaria a jusante (veredictos, reviews,
#     merges) e isso não se repara às cegas: alerta.
w3_delivery() {
  local pr_age merge_age agent_age up
  pr_age=$(health_age pr-created); merge_age=$(health_age merge); agent_age=$(health_age agent-ran)

  # ARRANQUE NÃO É AVARIA. Sem esta guarda, o primeiro ciclo de cada arranque
  # dispara tudo: "nunca" é o valor de todos os marcadores e "nunca" é maior que
  # qualquer limite. A pipeline tem de ter tido TEMPO de entregar antes de se
  # dizer que não entrega.
  #
  # E SEM MARCADOR DE ARRANQUE, A RESPOSTA É "NÃO SEI", NÃO "HÁ MUITO TEMPO".
  # A primeira versão lia a ausência de `started` como uptime infinito — que é o
  # oposto do que significa — e disparava logo no primeiro ciclo. Apanhado pelo
  # teste do arranque limpo.
  up=$(health_age started)
  if [ "$up" -ge 999999 ]; then
    [ "$REPORT_ONLY" = "1" ] || health_stamp started
    return 0
  fi

  # Nada entregue há muito tempo?
  if [ "$pr_age" -lt "$W_DELIVERY_S" ] || [ "$merge_age" -lt "$W_DELIVERY_S" ]; then
    alert_clear
    return 0
  fi

  if [ "$agent_age" -ge "$W_AGENT_S" ]; then
    [ "$up" -ge "$W_AGENT_S" ] || return 0
    finding "nenhum agente ARRANCOU há $((agent_age / 60))min e nada foi entregue há $((pr_age / 60))min"
    # As duas causas conhecidas de "despacha mas não corre", ambas reparáveis:
    w1_purge_ghosts
    if [ "$REPORT_ONLY" = "0" ] && [ "$(inflight_count)" = "0" ] && ! mem_room_for_agent; then
      # Registo vazio e ainda assim "sem memória": é memória a sério, não fantasmas.
      finding "orçamento recusa agentes com o registo vazio — $(mem_status)"
      alert_raise "sem memória real para um agente: $(mem_status). Baixa TEAM_AGENT_MEM_MB/TEAM_MEM_FLOOR_MB ou fecha o que está a consumir."
    fi
    w5_clear_mass_deferrals
  else
    [ "$up" -ge "$W_DELIVERY_S" ] || return 0
    finding "agentes correm (último há $((agent_age / 60))min) mas não há PR nem merge há $((pr_age / 60))min"
    alert_raise "agentes a correr e nada a aterrar há $((pr_age / 60))min — vê os veredictos e as reviews"
  fi
}

# ── W4. PRs encalhados ─────────────────────────────────────────────────────
#
# O modo de falha que o próprio código já documenta e não sabia detectar: uma
# review que morre sem veredicto grava a sha em reviewed-shas, e o pick_pr só
# volta a olhar para um PR cuja HEAD se mova. Nada empurra para esse branch,
# logo o PR fica aberto para sempre. O #520 esteve assim 12 horas.
#
# Reparação: tirar a sha da lista, UMA vez por (pr,sha). Se voltar a encalhar com
# a mesma sha, o ledger recusa e o alerta fica — que é o comportamento certo, por
# ser exactamente assim que se produzem 184 reviews do mesmo commit.
w4_unstrand_prs() {
  local list line num sha upd age now
  command -v gh >/dev/null 2>&1 || return 0
  [ -f "$REVIEWED_STATE" ] || return 0

  list=$(gh pr list --repo "$REPO" --base "$BASE_BRANCH" --state open --limit 50 \
           --json number,headRefOid,headRefName,updatedAt \
           --jq '.[] | select(.headRefName | startswith("qa/")) | "\(.number) \(.headRefOid) \(.updatedAt)"' \
           2>/dev/null) || return 0
  [ -n "$list" ] || return 0
  now=$(date +%s)

  while IFS= read -r line; do
    [ -n "$line" ] || continue
    num=$(printf '%s' "$line" | cut -d' ' -f1)
    sha=$(printf '%s' "$line" | cut -d' ' -f2)
    upd=$(printf '%s' "$line" | cut -d' ' -f3)
    age=$(( now - $(date -d "$upd" +%s 2>/dev/null || echo "$now") ))
    [ "$age" -ge "$W_STRANDED_S" ] || continue
    grep -qxF "$num $sha" "$REVIEWED_STATE" 2>/dev/null || continue
    is_deferred "pr-$num" && continue

    finding "PR #$num encalhado: sem toque há $((age / 60))min e a sha já está marcada como revista"
    [ "$REPORT_ONLY" = "1" ] && continue
    if ledger_once "unstrand-$num-$sha"; then
      sed -i "/^$num $sha\$/d" "$REVIEWED_STATE"
      action "PR #$num devolvido à fila de review (sha $sha tirada de reviewed-shas)"
    else
      alert_raise "PR #$num volta a encalhar na MESMA sha ($sha) — já foi desencalhado uma vez. Olha para ele à mão."
    fi
  done <<< "$list"
}

# ── W5. Issues parqueados em massa ─────────────────────────────────────────
#
# O adiamento existe para issues que derrotam o agente. Quando o que falha é o
# MOTOR, adia-se a fila inteira por uma razão que não é dela — 64 issues numa
# noite. Se nada entrega e o motor voltou, os adiamentos são ruído: apagam-se.
w5_clear_mass_deferrals() {
  local n
  n=$(ls -A "$DEFER_DIR" 2>/dev/null | grep -c . || true)
  [ "$n" -ge "$W_DEFER_MANY" ] || return 0
  finding "$n issues adiados de uma vez — a marca de uma avaria de motor, não de $n issues difíceis"
  [ "$REPORT_ONLY" = "1" ] && return 0
  if ledger_once "mass-defer-clear" 3600; then
    rm -f "$DEFER_DIR"/* 2>/dev/null || true
    rm -f "$NOVERDICT_DIR"/* 2>/dev/null || true
    action "$n adiamentos e os contadores de não-veredicto limpos — a fila volta a ser tentada"
  fi
}

# ── W6. Baseline obsoleto ──────────────────────────────────────────────────
#
# Não impede a pipeline de correr; faz coisa pior. O portão do reviewer é
# "não pioraste em relação ao baseline", e o baseline estava medido 247 commits
# atrás, quando o repo tinha 180 testes contra os 720 de hoje. O #524 introduziu
# uma regressão de snapshot e o total de falhas continuou a bater com o número
# antigo — a régua convidava a aprovar.
w6_stale_baseline() {
  local sha ahead age
  [ -s "$BASELINE_FILE" ] || return 0
  sha=$(jqv "$BASELINE_FILE" '.sha' '')
  [ -n "$sha" ] || return 0
  git -C "$TEAM_ROOT" fetch origin "$BASE_BRANCH" >/dev/null 2>&1 || true
  ahead=$(git -C "$TEAM_ROOT" rev-list --count "$sha..origin/$BASE_BRANCH" 2>/dev/null || echo 0)
  age=$(( ( $(date +%s) - $(stat -c %Y "$BASELINE_FILE" 2>/dev/null || date +%s) ) / 3600 ))
  if [ "${ahead:-0}" -lt "${TEAM_HEALTH_BASELINE_AHEAD:-25}" ] && [ "$age" -lt 24 ]; then
    return 0
  fi
  finding "baseline medido $ahead commits atrás (há ${age}h) — o portão de regressão julga contra números velhos"
  [ "$REPORT_ONLY" = "1" ] && return 0
  if ledger_once "baseline-refresh" 21600; then
    if bash "$SCRIPT_DIR/baseline.sh" >/dev/null 2>&1; then
      action "baseline remedido em $(jqv "$BASELINE_FILE" '.sha' '?')"
    else
      warn "não consegui remedir o baseline"
    fi
  fi
}

# ── Relatório ──────────────────────────────────────────────────────────────
summary() {
  echo "saúde da pipeline:"
  printf '  %-16s %s\n' "agente arrancou" "$(fmt_age "$(health_age agent-ran)")"
  printf '  %-16s %s\n' "PR aberto"       "$(fmt_age "$(health_age pr-created)")"
  printf '  %-16s %s\n' "merge"           "$(fmt_age "$(health_age merge)")"
  printf '  %-16s %s\n' "agentes vivos"   "$(inflight_count)"
  printf '  %-16s %s\n' "adiados"         "$(ls -A "$DEFER_DIR" 2>/dev/null | grep -c . || true)"
  printf '  %-16s %s\n' "memória"         "$(mem_status)"
  if [ -f "$ALERT_FILE" ]; then
    echo "  ⚠️  ALERTA: $(cat "$ALERT_FILE")"
  fi
  [ -n "$FINDINGS" ] && echo "detectado:$FINDINGS"
  [ -n "$ACTIONS" ]  && echo "reparado:$ACTIONS"
  return 0
}

fmt_age() {
  local s="$1"
  [ "$s" -ge 999999 ] && { echo "nunca"; return; }
  if [ "$s" -lt 90 ]; then echo "há ${s}s"; else echo "há $((s / 60))min"; fi
}

# ── Ordem: barato e local primeiro, rede só depois ─────────────────────────
w1_purge_ghosts
w2_engines || true
w3_delivery
w6_stale_baseline

# W4 fala com o GitHub, portanto tem passo próprio: uma vez a cada 10 minutos,
# não a cada 45 segundos.
if [ "$REPORT_ONLY" = "1" ] || ledger_once "w4-poll" 600; then
  w4_unstrand_prs
fi

[ "$REPORT_ONLY" = "1" ] && summary
exit 0
