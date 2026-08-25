import React from 'react';
import { act } from '@testing-library/react-native';

// #697: the global swipe-up home gesture (the floating iOS-style home
// indicator, rendered once in App.tsx above every screen) must navigate back
// into the app's own home (HomeMain) and NOT bail out to the Android system
// launcher via the native goHome() call. On a device where this app is NOT the
// default launcher, goHome() fires ACTION_MAIN + CATEGORY_HOME, which surfaces
// the system launcher's home screen — exactly the "Android home screen instead
// of the BT settings" frame the QA harness captured on the Bluetooth screen.
//
// The fix lives in HomeIndicator.doHome: when a navigationRef is present we
// navigate to HomeMain (the in-app iOS-style grid) first; native goHome() is
// only the last-resort escape hatch.
//
// This file exercises the REAL gesture: it re-mocks react-native-gesture-handler
// so the Gesture.Pan() created by HomeIndicator records its onEnd handler, then
// fires a swipe-up that crosses the home-commit threshold and asserts which
// navigation path was taken. It is NOT a reimplementation of doHome's logic.

const mockNavigate = jest.fn();
const mockGoHome = jest.fn(() => Promise.resolve(true));

// Capture the Pan gesture's onEnd so we can drive a real swipe-up.
const panRecords: Array<{
  onEnd?: (e: { translationY: number; velocityY: number }) => void;
  onBegin?: () => void;
  onUpdate?: (e: { translationY: number }) => void;
}> = [];

jest.mock('react-native-gesture-handler', () => ({
  GestureHandlerRootView: 'View',
  GestureDetector: 'View',
  Gesture: {
    Pan: () => {
      const rec: { onEnd?: (e: { translationY: number; velocityY: number }) => void; onUpdate?: () => void; onBegin?: () => void } = {};
      panRecords.push(rec);
      const g: Record<string, unknown> = {};
      const chain = (name: string) => (fn: unknown) => { (rec as Record<string, unknown>)[name] = fn; return g; };
      g.onBegin = chain('onBegin');
      g.onUpdate = chain('onUpdate');
      g.onEnd = chain('onEnd');
      g.onFinalize = () => g;
      g.minDistance = () => g;
      g.enabled = () => g;
      g.activeOffsetX = () => g;
      g.activeOffsetY = () => g;
      g.failOffsetX = () => g;
      g.failOffsetY = () => g;
      g.simultaneousWithExternalGesture = () => g;
      g.withRef = () => g;
      g.onChange = () => g;
      g.onStart = () => g;
      g.onTouchesBegan = () => g;
      g.onTouchesMove = () => g;
      g.onTouchesUp = () => g;
      g.onTouchesCancelled = () => g;
      g.hitSlop = () => g;
      g.maxPointers = () => g;
      g.minPointers = () => g;
      g.averageTouches = () => g;
      return g;
    },
    Tap: () => {
      const g: Record<string, unknown> = {};
      g.onEnd = () => g;
      g.onBegin = () => g;
      g.numberOfTaps = () => g;
      g.enabled = () => g;
      g.simultaneousWithExternalGesture = () => g;
      g.withRef = () => g;
      g.onChange = () => g;
      g.onStart = () => g;
      g.maxDuration = () => g;
      return g;
    },
    LongPress: () => ({ onStart: () => ({}), onEnd: () => ({}), onBegin: () => ({}), minDuration: () => ({}), enabled: () => ({}), simultaneousWithExternalGesture: () => ({}), withRef: () => ({}) }),
    Fling: () => ({ onStart: () => ({}), onEnd: () => ({}), onBegin: () => ({}), direction: () => ({}), enabled: () => ({}), simultaneousWithExternalGesture: () => ({}), withRef: () => ({}) }),
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
}));

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

// Replace the launcher module mock so we can assert on goHome().
jest.mock('../../modules/launcher-module/src', () => ({
  __esModule: true,
  addHomePressedListener: jest.fn(() => jest.fn()),
  default: {
    goHome: (...args: unknown[]) => (mockGoHome as unknown as (...a: unknown[]) => unknown)(...args),
  },
}));

import { HomeIndicator } from '../HomeIndicator';
import { gestureConfig } from '../../utils/gestureConfig';
import { render } from '../../test-utils';

function lastPan() {
  const rec = panRecords[panRecords.length - 1];
  if (!rec || typeof rec.onEnd !== 'function') {
    throw new Error('HomeIndicator Pan gesture onEnd was not captured');
  }
  return rec;
}

// Drive a swipe-up that crosses the home-commit distance threshold
// (homeCommitProgress * homeTravelDp). progress >= homeCommitProgress => commitForHome returns 'distance'.
function swipeUp() {
  const pan = lastPan();
  act(() => {
    pan.onBegin!();
    // translationY negative = upward; exceed homeTravelDp * homeCommitProgress.
    const dy = -(gestureConfig.homeTravelDp * (gestureConfig.homeCommitProgress + 0.1));
    pan.onUpdate!({ translationY: dy } as never);
    pan.onEnd!({ translationY: dy, velocityY: -1.2 } as never);
  });
}

beforeEach(() => {
  mockNavigate.mockClear();
  mockGoHome.mockClear();
  panRecords.length = 0;
});

describe('HomeIndicator swipe-up must stay inside the app (#697)', () => {
  it('navigates to the in-app HomeMain on swipe-up, not the system launcher', () => {
    const navigationRef = { current: { navigate: mockNavigate } } as never;
    render(<HomeIndicator navigationRef={navigationRef} />);

    swipeUp();

    // The in-app home must be shown.
    expect(mockNavigate).toHaveBeenCalledWith('HomeMain');
    // And we must NOT have escaped to the Android system launcher.
    expect(mockGoHome).not.toHaveBeenCalled();
  });

  it('still reaches HomeMain even when the native goHome would succeed', () => {
    // If goHome resolves true, the buggy path returned early and showed the
    // system launcher. The fix must navigate in-app regardless.
    mockGoHome.mockResolvedValue(true);
    const navigationRef = { current: { navigate: mockNavigate } } as never;
    render(<HomeIndicator navigationRef={navigationRef} />);

    swipeUp();

    expect(mockNavigate).toHaveBeenCalledWith('HomeMain');
    expect(mockGoHome).not.toHaveBeenCalled();
  });

  it('does not navigate on an insufficient (sub-threshold) swipe', () => {
    const navigationRef = { current: { navigate: mockNavigate } } as never;
    render(<HomeIndicator navigationRef={navigationRef} />);

    const pan = lastPan();
    act(() => {
      pan.onBegin!();
      const dy = -(gestureConfig.homeTravelDp * 0.1); // well below homeCommitProgress
      pan.onUpdate!({ translationY: dy } as never);
      pan.onEnd!({ translationY: dy, velocityY: 0 } as never);
    });

    expect(mockNavigate).not.toHaveBeenCalled();
    expect(mockGoHome).not.toHaveBeenCalled();
  });
});
