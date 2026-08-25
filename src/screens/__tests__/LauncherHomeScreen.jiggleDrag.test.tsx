import React from 'react';
import { Dimensions, ScrollView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { render, fireEvent, waitFor, cleanup } from '../../test-utils';
import * as AppsStore from '../../store/AppsStore';
import * as FoldersStore from '../../store/FoldersStore';
import { BUILT_IN_APPS, DRAG_EDGE_THRESHOLD_DP } from '../LauncherHomeScreen';
import { computeLauncherGridGeometry } from '../../utils/launcherGridGeometry';

// #761: jiggle-mode drag-to-reorder. Before this fix there was no
// `Gesture.Pan` at all on `AppIcon` — `git log --all --oneline | grep -iE
// "reorder|drag|swap|move app|reposition"` returned nothing in any branch.
// This exercises the REAL gesture wired into AppIcon/LauncherHomeScreen (the
// `dragGesture` built inside AppIcon, captured via a module-level re-mock of
// react-native-gesture-handler — same technique as
// LauncherHomeScreen.todayViewGesture.test.tsx and .pagerRubberBand.test.tsx),
// not a reimplementation of the swap/edge-scroll math (that math is already
// covered directly, unit-level, in utils/__tests__/launcherDrag.test.ts).

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

type PanRecord = {
  minDistance?: number;
  enabled?: unknown;
  onBegin?: () => void;
  onUpdate?: (e: { translationX: number; translationY: number; absoluteX: number; absoluteY: number }) => void;
  onEnd?: (e: { translationX: number; translationY: number; absoluteX: number; absoluteY: number }) => void;
  onFinalize?: () => void;
};

const mockPanRecords: PanRecord[] = [];

jest.mock('react-native-gesture-handler', () => {
  const chain = (record: Record<string, unknown>) => {
    const g: Record<string, unknown> = {};
    [
      'activeOffsetX', 'activeOffsetY', 'simultaneousWithExternalGesture', 'withRef', 'onChange',
      'onStart', 'onTouchesBegan', 'onTouchesMove', 'onTouchesUp', 'onTouchesCancelled',
      'hitSlop', 'maxPointers', 'minPointers', 'averageTouches', 'failOffsetX', 'failOffsetY',
    ].forEach((m) => { g[m] = () => g; });
    g.minDistance = (v: number) => { record.minDistance = v; return g; };
    g.enabled = (v: unknown) => { record.enabled = v; return g; };
    g.onBegin = (fn: unknown) => { record.onBegin = fn; return g; };
    g.onUpdate = (fn: unknown) => { record.onUpdate = fn; return g; };
    g.onEnd = (fn: unknown) => { record.onEnd = fn; return g; };
    g.onFinalize = (fn: unknown) => { record.onFinalize = fn; return g; };
    return g;
  };
  return {
    GestureHandlerRootView: 'View',
    GestureDetector: 'View',
    Gesture: {
      Pan: () => {
        const record: Record<string, unknown> = { enabled: true };
        mockPanRecords.push(record as never);
        return chain(record);
      },
      Tap: () => chain({}),
      LongPress: () => chain({}),
      Fling: () => chain({}),
      Exclusive: (...gs: unknown[]) => gs[0],
      Simultaneous: (...gs: unknown[]) => gs[0],
      Race: (...gs: unknown[]) => gs[0],
    },
    Swipeable: 'View',
    DrawerLayout: 'View',
    State: {},
    PanGestureHandler: 'View',
    TapGestureHandler: 'View',
    FlatList: 'FlatList',
    ScrollView: 'ScrollView',
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { LauncherHomeScreen } = require('../LauncherHomeScreen');

const SCREEN_WIDTH = Dimensions.get('window').width;

// Every BUILT_IN_APPS package parked inside one folder so none of the 16
// virtual built-ins render in the grid (`appsInFolders` excludes them
// unconditionally — LauncherHomeScreen.tsx gridItems useMemo) OR in the dock
// (dockApps mocked empty below): a folder renders as a single FolderIcon,
// which has no drag gesture at all, so it can never pollute the drag-pan
// records captured from the grid's real AppIcons. Leaves only the test's own
// apps as grid items, at deterministic indices.
function mockAllBuiltInsInOneFolder() {
  jest.spyOn(FoldersStore, 'useFolders').mockReturnValue({
    folders: [{ id: 'builtins', name: 'Built-ins', apps: Object.keys(BUILT_IN_APPS), color: '#888888' }],
    createFolder: jest.fn(),
    renameFolder: jest.fn(),
    addToFolder: jest.fn(),
    removeFromFolder: jest.fn(),
    deleteFolder: jest.fn(),
    getFolderForApp: jest.fn(() => undefined),
    isReady: true,
  } as ReturnType<typeof FoldersStore.useFolders>);
}

function mockApps(overrides: Record<string, unknown> = {}) {
  const swapHomeApps = jest.fn();
  const removeFromHome = jest.fn();
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
    removeFromHome,
    swapHomeApps,
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
    ...overrides,
  } as ReturnType<typeof AppsStore.useApps>);
  return { swapHomeApps, removeFromHome };
}

function seedSettings(partial: Record<string, unknown>) {
  (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
    key === '@iostoandroid/settings'
      ? Promise.resolve(JSON.stringify(partial))
      : Promise.resolve(null),
  );
}

/** Enters jiggle mode via the real UI path: long-press an icon → action sheet
 * → "Edit Home Screen". Settles on the "✕" delete button becoming visible
 * (only rendered once isJiggling is actually true), then returns the LAST
 * `appCount` drag-pan records (tagged by minDistance, which only AppIcon's
 * own drag gesture sets — the screen-level pans never call it), in page
 * order. Taking the tail instead of a since-before diff sidesteps unrelated
 * provider re-renders (DeviceStore/SettingsStore async effects settling
 * elsewhere in the tree) recreating every AppIcon's gesture in between. */
async function enterJiggleAndCaptureDragPans(
  getByLabelText: (l: string) => unknown,
  getByText: (t: string) => unknown,
  anyAppLabel: string,
  anyDeleteLabel: string,
  appCount: number,
) {
  fireEvent(getByLabelText(anyAppLabel), 'longPress');
  fireEvent.press(getByText('Edit Home Screen') as never);
  await waitFor(() => expect(getByLabelText(anyDeleteLabel)).toBeTruthy());
  return mockPanRecords.filter((r) => r.minDistance === 10).slice(-appCount);
}

beforeEach(() => {
  mockNavigate.mockClear();
  mockPanRecords.length = 0;
  seedSettings({});
  mockAllBuiltInsInOneFolder();
});

afterEach(() => {
  cleanup();
  jest.restoreAllMocks();
});

describe('LauncherHomeScreen jiggle-mode drag-to-reorder (#761)', () => {
  const alpha = { name: 'Alpha', packageName: 'com.example.alpha', icon: '', isSystem: false };
  const beta = { name: 'Beta', packageName: 'com.example.beta', icon: '', isSystem: false };

  it('dropping icon A onto icon B\'s cell swaps their positions', async () => {
    seedSettings({ gridColumns: 4 });
    const { swapHomeApps } = mockApps({
      nonDockApps: [alpha, beta],
      apps: [alpha, beta],
      homeApps: [
        { packageName: 'com.example.alpha', position: 0 },
        { packageName: 'com.example.beta', position: 1 },
      ],
    });
    const { getByLabelText, getByText } = render(<LauncherHomeScreen />);
    await waitFor(() => expect(getByLabelText('Open Alpha')).toBeTruthy());

    const pans = await enterJiggleAndCaptureDragPans(getByLabelText, getByText, 'Open Alpha', 'Remove Alpha', 2);
    expect(pans).toHaveLength(2); // alpha (index 0), beta (index 1) — the only grid items

    const geometry = computeLauncherGridGeometry(SCREEN_WIDTH, 4, 1);
    const alphaPan = pans[0];
    alphaPan.onBegin!();
    alphaPan.onEnd!({ translationX: geometry.cellWidth, translationY: 0, absoluteX: 200, absoluteY: 200 });

    expect(swapHomeApps).toHaveBeenCalledWith('com.example.alpha', 'com.example.beta');
  });

  it('dropping back on the same cell (no movement) does not call swapHomeApps', async () => {
    seedSettings({ gridColumns: 4 });
    const { swapHomeApps } = mockApps({
      nonDockApps: [alpha, beta],
      apps: [alpha, beta],
      homeApps: [
        { packageName: 'com.example.alpha', position: 0 },
        { packageName: 'com.example.beta', position: 1 },
      ],
    });
    const { getByLabelText, getByText } = render(<LauncherHomeScreen />);
    await waitFor(() => expect(getByLabelText('Open Alpha')).toBeTruthy());

    const pans = await enterJiggleAndCaptureDragPans(getByLabelText, getByText, 'Open Alpha', 'Remove Alpha', 2);
    const alphaPan = pans[0];
    alphaPan.onBegin!();
    alphaPan.onEnd!({ translationX: 0, translationY: 0, absoluteX: 100, absoluteY: 100 });

    expect(swapHomeApps).not.toHaveBeenCalled();
  });

  it('the "✕" delete button still removes the app and does not trigger a swap', async () => {
    seedSettings({ gridColumns: 4 });
    const { swapHomeApps, removeFromHome } = mockApps({
      nonDockApps: [alpha, beta],
      apps: [alpha, beta],
      homeApps: [
        { packageName: 'com.example.alpha', position: 0 },
        { packageName: 'com.example.beta', position: 1 },
      ],
    });
    const { getByLabelText, getByText } = render(<LauncherHomeScreen />);
    await waitFor(() => expect(getByLabelText('Open Alpha')).toBeTruthy());
    await enterJiggleAndCaptureDragPans(getByLabelText, getByText, 'Open Alpha', 'Remove Alpha', 2);

    fireEvent.press(getByLabelText('Remove Alpha'), { stopPropagation: jest.fn() });

    expect(removeFromHome).toHaveBeenCalledWith('com.example.alpha');
    expect(swapHomeApps).not.toHaveBeenCalled();
  });

  it('a drag near the right screen edge scrolls to the adjacent page', async () => {
    // 1 column x 1 row → 1 app per page, so 3 apps make 3 distinct pages.
    seedSettings({ gridColumns: 1, gridRows: 1 });
    const gamma = { name: 'Gamma', packageName: 'com.example.gamma', icon: '', isSystem: false };
    mockApps({
      nonDockApps: [alpha, beta, gamma],
      apps: [alpha, beta, gamma],
      homeApps: [
        { packageName: 'com.example.alpha', position: 0 },
        { packageName: 'com.example.beta', position: 1 },
        { packageName: 'com.example.gamma', position: 2 },
      ],
    });
    const scrollToSpy = jest.spyOn(ScrollView.prototype, 'scrollTo').mockImplementation(() => {});
    const { getByLabelText, getByText, unmount } = render(<LauncherHomeScreen />);
    await waitFor(() => expect(getByLabelText('Open Alpha')).toBeTruthy());

    // The pager mounts every page's icons at once (a plain horizontal
    // ScrollView, not virtualized) — alpha/beta/gamma all get a drag-pan in
    // the same render, in page order. The built-ins folder (from
    // mockAllBuiltInsInOneFolder in beforeEach) is itself one grid item with
    // no drag gesture of its own, so it occupies page 0 — alpha lands on
    // page 1, not page 0.
    const pans = await enterJiggleAndCaptureDragPans(getByLabelText, getByText, 'Open Alpha', 'Remove Alpha', 3);
    expect(pans).toHaveLength(3);

    const alphaPan = pans[0];
    alphaPan.onBegin!();
    alphaPan.onUpdate!({
      translationX: 0,
      translationY: 0,
      absoluteX: SCREEN_WIDTH - DRAG_EDGE_THRESHOLD_DP,
      absoluteY: 200,
    });

    expect(scrollToSpy).toHaveBeenCalledWith({ x: 2 * SCREEN_WIDTH, animated: true });
    // setCurrentPage(2) above is a real React state update fired from a
    // direct worklet-callback invocation (not wrapped in act()/fireEvent), so
    // it can stay unflushed past this point — unmount before the next test
    // starts so its eventual flush can't leak a stray scrollTo() into a
    // later test's spy (both instances share the same ScrollView.prototype).
    unmount();
  });

  it('a drag in the middle of the screen does not trigger any page scroll', async () => {
    seedSettings({ gridColumns: 1, gridRows: 1 });
    const gamma = { name: 'Gamma', packageName: 'com.example.gamma', icon: '', isSystem: false };
    mockApps({
      nonDockApps: [alpha, beta, gamma],
      apps: [alpha, beta, gamma],
      homeApps: [
        { packageName: 'com.example.alpha', position: 0 },
        { packageName: 'com.example.beta', position: 1 },
        { packageName: 'com.example.gamma', position: 2 },
      ],
    });
    const scrollToSpy = jest.spyOn(ScrollView.prototype, 'scrollTo').mockImplementation(() => {});
    const { getByLabelText, getByText } = render(<LauncherHomeScreen />);
    await waitFor(() => expect(getByLabelText('Open Alpha')).toBeTruthy());

    const pans = await enterJiggleAndCaptureDragPans(getByLabelText, getByText, 'Open Alpha', 'Remove Alpha', 3);
    // Reset any call recorded before this point: jest.spyOn on a class
    // PROTOTYPE method can return the SAME spy across tests instead of a
    // fresh one when the previous test's spy wasn't fully torn down (a known
    // jest.spyOn/restoreAllMocks interaction), which would otherwise carry a
    // prior test's call into this assertion. mockClear() zeroes history
    // either way, so this test only sees its OWN call, if any.
    scrollToSpy.mockClear();
    const alphaPan = pans[0];
    alphaPan.onBegin!();
    alphaPan.onUpdate!({ translationX: 0, translationY: 0, absoluteX: SCREEN_WIDTH / 2, absoluteY: 200 });

    expect(scrollToSpy).not.toHaveBeenCalled();
  });

  it('the inverse of the fix: outside jiggle mode, a tap still opens the built-in app (no regression)', async () => {
    jest.spyOn(FoldersStore, 'useFolders').mockReturnValue({
      folders: [],
      createFolder: jest.fn(),
      renameFolder: jest.fn(),
      addToFolder: jest.fn(),
      removeFromFolder: jest.fn(),
      deleteFolder: jest.fn(),
      getFolderForApp: jest.fn(() => undefined),
      isReady: true,
    } as ReturnType<typeof FoldersStore.useFolders>);
    mockApps({ dockApps: [], nonDockApps: [], apps: [], homeApps: [] });
    const { getByLabelText } = render(<LauncherHomeScreen />);
    await waitFor(() => expect(getByLabelText('Open Phone')).toBeTruthy());

    fireEvent.press(getByLabelText('Open Phone'));

    expect(mockNavigate).toHaveBeenCalledWith('Phone');
  });
});
