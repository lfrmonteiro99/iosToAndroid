# Pipeline de agentes — iosToAndroid

Fila autónoma que pega nos issues abertos do GitHub, implementa-os, revê-os e
fecha-os. Portado do harness de QA do `monthy_budget`, sem o critic e sem o
verificador: aqui o backlog já está escrito e não há tester da app a correr.

## A máquina de estados

```
issue aberto ──seed──► qa:ready ──► IMPLEMENTADOR ──► qa:review ──► REVIEWER ──► qa:done
                          ▲             │                              │         (fechado)
                          │             │ blocked                      │ blocked-impl
                          │             ▼                              │
                          │      qa:blocked-spec ◄──── blocked-spec ───┤
                          │             │                              │
                          │             ▼                              ▼
                          └──────── CURATOR ◄──── escalada após N tentativas
```

**Exactamente um label `qa:*` é o estado do issue.** Os comentários são o registo
de auditoria; o label é aquilo sobre o qual o orquestrador despacha.

### O curator não está no caminho normal

Nada entra pelo curator. Os issues vão directos para o implementador, que
investiga o código sozinho. A análise só acontece quando alguém a pede:

| Porta | Quem abre | Quando |
|---|---|---|
| `blocked` | implementador | investigou e o issue não é executável como está |
| `blocked-spec` | reviewer | o código fazia o que o issue pedia, e o pedido estava errado |
| escalada | orquestrador | 3 tentativas sem integrar; à 6ª força `split` |

Curar 42 issues à cabeça custaria uma corrida de agente por cada um para produzir
um briefing que o implementador acaba por re-derivar de qualquer maneira.

## Arrancar

```bash
cd ~/Documentos/iosToAndroid

# 1. labels
bash scripts/team/setup.sh --labels

# 2. medir o que já está partido em main (ver "O portão é regressão" abaixo)
bash scripts/team/baseline.sh
bash scripts/team/baseline.sh --show

# 3. pôr o backlog na fila (vê primeiro o que vai acontecer)
bash scripts/team/setup.sh --seed --dry-run
bash scripts/team/setup.sh --seed

# 4. uma passagem só, para veres o comportamento antes de o largar
bash scripts/team/orchestrator.sh --once

# 5. a sério, em tmux
bash scripts/team/start.sh
bash scripts/team/start.sh --status
bash scripts/team/start.sh --attach
bash scripts/team/start.sh --stop
```

Alvos explícitos, úteis a depurar:

```bash
bash scripts/team/orchestrator.sh --issue 212   # despacha o papel certo para o estado dele
bash scripts/team/orchestrator.sh --pr 300      # só revê este PR
bash scripts/team/curator.sh 212                # força análise
```

O orquestrador **termina sozinho** quando não houver nenhum issue accionável.

## Os papéis

| Script | Papel | Slot | Escreve |
|---|---|---|---|
| `implement.sh` | investiga, escreve o teste vermelho, corrige, abre PR | `impl1..implN` | branch `qa/issue-N`, PR |
| `review.sh` | corre lint+tsc+jest, confere o diff contra o issue, faz merge | `main`, `rev2..revM` | merge para `main`, fecha o issue |
| `curator.sh` | análise de reparação: causa raiz, AC, passos de teste, `split` | `curator` | comentários e labels |

## Paralelismo: o tecto é a MEMÓRIA

Cada agente corre no seu **slot**: lock próprio, worktree próprio, issue/PR
próprio. Já não é "um agente de escrita de cada vez" — o que impede trabalho
perdido não é um lock global, é o isolamento (issue diferente + worktree
diferente + reserva explícita).

Quantos correm ao mesmo tempo **não é uma constante**: em cada ciclo o
orquestrador enche os slots livres enquanto `MemAvailable` der folga
(`mem_room_for_agent`, em `lib.sh`). `TEAM_IMPLEMENTERS` é só um tecto duro
contra o disparate.

Duas coisas que não são óbvias e são as que quebram isto:

* **O `npm test` é jest, e o jest abre `cores-1` workers.** Nesta máquina são 11
  workers de React Native **por agente** — cinco agentes seriam ~55 processos node
  e um OOM garantido. Por isso os prompts recebem `npm test --
  --maxWorkers=$TEAM_JEST_WORKERS` (omissão: 2) em vez de `npm test`.
* **Um agente lançado agora ainda não gastou o que vai gastar.** O pico é o
  `npm ci` e depois o jest, minutos depois do arranque. Se o orçamento só olhasse
  para o `MemAvailable` do instante, lançava seis num minuto e batia no OOM
  cinco minutos mais tarde. Os agentes com menos de `TEAM_AGENT_WARMUP_S`
  contam como memória já comprometida.

O registo de agentes vivos (`state/inflight/<tag>`, com o PID) é o que diz se um
slot está ocupado — **não o flock**. O lock só é tomado dentro do `run-agent.sh`,
no fim do `implement.sh`, depois do worktree e do `npm ci`: até lá o slot parece
livre. Era essa janela que fazia o `cleanup_stale` remover o worktree debaixo de
um agente vivo (o #442) e o `rescue_stuck_wip` devolver a `qa:ready` um issue que
já estava a ser trabalhado.

## O reviewer é o único portão

Não há verificador a seguir e **não há CI em pull requests** neste repositório
(`build-apk.yml` só corre ao publicar uma release). O que o reviewer correr —
`npm run lint`, `npx tsc --noEmit`, `npm test` — é tudo o que alguma vez corre
antes de o código estar em `main`.

Se quiseres uma segunda rede, o sítio certo é um workflow `pull_request` com
essas três verificações; o reviewer passa então a lê-lo em vez de ser a única
fonte.

## O portão é REGRESSÃO, não perfeição

Medido em `main@22d2202` no momento em que isto foi montado:

| verificação | estado |
|---|---|
| `npm run lint` | **2 erros**, 2 avisos |
| `npx tsc --noEmit` | limpo |
| `npm test` | **103 de 180 testes a falhar**, em 24 de 30 suites |

Um portão estrito contra isto bloqueia **todos** os PRs por falhas que o autor não
causou: 42 issues × 3 tentativas cada, tudo a falhar, e o log com bom aspecto do
princípio ao fim. Por isso `baseline.sh` grava o que já estava partido e os
prompts do implementador e do reviewer recebem essa lista: bloqueiam por falhas
**novas**, nunca por herdadas. Os testes que o próprio trabalho traz têm de passar
sempre.

**A causa dominante das 103 falhas é uma linha.** `src/store/SettingsStore.tsx:258`
faz `if (!firstSyncDone) return null;` e `firstSyncDone` só fica verdadeiro depois
de uma leitura assíncrona do `AsyncStorage`. Os testes renderizam de forma síncrona
através de `src/test-utils.tsx`, portanto o provider devolve `null`, a árvore do
ecrã vem vazia, e todos os `getByText` falham. Não são 103 defeitos; é o mesmo
defeito 103 vezes. Corrigi-lo primeiro é o que torna o portão estrito viável — e
volta a ser estrito sozinho: quando `main` estiver verde, apaga
`~/Documentos/iostoandroid-verdicts/state/baseline.json`.

Volta a correr `baseline.sh` sempre que `main` receber um lote de correcções de
testes, ou a linha de base envelhece e passa a perdoar regressões reais.

## Quando a subscrição esgota

`run-agent.sh` detecta o limite de sessão, lê a hora de reset da mensagem do CLI,
grava um cooldown, e passa para o mesmo harness com um modelo do Ollama Cloud
(`TEAM_USE_FALLBACK=1`, por omissão). Medido: o #215 correu de ponta a ponta no
fallback em 4m34s — veredicto, push e PR.

Põe `TEAM_USE_FALLBACK=0` para o orquestrador **dormir** até ao reset em vez de
trabalhar em modo degradado.

### Diagnosticar um agente que "não produz nada"

`claude -p` **não faz streaming** — imprime só a mensagem final. Ausência de output
não é prova de falha; é o aspecto normal de um agente a trabalhar. Para ver o que
se passa:

```bash
ollama launch claude --model <tag> --yes -- -p "$(cat /tmp/ios2a-implement-prompt-N.txt)" \
  --output-format stream-json --verbose --strict-mcp-config --mcp-config '{"mcpServers":{}}' < /dev/null
```

E antes de culpar o modelo, **prova que ele tem acesso ao que precisa** — uma sonda
de duas linhas (`pwd` + `ls <ficheiro do worktree>`) responde a isso em segundos:

```bash
printf 'Executa `pwd` e diz o resultado. Depois `ls <WT>/package.json`.\n' > /tmp/p.txt
cd scripts/team && AGENT_SLOT=probe AGENT_FORCE_FALLBACK=1 bash run-agent.sh /tmp/p.txt <WT> 240
```

Foi exactamente essa sonda que revelou que o agente corria em `scripts/team` e não
no worktree.

## Ficheiros e estado

Tudo o que é volátil vive **fora** do repositório, de propósito: dentro da árvore
de trabalho os veredictos acabavam commitados, herdados entre corridas, e
arrastados para o diff pelo `git add -A`.

| O quê | Onde |
|---|---|
| veredictos JSON | `~/Documentos/iostoandroid-verdicts/` |
| estado (tentativas, shas revistos, cooldown) | `~/Documentos/iostoandroid-verdicts/state/` |
| worktrees dos agentes | `~/Documentos/iostoandroid-wt/` |
| logs | `/tmp/ios2android-team/` |
| locks | `/tmp/ios2android-agent.<slot>.lock` |

Os worktrees são **irmãos** do repositório, nunca dentro dele: um worktree
aninhado aparece como conteúdo não versionado e acaba commitado por acidente.

### node_modules nos worktrees

`npm ci` em cada worktree custa ~40-60s e este pipeline cria um por issue, por
review e por retrabalho. Quando o `package-lock.json` do worktree é idêntico ao
do checkout principal, `wt_prepare_node` faz **symlink** ao `node_modules`
principal em vez de instalar. Quando o lock difere — porque o issue mexeu nas
dependências — instala a sério, porque aí o symlink mutaria a árvore do checkout
principal por baixo de um agente vivo.

## Dashboard

```bash
bash scripts/team/dashboard.sh --serve          # http://localhost:8787
bash scripts/team/dashboard.sh --serve --lan    # tambem pela tailnet (telemovel)
bash scripts/team/dashboard.sh --once           # so escreve o HTML
```

Mostra o cruzamento que nem o GitHub nem o log dao sozinhos: **que agente esta em
que issue, em que slot, com que motor e ha quanto tempo**, mais os PRs abertos com
o estado do issue ligado (bloqueado / a espera de reviewer / a ser revisto), o que
foi integrado, e a linha de saude do watchdog com o alerta em destaque quando ha um.

Tres chamadas a API por actualizacao (`TEAM_DASH_REFRESH`, omissao 15s) — ~720/h
contra um limite de 5000/h. A geracao e o servidor sao processos separados: uma
falha do `gh` deixa a pagina a mostrar a ultima recolha boa, com o relogio a
denunciar a idade, em vez de derrubar o dashboard.

## Configuração

Tudo por variável de ambiente, com omissões em `lib.sh`:

| Variável | Omissão | Efeito |
|---|---|---|
| `TEAM_CYCLE_SLEEP` | `45` | segundos entre ciclos |
| `TEAM_IMPLEMENTERS` | `6` | tecto de slots de implementação (o real é a memória) |
| `TEAM_IMPL_ENGINES` | `claude` (ou `claude,hermes` com `TEAM_HERMES=1`) | motores dos slots, ciclados |
| `TEAM_REVIEWERS` | `1` | reviewers em paralelo |
| `TEAM_AGENT_MEM_MB` | `2000` | custo estimado de um agente no pico |
| `TEAM_MEM_FLOOR_MB` | `2048` | memória que nunca é emprestada à pipeline |
| `TEAM_AGENT_WARMUP_S` | `300` | quanto tempo um agente conta como "ainda a crescer" |
| `TEAM_JEST_WORKERS` | `2` | `--maxWorkers` do jest em cada agente (`0` = default do jest) |
| `TEAM_MAX_ATTEMPTS` | `3` | tentativas antes de escalar para o curator |
| `IMPLEMENT_MODEL` / `REVIEW_MODEL` / `CURATOR_MODEL` | `sonnet` | modelo por papel |
| `IMPLEMENT_HONOUR_READY_LABELS` | `0` | a `1`, usa `haiku` nos issues com `haiku-ready` |
| `IMPLEMENT_TIMEOUT` | `2700` | segundos |
| `REVIEW_TIMEOUT` | `1800` | segundos |
| `CURATOR_TIMEOUT` | `1200` | segundos |
| `AGENT_FALLBACK_MODEL` | `deepseek-v4-flash:cloud` | motor quando a subscrição esgota |
| `TEAM_USE_FALLBACK` | `1` | a `0`, dorme até ao reset em vez de usar o fallback |

Sobre `IMPLEMENT_HONOUR_READY_LABELS`: o backlog está triado com
`haiku-ready`/`sonnet-ready`, mas essa triagem é sobre o **tamanho da alteração**,
não sobre o tamanho do trabalho que o agente faz — investigar a causa, escrever o
teste vermelho, provar o passo vermelho, correr três gates e produzir um veredicto
estruturado. Um fix de uma linha carrega tudo isso na mesma. Por isso a omissão é
`sonnet` para todos.

## Quando a subscrição esgota

`run-agent.sh` detecta o limite de sessão, lê a hora de reset da mensagem do CLI,
grava um cooldown, e passa para o mesmo harness com um modelo do Ollama Cloud. A
diferença fica registada em `/tmp/ios2android-agent.<slot>.engine`, e os papéis
usam-na para distinguir "esta corrida foi degradada" de "este issue derrotou o
pipeline" — sem isso, uma falta de quota temporária consome trabalho real de forma
permanente.

O fallback **não aceita imagens**: fazer `Read` num `.png` devolve 400 e mata a
corrida inteira sem veredicto. O prompt é anexado com um aviso quando esse motor
está em uso.

## Falhas conhecidas que este código já defende

Cada uma custou trabalho real no projecto irmão e está comentada no sítio:

- ler os issues com `2>/dev/null || echo ""` faz uma falha de API parecer um
  backlog vazio — o orquestrador declarava vitória sobre leituras falhadas;
- rever um PR pelo número em vez de pelo sha da HEAD gerou 184 reviews do mesmo
  commit numa noite;
- `wt_create` em vez de `wt_checkout` na review dá diff **vazio**, e o reviewer
  julga o PR pelo título sem erro nenhum no log;
- `| head -c N` num diff sob `set -o pipefail` mata o script por SIGPIPE;
- não fechar o fd do lock (`9>&-`) deixa o agente a segurar o lock depois de o
  pai sair;
- não fechar o stdin (`< /dev/null`) faz o `ollama launch` pendurar até ao timeout;
- confiar no código de saída do `gh pr merge` reporta falha em merges que
  aconteceram, e fila retrabalho de código já integrado.

## Quando o fallback deixa de compensar

O fallback está ligado por omissão porque entrega — mas nem sempre. Medido a
2026-08-19, sobre as corridas do implementador:

| motor | corridas | saída limpa |
|---|---|---|
| `claude` | 17 | 17 (100%) |
| `ollama` | 32 | 18 (56%) |

E há janelas em que corre bem pior: entre as 10:22 e as 10:39, com a quota
esgotada, foram **0 veredictos em 4 corridas** e três issues adiados. Cinco falhas
seguidas com uma taxa de falha de 44% dá ~1,6% de probabilidade, portanto não é
azar — é o fallback a estar pior que a sua média.

O disjuntor faz isto degenerar sozinho em espera (todos os issues adiados → ciclos
vazios até a quota voltar), mas gasta ~3 minutos por issue a lá chegar. Quando a
janela é claramente má, é mais barato dizê-lo:

```bash
bash scripts/team/start.sh --stop
export TEAM_USE_FALLBACK=0
bash scripts/team/start.sh          # dorme até ao reset da subscrição
```

**Como decidir:** conta veredictos contra corridas na janela actual. Se houver
entregas pelo meio, deixa ligado — 56% é melhor que 0%. Se forem várias corridas
seguidas sem um único veredicto, desliga e espera.

```bash
LOG=$(ls -t /tmp/ios2android-team/orchestrator-*.log | head -1)
echo "veredictos=$(grep -ac 'outcome=' $LOG) sem-veredicto=$(grep -ac 'SEM VEREDICTO' $LOG)"
```
