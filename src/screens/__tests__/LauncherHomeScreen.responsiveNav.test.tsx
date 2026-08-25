import React from 'react';
import { Dimensions } from 'react-native';
import { render, fireEvent, act } from '../../test-utils';
import * as AppsStore from '../../store/AppsStore';
import { LauncherHomeScreen } from '../LauncherHomeScreen';

// #651-B: liga a sidebar (tablet) / mantém o dock intacto (phone) ao
// LauncherHomeScreen real, através de useRegularWidth + ResponsiveNavShell.

const mockNavigate = jest.fn();
const mockLaunchApp = jest.fn(() => Promise.resolve());
let mockRouteName: string | undefined = 'HomeMain';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
    goBack: jest.fn(),
    canGoBack: jest.fn(() => false),
    getParent: () => ({ navigate: jest.fn() }),
  }),
  useRoute: () => ({ name: mockRouteName, params: {} }),
  NavigationContainer: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const PHONE = {
  window: { width: 390, height: 844, scale: 2, fontScale: 1 },
  screen: { width: 390, height: 844, scale: 2, fontScale: 1 },
};
const TABLET = {
  window: { width: 1024, height: 768, scale: 2, fontScale: 1 },
  screen: { width: 1024, height: 768, scale: 2, fontScale: 1 },
};

// AppsStore starts with isLoading: true until the native app list resolves
// (AppsStore.tsx:89), and the screen renders only a spinner while loading —
// these tests need the loaded state to see the dock/grid at all.
function mockLoadedApps(overrides: Partial<ReturnType<typeof AppsStore.useApps>> = {}) {
  jest.spyOn(AppsStore, 'useApps').mockReturnValue({
    apps: [],
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
    ...overrides,
  } as ReturnType<typeof AppsStore.useApps>);
}

beforeEach(() => {
  mockNavigate.mockClear();
  mockLaunchApp.mockClear();
  mockRouteName = 'HomeMain';
  mockLoadedApps();
  Dimensions.set(PHONE);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('LauncherHomeScreen — responsive nav (#651-B)', () => {
  it('phone width: no sidebar, dock renders exactly like today', () => {
    Dimensions.set(PHONE);
    const { queryByTestId, getByTestId } = render(<LauncherHomeScreen />);
    expect(queryByTestId('cupertino-sidebar')).toBeNull();
    expect(getByTestId('launcher-dock')).toBeTruthy();
  });

  it('tablet width: sidebar renders alongside the unchanged dock', () => {
    Dimensions.set(TABLET);
    const { getByTestId } = render(<LauncherHomeScreen />);
    expect(getByTestId('cupertino-sidebar')).toBeTruthy();
    expect(getByTestId('launcher-dock')).toBeTruthy();
  });

  it('tablet width: sidebar marks Home as active for the HomeMain route', () => {
    Dimensions.set(TABLET);
    mockRouteName = 'HomeMain';
    const { getByTestId } = render(<LauncherHomeScreen />);
    expect(getByTestId('side-bar-item-Home').props.accessibilityState.selected).toBe(true);
    expect(getByTestId('side-bar-item-Phone').props.accessibilityState.selected).toBe(false);
  });

  it('tablet width: selecting a different sidebar item navigates to its mapped route', () => {
    Dimensions.set(TABLET);
    const { getByTestId } = render(<LauncherHomeScreen />);
    fireEvent.press(getByTestId('side-bar-item-Phone'));
    expect(mockNavigate).toHaveBeenCalledWith('Phone');
  });

  it('tablet width: pressing the already-active item does not navigate (double-tap safety)', () => {
    Dimensions.set(TABLET);
    const { getByTestId } = render(<LauncherHomeScreen />);
    fireEvent.press(getByTestId('side-bar-item-Home'));
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('live-resizes from phone to tablet without unmounting the dock', () => {
    Dimensions.set(PHONE);
    const { getByTestId, queryByTestId } = render(<LauncherHomeScreen />);
    expect(queryByTestId('cupertino-sidebar')).toBeNull();

    act(() => {
      Dimensions.set(TABLET);
    });

    expect(getByTestId('cupertino-sidebar')).toBeTruthy();
    expect(getByTestId('launcher-dock')).toBeTruthy();
  });
});
