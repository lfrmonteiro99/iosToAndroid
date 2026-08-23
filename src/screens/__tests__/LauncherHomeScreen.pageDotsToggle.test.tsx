import React from 'react';
import { View, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { render, waitFor } from '../../test-utils';
import * as AppsStore from '../../store/AppsStore';
import * as FoldersStore from '../../store/FoldersStore';
import { LauncherHomeScreen } from '../LauncherHomeScreen';

// issue #603 — toggle «Show Page Dots» (iOS Home Screen & Dock). O launcher
// renderiza sempre os page dots quando há >1 página; este teste trava que o
// setting showPageDots (default true) controla a renderização e que false os
// esconde — sem alterar o comportamento de layout do resto da home.

const APP_NAMES = Array.from({ length: 26 }, (_, i) =>
  String.fromCharCode(65 + (i % 26)) + (i >= 26 ? i : ''),
);

function makeApp(name: string): AppsStore.InstalledApp {
  const pkg = `com.example.${name.toLowerCase()}`;
  return { name, packageName: pkg, icon: `file:///${pkg}.png`, isSystem: false };
}

function mockApps(apps: AppsStore.InstalledApp[]) {
  jest.spyOn(AppsStore, 'useApps').mockReturnValue({
    apps,
    homeApps: [],
    dockApps: [],
    nonDockApps: apps,
    recentPackages: [],
    recentApps: [],
    isLoading: false,
    refreshApps: jest.fn(() => Promise.resolve()),
    launchApp: jest.fn(() => Promise.resolve(true)),
    addToHome: jest.fn(),
    removeFromHome: jest.fn(),
    addToDock: jest.fn(),
    removeFromDock: jest.fn(),
    removeFromRecents: jest.fn(),
    clearRecents: jest.fn(),
    isDefaultLauncher: true,
    openLauncherSettings: jest.fn(() => Promise.resolve()),
    iconCacheSizeBytes: 0,
    isRebuildingIconCache: false,
    iconCacheRebuildProgress: null,
    rebuildIconCache: jest.fn(() => Promise.resolve()),
  } as ReturnType<typeof AppsStore.useApps>);
}

function mockFolders(folders: FoldersStore.AppFolder[]) {
  jest.spyOn(FoldersStore, 'useFolders').mockReturnValue({
    folders,
    createFolder: jest.fn(),
    renameFolder: jest.fn(),
    addToFolder: jest.fn(),
    removeFromFolder: jest.fn(),
    deleteFolder: jest.fn(),
    getFolderForApp: jest.fn((pkg: string) => folders.find((f) => f.apps.includes(pkg))),
    isReady: true,
  } as ReturnType<typeof FoldersStore.useFolders>);
}

function seedSettings(partial: Record<string, unknown>) {
  (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
    key === '@iostoandroid/settings'
      ? Promise.resolve(JSON.stringify(partial))
      : Promise.resolve(null),
  );
}

/** Conta os dots renderizados (estilo pageDot: width 7, height 7, radius 3.5). */
function countPageDots(root: ReturnType<typeof render>): number {
  // react-native style numbers come through unchanged in jsdom, so flatten + compare.
  const all = root.UNSAFE_getAllByType(View);
  return all.filter((n: { props?: { style?: unknown } }) => {
    const s = StyleSheet.flatten(n.props?.style) as Record<string, unknown> | undefined;
    return !!s && s.width === 7 && s.height === 7 && s.borderRadius === 3.5;
  }).length;
}

// 26 apps reais + 14 virtuais = 40 itens; 4x6 = 24/page → 2 páginas (40 > 24).
function manyApps() {
  return APP_NAMES.map(makeApp);
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('LauncherHomeScreen page dots toggle (#603)', () => {
  it('renders page dots when there is more than one page and showPageDots is default', async () => {
    seedSettings({ gridColumns: 4, gridRows: 6 });
    mockApps(manyApps());
    mockFolders([]);

    const root = render(<LauncherHomeScreen />);
    await waitFor(
      () => expect(countPageDots(root)).toBeGreaterThan(0),
      { timeout: 3000 },
    );
    expect(countPageDots(root)).toBeGreaterThanOrEqual(2);
    root.unmount();
  });

  it('hides page dots when settings.showPageDots is false (even with >1 page)', async () => {
    seedSettings({ gridColumns: 4, gridRows: 6, showPageDots: false });
    mockApps(manyApps());
    mockFolders([]);

    const root = render(<LauncherHomeScreen />);
    // Espera que a home monte (páginas presentes) antes de afirmar sobre os dots.
    await waitFor(
      () => expect(root.getByTestId('launcher-page-grid-0')).toBeTruthy(),
      { timeout: 3000 },
    );
    // A grid continua lá (layout não regredido)...
    expect(root.getByTestId('launcher-page-grid-0')).toBeTruthy();
    // ...mas os dots desaparecem.
    expect(countPageDots(root)).toBe(0);
    root.unmount();
  });

  it('still renders the grid pages (no layout regression) when dots are hidden', async () => {
    seedSettings({ gridColumns: 4, gridRows: 6, showPageDots: false });
    mockApps(manyApps());
    mockFolders([]);

    const root = render(<LauncherHomeScreen />);
    await waitFor(
      () => expect(root.getByTestId('launcher-page-grid-1')).toBeTruthy(),
      { timeout: 3000 },
    );
    expect(root.getByTestId('launcher-page-grid-1')).toBeTruthy();
    root.unmount();
  });
});
