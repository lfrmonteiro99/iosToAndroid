import React, { useEffect } from 'react';
import { act, render, fireEvent } from '../../test-utils';
import { AssistiveTouch } from '../AssistiveTouch';
import { AssistiveTouchProvider, useAssistiveTouch } from '../../store/AssistiveTouchStore';
import type { NavigationContainerRefWithCurrent } from '@react-navigation/native';
import type { RootStackParamList } from '../../navigation/types';

const BACKDROP_LABEL = 'Close AssistiveTouch menu';

// ── Gesture capture ─────────────────────────────────────────────────────────
// jest.setup.js mocks react-native-gesture-handler with a Gesture API that
// discards every callback, so the tap that opens the AssistiveTouch menu could
// never fire in a test. This file re-mocks the module and KEEPS the tap
// handlers, so tests can drive the floating button's single-tap. The `mock`
// prefix is required: jest.mock factories may only close over `mock*` names,
// and the array is only touched at render time, never at module load.
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
    getCurrentRoute: () => ({ name: 'HomeMain', key: 'home', params: undefined }),
    addListener: jest.fn(() => () => {}),
    navigate: jest.fn(),
  } as unknown as NavigationContainerRefWithCurrent<RootStackParamList>;
}

function renderAssistiveTouch(navigationRef = makeNavigationRef()) {
  return render(
    <AssistiveTouchProvider>
      <EnableAssistiveTouch />
      <AssistiveTouch navigationRef={navigationRef} />
    </AssistiveTouchProvider>
  );
}

/** Most recently built single-tap gesture (the floating button's tap). */
const lastSingleTap = () => {
  for (let i = mockTapRecords.length - 1; i >= 0; i--) {
    if (mockTapRecords[i].numberOfTaps === 1) return mockTapRecords[i];
  }
  throw new Error('no single-tap gesture captured');
};

/** Simulates a successful tap on the floating button → `openMenu()`. */
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

describe('AssistiveTouch menu backdrop', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockTapRecords.length = 0;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('mantém o backdrop desmontado durante a abertura e monta-o aos 150 ms', () => {
    const { queryByLabelText, getByLabelText } = renderAssistiveTouch();
    openMenu();

    // 50 ms — a janela do issue: a animar, sem backdrop para roubar o toque.
    advance(50);
    expect(queryByLabelText(BACKDROP_LABEL)).toBeNull();

    // 149 ms — borda inferior exacta do guard.
    advance(99);
    expect(queryByLabelText(BACKDROP_LABEL)).toBeNull();

    // 150 ms — animação concluída, o backdrop monta.
    advance(1);
    expect(getByLabelText(BACKDROP_LABEL)).toBeTruthy();
  });

  it('tocar num item 50 ms após abrir dispara a ação e não o dismiss', () => {
    const navigationRef = makeNavigationRef();
    const { queryByLabelText, getByLabelText } = renderAssistiveTouch(navigationRef);
    openMenu();
    advance(50);

    // Sem backdrop montado, o toque no item não pode ser consumido por ele.
    expect(queryByLabelText(BACKDROP_LABEL)).toBeNull();

    fireEvent.press(getByLabelText('Notifications'));
    expect(navigationRef.navigate).toHaveBeenCalledWith('NotificationCenter');
  });

  it('tocar no backdrop depois de assente faz dismiss', () => {
    const { queryByLabelText, getByLabelText } = renderAssistiveTouch();
    openMenu();
    advance(150);

    expect(getByLabelText(BACKDROP_LABEL)).toBeTruthy();

    fireEvent.press(getByLabelText(BACKDROP_LABEL));
    expect(queryByLabelText(BACKDROP_LABEL)).toBeNull();
  });

  it('reabrir o menu durante o fecho volta a montar o backdrop', () => {
    const { queryByLabelText, getByLabelText } = renderAssistiveTouch();
    openMenu();
    advance(150);
    expect(getByLabelText(BACKDROP_LABEL)).toBeTruthy();

    // Tocar num item fecha; `menuOpen` continua true durante a animação de saída.
    fireEvent.press(getByLabelText('Notifications'));
    expect(queryByLabelText(BACKDROP_LABEL)).toBeNull();

    // Reabrir antes de o fecho terminar — o `menuOpen` nunca transiciona, por
    // isso o guard baseado no efeito nunca volta a disparar.
    openMenu();
    advance(150);

    // Sem o backdrop, toques fora do menu nunca mais fecham o popover.
    expect(getByLabelText(BACKDROP_LABEL)).toBeTruthy();
  });

  it('o backdrop não volta a montar durante o fecho após toque cedo num item', () => {
    const { queryByLabelText, getByLabelText } = renderAssistiveTouch();
    openMenu();
    advance(50); // antes de o guard da abertura disparar

    fireEvent.press(getByLabelText('Notifications')); // fecha o menu
    expect(queryByLabelText(BACKDROP_LABEL)).toBeNull();

    advance(150); // o timer da abertura original dispararia nesta janela
    expect(queryByLabelText(BACKDROP_LABEL)).toBeNull();
  });
});
