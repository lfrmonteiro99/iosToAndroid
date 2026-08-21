#!/usr/bin/env bash
# Promove a qa:ready os issues cujos bloqueadores já fecharam.
#
# PORQUE ISTO EXISTE
#
# O pipeline não tem forma de representar dependências: o orquestrador só olha para
# labels qa:* e ordena por prioridade. Um issue que precise de outro primeiro não tem
# como o dizer, e com dois implementadores em paralelo (Claude em first_with,
# Hermes em nth_with 1) o par dependente arranca junto por construção — foi o que
# aconteceu ao #475 arrancar antes do #474.
#
# A alternativa era instruir o agente que fecha o bloqueador a promover os dependentes.
# Má ideia: neste repo a aplicação de labels é precisamente o passo que falha em
# silêncio (ver o histórico de veredictos escritos sem labels aplicados). Uma dependência
# que só é honrada quando um LLM se lembra não é uma dependência.
#
# COMO FUNCIONA
#
# Parque  = nenhum label qa:*. O orquestrador nunca despacha um issue assim.
# Marcador= uma linha no corpo do issue, exactamente nesta forma:
#
#             **Bloqueado por:** #474, #475
#
# O marcador é a única fonte de verdade. O script corre nos DOIS sentidos:
#
#   PROMOVER — parqueado + todos os bloqueadores CLOSED  -> qa:ready
#   PARQUEAR — qa:ready + algum bloqueador ainda OPEN    -> sem label qa:*
#
# O segundo sentido não é zelo a mais: o rescue_stuck_wip do orquestrador devolve a
# qa:ready qualquer issue em qa:wip cujo agente morra sem PR, e isso ressuscita um
# issue bloqueado sem ninguém notar. Aconteceu ao #514/#516/#518 minutos depois de
# serem parqueados. Um gate que só promove não é um gate, é uma sugestão.
#
# Só se despromove a partir de qa:ready. NUNCA de qa:wip nem qa:review — aí há
# trabalho a acontecer ou um PR à espera, e roubar-lhe o label deixa-o órfão.
#
# Os epics também não têm label qa:* — e são deliberadamente ignorados porque não
# têm marcador. É essa a salvaguarda: sem "Bloqueado por:", este script não toca.
#
# USO
#   bash unblock.sh            # promove e parqueia
#   bash unblock.sh --dry-run  # mostra o que faria
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
. "$SCRIPT_DIR/lib.sh"

DRY=0
[ "${1:-}" = "--dry-run" ] && DRY=1

MARKER_RE='^\*\*Bloqueado por:\*\*'

# Uma leitura, não uma por issue. Um erro de API não pode passar por "lista vazia" —
# é a armadilha que o orquestrador documenta em refresh_issue_cache.
ALL=$(gh issue list --repo "$REPO" --state open --limit 300 \
      --json number,labels 2>/dev/null) || { warn "falhou a listagem de issues"; exit 1; }
printf '%s' "$ALL" | jq -e 'type == "array"' >/dev/null 2>&1 \
  || { warn "resposta inesperada da API; não promovo nada"; exit 1; }

# Candidatos: abertos sem qualquer label qa:* (parqueados) MAIS os que estão em
# qa:ready (que podem ter sido ressuscitados pelo rescue_stuck_wip). qa:wip e
# qa:review ficam de fora de propósito — ver a nota no cabeçalho.
CANDIDATES=$(printf '%s' "$ALL" | jq -r --arg qa "$ALL_QA_LABELS" '
  ($qa | split(",")) as $q
  | .[]
  | [.labels[].name] as $n
  | select(($n | any(. as $x | $q | index($x)) | not) or ($n | index("qa:ready")))
  | .number')

# Conjunto dos ABERTOS, da leitura que ja fizemos. Serve para decidir o estado dos
# bloqueadores sem UMA CHAMADA POR BLOQUEADOR: um issue esta fechado se e so se nao
# esta nesta lista. Zero chamadas extra.
#
# Um numero que nunca existiu tambem cai em "fechado". E aceitavel: um marcador a
# apontar para um issue inexistente nao deve prender o dependente para sempre.
OPEN_SET=" $(printf '%s' "$ALL" | jq -r '.[].number' | tr '\n' ' ')"

# Cache do marcador, porque a primeira versao disto custava ~95s por ciclo: buscava o
# corpo dos ~42 candidatos, todos os ciclos, para reler uma linha que nunca muda.
# O ciclo do orquestrador dorme 45s, portanto o gate era mais lento que o ciclo.
#
# Aqui guarda-se "<issue>\t<bloqueadores>" ou "<issue>\t-" para quem nao tem marcador,
# e so se busca o corpo de quem ainda nao esta em cache. Em regime permanente sao zero
# fetches de corpo.
#
# Invalidacao: o marcador e escrito uma vez e nao muda. Se for preciso reescrever um,
# apagar este ficheiro — e mais honesto que inventar um TTL.
MARKER_CACHE="$STATE_DIR/blocked-markers.tsv"
mkdir -p "$STATE_DIR" 2>/dev/null || true
touch "$MARKER_CACHE" 2>/dev/null || true

blockers_of() {   # ecoa os numeros dos bloqueadores, ou nada se nao houver marcador
  local issue="$1" cached body line
  cached=$(grep -m1 -P "^$issue\t" "$MARKER_CACHE" 2>/dev/null | cut -f2-)
  if [ -n "$cached" ]; then
    [ "$cached" = "-" ] && return 0
    echo "$cached"; return 0
  fi
  body=$(gh issue view "$issue" --repo "$REPO" --json body -q .body 2>/dev/null) || return 1
  line=$(printf '%s' "$body" | grep -m1 -E "$MARKER_RE" || true)
  if [ -z "$line" ]; then
    printf '%s\t-\n' "$issue" >> "$MARKER_CACHE" 2>/dev/null || true
    return 0
  fi
  local nums
  nums=$(printf '%s' "$line" | grep -oE '#[0-9]+' | tr -d '#' | tr '\n' ' ' | sed 's/ $//')
  printf '%s\t%s\n' "$issue" "$nums" >> "$MARKER_CACHE" 2>/dev/null || true
  echo "$nums"
}

promoted=0
still=0
parked=0

for issue in $CANDIDATES; do
  blockers=$(blockers_of "$issue") || continue
  [ -n "$blockers" ] || continue      # sem marcador => não é nosso (ex.: epics)

  open_blockers=""
  unreadable=0
  for b in $blockers; do
    case "$OPEN_SET" in
      *" $b "*) open_blockers="$open_blockers #$b" ;;   # ainda aberto
    esac
  done

  # Não confirmar não é o mesmo que estar fechado. Em dúvida, deixar parqueado.
  if [ "$unreadable" = "1" ]; then
    warn "#$issue: não consegui ler o estado de um bloqueador; deixo parqueado"
    still=$((still + 1))
    continue
  fi

  cur=$(get_state "$issue")

  if [ -n "$open_blockers" ]; then
    still=$((still + 1))
    # Ressuscitado pelo rescue_stuck_wip? Volta ao parque.
    if [ "$cur" = "$L_READY" ]; then
      if [ "$DRY" = "1" ]; then
        log "[dry-run] #$issue está em $L_READY mas bloqueado por$open_blockers — seria parqueado"
      else
        gh issue edit "$issue" --repo "$REPO" --remove-label "$L_READY" >/dev/null 2>&1
        gh issue comment "$issue" --repo "$REPO" --body \
"Re-parqueado: ainda bloqueado por$open_blockers.

O label \`$L_READY\` foi reaplicado (provavelmente pelo \`rescue_stuck_wip\`, que devolve à fila qualquer \`qa:wip\` cujo agente morra sem PR) e removido outra vez por \`scripts/team/unblock.sh\`. Não implementar antes dos bloqueadores fecharem." >/dev/null 2>&1
        log "#$issue re-parqueado (estava em $L_READY, bloqueado por$open_blockers)"
      fi
      parked=$((parked + 1))
    else
      log "#$issue continua bloqueado por:$open_blockers"
    fi
    continue
  fi

  # Já accionável e sem bloqueadores abertos: nada a fazer.
  if [ "$cur" = "$L_READY" ]; then
    continue
  fi

  if [ "$DRY" = "1" ]; then
    log "[dry-run] #$issue seria promovido a $L_READY"
    promoted=$((promoted + 1))
    continue
  fi

  gh issue comment "$issue" --repo "$REPO" --body \
"Desbloqueado: todos os bloqueadores ($(printf '%s' "$blockers" | tr '\n' ' ' | sed 's/\([0-9]\+\)/#\1/g; s/ $//')) estão fechados.

Promovido a \`$L_READY\` por \`scripts/team/unblock.sh\`." >/dev/null 2>&1

  set_state "$issue" "$L_READY"
  log "#$issue -> $L_READY (desbloqueado)"
  promoted=$((promoted + 1))
done

log "unblock: $promoted promovido(s), $parked re-parqueado(s), $still ainda bloqueado(s)"
