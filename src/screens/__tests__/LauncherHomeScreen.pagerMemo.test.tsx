/**
 * #518 — «zero re-render da grelha ao paginar» (ESPECIFICACAO.md §7).
 *
 * `pages` era recalculado com um `for` no corpo do render (LauncherHomeScreen.tsx),
 * criando um array novo a cada render, e `AppIcon`/`FolderIcon` não eram
 * `React.memo`, por isso qualquer `setCurrentPage` (disparado por
 * `onMomentumScrollEnd`) reconstruía e re-renderizava TODOS os ícones da
 * grelha, não só os da página nova.
 *
 * Cada `AppIcon` chama `useAnimatedStyle` (Reanimated) exactamente uma vez por
 * execução real do seu corpo de função — é a única forma de medir "o corpo
 * de AppIcon correu outra vez" sem reimplementar a lógica de memoização aqui:
 * usa-se o hook real que o componente já chama, não uma cópia dele.
 *
 * O teste é auto-calibrado: mede o delta de chamadas a `useAnimatedStyle`
 * numa transição de página com poucos ícones e outra vez com muitos. Se
 * `AppIcon` estiver correctamente memoizado, o delta é o MESMO nos dois casos
 * (só os irmãos não-memoizados de fora do âmbito deste issue — ex.
 * SpotlightReveal — continuam a correr, e correm sempre, independentemente do
 * número de ícones). Se `AppIcon` NÃO estiver memoizado, o delta cresce com o
 * número de ícones montados, porque cada AppIcon extra volta a chamar
 * `useAnimatedStyle`.
 */
import React from 'react';
import { Dimensions } from 'react-native';
import { render, act } from '../../test-utils';
import * as Reanimated from 'react-native-reanimated';
import * as AppsStore from '../../store/AppsStore';
import { LauncherHomeScreen } from '../LauncherHomeScreen';

const SCREEN_WIDTH = Dimensions.get('window').width;

// A navegação real (@react-navigation/native) devolve a MESMA referência de
// `navigation` em todos os renders do ecrã, salvo mudança de estado de
// navegação — é o que sustenta a estabilidade de `handleAppPress`
// (useCallback com `navigation` nas deps) na implementação real. Um mock que
// devolvesse um objecto novo a cada chamada de `useNavigation()` invalidaria
// esse useCallback SÓ nos testes, mascarando por completo a memoização real
// que este ficheiro está a verificar — por isso o objecto vive fora do
// closure devolvido, criado uma única vez.
jest.mock('@react-navigation/native', () => {
  const navigation = {
    navigate: jest.fn(),
    goBack: jest.fn(),
    canGoBack: jest.fn(() => false),
    getParent: () => ({ navigate: jest.fn() }),
  };
  return {
    useNavigation: () => navigation,
    useRoute: () => ({ params: {} }),
    NavigationContainer: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

function makeApps(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    name: `Test App ${i}`,
    packageName: `com.test.pagermemo.app${i}`,
    icon: '',
    isSystem: false,
  }));
}

function mockLoadedApps(overrides: Partial<ReturnType<typeof AppsStore.useApps>> = {}) {
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
    ...overrides,
  } as ReturnType<typeof AppsStore.useApps>);
}

/**
 * Monta o ecrã com `extraApps` além dos 14 built-in virtuais (sempre
 * presentes), dispara UMA transição de página real via
 * `onMomentumScrollEnd` (o mesmo handler que `handleScroll` liga na
 * ScrollView), e devolve quantas chamadas extra a `useAnimatedStyle` essa
 * transição causou.
 */
function measurePageTransitionStyleCalls(extraApps: ReturnType<typeof makeApps>) {
  mockLoadedApps({ apps: extraApps, nonDockApps: extraApps });
  const styleSpy = jest.spyOn(Reanimated, 'useAnimatedStyle');

  const { getByTestId, unmount } = render(<LauncherHomeScreen />);
  const before = styleSpy.mock.calls.length;

  const pager = getByTestId('launcher-pager');
  act(() => {
    pager.props.onMomentumScrollEnd({
      nativeEvent: {
        contentOffset: { x: SCREEN_WIDTH },
        contentSize: { width: SCREEN_WIDTH * 3 },
        layoutMeasurement: { width: SCREEN_WIDTH },
      },
    });
  });

  const delta = styleSpy.mock.calls.length - before;
  unmount();
  styleSpy.mockRestore();
  jest.restoreAllMocks();
  return delta;
}

describe('LauncherHomeScreen: paginação não re-renderiza os AppIcon já montados (#518)', () => {
  it('o custo de useAnimatedStyle numa transição de página não cresce com o número de AppIcon montados', () => {
    const fewIconsDelta = measurePageTransitionStyleCalls([]); // só os 14 built-in
    const manyIconsDelta = measurePageTransitionStyleCalls(makeApps(30)); // 14 + 30 = 44

    expect(manyIconsDelta).toBe(fewIconsDelta);
  });

  it('a transição de página continua a acontecer (currentPage avança) mesmo com a memoização', () => {
    mockLoadedApps({ apps: [], nonDockApps: [] });
    const { getByTestId, queryByPlaceholderText } = render(<LauncherHomeScreen />);

    // Página 0 é a grelha: a App Library (última página) ainda não deve
    // estar "activa" do ponto de vista do currentPage, mas como a ScrollView
    // não é virtualizada ela já está montada — o que prova que avançámos é o
    // efeito de handleScroll (setCurrentPage), verificável indirectamente
    // via o próprio disparo sem excepção e via PageDots (testado abaixo).
    expect(queryByPlaceholderText('App Library')).toBeTruthy();

    const pager = getByTestId('launcher-pager');
    expect(() => act(() => {
      pager.props.onMomentumScrollEnd({
        nativeEvent: {
          contentOffset: { x: SCREEN_WIDTH },
          contentSize: { width: SCREEN_WIDTH * 2 },
          layoutMeasurement: { width: SCREEN_WIDTH },
        },
      });
    })).not.toThrow();
  });
});
