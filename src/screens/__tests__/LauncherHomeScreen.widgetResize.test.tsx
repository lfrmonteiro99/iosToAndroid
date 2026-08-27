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
import * as SettingsStore from '../../store/SettingsStore';
import { DEFAULT_SETTINGS } from '../../store/SettingsStore';
import * as GestureReduceMotion from '../../utils/useGestureReduceMotion';
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
  seedRawWidgets(JSON.stringify(instances));
}

/** Seeds the stored blob verbatim — for a remount that must read back exactly
 * what the previous mount wrote, and for hostile values a helper would not
 * produce. */
function seedRawWidgets(json: string | null) {
  (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
    key === '@iostoandroid/widget_instances' ? Promise.resolve(json) : Promise.resolve(null),
  );
}

/** The last blob written to the widget-instances key, or undefined. */
function lastPersistedWidgets(): string | undefined {
  const calls = (AsyncStorage.setItem as jest.Mock).mock.calls.filter(
    ([key]) => key === '@iostoandroid/widget_instances',
  );
  return calls.length > 0 ? (calls[calls.length - 1][1] as string) : undefined;
}

/** Full replacement of useSettings, same convention as
 * LauncherHomeScreen.appLaunchTransition.test.tsx — needed so the screen's
 * other settings reads (and useGestureReduceMotion's own useSettings() call)
 * keep getting a complete SettingsState instead of undefined-field crashes. */
function mockSettings(overrides: Partial<SettingsStore.SettingsState>) {
  jest.spyOn(SettingsStore, 'useSettings').mockReturnValue({
    settings: { ...DEFAULT_SETTINGS, ...overrides },
    update: jest.fn(),
    updateMany: jest.fn(),
    reset: jest.fn(),
    syncFromDevice: jest.fn(() => Promise.resolve()),
    isReady: true,
    activeFocusMode: null,
    setFocusMode: jest.fn(),
  } as unknown as ReturnType<typeof SettingsStore.useSettings>);
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
    // Asserted on the sheet's CONTENT, not on its title: the title changed to
    // "Edit …" when the sheet gained colour and goal rows (#963), and matching
    // /Edit/ would also match the long-press menu's "Edit Home Screen".
    expect(utils.queryByText('Small (current)')).toBeNull();
  });

  it('offers only the ALLOWED_WIDGET_SIZES for the widget\'s type — Battery is small-only', async () => {
    mockApps([realApp('Chess', 'com.example.chess')]);
    mockFolders();
    mockPlacedWidgets([{ type: 'battery' }]);

    const utils = render(<LauncherHomeScreen />);
    await waitFor(() => expect(utils.getByTestId('launcher-home-widget-battery')).toBeTruthy());
    await enterJiggleMode(utils, 'Open Chess');

    fireEvent(within(utils.getByTestId('launcher-home-widget-battery')).getByLabelText('Resize Battery widget'), 'longPress');

    await waitFor(() => expect(utils.getByText('Edit Battery')).toBeTruthy());
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
    await waitFor(() => expect(utils.getByText('Edit Weather')).toBeTruthy());
    expect(utils.getByText('Small (current)')).toBeTruthy();
    expect(utils.getByText('Medium')).toBeTruthy();
    expect(utils.getByText('Large')).toBeTruthy();

    (AsyncStorage.setItem as jest.Mock).mockClear();
    fireEvent.press(utils.getByText('Medium'));

    // Sheet closes.
    await waitFor(() => expect(utils.queryByText('Edit Weather')).toBeNull());
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
    await waitFor(() => expect(utils.getByText('Edit Weather')).toBeTruthy());
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
    await waitFor(() => expect(utils.getByText('Edit Weather')).toBeTruthy());
    fireEvent.press(utils.getByText('Small'));

    // Back to 4 cells used by the widget — all 20 built-ins fit on page 0 again.
    await waitFor(() => expect(utils.queryByTestId('launcher-page-grid-1')).toBeNull());
    expect(within(utils.getByTestId('launcher-page-grid-0')).queryAllByLabelText(/^Open /)).toHaveLength(20);
  });

  // ------------------------------------------------------------------
  // Beyond the happy path
  // ------------------------------------------------------------------

  it('two instances of the same type resize independently (#937 AC 5)', async () => {
    // The whole point of moving size onto the instance (#933): one Weather on
    // the page may be large while its twin stays small. If resizeWidget still
    // addressed the TYPE, this would write 'large' to both.
    mockApps([realApp('Chess', 'com.example.chess')]);
    mockFolders();
    mockPlacedWidgets([
      { type: 'weather', size: 'small' },
      { type: 'weather', size: 'small' },
    ]);

    const utils = render(<LauncherHomeScreen />);
    await waitFor(() => expect(utils.getAllByTestId('launcher-home-widget-weather')).toHaveLength(2));
    await enterJiggleMode(utils, 'Open Chess');

    const [first] = utils.getAllByTestId('launcher-home-widget-weather');
    fireEvent(within(first).getByLabelText('Resize Weather widget'), 'longPress');
    await waitFor(() => expect(utils.getByText('Edit Weather')).toBeTruthy());
    fireEvent.press(utils.getByText('Large'));

    await waitFor(() => {
      const saved = JSON.parse(lastPersistedWidgets()!);
      expect(saved.map((i: { id: string; size: string }) => [i.id, i.size])).toEqual([
        ['weather-0', 'large'],
        ['weather-1', 'small'],
      ]);
    });
  });

  it('the chosen size survives a remount, read back from storage (#937 AC 6)', async () => {
    mockApps([realApp('Chess', 'com.example.chess')]);
    mockFolders();
    mockPlacedWidgets([{ type: 'weather', size: 'small' }]);

    const first = render(<LauncherHomeScreen />);
    await waitFor(() => expect(first.getByTestId('launcher-home-widget-weather')).toBeTruthy());
    await enterJiggleMode(first, 'Open Chess');
    fireEvent(within(first.getByTestId('launcher-home-widget-weather')).getByLabelText('Resize Weather widget'), 'longPress');
    await waitFor(() => expect(first.getByText('Edit Weather')).toBeTruthy());
    fireEvent.press(first.getByText('Medium'));
    await waitFor(() => expect(lastPersistedWidgets()).toBeTruthy());

    // Restart: the next mount reads back the EXACT blob the last one wrote,
    // not a helper-built stand-in — a size that only lived in React state
    // would come back 'small' here.
    const persisted = lastPersistedWidgets()!;
    first.unmount();
    seedRawWidgets(persisted);

    const second = render(<LauncherHomeScreen />);
    await waitFor(() => expect(second.getByTestId('launcher-home-widget-weather')).toBeTruthy());
    await enterJiggleMode(second, 'Open Chess');
    fireEvent(within(second.getByTestId('launcher-home-widget-weather')).getByLabelText('Resize Weather widget'), 'longPress');

    await waitFor(() => expect(second.getByText('Medium (current)')).toBeTruthy());
    expect(second.queryByText('Small (current)')).toBeNull();
  });

  it('a stored size the type does not declare is clamped before it reaches the layout (#937 AC 7, read path)', async () => {
    // The write path refuses it (widgetInstances.test.ts), but a blob from an
    // older build — or a hand-edited one — is the other door in. Unclamped, a
    // 'large' Battery lays out at 4x4 and eats 16 of the page's 24 cells,
    // pushing icons to page 1 to draw one percentage.
    mockApps([]);
    mockFolders();
    seedRawWidgets(JSON.stringify([{ id: 'battery-0', type: 'battery', size: 'large', page: 0, col: 0, row: 0 }]));

    const utils = render(<LauncherHomeScreen />);
    await waitFor(() => expect(utils.getByTestId('launcher-home-widget-battery')).toBeTruthy());

    // Clamped to 'small' (2x2 = 4 cells): the 20 built-ins still fit on page 0.
    expect(utils.queryByTestId('launcher-page-grid-1')).toBeNull();
    expect(within(utils.getByTestId('launcher-page-grid-0')).queryAllByLabelText(/^Open /)).toHaveLength(20);

    await enterJiggleMode(utils, 'Open Phone');
    fireEvent(within(utils.getByTestId('launcher-home-widget-battery')).getByLabelText('Resize Battery widget'), 'longPress');
    await waitFor(() => expect(utils.getByText('Small (current)')).toBeTruthy());
  });

  it('a corrupt widget blob leaves the home screen standing, with no widget', async () => {
    mockApps([realApp('Chess', 'com.example.chess')]);
    mockFolders();
    seedRawWidgets('{"not":"an array"}');

    const utils = render(<LauncherHomeScreen />);
    await waitFor(() => expect(utils.getByLabelText('Open Chess')).toBeTruthy());
    expect(utils.queryByTestId('launcher-home-widget-battery')).toBeNull();
    expect(utils.queryByTestId('launcher-home-widget-weather')).toBeNull();
  });
});

// #937 retrabalho — a reviewer round blocked the first PR because only the
// widget's own box animated on resize; the icons it displaces re-flowed
// instantly (flexWrap re-layout has no position to spring FROM). These tests
// prove the icons ALSO transition, through the same settle()/'mediumSettle'
// call as the widget box (DraggableWidgetTile), not a bespoke animation, and that
// reduceMotion still reaches every displaced icon.
//
// Spying directly on Reanimated's withSpring/withTiming does NOT work here:
// settle() carries the 'worklet' directive, and the reanimated Babel plugin
// closure-captures every withSpring/withTiming reference INSIDE a worklet at
// definition time, so jest.spyOn(Reanimated, 'withSpring') never sees those
// calls (0 every time, verified empirically) — this is already documented at
// useGestureReduceMotion.test.ts:3-13, which spies on settle()'s OWN
// exported unit instead of on what it calls internally. Same approach here:
// spy on `settle` itself (a plain, non-worklet import at this call site) to
// prove the icon reflow goes through it, with which preset and which
// reduceMotion flag — settle()'s branch selection (spring vs timing vs raw)
// is already covered by that file's own tests.
describe('LauncherHomeScreen widget resize — icon reflow animates too (#937 Armadilhas)', () => {
  it('growing Weather small→large calls settle()/mediumSettle for every displaced icon, not just the widget box', async () => {
    // Same fixture as 'growing a widget past the free space...' above: 0
    // installed apps, 20 built-ins fill page 0 exactly under a 'small' (2x2)
    // widget. Going to 'large' (4x4, occupies the whole first 4 rows) leaves
    // only 8 free cells on page 0 — the SAME 8 built-ins that already
    // rendered there under 'small', just shifted from rows 0-2 into rows 4-5
    // (homeGridLayout's firstFit scans row-major, and the enlarged widget
    // eats every free cell ahead of them, so none of the 8 keep their old
    // cell). This is exactly the "icons que refluem animam para a posição
    // nova" case from the issue's Armadilhas, and it happens without any of
    // the 8 leaving page 0 (the other 12 icons DO leave — that is a mount to
    // page 1, not a transition, and is deliberately excluded from this
    // count: a fresh AppIcon instance has no "old position" to animate from).
    mockApps([]);
    mockFolders();
    mockPlacedWidgets([{ type: 'weather', size: 'small' }]);

    const utils = render(<LauncherHomeScreen />);
    await waitFor(() => expect(utils.getByTestId('launcher-home-widget-weather')).toBeTruthy());
    await enterJiggleMode(utils, 'Open Phone');

    const settleSpy = jest.spyOn(GestureReduceMotion, 'settle');
    const before = settleSpy.mock.calls.length;

    fireEvent(within(utils.getByTestId('launcher-home-widget-weather')).getByLabelText('Resize Weather widget'), 'longPress');
    await waitFor(() => expect(utils.getByText('Edit Weather')).toBeTruthy());
    fireEvent.press(utils.getByText('Large'));
    await waitFor(() => expect(utils.getByTestId('launcher-page-grid-1')).toBeTruthy());

    // Widget box: left + top + width + height = 4 settle() calls. The 8
    // icons remaining on page 0 each animate left + top = 16 more. 4 + 16 =
    // 20 — a single settle() pass per moved value, not a snap and not a
    // double-fire. (An icon whose position is UNCHANGED never re-renders at
    // all — AppIcon is React.memo'd — so this count can only be reached if
    // all 8 actually moved, not merely re-rendered.)
    const calls = settleSpy.mock.calls.slice(before);
    expect(calls).toHaveLength(20);
    // Every one of those calls used the project's shared spring preset
    // (#487/#492), not a bespoke animation, and ran with motion allowed
    // (reduceMotion=false — the default).
    expect(calls.every(([, preset, reduceMotion]) => preset === 'mediumSettle' && reduceMotion === false)).toBe(true);

    settleSpy.mockRestore();
  });

  it('reduceMotion: the same reflow still calls settle() for every displaced icon, now with reduceMotion=true (immediate landing)', async () => {
    mockSettings({ reduceMotion: true });
    mockApps([]);
    mockFolders();
    mockPlacedWidgets([{ type: 'weather', size: 'small' }]);

    const utils = render(<LauncherHomeScreen />);
    await waitFor(() => expect(utils.getByTestId('launcher-home-widget-weather')).toBeTruthy());
    await enterJiggleMode(utils, 'Open Phone');

    const settleSpy = jest.spyOn(GestureReduceMotion, 'settle');
    const before = settleSpy.mock.calls.length;

    fireEvent(within(utils.getByTestId('launcher-home-widget-weather')).getByLabelText('Resize Weather widget'), 'longPress');
    await waitFor(() => expect(utils.getByText('Edit Weather')).toBeTruthy());
    fireEvent.press(utils.getByText('Large'));
    await waitFor(() => expect(utils.getByTestId('launcher-page-grid-1')).toBeTruthy());

    // Same 20 target values as the non-reduced case above — reduceMotion
    // changes HOW settle() resolves (see useGestureReduceMotion.test.ts:
    // reduceMotion=true takes the withTiming path), never WHETHER the
    // reflow reaches every displaced icon.
    const calls = settleSpy.mock.calls.slice(before);
    expect(calls).toHaveLength(20);
    expect(calls.every(([, preset, reduceMotion]) => preset === 'mediumSettle' && reduceMotion === true)).toBe(true);

    // The inverse of a snapped/broken reflow: reduceMotion changes HOW it
    // animates, never WHERE things end up.
    expect(within(utils.getByTestId('launcher-page-grid-0')).queryAllByLabelText(/^Open /)).toHaveLength(8);
    expect(within(utils.getByTestId('launcher-page-grid-1')).queryAllByLabelText(/^Open /)).toHaveLength(12);

    settleSpy.mockRestore();
  });

  it('the inverse: re-picking the size a widget already has moves nothing, so nothing animates', async () => {
    // Without this, the count above proves only "settle() ran a lot", not
    // "settle() ran because things MOVED": an implementation that re-fired
    // every icon's spring on every widget-store write would pass the two tests
    // above and flood the screen with springs on a no-op. Picking the current
    // size is also the repetition case — the same choice made twice in a row.
    mockApps([]);
    mockFolders();
    mockPlacedWidgets([{ type: 'weather', size: 'small' }]);

    const utils = render(<LauncherHomeScreen />);
    await waitFor(() => expect(utils.getByTestId('launcher-home-widget-weather')).toBeTruthy());
    await enterJiggleMode(utils, 'Open Phone');

    const settleSpy = jest.spyOn(GestureReduceMotion, 'settle');
    const before = settleSpy.mock.calls.length;

    for (let i = 0; i < 2; i++) {
      fireEvent(within(utils.getByTestId('launcher-home-widget-weather')).getByLabelText('Resize Weather widget'), 'longPress');
      await waitFor(() => expect(utils.getByText('Small (current)')).toBeTruthy());
      fireEvent.press(utils.getByText('Small (current)'));
      await waitFor(() => expect(utils.queryByText('Edit Weather')).toBeNull());
    }

    expect(settleSpy.mock.calls.slice(before)).toHaveLength(0);
    // ...and the layout is exactly where it started.
    expect(utils.queryByTestId('launcher-page-grid-1')).toBeNull();
    expect(within(utils.getByTestId('launcher-page-grid-0')).queryAllByLabelText(/^Open /)).toHaveLength(20);

    settleSpy.mockRestore();
  });
});
