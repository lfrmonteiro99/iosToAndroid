#!/bin/bash
# setup.sh — one-off: create the qa:* labels and put the existing backlog in the
# queue. Idempotent; safe to re-run.
#
# Usage:
#   setup.sh --labels          only create the labels
#   setup.sh --seed            only enqueue open issues (qa:ready)
#   setup.sh --seed --dry-run  show what would be enqueued
#   setup.sh                   both
#
# Seeding targets every OPEN issue that has no qa:* label yet. Issues labelled
# `epic` are skipped: they are containers, not units of work, and dispatching an
# implementer at one produces either a giant PR or an immediate `blocked`.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"
ROLE="setup"

DO_LABELS=0
DO_SEED=0
DRY=0
SKIP_LABELS="${TEAM_SEED_SKIP_LABELS:-epic}"

while [ $# -gt 0 ]; do
  case "$1" in
    --labels) DO_LABELS=1; shift ;;
    --seed) DO_SEED=1; shift ;;
    --dry-run) DRY=1; shift ;;
    *) shift ;;
  esac
done
if [ "$DO_LABELS" = "0" ] && [ "$DO_SEED" = "0" ]; then DO_LABELS=1; DO_SEED=1; fi

# ── Labels ─────────────────────────────────────────────────────────────────
if [ "$DO_LABELS" = "1" ]; then
  # `gh label create` fails when the label exists; --force updates it instead.
  mklabel() {
    gh label create "$1" --repo "$REPO" --color "$2" --description "$3" --force >/dev/null 2>&1 \
      && log "label ok: $1" || warn "label falhou: $1"
  }
  mklabel "$L_TRIAGE"       "FBCA04" "Na fila para análise do curator (entrada manual)"
  mklabel "$L_READY"        "0E8A16" "Na fila do implementador"
  mklabel "$L_WIP"          "1D76DB" "Implementador a trabalhar"
  mklabel "$L_REVIEW"       "5319E7" "PR aberto, à espera do reviewer"
  mklabel "$L_DONE"         "CCCCCC" "Integrado e fechado pelo pipeline"
  mklabel "$L_BLOCKED_IMPL" "D93F0B" "Devolvido ao implementador (problema de código)"
  mklabel "$L_BLOCKED_SPEC" "B60205" "Devolvido ao curator (enunciado por analisar)"
  mklabel "$L_HUMAN"        "000000" "O pipeline desistiu; precisa de decisão humana"
fi

# ── Seed ───────────────────────────────────────────────────────────────────
if [ "$DO_SEED" = "1" ]; then
  JSON=$(gh issue list --repo "$REPO" --state open --limit 300 \
         --json number,title,labels 2>/dev/null) \
    || { warn "não consegui listar os issues"; exit 1; }
  printf '%s' "$JSON" | jq -e 'type == "array"' >/dev/null 2>&1 \
    || { warn "resposta inesperada da API — não sigo"; exit 1; }

  # Two lists, because "skipped because it is an epic" and "skipped because it is
  # already in the pipeline" are different facts and both are worth printing.
  MAPFILE=$(printf '%s' "$JSON" | jq -r --arg skip "$SKIP_LABELS" '
    ($skip | split(",")) as $sk
    | .[]
    | . as $i
    | ([$i.labels[].name]) as $ns
    | (if   ($ns | map(startswith("qa:")) | any)   then "HAS_STATE"
       elif (($ns - ($ns - $sk)) | length) > 0     then "SKIP"
       else "SEED" end) as $verd
    | "\($verd)\t\($i.number)\t\($i.title)"')

  N_SEED=0; N_SKIP=0; N_STATE=0
  while IFS=$'\t' read -r verd num title; do
    [ -n "${num:-}" ] || continue
    case "$verd" in
      SEED)
        N_SEED=$((N_SEED + 1))
        if [ "$DRY" = "1" ]; then
          echo "  + #$num  $title"
        else
          gh issue edit "$num" --repo "$REPO" --add-label "$L_READY" >/dev/null 2>&1 \
            && log "#$num -> $L_READY" || warn "#$num falhou"
          # Gentle: 42 edits back-to-back is a good way to meet a secondary rate limit.
          sleep 1
        fi
        ;;
      SKIP)  N_SKIP=$((N_SKIP + 1));  [ "$DRY" = "1" ] && echo "  - #$num  ($SKIP_LABELS) $title" ;;
      HAS_STATE) N_STATE=$((N_STATE + 1)) ;;
    esac
  done <<< "$MAPFILE"

  echo
  log "para a fila: $N_SEED    ignorados ($SKIP_LABELS): $N_SKIP    já no pipeline: $N_STATE"
  [ "$DRY" = "1" ] && log "(--dry-run: nada foi alterado)"
fi
