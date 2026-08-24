import { upsertApp, removeApp } from '../appsIndexReducer';
import type { InstalledApp } from '../AppsStore';

// Regressão: o índice de apps em cache (apps_index, persistido no
// AsyncStorage) é tratado como NÃO confiável — exatamente como o
// categoryOverrides o é desde o #688. Um blob de uma build anterior, truncado
// ou corrompido pode conter entradas que não são objetos, ou objetos sem
// `name` (o campo que o `withCategory`/`dedupeByPackageName` da ponte nativa
// normalizam à SAÍDA, mas que chega intacto do cache persistido).
//
// O appsIndexReducer ordena o índice INTEIRO em cada evento de
// instalar/desinstalar (`upsertApp`/`removeApp` → `byName`), e o `loadApps`
// (AppsStore) lê o blob diretamente para o `allApps`. Como a AppLibraryContent
// é a ÚLTIMA página do pager da home (montada inline), qualquer throw aqui
// derruba o render do pager inteiro e o utilizador vê o ecrã inicial do Android
// em vez da App Library — o sintoma exato do #704.
//
// Os irmãos #696/#699/#688 taparam o caminho de RENDER (categorizeApp,
// AppIcon, categoryOverrides) mas deixaram esta fronteira e o sort do índice
// por normalizar. Este teste exercita a unidade REAL.

const good = (name: string, pkg: string): InstalledApp => ({
  name,
  packageName: pkg,
  icon: `file:///icons/${pkg}_1.png`,
  isSystem: false,
});

// Entrada sem `name` — payload de cache antigo/corrompido.
const nameless = { packageName: 'com.corrupt.entry', icon: '', isSystem: false } as unknown as InstalledApp;

describe('appsIndexReducer — índice com app sem name não rebenta (#704)', () => {
  it('upsertApp insere uma app normal num índice que já tem uma app sem name', () => {
    // O índice em cache já continha a entrada corrompida; chega uma app nova.
    const next = upsertApp([nameless], good('Zebra', 'com.example.zebra'));
    // Não pode lançar, e tem de manter ambas as entradas (a boa na posição certa).
    expect(next).toHaveLength(2);
    expect(next.some((a) => a.packageName === 'com.example.zebra')).toBe(true);
    expect(next.some((a) => a.packageName === 'com.corrupt.entry')).toBe(true);
  });

  it('removeApp remove uma app sem lançar num índice com entrada sem name (e ordena o resto)', () => {
    // Remove a app boa deixando 2 entradas (a corrompida + outra), para que o
    // `.sort(byName)` obrigatório no reducer disparado pelo uso interno.
    const next = removeApp(
      [nameless, good('Apple', 'com.example.apple'), good('Banana', 'com.example.banana')],
      'com.example.apple',
    );
    expect(next.map((a) => a.packageName)).toEqual(['com.corrupt.entry', 'com.example.banana']);
  });

  it('o inverso: um índice só com apps bem-formadas continua a ordenar', () => {
    const next = upsertApp([good('Banana', 'com.example.banana')], good('Apple', 'com.example.apple'));
    expect(next.map((a) => a.name)).toEqual(['Apple', 'Banana']);
  });
});
