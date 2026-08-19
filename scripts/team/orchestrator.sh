#!/bin/bash
# orchestrator.sh — drives the delivery pipeline. Runs locally.
#
# THE PIPELINE
#
#   backlog on GitHub  ──seeded──►  qa:ready
#                                       │ implementer: fix on qa/issue-N, PR ──► main
#                                       ▼
#                                   qa:review
#                                       │ reviewer: reads the diff, runs lint/tsc/jest
#                       ┌───────────────┼───────────────┐
#              blocked-impl         approved        blocked-spec
#                 (code)           + merged         (briefing)
#                       │               ▼               │
#                       │           qa:done             │
#                       │           (closed)            │
#                       │                               ▼
#                       │                        qa:blocked-spec
#                       │                               │ CURATOR
#                       └───────────────────────────────┘
#
# THE CURATOR IS A REPAIR PATH, NOT AN ENTRY POINT. Issues go straight to the
# implementer, which investigates the code itself. Analysis only happens when the
# implementer asks for it (verdict `blocked`), when the reviewer rules the briefing
# wrong (`blocked-spec`), or when the attempt counter escalates. Curating 42 issues
# up front would cost a full agent run each to produce a briefing the implementer
# mostly re-derives anyway.
#
# Exactly ONE qa:* label is an issue's state. Comments are the audit trail.
#
# One write-path agent at a time (they share a lock): two agents pushing to the same
# repo at once is how you get lost work. The curator is the exception — it only
# reads code and writes GitHub comments, so it runs on its own slot alongside.
#
# Usage:
#   orchestrator.sh [--once] [--issue N] [--pr N] [--max-cycles N]
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"
ROLE="orchestrator"

ONCE=0
MAX_CYCLES=0           # 0 = forever
TARGET_ISSUE=""
TARGET_PR=""
CYCLE_SLEEP="${TEAM_CYCLE_SLEEP:-45}"

while [ $# -gt 0 ]; do
  case "$1" in
    --once) ONCE=1; shift ;;
    --issue) TARGET_ISSUE="$2"; shift 2 ;;
    --issue=*) TARGET_ISSUE="${1#--issue=}"; shift ;;
    --pr) TARGET_PR="$2"; shift 2 ;;
    --pr=*) TARGET_PR="${1#--pr=}"; shift ;;
    --max-cycles) MAX_CYCLES="$2"; shift 2 ;;
    --max-cycles=*) MAX_CYCLES="${1#--max-cycles=}"; shift ;;
    *) shift ;;
  esac
done

REVIEWED_STATE="$STATE_DIR/reviewed-shas"
touch "$REVIEWED_STATE" 2>/dev/null || true

# ── Issue queries ──────────────────────────────────────────────────────────
#
# CRITICAL: "no results" and "could not ask" must never look the same.
#
# In the sibling project these queries ended in `2>/dev/null || echo ""`, so a
# failed API call produced an empty list — indistinguishable from a genuinely empty
# label. During a GitHub outage that made the orchestrator believe the backlog was
# empty while 25 issues sat queued: it dispatched nothing and declared victory. A
# false conclusion built entirely on failed reads.
#
# ONE query per cycle, then count locally. Per-label queries were both unreliable
# (`gh issue list --label X` returns non-zero inconsistently, so "empty" and
# "failed" cannot be told apart from the exit code) and expensive (12+ API calls
# every 45 seconds, which is how you get rate-limited).
ISSUE_CACHE=""

refresh_issue_cache() {
  local json
  json=$(gh issue list --repo "$REPO" --state open --limit 300 \
         --json number,labels 2>/dev/null) || return 1
  # Explicit shape check: a truncated or error response must not pass as data.
  printf '%s' "$json" | jq -e 'type == "array"' >/dev/null 2>&1 || return 1
  ISSUE_CACHE="$json"
  return 0
}

# Issue numbers carrying a label, WORST FIRST, then oldest first. Reads the cache —
# no API call.
#
# Ordering by priority costs nothing and is the difference between a pipeline and a
# queue. In the sibling project the order was plain issue number, i.e. filing order,
# and a BLOCKER sat untouched for seventeen hours behind eight lesser issues while
# the pipeline burned three cycles on a cosmetic nit. Every log line looked healthy.
#
# Ties break on issue number, so within a priority the oldest goes first and nothing
# starves. Issues with no P* label sort LAST — an unlabelled issue is not evidence
# of importance.
# THE ORIGINAL BACKLOG COMES FIRST, WHOLE, BEFORE ANY EPIC SUB-ISSUE.
#
# Sorting by priority alone is not enough. The epic split produced sub-issues at
# P2 (the test-coverage children) and P3 (the feature children), while the filed
# bugs that remain are mostly P3 — so a P2 sub-issue outranked a P3 bug and the
# pipeline started delivering new-feature scaffolding while real defects waited.
# #287 was already shipped that way before it was noticed.
#
# `epic-child` therefore dominates the sort: every one of them ranks after every
# original issue, and priority only breaks ties within each group. Nothing is
# starved — when the filed backlog drains, the children start on their own, which
# is exactly "only after the bugs are resolved".
issues_with() {
  printf '%s' "$ISSUE_CACHE" \
    | jq -r --arg l "$1" '
        def prank(ns):
          if   (ns | index("P0")) then 0
          elif (ns | index("P1")) then 1
          elif (ns | index("P2")) then 2
          elif (ns | index("P3")) then 3
          else 4 end;
        def childrank(ns): if (ns | index("epic-child")) then 1 else 0 end;
        [ .[]
          | select([.labels[].name] | index($l))
          | {n: .number,
             c: childrank([.labels[].name]),
             r: prank([.labels[].name])} ]
        | sort_by(.c, .r, .n) | .[].n' \
      2>/dev/null
}

# First actionable issue for a label, SKIPPING anything currently deferred.
#
# Without the skip, a deferred issue keeps being returned as the head of the queue
# and the dispatcher pins itself on it — which is the exact failure the deferral
# exists to break.
# First actionable issue for a label, SKIPPING anything currently deferred.
#
# Without the skip, a deferred issue keeps being returned as the head of the queue
# and the dispatcher pins itself on it — which is the exact failure the deferral
# exists to break.
#
# ON THE FALLBACK, PICK THE EASY ONES.
#
# The normal order is worst-first, which is right on the subscription and backwards
# on a weaker engine: it throws the cheap model at the hardest issues in the
# backlog, burns ~3 minutes per failed run, and delivers nothing. Measured on the
# morning quota outage — 0 verdicts in 4 runs, three issues deferred, all of them
# P1/P2 defects.
#
# So while the quota is spent the dispatcher prefers, in order:
#   * issues the triage already called small (`haiku-ready`);
#   * issues that have never been rejected — one that already defeated this engine
#     is not going to be easier the third time;
#   * and it skips outright anything promoted to the strong tier, which by
#     definition needs the model that is currently unavailable.
#
# If nothing easy is left it still takes the head of the queue rather than idling:
# a hard issue attempted is better than a queue that stops, and the deferral
# breaker bounds the cost of getting that wrong.
first_with() {
  local n first_any="" fb=0
  on_fallback && fb=1

  while IFS= read -r n; do
    [ -n "$n" ] || continue
    is_deferred "$n" && continue
    [ -z "$first_any" ] && first_any="$n"

    if [ "$fb" = "1" ]; then
      [ "$(attempts_of "$n")" -ge "$TEAM_STRONG_AFTER" ] && continue   # needs the strong model
      [ "$(attempts_of "$n")" -gt 0 ] && continue                      # already lost once here
      printf '%s' "$(labels_of "$n")" | grep -qx 'haiku-ready' || continue
    fi
    echo "$n"; return 0
  done < <(issues_with "$1")

  # Fallback mode found nothing small: take the head of the queue anyway.
  if [ "$fb" = "1" ] && [ -n "$first_any" ]; then
    log "fallback: sem issues fáceis por fazer — sigo com #$first_any na mesma"
    echo "$first_any"
  fi
  return 0
}

# Labels on one issue, straight from the cache.
labels_of() {
  printf '%s' "$ISSUE_CACHE" \
    | jq -r --argjson n "$1" '.[] | select(.number == $n) | .labels[].name' 2>/dev/null
}

count_actionable() {
  local n=0 s
  for s in "$L_TRIAGE" "$L_READY" "$L_REVIEW" "$L_BLOCKED_IMPL" "$L_BLOCKED_SPEC" "$L_WIP"; do
    n=$(( n + $(issues_with "$s" | grep -c . || true) ))
  done
  echo "$n"
}

# ── Attempt budget per issue ───────────────────────────────────────────────
#
# Rework outranks new work in the dispatch order, which is right — finishing what is
# started beats starting more. But with no limit it means a single hard issue
# monopolises the pipeline indefinitely. Measured in the sibling project: one issue
# went round the loop for over two hours on its third implementation cycle while 21
# issues sat untouched. From outside the pipeline looked busy and was delivering
# nothing.
# MAX_ATTEMPTS lives in lib.sh — the roles report against it too.

# ESCALATE THE STRATEGY, NEVER TO A HUMAN.
#
# Repeating the same approach after it has failed twice is the definition of a stuck
# loop — but parking the issue is not the answer either, because nobody is coming.
# So each exhaustion changes the APPROACH instead:
#
#   attempts 1-2   implement normally, no analysis
#   attempt  3     hand it to the CURATOR with the full failure history, so the
#                  briefing is written from what actually went wrong
#   attempt  4+    force a split: too big or too tangled to land whole
#
# This is the second of the three doors into the curator, and the only automatic
# one. Returns 0 to proceed with the normal action, 1 when it has been redirected.
escalate_if_stuck() {
  local issue="$1" n
  n=$(attempts_of "$issue")
  [ "$n" -lt "$MAX_ATTEMPTS" ] && return 0

  if [ "$n" -lt $(( MAX_ATTEMPTS * 2 )) ]; then
    log "#$issue: $n tentativas — a chamar o curator com o histórico de falhas"
    comment_issue "$issue" "## Orquestrador: mudar de abordagem após $n tentativas

Este issue já passou $n vezes pelo ciclo sem ser integrado. Repetir a mesma
abordagem não vai resolver.

**Curator:** escreve a análise a partir do que **falhou de facto** — os
comentários acima do reviewer dizem exactamente onde é que cada tentativa bateu.
O implementador não estava a chegar lá sozinho; procura outra via, ou parte o
issue se o problema for de tamanho."
    set_state "$issue" "$L_BLOCKED_SPEC"
    return 1
  fi

  log "#$issue: $n tentativas — a forçar split"
  comment_issue "$issue" "## Orquestrador: partir após $n tentativas

Duas rondas de reanálise não resolveram isto. O problema é de **tamanho ou de
emaranhado**, não de esforço.

**Curator:** usa \`split\`. Parte em pedaços em que cada um seja inequívoco e
resolúvel isoladamente — um ecrã, um componente, um cálculo de cada vez. Se um
pedaço continuar a parecer difícil, parte-o outra vez. O histórico de falhas acima
diz-te onde estão as fronteiras naturais."
  clear_attempts "$issue"   # the pieces start fresh
  set_state "$issue" "$L_BLOCKED_SPEC"
  return 1
}

# ── PR selection ───────────────────────────────────────────────────────────
# Never just take the first open PR. Doing that produced an infinite loop in the
# sibling project: a PR the reviewer rightly blocked stays OPEN, so the next cycle
# picked it up again — 184 reviews of the same commit in one night, ~22% of the
# weekly quota burned, and the implementer never ran because there was always a PR
# ahead of it.
#
# A PR is only reviewed again when its HEAD MOVES. Re-reviewing the same commit
# cannot produce a different answer.
pick_pr() {
  local list line num sha
  list=$(gh pr list --repo "$REPO" --base "$BASE_BRANCH" --state open \
           --json number,headRefOid,headRefName \
           --jq '.[] | select(.headRefName | startswith("qa/")) | "\(.number) \(.headRefOid)"' \
           2>/dev/null || echo "")
  [ -n "$list" ] || return 0
  # here-string, not a pipe: with `set -o pipefail` a `| head -1` closes the pipe,
  # the writer takes SIGPIPE and the ORCHESTRATOR DIES — the log then fills with
  # "cycle 1" forever.
  while IFS= read -r line; do
    [ -n "$line" ] || continue
    num=${line%% *}; sha=${line##* }
    # Deferred PRs are skipped for the same reason deferred issues are: an unjudged
    # PR returns every cycle, and if the engine is what failed that is a spin.
    is_deferred "pr-$num" && continue
    if ! grep -qxF "$num $sha" "$REVIEWED_STATE" 2>/dev/null; then
      echo "$num"; return 0
    fi
  done <<< "$list"
  return 0
}

mark_reviewed() {
  local num="$1" sha
  sha=$(gh pr view "$num" --repo "$REPO" --json headRefOid --jq '.headRefOid' 2>/dev/null || echo "")
  [ -n "$sha" ] || return 0
  echo "$num $sha" >> "$REVIEWED_STATE"
  tail -300 "$REVIEWED_STATE" > "$REVIEWED_STATE.tmp" && mv "$REVIEWED_STATE.tmp" "$REVIEWED_STATE"
}

# ── Stale cleanup ──────────────────────────────────────────────────────────
# Nothing survives from one cycle to the next. An inherited verdict makes an agent
# report the PREVIOUS run's work as its own.
cleanup_stale() {
  local lock="$LOCK_PREFIX.main.lock"
  if flock -w 0 -n "$lock" true 2>/dev/null; then

    # Only the roles whose slot is provably free. Deleting the verdict of a live
    # agent running in another slot is exactly the bug that destroyed the critic's
    # findings in the sibling project — four real findings lost, which from the
    # outside looked like "it found nothing".
    local roles="implement review"
    if flock -w 0 -n "$LOCK_PREFIX.curator.lock" true 2>/dev/null; then
      roles="curator $roles"
    fi
    for role in $roles; do
      rm -f "$VERDICT_DIR/$role"-*.json 2>/dev/null || true
    done

    local pgidfile="$lock.pgid"
    if [ -f "$pgidfile" ]; then
      local pgid; pgid=$(cat "$pgidfile" 2>/dev/null || echo "")
      if [ -n "$pgid" ] && kill -0 -"$pgid" 2>/dev/null; then
        log "stale: a matar a árvore do agente (pgid $pgid)"
        kill -TERM -"$pgid" 2>/dev/null || true
        sleep 2
        kill -KILL -"$pgid" 2>/dev/null || true
      fi
      rm -f "$pgidfile"
    fi
    for wt in "$WT_ROOT"/implement-* "$WT_ROOT"/review-* "$WT_ROOT"/curator-*; do
      [ -e "$wt" ] || continue
      log "stale: a remover worktree $(basename "$wt")"
      wt_remove "$wt"
    done
    git -C "$TEAM_ROOT" worktree prune 2>/dev/null || true
  fi
}

# ── PRs whose issue no longer exists ──────────────────────────────────────
#
# The curator's `split` closes the parent issue and opens children. If that parent
# already had an open PR, the PR is orphaned: its `Fixes #N` points at a closed
# issue, no rework will ever touch its branch, and the reviewer would spend a full
# run judging work whose contract was withdrawn.
#
# PR #333 sat like that — issue #212 closed as qa:done by a split into #335/#336/
# #337, the PR still open hours later.
#
# Closing it is not throwing work away: the children carry the scope forward, and
# the branch stays on the remote if anyone wants the diff.
close_orphan_prs() {
  local list num issue state
  list=$(gh pr list --repo "$REPO" --base "$BASE_BRANCH" --state open \
           --json number,headRefName,body \
           --jq '.[] | select(.headRefName | startswith("qa/")) | "\(.number)\t\(.body // "" | gsub("\n"; " "))"' \
           2>/dev/null) || return 0
  [ -n "$list" ] || return 0
  while IFS=$'\t' read -r num body; do
    [ -n "$num" ] || continue
    issue=$(printf '%s' "$body" | grep -oiE '(Fixes|Closes|Resolves)[[:space:]]+#[0-9]+' | grep -oE '[0-9]+' | head -1)
    [ -n "$issue" ] || continue
    state=$(gh issue view "$issue" --repo "$REPO" --json state --jq .state 2>/dev/null || echo "")
    [ "$state" = "CLOSED" ] || continue
    log "PR #$num órfão: o issue #$issue está fechado — a fechar o PR"
    gh pr comment "$num" --repo "$REPO" --body "## Orquestrador: PR órfão

O issue #$issue que este PR resolvia foi **fechado** — tipicamente porque o curator
o partiu em sub-issues, que levam o âmbito daqui para a frente.

Um PR cujo contrato foi retirado não é revisível, e deixá-lo aberto só gasta uma
corrida de review. Fechado. O branch fica no remoto se alguém quiser o diff." >/dev/null 2>&1 || true
    gh pr close "$num" --repo "$REPO" >/dev/null 2>&1 || true
  done <<< "$list"
}

# An issue stuck in qa:wip with no agent alive means the implementer died. Left
# alone it blocks that issue forever, because nothing dispatches on qa:wip.
rescue_stuck_wip() {
  local lock="$LOCK_PREFIX.main.lock"
  flock -w 0 -n "$lock" true 2>/dev/null || return 0   # an agent is running; leave it
  local issue pr
  for issue in $(issues_with "$L_WIP"); do
    # "No agent alive" does NOT mean "no work done". The implementer opens the PR
    # and only then transitions the issue, so a crash in that window leaves a real,
    # complete PR behind on an issue still marked qa:wip. Demoting that to qa:ready
    # dispatches a second implementer onto work already in review. So ask GitHub
    # what exists before deciding, rather than inferring from the agent's absence.
    pr=$(gh pr list --repo "$REPO" --head "qa/issue-$issue" --base "$BASE_BRANCH" \
      --state open --json number --jq '.[0].number // empty' 2>/dev/null || echo "")
    if [ -n "$pr" ]; then
      log "resgate: #$issue estava em $L_WIP mas o PR #$pr está aberto -> $L_REVIEW"
      comment_issue "$issue" "## Orquestrador: corrida interrompida depois do PR

O implementador morreu **depois** de abrir o PR #$pr, deixando o issue em
\`$L_WIP\`. O trabalho existe e o PR está aberto, por isso segue para
\`$L_REVIEW\` em vez de ser reimplementado."
      set_state "$issue" "$L_REVIEW"
      continue
    fi
    log "resgate: #$issue estava em $L_WIP sem agente vivo e sem PR -> $L_READY"
    comment_issue "$issue" "## Orquestrador: corrida interrompida

O issue estava em \`$L_WIP\`, nenhum agente estava vivo (timeout ou crash) e não
existe PR aberto para \`qa/issue-$issue\`.
Devolvido a \`$L_READY\` para nova tentativa."
    set_state "$issue" "$L_READY"
  done
}

# ── Role dispatch ──────────────────────────────────────────────────────────
run_implement() { log "IMPLEMENTADOR -> #$1"; bash "$SCRIPT_DIR/implement.sh" "$1" || log "implement falhou #$1"; }
# A PR IS ONLY "REVIEWED" IF IT WAS ACTUALLY JUDGED.
#
# mark_reviewed used to run unconditionally, so a review that produced NO verdict —
# quota exhausted, slot busy, engine died — still recorded the head sha. pick_pr
# only re-reviews a PR whose head MOVED, and nothing pushes to a branch whose issue
# is sitting in qa:review, so the PR was never looked at again.
#
# Four PRs were stranded exactly that way (#324, #333, #338, #342), the oldest for
# fourteen hours, while the board showed them as "in review". review.sh's own
# comment claimed "no reviewed-sha record was written" — it was wrong, because the
# orchestrator wrote it.
#
# review.sh now exits 78 for "I did not judge this", and only a real verdict marks
# the sha.
run_review() {
  log "REVIEWER -> PR #$1"
  bash "$SCRIPT_DIR/review.sh" "$1"; local rc=$?
  if [ "$rc" = "78" ]; then
    log "PR #$1 não foi julgado (rc=78) — NÃO marco como revisto, volta na próxima"
    return 0
  fi
  [ "$rc" -ne 0 ] && log "review falhou PR #$1 (rc=$rc)"
  mark_reviewed "$1"
}

# The curator runs DETACHED on its own slot. It writes only GitHub comments and
# labels — no git, no build, no push — so it costs nothing to run alongside the
# heavy role, and blocking the cycle on it would serialise ~15 minutes onto every
# issue that needs repair.
#
# POSITION MATTERS. In the sibling project this launch sat after the blocking
# dispatches, which meant it was simply never reached until the heavy role finished:
# detached-but-last is not concurrent, it is the same serial order with extra
# machinery. It goes FIRST, and sets no DID, so the same pass still dispatches a
# heavy role.
launch_curator_if_needed() {
  local i
  i=$(first_with "$L_BLOCKED_SPEC")
  [ -n "$i" ] || i=$(first_with "$L_TRIAGE")
  [ -n "$i" ] || return 0

  if ! flock -w 0 -n "$LOCK_PREFIX.curator.lock" true 2>/dev/null; then
    log "curator já a correr no seu slot — #$i espera a vez"
    return 0
  fi
  log "CURATOR (paralelo) -> #$i"
  nohup bash "$SCRIPT_DIR/curator.sh" "$i" >> "$LOG_DIR/curator-bg.log" 2>&1 &
}

# ── Explicit targets ───────────────────────────────────────────────────────
if [ -n "$TARGET_PR" ]; then run_review "$TARGET_PR"; exit 0; fi

if [ -n "$TARGET_ISSUE" ]; then
  STATE=$(get_state "$TARGET_ISSUE")
  log "target #$TARGET_ISSUE estado=${STATE:-nenhum}"
  case "$STATE" in
    "$L_TRIAGE"|"$L_BLOCKED_SPEC") bash "$SCRIPT_DIR/curator.sh" "$TARGET_ISSUE" ;;
    "$L_READY"|"$L_BLOCKED_IMPL")  run_implement "$TARGET_ISSUE" ;;
    *) log "#$TARGET_ISSUE não está num estado accionável (${STATE:-sem estado})" ;;
  esac
  exit 0
fi

# ── Main loop ──────────────────────────────────────────────────────────────
CYCLE=0
log "arranque. base=$BASE_BRANCH repo=$REPO"

while true; do
  CYCLE=$((CYCLE + 1))
  log "──── ciclo $CYCLE ────"

  cleanup_stale

  # ── Subscription cooldown: WAIT, don't spin ───────────────────────────────
  #
  # With the fallback off (the default — see lib.sh), no write-path role can run
  # while the subscription is exhausted. Cycling every 45s to re-discover that
  # produces a log full of dispatches that did nothing, and on the first live run
  # it burned three attempts on #190 against an engine that returns no output at
  # all for a prompt this size.
  #
  # Sleep to the reset instead, in chunks, so the pipeline picks straight back up
  # and a `--stop` still lands promptly.
  if [ "${TEAM_USE_FALLBACK:-1}" != "1" ] || fallback_exhausted; then
    REMAIN=$(cooldown_remaining)
    if [ "$REMAIN" -gt 0 ]; then
      fallback_exhausted && log "o fallback tambem esta sem quota (Ollama Cloud, ~$(( $(fallback_cooldown_remaining) / 60 ))min)"
      log "subscrição esgotada — volta às $(date -d "@$(( $(date +%s) + REMAIN ))" +%H:%M). A aguardar (fallback desligado)."
      if [ "$ONCE" = "1" ]; then exit 0; fi
      while [ "$(cooldown_remaining)" -gt 0 ]; do sleep 60; done
      log "subscrição de volta — a retomar"
      continue
    fi
  fi

  # One read of the world per cycle. Everything below reasons from this snapshot. If
  # it fails we know nothing about the queue, so the cycle does nothing rather than
  # acting on a guess.
  if ! refresh_issue_cache; then
    log "não consegui ler os issues (API falhou) — ciclo sem acções"
    if [ "$ONCE" = "1" ]; then exit 0; fi
    log "a aguardar ${CYCLE_SLEEP}s..."
    sleep "$CYCLE_SLEEP"
    continue
  fi

  rescue_stuck_wip
  close_orphan_prs

  # Repair analysis runs alongside delivery, never in front of it.
  launch_curator_if_needed

  DID=0

  # Priority order matters. Reviewing first is what unblocks merges and closes
  # issues; only then do we start new work — otherwise the backlog grows faster
  # than it drains and nothing ever reaches qa:done.

  # 1. Review open PRs whose head has moved since the last review.
  PR=$(pick_pr)
  if [ -n "$PR" ]; then run_review "$PR"; DID=1; fi

  # 2. Rework: code problems back to the implementer.
  if [ "$DID" = "0" ]; then
    I=$(first_with "$L_BLOCKED_IMPL")
    if [ -n "$I" ]; then
      if escalate_if_stuck "$I"; then
        log "#$I: rejeições até agora: $(attempts_of "$I") de $MAX_ATTEMPTS"
        run_implement "$I"
      fi
      DID=1
    fi
  fi

  # 3. New work. No curation step: the implementer investigates the code itself and
  #    only asks for analysis when the issue genuinely is not actionable.
  if [ "$DID" = "0" ]; then
    I=$(first_with "$L_READY")
    if [ -n "$I" ]; then
      run_implement "$I"
      DID=1
    fi
  fi

  # 4. Nothing dispatched.
  if [ "$DID" = "0" ]; then
    ACTIONABLE=$(count_actionable)
    if [ "$ACTIONABLE" -gt 0 ]; then
      # Almost always: the only remaining work is blocked-spec, and the curator is
      # already chewing on it in its own slot.
      log "nada a despachar neste ciclo; ainda há $ACTIONABLE issue(s) em curso"
    else
      log "BACKLOG VAZIO — nenhum issue accionável em $REPO. Terminado."
      exit 0
    fi
  fi

  if [ "$ONCE" = "1" ]; then
    log "──── fim (once) ────"
    exit 0
  fi

  if [ "$MAX_CYCLES" -gt 0 ] && [ "$CYCLE" -ge "$MAX_CYCLES" ]; then
    log "atingidos os $MAX_CYCLES ciclos pedidos. A terminar."
    exit 0
  fi

  log "a aguardar ${CYCLE_SLEEP}s..."
  sleep "$CYCLE_SLEEP"
done
