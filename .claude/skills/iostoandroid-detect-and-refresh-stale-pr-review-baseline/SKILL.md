---
name: iostoandroid-detect-and-refresh-stale-pr-review-baseline
description: When PR test failure counts don't match, detect stale CI baseline, refresh measurement, recover if worktree deleted during review
metadata:
  created_by: agent
  scope: project
  source_session: 826e4742-b3a9-4fd6-811d-0d9c842e1f5f
  source_cwd: /home/luis-monteiro/Documentos/iosToAndroid
  source_repo: /home/luis-monteiro/Documentos/iosToAndroid
  created_at: 2026-08-21T01:02:06Z
---

# Stale PR Review Baseline Detection & Recovery (iosToAndroid)

## Symptom
During PR review, test failure counts reported in PR body don't match when you re-run `npm test` locally on the commit-parent. Example: PR claims baseline 9 failures, but you measure 8 or 11.

## Root Cause
CI baseline artifact (`.../iostoandroid-verdicts/state/baseline.json`) is outdated — points to a commit 50+ commits behind the actual PR parent. Regression detection becomes meaningless (comparing against wrong baseline).

## Procedure

### 1. Verify baseline staleness
```bash
BASELINE_COMMIT=$(jq -r '.commit_sha' ~/.../iostoandroid-verdicts/state/baseline.json)
ACTUAL_PARENT=$(git rev-parse HEAD~1)  # PR commit's parent
git log --oneline "$BASELINE_COMMIT..HEAD" | wc -l  # Should be <10 for current; >50 = stale
```

### 2. Measure fresh baseline on actual commit-parent
```bash
git checkout "$ACTUAL_PARENT"
npm test 2>&1 | tee /tmp/baseline-fresh.log
# Extract failure count — this is your ground-truth baseline
grep -c "✕\|FAIL" /tmp/baseline-fresh.log
```

Compare this count to PR results. Difference is the actual regression delta (if any).

### 3. Handle concurrent worktree deletion
If pipeline deletes your worktree mid-review (symptom: `git status` returns "not a git repository"):

```bash
# Get commit hash you were reviewing (from your notes or git reflog of original repo)
REVIEW_COMMIT="c437e6b"  # example
SCRATCH="/tmp/claude-review-recovery"
mkdir -p "$SCRATCH"

# Recreate worktree from original repo (not from deleted path)
git -C "<ORIGINAL_REPO_PATH>" worktree add "$SCRATCH/review" "$REVIEW_COMMIT"
cd "$SCRATCH/review"

# Resume verification; state is preserved in git
```

### 4. Clean up
```bash
# After review verdict is written
for wt in /tmp/claude-review-recovery /tmp/claude-*/review-*; do
  [ -d "$wt" ] && git worktree remove "$wt" 2>/dev/null || true
done
```

## Anti-Patterns
- Never trust baseline.json without checking commit distance.
- Don't reuse a deleted worktree path — always create fresh from original repo.
- Don't hardcode commit hashes — extract from `git log` or record as you go.
- Always clean temporary worktrees — leftover state breaks concurrent reviews.

## When to Apply
- Test failure counts reported by PR don't match local re-run
- Worktree deleted during review by concurrent pipeline
- Baseline artifact is 50+ commits behind actual commit-parent
