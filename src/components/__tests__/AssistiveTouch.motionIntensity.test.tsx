import React, { useEffect } from 'react';
import * as Haptics from 'expo-haptics';
import { render, act } from '../../test-utils';
import { AssistiveTouch } from '../AssistiveTouch';
import { AssistiveTouchProvider, useAssistiveTouch } from '../../store/AssistiveTouchStore';
import { useSettings } from '../../store/SettingsStore';
import type { NavigationContainerRefWithCurrent } from '@react-navigation/native';
import type { RootStackParamList } from '../../navigation/types';

// issue #493 — §3.2 regra 4: cortar animação (motionIntensity: 'off') não pode
// cortar a háptica do snap de arrasto do botão flutuante. Como
// AssistiveTouch.test.tsx, o mock por omissão de react-native-gesture-handler
// (jest.setup.js) descarta os callbacks dos gestos, por isso este ficheiro
// re-mocka o módulo para capturar o único Gesture.Pan() (o arrasto do botão).
const mockPanRecords: Array<{ onEnd?: (e: { velocityX: number; velocityY: number }) => void }> = [];

jest.mock('react-native-gesture-handler', () => {
  const chain = (record: Record<string, unknown>) => {
    const g: Record<string, unknown> = {};
    ['minDistance', 'maxPointers', 'minPointers', 'enabled', 'hitSlop',
      'simultaneousWithExternalGesture', 'withRef', 'activeOffsetX', 'activeOffsetY',
      'failOffsetX', 'failOffsetY', 'averageTouches', 'numberOfTaps', 'minDuration', 'maxDuration',
    ].forEach((m) => { g[m] = () => g; });
    g.onBegin = (fn: unknown) => { record.onBegin = fn; return g; };
    g.onStart = (fn: unknown) => { record.onStart = fn; return g; };
    g.onUpdate = (fn: unknown) => { record.onUpdate = fn; return g; };
    g.onChange = (fn: unknown) => { record.onChange = fn; return g; };
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

const lastPan = () => {
  const record = mockPanRecords[mockPanRecords.length - 1];
  if (!record?.onEnd) throw new Error('no Pan onEnd captured');
  return record;
};

function EnableAssistiveTouch() {
  const { update } = useAssistiveTouch();
  useEffect(() => { update({ enabled: true }); }, [update]);
  return null;
}

function SetMotionIntensity({ value }: { value: 'full' | 'reduced' | 'off' }) {
  const { update } = useSettings();
  useEffect(() => { update('motionIntensity', value); }, [update, value]);
  return null;
}

function makeNavigationRef() {
  return {
    isReady: () => true,
    getCurrentRoute: () => ({ name: 'HomeMain', key: 'home', params: undefined }),
    addListener: jest.fn(() => () => {}),
    navigate: jest.fn(),
  } as unknown as NavigationContainerRefWithCurrent<RootStackParamList>;
}

function renderAssistiveTouch(motionIntensity: 'full' | 'reduced' | 'off') {
  return render(
    <AssistiveTouchProvider>
      <EnableAssistiveTouch />
      <SetMotionIntensity value={motionIntensity} />
      <AssistiveTouch navigationRef={makeNavigationRef()} />
    </AssistiveTouchProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPanRecords.length = 0;
});

describe('AssistiveTouch — drag-snap haptic under motionIntensity (#493)', () => {
  it('fires the selection haptic on drag-end when motionIntensity is "full"', () => {
    renderAssistiveTouch('full');

    act(() => {
      lastPan().onEnd!({ velocityX: 0, velocityY: 0 });
    });

    expect(Haptics.selectionAsync).toHaveBeenCalled();
  });

  // §3.2 regra 4: cortar animação nunca corta háptica — AssistiveTouch.tsx é
  // um dos 3 pontos citados no issue como já-conforme; este teste protege
  // essa garantia contra regressão ao introduzir o novo estado 'off'.
  it('still fires the selection haptic on drag-end when motionIntensity is "off"', () => {
    renderAssistiveTouch('off');

    act(() => {
      lastPan().onEnd!({ velocityX: 0, velocityY: 0 });
    });

    expect(Haptics.selectionAsync).toHaveBeenCalled();
  });
});
