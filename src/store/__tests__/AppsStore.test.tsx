import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
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

describe('AppsStore — dock resolution of virtual built-in apps', () => {
  it.each([
    ['com.iostoandroid.notes', 'Notes'],
    ['com.iostoandroid.reminders', 'Reminders'],
    ['com.iostoandroid.mail', 'Mail'],
  ])('addToDock(%s) resolves to a dock entry, not an empty slot', async (packageName, name) => {
    const { result } = renderHook(() => useApps(), { wrapper });
    await act(async () => {});

    // Dock starts full (4 built-ins) — free a slot before adding, since addToDock
    // no-ops past the max of 4.
    await act(async () => {
      result.current.removeFromDock('com.iostoandroid.settings');
    });
    await act(async () => {
      result.current.addToDock(packageName);
    });

    expect(result.current.dockApps.every(Boolean)).toBe(true);
    const dockEntry = result.current.dockApps.find((a) => a.packageName === packageName);
    expect(dockEntry).toBeDefined();
    expect(dockEntry?.name).toBe(name);
  });
});

describe('AppsStore — paints from the cached apps index without waiting for the native scan', () => {
  it('renders the grid from the cached index while getInstalledApps is still pending', async () => {
    const cachedApps = [
      { name: 'Cached App', packageName: 'com.example.cached', icon: 'file:///data/user/0/com.iostoandroid/files/icons/com.example.cached_1.png', isSystem: false },
    ];
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
      Promise.resolve(key === APPS_INDEX_KEY ? JSON.stringify(cachedApps) : null)
    );
    let resolveNative: (apps: unknown[]) => void = () => {};
    (LauncherModule.getInstalledApps as jest.Mock).mockImplementation(
      () => new Promise((resolve) => { resolveNative = resolve; })
    );

    const { result, unmount } = renderHook(() => useApps(), { wrapper });

    // Flush the microtasks for the cache read only — getInstalledApps() is
    // still unresolved at this point, on purpose.
    await act(async () => {});

    expect(result.current.isLoading).toBe(false);
    expect(result.current.apps).toEqual(cachedApps);

    // Let the still-pending native call settle so it doesn't leak into the next test.
    await act(async () => { resolveNative([]); });
    unmount();
  });

  it('falls back to the native scan when there is no cached index (first-ever launch)', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    const nativeApps = [
      { name: 'Native App', packageName: 'com.example.native', icon: 'file:///data/user/0/com.iostoandroid/files/icons/com.example.native_1.png', isSystem: false },
    ];
    (LauncherModule.getInstalledApps as jest.Mock).mockResolvedValue(nativeApps);

    const { result } = renderHook(() => useApps(), { wrapper });
    await act(async () => {});
    await act(async () => {});

    expect(result.current.isLoading).toBe(false);
    expect(result.current.apps).toEqual(nativeApps);
  });

  it('persists the apps returned by getInstalledApps as the index for the next launch', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    const nativeApps = [
      { name: 'Native App', packageName: 'com.example.native', icon: 'file:///data/user/0/com.iostoandroid/files/icons/com.example.native_1.png', isSystem: false },
    ];
    (LauncherModule.getInstalledApps as jest.Mock).mockResolvedValue(nativeApps);

    renderHook(() => useApps(), { wrapper });
    await act(async () => {});
    await act(async () => {});

    expect(AsyncStorage.setItem).toHaveBeenCalledWith(APPS_INDEX_KEY, JSON.stringify(nativeApps));
  });

  it('keeps the painted cache and does not show an error alert when the background refresh fails', async () => {
    const cachedApps = [
      { name: 'Cached App', packageName: 'com.example.cached', icon: 'file:///data/user/0/com.iostoandroid/files/icons/com.example.cached_1.png', isSystem: false },
    ];
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
      Promise.resolve(key === APPS_INDEX_KEY ? JSON.stringify(cachedApps) : null)
    );
    (LauncherModule.getInstalledApps as jest.Mock).mockRejectedValue(new Error('native scan crashed'));

    const { result } = renderHook(() => useApps(), { wrapper });
    await act(async () => {});

    expect(result.current.isLoading).toBe(false);
    expect(result.current.apps).toEqual(cachedApps);
  });
});

// ─── Regressão: blob apps_index persistido (não confiável) não pode rebentar
// a leitura do cache (#704) ────────────────────────────────────────────────
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
      Promise.resolve(key === APPS_INDEX_KEY ? JSON.stringify(cachedApps) : null)
    );
    let resolveNative: (apps: unknown[]) => void = () => {};
    (LauncherModule.getInstalledApps as jest.Mock).mockImplementation(
      () => new Promise((resolve) => { resolveNative = resolve; })
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
      Promise.resolve(key === APPS_INDEX_KEY ? JSON.stringify(cachedApps) : null)
    );
    let resolveNative: (apps: unknown[]) => void = () => {};
    (LauncherModule.getInstalledApps as jest.Mock).mockImplementation(
      () => new Promise((resolve) => { resolveNative = resolve; })
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
});

describe('AppsStore — icon cache (#486: treatment threading, size, manual rebuild)', () => {
  beforeEach(() => {
    (LauncherModule.getIconCacheSizeBytes as jest.Mock).mockResolvedValue(0);
    (LauncherModule.clearIconCache as jest.Mock).mockResolvedValue(0);
    (LauncherModule.getAppInfo as jest.Mock).mockResolvedValue(null);
  });

  it('fetches the icon cache size on mount and exposes it as iconCacheSizeBytes', async () => {
    (LauncherModule.getIconCacheSizeBytes as jest.Mock).mockResolvedValue(2048);

    const { result } = renderHook(() => useApps(), { wrapper });
    await act(async () => {});

    expect(result.current.iconCacheSizeBytes).toBe(2048);
  });

  it('passes the iconTreatment prop through to getInstalledApps', async () => {
    const treatedWrapper = ({ children }: { children: React.ReactNode }) => (
      <AppsProvider iconTreatment="mask-all">{children}</AppsProvider>
    );

    renderHook(() => useApps(), { wrapper: treatedWrapper });
    await act(async () => {});
    await act(async () => {});

    // #486/#482: a máscara (forma/expoente) viaja no 1º argumento, o tratamento no 2º.
    expect(LauncherModule.getInstalledApps).toHaveBeenCalledWith(
      expect.objectContaining({ shape: 'squircle', cacheKey: 'squircle4.7' }),
      'mask-all',
    );
  });

  it('defaults to mask-adaptive-only when no iconTreatment prop is passed (every pre-#486 test wraps AppsProvider this way)', async () => {
    renderHook(() => useApps(), { wrapper });
    await act(async () => {});
    await act(async () => {});

    expect(LauncherModule.getInstalledApps).toHaveBeenCalledWith(
      expect.objectContaining({ shape: 'squircle', cacheKey: 'squircle4.7' }),
      'mask-adaptive-only',
    );
  });

  it('reloads the apps when the iconTreatment prop changes — the cache key invalidates and the icons are re-fetched (#486 acceptance)', async () => {
    // O tratamento entra na chave nativa da cache (IconCache.fileName): mudá-lo
    // tem de forçar um novo getInstalledApps com o valor novo, senão a grelha
    // continuava a mostrar os PNGs antigos até ao próximo arranque.
    let currentTreatment = 'mask-all';
    const treatedWrapper = ({ children }: { children: React.ReactNode }) => (
      <AppsProvider iconTreatment={currentTreatment}>{children}</AppsProvider>
    );

    const { rerender } = renderHook(() => useApps(), { wrapper: treatedWrapper });
    await act(async () => {});
    await act(async () => {});
    expect(LauncherModule.getInstalledApps).toHaveBeenLastCalledWith(
      expect.objectContaining({ shape: 'squircle', cacheKey: 'squircle4.7' }),
      'mask-all',
    );

    (LauncherModule.getInstalledApps as jest.Mock).mockClear();
    currentTreatment = 'none';
    await act(async () => {
      rerender({});
    });
    await act(async () => {});

    expect(LauncherModule.getInstalledApps).toHaveBeenCalledTimes(1);
    expect(LauncherModule.getInstalledApps).toHaveBeenCalledWith(
      expect.objectContaining({ shape: 'squircle', cacheKey: 'squircle4.7' }),
      'none',
    );
  });

  it('rebuildIconCache clears the cache, redraws every installed app one at a time, then refreshes the size', async () => {
    const nativeApps = [
      { name: 'App A', packageName: 'com.example.a', icon: 'file:///a.png', isSystem: false },
      { name: 'App B', packageName: 'com.example.b', icon: 'file:///b.png', isSystem: false },
    ];
    (LauncherModule.getInstalledApps as jest.Mock).mockResolvedValue(nativeApps);
    (LauncherModule.getIconCacheSizeBytes as jest.Mock)
      .mockResolvedValueOnce(0)      // initial mount read
      .mockResolvedValueOnce(4096);  // post-rebuild read

    const { result } = renderHook(() => useApps(), { wrapper });
    await act(async () => {});
    await act(async () => {});
    expect(result.current.apps).toEqual(nativeApps);

    await act(async () => {
      await result.current.rebuildIconCache();
    });

    expect(LauncherModule.clearIconCache).toHaveBeenCalledTimes(1);
    // One getAppInfo call per installed app, redrawing after the clear — com a
    // MESMA máscara (forma/expoente) e o tratamento actuais, para o rebuild não
    // devolver ícones com outra silhueta (#486 + #482).
    expect(LauncherModule.getAppInfo).toHaveBeenCalledWith(
      'com.example.a',
      expect.objectContaining({ shape: 'squircle', cacheKey: 'squircle4.7' }),
      'mask-adaptive-only',
    );
    expect(LauncherModule.getAppInfo).toHaveBeenCalledWith(
      'com.example.b',
      expect.objectContaining({ shape: 'squircle', cacheKey: 'squircle4.7' }),
      'mask-adaptive-only',
    );
    expect(result.current.isRebuildingIconCache).toBe(false);
    expect(result.current.iconCacheRebuildProgress).toBeNull();
    expect(result.current.iconCacheSizeBytes).toBe(4096);
  });

  it('reports incremental progress while rebuilding, not just a 0-to-100 jump', async () => {
    const nativeApps = [
      { name: 'App A', packageName: 'com.example.a', icon: 'file:///a.png', isSystem: false },
      { name: 'App B', packageName: 'com.example.b', icon: 'file:///b.png', isSystem: false },
    ];
    (LauncherModule.getInstalledApps as jest.Mock).mockResolvedValue(nativeApps);

    let resolveFirstRedraw: (v: unknown) => void = () => {};
    (LauncherModule.getAppInfo as jest.Mock)
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirstRedraw = resolve; }))
      .mockResolvedValue(null);

    const { result } = renderHook(() => useApps(), { wrapper });
    await act(async () => {});
    await act(async () => {});

    let rebuildPromise!: Promise<void>;
    act(() => {
      rebuildPromise = result.current.rebuildIconCache();
    });

    // Still awaiting the first package's redraw — progress is 0 of 2, not done.
    await waitFor(() => {
      expect(result.current.isRebuildingIconCache).toBe(true);
      expect(result.current.iconCacheRebuildProgress).toEqual({ done: 0, total: 2 });
    });

    await act(async () => {
      resolveFirstRedraw(null);
      await rebuildPromise;
    });

    expect(result.current.isRebuildingIconCache).toBe(false);
  });

  it('does not start a second rebuild while one is already in flight', async () => {
    let resolveClear: (v: unknown) => void = () => {};
    (LauncherModule.clearIconCache as jest.Mock).mockImplementation(
      () => new Promise((resolve) => { resolveClear = resolve; }),
    );

    const { result } = renderHook(() => useApps(), { wrapper });
    await act(async () => {});
    await act(async () => {});

    let firstCall!: Promise<void>;
    let secondCall!: Promise<void>;
    act(() => {
      firstCall = result.current.rebuildIconCache();
      secondCall = result.current.rebuildIconCache(); // ignored — a rebuild is already running
    });

    // clearIconCache() is behind an await inside rebuildIconCache, so it is not
    // called until the microtask queue drains — waitFor flushes that before asserting.
    await waitFor(() => expect(LauncherModule.clearIconCache).toHaveBeenCalled());
    expect(LauncherModule.clearIconCache).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveClear(0);
      await firstCall;
      await secondCall;
    });
  });
});

describe('AppsStore — new apps destination (#601: newAppsToHome)', () => {
  const banana = { name: 'Banana', packageName: 'com.example.banana', icon: 'file:///icons/b_1.png', isSystem: false };

  // A wrapper that forwards the setting under test, like the app shell
  // (App.tsx → AppsProviderWithIconTreatment) does with settings.newAppsToHome.
  const makeWrapper = (newAppsToHome: boolean) => {
    const Wrapper = ({ children }: { children: React.ReactNode }) => (
      <AppsProvider newAppsToHome={newAppsToHome}>{children}</AppsProvider>
    );
    Wrapper.displayName = `AppsProviderWithNewAppsToHome(${newAppsToHome})`;
    return Wrapper;
  };
  const wrapperWith = makeWrapper;

  beforeEach(() => {
    (LauncherModule.getIconCacheSizeBytes as jest.Mock).mockResolvedValue(0);
    (LauncherModule.clearIconCache as jest.Mock).mockResolvedValue(0);
    (LauncherModule.getAppInfo as jest.Mock).mockResolvedValue(null);
  });

  it('newAppsToHome=true (default): a freshly installed app lands on the home screen', async () => {
    // No cached index → the native scan returns a brand-new package.
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    (LauncherModule.getInstalledApps as jest.Mock).mockResolvedValue([banana]);

    const { result } = renderHook(() => useApps(), { wrapper: wrapperWith(true) });
    await act(async () => {});
    await act(async () => {});

    expect(result.current.apps.map(a => a.packageName)).toContain('com.example.banana');
    expect(result.current.nonDockApps.map(a => a.packageName)).toContain('com.example.banana');
    expect(result.current.libraryOnlyApps).not.toContain('com.example.banana');
  });

  it('newAppsToHome=false: a freshly installed app is kept off the home screen (App Library only)', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    (LauncherModule.getInstalledApps as jest.Mock).mockResolvedValue([banana]);

    const { result } = renderHook(() => useApps(), { wrapper: wrapperWith(false) });
    await act(async () => {});
    await act(async () => {});

    // Still listed in the full app set (so the App Library renders it)…
    expect(result.current.apps.map(a => a.packageName)).toContain('com.example.banana');
    // …but excluded from the home grid…
    expect(result.current.nonDockApps.map(a => a.packageName)).not.toContain('com.example.banana');
    // …and recorded so it stays off home across restarts.
    expect(result.current.libraryOnlyApps).toContain('com.example.banana');
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      '@iostoandroid/library_only',
      expect.stringContaining('com.example.banana'),
    );
  });

  it('newAppsToHome=false does NOT hide apps that were already known before the toggle was off', async () => {
    // The cached index already contains banana → it is an "existing" app, not new.
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
      Promise.resolve(key === APPS_INDEX_KEY ? JSON.stringify([banana]) : null),
    );
    // Native scan agrees banana is still installed (no change).
    (LauncherModule.getInstalledApps as jest.Mock).mockResolvedValue([banana]);

    const { result } = renderHook(() => useApps(), { wrapper: wrapperWith(false) });
    await act(async () => {});
    await act(async () => {});

    // A previously-known app stays on the home screen even with the toggle off.
    expect(result.current.nonDockApps.map(a => a.packageName)).toContain('com.example.banana');
    expect(result.current.libraryOnlyApps).not.toContain('com.example.banana');
  });

  it('removeFromHome adds the package to libraryOnlyApps so it leaves the home grid', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    (LauncherModule.getInstalledApps as jest.Mock).mockResolvedValue([banana]);

    const { result } = renderHook(() => useApps(), { wrapper: wrapperWith(true) });
    await act(async () => {});
    await act(async () => {});
    expect(result.current.nonDockApps.map(a => a.packageName)).toContain('com.example.banana');

    await act(async () => {
      result.current.removeFromHome('com.example.banana');
    });

    expect(result.current.nonDockApps.map(a => a.packageName)).not.toContain('com.example.banana');
    expect(result.current.libraryOnlyApps).toContain('com.example.banana');
  });

  it('addToHome removes the package from libraryOnlyApps so it returns to the home grid', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    (LauncherModule.getInstalledApps as jest.Mock).mockResolvedValue([banana]);

    const { result } = renderHook(() => useApps(), { wrapper: wrapperWith(true) });
    await act(async () => {});
    await act(async () => {});

    await act(async () => {
      result.current.removeFromHome('com.example.banana');
    });
    expect(result.current.nonDockApps.map(a => a.packageName)).not.toContain('com.example.banana');

    await act(async () => {
      result.current.addToHome('com.example.banana');
    });
    expect(result.current.nonDockApps.map(a => a.packageName)).toContain('com.example.banana');
    expect(result.current.libraryOnlyApps).not.toContain('com.example.banana');
  });
});

describe('AppsStore — home grid holes (#762: removeFromHome no longer recompacts positions)', () => {
  const STORAGE_KEY = '@iostoandroid/apps_layout';
  const apple = { name: 'Apple', packageName: 'com.example.apple', icon: 'file:///icons/a_1.png', isSystem: false };
  const banana = { name: 'Banana', packageName: 'com.example.banana', icon: 'file:///icons/b_1.png', isSystem: false };
  const cherry = { name: 'Cherry', packageName: 'com.example.cherry', icon: 'file:///icons/c_1.png', isSystem: false };

  function seedLayout(homeApps: Array<{ packageName: string; position: number }>) {
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
      Promise.resolve(key === STORAGE_KEY ? JSON.stringify({ dockApps: [], homeApps }) : null),
    );
  }

  // NOTA: `removeFromHome` já era um simples `filter` em `main` — nunca
  // recomprimiu as posições, ao contrário do que o enunciado do #762 diz. Este
  // teste é uma guarda de regressão (passa em `main`), não a prova do fix: a
  // recompactação que se via era feita pelo render, e é essa que
  // `layoutHomeAppsWithGaps` corrige.
  it('removing an app from the middle of homeApps leaves the others positions untouched (hole preserved)', async () => {
    seedLayout([
      { packageName: 'com.example.apple', position: 0 },
      { packageName: 'com.example.banana', position: 1 },
      { packageName: 'com.example.cherry', position: 2 },
    ]);
    (LauncherModule.getInstalledApps as jest.Mock).mockResolvedValue([apple, banana, cherry]);
    const { result } = renderHook(() => useApps(), { wrapper });
    await act(async () => {});
    await act(async () => {});
    expect(result.current.homeApps).toEqual([
      { packageName: 'com.example.apple', position: 0 },
      { packageName: 'com.example.banana', position: 1 },
      { packageName: 'com.example.cherry', position: 2 },
    ]);

    await act(async () => {
      result.current.removeFromHome('com.example.banana');
    });

    // banana disappears; apple keeps 0 and — crucially — cherry KEEPS 2,
    // it is not renumbered down to 1. A recompacting implementation would
    // produce position 1 for cherry here.
    expect(result.current.homeApps).toEqual([
      { packageName: 'com.example.apple', position: 0 },
      { packageName: 'com.example.cherry', position: 2 },
    ]);
  });

  it('compactHomeLayout reassigns sequential positions (0,1,2,...) without dropping or reordering apps', async () => {
    seedLayout([
      { packageName: 'com.example.apple', position: 0 },
      { packageName: 'com.example.banana', position: 3 },
      { packageName: 'com.example.cherry', position: 5 },
    ]);
    (LauncherModule.getInstalledApps as jest.Mock).mockResolvedValue([apple, banana, cherry]);
    const { result } = renderHook(() => useApps(), { wrapper });
    await act(async () => {});
    await act(async () => {});
    await act(async () => {
      result.current.compactHomeLayout();
    });

    expect(result.current.homeApps).toEqual([
      { packageName: 'com.example.apple', position: 0 },
      { packageName: 'com.example.banana', position: 1 },
      { packageName: 'com.example.cherry', position: 2 },
    ]);
  });

  it('compactHomeLayout keeps entries whose package never renders in the grid (dock/folder/built-in duplicate)', async () => {
    const dialer = { name: 'Phone', packageName: 'com.google.android.dialer', icon: '', isSystem: true };
    seedLayout([
      { packageName: 'com.example.apple', position: 0 },
      { packageName: 'com.google.android.dialer', position: 4 },
      { packageName: 'com.example.cherry', position: 9 },
    ]);
    (LauncherModule.getInstalledApps as jest.Mock).mockResolvedValue([apple, dialer, cherry]);
    const { result } = renderHook(() => useApps(), { wrapper });
    await act(async () => {});
    await act(async () => {});

    await act(async () => {
      result.current.compactHomeLayout();
    });

    // The duplicate is invisible in the grid but still owns a slot: dropping
    // it here would renumber every later app on top of a position the grid
    // still skips. All three survive, renumbered 0..2 in the same order.
    expect(result.current.homeApps).toEqual([
      { packageName: 'com.example.apple', position: 0 },
      { packageName: 'com.google.android.dialer', position: 1 },
      { packageName: 'com.example.cherry', position: 2 },
    ]);
  });

  it('compactHomeLayout pressed twice in a row is idempotent (no reorder, no drift)', async () => {
    seedLayout([
      { packageName: 'com.example.apple', position: 0 },
      { packageName: 'com.example.banana', position: 3 },
    ]);
    (LauncherModule.getInstalledApps as jest.Mock).mockResolvedValue([apple, banana]);
    const { result } = renderHook(() => useApps(), { wrapper });
    await act(async () => {});
    await act(async () => {});

    await act(async () => {
      result.current.compactHomeLayout();
      result.current.compactHomeLayout();
    });

    expect(result.current.homeApps).toEqual([
      { packageName: 'com.example.apple', position: 0 },
      { packageName: 'com.example.banana', position: 1 },
    ]);
  });

  it('a hole survives a reload: the removed app is re-numbered after the last position, never back into its old slot', async () => {
    // What persistence looks like after "Remove from Home" on banana: no
    // banana entry, and banana in libraryOnlyApps.
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) => {
      if (key === STORAGE_KEY) {
        return Promise.resolve(JSON.stringify({
          dockApps: [],
          homeApps: [
            { packageName: 'com.example.apple', position: 0 },
            { packageName: 'com.example.cherry', position: 2 },
          ],
        }));
      }
      if (key === '@iostoandroid/library_only') {
        return Promise.resolve(JSON.stringify(['com.example.banana']));
      }
      return Promise.resolve(null);
    });
    (LauncherModule.getInstalledApps as jest.Mock).mockResolvedValue([apple, banana, cherry]);
    const { result } = renderHook(() => useApps(), { wrapper });
    await act(async () => {});
    await act(async () => {});

    // Position 1 stays vacant; banana (still installed, so assignHomePositions
    // gives it a slot) lands after the highest position, not in the hole.
    expect(result.current.homeApps).toEqual([
      { packageName: 'com.example.apple', position: 0 },
      { packageName: 'com.example.cherry', position: 2 },
      { packageName: 'com.example.banana', position: 3 },
    ]);
    expect(result.current.nonDockApps.map(a => a.packageName)).not.toContain('com.example.banana');
  });
});

// ─── #760: homeApps.position é a fonte de verdade da ordem/pertença ────────
//
// addToHome/removeFromHome já escreviam `position`, mas nada mais o fazia:
// uma app carregada pelo scan nativo (loadApps) nunca ganhava entrada em
// homeApps. Sem posição, LauncherHomeScreen não tem por onde ordenar a
// grelha que não seja a ordem de scan — daí este fix atribuir a próxima
// posição livre (maxPos + 1) a qualquer app em falta, na primeira leitura.
describe('AppsStore — homeApps.position atribuída ao carregar (#760)', () => {
  it('instalação limpa (sem homeApps persistido) atribui position sequencial na ordem de scan', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    const apps = [
      { name: 'Alpha', packageName: 'com.example.alpha', icon: '', isSystem: false },
      { name: 'Beta', packageName: 'com.example.beta', icon: '', isSystem: false },
      { name: 'Gamma', packageName: 'com.example.gamma', icon: '', isSystem: false },
    ];
    (LauncherModule.getInstalledApps as jest.Mock).mockResolvedValue(apps);

    const { result } = renderHook(() => useApps(), { wrapper });
    await act(async () => {});
    await act(async () => {});

    expect(result.current.homeApps).toEqual([
      { packageName: 'com.example.alpha', position: 0 },
      { packageName: 'com.example.beta', position: 1 },
      { packageName: 'com.example.gamma', position: 2 },
    ]);
  });

  it('uma app já com position guardada não é reatribuída, e as em falta continuam a partir do maxPos', async () => {
    const savedLayout = JSON.stringify({
      dockApps: [],
      homeApps: [{ packageName: 'com.example.beta', position: 5 }],
    });
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(savedLayout);
    const apps = [
      { name: 'Alpha', packageName: 'com.example.alpha', icon: '', isSystem: false },
      { name: 'Beta', packageName: 'com.example.beta', icon: '', isSystem: false },
    ];
    (LauncherModule.getInstalledApps as jest.Mock).mockResolvedValue(apps);

    const { result } = renderHook(() => useApps(), { wrapper });
    await act(async () => {});
    await act(async () => {});

    // Beta mantém a position persistida (5); Alpha (nova para o homeApps) fica
    // a seguir ao maxPos existente, não reinicia do zero.
    expect(result.current.homeApps).toEqual(expect.arrayContaining([
      { packageName: 'com.example.beta', position: 5 },
      { packageName: 'com.example.alpha', position: 6 },
    ]));
  });

  it('persiste o homeApps calculado para que o próximo arranque não repita o cálculo', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    const apps = [{ name: 'Alpha', packageName: 'com.example.alpha', icon: '', isSystem: false }];
    (LauncherModule.getInstalledApps as jest.Mock).mockResolvedValue(apps);

    renderHook(() => useApps(), { wrapper });
    await act(async () => {});
    await act(async () => {});

    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      '@iostoandroid/apps_layout',
      JSON.stringify({ dockApps: ['com.iostoandroid.phone', 'com.iostoandroid.messages', 'com.iostoandroid.contacts', 'com.iostoandroid.settings'], homeApps: [{ packageName: 'com.example.alpha', position: 0 }] }),
    );
  });
});

describe('AppsStore — hide app (#606: App Library only, sem desinstalar)', () => {
  const banana = { name: 'Banana', packageName: 'com.example.banana', icon: 'file:///icons/b_1.png', isSystem: false };
  const cherry = { name: 'Cherry', packageName: 'com.example.cherry', icon: 'file:///icons/c_1.png', isSystem: false };
  const HIDDEN_KEY = '@iostoandroid/hidden_apps';

  beforeEach(() => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    (LauncherModule.getInstalledApps as jest.Mock).mockResolvedValue([banana, cherry]);
  });

  async function mount() {
    const utils = renderHook(() => useApps(), { wrapper });
    await act(async () => {});
    await act(async () => {});
    return utils;
  }

  it('hideApp remove a app da home e das listas visíveis, mas mantém-na instalada', async () => {
    const { result } = await mount();
    expect(result.current.nonDockApps.map(a => a.packageName)).toContain('com.example.banana');

    await act(async () => { result.current.hideApp('com.example.banana'); });

    expect(result.current.hiddenApps).toContain('com.example.banana');
    expect(result.current.nonDockApps.map(a => a.packageName)).not.toContain('com.example.banana');
    expect(result.current.visibleApps.map(a => a.packageName)).not.toContain('com.example.banana');
    // Continua instalada (e por isso alcançável pela procura, que lê `apps`).
    expect(result.current.apps.map(a => a.packageName)).toContain('com.example.banana');
    // Não afecta as outras apps.
    expect(result.current.nonDockApps.map(a => a.packageName)).toContain('com.example.cherry');
  });

  it('hideApp persiste o conjunto para sobreviver a reinícios', async () => {
    const { result } = await mount();
    await act(async () => { result.current.hideApp('com.example.banana'); });

    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      HIDDEN_KEY,
      JSON.stringify(['com.example.banana']),
    );
  });

  it('hidrata hiddenApps do AsyncStorage no arranque', async () => {
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
      Promise.resolve(key === HIDDEN_KEY ? JSON.stringify(['com.example.cherry']) : null),
    );

    const { result } = await mount();

    expect(result.current.hiddenApps).toEqual(['com.example.cherry']);
    expect(result.current.nonDockApps.map(a => a.packageName)).not.toContain('com.example.cherry');
  });

  it('unhideApp restaura a app às listas visíveis', async () => {
    const { result } = await mount();
    await act(async () => { result.current.hideApp('com.example.banana'); });
    expect(result.current.nonDockApps.map(a => a.packageName)).not.toContain('com.example.banana');

    await act(async () => { result.current.unhideApp('com.example.banana'); });

    expect(result.current.hiddenApps).not.toContain('com.example.banana');
    expect(result.current.nonDockApps.map(a => a.packageName)).toContain('com.example.banana');
    expect(result.current.visibleApps.map(a => a.packageName)).toContain('com.example.banana');
  });

  it('hideApp duas vezes seguidas (duplo toque) não duplica a entrada', async () => {
    const { result } = await mount();
    await act(async () => {
      result.current.hideApp('com.example.banana');
      result.current.hideApp('com.example.banana');
    });

    expect(result.current.hiddenApps.filter(p => p === 'com.example.banana')).toHaveLength(1);
  });

  it('unhideApp de um pacote que não está escondido é um no-op sem escrita', async () => {
    const { result } = await mount();
    (AsyncStorage.setItem as jest.Mock).mockClear();

    await act(async () => { result.current.unhideApp('com.example.cherry'); });

    expect(result.current.hiddenApps).toEqual([]);
    expect(AsyncStorage.setItem).not.toHaveBeenCalledWith(HIDDEN_KEY, expect.anything());
  });

  it('ignora conteúdo corrompido no AsyncStorage em vez de rebentar', async () => {
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
      Promise.resolve(key === HIDDEN_KEY ? '{not json' : null),
    );

    const { result } = await mount();

    expect(result.current.hiddenApps).toEqual([]);
    expect(result.current.nonDockApps.map(a => a.packageName)).toContain('com.example.banana');
  });

  it('descarta entradas não-string de um conjunto persistido inválido', async () => {
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
      Promise.resolve(key === HIDDEN_KEY ? JSON.stringify(['com.example.banana', 42, null]) : null),
    );

    const { result } = await mount();

    expect(result.current.hiddenApps).toEqual(['com.example.banana']);
  });

  it('esconder é independente de libraryOnlyApps: unhide não põe a app de volta na home se ela era library-only', async () => {
    const { result } = await mount();
    await act(async () => { result.current.removeFromHome('com.example.banana'); });
    await act(async () => { result.current.hideApp('com.example.banana'); });
    await act(async () => { result.current.unhideApp('com.example.banana'); });

    // Continua library-only (removeFromHome não é desfeito pelo unhide)…
    expect(result.current.libraryOnlyApps).toContain('com.example.banana');
    expect(result.current.nonDockApps.map(a => a.packageName)).not.toContain('com.example.banana');
    // …mas volta a ser visível na App Library.
    expect(result.current.visibleApps.map(a => a.packageName)).toContain('com.example.banana');
  });
});
