/**
 * Overrides de categorias da App Library (#516, sub-issue de #472).
 *
 * O `categorizeApp` (em AppLibraryScreen) devolve o *nome de exibição* da
 * categoria ('Social', 'Games', …). Esse nome é volátil: se o utilizador o
 * renomear, passa a ser a "chave" e a atribuição parte. Por isso todo o
 *OverrideSystem opera sobre **chaves estáveis** (`'social'`, `'games'`, …),
 * nunca sobre o nome exibido. O nome exibido é sempre derivado de
 * `renamed[chave] ?? default`.
 *
 * Precedência da atribuição de uma app a uma categoria (ver teste de
 * precedência):
 *   appOverrides[packageName]  >  ApplicationInfo.category  >  keywords  >  Other
 *
 * Estrutura de `CategoryOverrideSettings`:
 *   hidden:       string[]                          — chaves estáveis ocultas
 *   renamed:      Record<string, string>            — chave estável -> nome do utilizador
 *   order:        string[]                          — ordem explícita (chaves estáveis)
 *   appOverrides: Record<string, string>            — packageName -> chave estável
 */

import type { InstalledApp } from '../store/AppsStore';

export interface CategoryOverrideSettings {
  /** Chaves estáveis das categorias ocultas (removidas da grelha). */
  hidden: string[];
  /** chave estável -> nome exibido escolhido pelo utilizador. */
  renamed: Record<string, string>;
  /** Ordem explícita, como lista de chaves estáveis. */
  order: string[];
  /** packageName -> chave estável da categoria escolhida pelo utilizador. */
  appOverrides: Record<string, string>;
}

export const DEFAULT_CATEGORY_OVERRIDES: CategoryOverrideSettings = {
  hidden: [],
  renamed: {},
  order: [],
  appOverrides: {},
};

/**
 * Nome de exibição devolvido por `categorizeApp` -> chave estável.
 * Mantém o mapeamento das 11 categorias atuais + 'Other'. Categorias futuras
 * (não listadas aqui) usam o próprio nome como chave — ver `keyForCategoryName`.
 */
export const CATEGORY_STABLE_KEYS: Record<string, string> = {
  Social: 'social',
  Entertainment: 'entertainment',
  Games: 'games',
  'Productivity & Finance': 'productivity-finance',
  Utilities: 'utilities',
  'Shopping & Food': 'shopping-food',
  Creativity: 'creativity',
  'Information & Reading': 'information-reading',
  Travel: 'travel',
  'Health & Fitness': 'health-fitness',
  Education: 'education',
  Other: 'other',
};

export const STABLE_KEY_TO_NAME: Record<string, string> = Object.fromEntries(
  Object.entries(CATEGORY_STABLE_KEYS).map(([name, key]) => [key, name]),
);

export const OTHER_KEY = 'other';

/**
 * Resolve a chave estável para o nome de exibição que `categorizeApp` devolve.
 * Categorias desconhecidas (versão futura) usam o próprio nome como chave,
 * garantindo que continuam a aparecer em vez de serem silenciosamente perdidas.
 */
export function keyForCategoryName(name: string): string {
  return CATEGORY_STABLE_KEYS[name] ?? name;
}

/** Nome exibido para uma chave estável, aplicando `renamed` se existir. */
export function displayNameForKey(key: string, renamed: Record<string, string>): string {
  return renamed[key] ?? STABLE_KEY_TO_NAME[key] ?? key;
}

export interface CategorySection {
  /** Chave estável — usada como React key (não parte ao renomear). */
  key: string;
  /** Nome exibido (já com `renamed` aplicado). */
  displayName: string;
  apps: InstalledApp[];
}

/**
 * Aplica os overrides e devolve as secções da grelha, já ordenadas.
 *
 * Regras:
 *  - `appOverrides` tem precedência total sobre a cascata (recebe a chave já
 *    resolvida, pelo que nem `categorizeApp` é consultado).
 *  - Categoria em `hidden` (exceto 'other') tem as suas apps redirecionadas
 *    para 'other' — ocultar não é apagar: as apps continuam alcançáveis na
 *    grelha (Other) e na pesquisa (que é global, independente disto).
 *  - 'other' é sempre mostrado se tiver apps, mesmo que esteja em `hidden`
 *    (porque recebeu apps de categorias ocultas) — garante alcançabilidade.
 *  - Ordem: primeiro as chaves de `order` (que existam e não estejam ocultas),
 *    depois as restantes por ordem alfabética do nome exibido, com 'other'
 *    sempre em último.
 */
export function buildCategorySections(
  apps: InstalledApp[],
  overrides: CategoryOverrideSettings,
  categorize: (app: InstalledApp) => string,
): CategorySection[] {
  const hiddenSet = new Set(overrides.hidden);

  const groups: Record<string, InstalledApp[]> = {};
  const ensure = (k: string): InstalledApp[] => {
    if (!groups[k]) groups[k] = [];
    return groups[k];
  };

  for (const app of apps) {
    // 1. appOverride — precedência máxima, ignora a cascata inteira.
    const override = overrides.appOverrides[app.packageName];
    let key: string;
    if (override !== undefined) {
      key = override;
    } else {
      key = keyForCategoryName(categorize(app));
    }

    // 2. Ocultar: redireciona para 'other' (a menos que seja 'other' já).
    if (hiddenSet.has(key) && key !== OTHER_KEY) {
      key = OTHER_KEY;
    }

    ensure(key).push(app);
  }

  // 'other' só é efetivamente oculto se ficar sem apps (caso contrário tem de
  // aparecer para receber as apps das categorias ocultas).
  const isEffectivelyHidden = (k: string): boolean =>
    hiddenSet.has(k) && !(k === OTHER_KEY && (groups[k]?.length ?? 0) > 0);

  const orderedKeys = overrides.order.filter(
    (k) => groups[k] && !isEffectivelyHidden(k),
  );
  const remaining = Object.keys(groups)
    .filter((k) => !overrides.order.includes(k))
    .sort((a, b) => {
      if (a === OTHER_KEY) return 1;
      if (b === OTHER_KEY) return -1;
      return displayNameForKey(a, overrides.renamed).localeCompare(
        displayNameForKey(b, overrides.renamed),
      );
    });

  return [...orderedKeys, ...remaining].map((k) => ({
    key: k,
    displayName: displayNameForKey(k, overrides.renamed),
    apps: groups[k],
  }));
}

/**
 * Devolve um novo `CategoryOverrideSettings` com `packageName` recategorizado
 * para a chave estável `targetKey`. Puro — usado pelo long-press na App Library
 * e pelos testes.
 */
export function recategorizeApp(
  overrides: CategoryOverrideSettings,
  packageName: string,
  targetKey: string,
): CategoryOverrideSettings {
  return {
    ...overrides,
    appOverrides: { ...overrides.appOverrides, [packageName]: targetKey },
  };
}
