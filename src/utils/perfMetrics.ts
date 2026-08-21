/**
 * Instrumentação de arranque e de orçamento de performance (§7 da ESPECIFICACAO, #517).
 *
 * Este ficheiro é deliberadamente um registo em memória, puro e sem I/O:
 *
 * - **Não usa `console.log`.** O `transform-remove-console` do babel (release)
 *   apagaria as medições exactamente na build que interessa medir. Os números
 *   ficam em memória e são lidos em runtime (ecrã de definições → Diagnostics).
 * - **Cold start mede até à GRELHA VISÍVEL**, não até ao mount do
 *   `LauncherHomeScreen`: no momento do mount o que está pintado é o spinner
 *   (`LauncherHomeScreen.tsx`, ramo `isLoading`), por isso medir aí daria um
 *   número bonito e falso. O ponto final é o `onLayout` da grelha — o primeiro
 *   instante em que o layout das células existe, i.e. a grelha foi pintada.
 *   Escolhemos `onLayout` em vez de `InteractionManager.runAfterInteractions`
 *   porque este último dispara quando a fila de interacções esvazia, o que pode
 *   ser antes de haver layout (e portanto antes de haver grelha) ou muito depois,
 *   arrastado por trabalho não relacionado.
 * - **O instrumento tem de ser mais barato do que o que mede**: cada marca é uma
 *   leitura de relógio e uma escrita num objecto; não há timers, nem
 *   `PerformanceObserver`, nem alocações por frame.
 */

/** Alvos do orçamento definidos na §7. */
export const PERF_BUDGETS = {
  /** ms, do arranque do processo até ao primeiro frame com a grelha visível. */
  coldStartMs: 400,
  /** ms, do regresso a primeiro plano até a grelha estar outra vez visível. */
  warmStartMs: 120,
  /** frames perdidos tolerados num scroll de página. */
  droppedFrames: 0,
  /** MB de memória em repouso. */
  idleMemoryMb: 180,
  /** ocorrências de blur em runtime. */
  runtimeBlurCount: 0,
  /** listas montadas em simultâneo. */
  concurrentLists: 2,
} as const;

export type PerfBudgetKey = keyof typeof PERF_BUDGETS;

export interface PerfMetrics {
  /** Duração do cold start (arranque do processo → grelha visível), em ms. */
  coldStartMs: number | null;
  /** Duração do último warm start (foreground → grelha visível), em ms. */
  warmStartMs: number | null;
  /** Quantos warm starts foram medidos desde o arranque. */
  warmStartCount: number;
}

interface PerfState extends PerfMetrics {
  processStart: number | null;
  warmStartBegin: number | null;
  coldStartDone: boolean;
  /**
   * Instante em que a grelha ficou visível pela primeira vez. Guardado porque a
   * marca de arranque vem de uma chamada assíncrona à bridge e pode chegar
   * DEPOIS do primeiro layout — sem isto, uma bridge lenta apagava o cold start
   * em vez de o medir.
   */
  gridVisibleAt: number | null;
}

function emptyState(): PerfState {
  return {
    coldStartMs: null,
    warmStartMs: null,
    warmStartCount: 0,
    processStart: null,
    warmStartBegin: null,
    coldStartDone: false,
    gridVisibleAt: null,
  };
}

let state: PerfState = emptyState();
const listeners = new Set<(m: PerfMetrics) => void>();

/** Um timestamp monotónico só é utilizável se for um número finito e não negativo. */
function isUsableTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function now(): number {
  // `performance.now()` é monotónico; `Date.now()` é o recurso quando o
  // ambiente não o expõe (Hermes antigo, ambientes de teste minimalistas).
  const perf = (globalThis as { performance?: { now?: () => number } }).performance;
  if (perf && typeof perf.now === 'function') {
    const t = perf.now();
    if (isUsableTimestamp(t)) return t;
  }
  return Date.now();
}

function notify(): void {
  const snapshot = getPerfMetrics();
  for (const l of listeners) l(snapshot);
}

/**
 * Regista o instante em que o processo arrancou, na mesma base de tempo das
 * marcas JS. Valores inválidos (negativos, `NaN`, `undefined`, no futuro) são
 * ignorados — um instrumento que aceita lixo mente com convicção.
 *
 * Chamar duas vezes não substitui a primeira marca: o arranque do processo
 * acontece uma vez, e a segunda chamada é sempre a menos fiável.
 */
export function markProcessStart(timestamp?: unknown): void {
  if (state.processStart !== null) return;
  const t = timestamp === undefined ? now() : timestamp;
  if (!isUsableTimestamp(t)) return;
  if (t > now()) return;
  state.processStart = t;

  // A marca de arranque chega de uma chamada assíncrona à bridge e pode chegar
  // depois do primeiro layout da grelha. Nesse caso fecha-se o cold start aqui,
  // com o instante da grelha que já foi registado — em vez de perder a medição.
  if (state.gridVisibleAt !== null && state.coldStartMs === null) {
    state.coldStartMs = Math.max(0, state.gridVisibleAt - t);
    notify();
  }
}

/**
 * Marca o arranque do processo a partir da idade do processo em ms, tal como o
 * lado nativo a reporta (`SystemClock.uptimeMillis() - Process.getStartUptimeMillis()`,
 * ver `getProcessStartAgeMs` em LauncherModule.kt). Converte para a base de tempo
 * das marcas JS subtraindo a idade ao relógio actual — é isto que torna o cold
 * start honesto: inclui o arranque do processo e do runtime, não só o JS.
 *
 * Idades inválidas (negativas, `NaN`, `-1` do lado nativo quando a API não está
 * disponível) são ignoradas: fica-se sem número, em vez de com um número errado.
 */
export function markProcessStartFromAge(ageMs: unknown): void {
  if (!isUsableTimestamp(ageMs)) return;
  markProcessStart(now() - ageMs);
}

/**
 * A grelha do ecrã principal acabou de ter layout, ou seja está visível.
 *
 * - A primeira chamada fecha o cold start (só se houver marca de arranque).
 * - Chamadas seguintes fecham um warm start, se houver um em curso. Um duplo
 *   `onLayout` sem novo foreground não produz uma segunda medição.
 */
export function markGridVisible(): void {
  const t = now();

  if (!state.coldStartDone) {
    state.coldStartDone = true;
    state.gridVisibleAt = t;
    if (state.processStart !== null) {
      state.coldStartMs = Math.max(0, t - state.processStart);
    }
    state.warmStartBegin = null;
    notify();
    return;
  }

  if (state.warmStartBegin !== null) {
    state.warmStartMs = Math.max(0, t - state.warmStartBegin);
    state.warmStartCount += 1;
    state.warmStartBegin = null;
    notify();
  }
}

/**
 * O launcher voltou a primeiro plano (AppState `active`, ou re-entrega do
 * intent HOME). Abre a janela de warm start, que fecha na próxima grelha
 * visível. Chamar duas vezes seguidas reinicia a janela em vez de acumular.
 */
export function markWarmStartBegin(): void {
  if (!state.coldStartDone) return; // ainda estamos em cold start
  state.warmStartBegin = now();
}

/** Snapshot imutável das métricas. */
export function getPerfMetrics(): PerfMetrics {
  return {
    coldStartMs: state.coldStartMs,
    warmStartMs: state.warmStartMs,
    warmStartCount: state.warmStartCount,
  };
}

/**
 * Compara um valor medido com o alvo da §7.
 * Devolve `null` quando não há medição — «sem número» não é «dentro do alvo».
 */
export function isWithinBudget(key: PerfBudgetKey, value: number | null | undefined): boolean | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return value <= PERF_BUDGETS[key];
}

/** Subscrever alterações. Devolve a função de cancelamento. */
export function subscribePerfMetrics(listener: (m: PerfMetrics) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Só para testes: limpa o registo (o estado é module-level). */
export function resetPerfMetrics(): void {
  state = emptyState();
  listeners.clear();
}
