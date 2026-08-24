/**
 * Integração: o <HealthProvider> tem de estar montado na árvore REAL do
 * App.tsx, não apenas em `src/test-utils.tsx` (#271).
 *
 * Os testes de ecrã passam por `AllProviders` (test-utils), por isso um
 * provider em falta em App.tsx é invisível para eles: em produção o
 * `useHealth()` do HealthScreen lança "useHealth must be used within
 * HealthProvider" e o ErrorBoundary engole a árvore inteira.
 *
 * Este teste renderiza o App real e coloca uma sonda no lugar do TabNavigator
 * que consome `useHealth()` — se o provider não estiver na árvore do App, a
 * sonda lança e o ErrorBoundary mostra "Recovering..." em vez do texto dela.
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react-native';
import { Pedometer } from 'expo-sensors';
import { useHealth } from '../store/HealthStore';

// Prefixo `mock` — única forma de referenciar algo de fora dentro da factory.
const mockUseHealth = useHealth;

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

// Sonda no lugar do TabNavigator: consome o contexto Health tal como o
// HealthScreen faria depois de navegar para `Health`.
jest.mock('../navigation/TabNavigator', () => ({
  TabNavigator: () => {
    const R = jest.requireActual<typeof import('react')>('react');
    const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
    const health = mockUseHealth();
    return R.createElement(
      Text,
      null,
      `HEALTH_CTX steps=${health.todaySteps} ready=${health.isReady} available=${health.isPedometerAvailable} granted=${String(health.permissionGranted)}`,
    );
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

jest.mock('@expo/vector-icons', () => ({
  Ionicons: ({ name, ...props }: { name: string;[k: string]: unknown }) => {
    const R = jest.requireActual<typeof import('react')>('react');
    const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
    return R.createElement(Text, props, String(name));
  },
}));

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

// ── Import App depois de todos os jest.mock ──
import App from '../../App';

describe('App — HealthProvider montado na árvore real (#271)', () => {
  beforeEach(() => {
    mockGetItem.mockReset();
    mockGetItem.mockImplementation((key: string) =>
      key === '@iostoandroid/onboarding_done'
        ? Promise.resolve('true')
        : Promise.resolve(null),
    );
  });

  it('fornece o contexto Health a um consumidor dentro do App (não lança)', async () => {
    render(<App />);

    await waitFor(() => screen.getByText(/HEALTH_CTX/), { timeout: 4000 });
    expect(screen.queryByText('Recovering...')).toBeNull();
  });

  it('é o HealthProvider real: sonda o sensor e fica isReady com todaySteps=0 sem permissão', async () => {
    render(<App />);

    // available=true só pode vir de Pedometer.isAvailableAsync() ter sido
    // chamado pelo provider real — um contexto vazio ou um stub não o faria.
    await waitFor(
      () => screen.getByText('HEALTH_CTX steps=0 ready=true available=true granted=null'),
      { timeout: 4000 },
    );
  });

  it('inverso: sensor indisponível continua a dar contexto (available=false, sem crash)', async () => {
    (Pedometer.isAvailableAsync as jest.Mock).mockResolvedValueOnce(false);

    render(<App />);

    await waitFor(
      () => screen.getByText('HEALTH_CTX steps=0 ready=true available=false granted=null'),
      { timeout: 4000 },
    );
    expect(screen.queryByText('Recovering...')).toBeNull();
  });

  it('restaura o total de hoje persistido através do provider do App', async () => {
    const today = new Date(Date.now());
    const key = `${today.getFullYear()}-${`${today.getMonth() + 1}`.padStart(2, '0')}-${`${today.getDate()}`.padStart(2, '0')}`;
    mockGetItem.mockImplementation((k: string) => {
      if (k === '@iostoandroid/onboarding_done') return Promise.resolve('true');
      if (k === '@iostoandroid/health_daily_steps') {
        return Promise.resolve(JSON.stringify([{ date: key, steps: 1234 }]));
      }
      return Promise.resolve(null);
    });

    render(<App />);

    await waitFor(() => screen.getByText(/HEALTH_CTX steps=1234 /), { timeout: 4000 });
  });
});
