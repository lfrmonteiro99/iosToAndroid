import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { render, waitFor, within } from '../../test-utils';
import * as AppsStore from '../../store/AppsStore';
import { LauncherHomeScreen, BUILT_IN_APPS } from '../LauncherHomeScreen';
import { computeLauncherGridGeometry } from '../../utils/launcherGridGeometry';

// issue #503: gridColumns / gridRows / iconSizeScale / showIconLabels must
// reshape the home-screen grid live, from SettingsStore — before this issue
// the pager always used a fixed 4x6 = 24 apps/page regardless of settings.
//
// useApps is mocked the same way LauncherHomeScreen.perf.test.tsx does it
// (isLoading: false, empty app lists): AppsStore's real Android loading path
// resolves isLoading asynchronously, and letting that transition actually
// complete under `waitFor` re-exposes a pre-existing hook-count mismatch in
// LauncherHomeScreen (hooks after the isLoading early-return are only called
// once isLoading flips to false — see the `eslint-disable react-hooks/rules-of-hooks`
// above `gridItems`). That's out of scope for #503; mocking useApps to a
// stable isLoading:false, like the existing perf test already does, avoids
// ever crossing that boundary. Settings still load through the real
// SettingsProvider (via test-utils), seeded through AsyncStorage.
function mockApps(overrides: Record<string, unknown> = {}) {
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
    ...overrides,
  } as ReturnType<typeof AppsStore.useApps>);
}

function seedSettings(partial: Record<string, unknown>) {
  (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
    key === '@iostoandroid/settings'
      ? Promise.resolve(JSON.stringify(partial))
      : Promise.resolve(null),
  );
}

const BUILT_IN_COUNT = Object.keys(BUILT_IN_APPS).length; // 14 virtual apps, no real device apps mocked

beforeEach(() => {
  mockApps();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('LauncherHomeScreen grid density settings (#503)', () => {
  it('paginates using gridColumns x gridRows from settings, not a fixed 24/page', async () => {
    // 3 cols x 2 rows = 6 apps/page; 14 built-in apps need 3 pages (6+6+2).
    seedSettings({ gridColumns: 3, gridRows: 2 });
    const { getByTestId, queryByTestId } = render(<LauncherHomeScreen />);

    await waitFor(() => expect(getByTestId('launcher-page-grid-2')).toBeTruthy(), { timeout: 3000 });
    expect(queryByTestId('launcher-page-grid-1')).toBeTruthy();
  });

  it('uses a single app page at the default 4x6 density for the same app set', async () => {
    seedSettings({});
    const { getByTestId, queryByTestId } = render(<LauncherHomeScreen />);

    await waitFor(() => expect(getByTestId('launcher-page-grid-0')).toBeTruthy(), { timeout: 3000 });
    // 14 built-in apps < 24/page: only one app page (plus the App Library
    // page, which isn't a launcher-page-grid-* testID).
    await waitFor(() => expect(queryByTestId('launcher-page-grid-1')).toBeNull(), { timeout: 3000 });
  });

  it('re-packs pages without reordering apps when density changes', async () => {
    seedSettings({ gridColumns: 4, gridRows: 6 });
    const wide = render(<LauncherHomeScreen />);
    await waitFor(() => expect(wide.getByTestId('launcher-page-grid-0')).toBeTruthy(), { timeout: 3000 });
    const wideOrder = within(wide.getByTestId('launcher-page-grid-0'))
      .getAllByRole('button')
      .map((n) => n.props.accessibilityLabel)
      .filter((l: string) => l?.startsWith('Open '));
    wide.unmount();

    seedSettings({ gridColumns: 3, gridRows: 2 });
    const narrow = render(<LauncherHomeScreen />);
    await waitFor(() => expect(narrow.getByTestId('launcher-page-grid-2')).toBeTruthy(), { timeout: 3000 });
    const narrowOrder = [0, 1, 2].flatMap((i) =>
      within(narrow.getByTestId(`launcher-page-grid-${i}`))
        .getAllByRole('button')
        .map((n) => n.props.accessibilityLabel)
        .filter((l: string) => l?.startsWith('Open ')),
    );
    narrow.unmount();

    expect(narrowOrder).toHaveLength(BUILT_IN_COUNT);
    expect(narrowOrder).toEqual(wideOrder);
  });

  it('showIconLabels: false hides app names in the grid but keeps icons tappable', async () => {
    seedSettings({ showIconLabels: false });
    const { queryByText, getByLabelText } = render(<LauncherHomeScreen />);

    await waitFor(() => expect(getByLabelText('Open Phone')).toBeTruthy(), { timeout: 3000 });
    expect(queryByText('Phone')).toBeNull();
  });

  it('showIconLabels: true (default) shows app names in the grid', async () => {
    seedSettings({});
    const { queryByText } = render(<LauncherHomeScreen />);

    await waitFor(() => expect(queryByText('Phone')).toBeTruthy(), { timeout: 3000 });
  });

  it('iconSizeScale resizes the rendered icon box and keeps it within the cell', async () => {
    seedSettings({ iconSizeScale: 1.2, gridColumns: 6 });
    const { getByTestId } = render(<LauncherHomeScreen />);

    await waitFor(() => expect(getByTestId('app-icon-box-com.iostoandroid.phone')).toBeTruthy(), { timeout: 3000 });
    const box = getByTestId('app-icon-box-com.iostoandroid.phone');
    const style = box.props.style;
    const flat = (Array.isArray(style) ? style.flat(Infinity) : [style]).filter(Boolean) as Record<string, number>[];
    const width = flat.reduce((acc, s) => (s.width != null ? s.width : acc), undefined as number | undefined);

    const expected = computeLauncherGridGeometry(
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('react-native').Dimensions.get('window').width,
      6,
      1.2,
    );
    expect(width).toBe(expected.iconSize);
    expect(width).toBeLessThanOrEqual(expected.cellWidth);
  });
});
