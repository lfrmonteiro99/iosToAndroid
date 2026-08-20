import React from 'react';
import { render, fireEvent, within } from '../../test-utils';
import { Ionicons } from '@expo/vector-icons';
import { gestureConfig } from '../../utils/gestureConfig';
import * as AppsStore from '../../store/AppsStore';

// #442: Notes, Reminders, Mail and TodayView were fully implemented screens
// with zero reachable entry points — Notes/Reminders/Mail had no home-screen
// icon (only reachable through Spotlight search results that require
// pre-existing data, per the issue's escalation comment), and TodayView had
// no entry point at all despite being registered with a `slide_from_left`
// transition that was clearly meant for a swipe gesture. These tests exercise
// the real fix: the actual `BUILT_IN_APPS`/`VIRTUAL_ICON_CONFIG` entries and
// the real `todayViewGesture` wired into LauncherHomeScreen — not a
// reimplementation of the routing/commit logic.

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
// (AppsStore.tsx:89), and the screen renders only a spinner while loading —
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

describe('LauncherHomeScreen built-in icons for Notes, Reminders, Mail (#442)', () => {
  it('renders a home-screen icon for Notes, Reminders and Mail', () => {
    const { getByLabelText } = render(<LauncherHomeScreen />);
    expect(getByLabelText('Open Notes')).toBeTruthy();
    expect(getByLabelText('Open Reminders')).toBeTruthy();
    expect(getByLabelText('Open Mail')).toBeTruthy();
  });

  it('uses a themed icon for each, not the generic fallback glyph ("apps")', () => {
    const { getByLabelText } = render(<LauncherHomeScreen />);
    for (const label of ['Open Notes', 'Open Reminders', 'Open Mail']) {
      const icon = within(getByLabelText(label)).UNSAFE_getByType(Ionicons);
      expect(icon.props.name).not.toBe('apps');
    }
  });

  it('pressing the Notes icon navigates to the internal Notes screen', () => {
    const { getByLabelText } = render(<LauncherHomeScreen />);
    fireEvent.press(getByLabelText('Open Notes'));
    expect(mockNavigate).toHaveBeenCalledWith('Notes');
  });

  it('pressing the Reminders icon navigates to the internal Reminders screen', () => {
    const { getByLabelText } = render(<LauncherHomeScreen />);
    fireEvent.press(getByLabelText('Open Reminders'));
    expect(mockNavigate).toHaveBeenCalledWith('Reminders');
  });

  it('pressing the Mail icon navigates to the internal Mail screen', () => {
    const { getByLabelText } = render(<LauncherHomeScreen />);
    fireEvent.press(getByLabelText('Open Mail'));
    expect(mockNavigate).toHaveBeenCalledWith('Mail');
  });

  it('reaching Notes does not depend on any note already existing (clean-install case from the escalation comment)', () => {
    // No notes/reminders/contacts data is mocked anywhere in this render —
    // this is the clean-install scenario the escalation comment described as
    // a deadlock (no note exists → Spotlight has nothing to match → no way
    // to open Notes to create the first one). The icon must still be there.
    const { getByLabelText } = render(<LauncherHomeScreen />);
    fireEvent.press(getByLabelText('Open Notes'));
    expect(mockNavigate).toHaveBeenCalledWith('Notes');
  });
});

describe('LauncherHomeScreen TodayView reachable via right-swipe on the first page (#442)', () => {
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
});
