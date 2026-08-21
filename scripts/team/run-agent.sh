#!/bin/bash
# run-agent.sh — runs ONE agent: the Claude Code harness plus a prompt.
#
# Primary path is the local `claude` CLI on the user's subscription. When that
# subscription is out of usage we fall back to running the same harness against an
# Ollama Cloud model (`ollama launch claude`). The harness — and therefore the tools
# the agent has — is identical either way; only the model behind it changes.
#
# Usage: run-agent.sh <prompt-file> <workdir> [timeout_s]
#
# Environment:
#   AGENT_SLOT          lock scope. Roles that write to git/GitHub share the
#                       default slot so only one of them ever runs at a time.
#   AGENT_ALLOWED_TOOLS --allowedTools value (default: a read/write/bash set)
#   AGENT_ADD_DIRS      colon-separated extra --add-dir paths
#   CLAUDE_MODEL        default: sonnet
#   FALLBACK_MODEL      default: deepseek-v4-flash:cloud
#   AGENT_FORCE_FALLBACK=1  skip the subscription entirely (for testing)
set -uo pipefail

PROMPT_FILE="${1:?ficheiro de prompt obrigatorio}"
WORKDIR="${2:?workdir obrigatorio}"
TIMEOUT_S="${3:-900}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"
ROLE="run-agent"

CLAUDE_MODEL="${CLAUDE_MODEL:-sonnet}"
FALLBACK_MODEL="${AGENT_FALLBACK_MODEL:-${FALLBACK_MODEL:-deepseek-v4-flash:cloud}}"
AGENT_SLOT="${AGENT_SLOT:-main}"

[ -f "$PROMPT_FILE" ] || { echo "ERRO: prompt não existe: $PROMPT_FILE" >&2; exit 1; }
[ -d "$WORKDIR" ]     || { echo "ERRO: workdir não existe: $WORKDIR" >&2; exit 1; }

# ── Lock ───────────────────────────────────────────────────────────────────
# `-w 0`: if this slot is already busy, ABORT NOW rather than queue. Waiting is
# what let a timed-out agent stay alive while the next cycle started another one on
# top of it — two live agents on the same repo.
LOCK="$LOCK_PREFIX.$AGENT_SLOT.lock"
exec 9>"$LOCK"
if ! flock -w 0 9; then
  echo "[run-agent] ABORTADO: slot '$AGENT_SLOT' já tem um agente a correr" >&2
  exit 75
fi

# `setsid` puts the agent and every descendant in their own process group, and we
# record the leader pid (= pgid). That is what lets the orchestrator kill exactly
# OUR agent tree later. Do not reach for `pkill -f claude`: it also kills whatever
# `claude` the user happens to be running in another terminal.
PGID_FILE="$LOCK.pgid"
cleanup() { rm -f "$PGID_FILE"; }
trap cleanup EXIT

COOLDOWN_FILE="$STATE_DIR/claude-usage-cooldown"

# True when a previous run hit the usage limit recently. Without this we would spend
# one doomed request per cycle re-discovering that the quota is gone.
in_cooldown() {
  [ -f "$COOLDOWN_FILE" ] || return 1
  local until_ts now
  until_ts=$(cat "$COOLDOWN_FILE" 2>/dev/null || echo 0)
  now=$(date +%s)
  [ "$now" -lt "$until_ts" ]
}

start_cooldown() {
  local mins="${1:-45}"
  echo $(( $(date +%s) + mins * 60 )) > "$COOLDOWN_FILE"
  echo "[run-agent] cooldown da subscrição: ${mins}min" >&2
}

# The CLI states when the quota comes back — "resets 3:20pm (Europe/Lisbon)" — so
# use it instead of guessing. A fixed 45min cooldown against a 79min wait just means
# waking up early, failing again, and cooling down a second time.
cooldown_until_reset() {
  local out="$1" stamp target now mins
  stamp=$(grep -oiE 'resets? [0-9]{1,2}(:[0-9]{2})? ?(am|pm)?' <<<"$out" | head -1 \
          | sed -E 's/^resets? //I')
  if [ -n "$stamp" ]; then
    target=$(date -d "$stamp" +%s 2>/dev/null || echo "")
    if [ -n "$target" ]; then
      now=$(date +%s)
      [ "$target" -le "$now" ] && target=$((target + 86400))
      # +2min of slack: waking at the exact boundary tends to fail once more.
      mins=$(( (target - now) / 60 + 2 ))
      [ "$mins" -gt 0 ] && [ "$mins" -lt 1440 ] && { start_cooldown "$mins"; return 0; }
    fi
  fi
  return 1
}

# Distinguish "out of quota" from "the agent failed at its task". Only the former
# justifies burning the fallback model.
#
# BE GENEROUS WITH THE PATTERNS. The first version matched 'usage limit' but the CLI
# actually says "You've hit your session limit · resets 3:20pm" — so the fallback
# never fired and a perfectly good issue was parked mid-run. Missing an exhaustion
# message costs a whole work item; over-matching costs one cheap fallback run.
is_usage_exhausted() {
  local out="$1"
  grep -qiE \
    'usage limit|session limit|hit your [a-z ]*limit|limit.*reset|resets? (at|[0-9])|rate.?limit|quota (exceeded|reached)|too many requests|429|insufficient (quota|credit)|upgrade to (pro|max)|out of (credit|quota)' \
    <<<"$out"
}

# THE AGENT MUST ACTUALLY BE IN THE WORKTREE.
#
# This script took $WORKDIR, validated it, printed it in the log — and never
# entered it. So the harness inherited the CALLER's cwd, which for every role is
# `scripts/team` inside the main checkout. Claude Code roots its project scope at
# the process cwd, so the worktree the agent was told to work in
# (`__WORKDIR__` in the prompt) sat entirely outside that scope: Read/Write/Edit
# on the code under test were out of bounds, and the only writable path was the
# verdict dir from --add-dir.
#
# From the outside that looks exactly like "the model could not do the task" —
# three dispatches of #190 died in ~3 minutes each, and I read that as the
# fallback engine being incapable. It was not: probed directly, the same engine
# answers correctly on the same slot. It was an implementer with no access to the
# tree it was asked to change.
#
# Inherited from the sibling project's run-agent.sh, which has the same gap.
cd "$WORKDIR" || { echo "ERRO: não consegui entrar em $WORKDIR" >&2; exit 1; }

build_add_dirs() {
  local -a args=()
  # Belt and braces alongside the cd: if a role ever passes a workdir that is not
  # the tree root (or cwd changes underneath), the tree stays in scope.
  args+=(--add-dir "$WORKDIR")
  # The verdict is written OUTSIDE the working tree, so the harness has to be told
  # that directory is in scope — otherwise it refuses the Write and the agent
  # finishes having recorded nothing, which is the exact failure this whole design
  # exists to prevent.
  args+=(--add-dir "$VERDICT_DIR")
  if [ -n "${AGENT_ADD_DIRS:-}" ]; then
    local IFS=':'
    for d in $AGENT_ADD_DIRS; do
      [ -n "$d" ] && args+=(--add-dir "$d")
    done
  fi
  printf '%s\n' "${args[@]}"
}

DEFAULT_TOOLS='Read,Write,Edit,Glob,Grep,Bash,TodoWrite'
ALLOWED_TOOLS="${AGENT_ALLOWED_TOOLS:-$DEFAULT_TOOLS}"

mapfile -t ADD_DIR_ARGS < <(build_add_dirs)

run_harness() {
  local kind="$1" model="$2"; shift 2
  local -a cmd=("$@")

  echo "[run-agent] motor=$kind modelo=$model workdir=$WORKDIR timeout=${TIMEOUT_S}s" >&2

  local out_file
  out_file=$(mktemp "/tmp/run-agent-$AGENT_SLOT.XXXXXX.out")

  # Output is STREAMED, not captured-then-printed. Capturing meant a 30-minute agent
  # produced exactly one line in the log until the moment it finished, which made
  # perfectly healthy runs look dead. For something unattended for hours, being able
  # to watch it work is not a luxury.
  #
  # Process substitution keeps `$!` pointing at the setsid leader (so the pgid
  # bookkeeping still works) while tee-ing to our stdout and keeping a copy for the
  # usage-exhaustion check below.
  #
  # `-k 30`: if SIGTERM doesn't kill it, SIGKILL follows 30s later.
  #
  # `9>&-` CLOSES THE LOCK FD IN THE CHILD. Without it the agent inherits fd 9 — the
  # descriptor this script's flock is held on — and keeps holding the lock after
  # run-agent.sh exits. The next dispatch then aborts with exit 75 against an
  # "agent" that is nobody's child and whose pgid file the exit trap already deleted.
  #
  # `< /dev/null` CLOSES STDIN, and its absence cost most of a day in the sibling
  # project: `ollama launch claude` waits on stdin before doing anything, so with
  # stdin inherited it printed "Execution error" and hung until the timeout reaped
  # it — ~1800s per run for zero verdicts, with logs that look like a run that found
  # nothing.
  setsid timeout -k 30 "$TIMEOUT_S" "${cmd[@]}" < /dev/null > >(tee "$out_file") 2>&1 9>&- &
  local pid=$!
  echo "$pid" > "$PGID_FILE"

  # Watchdog: an engine that refuses can print its error in seconds and then never
  # exit. The timeout eventually reaps it, but "eventually" is the whole budget. If
  # the error signature is there and nothing else arrived within the grace period,
  # kill the group and let the caller have its failure now.
  (
    sleep "${AGENT_ERROR_GRACE_S:-45}"
    if [ -s "$out_file" ] \
       && [ "$(wc -c < "$out_file")" -lt 400 ] \
       && grep -qiE 'Execution error|failed to launch|connection refused' "$out_file"; then
      echo "[run-agent] motor falhou de imediato e ficou pendurado — abortado sem esperar pelo timeout" >&2
      kill -TERM -"$pid" 2>/dev/null || true
      sleep 5
      kill -KILL -"$pid" 2>/dev/null || true
    fi
  ) >/dev/null 2>&1 &
  local watchdog=$!
  # If THIS script is killed, take the whole group down — no orphans.
  trap 'kill -TERM -"'"$pid"'" 2>/dev/null; cleanup' TERM INT

  wait "$pid"
  local rc=$?
  kill "$watchdog" 2>/dev/null || true
  # tee may still be flushing after the agent exits.
  sleep 1
  AGENT_OUTPUT=$(cat "$out_file" 2>/dev/null || echo "")
  rm -f "$out_file"
  return $rc
}

PROMPT="$(cat "$PROMPT_FILE")"
RC=1
USED=""

# VISION IS NOT UNIVERSAL, AND ASSUMING IT KILLS THE WHOLE RUN.
#
# Issues in this repo can carry screenshots, and the prompts tell agents to `Read`
# the evidence. Claude does that fine. The fallback model does not accept image
# input at all, and the failure is not graceful: the API returns
# `400 this model does not support image input` and the entire run dies with no
# verdict. The agent has no way to know which engine it is on, so we tell it.
append_no_vision_note() {
  cat <<'EOF'

---

# 👁 IMAGENS: NÃO USES `Read` EM FICHEIROS DE IMAGEM

Este motor não aceita imagens. Fazer `Read` num `.png`/`.jpg`/`.gif` devolve erro
400 e **mata a corrida inteira**, sem veredicto.

Trabalha só com o que é texto: o corpo do issue, os comentários, o código, o
output dos comandos. Se a decisão depender mesmo de uma imagem que não podes ver,
diz isso explicitamente no veredicto em vez de a inventares.
EOF
}

# ── 0. Hermes (Nous) — motor alternativo, escolhido explicitamente ─────────
#
# NÃO é um degrau da ladder: é um motor à parte, pedido por AGENT_ENGINE=hermes.
# A razão é o paralelismo. A ladder existe para degradar quando a subscrição
# Claude seca; o Hermes serve para correr um SEGUNDO implementador ao mesmo
# tempo que o Claude, num slot próprio (AGENT_SLOT=hermes) e portanto com o seu
# próprio lock. Metê-lo como degrau faria dele um substituto em vez de um par.
#
# `--yolo` é o equivalente ao --permission-mode acceptEdits do Claude Code: sem
# ele o hermes pára à espera de aprovação e o agente morre no timeout sem
# produzir veredicto — o mesmo modo de falha que o `< /dev/null` do ollama
# resolveu. Não há --allowedTools equivalente; o isolamento vem do worktree.
if [ "${AGENT_ENGINE:-}" = "hermes" ]; then
  # Pelo caminho, não pelo PATH: ver hermes_bin em lib.sh. O PATH do servidor
  # tmux não tem de incluir ~/.local/bin, e a versão anterior lia essa ausência
  # como "não está instalado".
  HERMES_BIN=$(hermes_bin) || {
    echo "[run-agent] ERRO: AGENT_ENGINE=hermes mas não encontrei o binário do hermes" >&2
    exit 1
  }
  HERMES_MODEL="${HERMES_MODEL:-${AGENT_HERMES_MODEL:-}}"
  USED="hermes/${HERMES_MODEL:-default}"
  if [ -n "$HERMES_MODEL" ]; then
    run_harness "hermes" "$HERMES_MODEL" \
      "$HERMES_BIN" -z "$PROMPT" --model "$HERMES_MODEL" --yolo --cli
  else
    run_harness "hermes" "default" \
      "$HERMES_BIN" -z "$PROMPT" --yolo --cli
  fi
  RC=$?
  echo "$USED" > "$LOCK_PREFIX.$AGENT_SLOT.engine" 2>/dev/null || true
  exit "$RC"
fi

# ── 1. Subscription (claude CLI) ───────────────────────────────────────────
CLAUDE_BIN=$(claude_bin || true)
if [ -z "$CLAUDE_BIN" ]; then
  # RUÍDO DE PROPÓSITO. Esta linha faltar é o que fez uma noite inteira parecer
  # "os agentes não conseguem" quando na verdade nenhum agente correu.
  echo "[run-agent] ATENÇÃO: não encontrei o binário do claude (PATH=$PATH). Define TEAM_CLAUDE_BIN." >&2
fi

if [ "${AGENT_FORCE_FALLBACK:-0}" != "1" ] && ! in_cooldown && [ -n "$CLAUDE_BIN" ]; then
  USED="claude/$CLAUDE_MODEL"
  run_harness "claude" "$CLAUDE_MODEL" \
    "$CLAUDE_BIN" -p "$PROMPT" \
      --model "$CLAUDE_MODEL" \
      "${ADD_DIR_ARGS[@]}" \
      --permission-mode acceptEdits \
      --allowedTools "$ALLOWED_TOOLS" \
      --strict-mcp-config --mcp-config '{"mcpServers":{}}'
  RC=$?

  if [ "$RC" -ne 0 ] && is_usage_exhausted "${AGENT_OUTPUT:-}"; then
    echo "[run-agent] subscrição sem usage — a passar para o fallback" >&2
    cooldown_until_reset "${AGENT_OUTPUT:-}" || start_cooldown 45
    RC=1
    USED=""
  fi
else
  if in_cooldown; then echo "[run-agent] subscrição em cooldown — fallback directo" >&2; fi
fi

# ── 2. Fallback (Ollama Cloud model behind the same harness) ───────────────
# The fallback has its own quota. If a previous run found it spent, do not spend a
# further 3 minutes rediscovering that.
if [ -z "$USED" ] && [ "${TEAM_USE_FALLBACK:-1}" = "1" ] && fallback_exhausted; then
  echo "[run-agent] fallback tambem sem quota (volta em ~$(( $(fallback_cooldown_remaining) / 60 ))min) — nao corro" >&2
  exit 77
fi

if [ -z "$USED" ] && [ "${TEAM_USE_FALLBACK:-0}" != "1" ]; then
  # Measured not to work for these roles on this repo — see the comment on
  # TEAM_USE_FALLBACK in lib.sh. Exit 77 so the caller can tell "we deliberately
  # did not run" from "the agent ran and failed", and leave the work untouched.
  echo "[run-agent] subscrição indisponível e fallback desligado (TEAM_USE_FALLBACK=0) — não corro" >&2
  exit 77
fi

if [ -z "$USED" ]; then
  # Credential: explicit env wins, then a local override file, then the sibling
  # project's .env, which is where this key is maintained on this machine.
  if [ -z "${OLLAMA_API_KEY:-}" ]; then
    for src in "$HOME/.config/ios2android-team/env" "$HOME/Documentos/companion-chat/.env"; do
      if [ -f "$src" ]; then
        key=$(grep -E '^(OLLAMA_API_KEY|MANAGED_CHAT_API_KEY)=' "$src" 2>/dev/null | head -1 | cut -d= -f2-)
        if [ -n "$key" ]; then export OLLAMA_API_KEY="$key"; break; fi
      fi
    done
  fi

  if ! command -v ollama >/dev/null 2>&1 || [ -z "${OLLAMA_API_KEY:-}" ]; then
    echo "[run-agent] SEM FALLBACK: ollama ou OLLAMA_API_KEY em falta" >&2
    exit 76
  fi

  export OLLAMA_BASE_URL="${OLLAMA_BASE_URL:-https://cloud.ollama.ai}"
  # The fallback model isn't in Claude Code's model table; without these it warns on
  # stderr every single run.
  export CLAUDE_CODE_MAX_CONTEXT_TOKENS="${CLAUDE_CODE_MAX_CONTEXT_TOKENS:-200000}"
  export CLAUDE_CODE_DISABLE_UNKNOWN_MODEL_WINDOW_ENFORCEMENT=1

  USED="ollama/$FALLBACK_MODEL"
  PROMPT="$PROMPT$(append_no_vision_note)"
  run_harness "ollama" "$FALLBACK_MODEL" \
    ollama launch claude --model "$FALLBACK_MODEL" --yes -- \
      -p "$PROMPT" \
      "${ADD_DIR_ARGS[@]}" \
      --permission-mode acceptEdits \
      --allowedTools "$ALLOWED_TOOLS" \
      --strict-mcp-config --mcp-config '{"mcpServers":{}}'
  RC=$?

  # Same detection as the subscription path, applied to the fallback: a usage limit
  # is not a failed task, and retrying it every 45 seconds achieves nothing.
  if [ "$RC" -ne 0 ] && is_usage_exhausted "${AGENT_OUTPUT:-}"; then
    echo $(( $(date +%s) + TEAM_FALLBACK_COOLDOWN_H * 3600 )) > "$FALLBACK_COOLDOWN_FILE"
    echo "[run-agent] fallback SEM QUOTA (limite do Ollama Cloud) — em pausa ${TEAM_FALLBACK_COOLDOWN_H}h" >&2
    USED=""
    RC=77
  fi
fi

echo "[run-agent] fim: motor=${USED:-nenhum} rc=$RC" >&2

# Record which engine actually ran, so the caller can tell a DEGRADED run from a
# genuine failure. Without this marker "no verdict" reads as "this issue defeated
# the pipeline" and a temporary quota outage permanently consumes real work items.
echo "$USED" > "$LOCK_PREFIX.$AGENT_SLOT.engine" 2>/dev/null || true

exit "$RC"
