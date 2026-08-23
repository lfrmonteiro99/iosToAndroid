/**
 * Focus filters — page visibility per Focus mode (issue #618, filho de #617).
 *
 * Um Modo de Foco pode esconder páginas inteiras da home (ex.: «Work» esconde a
 * página de lazer). O mapa vive em `settings.focusPageVisibility` e é
 * `modo -> índices de páginas ocultas`. O modo 'off' nunca esconde nada, mesmo
 * que exista uma entrada para ele no armazenamento — «off» significa
 * literalmente sem filtro.
 *
 * O AsyncStorage é um blob JSON escrito por versões anteriores da app, por isso
 * tudo o que sai dele é tratado como não confiável: `normalizeFocusPageVisibility`
 * é o único ponto que converte esse blob na forma canónica.
 */

/** Mapa canónico: chave = modo de Focus, valor = índices de página ocultos. */
export type FocusPageVisibility = Record<string, number[]>;

/**
 * Normaliza o valor lido do AsyncStorage para `Record<string, number[]>`.
 *
 * Aceita índices como número ou como string decimal (o issue propôs `string[]`;
 * ambas as formas são aceites na leitura para não perder configurações escritas
 * por qualquer das leituras). Descarta: não-objectos, arrays no topo, valores
 * que não sejam array, índices negativos, não inteiros, NaN e duplicados.
 */
export function normalizeFocusPageVisibility(raw: unknown): FocusPageVisibility {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: FocusPageVisibility = {};
  for (const [mode, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(value)) continue;
    const seen = new Set<number>();
    for (const entry of value) {
      const n =
        typeof entry === 'number'
          ? entry
          : typeof entry === 'string' && entry.trim() !== ''
          ? Number(entry)
          : NaN;
      if (!Number.isInteger(n) || n < 0) continue;
      seen.add(n);
    }
    out[mode] = Array.from(seen).sort((a, b) => a - b);
  }
  return out;
}

/**
 * Índices ocultos para o modo activo. 'off' (ou modo vazio/desconhecido)
 * devolve sempre uma lista vazia: todas as páginas ficam visíveis.
 */
export function hiddenPageIndicesForMode(
  visibility: FocusPageVisibility | undefined | null,
  mode: string | undefined | null,
): number[] {
  if (!visibility || !mode || mode === 'off') return [];
  const hidden = visibility[mode];
  return Array.isArray(hidden) ? hidden : [];
}

/**
 * Filtra as páginas escondidas pelo modo activo.
 *
 * Devolve sempre pelo menos uma página: se o utilizador esconder todas as
 * páginas de um modo, o pager ficaria sem conteúdo antes da App Library e o
 * clamp de `currentPage` passaria a operar sobre 1 página só — preferimos
 * manter a primeira página visível a apresentar uma home vazia (decisão menos
 * destrutiva, registada no PR).
 */
export function filterVisiblePages<T>(pages: T[], hiddenIndices: number[]): T[] {
  if (hiddenIndices.length === 0) return pages;
  const hidden = new Set(hiddenIndices);
  const kept = pages.filter((_, index) => !hidden.has(index));
  if (kept.length === 0 && pages.length > 0) return [pages[0] as T];
  return kept;
}

/**
 * Alterna um índice de página na lista oculta de um modo, devolvendo um mapa
 * novo (nunca muta o anterior — o estado do store é comparado por referência).
 * Índices inválidos (negativos, não inteiros) são ignorados.
 */
export function toggleHiddenPage(
  visibility: FocusPageVisibility | undefined | null,
  mode: string,
  index: number,
): FocusPageVisibility {
  const base: FocusPageVisibility = { ...(visibility ?? {}) };
  if (!Number.isInteger(index) || index < 0) return base;
  const current = Array.isArray(base[mode]) ? base[mode] : [];
  const next = current.includes(index)
    ? current.filter((i) => i !== index)
    : [...current, index].sort((a, b) => a - b);
  base[mode] = next;
  return base;
}

/**
 * Número de páginas da home para `itemCount` ícones a `appsPerPage` por página.
 * Nunca menos de 1 (a home tem sempre uma página, tal como `LauncherHomeScreen`
 * garante). `appsPerPage <= 0` também devolve 1 em vez de dividir por zero.
 */
export function homePageCount(itemCount: number, appsPerPage: number): number {
  if (!Number.isFinite(itemCount) || !Number.isFinite(appsPerPage) || appsPerPage <= 0) return 1;
  return Math.max(1, Math.ceil(Math.max(0, itemCount) / appsPerPage));
}
