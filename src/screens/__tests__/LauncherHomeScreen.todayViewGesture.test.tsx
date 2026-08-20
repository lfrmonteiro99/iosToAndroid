import React from 'react';
import { render } from '../../test-utils';
import { gestureConfig } from '../../utils/gestureConfig';
import * as AppsStore from '../../store/AppsStore';

// #455: TodayViewScreen was a fully-implemented screen with zero reachable
// entry points — registered in TabNavigator with a `slide_from_left`
// transition that was clearly meant for a swipe gesture, but nothing in the
// app ever called `navigate('TodayView')`. This file exercises the real fix:
// the actual `todayViewGesture` wired into LauncherHomeScreen (a Gesture.Pan
// built fresh every render, gated by `canSpotlight && currentPage === 0`,
// with `activeOffsetX([-Infinity, 20])` so it only fires for rightward drags)
// — not a reimplementation of the routing/commit logic.
//
// Kept OUT of LauncherHomeScreen.entryPoints.test.tsx (#442, home-screen
// icons) on purpose: the gesture tests need a module-level re-mock of
// react-native-gesture-handler (below), and that re-mock replaces the whole
// Gesture API for every test in its file. Sharing one file would make the
// #442 icon assertions depend on this mock's fidelity for no benefit.

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

// jest.setup.js mocks react-native-gesture-handler with a Gesture API that
// discards every callback passed to it, so a real swipe could never be
// simulated. This file re-mocks the module and records every `Gesture.Pan()`
// call (tagged by which axis it configures) so the test can reach in and
// fire the captured `onEnd` directly — the same technique already
// established in AssistiveTouch.test.tsx. The `mock` prefix on the array is
// required: jest.mock factories may only close over `mock*`-named bindings.
const mockPanRecords: Array<{
  axis?: 'x' | 'y';
  enabled?: unknown;
  onEnd?: (e: { translationX: number; translationY: number }) => void;
}> = [];

jest.mock('react-native-gesture-handler', () => {
  const chain = (record: Record<string, unknown>) => {
    const g: Record<string, unknown> = {};
    [
      'onUpdate', 'onBegin', 'onFinalize', 'minDistance', 'simultaneousWithExternalGesture',
      'withRef', 'onChange', 'onStart', 'onTouchesBegan', 'onTouchesMove', 'onTouchesUp',
      'onTouchesCancelled', 'hitSlop', 'maxPointers', 'minPointers', 'averageTouches',
      'failOffsetX', 'failOffsetY',
    ].forEach((m) => { g[m] = () => g; });
    g.activeOffsetX = () => { record.axis = 'x'; return g; };
    g.activeOffsetY = () => { record.axis = 'y'; return g; };
    g.enabled = (v: unknown) => { record.enabled = v; return g; };
    g.onEnd = (fn: unknown) => { record.onEnd = fn; return g; };
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

function lastHorizontalPan() {
  for (let i = mockPanRecords.length - 1; i >= 0; i--) {
    if (mockPanRecords[i].axis === 'x') return mockPanRecords[i];
  }
  throw new Error('no horizontal (activeOffsetX) pan gesture captured');
}

// AppsStore starts with isLoading: true until the native app list resolves
// (AppsStore.tsx), and the screen renders only a spinner while loading —
// every test here needs the loaded state to see the grid at all.
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
    launchApp: jest.fn(() => Promise.resolve()),
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

beforeEach(() => {
  mockNavigate.mockClear();
  mockPanRecords.length = 0;
  mockLoadedApps();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('LauncherHomeScreen TodayView reachable via right-swipe on the first page (#455)', () => {
  it('navigates to TodayView once the right-swipe reaches the commit distance', () => {
    render(<LauncherHomeScreen />);
    const pan = lastHorizontalPan();
    expect(pan.onEnd).toBeTruthy();
    pan.onEnd!({ translationX: gestureConfig.todayViewCommitDp, translationY: 0 });
    expect(mockNavigate).toHaveBeenCalledWith('TodayView');
  });

  it('does not navigate for a short drag that never reaches the commit distance', () => {
    render(<LauncherHomeScreen />);
    const pan = lastHorizontalPan();
    pan.onEnd!({ translationX: gestureConfig.todayViewCommitDp / 2, translationY: 0 });
    expect(mockNavigate).not.toHaveBeenCalledWith('TodayView');
  });

  it('does not navigate for a drag in the wrong direction (leftward)', () => {
    // The inverse of the fix, and the paging guarantee: a leftward drag on
    // page 0 must stay with the horizontal ScrollView so the home keeps
    // paging to the next app page.
    render(<LauncherHomeScreen />);
    const pan = lastHorizontalPan();
    pan.onEnd!({ translationX: -gestureConfig.todayViewCommitDp, translationY: 0 });
    expect(mockNavigate).not.toHaveBeenCalledWith('TodayView');
  });

  it('does not navigate when there is no movement at all', () => {
    render(<LauncherHomeScreen />);
    const pan = lastHorizontalPan();
    pan.onEnd!({ translationX: 0, translationY: 0 });
    expect(mockNavigate).not.toHaveBeenCalledWith('TodayView');
  });

  it('the gesture starts enabled on the first home page', () => {
    render(<LauncherHomeScreen />);
    const pan = lastHorizontalPan();
    expect(pan.enabled).toBe(true);
  });

  it('a repeated swipe past the threshold navigates each time, always to TodayView', () => {
    // Double-gesture is a recurring defect shape in this repo. The onEnd
    // worklet must stay stateless: no latch that swallows the second swipe,
    // and no drift onto a different route.
    render(<LauncherHomeScreen />);
    const pan = lastHorizontalPan();
    pan.onEnd!({ translationX: gestureConfig.todayViewCommitDp, translationY: 0 });
    pan.onEnd!({ translationX: gestureConfig.todayViewCommitDp * 3, translationY: 0 });
    expect(mockNavigate).toHaveBeenCalledTimes(2);
    expect(mockNavigate).toHaveBeenNthCalledWith(1, 'TodayView');
    expect(mockNavigate).toHaveBeenNthCalledWith(2, 'TodayView');
  });
});
