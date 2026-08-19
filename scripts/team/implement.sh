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

# The issue's own triage picks the tier: `haiku-ready` -> low, `sonnet-ready` -> med,
# and repeated failure promotes to strong. resolve_models returns the pair, so the
# difficulty class stays the same whether we are on the subscription or on the
# Ollama fallback.
read -r MODEL FALLBACK_TAG TIER <<<"$(resolve_models "$ISSUE")"
MODEL="${IMPLEMENT_MODEL:-$MODEL}"
export AGENT_FALLBACK_MODEL="${AGENT_FALLBACK_MODEL:-$FALLBACK_TAG}"

log "issue #$ISSUE branch=$BRANCH tier=$TIER modelo=$MODEL fallback=$AGENT_FALLBACK_MODEL"

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
  log "ERRO: não criei worktree — volta a $L_READY"
  set_state "$ISSUE" "$L_READY"
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
        -e "s|__BASE_BRANCH__|$BASE_BRANCH|g" > "$PROMPT"

rm -f "$VERDICT_FILE"
agent_log_header "$LOG_DIR/implement-$ISSUE.log" "implement #$ISSUE modelo=$MODEL"
AGENT_SLOT=main CLAUDE_MODEL="$MODEL" \
  bash "$SCRIPT_DIR/run-agent.sh" "$PROMPT" "$WT" "${IMPLEMENT_TIMEOUT:-2700}" \
  >> "$LOG_DIR/implement-$ISSUE.log" 2>&1; AGENT_RC=$?

if ! verdict_readable "$VERDICT_FILE"; then
  if ! no_verdict_is_real_failure main "$AGENT_RC"; then
    log "SEM VEREDICTO (corrida degradada ou não arrancada) — issue volta a $L_READY"
    comment_issue "$ISSUE" "## Implementador: corrida degradada, sem veredicto

A corrida não produziu veredicto por uma razão alheia ao issue: ou o slot estava
ocupado, ou a subscrição estava esgotada e o modelo de fallback não conseguiu
concluir. **Isto não é um problema do issue** — volta a \`$L_READY\` para nova
tentativa."
    set_state "$ISSUE" "$L_READY"
    wt_remove "$WT"
    exit 0
  fi
  log "SEM VEREDICTO — volta a $L_READY para nova tentativa"
  set_state "$ISSUE" "$L_READY"
  comment_issue "$ISSUE" "## Implementador: corrida sem veredicto

Terminou sem escrever veredicto (ver \`$LOG_DIR/implement-$ISSUE.log\`). Falha da
corrida, não do issue — volta à fila."
  wt_remove "$WT"
  exit 0
fi

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
DIRTY=$(git -C "$WT" status --porcelain 2>/dev/null \
  | grep -vE '(^.. )?(node_modules|android/|ios/|\.expo/)' | head -1 || true)
BRANCH_WORK=$(git -C "$WT" diff --name-only "origin/$BASE_BRANCH...HEAD" 2>/dev/null \
  | grep -vE '^(node_modules|android/|ios/|\.expo/)' | head -1 || true)
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
git -C "$WT" -c user.name="qa-implementer" -c user.email="qa@local" \
  commit -m "fix/$ISSUE: $SUMMARY" >/dev/null 2>&1 || true

if ! git -C "$WT" push -u origin "$BRANCH" --force >/dev/null 2>&1; then
  log "ERRO: push falhou — volta a $L_READY"
  set_state "$ISSUE" "$L_READY"
  comment_issue "$ISSUE" "## Implementador: push falhou

O código foi escrito mas não chegou ao remoto (branch \`$BRANCH\`). Falha de
infraestrutura, não do issue — volta à fila."
  wt_remove "$WT"
  exit 1
fi
log "push ok -> $BRANCH"

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
  gh pr edit "$EXISTING_PR" --repo "$REPO" \
    --title "$SUMMARY (#$ISSUE)" --body "$PR_BODY" >/dev/null 2>&1 || true
  gh pr comment "$EXISTING_PR" --repo "$REPO" --body "## Implementador: retrabalho submetido

$SUMMARY

Testes: $TESTS" >/dev/null 2>&1 || true
  PR_NUM="$EXISTING_PR"
  log "PR #$PR_NUM actualizado"
else
  PR_NUM=$(create_pr_api "$BRANCH" "$BASE_BRANCH" "$SUMMARY (#$ISSUE)" "$PR_BODY" || echo "")
  if [ -z "$PR_NUM" ]; then
    log "ERRO: PR não criado — volta a $L_READY"
    set_state "$ISSUE" "$L_READY"
    comment_issue "$ISSUE" "## Implementador: PR não criado

O branch \`$BRANCH\` foi enviado mas o PR para \`$BASE_BRANCH\` não foi aberto."
    wt_remove "$WT"
    exit 1
  fi
  log "PR criado: #$PR_NUM ($REPO)"
fi

comment_issue "$ISSUE" "## Implementador: implementado

$SUMMARY

Testes: $TESTS

PR: #$PR_NUM (\`$BRANCH\` → \`$BASE_BRANCH\`)"
set_state "$ISSUE" "$L_REVIEW"

rm -f "$VERDICT_FILE"
wt_remove "$WT"
log "done #$ISSUE -> $L_REVIEW (PR #$PR_NUM)"
