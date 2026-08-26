/**
 * Tests for the incoming-call → CallScreen routing wired in App.tsx (#921,
 * passo 6 de #378). LauncherInCallService (#919) emits onCallStateChanged
 * whenever Telecom hands this app's InCallService a call; App.tsx listens
 * for a 'ringing' state and navigates to CallScreen with direction:'incoming'.
 *
 * Red step (before the App.tsx effect existed):
 *   - dispatching a 'ringing' event did nothing — no addCallStateListener
 *     subscription existed, so navigate was never called.
 * Green step (after):
 *   - a 'ringing' event navigates to CallScreen with the number/name/direction.
 *   - any other state (dialing/active/disconnected) does NOT navigate.
 *   - the contact name is resolved from device.contacts when it matches.
 */
import React from 'react';
import { act, render, waitFor } from '@testing-library/react-native';

// eslint-disable-next-line no-var
var capturedCallStateCb: ((event: { state: string; number: string }) => void) | null = null;

jest.mock('../../modules/launcher-module/src', () => ({
  __esModule: true,
  addNotificationListener: jest.fn(() => jest.fn()),
  addCallStateListener: jest.fn((cb: (event: { state: string; number: string }) => void) => {
    capturedCallStateCb = cb;
    return jest.fn();
  }),
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
  },
}));

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

// Auto-unlock LockScreen so NavigationContainer (and this effect) mounts
jest.mock('../screens/LockScreen', () => {
  const R = jest.requireActual<typeof import('react')>('react');
  return {
    LockScreen: ({ onUnlock }: { onUnlock: () => void }) => {
      R.useEffect(() => { onUnlock(); }, [onUnlock]);
      return null;
    },
  };
});

let mockNavigate: jest.Mock;

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn(), canGoBack: jest.fn(() => false), getParent: () => ({ navigate: jest.fn() }) }),
  useRoute: () => ({ params: {} }),
  NavigationContainer: ({ children }: { children: React.ReactNode }) => children as React.ReactElement,
  useNavigationContainerRef: () => ({ current: null, navigate: mockNavigate, isReady: () => true }),
}));

jest.mock('../navigation/TabNavigator', () => ({
  TabNavigator: () => null,
}));

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

async function mountApp() {
  render(<App />);
  await waitFor(() => expect(capturedCallStateCb).not.toBeNull(), { timeout: 4000 });
}

describe('App — incoming call routing (#921)', () => {
  beforeEach(() => {
    capturedCallStateCb = null;
    mockNavigate = jest.fn();
    jest.clearAllMocks();
  });

  it("navigates to CallScreen with direction:'incoming' on a ringing event", async () => {
    await mountApp();

    act(() => { capturedCallStateCb!({ state: 'ringing', number: '+15551234567' }); });

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('CallScreen', {
      number: '+15551234567',
      name: '',
      direction: 'incoming',
    }));
  });

  it.each(['dialing', 'active', 'disconnected', 'holding'])(
    'does not navigate for a non-ringing state (%s)',
    async (state) => {
      await mountApp();

      act(() => { capturedCallStateCb!({ state, number: '+15551234567' }); });
      await act(async () => {});

      expect(mockNavigate).not.toHaveBeenCalled();
    },
  );
});
