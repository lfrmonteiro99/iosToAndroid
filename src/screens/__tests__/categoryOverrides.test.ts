import { categorizeApp } from '../AppLibraryScreen';
import type { InstalledApp } from '../../store/AppsStore';
import {
  DEFAULT_CATEGORY_OVERRIDES,
  buildCategorySections,
  displayNameForKey,
  recategorizeApp,
  keyForCategoryName,
  normalizeCategoryOverrides,
} from '../../utils/categoryOverrides';

function app(overrides: Partial<InstalledApp>): InstalledApp {
  return {
    name: 'Some App',
    packageName: 'com.example.someapp',
    icon: '',
    isSystem: false,
    ...overrides,
  };
}

// Wrapper ínfimo que liga categorizeApp ao helper (categorize é injectado para
// podermos testar em isolamento sem depender da implementação de categorizeApp).
const categorize = (a: InstalledApp) => categorizeApp(a);

describe('categoryOverrides — mecanismo de overrides (sem appOverrides)', () => {
  it('respeita a ordem explícita em order', () => {
    const apps = [
      app({ name: 'Strava', packageName: 'com.strava', category: 'undefined' }), // Health & Fitness
      app({ name: 'Facebook', packageName: 'com.facebook', category: 'social' }), // Social
      app({ name: 'Spotify', packageName: 'com.spotify', category: 'undefined' }), // Entertainment
    ];
    const overrides = {
      ...DEFAULT_CATEGORY_OVERRIDES,
      order: ['social', 'entertainment', 'health-fitness'],
    };
    const sections = buildCategorySections(apps, overrides, categorize);
    expect(sections.map((s) => s.key)).toEqual([
      'social',
      'entertainment',
      'health-fitness',
    ]);
    // 'other' nunca aparece vazio de propósito quando não há apps — aqui não há Other.
    expect(sections.some((s) => s.key === 'other')).toBe(false);
  });

  it('mantém o nome de exibição estável quando se renomeia (chave não parte)', () => {
    const apps = [
      app({ name: 'Facebook', packageName: 'com.facebook', category: 'social' }),
    ];
    const overrides = {
      ...DEFAULT_CATEGORY_OVERRIDES,
      renamed: { social: 'Pessoal' },
    };
    const sections = buildCategorySections(apps, overrides, categorize);
    expect(sections).toHaveLength(1);
    expect(sections[0].key).toBe('social'); // chave inalterada
    expect(sections[0].displayName).toBe('Pessoal'); // só o nome muda
    // A atribuição continua a funcionar: a app está na secção certa.
    expect(sections[0].apps[0].packageName).toBe('com.facebook');
  });

  it('ocultar uma categoria remove-a da grelha mas as apps dela vão para Other (não desaparecem)', () => {
    const apps = [
      app({ name: 'Strava', packageName: 'com.strava', category: 'undefined' }), // Health & Fitness
      app({ name: 'Fitbit', packageName: 'com.fitbit', category: 'undefined' }), // Health & Fitness
      app({ name: 'Spotify', packageName: 'com.spotify', category: 'undefined' }), // Entertainment
    ];
    const overrides = {
      ...DEFAULT_CATEGORY_OVERRIDES,
      hidden: ['health-fitness'],
    };
    const sections = buildCategorySections(apps, overrides, categorize);
    const keys = sections.map((s) => s.key);
    expect(keys).not.toContain('health-fitness');
    expect(keys).toContain('other');
    const other = sections.find((s) => s.key === 'other')!;
    expect(other.apps.map((a) => a.packageName).sort()).toEqual([
      'com.fitbit',
      'com.strava',
    ]);
  });

  it('Other torna-se inalcançável se estiver vazio e oculto (edge: só Other oculto sem apps)', () => {
    const apps = [
      app({ name: 'Spotify', packageName: 'com.spotify', category: 'undefined' }), // Entertainment
    ];
    const overrides = {
      ...DEFAULT_CATEGORY_OVERRIDES,
      hidden: ['other'],
    };
    const sections = buildCategorySections(apps, overrides, categorize);
    // Entertainment aparece; Other, sem apps, fica oculto.
    expect(sections.map((s) => s.key)).toEqual(['entertainment']);
  });

  it('categoria conhecida mas ausente no order antigo aparece na mesma (não fica invisível)', () => {
    // 'Shopping & Food' existe no helper (chave 'shopping-food') mas o order
    // guardado é de uma versão anterior que não a incluía.
    const apps = [
      app({ name: 'Amazon', packageName: 'com.amazon', category: 'undefined' }), // Shopping & Food
    ];
    const overrides = {
      ...DEFAULT_CATEGORY_OVERRIDES,
      order: ['social', 'games'], // order antigo, sem 'shopping-food'
    };
    const sections = buildCategorySections(apps, overrides, categorize);
    expect(sections.map((s) => s.key)).toContain('shopping-food');
    const s = sections.find((s) => s.key === 'shopping-food')!;
    expect(s.displayName).toBe('Shopping & Food');
  });

  it('keyForCategoryName cai para o próprio nome em categoria desconhecida', () => {
    expect(keyForCategoryName('Quantum')).toBe('Quantum');
    expect(keyForCategoryName('Social')).toBe('social');
  });

  it('displayNameForKey aplica renamed e recai em STABLE_KEY_TO_NAME', () => {
    expect(displayNameForKey('social', { social: 'Pessoal' })).toBe('Pessoal');
    expect(displayNameForKey('social', {})).toBe('Social');
    expect(displayNameForKey('unknown-xyz', {})).toBe('unknown-xyz');
  });
});

describe('categoryOverrides — appOverrides tem precedência total (teste de precedência)', () => {
  it('appOverrides vence ApplicationInfo.category', () => {
    // Facebook é social por categoria nativa, mas o utilizador forçou games.
    const apps = [
      app({ name: 'Facebook', packageName: 'com.facebook', category: 'social' }),
    ];
    const overrides = {
      ...DEFAULT_CATEGORY_OVERRIDES,
      appOverrides: { 'com.facebook': 'games' },
    };
    const sections = buildCategorySections(apps, overrides, categorize);
    expect(sections.map((s) => s.key)).toEqual(['games']);
    expect(sections[0].apps[0].packageName).toBe('com.facebook');
  });

  it('appOverrides vence keywords (ignora a cascata inteira)', () => {
    // "Strava" bateria keyword de Health & Fitness, mas override força Travel.
    const apps = [
      app({ name: 'Strava', packageName: 'com.strava', category: 'undefined' }),
    ];
    const overrides = {
      ...DEFAULT_CATEGORY_OVERRIDES,
      appOverrides: { 'com.strava': 'travel' },
    };
    const sections = buildCategorySections(apps, overrides, categorize);
    expect(sections.map((s) => s.key)).toEqual(['travel']);
  });

  it('appOverrides vence Other (app sem match nenhum vai para a categoria forçada)', () => {
    const apps = [
      app({ name: 'Xyzzy Foo', packageName: 'com.unknown.xyzzy', category: 'undefined' }),
    ];
    const overrides = {
      ...DEFAULT_CATEGORY_OVERRIDES,
      appOverrides: { 'com.unknown.xyzzy': 'creativity' },
    };
    const sections = buildCategorySections(apps, overrides, categorize);
    expect(sections.map((s) => s.key)).toEqual(['creativity']);
  });

  it('recategorizeApp produz um override imutável e funcional', () => {
    const base = DEFAULT_CATEGORY_OVERRIDES;
    const next = recategorizeApp(base, 'com.strava', 'travel');
    // imutabilidade: base não é tocado
    expect(base.appOverrides).toEqual({});
    expect(next.appOverrides).toEqual({ 'com.strava': 'travel' });
    const apps = [
      app({ name: 'Strava', packageName: 'com.strava', category: 'undefined' }),
    ];
    const sections = buildCategorySections(apps, next, categorize);
    expect(sections.map((s) => s.key)).toEqual(['travel']);
  });
});

describe('categoryOverrides — fronteiras e o inverso do fix', () => {
  it('sem overrides devolve exactamente o que categorizeApp produziria (baseline intacto)', () => {
    const apps = [
      app({ name: 'Facebook', packageName: 'com.facebook', category: 'social' }),
      app({ name: 'Spotify', packageName: 'com.spotify', category: 'undefined' }),
      app({ name: 'Xyzzy', packageName: 'com.x', category: 'undefined' }),
    ];
    const sections = buildCategorySections(apps, DEFAULT_CATEGORY_OVERRIDES, categorize);
    expect(sections.map((s) => s.key).sort()).toEqual(['entertainment', 'other', 'social']);
  });

  it('lista vazia devolve grelha vazia (sem secções fantasma)', () => {
    const sections = buildCategorySections([], DEFAULT_CATEGORY_OVERRIDES, categorize);
    expect(sections).toEqual([]);
  });

  it('apps com packageName em falta não quebram o appOverrides lookup', () => {
    const apps = [app({ name: 'A', packageName: undefined as never })]; // packageName undefined
    const overrides = {
      ...DEFAULT_CATEGORY_OVERRIDES,
      appOverrides: { 'com.a': 'games' },
    };
    // Não deve lançar; a app sem packageName cai na cascata normal.
    expect(() => buildCategorySections(apps, overrides, categorize)).not.toThrow();
  });

  it('order com chaves inexistentes é ignorado graciosamente', () => {
    const apps = [
      app({ name: 'Spotify', packageName: 'com.spotify', category: 'undefined' }), // Entertainment
    ];
    const overrides = {
      ...DEFAULT_CATEGORY_OVERRIDES,
      order: ['nao-existe', 'entertainment'],
    };
    const sections = buildCategorySections(apps, overrides, categorize);
    expect(sections.map((s) => s.key)).toEqual(['entertainment']);
  });

  it('o inverso do fix: sem appOverrides a app segue a cascata (não fica retida)', () => {
    const apps = [
      app({ name: 'Facebook', packageName: 'com.facebook', category: 'social' }),
    ];
    const sections = buildCategorySections(apps, DEFAULT_CATEGORY_OVERRIDES, categorize);
    expect(sections.map((s) => s.key)).toEqual(['social']);
  });
});

describe('normalizeCategoryOverrides', () => {
  it('devolve DEFAULT para null/undefined/string/array', () => {
    expect(normalizeCategoryOverrides(null)).toEqual(DEFAULT_CATEGORY_OVERRIDES);
    expect(normalizeCategoryOverrides(undefined)).toEqual(DEFAULT_CATEGORY_OVERRIDES);
    expect(normalizeCategoryOverrides('social')).toEqual(DEFAULT_CATEGORY_OVERRIDES);
    expect(normalizeCategoryOverrides(['social'])).toEqual(DEFAULT_CATEGORY_OVERRIDES);
  });

  it('objecto parcial (só hidden) é completado com os restantes campos vazios', () => {
    const out = normalizeCategoryOverrides({ hidden: ['social'] });
    expect(out.hidden).toEqual(['social']);
    expect(out.renamed).toEqual({});
    expect(out.order).toEqual([]);
    expect(out.appOverrides).toEqual({});
  });

  it('descarta entradas inválidas dentro dos campos (não-string, vazias, duplicadas)', () => {
    const out = normalizeCategoryOverrides({
      hidden: ['social', '', 42, 'social'],
      renamed: { social: 'Pessoal', '': 'X', 'games': 7 },
      order: ['entertainment', 99, 'entertainment'],
      appOverrides: { 'com.a': 'games', 'com.b': null },
    });
    expect(out.hidden).toEqual(['social']);
    expect(out.renamed).toEqual({ social: 'Pessoal' });
    expect(out.order).toEqual(['entertainment']);
    expect(out.appOverrides).toEqual({ 'com.a': 'games' });
  });

  it('objecto válido passa intacto (caso feliz)', () => {
    const good = {
      hidden: ['social'],
      renamed: { social: 'Pessoal' },
      order: ['social', 'games'],
      appOverrides: { 'com.a': 'games' },
    };
    expect(normalizeCategoryOverrides(good)).toEqual(good);
  });
});
