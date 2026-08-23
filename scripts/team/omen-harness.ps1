# omen-harness.ps1 — isolated, tmux-free pipeline worker for Windows (OMEN).
#
# Design rules (do NOT touch the shared lib.sh — both boxes source it):
#   * Runs natively on Windows via git-bash + hermes CLI (Python, no WSL).
#   * Shares the SAME GitHub queue as the Linux box: reads `sonnet-ready`/`haiku-ready`
#     issues, implements on `qa/issue-N`, pushes, opens PR. The Linux orchestrator
#     owns dispatch/cycle logic; this is a *peer worker* that claims one issue at a
#     time straight from GitHub.
#   * PID file locking via tasklist/taskkill /T (no flock/setsid — those don't exist
#     on native Windows).
#   * IMPORTANT: OMEN shares the SAME Nous account as Linux (credential_pool id ffad33).
#     Two pipelines hammering one Nous-free rate limit only triples 429s. This harness
#     is therefore DORMANT until you give the OMEN hermes its OWN credentials
#     (a separate Nous account, or a paid key: DeepSeek/OpenAI). Flip $ENABLED to $true
#     only after that.
#
# All tunables live at the top in the CONFIG block — no magic values buried in the
# worker logic. Edit here, not in the functions below.
#
# Usage (run from git-bash on OMEN, or schedule via Task Scheduler):
#   powershell -File omen-harness.ps1          # one-shot: claim + implement 1 issue
#   powershell -File omen-harness.ps1 -Loop     # keep polling every $CYCLE_SLEEP_S
#
# Prereqs on OMEN:
#   * git-bash at C:\Program Files\Git\bin\bash.exe
#   * hermes on PATH (or set $HERMES_BIN)
#   * gh authenticated (gh auth status) against lfrmonteiro99/iosToAndroid
#   * repo cloned at $REPO_LOCAL

param(
  [switch]$Loop,
  [int]$MaxRuns = 0          # 0 = unlimited when -Loop
)

# ── CONFIG ────────────────────────────────────────────────────────────────
$ENABLED         = $false        # SEE NOTE ABOVE — set $true only with OMEN-own creds
$REPO            = "lfrmonteiro99/iosToAndroid"
$REPO_LOCAL      = "$env:USERPROFILE\iosToAndroid"
$HERMES_BIN      = "hermes"      # resolves via git-bash PATH; override if needed
$HERMES_MODEL    = "tencent/hy3:free"
$HERMES_PROV     = "nous"
$WT_ROOT         = "$env:USERPROFILE\iostoandroid-wt"
$STATE_DIR       = "$env:USERPROFILE\iostoandroid-verdicts\state"
$CYCLE_SLEEP_S   = 60
$LOCK_FILE       = "$env:TEMP\omen-harness.lock"
$LOG_FILE        = "$env:TEMP\omen-harness.log"
$BASH            = "C:\Program Files\Git\bin\bash.exe"
# Labels this worker is allowed to claim. Prefer haiku-ready (weak engine can land it).
$CLAIM_LABELS    = @('haiku-ready', 'sonnet-ready')

# ── Helpers ────────────────────────────────────────────────────────────────
function Log($msg) {
  $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  "$ts [$PID] $msg" | Tee-Object -FilePath $LOG_FILE -Append
}

function Bash($script) {
  # Run a bash snippet via git-bash, return stdout (trimmed).
  $out = & $BASH -lc $script 2>&1
  return ($out -join "`n").Trim()
}

# Escape a string for safe single-quote embedding inside a bash -c argument.
# Strategy: wrap in single quotes and escape any embedded single quote as '\''.
function BashEsc($s) {
  "'" + ($s -replace "'", "'\''") + "'"
}

function LockHeld() {
  if (-not (Test-Path $LOCK_FILE)) { return $false }
  $oldpid = (Get-Content $LOCK_FILE -ErrorAction SilentlyContinue).Trim()
  if (-not $oldpid) { return $false }
  # tasklist returns non-zero exit when the PID is not found
  $found = tasklist /FI "PID eq $oldpid" 2>$null | Select-String "\b$oldpid\b"
  if ($found) { return $true }
  # stale lock
  Remove-Item $LOCK_FILE -Force -ErrorAction SilentlyContinue
  return $false
}

function TakeLock() {
  Set-Content -Path $LOCK_FILE -Value $PID -NoNewline
}

function ReleaseLock() {
  Remove-Item $LOCK_FILE -Force -ErrorAction SilentlyContinue
}

# ── Pick an issue (prefer haiku-ready so the weak engine can actually land it) ──
function PickIssue() {
  $json = Bash "gh issue list --repo '$REPO' --label qa:ready --state open --limit 100 --json number,labels,title"
  if (-not $json) { return $null }
  try {
    $issues = $json | ConvertFrom-Json
  } catch {
    Log "FALHA: gh issue list devolveu JSON invalido"
    return $null
  }
  # Prefer haiku-ready first, then sonnet-ready
  foreach ($label in $CLAIM_LABELS) {
    $sel = $issues | Where-Object { ($_.labels.name -contains $label) } | Select-Object -First 1
    if ($sel) { return $sel.number }
  }
  return $null
}

function SetState($num, $label) {
  Bash "gh issue edit $num --add-label '$label' >/dev/null 2>&1 || true"
}

function RemoveState($num, $label) {
  Bash "gh issue edit $num --remove-label '$label' >/dev/null 2>&1 || true"
}

function Implement($num) {
  Log "implementing #$num"
  $wt = "$WT_ROOT\implement-$num"
  # Fresh worktree off main
  Bash "cd '$REPO_LOCAL' && git fetch origin main -q && git worktree remove '$wt' --force 2>/dev/null; git worktree add -b qa/issue-$num '$wt' origin/main 2>&1 | tail -3"
  if (-not (Test-Path $wt)) { Log "FALHA: worktree nao criado para #$num"; return $false }

  # Title + body, separated by a "---" line. Two simple gh calls — far less
  # error-prone than embedding newlines inside a jq --jq string under PowerShell.
  $title = Bash "gh issue view $num --json title --jq '.title'"
  $body  = Bash "gh issue view $num --json body  --jq '.body'"
  $brief = "$title`n---`n$body"

  # Run hermes implementer inside the worktree. Use a plan+code prompt.
  $prompt = @"
You are an implementer in a QA pipeline. Implement issue #$num for the React-Native iOS-clone repo at $wt.

ISSUE:
$brief

Rules:
- Work only inside $wt. Make the minimal, focused change that satisfies the issue.
- Do NOT refactor unrelated code. One issue = one change.
- Run `cd $wt && npm ci >/dev/null 2>&1; npx tsc --noEmit` and fix type errors you introduced.
- When done, commit (`git add -A && git commit -m "feat(#$num): ..."`), then `git push -u origin qa/issue-$num`.
- Then open a PR: `gh pr create --base main --head qa/issue-$num --title "..." --body "..."`.
- Leave a comment on the issue summarizing what changed.
- If the issue is too large or blocked, STOP and comment 'BLOCKED: <reason>' instead of partial work.
"@

  $escPrompt = BashEsc $prompt
  $out = Bash "cd '$wt' && $HERMES_BIN --provider $HERMES_PROV --model $HERMES_MODEL -p $escPrompt 2>&1 | tail -40"
  Log "hermes output (tail):`n$out"

  # Did we push a branch + open PR?
  $pr = Bash "gh pr list --repo '$REPO' --head 'qa/issue-$num' --state open --json number --jq '.[0].number // empty'"
  if ($pr) {
    Log "#$num -> PR #$pr aberto"
    SetState $num "qa:review"
    return $true
  } else {
    Log "#$num -> sem PR (verdict vazio ou falhou)"
    return $false
  }
}

# ── MAIN ──────────────────────────────────────────────────────────────────
if (-not $ENABLED) {
  Log "HARNESS DORMANTE: OMEN partilha a conta Nous do Linux (ffad33). Nao aumenta throughput; so concorre pelo mesmo rate limit. Define `$ENABLED=`$true so depois de dares credenciais PROPRIAS ao hermes do OMEN (outra conta Nous / DeepSeek paga / OpenAI)."
  exit 0
}

if (LockHeld) { Log "lock detido por outro processo — saio"; exit 0 }
TakeLock
try {
  $runs = 0
  do {
    $num = PickIssue
    if (-not $num) {
      Log "sem issues elegiveis agora — espero $CYCLE_SLEEP_S`s"
      Start-Sleep $CYCLE_SLEEP_S
      $runs++
      continue
    }
    SetState $num "qa:wip"
    $ok = Implement $num
    if (-not $ok) {
      # release the wip so the Linux box can retry; do not loop forever on it
      RemoveState $num "qa:wip"
      Log "#$num libertado (qa:wip removido) para re-tentativa"
    }
    $runs++
    if ($Loop -and ($MaxRuns -gt 0) -and ($runs -ge $MaxRuns)) { break }
    if ($Loop) { Start-Sleep $CYCLE_SLEEP_S }
  } while ($Loop)
} finally {
  ReleaseLock
}
Log "terminado"
