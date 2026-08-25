import { categorizeApp } from '../AppLibraryScreen';
import type { InstalledApp } from '../../store/AppsStore';

function app(overrides: Partial<InstalledApp>): InstalledApp {
  return {
    name: 'Some App',
    packageName: 'com.example.someapp',
    icon: '',
    isSystem: false,
    ...overrides,
  };
}

describe('categorizeApp — cascata de 3 niveis (nativo > keywords > Other)', () => {
  // --- Nivel 1: ApplicationInfo.category nativo tem precedencia ---
  it('usa a categoria nativa "game" mesmo quando o nome bate com keyword de outra categoria', () => {
    // "Facebook" bateria com a keyword de Social — a categoria nativa deve ganhar
    const result = categorizeApp(app({ name: 'Facebook Gaming', category: 'game' }));
    expect(result).toBe('Games');
  });

  it.each([
    ['social', 'Social'],
    ['news', 'Information & Reading'],
    ['maps', 'Travel'],
    ['productivity', 'Productivity & Finance'],
    ['audio', 'Entertainment'],
    ['video', 'Entertainment'],
    ['image', 'Creativity'],
    ['accessibility', 'Utilities'],
    ['game', 'Games'],
  ])('mapeia a categoria nativa "%s" para "%s"', (native, expected) => {
    const result = categorizeApp(app({ name: 'App Generico', category: native }));
    expect(result).toBe(expected);
  });

  // --- Nivel 2: fallback por keywords quando a categoria nativa nao existe ---
  it('cai para keywords quando category e a string literal "undefined" (API 24/25 ou modulo antigo)', () => {
    const result = categorizeApp(app({ name: 'Spotify', category: 'undefined' }));
    expect(result).toBe('Entertainment');
  });

  it('cai para keywords quando category esta totalmente ausente (cache antigo, app virtual)', () => {
    const result = categorizeApp(app({ name: 'Spotify', category: undefined }));
    expect(result).toBe('Entertainment');
  });

  it('Games e categoria propria via keyword — nao cai em Entertainment', () => {
    const result = categorizeApp(app({ name: 'Candy Crush Saga', packageName: 'com.king.candycrush' }));
    expect(result).toBe('Games');
  });

  it.each([
    ['Strava', 'com.strava.app', 'Health & Fitness'],
    ['Duolingo', 'com.duolingo.app', 'Education'],
    ['Canva', 'com.canva.editor', 'Creativity'],
    ['Kindle', 'com.example.kindlereader', 'Information & Reading'],
    ['Uber', 'com.ubercab', 'Travel'],
  ])('categoriza "%s" como "%s" via keyword quando nao ha categoria nativa util', (name, pkg, expected) => {
    const result = categorizeApp(app({ name, packageName: pkg, category: 'undefined' }));
    expect(result).toBe(expected);
  });

  // --- Nivel 3: Other quando nada bate ---
  it('devolve "Other" quando nem a categoria nativa nem nenhuma keyword batem', () => {
    const result = categorizeApp(app({ name: 'Xyzzy Foo Bar', packageName: 'com.unknown.xyzzy', category: 'undefined' }));
    expect(result).toBe('Other');
  });
});

describe('categorizeApp — robustez contra dados nativos corrompidos (#699)', () => {
  // O helper nativo `withCategory` (modules/launcher-module/src/index.ts) só
  // normaliza o `category`; um `name` ausente/undefined num payload nativo ou
  // num índice em cache corrompido passa intacto. Sem a guarda, `app.name
  // .toLowerCase()` rebenta e, como a AppLibraryContent é a última página do
  // pager da home (montada inline em LauncherHomeScreen), o throw derruba o
  // launcher inteiro e aparece o ecrã inicial do Android (#699).
  it('não rebenta e devolve uma string quando a app não tem name', () => {
    const result = categorizeApp(app({ name: undefined as never, packageName: 'com.weird.thing', category: 'undefined' }));
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('usa o packageName para as keywords quando o name está ausente', () => {
    const result = categorizeApp(app({ name: undefined as never, packageName: 'com.spotify.app', category: 'undefined' }));
    expect(result).toBe('Entertainment');
  });

  it('trata name vazio (string) como "no match" em vez de rebentar', () => {
    const result = categorizeApp(app({ name: '', packageName: 'com.unknown.xyzzy', category: 'undefined' }));
    expect(result).toBe('Other');
  });

  it('trata name null como ausente, sem rebentar', () => {
    const result = categorizeApp(app({ name: null as never, packageName: 'com.unknown.xyzzy', category: 'undefined' }));
    expect(typeof result).toBe('string');
  });
});
