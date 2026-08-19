#!/bin/bash
# lib.sh — shared configuration and helpers for the delivery pipeline agents.
# Sourced by every role script. Not executable on its own.
#
# Ported from the monthy_budget QA harness, minus the critic and the verifier:
# this repo already has a filed backlog, and there is no running-app tester here.
# What remains is the write path — curator, implementer, reviewer.

# ── Repository / paths ─────────────────────────────────────────────────────
REPO="${TEAM_REPO:-lfrmonteiro99/iosToAndroid}"

TEAM_ROOT="${TEAM_ROOT:-$HOME/Documentos/iosToAndroid}"

# Branch topology: SINGLE branch.
#
# The sibling project runs main + dev because its critic tests the app built from
# main while fixes stage on dev. There is no critic here and nothing re-tests dev,
# so a staging branch would only mean a later, bigger merge with the same single
# gate — the reviewer. Implementer branches are `qa/issue-N` and their PRs target
# main directly.
BASE_BRANCH="${TEAM_BASE_BRANCH:-main}"

# Verdicts live OUTSIDE the repository.
#
# Inside the working tree they caused three separate failures at once in the
# sibling project: they got committed, a run that died before writing inherited
# the PREVIOUS run's verdict and reported another issue's work as its own, and
# `git add -A` dragged them into the PR diff. Outside the repo none is possible.
VERDICT_DIR="${TEAM_VERDICT_DIR:-$HOME/Documentos/iostoandroid-verdicts}"

# Worktrees are siblings of the repo, never inside it: a worktree nested in the
# repo shows up as untracked content and eventually gets committed by accident.
WT_ROOT="${TEAM_WT_ROOT:-$HOME/Documentos/iostoandroid-wt}"

LOG_DIR="${TEAM_LOG_DIR:-/tmp/ios2android-team}"
STATE_DIR="${TEAM_STATE_DIR:-$HOME/Documentos/iostoandroid-verdicts/state}"

LOCK_PREFIX="${TEAM_LOCK_PREFIX:-/tmp/ios2android-agent}"

# The Ollama fallback is ON: when the Claude subscription runs out of usage, the
# same harness keeps working behind a cloud model.
#
# This was briefly defaulted to 0 on the belief that `deepseek-v4-flash:cloud` could
# not handle a 16KB agentic prompt. That belief was wrong, and the evidence for it
# was three separate misreadings — worth recording, because each one is easy to
# repeat:
#
#   * `claude -p` does not stream. It prints only the final message, so "no output
#     for four minutes" is what a working agent looks like. Use
#     `--output-format stream-json --verbose` to actually watch one.
#   * the role logs were opened with `>`, so each retry destroyed the previous
#     attempt's output. Reading the log mid-retry showed two lines and looked like
#     an engine that ran and said nothing. (Now appended — see agent_log_header.)
#   * the engine was probed with a two-word prompt and the real task with a short
#     timeout. The difference measured was latency, not capability.
#
# What was actually broken was run-agent.sh never entering $WORKDIR, so the agent
# had no access to the tree it was told to change. With that fixed, #215 ran end to
# end on this exact fallback in 4m34s: verdict `implemented`, branch pushed, PR
# opened.
#
# Set TEAM_USE_FALLBACK=0 to make the orchestrator sleep out a quota window instead
# — useful if you would rather wait for the stronger model than take fallback-grade
# work on a delicate issue.
TEAM_USE_FALLBACK="${TEAM_USE_FALLBACK:-1}"

COOLDOWN_FILE="$STATE_DIR/claude-usage-cooldown"

# ── Model tiers ────────────────────────────────────────────────────────────
#
# The backlog is already triaged with `haiku-ready` / `sonnet-ready`, so the tier
# comes from the issue, not from a global default. Each tier names BOTH engines —
# the subscription model and the Ollama tag used when the subscription is out —
# because a run must not silently change difficulty class just because the quota
# ran out.
#
# The cloud tags below were verified to resolve (2026-08-19). Note `glm-5.2:cloud`
# takes a hyphen: `glm5.2:cloud` does not exist, and `glm-4.7` was retired
# 2026-07-15.
#
# LOW TIER ON THE FALLBACK: THERE IS NO EVIDENCE FOR A LOW-USAGE MODEL THAT CODES.
#
# The sibling repo's bakeoffs tested exactly one low-usage model on the implement
# role — `gemma4:cloud` — and it scored 10/18 with produced_diff=FALSE: a verdict,
# no code. The other low tags (`gpt-oss:20b-cloud`, `nemotron-3-nano:30b-cloud`)
# only ever ran the *gate* bakeoff, which is counting lines and writing a JSON
# object, not programming.
#
# `gpt-oss:20b-cloud` then got two real runs here and lost both:
#   * #217 — implemented and wrote the test, but emitted a verdict with unescaped
#     quotes that did not parse. Recoverable only because repair-verdict.py now
#     salvages it.
#   * #215 rework — no verdict at all, in 2m35s.
#
# Two for two is not proof of incapability, but it is the only evidence there is
# and it points one way. So the FALLBACK low tier is the model that has actually
# produced clean verdicts here (#215 first run, end to end in 4m34s). The Claude
# side keeps `haiku` for haiku-ready issues, which is what the labels ask for — the
# downgrade applies only while the subscription is out and something has to run.
#
# Set TEAM_FALLBACK_LOW=gpt-oss:20b-cloud to go back to a genuinely low-usage tag
# once there is evidence for one.
TEAM_MODEL_LOW_CLAUDE="${TEAM_MODEL_LOW_CLAUDE:-haiku}"
TEAM_MODEL_MED_CLAUDE="${TEAM_MODEL_MED_CLAUDE:-sonnet}"
TEAM_MODEL_STRONG_CLAUDE="${TEAM_MODEL_STRONG_CLAUDE:-opus}"

TEAM_FALLBACK_LOW="${TEAM_FALLBACK_LOW:-deepseek-v4-flash:cloud}"
TEAM_FALLBACK_MED="${TEAM_FALLBACK_MED:-deepseek-v4-flash:cloud}"
TEAM_FALLBACK_STRONG="${TEAM_FALLBACK_STRONG:-deepseek-v4-pro:cloud}"

# How many judged rejections before the orchestrator changes strategy (curator,
# then a forced split). Lives here, not in the orchestrator, because implement.sh
# and review.sh both report against it.
MAX_ATTEMPTS="${TEAM_MAX_ATTEMPTS:-3}"

ATTEMPTS_DIR="$STATE_DIR/attempts"
mkdir -p "$ATTEMPTS_DIR" 2>/dev/null || true

# Count a JUDGED REJECTION, never a dispatch.
#
# This used to fire when the orchestrator handed an issue to the implementer, so it
# counted three different things as the same thing: real work that a reviewer
# rejected, a run that died because run-agent.sh never entered the worktree, and the
# mere fact of starting. #190 reached the strong tier — opus, deepseek-v4-pro — on
# two attempts that were both MY bugs, having never once been judged on its merits.
#
# The counter exists to answer one question: "has the cheap model been given a fair
# shot and failed?" Only a verdict that was produced and then rejected answers it.
# Infrastructure failures requeue the work without counting, which is what
# no_verdict_is_real_failure already decides for the state machine.
bump_attempts() {
  local issue="$1" n
  n=$(( $(cat "$ATTEMPTS_DIR/$issue" 2>/dev/null || echo 0) + 1 ))
  echo "$n" > "$ATTEMPTS_DIR/$issue"
  printf '%s' "$n"
}

attempts_of() { cat "$ATTEMPTS_DIR/${1}" 2>/dev/null || echo 0; }

clear_attempts() { rm -f "$ATTEMPTS_DIR/${1}" 2>/dev/null || true; }

# ── Circuit breaker for runs that keep dying without a verdict ─────────────
#
# A run that produces no verdict is not the issue's fault, so it does not count as a
# rejection and the issue goes straight back in the queue. Correct in isolation, and
# a trap in aggregate: the issue returns to the SAME position — the head of the
# queue — and is dispatched again immediately. If the cause is the engine rather
# than the issue, that repeats forever.
#
# Measured: with the subscription exhausted, #318 failed three times in a row on the
# fallback, ~3 minutes each, and the orchestrator dispatched nothing else in
# between. The whole pipeline was pinned on one issue, and from the log every cycle
# looked like work starting.
#
# So after a couple of consecutive verdict-less runs the issue is DEFERRED — parked
# with a timestamp and skipped by the dispatcher until it passes. When the cause is
# a quota outage the natural deadline is the moment the subscription returns: the
# stronger engine is exactly what it was missing.
NOVERDICT_DIR="$STATE_DIR/noverdict"
DEFER_DIR="$STATE_DIR/deferred"
mkdir -p "$NOVERDICT_DIR" "$DEFER_DIR" 2>/dev/null || true

TEAM_DEFER_AFTER="${TEAM_DEFER_AFTER:-2}"

bump_noverdict() {
  local issue="$1" n
  n=$(( $(cat "$NOVERDICT_DIR/$issue" 2>/dev/null || echo 0) + 1 ))
  echo "$n" > "$NOVERDICT_DIR/$issue"
  printf '%s' "$n"
}

clear_noverdict() { rm -f "$NOVERDICT_DIR/${1}" 2>/dev/null || true; }

# Park an issue until $2 (epoch seconds). Defaults to the end of the current quota
# cooldown, or 30 minutes when there is none.
defer_issue() {
  local issue="$1" until_ts="${2:-}" cd now
  if [ -z "$until_ts" ]; then
    cd=$(cat "$COOLDOWN_FILE" 2>/dev/null || echo 0)
    now=$(date +%s)
    if [ "$cd" -gt "$now" ]; then until_ts=$(( cd + 120 )); else until_ts=$(( now + 1800 )); fi
  fi
  echo "$until_ts" > "$DEFER_DIR/$issue"
  printf '%s' "$until_ts"
}

# True when the next agent run will land on the fallback engine rather than the
# subscription: the quota is spent and the fallback is enabled.
on_fallback() {
  [ "${TEAM_USE_FALLBACK:-1}" = "1" ] || return 1
  [ "$(cooldown_remaining)" -gt 0 ]
}

is_deferred() {
  local issue="$1" until_ts now
  [ -f "$DEFER_DIR/$issue" ] || return 1
  until_ts=$(cat "$DEFER_DIR/$issue" 2>/dev/null || echo 0)
  now=$(date +%s)
  if [ "$now" -lt "$until_ts" ]; then return 0; fi
  rm -f "$DEFER_DIR/$issue" 2>/dev/null || true   # expired
  return 1
}

# After this many failed attempts an issue is promoted to the strong tier. This is
# the "only if it needs it" rule made mechanical: nobody guesses up front which
# issue is hard, the issue demonstrates it by defeating the cheaper model.
TEAM_STRONG_AFTER="${TEAM_STRONG_AFTER:-2}"

# Echo "<claude-model> <fallback-tag> <tier>" for an issue.
#
# $2 floors the tier: pass "med" for roles that must not run on the cheap model
# regardless of the label. The reviewer does that — the label describes how hard
# the CHANGE is, not how hard judging it is, and the reviewer is the only gate in
# front of main.
resolve_models() {
  local issue="$1" floor="${2:-low}" labels tier attempts

  labels=$(gh issue view "$issue" --repo "$REPO" --json labels \
           --jq '[.labels[].name] | join(",")' 2>/dev/null || echo "")

  case ",$labels," in
    *,haiku-ready,*)  tier=low ;;
    *,sonnet-ready,*) tier=med ;;
    *)                tier=med ;;   # unlabelled is not evidence of being easy
  esac

  [ "$floor" = "med" ] && [ "$tier" = "low" ] && tier=med

  # Earned promotion: repeated failure is the only evidence that the cheap model
  # is not enough.
  attempts=$(cat "$STATE_DIR/attempts/$issue" 2>/dev/null || echo 0)
  if [ "${attempts:-0}" -ge "$TEAM_STRONG_AFTER" ]; then tier=strong; fi

  case "$tier" in
    low)    echo "$TEAM_MODEL_LOW_CLAUDE $TEAM_FALLBACK_LOW low" ;;
    strong) echo "$TEAM_MODEL_STRONG_CLAUDE $TEAM_FALLBACK_STRONG strong" ;;
    *)      echo "$TEAM_MODEL_MED_CLAUDE $TEAM_FALLBACK_MED med" ;;
  esac
}

# Seconds remaining on the subscription cooldown; 0 when there is none.
cooldown_remaining() {
  [ -f "$COOLDOWN_FILE" ] || { echo 0; return; }
  local until_ts now
  until_ts=$(cat "$COOLDOWN_FILE" 2>/dev/null || echo 0)
  now=$(date +%s)
  if [ "$now" -lt "$until_ts" ]; then echo $(( until_ts - now )); else echo 0; fi
}

mkdir -p "$VERDICT_DIR" "$LOG_DIR" "$STATE_DIR" "$WT_ROOT" 2>/dev/null || true

# ── Labels: the pipeline state machine ─────────────────────────────────────
# Exactly one qa:* label is the authoritative state of an issue. Comments are
# the audit trail; the label is what the orchestrator dispatches on.
L_TRIAGE="qa:triage"              # in the queue, awaiting the curator
L_READY="qa:ready"                # curated: root cause + plan + AC + test steps
L_WIP="qa:wip"                    # implementer working
L_REVIEW="qa:review"              # PR open into main, awaiting reviewer
L_DONE="qa:done"                  # merged / closed
L_BLOCKED_IMPL="qa:blocked-impl"  # back to implementer (code problem)
L_BLOCKED_SPEC="qa:blocked-spec"  # back to curator (spec problem)
L_HUMAN="qa:needs-human"          # pipeline gave up

ALL_QA_LABELS="$L_TRIAGE,$L_READY,$L_WIP,$L_REVIEW,$L_DONE,$L_BLOCKED_IMPL,$L_BLOCKED_SPEC,$L_HUMAN"

# Severity reuses the priority labels this repo already carries (P0..P3) instead
# of inventing a parallel sev:* scheme. The orchestrator dispatches worst-first on
# these; the curator may re-grade.
ALL_PRIO_LABELS="P0,P1,P2,P3"

log() { echo "[${ROLE:-team}] $(date +%H:%M:%S) $*"; }
warn() { echo "[${ROLE:-team}] $(date +%H:%M:%S) WARN $*" >&2; }

# ── Issue state transitions ────────────────────────────────────────────────
# Move an issue to exactly one qa:* state, VERIFYING the change landed.
#
# It used to fire-and-forget with a warning on failure, and that turned a GitHub
# outage into repeated work in the sibling project: a transition silently failed,
# the issue stayed put, the orchestrator re-dispatched it, and the curator split
# it three times — creating sub-issues on each pass. A state machine whose
# transitions can silently not happen is not a state machine.
set_state() {
  local issue="$1" state="$2"
  local remove attempt actual
  remove=$(printf '%s' "$ALL_QA_LABELS" | tr ',' '\n' | grep -vxF "$state" | paste -sd, -)

  local read_ok=0
  for attempt in 1 2 3 4; do
    gh issue edit "$issue" --repo "$REPO" \
      --add-label "$state" --remove-label "$remove" >/dev/null 2>&1

    # GitHub is eventually consistent, so give it a moment before reading back.
    sleep 2
    actual=$(get_state "$issue")
    [ "$actual" = "$state" ] && return 0
    [ -n "$actual" ] && read_ok=1

    [ "$attempt" -lt 4 ] && sleep $((attempt * 4))
  done

  # An unreadable state is NOT the same as a wrong state, and conflating them
  # produces false alarms during an API outage — the transition usually did land,
  # we just could not confirm it.
  if [ "$read_ok" = "0" ]; then
    warn "não confirmei a transição de #$issue para '$state' (a API não respondeu à leitura)"
    warn "  a etiqueta provavelmente foi aplicada; o ciclo seguinte relê o estado real"
    return 0
  fi

  warn "TRANSIÇÃO FALHOU: #$issue continua em '$actual' e não em '$state'"
  warn "  o orquestrador vai voltar a despachar este issue — risco de trabalho repetido"
  return 1
}

# Read the single qa:* state label of an issue ("" when it has none).
get_state() {
  local issue="$1"
  gh issue view "$issue" --repo "$REPO" --json labels \
    --jq '[.labels[].name] | map(select(startswith("qa:"))) | .[0] // ""' 2>/dev/null || echo ""
}

# Re-grade priority to exactly one of P0..P3.
set_priority() {
  local issue="$1" prio="$2" remove
  case "$prio" in P0|P1|P2|P3) ;; *) return 0 ;; esac
  remove=$(printf '%s' "$ALL_PRIO_LABELS" | tr ',' '\n' | grep -vxF "$prio" | paste -sd, -)
  gh issue edit "$issue" --repo "$REPO" \
    --add-label "$prio" --remove-label "$remove" >/dev/null 2>&1 || true
}

# Add a label via the REST API, not `gh pr edit --add-label`.
#
# `gh pr edit` resolves project cards over GraphQL on the way through, and on the
# sibling repo that fails outright with a Projects-classic deprecation error — the
# label is then never applied and gh reports failure for an unrelated reason. The
# issues endpoint works for PRs too; GitHub treats them as issues for labelling.
add_label_api() {
  local number="$1" label="$2"
  gh api -X POST "repos/$REPO/issues/$number/labels" \
    -f "labels[]=$label" >/dev/null 2>&1
}

# Open a PR via the REST API. Same reason as add_label_api: `gh pr create` can die
# on Projects-classic resolution, so the branch is pushed and the PR never opens —
# which in the sibling project stranded two fully-implemented issues for hours.
create_pr_api() {
  local head="$1" base="$2" title="$3" body="$4"
  local resp num
  resp=$(gh api -X POST "repos/$REPO/pulls" \
           -f title="$title" -f head="$head" -f base="$base" -f body="$body" 2>&1)
  num=$(printf '%s' "$resp" | jq -r '.number // empty' 2>/dev/null)
  if [ -n "$num" ]; then printf '%s' "$num"; return 0; fi
  # An existing PR for this head is success, not failure.
  num=$(gh api "repos/$REPO/pulls?head=${REPO%%/*}:$head&base=$base&state=open" \
        --jq '.[0].number // empty' 2>/dev/null)
  if [ -n "$num" ]; then printf '%s' "$num"; return 0; fi
  warn "não abri PR $head -> $base: $(printf '%s' "$resp" | jq -r '.message // .' 2>/dev/null | head -1)"
  return 1
}

# Break accidental issue-closing keywords in model-written prose.
#
# GitHub closes an issue when a commit message or PR body contains `fix #N`,
# `closes #N`, `resolved #N` and friends — anywhere, in any sentence. Everything
# this pipeline publishes is written by an agent and is full of issue numbers:
# summaries, PR descriptions, reviewer findings, curator analyses.
#
# It has already bitten. My own commit said
#
#     "...and with this fix #215 ran end to end on that same slot..."
#
# and GitHub read `fix #215` as a directive and CLOSED #215 — an issue whose PR was
# open and blocked at the time. Nothing warned; the issue simply left the board as
# if delivered. An agent writing "this also fixes #212" in a description would do
# the same to someone else's work.
#
# So every field that reaches GitHub goes through this, and the ONLY closing
# keyword that survives is the `Fixes #N` line the harness itself appends, after
# sanitising. `#N` on its own is left intact — a plain reference is useful and
# harmless.
# FLAT alternation, exactly three capture groups. Nested groups here silently
# renumber the back-references: a first attempt used `(fix(es|ed)?)` and emitted
# `\1\4issue \5`, which turned "fix #215" into "fixissue" — the issue NUMBER was
# dropped, destroying the very information the text was carrying. POSIX ERE has no
# non-capturing groups, so the alternatives are spelled out instead of nested.
sanitize_closing_keywords() {
  sed -E 's/\b([Ff]ix|[Ff]ixes|[Ff]ixed|[Cc]lose|[Cc]loses|[Cc]losed|[Cc]losing|[Rr]esolve|[Rr]esolves|[Rr]esolved|[Rr]esolving)([[:space:]]+)#([0-9]+)/\1\2issue \3/g'
}

comment_issue() {
  local issue="$1" body="$2"
  gh issue comment "$issue" --repo "$REPO" --body "$body" >/dev/null 2>&1 \
    || warn "não consegui comentar #$issue"
}

# ── Verdict helpers ────────────────────────────────────────────────────────
# NOTE ON `head -c`: never pipe a verdict field through `head -c N`. Under
# `set -o pipefail`, when the value is longer than N, head closes the pipe, the
# writer takes SIGPIPE, and the SCRIPT DIES mid-run. Truncate with bash parameter
# expansion (`${v:0:N}`) instead — no pipe, no subshell, no signal.
#
# NOTE ON NAMING: keep the path variable and the value variable distinct.
# `VERDICT=$(jq ... "$VERDICT")` overwrites the path with the value, and the next
# jq call then tries to open a file named "blocked".

# True when the last agent on this slot ran on the FALLBACK engine rather than the
# subscription. A role that produced no verdict on the fallback must not be treated
# as "this issue defeated the pipeline": the fallback model is materially weaker, so
# a temporary quota outage would otherwise park real work permanently.
agent_used_fallback() {
  local slot="${1:-main}"
  grep -q '^ollama/' "$LOCK_PREFIX.$slot.engine" 2>/dev/null
}

# Standard handling for "the agent produced no verdict". Returns 0 when the caller
# should ESCALATE (real failure), 1 when it should leave the issue alone for a
# later retry.
#
# Two things look identical from the outside — no verdict file — and neither is the
# issue's fault: the fallback engine ran and could not finish, or the run never
# started because the lock slot was busy (exit 75). The second happens whenever the
# orchestrator is restarted while an agent is still mid-run.
no_verdict_is_real_failure() {
  local slot="${1:-main}" rc="${2:-}"

  if [ "$rc" = "75" ]; then
    warn "sem veredicto porque o slot '$slot' estava ocupado (exit 75) — não escalo"
    return 1
  fi
  if [ "$rc" = "77" ]; then
    warn "sem veredicto porque a subscrição está em cooldown e o fallback está desligado (exit 77) — não escalo"
    return 1
  fi
  if agent_used_fallback "$slot"; then
    warn "sem veredicto mas o motor era o fallback — não escalo, fica para nova tentativa"
    return 1
  fi
  return 0
}

# ── Agent logs: APPEND, never truncate ─────────────────────────────────────
#
# These used to be opened with `>`, so every retry destroyed the evidence of the
# attempt before it. That is exactly how I misdiagnosed the first live run: I read
# implement-190.log while the THIRD attempt was still starting, saw two lines, and
# concluded the engine had run and produced nothing. Attempts 1 and 2 — the ones
# that actually failed and would have shown why — had already been overwritten.
#
# A log that deletes the failure you are trying to explain is worse than no log.
agent_log_header() {
  local file="$1" what="$2"
  {
    echo
    echo "════════════════════════════════════════════════════════════════════"
    echo "  $what — $(date '+%Y-%m-%d %H:%M:%S')"
    echo "════════════════════════════════════════════════════════════════════"
  } >> "$file"
}

# A verdict must be PRESENT and PARSEABLE before anything reads a field from it.
#
# `jqv` swallows a parse error and returns its fallback. For `.outcome` that
# fallback is `blocked`, so a malformed verdict was indistinguishable from an agent
# that declared itself blocked — and implement.sh routed the work to the curator to
# analyse a problem that did not exist.
#
# Measured on #217: the agent implemented the fix, wrote the test file, and set
# `"outcome": "implemented"` — but wrote `mensagem "onPress impreciso" (exemplo)`
# inside the description with the inner quotes unescaped. The file stopped parsing,
# jqv returned `blocked`, and the issue went to qa:blocked-spec. Nothing in the log
# said the problem was syntax.
#
# So: try to repair, and if it still will not parse, report NO VERDICT. That path
# requeues the work instead of misclassifying it, which is the only safe reading of
# "I cannot tell what this agent decided".
verdict_readable() {
  local file="$1"
  [ -f "$file" ] || return 1
  jq -e . "$file" >/dev/null 2>&1 && return 0

  warn "veredicto $(basename "$file") não faz parse — a tentar reparar"
  if python3 "$(dirname "${BASH_SOURCE[0]}")/repair-verdict.py" "$file" 2>&1 \
     | while IFS= read -r l; do warn "  $l"; done; then :; fi
  if jq -e . "$file" >/dev/null 2>&1; then
    warn "veredicto reparado com sucesso"
    return 0
  fi
  warn "veredicto irrecuperável — tratado como SEM VEREDICTO (o trabalho volta à fila)"
  rm -f "$file"
  return 1
}

jqv() {
  local file="$1" filter="$2" fallback="${3:-}"
  local out
  out=$(jq -r "$filter" "$file" 2>/dev/null) || out=""
  [ "$out" = "null" ] && out=""
  printf '%s' "${out:-$fallback}"
}

# ── Node dependencies in a worktree ────────────────────────────────────────
# A fresh worktree has no node_modules (it is gitignored), and nothing — not lint,
# not tsc, not jest — runs without it.
#
# `npm ci` in every worktree costs ~40-60s each and this pipeline creates one per
# issue, per review, per rework. So: when the worktree's package-lock.json is
# byte-identical to the main checkout's, SYMLINK the main checkout's node_modules
# instead. Identical lock means identical tree, and no agent writes into
# node_modules.
#
# When the lock DIFFERS the symlink would be actively dangerous — installing would
# mutate the main checkout's tree under a live agent — so that case always gets its
# own real install.
wt_prepare_node() {
  local wt="$1"
  [ -f "$wt/package.json" ] || return 0

  # `.gitignore` says `node_modules/`, with a trailing slash — which matches a
  # DIRECTORY and not a SYMLINK of the same name. So the symlink below shows up as
  # untracked, and the implementer's `git add -A` commits it: a mode-120000 entry
  # pointing at an absolute path on this machine, broken in every other checkout.
  # The reviewer caught exactly that on PR #295, the first PR this pipeline
  # produced. Excluding it per worktree stops it at the source.
  local excl
  excl=$(git -C "$wt" rev-parse --git-path info/exclude 2>/dev/null || echo "")
  if [ -n "$excl" ]; then
    mkdir -p "$(dirname "$excl")" 2>/dev/null || true
    grep -qxF 'node_modules' "$excl" 2>/dev/null || echo 'node_modules' >> "$excl"
  fi

  if [ -d "$TEAM_ROOT/node_modules" ] \
     && [ -f "$wt/package-lock.json" ] && [ -f "$TEAM_ROOT/package-lock.json" ] \
     && cmp -s "$wt/package-lock.json" "$TEAM_ROOT/package-lock.json"; then
    ln -sfn "$TEAM_ROOT/node_modules" "$wt/node_modules" 2>/dev/null && return 0
  fi

  rm -f "$wt/node_modules" 2>/dev/null || true   # a stale symlink, never a real dir
  if ( cd "$wt" && npm ci --prefer-offline --no-audit --fund=false >/dev/null 2>&1 ); then
    return 0
  fi

  # `npm install` REWRITES package-lock.json, and a worktree whose lock silently
  # gained 40KB of churn puts that churn in the implementer's PR — a diff nobody
  # asked for, on the one file a reviewer is least likely to read line by line. So
  # it is a last resort, and the lock is restored immediately afterwards. If the
  # issue genuinely means to change dependencies, the agent edits package.json and
  # regenerates the lock itself, deliberately.
  warn "npm ci falhou em $wt — a tentar npm install (o lock é reposto a seguir)"
  ( cd "$wt" && npm install --no-audit --fund=false >/dev/null 2>&1 ) \
    || warn "npm install também falhou em $wt — o agente vai ter de o resolver"
  git -C "$wt" checkout -- package-lock.json >/dev/null 2>&1 || true
}

# ── Baseline (what is already broken on main) ──────────────────────────────
# See baseline.sh for why this exists. Emits the markdown block appended to the
# implementer's and the reviewer's prompts. Prints NOTHING when there is no
# baseline file — and the prompts read that absence as "the gate is strict".
BASELINE_FILE="$STATE_DIR/baseline.json"

baseline_block() {
  [ -s "$BASELINE_FILE" ] || return 0
  local le tsc ft tt fs ts
  le=$(jqv "$BASELINE_FILE" '.lint_errors' '0')
  tsc=$(jqv "$BASELINE_FILE" '.tsc_ok' 'true')
  ft=$(jqv "$BASELINE_FILE" '.totals.failed_tests' '0')
  tt=$(jqv "$BASELINE_FILE" '.totals.tests' '?')
  fs=$(jqv "$BASELINE_FILE" '.totals.failed_suites' '0')
  ts=$(jqv "$BASELINE_FILE" '.totals.suites' '?')

  # Everything already green: say so, and say the gate is strict. Silence here
  # would be read as "no baseline", which means the same thing — but saying it
  # removes the ambiguity for the agent.
  if [ "$le" = "0" ] && [ "$tsc" = "true" ] && [ "$ft" = "0" ]; then
    cat <<EOF

---

# 📏 LINHA DE BASE: \`$BASE_BRANCH\` ESTÁ VERDE

Sem erros de lint, \`tsc\` limpo, $tt testes a passar. **O portão é estrito:** as
três verificações têm de passar por inteiro. Qualquer falha é tua.
EOF
    return 0
  fi

  cat <<EOF

---

# 📏 LINHA DE BASE: \`$BASE_BRANCH\` JÁ ESTÁ VERMELHO

**Não bloqueies (nem desistas) por falhas que já existiam antes deste trabalho.**
Medido em \`$BASE_BRANCH\` (\`$(jqv "$BASELINE_FILE" '.sha' '?')\`):

- \`npm run lint\`: **$le erro(s)** já existentes
- \`npx tsc --noEmit\`: $( [ "$tsc" = "true" ] && echo "limpo" || echo "**já falha**" )
- \`npm test\`: **$ft de $tt testes a falhar**, em $fs de $ts suites

A causa dominante é conhecida e é **uma linha**: \`src/store/SettingsStore.tsx\`
faz \`if (!firstSyncDone) return null;\`, e \`firstSyncDone\` só fica verdadeiro
depois de uma leitura assíncrona do \`AsyncStorage\`. Os testes renderizam de
forma síncrona através de \`src/test-utils.tsx\`, por isso o provider devolve
\`null\` e a árvore do ecrã vem vazia — daí os "Unable to find an element with
text: ...". Não é um defeito por teste; é o mesmo defeito 100 vezes.

## O critério, portanto, é REGRESSÃO, não perfeição

- Corre as três verificações e **compara com estes números**.
- Se o total de testes a falhar **não subiu** e não há falhas novas em ficheiros
  que tocaste, isso **não bloqueia**.
- Se aparece uma falha que não estava aqui, **isso bloqueia** — e nomeia-a.
- Os testes que TU escreves para este trabalho têm de passar. Sempre. Sem
  desculpa de baseline.

A lista completa dos testes já a falhar está em \`$BASELINE_FILE\`; lê-a com
\`jq -r '.failed_tests[]' $BASELINE_FILE\` quando precisares de decidir se uma
falha é nova.
EOF
}

# ── Git worktrees ──────────────────────────────────────────────────────────
# Create a worktree on a NEW branch cut from $BASE_BRANCH. This is what the
# IMPLEMENTER wants.
#
# Do NOT use this to review a PR. If the branch doesn't exist locally, `-b` creates
# it pointing at the base, the worktree ends up holding the BASE's content,
# `git diff base...HEAD` returns EMPTY, and the reviewer reviews nothing at all —
# with no error in the log. Use wt_checkout for that.
wt_create() {
  local branch="$1" dirname="$2" base="${3:-$BASE_BRANCH}"
  local wt="$WT_ROOT/$dirname"
  git -C "$TEAM_ROOT" fetch origin "$base" >/dev/null 2>&1 || true
  # Also fetch the work branch itself: on REWORK it already exists on the remote
  # and carries the previous attempt.
  git -C "$TEAM_ROOT" fetch origin \
    "+refs/heads/$branch:refs/remotes/origin/$branch" >/dev/null 2>&1 || true

  if git -C "$TEAM_ROOT" rev-parse --verify --quiet "origin/$branch" >/dev/null 2>&1; then
    # REWORK. Start from the REMOTE tip, not from any local branch of the same
    # name: a leftover local ref is usually behind what was pushed, and since
    # implement.sh finishes with `push --force`, resuming from it would silently
    # discard the previous attempt — including the very code the reviewer asked to
    # have corrected.
    git -C "$TEAM_ROOT" worktree add --detach "$wt" "origin/$branch" >/dev/null 2>&1 \
      || { warn "não criou worktree $wt em origin/$branch"; return 1; }
    git -C "$wt" checkout -B "$branch" >/dev/null 2>&1 || true
  else
    git -C "$TEAM_ROOT" worktree add "$wt" -b "$branch" "origin/$base" >/dev/null 2>&1 \
      || git -C "$TEAM_ROOT" worktree add "$wt" "$branch" >/dev/null 2>&1 \
      || { warn "não criou worktree $wt para $branch"; return 1; }
  fi
  echo "$wt"
}

# Check out an EXISTING remote branch, detached. This is what the REVIEWER wants:
# the tree must hold the code under test, not a fresh branch off the base.
wt_checkout() {
  local ref_name="$1" dirname="$2"
  local wt="$WT_ROOT/$dirname"
  git -C "$TEAM_ROOT" fetch origin \
    "+refs/heads/$ref_name:refs/remotes/origin/$ref_name" >/dev/null 2>&1 || true
  local ref=""
  for cand in "origin/$ref_name" "$ref_name"; do
    if git -C "$TEAM_ROOT" rev-parse --verify --quiet "$cand" >/dev/null 2>&1; then
      ref="$cand"; break
    fi
  done
  if [ -z "$ref" ]; then
    warn "branch '$ref_name' não existe no remoto nem localmente"
    return 1
  fi
  git -C "$TEAM_ROOT" worktree add --detach "$wt" "$ref" >/dev/null 2>&1 \
    || { warn "não criou worktree $wt em $ref"; return 1; }
  echo "$wt"
}

wt_remove() {
  local wt="$1"
  [ -n "$wt" ] && [ -d "$wt" ] || return 0
  # Drop the node_modules symlink FIRST. `git worktree remove --force` follows it
  # on some git versions and would delete the main checkout's dependency tree.
  [ -L "$wt/node_modules" ] && rm -f "$wt/node_modules"
  git -C "$TEAM_ROOT" worktree remove --force "$wt" >/dev/null 2>&1 || rm -rf "$wt"
  local branch
  branch=$(basename "$wt")
  git -C "$TEAM_ROOT" branch -D "$branch" >/dev/null 2>&1 || true
}
