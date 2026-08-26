/**
 * Tests for the onboarding gate in App.tsx (#714, parte de #676).
 *
 * Gate de onboarding (App.tsx:200-204) lê `@iostoandroid/onboarding_done`.
 * Sem `.catch`, se `getItem` rejeitar `showOnboarding` fica `null` para sempre
 * e `AppContent` devolve `null` em App.tsx:296 — ecrã em branco permanente que
 * bloqueia o launcher E a App Library.
 *
 * Red step (before fix): getItem a rejeitar → showOnboarding fica null →
 *   TAB_NAVIGATOR_MOUNTED nunca aparece (o teste "reject" falha).
 * Green step (after fix): .catch(() => setShowOnboarding(false)) → launcher
 *   monta mesmo com erro de leitura.
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react-native';

// ── AsyncStorage: getItem controlável por teste ──
// Prefixo `mock` (case-insensitive) permitido dentro de jest.mock factory.
const mockGetItem = jest.fn();
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: (...args: unknown[]) => mockGetItem(...args),
    setItem: jest.fn(() => Promise.resolve()),
    removeItem: jest.fn(() => Promise.resolve()),
  },
}));

// Fontes carregam logo (gate em App.tsx:295). Sem isto, App devolve null no
// gate de fontes e o teste não exercita o gate de onboarding.
jest.mock('expo-font', () => ({
  useFonts: () => [true, null],
}));

// expo-notifications: o OnboardingScreen importa-o no topo; sem mock dá
// "Cannot find native module 'ExpoNotificationChannelManager'".
jest.mock('expo-notifications', () => ({
  __esModule: true,
  getNotificationChannelsAsync: jest.fn(() => Promise.resolve([])),
  setNotificationChannelAsync: jest.fn(() => Promise.resolve()),
  scheduleNotificationAsync: jest.fn(() => Promise.resolve('id')),
  cancelScheduledNotificationAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: { children: React.ReactNode }) => children as React.ReactElement,
}));

// Re-mock do módulo nativo — mock COMPLETO porque a AppsStore (montada por
// AppContent) chama getInstalledApps / getIconCacheSizeBytes / etc.
jest.mock('../../modules/launcher-module/src', () => ({
  __esModule: true,
  addNotificationListener: jest.fn(() => jest.fn()),
  addCallStateListener: jest.fn(() => jest.fn()),
  onBridgeError: jest.fn(() => jest.fn()),
  default: {
    getInstalledApps: jest.fn(() => Promise.resolve([])),
    launchApp: jest.fn(() => Promise.resolve(true)),
    getAppIcon: jest.fn(() => Promise.resolve('')),
    isDefaultLauncher: jest.fn(() => Promise.resolve(false)),
    getProcessStartAgeMs: jest.fn(() => Promise.resolve(-1)),
    openLauncherSettings: jest.fn(() => Promise.resolve(true)),
    getWifiInfo: jest.fn(() => Promise.resolve({ enabled: true, ssid: 'TestWiFi', rssi: -50, ip: '192.168.1.100' })),
    setWifiEnabled: jest.fn(() => Promise.resolve(true)),
    getWifiNetworks: jest.fn(() => Promise.resolve([])),
    getBluetoothInfo: jest.fn(() => Promise.resolve({ enabled: false, name: '', address: '', pairedDevices: [] })),
    setBluetoothEnabled: jest.fn(() => Promise.resolve(true)),
    getStorageInfo: jest.fn(() => Promise.resolve({ totalGB: '128.0', usedGB: '64.0', freeGB: '64.0', usedPercentage: 50 })),
    getRecentMessages: jest.fn(() => Promise.resolve([])),
    getVolume: jest.fn(() => Promise.resolve(0.5)),
    setVolume: jest.fn(() => Promise.resolve(true)),
    openSystemSettings: jest.fn(() => Promise.resolve(true)),
    getNetworkInfo: jest.fn(() => Promise.resolve({ isConnected: true, isWifi: true, isCellular: false, isVpn: false })),
    setFlashlight: jest.fn(() => Promise.resolve(true)),
    isFlashlightOn: jest.fn(() => Promise.resolve(false)),
    getCallLog: jest.fn(() => Promise.resolve([])),
    makeCall: jest.fn(() => Promise.resolve(true)),
    getNotifications: jest.fn(() => Promise.resolve([])),
    clearNotification: jest.fn(() => Promise.resolve(true)),
    clearAllNotifications: jest.fn(() => Promise.resolve(true)),
    isNotificationAccessGranted: jest.fn(() => Promise.resolve(false)),
    openNotificationAccessSettings: jest.fn(() => Promise.resolve(true)),
    sendSms: jest.fn(() => Promise.resolve(true)),
    requestAllPermissions: jest.fn(() => Promise.resolve(true)),
    checkPermissions: jest.fn(() => Promise.resolve({})),
    getCalendarEvents: jest.fn(() => Promise.resolve([])),
    getNowPlaying: jest.fn(() => Promise.resolve({ title: '', artist: '', album: '', isPlaying: false, packageName: '' })),
    uninstallApp: jest.fn(() => Promise.resolve(true)),
    getIconCacheSizeBytes: jest.fn(() => Promise.resolve(0)),
  },
}));

// TabNavigator stub — marcador para saber que o conteúdo principal montou.
jest.mock('../navigation/TabNavigator', () => ({
  TabNavigator: () => {
    const R = jest.requireActual<typeof import('react')>('react');
    const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
    return R.createElement(Text, null, 'TAB_NAVIGATOR_MOUNTED');
  },
}));

// LockScreen auto-desbloqueia para o conteúdo (TabNavigator) ser alcançável.
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

// @expo/vector-icons (Ionicons) usado pelo OnboardingScreen — sob o wrapper do
// App (GestureHandlerRootView etc.) o Icon nativo rebenta e desmonta a árvore.
// Stub simples para podermos exercitar o path do OnboardingScreen via App.
jest.mock('@expo/vector-icons', () => ({
  Ionicons: ({ name, ...props }: { name: string;[k: string]: unknown }) => {
    const R = jest.requireActual<typeof import('react')>('react');
    const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
    return R.createElement(Text, props, String(name));
  },
}));

// SettingsProvider / ThemeProvider têm gateFirstRender=default(true): retornam
// null até lerem o AsyncStorage, e ao resolverem desmontam/remontam a árvore —
// o que faz o OnboardingScreen (montado quando showOnboarding=true) rebentar
// com "node on an unmounted component". Desligamos o gate (igual ao test-utils)
// para podermos exercitar o path do OnboardingScreen via App.
jest.mock('../store/SettingsStore', () => {
  const R = jest.requireActual<typeof import('react')>('react');
  const Actual = jest.requireActual<typeof import('../store/SettingsStore')>('../store/SettingsStore');
  return {
    ...Actual,
    SettingsProvider: (props: { children: React.ReactNode }) =>
      R.createElement(Actual.SettingsProvider, { ...props, gateFirstRender: false }),
  };
});
jest.mock('../theme/ThemeContext', () => {
  const R = jest.requireActual<typeof import('react')>('react');
  const Actual = jest.requireActual<typeof import('../theme/ThemeContext')>('../theme/ThemeContext');
  return {
    ...Actual,
    ThemeProvider: (props: { children: React.ReactNode }) =>
      R.createElement(Actual.ThemeProvider, { ...props, gateFirstRender: false }),
  };
});

// ── Import App after all jest.mock calls ──
import App from '../../App';

describe('App — onboarding gate (#714)', () => {
  beforeEach(() => {
    mockGetItem.mockReset();
    // Default: qualquer chave (SettingsStore, loadAlarms, etc.) resolve null;
    // só a chave de onboarding é controlada por cada teste abaixo.
    // Sem isto, o mock retornaria `undefined` e loadAlarms/.filter rebentaria.
    mockGetItem.mockImplementation((key: string) =>
      key === '@iostoandroid/onboarding_done'
        ? Promise.resolve('true')
        : Promise.resolve(null),
    );
  });

  it('monta o launcher (não ecrã em branco) quando getItem rejeita', async () => {
    mockGetItem.mockImplementation((key: string) =>
      key === '@iostoandroid/onboarding_done'
        ? Promise.reject(new Error('AsyncStorage corrompido'))
        : Promise.resolve(null),
    );
    render(<App />);

    await waitFor(() => screen.getByText('TAB_NAVIGATOR_MOUNTED'), { timeout: 4000 });
  });

  it('mostra o OnboardingScreen (first-run) quando getItem resolve null', async () => {
    mockGetItem.mockImplementation((key: string) =>
      key === '@iostoandroid/onboarding_done'
        ? Promise.resolve(null)
        : Promise.resolve(null),
    );
    render(<App />);

    await waitFor(() => screen.getByText(/Welcome to/i), { timeout: 4000 });
  });

  it('monta o launcher quando getItem resolve "true" (returning user)', async () => {
    mockGetItem.mockImplementation((key: string) =>
      key === '@iostoandroid/onboarding_done'
        ? Promise.resolve('true')
        : Promise.resolve(null),
    );
    render(<App />);

    await waitFor(() => screen.getByText('TAB_NAVIGATOR_MOUNTED'), { timeout: 4000 });
  });

  it('fronteira: valor não-"true" (ex.: "false") mostra o OnboardingScreen', async () => {
    mockGetItem.mockImplementation((key: string) =>
      key === '@iostoandroid/onboarding_done'
        ? Promise.resolve('false')
        : Promise.resolve(null),
    );
    render(<App />);

    await waitFor(() => screen.getByText(/Welcome to/i), { timeout: 4000 });
  });
});
