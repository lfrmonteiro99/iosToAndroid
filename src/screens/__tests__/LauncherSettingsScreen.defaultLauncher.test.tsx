import React from 'react';
import { render, fireEvent, waitFor } from '../../test-utils';
import * as AppsStore from '../../store/AppsStore';
import { LauncherSettingsScreen } from '../LauncherSettingsScreen';

// Reported from a device: "when this launcher is the default there is no way
// back to the original Android launcher."
//
// That was accurate. openLauncherSettings() opens Settings.ACTION_HOME_SETTINGS
// — Android's home-launcher picker, which is the way back — but the only thing
// that called it was the "Set Now" button on the home screen's banner, and that
// banner is hidden precisely when this app IS the default. The escape hatch
// disappeared at the exact moment it became useful.
//
// The row is therefore unconditional; only its wording depends on the state.

const mockOpenLauncherSettings = jest.fn(() => Promise.resolve());

function mockApps(isDefaultLauncher: boolean) {
  jest.spyOn(AppsStore, 'useApps').mockReturnValue({
    apps: [], visibleApps: [], nonDockApps: [], homeApps: [], dockApps: [],
    recentPackages: [], recentApps: [], isLoading: false,
    refreshApps: jest.fn(() => Promise.resolve()),
    launchApp: jest.fn(() => Promise.resolve(true)),
    addToHome: jest.fn(), removeFromHome: jest.fn(), addToDock: jest.fn(), removeFromDock: jest.fn(),
    removeFromRecents: jest.fn(), clearRecents: jest.fn(),
    isDefaultLauncher,
    openLauncherSettings: mockOpenLauncherSettings,
    hiddenApps: [], hideApp: jest.fn(), unhideApp: jest.fn(),
    iconCacheSizeBytes: 0, isRebuildingIconCache: false, iconCacheRebuildProgress: null,
    rebuildIconCache: jest.fn(() => Promise.resolve()),
    compactHomeLayout: jest.fn(), swapHomeApps: jest.fn(), libraryOnlyApps: [],
    protectedApps: [], protectApp: jest.fn(), unprotectApp: jest.fn(),
  } as unknown as ReturnType<typeof AppsStore.useApps>);
}

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('LauncherSettingsScreen default-launcher row', () => {
  it('offers a way OUT when this app is already the default', async () => {
    // The regression this exists for: once default, the banner (and its "Set
    // Now") is gone, so this row is the only remaining route to the picker.
    mockApps(true);
    const { getByText } = render(<LauncherSettingsScreen />);

    await waitFor(() => expect(getByText('Change Default Launcher')).toBeTruthy());
    expect(getByText('Currently this app')).toBeTruthy();
  });

  it('offers a way IN when another launcher is the default', async () => {
    mockApps(false);
    const { getByText } = render(<LauncherSettingsScreen />);

    await waitFor(() => expect(getByText('Set as Default Launcher')).toBeTruthy());
    expect(getByText('Currently another launcher')).toBeTruthy();
  });

  it('opens the system picker from the row, in the already-default state', async () => {
    mockApps(true);
    const { getByText } = render(<LauncherSettingsScreen />);

    await waitFor(() => expect(getByText('Change Default Launcher')).toBeTruthy());
    fireEvent.press(getByText('Change Default Launcher'));

    expect(mockOpenLauncherSettings).toHaveBeenCalled();
  });

  it('opens the system picker from the row, in the not-yet-default state', async () => {
    mockApps(false);
    const { getByText } = render(<LauncherSettingsScreen />);

    await waitFor(() => expect(getByText('Set as Default Launcher')).toBeTruthy());
    fireEvent.press(getByText('Set as Default Launcher'));

    expect(mockOpenLauncherSettings).toHaveBeenCalled();
  });

  it('is present in BOTH states — the row is never conditional', async () => {
    // The whole point. A row that only appears in one state is how the escape
    // hatch went missing in the first place.
    for (const isDefault of [true, false]) {
      mockApps(isDefault);
      const { queryByText, unmount } = render(<LauncherSettingsScreen />);
      await waitFor(() =>
        expect(
          queryByText('Change Default Launcher') ?? queryByText('Set as Default Launcher'),
        ).toBeTruthy(),
      );
      unmount();
      jest.restoreAllMocks();
    }
  });
});
