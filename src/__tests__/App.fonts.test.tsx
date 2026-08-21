/**
 * Tests for the expo-font load gate in App.tsx (#474).
 *
 * Red step (before fix): App.tsx never calls useFonts, so the main content
 * renders regardless of the mocked font-loading state — the "não renderiza
 * enquanto carrega" assertion fails because there is nothing gating it.
 */
import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react-native';

const mockUseFonts = jest.fn();
jest.mock('expo-font', () => ({
  useFonts: (...args: unknown[]) => mockUseFonts(...args),
}));

// Re-mock the launcher module so App.tsx's dynamic import resolves cleanly.
jest.mock('../../modules/launcher-module/src', () => ({
  __esModule: true,
  addNotificationListener: jest.fn(() => jest.fn()),
  onBridgeError: jest.fn(() => jest.fn()),
  default: {
    isDefaultLauncher: jest.fn(() => Promise.resolve(false)),
    isNotificationAccessGranted: jest.fn(() => Promise.resolve(false)),
    // #517: a instrumentação de cold start chama isto no arranque de App.tsx.
    getProcessStartAgeMs: jest.fn(() => Promise.resolve(-1)),
    getNotifications: jest.fn(() => Promise.resolve([])),
  },
}));

// Onboarding already done → skip OnboardingScreen and land past the first gate.
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn((key: string) =>
      key === '@iostoandroid/onboarding_done'
        ? Promise.resolve('true')
        : Promise.resolve(null),
    ),
    setItem: jest.fn(() => Promise.resolve()),
    removeItem: jest.fn(() => Promise.resolve()),
  },
}));

// Auto-unlock LockScreen so the gated content (TabNavigator stub) is reachable.
jest.mock('../screens/LockScreen', () => {
  const R = jest.requireActual<typeof import('react')>('react');
  return {
    LockScreen: ({ onUnlock }: { onUnlock: () => void }) => {
      R.useEffect(() => { onUnlock(); }, [onUnlock]);
      return null;
    },
  };
});

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn(), canGoBack: jest.fn(() => false), getParent: () => ({ navigate: jest.fn() }) }),
  useRoute: () => ({ params: {} }),
  NavigationContainer: ({ children }: { children: React.ReactNode }) => children as React.ReactElement,
  useNavigationContainerRef: () => ({ current: null, navigate: jest.fn(), isReady: () => true }),
}));

// TabNavigator stub — the marker we check for to know the main content mounted.
jest.mock('../navigation/TabNavigator', () => ({
  TabNavigator: () => {
    const R = jest.requireActual<typeof import('react')>('react');
    const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
    return R.createElement(Text, null, 'TAB_NAVIGATOR_MOUNTED');
  },
}));

jest.mock('../components/GestureHost', () => ({
  GestureHost: ({ children }: { children: React.ReactNode }) => children as React.ReactElement,
}));
jest.mock('../components/HomeIndicator', () => ({ HomeIndicator: () => null }));
jest.mock('../components/QuickSwitchHomeBar', () => ({ QuickSwitchHomeBar: () => null }));
jest.mock('../store/AssistiveTouchStore', () => ({
  AssistiveTouchProvider: ({ children }: { children: React.ReactNode }) => children as React.ReactElement,
  useAssistiveTouch: () => ({ reachabilityActive: false, setReachabilityActive: jest.fn() }),
}));
jest.mock('../components/AssistiveTouch', () => ({ AssistiveTouch: () => null }));

// ── Import App after all jest.mock calls ──
import App from '../../App';

/** Deixa as promises de onboarding/AsyncStorage e os efeitos de unlock resolverem. */
async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 50));
  });
}

describe('App — font-load gate (#474)', () => {
  beforeEach(() => {
    mockUseFonts.mockReset();
  });

  it('não renderiza o conteúdo principal enquanto os tipos de letra ainda estão a carregar', async () => {
    mockUseFonts.mockReturnValue([false, null]);
    render(<App />);

    // Dá tempo de sobra (2×) ao gate de onboarding/lock para resolver — se o
    // conteúdo continuar ausente depois disto, é porque algo o está mesmo a
    // reter, não porque a promise de onboarding ainda não correu.
    await settle();
    await settle();

    expect(screen.queryByText('TAB_NAVIGATOR_MOUNTED')).toBeNull();
  });

  it('renderiza o conteúdo principal quando os tipos de letra carregam com sucesso', async () => {
    mockUseFonts.mockReturnValue([true, null]);
    render(<App />);

    await waitFor(() => screen.getByText('TAB_NAVIGATOR_MOUNTED'), { timeout: 4000 });
  });

  it('segue com a fonte de sistema (não fica preso no splash) quando useFonts devolve [false, Error]', async () => {
    mockUseFonts.mockReturnValue([false, new Error('falha a carregar Inter')]);
    render(<App />);

    await waitFor(() => screen.getByText('TAB_NAVIGATOR_MOUNTED'), { timeout: 4000 });
  });
});
