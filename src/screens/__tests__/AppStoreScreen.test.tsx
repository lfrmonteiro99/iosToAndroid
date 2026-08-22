import React from 'react';
import { Linking } from 'react-native';
import { render, fireEvent, waitFor } from '../../test-utils';
import * as AppsStore from '../../store/AppsStore';
import { AppStoreScreen } from '../AppStoreScreen';
import { AppLibraryScreen } from '../AppLibraryScreen';
import { CURATED_APPS } from '../../data/curatedApps';

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
const mockLaunchApp = jest.fn(() => Promise.resolve(true));

const nav = {
  navigate: mockNavigate,
  goBack: mockGoBack,
  push: jest.fn(),
} as never;

function mockApps(apps: AppsStore.InstalledApp[]) {
  jest.spyOn(AppsStore, 'useApps').mockReturnValue({
    apps,
    homeApps: [],
    dockApps: [],
    nonDockApps: [],
    recentPackages: [],
    recentApps: [],
    isLoading: false,
    refreshApps: jest.fn(() => Promise.resolve()),
    launchApp: mockLaunchApp,
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

function installed(packageName: string): AppsStore.InstalledApp {
  return { name: packageName, packageName, icon: '', isSystem: false };
}

const FIRST = CURATED_APPS[0];
const SECOND = CURATED_APPS[1];

let canOpenSpy: jest.SpyInstance;
let openSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  mockApps([]);
  canOpenSpy = jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(true);
  openSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(true as never);
});

afterEach(() => {
  jest.restoreAllMocks();
});

const INSTALLED_ONLY_APP: AppsStore.InstalledApp = {
  name: 'Acme Notes',
  packageName: 'com.acme.notes',
  icon: '',
  isSystem: false,
};

describe('AppStoreScreen — Today section', () => {
  it('renders without crashing', () => {
    // Once the Search-tab segmented control exists, "Today" is rendered both
    // as the segment label and as the section heading — getAllByText because
    // two matches are now expected, not a regression.
    const { toJSON, getAllByText } = render(<AppStoreScreen navigation={nav} />);
    expect(toJSON()).toBeTruthy();
    expect(getAllByText('Today').length).toBeGreaterThan(0);
  });

  it('renders one card per entry in CURATED_APPS', () => {
    const { getAllByLabelText, getByLabelText } = render(<AppStoreScreen navigation={nav} />);
    expect(getAllByLabelText(/card$/)).toHaveLength(CURATED_APPS.length);
    for (const app of CURATED_APPS) {
      expect(getByLabelText(`${app.name} card`)).toBeTruthy();
    }
  });

  it('the catalog is non-empty and every packageName is unique', () => {
    expect(CURATED_APPS.length).toBeGreaterThan(0);
    const pkgs = CURATED_APPS.map((a) => a.packageName);
    expect(new Set(pkgs).size).toBe(pkgs.length);
  });

  it('an installed curated app shows Open and launches it by packageName', () => {
    mockApps([installed(FIRST.packageName)]);
    const { getByLabelText } = render(<AppStoreScreen navigation={nav} />);
    const btn = getByLabelText(`Open ${FIRST.name}`);
    fireEvent.press(btn);
    expect(mockLaunchApp).toHaveBeenCalledWith(FIRST.packageName);
    expect(openSpy).not.toHaveBeenCalled();
  });

  it('a non-installed curated app shows Get, not Open (inverse of the fix)', () => {
    mockApps([installed(FIRST.packageName)]);
    const { getByLabelText, queryByLabelText } = render(<AppStoreScreen navigation={nav} />);
    expect(getByLabelText(`Get ${SECOND.name}`)).toBeTruthy();
    expect(queryByLabelText(`Open ${SECOND.name}`)).toBeNull();
    expect(queryByLabelText(`Get ${FIRST.name}`)).toBeNull();
  });

  it('pressing Get opens the market:// listing for that package', async () => {
    const { getByLabelText } = render(<AppStoreScreen navigation={nav} />);
    fireEvent.press(getByLabelText(`Get ${FIRST.name}`));
    await waitFor(() =>
      expect(openSpy).toHaveBeenCalledWith(`market://details?id=${FIRST.packageName}`),
    );
    expect(canOpenSpy).toHaveBeenCalledWith(`market://details?id=${FIRST.packageName}`);
    expect(mockLaunchApp).not.toHaveBeenCalled();
  });

  it('falls back to the https listing when market:// cannot be opened', async () => {
    canOpenSpy.mockImplementation((url: string) => Promise.resolve(url.startsWith('https:')));
    const { getByLabelText } = render(<AppStoreScreen navigation={nav} />);
    fireEvent.press(getByLabelText(`Get ${FIRST.name}`));
    await waitFor(() =>
      expect(openSpy).toHaveBeenCalledWith(
        `https://play.google.com/store/apps/details?id=${FIRST.packageName}`,
      ),
    );
    expect(openSpy).not.toHaveBeenCalledWith(`market://details?id=${FIRST.packageName}`);
  });

  it('opens nothing when no handler exists for either URL', async () => {
    canOpenSpy.mockResolvedValue(false);
    const { getByLabelText } = render(<AppStoreScreen navigation={nav} />);
    fireEvent.press(getByLabelText(`Get ${FIRST.name}`));
    await waitFor(() => expect(canOpenSpy).toHaveBeenCalled());
    expect(openSpy).not.toHaveBeenCalled();
  });

  it('a rejected Linking call does not crash the screen', async () => {
    canOpenSpy.mockRejectedValue(new Error('activity not found'));
    const { getByLabelText } = render(<AppStoreScreen navigation={nav} />);
    fireEvent.press(getByLabelText(`Get ${FIRST.name}`));
    await waitFor(() => expect(canOpenSpy).toHaveBeenCalled());
    expect(getByLabelText(`Get ${FIRST.name}`)).toBeTruthy();
  });

  it('double-tapping Get does not open two listings for one tap each beyond the presses made', async () => {
    const { getByLabelText } = render(<AppStoreScreen navigation={nav} />);
    const btn = getByLabelText(`Get ${FIRST.name}`);
    fireEvent.press(btn);
    fireEvent.press(btn);
    await waitFor(() => expect(openSpy).toHaveBeenCalled());
    expect(openSpy).toHaveBeenCalledWith(`market://details?id=${FIRST.packageName}`);
    expect(openSpy.mock.calls.every((c) => c[0] === `market://details?id=${FIRST.packageName}`)).toBe(true);
  });

  it('an empty installed-app list still renders every card, all as Get', () => {
    mockApps([]);
    const { getAllByLabelText } = render(<AppStoreScreen navigation={nav} />);
    expect(getAllByLabelText(/^Get /)).toHaveLength(CURATED_APPS.length);
  });

  it('unrelated installed packages do not turn any card into Open', () => {
    mockApps([installed('com.example.not.in.catalog')]);
    const { getAllByLabelText, queryAllByLabelText } = render(<AppStoreScreen navigation={nav} />);
    expect(getAllByLabelText(/^Get /)).toHaveLength(CURATED_APPS.length);
    expect(queryAllByLabelText(/^Open /)).toHaveLength(0);
  });

  it('the Back button calls navigation.goBack', () => {
    const { getByLabelText } = render(<AppStoreScreen navigation={nav} />);
    fireEvent.press(getByLabelText('Back'));
    expect(mockGoBack).toHaveBeenCalled();
  });
});

describe('AppStoreScreen — Search tab', () => {
  it('selecting Search swaps the visible content, and Today restores the original cards', () => {
    const { getByText, getByPlaceholderText, queryByPlaceholderText, getAllByLabelText, queryAllByLabelText } =
      render(<AppStoreScreen navigation={nav} />);

    expect(getAllByLabelText(/card$/)).toHaveLength(CURATED_APPS.length);
    expect(queryByPlaceholderText(/search/i)).toBeNull();

    fireEvent.press(getByText('Search'));
    expect(getByPlaceholderText(/search/i)).toBeTruthy();
    expect(queryAllByLabelText(/card$/)).toHaveLength(0);

    fireEvent.press(getByText('Today'));
    expect(getAllByLabelText(/card$/)).toHaveLength(CURATED_APPS.length);
    expect(queryByPlaceholderText(/search/i)).toBeNull();
  });

  it('a query matching an installed app (not in the curated catalog) shows an Open row', () => {
    mockApps([INSTALLED_ONLY_APP]);
    const { getByText, getByPlaceholderText, getByLabelText } = render(<AppStoreScreen navigation={nav} />);
    fireEvent.press(getByText('Search'));
    fireEvent.changeText(getByPlaceholderText(/search/i), 'acme');
    expect(getByLabelText(`Open ${INSTALLED_ONLY_APP.name}`)).toBeTruthy();
  });

  it('a query matching a curated, non-installed app shows a Get row', () => {
    mockApps([]);
    const { getByText, getByPlaceholderText, getByLabelText } = render(<AppStoreScreen navigation={nav} />);
    fireEvent.press(getByText('Search'));
    fireEvent.changeText(getByPlaceholderText(/search/i), FIRST.name.toLowerCase());
    expect(getByLabelText(`Get ${FIRST.name}`)).toBeTruthy();
  });

  it('an installed app that is also curated is shown once, as Open (dedup, installed takes precedence)', () => {
    mockApps([installed(FIRST.packageName)]);
    const { getByText, getByPlaceholderText, getAllByLabelText, queryByLabelText } = render(
      <AppStoreScreen navigation={nav} />,
    );
    fireEvent.press(getByText('Search'));
    fireEvent.changeText(getByPlaceholderText(/search/i), FIRST.packageName);
    expect(getAllByLabelText(/^(Open|Get) /)).toHaveLength(1);
    expect(queryByLabelText(`Get ${FIRST.packageName}`)).toBeNull();
  });

  it('an empty query shows no result rows', () => {
    mockApps([]);
    const { getByText, queryAllByLabelText } = render(<AppStoreScreen navigation={nav} />);
    fireEvent.press(getByText('Search'));
    expect(queryAllByLabelText(/^(Open|Get) /)).toHaveLength(0);
  });

  it('a query with no matches shows no result rows but keeps the Play Store fallback visible', () => {
    mockApps([]);
    const { getByText, getByPlaceholderText, getByLabelText, queryAllByLabelText } = render(
      <AppStoreScreen navigation={nav} />,
    );
    fireEvent.press(getByText('Search'));
    fireEvent.changeText(getByPlaceholderText(/search/i), 'zzznomatchzzz');
    expect(queryAllByLabelText(/^(Open|Get) /)).toHaveLength(0);
    expect(getByLabelText('Search on Play Store')).toBeTruthy();
  });

  it('pressing "Search on Play Store" calls Linking.openURL with a market search deep link containing the query', async () => {
    mockApps([]);
    const { getByText, getByPlaceholderText, getByLabelText } = render(<AppStoreScreen navigation={nav} />);
    fireEvent.press(getByText('Search'));
    fireEvent.changeText(getByPlaceholderText(/search/i), 'gimp');
    fireEvent.press(getByLabelText('Search on Play Store'));
    await waitFor(() =>
      expect(openSpy).toHaveBeenCalledWith(expect.stringContaining('market://search?q=')),
    );
    expect(openSpy).toHaveBeenCalledWith(expect.stringContaining(encodeURIComponent('gimp')));
  });

  it('does not press-through the Play Store fallback when the query is empty', () => {
    mockApps([]);
    const { getByText, getByLabelText } = render(<AppStoreScreen navigation={nav} />);
    fireEvent.press(getByText('Search'));
    fireEvent.press(getByLabelText('Search on Play Store'));
    expect(openSpy).not.toHaveBeenCalled();
  });

  it('makes clear only installed and curated apps are searched, not live Play Store results', () => {
    const { getByText, getByTestId } = render(<AppStoreScreen navigation={nav} />);
    fireEvent.press(getByText('Search'));
    expect(getByTestId('app-store-search-disclaimer')).toBeTruthy();
  });
});

describe('AppStoreScreen — Categories tab', () => {
  it('the segmented control offers Today, Search and Categories', () => {
    // 'Today' also labels the Today tab's section heading (default tab), so
    // it has more than one match — getAllByText, not getByText.
    const { getAllByText, getByText } = render(<AppStoreScreen navigation={nav} />);
    expect(getAllByText('Today').length).toBeGreaterThan(0);
    expect(getByText('Search')).toBeTruthy();
    expect(getByText('Categories')).toBeTruthy();
  });

  it('selecting Categories renders at least one section header and its apps', () => {
    mockApps([]);
    const { getByText, getAllByText, getAllByLabelText } = render(<AppStoreScreen navigation={nav} />);
    fireEvent.press(getByText('Categories'));
    // Every CURATED_APPS category is a distinct section header — each also
    // appears as the caption on its own app row(s), so match count, not
    // uniqueness.
    const uniqueCategories = new Set(CURATED_APPS.map((a) => a.category));
    for (const category of uniqueCategories) {
      expect(getAllByText(category).length).toBeGreaterThan(0);
    }
    expect(getAllByLabelText(/card$/).length).toBeGreaterThan(0);
  });

  it('every CURATED_APPS entry appears exactly once across all category sections', () => {
    mockApps([]);
    const { getByText, getAllByLabelText } = render(<AppStoreScreen navigation={nav} />);
    fireEvent.press(getByText('Categories'));
    expect(getAllByLabelText(/card$/)).toHaveLength(CURATED_APPS.length);
    for (const app of CURATED_APPS) {
      expect(getAllByLabelText(`${app.name} card`)).toHaveLength(1);
    }
  });

  it('an installed curated app in Categories shows Open, not Get', () => {
    mockApps([installed(FIRST.packageName)]);
    const { getByText, getByLabelText, queryByLabelText } = render(<AppStoreScreen navigation={nav} />);
    fireEvent.press(getByText('Categories'));
    expect(getByLabelText(`Open ${FIRST.name}`)).toBeTruthy();
    expect(queryByLabelText(`Get ${FIRST.name}`)).toBeNull();
  });

  it('a non-installed curated app in Categories shows Get, not Open', () => {
    mockApps([]);
    const { getByText, getByLabelText, queryByLabelText } = render(<AppStoreScreen navigation={nav} />);
    fireEvent.press(getByText('Categories'));
    expect(getByLabelText(`Get ${FIRST.name}`)).toBeTruthy();
    expect(queryByLabelText(`Open ${FIRST.name}`)).toBeNull();
  });

  it('an installed app not in CURATED_APPS is grouped by keyword match, and shows Open', () => {
    const musicApp: AppsStore.InstalledApp = {
      name: 'MyMusic Player',
      packageName: 'com.example.mymusicplayer',
      icon: '',
      isSystem: false,
    };
    mockApps([musicApp]);
    const { getByText, getByLabelText, getAllByText, queryByText } = render(
      <AppStoreScreen navigation={nav} />,
    );
    fireEvent.press(getByText('Categories'));
    expect(getByLabelText(`Open ${musicApp.name}`)).toBeTruthy();
    // Confirms it landed in Music, not the catch-all bucket — a broken
    // categorizeInstalledApp that always returns 'Other' would fail this.
    expect(getAllByText('Music').length).toBeGreaterThan(0);
    expect(queryByText('Other')).toBeNull();
  });

  it('an installed app matching no keyword is grouped under Other', () => {
    const mysteryApp: AppsStore.InstalledApp = {
      name: 'Zzyzx',
      packageName: 'com.example.zzyzx',
      icon: '',
      isSystem: false,
    };
    mockApps([mysteryApp]);
    const { getByText, getByLabelText, getAllByText } = render(<AppStoreScreen navigation={nav} />);
    fireEvent.press(getByText('Categories'));
    expect(getByLabelText(`Open ${mysteryApp.name}`)).toBeTruthy();
    // 'Other' is both the section header and this app's own caption text.
    expect(getAllByText('Other').length).toBeGreaterThan(0);
  });

  it('switching Today → Categories → Today keeps the Today cards unchanged (inverse of the fix)', () => {
    mockApps([]);
    const { getByText, getAllByLabelText } = render(<AppStoreScreen navigation={nav} />);
    expect(getAllByLabelText(/card$/)).toHaveLength(CURATED_APPS.length);
    fireEvent.press(getByText('Categories'));
    fireEvent.press(getByText('Today'));
    expect(getAllByLabelText(/card$/)).toHaveLength(CURATED_APPS.length);
  });
});

describe('AppStoreScreen — Updates tab', () => {
  const UPDATES_NOTICE =
    "Android cannot check for app updates automatically. Tap an app to open its Play Store page.";

  it('the segmented control now offers Today, Search, Categories and Updates', () => {
    const { getAllByText, getByText } = render(<AppStoreScreen navigation={nav} />);
    expect(getAllByText('Today').length).toBeGreaterThan(0);
    expect(getByText('Search')).toBeTruthy();
    expect(getByText('Categories')).toBeTruthy();
    expect(getByText('Updates')).toBeTruthy();
  });

  it('selecting Updates shows the honesty notice that automatic detection is unavailable', () => {
    const { getByText, getByTestId } = render(<AppStoreScreen navigation={nav} />);
    fireEvent.press(getByText('Updates'));
    // Exact copy states the limitation plainly — no "live check" implication.
    expect(getByText(UPDATES_NOTICE)).toBeTruthy();
    expect(getByTestId('updates-notice')).toBeTruthy();
  });

  it('shows a non-system installed app as a row with a Check-on-Play-Store action', () => {
    const regular: AppsStore.InstalledApp = {
      name: 'Acme Notes',
      packageName: 'com.acme.notes',
      icon: '',
      isSystem: false,
    };
    mockApps([regular]);
    const { getByText, getByLabelText } = render(<AppStoreScreen navigation={nav} />);
    fireEvent.press(getByText('Updates'));
    expect(getByLabelText('Check Acme Notes on Play Store')).toBeTruthy();
  });

  it('excludes system apps from the Updates list', () => {
    const systemApp: AppsStore.InstalledApp = {
      name: 'Android System',
      packageName: 'com.android.system',
      icon: '',
      isSystem: true,
    };
    mockApps([systemApp]);
    const { getByText, queryByLabelText } = render(<AppStoreScreen navigation={nav} />);
    fireEvent.press(getByText('Updates'));
    expect(queryByLabelText('Check Android System on Play Store')).toBeNull();
  });

  it('excludes this app’s own virtual built-ins from the Updates list', () => {
    const virtualApp: AppsStore.InstalledApp = {
      name: 'Phone',
      packageName: 'com.iostoandroid.phone',
      icon: '',
      isSystem: false,
    };
    mockApps([virtualApp]);
    const { getByText, queryByLabelText } = render(<AppStoreScreen navigation={nav} />);
    fireEvent.press(getByText('Updates'));
    // VIRTUAL_APPS_MAP entries are isSystem:false, so isSystem alone wouldn't
    // exclude them — the exclusion must be by package name.
    expect(queryByLabelText('Check Phone on Play Store')).toBeNull();
  });

  it('tapping a row’s action calls Linking.openURL with the market:// deep link for that package', async () => {
    const regular: AppsStore.InstalledApp = {
      name: 'Acme Notes',
      packageName: 'com.acme.notes',
      icon: '',
      isSystem: false,
    };
    mockApps([regular]);
    const { getByText, getByLabelText } = render(<AppStoreScreen navigation={nav} />);
    fireEvent.press(getByText('Updates'));
    fireEvent.press(getByLabelText('Check Acme Notes on Play Store'));
    await waitFor(() =>
      expect(openSpy).toHaveBeenCalledWith('market://details?id=com.acme.notes'),
    );
    expect(canOpenSpy).toHaveBeenCalledWith('market://details?id=com.acme.notes');
    expect(mockLaunchApp).not.toHaveBeenCalled();
  });

  it('falls back to the https listing when market:// cannot be opened (same guard as Today)', async () => {
    canOpenSpy.mockImplementation((url: string) => Promise.resolve(url.startsWith('https:')));
    const regular: AppsStore.InstalledApp = {
      name: 'Acme Notes',
      packageName: 'com.acme.notes',
      icon: '',
      isSystem: false,
    };
    mockApps([regular]);
    const { getByText, getByLabelText } = render(<AppStoreScreen navigation={nav} />);
    fireEvent.press(getByText('Updates'));
    fireEvent.press(getByLabelText('Check Acme Notes on Play Store'));
    await waitFor(() =>
      expect(openSpy).toHaveBeenCalledWith(
        'https://play.google.com/store/apps/details?id=com.acme.notes',
      ),
    );
    expect(openSpy).not.toHaveBeenCalledWith('market://details?id=com.acme.notes');
  });

  it('shows no fabricated "update available" badge or version number', () => {
    mockApps([
      { name: 'Acme Notes', packageName: 'com.acme.notes', icon: '', isSystem: false },
    ]);
    const { getByText, queryByText } = render(<AppStoreScreen navigation={nav} />);
    fireEvent.press(getByText('Updates'));
    // No fabricated update state of any kind.
    expect(queryByText(/update(s)? available/i)).toBeNull();
    expect(getByText(UPDATES_NOTICE)).toBeTruthy();
  });

  it('shows an empty state (notice only, no rows) when there are no non-system, non-virtual apps', () => {
    mockApps([]);
    const { getByText, queryAllByLabelText } = render(<AppStoreScreen navigation={nav} />);
    fireEvent.press(getByText('Updates'));
    expect(queryAllByLabelText(/^Check .* on Play Store$/)).toHaveLength(0);
    expect(getByText(UPDATES_NOTICE)).toBeTruthy();
  });

  it('switching Today → Updates → Today keeps the Today cards unchanged (regression guard)', () => {
    mockApps([]);
    const { getByText, getAllByLabelText, queryAllByLabelText } = render(
      <AppStoreScreen navigation={nav} />,
    );
    expect(getAllByLabelText(/card$/)).toHaveLength(CURATED_APPS.length);
    fireEvent.press(getByText('Updates'));
    expect(queryAllByLabelText(/card$/)).toHaveLength(0);
    fireEvent.press(getByText('Today'));
    expect(getAllByLabelText(/card$/)).toHaveLength(CURATED_APPS.length);
  });
});

describe('AppLibraryScreen entry point to the App Store', () => {
  it('renders an App Store button that navigates to the AppStore route', () => {
    const { getByLabelText } = render(<AppLibraryScreen navigation={nav} />);
    fireEvent.press(getByLabelText('App Store'));
    expect(mockNavigate).toHaveBeenCalledWith('AppStore');
  });

  it('keeps the Back button and centered title untouched (regression guard)', () => {
    const { getByLabelText, getByText, getByPlaceholderText } = render(
      <AppLibraryScreen navigation={nav} />,
    );
    fireEvent.press(getByLabelText('Back'));
    expect(mockGoBack).toHaveBeenCalled();
    expect(getByText('App Library')).toBeTruthy();
    expect(getByPlaceholderText('App Library')).toBeTruthy();
  });
});
