/**
 * #517 — o cold start só fecha quando a GRELHA está pintada.
 *
 * O ponto crítico do issue: com `isLoading: true` o ecrã mostra o spinner
 * (`LauncherHomeScreen.tsx`, ramo `isLoading`), e um instrumento que fechasse
 * a medição aí daria um número bonito e falso. Estes testes montam o ecrã real
 * e disparam o `onLayout` real da grelha.
 */
import React from 'react';
import { render, fireEvent } from '../../test-utils';
import * as AppsStore from '../../store/AppsStore';
import { LauncherHomeScreen } from '../LauncherHomeScreen';
import {
  getPerfMetrics,
  markProcessStart,
  markWarmStartBegin,
  resetPerfMetrics,
} from '../../utils/perfMetrics';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: jest.fn(),
    goBack: jest.fn(),
    canGoBack: jest.fn(() => false),
    getParent: () => ({ navigate: jest.fn() }),
  }),
  useRoute: () => ({ params: {} }),
  NavigationContainer: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

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

/** O layout real da primeira grelha, tal como o RN o entregaria. */
function layoutFirstGrid(screen: ReturnType<typeof render>) {
  fireEvent(screen.getByTestId('launcher-page-grid-0'), 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 500 } },
  });
}

beforeEach(() => {
  resetPerfMetrics();
  mockApps();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('LauncherHomeScreen: cold start fecha na grelha visível (#517)', () => {
  it('não fecha o cold start enquanto o ecrã mostra apenas o spinner', () => {
    mockApps({ isLoading: true });
    markProcessStart(performance.now() - 100);
    render(<LauncherHomeScreen />);
    expect(getPerfMetrics().coldStartMs).toBeNull();
  });

  it('fecha o cold start no layout da grelha', () => {
    markProcessStart(performance.now() - 100);
    const screen = render(<LauncherHomeScreen />);
    layoutFirstGrid(screen);
    const { coldStartMs } = getPerfMetrics();
    expect(coldStartMs).not.toBeNull();
    expect(coldStartMs as number).toBeGreaterThanOrEqual(100);
  });

  it('fecha o warm start no layout da grelha depois de voltar a primeiro plano', () => {
    markProcessStart(performance.now() - 100);
    const screen = render(<LauncherHomeScreen />);
    layoutFirstGrid(screen);
    expect(getPerfMetrics().warmStartCount).toBe(0);

    markWarmStartBegin();
    layoutFirstGrid(screen);
    expect(getPerfMetrics().warmStartCount).toBe(1);
    expect(getPerfMetrics().warmStartMs).not.toBeNull();
  });

  it('o inverso do fix: sem foreground, um layout extra não inventa um warm start', () => {
    markProcessStart(performance.now() - 100);
    const screen = render(<LauncherHomeScreen />);
    layoutFirstGrid(screen);
    layoutFirstGrid(screen);
    layoutFirstGrid(screen);
    expect(getPerfMetrics().warmStartCount).toBe(0);
  });

  it('a grelha tem um handler de layout que fecha a medição, sem depender do testID', () => {
    // Localiza a grelha pelo caminho estrutural (o pai do primeiro ícone da
    // primeira página), para provar que a instrumentação está no nó da grelha
    // e não apenas num testID acrescentado para os testes.
    markProcessStart(performance.now() - 100);
    const screen = render(<LauncherHomeScreen />);
    const icon = screen.getByLabelText('Open Notes');
    let node: typeof icon | null = icon;
    let handler: ((e: unknown) => void) | null = null;
    while (node) {
      const onLayout = node.props?.onLayout;
      if (typeof onLayout === 'function') {
        handler = onLayout;
        break;
      }
      node = node.parent;
    }
    expect(handler).toBeInstanceOf(Function);
    (handler as (e: unknown) => void)({
      nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 500 } },
    });
    expect(getPerfMetrics().coldStartMs).not.toBeNull();
  });

  it('desmontar depois do layout não altera os números já medidos', () => {
    markProcessStart(performance.now() - 100);
    const screen = render(<LauncherHomeScreen />);
    layoutFirstGrid(screen);
    const before = getPerfMetrics();
    screen.unmount();
    expect(getPerfMetrics()).toEqual(before);
  });
});
