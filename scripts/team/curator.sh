#!/bin/bash
# curator.sh — the CURATOR (the analyst role). Finds the root cause in the code and
# writes the briefing the implementer works from: root cause, fix approach,
# acceptance criteria and test steps. Also closes issues that turn out to be
# non-defects or already fixed, and splits ones that are too big.
#
# THIS IS A REPAIR PATH, NOT THE FRONT DOOR. Nothing routes new issues here. It runs
# only when one of three things happened:
#
#   * the implementer investigated and returned `blocked` — not actionable as written
#   * the reviewer returned `blocked-spec` — the issue asked for the wrong thing
#   * the orchestrator's attempt counter escalated after repeated failures
#
# In every case the issue's comment thread already contains the failure history, and
# that history is the most valuable input this role has. Read it first.
#
# Never touches production code — only the issue.
#
# Usage: curator.sh <issue_number>
set -uo pipefail

ISSUE="${1:?issue obrigatorio}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"
ROLE="curator"

VERDICT_FILE="$VERDICT_DIR/curator-$ISSUE.json"
WT=""
PROMPT="/tmp/ios2a-curator-prompt-$ISSUE.txt"
MODEL="${CURATOR_MODEL:-sonnet}"

cleanup() { [ -n "$WT" ] && wt_remove "$WT"; }
trap cleanup EXIT

log "issue #$ISSUE modelo=$MODEL"

# A read-only checkout of main. Detached, so nothing can be pushed from here.
WT_OUT=$(wt_checkout "$BASE_BRANCH" "curator-$ISSUE") || { log "ERRO: checkout de $BASE_BRANCH falhou"; exit 1; }
WT="$WT_OUT"

ISSUE_JSON=$(gh issue view "$ISSUE" --repo "$REPO" \
  --json title,body,labels,comments --jq '
  "# " + .title + "\n\n" +
  "## Corpo\n\n" + (.body // "(vazio)") + "\n\n" +
  "## Labels\n\n" + ([.labels[].name] | join(", ")) + "\n\n" +
  "## Histórico (porque é que este issue chegou aqui)\n\n" +
  (if (.comments | length) > 0 then
     ([.comments[] | "- **@" + (.author.login // "anon") + "**: " + (.body // "")] | join("\n\n"))
   else "(sem comentários)" end)
' 2>/dev/null) || { log "ERRO: não consegui ler o issue #$ISSUE"; exit 1; }

{
  cat "$SCRIPT_DIR/curator-prompt.md"
  echo ""
  echo "---"
  echo ""
  echo "# O issue a analisar"
  echo ""
  printf '%s\n' "$ISSUE_JSON"
} | sed -e "s|__VERDICT_PATH__|$VERDICT_FILE|g" \
        -e "s|__REPO_PKG__|$WT|g" > "$PROMPT"

# STALE: delete before the run, so a verdict inherited from a previous run can never
# be read as this run's result.
rm -f "$VERDICT_FILE"

# Its OWN slot, not `main`. The curator writes only GitHub comments and labels: no
# git, no branch, no build, no npm install. It does not collide with the implementer
# or the reviewer, and serialising it onto them would add its whole runtime to every
# issue that needs repair. The slot lock still guarantees two curators never run at
# the same time.
agent_log_header "$LOG_DIR/curator-$ISSUE.log" "curator #$ISSUE modelo=$MODEL"
AGENT_SLOT=curator CLAUDE_MODEL="$MODEL" \
  bash "$SCRIPT_DIR/run-agent.sh" "$PROMPT" "$WT" "${CURATOR_TIMEOUT:-1200}" \
  >> "$LOG_DIR/curator-$ISSUE.log" 2>&1; AGENT_RC=$?

if [ ! -f "$VERDICT_FILE" ]; then
  # A failed RUN is not a failed issue: leave the state alone so it is picked up
  # again. Nobody is coming to unpark it.
  if ! no_verdict_is_real_failure curator "$AGENT_RC"; then
    log "SEM VEREDICTO (corrida degradada ou não arrancada) — issue fica onde está"
    comment_issue "$ISSUE" "## Curator: corrida degradada, sem veredicto

A corrida não produziu veredicto por uma razão alheia ao issue: ou o slot estava
ocupado, ou a subscrição estava esgotada e o fallback não conseguiu concluir a
análise. **Isto não é um problema do issue** — fica na fila para nova análise."
    exit 0
  fi
  log "SEM VEREDICTO — fica na fila para nova tentativa"
  comment_issue "$ISSUE" "## Curator: corrida sem veredicto

A corrida terminou sem escrever veredicto (ver \`$LOG_DIR/curator-$ISSUE.log\`).
Falha da corrida, não do issue — fica na fila para ser reanalisado."
  exit 0
fi

OUTCOME=$(jqv "$VERDICT_FILE" '.outcome' 'ready')
SUMMARY=$(jqv "$VERDICT_FILE" '.summary' '(sem resumo)'); SUMMARY="${SUMMARY:0:600}"
ANALYSIS=$(jqv "$VERDICT_FILE" '.analysis' '')
PRIORITY=$(jqv "$VERDICT_FILE" '.priority' '')

log "outcome=$OUTCOME priority=${PRIORITY:-n/d}"

# Re-grade priority when the curator disagrees with the original triage.
set_priority "$ISSUE" "$PRIORITY"

case "$OUTCOME" in
  ready)
    if [ -z "${ANALYSIS//[[:space:]]/}" ]; then
      # A "ready" with no briefing is the exact failure this role exists to prevent:
      # the implementer already tried without one and asked for analysis. Sending it
      # back unchanged would loop forever.
      log "outcome=ready mas analysis vazio — fica em $L_BLOCKED_SPEC para nova análise"
      comment_issue "$ISSUE" "## Curator: análise vazia — a repetir

Declarou \`ready\` sem escrever a análise. Este issue chegou aqui **precisamente
porque** o implementador não conseguiu resolvê-lo sem briefing, por isso devolvê-lo
sem causa raiz nem critérios de aceitação repetiria a mesma falha. Fica na fila
para ser analisado outra vez."
      exit 0
    fi
    comment_issue "$ISSUE" "## Curator: analisado — pronto a implementar

**Causa raiz (resumo):** $SUMMARY

$ANALYSIS"
    set_state "$ISSUE" "$L_READY"
    log "#$ISSUE -> $L_READY"
    ;;

  not-a-defect)
    comment_issue "$ISSUE" "## Curator: não é defeito

$SUMMARY

$ANALYSIS"
    set_state "$ISSUE" "$L_DONE"
    gh issue close "$ISSUE" --repo "$REPO" --reason "not planned" >/dev/null 2>&1 || true
    log "#$ISSUE fechado (not-a-defect)"
    ;;

  already-fixed)
    comment_issue "$ISSUE" "## Curator: já corrigido

$SUMMARY

$ANALYSIS"
    set_state "$ISSUE" "$L_DONE"
    gh issue close "$ISSUE" --repo "$REPO" --reason completed >/dev/null 2>&1 || true
    log "#$ISSUE fechado (already-fixed)"
    ;;

  split)
    COUNT=$(jq '(.subissues // []) | length' "$VERDICT_FILE" 2>/dev/null || echo 0)
    if [ "$COUNT" -lt 2 ]; then
      log "split com $COUNT sub-issues — insuficiente, fica em $L_BLOCKED_SPEC"
      comment_issue "$ISSUE" "## Curator: split inválido — a repetir

Pediu \`split\` mas indicou $COUNT sub-issues; um split precisa de pelo menos 2.
O issue volta à fila para ser decidido de outra forma."
      exit 0
    fi
    # Sub-issues enter at qa:ready, straight to the implementer — the whole point of
    # a split is that each piece is now unambiguous enough not to need curating.
    PRIO_LABEL="${PRIORITY:-P2}"
    CREATED=""
    for i in $(seq 0 $((COUNT - 1))); do
      ST=$(jq -r ".subissues[$i].title // \"\"" "$VERDICT_FILE")
      SB=$(jq -r ".subissues[$i].body // \"\"" "$VERDICT_FILE")
      [ -z "${ST//[[:space:]]/}" ] && continue
      BODY=$(printf 'Parte de #%s\n\n%s\n' "$ISSUE" "$SB")
      URL=$(gh issue create --repo "$REPO" --title "$ST" --body "$BODY" \
              --label "$L_READY,$PRIO_LABEL" 2>/dev/null || echo "")
      [ -n "$URL" ] && CREATED="$CREATED
- $URL"
      log "  sub-issue: ${URL:-FALHOU}"
    done
    comment_issue "$ISSUE" "## Curator: partido em sub-issues

$SUMMARY
$CREATED

O trabalho acontece nos sub-issues; este fica como registo e é fechado — um
agregador aberto sem trabalho próprio só entope a fila."
    set_state "$ISSUE" "$L_DONE"
    gh issue close "$ISSUE" --repo "$REPO" --reason completed >/dev/null 2>&1 || true
    ;;

  *)
    # An unrecognised outcome means the agent did not follow the contract. That is a
    # run problem — requeue rather than park.
    comment_issue "$ISSUE" "## Curator: resultado não reconhecido (\`$OUTCOME\`)

$SUMMARY

$ANALYSIS

O veredicto não usou um dos resultados válidos, por isso o issue volta à fila."
    log "#$ISSUE outcome inválido — fica em $L_BLOCKED_SPEC"
    ;;
esac

rm -f "$VERDICT_FILE"
log "done #$ISSUE"
