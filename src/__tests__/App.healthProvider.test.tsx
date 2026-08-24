/**
 * Guarda de montagem do HealthProvider na raiz (#276).
 *
 * O HealthScreen chama `useHealth()`, que lança
 * "useHealth must be used within HealthProvider" quando não há provider acima.
 * O provider estava montado apenas no `src/test-utils.tsx` (árvore de testes),
 * pelo que na app real abrir o ícone Health rebentava — e nenhum teste
 * apanhava isso, porque todos os testes de ecrã usam o wrapper de test-utils.
 *
 * Este teste monta o `App` verdadeiro e coloca, no lugar do TabNavigator, um
 * consumidor do hook REAL. Se `<HealthProvider>` sair de App.tsx, `useHealth`
 * lança, o ErrorBoundary da app troca a árvore pelo fallback, e o marcador
 * nunca aparece.
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react-native';

const mockGetItem = jest.fn();
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: (...args: unknown[]) => mockGetItem(...args),
    setItem: jest.fn(() => Promise.resolve()),
    removeItem: jest.fn(() => Promise.resolve()),
  },
}));

jest.mock('expo-font', () => ({
  useFonts: () => [true, null],
}));

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

jest.mock('../../modules/launcher-module/src', () => ({
  __esModule: true,
  addNotificationListener: jest.fn(() => jest.fn()),
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

// TabNavigator substituído por um consumidor do hook REAL — é a sonda que
// prova que existe um HealthProvider acima na árvore da app.
jest.mock('../navigation/TabNavigator', () => ({
  TabNavigator: () => {
    const R = jest.requireActual<typeof import('react')>('react');
    const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
    const { useHealth } = jest.requireActual<typeof import('../store/HealthStore')>('../store/HealthStore');
    const ctx = useHealth();
    return R.createElement(Text, null, `HEALTH_CONTEXT_OK steps=${ctx.todaySteps}`);
  },
}));

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

import App from '../../App';

describe('App — HealthProvider montado na raiz (#276)', () => {
  beforeEach(() => {
    mockGetItem.mockReset();
    mockGetItem.mockImplementation((key: string) =>
      key === '@iostoandroid/onboarding_done'
        ? Promise.resolve('true')
        : Promise.resolve(null),
    );
  });

  it('um consumidor de useHealth dentro da app monta sem lançar', async () => {
    render(<App />);
    await waitFor(() => screen.getByText(/HEALTH_CONTEXT_OK/), { timeout: 4000 });
  });

  it('o contexto exposto na app arranca em 0 passos', async () => {
    render(<App />);
    await waitFor(() => screen.getByText('HEALTH_CONTEXT_OK steps=0'), { timeout: 4000 });
  });
});
