/**
 * Tests for the bridge error → notification banner gate in App.tsx.
 *
 * Red step (before fix):
 *   - onBridgeError('getWifiInfo', ...) does nothing — allow-list only covers 3 methods
 * Green step (after fix):
 *   - deny-list: all methods show a banner except BANNER_SUPPRESSED_METHODS
 *   - anti-spam: same method fired twice within 30s → only 1 banner
 *   - makeCall / sendSms / requestAllPermissions still show banners (no regression)
 */
import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react-native';

// ── Module-level var (NOT let/const) so the factory closure can write to it ──
// jest.mock factories are hoisted by babel-jest above imports; `var` is
// hoisted+initialized (undefined) before any code, so the assignment inside the
// factory works even before the variable's source-position is reached.
// eslint-disable-next-line no-var
var capturedBridgeErrorCb: ((method: string, error: unknown) => void) | null = null;

// Re-mock the launcher module so named exports (onBridgeError, addNotificationListener)
// are present. jest.setup.js's factory only exposes `default`, overriding it here for
// this file (test-file jest.mock > setupFiles).
jest.mock('../../modules/launcher-module/src', () => ({
  __esModule: true,
  addNotificationListener: jest.fn(() => jest.fn()),
  addCallStateListener: jest.fn(() => jest.fn()),
  onBridgeError: jest.fn((cb: (method: string, error: unknown) => void) => {
    capturedBridgeErrorCb = cb; // captured into module-level var
    return jest.fn(); // unsubscribe
  }),
  default: {
    getInstalledApps: jest.fn(() => Promise.resolve([])),
    launchApp: jest.fn(() => Promise.resolve(true)),
    getAppIcon: jest.fn(() => Promise.resolve('')),
    isDefaultLauncher: jest.fn(() => Promise.resolve(false)),
    // #517: a instrumentação de cold start chama isto no arranque de App.tsx.
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
  },
}));

// AsyncStorage: onboarding already done → skip OnboardingScreen
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

// Auto-unlock LockScreen so NotificationBanner is in the rendered tree
jest.mock('../screens/LockScreen', () => {
  const R = jest.requireActual<typeof import('react')>('react');
  return {
    LockScreen: ({ onUnlock }: { onUnlock: () => void }) => {
      R.useEffect(() => { onUnlock(); }, [onUnlock]);
      return null;
    },
  };
});

// @react-navigation/native: add useNavigationContainerRef (missing from jest.setup.js)
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn(), canGoBack: jest.fn(() => false), getParent: () => ({ navigate: jest.fn() }) }),
  useRoute: () => ({ params: {} }),
  NavigationContainer: ({ children }: { children: React.ReactNode }) => children as React.ReactElement,
  useNavigationContainerRef: () => ({ current: null, navigate: jest.fn(), isReady: () => true }),
}));

// TabNavigator: stub to avoid the full navigation stack in these tests
jest.mock('../navigation/TabNavigator', () => ({
  TabNavigator: () => null,
}));

// Complex layout components — stub so they don't pull in gesture/animation deps
jest.mock('../components/GestureHost', () => ({
  GestureHost: ({ children }: { children: React.ReactNode }) => children as React.ReactElement,
}));
jest.mock('../components/HomeIndicator', () => ({
  HomeIndicator: () => null,
}));
jest.mock('../components/QuickSwitchHomeBar', () => ({
  QuickSwitchHomeBar: () => null,
}));
jest.mock('../store/AssistiveTouchStore', () => ({
  AssistiveTouchProvider: ({ children }: { children: React.ReactNode }) => children as React.ReactElement,
  useAssistiveTouch: () => ({ reachabilityActive: false, setReachabilityActive: jest.fn() }),
}));
jest.mock('../components/AssistiveTouch', () => ({
  AssistiveTouch: () => null,
}));

// ── Import App after all jest.mock calls ──
import App from '../../App';

// ──────────────────────────────────────────────────────────────────────────────

describe('App — bridge error banner gate', () => {
  beforeEach(() => {
    capturedBridgeErrorCb = null;
    jest.clearAllMocks();
  });

  /** Render App and wait until AppContent's onBridgeError useEffect has run. */
  async function mountApp() {
    render(<App />);
    await waitFor(() => expect(capturedBridgeErrorCb).not.toBeNull(), { timeout: 4000 });
  }

  // ── RED STEP ──────────────────────────────────────────────────────────────
  // Before fix: getWifiInfo is not in the 3-method allow-list → no banner.
  // After fix:  deny-list → banner IS shown.
  it('shows a banner for a non-suppressed method (getWifiInfo)', async () => {
    await mountApp();

    act(() => { capturedBridgeErrorCb!('getWifiInfo', new Error('timeout')); });

    // After fix, title contains "Wi-Fi" (human-readable label)
    await screen.findByText(/Wi-Fi/i);
  });

  // HIGH-FREQUENCY deny-list: getRecentMessages is polled every 30 s → no banner
  it('suppresses banner for high-frequency method (getRecentMessages)', async () => {
    await mountApp();

    act(() => { capturedBridgeErrorCb!('getRecentMessages', new Error('timeout')); });

    // Give one render cycle for any banner to appear
    await act(async () => {});
    expect(screen.queryByText('System')).toBeNull();
  });

  // Anti-spam: same method twice inside the 30 s silence window → only 1 banner
  it('deduplicates same method errors within the 30 s silence window', async () => {
    let fakeNow = 1_000_000;
    jest.spyOn(Date, 'now').mockImplementation(() => fakeNow);

    try {
      await mountApp();

      act(() => { capturedBridgeErrorCb!('getWifiInfo', new Error('first')); });
      await screen.findByText('first');

      // 10 s later — still within the 30 s window
      fakeNow += 10_000;
      act(() => { capturedBridgeErrorCb!('getWifiInfo', new Error('second')); });

      // Body of the second error must NOT appear
      expect(screen.queryByText('second')).toBeNull();
    } finally {
      jest.spyOn(Date, 'now').mockRestore();
    }
  });

  // Anti-spam: same method after silence window → new banner IS shown
  it('shows a new banner after the silence window expires', async () => {
    let fakeNow = 1_000_000;
    jest.spyOn(Date, 'now').mockImplementation(() => fakeNow);

    try {
      await mountApp();

      act(() => { capturedBridgeErrorCb!('getWifiInfo', new Error('first')); });
      await screen.findByText('first');

      // Advance past the 30 s window
      fakeNow += 31_000;
      act(() => { capturedBridgeErrorCb!('getWifiInfo', new Error('after-window')); });
      await screen.findByText('after-window');
    } finally {
      jest.spyOn(Date, 'now').mockRestore();
    }
  });

  // Regression: makeCall must still show banner
  it('still shows banner for makeCall (no regression)', async () => {
    await mountApp();

    act(() => { capturedBridgeErrorCb!('makeCall', new Error('call blocked')); });

    await screen.findByText(/chamada/i);
  });

  // Regression: sendSms must still show banner
  it('still shows banner for sendSms (no regression)', async () => {
    await mountApp();

    act(() => { capturedBridgeErrorCb!('sendSms', new Error('sms failed')); });

    await screen.findByText(/mensagem/i);
  });

  // Regression: requestAllPermissions must still show banner
  it('still shows banner for requestAllPermissions (no regression)', async () => {
    await mountApp();

    act(() => { capturedBridgeErrorCb!('requestAllPermissions', new Error('perm denied')); });

    await screen.findByText(/permiss/i);
  });
});
