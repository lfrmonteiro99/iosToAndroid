import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppsProvider, useApps } from '../AppsStore';
// eslint-disable-next-line @typescript-eslint/no-require-imports -- default export of the jest-mocked module, needed to control getInstalledApps() resolution timing per test
const LauncherModule = require('../../../modules/launcher-module/src').default;

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <AppsProvider>{children}</AppsProvider>
);

const APPS_INDEX_KEY = '@iostoandroid/apps_index';

beforeEach(() => {
  jest.clearAllMocks();
  (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
  (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
  (LauncherModule.getInstalledApps as jest.Mock).mockResolvedValue([]);
  (LauncherModule.isDefaultLauncher as jest.Mock).mockResolvedValue(false);
});

// ─── Regressão: o blob apps_index persistido (não confiável) não pode rebentar
// a leitura do cache (#704 / #709) ───────────────────────────────────────────
//
// O `apps_index` vem do AsyncStorage — blob de uma build anterior, truncado ou
// com entradas parciais. A ponte nativa normaliza a SAÍDA (`withCategory`/
// `dedupeByPackageName`), mas aqui lemos o cache PERSISTIDO, que contorna essa
// normalização. Sem saneamento, uma entrada sem `packageName` (chave React /
// duplicados) ou sem `name` (que o appsIndexReducer ordena em `.sort(byName)`)
// chegava ao vivo `allApps`; e como a AppLibraryContent é a última página do
// pager da home, o throw derrubava o launcher e o utilizador via o ecrã
// inicial do Android em vez da App Library. Exercitamos o caminho REAL:
// carregamos um blob malformado no AsyncStorage e a leitura tem de pintar só o
// que é válido, sem lançar.
describe('AppsStore — apps_index malformado no AsyncStorage não rebenta a leitura (#704)', () => {
  it('descarta entradas sem name/packageName e mantém as válidas', async () => {
    const cachedApps = [
      { packageName: 'com.corrupt.noname', icon: '', isSystem: false }, // sem name
      null, // não é objeto
      { name: 'Valid', packageName: 'com.example.valid', icon: '', isSystem: false },
      { packageName: 'com.dup', name: 'Dup', icon: '' }, // duplicado abaixo
      { packageName: 'com.dup', name: 'Dup', icon: '' },
    ];
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
      Promise.resolve(key === APPS_INDEX_KEY ? JSON.stringify(cachedApps) : null),
    );
    let resolveNative: (apps: unknown[]) => void = () => {};
    (LauncherModule.getInstalledApps as jest.Mock).mockImplementation(
      () => new Promise((resolve) => { resolveNative = resolve; }),
    );

    const { result } = renderHook(() => useApps(), { wrapper });
    // Flush só a leitura do cache (native ainda pending, de propósito).
    await act(async () => {});

    expect(result.current.isLoading).toBe(false);
    // Só a entrada válida sobrevive; a sem-name e as não-objeto/duplicadas caem.
    expect(result.current.apps).toEqual([
      { name: 'Valid', packageName: 'com.example.valid', icon: '', isSystem: false },
      { name: 'Dup', packageName: 'com.dup', icon: '', isSystem: false },
    ]);

    await act(async () => { resolveNative([]); });
  });

  it('o inverso: um índice só com apps bem-formadas continua a pintar intacto', async () => {
    const cachedApps = [
      { name: 'Alpha', packageName: 'com.example.alpha', icon: '', isSystem: false },
      { name: 'Beta', packageName: 'com.example.beta', icon: '', isSystem: false },
    ];
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
      Promise.resolve(key === APPS_INDEX_KEY ? JSON.stringify(cachedApps) : null),
    );
    let resolveNative: (apps: unknown[]) => void = () => {};
    (LauncherModule.getInstalledApps as jest.Mock).mockImplementation(
      () => new Promise((resolve) => { resolveNative = resolve; }),
    );

    const { result } = renderHook(() => useApps(), { wrapper });
    // Flush só a leitura do cache (native ainda pending, de propósito).
    await act(async () => {});

    expect(result.current.apps).toHaveLength(2);
    expect(result.current.apps.map((a) => a.packageName)).toEqual([
      'com.example.alpha',
      'com.example.beta',
    ]);

    await act(async () => { resolveNative([]); });
  });

  it('não lança quando o índice tem uma entrada sem name e depois chega um evento de pacote', async () => {
    // Caso de borda real: o índice em cache traz uma app sem name; mais tarde,
    // um broadcast de instalação/remoção dispara upsertApp/removeApp, que
    // ordenam por name. Sem o saneamento, o throw derrubava o launcher.
    const cachedApps = [
      { name: 'Valid', packageName: 'com.example.valid', icon: '', isSystem: false },
      { packageName: 'com.example.noname', icon: '', isSystem: false }, // sem name
    ];
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
      Promise.resolve(key === APPS_INDEX_KEY ? JSON.stringify(cachedApps) : null),
    );
    let resolveNative: (apps: unknown[]) => void = () => {};
    (LauncherModule.getInstalledApps as jest.Mock).mockImplementation(
      () => new Promise((resolve) => { resolveNative = resolve; }),
    );

    const { result } = renderHook(() => useApps(), { wrapper });
    await act(async () => {});

    // Estimula o caminho que ordena por name (igual ao upsertApp interno).
    expect(() => {
      result.current.addToDock('com.example.valid');
    }).not.toThrow();

    await act(async () => { resolveNative([]); });
  });
});
