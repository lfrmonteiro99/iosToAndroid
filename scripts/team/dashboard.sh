#!/bin/bash
# dashboard.sh — uma página com o estado real da pipeline, para não andar a navegar
# entre issues e PRs no GitHub.
#
# O QUE ISTO MOSTRA QUE O GITHUB NÃO MOSTRA
#
# O GitHub sabe que o issue #475 tem a label `qa:wip`. Não sabe que está no slot
# impl1, com o motor claude, há 14 minutos, nem que o orçamento de memória está a
# recusar mais três slots, nem que houve um alerta do watchdog. Metade da
# informação que interessa vive no estado local (registo de agentes vivos, saúde,
# adiamentos) e a outra metade no GitHub — e é o cruzamento que diz se isto está
# a trabalhar ou a fingir.
#
# CUSTO DE API: três chamadas por actualização (issues abertos, PRs abertos, PRs
# integrados hoje). A 15s são ~720/h contra um limite de 5000/h. Se precisares de
# mais folga, sobe TEAM_DASH_REFRESH.
#
# Usage:
#   dashboard.sh --once            escreve o HTML e sai
#   dashboard.sh --serve [--port N] [--lan]
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"
ROLE="dashboard"

MODE="once"
# 9317 E NAO 8787, e a diferenca importa.
#
# 8787 e o porto VIVO do companion-chat -- a app que o utilizador abre no
# telemovel em 100.75.174.75:8787, e que esse projecto tem regra escrita para nao
# tocar. So consegui ocupa-lo porque a app estava em baixo naquele instante:
# quando arrancasse, ou falhava a ligar, ou o bookmark do telemovel passava a dar
# este dashboard. Escolhido depois de inventariar os 110 portos referenciados nos
# projectos em ~/Documentos -- o bairro dos 87xx esta cheio (8788, 8789, 8791,
# 8792, 8797, 8799, 8800, 8801), portanto fica de fora inteiro.
PORT="${TEAM_DASH_PORT:-9317}"
BIND="127.0.0.1"
REFRESH="${TEAM_DASH_REFRESH:-15}"

while [ $# -gt 0 ]; do
  case "$1" in
    --once) MODE="once"; shift ;;
    --serve) MODE="serve"; shift ;;
    --port) PORT="$2"; shift 2 ;;
    --port=*) PORT="${1#--port=}"; shift ;;
    # Para ver do telemóvel pela Tailscale. Não abre nada para a internet: a
    # interface tailscale0 só é alcançável de dentro da tailnet.
    --lan) BIND="0.0.0.0"; shift ;;
    *) shift ;;
  esac
done

DASH_DIR="${TEAM_DASH_DIR:-$LOG_DIR/dashboard}"
mkdir -p "$DASH_DIR" 2>/dev/null || true
OUT="$DASH_DIR/index.html"

# ── Escapes ────────────────────────────────────────────────────────────────
# Títulos de issues vêm do GitHub e passam por aqui para dentro de HTML. Um
# título com `<` ou `&` quebra a página, e um com uma tag fecha o layout todo.
esc() { printf '%s' "${1:-}" | sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g' -e 's/"/\&quot;/g'; }

human_age() {
  local s="${1:-0}"
  if [ "$s" -ge 999999 ]; then echo "nunca"; return; fi
  if [ "$s" -lt 60 ]; then echo "${s}s"
  elif [ "$s" -lt 3600 ]; then echo "$((s / 60))min"
  elif [ "$s" -lt 86400 ]; then echo "$((s / 3600))h$(( (s % 3600) / 60 ))m"
  else echo "$((s / 86400))d"; fi
}

iso_age() {
  local iso="$1" now t
  now=$(date +%s); t=$(date -d "$iso" +%s 2>/dev/null || echo "$now")
  echo $(( now - t ))
}

# ── Recolha ────────────────────────────────────────────────────────────────
collect() {
  ISSUES_JSON=$(gh issue list --repo "$REPO" --state open --limit 300 \
    --json number,title,labels,updatedAt 2>/dev/null || echo "[]")
  PRS_JSON=$(gh pr list --repo "$REPO" --base "$BASE_BRANCH" --state open --limit 60 \
    --json number,title,headRefName,createdAt,updatedAt,mergeable 2>/dev/null || echo "[]")
  MERGED_JSON=$(gh pr list --repo "$REPO" --base "$BASE_BRANCH" --state merged --limit 15 \
    --json number,title,headRefName,mergedAt 2>/dev/null || echo "[]")
}

# Título de um issue a partir do cache, para não pedir um a um.
issue_title() {
  printf '%s' "$ISSUES_JSON" | jq -r --argjson n "$1" \
    '.[] | select(.number == $n) | .title' 2>/dev/null | head -1
}
issue_labels() {
  printf '%s' "$ISSUES_JSON" | jq -r --argjson n "$1" \
    '.[] | select(.number == $n) | [.labels[].name] | join(" ")' 2>/dev/null | head -1
}
pr_field() {
  printf '%s' "$PRS_JSON" | jq -r --argjson n "$1" \
    ".[] | select(.number == \$n) | .$2" 2>/dev/null | head -1
}

state_count() {
  printf '%s' "$ISSUES_JSON" | jq -r --arg l "$1" \
    '[.[] | select([.labels[].name] | index($l))] | length' 2>/dev/null || echo 0
}

# ── Quem está a trabalhar AGORA ────────────────────────────────────────────
#
# Isto é a razão de existir da página. Vem do registo de agentes vivos, que é
# PID-based: se está aqui, há um processo vivo. O slot e o motor vêm de ficheiros
# que o run-agent.sh escreve.
live_rows() {
  local f tag role num pid slot engine started age title labels url kind
  local any=0
  for f in "$INFLIGHT_DIR"/*; do
    [ -f "$f" ] || continue
    tag=$(basename "$f")
    role="${tag%%-*}"; num="${tag##*-}"
    case "$num" in ''|*[!0-9]*) continue ;; esac
    pid=$(awk '{print $1; exit}' "$f" 2>/dev/null || echo "")
    slot=$(awk '{print $2; exit}' "$f" 2>/dev/null || echo "?")
    [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null || continue
    any=1
    started=$(stat -c %Y "$f" 2>/dev/null || date +%s)
    age=$(( $(date +%s) - started ))
    engine=$(cat "$LOCK_PREFIX.$slot.engine" 2>/dev/null || echo "")
    case "$role" in
      review) kind="review"; title=$(pr_field "$num" title); url="$REPO_URL/pull/$num" ;;
      *)      kind="$role";  title=$(issue_title "$num");    url="$REPO_URL/issues/$num" ;;
    esac
    [ -n "$title" ] || title="(título não lido)"
    labels=$(issue_labels "$num")
    cat <<ROW
<tr>
  <td><span class="pill pill-$kind">$(esc "$kind")</span></td>
  <td class="mono">$(esc "$slot")</td>
  <td class="mono">$(esc "${engine:-?}")</td>
  <td><a href="$url" target="_blank">#$num</a></td>
  <td class="title">$(esc "$title")</td>
  <td class="mono num $( [ "$age" -gt 2400 ] && echo 'warn' )">$(human_age "$age")</td>
</tr>
ROW
  done
  [ "$any" = "1" ] || echo '<tr><td colspan="6" class="empty">nenhum agente vivo</td></tr>'
}

pr_rows() {
  local num title branch created updated mergeable age upd_age reviewing linked labels state
  local list; list=$(printf '%s' "$PRS_JSON" | jq -r \
    '.[] | select(.headRefName | startswith("qa/")) | [.number, .updatedAt, .createdAt, (.mergeable // "?"), .headRefName, .title] | @tsv' 2>/dev/null)
  [ -n "$list" ] || { echo '<tr><td colspan="7" class="empty">nenhum PR aberto</td></tr>'; return; }
  while IFS=$'\t' read -r num updated created mergeable branch title; do
    [ -n "$num" ] || continue
    age=$(iso_age "$created"); upd_age=$(iso_age "$updated")
    reviewing=""
    inflight_active "review-$num" && reviewing="a ser revisto"

    # O ESTADO DE UM PR VIVE NO ISSUE, não no PR. O GitHub diz só "open"; o que
    # interessa — bloqueado, à espera de reviewer, a ser refeito — é a label do
    # issue ligado. E o issue deduz-se do nome do branch (`qa/issue-N`), que é a
    # convenção que o pick_pr já exige para sequer olhar para o PR.
    linked=$(printf '%s' "$branch" | grep -oE '[0-9]+$' | head -1)
    labels=""
    [ -n "$linked" ] && labels=$(issue_labels "$linked")

    state="$reviewing"
    [ -z "$state" ] && case "$labels" in
      *qa:blocked-impl*) state="bloqueado — a refazer" ;;
      *qa:review*)       state="à espera de reviewer" ;;
      *qa:wip*)          state="implementador a trabalhar" ;;
      *)                 state="—" ;;
    esac
    [ "$mergeable" = "CONFLICTING" ] && state="conflito com $BASE_BRANCH"
    cat <<ROW
<tr>
  <td><a href="$REPO_URL/pull/$num" target="_blank">#$num</a></td>
  <td>$( [ -n "$linked" ] && echo "<a href=\"$REPO_URL/issues/$linked\" target=\"_blank\">#$linked</a>" || echo "—" )</td>
  <td class="title">$(esc "$title")</td>
  <td>$(esc "$state")</td>
  <td class="mono num">$(human_age "$age")</td>
  <td class="mono num $( [ "$upd_age" -gt 3600 ] && echo 'warn' )">$(human_age "$upd_age")</td>
  <td class="mono">$( is_deferred "pr-$num" && echo "adiado" || echo "" )</td>
</tr>
ROW
  done <<< "$list"
}

# Issues em trabalho, do ponto de vista do QUADRO — inclui os que estão com label
# de trabalho mas SEM agente vivo, que é precisamente o sintoma de trabalho
# perdido (o resgate do orquestrador trata deles, e aqui vê-se).
work_rows() {
  local list num title labels agent
  list=$(printf '%s' "$ISSUES_JSON" | jq -r \
    '.[] | select([.labels[].name] | any(. == "qa:wip" or . == "qa:review" or . == "qa:blocked-impl" or . == "qa:blocked-spec"))
     | [.number, ([.labels[].name] | map(select(startswith("qa:"))) | join(",")), .updatedAt, .title] | @tsv' 2>/dev/null)
  [ -n "$list" ] || { echo '<tr><td colspan="5" class="empty">nada em trabalho</td></tr>'; return; }
  while IFS=$'\t' read -r num labels updated title; do
    [ -n "$num" ] || continue
    agent="—"
    inflight_active "implement-$num" && agent="implementador vivo"
    cat <<ROW
<tr>
  <td><a href="$REPO_URL/issues/$num" target="_blank">#$num</a></td>
  <td class="title">$(esc "$title")</td>
  <td><span class="pill pill-label">$(esc "$labels")</span></td>
  <td>$(esc "$agent")</td>
  <td class="mono num">$(human_age "$(iso_age "$updated")")</td>
</tr>
ROW
  done <<< "$list"
}

merged_rows() {
  local list num title merged
  list=$(printf '%s' "$MERGED_JSON" | jq -r '.[] | [.number, .mergedAt, .title] | @tsv' 2>/dev/null)
  [ -n "$list" ] || { echo '<tr><td colspan="3" class="empty">nada integrado ainda</td></tr>'; return; }
  while IFS=$'\t' read -r num merged title; do
    [ -n "$num" ] || continue
    cat <<ROW
<tr>
  <td><a href="$REPO_URL/pull/$num" target="_blank">#$num</a></td>
  <td class="title">$(esc "$title")</td>
  <td class="mono num">há $(human_age "$(iso_age "$merged")")</td>
</tr>
ROW
  done <<< "$list"
}

render() {
  local alert="" running="parado" agents pr_age merge_age agent_age
  [ -f "$HEALTH_DIR/ALERT" ] && alert=$(cat "$HEALTH_DIR/ALERT")
  tmux has-session -t "${TEAM_SESSION:-ios2android-qa}" 2>/dev/null && running="a correr"
  agents=$(inflight_count)
  pr_age=$(health_age pr-created); merge_age=$(health_age merge); agent_age=$(health_age agent-ran)

  cat <<HTML
<!doctype html>
<html lang="pt"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="$REFRESH">
<title>pipeline iosToAndroid</title>
<style>
:root { color-scheme: light dark;
  --bg:#fff; --fg:#111; --dim:#666; --line:#e3e3e3; --card:#fafafa;
  --ok:#1a7f37; --warn:#9a6700; --bad:#cf222e; --accent:#0969da; }
@media (prefers-color-scheme: dark) { :root {
  --bg:#0d1117; --fg:#e6edf3; --dim:#8b949e; --line:#21262d; --card:#161b22;
  --ok:#3fb950; --warn:#d29922; --bad:#f85149; --accent:#58a6ff; } }
* { box-sizing:border-box }
body { margin:0; padding:16px; background:var(--bg); color:var(--fg);
  font:14px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif; }
h1 { font-size:16px; margin:0 0 2px; font-weight:650 }
h2 { font-size:13px; margin:22px 0 6px; font-weight:650; color:var(--dim);
  text-transform:uppercase; letter-spacing:.06em }
.sub { color:var(--dim); font-size:12px; margin-bottom:14px }
.alert { background:var(--bad); color:#fff; padding:9px 12px; border-radius:6px;
  margin-bottom:14px; font-weight:600 }
.cards { display:grid; grid-template-columns:repeat(auto-fit,minmax(120px,1fr)); gap:8px }
.card { background:var(--card); border:1px solid var(--line); border-radius:6px; padding:9px 11px }
.card .k { color:var(--dim); font-size:11px; text-transform:uppercase; letter-spacing:.05em }
.card .v { font-size:17px; font-weight:650; margin-top:2px }
.card .v.small { font-size:13px; font-weight:550 }
.wrap { overflow-x:auto; border:1px solid var(--line); border-radius:6px; background:var(--card) }
table { width:100%; border-collapse:collapse; font-size:13px }
th { text-align:left; font-weight:600; color:var(--dim); font-size:11px;
  text-transform:uppercase; letter-spacing:.05em; padding:7px 10px; border-bottom:1px solid var(--line) }
td { padding:7px 10px; border-bottom:1px solid var(--line); vertical-align:top }
tr:last-child td { border-bottom:none }
.mono { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:12px }
.num { white-space:nowrap; text-align:right }
.title { max-width:640px }
.empty { color:var(--dim); font-style:italic }
a { color:var(--accent); text-decoration:none } a:hover { text-decoration:underline }
.warn { color:var(--warn); font-weight:600 }
.pill { display:inline-block; padding:1px 7px; border-radius:999px; font-size:11px;
  font-weight:600; white-space:nowrap; border:1px solid var(--line) }
.pill-implement { background:rgba(9,105,218,.13); color:var(--accent) }
.pill-review { background:rgba(26,127,55,.14); color:var(--ok) }
.pill-curator { background:rgba(154,103,0,.15); color:var(--warn) }
.pill-label { background:transparent; color:var(--dim); font-family:ui-monospace,monospace }
footer { margin-top:22px; color:var(--dim); font-size:11px }
</style></head><body>

<h1>pipeline iosToAndroid — $running</h1>
<div class="sub">$(date '+%F %H:%M:%S') · actualiza a cada ${REFRESH}s · $REPO</div>

$( [ -n "$alert" ] && echo "<div class=\"alert\">⚠ $(esc "$alert")</div>" )

<div class="cards">
  <div class="card"><div class="k">agentes vivos</div><div class="v">$agents</div></div>
  <div class="card"><div class="k">último PR</div><div class="v small">$(human_age "$pr_age")</div></div>
  <div class="card"><div class="k">último merge</div><div class="v small">$(human_age "$merge_age")</div></div>
  <div class="card"><div class="k">último agente</div><div class="v small">$(human_age "$agent_age")</div></div>
  <div class="card"><div class="k">na fila</div><div class="v">$(state_count qa:ready)</div></div>
  <div class="card"><div class="k">a refazer</div><div class="v">$(state_count qa:blocked-impl)</div></div>
  <div class="card"><div class="k">memória livre</div><div class="v small">$(mem_available_mb) MB</div></div>
  <div class="card"><div class="k">adiados</div><div class="v">$(ls -A "$DEFER_DIR" 2>/dev/null | grep -c . || true)</div></div>
</div>

<h2>a trabalhar agora</h2>
<div class="wrap"><table>
<tr><th>papel</th><th>slot</th><th>motor</th><th>nº</th><th>título</th><th>há</th></tr>
$(live_rows)
</table></div>

<h2>PRs abertos</h2>
<div class="wrap"><table>
<tr><th>PR</th><th>issue</th><th>título</th><th>estado</th><th>aberto há</th><th>sem toque</th><th></th></tr>
$(pr_rows)
</table></div>

<h2>issues em trabalho</h2>
<div class="wrap"><table>
<tr><th>issue</th><th>título</th><th>estado</th><th>agente</th><th>mexido há</th></tr>
$(work_rows)
</table></div>

<h2>integrados recentemente</h2>
<div class="wrap"><table>
<tr><th>PR</th><th>título</th><th>quando</th></tr>
$(merged_rows)
</table></div>

<footer>$(mem_status)</footer>
</body></html>
HTML
}

REPO_URL="https://github.com/$REPO"

generate() {
  collect
  render > "$OUT.tmp" 2>/dev/null && mv "$OUT.tmp" "$OUT"
}

case "$MODE" in
  once)
    generate
    echo "$OUT"
    ;;
  serve)
    # COLISAO DE PORTO NAO PODE SER SILENCIOSA. O `python -m http.server` morre
    # com um traceback que, dentro de um tmux com tee, ninguem le -- e o sintoma
    # e um dashboard que "nao abre". Verifica antes, e diz quem esta la.
    if ss -ltn 2>/dev/null | grep -q ":$PORT "; then
      HOLDER=$(ss -ltnp 2>/dev/null | grep ":$PORT " | grep -oE 'users:\(\("[^"]+",pid=[0-9]+' | head -1 | sed 's/users:((//')
      echo "ERRO: o porto $PORT já está ocupado${HOLDER:+ por $HOLDER}." >&2
      echo "       Escolhe outro com --port N (ou TEAM_DASH_PORT), e confirma antes que" >&2
      echo "       não é de outro projecto: grep -rn 'PORT' ~/Documentos/*/.env*" >&2
      exit 1
    fi
    generate
    # Regenera em segundo plano; o servidor só serve ficheiros. Separar as duas
    # coisas significa que uma falha do `gh` não derruba a página — fica só a
    # mostrar a última recolha boa, com o relógio a denunciar a idade.
    (
      while true; do sleep "$REFRESH"; generate; done
    ) &
    GEN_PID=$!
    trap 'kill $GEN_PID 2>/dev/null' EXIT
    log "dashboard em http://$( [ "$BIND" = "0.0.0.0" ] && echo "$(hostname -I | awk '{print $1}')" || echo localhost ):$PORT/"
    cd "$DASH_DIR" && exec python3 -m http.server "$PORT" --bind "$BIND" >/dev/null 2>&1
    ;;
esac
