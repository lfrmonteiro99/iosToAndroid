import React from 'react';
import { Text } from 'react-native';
import * as Haptics from 'expo-haptics';
import { render, act } from '../../test-utils';
import { CupertinoSwipeableRow } from '../CupertinoSwipeableRow';
import { useSettings } from '../../store/SettingsStore';

// issue #493 — §3.2 regra 4: cortar animação (motionIntensity: 'off') não pode
// cortar a háptica do swipe-to-reveal. jest.setup.js's default
// react-native-gesture-handler mock discards every gesture callback (onEnd is
// `() => g`, the callback itself is never stored), so this file re-mocks it
// to capture Gesture.Pan()'s onEnd — the same technique
// AssistiveTouch.test.tsx already uses for Gesture.Tap().
const mockPanRecords: Array<{ onEnd?: (e: { velocityX: number }) => void }> = [];

jest.mock('react-native-gesture-handler', () => {
  const chain = (record: Record<string, unknown>) => {
    const g: Record<string, unknown> = {};
    ['activeOffsetX', 'activeOffsetY', 'minDistance', 'enabled', 'hitSlop',
      'simultaneousWithExternalGesture', 'withRef', 'failOffsetX', 'failOffsetY',
    ].forEach((m) => { g[m] = () => g; });
    g.onStart = (fn: unknown) => { record.onStart = fn; return g; };
    g.onUpdate = (fn: unknown) => { record.onUpdate = fn; return g; };
    g.onEnd = (fn: unknown) => { record.onEnd = fn; return g; };
    g.onFinalize = (fn: unknown) => { record.onFinalize = fn; return g; };
    return g;
  };
  const pan = () => {
    const record: Record<string, unknown> = {};
    mockPanRecords.push(record as never);
    return chain(record);
  };
  return {
    GestureHandlerRootView: 'View',
    GestureDetector: 'View',
    Gesture: {
      Pan: pan,
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

/** Most recently built Pan gesture (this component builds exactly one). */
const lastPan = () => {
  const record = mockPanRecords[mockPanRecords.length - 1];
  if (!record?.onEnd) throw new Error('no Pan onEnd captured');
  return record;
};

function SetMotionIntensity({ value, children }: { value: 'full' | 'reduced' | 'off'; children: React.ReactNode }) {
  const { settings, update } = useSettings();
  React.useEffect(() => {
    if (settings.motionIntensity !== value) update('motionIntensity', value);
  }, [settings.motionIntensity, update, value]);
  if (settings.motionIntensity !== value) return null;
  return <>{children}</>;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPanRecords.length = 0;
});

describe('CupertinoSwipeableRow — swipe-reveal haptic under motionIntensity (#493)', () => {
  it('fires the impact haptic on a fast leading swipe when motionIntensity is "full"', async () => {
    const utils = render(
      <SetMotionIntensity value="full">
        <CupertinoSwipeableRow leadingActions={[{ label: 'Pin', color: 'blue', onPress: jest.fn() }]}>
          <Text>Row</Text>
        </CupertinoSwipeableRow>
      </SetMotionIntensity>,
    );
    await utils.findByText('Row');

    act(() => {
      lastPan().onEnd!({ velocityX: 600 });
    });

    expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Light);
  });

  // §3.2 regra 4: cortar a animação nunca corta a háptica.
  it('still fires the impact haptic when motionIntensity is "off" (no transition, haptic unaffected)', async () => {
    const utils = render(
      <SetMotionIntensity value="off">
        <CupertinoSwipeableRow leadingActions={[{ label: 'Pin', color: 'blue', onPress: jest.fn() }]}>
          <Text>Row</Text>
        </CupertinoSwipeableRow>
      </SetMotionIntensity>,
    );
    await utils.findByText('Row');

    act(() => {
      lastPan().onEnd!({ velocityX: 600 });
    });

    expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Light);
  });

  it('does not fire the haptic when the swipe does not cross any threshold (below velocity and rest position)', async () => {
    const utils = render(
      <SetMotionIntensity value="full">
        <CupertinoSwipeableRow leadingActions={[{ label: 'Pin', color: 'blue', onPress: jest.fn() }]}>
          <Text>Row</Text>
        </CupertinoSwipeableRow>
      </SetMotionIntensity>,
    );
    await utils.findByText('Row');

    act(() => {
      lastPan().onEnd!({ velocityX: 10 });
    });

    expect(Haptics.impactAsync).not.toHaveBeenCalled();
  });
});
