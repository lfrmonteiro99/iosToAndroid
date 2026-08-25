import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppsProvider, useApps } from '../AppsStore';
// eslint-disable-next-line @typescript-eslint/no-require-imports -- default export of the jest-mocked module
const LauncherModuleMock = require('../../../modules/launcher-module/src');
const LauncherModule = LauncherModuleMock.default;

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <AppsProvider>{children}</AppsProvider>
);

const APPS_INDEX_KEY = '@iostoandroid/apps_index';

type PackageChange = { action: 'added' | 'removed' | 'replaced'; packageName: string };

const banana = { name: 'Banana', packageName: 'com.example.banana', icon: 'file:///icons/b_1.png', isSystem: false };
const cherry = { name: 'Cherry', packageName: 'com.example.cherry', icon: 'file:///icons/c_1.png', isSystem: false };

/** Returns the handler AppsProvider registered, so tests can fire real events. */
function getHandler(): (c: PackageChange) => Promise<void> | void {
  const calls = (LauncherModuleMock.addPackageChangedListener as jest.Mock).mock.calls;
  expect(calls.length).toBeGreaterThan(0);
  return calls[calls.length - 1][0];
}

beforeEach(() => {
  jest.clearAllMocks();
  (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
  (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
  (LauncherModule.getInstalledApps as jest.Mock).mockResolvedValue([cherry]);
  (LauncherModule.isDefaultLauncher as jest.Mock).mockResolvedValue(false);
  (LauncherModule.getAppInfo as jest.Mock).mockResolvedValue(banana);
  (LauncherModuleMock.addPackageChangedListener as jest.Mock).mockReturnValue(jest.fn());
});

describe('AppsStore — reacts to package install/uninstall broadcasts', () => {
  it('subscribes to package changes on mount and unsubscribes on unmount', async () => {
    const unsubscribe = jest.fn();
    (LauncherModuleMock.addPackageChangedListener as jest.Mock).mockReturnValue(unsubscribe);

    const { unmount } = renderHook(() => useApps(), { wrapper });
    await act(async () => {});

    expect(LauncherModuleMock.addPackageChangedListener).toHaveBeenCalledWith(expect.any(Function));
    expect(unsubscribe).not.toHaveBeenCalled();
    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('adds a newly installed app to the list without a full rescan', async () => {
    const { result } = renderHook(() => useApps(), { wrapper });
    await act(async () => {});
    await act(async () => {});
    (LauncherModule.getInstalledApps as jest.Mock).mockClear();

    await act(async () => {
      await getHandler()({ action: 'added', packageName: 'com.example.banana' });
    });

    expect(result.current.apps.map(a => a.packageName)).toEqual([
      'com.example.banana',
      'com.example.cherry',
    ]);
    // #486/#482: getAppInfo now receives the icon mask (same shape as the
    // grid) and the current icon treatment (default when no iconTreatment prop
    // is passed, as in this wrapper).
    expect(LauncherModule.getAppInfo).toHaveBeenCalledWith(
      'com.example.banana',
      expect.objectContaining({ shape: 'squircle', cacheKey: 'squircle4.7' }),
      'mask-adaptive-only',
    );
    expect(LauncherModule.getInstalledApps).not.toHaveBeenCalled();
  });

  it('removes an uninstalled app from the list', async () => {
    (LauncherModule.getInstalledApps as jest.Mock).mockResolvedValue([banana, cherry]);
    const { result } = renderHook(() => useApps(), { wrapper });
    await act(async () => {});
    await act(async () => {});
    (LauncherModule.getInstalledApps as jest.Mock).mockClear();

    await act(async () => {
      await getHandler()({ action: 'removed', packageName: 'com.example.banana' });
    });

    expect(result.current.apps.map(a => a.packageName)).toEqual(['com.example.cherry']);
    expect(LauncherModule.getAppInfo).not.toHaveBeenCalled();
    expect(LauncherModule.getInstalledApps).not.toHaveBeenCalled();
  });

  it('reprocesses the icon of a replaced (updated) app', async () => {
    (LauncherModule.getInstalledApps as jest.Mock).mockResolvedValue([banana, cherry]);
    const updated = { ...banana, icon: 'file:///icons/b_2.png' };
    (LauncherModule.getAppInfo as jest.Mock).mockResolvedValue(updated);

    const { result } = renderHook(() => useApps(), { wrapper });
    await act(async () => {});
    await act(async () => {});

    await act(async () => {
      await getHandler()({ action: 'replaced', packageName: 'com.example.banana' });
    });

    expect(result.current.apps).toHaveLength(2);
    expect(result.current.apps.find(a => a.packageName === 'com.example.banana')?.icon)
      .toBe('file:///icons/b_2.png');
  });

  it('persists the updated index so the next launch paints the new app', async () => {
    const { result } = renderHook(() => useApps(), { wrapper });
    await act(async () => {});
    await act(async () => {});
    (AsyncStorage.setItem as jest.Mock).mockClear();

    await act(async () => {
      await getHandler()({ action: 'added', packageName: 'com.example.banana' });
    });

    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      APPS_INDEX_KEY,
      JSON.stringify(result.current.apps),
    );
  });

  it('N installs in rapid succession cost N single-package lookups and zero full scans', async () => {
    renderHook(() => useApps(), { wrapper });
    await act(async () => {});
    await act(async () => {});
    (LauncherModule.getInstalledApps as jest.Mock).mockClear();

    const handler = getHandler();
    await act(async () => {
      await Promise.all([
        handler({ action: 'added', packageName: 'com.example.a1' }),
        handler({ action: 'added', packageName: 'com.example.a2' }),
        handler({ action: 'added', packageName: 'com.example.a3' }),
      ]);
    });

    expect(LauncherModule.getInstalledApps).not.toHaveBeenCalled();
    expect((LauncherModule.getAppInfo as jest.Mock).mock.calls).toHaveLength(3);
  });

  it('ignores an event for a package that is not launchable (getAppInfo returns null)', async () => {
    (LauncherModule.getAppInfo as jest.Mock).mockResolvedValue(null);
    const { result } = renderHook(() => useApps(), { wrapper });
    await act(async () => {});
    await act(async () => {});

    await act(async () => {
      await getHandler()({ action: 'added', packageName: 'com.example.headless' });
    });

    expect(result.current.apps.map(a => a.packageName)).toEqual(['com.example.cherry']);
  });

  // #760: homeApps.position é a fonte de verdade da ordem/pertença — uma app
  // instalada via broadcast (sem passar por loadApps) também precisa de uma
  // entrada, senão fica sem posição atribuída até ao próximo arranque.
  it('atribui a próxima position livre a uma app instalada via broadcast', async () => {
    const { result } = renderHook(() => useApps(), { wrapper });
    await act(async () => {});
    await act(async () => {});
    // cherry (única app do getInstalledApps deste ficheiro) já ganhou position: 0 no loadApps.
    expect(result.current.homeApps).toEqual([{ packageName: 'com.example.cherry', position: 0 }]);

    await act(async () => {
      await getHandler()({ action: 'added', packageName: 'com.example.banana' });
    });

    expect(result.current.homeApps).toEqual(expect.arrayContaining([
      { packageName: 'com.example.cherry', position: 0 },
      { packageName: 'com.example.banana', position: 1 },
    ]));
  });

  it('N instalações em rápida sucessão recebem positions sequenciais sem colidir', async () => {
    (LauncherModule.getAppInfo as jest.Mock).mockImplementation((packageName: string) =>
      Promise.resolve({ name: packageName, packageName, icon: '', isSystem: false }),
    );
    const { result } = renderHook(() => useApps(), { wrapper });
    await act(async () => {});
    await act(async () => {});

    const handler = getHandler();
    await act(async () => {
      await Promise.all([
        handler({ action: 'added', packageName: 'com.example.a1' }),
        handler({ action: 'added', packageName: 'com.example.a2' }),
        handler({ action: 'added', packageName: 'com.example.a3' }),
      ]);
    });

    const positions = result.current.homeApps.map(h => h.position);
    // Sem duplicados: cada app instalada em concorrência ficou com a sua própria position.
    expect(new Set(positions).size).toBe(positions.length);
    expect(result.current.homeApps.map(h => h.packageName)).toEqual(
      expect.arrayContaining(['com.example.cherry', 'com.example.a1', 'com.example.a2', 'com.example.a3']),
    );
  });

  it('a removal for an unknown package leaves the list untouched', async () => {
    const { result } = renderHook(() => useApps(), { wrapper });
    await act(async () => {});
    await act(async () => {});
    const before = result.current.apps;

    await act(async () => {
      await getHandler()({ action: 'removed', packageName: 'com.example.nope' });
    });

    expect(result.current.apps).toBe(before);
  });

  it('does not crash or update state when the event arrives after unmount', async () => {
    const { unmount } = renderHook(() => useApps(), { wrapper });
    await act(async () => {});
    await act(async () => {});
    const handler = getHandler();
    unmount();

    await act(async () => {
      await handler({ action: 'added', packageName: 'com.example.banana' });
    });

    // Nothing to assert beyond "no throw / no act warning": the guard is the point.
    expect(LauncherModule.getInstalledApps).toHaveBeenCalledTimes(1);
  });
});
