/**
 * #937: choosing a widget's size in jiggle mode.
 *
 * Before this issue there was a write path at the data layer (`resizeWidget`,
 * widgetInstances.ts, #933) but nothing in the UI ever called it — long-pressing
 * a placed widget did nothing. These tests cover the new trigger: long-press a
 * placed widget while jiggling opens a size sheet, it only offers the sizes
 * ALLOWED_WIDGET_SIZES declares for that type, and picking one persists and
 * reflows the grid — proved through the real screen, not just the pure packer
 * functions (already covered by widgetInstances.test.ts / homeGridLayout.test.ts).
 */
import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { render, fireEvent, waitFor, within } from '../../test-utils';
import * as AppsStore from '../../store/AppsStore';
import * as FoldersStore from '../../store/FoldersStore';
import { LauncherHomeScreen } from '../LauncherHomeScreen';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn(), push: jest.fn() }),
}));

const realApp = (name: string, packageName: string): AppsStore.InstalledApp => ({
  name,
  packageName,
  icon: 'content://icons/one.png',
  isSystem: false,
});

function mockApps(apps: AppsStore.InstalledApp[]) {
  jest.spyOn(AppsStore, 'useApps').mockReturnValue({
    apps,
    homeApps: apps.map((a, i) => ({ packageName: a.packageName, position: i })),
    dockApps: [],
    nonDockApps: apps,
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
    hiddenApps: [],
    visibleApps: apps,
    hideApp: jest.fn(),
    unhideApp: jest.fn(),
    iconCacheSizeBytes: 0,
    isRebuildingIconCache: false,
    iconCacheRebuildProgress: null,
    rebuildIconCache: jest.fn(() => Promise.resolve()),
    compactHomeLayout: jest.fn(),
    swapHomeApps: jest.fn(),
    libraryOnlyApps: [],
    protectedApps: [],
    protectApp: jest.fn(),
    unprotectApp: jest.fn(),
  } as unknown as ReturnType<typeof AppsStore.useApps>);
}

function mockFolders() {
  jest.spyOn(FoldersStore, 'useFolders').mockReturnValue({
    folders: [],
    createFolder: jest.fn(),
    renameFolder: jest.fn(),
    addToFolder: jest.fn(),
    removeFromFolder: jest.fn(),
    deleteFolder: jest.fn(),
    getFolderForApp: jest.fn(() => undefined),
    isReady: true,
  } as unknown as ReturnType<typeof FoldersStore.useFolders>);
}

/** Seeds instances PLACED on the home grid — same helper as homeWidgets.test.tsx. */
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

async function enterJiggleMode(utils: ReturnType<typeof render>, appLabel: string) {
  fireEvent(utils.getByLabelText(appLabel), 'longPress');
  await waitFor(() => expect(utils.getByText('Edit Home Screen')).toBeTruthy());
  fireEvent.press(utils.getByText('Edit Home Screen'));
  await waitFor(() => expect(utils.getByLabelText('Done')).toBeTruthy());
}

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('LauncherHomeScreen widget resize (#937)', () => {
  it('renders no resize affordance for a placed widget outside jiggle mode', async () => {
    mockApps([realApp('Chess', 'com.example.chess')]);
    mockFolders();
    mockPlacedWidgets([{ type: 'battery' }]);

    const utils = render(<LauncherHomeScreen />);
    await waitFor(() => expect(utils.getByTestId('launcher-home-widget-battery')).toBeTruthy());

    // No long-press target exists at all outside jiggle mode — same
    // convention as AppIcon, whose jiggle-only "✕" delete button is likewise
    // absent (not just disabled) until isJiggling is true.
    expect(within(utils.getByTestId('launcher-home-widget-battery')).queryByLabelText('Resize Battery widget')).toBeNull();
    expect(utils.queryByText(/Resize/)).toBeNull();
  });

  it('offers only the ALLOWED_WIDGET_SIZES for the widget\'s type — Battery is small-only', async () => {
    mockApps([realApp('Chess', 'com.example.chess')]);
    mockFolders();
    mockPlacedWidgets([{ type: 'battery' }]);

    const utils = render(<LauncherHomeScreen />);
    await waitFor(() => expect(utils.getByTestId('launcher-home-widget-battery')).toBeTruthy());
    await enterJiggleMode(utils, 'Open Chess');

    fireEvent(within(utils.getByTestId('launcher-home-widget-battery')).getByLabelText('Resize Battery widget'), 'longPress');

    await waitFor(() => expect(utils.getByText('Resize Battery')).toBeTruthy());
    expect(utils.getByText('Small (current)')).toBeTruthy();
    expect(utils.queryByText('Medium')).toBeNull();
    expect(utils.queryByText('Large')).toBeNull();
  });

  it('offers Small/Medium/Large for Weather, and picking one persists the new size', async () => {
    mockApps([realApp('Chess', 'com.example.chess')]);
    mockFolders();
    mockPlacedWidgets([{ type: 'weather', size: 'small' }]);

    const utils = render(<LauncherHomeScreen />);
    await waitFor(() => expect(utils.getByTestId('launcher-home-widget-weather')).toBeTruthy());
    await enterJiggleMode(utils, 'Open Chess');

    fireEvent(within(utils.getByTestId('launcher-home-widget-weather')).getByLabelText('Resize Weather widget'), 'longPress');
    await waitFor(() => expect(utils.getByText('Resize Weather')).toBeTruthy());
    expect(utils.getByText('Small (current)')).toBeTruthy();
    expect(utils.getByText('Medium')).toBeTruthy();
    expect(utils.getByText('Large')).toBeTruthy();

    (AsyncStorage.setItem as jest.Mock).mockClear();
    fireEvent.press(utils.getByText('Medium'));

    // Sheet closes.
    await waitFor(() => expect(utils.queryByText('Resize Weather')).toBeNull());
    // Persisted through the same @iostoandroid/widget_instances key the rest
    // of the widget epic (#933/#935) writes.
    await waitFor(() => {
      const call = (AsyncStorage.setItem as jest.Mock).mock.calls.find(
        ([key]) => key === '@iostoandroid/widget_instances',
      );
      expect(call).toBeTruthy();
      const saved = JSON.parse(call![1]);
      expect(saved).toEqual([expect.objectContaining({ type: 'weather', size: 'medium' })]);
    });
  });

  it('growing a widget past the free space on the page pushes icons to the next page, never overlapping (#937 AC 2/3)', async () => {
    // No installed apps at all — the grid still isn't empty: every built-in
    // (Phone, Messages, ...) renders its own virtual icon (LauncherHomeScreen's
    // `gridItems`, BUILT_IN_APPS), 20 of them. 4-col x 6-row page = 24 cells.
    // A 'small' weather widget (2x2 = 4 cells) leaves exactly 20 free — the 20
    // built-ins fill page 0 with nothing left over and nothing overflowing.
    // Grown to 'large' (4x4 = 16 cells) only 8 cells remain, so 12 of the 20
    // built-ins must move to a second page.
    mockApps([]);
    mockFolders();
    mockPlacedWidgets([{ type: 'weather', size: 'small' }]);

    const utils = render(<LauncherHomeScreen />);
    await waitFor(() => expect(utils.getByTestId('launcher-home-widget-weather')).toBeTruthy());
    // Every built-in icon fits on page 0 before the resize.
    expect(utils.queryByTestId('launcher-page-grid-1')).toBeNull();

    await enterJiggleMode(utils, 'Open Phone');
    fireEvent(within(utils.getByTestId('launcher-home-widget-weather')).getByLabelText('Resize Weather widget'), 'longPress');
    await waitFor(() => expect(utils.getByText('Resize Weather')).toBeTruthy());
    fireEvent.press(utils.getByText('Large'));

    // Reflow: a second page appears, holding exactly the 12 icons that no
    // longer fit — never dropped, never overlapping the widget.
    await waitFor(() => expect(utils.getByTestId('launcher-page-grid-1')).toBeTruthy());
    const page0 = utils.getByTestId('launcher-page-grid-0');
    const overflowPage = utils.getByTestId('launcher-page-grid-1');
    expect(within(page0).queryAllByLabelText(/^Open /)).toHaveLength(8);
    expect(within(overflowPage).queryAllByLabelText(/^Open /)).toHaveLength(12);
  });

  it('shrinking a widget returns cells and icons move back up (#937 AC 4)', async () => {
    mockApps([]);
    mockFolders();
    // Starts large (16 cells) — only 8 cells left for the 20 built-ins, so 12
    // overflow to page 1 from the very first render.
    mockPlacedWidgets([{ type: 'weather', size: 'large' }]);

    const utils = render(<LauncherHomeScreen />);
    await waitFor(() => expect(utils.getByTestId('launcher-page-grid-1')).toBeTruthy());

    await enterJiggleMode(utils, 'Open Phone');
    fireEvent(within(utils.getByTestId('launcher-home-widget-weather')).getByLabelText('Resize Weather widget'), 'longPress');
    await waitFor(() => expect(utils.getByText('Resize Weather')).toBeTruthy());
    fireEvent.press(utils.getByText('Small'));

    // Back to 4 cells used by the widget — all 20 built-ins fit on page 0 again.
    await waitFor(() => expect(utils.queryByTestId('launcher-page-grid-1')).toBeNull());
    expect(within(utils.getByTestId('launcher-page-grid-0')).queryAllByLabelText(/^Open /)).toHaveLength(20);
  });
});
