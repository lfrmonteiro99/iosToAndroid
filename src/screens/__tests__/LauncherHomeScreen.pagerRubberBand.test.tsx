import React from 'react';
import { Dimensions } from 'react-native';
import { render, fireEvent } from '../../test-utils';
import * as AppsStore from '../../store/AppsStore';
import * as Reanimated from 'react-native-reanimated';
import { rubberBand, RUBBER_C } from '../../theme/motion';

// #489: rubber-band overscroll nas bordas do pager do ecrã inicial.
//
// Este ficheiro exercita os gestos REAIS ligados ao LauncherHomeScreen (os
// `Gesture.Pan` construídos em cada render e passados ao `Gesture.Race`), não
// uma reimplementação da fórmula: captura os gestos pelo re-mock local de
// react-native-gesture-handler (mesma técnica de
// LauncherHomeScreen.todayViewGesture.test.tsx e AssistiveTouch.test.tsx) e
// dispara `onUpdate`/`onFinalize` directamente, observando os SharedValues
// criados pelo ecrã.

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
  axis?: 'x' | 'y';
  offsets?: number[];
  enabled?: unknown;
  onUpdate?: (e: { translationX: number; translationY: number }) => void;
  onEnd?: (e: { translationX: number; translationY: number }) => void;
  onFinalize?: () => void;
};

const mockPanRecords: PanRecord[] = [];

jest.mock('react-native-gesture-handler', () => {
  const chain = (record: Record<string, unknown>) => {
    const g: Record<string, unknown> = {};
    [
      'onBegin', 'minDistance', 'simultaneousWithExternalGesture', 'withRef', 'onChange',
      'onStart', 'onTouchesBegan', 'onTouchesMove', 'onTouchesUp', 'onTouchesCancelled',
      'hitSlop', 'maxPointers', 'minPointers', 'averageTouches', 'failOffsetX', 'failOffsetY',
    ].forEach((m) => { g[m] = () => g; });
    g.activeOffsetX = (v: number[]) => { record.axis = 'x'; record.offsets = v; return g; };
    g.activeOffsetY = (v: number[]) => { record.axis = 'y'; record.offsets = v; return g; };
    g.enabled = (v: unknown) => { record.enabled = v; return g; };
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
const { LauncherHomeScreen, computePagerRubberBandOffset } = require('../LauncherHomeScreen');

const SCREEN_WIDTH = Dimensions.get('window').width;

// Todos os SharedValues criados durante o render, para poder observar o valor
// escrito pelos worklets dos gestos.
let sharedValues: Array<{ value: unknown }> = [];

function sharedNumbers() {
  return sharedValues.map((s) => s.value).filter((v) => typeof v === 'number') as number[];
}

/** O gesto horizontal que só activa para arrastos para a ESQUERDA (última página). */
function lastPagePan(): PanRecord {
  for (let i = mockPanRecords.length - 1; i >= 0; i--) {
    const r = mockPanRecords[i];
    if (r.axis === 'x' && r.offsets && r.offsets[1] === Infinity) return r;
  }
  throw new Error('no leftward (activeOffsetX [-20, Infinity]) pan gesture captured');
}

/** O gesto horizontal da primeira página (Today View, arrasto para a direita). */
function firstPagePan(): PanRecord {
  for (let i = mockPanRecords.length - 1; i >= 0; i--) {
    const r = mockPanRecords[i];
    if (r.axis === 'x' && r.offsets && r.offsets[0] === -Infinity) return r;
  }
  throw new Error('no rightward (activeOffsetX [-Infinity, 20]) pan gesture captured');
}

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
  sharedValues = [];
  mockLoadedApps();
  const real = Reanimated.useSharedValue;
  jest.spyOn(Reanimated, 'useSharedValue').mockImplementation(((init: unknown) => {
    const sv = (real as (i: unknown) => { value: unknown })(init);
    sharedValues.push(sv);
    return sv;
  }) as typeof Reanimated.useSharedValue);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('computePagerRubberBandOffset (#489, §3.3)', () => {
  it('é sub-linear e coincide com a fórmula pura de motion.ts', () => {
    for (const d of [40, 120, 400]) {
      expect(computePagerRubberBandOffset(d, SCREEN_WIDTH)).toBeCloseTo(rubberBand(d, SCREEN_WIDTH), 5);
      expect(computePagerRubberBandOffset(d, SCREEN_WIDTH)).toBeLessThan(d);
    }
    expect(computePagerRubberBandOffset(-40, SCREEN_WIDTH)).toBeCloseTo(-rubberBand(40, SCREEN_WIDTH), 5);
  });

  it('satura abaixo do limite assimptótico dimension / RUBBER_C', () => {
    const limit = SCREEN_WIDTH / RUBBER_C;
    expect(computePagerRubberBandOffset(1e6, SCREEN_WIDTH)).toBeLessThan(limit);
    expect(computePagerRubberBandOffset(-1e6, SCREEN_WIDTH)).toBeGreaterThan(-limit);
  });

  it('devolve 0 para 0 e para dimensão inválida', () => {
    expect(computePagerRubberBandOffset(0, SCREEN_WIDTH)).toBe(0);
    expect(computePagerRubberBandOffset(100, 0)).toBe(0);
  });
});

describe('LauncherHomeScreen — rubber band nas bordas do pager (#489)', () => {
  it('a borda da última página existe como gesto para a esquerda e desloca o conteúdo pela curva', () => {
    render(<LauncherHomeScreen />);
    const pan = lastPagePan();
    expect(pan.onUpdate).toBeTruthy();

    const drag = -150;
    pan.onUpdate!({ translationX: drag, translationY: 0 });
    const expected = computePagerRubberBandOffset(drag, SCREEN_WIDTH);
    expect(sharedNumbers()).toContain(expected);
    // Não é o arrasto cru: tem de haver resistência.
    expect(Math.abs(expected)).toBeLessThan(Math.abs(drag));
  });

  it('volta a 0 ao soltar (onFinalize)', () => {
    render(<LauncherHomeScreen />);
    const pan = lastPagePan();
    pan.onUpdate!({ translationX: -150, translationY: 0 });
    expect(sharedNumbers()).toContain(computePagerRubberBandOffset(-150, SCREEN_WIDTH));
    pan.onFinalize!();
    expect(sharedNumbers()).not.toContain(computePagerRubberBandOffset(-150, SCREEN_WIDTH));
  });

  it('a borda da última página está desactivada numa página que não é a última', () => {
    render(<LauncherHomeScreen />);
    // Sem apps: 1 página de grelha + App Library ⇒ currentPage 0 não é a última.
    expect(lastPagePan().enabled).toBe(false);
  });

  it('fica activa quando o pager chega à última página', () => {
    const { UNSAFE_getAllByType } = render(<LauncherHomeScreen />);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { ScrollView } = require('react-native');
    const pager = UNSAFE_getAllByType(ScrollView).find(
      (n: { props: { pagingEnabled?: boolean } }) => n.props.pagingEnabled,
    );
    expect(pager).toBeTruthy();
    fireEvent(pager, 'momentumScrollEnd', {
      nativeEvent: {
        contentOffset: { x: SCREEN_WIDTH },
        contentSize: { width: SCREEN_WIDTH * 2 },
        layoutMeasurement: { width: SCREEN_WIDTH },
      },
    });
    expect(lastPagePan().enabled).toBe(true);
  });

  it('a primeira página passa a dar feedback elástico durante o arrasto, sem navegar antes do commit', () => {
    render(<LauncherHomeScreen />);
    const pan = firstPagePan();
    expect(pan.onUpdate).toBeTruthy();
    const drag = 30; // abaixo de todayViewCommitDp (64)
    pan.onUpdate!({ translationX: drag, translationY: 0 });
    expect(sharedNumbers()).toContain(computePagerRubberBandOffset(drag, SCREEN_WIDTH));
    expect(mockNavigate).not.toHaveBeenCalledWith('TodayView');
  });

  it('o arrasto repetido na mesma borda não fica preso (sem latch)', () => {
    render(<LauncherHomeScreen />);
    const pan = lastPagePan();
    pan.onUpdate!({ translationX: -80, translationY: 0 });
    pan.onFinalize!();
    pan.onUpdate!({ translationX: -200, translationY: 0 });
    expect(sharedNumbers()).toContain(computePagerRubberBandOffset(-200, SCREEN_WIDTH));
  });

  it('o inverso do fix: sem arrasto o deslocamento é 0', () => {
    render(<LauncherHomeScreen />);
    const pan = lastPagePan();
    pan.onUpdate!({ translationX: 0, translationY: 0 });
    expect(sharedNumbers()).not.toContain(computePagerRubberBandOffset(-150, SCREEN_WIDTH));
  });
});
