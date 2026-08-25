import React from 'react';
import { render } from '../../test-utils';
import { gestureConfig } from '../../utils/gestureConfig';
import * as AppsStore from '../../store/AppsStore';

// #687: a down-swipe that starts in the top strip (the zone the Control Center
// / Notification Center overlays own) must NOT trigger the Spotlight reveal
// frame. Without the guard, RNGH runs the home-body pan gesture and the nested
// CC/NC overlay gesture simultaneously, so a down-swipe there opened BOTH the
// iOS Spotlight frame and the Android-style Notification Center panel at once —
// the user saw the notification panel instead of the iOS search UI.
//
// This file exercises the REAL fix: the `panGesture` (the home-body down-swipe
// that ends in `navigateTo('SpotlightSearch')`) now records where the gesture
// began (`onBegin` → absoluteY) and refuses to reveal/commit Spotlight when it
// starts at/above the top strip. It is NOT a reimplementation of the routing
// logic — it captures the actual Gesture.Pan and fires its onBegin/onEnd.
//
// The technique (re-mocking react-native-gesture-handler to record every
// Gesture.Pan + its axis/onBegin/onEnd) is the same one used by
// LauncherHomeScreen.todayViewGesture.test.tsx, which owns TodayView. Kept
// separate so the #442/#455 mocks don't cross-contaminate.

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

// Record every Gesture.Pan() call so the test can reach in and fire the
// captured onBegin/onEnd directly.
const mockPanRecords: Array<{
  axis?: 'x' | 'y';
  activeOffsetArgs?: number[];
  activeOffsetYArgs?: number[];
  enabled?: unknown;
  onBegin?: (e: { absoluteY: number; absoluteX: number }) => void;
  onUpdate?: (e: { translationX: number; translationY: number; absoluteY: number }) => void;
  onEnd?: (e: { translationX: number; translationY: number; velocityY: number; absoluteY: number }) => void;
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
    g.activeOffsetX = (...args: unknown[]) => { record.axis = 'x'; record.activeOffsetArgs = args as number[]; return g; };
    g.activeOffsetY = (...args: unknown[]) => { record.axis = 'y'; record.activeOffsetYArgs = args as number[]; return g; };
    g.enabled = (v: unknown) => { record.enabled = v; return g; };
    g.onBegin = (fn: unknown) => { record.onBegin = fn; return g; };
    g.onUpdate = (fn: unknown) => { record.onUpdate = fn; return g; };
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

function lastVerticalPan() {
  // The down-swipe → Spotlight gesture is the home-body pan configured with
  // activeOffsetY([-20, 20]) — a stable signal that works WITH or WITHOUT the
  // onBegin guard added by the fix. Other vertical pans (home indicator,
  // notification banner) use [-10, 10] and are unrelated to Spotlight.
  for (let i = mockPanRecords.length - 1; i >= 0; i--) {
    const args = mockPanRecords[i].activeOffsetYArgs;
    if (Array.isArray(args) && Array.isArray(args[0]) && args[0][0] === -20 && args[0][1] === 20) {
      return mockPanRecords[i];
    }
  }
  throw new Error('home-body Spotlight pan gesture (activeOffsetY [-20,20]) not captured');
}

// The top strip height the fix uses (mirror of gestureConfig.topZoneHeightDp + 20).
const TOP_STRIP = gestureConfig.topZoneHeightDp + 20;

// AppsStore starts with isLoading: true until the native app list resolves, and
// the screen renders only a spinner while loading — every test here needs the
// loaded state to see the grid at all.
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
  mockPanRecords.length = 0;
  mockLoadedApps();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('LauncherHomeScreen — Spotlight down-swipe must not fire from the top strip (#687)', () => {
  // Simulate a real pan: begin (records start Y), a series of updates (drives
  // spotlightProgress + the velocity buffer), then end (commit check). The
  // production onEnd reads velocity from the sampled buffer, so onUpdate must
  // run first or the commit sees zero velocity and never fires.
  function runDownSwipe(startY: number, endY: number, distance: number) {
    const pan = lastVerticalPan();
    pan.onBegin!({ absoluteY: startY, absoluteX: 50 });
    // Drive a few updates so spotlightProgress and the velocity buffer populate.
    pan.onUpdate!({ translationX: 0, translationY: distance * 0.5, absoluteY: startY + distance * 0.5 } as never);
    pan.onUpdate!({ translationX: 0, translationY: distance, absoluteY: startY + distance } as never);
    pan.onEnd!({
      translationX: 0,
      translationY: distance,
      velocityY: 1.5,
      absoluteY: startY + distance,
    });
  }

  it('a down-swipe starting inside the top strip does NOT navigate to Spotlight', () => {
    render(<LauncherHomeScreen />);
    runDownSwipe(TOP_STRIP / 2, 0, gestureConfig.spotlightCommitDp + 40);
    expect(mockNavigate).not.toHaveBeenCalledWith('SpotlightSearch');
  });

  it('a down-swipe starting well below the top strip still opens Spotlight', () => {
    // The inverse of the fix: the guard must not accidentally swallow a
    // legitimate Spotlight swipe that begins in the body of the home screen.
    render(<LauncherHomeScreen />);
    runDownSwipe(TOP_STRIP + 200, 0, gestureConfig.spotlightCommitDp + 40);
    expect(mockNavigate).toHaveBeenCalledWith('SpotlightSearch');
  });

  it('the gesture starting exactly on the strip boundary does NOT open Spotlight', () => {
    // Boundary case: starting AT the strip height must still be suppressed.
    render(<LauncherHomeScreen />);
    runDownSwipe(TOP_STRIP, 0, gestureConfig.spotlightCommitDp + 40);
    expect(mockNavigate).not.toHaveBeenCalledWith('SpotlightSearch');
  });

  it('two down-swipes from the top strip never open Spotlight (double gesture)', () => {
    // Double-gesture is a recurring defect shape in this repo.
    render(<LauncherHomeScreen />);
    runDownSwipe(10, 0, gestureConfig.spotlightCommitDp + 40);
    runDownSwipe(10, 0, gestureConfig.spotlightCommitDp + 40);
    expect(mockNavigate).not.toHaveBeenCalledWith('SpotlightSearch');
  });
});
