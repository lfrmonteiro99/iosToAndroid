#!/bin/bash
# review.sh — the REVIEWER. Reads a PR targeting `main`, comments its findings, and
# either merges it (closing the issue) or routes it back: code problems to the
# implementer, briefing problems to the curator.
#
# THIS IS THE ONLY GATE. There is no verifier behind it and no CI on pull requests
# in this repo (build-apk.yml fires on release publish only), so whatever this agent
# runs — lint, tsc, jest — is the entire quality bar before main moves.
#
# Usage: review.sh <pr_number>
set -uo pipefail

PR="${1:?PR obrigatorio}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"
ROLE="review"

VERDICT_FILE="$VERDICT_DIR/review-$PR.json"
PROMPT="/tmp/ios2a-review-prompt-$PR.txt"
# (modelo resolvido mais abaixo, a partir do issue ligado)
WT=""

cleanup() { [ -n "$WT" ] && wt_remove "$WT"; }
trap cleanup EXIT

PR_INFO=$(gh pr view "$PR" --repo "$REPO" \
  --json number,title,body,headRefName,baseRefName,state 2>/dev/null) \
  || { log "ERRO: não consegui ler o PR #$PR"; exit 1; }

BRANCH=$(printf '%s' "$PR_INFO" | jq -r '.headRefName')
BASE=$(printf '%s' "$PR_INFO" | jq -r '.baseRefName')
TITLE=$(printf '%s' "$PR_INFO" | jq -r '.title')
STATE=$(printf '%s' "$PR_INFO" | jq -r '.state')

log "PR #$PR $BRANCH -> $BASE ($STATE)"

if [ "$STATE" != "OPEN" ]; then
  log "PR #$PR não está aberto — nada a rever"
  exit 0
fi

# The issue comes from the closing keyword in the body, which the implementer always
# writes.
ISSUE=$(printf '%s' "$PR_INFO" | jq -r '.body' \
  | grep -oiE '(Fixes|Closes|Resolves)[[:space:]]+#[0-9]+' \
  | grep -oE '[0-9]+' | head -1 || true)
log "issue ligado: ${ISSUE:-nenhum}"

# Tier from the linked issue, but FLOORED AT MED.
#
# The `haiku-ready` label says how hard the CHANGE is, not how hard judging it is —
# and judging is the harder half here: enumerate the blast radius, compare the diff
# against the issue, prove the red step by reverting production code. This reviewer
# is also the only gate in front of `main`, with no verifier behind it and no CI on
# pull requests, so a cheap reviewer waving work through is the one failure this
# pipeline cannot detect on its own.
if [ -n "$ISSUE" ]; then
  read -r RMODEL RFALLBACK RTIER <<<"$(resolve_models "$ISSUE" med)"
else
  RMODEL="$TEAM_MODEL_MED_CLAUDE"; RFALLBACK="$TEAM_FALLBACK_MED"; RTIER="med"
fi
MODEL="${REVIEW_MODEL:-$RMODEL}"
export AGENT_FALLBACK_MODEL="${AGENT_FALLBACK_MODEL:-$RFALLBACK}"
log "tier=$RTIER modelo=$MODEL fallback=$AGENT_FALLBACK_MODEL"

# wt_checkout, NOT wt_create: the reviewer needs the PR's code. wt_create would cut
# a new branch from the base, the diff would come out EMPTY, and the reviewer would
# be judging the PR by its title alone — with no error in the log to reveal it.
WT_OUT=$(wt_checkout "$BRANCH" "review-$PR") || { log "ERRO: checkout de $BRANCH falhou"; exit 1; }
WT="$WT_OUT"

git -C "$TEAM_ROOT" fetch origin "$BASE" >/dev/null 2>&1 || true

# NEVER pipe the diff through `head -c N`. Under `set -o pipefail`, once the diff
# exceeds N, head closes the pipe, git takes SIGPIPE, and the script dies before
# writing anything. Truncate in bash instead. The FULL file list always goes in the
# prompt (it is small) so description-vs-diff matching never depends on the cut.
DIFF=$(git -C "$WT" --no-pager diff "origin/$BASE...HEAD" 2>/dev/null || true)
FILES=$(git -C "$WT" --no-pager diff "origin/$BASE...HEAD" --name-only 2>/dev/null || true)
DIFF_BYTES=${#DIFF}
DIFF="${DIFF:0:60000}"

if [ -z "${DIFF//[[:space:]]/}" ]; then
  log "DIFF VAZIO — não se revê um PR pelo título"
  gh pr comment "$PR" --repo "$REPO" --body "## Reviewer: sem diff

O worktree do branch \`$BRANCH\` não produziu diff contra \`$BASE\`. Sem diff não
há o que rever, por isso o issue volta ao implementador para reenviar o trabalho." >/dev/null 2>&1 || true
  [ -n "$ISSUE" ] && set_state "$ISSUE" "$L_BLOCKED_IMPL"
  exit 1
fi

log "diff: ${DIFF_BYTES}B em $(printf '%s' "$FILES" | grep -c . || echo 0) ficheiro(s)"

log "a preparar dependências para o reviewer correr os testes..."
wt_prepare_node "$WT"

ISSUE_JSON=""
if [ -n "$ISSUE" ]; then
  ISSUE_JSON=$(gh issue view "$ISSUE" --repo "$REPO" --json title,body,comments --jq '
    "# " + .title + "\n\n" + (.body // "") + "\n\n## Comentários\n\n" +
    (if (.comments | length) > 0 then
       ([.comments[] | "- **@" + (.author.login // "anon") + "**: " + (.body // "")] | join("\n\n"))
     else "(sem comentários)" end)' 2>/dev/null || echo "")
fi

{
  cat "$SCRIPT_DIR/review-prompt.md"
  baseline_block
  echo ""
  echo "---"
  echo ""
  echo "# PR #$PR: $TITLE"
  echo ""
  echo "\`$BRANCH\` → \`$BASE\`"
  echo ""
  echo "## Corpo do PR (escrito pelo implementador — pode estar errado)"
  echo ""
  printf '%s\n' "$(printf '%s' "$PR_INFO" | jq -r '.body')"
  echo ""
  echo "## Issue original (o contrato: o que tinha de ficar resolvido)"
  echo ""
  printf '%s\n' "${ISSUE_JSON:-(sem issue ligado)}"
  echo ""
  echo "## Ficheiros no diff (lista completa — nunca truncada)"
  echo ""
  printf '%s\n' "$FILES"
  echo ""
  echo "## Diff (${DIFF_BYTES} bytes no total)"
  echo ""
  printf '%s\n' "$DIFF"
} | sed -e "s|__VERDICT_PATH__|$VERDICT_FILE|g" \
        -e "s|__WORKDIR__|$WT|g" > "$PROMPT"

rm -f "$VERDICT_FILE"
agent_log_header "$LOG_DIR/review-$PR.log" "review PR #$PR modelo=$MODEL"
AGENT_SLOT=main CLAUDE_MODEL="$MODEL" \
  bash "$SCRIPT_DIR/run-agent.sh" "$PROMPT" "$WT" "${REVIEW_TIMEOUT:-1800}" \
  >> "$LOG_DIR/review-$PR.log" 2>&1; AGENT_RC=$?

if ! verdict_readable "$VERDICT_FILE"; then
  if ! no_verdict_is_real_failure main "$AGENT_RC"; then
    log "SEM VEREDICTO (corrida degradada ou não arrancada) — PR fica para nova review"
    gh pr comment "$PR" --repo "$REPO" --body "## Reviewer: corrida degradada, sem veredicto

A corrida não produziu veredicto por uma razão alheia ao PR: ou o slot estava
ocupado, ou a subscrição estava esgotada e o fallback não conseguiu concluir. O PR
fica como está e será revisto de novo." >/dev/null 2>&1 || true
    exit 0
  fi
  # A failed run must not consume the PR: leave it open so the next cycle picks it
  # up again (its head sha is unchanged, and no reviewed-sha record was written).
  log "SEM VEREDICTO — PR fica aberto para nova review"
  gh pr comment "$PR" --repo "$REPO" --body "## Reviewer: corrida sem veredicto

A corrida terminou sem escrever veredicto (ver \`$LOG_DIR/review-$PR.log\`). Falha
da corrida, não do PR — será revisto de novo." >/dev/null 2>&1 || true
  exit 0
fi

VERDICT=$(jqv "$VERDICT_FILE" '.verdict' 'blocked-impl')
SUMMARY=$(jqv "$VERDICT_FILE" '.summary' '(sem resumo)'); SUMMARY="${SUMMARY:0:1500}"
# The reviewer's findings are posted as PR and issue comments and routinely cite
# other issue numbers. See sanitize_closing_keywords in lib.sh.
SUMMARY=$(printf '%s' "$SUMMARY" | sanitize_closing_keywords)

# Per-dimension detail, so the defect is visible in the comment without opening the
# verdict — and so it is auditable whether the reviewer actually filled it in.
DETAIL=$(jq -r '
  [ (if .tests_pass == false then "os testes falham" else empty end),
    (if .lint_pass == false then "o lint falha" else empty end),
    (if .typecheck_pass == false then "o tsc falha" else empty end),
    (if .issue_resolved == false then "o issue não fica resolvido" else empty end),
    (if .description_matches_diff == false then "a descrição do PR não corresponde ao diff" else empty end),
    (if .has_tests == false then "não traz testes" else empty end),
    (if .red_step_proven == false then "não prova o passo vermelho (o teste pode passar sem o fix)" else empty end),
    (if .edge_cases_covered == false then "só testa o caminho feliz" else empty end),
    (if .fixes_root_cause == false then "trata o sintoma, não a causa raiz" else empty end),
    (if ((.junk_files // []) | length) > 0 then "lixo versionado: " + ((.junk_files // []) | join(", ")) else empty end),
    (if ((.secrets_found // []) | length) > 0 then "SEGREDOS no diff: " + ((.secrets_found // []) | join(", ")) else empty end)
  ] | if length == 0 then "" else "\n\n**Defeitos:**\n- " + join("\n- ") end
' "$VERDICT_FILE" 2>/dev/null || echo "")

CHANGES=$(jq -r '
  (.required_changes // []) | if length == 0 then "" else
  "\n\n**Alterações necessárias:**\n- " + join("\n- ") end
' "$VERDICT_FILE" 2>/dev/null || echo "")

log "verdict=$VERDICT"

case "$VERDICT" in
  approved)
    gh pr comment "$PR" --repo "$REPO" --body "## Reviewer: aprovado

$SUMMARY" >/dev/null 2>&1 || true

    # Whether the merge happened is decided by READING the PR, never by trusting an
    # exit code. `gh pr merge` returns non-zero for things that occur AFTER a
    # successful merge — deleting the branch, for one — and reports "already merged"
    # as an error. In the sibling project that made the script record a failure on a
    # merge that had landed, and queue a redo of work already integrated.
    merge_landed() {
      [ "$(gh pr view "$PR" --repo "$REPO" --json state --jq .state 2>/dev/null)" = "MERGED" ]
    }

    MERGE_OK=0
    gh pr merge "$PR" --repo "$REPO" --squash --delete-branch >/dev/null 2>&1 || true
    if merge_landed; then
      MERGE_OK=1
    else
      MSTATUS=$(gh pr view "$PR" --repo "$REPO" --json mergeStateStatus --jq .mergeStateStatus 2>/dev/null || echo "")
      log "merge recusado (mergeStateStatus=$MSTATUS)"
      case "$MSTATUS" in
        DIRTY|BEHIND)
          # A conflicted or stale branch is NOT bad code — the review itself was
          # fine. Say so explicitly, so the implementer resolves the conflict
          # instead of re-doing work that was already accepted. implement.sh leaves
          # the conflict markers in the worktree for exactly this.
          gh pr comment "$PR" --repo "$REPO" --body "## Reviewer: aprovado, mas o branch não integra (\`$MSTATUS\`)

O código foi **aprovado** — o problema é só que o branch não integra em \`$BASE\`,
por conflito ou por estar atrasado.

**Não refaças o trabalho.** Na próxima passagem o \`$BASE\` é integrado neste branch
e, se houver conflito, os marcadores ficam na árvore para resolveres por intenção:
percebe o que cada lado queria e preserva as duas intenções. Depois corre a suite
completa e reenvia." >/dev/null 2>&1 || true
          ;;
      esac
    fi

    if [ "$MERGE_OK" = "1" ]; then
      log "PR #$PR integrado em $BASE"
      if [ -n "$ISSUE" ]; then
        # No verifier behind this. The reviewer ran lint, tsc and the suite against
        # this exact code and approved it; that is the whole gate, so the issue is
        # done. Closed EXPLICITLY rather than relying on the `Fixes #N` keyword —
        # a squash-merge closes it only when GitHub attributes the merge to a user
        # token, and depending on that has silently left issues open before.
        comment_issue "$ISSUE" "## Reviewer: aprovado e integrado

$SUMMARY

PR #$PR integrado em \`$BASE\`."
        set_state "$ISSUE" "$L_DONE"
        clear_attempts "$ISSUE"
        gh issue close "$ISSUE" --repo "$REPO" --reason completed >/dev/null 2>&1 || true
      fi
    else
      log "merge falhou (conflito ou gate)"
      gh pr comment "$PR" --repo "$REPO" --body "## Reviewer: aprovado mas o merge falhou

Provavelmente conflito com \`$BASE\` ou uma protecção de branch. O implementador
deve actualizar o branch." >/dev/null 2>&1 || true
      [ -n "$ISSUE" ] && set_state "$ISSUE" "$L_BLOCKED_IMPL"
    fi
    ;;

  blocked-impl)
    # Judged rejection — this is what promotes an issue to a stronger tier.
    [ -n "$ISSUE" ] && log "#$ISSUE: rejeição $(bump_attempts "$ISSUE")"
    gh pr comment "$PR" --repo "$REPO" --body "## Reviewer: bloqueado — problema de código

$SUMMARY$DETAIL$CHANGES

Devolvido ao implementador." >/dev/null 2>&1 || true
    [ -n "$ISSUE" ] && {
      comment_issue "$ISSUE" "## Reviewer: bloqueado (código)

$SUMMARY$DETAIL$CHANGES"
      set_state "$ISSUE" "$L_BLOCKED_IMPL"
    }
    ;;

  blocked-spec)
    [ -n "$ISSUE" ] && log "#$ISSUE: rejeição $(bump_attempts "$ISSUE")"
    gh pr comment "$PR" --repo "$REPO" --body "## Reviewer: bloqueado — problema do enunciado

$SUMMARY$DETAIL$CHANGES

O implementador fez o que o issue pedia; o pedido é que estava mal. Enviado ao
curator para escrever uma análise." >/dev/null 2>&1 || true
    [ -n "$ISSUE" ] && {
      comment_issue "$ISSUE" "## Reviewer: bloqueado (enunciado)

$SUMMARY$DETAIL$CHANGES"
      set_state "$ISSUE" "$L_BLOCKED_SPEC"
    }
    ;;

  *)
    # Unrecognised verdict = the contract was not followed. Treat as a code block so
    # the implementer gets another pass, rather than parking the issue.
    gh pr comment "$PR" --repo "$REPO" --body "## Reviewer: resultado não reconhecido (\`$VERDICT\`)

$SUMMARY$DETAIL

O veredicto não usou um dos resultados válidos; devolvido ao implementador." >/dev/null 2>&1 || true
    [ -n "$ISSUE" ] && set_state "$ISSUE" "$L_BLOCKED_IMPL"
    ;;
esac

rm -f "$VERDICT_FILE"
log "done PR #$PR"
