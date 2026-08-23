import {
  normalizeFocusPageVisibility,
  hiddenPageIndicesForMode,
  filterVisiblePages,
  toggleHiddenPage,
  homePageCount,
} from '../focusPageVisibility';

// Focus filters (#618) — helpers puros. Exercitam as funções exportadas reais
// (nada é reimplementado aqui): o LauncherHomeScreen e o FocusScreen consomem
// exactamente estas.

describe('normalizeFocusPageVisibility', () => {
  it('devolve {} para valores que não são objectos', () => {
    expect(normalizeFocusPageVisibility(undefined)).toEqual({});
    expect(normalizeFocusPageVisibility(null)).toEqual({});
    expect(normalizeFocusPageVisibility(42)).toEqual({});
    expect(normalizeFocusPageVisibility('work')).toEqual({});
    expect(normalizeFocusPageVisibility([1, 2])).toEqual({});
  });

  it('mantém índices inteiros e aceita strings decimais', () => {
    expect(normalizeFocusPageVisibility({ work: [2, '0'] })).toEqual({ work: [0, 2] });
  });

  it('descarta negativos, não-inteiros, NaN, vazios e duplicados', () => {
    expect(
      normalizeFocusPageVisibility({ work: [-1, 1.5, NaN, '', 'abc', 3, 3, null] }),
    ).toEqual({ work: [3] });
  });

  it('descarta modos cujo valor não é array', () => {
    expect(normalizeFocusPageVisibility({ work: 'nope', sleep: [1] })).toEqual({ sleep: [1] });
  });

  it('mantém 0 (fronteira: a primeira página é um índice válido)', () => {
    expect(normalizeFocusPageVisibility({ work: [0] })).toEqual({ work: [0] });
  });
});

describe('hiddenPageIndicesForMode', () => {
  it('devolve [] para o modo off mesmo com entradas guardadas', () => {
    expect(hiddenPageIndicesForMode({ off: [0, 1], work: [1] }, 'off')).toEqual([]);
  });

  it('devolve [] para modo desconhecido, vazio ou mapa ausente', () => {
    expect(hiddenPageIndicesForMode({ work: [1] }, 'sleep')).toEqual([]);
    expect(hiddenPageIndicesForMode({ work: [1] }, '')).toEqual([]);
    expect(hiddenPageIndicesForMode(undefined, 'work')).toEqual([]);
    expect(hiddenPageIndicesForMode(null, 'work')).toEqual([]);
  });

  it('devolve os índices do modo activo', () => {
    expect(hiddenPageIndicesForMode({ work: [0, 2] }, 'work')).toEqual([0, 2]);
  });
});

describe('filterVisiblePages', () => {
  it('devolve a mesma referência quando não há nada oculto', () => {
    const pages = [['a'], ['b']];
    expect(filterVisiblePages(pages, [])).toBe(pages);
  });

  it('remove só as páginas listadas', () => {
    expect(filterVisiblePages(['p0', 'p1', 'p2'], [1])).toEqual(['p0', 'p2']);
  });

  it('ignora índices fora do intervalo', () => {
    expect(filterVisiblePages(['p0'], [7])).toEqual(['p0']);
  });

  it('mantém a primeira página quando todas estão ocultas', () => {
    expect(filterVisiblePages(['p0', 'p1'], [0, 1])).toEqual(['p0']);
  });

  it('lida com lista de páginas vazia', () => {
    expect(filterVisiblePages([], [0])).toEqual([]);
  });
});

describe('toggleHiddenPage', () => {
  it('adiciona um índice ausente e ordena', () => {
    expect(toggleHiddenPage({ work: [2] }, 'work', 0)).toEqual({ work: [0, 2] });
  });

  it('remove um índice já presente (duplo toque volta ao estado inicial)', () => {
    const once = toggleHiddenPage({}, 'work', 1);
    expect(once).toEqual({ work: [1] });
    expect(toggleHiddenPage(once, 'work', 1)).toEqual({ work: [] });
  });

  it('não muta o mapa recebido', () => {
    const before = { work: [1] };
    toggleHiddenPage(before, 'work', 2);
    expect(before).toEqual({ work: [1] });
  });

  it('não toca noutros modos', () => {
    expect(toggleHiddenPage({ sleep: [0] }, 'work', 1)).toEqual({ sleep: [0], work: [1] });
  });

  it('ignora índices inválidos', () => {
    expect(toggleHiddenPage({}, 'work', -1)).toEqual({});
    expect(toggleHiddenPage({}, 'work', 1.5)).toEqual({});
  });
});

describe('homePageCount', () => {
  it('nunca devolve menos de 1', () => {
    expect(homePageCount(0, 24)).toBe(1);
    expect(homePageCount(-5, 24)).toBe(1);
  });

  it('arredonda para cima nos limites exactos e ±1', () => {
    expect(homePageCount(24, 24)).toBe(1);
    expect(homePageCount(25, 24)).toBe(2);
    expect(homePageCount(23, 24)).toBe(1);
  });

  it('protege contra appsPerPage inválido', () => {
    expect(homePageCount(40, 0)).toBe(1);
    expect(homePageCount(40, -3)).toBe(1);
    expect(homePageCount(40, NaN)).toBe(1);
  });
});
