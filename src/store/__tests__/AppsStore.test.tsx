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

    expect(LauncherModule.getInstalledApps).toHaveBeenCalledWith('mask-all');
  });

  it('defaults to mask-adaptive-only when no iconTreatment prop is passed (every pre-#486 test wraps AppsProvider this way)', async () => {
    renderHook(() => useApps(), { wrapper });
    await act(async () => {});
    await act(async () => {});

    expect(LauncherModule.getInstalledApps).toHaveBeenCalledWith('mask-adaptive-only');
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
    // One getAppInfo call per installed app, redrawing after the clear.
    expect(LauncherModule.getAppInfo).toHaveBeenCalledWith('com.example.a', 'mask-adaptive-only');
    expect(LauncherModule.getAppInfo).toHaveBeenCalledWith('com.example.b', 'mask-adaptive-only');
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
