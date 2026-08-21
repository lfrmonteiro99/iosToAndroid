/**
 * #517 — instrumentação de cold/warm start (§7).
 *
 * Estes testes exercitam o registo REAL (`src/utils/perfMetrics.ts`): não há
 * cópia da fórmula aqui, chamam-se as funções exportadas e lê-se o snapshot.
 */
import {
  PERF_BUDGETS,
  getPerfMetrics,
  isWithinBudget,
  markGridVisible,
  markProcessStart,
  markProcessStartFromAge,
  markWarmStartBegin,
  resetPerfMetrics,
  subscribePerfMetrics,
} from '../perfMetrics';

beforeEach(() => {
  resetPerfMetrics();
});

describe('cold start: arranque do processo → grelha visível', () => {
  it('mede do arranque do processo até à grelha visível, não até ao mount', () => {
    const t0 = performance.now();
    markProcessStart(t0 - 250);
    markGridVisible();
    const { coldStartMs } = getPerfMetrics();
    expect(coldStartMs).not.toBeNull();
    // 250ms de origem + o custo real de execução, que é ínfimo.
    expect(coldStartMs as number).toBeGreaterThanOrEqual(250);
    expect(coldStartMs as number).toBeLessThan(400);
  });

  it('não produz número nenhum quando não houve marca de arranque', () => {
    markGridVisible();
    expect(getPerfMetrics().coldStartMs).toBeNull();
  });

  it('converte a idade do processo do lado nativo para a base de tempo do JS', () => {
    markProcessStartFromAge(300);
    markGridVisible();
    const { coldStartMs } = getPerfMetrics();
    expect(coldStartMs).not.toBeNull();
    expect(coldStartMs as number).toBeGreaterThanOrEqual(300);
  });

  it.each([[-1], [NaN], [undefined], ['300'], [Infinity]])(
    'ignora a idade nativa inválida %p em vez de inventar um número',
    (age) => {
      markProcessStartFromAge(age);
      markGridVisible();
      expect(getPerfMetrics().coldStartMs).toBeNull();
    },
  );

  it('ignora uma marca de arranque no futuro', () => {
    markProcessStart(performance.now() + 10_000);
    markGridVisible();
    expect(getPerfMetrics().coldStartMs).toBeNull();
  });

  it('a segunda marca de arranque não substitui a primeira', () => {
    markProcessStart(performance.now() - 200);
    markProcessStart(performance.now() - 5);
    markGridVisible();
    expect(getPerfMetrics().coldStartMs as number).toBeGreaterThanOrEqual(200);
  });

  it('um segundo layout da grelha não produz um segundo cold start', () => {
    markProcessStart(performance.now() - 100);
    markGridVisible();
    const first = getPerfMetrics().coldStartMs;
    markGridVisible();
    expect(getPerfMetrics().coldStartMs).toBe(first);
  });

  it('a marca de arranque a chegar DEPOIS do layout ainda fecha o cold start', () => {
    // A idade do processo vem de uma chamada assíncrona à bridge: numa bridge
    // lenta a resposta chega depois do primeiro layout da grelha.
    const gridAt = performance.now();
    markGridVisible();
    expect(getPerfMetrics().coldStartMs).toBeNull();
    markProcessStart(gridAt - 180);
    const { coldStartMs } = getPerfMetrics();
    expect(coldStartMs).not.toBeNull();
    expect(coldStartMs as number).toBeGreaterThanOrEqual(180);
  });

  it('a marca tardia não sobrepõe um cold start já medido', () => {
    markProcessStart(performance.now() - 100);
    markGridVisible();
    const measured = getPerfMetrics().coldStartMs;
    markProcessStart(performance.now() - 9000);
    expect(getPerfMetrics().coldStartMs).toBe(measured);
  });

  it('marca tardia inválida não fecha o cold start', () => {
    markGridVisible();
    markProcessStartFromAge(-1);
    expect(getPerfMetrics().coldStartMs).toBeNull();
  });

  it('cold start medido é 0 no mínimo, nunca negativo', () => {
    markProcessStart(performance.now());
    markGridVisible();
    expect(getPerfMetrics().coldStartMs as number).toBeGreaterThanOrEqual(0);
  });
});

describe('warm start: foreground → grelha visível', () => {
  function completeColdStart() {
    markProcessStart(performance.now() - 10);
    markGridVisible();
  }

  it('mede da volta a primeiro plano até a grelha estar outra vez visível', () => {
    completeColdStart();
    markWarmStartBegin();
    markGridVisible();
    const { warmStartMs, warmStartCount } = getPerfMetrics();
    expect(warmStartMs).not.toBeNull();
    expect(warmStartMs as number).toBeGreaterThanOrEqual(0);
    expect(warmStartCount).toBe(1);
  });

  it('não conta warm start antes do cold start estar fechado', () => {
    markWarmStartBegin();
    markProcessStart(performance.now() - 10);
    markGridVisible();
    expect(getPerfMetrics().warmStartMs).toBeNull();
    expect(getPerfMetrics().warmStartCount).toBe(0);
  });

  it('layout duplicado sem novo foreground não conta um segundo warm start', () => {
    completeColdStart();
    markWarmStartBegin();
    markGridVisible();
    markGridVisible();
    expect(getPerfMetrics().warmStartCount).toBe(1);
  });

  it('dois foregrounds seguidos reiniciam a janela em vez de acumular', () => {
    completeColdStart();
    markWarmStartBegin();
    markWarmStartBegin();
    markGridVisible();
    expect(getPerfMetrics().warmStartCount).toBe(1);
  });

  it('conta cada warm start subsequente', () => {
    completeColdStart();
    for (let i = 0; i < 3; i++) {
      markWarmStartBegin();
      markGridVisible();
    }
    expect(getPerfMetrics().warmStartCount).toBe(3);
  });
});

describe('orçamento da §7', () => {
  it('tem os 6 alvos da especificação', () => {
    expect(PERF_BUDGETS).toEqual({
      coldStartMs: 400,
      warmStartMs: 120,
      droppedFrames: 0,
      idleMemoryMb: 180,
      runtimeBlurCount: 0,
      concurrentLists: 2,
    });
  });

  it.each([
    ['coldStartMs' as const, 399, true],
    ['coldStartMs' as const, 400, true],
    ['coldStartMs' as const, 401, false],
    ['warmStartMs' as const, 0, true],
    ['warmStartMs' as const, 121, false],
    ['droppedFrames' as const, 0, true],
    ['droppedFrames' as const, 1, false],
  ])('isWithinBudget(%s, %p) === %p', (key, value, expected) => {
    expect(isWithinBudget(key, value)).toBe(expected);
  });

  it.each([[null], [undefined], [NaN]])(
    'sem medição (%p) devolve null — «sem número» não é «dentro do alvo»',
    (value) => {
      expect(isWithinBudget('coldStartMs', value)).toBeNull();
    },
  );
});

describe('subscrição', () => {
  it('notifica quando o cold start fecha e para depois de cancelar', () => {
    const seen: (number | null)[] = [];
    const unsubscribe = subscribePerfMetrics((m) => seen.push(m.coldStartMs));
    markProcessStart(performance.now() - 50);
    markGridVisible();
    expect(seen).toHaveLength(1);
    expect(seen[0] as number).toBeGreaterThanOrEqual(50);

    unsubscribe();
    markWarmStartBegin();
    markGridVisible();
    expect(seen).toHaveLength(1);
  });

  it('cancelar duas vezes não estoura', () => {
    const unsubscribe = subscribePerfMetrics(() => {});
    unsubscribe();
    expect(() => unsubscribe()).not.toThrow();
  });

  it('o snapshot é uma cópia — mutá-lo não corrompe o registo', () => {
    markProcessStart(performance.now() - 30);
    markGridVisible();
    const snapshot = getPerfMetrics();
    (snapshot as { coldStartMs: number | null }).coldStartMs = 99999;
    expect(getPerfMetrics().coldStartMs).not.toBe(99999);
  });
});
