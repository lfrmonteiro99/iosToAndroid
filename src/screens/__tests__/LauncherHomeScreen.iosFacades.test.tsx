import React from 'react';
import { render, fireEvent, waitFor } from '../../test-utils';
import * as AppsStore from '../../store/AppsStore';
import * as FoldersStore from '../../store/FoldersStore';
import { LauncherHomeScreen } from '../LauncherHomeScreen';

// Music, News, TV and Podcasts are iOS stock apps this launcher does not
// implement. Rather than four unwritten screens (or four icons that open
// nothing), a facade shows the iOS name and icon and launches the installed
// Android app behind it. This suite is the end-to-end half of that: what lands
// on the grid, what a tap launches, and what gets hidden so nothing appears
// twice. The resolution rules themselves are unit-tested in
// utils/__tests__/iosFacadeApps.test.ts.

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn(), push: jest.fn() }),
}));

const realApp = (name: string, packageName: string): AppsStore.InstalledApp => ({
  name,
  packageName,
  icon: 'content://icons/one.png',
  isSystem: false,
});

const mockLaunchApp = jest.fn(() => Promise.resolve(true));

function mockApps(installed: AppsStore.InstalledApp[]) {
  jest.spyOn(AppsStore, 'useApps').mockReturnValue({
    apps: installed,
    visibleApps: installed,
    nonDockApps: installed,
    homeApps: installed.map((a, i) => ({ packageName: a.packageName, position: i })),
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

beforeEach(() => {
  jest.clearAllMocks();
  mockFolders();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('LauncherHomeScreen iOS facades', () => {
  it('shows no facade icon when none of its candidates is installed', () => {
    mockApps([realApp('Chess Deluxe', 'com.example.chess')]);
    const { queryByLabelText } = render(<LauncherHomeScreen />);
    expect(queryByLabelText('Open Music')).toBeNull();
    expect(queryByLabelText('Open News')).toBeNull();
    expect(queryByLabelText('Open TV')).toBeNull();
    expect(queryByLabelText('Open Podcasts')).toBeNull();
  });

  it('shows the Music facade once YouTube Music is installed', () => {
    mockApps([realApp('YT Music', 'com.google.android.apps.youtube.music')]);
    const { getByLabelText } = render(<LauncherHomeScreen />);
    expect(getByLabelText('Open Music')).toBeTruthy();
  });

  it('hides the Android app the facade fronts, so it appears once', () => {
    mockApps([realApp('YT Music', 'com.google.android.apps.youtube.music')]);
    const { getByLabelText, queryByLabelText } = render(<LauncherHomeScreen />);
    expect(getByLabelText('Open Music')).toBeTruthy();
    expect(queryByLabelText('Open YT Music')).toBeNull();
  });

  it('keeps a second, unused candidate visible under its own name', () => {
    // Apple Music wins the Music facade, so Spotify is still a real app the
    // user may want to open directly. Hiding it would make an installed app
    // vanish with no explanation.
    mockApps([
      realApp('Apple Music', 'com.apple.android.music'),
      realApp('Spotify', 'com.spotify.music'),
    ]);
    const { getByLabelText, queryByLabelText } = render(<LauncherHomeScreen />);
    expect(getByLabelText('Open Music')).toBeTruthy();
    expect(queryByLabelText('Open Apple Music')).toBeNull();
    expect(getByLabelText('Open Spotify')).toBeTruthy();
  });

  it('tapping the facade launches the Android package, not the facade id', async () => {
    mockApps([realApp('YT Music', 'com.google.android.apps.youtube.music')]);
    const { getByLabelText } = render(<LauncherHomeScreen />);

    fireEvent.press(getByLabelText('Open Music'));

    await waitFor(() =>
      expect(mockLaunchApp).toHaveBeenCalledWith('com.google.android.apps.youtube.music'),
    );
    // The facade id is ours and has no launch intent — launching it would fail
    // silently and look like a dead icon.
    expect(mockLaunchApp).not.toHaveBeenCalledWith('com.iostoandroid.music');
  });

  it('launches the preferred candidate when several are installed', async () => {
    mockApps([
      realApp('Spotify', 'com.spotify.music'),
      realApp('Apple Music', 'com.apple.android.music'),
    ]);
    const { getByLabelText } = render(<LauncherHomeScreen />);

    fireEvent.press(getByLabelText('Open Music'));

    await waitFor(() =>
      expect(mockLaunchApp).toHaveBeenCalledWith('com.apple.android.music'),
    );
  });

  it('shows several facades at once, and only those that resolve', () => {
    mockApps([
      realApp('YT Music', 'com.google.android.apps.youtube.music'),
      realApp('Google News', 'com.google.android.apps.magazines'),
      realApp('Netflix', 'com.netflix.mediaclient'),
    ]);
    const { getByLabelText, queryByLabelText } = render(<LauncherHomeScreen />);
    expect(getByLabelText('Open Music')).toBeTruthy();
    expect(getByLabelText('Open News')).toBeTruthy();
    expect(getByLabelText('Open TV')).toBeTruthy();
    // No podcast app installed, so no Podcasts icon.
    expect(queryByLabelText('Open Podcasts')).toBeNull();
  });

  it('draws the facade with our artwork, not the generic fallback glyph', () => {
    mockApps([realApp('YT Music', 'com.google.android.apps.youtube.music')]);
    const { getByTestId } = render(<LauncherHomeScreen />);
    // The icon box exists under the FACADE id: it is our tile, drawn by
    // APP_ICON_ARTWORK, not the Android app's extracted bitmap.
    expect(getByTestId('app-icon-box-com.iostoandroid.music')).toBeTruthy();
  });
});
