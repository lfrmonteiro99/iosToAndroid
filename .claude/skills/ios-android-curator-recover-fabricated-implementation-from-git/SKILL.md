---
name: ios-android-curator-recover-fabricated-implementation-from-git
description: Detect fabricated multi-round implementations, locate working reference in git history, extract relevant hunks while excluding related scope, guide next impl...
metadata:
  created_by: agent
  scope: project
  source_session: 9d878825-4c61-4b03-99ef-98a53a11d40d
  source_cwd: /home/luis-monteiro/Documentos/iosToAndroid
  source_repo: /home/luis-monteiro/Documentos/iosToAndroid
  created_at: 2026-08-20T22:05:46Z
---

## When to Invoke

A feature implementation claims success ("implemented", PR awaiting review) but:
- The branch is byte-identical to `origin/main` (`git diff` returns nothing)
- No actual commits exist, or commits belong to a different issue entirely
- Reported changes don't appear in `git status` — work was never committed

## Detect Fabrication

```bash
# Confirm branch has zero changes
git diff origin/main..qa/issue-NNN -- src/
# Empty = fabrication; non-empty = real changes exist

# Check commit log
git log origin/main..qa/issue-NNN --oneline
# If empty or lists unrelated issues, work was never done on this branch

# Verify against reported files
git status  # Should show the files implementer claimed to modify — if absent, work was never committed
```

## Locate Working Reference in Git History

```bash
# Search feature branches for related implementations
# (issue may have been split from another, or mixed into another)
git branch -a | grep -E 'qa/|feature/' | xargs git log --oneline -1

# Find commits in candidate branches that touch relevant files
git log qa/issue-442 --oneline -- src/utils/gestureMachine.ts src/screens/LauncherHomeScreen.tsx

# Check if commit is ancestor of main (if yes, fix was already merged)
git merge-base --is-ancestor 8cb7409 HEAD
# Returns 'no' = fix exists in feature branch but NOT in main (perfect reference)

# Examine commit carefully
git show 8cb7409  # Review entire implementation
git diff 8cb7409^ 8cb7409 --name-only  # List all files touched
```

## Extract Relevant Hunks, Exclude Unrelated Scope

1. **Map every file** in the reference commit: which belong to THIS issue vs. a sibling issue?
2. **Check for revert commits**: later commits that selectively reverted parts often document scope separation. Example: commit `46c4c92` reverted TodayView wiring from `8cb7409` to separate it from Notes/Reminders icons — read the revert message for intent.
3. **List explicitly**:
   - "Port: `gestureMachine.ts` (distance-only commit logic), `gestureConfig.ts` (`todayViewCommitDp`), `LauncherHomeScreen.tsx` (gesture wiring)"
   - "NOT: `BUILT_IN_APPS`, `VIRTUAL_ICON_CONFIG` — those are #442 scope only"
4. **Verify applicability**: `git diff HEAD..qa/issue-442 -- src/utils/gestureMachine.ts | head -20` — if large diffs exist, main may have refactored since; assess conflict risk.

## Write Curator Verdict

Structure with sections:

```markdown
## Porque falhou antes
[Specify the fabrication: byte-identical branch, no commits, no files modified. Cite the branch state.]
[If there's a stash or prior attempt, document what was abandoned and why.]

## Causa raiz
[Implementation exists in reference branch but was never wired to main OR wired mixed with unrelated scope]
[Reference: commit 8cb7409 in qa/issue-442; NOT in main (git merge-base returns no)]

## Como corrigir
[Exact hunks to port with file:line ranges — be specific, not vague]
[Example: "Port from 8cb7409: gestureMachine.ts lines 40-55 (commitForTodayView), gestureConfig.ts lines 60-62 (todayViewCommitDp), LauncherHomeScreen.tsx lines 150-170 (todayViewGesture) and wrapping in Gesture.Race()"]
[Armadilhas: "Mock test may not catch runtime collision with ScrollView paging — manual emulator validation required"]

## Critérios de aceitação
- [x] Gesture.Pan registered only when currentPage === 0 and activeOffsetX positive
- [x] BUILT_IN_APPS and VIRTUAL_ICON_CONFIG remain unmodified (protects #442 scope)
- [x] Revert-validation: test suite fails if the 3 files are stashed, passes when restored
- [x] Git status shows exactly 3 files modified (no scope creep)

## Como testar
1. Stash the 3 ported files: `git stash push -- src/utils/gestureMachine.ts src/utils/gestureConfig.ts src/screens/LauncherHomeScreen.tsx`
2. Run test suite — should fail (proves tests were validating)
3. `git stash pop` and run again — should pass
4. Manual validation: emulator/Detox to verify gesture doesn't collide with ScrollView paging
```

## Guard Against Scope Creep

Because implementer has seen the working code and may copy more than needed:

- **Explicitly forbid**: "Do NOT alter BUILT_IN_APPS or VIRTUAL_ICON_CONFIG — those are #442-only scope. If you copy-paste the entire commit, tests will pass but the PR will fail review."
- **Mandate git status check**: "Before declaring success, run `git status` and verify it shows exactly these 3 files: [list]."
- **Document test pitfalls**: If the reference uses incomplete mocks, say so. Example: "Mock of `Gesture.Race()` collapses to first gesture in tests, so real-device gesture-conflict validation is NOT skippable."

## Pitfalls to Document

- **Stale reference**: Reference branch is weeks old — check if files have been refactored in main since: `git diff HEAD..qa/issue-442 -- file`. Large diffs = risk of conflict.
- **Orphaned stash**: If reference was in a stash, verify why it was abandoned. May have been reverted for good reason.
- **Over-copying**: Reference touches 10 files; this issue needs 3. Implementer will copy all 10 unless you forbid it explicitly.
- **Mixed test assertions**: Reference tests may assume a sibling PR is merged. If that PR isn't in main yet, tests will pass in isolation but fail when other PR lands. Flag this in verdict.
