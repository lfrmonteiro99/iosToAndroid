import React from 'react';
import { render, fireEvent } from '../../test-utils';
import * as AppsStore from '../../store/AppsStore';
import { LauncherHomeScreen } from '../LauncherHomeScreen';

// Acceptance criterion: tapping the Wallet home-screen icon navigates to
// WalletScreen. Mirrors the #442 entryPoints test — drives the REAL icon wired
// through BUILT_IN_APPS / VIRTUAL_ICON_CONFIG, not a reimplementation of the
// routing. The Wallet screen must open the in-app WalletScreen route, never
// the native launcher bridge (com.iostoandroid.wallet is a virtual package with
// no Android equivalent).

const mockNavigate = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
    goBack: jest.fn(),
    canGoBack: jest.fn(() => false),
    getParent: () => ({ navigate: jest.fn() }),
  }),
  useRoute: () => ({ params: {} }),
  NavigationContainer: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

function mockLoadedApps() {
  jest.spyOn(AppsStore, 'useApps').mockReturnValue({
    apps: [],
    homeApps: [],
    dockApps: [],
    nonDockApps: [],
    recentPackages: [],
    recentApps: [],
    isLoading: false,
    refreshApps: jest.fn(() => Promise.resolve()),
    launchApp: jest.fn(() => Promise.resolve(true)),
    addToHome: jest.fn(),
    removeFromHome: jest.fn(),
    compactHomeLayout: jest.fn(),
    addToDock: jest.fn(),
    removeFromDock: jest.fn(),
    removeFromRecents: jest.fn(),
    clearRecents: jest.fn(),
    isDefaultLauncher: true,
    openLauncherSettings: jest.fn(() => Promise.resolve()),
    hiddenApps: [],
    visibleApps: [],
    hideApp: jest.fn(),
    unhideApp: jest.fn(),
    iconCacheSizeBytes: 0,
    isRebuildingIconCache: false,
    iconCacheRebuildProgress: null,
    rebuildIconCache: jest.fn(() => Promise.resolve()),
  } as ReturnType<typeof AppsStore.useApps>);
}

beforeEach(() => {
  mockNavigate.mockClear();
  mockLoadedApps();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('LauncherHomeScreen Wallet icon (#125)', () => {
  it('renders a home-screen icon for Wallet', () => {
    const { getByLabelText } = render(<LauncherHomeScreen />);
    expect(getByLabelText('Open Wallet')).toBeTruthy();
  });

  it('pressing the Wallet icon navigates to the internal Wallet screen', () => {
    const { getByLabelText } = render(<LauncherHomeScreen />);
    fireEvent.press(getByLabelText('Open Wallet'));
    expect(mockNavigate).toHaveBeenCalledWith('Wallet');
  });

  it('double-tapping the Wallet icon navigates twice, never to the native bridge', () => {
    const { getByLabelText } = render(<LauncherHomeScreen />);
    const icon = getByLabelText('Open Wallet');
    fireEvent.press(icon);
    fireEvent.press(icon);
    expect(mockNavigate).toHaveBeenCalledTimes(2);
    expect(mockNavigate).toHaveBeenNthCalledWith(1, 'Wallet');
    expect(mockNavigate).toHaveBeenNthCalledWith(2, 'Wallet');
  });
});
