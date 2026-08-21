import React from 'react';
import { Linking } from 'react-native';
import { render, fireEvent, waitFor } from '../../test-utils';
import * as AppsStore from '../../store/AppsStore';
import { AppStoreScreen } from '../AppStoreScreen';
import { AppStoreDetailScreen, isVirtualBuiltIn } from '../AppStoreDetailScreen';
import { CURATED_APPS } from '../../data/curatedApps';
import LauncherModule from '../../../modules/launcher-module/src';

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
  } as ReturnType<typeof AppsStore.useApps>);
}

function installed(packageName: string, isSystem = false): AppsStore.InstalledApp {
  return { name: packageName, packageName, icon: '', isSystem };
}

const FIRST = CURATED_APPS[0];

function routeFor(packageName: string, name: string) {
  return { params: { packageName, name }, key: 'k', name: 'AppStoreDetail' } as never;
}

const uninstallMock = LauncherModule.uninstallApp as jest.Mock;

let canOpenSpy: jest.SpyInstance;
let openSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  mockApps([]);
  canOpenSpy = jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(true);
  openSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(true as never);
  uninstallMock.mockResolvedValue(true);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('AppStoreScreen → AppStoreDetail navigation', () => {
  it('tapping a Today card navigates to AppStoreDetail with that packageName and name', () => {
    const { getByLabelText } = render(<AppStoreScreen navigation={nav} />);
    fireEvent.press(getByLabelText(`${FIRST.name} card`));
    expect(mockNavigate).toHaveBeenCalledWith('AppStoreDetail', {
      packageName: FIRST.packageName,
      name: FIRST.name,
    });
  });

  it('the Get button inside a card still opens the listing and does NOT navigate (regression guard)', async () => {
    const { getByLabelText } = render(<AppStoreScreen navigation={nav} />);
    fireEvent.press(getByLabelText(`Get ${FIRST.name}`));
    await waitFor(() =>
      expect(openSpy).toHaveBeenCalledWith(`market://details?id=${FIRST.packageName}`),
    );
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('the Open button inside a card still launches the app and does NOT navigate (regression guard)', () => {
    mockApps([installed(FIRST.packageName)]);
    const { getByLabelText } = render(<AppStoreScreen navigation={nav} />);
    fireEvent.press(getByLabelText(`Open ${FIRST.name}`));
    expect(mockLaunchApp).toHaveBeenCalledWith(FIRST.packageName);
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});

describe('AppStoreDetailScreen', () => {
  it('shows a labeled screenshot placeholder and no fabricated description', () => {
    const { getByText, getByLabelText } = render(
      <AppStoreDetailScreen navigation={nav} route={routeFor(FIRST.packageName, FIRST.name)} />,
    );
    expect(getByLabelText('Screenshots placeholder')).toBeTruthy();
    expect(getByText('Screenshots not available')).toBeTruthy();
    expect(getByText('Description not available')).toBeTruthy();
  });

  it('uses the curated tagline and category for a curated app', () => {
    const { getByText } = render(
      <AppStoreDetailScreen navigation={nav} route={routeFor(FIRST.packageName, FIRST.name)} />,
    );
    expect(getByText(FIRST.tagline)).toBeTruthy();
    expect(getByText(FIRST.category)).toBeTruthy();
  });

  it('falls back to "Installed app" and the packageName for a non-curated installed app', () => {
    mockApps([installed('com.example.random')]);
    const { getByText } = render(
      <AppStoreDetailScreen navigation={nav} route={routeFor('com.example.random', 'Random')} />,
    );
    expect(getByText('Installed app')).toBeTruthy();
    expect(getByText('com.example.random')).toBeTruthy();
  });

  it('an installed app shows Open, which calls launchApp with the packageName', () => {
    mockApps([installed(FIRST.packageName)]);
    const { getByLabelText, queryByLabelText } = render(
      <AppStoreDetailScreen navigation={nav} route={routeFor(FIRST.packageName, FIRST.name)} />,
    );
    expect(queryByLabelText(`Get ${FIRST.name}`)).toBeNull();
    fireEvent.press(getByLabelText(`Open ${FIRST.name}`));
    expect(mockLaunchApp).toHaveBeenCalledWith(FIRST.packageName);
    expect(openSpy).not.toHaveBeenCalled();
  });

  it('a non-installed app shows Get, which opens the market:// listing, and no Uninstall', async () => {
    mockApps([]);
    const { getByLabelText, queryByLabelText } = render(
      <AppStoreDetailScreen navigation={nav} route={routeFor(FIRST.packageName, FIRST.name)} />,
    );
    expect(queryByLabelText(`Open ${FIRST.name}`)).toBeNull();
    expect(queryByLabelText(`Uninstall ${FIRST.name}`)).toBeNull();
    fireEvent.press(getByLabelText(`Get ${FIRST.name}`));
    await waitFor(() =>
      expect(openSpy).toHaveBeenCalledWith(`market://details?id=${FIRST.packageName}`),
    );
  });

  it('falls back to the https listing when market:// has no handler', async () => {
    canOpenSpy.mockImplementation((url: string) => Promise.resolve(url.startsWith('https:')));
    const { getByLabelText } = render(
      <AppStoreDetailScreen navigation={nav} route={routeFor(FIRST.packageName, FIRST.name)} />,
    );
    fireEvent.press(getByLabelText(`Get ${FIRST.name}`));
    await waitFor(() =>
      expect(openSpy).toHaveBeenCalledWith(
        `https://play.google.com/store/apps/details?id=${FIRST.packageName}`,
      ),
    );
  });

  it('a rejected Linking call does not crash the screen', async () => {
    canOpenSpy.mockRejectedValue(new Error('activity not found'));
    const { getByLabelText } = render(
      <AppStoreDetailScreen navigation={nav} route={routeFor(FIRST.packageName, FIRST.name)} />,
    );
    fireEvent.press(getByLabelText(`Get ${FIRST.name}`));
    await waitFor(() => expect(canOpenSpy).toHaveBeenCalled());
    expect(getByLabelText(`Get ${FIRST.name}`)).toBeTruthy();
  });

  it('pressing Uninstall calls LauncherModule.uninstallApp with the packageName', async () => {
    mockApps([installed(FIRST.packageName)]);
    const { getByLabelText } = render(
      <AppStoreDetailScreen navigation={nav} route={routeFor(FIRST.packageName, FIRST.name)} />,
    );
    fireEvent.press(getByLabelText(`Uninstall ${FIRST.name}`));
    await waitFor(() => expect(uninstallMock).toHaveBeenCalledWith(FIRST.packageName));
  });

  it('double-tapping Uninstall only requests one uninstall', async () => {
    mockApps([installed(FIRST.packageName)]);
    const { getByLabelText } = render(
      <AppStoreDetailScreen navigation={nav} route={routeFor(FIRST.packageName, FIRST.name)} />,
    );
    const btn = getByLabelText(`Uninstall ${FIRST.name}`);
    fireEvent.press(btn);
    fireEvent.press(btn);
    await waitFor(() => expect(uninstallMock).toHaveBeenCalled());
    expect(uninstallMock).toHaveBeenCalledTimes(1);
  });

  it('a rejected uninstallApp does not crash the screen', async () => {
    uninstallMock.mockRejectedValue(new Error('installer unavailable'));
    mockApps([installed(FIRST.packageName)]);
    const { getByLabelText } = render(
      <AppStoreDetailScreen navigation={nav} route={routeFor(FIRST.packageName, FIRST.name)} />,
    );
    fireEvent.press(getByLabelText(`Uninstall ${FIRST.name}`));
    await waitFor(() => expect(uninstallMock).toHaveBeenCalled());
    expect(getByLabelText(`Open ${FIRST.name}`)).toBeTruthy();
  });

  it('hides Uninstall for a system app (inverse of the fix)', () => {
    mockApps([installed(FIRST.packageName, true)]);
    const { getByLabelText, queryByLabelText } = render(
      <AppStoreDetailScreen navigation={nav} route={routeFor(FIRST.packageName, FIRST.name)} />,
    );
    expect(getByLabelText(`Open ${FIRST.name}`)).toBeTruthy();
    expect(queryByLabelText(`Uninstall ${FIRST.name}`)).toBeNull();
  });

  it('hides Uninstall for a virtual built-in package even when reported as installed', () => {
    mockApps([installed('com.iostoandroid.phone')]);
    const { queryByLabelText } = render(
      <AppStoreDetailScreen navigation={nav} route={routeFor('com.iostoandroid.phone', 'Phone')} />,
    );
    expect(queryByLabelText('Uninstall Phone')).toBeNull();
  });

  it('isVirtualBuiltIn only matches this app\'s own namespace', () => {
    expect(isVirtualBuiltIn('com.iostoandroid.phone')).toBe(true);
    expect(isVirtualBuiltIn('com.iostoandroid.mail')).toBe(true);
    expect(isVirtualBuiltIn('com.spotify.music')).toBe(false);
    expect(isVirtualBuiltIn('')).toBe(false);
  });

  it('the Back button calls navigation.goBack', () => {
    const { getByLabelText } = render(
      <AppStoreDetailScreen navigation={nav} route={routeFor(FIRST.packageName, FIRST.name)} />,
    );
    fireEvent.press(getByLabelText('Back'));
    expect(mockGoBack).toHaveBeenCalled();
  });
});
