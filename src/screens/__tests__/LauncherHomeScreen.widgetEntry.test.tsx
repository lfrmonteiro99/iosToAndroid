import React from 'react';
import { render, fireEvent, waitFor } from '../../test-utils';
import * as AppsStore from '../../store/AppsStore';
import * as FoldersStore from '../../store/FoldersStore';
import { LauncherHomeScreen } from '../LauncherHomeScreen';

// The gap this covers: widgets were implemented, persisted and rendered at the
// top of home page 0, but the only way to change which ones were on was to
// right-swipe into the Today View, scroll to the bottom and find an "Edit"
// button. iOS puts this behind long-press -> "+", and that is where people look.
// These tests are about the ENTRY POINT existing and being reachable, not about
// what the gallery does (see WidgetGallery.test.tsx for that).

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn(), push: jest.fn() }),
}));

const realApp = (name: string, packageName: string): AppsStore.InstalledApp => ({
  name,
  packageName,
  icon: 'content://icons/one.png',
  isSystem: false,
});

function mockApps(overrides: Record<string, unknown> = {}) {
  jest.spyOn(AppsStore, 'useApps').mockReturnValue({
    apps: [], homeApps: [], dockApps: [], nonDockApps: [], recentPackages: [], recentApps: [],
    isLoading: false, refreshApps: jest.fn(() => Promise.resolve()), launchApp: jest.fn(() => Promise.resolve(true)),
    addToHome: jest.fn(), removeFromHome: jest.fn(), addToDock: jest.fn(), removeFromDock: jest.fn(),
    removeFromRecents: jest.fn(), clearRecents: jest.fn(), isDefaultLauncher: true,
    openLauncherSettings: jest.fn(() => Promise.resolve()), hiddenApps: [], visibleApps: [],
    hideApp: jest.fn(), unhideApp: jest.fn(), iconCacheSizeBytes: 0, isRebuildingIconCache: false,
    iconCacheRebuildProgress: null, rebuildIconCache: jest.fn(() => Promise.resolve()),
    compactHomeLayout: jest.fn(), swapHomeApps: jest.fn(), libraryOnlyApps: [],
    protectedApps: [], protectApp: jest.fn(), unprotectApp: jest.fn(),
    ...overrides,
  } as ReturnType<typeof AppsStore.useApps>);
}

function mockFolders() {
  jest.spyOn(FoldersStore, 'useFolders').mockReturnValue({
    folders: [],
    createFolder: jest.fn(),
    renameFolder: jest.fn(),
    addToFolder: jest.fn(),
    removeFromFolder: jest.fn(),
    deleteFolder: jest.fn(),
    getFolderForApp: jest.fn(() => undefined),
    isReady: true,
  } as unknown as ReturnType<typeof FoldersStore.useFolders>);
}

/** A grid with one real app on it, which is what these tests long-press. */
function renderWithOneApp() {
  const app = realApp('Chess Deluxe', 'com.example.chess');
  mockApps({
    apps: [app],
    visibleApps: [app],
    homeApps: [{ packageName: app.packageName, position: 0 }],
    nonDockApps: [app],
    dockApps: [],
  });
  mockFolders();
  return render(<LauncherHomeScreen />);
}

/**
 * Enters jiggle mode the way a user does: long-press an icon, then pick "Edit
 * Home Screen" from the action sheet. Long-press alone opens the sheet — it does
 * not jiggle — so a test that only long-pressed would never see the "+".
 */
async function enterJiggleMode(utils: ReturnType<typeof renderWithOneApp>) {
  fireEvent(utils.getByLabelText('Open Chess Deluxe'), 'longPress');
  await waitFor(() => expect(utils.getByText('Edit Home Screen')).toBeTruthy());
  fireEvent.press(utils.getByText('Edit Home Screen'));
  await waitFor(() => expect(utils.getByLabelText('Done')).toBeTruthy());
}

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('LauncherHomeScreen widget entry point', () => {
  it('does not show the "+" button outside jiggle mode', () => {
    const { queryByLabelText } = renderWithOneApp();
    expect(queryByLabelText('Add Widget')).toBeNull();
  });

  it('entering Edit Home Screen reveals the "+" alongside Done', async () => {
    const utils = renderWithOneApp();
    await enterJiggleMode(utils);
    expect(utils.getByLabelText('Add Widget')).toBeTruthy();
  });

  it('tapping "+" opens the widget gallery', async () => {
    const utils = renderWithOneApp();
    await enterJiggleMode(utils);
    expect(utils.queryByText('Widgets')).toBeNull();

    fireEvent.press(utils.getByLabelText('Add Widget'));

    await waitFor(() => expect(utils.queryByText('Widgets')).toBeTruthy());
  });

  it('the gallery closes again without leaving jiggle mode', async () => {
    const utils = renderWithOneApp();
    await enterJiggleMode(utils);
    fireEvent.press(utils.getByLabelText('Add Widget'));
    await waitFor(() => expect(utils.queryByText('Widgets')).toBeTruthy());

    fireEvent.press(utils.getByLabelText('Close widget gallery'));

    await waitFor(() => expect(utils.queryByText('Widgets')).toBeNull());
    // Still in jiggle mode: closing the gallery is not "Done".
    expect(utils.getByLabelText('Add Widget')).toBeTruthy();
  });

  it('Done leaves jiggle mode and takes the "+" with it', async () => {
    const utils = renderWithOneApp();
    await enterJiggleMode(utils);

    fireEvent.press(utils.getByLabelText('Done'));

    await waitFor(() => expect(utils.queryByLabelText('Add Widget')).toBeNull());
  });

});
