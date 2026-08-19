#!/bin/bash
# start.sh — run the pipeline in a detached tmux session so it survives the terminal
# closing, and so you can attach to watch it work.
#
# Usage: start.sh [--attach] [--stop] [--status] [-- <orchestrator args>]
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"
ROLE="start"

SESSION="${TEAM_SESSION:-ios2android-qa}"
ACTION="start"
declare -a ORCH_ARGS=()

while [ $# -gt 0 ]; do
  case "$1" in
    --attach) ACTION="attach"; shift ;;
    --stop) ACTION="stop"; shift ;;
    --status) ACTION="status"; shift ;;
    --) shift; ORCH_ARGS+=("$@"); break ;;
    *) ORCH_ARGS+=("$1"); shift ;;
  esac
done

case "$ACTION" in
  attach)
    exec tmux attach -t "$SESSION"
    ;;
  stop)
    tmux kill-session -t "$SESSION" 2>/dev/null && log "sessão '$SESSION' terminada" \
      || log "sessão '$SESSION' não estava a correr"

    # Killing the tmux session is NOT enough. run-agent.sh puts each agent in its own
    # process group via setsid precisely so it can be killed as a unit — which also
    # means it SURVIVES the session dying, and keeps holding its lock slot. The next
    # orchestrator's first dispatch then aborts instantly with exit 75 and produces
    # no verdict.
    for pgidfile in "$LOCK_PREFIX".*.lock.pgid; do
      [ -f "$pgidfile" ] || continue
      pgid=$(cat "$pgidfile" 2>/dev/null || echo "")
      if [ -n "$pgid" ] && kill -0 -"$pgid" 2>/dev/null; then
        log "a terminar a árvore do agente (pgid $pgid)"
        kill -TERM -"$pgid" 2>/dev/null || true
        sleep 2
        kill -KILL -"$pgid" 2>/dev/null || true
      fi
      rm -f "$pgidfile"
    done

    # Belt and braces: kill whatever still holds a lock file even if no pgid file
    # points at it. An agent that outlived its parent has no pgid record (the exit
    # trap removes it), so the lock file itself is the only remaining handle on it.
    for lock in "$LOCK_PREFIX".*.lock; do
      [ -f "$lock" ] || continue
      holders=$(fuser "$lock" 2>/dev/null | tr -s ' ' '\n' | grep -E '^[0-9]+$' || true)
      for pid in $holders; do
        log "a terminar processo órfão $pid que ainda segura $(basename "$lock")"
        kill -TERM "$pid" 2>/dev/null || true
      done
      [ -n "$holders" ] && { sleep 2; for pid in $holders; do kill -KILL "$pid" 2>/dev/null || true; done; }
    done
    exit 0
    ;;
  status)
    if tmux has-session -t "$SESSION" 2>/dev/null; then
      echo "orquestrador: a correr (tmux '$SESSION')"
    else
      echo "orquestrador: parado"
    fi
    echo -n "issues por estado: "
    for s in qa:ready qa:wip qa:review qa:blocked-impl qa:blocked-spec qa:triage qa:needs-human; do
      # --limit 300: `gh issue list` defaults to 30, so without it the status
      # command silently CAPS every count at 30. It reported "qa:ready=30" against
      # a queue of 80 — a status line that under-reports is worse than none, since
      # it looks precise.
      n=$(gh issue list --repo "$REPO" --label "$s" --state open --limit 300 --json number --jq 'length' 2>/dev/null || echo 0)
      [ "$n" != "0" ] && printf '%s=%s ' "$s" "$n"
    done
    echo
    echo -n "PRs abertos (qa/*): "
    gh pr list --repo "$REPO" --base "$BASE_BRANCH" --state open \
      --json number,headRefName --jq '[.[] | select(.headRefName|startswith("qa/")) | "#\(.number)"] | join(" ")' \
      2>/dev/null || echo "?"
    echo "fechados até agora: $(gh issue list --repo "$REPO" --label qa:done --state closed --limit 300 --json number --jq 'length' 2>/dev/null || echo '?')"

    # PRs QUE PARARAM DE SER OLHADOS.
    #
    # A ausência de actividade num sítio específico é o que nenhum monitor apanha:
    # o board mostra "em review" e ninguém repara que ninguém está a rever. Quatro
    # PRs ficaram assim, o mais antigo catorze horas, e foi o utilizador que deu por
    # isso — duas vezes.
    #
    # Um PR aberto há mais de uma hora sem actualização é, na prática, sempre um
    # destes casos: sha marcado como revisto sem ter sido julgado, ou adiado à
    # espera de motor.
    # `gh --jq` does not take `--arg`, so the cutoff is interpolated into the
    # filter instead. The first version passed --arg and silently produced nothing:
    # a check for silent failures that itself failed silently.
    CUT=$(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%SZ)
    STALE=$(gh pr list --repo "$REPO" --base "$BASE_BRANCH" --state open --limit 100 \
      --json number,updatedAt,headRefName \
      --jq "[.[] | select(.headRefName|startswith(\"qa/\")) | select(.updatedAt < \"$CUT\") | .number] | join(\",\")" \
      2>/dev/null || echo "")
    if [ -n "${STALE//[[:space:]]/}" ]; then
      echo "⚠️  PRs parados há >1h: #${STALE//,/, #}"
      for p in ${STALE//,/ }; do
        if is_deferred "pr-$p"; then
          echo "    #$p adiado até $(date -d "@$(cat "$DEFER_DIR/pr-$p")" '+%H:%M') (à espera de motor)"
        else
          echo "    #$p sem adiamento — verifica se a sha está em reviewed-shas sem ter sido julgado"
        fi
      done
    fi

    # FECHOS ACIDENTAIS.
    #
    # Um issue fechado que ainda traz uma etiqueta de TRABALHO (ready/wip/review/
    # blocked-*) nunca passou por `qa:done` — logo ninguém o entregou, alguém o
    # fechou por fora. Na prática isso quer dizer uma palavra-chave do GitHub numa
    # frase: `fix #N`, `closes #N`.
    #
    # Aconteceu duas vezes na primeira noite, ambas por prosa minha. A segunda foi o
    # PR que corrigia exactamente este problema: o corpo citava as frases ofensivas
    # como exemplo e o GitHub obedeceu-lhes, fechando #215 e #212 — este último sem
    # uma única linha de trabalho feita.
    #
    # A verificação é barata e é a única forma de dar por isso: um issue fechado sai
    # da fila em silêncio e parece entregue.
    ORPH=$(gh issue list --repo "$REPO" --state closed --limit 200 --json number,labels \
      --jq '[.[] | select([.labels[].name] | any(startswith("qa:")) and (any(. == "qa:done") | not)) | .number] | @csv' \
      2>/dev/null || echo "")
    if [ -n "${ORPH//[\"[:space:]]/}" ]; then
      echo "⚠️  FECHADOS SEM TEREM SIDO ENTREGUES: #${ORPH//,/, #}"
      echo "    (fechados com etiqueta de trabalho — provável palavra-chave do GitHub em prosa)"
    fi
    exit 0
    ;;
esac

if tmux has-session -t "$SESSION" 2>/dev/null; then
  log "sessão '$SESSION' já está a correr. Usa --attach, ou --stop primeiro."
  exit 1
fi

LOGFILE="$LOG_DIR/orchestrator-$(date +%Y%m%d-%H%M%S).log"
log "a arrancar em tmux '$SESSION'; log: $LOGFILE"

# `tee` into a file as well as the pane: once a pane closes there is no way to
# inspect what happened, and this thing runs for hours unattended.
tmux new-session -d -s "$SESSION" -n orchestrator \
  "cd '$SCRIPT_DIR' && bash orchestrator.sh ${ORCH_ARGS[*]:-} 2>&1 | tee '$LOGFILE'; echo '--- TERMINOU ---'; read -r"

cat <<EOF
Pipeline a correr.
  Ver:      tmux attach -t $SESSION      (ou: start.sh --attach)
  Estado:   bash scripts/team/start.sh --status
  Log:      tail -f $LOGFILE
  Parar:    bash scripts/team/start.sh --stop
EOF
