#!/bin/bash
# supervise.sh — mantém o orquestrador vivo.
#
# PORQUE ISTO EXISTE
#
# O orquestrador é um batch job, não um daemon: quando `count_actionable` dá zero
# ele escreve "BACKLOG VAZIO" e faz `exit 0` (orchestrator.sh, fim do loop). Isso
# era o comportamento certo quando o backlog era um lote fixo de 83 issues — correr
# até esvaziar e parar. Deixou de servir no momento em que os issues passaram a
# chegar de forma contínua: um `qa:ready` filado depois desse instante fica na fila
# para sempre, porque não há ninguém a olhar.
#
# O start.sh também não relançava nada. Lançava `orchestrator.sh` UMA vez dentro do
# tmux e terminava com `echo '--- TERMINOU ---'; read -r`, que só existe para a pane
# não fechar. Pior: como a pane fica parqueada nesse `read`, a sessão tmux existe
# para sempre, e o `--status` — que decidia por `tmux has-session` — respondia
# "a correr" com o processo morto há horas. A avaria era invisível por construção.
#
# PORQUE SUPERVISIONAR EM VEZ DE TIRAR O `exit 0`
#
# Trocar o `exit 0` por um sleep resolvia metade: a fila vazia. Não resolvia o
# orquestrador a CRASHAR, que hoje é igualmente fatal e igualmente invisível.
# Um supervisor cobre os dois com o mesmo mecanismo, e mantém o orquestrador
# honesto sobre o que é — um batch que drena a fila e sai.
#
# BACKOFF, E PORQUE NÃO É UM NÚMERO SÓ
#
# Saída limpa com fila vazia é o caso NORMAL, e relançar de 45 em 45s para sempre
# gastava o rate limit do `gh` sem fazer nada. Esse caso espera TEAM_IDLE_SLEEP
# (omissão: 300s).
#
# Saída suja é outra coisa: pode ser um erro transitório ou pode ser o orquestrador
# a morrer no arranque em ciclo apertado (credenciais em falta, `gh` sem auth, disco
# cheio). Aí o backoff é exponencial a partir de TEAM_FAIL_SLEEP (omissão: 30s), até
# TEAM_FAIL_SLEEP_MAX (omissão: 600s), e só reinicia depois de uma execução que dure
# mais de TEAM_RUN_OK_S (omissão: 120s) — sem esse critério, um crash-loop rápido
# reiniciaria o backoff a cada volta e martelaria a API.
#
# USO
#   supervise.sh [<args do orquestrador>]
#
# Não é para ser invocado à mão — o start.sh lança-o dentro do tmux. Os modos de
# batch explícitos (--once, --max-cycles, --issue, --pr) NÃO passam por aqui: o
# start.sh corre-os directos, porque relançar um `--once` seria desobedecer ao
# pedido.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"
ROLE="supervise"

IDLE_SLEEP="${TEAM_IDLE_SLEEP:-300}"
FAIL_SLEEP="${TEAM_FAIL_SLEEP:-30}"
FAIL_SLEEP_MAX="${TEAM_FAIL_SLEEP_MAX:-600}"
RUN_OK_S="${TEAM_RUN_OK_S:-120}"

PID_FILE="$STATE_DIR/supervisor.pid"
# O orchestrator.pid é escrito pelo PRÓPRIO orquestrador (ver o topo do
# orchestrator.sh), para que o modo batch — que não passa por aqui — fique
# igualmente visível ao `--status`. O supervisor não lhe toca.

# O PID do supervisor é o que o `--status` lê. Escrito antes de qualquer trabalho
# para não haver janela em que estamos vivos e não constamos.
echo "$$" > "$PID_FILE"

CHILD=""
CLEANED=0
cleanup() {
  [ "$CLEANED" = "1" ] && return 0
  CLEANED=1
  # O orquestrador é o dono dos agentes; matá-lo aqui é deliberado e suficiente
  # para o ciclo. As árvores de agentes que sobrevivam são tratadas pelo
  # `start.sh --stop`, que é quem sabe dos pgid e dos locks.
  if [ -n "$CHILD" ] && kill -0 "$CHILD" 2>/dev/null; then
    log "a terminar o orquestrador (pid $CHILD)"
    kill -TERM "$CHILD" 2>/dev/null || true
  fi
  rm -f "$PID_FILE"
}

# O TRAP DE SINAL TEM DE SAIR, e não é detalhe: `trap cleanup EXIT INT TERM` corria
# o cleanup no SIGTERM e o bash RETOMAVA o loop a seguir. O `start.sh --stop` ficava
# assim com o pior dos dois mundos — pid file apagado (logo o `--status` a dizer
# "parado") e o supervisor vivo a relançar o orquestrador. Apanhado a testar o
# caminho de paragem; sem o teste tinha passado como correcto à leitura.
trap cleanup EXIT
trap 'cleanup; exit 143' TERM
trap 'cleanup; exit 130' INT

log "supervisor activo (pid $$) — idle=${IDLE_SLEEP}s falha=${FAIL_SLEEP}s..${FAIL_SLEEP_MAX}s"

fail_backoff="$FAIL_SLEEP"
run=0

while :; do
  run=$((run + 1))
  started=$(date +%s)

  log "──── arranque #$run do orquestrador ────"
  bash "$SCRIPT_DIR/orchestrator.sh" "$@" &
  CHILD=$!
  wait "$CHILD"
  rc=$?
  CHILD=""

  elapsed=$(( $(date +%s) - started ))

  # 130/143 = SIGINT/SIGTERM. Foi alguém a parar isto de propósito; respeitar e sair,
  # em vez de relançar por cima de um `--stop`.
  if [ "$rc" = "130" ] || [ "$rc" = "143" ]; then
    log "o orquestrador foi interrompido (rc=$rc) — o supervisor sai também"
    exit 0
  fi

  if [ "$rc" = "0" ]; then
    # Saída limpa. Na prática significa "backlog vazio" — o único outro caminho de
    # exit 0 são os modos de batch, e esses nem chegam aqui (ver o cabeçalho).
    fail_backoff="$FAIL_SLEEP"
    log "orquestrador saiu limpo após ${elapsed}s (fila vazia). Nova sondagem em ${IDLE_SLEEP}s."
    sleep "$IDLE_SLEEP"
    continue
  fi

  # Saída suja.
  if [ "$elapsed" -ge "$RUN_OK_S" ]; then
    # Correu tempo suficiente para não ser um crash-loop de arranque: o backoff
    # acumulado até aqui já não descreve a situação.
    fail_backoff="$FAIL_SLEEP"
    log "orquestrador falhou (rc=$rc) após ${elapsed}s. A relançar em ${fail_backoff}s."
  else
    log "orquestrador falhou (rc=$rc) ao fim de apenas ${elapsed}s. A relançar em ${fail_backoff}s."
  fi

  sleep "$fail_backoff"

  fail_backoff=$(( fail_backoff * 2 ))
  [ "$fail_backoff" -gt "$FAIL_SLEEP_MAX" ] && fail_backoff="$FAIL_SLEEP_MAX"
done
