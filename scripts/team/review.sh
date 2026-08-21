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

# inflight_register: ver o comentário em implement.sh. Mesmo motivo, mesma janela
# (o lock do run-agent.sh só é tomado no fim), mesma consequência.
inflight_register "review-$PR" "${TEAM_SLOT:-main}"
cleanup() { [ -n "$WT" ] && wt_remove "$WT"; inflight_release "review-$PR"; }
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
#
# DUAS FONTES, NÃO UMA. O corpo é a primeira, mas falha em dois casos reais:
#
#   1. Keyword noutra língua. O regex só tinha as inglesas e este repo escreve em
#      português — um PR com "Fecha #446" não casava. Aconteceu no PR #451:
#      integrado em main, mas o #446 ficou em qa:review e aberto, órfão no quadro.
#   2. PR criado à mão, sem keyword nenhuma.
#
# Em ambos o reviewer registava "issue ligado: nenhum" e seguia — aprovava,
# integrava, e o issue nunca era fechado nem marcado qa:done. Falha silenciosa: o
# trabalho entra em main e o quadro continua a dizer que está por fazer.
#
# O nome do branch é a segunda fonte. `qa/issue-N` é a convenção que o
# implement.sh já usa e que o pick_pr já exige para sequer olhar para o PR —
# informação fiável e sempre presente.
ISSUE=$(printf '%s' "$PR_INFO" | jq -r '.body' \
  | grep -oiE '(Fixes|Closes|Resolves|Fecha|Fecham|Resolve|Corrige)[[:space:]]+#[0-9]+' \
  | grep -oE '[0-9]+' | head -1 || true)

if [ -z "$ISSUE" ]; then
  BRANCH_ISSUE=$(printf '%s' "$PR_INFO" | jq -r '.headRefName // ""' \
    | grep -oE '^qa/issue-[0-9]+' | grep -oE '[0-9]+' | head -1 || true)
  if [ -n "$BRANCH_ISSUE" ]; then
    ISSUE="$BRANCH_ISSUE"
    log "corpo sem keyword de fecho — issue #$ISSUE deduzido do branch"
  fi
fi

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

# ── A PR THAT CANNOT MERGE IS NOT REVIEWABLE ───────────────────────────────
#
# Check mergeability BEFORE spending an agent. A conflicted PR would otherwise get
# the full treatment — checkout, npm install, lint, tsc, the whole suite, a diff read
# end to end — only to be told at the merge step what git could have said in one API
# call. That is 10-25 minutes of quota per attempt, and it repeats every time the
# branch is touched.
#
# Conflicts are handled like `blocked`: back to the implementer, which merges the
# base into the branch before the agent starts and hands it the markers to resolve by
# intent.
#
# UNKNOWN is not CONFLICTING. GitHub computes mergeability asynchronously and answers
# UNKNOWN while it is still thinking; treating that as a conflict would bounce
# perfectly good PRs. Ask again a few times, and if it still will not say, review
# normally — the merge step is the backstop.
MSTATE=""
for _ in 1 2 3; do
  MSTATE=$(gh pr view "$PR" --repo "$REPO" --json mergeable --jq .mergeable 2>/dev/null || echo "")
  [ "$MSTATE" = "UNKNOWN" ] || [ -z "$MSTATE" ] || break
  sleep 3
done
if [ "$MSTATE" = "CONFLICTING" ]; then
  log "PR #$PR em conflito com $BASE — devolvido sem gastar uma review"
  gh pr comment "$PR" --repo "$REPO" --body "## Reviewer: em conflito, nao revisto

Este PR nao integra em \`$BASE\` — tem conflitos por resolver. Nao o revi: uma
review custa a suite completa e o diff todo, para no fim bater no mesmo que o git ja
diz numa chamada.

**Nao e um juizo sobre o codigo.** Volta ao implementador, que integra o \`$BASE\`
neste branch antes de arrancar e resolve os marcadores por intencao — percebendo o
que cada lado queria e preservando as duas intencoes. Depois disso volto a olhar." >/dev/null 2>&1 || true
  if [ -n "$ISSUE" ]; then
    comment_issue "$ISSUE" "## Reviewer: PR #$PR em conflito com \`$BASE\`

Devolvido ao implementador para resolver os conflitos. O trabalho no branch
mantem-se — nao e para refazer."
    set_state "$ISSUE" "$L_BLOCKED_IMPL"
  fi
  exit 0
fi

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
        -e "s|__WORKDIR__|$WT|g" \
        -e "s|__TEST_CMD__|$(test_cmd)|g" > "$PROMPT"

rm -f "$VERDICT_FILE"
agent_log_header "$LOG_DIR/review-$PR.log" "review PR #$PR modelo=$MODEL"
# Slot configuravel, como no implement.sh:196. Sem override fica em 'main', tal como
# antes. Com TEAM_SLOT=rev2 corre um segundo reviewer em paralelo, no seu proprio
# lock — necessario porque os implementadores produzem PRs mais depressa do que um
# reviewer serial os consome: medido em 2026-08-21, ~7 slots de implementacao a
# ~27min dao ~15 PR/h contra ~10 review/h (~5.6min cada), logo a fila cresce ~5 PR/h.
#
# CADA REVIEWER TEM DE APANHAR UM PR DIFERENTE. Dois reviewers no mesmo PR tentam
# ambos fazer o merge; quem despacha e responsavel por nao repetir o numero.
AGENT_SLOT="${TEAM_SLOT:-main}" CLAUDE_MODEL="$MODEL" \
  bash "$SCRIPT_DIR/run-agent.sh" "$PROMPT" "$WT" "${REVIEW_TIMEOUT:-1800}" \
  >> "$LOG_DIR/review-$PR.log" 2>&1; AGENT_RC=$?

# THE SAME CIRCUIT BREAKER THE ISSUES HAVE, FOR PULL REQUESTS.
#
# Not marking an unjudged PR as reviewed is what stops it being stranded — and it
# is also what makes it come back EVERY cycle. If the engine is what is failing,
# that is a spin: #342 was reviewed five times before this existed.
#
# So consecutive verdict-less reviews are counted per PR and, after a couple, the
# PR is parked until the subscription returns. Keys are namespaced `pr-N` so they
# never collide with an issue of the same number.
review_noverdict_breaker() {
  local n until_ts
  n=$(bump_noverdict "pr-$PR")
  if [ "$n" -ge "$TEAM_DEFER_AFTER" ]; then
    until_ts=$(defer_issue "pr-$PR")
    log "PR #$PR adiado até $(date -d "@$until_ts" '+%H:%M') após $n reviews sem veredicto"
    gh pr comment "$PR" --repo "$REPO" --body "## Reviewer: adiado após $n corridas sem veredicto

O motor não concluiu a review $n vezes seguidas, sempre por razões alheias a este
PR — subscrição esgotada e fallback a não terminar. Como um PR não julgado volta à
fila em cada ciclo, isto passaria a tempo gasto sem nada decidido.

Fica adiado até **$(date -d "@$until_ts" '+%H:%M')**, quando a subscrição volta, e
a fila segue para o resto. O PR não foi julgado nem aprovado — está apenas à espera
de um motor que consiga julgá-lo." >/dev/null 2>&1 || true
  else
    log "PR #$PR: $n review(s) seguidas sem veredicto"
  fi
}

if ! verdict_readable "$VERDICT_FILE"; then
  if ! no_verdict_is_real_failure main "$AGENT_RC"; then
    log "SEM VEREDICTO (corrida degradada ou não arrancada) — PR fica para nova review"
    gh pr comment "$PR" --repo "$REPO" --body "## Reviewer: corrida degradada, sem veredicto

A corrida não produziu veredicto por uma razão alheia ao PR: ou o slot estava
ocupado, ou a subscrição estava esgotada e o fallback não conseguiu concluir. O PR
fica como está e será revisto de novo." >/dev/null 2>&1 || true
    review_noverdict_breaker
    exit 78   # <- "não julguei este PR": o orquestrador NÃO pode marcá-lo como revisto
  fi
  # A failed run must not consume the PR: leave it open so the next cycle picks it
  # up again (its head sha is unchanged, and no reviewed-sha record was written).
  log "SEM VEREDICTO — PR fica aberto para nova review"
  gh pr comment "$PR" --repo "$REPO" --body "## Reviewer: corrida sem veredicto

A corrida terminou sem escrever veredicto (ver \`$LOG_DIR/review-$PR.log\`). Falha
da corrida, não do PR — será revisto de novo." >/dev/null 2>&1 || true
  review_noverdict_breaker
  exit 78
fi

clear_noverdict "pr-$PR"   # judged: the streak is over

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
      health_stamp merge
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
