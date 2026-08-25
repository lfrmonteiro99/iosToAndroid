#!/bin/bash
set -uo pipefail
TEAM_DIR="$HOME/Documentos/iosToAndroid/scripts/team"
SB=$(mktemp -d /tmp/rev-test-XXXXXX)
export TEAM_VERDICT_DIR="$SB/v" TEAM_STATE_DIR="$SB/state" TEAM_WT_ROOT="$SB/wt" \
       TEAM_LOG_DIR="$SB/logs" TEAM_LOCK_PREFIX="$SB/lock" TEAM_REVIEWERS=3 \
       TEAM_AGENT_MEM_MB=100 TEAM_MEM_FLOOR_MB=100
mkdir -p "$TEAM_VERDICT_DIR" "$TEAM_STATE_DIR" "$TEAM_WT_ROOT" "$TEAM_LOG_DIR"
END=$(grep -n '^# ── Explicit targets' "$TEAM_DIR/orchestrator.sh" | head -1 | cut -d: -f1)
head -n $((END - 1)) "$TEAM_DIR/orchestrator.sh" > "$SB/orch.sh"
cp "$TEAM_DIR/lib.sh" "$SB/lib.sh"; sed -i "s|\$SCRIPT_DIR/lib.sh|$SB/lib.sh|" "$SB/orch.sh"
cat > "$SB/review.sh" <<'STUB'
#!/bin/bash
source "$LIBSH"; inflight_register "review-$1" "${TEAM_SLOT:-main}"
echo "$1 slot=${TEAM_SLOT:-?}" >> "$SANDBOX/dispatched.txt"; sleep 20
STUB
chmod +x "$SB/review.sh"; export LIBSH="$SB/lib.sh" SANDBOX="$SB"
source "$SB/orch.sh"; SCRIPT_DIR="$SB"
log(){ :; }
PRS="601 602 603 604"
pick_pr() { local p; for p in $PRS; do pr_claimed "$p" && continue; echo "$p"; return 0; done; }
CLAIMED_THIS_CYCLE=""; DISPATCHED_REVIEW=0
launch_reviewers_if_needed; sleep 2
GOT=$(sort "$SB/dispatched.txt" 2>/dev/null)
echo "$GOT" | sed 's/^/    /'
N=$(echo "$GOT"|grep -c .); U=$(echo "$GOT"|awk '{print $1}'|sort -u|grep -c .); S=$(echo "$GOT"|awk '{print $2}'|sort -u|grep -c .)
F=0
[ "$N" = 3 ] && echo "  ✅ 3 reviewers lançados" || { echo "  ❌ lançou $N"; F=1; }
[ "$U" = 3 ] && echo "  ✅ 3 PRs distintos" || { echo "  ❌ $U PRs distintos"; F=1; }
[ "$S" = 3 ] && echo "  ✅ 3 slots distintos (rev1..rev3)" || { echo "  ❌ $S slots"; F=1; }
B=$(wc -l < "$SB/dispatched.txt"); CLAIMED_THIS_CYCLE=""; launch_reviewers_if_needed; sleep 1
[ "$(wc -l < "$SB/dispatched.txt")" = "$B" ] && echo "  ✅ 2º ciclo não redespacha (slots ocupados)" || { echo "  ❌ redespachou"; F=1; }
pkill -f "$SB/review.sh" 2>/dev/null; rm -rf "$SB"; exit $F
