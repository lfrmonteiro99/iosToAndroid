import { upsertApp, removeApp } from '../appsIndexReducer';
import type { InstalledApp } from '../AppsStore';

// #704 / #709 — um índice em cache (@iostoandroid/apps_index) sem `name`
// (ou sem `packageName`) não pode rebentar o pager da home. A AppLibraryContent
// é a última página do pager; um throw na ordenação do índice derrubava o
// launcher inteiro e o utilizador via o ecrã inicial do Android em vez da App
// Library. O appsIndexReducer ordena por `name`, por isso a ausência de `name`
// tem de ser tratada como string vazia, nunca rebentar.

function validApp(over: Partial<InstalledApp>): InstalledApp {
  return { name: 'App', packageName: 'com.example.app', icon: '', isSystem: false, ...over };
}

describe('appsIndexReducer — entradas sem name/packageName não rebentam a ordenação (#704)', () => {
  it('upsertApp não lança quando a app tem name ausente', () => {
    const noName = { packageName: 'com.example.noname', icon: '', isSystem: false } as InstalledApp;
    expect(() => upsertApp([validApp({})], noName)).not.toThrow();
  });

  it('upsertApp não lança quando a app existe no índice com name ausente', () => {
    const existingNoName = {
      packageName: 'com.example.noname',
      icon: '',
      isSystem: false,
    } as InstalledApp;
    const all = [validApp({}), existingNoName];
    // A ordenação por name tem de suportar a entrada ausente de name.
    expect(() => upsertApp(all, validApp({ name: 'Zzz', packageName: 'com.example.zzz' }))).not.toThrow();
  });

  it('removeApp não lança quando o índice contém uma entrada sem name', () => {
    const existingNoName = {
      packageName: 'com.example.noname',
      icon: '',
      isSystem: false,
    } as InstalledApp;
    const all = [validApp({}), existingNoName];
    expect(() => removeApp(all, 'com.example.app')).not.toThrow();
  });

  it('upsertApp ordena corretamente tratando name ausente como string vazia', () => {
    const noName = { packageName: 'com.example.noname', icon: '', isSystem: false } as InstalledApp;
    const out = upsertApp([validApp({ name: 'Beta', packageName: 'com.example.beta' })], noName);
    // Não rebenta e preserva ambas as entradas válidas (não descarta a ausente de name).
    expect(out).toHaveLength(2);
    expect(out.every((a) => typeof a.packageName === 'string')).toBe(true);
  });
});
