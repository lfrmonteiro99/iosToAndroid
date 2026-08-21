#!/bin/bash
# implement.sh — the IMPLEMENTER. Takes an issue, investigates the code, implements
# the fix on a branch cut from main, and opens a PR describing what it did.
#
# This is the FIRST agent to see an issue. There is no curation step ahead of it, so
# finding the root cause is part of its job — see implement-prompt.md. It escalates
# to the curator (verdict `blocked`) only when the issue is genuinely not actionable
# as written.
#
# Branches are named `qa/issue-N`.
#
# Usage: implement.sh <issue_number>
set -uo pipefail

ISSUE="${1:?issue obrigatorio}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"
ROLE="implement"

BRANCH="qa/issue-$ISSUE"
VERDICT_FILE="$VERDICT_DIR/implement-$ISSUE.json"
PROMPT="/tmp/ios2a-implement-prompt-$ISSUE.txt"
WT=""

# REGISTA-TE COMO VIVO À CABEÇA.
#
# O lock do run-agent.sh só é tomado lá no fim, depois do worktree e do `npm ci`:
# até lá o slot parece livre e o cleanup_stale do orquestrador apagava-me o
# veredicto e removia-me o worktree por baixo. Foi o #442 — worktree "recriado
# pelo menos 2 vezes", edits perdidos, issue de volta a qa:ready num ciclo
# infinito. A tag é o nome do worktree, para que o cleanup possa decidir item a
# item; o PID é a autoridade, portanto uma morte a SIGKILL não deixa reserva
# obsoleta.
inflight_register "implement-$ISSUE" "${TEAM_SLOT:-main}"
trap 'inflight_release "implement-'"$ISSUE"'"' EXIT

# The issue's own triage picks the tier: `haiku-ready` -> low, `sonnet-ready` -> med,
# and repeated failure promotes to strong. resolve_models returns the pair, so the
# difficulty class stays the same whether we are on the subscription or on the
# Ollama fallback.
read -r MODEL FALLBACK_TAG TIER <<<"$(resolve_models "$ISSUE")"
MODEL="${IMPLEMENT_MODEL:-$MODEL}"
export AGENT_FALLBACK_MODEL="${AGENT_FALLBACK_MODEL:-$FALLBACK_TAG}"

log "issue #$ISSUE branch=$BRANCH tier=$TIER modelo=$MODEL fallback=$AGENT_FALLBACK_MODEL"

# Where to put the issue back if this run fails for a reason that is not the
# issue's fault. It must be the state it CAME FROM, not the qa:ready default.
#
# Returning a rework to qa:ready loses the one fact that mattered: that it has an
# open PR a reviewer already blocked. qa:blocked-impl is dispatched ahead of new
# work; qa:ready is one of 83 entries sorted worst-first, and a P3 lands at the
# back. Meanwhile pick_pr will never look at the PR again, because it only
# re-reviews a PR whose HEAD MOVED and nothing is pushing to that branch.
#
# That is exactly how PR #295 was stranded: blocked by the reviewer, its rework
# produced no verdict, the issue was filed back under qa:ready, and both the PR and
# the issue went quiet with the pipeline looking perfectly busy.
PREV_STATE=$(get_state "$ISSUE")
case "$PREV_STATE" in
  "$L_BLOCKED_IMPL"|"$L_BLOCKED_SPEC"|"$L_READY") ;;
  *) PREV_STATE="$L_READY" ;;
esac

set_state "$ISSUE" "$L_WIP"

# Say so at the START, not only at the end. In the sibling project the only comment
# came when the run finished, so for the 25 minutes an implementation takes the
# issue looked abandoned: right state, no sign of life.
comment_issue "$ISSUE" "## Implementador: a trabalhar

- Branch: \`$BRANCH\`
- Modelo: \`$MODEL\` (tier \`$TIER\`, fallback \`$AGENT_FALLBACK_MODEL\`)
- Início: $(date '+%H:%M')

Comento outra vez quando houver PR ou se ficar bloqueado."

# Fresh worktree on a branch cut from main. If the branch already exists (this is
# rework after a block) wt_create resumes from the remote tip.
wt_remove "$WT_ROOT/implement-$ISSUE"
WT_OUT=$(wt_create "$BRANCH" "implement-$ISSUE" "$BASE_BRANCH") || {
  log "ERRO: não criei worktree — volta a $PREV_STATE"
  set_state "$ISSUE" "$PREV_STATE"
  comment_issue "$ISSUE" "## Implementador: falhou a preparar o worktree

Não foi possível criar o branch \`$BRANCH\` a partir de \`$BASE_BRANCH\`."
  exit 1
}
WT="$WT_OUT"

# Bring the branch up to date with main. On rework other fixes have landed since it
# was cut, and a PR that cannot merge is as good as no PR at all.
#
# A conflict here is NOT a reason to redo the work or bounce the issue: the fix is
# already written, it just met someone else's change. The conflict is left in the
# tree with its markers and handed to the agent as part of the task.
MERGE_CONFLICT=""
if ! git -C "$WT" merge --no-edit "origin/$BASE_BRANCH" >/dev/null 2>&1; then
  CONFLICTED=$(git -C "$WT" diff --name-only --diff-filter=U 2>/dev/null)
  if [ -n "$CONFLICTED" ]; then
    log "CONFLITO ao integrar $BASE_BRANCH: $(printf '%s' "$CONFLICTED" | tr '\n' ' ')"
    MERGE_CONFLICT="$CONFLICTED"
  else
    git -C "$WT" merge --abort >/dev/null 2>&1 || true
  fi
fi

log "a preparar dependências..."
wt_prepare_node "$WT"

# Junk that a PREVIOUS attempt committed has to be removed here, not just kept out
# of the next commit. The node_modules symlink landed on qa/issue-215 before the
# guard existed, and it stays in the branch's tree until something deletes it — the
# reviewer keeps blocking on junk the implementer never re-adds and cannot see.
if git -C "$WT" ls-files --error-unmatch node_modules >/dev/null 2>&1; then
  log "a remover node_modules versionado por uma tentativa anterior"
  git -C "$WT" rm --cached -q node_modules >/dev/null 2>&1 || true
  git -C "$WT" -c user.name="qa-implementer" -c user.email="qa@local" \
    commit -q -m "$BRANCH: remove node_modules symlink committed by an earlier attempt" \
    >/dev/null 2>&1 || true
  # PUSH IT NOW, not at the end. This is a harness repair, not agent work, and it
  # must not depend on the agent succeeding: the first time it ran, the agent
  # produced no verdict, implement.sh took the early-exit path, the worktree was
  # deleted, and the removal never reached the remote — so the reviewer went on
  # blocking PR #295 for junk that had already been "fixed" twice locally.
  git -C "$WT" push -q origin "$BRANCH" >/dev/null 2>&1 \
    && log "limpeza do node_modules enviada para o remoto" \
    || warn "não consegui enviar a limpeza do node_modules"
fi

ISSUE_JSON=$(gh issue view "$ISSUE" --repo "$REPO" \
  --json title,body,labels,comments --jq '
  "# " + .title + "\n\n" +
  "## Corpo\n\n" + (.body // "(vazio)") + "\n\n" +
  "## Labels\n\n" + ([.labels[].name] | join(", ")) + "\n\n" +
  "## Comentários\n\n" +
  (if (.comments | length) > 0 then
     ([.comments[] | "- **@" + (.author.login // "anon") + "**: " + (.body // "")] | join("\n\n"))
   else "(sem comentários)" end)
' 2>/dev/null) || { log "ERRO: não consegui ler o issue"; exit 1; }

# Rework: pull the reviewer's objections into the prompt.
PR_FEEDBACK=""
EXISTING_PR=$(gh pr list --repo "$REPO" --head "$BRANCH" --state open \
  --json number --jq '.[0].number // empty' 2>/dev/null || echo "")
if [ -n "$EXISTING_PR" ]; then
  PR_FEEDBACK=$(gh pr view "$EXISTING_PR" --repo "$REPO" --json comments --jq '
    (if (.comments | length) > 0 then
       ([.comments[] | "- **@" + (.author.login // "anon") + "**: " + (.body // "")] | join("\n\n"))
     else "(sem comentários)" end)' 2>/dev/null || echo "")
fi

{
  cat "$SCRIPT_DIR/implement-prompt.md"
  baseline_block
  echo ""
  echo "---"
  echo ""
  echo "# O issue a implementar"
  echo ""
  printf '%s\n' "$ISSUE_JSON"
  if [ -n "$MERGE_CONFLICT" ]; then
    echo ""
    echo "---"
    echo ""
    echo "# ⚠️ CONFLITO DE MERGE POR RESOLVER — resolve-o primeiro"
    echo ""
    echo "Ao integrar \`origin/$BASE_BRANCH\` neste branch houve conflito. A árvore"
    echo "está com os marcadores por resolver nestes ficheiros:"
    echo ""
    printf '%s\n' "$MERGE_CONFLICT" | sed 's/^/  - /'
    echo ""
    echo "**O teu fix não está errado** — apenas encontrou outra alteração que entrou"
    echo "em \`$BASE_BRANCH\` entretanto. Resolve por INTENÇÃO, não por escolha cega:"
    echo ""
    echo "- Percebe o que **cada lado** queria fazer (\`git log\` nos dois lados)."
    echo "- O resultado tem de preservar **as duas** intenções. Escolher \`--ours\` ou"
    echo "  \`--theirs\` em bloco costuma apagar em silêncio o trabalho do outro."
    echo "- Em ficheiros gerados (snapshots do jest, \`package-lock.json\`): não"
    echo "  resolvas à mão — regenera (\`npx jest -u\`, \`npm install\`)."
    echo "- Depois de resolver: \`git add\` nos ficheiros e corre a suite completa."
    echo "  Um conflito mal resolvido passa despercebido até partir outra coisa."
    echo ""
    echo "Só depois disto continua com o trabalho do issue."
  fi
  if [ -n "${PR_FEEDBACK//[[:space:]]/}" ]; then
    echo ""
    echo "---"
    echo ""
    echo "# RETRABALHO — feedback no PR #$EXISTING_PR"
    echo ""
    printf '%s\n' "$PR_FEEDBACK"
    echo ""
    echo "Corrige o que foi apontado acima. Não repitas a correção que foi bloqueada."
  fi
} | sed -e "s|__VERDICT_PATH__|$VERDICT_FILE|g" \
        -e "s|__WORKDIR__|$WT|g" \
        -e "s|__BRANCH__|$BRANCH|g" \
        -e "s|__BASE_BRANCH__|$BASE_BRANCH|g" \
        -e "s|__TEST_CMD__|$(test_cmd)|g" > "$PROMPT"

rm -f "$VERDICT_FILE"
agent_log_header "$LOG_DIR/implement-$ISSUE.log" "implement #$ISSUE modelo=$MODEL"
# O slot é o que separa os locks do run-agent.sh, e por isso é o que permite N
# implementadores em simultâneo. O orquestrador lança cada um com
# TEAM_SLOT=implN e AGENT_ENGINE=claude|hermes; sem override fica em 'main', que
# é o caminho do despacho explícito (`--issue N`).
AGENT_SLOT="${TEAM_SLOT:-main}" CLAUDE_MODEL="$MODEL" AGENT_ENGINE="${AGENT_ENGINE:-}" \
  bash "$SCRIPT_DIR/run-agent.sh" "$PROMPT" "$WT" "${IMPLEMENT_TIMEOUT:-2700}" \
  >> "$LOG_DIR/implement-$ISSUE.log" 2>&1; AGENT_RC=$?

if ! verdict_readable "$VERDICT_FILE"; then
  if ! no_verdict_is_real_failure main "$AGENT_RC"; then
    NV=$(bump_noverdict "$ISSUE")
    log "SEM VEREDICTO (corrida degradada ou não arrancada) — $NV seguidas — issue volta a $PREV_STATE"
    if [ "$NV" -ge "$TEAM_DEFER_AFTER" ]; then
      # Circuit breaker: the issue keeps coming back to the head of the queue and
      # pinning the pipeline on a failure that is not its fault. Park it until the
      # subscription returns — the stronger engine is what it was missing.
      UNTIL=$(defer_issue "$ISSUE")
      log "#$ISSUE adiado até $(date -d "@$UNTIL" '+%H:%M') — a fila segue para o próximo"
      comment_issue "$ISSUE" "## Implementador: adiado após $NV corridas sem veredicto

O motor não concluiu $NV vezes seguidas, sempre por razões alheias ao issue
(subscrição esgotada, fallback a não terminar). Cada tentativa devolvia o issue à
cabeça da fila e voltava a ser despachada, o que prendia o pipeline inteiro num
problema que não é deste issue.

Fica adiado até **$(date -d "@$UNTIL" '+%H:%M')** — o momento em que a subscrição
volta — e a fila segue para o próximo. Nada se perdeu."
    else
      comment_issue "$ISSUE" "## Implementador: corrida degradada, sem veredicto

A corrida não produziu veredicto por uma razão alheia ao issue: ou o slot estava
ocupado, ou a subscrição estava esgotada e o modelo de fallback não conseguiu
concluir. **Isto não é um problema do issue** — volta a \`$PREV_STATE\` para nova
tentativa."
    fi
    set_state "$ISSUE" "$PREV_STATE"
    wt_remove "$WT"
    exit 0
  fi
  log "SEM VEREDICTO — volta a $PREV_STATE para nova tentativa"
  set_state "$ISSUE" "$PREV_STATE"
  comment_issue "$ISSUE" "## Implementador: corrida sem veredicto

Terminou sem escrever veredicto (ver \`$LOG_DIR/implement-$ISSUE.log\`). Falha da
corrida, não do issue — volta à fila."
  wt_remove "$WT"
  exit 0
fi

clear_noverdict "$ISSUE"   # a verdict arrived: the streak is over

OUTCOME=$(jqv "$VERDICT_FILE" '.outcome' 'blocked')
SUMMARY=$(jqv "$VERDICT_FILE" '.summary' 'correção automática'); SUMMARY="${SUMMARY:0:200}"
DESCRIPTION=$(jqv "$VERDICT_FILE" '.description' '')
TESTS=$(jqv "$VERDICT_FILE" '.tests' '(não reportado)'); TESTS="${TESTS:0:400}"

# Model-written prose goes into a commit message and a PR body, both of which
# GitHub scans for closing keywords. An agent writing "this also fixes #212"
# would close #212. Only the `Fixes #$ISSUE` line the harness appends below is
# meant to close anything.
SUMMARY=$(printf '%s' "$SUMMARY" | sanitize_closing_keywords)
DESCRIPTION=$(printf '%s' "$DESCRIPTION" | sanitize_closing_keywords)
TESTS=$(printf '%s' "$TESTS" | sanitize_closing_keywords)

# "Is there real work here?" — the WORKING TREE ALONE DOES NOT ANSWER THAT.
#
# This used to be `git status --porcelain` only, which is right on a first attempt
# and wrong on every REWORK: wt_create resumes from origin/qa/issue-N, so the
# previous attempt's code is already COMMITTED and the tree is clean. An agent that
# correctly decides the existing work stands — or whose only required change was
# something the harness now does itself — leaves nothing dirty, and the run was read
# as "no real code" and rejected.
#
# Measured on #215: the branch carried 119 lines of new tests, the agent returned
# `implemented`, and the harness routed it to the curator as empty while ALSO
# counting a rejection that pushes the issue toward the strong tier. It threw away
# real work and lied about why.
#
# Work exists if the tree is dirty OR the branch differs from the base.
#
# O PADRÃO TEM DE ESTAR ANCORADO. A versão anterior usava
# `grep -vE '(^.. )?(node_modules|android/|ios/|\.expo/)'`, em que o prefixo de
# estado é OPCIONAL e portanto nada ancora a alternação ao início do caminho:
# `android/` passava a casar em qualquer posição da linha. O efeito é que
# `modules/launcher-module/android/src/main/java/.../X.kt` — código-fonte do
# módulo nativo — era filtrado como se fosse a pasta `android/` gerada pelo
# `expo prebuild`.
#
# Consequência medida no #435: o agente escreveu Kotlin real (um deduper novo,
# duas chamadas alteradas, seis testes), o grep comeu tudo, DIRTY saiu vazio, e o
# harness rejeitou como "sem alterações reais no código" — DUAS rondas seguidas,
# contando rejeições que empurram o issue para o tier forte. Qualquer issue cujo
# fix seja apenas nativo era impossível de entregar.
#
# Ancorar ao início do caminho (com o prefixo de 3 caracteres do --porcelain
# opcional) resolve: só a `android/` de topo é ignorada, a do módulo passa.
IGNORE_RE='^(..[ ])?(node_modules|android|ios|\.expo)/'
DIRTY=$(git -C "$WT" status --porcelain 2>/dev/null \
  | grep -vE "$IGNORE_RE" | head -1 || true)
BRANCH_WORK=$(git -C "$WT" diff --name-only "origin/$BASE_BRANCH...HEAD" 2>/dev/null \
  | grep -vE '^(node_modules|android|ios|\.expo)/' | head -1 || true)
CHANGED="${DIRTY:-$BRANCH_WORK}"

log "outcome=$OUTCOME árvore=${DIRTY:+suja}${DIRTY:-limpa} branch=${BRANCH_WORK:+com trabalho}${BRANCH_WORK:-vazio}"

if [ "$OUTCOME" != "implemented" ] || [ -z "$CHANGED" ]; then
  REASON="$OUTCOME"
  [ -n "$OUTCOME" ] && [ -z "$CHANGED" ] && REASON="$OUTCOME (sem alterações reais no código)"
  # A JUDGED REJECTION: the agent ran, produced a verdict, and the verdict was not
  # usable work. This is what the attempt counter is for — not dispatches, and not
  # runs that died on infrastructure.
  log "#$ISSUE: rejeição $(bump_attempts "$ISSUE") de $MAX_ATTEMPTS"

  # THIS IS THE DOOR TO THE CURATOR. `blocked` means the implementer investigated
  # and the issue is not actionable as written — analysis is now warranted. Anything
  # else that failed to produce code goes the same way rather than being parked,
  # because the curator has the failure text to work from and nobody else is coming.
  set_state "$ISSUE" "$L_BLOCKED_SPEC"
  if [ "$OUTCOME" = "blocked" ]; then
    comment_issue "$ISSUE" "## Implementador: bloqueado — pedido de análise

$SUMMARY

$DESCRIPTION

O issue não era executável como está. O curator vai analisá-lo e reescrever o
briefing."
  else
    comment_issue "$ISSUE" "## Implementador: $REASON — enviado para análise

$SUMMARY

$DESCRIPTION"
  fi
  wt_remove "$WT"
  exit 0
fi

# ── Commit + push ──────────────────────────────────────────────────────────
# Scoped add: the harness and CI live in paths the implementer is told not to
# touch, and never staging them enforces it. Native output dirs are generated by
# `expo prebuild` and must never be committed.
# ':!node_modules' is load-bearing, not decorative. wt_prepare_node may leave a
# SYMLINK named node_modules, and `.gitignore` only excludes `node_modules/` — with
# the trailing slash it matches a directory, not a symlink. Without this pathspec
# `add -A` stages a mode-120000 entry holding an absolute path from this machine,
# which is junk in every other checkout. The reviewer blocked PR #295 for precisely
# that, and it would have been in every PR this pipeline opened.
git -C "$WT" add -A -- ':!scripts/team' ':!.github' ':!android' ':!ios' ':!.expo' ':!node_modules' >/dev/null 2>&1 \
  || git -C "$WT" add -A -- ':!node_modules' >/dev/null 2>&1 || true
# Belt and braces: if it got staged some other way, unstage it before committing.
git -C "$WT" rm --cached -q --ignore-unmatch node_modules >/dev/null 2>&1 || true
# NEVER COMMIT CONFLICT MARKERS.
#
# The pre-run merge leaves markers in the tree for the agent to resolve by intent.
# If it did not resolve them, `add -A` happily stages `<<<<<<<` and the branch ships
# code that cannot even parse — and the reviewer then spends a full run discovering
# that. Treat it exactly like `blocked`: the work is not finished, hand it back with
# the file list.
UNMERGED=$(git -C "$WT" diff --name-only --diff-filter=U 2>/dev/null || true)
MARKERS=$(git -C "$WT" grep -lE '^(<<<<<<<|>>>>>>>) ' -- . 2>/dev/null | head -5 || true)
if [ -n "$UNMERGED" ] || [ -n "$MARKERS" ]; then
  BAD=$(printf '%s\n%s' "$UNMERGED" "$MARKERS" | grep -v '^$' | sort -u | tr '\n' ' ')
  log "CONFLITO POR RESOLVER — não commito: $BAD"
  log "#$ISSUE: rejeição $(bump_attempts "$ISSUE") de $MAX_ATTEMPTS"
  set_state "$ISSUE" "$L_BLOCKED_IMPL"
  comment_issue "$ISSUE" "## Implementador: conflito por resolver

O agente declarou \`implemented\` mas deixou marcadores de conflito por resolver:

$(printf '%s' "$BAD" | tr ' ' '\n' | sed 's/^/- /')

Nada foi commitado — código com \`<<<<<<<\` não compila sequer, e não vale a pena
gastar uma review a descobri-lo. Volta ao implementador, que recebe os marcadores
outra vez e as instruções para resolver por intenção."
  wt_remove "$WT"
  exit 0
fi

git -C "$WT" -c user.name="qa-implementer" -c user.email="qa@local" \
  commit -m "fix/$ISSUE: $SUMMARY" >/dev/null 2>&1 || true

# ── Bring the branch up to date with main, NOW, right before the PR ─────────
#
# The tree was already merged with main once, at the top of this script — but that
# was before the agent ran, and an implementation takes minutes during which other
# PRs land on main. A branch that was current when the work started is routinely
# stale by the time the PR opens, and a PR that cannot merge is as good as no PR.
#
# If this second merge conflicts, there is no agent left to resolve it: it has
# already written its verdict and exited. So the WORK IS PRESERVED (the commit above
# is pushed) and the issue goes back to blocked-impl — the same treatment as any
# other "not finished yet". The next run's pre-agent merge recreates the markers and
# hands them to a live agent with the resolve-by-intent instructions.
git -C "$WT" fetch origin "$BASE_BRANCH" >/dev/null 2>&1 || true
CONFLICT_AFTER=""
if ! git -C "$WT" merge --no-edit "origin/$BASE_BRANCH" >/dev/null 2>&1; then
  CONFLICT_AFTER=$(git -C "$WT" diff --name-only --diff-filter=U 2>/dev/null || true)
  git -C "$WT" merge --abort >/dev/null 2>&1 || true
fi

if ! git -C "$WT" push -u origin "$BRANCH" --force >/dev/null 2>&1; then
  log "ERRO: push falhou — volta a $PREV_STATE"
  set_state "$ISSUE" "$PREV_STATE"
  comment_issue "$ISSUE" "## Implementador: push falhou

O código foi escrito mas não chegou ao remoto (branch \`$BRANCH\`). Falha de
infraestrutura, não do issue — volta à fila."
  wt_remove "$WT"
  exit 1
fi
log "push ok -> $BRANCH"

# The work is safe on the remote. Now honour the conflict found above: do NOT open
# or refresh a PR that cannot merge. Sending it to review would burn a full agent
# run to be told what git already said in a second.
if [ -n "$CONFLICT_AFTER" ]; then
  log "CONFLITO com $BASE_BRANCH depois do trabalho — sem PR, volta a $L_BLOCKED_IMPL"
  log "#$ISSUE: rejeição $(bump_attempts "$ISSUE") de $MAX_ATTEMPTS"
  set_state "$ISSUE" "$L_BLOCKED_IMPL"
  comment_issue "$ISSUE" "## Implementador: trabalho feito, mas o branch já não integra

O código está no branch \`$BRANCH\` e **não se perde**. Entretanto o \`$BASE_BRANCH\`
avançou e estes ficheiros entram em conflito:

$(printf '%s' "$CONFLICT_AFTER" | sed 's/^/- /')

Não abro PR neste estado — um PR que não integra não é revisível, e gastar uma
review para o descobrir é desperdício. Na próxima passagem o \`$BASE_BRANCH\` é
integrado neste branch antes do agente arrancar, os marcadores ficam na árvore, e a
resolução é feita por intenção: perceber o que cada lado queria e preservar as duas
intenções. **Não refaças o trabalho** — ele já está aqui."
  wt_remove "$WT"
  exit 0
fi

# ── PR into main ───────────────────────────────────────────────────────────
# `Fixes #N` is mandatory: the reviewer reads it to find its way back to the issue,
# and GitHub closes the issue on merge.
PR_BODY=$(cat <<EOF
## Resumo

$SUMMARY

$DESCRIPTION

## Testes

$TESTS

## Linked Issue

Fixes #$ISSUE
EOF
)

EXISTING_PR=$(gh pr list --repo "$REPO" --head "$BRANCH" --base "$BASE_BRANCH" \
  --state open --json number --jq '.[0].number // empty' 2>/dev/null || echo "")

if [ -n "$EXISTING_PR" ]; then
  # NAO `gh pr edit`: falha sempre com o erro dos Projects classic e o silencio
  # deixava o corpo do PR a descrever a ronda anterior — ver update_pr_api.
  if ! update_pr_api "$EXISTING_PR" "$SUMMARY (#$ISSUE)" "$PR_BODY"; then
    warn "não consegui actualizar o corpo do PR #$EXISTING_PR — o reviewer vai ver a descrição antiga"
  fi
  gh pr comment "$EXISTING_PR" --repo "$REPO" --body "## Implementador: retrabalho submetido

$SUMMARY

Testes: $TESTS" >/dev/null 2>&1 || true
  PR_NUM="$EXISTING_PR"
  log "PR #$PR_NUM actualizado"
else
  PR_NUM=$(create_pr_api "$BRANCH" "$BASE_BRANCH" "$SUMMARY (#$ISSUE)" "$PR_BODY" || echo "")
  if [ -z "$PR_NUM" ]; then
    log "ERRO: PR não criado — volta a $PREV_STATE"
    set_state "$ISSUE" "$PREV_STATE"
    comment_issue "$ISSUE" "## Implementador: PR não criado

O branch \`$BRANCH\` foi enviado mas o PR para \`$BASE_BRANCH\` não foi aberto."
    wt_remove "$WT"
    exit 1
  fi
  log "PR criado: #$PR_NUM ($REPO)"
  health_stamp pr-created
fi

comment_issue "$ISSUE" "## Implementador: implementado

$SUMMARY

Testes: $TESTS

PR: #$PR_NUM (\`$BRANCH\` → \`$BASE_BRANCH\`)"
set_state "$ISSUE" "$L_REVIEW"

rm -f "$VERDICT_FILE"
wt_remove "$WT"
log "done #$ISSUE -> $L_REVIEW (PR #$PR_NUM)"
