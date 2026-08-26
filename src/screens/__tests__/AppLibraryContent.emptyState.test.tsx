import React from 'react';
import { render, fireEvent, waitFor } from '../../test-utils';
import * as AppsStore from '../../store/AppsStore';
import * as SettingsStore from '../../store/SettingsStore';
import { AppLibraryContent } from '../AppLibraryScreen';

// #925 — the App Library had no loading branch and no empty branch.
//
// AppLibraryContent destructured `apps`, `visibleApps`, `launchApp`,
// `recentApps` and `hideApp`, and dropped `isLoading`. With zero apps all that
// stayed painted was the search bar and an orphan "Categories" header, over
// systemGroupedBackground — literally #000000 in dark mode. A near-black screen
// with no crash, indistinguishable from a broken app.
//
// Three real paths reach zero apps: the native scan failing without a cache
// (AppsStore leaves allApps empty for the rest of the session), QUERY_ALL_PACKAGES
// not taking effect (an empty list with no error at all), and the user's own
// "Show Apps in App Library" toggle. The last one is not a failure, which is why
// the two messages have to differ.
//
// A separate suite on purpose: the six existing App Library suites all mount
// with apps, and their assertions are the non-regression guarantee for the
// normal case.

const APP: AppsStore.InstalledApp = {
  name: 'Chess',
  packageName: 'com.example.chess',
  icon: '',
  isSystem: false,
};

function mockApps(over: { isLoading?: boolean; apps?: AppsStore.InstalledApp[] } = {}) {
  const apps = over.apps ?? [];
  jest.spyOn(AppsStore, 'useApps').mockReturnValue({
    apps,
    visibleApps: apps,
    nonDockApps: apps,
    homeApps: [],
    dockApps: [],
    recentPackages: [],
    recentApps: [],
    isLoading: over.isLoading ?? false,
    refreshApps: jest.fn(() => Promise.resolve()),
    launchApp: jest.fn(() => Promise.resolve(true)),
    addToHome: jest.fn(), removeFromHome: jest.fn(), addToDock: jest.fn(), removeFromDock: jest.fn(),
    removeFromRecents: jest.fn(), clearRecents: jest.fn(), isDefaultLauncher: true,
    openLauncherSettings: jest.fn(() => Promise.resolve()), hiddenApps: [],
    hideApp: jest.fn(), unhideApp: jest.fn(), iconCacheSizeBytes: 0, isRebuildingIconCache: false,
    iconCacheRebuildProgress: null, rebuildIconCache: jest.fn(() => Promise.resolve()),
    compactHomeLayout: jest.fn(), swapHomeApps: jest.fn(), libraryOnlyApps: [],
    protectedApps: [], protectApp: jest.fn(), unprotectApp: jest.fn(),
  } as unknown as ReturnType<typeof AppsStore.useApps>);
}

function withSettings(over: Partial<SettingsStore.SettingsState> = {}) {
  jest.spyOn(SettingsStore, 'useSettings').mockReturnValue({
    settings: { ...SettingsStore.DEFAULT_SETTINGS, searchShowInLibrary: true, ...over },
    update: jest.fn(), updateMany: jest.fn(), reset: jest.fn(),
    syncFromDevice: jest.fn(() => Promise.resolve()), isReady: true,
    activeFocusMode: null, setFocusMode: jest.fn(),
  } as unknown as ReturnType<typeof SettingsStore.useSettings>);
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('AppLibraryContent — loading', () => {
  it('shows an activity indicator while scanning with nothing to paint', async () => {
    mockApps({ isLoading: true });
    withSettings();
    const { getByTestId } = render(<AppLibraryContent />);
    await waitFor(() => expect(getByTestId('app-library-loading')).toBeTruthy());
  });

  it('does not show the Categories header while loading', async () => {
    mockApps({ isLoading: true });
    withSettings();
    const { getByTestId, queryByText } = render(<AppLibraryContent />);
    await waitFor(() => expect(getByTestId('app-library-loading')).toBeTruthy());
    expect(queryByText('Categories')).toBeNull();
  });

  it('paints the grid, NOT the spinner, when a rescan runs over cached apps', async () => {
    // Why the loading branch also requires an empty list. A warm start has apps
    // on screen while a scan runs; swapping them for a spinner would be a
    // regression, not a fix.
    mockApps({ isLoading: true, apps: [APP] });
    withSettings();
    const { queryByTestId, getByText } = render(<AppLibraryContent />);
    await waitFor(() => expect(getByText('Categories')).toBeTruthy());
    expect(queryByTestId('app-library-loading')).toBeNull();
  });
});

describe('AppLibraryContent — empty', () => {
  it('explains that the apps could not be read when the scan came back empty', async () => {
    mockApps({ isLoading: false });
    withSettings({ searchShowInLibrary: true });
    const { getByTestId, getByText } = render(<AppLibraryContent />);
    await waitFor(() => expect(getByTestId('app-library-empty')).toBeTruthy());
    expect(getByText('No Apps Found')).toBeTruthy();
  });

  it('points at the Siri & Search setting when that is what emptied the list', async () => {
    // Not a failure — the toggle is doing what it says. Sending the user to
    // "restart the launcher" for a setting they chose would be the wrong advice.
    mockApps({ isLoading: false });
    withSettings({ searchShowInLibrary: false });
    const { getByTestId, getByText } = render(<AppLibraryContent />);
    await waitFor(() => expect(getByTestId('app-library-empty')).toBeTruthy());
    expect(getByText(/Siri & Search/)).toBeTruthy();
  });

  it('uses DIFFERENT text for the two causes', async () => {
    mockApps({ isLoading: false });
    withSettings({ searchShowInLibrary: true });
    const failed = render(<AppLibraryContent />);
    await waitFor(() => expect(failed.getByTestId('app-library-empty')).toBeTruthy());
    const failedTitle = failed.getByText('No Apps Found');
    failed.unmount();
    jest.restoreAllMocks();

    mockApps({ isLoading: false });
    withSettings({ searchShowInLibrary: false });
    const off = render(<AppLibraryContent />);
    await waitFor(() => expect(off.getByTestId('app-library-empty')).toBeTruthy());
    expect(off.queryByText('No Apps Found')).toBeNull();
    expect(failedTitle).toBeTruthy();
  });

  it('does not show the Categories header with an empty library', async () => {
    mockApps({ isLoading: false });
    withSettings();
    const { getByTestId, queryByText } = render(<AppLibraryContent />);
    await waitFor(() => expect(getByTestId('app-library-empty')).toBeTruthy());
    expect(queryByText('Categories')).toBeNull();
  });
});

describe('AppLibraryContent — the chrome that must survive every state', () => {
  it('keeps the search bar mounted while loading', async () => {
    mockApps({ isLoading: true });
    withSettings();
    const { getByPlaceholderText, getByTestId } = render(<AppLibraryContent />);
    await waitFor(() => expect(getByTestId('app-library-loading')).toBeTruthy());
    expect(getByPlaceholderText('Search')).toBeTruthy();
  });

  it('keeps the search bar mounted when empty', async () => {
    // The guarantee that the screen is never 100% blank, which is the reported
    // symptom.
    mockApps({ isLoading: false });
    withSettings();
    const { getByPlaceholderText, getByTestId } = render(<AppLibraryContent />);
    await waitFor(() => expect(getByTestId('app-library-empty')).toBeTruthy());
    expect(getByPlaceholderText('Search')).toBeTruthy();
  });

  it('keeps the search bar mounted with apps', async () => {
    mockApps({ isLoading: false, apps: [APP] });
    withSettings();
    const { getByPlaceholderText, getByText } = render(<AppLibraryContent />);
    await waitFor(() => expect(getByText('Categories')).toBeTruthy());
    expect(getByPlaceholderText('Search')).toBeTruthy();
  });
});

describe('AppLibraryContent — search must not be confused with an empty library', () => {
  it('typing with zero apps gives the search No Results, not the library empty state', async () => {
    // Two empty states that mean different things. Showing "the installed apps
    // could not be read" because a query matched nothing would be a lie.
    mockApps({ isLoading: false });
    withSettings();
    const { getByPlaceholderText, queryByTestId, getByTestId } = render(<AppLibraryContent />);
    await waitFor(() => expect(getByTestId('app-library-empty')).toBeTruthy());

    fireEvent.changeText(getByPlaceholderText('Search'), 'zzz');

    await waitFor(() => expect(queryByTestId('app-library-empty')).toBeNull());
    expect(queryByTestId('app-library-loading')).toBeNull();
  });
});
