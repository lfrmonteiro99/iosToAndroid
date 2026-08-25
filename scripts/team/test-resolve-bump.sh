#!/usr/bin/env bash
# Isolated unit test for resolve_trivial_bump_conflicts.
#
# Builds a local bare "remote" and two clones, forces the two known conflict
# shapes, source's the resolver, and asserts what it did.
#
# Runs offline — no gh, no network. It stubs out gh, wt_checkout/wt_remove,
# set_state, comment_issue and log, so only the git side of the resolver is
# under test.
set -eo pipefail  # nounset would need every helper to guard $2 defaults

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
export TEAM_ROOT="$TMP"
export WT_ROOT="$TMP/wt"
export REPO="fake/fake"
export BASE_BRANCH="main"
mkdir -p "$WT_ROOT"

# ── Set up a mini "origin" with a package.json and one feature branch ──────
git init -q --bare "$TMP/origin.git"
git clone -q "$TMP/origin.git" "$TMP/seed"
(
  cd "$TMP/seed"
  git config user.email seed@local
  git config user.name  seed
  printf '{"version":"1.0.0","name":"x"}\n' > package.json
  printf '{"expo":{"version":"1.0.0"}}\n'   > app.json
  echo "// src"                             > code.ts
  git add . && git commit -qm base
  git branch -m main
  git push -qu origin main

  # Feature branch that BUMPED package.json too (racing with main's bump),
  # producing a textual conflict on the same version line. This is the case
  # the resolver is meant to short-circuit.
  git checkout -qb qa/issue-42
  printf '{"version":"0.9.9-branch","name":"x"}\n' > package.json
  printf '{"expo":{"version":"0.9.9-branch"}}\n'   > app.json
  echo "// feature" >> code.ts
  git commit -qam feature
  git push -qu origin qa/issue-42

  # Feature branch that WOULD lose work: touches package.json (adds a dep).
  git checkout -qb qa/issue-43 main
  printf '{"version":"1.0.0","name":"x","dependencies":{"lodash":"^4"}}\n' > package.json
  git commit -qam "add dep"
  git push -qu origin qa/issue-43

  # Main bumps to 1.1.0 on both bump files (auto-release-like) — this is what
  # will conflict with the feature branches.
  git checkout -q main
  printf '{"version":"1.1.0","name":"x"}\n' > package.json
  printf '{"expo":{"version":"1.1.0"}}\n'   > app.json
  git commit -qam "chore: bump"
  git push -q origin main
)

# The resolver expects a working repo at TEAM_ROOT.
git clone -q "$TMP/origin.git" "$TEAM_ROOT/repo"
git -C "$TEAM_ROOT/repo" fetch -q origin '+refs/heads/*:refs/remotes/origin/*'
export TEAM_ROOT="$TEAM_ROOT/repo"

# ── Stubs for the pipeline surfaces we don't want to hit ────────────────────
declare -a CALLS
gh() {
  # We only care about `gh pr list ... --head qa/issue-N ...`.
  case " $* " in
    *" --head qa/issue-42 "*) echo 42 ;;
    *" --head qa/issue-43 "*) echo 43 ;;
    *) echo "" ;;
  esac
}
export -f gh

wt_checkout() {
  local ref="$1" dir="$2" wt="$WT_ROOT/$dir"
  git -C "$TEAM_ROOT" fetch -q origin "+refs/heads/$ref:refs/remotes/origin/$ref" 2>/dev/null || true
  git -C "$TEAM_ROOT" worktree add -q --detach "$wt" "origin/$ref" >/dev/null 2>&1 || return 1
  git -C "$wt" checkout -qB "$ref" 2>/dev/null || true
  echo "$wt"
}
wt_remove() {
  local wt="$1"; git -C "$TEAM_ROOT" worktree remove --force "$wt" >/dev/null 2>&1 || rm -rf "$wt"
}
comment_issue()  { CALLS+=("comment:$1"); }
set_state()      { CALLS+=("state:$1=$2"); }
log()            { echo "[test] $*" >&2; }
warn()           { echo "[test] WARN $*" >&2; }
issues_with()    { printf '%s\n' "$@"; }
export -f wt_checkout wt_remove comment_issue set_state log warn issues_with

L_BLOCKED_IMPL="qa:blocked-impl"
L_REVIEW="qa:review"

# ── The function under test ────────────────────────────────────────────────
# Extract it from orchestrator.sh, source in isolation.
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
tmpfn="$TMP/fn.sh"
awk '/^BUMP_ALLOWLIST=/,/^resolve_trivial_bump_conflicts\(\) \{/{p=1} p{print} /^}$/&&p{exit}' \
  "$SCRIPT_DIR/orchestrator.sh" > "$tmpfn"
# awk stopped at the first '^}$', which is the function close. Good.
# shellcheck disable=SC1090
. "$tmpfn"

# Sanity: prove wt_checkout works BEFORE calling the resolver.
sanity_wt=$(wt_checkout qa/issue-42 sanity)
[ -n "$sanity_wt" ] && [ -d "$sanity_wt" ] || { echo "FAIL: wt_checkout stub broken"; exit 1; }
wt_remove "$sanity_wt"

# ── Case 1: trivial-only bump conflict → resolves + promotes ───────────────
issues_with() { echo 42; }; export -f issues_with
CALLS=()
resolve_trivial_bump_conflicts

# Expect: a state:42=qa:review was recorded, and a comment on #42.
match() { local needle="$1"; for c in "${CALLS[@]}"; do [[ "$c" == "$needle" ]] && return 0; done; return 1; }
match "state:42=qa:review" || { echo "FAIL: #42 not promoted; calls=${CALLS[*]}"; exit 1; }
match "comment:42"         || { echo "FAIL: #42 not commented; calls=${CALLS[*]}"; exit 1; }

# And the branch actually got the merge pushed.
git -C "$TEAM_ROOT" fetch -q origin qa/issue-42
git -C "$TEAM_ROOT" show origin/qa/issue-42:package.json | grep -q '"1.1.0"' \
  || { echo "FAIL: #42 branch did not adopt main's version"; exit 1; }

# ── Case 2: branch touched package.json → resolver defers ──────────────────
issues_with() { echo 43; }; export -f issues_with
CALLS=()
resolve_trivial_bump_conflicts

if match "state:43=qa:review"; then
  echo "FAIL: #43 must NOT be promoted — branch had real changes"
  exit 1
fi

# The dep is still there on the remote — resolver did not overwrite it.
git -C "$TEAM_ROOT" fetch -q origin qa/issue-43
git -C "$TEAM_ROOT" show origin/qa/issue-43:package.json | grep -q '"lodash"' \
  || { echo "FAIL: #43 lodash lost — resolver overwrote real changes"; exit 1; }

echo "PASS: trivial resolves, real conflicts deferred"
