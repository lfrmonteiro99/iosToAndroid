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
