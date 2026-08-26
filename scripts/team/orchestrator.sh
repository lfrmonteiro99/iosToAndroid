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
# PARALELISMO: N implementadores, o tecto é a MEMÓRIA.
#
# Já não é "um agente do caminho de escrita de cada vez". Cada role corre no seu
# SLOT, com o seu lock, o seu worktree e o seu issue — e enquanto houver memória
# livre o despachante enche mais um slot. Ver launch_implementers_if_needed
# (implementadores), launch_reviewers_if_needed (reviewers) e o orçamento de
# memória em lib.sh.
#
# Três coisas mantêm N agentes fora do caminho uns dos outros:
#   * slot próprio (TEAM_SLOT=implN/revN/curator) -> lock próprio no run-agent.sh;
#   * trabalho diferente por construção: quem despacha RESERVA (claim_issue /
#     claim_pr) e o registo de agentes vivos (inflight_*) sobrevive ao ciclo;
#   * worktree próprio por issue/PR, criado pelo role.
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

# PID FILE — é isto que o `start.sh --status` lê.
#
# O status decidia por `tmux has-session`, e a pane fica parqueada num `read -r`
# depois de este processo sair: a sessão sobrevive ao processo e o status jurava
# "a correr" com a fila parada há horas. Escrito aqui e não no supervisor porque
# assim o modo batch (--once, --issue) também fica visível.
ORCH_PID_FILE="$STATE_DIR/orchestrator.pid"
echo "$$" > "$ORCH_PID_FILE" 2>/dev/null || true
# Só apaga se o ficheiro ainda for NOSSO: em modo supervisionado o processo
# seguinte já lá escreveu o dele quando este trap corre, e apagá-lo às cegas
# deixava o status a dizer "parado" com o orquestrador vivo.
trap '[ "$(cat "$ORCH_PID_FILE" 2>/dev/null)" = "$$" ] && rm -f "$ORCH_PID_FILE"' EXIT

REVIEWED_STATE="$STATE_DIR/reviewed-shas"
touch "$REVIEWED_STATE" 2>/dev/null || true

# ── Quantos implementadores ────────────────────────────────────────────────
#
# TEAM_IMPLEMENTERS é um TECTO DURO, não um alvo: o número real de agentes vivos
# é decidido ciclo a ciclo pela memória livre (mem_room_for_agent, em lib.sh).
# Serve só para limitar o disparate — 20 worktrees com `npm ci` cada não cabem em
# lado nenhum, por muita RAM que o /proc diga que há.
#
# Antes disto o tecto era 2 e estava escrito no código: o slot `main` mais o slot
# `hermes`, ligado à mão com TEAM_HERMES=1. Passa a ser uma lista de slots
# `impl1..implN`, todos iguais, cada um com o seu motor.
TEAM_IMPLEMENTERS="${TEAM_IMPLEMENTERS:-6}"

# Motores dos slots, por ordem, ciclada até encher os slots. Vazio = default:
#   * TEAM_HERMES=1 -> "claude,hermes" (alterna, para não gastar a subscrição
#     Claude toda de uma vez: N implementadores Claude partilham UMA quota, e
#     quando ela seca secam todos ao mesmo tempo);
#   * senão -> só claude, que era o comportamento antes de existirem slots.
TEAM_IMPL_ENGINES="${TEAM_IMPL_ENGINES:-}"

declare -a IMPL_ENGINES=()

build_impl_roster() {
  local spec="$TEAM_IMPL_ENGINES" e i
  local -a raw=()
  if [ -z "$spec" ]; then
    if [ "${TEAM_HERMES:-0}" = "1" ]; then spec="claude,hermes"; else spec="claude"; fi
  fi
  IFS=',' read -r -a raw <<< "$spec"
  [ "${#raw[@]}" -gt 0 ] || raw=(claude)
  local warned_hermes=0 warned_alibaba=0
  for (( i=0; i<TEAM_IMPLEMENTERS; i++ )); do
    e="${raw[$(( i % ${#raw[@]} ))]}"
    e="${e// /}"
    if [ "$e" = "hermes" ] && ! hermes_available; then
      [ "$warned_hermes" = "0" ] && { log "hermes pedido mas não encontrei o binário — esses slots vão de claude"; warned_hermes=1; }
      e="claude"
    fi
    # Valida CONFIGURAÇÃO, não estado: um pool com chave mas em cooldown mantém
    # o slot (o impl_engine_now decide à hora, e o slot é saltado em cooldown).
    # Sem chave é que o slot degrada — ruidoso, nunca 77 silencioso (padrão hermes).
    if [ "$e" = "alibaba" ] && ! alibaba_configured; then
      [ "$warned_alibaba" = "0" ] && { log "alibaba pedido mas o pool não está configurado (ALIBABA_API_KEY sk-sp- em falta ou TEAM_USE_ALIBABA=0) — esses slots vão de claude"; warned_alibaba=1; }
      e="claude"
    fi
    [ -n "$e" ] || e="claude"
    IMPL_ENGINES+=("$e")
  done
  log "slots de implementação: $TEAM_IMPLEMENTERS (${IMPL_ENGINES[*]}), tecto real = memória"
  hermes_available && log "hermes disponível ($(hermes_bin)) — assume os slots enquanto a subscrição Claude estiver esgotada"
  if alibaba_configured; then
    local extra=""
    alibaba_exhausted && extra=" — EM COOLDOWN (~$(( $(alibaba_cooldown_remaining) / 60 ))min)"
    log "pool alibaba configurado (base=$TEAM_ALIBABA_BASE_URL) — rung de overflow + slots próprios$extra"
  fi
}

# ── Motor de AGORA, não motor de arranque ──────────────────────────────────
#
# O roster diz a preferência; isto diz o que corre neste instante. Enquanto a
# subscrição Claude está esgotada, TODOS os slots vão de hermes — é um motor com
# quota própria e o único que continua a produzir. Quando o cooldown expira, a
# mesma função volta a devolver claude e o ciclo seguinte já arranca em claude,
# sem intervenção.
#
# Porque não simplesmente deixar cair no fallback Ollama: o fallback é um DEGRAU
# de degradação (modelo mais fraco, sem visão), o hermes é um par. Medido no
# 2026-08-19: 47 corridas contra uma quota Ollama semanal esgotada, todas a zero.
# Preferir o hermes quando ele existe é preferir um motor que ainda tem quota.
# O GATILHO NÃO PODE SER SÓ O COOLDOWN.
#
# A primeira versão só trocava para hermes quando a subscrição reportava
# esgotamento. Mas se o binário do claude nem se resolve, esse relatório nunca
# chega — foi exactamente o que aconteceu: 1069 despachos sem um único agente a
# correr, com o hermes disponível ao lado e nunca usado. "Claude indisponível"
# tem mais causas do que "sem quota", e todas elas querem o mesmo: hermes.
impl_engine_now() {
  local want="$1"
  if [ "$want" = "hermes" ]; then
    hermes_available && echo hermes || echo claude
    return 0
  fi
  # Slot dedicado ao pool alibaba: corre quando o pool está disponível; em
  # cooldown/esgotado degrada para a lógica claude (nunca decide sozinho que
  # "queima claude é igual" — a preferência alibaba→hermes→claude abaixo é só
  # para slots que QUEREM claude).
  if [ "$want" = "alibaba" ]; then
    if alibaba_available; then echo alibaba; return 0; fi
    # pool seco/indisponível: cai para a decisão normal de claude/hermes
  fi
  if ! claude_available; then
    if alibaba_available; then echo alibaba; return 0; fi
    if hermes_available; then echo hermes; return 0; fi
    echo claude; return 0
  fi
  if [ "$(cooldown_remaining)" -gt 0 ]; then
    if alibaba_available; then echo alibaba; return 0; fi
    if hermes_available; then echo hermes; return 0; fi
  fi
  echo claude
}

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
# Janela de idade: REMOVIDA. A pipeline pega em TODOS os issues qa:* abertos,
# independentemente da idade. A ordem de prioridade (ver issues_with) é quem
# decide a sequência — os mais novos já tinham prioridade via ordenação, não
# através de exclusão dos antigos.
refresh_issue_cache() {
  local json
  json=$(gh issue list --repo "$REPO" --state open --limit 300 \
         --json number,labels,createdAt 2>/dev/null) || return 1
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
# ── Reserva de issues ─────────────────────────────────────────────────────
#
# Com dois implementadores a corrida era evitada por aritmética: o Claude levava
# o índice 0 da fila e o Hermes o índice 1. Isso não escala e nunca foi sólido —
# o cache de issues é lido uma vez por ciclo, o `qa:wip` só aparece segundos
# depois do despacho, e no modo fallback os filtros de degradação fazem o índice
# 0 cair num issue que já é de outro.
#
# Passa a haver reserva explícita, com as duas guardas do claim_pr:
#   * CLAIMED_ISSUES_THIS_CYCLE, para a janela entre despachar e o implement.sh
#     marcar qa:wip;
#   * o registo de agentes vivos (inflight), que atravessa ciclos e é PID, logo
#     não deixa reservas obsoletas para trás.
CLAIMED_ISSUES_THIS_CYCLE=""

claim_issue() { CLAIMED_ISSUES_THIS_CYCLE="$CLAIMED_ISSUES_THIS_CYCLE $1"; }

issue_claimed() {
  case " $CLAIMED_ISSUES_THIS_CYCLE " in *" $1 "*) return 0 ;; esac
  inflight_active "implement-$1"
}

first_with() {
  local n first_any="" fb=0
  on_fallback && fb=1

  while IFS= read -r n; do
    [ -n "$n" ] || continue
    is_deferred "$n" && continue
    issue_claimed "$n" && continue
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

# Primeiro issue livre de uma label, SEM os filtros de degradação da subscrição.
#
# Substitui o antigo nth_with (que distribuía por índice — ver o comentário da
# reserva acima). Para motores próprios como o hermes: não estão sujeitos ao
# cooldown da subscrição Claude, portanto os filtros do first_with não se lhes
# aplicam.
next_free_with() {
  local n
  while IFS= read -r n; do
    [ -n "$n" ] || continue
    is_deferred "$n" && continue
    issue_claimed "$n" && continue
    echo "$n"; return 0
  done < <(issues_with "$1")
  return 0
}

# O selector certo para o motor do slot.
# claude e alibaba correm pela escada completa (rung claude → rung alibaba →
# guards → ollama), por isso ambos usam first_with. Nota de semântica: os
# filtros de degradação (next_free_with) só activam via on_fallback(), que
# também exige ollama não-esgotado — com ollama em cooldown de 6h e claude
# seco, slots alibaba correm sem filtro e podem apanhar issues "envenenados";
# o circuit breaker de defer absorve isso.
next_issue_for() {
  local label="$1" engine="$2"
  if [ "$engine" = "claude" ] || [ "$engine" = "alibaba" ]; then first_with "$label"; else next_free_with "$label"; fi
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
# ── Reserva em voo de um PR ────────────────────────────────────────────────
#
# mark_reviewed so corre DEPOIS do veredicto, e de proposito: marcar antes foi o que
# encalhou os PRs #324/#333/#338/#342, porque um review sem veredicto gravava o sha e
# o pick_pr nunca mais olhava para eles. Nao mexo nesse invariante.
#
# Mas com um reviewer DESTACADO a levar ~5.6 min, o pick_pr devolvia o mesmo PR
# durante ~7 ciclos e o slot main comecava a rever o que o rev2 ja estava a rever —
# dois merges do mesmo PR.
#
# A reserva resolve isso com DUAS guardas, porque uma so nao chega:
#
#   * ficheiro $LOCK_PREFIX.<slot>.pr com o numero do PR, valido SO enquanto o lock
#     desse slot estiver tomado. A autoridade e o flock, nao o ficheiro: o SO
#     liberta-o na morte do processo, logo nao ha reservas obsoletas para limpar.
#   * CLAIMED_THIS_CYCLE, para a janela de segundos entre o orquestrador escrever a
#     reserva e o review.sh tomar o lock la dentro — nessa janela o lock esta livre e
#     a reserva sozinha pareceria obsoleta.
CLAIMED_THIS_CYCLE=""

claim_pr() {
  local slot="$1" pr="$2"
  echo "$pr" > "$LOCK_PREFIX.$slot.pr" 2>/dev/null || true
  CLAIMED_THIS_CYCLE="$CLAIMED_THIS_CYCLE $pr"
}

pr_claimed() {
  local pr="$1" f slot held
  case " $CLAIMED_THIS_CYCLE " in *" $pr "*) return 0 ;; esac
  # Terceira guarda, e a mais fiável: há um review.sh vivo neste PR. Cobre a
  # janela em que o reviewer ainda está a preparar o worktree e portanto ainda
  # não tomou o lock do run-agent.sh.
  inflight_active "review-$pr" && return 0
  for f in "$LOCK_PREFIX".*.pr; do
    [ -f "$f" ] || continue
    [ "$(cat "$f" 2>/dev/null)" = "$pr" ] || continue
    slot=${f#"$LOCK_PREFIX."}; slot=${slot%.pr}
    # lock tomado => ha de facto um reviewer vivo neste PR. Livre => reserva obsoleta.
    if ! flock -w 0 -n "$LOCK_PREFIX.$slot.lock" true 2>/dev/null; then
      return 0
    fi
  done
  return 1
}

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
    # Ja ha um reviewer vivo neste PR (ver pr_claimed).
    pr_claimed "$num" && continue
    if ! grep -qxF "$num $sha" "$REVIEWED_STATE" 2>/dev/null; then
      echo "$num"; return 0
    fi
  done <<< "$list"
  return 0
}

# QUEM MARCA A SHA REVISTA É O review.sh, não isto.
#
# Era aqui, e o preço era a review do slot principal ter de ser BLOQUEANTE — o
# ciclo não podia avançar sem saber se houve veredicto. Media-se em 2 ciclos por
# 7 minutos, com 9GB livres e 5 slots de implementação vazios à espera de uma
# review de 6 minutos. O invariante ("só um veredicto real marca a sha") não se
# perdeu: mudou para dentro de quem o pode afirmar.
#
# Aqui fica só o corte da lista, que tem de ser feito por UM processo. Com N
# reviewers a escrever em paralelo, um `tail > tmp && mv` dentro de cada um
# apagava as linhas dos outros.
trim_reviewed_state() {
  local n
  n=$(grep -c . "$REVIEWED_STATE" 2>/dev/null || echo 0)
  [ "${n:-0}" -gt 400 ] || return 0
  tail -300 "$REVIEWED_STATE" > "$REVIEWED_STATE.tmp" 2>/dev/null \
    && mv "$REVIEWED_STATE.tmp" "$REVIEWED_STATE"
}

# ── Stale cleanup ──────────────────────────────────────────────────────────
# Nothing survives from one cycle to the next. An inherited verdict makes an agent
# report the PREVIOUS run's work as its own.
# A GUARDA É POR TRABALHO, NÃO POR SLOT.
#
# A versão anterior limpava tudo desde que o slot `main` estivesse livre, com uma
# excepção pregada à mão para o hermes. Duas coisas estavam mal, e a segunda
# destruiu trabalho real:
#
#   * o flock não diz se um role está vivo. Só é tomado dentro do run-agent.sh,
#     no FIM do implement.sh — antes disso há set_state, comentário no issue,
#     worktree e `npm ci`. Nessa janela de minutos o slot parece livre.
#   * o worktree era removido incondicionalmente. Foi o #442: o agente reportou
#     que o worktree lhe foi "recriado pelo menos 2 vezes", perdeu os edits, não
#     chegou a commitar, e o issue voltou a qa:ready num ciclo infinito.
#
# Com N slots isso deixaria de ser uma janela e passaria a ser o caso normal —
# há sempre alguém a aquecer. Portanto a decisão é tomada ITEM A ITEM contra o
# registo de agentes vivos (PID), que é o mesmo nome para o worktree e para o
# veredicto: `implement-142`, `review-517`, `curator-99`.
cleanup_stale() {
  local f tag wt pgidfile pgid slot

  # Veredictos órfãos: um veredicto cujo agente já não existe é o que faz o
  # próximo agente reportar o trabalho do anterior como seu.
  for f in "$VERDICT_DIR"/*.json; do
    [ -f "$f" ] || continue
    tag=$(basename "$f" .json)
    inflight_active "$tag" && continue
    rm -f "$f" 2>/dev/null || true
  done

  # Árvores de processos abandonadas, slot a slot. O flock chega aqui: se está
  # livre E não há registo vivo neste slot, o pgid que ficou é órfão.
  for pgidfile in "$LOCK_PREFIX".*.lock.pgid; do
    [ -f "$pgidfile" ] || continue
    slot=${pgidfile#"$LOCK_PREFIX."}; slot=${slot%.lock.pgid}
    inflight_slot_active "$slot" && continue
    flock -w 0 -n "$LOCK_PREFIX.$slot.lock" true 2>/dev/null || continue
    pgid=$(cat "$pgidfile" 2>/dev/null || echo "")
    if [ -n "$pgid" ] && kill -0 -"$pgid" 2>/dev/null; then
      log "stale: a matar a árvore do agente do slot $slot (pgid $pgid)"
      kill -TERM -"$pgid" 2>/dev/null || true
      sleep 2
      kill -KILL -"$pgid" 2>/dev/null || true
    fi
    rm -f "$pgidfile"
  done

  # Worktrees sem agente vivo.
  for wt in "$WT_ROOT"/implement-* "$WT_ROOT"/review-* "$WT_ROOT"/curator-*; do
    [ -e "$wt" ] || continue
    tag=$(basename "$wt")
    inflight_active "$tag" && continue
    log "stale: a remover worktree $tag"
    wt_remove "$wt"
  done
  git -C "$TEAM_ROOT" worktree prune 2>/dev/null || true
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
#
# "SEM AGENTE VIVO" É POR ISSUE, NÃO PELO LOCK GLOBAL.
#
# Isto testava um único lock (`main`) e, se estivesse livre, declarava órfãos
# TODOS os issues em qa:wip. Com um implementador bloqueante era quase verdade.
# Com N implementadores destacados é falso quase sempre — o lock `main` fica
# livre assim que o review acaba, e cada implementador vivo tem o seu issue em
# qa:wip sem PR ainda (o PR só aparece no fim). O resgate devolvia-os a qa:ready
# e o ciclo seguinte lançava um SEGUNDO implementador sobre trabalho em curso:
# dois agentes, dois worktrees, o mesmo branch, e o que o segundo faz `push
# --force` por cima do primeiro.
#
# A pergunta certa é sobre AQUELE issue, e a resposta está no registo de agentes
# vivos.

# ── Resolver trivial de conflitos de version-bump ───────────────────────────
#
# O auto-release bumpa o `package.json`/`app.json`/`package-lock.json` a cada
# merge, e branches que ficam para trás na fila apanham conflitos nesses três
# ficheiros — três ficheiros a que a implementação do branch quase nunca tocou.
# Sem isto, cada bump em conflito custa um ciclo completo de agent (worktree,
# npm install, resolver por intenção, push): 30-60s de quota só para escrever
# `git checkout --theirs package.json`.
#
# Só resolve o caso trivial: TODOS os ficheiros em conflito estão na allowlist
# ABAIXO **e** o branch, medido contra o merge-base, não tocou em nenhum deles.
# A segunda parte é o que evita perder trabalho legítimo — um branch que
# adicionou uma dependência tocou `package.json`, o guard falha, e o pipeline
# normal trata o conflito como sempre.
#
# Um sucesso salta directamente para qa:review, poupando o implementador todo.
BUMP_ALLOWLIST=(package.json app.json package-lock.json)

resolve_trivial_bump_conflicts() {
  local issue pr branch wt merge_base conflicted only_allowed real_touch
  for issue in $(issues_with "$L_BLOCKED_IMPL"); do
    branch="qa/issue-$issue"
    pr=$(gh pr list --repo "$REPO" --head "$branch" --base "$BASE_BRANCH" \
      --state open --json number,mergeable \
      --jq '.[0] | select(.mergeable == "CONFLICTING") | .number' \
      2>/dev/null || echo "")
    [ -n "$pr" ] || continue

    wt=$(wt_checkout "$branch" "resolve-$issue" 2>/dev/null) || continue
    git -C "$wt" fetch origin "$BASE_BRANCH" >/dev/null 2>&1 || true

    # Try the merge. A clean merge here means the CONFLICTING state was already
    # stale; still worth pushing so the pipeline advances.
    if git -C "$wt" merge --no-edit --no-ff "origin/$BASE_BRANCH" >/dev/null 2>&1; then
      git -C "$wt" push -u origin "$branch" --force-with-lease >/dev/null 2>&1 && {
        log "resolver: #$issue já mergável — só faltava sincronizar branch"
        set_state "$issue" "$L_REVIEW"
      }
      wt_remove "$wt"
      continue
    fi

    conflicted=$(git -C "$wt" diff --name-only --diff-filter=U 2>/dev/null || true)
    [ -n "$conflicted" ] || { git -C "$wt" merge --abort >/dev/null 2>&1 || true; wt_remove "$wt"; continue; }

    only_allowed=1
    while IFS= read -r f; do
      [ -n "$f" ] || continue
      case " ${BUMP_ALLOWLIST[*]} " in
        *" $f "*) ;;
        *) only_allowed=0; break ;;
      esac
    done <<< "$conflicted"

    if [ "$only_allowed" = 0 ]; then
      log "resolver: #$issue conflita fora da allowlist — passa ao implementador"
      git -C "$wt" merge --abort >/dev/null 2>&1 || true
      wt_remove "$wt"
      continue
    fi

    # Second guard: the branch's own changes to each bump file must be limited
    # to the `.version` (or `.expo.version` for app.json) JSON field. A branch
    # that added a real dependency has other fields differing from the base;
    # taking theirs would silently discard it. Compared semantically with jq
    # instead of by line, so pretty-print vs single-line JSON does not fool it.
    merge_base=$(git -C "$wt" merge-base HEAD "origin/$BASE_BRANCH" 2>/dev/null || echo "")
    real_touch=0
    for f in $conflicted; do
      local jq_filter
      case "$f" in
        app.json)          jq_filter='.expo.version = ""' ;;
        package.json|package-lock.json) jq_filter='(.. | objects | .version?) |= ""' ;;
        *)                 jq_filter='.' ;;
      esac
      local base_norm branch_norm
      base_norm=$(git -C "$wt" show "$merge_base:$f" 2>/dev/null | jq -S "$jq_filter" 2>/dev/null || true)
      branch_norm=$(git -C "$wt" show "HEAD:$f" 2>/dev/null | jq -S "$jq_filter" 2>/dev/null || true)
      if [ -z "$base_norm" ] || [ -z "$branch_norm" ] || [ "$base_norm" != "$branch_norm" ]; then
        real_touch=1
        log "resolver: #$issue tocou $f fora do campo version — não é trivial, passa ao implementador"
        break
      fi
    done
    if [ "$real_touch" = 1 ]; then
      git -C "$wt" merge --abort >/dev/null 2>&1 || true
      wt_remove "$wt"
      continue
    fi

    # Trivial case: take main's version of each bump file, commit, push.
    for f in $conflicted; do
      git -C "$wt" checkout --theirs -- "$f" >/dev/null 2>&1
      git -C "$wt" add -- "$f" >/dev/null 2>&1
    done
    if ! git -C "$wt" -c user.name="qa-resolver" -c user.email="qa@local" \
         commit --no-edit >/dev/null 2>&1; then
      warn "resolver: #$issue commit falhou — passa ao implementador"
      git -C "$wt" merge --abort >/dev/null 2>&1 || true
      wt_remove "$wt"
      continue
    fi

    if git -C "$wt" push -u origin "$branch" --force-with-lease >/dev/null 2>&1; then
      log "resolver: #$issue conflito trivial resolvido ($(echo "$conflicted" | tr '\n' ' '))"
      comment_issue "$issue" "## Orquestrador: conflito trivial de version-bump resolvido

Os únicos ficheiros em conflito eram do allowlist do auto-release
(\`${BUMP_ALLOWLIST[*]}\`) e este branch não os modificou. Foi feito
\`git checkout --theirs\` a cada, commit do merge e push — a rever, sem gastar
um implementador."
      set_state "$issue" "$L_REVIEW"
    else
      warn "resolver: #$issue push falhou — o pipeline normal trata"
    fi
    wt_remove "$wt"
  done
}

rescue_stuck_wip() {
  local issue pr
  for issue in $(issues_with "$L_WIP"); do
    inflight_active "implement-$issue" && continue   # está alguém a trabalhar nisto
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
# A PR IS ONLY "REVIEWED" IF IT WAS ACTUALLY JUDGED — e quem o afirma é o review.sh.
#
# mark_reviewed corria aqui, sem condição, e uma review que não produzia veredicto
# — quota esgotada, slot ocupado, motor morto — gravava a sha na mesma. O pick_pr
# só volta a rever um PR cuja head se MOVA, e nada empurra para o branch de um
# issue parado em qa:review: quatro PRs ficaram assim (#324, #333, #338, #342), o
# mais antigo catorze horas, com o quadro a dizer "em review". O #520 repetiu-o
# hoje, doze horas.
#
# Agora o review.sh marca a sha que reviu, e só depois de ler um veredicto; as
# saídas sem veredicto fazem exit 78 e não marcam nada.
#
# TODAS as reviews são destacadas, incluindo a do primeiro slot. Ver
# trim_reviewed_state para o que ficou deste lado.
# O REVIEWER TAMBEM PRECISA DE FAILOVER, e a falta dele custou 20 PRs.
#
# Os implementadores passaram a trocar para hermes quando o claude fica
# indisponivel (impl_engine_now). Os reviewers ficaram na escada
# claude -> ollama, e a 2026-08-21 as 13:15 as duas secaram ao mesmo tempo: a
# subscricao bateu no limite de sessao e a quota semanal do Ollama ja estava
# gasta. Resultado da assimetria: os implementadores continuaram a produzir na
# mesma e 16 PRs seguidos ficaram com "adiado apos 2 corridas sem veredicto".
# Uma fila de 20 PRs sem ninguem a julga-los.
#
# TRADE-OFF, assumido: o reviewer e o unico portao antes do main, e julgar em
# hermes e julgar com um motor que nunca foi medido neste papel. Mas a
# alternativa medida nao e "julgar melhor", e "nao julgar" — e um PR nao julgado
# fica aberto para sempre. O tier do modelo continua com piso em `med`.
# A ESCOLHA DO MOTOR ESTA NO review.sh, num sitio so. Ele tem de a fazer de
# qualquer maneira para o despacho manual (`--pr N`), e duas decisoes em dois
# ficheiros divergem — o log daqui diria `claude` enquanto o review corria em
# hermes.
dispatch_review() {
  local slot="$1" pr="$2"
  claim_pr "$slot" "$pr"
  log "REVIEWER $slot -> PR #$pr"
  TEAM_SLOT="$slot" \
    nohup bash "$SCRIPT_DIR/review.sh" "$pr" >> "$LOG_DIR/$slot-bg.log" 2>&1 &
  DISPATCHED_REVIEW=$((DISPATCHED_REVIEW + 1))
}

# Alvo explícito (`--pr N`): aí sim, em primeiro plano — quem pediu quer o
# resultado no terminal, não num ficheiro de log.
run_review() {
  claim_pr main "$1"
  log "REVIEWER (primeiro plano) -> PR #$1"
  bash "$SCRIPT_DIR/review.sh" "$1"
  local rc=$?
  [ "$rc" = "78" ] && log "PR #$1 não foi julgado (rc=78) — volta na próxima"
  return 0
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

  if inflight_slot_active curator \
     || ! flock -w 0 -n "$LOCK_PREFIX.curator.lock" true 2>/dev/null; then
    log "curator já a correr no seu slot — #$i espera a vez"
    return 0
  fi
  if ! mem_room_for_agent; then
    log "sem memória para o curator — $(mem_status)"
    return 0
  fi
  log "CURATOR (paralelo) -> #$i"
  nohup bash "$SCRIPT_DIR/curator.sh" "$i" >> "$LOG_DIR/curator-bg.log" 2>&1 &
}

# ── Implementadores: N slots, tecto de memória ─────────────────────────────
#
# TODOS os implementadores são destacados, incluindo o primeiro. Antes o slot
# `main` implementava de forma BLOQUEANTE: uma implementação leva ~27 min, e
# durante esses 27 min o ciclo não corria, logo nenhum outro slot era enchido.
# Acrescentar slots sem tirar o bloqueio dava paralelismo em rajadas — todos
# lançados no mesmo instante, e depois a máquina meia vazia à espera do mais
# lento. Destacados, cada slot que vaga é enchido no ciclo seguinte (~45s).
#
# O que decide quantos correm não é este tecto, é a memória: mem_room_for_agent
# conta a folga real e ainda desconta os agentes que estão a AQUECER (o pico é o
# `npm ci` e o jest, não o arranque), senão lançavam-se seis num minuto e o OOM
# aparecia cinco minutos depois. Ver lib.sh.
#
# Vai ANTES do review bloqueante e não mexe no DID: destacado mas em último seria
# a mesma ordem em série com mais maquinaria.
DISPATCHED_IMPL=0
DISPATCHED_REVIEW=0

# Rework primeiro, trabalho novo depois — a mesma ordem do despacho serial:
# acabar o que está começado vale mais do que começar mais.
pick_impl_target() {
  local engine="$1" i
  while :; do
    i=$(next_issue_for "$L_BLOCKED_IMPL" "$engine")
    [ -n "$i" ] || break
    if escalate_if_stuck "$i"; then
      log "#$i: rejeições até agora: $(attempts_of "$i") de $MAX_ATTEMPTS"
      echo "$i"; return 0
    fi
    # Redireccionado para o curator: reservado para não voltar a aparecer neste
    # ciclo (o cache de issues é deste ciclo e ainda diz blocked-impl).
    claim_issue "$i"
  done
  next_issue_for "$L_READY" "$engine"
}

launch_implementers_if_needed() {
  local n slot engine i

  for (( n=1; n<=TEAM_IMPLEMENTERS; n++ )); do
    slot="impl$n"
    want="${IMPL_ENGINES[$((n-1))]:-claude}"

    # Ocupado: ou tem um role vivo registado, ou o lock do run-agent está tomado.
    # As duas guardas, pela mesma razão que o inflight existe.
    inflight_slot_active "$slot" && continue
    flock -w 0 -n "$LOCK_PREFIX.$slot.lock" true 2>/dev/null || continue

    # Separação de quota: slot cujo engine configurado está em cooldown é
    # saltado — não o re-despachamos como claude todos os ciclos (queimava o
    # pool que se está a poupar) nem o despachamos para sair 77 de imediato.
    # O ciclo seguinte volta a avaliar; o pool retoma quando o cooldown expira.
    if [ "$want" = "alibaba" ] && ! alibaba_available; then
      continue
    fi

    engine=$(impl_engine_now "$want")

    if ! mem_room_for_agent; then
      log "sem memória para mais um implementador — $(mem_status); $((TEAM_IMPLEMENTERS - n + 1)) slot(s) por encher"
      return 0
    fi

    i=$(pick_impl_target "$engine")
    [ -n "$i" ] || return 0   # fila vazia: nada para distribuir

    # UM NÚMERO, OU NADA. Guarda contra o que já aconteceu: o `log` escrevia para
    # stdout, o pick_impl_target loga, e o `$i` vinha com a linha de log dentro.
    # Despachou três slots para o mesmo "issue" e encheu o registo de agentes com
    # tags que nunca morrem. O log já foi para stderr; isto é o cinto.
    case "$i" in
      ''|*[!0-9]*)
        warn "pick_impl_target devolveu algo que não é um número de issue: $(printf '%q' "$i") — slot $slot não despachado"
        return 0 ;;
    esac

    claim_issue "$i"
    log "IMPLEMENTADOR $slot [$engine] -> #$i"
    TEAM_SLOT="$slot" AGENT_ENGINE="$engine" \
      nohup bash "$SCRIPT_DIR/implement.sh" "$i" >> "$LOG_DIR/$slot-bg.log" 2>&1 &
    DISPATCHED_IMPL=$((DISPATCHED_IMPL + 1))
  done
}

# ── Reviewer paralelo ──────────────────────────────────────────────────────
#
# TODOS os reviewers, um por slot rev1..revN (TEAM_REVIEWERS, omissao 1). Nenhum
# bloqueia o ciclo.
#
# Porque existe, medido a 2026-08-21 nos logs: uma review leva ~5.6 min (PR #498,
# 01:06:53->01:12:30, inclui npm ci + lint + tsc + jest) e uma implementacao ~27 min.
# Com 7 slots de implementacao a produzir (~15 PR/h) contra um reviewer serial
# (~10 PR/h) a fila crescia ~5 PR/h. O reviewer nao e lento; era um so.
#
# Tres coisas mantem os reviewers fora do caminho um do outro:
#   * slot proprio (TEAM_SLOT=revN) -> lock proprio no run-agent.sh;
#   * PR diferente por construcao: cada um chama pick_pr, e o primeiro RESERVA o
#     que apanhou, logo o seguinte recebe outro (ver claim_pr/pr_claimed);
#   * worktree proprio, que o review.sh ja cria por PR.
#
# Vai ANTES dos despachos bloqueantes e nao mexe no DID, como o curator e o hermes:
# destacado mas em ultimo seria a mesma ordem em serie com mais maquinaria.
#
# Nenhum marca a sha: quem marca e o proprio review.sh, e so depois de ler um
# veredicto real. Um reviewer que morra sem julgar tem de deixar o PR a volta.
launch_reviewers_if_needed() {
  local want="${TEAM_REVIEWERS:-1}" i slot pr
  [ "$want" -ge 1 ] 2>/dev/null || return 0

  for i in $(seq 1 "$want"); do
    slot="rev$i"
    inflight_slot_active "$slot" && continue
    flock -w 0 -n "$LOCK_PREFIX.$slot.lock" true 2>/dev/null || continue
    # Um reviewer custa o mesmo que um implementador (mesmo harness, mesmo jest),
    # portanto passa pelo mesmo orçamento.
    if ! mem_room_for_agent; then
      log "sem memória para mais um reviewer — $(mem_status)"
      return 0
    fi
    pr=$(pick_pr)
    [ -n "$pr" ] || return 0   # sem PRs livres: nada a distribuir
    dispatch_review "$slot" "$pr"
  done
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
build_impl_roster
log "$(mem_status)"
# Marca o arranque: o watchdog precisa de saber que a pipeline teve TEMPO de
# entregar antes de dizer que não entrega.
health_stamp started

while true; do
  CYCLE=$((CYCLE + 1))
  log "──── ciclo $CYCLE ────"

  cleanup_stale

  # O WATCHDOG CORRE EM TODOS OS CICLOS, e antes de qualquer despacho.
  #
  # As duas avarias de 2026-08-21 eram silenciosas e auto-perpetuantes: a segunda
  # (tags-fantasma a esgotar o orçamento de memória) bloqueava precisamente os
  # despachos que a resolveriam. Um watchdog que corresse depois, ou de vez em
  # quando, teria ficado a ver.
  bash "$SCRIPT_DIR/watchdog.sh" || warn "watchdog falhou neste ciclo"

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
  #
  # COM HERMES, NÃO SE DORME.
  #
  # Este bloco existe para não gastar um ciclo a redescobrir que a quota acabou.
  # Mas dormir também desliga o hermes e o pool alibaba, que têm quota PRÓPRIA e
  # são exactamente os motores que deviam assumir aqui — a pipeline parava horas
  # com um motor livre ao lado. Com hermes OU alibaba disponível o ciclo segue:
  # o impl_engine_now encaminha os slots elegíveis até a subscrição voltar.
  if { [ "${TEAM_USE_FALLBACK:-1}" != "1" ] || fallback_exhausted; } && ! hermes_available && ! alibaba_available; then
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

  if [ "$(cooldown_remaining)" -gt 0 ]; then
    ALT=""
    alibaba_available && ALT="ALIBABA"
    hermes_available && ALT="${ALT:+$ALT + }HERMES"
    if [ -n "$ALT" ]; then
      log "subscrição Claude esgotada (volta às $(date -d "@$(( $(date +%s) + $(cooldown_remaining) ))" +%H:%M)) — slots elegíveis em $ALT até lá"
    fi
  fi

  # Bump conflitos triviais: uma passagem antes do resgate e do despacho para
  # não gastar um implementador só por causa de package.json/app.json.
  resolve_trivial_bump_conflicts
  rescue_stuck_wip
  close_orphan_prs

  # Dependências. O pipeline não as sabe representar — só labels e prioridade — e com
  # dois implementadores em paralelo um par dependente arranca junto por construção.
  # Um issue bloqueado fica SEM label qa:* (invisível aqui) e declara-o no corpo com
  # "**Bloqueado por:** #N". Isto promove-o a qa:ready quando os bloqueadores fecharem.
  # Corre antes dos despachos: um issue desbloqueado neste ciclo já pode ser apanhado.
  bash "$SCRIPT_DIR/unblock.sh" >/dev/null 2>&1 || warn "unblock.sh falhou neste ciclo"

  # Reservas: são por ciclo, e têm de ser limpas ANTES de qualquer despacho —
  # senão um issue reservado no ciclo anterior nunca mais é escolhido.
  CLAIMED_THIS_CYCLE=""
  CLAIMED_ISSUES_THIS_CYCLE=""
  DISPATCHED_IMPL=0
  DISPATCHED_REVIEW=0

  # Repair analysis runs alongside delivery, never in front of it.
  launch_curator_if_needed

  # OS REVIEWERS VÊM PRIMEIRO, e é por causa do orçamento de memória: quem for
  # despachado primeiro fica com a folga. Rever é o que fecha issues e mete
  # código em main — um implementador que espere um ciclo (45s) não custa nada,
  # uma fila de PRs sem quem a reveja custa tudo.
  trim_reviewed_state
  launch_reviewers_if_needed

  # Implementadores: enche os slots livres enquanto houver memória e fila.
  launch_implementers_if_needed

  DID=0
  [ "$DISPATCHED_IMPL" -gt 0 ] && DID=1
  [ "$DISPATCHED_REVIEW" -gt 0 ] && DID=1

  # Já não há passo bloqueante nenhum: o ciclo despacha e volta a olhar 45s
  # depois, portanto um slot que vague é enchido em 45s em vez de esperar que a
  # review de 6 minutos do slot principal acabe.

  # Nada despachado.
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
