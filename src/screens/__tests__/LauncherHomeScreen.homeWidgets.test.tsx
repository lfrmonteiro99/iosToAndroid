/**
 * #654: the real (Android) LauncherHomeScreen showed no widgets at all — only
 * NonAndroidFallback (used off-Android) rendered a couple of hardcoded fake
 * widget cards. This locks the actual feature: an iOS-style widget area at
 * the top of the first home page, built from the exact same widgetMap/config
 * the Today View sheet already reads and writes (useWidgetConfig/useWidgetMap
 * in src/components/TodayWidgets.tsx), never a second independent copy.
 */
import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { render, waitFor, within, fireEvent } from '../../test-utils';
import * as AppsStore from '../../store/AppsStore';
import { LauncherHomeScreen } from '../LauncherHomeScreen';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
    goBack: jest.fn(),
    canGoBack: jest.fn(() => false),
    getParent: () => ({ navigate: mockNavigate }),
  }),
  useRoute: () => ({ params: {} }),
  NavigationContainer: ({ children }: { children: React.ReactNode }) => children,
}));

function mockApps(overrides: Record<string, unknown> = {}) {
  jest.spyOn(AppsStore, 'useApps').mockReturnValue({
    apps: [],
    homeApps: [],
    dockApps: [],
    nonDockApps: [],
    recentPackages: [],
    recentApps: [],
    isLoading: false,
    compactHomeLayout: jest.fn(),
    refreshApps: jest.fn(() => Promise.resolve()),
    launchApp: jest.fn(() => Promise.resolve(true)),
    addToHome: jest.fn(),
    removeFromHome: jest.fn(),
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
    ...overrides,
  } as ReturnType<typeof AppsStore.useApps>);
}

function mockWidgetConfig(config: string[] | null) {
  (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
    key === '@iostoandroid/widget_config'
      ? Promise.resolve(config ? JSON.stringify(config) : null)
      : Promise.resolve(null),
  );
}

afterEach(() => {
  jest.restoreAllMocks();
  mockNavigate.mockClear();
});

describe('LauncherHomeScreen — home screen widgets (#654)', () => {
  it('renders the Today View default-enabled widgets in a stack at the top of the first page', async () => {
    mockApps();
    mockWidgetConfig(null); // no saved config -> Today View DEFAULT_ENABLED

    const { getByTestId, queryByTestId } = render(<LauncherHomeScreen />);

    await waitFor(() => expect(getByTestId('launcher-home-widgets')).toBeTruthy(), { timeout: 3000 });

    const stack = getByTestId('launcher-home-widgets');
    // DEFAULT_ENABLED = ['battery', 'weather', 'storage', 'upNext', 'messages']
    expect(within(stack).getByTestId('launcher-home-widget-battery')).toBeTruthy();
    expect(within(stack).getByTestId('launcher-home-widget-weather')).toBeTruthy();
    expect(within(stack).getByTestId('launcher-home-widget-storage')).toBeTruthy();
    expect(within(stack).getByTestId('launcher-home-widget-upNext')).toBeTruthy();
    expect(within(stack).getByTestId('launcher-home-widget-messages')).toBeTruthy();
    // screenTime is NOT in DEFAULT_ENABLED — must not render unasked.
    expect(queryByTestId('launcher-home-widget-screenTime')).toBeNull();
  });

  it('respects a user-customized widget config instead of hardcoding a set', async () => {
    mockApps();
    mockWidgetConfig(['weather']); // user disabled everything except Weather

    const { getByTestId, queryByTestId } = render(<LauncherHomeScreen />);

    await waitFor(() => expect(getByTestId('launcher-home-widgets')).toBeTruthy(), { timeout: 3000 });

    expect(getByTestId('launcher-home-widget-weather')).toBeTruthy();
    expect(queryByTestId('launcher-home-widget-battery')).toBeNull();
    expect(queryByTestId('launcher-home-widget-storage')).toBeNull();
    expect(queryByTestId('launcher-home-widget-upNext')).toBeNull();
    expect(queryByTestId('launcher-home-widget-messages')).toBeNull();
  });

  it('renders nothing in the widget area when the user disabled every widget', async () => {
    mockApps();
    mockWidgetConfig([]); // user removed every widget in Edit Widgets

    const { queryByTestId, getByTestId } = render(<LauncherHomeScreen />);

    // Give the async config load a chance to resolve before asserting absence.
    await waitFor(() => expect(getByTestId('launcher-page-grid-0')).toBeTruthy(), { timeout: 3000 });
    await new Promise((r) => setTimeout(r, 0));

    expect(queryByTestId('launcher-home-widgets')).toBeNull();
  });

  it('does not flash the widget stack before the saved config has loaded', () => {
    mockApps();
    mockWidgetConfig(['weather']);

    // Deliberately not awaiting anything: assert against the very first,
    // synchronous render — before the AsyncStorage promise has a chance to
    // resolve. Today View gates on the exact same `loaded` flag; the home
    // screen must not flash Today View's DEFAULT_ENABLED first and then
    // swap to the real config a frame later.
    const { queryByTestId } = render(<LauncherHomeScreen />);
    expect(queryByTestId('launcher-home-widgets')).toBeNull();
  });

  it('tapping the Battery widget navigates to the Battery screen, same as from Today View', async () => {
    mockApps();
    mockWidgetConfig(['battery']);

    const { getByTestId } = render(<LauncherHomeScreen />);
    await waitFor(() => expect(getByTestId('launcher-home-widget-battery')).toBeTruthy(), { timeout: 3000 });

    fireEvent.press(within(getByTestId('launcher-home-widget-battery')).getByRole('button'));
    expect(mockNavigate).toHaveBeenCalledWith('Battery');
  });
});
