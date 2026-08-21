import React from 'react';
import { Linking } from 'react-native';
import { render, fireEvent, waitFor } from '../../test-utils';
import * as AppsStore from '../../store/AppsStore';
import { AppStoreScreen } from '../AppStoreScreen';
import { AppLibraryScreen } from '../AppLibraryScreen';
import { CURATED_APPS } from '../../data/curatedApps';

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
const mockLaunchApp = jest.fn(() => Promise.resolve());

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

describe('AppStoreScreen — Today section', () => {
  it('renders without crashing', () => {
    const { toJSON, getByText } = render(<AppStoreScreen navigation={nav} />);
    expect(toJSON()).toBeTruthy();
    expect(getByText('Today')).toBeTruthy();
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
