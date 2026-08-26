import React from 'react';
import { Dimensions } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { render, fireEvent, waitFor, cleanup, act } from '../../test-utils';
import * as AppsStore from '../../store/AppsStore';
import * as FoldersStore from '../../store/FoldersStore';
import { computeLauncherGridGeometry } from '../../utils/launcherGridGeometry';
import { WIDGET_INSTANCES_KEY } from '../../widgets/widgetInstances';

// #938: widgets drag in jiggle mode, same pattern AppIcon has had since #761 —
// this is the RED step from the issue itself: "simular um pan sobre um widget
// em jiggle mode e afirmar que o col/row da instância mudou". Before this fix
// there is no Gesture.Pan anywhere on a home-screen widget at all (grep for
// "widget" combined with drag/pan/gesture in LauncherHomeScreen.tsx returned
// nothing) — a widget was a plain static View.
//
// Uses the same react-native-gesture-handler re-mock technique as
// LauncherHomeScreen.jiggleDrag.test.tsx (captures the real Gesture.Pan
// built inside the component, not a reimplementation of the drag math — that
// pure math is covered directly in utils/__tests__/launcherDrag.test.ts and
// widgets/__tests__/homeGridLayout.test.ts).

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
  onUpdate?: (e: { translationX: number; translationY: number; absoluteX: number; absoluteY: number; velocityX: number; velocityY: number }) => void;
  onEnd?: (e: { translationX: number; translationY: number; absoluteX: number; absoluteY: number; velocityX: number; velocityY: number }) => void;
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
const { LauncherHomeScreen, BUILT_IN_APPS } = require('../LauncherHomeScreen');

const SCREEN_WIDTH = Dimensions.get('window').width;

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
    swapHomeApps: jest.fn(),
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
}

/** One app (for entering jiggle mode) + widget instance(s) PLACED on page 0. */
function seedStorage(opts: { widgetInstances?: unknown[]; settings?: Record<string, unknown> } = {}) {
  const widgetInstances = opts.widgetInstances ?? [{ id: 'battery-0', type: 'battery', size: 'small', page: 0, col: 0, row: 0 }];
  const values: Record<string, unknown> = {
    '@iostoandroid/settings': { gridColumns: 4, ...(opts.settings ?? {}) },
    [WIDGET_INSTANCES_KEY]: widgetInstances,
  };
  (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
    Promise.resolve(key in values ? JSON.stringify(values[key]) : null),
  );
}

async function enterJiggleAndCaptureLastDragPan(
  getByLabelText: (l: string) => unknown,
  getByText: (t: string) => unknown,
  anyAppLabel: string,
  anyDeleteLabel: string,
) {
  fireEvent(getByLabelText(anyAppLabel), 'longPress');
  fireEvent.press(getByText('Edit Home Screen') as never);
  await waitFor(() => expect(getByLabelText(anyDeleteLabel)).toBeTruthy());
  // The widget renders AFTER the icon grid in the page JSX, so its drag-pan
  // (minDistance 10, same convention as AppIcon's #761 gesture) is captured
  // last among this page's records.
  const dragPans = mockPanRecords.filter((r) => r.minDistance === 10);
  return dragPans[dragPans.length - 1];
}

beforeEach(() => {
  mockNavigate.mockClear();
  mockPanRecords.length = 0;
  mockAllBuiltInsInOneFolder();
});

afterEach(() => {
  cleanup();
  jest.restoreAllMocks();
});

describe('LauncherHomeScreen widget drag-to-reorder (#938)', () => {
  const alpha = { name: 'Alpha', packageName: 'com.example.alpha', icon: '', isSystem: false };

  it('dragging a widget one cell right persists its new column', async () => {
    seedStorage();
    mockApps({
      nonDockApps: [alpha],
      apps: [alpha],
      homeApps: [{ packageName: 'com.example.alpha', position: 0 }],
    });
    const setItemSpy = AsyncStorage.setItem as jest.Mock;
    const { getByLabelText, getByText, getByTestId } = render(<LauncherHomeScreen />);
    await waitFor(() => expect(getByLabelText('Open Alpha')).toBeTruthy());
    await waitFor(() => expect(getByTestId('launcher-home-widget-battery')).toBeTruthy());

    const widgetPan = await enterJiggleAndCaptureLastDragPan(getByLabelText, getByText, 'Open Alpha', 'Remove Alpha');
    expect(widgetPan).toBeTruthy();

    const geometry = computeLauncherGridGeometry(SCREEN_WIDTH, 4, 1);
    setItemSpy.mockClear();

    act(() => widgetPan.onBegin!());
    act(() => widgetPan.onUpdate!({ translationX: geometry.cellWidth, translationY: 0, absoluteX: 200, absoluteY: 200, velocityX: 0, velocityY: 0 }));
    act(() => widgetPan.onEnd!({ translationX: geometry.cellWidth, translationY: 0, absoluteX: 200, absoluteY: 200, velocityX: 0, velocityY: 0 }));

    await waitFor(() => {
      const persisted = setItemSpy.mock.calls.find((c) => c[0] === WIDGET_INSTANCES_KEY);
      expect(persisted).toBeTruthy();
      const saved = JSON.parse(persisted![1]);
      expect(saved).toEqual([expect.objectContaining({ id: 'battery-0', page: 0, col: 1, row: 0 })]);
    });
  });

  it('dropping back on the same cell (no movement) does not persist anything', async () => {
    seedStorage();
    mockApps({
      nonDockApps: [alpha],
      apps: [alpha],
      homeApps: [{ packageName: 'com.example.alpha', position: 0 }],
    });
    const setItemSpy = AsyncStorage.setItem as jest.Mock;
    const { getByLabelText, getByText, getByTestId } = render(<LauncherHomeScreen />);
    await waitFor(() => expect(getByLabelText('Open Alpha')).toBeTruthy());
    await waitFor(() => expect(getByTestId('launcher-home-widget-battery')).toBeTruthy());

    const widgetPan = await enterJiggleAndCaptureLastDragPan(getByLabelText, getByText, 'Open Alpha', 'Remove Alpha');
    setItemSpy.mockClear();

    act(() => widgetPan.onBegin!());
    act(() => widgetPan.onEnd!({ translationX: 0, translationY: 0, absoluteX: 100, absoluteY: 100, velocityX: 0, velocityY: 0 }));

    // Give any pending microtask a turn, then assert nothing was persisted.
    await act(async () => { await Promise.resolve(); });
    expect(setItemSpy.mock.calls.find((c) => c[0] === WIDGET_INSTANCES_KEY)).toBeUndefined();
  });

  it('an invalid drop (onto another widget) reverts and does not persist a move', async () => {
    // Battery (small, 2x2) at (0,0); Storage (small, 2x2) at (2,0) — dragging
    // Battery two cells right would overlap Storage's cells, so the drop must
    // be refused rather than silently relocated (AC: "nunca fica sobreposto").
    seedStorage({
      widgetInstances: [
        { id: 'battery-0', type: 'battery', size: 'small', page: 0, col: 0, row: 0 },
        { id: 'storage-0', type: 'storage', size: 'small', page: 0, col: 2, row: 0 },
      ],
    });
    mockApps({
      nonDockApps: [alpha],
      apps: [alpha],
      homeApps: [{ packageName: 'com.example.alpha', position: 0 }],
    });
    const setItemSpy = AsyncStorage.setItem as jest.Mock;
    const { getByLabelText, getByText, getByTestId } = render(<LauncherHomeScreen />);
    await waitFor(() => expect(getByLabelText('Open Alpha')).toBeTruthy());
    await waitFor(() => expect(getByTestId('launcher-home-widget-battery')).toBeTruthy());
    await waitFor(() => expect(getByTestId('launcher-home-widget-storage')).toBeTruthy());

    fireEvent(getByLabelText('Open Alpha'), 'longPress');
    fireEvent.press(getByText('Edit Home Screen') as never);
    await waitFor(() => expect(getByLabelText('Remove Alpha')).toBeTruthy());
    // Two widget pans registered (battery, storage) — battery is the FIRST
    // one placed in homeLayout[0].widgets (col 0 before col 2).
    const dragPans = mockPanRecords.filter((r) => r.minDistance === 10);
    const batteryPan = dragPans[dragPans.length - 2];

    const geometry = computeLauncherGridGeometry(SCREEN_WIDTH, 4, 1);
    setItemSpy.mockClear();

    act(() => batteryPan.onBegin!());
    act(() => batteryPan.onUpdate!({ translationX: geometry.cellWidth * 2, translationY: 0, absoluteX: 200, absoluteY: 200, velocityX: 0, velocityY: 0 }));
    act(() => batteryPan.onEnd!({ translationX: geometry.cellWidth * 2, translationY: 0, absoluteX: 200, absoluteY: 200, velocityX: 0, velocityY: 0 }));

    await act(async () => { await Promise.resolve(); });
    expect(setItemSpy.mock.calls.find((c) => c[0] === WIDGET_INSTANCES_KEY)).toBeUndefined();
  });
});
