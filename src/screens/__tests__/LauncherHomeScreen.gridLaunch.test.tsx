import React from 'react';
import { render, fireEvent, waitFor } from '../../test-utils';
import * as AppsStore from '../../store/AppsStore';
import * as FoldersStore from '../../store/FoldersStore';
import * as SettingsStore from '../../store/SettingsStore';
import { LauncherHomeScreen } from '../LauncherHomeScreen';

// Reported from a device: a third-party app cannot be opened from the home grid,
// only from the App Library. The two paths differ in exactly one way — the grid
// passes a `measure` function, which routes the launch through the icon-expand
// overlay and only calls launchApp from the overlay's onExpandComplete, while
// the App Library calls launchApp directly. So the grid has a whole animation
// in front of it that the App Library does not, and if that animation never
// reports completion the app never launches and the tap looks ignored.
//
// These tests pin the launch actually happening on the grid, for both the
// animated and the non-animated route.

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn(), push: jest.fn() }),
}));

const mockLaunchApp = jest.fn(() => Promise.resolve(true));

const realApp = (name: string, packageName: string): AppsStore.InstalledApp => ({
  name,
  packageName,
  icon: 'content://com.iostoandroid.icons/one.png',
  isSystem: false,
});

const APP = realApp('Chess Deluxe', 'com.example.chess');

function mockApps() {
  jest.spyOn(AppsStore, 'useApps').mockReturnValue({
    apps: [APP],
    visibleApps: [APP],
    nonDockApps: [APP],
    homeApps: [{ packageName: APP.packageName, position: 0 }],
    dockApps: [],
    recentPackages: [], recentApps: [], isLoading: false,
    refreshApps: jest.fn(() => Promise.resolve()),
    launchApp: mockLaunchApp,
    addToHome: jest.fn(), removeFromHome: jest.fn(), addToDock: jest.fn(), removeFromDock: jest.fn(),
    removeFromRecents: jest.fn(), clearRecents: jest.fn(), isDefaultLauncher: true,
    openLauncherSettings: jest.fn(() => Promise.resolve()), hiddenApps: [],
    hideApp: jest.fn(), unhideApp: jest.fn(), iconCacheSizeBytes: 0, isRebuildingIconCache: false,
    iconCacheRebuildProgress: null, rebuildIconCache: jest.fn(() => Promise.resolve()),
    compactHomeLayout: jest.fn(), swapHomeApps: jest.fn(), libraryOnlyApps: [],
    protectedApps: [], protectApp: jest.fn(), unprotectApp: jest.fn(),
  } as ReturnType<typeof AppsStore.useApps>);
}

function mockFolders() {
  jest.spyOn(FoldersStore, 'useFolders').mockReturnValue({
    folders: [],
    createFolder: jest.fn(), renameFolder: jest.fn(), addToFolder: jest.fn(),
    removeFromFolder: jest.fn(), deleteFolder: jest.fn(),
    getFolderForApp: jest.fn(() => undefined), isReady: true,
  } as unknown as ReturnType<typeof FoldersStore.useFolders>);
}

function withSettings(overrides: Partial<SettingsStore.SettingsState>) {
  jest.spyOn(SettingsStore, 'useSettings').mockReturnValue({
    settings: { ...SettingsStore.DEFAULT_SETTINGS, ...overrides },
    update: jest.fn(),
    updateMany: jest.fn(),
    reset: jest.fn(),
    syncFromDevice: jest.fn(() => Promise.resolve()),
    isReady: true,
    activeFocusMode: null,
    setFocusMode: jest.fn(),
  } as unknown as ReturnType<typeof SettingsStore.useSettings>);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockApps();
  mockFolders();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('LauncherHomeScreen third-party app launch from the grid', () => {
  it('launches the app when the icon-expand animation is OFF', async () => {
    // The short path: no overlay, launchApp straight away. If even this fails,
    // the problem is the store, not the animation.
    withSettings({ appLaunchAnimation: false });
    const { getByLabelText } = render(<LauncherHomeScreen />);

    fireEvent.press(getByLabelText('Open Chess Deluxe'));

    await waitFor(() => expect(mockLaunchApp).toHaveBeenCalledWith('com.example.chess'));
  });

  it('launches the app when the icon-expand animation is ON', async () => {
    // The reported path. launchApp is called from the overlay's
    // onExpandComplete, so this fails if the overlay never reports finishing.
    withSettings({ appLaunchAnimation: true });
    const { getByLabelText } = render(<LauncherHomeScreen />);

    fireEvent.press(getByLabelText('Open Chess Deluxe'));

    await waitFor(() => expect(mockLaunchApp).toHaveBeenCalledWith('com.example.chess'), {
      timeout: 5000,
    });
  });

  it('launches exactly once per tap, not twice', async () => {
    // Both routes ending in launchApp would double-launch, which on Android
    // shows as the app opening and immediately re-opening.
    withSettings({ appLaunchAnimation: true });
    const { getByLabelText } = render(<LauncherHomeScreen />);

    fireEvent.press(getByLabelText('Open Chess Deluxe'));

    await waitFor(() => expect(mockLaunchApp).toHaveBeenCalled(), { timeout: 5000 });
    expect(mockLaunchApp).toHaveBeenCalledTimes(1);
  });
});
