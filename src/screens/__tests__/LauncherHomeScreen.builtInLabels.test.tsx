import React from 'react';
import { render, waitFor } from '../../test-utils';
import * as AppsStore from '../../store/AppsStore';
import * as FoldersStore from '../../store/FoldersStore';
import { LauncherHomeScreen } from '../LauncherHomeScreen';

// Reported from a device, and visible in a screenshot of the home screen: the
// Safari icon was labelled "Browser", Find My was "FindMy" and App Store was
// "AppStore".
//
// Those three are navigation ROUTE names. The grid built its virtual apps with
// `name: String(route)`, so the label was whatever the route happened to be
// called. This asserts through the rendered screen rather than only through the
// table, because the table already held the right strings — in AppsStore's
// VIRTUAL_APPS_MAP, which the grid never consulted.

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn(), push: jest.fn() }),
}));

function mockApps() {
  jest.spyOn(AppsStore, 'useApps').mockReturnValue({
    apps: [], visibleApps: [], nonDockApps: [], homeApps: [], dockApps: [],
    recentPackages: [], recentApps: [], isLoading: false,
    refreshApps: jest.fn(() => Promise.resolve()),
    launchApp: jest.fn(() => Promise.resolve(true)),
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
    folders: [], createFolder: jest.fn(), renameFolder: jest.fn(), addToFolder: jest.fn(),
    removeFromFolder: jest.fn(), deleteFolder: jest.fn(),
    getFolderForApp: jest.fn(() => undefined), isReady: true,
  } as unknown as ReturnType<typeof FoldersStore.useFolders>);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockApps();
  mockFolders();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('built-in icon labels on the home grid', () => {
  it('labels the browser Safari', async () => {
    const { queryByLabelText } = render(<LauncherHomeScreen />);
    await waitFor(() => expect(queryByLabelText('Open Safari')).toBeTruthy());
  });

  it('does not label it Browser — that is the route name', async () => {
    const { queryByLabelText, queryByText } = render(<LauncherHomeScreen />);
    await waitFor(() => expect(queryByLabelText('Open Safari')).toBeTruthy());
    expect(queryByLabelText('Open Browser')).toBeNull();
    expect(queryByText('Browser')).toBeNull();
  });

  it('spaces Find My and App Store', async () => {
    const { queryByLabelText } = render(<LauncherHomeScreen />);
    await waitFor(() => expect(queryByLabelText('Open Find My')).toBeTruthy());
    expect(queryByLabelText('Open App Store')).toBeTruthy();
    expect(queryByLabelText('Open FindMy')).toBeNull();
    expect(queryByLabelText('Open AppStore')).toBeNull();
  });

  it('leaves the built-ins whose label already matched their route alone', async () => {
    // Most of them are the same string in both tables; the fix must not have
    // renamed anything else on the way past.
    const { queryByLabelText } = render(<LauncherHomeScreen />);
    await waitFor(() => expect(queryByLabelText('Open Safari')).toBeTruthy());
    for (const name of ['Weather', 'Health', 'Clock', 'Camera', 'Photos', 'Calendar', 'Calculator', 'Notes', 'Reminders', 'Shortcuts', 'Mail', 'Wallet', 'Maps']) {
      expect(queryByLabelText(`Open ${name}`)).toBeTruthy();
    }
  });
});
