/**
 * #654: the real (Android) LauncherHomeScreen showed no widgets at all — only
 * NonAndroidFallback (used off-Android) rendered a couple of hardcoded fake
 * widget cards. This locks the actual feature: widgets on the home screen,
 * built from the exact same widgetMap/config the Today View sheet reads and
 * writes (useWidgetConfig/useWidgetMap), never a second independent copy.
 *
 * #935 changed WHERE they appear, and therefore what these tests assert.
 *
 * They used to state that the home screen renders every enabled type in a stack
 * at the top of the first page. That was true while a home widget was a
 * half-width card in a row ABOVE the icons, which cost the grid nothing. Once a
 * widget occupies real icon cells it costs a great deal: the five types in
 * DEFAULT_ENABLED take 20 of a 4x6 page's 24 cells and upNext (4x4) does not fit
 * at all, so rendering the enabled set on page 0 flooded the home screen and
 * pushed every icon to page 2.
 *
 * So the two surfaces stopped being the same list. The Today View still shows
 * every instance; the home grid shows the ones PLACED on a home page, which is
 * what the `page` field of the instance model (#933) is for. The shared-config
 * guarantee #654 exists for is unchanged and still asserted — one config, one
 * widgetMap — it is the placement that is now explicit.
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

/** Seeds the pre-#933 type list, so the migration is what supplies instances. */
function mockWidgetConfig(config: string[] | null) {
  (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
    key === '@iostoandroid/widget_config'
      ? Promise.resolve(config ? JSON.stringify(config) : null)
      : Promise.resolve(null),
  );
}

/**
 * Seeds instances PLACED on the home grid — the state that puts a widget on the
 * home screen now. `col`/`row` are left at 0 so the packer decides, which is
 * what it does for a real placement too.
 */
function mockPlacedWidgets(placed: Array<{ type: string; size?: string; page?: number }>) {
  const instances = placed.map((p, i) => ({
    id: `${p.type}-${i}`,
    type: p.type,
    size: p.size ?? 'small',
    page: p.page ?? 0,
    col: 0,
    row: 0,
  }));
  (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
    key === '@iostoandroid/widget_instances'
      ? Promise.resolve(JSON.stringify(instances))
      : Promise.resolve(null),
  );
}

afterEach(() => {
  jest.restoreAllMocks();
  mockNavigate.mockClear();
});

describe('LauncherHomeScreen — home screen widgets (#654)', () => {
  it('renders the widgets PLACED on a home page', async () => {
    mockApps();
    mockPlacedWidgets([{ type: 'battery' }, { type: 'weather', size: 'medium' }]);

    const { getByTestId, queryByTestId } = render(<LauncherHomeScreen />);

    await waitFor(() => expect(getByTestId('launcher-home-widgets-0')).toBeTruthy(), { timeout: 3000 });

    const stack = getByTestId('launcher-home-widgets-0');
    expect(within(stack).getByTestId('launcher-home-widget-battery')).toBeTruthy();
    expect(within(stack).getByTestId('launcher-home-widget-weather')).toBeTruthy();
    // Not placed — must not render unasked.
    expect(queryByTestId('launcher-home-widget-screenTime')).toBeNull();
  });

  it('renders only what was placed, not every enabled type', async () => {
    // The distinction #935 introduced. Enabled-in-Today-View is no longer the
    // same statement as on-the-home-screen.
    mockApps();
    mockPlacedWidgets([{ type: 'weather', size: 'medium' }]);

    const { getByTestId, queryByTestId } = render(<LauncherHomeScreen />);

    await waitFor(() => expect(getByTestId('launcher-home-widgets-0')).toBeTruthy(), { timeout: 3000 });

    expect(getByTestId('launcher-home-widget-weather')).toBeTruthy();
    expect(queryByTestId('launcher-home-widget-battery')).toBeNull();
    expect(queryByTestId('launcher-home-widget-storage')).toBeNull();
    expect(queryByTestId('launcher-home-widget-upNext')).toBeNull();
    expect(queryByTestId('launcher-home-widget-messages')).toBeNull();
  });

  it('renders nothing on the home grid for a migrated config, which is unplaced', async () => {
    // The upgrade path. Migrated widgets stay in the Today View and do not seize
    // the home screen: DEFAULT_ENABLED would take 20 of 24 cells.
    mockApps();
    mockWidgetConfig(['battery', 'weather', 'storage', 'upNext', 'messages']);

    const { getByTestId, queryByTestId } = render(<LauncherHomeScreen />);

    await waitFor(() => expect(getByTestId('launcher-page-grid-0')).toBeTruthy(), { timeout: 3000 });
    await new Promise((r) => setTimeout(r, 0));

    expect(queryByTestId('launcher-home-widgets-0')).toBeNull();
  });

  it('renders nothing in the widget area when the user disabled every widget', async () => {
    mockApps();
    mockWidgetConfig([]); // user removed every widget in Edit Widgets

    const { queryByTestId, getByTestId } = render(<LauncherHomeScreen />);

    // Give the async config load a chance to resolve before asserting absence.
    await waitFor(() => expect(getByTestId('launcher-page-grid-0')).toBeTruthy(), { timeout: 3000 });
    await new Promise((r) => setTimeout(r, 0));

    expect(queryByTestId('launcher-home-widgets-0')).toBeNull();
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
    expect(queryByTestId('launcher-home-widgets-0')).toBeNull();
  });

  it('PROBE renders a widget placed on a non-zero page only there', async () => {
    mockApps();
    mockPlacedWidgets([{ type: 'battery', page: 1 }]);

    const { getByTestId, queryByTestId } = render(<LauncherHomeScreen />);

    await waitFor(() => expect(getByTestId('launcher-home-widgets-1')).toBeTruthy(), { timeout: 3000 });
    expect(queryByTestId('launcher-home-widgets-0')).toBeNull();
  });

  it('tapping the Battery widget navigates to the Battery screen, same as from Today View', async () => {
    // A placed widget, since that is what the home grid renders now. The point
    // of the test is unchanged: a widget on the home screen is the same live
    // component as in the Today View, not a picture of one.
    mockApps();
    mockPlacedWidgets([{ type: 'battery' }]);

    const { getByTestId } = render(<LauncherHomeScreen />);
    await waitFor(() => expect(getByTestId('launcher-home-widget-battery')).toBeTruthy(), { timeout: 3000 });

    fireEvent.press(within(getByTestId('launcher-home-widget-battery')).getByRole('button'));
    expect(mockNavigate).toHaveBeenCalledWith('Battery');
  });
});
