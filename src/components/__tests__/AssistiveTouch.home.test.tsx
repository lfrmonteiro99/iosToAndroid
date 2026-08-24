import React, { useEffect } from 'react';
import { act, render, fireEvent } from '../../test-utils';
import { AssistiveTouch, commitHomeNavigation } from '../AssistiveTouch';
import { AssistiveTouchProvider, useAssistiveTouch } from '../../store/AssistiveTouchStore';
import type { NavigationContainerRefWithCurrent } from '@react-navigation/native';
import type { RootStackParamList } from '../../navigation/types';

// #707: the AssistiveTouch radial menu's "Home" item must navigate back into
// the app's own home (HomeMain) and NOT bail out to the Android system launcher
// via the native goHome() call. This is the SAME defect class as #697 (which
// was fixed in HomeIndicator.doHome) but left here: the old code tried the
// native goHome() FIRST and only fell back to navigate('HomeMain'). On a device
// where this app is NOT the default launcher, goHome() (ACTION_MAIN +
// CATEGORY_HOME) surfaces the system launcher's home screen — exactly the
// "Android home screen instead of the Calendar UI" frame the QA harness
// captured on the Calendar screen (the bug is global; Calendar was just where
// it was reproduced).
//
// The fix lives in the `home` action's decision, extracted into the pure unit
// `commitHomeNavigation`: navigate to HomeMain (the in-app iOS-style grid)
// FIRST; native goHome() is only the last-resort escape hatch when navigation
// fails.
//
// NOTE on testability: the component reaches goHome() through a dynamic
// `import()` of the launcher module, which throws in the jest environment
// ("A dynamic import callback was invoked without --experimental-vm-modules"),
// so that path cannot be exercised through the rendered component. That is
// precisely why #697's twin bug was invisible here. The ordering decision is
// therefore unit-tested on the REAL `commitHomeNavigation` helper (which the
// component delegates to) with an injected goHome, AND the component is driven
// end-to-end to confirm it still lands on the in-app HomeMain.

const mockNavigate = jest.fn();
const mockGoHome = jest.fn(() => Promise.resolve(true));

// Re-mock gesture-handler so the single-tap that opens the menu keeps its
// onEnd handler (jest.setup.js discards every callback).
const mockTapRecords: Array<{ numberOfTaps: number; onEnd: (e: unknown, success: boolean) => void }> = [];

jest.mock('react-native-gesture-handler', () => {
  const chain = (record: Record<string, unknown>) => {
    const g: Record<string, unknown> = {};
    g.numberOfTaps = (n: number) => { record.numberOfTaps = n; return g; };
    g.minDuration = (n: number) => { record.minDuration = n; return g; };
    g.maxDuration = (n: number) => { record.maxDuration = n; return g; };
    ['minDistance', 'maxPointers', 'minPointers', 'enabled', 'hitSlop',
      'simultaneousWithExternalGesture', 'withRef', 'activeOffsetX',
      'activeOffsetY', 'failOffsetX', 'failOffsetY', 'averageTouches',
    ].forEach((m) => { g[m] = () => g; });
    g.onBegin = (fn: unknown) => { record.onBegin = fn; return g; };
    g.onStart = (fn: unknown) => { record.onStart = fn; return g; };
    g.onUpdate = (fn: unknown) => { record.onUpdate = fn; return g; };
    g.onChange = (fn: unknown) => { record.onChange = fn; return g; };
    g.onEnd = (fn: unknown) => { record.onEnd = fn; return g; };
    g.onFinalize = (fn: unknown) => { record.onFinalize = fn; return g; };
    return g;
  };
  const tap = () => {
    const record = { numberOfTaps: 0, maxDuration: 0 };
    mockTapRecords.push(record as never);
    return chain(record);
  };
  return {
    GestureHandlerRootView: 'View',
    GestureDetector: 'View',
    Gesture: {
      Pan: () => chain({}),
      Tap: tap,
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

// ── Harness ─────────────────────────────────────────────────────────────────

function EnableAssistiveTouch() {
  const { update } = useAssistiveTouch();
  useEffect(() => {
    update({ enabled: true });
  }, [update]);
  return null;
}

function makeNavigationRef() {
  return {
    isReady: () => true,
    getCurrentRoute: () => ({ name: 'Calendar', key: 'calendar', params: undefined }),
    addListener: jest.fn(() => () => {}),
    navigate: mockNavigate,
  } as unknown as NavigationContainerRefWithCurrent<RootStackParamList>;
}

function renderAssistiveTouch(navigationRef = makeNavigationRef()) {
  return render(
    <AssistiveTouchProvider>
      <EnableAssistiveTouch />
      <AssistiveTouch navigationRef={navigationRef} />
    </AssistiveTouchProvider>,
  );
}

const lastSingleTap = () => {
  for (let i = mockTapRecords.length - 1; i >= 0; i--) {
    if (mockTapRecords[i].numberOfTaps === 1) return mockTapRecords[i];
  }
  throw new Error('no single-tap gesture captured');
};

/** Simulates a successful tap on the floating button → openMenu(). */
const openMenu = () => {
  act(() => {
    lastSingleTap().onEnd({}, true);
  });
};

const advance = (ms: number) => {
  act(() => {
    jest.advanceTimersByTime(ms);
  });
};

describe('commitHomeNavigation must prefer the in-app HomeMain (#707)', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockGoHome.mockClear();
  });

  it('navigates to HomeMain and does NOT call native goHome when goHome would succeed', async () => {
    await commitHomeNavigation({ navigate: mockNavigate, goHome: mockGoHome });

    expect(mockNavigate).toHaveBeenCalledWith('HomeMain');
    // The native escape hatch must never be tried when in-app navigation works.
    expect(mockGoHome).not.toHaveBeenCalled();
  });

  it('falls back to native goHome only when in-app navigation throws', async () => {
    const throwingNavigate = jest.fn(() => { throw new Error('no navigator'); });

    await commitHomeNavigation({ navigate: throwingNavigate, goHome: mockGoHome });

    expect(mockGoHome).toHaveBeenCalledTimes(1);
    expect(throwingNavigate).toHaveBeenCalledWith('HomeMain');
  });
});

describe('AssistiveTouch Home item stays inside the app (#707)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockTapRecords.length = 0;
    mockNavigate.mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('tapping the Home menu item lands on the in-app HomeMain', async () => {
    const { getByLabelText } = renderAssistiveTouch();
    openMenu();
    advance(150); // let the menu fully-open timer settle

    fireEvent.press(getByLabelText('Home'));

    // Flush the microtasks runAction('home') awaits (no setTimeout in that path).
    await act(async () => { await Promise.resolve(); });

    expect(mockNavigate).toHaveBeenCalledWith('HomeMain');
  });
});
